#!/usr/bin/env bash
# One-shot fixer runner: GitHub issue number in, open PR out.
#
#   harness/run.sh <issue-number>
#
# The agent only diagnoses, tests, and fixes inside $APP_DIR. This script owns
# every git operation (branch, commit, push, PR) so no plumbing step depends on
# the agent. Exits non-zero without pushing anything if the agent fails.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="demo-app" # config point: the directory the fixer agent is scoped to
cd "$REPO_ROOT"

ISSUE="${1:?usage: harness/run.sh <issue-number>}"

abort() {
  echo "ERROR: $1" >&2
  git reset -q --hard
  git clean -qfd -- "$APP_DIR"
  git checkout -q main
  git branch -q -D "$BRANCH" 2>/dev/null || true
  exit 1
}

[[ -z "$(git status --porcelain)" ]] || {
  echo "ERROR: working tree not clean — commit, stash, or reset first" >&2
  exit 1
}
git checkout -q main
git pull -q --ff-only origin main

TITLE=$(gh issue view "$ISSUE" --json title -q .title)
BODY=$(gh issue view "$ISSUE" --json body -q .body)
BRANCH="fix/issue-$ISSUE"

git branch -q -D "$BRANCH" 2>/dev/null || true
git checkout -q -b "$BRANCH"

PROMPT=$(cat <<EOF
You are a senior engineer fixing a reported bug in this task-management app. This directory is the entire application.

## Bug report (issue #$ISSUE): $TITLE

$BODY

## Your job

1. Investigate and find the root cause. Read the code; if the report mentions application logs, interrogate them (grep, jq) and correlate what you find with the code paths involved.
2. Write a regression test at the API route-handler seam (Vitest, alongside the existing tests in tests/) that reproduces the reported behavior. Run it and confirm it FAILS against the current code for the reported reason.
3. Implement the smallest correct fix. Do not refactor beyond it.
4. Run the full suite (npm test) and make sure everything passes.
5. Do not run any git commands; do not touch anything outside this directory.

When you are done, your final reply must be a pull-request description in markdown:
- "## Diagnosis" — how you found the root cause, citing specific evidence (files, and the exact log lines if logs were involved)
- "## Fix" — what you changed and why it is correct
- "## Regression test" — the new test and its red-then-green result

Your final reply is used verbatim as the PR body — it must contain ONLY the PR description, starting with "## Diagnosis", with no preamble or closing remarks around it.
EOF
)

mkdir -p harness/private
RESULT_JSON="harness/private/run-issue-$ISSUE.json"

echo "==> Running fixer agent on issue #$ISSUE: $TITLE"
(cd "$APP_DIR" && claude -p "$PROMPT" --output-format json) > "$RESULT_JSON" ||
  abort "agent exited non-zero (see $RESULT_JSON)"

[[ "$(jq -r '.is_error' "$RESULT_JSON")" == "false" ]] ||
  abort "agent reported an error (see $RESULT_JSON)"
PR_BODY=$(jq -r '.result' "$RESULT_JSON")
[[ -n "$PR_BODY" && "$PR_BODY" != "null" ]] || abort "agent returned no summary"

# keep the session transcript for the rehearsal audit
SESSION_ID=$(jq -r '.session_id' "$RESULT_JSON")
TRANSCRIPT="$HOME/.claude/projects/$(echo "$REPO_ROOT/$APP_DIR" | tr '/.' '--')/$SESSION_ID.jsonl"
if [[ -f "$TRANSCRIPT" ]]; then
  cp "$TRANSCRIPT" "harness/private/transcript-issue-$ISSUE.jsonl"
else
  echo "WARNING: session transcript not found at $TRANSCRIPT — rehearsal audit will lack it" >&2
fi

git add -A
CHANGED=$(git diff --cached --name-only)
[[ -n "$CHANGED" ]] || abort "agent made no changes"
while IFS= read -r f; do
  [[ "$f" == "$APP_DIR"/* ]] || abort "agent touched a file outside $APP_DIR: $f"
done <<<"$CHANGED"

git commit -q -m "Fix #$ISSUE: $TITLE" \
  -m "$PR_BODY" \
  -m "Co-Authored-By: Claude <noreply@anthropic.com>"
git push -q -u origin "$BRANCH"

if ! PR_URL=$(gh pr create --base main --head "$BRANCH" \
  --title "Fix #$ISSUE: $TITLE" \
  --body "$PR_BODY

---
Closes #$ISSUE"); then
  git push -q origin --delete "$BRANCH" || true
  abort "gh pr create failed — remote branch removed, nothing published"
fi

git checkout -q main
echo "==> PR ready for review: $PR_URL"
