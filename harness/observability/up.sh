#!/usr/bin/env bash
# Bring the signaling layer up (Grafana + Loki + Alloy), wait until Grafana
# answers healthy, and print the demo URLs. Idempotent: compose no-ops
# services that are already up-to-date and running.
#
#   harness/observability/up.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"

docker compose up -d

echo -n "waiting for Grafana on :3001 "
for _ in $(seq 1 60); do
  if curl -sf http://localhost:3001/api/health 2>/dev/null | grep -q '"database": *"ok"'; then
    echo " healthy"
    echo "==> Grafana:   http://localhost:3001 (anonymous admin; admin/admin for the API)"
    echo "==> Dashboard: http://localhost:3001/d/signals-tasks-app"
    echo "==> Alerting:  http://localhost:3001/alerting/list"
    echo "==> Loki:      http://localhost:3100 (ready at /ready)"
    exit 0
  fi
  echo -n "."
  sleep 2
done

echo
echo "up.sh: Grafana did not report healthy within 120s — check: docker compose logs grafana" >&2
exit 1
