---
name: role-agents
description: How this repo's runner invokes its role agents (planner, fixer, reviewer) and posts their attributed artifacts. Use when changing run.sh's stages, adding a role, debugging a stage failure, or re-certifying after a prompt-shape change.
---

# Role agents: invocation + artifact-posting recipe

The runner (`harness/run.sh`) is a staged pipeline; each stage is one
non-interactive Claude Code call that leaves an attributed artifact on the
system of record. There are no long-lived agents and no agent-to-agent
channel: the runner owns all plumbing, and stage outputs travel through it.

## Invocation pattern (every stage the same)

```bash
(cd "$APP_DIR" && claude -p "$PROMPT" --output-format json) > "$STAGE_JSON"
[[ "$(jq -r '.is_error' "$STAGE_JSON")" == "false" ]] || <fail>
RESULT=$(jq -r '.result' "$STAGE_JSON")
```

- cwd is always `demo-app/` — its `.claude/settings.json` sandbox applies to
  every role, and `docs/` inside it (runbook, coding standards) is the
  retrieval corpus the planner cites.
- `--output-format json` gives `.result` (the artifact text, used verbatim),
  `.session_id` (transcript lookup under `~/.claude/projects/<munged-path>/`),
  `.is_error`. The runner copies each stage's transcript to
  `harness/private/transcript-issue-<n>[-<role>].jsonl` for the audit.
- Role prompts are inline heredocs in `run.sh` (byte-auditable, like the
  original fixer contract). Source texts: `.claude/agents/vendor/` —
  code-architect + debugger shaped the planner, code-reviewer the reviewer.
  Adapt in `run.sh`; never edit the vendored copies.

## Stage order and artifacts

1. **Planner** (read-only by contract): diagnosis + plan + cited sources.
   Posted with `gh issue comment` under the header `## Plan — planner agent`
   **before any commit exists**, then spliced into the fixer prompt as a
   `## Plan from the planner agent` section between the note section and the
   `## Your job` contract — the operator-note mechanism. Same bytes both
   places; `harness/tests/prompt-shape.sh` asserts it.
2. **Fixer**: unchanged contract; its `.result` is the PR body.
3. **Tester** (after the gate report; needs the demo app running on :3000,
   else skips with a warning): two phases — the RUNNER checks out main's
   code under the dev server for the symptom screenshots, then restores the
   branch for the verification screenshots. `claude -p` with `--mcp-config`
   (Playwright, headless chromium, `--output-dir` staging). Evidence lands
   as a second runner-authored commit on the PR branch (`evidence/issue-<n>/`)
   and is embedded in the PR body by commit-pinned raw URL — the gh CLI
   cannot attach images to comments. Failure warns and skips, never aborts.
4. **Reviewer** (last, on the fix branch): one pass, posted with
   `gh pr comment` under `## Review — reviewer agent`, with the original
   report AND the operator note in its prompt — the note is an on-record
   instruction, in scope by definition (learned the hard way; see bugs.md,
   request rehearsal 1, Stage 4). Exactly once, no revision loop.
   Publication has happened, so reviewer failure WARNS and leaves the PR
   unreviewed rather than aborting.

Stage wall clocks land in `harness/private/stages-issue-<n>.json` — the
narration schedule reads them.

## Hard-won rules

- The comment headers are load-bearing: `capture.sh` finds the plan/review
  comments by `startswith("## Plan — planner agent")` /
  `startswith("## Review — reviewer agent")` to cache them for replay.
  Change a header and you must change capture.sh and recapture.
- Any change to a role prompt's shape voids every rehearsal record and makes
  the whole agent-output cache stale as evidence: re-rehearse all scenarios
  live, then recapture the cache from the new certified runs.
- The chat's dispatch route scrapes the LAST `https://github.com/.../pull/N`
  in runner stdout; keep `==> PR ready for review: <url>` as the final line
  and keep `gh pr comment`/`gh issue comment` stdout suppressed
  (`>/dev/null`) so comment URLs never poison the scrape.
- Iterate posting/splice mechanics with `harness/tests/prompt-shape.sh`
  (stubbed `claude`/`gh`, throwaway clone) and `run.sh --replay`; spend live
  runs on certification only.
