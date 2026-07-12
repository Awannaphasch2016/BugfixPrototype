# Stage 2 — Chat Control Surface (Two-Lane Demo)

**Status:** `built` (2026-07-09; commits on main cite this spec)
**Amended by:** `docs/stage-2b-spec.md` — fresh-issue cycles, lane label, command renames; also records the polling-recovery deviation from this spec's "no polling" line.
**Tracker:** local (`docs/` is the tracker for build specs; GitHub Issues on this repo is reserved as demo scenery)
**Stage:** 2 of 3 (revised ladder). Stage 3 = the judgment dispatch: operator note, inline context form, and ticket #4 — one coherent feature, deferred together. Everything else formerly in Stage 3 is roadmap talking points.

## Problem Statement

Stage 1 is demo-ready, but its demo surface is a terminal plus GitHub browser tabs. The audience is C-suite, ex-technical, not AI-fluent — they are buying a product, and what they'd currently watch is a consultant typing shell commands. Separately, the pitch has sharpened into a two-lane autonomy story (routine bugs fixed with no human; uncertain bugs dispatched by a human and reviewed later) that has no surface to live on. Finally, there is a demo gap: merging a PR on GitHub does not update the localhost app the audience is watching, so the "see it fixed" beat dies without visible plumbing.

Roughly one hour of build time remains. Whatever is complete at the deadline is what gets demoed, so this stage is floor-only: the smallest chat surface that carries the whole demo.

## Solution

One new build: a chat surface — a messaging-app-style page standing in for Slack/Telegram/LINE, where the operator commands the pipeline and sees its state. It is the only thing built in this stage; GitHub's own UI remains the viewer for evidence (diffs, regression tests, diagnosis narratives), and no board or dashboard panels are built. **The runner is not modified in any way** — the chat wraps it, so every Stage 1 rehearsal guarantee carries over untouched.

The chat serves both lanes. For the autofix lane it is an inspection surface: a command lists the real closed issue→PR pairs that were fixed with no human in the loop (bug 1 is pre-fixed and auto-merged during pre-demo setup, so this history exists when the audience arrives). For the assisted lane it is a dispatch-and-decide surface: list unsolved issues, click Fix-this to dispatch one, receive the PR card when the run completes, glance at the diff on GitHub, and click Merge in the chat — which merges the real PR and syncs the local checkout so the app hot-reloads and the very next UI gesture shows the fix.

Determinism comes from rehearsal, not engineering: no polling, no push channels, no failure-handling UX. Dispatch is a single blocking HTTP request that responds when the runner finishes. Anything that breaks mid-demo is handled by a human recovery runbook, cheapest hammer first.

## User Stories

1. As the demo operator, I want a chat page that looks like a familiar messaging app, so that the audience reads the pipeline as a product their team would use, not a consultant's terminal.
2. As the demo operator, I want the chat built from an off-the-shelf chat UI kit, so that build time goes to the demo flow rather than look-and-feel.
3. As the demo operator, I want a welcome message offering clickable command chips, so that I never mistype a command under stage lights.
4. As the demo operator, I want a command listing recently autofixed issues as cards (issue, merged PR, links), so that I can show real artifacts when the audience asks what the bot handles on its own.
5. As an audience member, I want the autofixed list to link to the real GitHub issue and merged PR, so that I can verify nothing in the history is staged.
6. As the demo operator, I want a command listing unsolved (open) issues as cards with a Fix-this button, so that picking a bug to dispatch is one visible click.
7. As the demo operator, I want clicking Fix-this to dispatch immediately — one click, no further input — so that the demo beat cannot be fumbled.
8. As the demo operator, I want dispatch to first restore the two runtime-dirtied demo-app data files to their committed baseline, so that showing a bug in the todo app moments earlier cannot make the runner abort on a dirty tree.
9. As the demo operator, I want the dispatch request to block until the runner finishes and then render a PR card, so that the "PR ready" message arrives at the true moment of readiness with no polling, timers, or guessed durations.
10. As the demo operator, I want a "working on it" acknowledgment immediately after dispatch, so that the audience knows the run is live while I narrate over the autofix lane.
11. As the demo operator, I want all dispatch and merge buttons disabled while a run is in flight, so that two runs can never collide on the shared working tree.
12. As the demo operator, I want the PR card to carry a view-diff link and a Merge button, so that review happens as a glance at GitHub and the decision happens in the chat.
13. As the demo operator, I want the Merge click to run a fixed script (merge the real PR, return to main, pull), so that seconds later the localhost app hot-reloads with the fix and redoing the bug gesture shows it gone.
14. As an audience member, I want the merge-to-live transition narrated as "this click is your deploy hook," so that I understand CI/CD wiring is roadmap, not vaporware.
15. As the demo operator, I want the Merge button to disable after one click and each card to reflect one state (queued → running → PR ready → merged), so that no double-fire or stale button can surprise me mid-demo.
16. As the demo operator, I want the autofixed list computed as merged fix-branch PRs whose issue is currently closed, so that merged PRs from past rehearsal cycles never pollute the lane and reset self-heals the list.
17. As the demo operator, I want a setup step that pre-runs bug 1 through the runner and auto-merges its PR after reset, so that the demo opens with the autofix lane's history in place: issue #1 closed, open issues #2/#3, zero open PRs.
18. As the demo operator, I want a recovery runbook ordered cheapest-hammer-first, so that mid-demo breakage has a reflex response instead of a judgment call under lights.
19. As the demo operator, I want abandoned attempts closed (never merged) with their remote branch deleted, so that main stays clean and re-dispatching the same issue cannot die at push time.
20. As the demo operator, I want the chat's state held in memory with no persistence, so that a hung chat is recoverable by restart-and-redo rather than by state repair.
21. As the consultant, I want the chat app to live in the harness, separate from the demo app, so that the fixer agent can never see or edit its own control surface and the chat becomes a reusable pitch asset.
22. As the demo operator, I want every live-demoed path verified by the rehearsal ritual (reset → setup → full walkthrough), so that the live demo replays a proven path.
23. As an audience member, I want everything the chat displays (issues, PRs, diffs) to be the real GitHub record, so that a validator auditing later finds no fakes.

## Implementation Decisions

- **Topology:** the chat is its own small Next.js app inside the harness (per the Stage 2/3 handoff decision) — the fixer agent must never see it, and it outlives this client as the pitch asset. The demo app and the runner are untouched by this stage.
- **Chat UI:** an off-the-shelf React chat component kit (chatscope's chat-ui-kit or equivalent) supplies the chrome — container, message list, bubbles, input box. Custom card components (issue card, PR card, command chips) render inside message content. Styling budget: functional, not branded.
- **Commands:** `/list-recently-autofixed` and `/list-unsolved-issues`, entered by typing or by clicking chips offered in the welcome message and bot replies. Unrecognized input gets a graceful fallback reply offering the chips.
- **Dispatch is one click:** Fix-this on an issue card dispatches immediately (no context field — that is Stage 3's judgment dispatch). The card's buttons disable and the bot posts an "on it" acknowledgment into the conversation.
- **Backend routes (the new seam):** a blocking dispatch route (issue number in, PR URL out — responds only when the runner exits), a merge route (PR number in, ok out), and two list routes backed by GitHub queries. No polling, no SSE, no websockets: the dispatch request's open connection is the notification channel (long-running synchronous request; safe on localhost — no proxies, no serverless execution caps).
- **Process boundary as config point:** the backend shells out to the runner and to the GitHub CLI through a configurable command path, so tests substitute stub scripts and never run a real agent or touch GitHub.
- **Pre-dispatch cleanup:** before spawning the runner, the backend restores exactly the two runtime-dirtied demo-app data files (task store and log file) to their committed baseline — a restore, not a clear: the baseline log content carries bug 3's diagnostic signature and must survive. Any other dirt still aborts the run, by design.
- **Merge script (fixed, no agent):** merge the PR via the GitHub CLI, check out main, fast-forward pull — preceded by the same two-file restore. Next.js hot reload makes the fix live; the "after" beat is redoing the bug gesture, not preserved state.
- **Serialization:** one run at a time, enforced in the backend and reflected by disabled buttons. Narratable as "attempts are serialized against one checkout, like a deploy queue."
- **Autofix lane derivation:** merged PRs on fix-branches whose corresponding issue is currently closed. Reset reopens all issues, emptying the lane; setup's pre-run of bug 1 repopulates exactly one entry.
- **Setup step:** after reset, pre-run bug 1 through the runner and auto-merge its PR (merge is allowed on one's own PR; only the Approve badge is not — no second GitHub account, decided). Demo opening inventory: issue #1 closed with merged PR; issues #2 and #3 open; zero open PRs. If build time runs short, this step may ship as two documented manual commands in the runbook instead of a script.
- **Approval beat:** review is a narrated glance at the PR on GitHub; the decision is the Merge click in chat. Assisted-lane merges are always human clicks; only setup's autofix pre-run auto-merges.
- **Failure policy:** assume runs succeed (enforced by rehearsal); the chat shows an honest generic error if the dispatch request fails, and everything else is the runbook.
- **Recovery runbook (cheapest hammer first):** (1) chat hiccup with no run in flight → restart the chat app, state is disposable; (2) PR open but flow broken before merge → close the PR with branch deletion (never merge to escape a broken state), issue stays queued, re-dispatch later; (3) run killed mid-flight → hard-reset and clean the tree, return to main, delete the local fix branch, then rung 2 if a PR was published; (4) nuclear → full reset, which reopens all issues and therefore destroys the autofix history, forcing the setup pre-run again before the demo can resume.
- **Demo choreography:** browse autofix lane → per live bug: gesture shows the bug → list unsolved → Fix-this → narrate over autofix history while blocked → PR card arrives → glance at diff/test/diagnosis on GitHub → Merge in chat → redo the gesture, fixed. Mid-run, the todo-app tab is not projected (the working tree is on the fix branch beneath the dev server).
- **In-character authorship invariant and the answer key mechanism continue to govern** everything committed; the runbook copy lives in the answer key.

## Testing Decisions

- **One new seam: the chat backend's route handlers** — request in, response/state out, with the runner and GitHub CLI stubbed at the process-boundary config point. Cover: dispatch happy path returns the PR URL from stub output; the in-flight lock rejects a second dispatch; the merge route runs the fixed sequence; list routes map stubbed GitHub output to cards; pre-dispatch restore touches exactly the two data files.
- **A good test asserts externally observable behavior** (status codes, response bodies, spawned-command arguments) and never implementation details. Prior art: the demo app's route-handler tests from Stage 1.
- **The chat UI gets no automated tests** — it is a consumer of the seam, verified manually by the demo walkthrough (mirrors Stage 1's treatment of the todo UI).
- **The system test is the rehearsal ritual**, extended for this stage: reset → setup pre-run of bug 1 → full demo walkthrough through the chat (dispatch, merge, gesture-redo per bug). A configuration is demo-ready only after this passes end-to-end.
- **Runner and reset scripts remain tested by the ritual at their command-line seams** — no unit tests for their internals (Stage 1 decision, unchanged).

## Out of Scope

- **The judgment dispatch — deferred whole to Stage 3:** the operator note (optional human context appended to the fixer prompt), the inline context form on the issue card, the runner's optional note argument, go-word normalization, the prompt amendment for presentational tickets, and ticket #4 (the text-color complaint dispatched with "use green for the text in the todo list"). These are one feature and ship together; adopting them later voids the byte-identical prompt guarantee and requires a full re-rehearsal pass.
- Real Slack/Telegram/LINE/Discord wiring — the chat *stands in* for them; a bot token integration is roadmap.
- Any board, dashboard panel, live activity feed, agent trace viewer, log viewer UI, Trello flow, or knowledge base — roadmap talking points.
- Real CI (GitHub Actions/@claude) — cut previously; survives as the "merge is your deploy hook" talking point.
- Polling, SSE, websockets, run-progress streaming, elapsed-time displays fed by the backend.
- Failure-handling UX beyond one honest error message; retry logic; run cancellation from the chat.
- Chat persistence, authentication, multi-user, message history across restarts.
- Concurrent runs; a second GitHub account or machine user for the Approve badge; branch protection.
- AI anywhere in the chat backend: command parsing is a strict match, plumbing is fixed scripts, and the routing policy is configuration — the only model in the system remains the fixer agent.
- Deploying the chat or demo app anywhere; both run on localhost.

## Further Notes

- **Time budget:** ~1 hour. Build order: backend routes → chat UI → merge flow → setup step (script or documented manual commands) → walkthrough rehearsal. No stretch goals in this stage; if anything must be cut, cut the setup script (manual commands) before cutting any demo-visible flow.
- **Rehearsal arithmetic:** per-fix wall clock is 105–190s (answer key). Never assume a run fits under three minutes; nothing in the chat depends on duration, by design.
- **The blocking-dispatch pattern is localhost-only by nature** — on any serverless or proxied deployment it would die; acceptable because the harness is local by decision.
- **If the audience proposes a live instruction mid-demo** ("tell it to also…"), the rehearsed deferral is: "that's the operator-note field on our roadmap — for today's run I'll let it work from the report." Nothing in this stage accepts free-text instructions, so nothing can be fumbled.
- **Same-account merge is proven** (Stage 1 merged its own PRs throughout); only the green Approve badge is impossible, and its honest answer is one sentence about branch protection.
