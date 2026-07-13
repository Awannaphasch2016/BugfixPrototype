#!/usr/bin/env bash
# One-shot fixer runner: GitHub issue number in, open PR out.
#
#   harness/run.sh [--replay] <issue-number> [note]
#
# The optional note is the operator's judgment, already posted to the issue as
# a comment by the dispatcher. It is spliced into the fixed prompt as a "note
# from the team" section — added context between the bug report and the
# contract, never a replacement for either.
#
# --replay applies the agent-output cache entry for the issue's title
# (harness/private/cache/, written by harness/capture.sh) instead of spawning
# the fixer; branch, commit, push, PR, and everything downstream run for real.
# A build-time iteration and pre-run tool only: replay never certifies, and a
# replayed run is never presented as live. Nothing replays without this flag.
#
# The agent only diagnoses, tests, and fixes inside $APP_DIR. This script owns
# every git operation (branch, commit, push, PR) so no plumbing step depends on
# the agent. Exits non-zero without pushing anything if the agent fails.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="demo-app" # config point: the directory the fixer agent is scoped to
cd "$REPO_ROOT"

REPLAY=0
if [[ "${1-}" == "--replay" ]]; then
  REPLAY=1
  shift
fi

ISSUE="${1:?usage: harness/run.sh [--replay] <issue-number> [note]}"
NOTE="${2-}"

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

# A note becomes its own section between the bug report and the contract, so
# it reads as reporting context and the binding rules stay last. No note, no
# section: the prompt is byte-identical to the rehearsed one.
NOTE_SECTION=""
if [[ -n "$NOTE" ]]; then
  NOTE_SECTION="## Note from the team

$NOTE

"
fi

mkdir -p harness/private
RESULT_JSON="harness/private/run-issue-$ISSUE.json"
PLANNER_SECS=0
FIXER_SECS=0
REVIEWER_SECS=0

# Copy a stage's session transcript into the answer key for the rehearsal
# audit: save_transcript <result-json> <destination-suffix>
save_transcript() {
  local session_id transcript
  session_id=$(jq -r '.session_id' "$1")
  transcript="$HOME/.claude/projects/$(echo "$REPO_ROOT/$APP_DIR" | tr '/.' '--')/$session_id.jsonl"
  if [[ -f "$transcript" ]]; then
    cp "$transcript" "harness/private/transcript-issue-$ISSUE$2.jsonl"
  else
    echo "WARNING: session transcript not found at $transcript — rehearsal audit will lack it" >&2
  fi
}

# ---- planner stage --------------------------------------------------------
# Role adapted from the vendored code-architect (blueprint shape) and debugger
# (root-cause contract) templates — .claude/agents/vendor/. Read-only by
# contract; the sandbox settings in demo-app/.claude/ apply as ever.
PLAN_SECTION=""
if (( ! REPLAY )); then
  PLANNER_PROMPT=$(cat <<EOF
You are the planner in a pipeline that fixes reported bugs in this task-management app: a read-only diagnostician whose blueprint a separate implementer executes. This directory is the entire application.

## Bug report (issue #$ISSUE): $TITLE

$BODY

${NOTE_SECTION}## Your job

1. Investigate and find the root cause. Consult the project documentation in docs/ (the runbook's investigation method, the coding standards) and follow where it applies. Read the code; if the report mentions application logs, interrogate them (grep, jq) and correlate what you find with the code paths involved.
2. Not every report is a defect. If the report — together with any note from the team — asks for a change of preference or presentation rather than describing broken behavior, your diagnosis is what the current code does today and your plan is the smallest change that honors exactly what was asked. Do not go hunting for an underlying defect that is not there, and do not plan changes on axes nobody asked about.
3. Be decisive: one diagnosis, with the evidence (files, line references, exact log lines if logs were involved).
4. Plan the smallest correct fix: which file(s) to change and how, and the regression test at the API route-handler seam that will fail against the current code for the reported reason and pass with the fix. Exception: if the fix is purely presentational (styling only — no API route's behavior changes), plan no test and say why no route-level test can capture the change.
5. Make NO changes: do not edit files, do not create files, do not run git. Reading, grepping, and running the existing test suite are fine.

When you are done, your final reply must be pure markdown, with no preamble or closing remarks around it:
- "## Diagnosis" — the root cause and how the evidence points to it
- "## Plan" — the fix and the regression test, concretely
- "## Sources consulted" — the documentation section(s) that genuinely guided the investigation, each as the file path plus heading and one line on what it contributed; if none did, say so plainly
EOF
)

  PLAN_JSON="harness/private/plan-issue-$ISSUE.json"
  echo "==> [planner] diagnosing issue #$ISSUE: $TITLE"
  STAGE_T0=$SECONDS
  (cd "$APP_DIR" && claude -p "$PLANNER_PROMPT" --output-format json) > "$PLAN_JSON" ||
    abort "planner exited non-zero (see $PLAN_JSON)"
  PLANNER_SECS=$((SECONDS - STAGE_T0))
  [[ "$(jq -r '.is_error' "$PLAN_JSON")" == "false" ]] ||
    abort "planner reported an error (see $PLAN_JSON)"
  PLAN=$(jq -r '.result' "$PLAN_JSON")
  [[ -n "$PLAN" && "$PLAN" != "null" ]] || abort "planner returned no plan"
  save_transcript "$PLAN_JSON" "-planner"

  # The same text lands on the record and in the fixer's prompt: posted to the
  # issue as the attributed plan comment (before any commit exists), spliced
  # additively into the fixer prompt below.
  gh issue comment "$ISSUE" \
    --body "$(printf '## Plan — planner agent\n\n%s' "$PLAN")" >/dev/null ||
    abort "could not post the plan comment to issue #$ISSUE"
  echo "==> [planner] plan posted to issue #$ISSUE (${PLANNER_SECS}s)"

  PLAN_SECTION="## Plan from the planner agent

$PLAN

Verify this diagnosis against the code as you work; the contract below still governs.

"
fi

PROMPT=$(cat <<EOF
You are a senior engineer fixing a reported bug in this task-management app. This directory is the entire application.

## Bug report (issue #$ISSUE): $TITLE

$BODY

${NOTE_SECTION}${PLAN_SECTION}## Your job

1. Investigate and find the root cause. Read the code; if the report mentions application logs, interrogate them (grep, jq) and correlate what you find with the code paths involved.
2. Write a regression test at the API route-handler seam (Vitest, alongside the existing tests in tests/) that reproduces the reported behavior. Run it and confirm it FAILS against the current code for the reported reason. Exception: if the fix is purely presentational (styling only — no API route's behavior changes), write no new test; instead your "## Regression test" section must explain in one or two sentences why no route-level test can capture the change.
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

# ---- fixer stage ----------------------------------------------------------
if (( REPLAY )); then
  # Replay: canned agents, real everything-else. The cache is keyed by
  # answer-key bug title, so the fresh cycle's issue number doesn't matter.
  SLUG=$(printf '%s' "$TITLE" | tr '[:upper:]' '[:lower:]' |
    sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')
  CACHE_DIR="harness/private/cache/$SLUG"
  [[ -f "$CACHE_DIR/fix.patch" && -f "$CACHE_DIR/result.json" ]] ||
    abort "no cache entry for \"$TITLE\" — capture a certified run with harness/capture.sh"
  [[ -z "$NOTE" ]] ||
    echo "WARNING: replay composes no prompt — the note is ignored here (it was already posted to the issue by the dispatcher)" >&2

  echo "==> REPLAY on issue #$ISSUE: $TITLE — cached fix, no agent (never present as live)"
  if [[ -f "$CACHE_DIR/plan.md" ]]; then
    gh issue comment "$ISSUE" --body "$(cat "$CACHE_DIR/plan.md")" >/dev/null ||
      abort "could not post the cached plan comment to issue #$ISSUE"
    echo "==> REPLAY: cached plan comment posted to issue #$ISSUE"
  else
    echo "WARNING: cache entry has no plan.md — planner artifact skipped in replay" >&2
  fi
  git apply --3way "$CACHE_DIR/fix.patch" || abort "cached patch failed to apply"
  cp "$CACHE_DIR/result.json" "$RESULT_JSON"
  PR_BODY=$(jq -r '.result' "$RESULT_JSON")
  [[ -n "$PR_BODY" && "$PR_BODY" != "null" ]] || abort "cache entry has no PR body"

  if [[ -f "$CACHE_DIR/transcript.jsonl" ]]; then
    cp "$CACHE_DIR/transcript.jsonl" "harness/private/transcript-issue-$ISSUE.jsonl"
  else
    echo "WARNING: cache entry has no transcript — downstream trace artifacts will lack it" >&2
  fi
else
  echo "==> [fixer] implementing fix for issue #$ISSUE: $TITLE"
  STAGE_T0=$SECONDS
  (cd "$APP_DIR" && claude -p "$PROMPT" --output-format json) > "$RESULT_JSON" ||
    abort "agent exited non-zero (see $RESULT_JSON)"
  FIXER_SECS=$((SECONDS - STAGE_T0))

  [[ "$(jq -r '.is_error' "$RESULT_JSON")" == "false" ]] ||
    abort "agent reported an error (see $RESULT_JSON)"
  PR_BODY=$(jq -r '.result' "$RESULT_JSON")
  [[ -n "$PR_BODY" && "$PR_BODY" != "null" ]] || abort "agent returned no summary"

  # keep the session transcript for the rehearsal audit
  save_transcript "$RESULT_JSON" ""
  echo "==> [fixer] done (${FIXER_SECS}s)"
fi

# The agent's test runs append to the runtime files (tests isolate TASKS_FILE
# but the logger writes to the real logs/app.log). That's run exhaust, never
# part of a fix — restore both so it can't ride into the PR.
git checkout -q -- "$APP_DIR/data/tasks.json" "$APP_DIR/logs/app.log"

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
PR_NUMBER="${PR_URL##*/}"

# ---- reviewer stage --------------------------------------------------------
# One post-hoc pass, findings posted as a PR comment to inform the human merge
# decision; no revision loop (roadmap, trust-gated). Role adapted from the
# vendored code-reviewer template. The PR is already published, so a reviewer
# failure warns instead of aborting — the dispatch still ends with a real PR.
REVIEW_COMMENT=""
if (( REPLAY )); then
  if [[ -f "$CACHE_DIR/review.md" ]]; then
    REVIEW_COMMENT=$(cat "$CACHE_DIR/review.md")
  else
    echo "WARNING: cache entry has no review.md — reviewer artifact skipped in replay" >&2
  fi
else
  DIFF=$(git diff "main...$BRANCH" -- "$APP_DIR")
  REVIEWER_PROMPT=$(cat <<EOF
You are the reviewer in a pipeline that fixes reported bugs in this task-management app: one post-hoc pass over a just-opened PR, informing the human who decides whether to merge. You report; you never change code, and there is no revision loop. This directory is the entire application, already containing the change under review.

## The original report (issue #$ISSUE): $TITLE

$BODY

${NOTE_SECTION}## The PR under review

$PR_BODY

## The diff

\`\`\`diff
$DIFF
\`\`\`

## Your job

1. Judge the change against the original report, the note, and the project documentation in docs/ (coding standards, the runbook's testing conventions), and for actual defects: logic errors, missed edge cases at the API boundary, a regression test that would still pass if the bug were reintroduced differently, scope creep beyond what the report and note asked for. The note from the team, when present, is an instruction the operator put on the record at dispatch: a change it explicitly requested is in scope by definition — judge whether the diff honors it with the smallest change, never whether it should have been requested.
2. Read whatever code you need for context; run the test suite if it sharpens a finding. Do not edit files; do not run git.
3. Rate each candidate issue 0-100 confidence and report ONLY issues at 80 or above, grouped Critical (90-100) and Important (80-89), each with file, line, why it matters, and a concrete fix. If nothing clears the bar, confirm the change meets the standards in two or three sentences naming what you checked.

Your final reply is posted verbatim as a PR comment: pure markdown, starting with a "### Verdict" line (one sentence), then your findings or confirmation, with no preamble or closing remarks around it.
EOF
)

  REVIEW_JSON="harness/private/review-issue-$ISSUE.json"
  echo "==> [reviewer] reviewing PR #$PR_NUMBER"
  STAGE_T0=$SECONDS
  if (cd "$APP_DIR" && claude -p "$REVIEWER_PROMPT" --output-format json) > "$REVIEW_JSON" &&
    [[ "$(jq -r '.is_error' "$REVIEW_JSON")" == "false" ]]; then
    REVIEWER_SECS=$((SECONDS - STAGE_T0))
    REVIEW_BODY=$(jq -r '.result' "$REVIEW_JSON")
    if [[ -n "$REVIEW_BODY" && "$REVIEW_BODY" != "null" ]]; then
      REVIEW_COMMENT=$(printf '## Review — reviewer agent\n\n%s' "$REVIEW_BODY")
    fi
    save_transcript "$REVIEW_JSON" "-reviewer"
  fi
  [[ -n "$REVIEW_COMMENT" ]] ||
    echo "WARNING: reviewer stage failed (see $REVIEW_JSON) — PR #$PR_NUMBER stands unreviewed" >&2
fi
if [[ -n "$REVIEW_COMMENT" ]]; then
  if gh pr comment "$PR_NUMBER" --body "$REVIEW_COMMENT" >/dev/null; then
    echo "==> [reviewer] findings posted to PR #$PR_NUMBER (${REVIEWER_SECS}s)"
  else
    echo "WARNING: could not post the review comment — PR #$PR_NUMBER stands unreviewed" >&2
  fi
fi

# The reviewer's test runs dirty the runtime files exactly like the fixer's
# did — restore them so a bare run.sh finds a clean tree next time.
git checkout -q -- "$APP_DIR/data/tasks.json" "$APP_DIR/logs/app.log"

# Stage wall clocks feed the narration schedule (what the operator shows
# during each wait).
jq -n --argjson planner "$PLANNER_SECS" --argjson fixer "$FIXER_SECS" \
  --argjson reviewer "$REVIEWER_SECS" --argjson replay "$REPLAY" \
  '{planner: $planner, fixer: $fixer, reviewer: $reviewer, replay: ($replay == 1)}' \
  > "harness/private/stages-issue-$ISSUE.json"

git checkout -q main
echo "==> PR ready for review: $PR_URL"
