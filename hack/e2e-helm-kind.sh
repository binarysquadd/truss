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

say "pre-load all non-truss images into the cluster (so kind never re-pulls — fast + no rate limits)"
# kind re-pulls in-cluster on every run, which is slow and hits Docker Hub anonymous rate limits.
# `kind load docker-image` fails on these public images because the host keeps them as multi-arch
# indexes (ctr import --all-platforms → "content digest not found"). `docker save --platform`
# (Docker 25+) exports a CONCRETE single-platform archive that `kind load image-archive` imports
# cleanly. Match the host arch so the pull/save is local-only.
case "$(uname -m)" in arm64|aarch64) PLATFORM=linux/arm64 ;; *) PLATFORM=linux/amd64 ;; esac
PRELOAD=(
  otel/opentelemetry-collector-contrib:0.117.0 prom/prometheus:v3.1.0
  grafana/loki:3.3.2 grafana/tempo:2.7.0 grafana/grafana:11.5.1
  postgres:16-alpine oryd/kratos:v1.2.0 oryd/keto:v0.12.0-alpha.0 oryd/hydra:v2.2.0
  oryd/oathkeeper:v0.40.7 minio/minio:RELEASE.2024-09-22T00-33-43Z
  ghcr.io/open-feature/flagd:v0.11.1 valkey/valkey:8-alpine
)
arch_tar="$(mktemp -d)/img.tar"
for img in "${PRELOAD[@]}"; do
  docker pull -q --platform "$PLATFORM" "$img" >/dev/null
  docker save --platform "$PLATFORM" "$img" -o "$arch_tar"
  kind load image-archive "$arch_tar" --name "$CLUSTER"
done
rm -f "$arch_tar"

say "helm install (backends ON, local image tags)"
kubectl create namespace "$NS" >/dev/null
helm install truss charts/truss -n "$NS" \
  --set images.api.tag=latest --set images.dashboard.tag=latest --set images.mcp.tag=latest \
  --set observability.backends.enabled=true \
  --set publicUrl=http://localhost \
  --set secrets.encryptionKey=e2e-encryption-key-0123456789-abcdefghij   # non-placeholder; the API refuses a "change-me" key in prod

say "wait for the observability backends to become Available (first run pulls ~5 images)"
# Signal assertions hit Prometheus/Tempo/Loki directly, so those + the collector must be ready;
# Grafana is convenience only, so its readiness is non-fatal.
for d in otel-collector prometheus loki tempo; do
  kubectl -n "$NS" rollout status deploy/"$d" --timeout=360s
done
kubectl -n "$NS" rollout status deploy/grafana --timeout=180s || echo "WARN: grafana not ready (non-fatal; not needed for signal assertions)"

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
