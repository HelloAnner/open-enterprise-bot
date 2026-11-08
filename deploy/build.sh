#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Usage: REGISTRY=registry.example.com/eob TAG=release-1 bash deploy/build.sh [api-gateway|control-plane|agent-runtime|desktop-gateway|frontend]
registry=${REGISTRY:-eob}
tag=${TAG:-dev}
if (( $# == 0 )); then set -- api-gateway control-plane agent-runtime desktop-gateway frontend; fi
for service in "$@"; do
  case "$service" in api-gateway|control-plane|agent-runtime|desktop-gateway) context=$service;; frontend) context=Frontend;; *) echo "unknown service: $service" >&2; exit 1;; esac
  docker build -f "deploy/images/$service.Dockerfile" -t "$registry/$service:$tag" "$context"
done
# Push/import explicitly for your own cluster. This script never changes kube context or touches existing clusters.
