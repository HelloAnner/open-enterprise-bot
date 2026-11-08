#!/usr/bin/env bash
# Run only on moss-dev-2. This daemon has its OWN socket/data/containerd and never touches the running Docker daemon.
set -euo pipefail
cd "$(dirname "$0")/../.."
root=$(pwd -P)
[[ $(uname -s) == Linux && $(hostname | tr '[:upper:]' '[:lower:]') == izuf6gnnqxq6ukvd4f04trz ]] || { echo 'Server-only: ssh moss-dev-2 required' >&2; exit 1; }
[[ "$root" == '/data/Open Enterprise Bot' && $(findmnt -n -o SOURCE -T "$root") == /dev/vdb1 ]] || exit 1
[[ $(df -Pk "$root" | awk 'NR==2 {print $4}') -gt 104857600 ]] || { echo 'Less than 100 GiB free; refusing build/deployment.' >&2; exit 1; }
mkdir -p .private .state/{docker,docker-exec,images,postgres,nats,redis,edge,tmp}
chmod 700 .private
printf '%s\n' open-enterprise-bot > .private/project
# These are new project-owned empty directories; never chown any shared data directory.
chown 70:70 .state/postgres; chown 1000:1000 .state/nats; chown 999:1000 .state/redis
python3 - <<'PY'
import json,os
root=os.getcwd()
config={'data-root':root+'/.state/docker','exec-root':root+'/.state/docker-exec','pidfile':root+'/.state/docker.pid','hosts':['unix:///run/eob-image-builder/docker.sock'],'bridge':'none','iptables':False,'ip6tables':False,'ip-forward':False,'ip-masq':False,'userland-proxy':False,'storage-driver':'vfs','registry-mirrors':['https://docker.m.daocloud.io'],'log-driver':'local','log-opts':{'max-size':'5m','max-file':'2'}}
with open('.private/daemon.json','w') as f:json.dump(config,f)
PY
unit=/etc/systemd/system/eob-image-builder.service
if [[ -e "$unit" ]] && ! grep -q 'Open Enterprise Bot isolated' "$unit"; then echo 'Unit name collision' >&2; exit 1; fi
install -m 0644 deploy/server/eob-image-builder.service "$unit"
systemctl daemon-reload
systemctl start eob-image-builder
for i in $(seq 1 40); do if docker -H unix:///run/eob-image-builder/docker.sock info >/dev/null 2>&1; then break; fi; sleep 1; done
actual=$(docker -H unix:///run/eob-image-builder/docker.sock info --format '{{.DockerRootDir}}')
[[ "$actual" == "$root/.state/docker" ]] || exit 1
printf 'Private image builder ready: %s\n' "$actual"
