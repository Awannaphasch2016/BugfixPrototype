#!/usr/bin/env bash
# Route a signal by script — scene 2's rehearsed fallback and the test entry:
# POST the signature to the chat backend's routing route (the same route the
# Grafana alert webhook hits) and pretty-print the routing verdict.
#
#   harness/route-signal.sh <signature>
#
#   CHAT_URL  the routing route (default: http://localhost:4000/api/signal)
#
# Verdicts: {"routed":"absorbed"} — an open issue for this signature absorbed
# the repeat; {"routed":"needs-human"} — novel class, filed for a human;
# {"routed":"autofix"} — precedented class, filed and auto-dispatched (or
# noted "queued-behind-lock" when a run is already in flight).
set -euo pipefail

SIGNATURE="${1:?usage: harness/route-signal.sh <signature>}"
CHAT_URL="${CHAT_URL:-http://localhost:4000/api/signal}"

PAYLOAD=$(jq -n --arg s "$SIGNATURE" '{signature: $s}')

# Capture the status separately: a 502 (fail-safe: nothing filed) or 400 is a
# verdict to show, not a transport failure to hide.
RESPONSE=$(curl -s -w '\n%{http_code}' -X POST "$CHAT_URL" \
  -H "Content-Type: application/json" -d "$PAYLOAD") ||
  { echo "route-signal: chat backend not reachable at $CHAT_URL — start it first (cd harness/chat && npm run dev)" >&2; exit 1; }

STATUS="${RESPONSE##*$'\n'}"
BODY="${RESPONSE%$'\n'*}"

echo "==> POST $CHAT_URL ($STATUS)"
jq . <<<"$BODY" 2>/dev/null || echo "$BODY"

[[ "$STATUS" == "200" ]]
