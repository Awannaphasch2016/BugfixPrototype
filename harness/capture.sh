#!/usr/bin/env bash
# Agent-output cache capture: save a rehearsal-certified fix as a patch
# against the demo-baseline tag plus its transcript and result JSON, keyed by
# answer-key bug title and attempt (issue numbers change every cycle; titles
# and the tagged baseline don't).
#
#   harness/capture.sh <issue-number> [--follow-up]
#
# Each entry lands under cache/<slug>/attempt-<n>/ and declares the state its
# patch applies to: attempt-1 applies to the baseline; --follow-up writes
# attempt-2, whose patch applies to the baseline plus the first attempt's
# merged fix (replay order is enforced by the routing policy — a follow-up is
# only reachable after the first fix merged).
#
# Run ONLY after the run has passed the rehearsal ritual (leg 1: reset → live
# runs → transcript audit). Two hard rules ride with the cache:
#   - replay never certifies: a cached fix is evidence about the prompt that
#     produced it, so any prompt-shape change makes the whole cache stale as
#     evidence — recapture from freshly certified runs;
#   - a replayed run is never presented to an audience as live generation
#     (ADR-0004: certified agent output, live machinery, narrated as such).
#
# The final step is the coherence pass (harness/cache-coherence.sh): the
# entry's own issue number becomes the {{issue}} placeholder, and any foreign
# issue number, commit sha, or date in cached prose rejects the capture.
#
# The cache lives in harness/private/cache/ — gitignored with the rest of the
# answer key, never committed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TAG="demo-baseline"
ISSUE="${1:?usage: harness/capture.sh <issue-number> [--follow-up]}"
ATTEMPT=1
APPLIES_TO="baseline"
if [[ "${2-}" == "--follow-up" ]]; then
  ATTEMPT=2
  APPLIES_TO="baseline+attempt-1"
elif [[ -n "${2-}" ]]; then
  echo "ERROR: unknown argument: $2 (only --follow-up is understood)" >&2
  exit 1
fi

slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g'
}

TITLE=$(gh issue view "$ISSUE" --json title -q .title)
[[ -n "$TITLE" ]] || { echo "ERROR: issue #$ISSUE has no title" >&2; exit 1; }
SLUG=$(slugify "$TITLE")
CACHE_DIR="harness/private/cache/$SLUG/attempt-$ATTEMPT"

# The attempt's merged PR: the runner names every fix branch fix/issue-<n>,
# and GitHub keeps refs/pull/<pr>/head alive after branch deletion.
PR=$(gh pr list --state merged --limit 500 --json number,headRefName \
  --jq ".[] | select(.headRefName == \"fix/issue-$ISSUE\") | .number" | head -n1)
[[ -n "$PR" ]] || { echo "ERROR: no merged PR with head fix/issue-$ISSUE" >&2; exit 1; }

git fetch -q origin "refs/pull/$PR/head"
HEAD_SHA=$(git rev-parse FETCH_HEAD)

# The fixer's work is the PR commit the runner titled "Fix #<issue>: ..." (a
# later commit, when present, is the runner-committed tester evidence; an
# earlier one can be mainline history the branch carried when local main ran
# ahead of origin). It is single-parent, so its own diff is the fix —
# independent of whatever else was on main in its cycle.
FIX_SHA=$(gh pr view "$PR" --json commits \
  --jq ".commits[] | select(.messageHeadline | startswith(\"Fix #$ISSUE:\")) | .oid" | head -n1)
[[ -n "$FIX_SHA" ]] ||
  { echo "ERROR: PR #$PR has no commit titled 'Fix #$ISSUE:'" >&2; exit 1; }
[[ $(git show -s --format=%P "$FIX_SHA" | wc -w) -eq 1 ]] ||
  { echo "ERROR: PR #$PR first commit $FIX_SHA is not a single-parent fixer commit" >&2; exit 1; }

mkdir -p "$CACHE_DIR"
git diff "$FIX_SHA~1" "$FIX_SHA" -- demo-app > "$CACHE_DIR/fix.patch"
[[ -s "$CACHE_DIR/fix.patch" ]] ||
  { echo "ERROR: empty patch from PR #$PR" >&2; rm -f "$CACHE_DIR/fix.patch"; exit 1; }

# Durability check against the entry's declared base: the tag for a first
# attempt, the tag plus the first attempt's fix for a follow-up. A run
# captured mid-cycle carries context from the fixes merged before it (demo
# order), so a direct apply can fail on the declared base while replay's
# git apply --3way still resolves it — the preimage blobs ride along in the
# patch's index lines. Direct-apply failure is therefore a warning, not an
# error.
TMP_WORKTREE=$(mktemp -d)
git worktree add -q --detach "$TMP_WORKTREE" "$TAG"
if [[ "$ATTEMPT" == 2 ]]; then
  FIRST_PATCH="harness/private/cache/$SLUG/attempt-1/fix.patch"
  if [[ -f "$FIRST_PATCH" ]]; then
    git -C "$TMP_WORKTREE" apply --3way "$REPO_ROOT/$FIRST_PATCH" 2>/dev/null ||
      echo "WARNING: attempt-1 patch would not apply to $TAG — follow-up durability checked against the bare tag" >&2
  else
    echo "WARNING: no attempt-1 entry for \"$TITLE\" — capture the first attempt too, or replay of the follow-up has nothing to stand on" >&2
  fi
fi
if ! git -C "$TMP_WORKTREE" apply --check "$REPO_ROOT/$CACHE_DIR/fix.patch" 2>/dev/null; then
  echo "WARNING: patch does not apply directly to its declared base ($APPLIES_TO) — captured mid-cycle;" >&2
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
for STAGE in planner tester-before tester-after reviewer; do
  if [[ -f "harness/private/transcript-issue-$ISSUE-$STAGE.jsonl" ]]; then
    cp "harness/private/transcript-issue-$ISSUE-$STAGE.jsonl" "$CACHE_DIR/transcript-$STAGE.jsonl"
  fi
done

# Tester evidence: screenshots from the PR head tree plus the narrative from
# the PR body (image links are NOT cached — replay re-pins them to its own
# evidence commit).
if git ls-tree -r --name-only "$HEAD_SHA" -- "evidence/issue-$ISSUE" | grep -q .; then
  rm -rf "$CACHE_DIR/evidence"
  mkdir -p "$CACHE_DIR/evidence"
  git archive "$HEAD_SHA" "evidence/issue-$ISSUE" | tar -x --strip-components=2 -C "$CACHE_DIR/evidence"
  gh pr view "$PR" --json body --jq .body |
    awk '/^## Evidence — tester agent$/{f=1; next} f && (/^!\[/ || /^---$/){exit} f' \
    > "$CACHE_DIR/evidence/evidence.md"
else
  rm -rf "$CACHE_DIR/evidence"
  echo "WARNING: PR #$PR carries no evidence/ — replay will skip the tester artifact" >&2
fi

jq -n --arg title "$TITLE" --arg slug "$SLUG" \
  --argjson issue "$ISSUE" --argjson pr "$PR" \
  --argjson attempt "$ATTEMPT" --arg appliesTo "$APPLIES_TO" \
  --arg headSha "$HEAD_SHA" --arg baseline "$(git rev-parse "$TAG")" \
  --arg capturedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{title: $title, slug: $slug, attempt: $attempt, appliesTo: $appliesTo,
    sourceIssue: $issue, sourcePr: $pr,
    headSha: $headSha, baselineAtCapture: $baseline, capturedAt: $capturedAt}' \
  > "$CACHE_DIR/meta.json"

# Coherence gate, last: nothing that can go stale enters the cache. A dirty
# artifact rejects the whole entry — fix at the source and recapture. The
# replay variables' capture-side values (ADR-0005) all come from the record
# itself: the precedent link and firing reqId from the issue body (what the
# agents were shown), the precedent's commit shas from its merged PR, the run
# date from this PR's merge timestamp.
ISSUE_BODY=$(gh issue view "$ISSUE" --json body -q .body)
COHERENCE_ARGS=("$CACHE_DIR" "$ISSUE")
PRECEDENT=$(grep -oP 'precedent: \[#\K[0-9]+' <<<"$ISSUE_BODY" | head -1 || true)
if [[ -n "$PRECEDENT" ]]; then
  COHERENCE_ARGS+=(--precedent "$PRECEDENT")
  PRECEDENT_PR=$(gh pr list --state merged --limit 500 --json number,headRefName \
    --jq ".[] | select(.headRefName == \"fix/issue-$PRECEDENT\") | .number" | head -n1)
  if [[ -n "$PRECEDENT_PR" ]]; then
    PRECEDENT_SHAS=$(gh pr view "$PRECEDENT_PR" --json commits,mergeCommit \
      --jq '[.commits[].oid, .mergeCommit.oid] | map(select(. != null)) | join(",")')
    [[ -z "$PRECEDENT_SHAS" ]] || COHERENCE_ARGS+=(--precedent-shas "$PRECEDENT_SHAS")
  fi
fi
RUN_DATE=$(gh pr view "$PR" --json mergedAt -q .mergedAt | cut -c1-10)
[[ -z "$RUN_DATE" || "$RUN_DATE" == "null" ]] || COHERENCE_ARGS+=(--run-date "$RUN_DATE")
FIRING_REQID=$(grep -oP '"level":50[^\n]*?"reqId":"\K[a-z0-9]+' <<<"$ISSUE_BODY" | tail -1 || true)
[[ -z "$FIRING_REQID" ]] || COHERENCE_ARGS+=(--firing-reqid "$FIRING_REQID")
if ! harness/cache-coherence.sh "${COHERENCE_ARGS[@]}"; then
  rm -rf "$CACHE_DIR"
  echo "ERROR: coherence lint rejected the capture — entry removed; recapture after fixing the artifacts at their source" >&2
  exit 1
fi

echo "==> Captured \"$TITLE\" (issue #$ISSUE, PR #$PR, attempt $ATTEMPT, applies to $APPLIES_TO) into $CACHE_DIR"
