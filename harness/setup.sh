#!/usr/bin/env bash
# Pre-demo setup: seed the autofix lane. After reset.sh, run bug 1 through the
# pipeline, merge its PR with no human in the loop, and mark the lane on the
# record: the issue ends closed as completed (via the merge) and labeled
# `autofixed` — the one moment autofixing happens is the one place the label
# is applied. The demo opens with real autofix history: bug 1 solved, bugs 2
# and 3 open, zero open PRs.
#
#   harness/setup.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LABEL="autofixed"
BUG1="harness/private/issues/bug-1.md"

# Fresh issue numbers change every cycle; the stable identity is the exact
# title from the answer key.
[[ -f "$BUG1" ]] || { echo "ERROR: missing answer-key issue file: $BUG1" >&2; exit 1; }
TITLE=$(head -n 1 "$BUG1")
ISSUE=$(gh issue list --state open --json number,title |
  jq -r --arg t "$TITLE" '[.[] | select(.title == $t)] | .[0].number // empty')
[[ -n "$ISSUE" ]] ||
  { echo "ERROR: no open issue titled '$TITLE' — run harness/reset.sh first" >&2; exit 1; }

# The label is repo-level state no reset touches: create it if absent so
# applying it below can't fail on a fresh or hand-cleaned repo.
if ! gh label list --json name -q '.[].name' | grep -qxF "$LABEL"; then
  gh label create "$LABEL" --color "1a7f37" \
    --description "Solved with no human in the loop — applied by the pipeline at auto-merge"
fi

harness/run.sh "$ISSUE"

PR=$(gh pr list --state open --head "fix/issue-$ISSUE" --json number -q '.[0].number')
[[ -n "$PR" && "$PR" != "null" ]] ||
  { echo "ERROR: no open PR found for fix/issue-$ISSUE" >&2; exit 1; }

gh pr merge "$PR" --merge --delete-branch
gh issue edit "$ISSUE" --add-label "$LABEL"

# Seed the precedent ledger (ADR-0002): bug 1's honest problem class. With
# the class label on a completed issue that has a merged fix-branch PR, the
# opening state shows earned precedent — the next signal of this class routes
# to the autofix lane with no human at entry. Labels are repo-level state no
# reset touches; create idempotently, same as the lane marker above.
CLASS_LABEL="class:list-filter"
if ! gh label list --limit 200 --json name -q '.[].name' | grep -qxF "$CLASS_LABEL"; then
  gh label create "$CLASS_LABEL" --color "1d76db" \
    --description "problem class — precedent ledger"
fi
gh issue edit "$ISSUE" --add-label "$CLASS_LABEL"

git checkout -q main
git pull -q --ff-only origin main

echo "==> setup complete: issue #$ISSUE ('$TITLE') autofixed and merged (PR #$PR)"
echo "==> demo inventory: bug 1 closed+labeled ($LABEL, $CLASS_LABEL), bug 2 + request open, no open PRs (the reserved bug arrives via the signaling layer)"
