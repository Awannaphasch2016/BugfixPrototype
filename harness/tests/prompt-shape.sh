#!/usr/bin/env bash
# Prompt-shape verification for run.sh (the Stage 3 byte-diff pattern,
# extended to the M1 role pipeline). Runs the real runner in a throwaway
# clone with a local bare origin and `claude`/`gh` replaced by stubs, then
# asserts on the composed prompts and posted artifacts:
#
#   1. the planner's output is posted to the issue verbatim (attributed
#      header + plan) BEFORE any commit exists;
#   2. the identical plan text is spliced into the fixer prompt between the
#      note section and the contract (byte-diff);
#   3. the operator note stays alongside, byte-identical, before the plan;
#   4. the reviewer posts exactly one attributed PR comment;
#   5. nothing replays without --replay, and --replay without a cache entry
#      aborts before touching anything.
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

NOTE_TEXT='use green for the text in the todo list'
PLAN_RESULT='## Diagnosis

Stub root cause — with `backticks`, "quotes", $dollars and unicode: α β.

## Plan

Change exactly one thing; test at the route-handler seam.

## Sources consulted

- docs/runbooks/investigating-api-errors.md — "Start with the log": led straight to the handler.'
FIX_RESULT='## Diagnosis

Stub fixer diagnosis.

## Fix

Stub fix.

## Regression test

Stub red-then-green.'
REVIEW_RESULT='### Verdict

Stub verdict: meets the standards. Checked scope, boundary handling, and the regression test.'

# ---- stub claude: dumps each prompt, answers canned JSON per call order ----
export STUB_OUT="$OUT"
cat > "$TMP/bin/claude" <<STUB
#!/usr/bin/env bash
set -euo pipefail
N_FILE="\$STUB_OUT/claude-calls"
N=\$(( \$(cat "\$N_FILE" 2>/dev/null || echo 0) + 1 ))
echo "\$N" > "\$N_FILE"
PROMPT="\$2"
case "\$N" in
  1) printf '%s' "\$PROMPT" > "\$STUB_OUT/planner-prompt.txt"
     jq -n --arg r "\$(cat "\$STUB_OUT/plan-result.txt")" \
       '{is_error:false, result:\$r, session_id:"stub-planner"}' ;;
  2) printf '%s' "\$PROMPT" > "\$STUB_OUT/fixer-prompt.txt"
     echo "// stub change" > stub-change.ts
     jq -n --arg r "\$(cat "\$STUB_OUT/fix-result.txt")" \
       '{is_error:false, result:\$r, session_id:"stub-fixer"}' ;;
  3) printf '%s' "\$PROMPT" > "\$STUB_OUT/reviewer-prompt.txt"
     jq -n --arg r "\$(cat "\$STUB_OUT/review-result.txt")" \
       '{is_error:false, result:\$r, session_id:"stub-reviewer"}' ;;
  *) echo "stub claude: unexpected call \$N" >&2; exit 1 ;;
esac
STUB
printf '%s' "$PLAN_RESULT"   > "$OUT/plan-result.txt"
printf '%s' "$FIX_RESULT"    > "$OUT/fix-result.txt"
printf '%s' "$REVIEW_RESULT" > "$OUT/review-result.txt"

# ---- stub gh: canned issue, records comments + the HEAD at comment time ----
cat > "$TMP/bin/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
echo "gh $*" >> "$STUB_OUT/gh.log"
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
    printf '%s' "$5" > "$STUB_OUT/issue-comment-$N.txt"
    git rev-parse HEAD > "$STUB_OUT/head-at-comment-$N.txt" ;;
  "pr create")
    echo "https://github.com/stub/stub/pull/99" ;;
  "pr comment")
    N_FILE="$STUB_OUT/pr-comments"; N=$(( $(cat "$N_FILE" 2>/dev/null || echo 0) + 1 ))
    echo "$N" > "$N_FILE"
    printf '%s' "$5" > "$STUB_OUT/pr-comment-$N.txt" ;;
  *) echo "gh stub: unexpected args: $*" >&2; exit 1 ;;
esac
STUB
# ---- stub npm: gates always green, with a parseable suite line -------------
cat > "$TMP/bin/npm" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
echo "npm $*" >> "$STUB_OUT/npm.log"
case "$*" in
  test)
    if [[ -f "$STUB_OUT/fail-tests" ]]; then
      printf ' Test Files  1 failed (1)\n      Tests  1 failed | 10 passed (11)\n'
      exit 1
    fi
    printf ' Test Files  1 passed (1)\n      Tests  11 passed (11)\n' ;;
  "run lint") : ;;
  *) echo "npm stub: unexpected args: $*" >&2; exit 1 ;;
esac
STUB
chmod +x "$TMP/bin/claude" "$TMP/bin/gh" "$TMP/bin/npm"

# ---- throwaway world: bare origin + clone ----------------------------------
git clone -q --bare "$REPO_ROOT" "$TMP/origin.git"
git clone -q "$TMP/origin.git" "$TMP/repo"
git -C "$TMP/repo" config user.email "prompt-shape-test@local"
git -C "$TMP/repo" config user.name "prompt-shape-test"
# test the runner as it stands in the working tree, not as last committed
cp "$REPO_ROOT/harness/run.sh" "$TMP/repo/harness/run.sh"
git -C "$TMP/repo" add harness/run.sh
git -C "$TMP/repo" -c commit.gpgsign=false commit -qm "prompt-shape: runner under test" --no-verify --allow-empty
git -C "$TMP/repo" push -q origin main
BASELINE_SHA=$(git -C "$TMP/repo" rev-parse HEAD)

fail() { echo "FAIL: $1" >&2; exit 1; }

# ---- run the real runner under the stubs -----------------------------------
# TESTER_APP_URL points at a dead port: the tester stage must skip cleanly
# when no app is running (and must never spawn a browser in this test).
( cd "$TMP/repo" && PATH="$TMP/bin:$PATH" STUB_OUT="$OUT" \
    TESTER_APP_URL="http://127.0.0.1:9" \
    bash harness/run.sh 7 "$NOTE_TEXT" ) > "$OUT/run.log" 2>&1 ||
  { cat "$OUT/run.log" >&2; fail "run.sh exited non-zero"; }
grep -q "tester stage skipped" "$OUT/run.log" ||
  fail "tester stage should skip when the app is unreachable"

# 1. plan comment: attributed header + byte-identical plan, posted pre-commit
[[ "$(cat "$OUT/issue-comments")" == "1" ]] || fail "expected exactly one issue comment"
printf '## Plan — planner agent\n\n%s' "$PLAN_RESULT" > "$OUT/expected-plan-comment.txt"
cmp -s "$OUT/expected-plan-comment.txt" "$OUT/issue-comment-1.txt" ||
  fail "plan comment is not byte-identical to the planner output"
[[ "$(cat "$OUT/head-at-comment-1.txt")" == "$BASELINE_SHA" ]] ||
  fail "plan comment was posted after a commit already existed"

# 2. the same plan text rode the fixer prompt (byte-diff of the spliced section)
python3 - "$OUT" <<'PY'
import sys, pathlib
out = pathlib.Path(sys.argv[1])
prompt = (out / "fixer-prompt.txt").read_text()
plan = (out / "plan-result.txt").read_text()
head = "## Plan from the planner agent\n\n"
tail = "\n\nVerify this diagnosis against the code as you work; the contract below still governs.\n\n## Your job"
start = prompt.find(head)
end = prompt.find(tail)
assert start != -1, "plan section header missing from fixer prompt"
assert end != -1, "plan section trailer/contract missing from fixer prompt"
spliced = prompt[start + len(head):end]
assert spliced == plan, "spliced plan text differs from planner output"
note = "## Note from the team\n\nuse green for the text in the todo list\n\n"
npos = prompt.find(note)
assert npos != -1, "note section missing or not byte-identical"
assert npos < start, "note section must precede the plan section"
bug = "## Bug report (issue #7): Stub bug title\n\nStub bug body line.\n"
assert prompt.find(bug) != -1, "bug report section missing from fixer prompt"
assert prompt.find(bug) < npos, "bug report must precede the note section"
PY
[[ $? -eq 0 ]] || fail "fixer prompt splice assertions"

# 3. planner prompt carries the bug report and the read-only contract
grep -q "## Bug report (issue #7): Stub bug title" "$OUT/planner-prompt.txt" ||
  fail "planner prompt lacks the bug report"
grep -q "Make NO changes" "$OUT/planner-prompt.txt" ||
  fail "planner prompt lacks the read-only contract"

# 4. PR comments: the gate report first, then exactly one attributed review
[[ "$(cat "$OUT/pr-comments")" == "2" ]] || fail "expected gate report + review = two PR comments"
grep -q "^## Gates — runner" "$OUT/pr-comment-1.txt" || fail "first PR comment is not the gate report"
grep -q "Suite with the fix: Tests 11 passed (11)" "$OUT/pr-comment-1.txt" ||
  fail "gate report lacks the parsed suite line"
grep -q "presentational exception" "$OUT/pr-comment-1.txt" ||
  fail "gate report lacks the regression line (stub change has no test files)"
printf '## Review — reviewer agent\n\n%s' "$REVIEW_RESULT" > "$OUT/expected-review-comment.txt"
cmp -s "$OUT/expected-review-comment.txt" "$OUT/pr-comment-2.txt" ||
  fail "review comment is not byte-identical to the reviewer output"
grep -q '```diff' "$OUT/reviewer-prompt.txt" || fail "reviewer prompt lacks the diff"
grep -q "## The original report (issue #7): Stub bug title" "$OUT/reviewer-prompt.txt" ||
  fail "reviewer prompt lacks the original report"
grep -q "## Note from the team" "$OUT/reviewer-prompt.txt" ||
  fail "reviewer prompt lacks the operator note"
grep -q "use green for the text in the todo list" "$OUT/reviewer-prompt.txt" ||
  fail "reviewer prompt note text not verbatim"

# 5. a gate failure aborts before push: rerun with failing tests and assert
#    the remote branch is exactly what run 1 pushed (nothing new published)
BRANCH_SHA_BEFORE=$(git -C "$TMP/origin.git" rev-parse refs/heads/fix/issue-7)
rm -f "$OUT/claude-calls"
touch "$OUT/fail-tests"
if ( cd "$TMP/repo" && PATH="$TMP/bin:$PATH" STUB_OUT="$OUT" \
      bash harness/run.sh 7 "$NOTE_TEXT" ) > "$OUT/gate-fail.log" 2>&1; then
  fail "run.sh should abort when the test gate is red"
fi
grep -q "gate failed: test suite red" "$OUT/gate-fail.log" || fail "gate abort message missing"
[[ "$(git -C "$TMP/origin.git" rev-parse refs/heads/fix/issue-7)" == "$BRANCH_SHA_BEFORE" ]] ||
  fail "gate failure still pushed to origin"
rm -f "$OUT/fail-tests"

# 6. no silent replay; --replay without a cache aborts clean
grep -q "REPLAY" "$OUT/run.log" && fail "normal dispatch mentioned replay"
if ( cd "$TMP/repo" && PATH="$TMP/bin:$PATH" STUB_OUT="$OUT" \
      bash harness/run.sh --replay 7 ) > "$OUT/replay.log" 2>&1; then
  fail "--replay with no cache entry should abort"
fi
grep -q "no cache entry" "$OUT/replay.log" || fail "--replay abort lacks the cache message"

echo "prompt-shape: all assertions green"
