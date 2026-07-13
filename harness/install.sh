#!/usr/bin/env bash
# One-time environment install for the harness's redaction boundary.
#
# Runs at SETUP time, never on demo day: it downloads Python packages and the
# spaCy model (~600 MB) that harness/redact.py needs. Demo-day scripts only
# ever invoke what this script already installed; if redact.py cannot load
# the model, the filing flow fails safe (no issue is filed).
#
# Idempotent: safe to re-run; each step is skipped when already satisfied.
#
#   harness/install.sh
set -euo pipefail

if python3 -c "import presidio_analyzer" 2>/dev/null; then
  echo "presidio-analyzer already installed"
else
  pip install presidio-analyzer
fi

if python3 -c "import spacy; spacy.load('en_core_web_lg')" 2>/dev/null; then
  echo "spaCy model en_core_web_lg already installed"
else
  python3 -m spacy download en_core_web_lg
fi

# Smoke-test the whole boundary end to end so a broken install is caught now,
# not on demo day.
echo "Reach Marie Curie at marie@example.com or 555-0100." \
  | "$(dirname "${BASH_SOURCE[0]}")/redact.py" >/dev/null
echo "redact.py smoke test passed"

# Trace renderer (M2): transcripts → static HTML, invoked by run.sh per
# attempt via `pipx run` (cached after the first use — warm it here so demo
# day never downloads).
pipx run claude-code-log --help >/dev/null 2>&1 && echo "claude-code-log ready"

# Tester role (M3): Playwright MCP + its chromium browser. Two setup-time
# downloads so demo day never fetches anything:
#   1. Warm the npx cache for @playwright/mcp (the runner spawns it via
#      `npx @playwright/mcp@latest`).
#   2. Download the chromium build pinned by the MCP's *bundled* Playwright —
#      via the MCP's own `install-browser` subcommand, never a bare
#      `npx playwright install` (that resolves a different Playwright version
#      and can download a browser build the MCP won't use). "chrome-for-testing"
#      is the distribution the MCP's `--browser chromium` flag maps to in
#      v0.0.78; both target names are requested so a rename in a future
#      version fails loudly here, at setup.
# Both steps are idempotent: npx reuses its cache and install-browser skips
# browsers already in ~/.cache/ms-playwright. See the playwright-mcp-localhost
# skill for the runtime invocation and its gotchas.
APP_DIR="$(dirname "${BASH_SOURCE[0]}")/../demo-app"
(cd "$APP_DIR" && npx --yes @playwright/mcp@latest --help >/dev/null 2>&1) &&
  echo "@playwright/mcp npx cache warm"
(cd "$APP_DIR" && npx --yes @playwright/mcp@latest install-browser chromium chrome-for-testing >/dev/null 2>&1) &&
  echo "Playwright MCP chromium browser installed"

# Signaling layer (M7): pre-pull the pinned Grafana/Loki/Alloy images for the
# harness/observability compose stack, so demo day never downloads. Idempotent:
# `docker compose pull` no-ops when the pinned tags are already local. See the
# grafana-loki-local skill for the stack's layout and verification recipe.
OBS_COMPOSE="$(dirname "${BASH_SOURCE[0]}")/observability/docker-compose.yml"
docker compose -f "$OBS_COMPOSE" pull --quiet
echo "observability images pre-pulled (grafana, loki, alloy)"
