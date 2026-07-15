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

## The rehearsal ritual (definition of demo-ready — two legs, in order)

**Leg 1 — certification (switch OFF, agents live):** reset → live runs →
transcript audit → `harness/capture.sh <issue> [--follow-up]` per certified
run. The only leg that certifies agent output and the only source of cache
content; re-run whenever the cache goes stale (any prompt- or stage-shape
change). Every capture passes the coherence lint (replay variables per
ADR-0005) or is rejected whole — recapture, never hand-edit.

**Leg 2 — dress rehearsal (the exact demo-day configuration):** reset →
`DEMO_REPLAY=1 DEMO_REPLAY_DELAY=<demo value>` on the chat server and
setup → every scene end-to-end behind the normal UI, banner visible,
per-scene clocks recorded. Replay never certifies; leg 2 proves the show,
not the agents. Demo-ready requires both legs, leg 1 first. Record both in
`harness/private/bugs.md`.

The audit (leg 1) covers the role artifacts:

- plan comment on the issue BEFORE any commit, citing the docs corpus
- the same plan text spliced in the fixer prompt (mechanics guaranteed by
  `harness/tests/prompt-shape.sh`; the live audit checks presence)
- gate report on the PR with the red-on-baseline → green line
- tester before/after screenshots in the PR body (when the app was up)
- reviewer commented exactly once; planner/tester transcripts show no writes
- stage wall clocks recorded (`harness/private/stages-issue-<n>.json`) —
  they feed the narration schedule

## Hard rules

- **Certification is always live; the walkthrough is replayed and says so.**
  Replay never certifies. On stage it is narrated as exactly what it is —
  certified agent output, live machinery (ADR-0004) — with the banner
  always visible; a replayed run is never presented as live *generation*.
  One switch (`DEMO_REPLAY` on the chat server) flips every dispatch path
  and the banner together; off by default, so a normal dispatch can never
  silently replay, and mixed mode is unrepresentable. Never flip the switch
  mid-walkthrough. `DEMO_REPLAY_DELAY` is stage rhythm only — never dressed
  up as agent latency.
- **Cached prose is coherent by construction (ADR-0005).** Capture
  normalizes live-resolvable coordinates to replay variables ({{issue}},
  {{precedent}}, {{precedent_sha}}, {{today}}, {{fresh_reqid}}) and the
  lint rejects anything else that can go stale; frozen-world literals
  (baseline demo-app content, project skills) pass. A rejected capture is
  recaptured from a clean source — the cache is never hand-edited.
- **Any prompt-shape change voids everything**: all rehearsal records and
  the whole agent-output cache become stale as evidence. Re-rehearse every
  scenario live, then recapture (`harness/capture.sh <issue> [--follow-up]`
  per certified run — the follow-up entry declares its base and replays on
  top of the first fix's merged state).
- **Rebaseline before any reset** whenever harness/docs commits landed on
  main: branch from the current tag, cherry-pick ONLY the non-fix commits,
  verify the demo-app diff against the old tag contains exactly the intended
  changes (the tree is no longer frozen — docs corpus and log seeds evolve
  deliberately), `git tag -f demo-baseline`, force-push the tag. Never
  fast-forward the tag once a cycle has any merged fix.
- **Pre-run honesty (the fallback pattern)**: pre-run-as-history remains
  the spec-blessed fallback — run for real off-stage, present the fresh
  artifacts as the history they genuinely are. The walkthrough itself is
  replay-driven per ADR-0004; setup's pre-run obeys the same `DEMO_REPLAY`
  switch (live during leg 1, whose output capture feeds the cache).

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
