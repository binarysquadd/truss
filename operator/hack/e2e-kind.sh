#!/usr/bin/env bash
# Clean-room end-to-end test for the TrussInstance operator on a fresh kind cluster.
# Validates: CRD install, live CEL rejection, reconcile (owned objects created),
# owner-reference garbage collection on delete, and clean uninstall.
#
# Runs identically locally and in CI (a fresh ephemeral runner is the clean room).
set -euo pipefail

CLUSTER="${CLUSTER:-truss-e2e}"
NS=default
here="$(cd "$(dirname "$0")/.." && pwd)"
cd "$here"

KUBECONFIG_FILE="$(mktemp)"
export KUBECONFIG="$KUBECONFIG_FILE"
MGR_PID=""

cleanup() {
  [[ -n "$MGR_PID" ]] && kill "$MGR_PID" 2>/dev/null || true
  kind delete cluster --name "$CLUSTER" >/dev/null 2>&1 || true
  rm -f "$KUBECONFIG_FILE"
}
trap cleanup EXIT

say() { printf '\n== %s ==\n' "$1"; }

say "create fresh kind cluster ($CLUSTER)"
kind create cluster --name "$CLUSTER" --wait 120s

say "build manager + install CRD"
make build >/dev/null
make install

say "CEL live: an invalid TrussInstance must be REJECTED by the apiserver"
if kubectl apply -f - >/dev/null 2>/tmp/truss-cel.err <<'EOF'
apiVersion: apps.truss.binarysquad.org/v1alpha1
kind: TrussInstance
metadata: { name: bad, namespace: default }
spec:
  ingress: { enabled: true }
EOF
then
  echo "FAIL: invalid TrussInstance (ingress enabled, no publicURL) was accepted"; exit 1
fi
echo "OK rejected: $(tail -1 /tmp/truss-cel.err)"

say "apply postgres secret + a valid TrussInstance"
kubectl create secret generic truss-db -n "$NS" --from-literal=database-url='postgres://user:pass@host:5432/truss'
kubectl apply -f - <<'EOF'
apiVersion: apps.truss.binarysquad.org/v1alpha1
kind: TrussInstance
metadata: { name: e2e, namespace: default }
spec:
  version: "0.2.0"
  publicURL: https://e2e.truss.binarysquad.org
  scaling: { profile: small }
  dependencies:
    postgres: { mode: byo, existingSecret: truss-db }
EOF

say "run the manager against the cluster"
./bin/manager --metrics-bind-address=0 --health-probe-bind-address=0 --leader-elect=false >/tmp/truss-mgr.log 2>&1 &
MGR_PID=$!

say "wait for the operator to create the api + dashboard Deployments"
ok=""
for _ in $(seq 1 30); do
  if kubectl get deploy e2e-api e2e-dashboard -n "$NS" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
[[ -n "$ok" ]] || { echo "FAIL: Deployments not created"; tail -20 /tmp/truss-mgr.log; exit 1; }
kubectl get deploy,svc -n "$NS" -l app.kubernetes.io/instance=e2e
echo "phase: $(kubectl get trussinstance e2e -n "$NS" -o jsonpath='{.status.phase}')"

say "delete the TrussInstance -> owner-reference GC removes owned objects"
kubectl delete trussinstance e2e -n "$NS" --wait=true --timeout=60s
gone=""
for _ in $(seq 1 30); do
  if ! kubectl get deploy e2e-api -n "$NS" >/dev/null 2>&1; then gone=1; break; fi
  sleep 2
done
[[ -n "$gone" ]] || { echo "FAIL: owned Deployment not garbage-collected"; exit 1; }
echo "OK: owned objects garbage-collected"

say "uninstall CRD"
make uninstall

printf '\n\xE2\x9C\x94 E2E PASSED\n'
