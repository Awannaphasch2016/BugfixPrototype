#!/usr/bin/env bash
# Start a fresh demo cycle, locally and on GitHub: main reset to the baseline
# tag, open PRs closed, fix branches deleted, the previous cycle's issues
# retired (closed as "not planned"), and fresh issues filed with clean
# timelines from the answer key.
#
#   harness/reset.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAG="demo-baseline"
cd "$REPO_ROOT"

git checkout -q main
git fetch -q origin --tags
git reset -q --hard "$TAG"
git clean -qfd
git push --force origin main

for pr in $(gh pr list --state open --json number -q '.[].number'); do
  gh pr close "$pr" --delete-branch || true
done

for b in $(git branch --list 'fix/*' --format='%(refname:short)'); do
  git branch -q -D "$b"
done
for b in $(git ls-remote --heads origin 'fix/*' | sed 's|.*refs/heads/||'); do
  git push -q origin --delete "$b" || true
done

# Retire the previous cycle: open issues close as "not planned"; issues
# closed as completed reopen first so the close reason can be rewritten.
# Issues already closed as not-planned were retired by an earlier reset and
# are never touched again — dead timelines don't churn, and this loop's work
# doesn't grow with the number of past cycles.
ISSUES=$(gh issue list --state all --limit 500 --json number,state,stateReason)
for i in $(jq -r '.[] | select(.state == "OPEN") | .number' <<<"$ISSUES"); do
  gh issue close "$i" --reason "not planned"
done
for i in $(jq -r '.[] | select(.state == "CLOSED" and .stateReason == "COMPLETED") | .number' <<<"$ISSUES"); do
  gh issue reopen "$i"
  gh issue close "$i" --reason "not planned"
done

# File the fresh cycle in demo order, so issue numbers ascend 1 → 2 → 3
# within the cycle. Texts live in the answer key (title on the first line,
# body after) — the verbatim "client-filed" reports never enter a commit.
for f in harness/private/issues/bug-{1,2,3}.md; do
  [[ -f "$f" ]] || { echo "ERROR: missing answer-key issue file: $f" >&2; exit 1; }
  TITLE=$(head -n 1 "$f")
  # body = everything after the title line, minus the leading blank line(s)
  BODY=$(tail -n +2 "$f" | sed '/./,$!d')
  gh issue create --title "$TITLE" --body "$BODY"
done

echo "==> demo reset to '$TAG': previous cycle retired, fresh issues filed"
