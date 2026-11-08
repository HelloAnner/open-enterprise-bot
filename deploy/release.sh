#!/usr/bin/env bash
set -euo pipefail
: "${KUBE_CONTEXT:?Set the target K3s context}"
service=${1:?service required}
image=${2:?immutable image tag or digest required}
case "$service" in api-gateway|control-plane|agent-runtime|desktop-gateway|frontend) ;; *) exit 2;; esac
kubectl --context "$KUBE_CONTEXT" -n eob set image "deployment/$service" "$service=$image"
kubectl --context "$KUBE_CONTEXT" -n eob rollout status "deployment/$service" --timeout=180s
