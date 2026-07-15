#!/usr/bin/env bash
# Replay and capture mechanics for stage 4b (the Stage 3 stubbed-commands
# pattern: the real runner in a throwaway clone with a local bare origin,
# gh/npm/sleep stubbed, claude poisoned). Asserts:
#
#   1. coherence (harness/cache-coherence.sh): a dirty artifact — foreign
#      issue number (prose or URL form), commit sha, or date — fails with a
#      message naming the offending line; a clean artifact's own issue
#      number (prose and URL forms) is normalized to the {{issue}}
#      placeholder, in .md prose and in result.json's .result, and hex
#      colors pass;
#   2. replay of a first attempt posts every cached artifact with the fresh
#      issue number substituted into the placeholder, applies the cached
#      patch, and never invokes an agent;
#   3. replay of a follow-up attempt (--attempt 2) applies on top of the
#      first fix's merged state;
#   4. beats are separated by the configured DEMO_REPLAY_DELAY; unset means
#      no sleeps at all;
#   5. setup.sh's pre-run obeys the one switch: --replay with DEMO_REPLAY
#      set, live without it.
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
printf '## Plan — planner agent\n\nSee the earlier fix in #12 for context.\n\nAlso https://github.com/acme/demo/pull/34 discusses it.\n' > "$DIRTY/plan.md"
printf '## Review — reviewer agent\n\nMatches commit 3abe4e0dead in spirit.\n' > "$DIRTY/review.md"
jq -n '{is_error:false, result:"## Diagnosis\n\nBroken since 2031-01-02."}' > "$DIRTY/result.json"
if "$COHERENCE" "$DIRTY" 7 > "$OUT/coherence-dirty.log" 2>&1; then
  fail "coherence accepted a dirty entry"
fi
grep -q "issue number.*plan.md line 3" "$OUT/coherence-dirty.log" ||
  fail "coherence did not name the foreign issue number's file and line"
grep -q "issue number.*plan.md line 5" "$OUT/coherence-dirty.log" ||
  fail "coherence did not catch the URL-form tracker reference"
grep -q "commit sha.*review.md line 3" "$OUT/coherence-dirty.log" ||
  fail "coherence did not name the sha's file and line"
grep -q "date.*result.json:.result line 3" "$OUT/coherence-dirty.log" ||
  fail "coherence did not name the date's line in result.json"

CLEAN="$TMP/clean-entry"
mkdir -p "$CLEAN/evidence"
printf '## Plan — planner agent\n\nRoot cause of issue 7, reported as #7.\n\nFiled as https://github.com/acme/demo/issues/7; the accent is #22c55e.\n' > "$CLEAN/plan.md"
printf '### Symptom\n\nShots for issue-7 attached.\n' > "$CLEAN/evidence/evidence.md"
jq -n '{is_error:false, result:"## Diagnosis\n\nThe defect behind issue #7."}' > "$CLEAN/result.json"
"$COHERENCE" "$CLEAN" 7 > "$OUT/coherence-clean.log" 2>&1 ||
  { cat "$OUT/coherence-clean.log" >&2; fail "coherence rejected a clean entry (own refs + hex color must pass)"; }
grep -q 'issue {{issue}}, reported as #{{issue}}' "$CLEAN/plan.md" ||
  fail "own issue number not normalized in plan.md"
grep -q 'issues/{{issue}}; the accent is #22c55e' "$CLEAN/plan.md" ||
  fail "own issue URL not normalized (or the hex color was mangled)"
grep -q 'issue-{{issue}}' "$CLEAN/evidence/evidence.md" ||
  fail "own issue-N reference not normalized in evidence.md"
[[ "$(jq -r '.result' "$CLEAN/result.json")" == $'## Diagnosis\n\nThe defect behind issue #{{issue}}.' ]] ||
  fail "own issue number not normalized inside result.json's .result"

# Follow-up entry: the full replay-variable set (ADR-0005) normalizes —
# precedent number, precedent sha, run date, firing reqId — while a
# frozen-world date (derived from the committed baseline log) passes the
# lint untouched.
FROZEN_EPOCH=$(git -C "$REPO_ROOT" show demo-baseline:demo-app/logs/app.log |
  grep -oP '"time":\K[0-9]{10,13}' | head -1)
[[ -n "$FROZEN_EPOCH" ]] || fail "baseline log carries no epoch timestamps to derive a frozen date from"
FROZEN_DATE=$(date -u -d "@${FROZEN_EPOCH:0:10}" +%F)
FUP="$TMP/followup-entry"
mkdir -p "$FUP"
printf '## Plan — planner agent\n\nBuilds on issue 9 (#9, https://github.com/acme/demo/issues/9): commit deadbee1234 landed 2026-06-30.\nThe firing (reqId rq7fresh, 2026-06-30) differs from the %s noise.\n' \
  "$FROZEN_DATE" > "$FUP/plan.md"
jq -n '{is_error:false, result:"Fix for issue #10 atop #9."}' > "$FUP/result.json"
"$COHERENCE" "$FUP" 10 --precedent 9 --precedent-shas deadbee1234f00d \
  --run-date 2026-06-30 --firing-reqid rq7fresh > "$OUT/coherence-fup.log" 2>&1 ||
  { cat "$OUT/coherence-fup.log" >&2; fail "coherence rejected a follow-up entry whose stale refs are all replay variables"; }
grep -q 'issue {{precedent}} (#{{precedent}}, https://github.com/acme/demo/issues/{{precedent}}): commit {{precedent_sha}} landed {{today}}' "$FUP/plan.md" ||
  fail "precedent number/sha/run-date not normalized to replay variables"
grep -q 'reqId {{fresh_reqid}}, {{today}}' "$FUP/plan.md" ||
  fail "firing reqId not normalized to {{fresh_reqid}}"
grep -q "$FROZEN_DATE noise" "$FUP/plan.md" ||
  fail "frozen-world date was rewritten — it must stay verbatim"
[[ "$(jq -r '.result' "$FUP/result.json")" == "Fix for issue #{{issue}} atop #{{precedent}}." ]] ||
  fail "own/precedent numbers not normalized inside the follow-up's result.json"

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
      *"-q .body")
        # Body shaped like a signal issue's: precedent link + firing line, so
        # replay-variable resolution has its sources. Harmless extra context
        # for entries that use no variables.
        printf 'Stub bug body line.\n\n**Problem class:** `class:stub` — precedent: [#9](https://github.com/acme/demo/issues/9), fixed by a merged PR.\n\n{"level":50,"reqId":"rq7fresh","msg":"stub signature"}\n' ;;
      *) echo "gh stub: unexpected issue view: $*" >&2; exit 1 ;;
    esac ;;
  "pr view")
    # replay's {{precedent_sha}} resolution: gh applies --jq itself, so the
    # stub emits the post-jq value (the precedent fix commit's full oid).
    echo "deadbee1f00d1234deadbee1f00d1234deadbee1" ;;
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
  "issue list")
    echo '[{"number":7,"title":"Stub bug title"}]' ;;
  "label list")
    printf 'autofixed\nclass:list-filter\n' ;;
  "pr list")
    # merged query = replay resolving the precedent's fix PR; open query =
    # setup.sh finding the pre-run's PR. Post-jq values, as above.
    if [[ "$*" == *"--state merged"* ]]; then echo "77"; else echo "99"; fi ;;
  "pr merge") : ;;
  "issue edit") : ;;
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

PLAN_2=$'## Plan — planner agent\n\nFollow-up plan for issue #{{issue}}, on top of #{{precedent}} (commit {{precedent_sha}}); the firing (reqId {{fresh_reqid}}) landed {{today}}.'
REVIEW_2=$'## Review — reviewer agent\n\n### Verdict\n\nFollow-up meets the standards for issue #{{issue}}; scoped to the {{fresh_reqid}} firing.'
RESULT_2=$'## Diagnosis\n\nFollow-up diagnosis for issue #{{issue}}, building on #{{precedent}}.\n\n## Fix\n\nThe follow-up fix.\n\n## Regression test\n\nRed-then-green again.'
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

# Every replay variable resolved from the fresh cycle's record: issue 8 from
# the dispatch, precedent 9 + firing reqId from the stub issue body, the sha
# from the stubbed precedent-PR lookup (cut to 7), today from the clock.
fill_expected() {
  local s="$1"
  s=${s//'{{issue}}'/8}
  s=${s//'{{precedent}}'/9}
  s=${s//'{{precedent_sha}}'/deadbee}
  s=${s//'{{fresh_reqid}}'/rq7fresh}
  s=${s//'{{today}}'/$(date -u +%F)}
  printf '%s' "$s"
}
fill_expected "$PLAN_2" > "$OUT/expected-plan-2.txt"
cmp -s "$OUT/expected-plan-2.txt" "$OUT/issue-comment-1.txt" ||
  { diff "$OUT/expected-plan-2.txt" "$OUT/issue-comment-1.txt" >&2 || true
    fail "follow-up plan not posted with every replay variable resolved"; }
fill_expected "$REVIEW_2" > "$OUT/expected-review-2.txt"
cmp -s "$OUT/expected-review-2.txt" "$OUT/pr-comment-2.txt" ||
  fail "follow-up review not posted with every replay variable resolved"
grep -rq '{{' "$OUT/pr-create-body.txt" && fail "unresolved variable leaked into the follow-up PR body"

# Beats: plan → PR → gate report → review (no evidence in attempt-2), so
# exactly three inter-beat sleeps, each the configured nine seconds.
[[ -f "$OUT/sleep.log" ]] || fail "DEMO_REPLAY_DELAY=9 never slept between beats"
[[ "$(cat "$OUT/sleep.log")" == $'9\n9\n9' ]] ||
  { cat "$OUT/sleep.log" >&2; fail "expected exactly three sleeps of 9s between four beats"; }

# ---- 4. setup.sh obeys the one switch --------------------------------------
# The runner is swapped for a logging stub: the assertion is exactly which
# argv setup's pre-run composes under each switch state, nothing more.
cp "$REPO_ROOT/harness/setup.sh" "$TMP/repo/harness/setup.sh"
mkdir -p "$TMP/repo/harness/private/issues"
printf 'Stub bug title\n\nStub bug body line.\n' > "$TMP/repo/harness/private/issues/bug-1.md"
cat > "$TMP/repo/harness/run.sh" <<'STUB'
#!/usr/bin/env bash
echo "run.sh $*" >> "$STUB_OUT/runner.log"
echo "==> PR ready for review: https://github.com/stub/stub/pull/99"
STUB
chmod +x "$TMP/repo/harness/run.sh"

( cd "$TMP/repo" && PATH="$TMP/bin:$PATH" STUB_OUT="$OUT" DEMO_REPLAY=1 \
    bash harness/setup.sh ) > "$OUT/setup-replay.log" 2>&1 ||
  { cat "$OUT/setup-replay.log" >&2; fail "setup.sh exited non-zero with the switch on"; }
grep -qx "run.sh --replay 7" "$OUT/runner.log" ||
  fail "setup with the switch on did not replay the pre-run"

( cd "$TMP/repo" && PATH="$TMP/bin:$PATH" STUB_OUT="$OUT" \
    bash harness/setup.sh ) > "$OUT/setup-live.log" 2>&1 ||
  { cat "$OUT/setup-live.log" >&2; fail "setup.sh exited non-zero with the switch off"; }
grep -qx "run.sh 7" "$OUT/runner.log" ||
  fail "setup with the switch off did not run live (leg 1's capture path)"

echo "replay-mechanics: all assertions green"
