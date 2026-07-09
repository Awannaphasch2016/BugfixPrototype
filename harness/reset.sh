#!/usr/bin/env bash
# Rewind the demo to the tagged buggy baseline, locally and on GitHub:
# main reset to the tag, open PRs closed, fix branches deleted, issues reopened.
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

for i in $(gh issue list --state closed --json number -q '.[].number'); do
  gh issue reopen "$i" || true
done

echo "==> demo reset to '$TAG' (local + GitHub)"
