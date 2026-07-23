#!/usr/bin/env bash
# Live end-to-end test of the umbrella Helm chart on a fresh kind cluster, with the bundled
# observability backends turned ON. Proves the whole app stack installs and comes up, and that
# all three signals (metrics/traces/logs) flow through the in-cluster OTLP → LGTM pipeline —
# the Kubernetes counterpart of hack/e2e-compose.sh.
#
# Runs locally and in CI (a fresh runner is the clean room). Requires kind + helm + kubectl + docker.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"; cd "$here"

CLUSTER="${CLUSTER:-truss-helm-e2e}"
NS=truss
export KUBECONFIG="$(mktemp)"

cleanup() { kind delete cluster --name "$CLUSTER" >/dev/null 2>&1 || true; rm -f "$KUBECONFIG"; }
trap cleanup EXIT
say() { printf '\n== %s ==\n' "$1"; }
kexec() { kubectl -n "$NS" exec -i deploy/truss-api -- node -e "$1"; }

say "build the three truss images (cached; :latest is what we load into kind)"
docker build -q -t ghcr.io/binarysquadd/truss-api:latest -f apps/api/Dockerfile apps/api >/dev/null
docker build -q -t ghcr.io/binarysquadd/truss-dashboard:latest -f selfhosted/Dockerfile.dashboard . >/dev/null
docker build -q -t ghcr.io/binarysquadd/truss-mcp:latest -f apps/mcp/Dockerfile apps/mcp >/dev/null

say "create fresh kind cluster ($CLUSTER)"
kind create cluster --name "$CLUSTER" --wait 120s

say "load the local truss images into the cluster"
for img in truss-api truss-dashboard truss-mcp; do
  kind load docker-image "ghcr.io/binarysquadd/$img:latest" --name "$CLUSTER"
done

say "helm install (backends ON, local image tags)"
kubectl create namespace "$NS" >/dev/null
helm install truss charts/truss -n "$NS" \
  --set images.api.tag=latest --set images.dashboard.tag=latest --set images.mcp.tag=latest \
  --set observability.backends.enabled=true \
  --set publicUrl=http://localhost

say "wait for the observability backends to become Available"
for d in otel-collector prometheus loki tempo grafana; do
  kubectl -n "$NS" rollout status deploy/"$d" --timeout=180s
done

say "wait for the truss API to become Available (deps + migrations first)"
if ! kubectl -n "$NS" rollout status deploy/truss-api --timeout=420s; then
  echo "FAIL: truss-api did not become ready"; kubectl -n "$NS" get pods; kubectl -n "$NS" logs deploy/truss-api --tail=40 || true; exit 1
fi
kubectl -n "$NS" get pods --no-headers | awk '{print $1"\t"$3}'

say "drive traffic (in-cluster) to produce metrics + traces + logs"
kexec "(async()=>{for(let i=0;i<60;i++){for(const p of ['/metrics','/api/health','/v1/','/api/v1/nope']){try{await fetch('http://localhost:8787'+p)}catch{}}}console.log('drove traffic')})()"

say "assert all three signals landed in their in-cluster backends"
pass=1
# METRICS → Prometheus (app → OTLP → collector → remote-write). Allow the ~60s periodic push.
mok=""
for _ in $(seq 1 50); do
  if kexec "fetch('http://prometheus:9090/api/v1/query?query=truss_http_request_duration_seconds_count').then(r=>r.json()).then(j=>process.exit((j.data&&j.data.result&&j.data.result.length)?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then mok=1; break; fi
  sleep 3
done
[[ -n "$mok" ]] && echo "OK: metrics → Prometheus" || { echo "FAIL: app metric not in Prometheus"; pass=0; }
# TRACES → Tempo.
tok=""
for _ in $(seq 1 30); do
  if kexec "fetch('http://tempo:3200/api/search?limit=20').then(r=>r.json()).then(j=>process.exit((j.traces&&j.traces.length)?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then tok=1; break; fi
  sleep 3
done
[[ -n "$tok" ]] && echo "OK: traces → Tempo" || { echo "FAIL: no traces in Tempo"; pass=0; }
# LOGS → Loki.
lok=""
for _ in $(seq 1 30); do
  if kexec "fetch('http://loki:3100/loki/api/v1/label/service_name/values').then(r=>r.json()).then(j=>process.exit((j.data&&j.data.includes('truss-api'))?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then lok=1; break; fi
  sleep 3
done
[[ -n "$lok" ]] && echo "OK: logs → Loki" || { echo "FAIL: no truss-api logs in Loki"; pass=0; }

[[ "$pass" == 1 ]] || { echo "HELM E2E FAILED"; exit 1; }
printf '\n\xE2\x9C\x94 HELM E2E PASSED\n'
