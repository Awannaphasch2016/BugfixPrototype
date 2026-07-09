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
- `setup.sh` — pre-demo step after `reset.sh`: runs bug 1 through the pipeline
  and auto-merges its PR, so the demo opens with autofix history in place
  (issue #1 closed, issues #2/#3 open, no open PRs).

## Chat control surface (`chat/`)

A small Next.js app (`npm run dev`, port 4000) standing in for
Slack/Telegram/LINE: the operator commands the pipeline from a chat page
instead of a terminal. Commands `/list-recently-autofixed` and
`/list-unsolved-issues` render cards backed by live GitHub queries; **Fix
this** on an issue card restores the two runtime-dirtied demo-app data files
and runs `run.sh` (one blocking request — the response is the PR card);
**Merge** merges the real PR via `gh` and fast-forwards the local main so the
demo app hot-reloads with the fix. One run at a time; chat state is in-memory
and disposable. GitHub stays the system of record — the chat links to real
issues, PRs, and diffs, never re-renders them.

Route handlers are tested (`cd chat && npm test`) with the runner, `git`, and
`gh` replaced by stub scripts via `CHAT_RUNNER_CMD`/`CHAT_GIT_CMD`/
`CHAT_GH_CMD` (`CHAT_REPO_ROOT` overrides the working directory). The UI has
no automated tests; the rehearsal walkthrough covers it.

## Demo sequence

Fix issues in order (1 → 2 → 3), merging each PR before running the next —
earlier regression tests protect later fixes that share code paths. Bug 1 is
pre-fixed by `setup.sh`; bugs 2 and 3 are dispatched live from the chat.

Per bug: show the symptom in the UI → `/list-unsolved-issues` in the chat →
**Fix this** → walk the autofix lane while the run blocks → PR card arrives →
glance at the PR on GitHub (diagnosis narrative, diff, red→green regression
test) → **Merge** in the chat → show the UI fixed. The full runbook (setup,
choreography, recovery ladder) lives in `harness/private/`.

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
