#!/usr/bin/env bash
# File a GitHub issue for a signal — an error signature firing in the demo
# app's logs. Scene 2's fallback entry: the same enriched filing the signaling
# layer performs, invoked by hand from a script.
#
#   harness/file-signal-issue.sh <signature>
#
# The issue body carries the context report: the log excerpt around the
# signature's most recent firing, paths canonicalized, personal data visibly
# redacted by the redaction command before anything leaves this machine.
#
# FAIL-SAFE: if composing the report fails for any reason — above all a
# failing redaction command — no issue is filed and this script exits nonzero.
#
# Command boundaries are env-overridable (the harness/chat lib/config.ts
# pattern), so tests can stub them:
#   CHAT_GH_CMD      GitHub CLI          (default: gh)
#   CHAT_REDACT_CMD  redaction command   (default: harness/redact.py,
#                                         resolved inside compose-report.ts)
#   SIGNAL_LOG_FILE  monitored log       (default: demo-app/logs/app.log)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIGNATURE="${1:?usage: harness/file-signal-issue.sh <signature>}"
GH="${CHAT_GH_CMD:-gh}"
LOG_FILE="${SIGNAL_LOG_FILE:-$REPO_ROOT/demo-app/logs/app.log}"

# Compose the context report. compose-report.ts owns the redaction boundary
# and honors the fail-safe contract: nonzero exit means nothing usable was
# printed, so we file nothing.
if ! REPORT="$(cd "$REPO_ROOT/harness/chat" \
    && npx tsx bin/compose-report.ts --log "$LOG_FILE" --signature "$SIGNATURE")"; then
  echo "file-signal-issue: context report failed (redaction or excerpt selection); no issue filed" >&2
  exit 1
fi

TITLE="[signal] $SIGNATURE"
BODY="Auto-filed by the signaling layer: the error signature below fired in the monitored application log.

$REPORT"

# Labeling (problem class, needs-human) belongs to the routing rung; this
# script only performs the enriched filing.
"$GH" issue create --title "$TITLE" --body "$BODY"
