#!/usr/bin/env bash
# Pre-demo setup: seed the autofix lane. After reset.sh, run bug 1 through the
# pipeline and merge its PR with no human in the loop, so the demo opens with
# real autofix history: issue #1 closed with a merged PR, issues #2 and #3
# open, zero open PRs.
#
#   harness/setup.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

harness/run.sh 1

PR=$(gh pr list --state open --head fix/issue-1 --json number -q '.[0].number')
[[ -n "$PR" && "$PR" != "null" ]] ||
  { echo "ERROR: no open PR found for fix/issue-1" >&2; exit 1; }

gh pr merge "$PR" --merge --delete-branch
git checkout -q main
git pull -q --ff-only origin main

echo "==> setup complete: issue #1 autofixed and merged (PR #$PR)"
echo "==> demo inventory: issue #1 closed, issues #2/#3 open, no open PRs"
