# Handoff — Stage 3 planning context (from the Stage 2 planning session)

**How to use:** open a fresh session, run `/grill-with-docs` referencing this
file. Everything under **Decided** carries its rationale — do not re-litigate
without new information. Everything under **Open** is the grilling agenda.
Companion documents: `docs/stage-2-spec.md` (the floor this builds on),
`CONTEXT.md` (glossary — this handoff uses its terms), `harness/private/bugs.md`
(answer key + rehearsal records, gitignored). Supersedes
`docs/stage-2-3-handoff.md`, whose open questions are all resolved.

## Where the project stands

Stage 1: built, rehearsed, demo-ready (3 planted bugs, one-shot runner, reset).
Stage 2: spec'd floor-only as the chat control surface — two-lane model
(autofix lane = bug 1 pre-fixed in setup; assisted lane = one-click dispatch,
blocking request, merge-from-chat). At the time of writing it was
`ready-for-agent`, about to be implemented — **verify it is built and
walkthrough-rehearsed before planning Stage 3 on top of it.**

## What Stage 3 is

**The judgment dispatch** — one coherent feature, deliberately deferred whole
from Stage 2 (decided 2026-07-09, when runway shrank to ~1h):

- the **operator note** (optional human context attached at dispatch),
- the **inline context form** on the issue card,
- the runner's optional note argument,
- a one-line **prompt-contract amendment** for presentational tickets,
- **ticket #4** — a subjective text-color complaint, dispatched live with the
  note "use green for the text in the todo list".

Nothing else. Everything formerly called "Stage 3" (Trello, Telegram, log
viewer, trace viewer, knowledge base, boards) stays cut as roadmap talking
points — do not reopen without new information.

## Decided (with the why — do not re-derive)

1. **The note is added context, never a replacement prompt.** The fixed prompt
   in the runner is the *harness contract* (regression test red-then-green,
   scope rules, PR-body output format the plumbing consumes verbatim). A
   human-supplied prompt would void rehearsals, break the PR-body pipe, and —
   worst — tell a sharp viewer the human did the steering, killing the
   "vague report in, verified fix out" thesis.
2. **Placement: a short "note from the team" section between the bug-report
   section and the "## Your job" contract.** After the report so it reads as
   more reporting context; before the contract so the binding rules stay last.
   A note may color the investigation but cannot displace test/scope/format
   rules.
3. **Go-word normalization:** an empty field or a bare go-word ("go",
   "do it", "fix it") attaches nothing — the prompt stays byte-identical to
   the rehearsed one. Normalize in the chat backend, so a typed "do it" can
   never leak into the prompt.
4. **UX is an inline form on the issue card** (chosen over a conversational
   bot-asks-you turn): Fix-this expands the card in place to an optional
   context field + Dispatch button. In the Stage 2 floor, Fix-this dispatches
   immediately — Stage 3 changes that click to expand instead.
5. **Ticket #4 is the demo *of* the note** — they ship together or not at all.
   A color preference is judgment the agent cannot derive from any issue, log,
   or code; that's what makes the note's existence honest. The complaint is
   subjective, so *nothing is planted* — only the in-character issue text is
   authored. Demo placement: opener of the assisted lane (low stakes, fast
   run, preserves the severity escalation toward bug 3).
6. **The prompt amendment:** one line in the fixed contract letting a purely
   presentational report state why no API-seam regression test applies. The
   current contract is unsatisfiable for a CSS-class fix; an agent forced to
   satisfy it will flail.
7. **The price tag (the reason this was cut from Stage 2):** any edit to the
   fixed prompt voids the byte-identical guarantee, so adopting this feature
   requires a **full re-rehearsal pass** — every live bug re-run under the
   amended prompt (105–190s wall clock each, plus transcript audit), plus
   ticket #4 rehearsed with its exact note verbatim. The feature is not
   demo-ready until that passes. Budget it as rehearsal time, not just build
   time.
8. **Runner transport:** optional second CLI argument to the runner; the
   dispatch route passes it through. The runner remains the only owner of git
   and prompt assembly.
9. **Live-instruction policy stands until this ships:** if an audience member
   proposes an instruction mid-demo, the rehearsed deferral is "that's the
   operator-note field on our roadmap." After this ships, the only live note
   ever typed is ticket #4's rehearsed one-liner — improvised notes on stage
   are still forbidden (unrehearsed prompt = live gamble).

## Open — the grilling agenda for Stage 3

1. **Is it worth building at all before the client demo?** Weigh remaining
   runway against demo ROI: the floor demo already carries the pitch; this
   feature adds the "command it from chat with judgment" wow. If runway is
   short, polish and re-rehearse the floor instead.
2. **Does ticket #4 one-shot under the amended prompt?** Empirical question —
   the first rehearsal answers it. If the agent handles "no seam test
   applies" ungracefully, rework the amendment wording (or the ticket) until
   the intended road is load-bearing.
3. **Ticket #4's issue text** — unwritten; must be authored in character
   (vague end-user prose, no design vocabulary) under the authorship
   invariant.
4. **Where the demo-day note is typed** — confirm choreography: typed live
   (rehearsed keystrokes) vs. pre-filled; and whether the run's brevity needs
   different narration cover than the 2–3 min bugs.
5. **Does the amended prompt change bug 1's autofix pre-run?** Setup re-runs
   bug 1 on every reset; it will now run under the amended prompt too —
   confirm its rehearsal record under the amendment.

## Rehearsal data worth reusing

Per-fix wall clock 105–190s, 12–24 turns, ~$0.79–1.50 (answer key). PR bodies
carry the agent's own diagnosis narrative. Transcripts land in
`harness/private/transcript-issue-<n>.jsonl`. Ticket #4's run should be much
shorter — measure it in rehearsal before choreographing around it.
