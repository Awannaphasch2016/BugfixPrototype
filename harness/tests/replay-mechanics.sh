#!/usr/bin/env bash
# Replay and capture mechanics for stage 4b (the Stage 3 stubbed-commands
# pattern: the real runner in a throwaway clone with a local bare origin,
# gh/npm/sleep stubbed, claude poisoned). Asserts:
#
#   1. coherence (harness/cache-coherence.sh): a dirty artifact — foreign
#      issue number, commit sha, or date — fails with a message naming the
#      offending line; a clean artifact's own issue number is normalized to
#      the {{issue}} placeholder, in .md prose and in result.json's .result;
#   2. replay of a first attempt posts every cached artifact with the fresh
#      issue number substituted into the placeholder, applies the cached
#      patch, and never invokes an agent;
#   3. replay of a follow-up attempt (--attempt 2) applies on top of the
#      first fix's merged state;
#   4. beats are separated by the configured DEMO_REPLAY_DELAY; unset means
#      no sleeps at all.
#
# No network, no GitHub, no real agent. Exits 0 green, 1 with the first
# failed assertion.
set -euo pipefail

HARNESS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(dirname "$HARNESS_DIR")"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
OUT="$TMP/out"
mkdir -p "$OUT" "$TMP/bin"

fail() { echo "FAIL: $1" >&2; exit 1; }

# ---- 1. coherence script, straight on fixture entries ----------------------
COHERENCE="$REPO_ROOT/harness/cache-coherence.sh"

DIRTY="$TMP/dirty-entry"
mkdir -p "$DIRTY"
printf '## Plan — planner agent\n\nSee the earlier fix in #12 for context.\n' > "$DIRTY/plan.md"
printf '## Review — reviewer agent\n\nMatches commit 3abe4e0dead in spirit.\n' > "$DIRTY/review.md"
jq -n '{is_error:false, result:"## Diagnosis\n\nBroken since 2026-07-12."}' > "$DIRTY/result.json"
if "$COHERENCE" "$DIRTY" 7 > "$OUT/coherence-dirty.log" 2>&1; then
  fail "coherence accepted a dirty entry"
fi
grep -q "issue number.*plan.md line 3" "$OUT/coherence-dirty.log" ||
  fail "coherence did not name the foreign issue number's file and line"
grep -q "commit sha.*review.md line 3" "$OUT/coherence-dirty.log" ||
  fail "coherence did not name the sha's file and line"
grep -q "date.*result.json:.result line 3" "$OUT/coherence-dirty.log" ||
  fail "coherence did not name the date's line in result.json"

CLEAN="$TMP/clean-entry"
mkdir -p "$CLEAN/evidence"
printf '## Plan — planner agent\n\nRoot cause of issue 7, reported as #7.\n' > "$CLEAN/plan.md"
printf '### Symptom\n\nShots for issue-7 attached.\n' > "$CLEAN/evidence/evidence.md"
jq -n '{is_error:false, result:"## Diagnosis\n\nThe defect behind issue #7."}' > "$CLEAN/result.json"
"$COHERENCE" "$CLEAN" 7 > "$OUT/coherence-clean.log" 2>&1 ||
  { cat "$OUT/coherence-clean.log" >&2; fail "coherence rejected a clean entry"; }
grep -q 'issue {{issue}}, reported as #{{issue}}' "$CLEAN/plan.md" ||
  fail "own issue number not normalized in plan.md"
grep -q 'issue-{{issue}}' "$CLEAN/evidence/evidence.md" ||
  fail "own issue-N reference not normalized in evidence.md"
[[ "$(jq -r '.result' "$CLEAN/result.json")" == $'## Diagnosis\n\nThe defect behind issue #{{issue}}.' ]] ||
  fail "own issue number not normalized inside result.json's .result"

# ---- stubs for the runner ---------------------------------------------------
export STUB_OUT="$OUT"

# claude is poisoned: replay must never spawn an agent.
cat > "$TMP/bin/claude" <<'STUB'
#!/usr/bin/env bash
touch "$STUB_OUT/claude-was-called"
echo "claude must not run in replay" >&2
exit 1
STUB

cat > "$TMP/bin/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
echo "gh $*" >> "$STUB_OUT/gh.log"
body_to() { # write the --body argument to $1
  local dest="$1"; shift
  while [[ $# -gt 0 ]]; do
    if [[ "$1" == "--body" ]]; then printf '%s' "$2" > "$dest"; return 0; fi
    shift
  done
  echo "gh stub: no --body in: $*" >&2; exit 1
}
case "$1 $2" in
  "issue view")
    case "$*" in
      *"-q .title") echo "Stub bug title" ;;
      *"-q .body")  echo "Stub bug body line." ;;
      *) echo "gh stub: unexpected issue view: $*" >&2; exit 1 ;;
    esac ;;
  "issue comment")
    N_FILE="$STUB_OUT/issue-comments"; N=$(( $(cat "$N_FILE" 2>/dev/null || echo 0) + 1 ))
    echo "$N" > "$N_FILE"
    body_to "$STUB_OUT/issue-comment-$N.txt" "$@" ;;
  "pr create")
    body_to "$STUB_OUT/pr-create-body.txt" "$@"
    echo "https://github.com/stub/stub/pull/99" ;;
  "pr comment")
    N_FILE="$STUB_OUT/pr-comments"; N=$(( $(cat "$N_FILE" 2>/dev/null || echo 0) + 1 ))
    echo "$N" > "$N_FILE"
    body_to "$STUB_OUT/pr-comment-$N.txt" "$@" ;;
  "pr edit")
    body_to "$STUB_OUT/pr-edit-body.txt" "$@" ;;
  *) echo "gh stub: unexpected args: $*" >&2; exit 1 ;;
esac
STUB

cat > "$TMP/bin/npm" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  test) printf ' Test Files  1 passed (1)\n      Tests  11 passed (11)\n' ;;
  "run lint") : ;;
  *) echo "npm stub: unexpected args: $*" >&2; exit 1 ;;
esac
STUB

# sleep records the requested delay and returns immediately — the beat
# assertion is on the argv, not on wall clock.
cat > "$TMP/bin/sleep" <<'STUB'
#!/usr/bin/env bash
echo "$*" >> "$STUB_OUT/sleep.log"
STUB
chmod +x "$TMP/bin/claude" "$TMP/bin/gh" "$TMP/bin/npm" "$TMP/bin/sleep"

# ---- throwaway world: bare origin + clone -----------------------------------
git clone -q --bare "$REPO_ROOT" "$TMP/origin.git"
git clone -q "$TMP/origin.git" "$TMP/repo"
git -C "$TMP/repo" config user.email "replay-mechanics-test@local"
git -C "$TMP/repo" config user.name "replay-mechanics-test"
# test the runner as it stands in the working tree, not as last committed
cp "$REPO_ROOT/harness/run.sh" "$TMP/repo/harness/run.sh"
git -C "$TMP/repo" add harness/run.sh
git -C "$TMP/repo" -c commit.gpgsign=false commit -qm "replay-mechanics: runner under test" --no-verify --allow-empty
git -C "$TMP/repo" push -q origin main

# ---- cache fixture: two attempts under the answer-key slug ------------------
# Real patches, built from real commits on a scratch branch: attempt-1 against
# main, attempt-2 against main + attempt-1 (the follow-up's declared base).
SLUG="stub-bug-title"
CACHE1="$TMP/repo/harness/private/cache/$SLUG/attempt-1"
CACHE2="$TMP/repo/harness/private/cache/$SLUG/attempt-2"
mkdir -p "$CACHE1/evidence" "$CACHE2"

git -C "$TMP/repo" checkout -qb fixture
printf 'certified first fix\n' > "$TMP/repo/demo-app/replay-fix.txt"
git -C "$TMP/repo" add demo-app/replay-fix.txt
git -C "$TMP/repo" -c commit.gpgsign=false commit -qm "fixture: first fix" --no-verify
git -C "$TMP/repo" diff HEAD~1 HEAD -- demo-app > "$CACHE1/fix.patch"
printf 'certified follow-up fix\n' >> "$TMP/repo/demo-app/replay-fix.txt"
git -C "$TMP/repo" add demo-app/replay-fix.txt
git -C "$TMP/repo" -c commit.gpgsign=false commit -qm "fixture: follow-up fix" --no-verify
git -C "$TMP/repo" diff HEAD~1 HEAD -- demo-app > "$CACHE2/fix.patch"
git -C "$TMP/repo" checkout -q main
git -C "$TMP/repo" branch -qD fixture

PLAN_1=$'## Plan — planner agent\n\nCertified root cause for issue #{{issue}}.'
REVIEW_1=$'## Review — reviewer agent\n\n### Verdict\n\nMeets the standards; scoped to issue #{{issue}}.'
RESULT_1=$'## Diagnosis\n\nCertified diagnosis for issue #{{issue}}.\n\n## Fix\n\nThe certified fix.\n\n## Regression test\n\nRed-then-green at the seam.'
EVIDENCE_1=$'### Symptom on the baseline\n\nReproduced for issue #{{issue}}.\n\n### With the fix\n\nGone for issue #{{issue}}.'
printf '%s' "$PLAN_1"     > "$CACHE1/plan.md"
printf '%s' "$REVIEW_1"   > "$CACHE1/review.md"
printf '%s' "$EVIDENCE_1" > "$CACHE1/evidence/evidence.md"
printf 'not-really-a-png' > "$CACHE1/evidence/before-symptom.png"
printf 'not-really-a-png' > "$CACHE1/evidence/after-symptom.png"
jq -n --arg r "$RESULT_1" '{is_error:false, result:$r}' > "$CACHE1/result.json"

PLAN_2=$'## Plan — planner agent\n\nFollow-up plan for issue #{{issue}}, on top of the first fix.'
REVIEW_2=$'## Review — reviewer agent\n\n### Verdict\n\nFollow-up meets the standards for issue #{{issue}}.'
RESULT_2=$'## Diagnosis\n\nFollow-up diagnosis for issue #{{issue}}.\n\n## Fix\n\nThe follow-up fix.\n\n## Regression test\n\nRed-then-green again.'
printf '%s' "$PLAN_2"   > "$CACHE2/plan.md"
printf '%s' "$REVIEW_2" > "$CACHE2/review.md"
jq -n --arg r "$RESULT_2" '{is_error:false, result:$r}' > "$CACHE2/result.json"

# ---- 2. replay the first attempt: substitution, patch, no agent, no sleeps --
( cd "$TMP/repo" && PATH="$TMP/bin:$PATH" STUB_OUT="$OUT" \
    bash harness/run.sh --replay 7 ) > "$OUT/replay-1.log" 2>&1 ||
  { cat "$OUT/replay-1.log" >&2; fail "first-attempt replay exited non-zero"; }

[[ ! -f "$OUT/claude-was-called" ]] || fail "replay spawned an agent"
[[ ! -f "$OUT/sleep.log" ]] || fail "unset DEMO_REPLAY_DELAY still slept"

printf '%s' "${PLAN_1//'{{issue}}'/7}" > "$OUT/expected-plan.txt"
cmp -s "$OUT/expected-plan.txt" "$OUT/issue-comment-1.txt" ||
  fail "replayed plan comment is not the cached plan with the fresh issue number"
printf '%s\n\n---\nCloses #7' "${RESULT_1//'{{issue}}'/7}" > "$OUT/expected-pr-body.txt"
cmp -s "$OUT/expected-pr-body.txt" "$OUT/pr-create-body.txt" ||
  fail "replayed PR body is not the cached result with the fresh issue number"
printf '%s' "${REVIEW_1//'{{issue}}'/7}" > "$OUT/expected-review.txt"
cmp -s "$OUT/expected-review.txt" "$OUT/pr-comment-2.txt" ||
  fail "replayed review comment is not the cached review with the fresh issue number"
grep -q "Reproduced for issue #7." "$OUT/pr-edit-body.txt" ||
  fail "replayed evidence narrative lacks the fresh issue number"
grep -q '{{issue}}' "$OUT/pr-edit-body.txt" && fail "placeholder leaked into the PR evidence body"

git -C "$TMP/origin.git" show "refs/heads/fix/issue-7:demo-app/replay-fix.txt" > "$OUT/first-file.txt" ||
  fail "first attempt's fix file missing on the pushed branch"
[[ "$(cat "$OUT/first-file.txt")" == "certified first fix" ]] ||
  fail "first attempt's fix content wrong"
BRANCH_TREE=$(git -C "$TMP/origin.git" ls-tree -r --name-only refs/heads/fix/issue-7)
grep -q "^evidence/issue-7/before-symptom.png" <<<"$BRANCH_TREE" ||
  fail "cached evidence screenshots not committed under the fresh issue's directory"

# ---- 3. merge the first fix, replay the follow-up with a paced clock --------
git -C "$TMP/repo" checkout -q main
git -C "$TMP/repo" merge -q --no-edit fix/issue-7
git -C "$TMP/repo" push -q origin main

rm -f "$OUT/issue-comments" "$OUT/pr-comments"
( cd "$TMP/repo" && PATH="$TMP/bin:$PATH" STUB_OUT="$OUT" DEMO_REPLAY_DELAY=9 \
    bash harness/run.sh --replay --attempt 2 8 ) > "$OUT/replay-2.log" 2>&1 ||
  { cat "$OUT/replay-2.log" >&2; fail "follow-up replay exited non-zero"; }

git -C "$TMP/origin.git" show "refs/heads/fix/issue-8:demo-app/replay-fix.txt" > "$OUT/second-file.txt" ||
  fail "follow-up fix file missing on the pushed branch"
[[ "$(cat "$OUT/second-file.txt")" == $'certified first fix\ncertified follow-up fix' ]] ||
  fail "follow-up patch did not apply on top of the first fix's merged state"

printf '%s' "${PLAN_2//'{{issue}}'/8}" > "$OUT/expected-plan-2.txt"
cmp -s "$OUT/expected-plan-2.txt" "$OUT/issue-comment-1.txt" ||
  fail "follow-up replay posted the wrong attempt's plan (attempt selection broken)"

# Beats: plan → PR → gate report → review (no evidence in attempt-2), so
# exactly three inter-beat sleeps, each the configured nine seconds.
[[ -f "$OUT/sleep.log" ]] || fail "DEMO_REPLAY_DELAY=9 never slept between beats"
[[ "$(cat "$OUT/sleep.log")" == $'9\n9\n9' ]] ||
  { cat "$OUT/sleep.log" >&2; fail "expected exactly three sleeps of 9s between four beats"; }

echo "replay-mechanics: all assertions green"
