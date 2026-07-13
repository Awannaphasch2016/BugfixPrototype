---
name: demo-ops
description: The demo world's operational ritual — setup, reset, rehearsal, certification, recovery, rebaseline discipline. Use when preparing a demo cycle, rehearsing scenes, recovering from a mid-demo failure, or moving the demo-baseline tag.
---

# Demo ops: the ritual, the ladder, the disciplines

The demo world lives on the `demo-baseline` tag and is rebuilt from it every
cycle. GitHub is the system of record (ADR-0001); the answer key and all
rehearsal records live in `harness/private/` (gitignored — specifics like
scene narration and rehearsed note text live there, never here).

## Setup, in order (fresh machine or fresh demo day)

1. `harness/install.sh` — every download happens here, never on demo day:
   Presidio + spaCy model, claude-code-log, Playwright MCP browser, docker
   images for the observability stack.
2. `harness/reset.sh` — rewind to `demo-baseline`, retire the old cycle,
   file the fresh issues.
3. `harness/setup.sh` — bug 1 pre-run and auto-merged (seeds the autofix
   lane badge and its problem-class label — the visible precedent ledger).
4. Start the surfaces: demo app (`cd demo-app && npm run dev`, :3000), chat
   (`cd harness/chat && npm run dev`, :4000), observability
   (`harness/observability/up.sh`, Grafana :3001).
5. Opening inventory per the private runbook.

## The rehearsal ritual (definition of demo-ready, per scenario)

reset → run with the exact demo-day configuration → audit → record in
`harness/private/bugs.md`. The Stage 4 audit covers the role artifacts:

- plan comment on the issue BEFORE any commit, citing the docs corpus
- the same plan text spliced in the fixer prompt (mechanics guaranteed by
  `harness/tests/prompt-shape.sh`; the live audit checks presence)
- gate report on the PR with the red-on-baseline → green line
- tester before/after screenshots in the PR body (when the app was up)
- reviewer commented exactly once; planner/tester transcripts show no writes
- stage wall clocks recorded (`harness/private/stages-issue-<n>.json`) —
  they feed the narration schedule

## Hard rules

- **Certification is always live.** Replay (`run.sh --replay`) is for
  build-time iteration and pre-runs only; a replayed run is never presented
  as live, and never certifies.
- **Any prompt-shape change voids everything**: all rehearsal records and
  the whole agent-output cache become stale as evidence. Re-rehearse every
  scenario, then recapture (`harness/capture.sh <issue>` per certified run).
- **Rebaseline before any reset** whenever harness/docs commits landed on
  main: branch from the current tag, cherry-pick ONLY the non-fix commits,
  verify the demo-app diff against the old tag contains exactly the intended
  changes (the tree is no longer frozen — docs corpus and log seeds evolve
  deliberately), `git tag -f demo-baseline`, force-push the tag. Never
  fast-forward the tag once a cycle has any merged fix.
- **Pre-run honesty**: a run you cannot afford live is pre-run for real
  before the audience and presented as the fresh history it genuinely is —
  never replayed on stage.

## Recovery — cheapest hammer first

1. Chat hiccup, no run in flight → restart the chat app; state is
   disposable.
2. PR open but flow broken → `gh pr close <pr> --delete-branch`; the issue
   returns to the queue. Never merge to escape a broken state.
3. Run killed mid-flight → `git reset --hard && git clean -fd demo-app`,
   checkout main, delete the fix branch; rung 2 if a PR was published.
4. Signaling flake → scene 2's fallback: `harness/route-signal.sh` (route
   without Grafana) or `harness/file-signal-issue.sh` (filing without the
   route). Tester/browser flake → the PR stands without screenshots, by
   design.
5. Nuclear → `harness/reset.sh` + `harness/setup.sh`, and the demo is the
   last certified rung (the cut-line rule).

Scene-by-scene choreography, narration schedule, and per-bug material:
`harness/private/runbook.md` and `harness/private/bugs.md`.
