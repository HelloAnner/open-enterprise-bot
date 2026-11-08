#!/usr/bin/env bash
# Run from the source checkout. Only sync/render locally: ALL images compile on moss-dev-2.
set -euo pipefail
cd "$(dirname "$0")/../.."
ns=open-enterprise-bot
worker=izuf6gnnqxq6ukvd4f04trz
k() { ssh -T -o BatchMode=yes moss-dev kubectl --context default "$@"; }
r() { ssh -T -o BatchMode=yes moss-dev-2 "cd '/data/Open Enterprise Bot' && $*"; }
case "${1:-status}" in
 sync)
  r 'test "$(pwd -P)" = "/data/Open Enterprise Bot" && test "$(findmnt -n -o SOURCE -T .)" = /dev/vdb1 && mkdir -p .private && { test ! -f .private/project || test "$(<.private/project)" = open-enterprise-bot; } && printf "%s\n" open-enterprise-bot > .private/project'
  rsync -az --delete --exclude='.git/' --exclude='node_modules/' --exclude='dist/' --exclude='.private/' --exclude='.state/' --exclude='.tools/' --exclude='.secrets/' --exclude='.artifacts/' --exclude='.build/' --exclude='__pycache__/' \
    ./ 'moss-dev-2:/data/Open\ Enterprise\ Bot/'
  ;;
 bootstrap) r 'bash deploy/server/bootstrap.sh';;
 build) shift; for service in "$@"; do case "$service" in api-gateway|control-plane|agent-runtime|desktop-gateway|frontend) ;; *) exit 2;; esac;done;r "bash deploy/server/build.sh $*";;
 apply)
  k get node "$worker" -o name
  k get namespace "$ns" --ignore-not-found -o json | python3 -c 'import sys,json;s=sys.stdin.read();assert not s or json.loads(s)["metadata"].get("labels",{}).get("app.kubernetes.io/part-of")=="open-enterprise-bot","Namespace collision"'
  for v in postgres nats redis;do k get pv "$ns-$v" --ignore-not-found -o json | python3 -c 'import sys,json;s=sys.stdin.read();assert not s or json.loads(s)["metadata"].get("labels",{}).get("app.kubernetes.io/part-of")=="open-enterprise-bot","PV collision"';done
  r 'python3 deploy/server/render.py infra' | k apply -f -
  r 'if test ! -f .private/secrets.json; then EOB_NAMESPACE=open-enterprise-bot EOB_SECRET_DIR="$PWD/.private" MODEL_API_KEY_FILE="$PWD/.private/model.key" python3 deploy/secrets.py >/dev/null; fi; python3 -c '\''import pathlib;print(pathlib.Path(".private/secrets.json").read_text())'\''' | k apply -f -
  for app in postgres nats redis; do k -n "$ns" rollout status "statefulset/$app" --timeout=240s; done
  k -n "$ns" delete job eob-migrate --ignore-not-found --wait=true
  r 'python3 deploy/server/render.py migrate' | k apply -f -
  k -n "$ns" wait --for=condition=complete job/eob-migrate --timeout=180s
  r 'python3 deploy/server/render.py apps' | k apply -f -
  for app in api-gateway control-plane agent-runtime desktop-gateway frontend; do k -n "$ns" rollout status "deployment/$app" --timeout=240s;done
  k -n "$ns" get svc frontend api-gateway desktop-gateway -o json | r 'python3 deploy/server/edge.py'
  ;;
 status) k -n "$ns" get deployments,statefulsets,pods,pvc -o wide;r 'df -h .; docker --host unix:///run/eob-image-builder/docker.sock ps';;
 *) echo 'Usage: remote.sh sync|bootstrap|build [service...]|apply|status' >&2;exit 2;;
esac
