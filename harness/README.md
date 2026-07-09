# Harness (operator tooling)

The demo pipeline around `demo-app/`. The fixer agent never sees this
directory; this directory owns everything deterministic.

## Scripts

- `run.sh <issue-number>` — the one visible demo action: fetches the issue,
  branches, runs the fixer agent (Claude Code, non-interactive, scoped to
  `demo-app/`), then commits, pushes, and opens the PR itself. Fails cleanly
  (nothing pushed) if the agent errors, changes nothing, or touches files
  outside the app. Agent output and session transcript land in
  `harness/private/` for the rehearsal audit.
- `reset.sh` — rewinds local and GitHub state to the `demo-baseline` tag:
  force-resets main, closes open PRs, deletes `fix/*` branches, reopens the
  bug issues. Run between rehearsals and before the live demo.

## Demo sequence

Fix issues in order (1 → 2 → 3), merging each PR before running the next —
earlier regression tests protect later fixes that share code paths.

Per bug: show the symptom in the UI → show the GitHub issue → `run.sh <n>` →
walk the PR (diagnosis narrative, diff, red→green regression test) → approve &
merge via GitHub review → show the UI fixed.

## Rehearsal ritual (definition of demo-ready, per bug)

1. `reset.sh`
2. confirm the issue is open with its original text
3. `run.sh <n>`
4. PR: regression test red on baseline, green with fix; fix matches the answer
   key in substance
5. transcript audit (`harness/private/transcript-issue-<n>.jsonl`): no reads
   outside `demo-app/`; bug 3 consulted `logs/app.log`; no coverage-gap
   archaeology
6. record the result in `harness/private/bugs.md`

## Isolation

`demo-app/.claude/settings.json` denies reads/edits outside the app directory
and allows only the tools the fix needs (file edits, test runs, log grepping).
Bash side-doors are not airtight by design — the answer key never enters the
repo, so there is nothing to leak.
