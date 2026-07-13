#!/usr/bin/env bash
# Stop the signaling layer. Idempotent: a stack that is already down no-ops.
#
# Volumes (Loki chunks, Alloy tail positions) survive so the next up.sh
# resumes tailing where it left off. To wipe them for a truly fresh start:
#   docker compose down -v   (from this directory)
#
#   harness/observability/down.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
docker compose down
