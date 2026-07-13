#!/usr/bin/env bash
# The trigger step (CONTEXT.md): the scripted, deterministic action that makes
# the reserved bug's error signature fire in the monitored log on cue. PATCHes
# a real task in the running demo app with a >100-character title, so the
# validation guard rejects it and pino writes the planted signature —
# "task update failed validation" — to demo-app/logs/app.log for real.
#
#   harness/trigger.sh
#
#   BASE_URL  the running demo app (default: http://localhost:3000)
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

# A real task id first: the trigger must hit an existing task so the failure
# is the title validation and nothing else.
if ! TASKS=$(curl -sf "$BASE_URL/api/tasks"); then
  echo "trigger: demo app not reachable at $BASE_URL — start it first (cd demo-app && npm run dev)" >&2
  exit 1
fi
TASK_ID=$(jq -r '.tasks[0].id // empty' <<<"$TASKS")
[[ -n "$TASK_ID" ]] || { echo "trigger: no tasks in the demo app to update" >&2; exit 1; }

# Past the schema's 100-character title cap, so validation must reject it.
LONG_TITLE="Reorganize the quarterly planning board and migrate every legacy task into the new workspace before the stakeholder review on Friday"
PAYLOAD=$(jq -n --arg t "$LONG_TITLE" '{title: $t}')

STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE_URL/api/tasks/$TASK_ID" \
  -H "Content-Type: application/json" -d "$PAYLOAD")

# Either status means the validation guard fired and the signature is in the
# log; which one you get is itself the bug's story — the unfixed handler
# swallows the failure and answers 200 (the silent data mangling the report
# complains about), the fixed one surfaces the rejection as a 400.
if [[ "$STATUS" == "200" || "$STATUS" == "400" ]]; then
  echo "==> trigger fired: PATCH /api/tasks/$TASK_ID answered $STATUS — signature 'task update failed validation' is now in the log"
else
  echo "trigger: expected 200 (unfixed, swallowed) or 400 (fixed, surfaced), got $STATUS — the signature may not have fired" >&2
  exit 1
fi
