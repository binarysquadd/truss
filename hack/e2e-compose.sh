#!/usr/bin/env bash
# Live end-to-end test of the self-hosted compose stack + the bundled observability stack.
# Builds the truss-api image from source (the published :latest lacks the --import + OTEL work),
# brings up the full stack, drives traffic, and asserts all three signals actually reach the
# pipeline by querying the collector's own telemetry + the app metric in Prometheus.
#
# Runs locally and in CI (a fresh runner is the clean room).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"; cd "$here"

FILES=(-f docker-compose.selfhosted.yml -f docker-compose.observability.yml --env-file .env.selfhosted)

cleanup() { docker compose "${FILES[@]}" down -v --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT
say() { printf '\n== %s ==\n' "$1"; }

say "build the truss images from source (into the tags compose references)"
# Build all three locally: the published :latest images are amd64-only, and truss-api
# additionally needs the local source (the --import + new OTEL deps aren't in :latest yet).
docker build -t ghcr.io/binarysquadd/truss-api:latest -f apps/api/Dockerfile apps/api
docker build -t ghcr.io/binarysquadd/truss-dashboard:latest -f selfhosted/Dockerfile.dashboard .
docker build -t ghcr.io/binarysquadd/truss-mcp:latest -f apps/mcp/Dockerfile apps/mcp

say "bring up the self-hosted + observability stacks"
docker compose "${FILES[@]}" up -d

# The API port (8787) is exposed but NOT published to the host in the self-hosted compose —
# it is reached in-network via the dashboard/oathkeeper proxy. So we probe + drive traffic
# from INSIDE the network with `exec` (node 22 has a global fetch), and assert the signals
# landed by querying Prometheus, whose port IS published.
apinode() { docker compose "${FILES[@]}" exec -T truss-api node -e "$1"; }

say "wait for the API /metrics to answer (in-network)"
ok=""
for _ in $(seq 1 60); do
  if apinode "fetch('http://localhost:8787/metrics').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then ok=1; break; fi
  sleep 3
done
[[ -n "$ok" ]] || { echo "FAIL: API /metrics never came up"; docker compose "${FILES[@]}" ps; docker compose "${FILES[@]}" logs --tail=40 truss-api; exit 1; }
echo "OK: /metrics is answering"

say "drive some traffic to produce metrics + traces + logs (in-network)"
apinode "(async()=>{for(let i=0;i<60;i++){for(const p of ['/metrics','/health','/v1/','/api/v1/does-not-exist']){try{await fetch('http://localhost:8787'+p)}catch{}}}console.log('drove traffic')})()"

say "assert all three signals landed in their backends (ground truth, not intermediate telemetry)"
pass=1

# METRICS → Prometheus (published on :9090). The app RED metric arrives via the OTLP →
# collector → remote-write path (no direct scrape), so its presence proves that whole chain.
q() { curl -sf "http://localhost:9090/api/v1/query?query=$1" 2>/dev/null; }
metric_ok=""
# OTLP metrics push on a ~60s periodic reader, then collector batch + remote-write — allow slack.
for _ in $(seq 1 50); do
  if q 'truss_http_request_duration_seconds_count' | grep -q '"value"'; then metric_ok=1; break; fi
  sleep 3
done
[[ -n "$metric_ok" ]] && echo "OK: metrics → Prometheus (truss_http_request_duration_seconds_count present)" || { echo "FAIL: app metric not in Prometheus"; pass=0; }

# TRACES → Tempo (:3200, in-network). Tempo's search API returns recent traces; a non-empty
# result proves app → OTLP → collector → Tempo. Auto-instrumentation emits an HTTP server span
# per request we drove above.
trace_ok=""
for _ in $(seq 1 30); do
  if apinode "fetch('http://tempo:3200/api/search?limit=20').then(r=>r.json()).then(j=>process.exit((j.traces&&j.traces.length)?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then trace_ok=1; break; fi
  sleep 3
done
[[ -n "$trace_ok" ]] && echo "OK: traces → Tempo (search returns spans)" || { echo "FAIL: no traces in Tempo"; pass=0; }

# LOGS → Loki (:3100, in-network). Loki 3.x OTLP ingest maps resource service.name → the
# service_name index label; its presence proves app (pino → OTLP logs) → collector → Loki.
log_ok=""
for _ in $(seq 1 30); do
  if apinode "fetch('http://loki:3100/loki/api/v1/label/service_name/values').then(r=>r.json()).then(j=>process.exit((j.data&&j.data.includes('truss-api'))?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then log_ok=1; break; fi
  sleep 3
done
[[ -n "$log_ok" ]] && echo "OK: logs → Loki (service_name=truss-api present)" || { echo "FAIL: no truss-api logs in Loki"; pass=0; }

say "stack status"
docker compose "${FILES[@]}" ps --format 'table {{.Service}}\t{{.Status}}'
[[ "$pass" == 1 ]] || { echo "E2E FAILED"; exit 1; }
printf '\n\xE2\x9C\x94 COMPOSE E2E PASSED\n'
