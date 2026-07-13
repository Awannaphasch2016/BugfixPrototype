#!/usr/bin/env bash
# Agent-output cache capture: save a rehearsal-certified fix as a patch
# against the demo-baseline tag plus its transcript and result JSON, keyed by
# answer-key bug title (issue numbers change every cycle; titles and the
# tagged baseline don't).
#
#   harness/capture.sh <issue-number>
#
# Run ONLY after the run has passed the rehearsal ritual (reset → run →
# transcript audit). Two hard rules ride with the cache:
#   - replay never certifies: a cached fix is evidence about the prompt that
#     produced it, so any prompt-shape change makes the whole cache stale as
#     evidence — recapture from freshly certified runs;
#   - a replayed run is never presented to an audience as live.
#
# The cache lives in harness/private/cache/ — gitignored with the rest of the
# answer key, never committed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TAG="demo-baseline"
ISSUE="${1:?usage: harness/capture.sh <issue-number>}"

slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g'
}

TITLE=$(gh issue view "$ISSUE" --json title -q .title)
[[ -n "$TITLE" ]] || { echo "ERROR: issue #$ISSUE has no title" >&2; exit 1; }
SLUG=$(slugify "$TITLE")
CACHE_DIR="harness/private/cache/$SLUG"

# The attempt's merged PR: the runner names every fix branch fix/issue-<n>,
# and GitHub keeps refs/pull/<pr>/head alive after branch deletion.
PR=$(gh pr list --state merged --limit 500 --json number,headRefName \
  --jq ".[] | select(.headRefName == \"fix/issue-$ISSUE\") | .number" | head -n1)
[[ -n "$PR" ]] || { echo "ERROR: no merged PR with head fix/issue-$ISSUE" >&2; exit 1; }

git fetch -q origin "refs/pull/$PR/head"
HEAD_SHA=$(git rev-parse FETCH_HEAD)

# The runner commits each attempt as exactly one single-parent commit, so the
# commit's own diff is the fix — independent of whatever else was on main in
# its cycle.
[[ $(git show -s --format=%P "$HEAD_SHA" | wc -w) -eq 1 ]] ||
  { echo "ERROR: PR #$PR head $HEAD_SHA is not a single-parent fixer commit" >&2; exit 1; }

mkdir -p "$CACHE_DIR"
git diff "$HEAD_SHA~1" "$HEAD_SHA" -- demo-app > "$CACHE_DIR/fix.patch"
[[ -s "$CACHE_DIR/fix.patch" ]] ||
  { echo "ERROR: empty patch from PR #$PR" >&2; rm -f "$CACHE_DIR/fix.patch"; exit 1; }

# Durability check against the tag. A run captured mid-cycle carries context
# from the fixes merged before it (demo order), so a direct apply can fail on
# the virgin baseline while replay's git apply --3way still resolves it — the
# preimage blobs ride along in the patch's index lines. Direct-apply failure
# is therefore a warning, not an error.
TMP_WORKTREE=$(mktemp -d)
git worktree add -q --detach "$TMP_WORKTREE" "$TAG"
if ! git -C "$TMP_WORKTREE" apply --check "$REPO_ROOT/$CACHE_DIR/fix.patch" 2>/dev/null; then
  echo "WARNING: patch does not apply directly to $TAG — captured mid-cycle;" >&2
  echo "         replay in demo order, or rely on replay's 3-way fallback" >&2
fi
git worktree remove --force "$TMP_WORKTREE" >/dev/null

# Result JSON carries the PR body in .result (replay reuses it verbatim).
if [[ -f "harness/private/run-issue-$ISSUE.json" ]]; then
  cp "harness/private/run-issue-$ISSUE.json" "$CACHE_DIR/result.json"
else
  BODY=$(gh pr view "$PR" --json body --jq .body)
  BODY="${BODY%$'\n'$'\n'---$'\n'"Closes #$ISSUE"}"
  jq -n --arg result "$BODY" \
    '{is_error: false, result: $result, source: "reconstructed-from-pr-body"}' \
    > "$CACHE_DIR/result.json"
  echo "WARNING: no run-issue-$ISSUE.json — result reconstructed from the PR body" >&2
fi

if [[ -f "harness/private/transcript-issue-$ISSUE.jsonl" ]]; then
  cp "harness/private/transcript-issue-$ISSUE.jsonl" "$CACHE_DIR/transcript.jsonl"
else
  echo "WARNING: no transcript-issue-$ISSUE.jsonl — replay will lack a transcript" >&2
fi

# Role artifacts: the attributed plan and review comments, verbatim, so replay
# can re-post them for real; plus the per-stage transcripts when present.
PLAN_BODY=$(gh issue view "$ISSUE" --json comments \
  --jq '[.comments[] | select(.body | startswith("## Plan — planner agent"))] | last | .body // empty')
if [[ -n "$PLAN_BODY" ]]; then
  printf '%s' "$PLAN_BODY" > "$CACHE_DIR/plan.md"
else
  rm -f "$CACHE_DIR/plan.md"
  echo "WARNING: no plan comment on issue #$ISSUE — replay will skip the planner artifact" >&2
fi
REVIEW_BODY=$(gh pr view "$PR" --json comments \
  --jq '[.comments[] | select(.body | startswith("## Review — reviewer agent"))] | last | .body // empty')
if [[ -n "$REVIEW_BODY" ]]; then
  printf '%s' "$REVIEW_BODY" > "$CACHE_DIR/review.md"
else
  rm -f "$CACHE_DIR/review.md"
  echo "WARNING: no review comment on PR #$PR — replay will skip the reviewer artifact" >&2
fi
for STAGE in planner reviewer; do
  if [[ -f "harness/private/transcript-issue-$ISSUE-$STAGE.jsonl" ]]; then
    cp "harness/private/transcript-issue-$ISSUE-$STAGE.jsonl" "$CACHE_DIR/transcript-$STAGE.jsonl"
  fi
done

jq -n --arg title "$TITLE" --arg slug "$SLUG" \
  --argjson issue "$ISSUE" --argjson pr "$PR" \
  --arg headSha "$HEAD_SHA" --arg baseline "$(git rev-parse "$TAG")" \
  --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{title: $title, slug: $slug, sourceIssue: $issue, sourcePr: $pr,
    headSha: $headSha, baselineAtCapture: $baseline, capturedAt: $capturedAt}' \
  > "$CACHE_DIR/meta.json"

echo "==> Captured \"$TITLE\" (issue #$ISSUE, PR #$PR) into $CACHE_DIR"
