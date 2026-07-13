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
