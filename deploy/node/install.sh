#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
[[ $(uname -s) == Linux && $EUID == 0 ]] || { echo 'Run on the Linux/KVM compute host as root.' >&2; exit 1; }
: "${KUBE_CONTEXT:?Explicit K3s context required}"
test -c /dev/kvm
test -x deploy/.artifacts/node-runtime
install -d -m 0700 /etc/eob /etc/eob/vms
install -d /opt/eob
install -m 0755 deploy/.artifacts/node-runtime /opt/eob/node-runtime
install -m 0755 deploy/node/provision.sh /opt/eob/provision.sh
kubectl --context "$KUBE_CONTEXT" -n eob get configmap eob-microvm-config -o 'go-template={{index .data "node.env"}}' > /etc/eob/node.env
kubectl --context "$KUBE_CONTEXT" -n eob get secret eob-node-runtime-secret -o json | python3 -c 'import sys,json,base64; s=json.load(sys.stdin); print("SERVICE_TOKENS="+json.dumps(base64.b64decode(s["data"]["SERVICE_TOKENS"]).decode()))' > /etc/eob/node-secret.env
chmod 0600 /etc/eob/node*.env
install -m 0644 deploy/node/eob-node-runtime.service deploy/node/eob-vm@.service /etc/systemd/system/
systemctl daemon-reload
# Inspect /etc/eob/node.env, install pinned kernel/Firecracker/base image and durable volume mounts BEFORE enabling.
echo 'Installed. After verifying paths and private network routes: systemctl enable --now eob-node-runtime'
