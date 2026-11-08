#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# Explicit context guard prevents accidental writes to an unrelated current cluster.
: "${KUBE_CONTEXT:?Set KUBE_CONTEXT to the intended K3s cluster}"
k=(kubectl --context "$KUBE_CONTEXT")
secrets_file=${EOB_SECRETS_FILE:-deploy/.secrets/secrets.json}
test -f "$secrets_file" || { echo 'Run python3 deploy/secrets.py first.' >&2; exit 1; }
"${k[@]}" apply -f deploy/namespace.yaml
"${k[@]}" apply -f "$secrets_file"
"${k[@]}" apply -f deploy/configmaps.yaml
"${k[@]}" apply -f deploy/infra/
"${k[@]}" -n eob rollout status statefulset/postgres --timeout=180s
"${k[@]}" -n eob create configmap eob-migrations \
  --from-file=10-gateway.sql=api-gateway/src/infrastructure/schema.sql \
  --from-file=20-control.sql=control-plane/src/infrastructure/schema.sql \
  --from-file=30-runtime.sql=agent-runtime/src/infrastructure/schema.sql \
  --from-file=40-desktop.sql=desktop-gateway/src/infrastructure/schema.sql \
  --from-file=90-roles.sql=deploy/postgres/roles.sql \
  --dry-run=client -o yaml | "${k[@]}" apply -f -
"${k[@]}" -n eob delete job eob-migrate --ignore-not-found
"${k[@]}" apply -f deploy/postgres/migrate.yaml
"${k[@]}" -n eob wait --for=condition=complete job/eob-migrate --timeout=180s || { "${k[@]}" -n eob logs job/eob-migrate; exit 1; }
"${k[@]}" apply -k deploy
for service in api-gateway control-plane agent-runtime desktop-gateway frontend; do
  "${k[@]}" -n eob rollout status "deployment/$service" --timeout=180s
done
# After changing env-backed ConfigMaps, explicitly rollout restart only the affected Deployment(s).
