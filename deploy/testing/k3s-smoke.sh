#!/usr/bin/env bash
# Creates and deletes an isolated K3d/K3s cluster; never modifies the user's kubeconfig/current context.
set -euo pipefail
cd "$(dirname "$0")/../.."
name="eob-verify-$(date +%s)"
work=$(mktemp -d)
cleanup() { k3d cluster delete "$name" >/dev/null 2>&1 || true; rm -rf "$work"; }
trap cleanup EXIT
k3d cluster create "$name" --image rancher/k3s:v1.33.6-k3s1 --no-lb \
  --kubeconfig-update-default=false --kubeconfig-switch-context=false \
  --k3s-arg '--disable=traefik@server:*' --k3s-arg '--disable=servicelb@server:*' --wait --timeout 180s
k3d kubeconfig get "$name" > "$work/kubeconfig"
export KUBECONFIG="$work/kubeconfig" KUBE_CONTEXT="k3d-$name"
k3d image import -c "$name" eob/api-gateway:dev eob/control-plane:dev eob/agent-runtime:dev eob/desktop-gateway:dev eob/frontend:dev postgres:17-alpine nats:2.11-alpine redis:7.4-alpine
EOB_SECRET_DIR="$work/secrets" python3 deploy/secrets.py
export EOB_SECRETS_FILE="$work/secrets/secrets.json"
bash deploy/apply.sh || { kubectl -n eob get pods; kubectl -n eob logs -l tier=backend --all-containers --prefix --tail=80; kubectl -n eob describe pod -l app=agent-runtime; kubectl -n eob get events --sort-by=.lastTimestamp; exit 1; }
kubectl -n eob get deployments -o json | python3 -c 'import sys,json; ds=[d for d in json.load(sys.stdin)["items"] if d["metadata"].get("labels",{}).get("tier")=="backend"]; assert len(ds)==4; assert all(d["status"].get("readyReplicas",0)==1 for d in ds); print("PASS: all four standalone backend Deployments Ready on K3s")'
# Exercise independent scale/rollout; changing Runtime does not restart API, control plane or desktop gateway.
kubectl -n eob scale deployment/agent-runtime --replicas=2
kubectl -n eob rollout status deployment/agent-runtime --timeout=120s
kubectl -n eob get pods -o wide
