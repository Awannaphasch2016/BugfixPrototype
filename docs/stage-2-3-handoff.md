# Handoff — Stage 2/3 planning context (from the Stage 0/1 planning session)

**How to use:** open a fresh session, run `/grill-with-docs` referencing this
file. Everything under **Decided** carries its rationale — do not re-litigate
without new information. Everything under **Open** is the grilling agenda.
Companion documents: `docs/stage-1-spec.md` (built), `harness/private/bugs.md`
(answer key + rehearsal records, gitignored).

## Where the project stands

Stage 1 is built, rehearsed, and demo-ready: 3 planted bugs (issues #1–3),
`harness/run.sh <issue#>` one-shots each (rehearsed PASS, ~105–190s, PRs #4–6,
since reset), `harness/reset.sh` rewinds everything to the `demo-baseline` tag.
Bug 3's diagnosis was verified genuinely log-driven. Known caveats:
- One GitHub account cannot formally Approve its own PR (demo beat = review
  comment + merge, or add a second account — open question below).
- Running the app dirties `demo-app/data/tasks.json` and `logs/app.log`;
  checkout/reset before any build or demo.

## The revised stage ladder

- **Stage 2 — Dashboard (the demo's control surface).** Pipeline board +
  trigger button. **Real CI (GitHub Actions/@claude) is CUT** — decided
  2026-07-09.
- **Stage 3 — Mocked periphery as dashboard panels.** Trello→issue, Telegram
  trigger, log viewer, agent trace, knowledge base. Scope/order re-examination
  is an open question.

## Decided (with the why — do not re-derive)

1. **Audience is C-suite, ex-technical, not AI-fluent.** Everything optimizes
   for *visible product truth*: UI shows the bug → fix runs → UI shows it
   fixed. Plumbing stays brief; code appears only as a glance at the PR.
2. **Fix quality is the purchase trigger;** integrations are supporting cast.
   The real agent loop (real issue, real fix, real PR) must never be mocked.
3. **Real CI is cut from build scope** (2026-07-09): the local runner already
   produces identical artifacts through a faster transport; Actions added
   only latency, secrets setup, and live-demo risk. It survives as a roadmap
   *talking point*: "the same one-shot script wraps into an Action/webhook."
   Consequence: no new credentials needed for any remaining stage (except
   Telegram's bot token if Stage 3 keeps it real).
4. **Dashboard = control surface, not just viewer.** Button "Fix this issue"
   → POST route → spawns `harness/run.sh <n>` — same semantics as @claude,
   local speed. It replaces GitHub-tab-hopping with one screen and gives
   Stage 3 panels a mounting shell. GitHub remains the **system of record** —
   the dashboard presents real issues/PRs/diffs, never fakes them.
5. **Dashboard is its own small Next.js app in `harness/`** (not routes inside
   demo-app): the fixer agent must never see or edit its own harness, and the
   dashboard is the reusable pitch asset for future clients (demo-app is the
   disposable prop).
6. **Runner stays a one-shot script; runner owns all git.** The agent only
   edits demo-app and runs its tests. No daemons, no watchers.
7. **Demo choreography per bug:** UI gesture shows bug → vague issue on
   screen → click Fix → narrate the agent's investigation during the run →
   PR: glance at diff, regression test, cited log lines (bug 3) → merge →
   UI gesture shows it fixed. Bugs demoed in order 1→2→3 (accumulating
   regression tests; escalating severity: wrong list → data corrupted →
   data gone).
8. **In-character authorship invariant** (all committed artifacts authored as
   if bugs are unknown) and the **answer key mechanism** (gitignored
   `harness/private/`) continue to govern anything added to the repo.
9. **Stage 3 philosophy:** mock everything peripheral locally (Trello board,
   log viewer, trace, knowledge base) — real SaaS wiring is the *paid
   engagement's* roadmap, and every external dependency is live-demo failure
   surface. Trello flow starts as dumb copy (deterministic), enrichment agent
   is the upsell narrative. Telegram may be the one real integration (bot
   token is trivial) — confirm in grilling.

## Open — the grilling agenda for Stage 2

1. **Approval beat:** same-account limitation — demo as review-comment +
   merge, or set up a second GitHub account/machine user for a real Approve
   click? (Decide before choreography is locked.)
2. **Run-time narration:** the agent takes ~2–3 min per fix. What does the
   dashboard show during it — poll GitHub for branch/PR appearance, tail the
   runner's transcript/log into a live activity feed, or scripted talking
   points only? (This is the biggest UX decision in Stage 2; the transcript
   tail is also Stage 3's "agent trace" panel in embryo.)
3. **Dashboard data source:** pure GitHub API polling (spec'd default) vs.
   also reading local runner state (fix branch progress, exit codes) for
   liveness the GitHub API can't see mid-run.
4. **Stage 3 scope surgery:** user has signaled possible add/reorder/edit/
   remove of stages. Re-examine each panel's demo ROI: Trello (client's
   actual workflow — likely stays), Telegram (real vs cut), trace viewer
   (pairs with open question 2), knowledge base (weakest demo beat?).
5. **Remaining runway:** how much build time is actually left before the
   client demo, and does Stage 2 need a must-finish floor split (board view
   first, trigger button second — or reverse)?

## Rehearsal data worth reusing (from the answer key)

Per-fix wall clock 105–190s, 12–24 turns, ~$0.79–1.50. PR bodies contain the
agent's own diagnosis narrative (bug 3 cites log lines honestly). Transcripts
land in `harness/private/transcript-issue-<n>.jsonl` — raw material for the
trace-viewer panel and for narrating runs live.
