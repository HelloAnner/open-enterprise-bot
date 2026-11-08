#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
cd "$(pwd -P)"
[[ $(uname -s) == Linux && $(hostname | tr '[:upper:]' '[:lower:]') == izuf6gnnqxq6ukvd4f04trz && $(pwd -P) == '/data/Open Enterprise Bot' ]] || { echo 'Build on moss-dev-2 only; local builds are prohibited.' >&2; exit 1; }
export DOCKER_HOST=unix:///run/eob-image-builder/docker.sock DOCKER_BUILDKIT=1
[[ $(docker info --format '{{.DockerRootDir}}') == "$PWD/.state/docker" ]] || exit 1
[[ $(df -Pk . | awk 'NR==2 {print $4}') -gt 104857600 ]] || exit 1
# K3s image storage already resides on the 1T disk; never change its daemon or shared configuration.
grep -q 'root = "/data/k3s-agent-moss-dev/agent/containerd"' /data/k3s-agent-moss-dev/agent/etc/containerd/config.toml
if (( $# == 0 )); then set -- api-gateway control-plane agent-runtime desktop-gateway frontend; fi
version=$(date -u +%Y%m%dT%H%M%SZ)
for service in "$@"; do
 case "$service" in api-gateway|control-plane|agent-runtime|desktop-gateway) context=$service;; frontend) context=Frontend;; *) exit 2;; esac
 image="docker.io/open-enterprise-bot/$service:$version"
 docker build --network=host --progress=plain --build-arg GOPROXY=https://goproxy.cn,direct \
   -f "deploy/images/$service.Dockerfile" -t "$image" "$context"
 docker save "$image" > ".state/images/$service.tar"
 k3s ctr --address /run/k3s/containerd/containerd.sock -n k8s.io images import ".state/images/$service.tar"
 python3 - "$service" "$image" <<'PY'
import json,os,sys
path='.private/images.json';images=json.load(open(path)) if os.path.exists(path) else {};images[sys.argv[1]]=sys.argv[2]
with open(path+'.tmp','w') as f:json.dump(images,f)
os.replace(path+'.tmp',path)
PY
done
for image in postgres:17-alpine nats:2.11-alpine redis:7.4-alpine; do
 docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image"
 owned="docker.io/open-enterprise-bot/base-$image"
 docker tag "$image" "$owned"
 docker save "$owned" | k3s ctr --address /run/k3s/containerd/containerd.sock -n k8s.io images import -
done
