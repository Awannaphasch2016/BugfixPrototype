# Stage 4b spec — the replay-driven walkthrough

Amends the Stage 4 walkthrough's presentation model. Decided by grilling on
2026-07-14; the superseding decision is ADR-0004 ("the walkthrough
demonstrates certified artifacts, not live generation"), which replaces the
presentation clause of `docs/stage-4-spec.md`'s replay hard rules. The
companion rule — replay never certifies — stands. Old specs are stratigraphy;
this one supersedes, it does not edit.

## Problem Statement

The certified walkthrough runs 20–25 minutes, and most of that time is the
operator narrating over waits while agents generate live on stage. The waits
carry the demo's biggest risks — an agent flake in front of the audience, an
unpredictable clock — and they buy nothing the audience can see: the product
story is the flow of artifacts, not the latency behind them. The operator
wants to walk the same apps the same way (chat dispatch, merge, GitHub tabs)
with the demo deterministic end-to-end.

## Solution

The walkthrough runs in replay mode behind the normal UI: every
agent-generation step is filled from the agent-output cache of certified
runs, while everything downstream — routing, branches, commits, PRs, gates,
review posting, merges — executes for real on stage. The claim is narrated
openly as "certified agent output, live machinery," corroborated by an
always-visible replay banner and by the record's own timestamps. The
choreography keeps its beats at a compressed, configurable pace; the
autonomous scene replays a dedicated follow-up cache entry and auto-merges
in the room, completing the growth story on stage. One switch flips the
whole world between live (certification) and replayed (the show); a normal
dispatch can never silently replay.

## User Stories

1. As an operator, I want every dispatch during the walkthrough filled from
   the agent-output cache, so that no scene waits on live agent generation.
2. As an operator, I want the replayed walkthrough driven through the exact
   same UI actions as a live one, so that the audience sees the product's
   real interface, not a special demo harness.
3. As an operator, I want one switch that flips every dispatch path (human
   dispatch, signal auto-dispatch, setup pre-run) between live and replayed,
   so that a mixed-mode demo cannot happen by misconfiguration.
4. As an operator, I want that switch off by default, so that a normal
   dispatch can never silently replay.
5. As an audience member, I want a visible banner whenever replay mode is
   on, so that the presentation never claims live generation it isn't doing.
6. As an operator, I want the banner wording audience-friendly ("replaying
   certified agent runs"), so that honesty reads as a feature, not a debug
   stripe.
7. As a post-pitch repo visitor, I want the artifacts' timestamps to agree
   with what the room was told, so that inspecting the record confirms the
   pitch instead of exposing it.
8. As an operator, I want replayed artifacts to arrive beat by beat with a
   configurable delay between stages, so that the product's asynchronous
   rhythm — dispatch, then plan, then PR, then gates, then review — is
   demonstrated, not collapsed into a blur.
9. As an operator, I want the delay to default to zero outside the demo, so
   that replay stays the seconds-fast iteration fixture it was built to be.
10. As an operator, I want the narration schedule's beat structure preserved
    from the certified choreography, so that my rehearsed script survives
    with only its clock compressed.
11. As an audience member, I want the autonomous scene's issue to be born
    without the needs-human label and its fix to merge on stage within
    minutes, so that I watch the pipeline widen its own autonomy end-to-end.
12. As an implementer, I want the cache to hold per-attempt entries under
    each answer-key title, each declaring the state its patch applies to,
    so that a follow-up fix can replay on top of the first fix
    deterministically.
13. As an implementer, I want the attempt selected by the dispatch context —
    human dispatch replays the first attempt, auto-dispatch replays the
    follow-up — so that selection is deterministic and never operator input.
14. As an operator, I want the rehearsal ritual split into two legs — live
    certification that fills the cache, then a dress rehearsal of the
    replayed walkthrough in the exact demo-day configuration — so that
    nothing reaches the audience that hasn't run once already, in either
    mode.
15. As a consultant, I want replay to remain incapable of certifying
    anything, so that "certified" always means a live run passed the audit.
16. As an implementer, I want capture to normalize an artifact's reference
    to its own issue number into a placeholder that replay fills with the
    fresh number, so that replayed prose stays coherent across demo cycles.
17. As an implementer, I want capture to reject artifacts containing foreign
    issue numbers, commit shas, or dates, so that nothing that can go stale
    enters the cache at all.
18. As an audience member, I want the auto-filed issue's context report to
    name its problem class and link its precedent issue, so that "why did
    this route autonomously" is answered on the issue itself, freshly and
    correctly, every cycle.
19. As an operator, I want setup's pre-run to replay under the same switch,
    so that demo prep is minutes, not tens of minutes, and fully
    deterministic.
20. As a consultant, I want the switch off during leg-1 certification so the
    setup pre-run runs live and its output is captured, so that the cache is
    always fed by the same ritual that certifies it.
21. As the demo world's fiction, I want cached artifacts replayed with their
    certified substance untouched (only the self-pointer renumbered), so
    that the in-character authorship invariant holds on every replayed
    comment, review, and evidence file.
22. As a future implementer, I want the runbook's choreography re-authored
    around the replayed walkthrough with leg-2 clocks recorded, so that
    demo-day timing claims rest on rehearsal, not arithmetic.

## Implementation Decisions

- **One mode switch.** A single environment variable on the chat server
  turns replay on for every dispatch path: the dispatch route, the signal
  route's auto-dispatch, and the setup pre-run. Off by default. The runner
  keeps its explicit replay flag; the switch only decides whether callers
  pass it. No per-path toggles exist.
- **One tuning knob.** A second environment variable sets the inter-stage
  delay (seconds) the runner sleeps between artifact beats in replay.
  Unset/zero means instant replay (the build fixture). It has no effect on
  live runs. The delay is stage rhythm and is never presented as agent
  latency.
- **Banner.** When the switch is on, the chat UI renders an always-visible
  replay banner; the UI learns the mode from a small config exposure on the
  chat server. Audience-friendly wording; visible on the projector.
- **Attempt-aware cache.** Cache entries become per-attempt under each
  answer-key title. Each entry declares the state its patch applies to: the
  baseline for a first attempt, the baseline plus the prior fix for a
  follow-up. The dispatch context selects the attempt: human dispatch →
  first attempt; signal auto-dispatch → follow-up. Ordering needs no new
  enforcement — the routing policy only reaches an auto-dispatch after the
  precedent-minting merge has happened.
- **Coherence at capture, not at replay.** The capture script normalizes the
  artifact's own issue number to a placeholder and rejects (lint failure,
  recapture required) any foreign issue number, commit sha, or date in
  cached prose. Replay substitutes the fresh issue number into the
  placeholder. Nothing else in a cached artifact is ever rewritten.
- **Live cross-references.** The signal route's context report states the
  signal's problem class and, when precedent exists, links the precedent
  issue — computed at filing time, so it is correct every cycle. This is the
  demo-scale expression of semantic instance identity; the full system is
  roadmap (see Out of Scope).
- **Two-legged ritual.** Leg 1: reset → live runs → transcript audit →
  capture; the only source of cache content; reruns whenever the cache goes
  stale (prompt- or stage-shape change, baseline move, certified-path edit).
  Leg 2: reset → the replayed walkthrough end-to-end with the exact demo-day
  configuration (switch on, demo delay value) → clocks recorded. Demo-ready
  requires both, leg 1 first. Recorded in the glossary's rehearsal-ritual
  entry.
- **Known recaptures owed in the next leg-1 session:** the todo-list bug's
  evidence file (stale issue number and sha, and its "before" prose was
  captured against an already-fixed build); the follow-up attempt for the
  autonomous scene (never captured — the old single-slug gotcha explicitly
  skipped it); the due-dates plan's stale issue reference (encore slot,
  lower priority).
- **Choreography re-authoring.** The runbook's scene table keeps its beats
  and narration column; waits become the configured delay; the autonomous
  scene's auto-merge becomes an on-stage beat; the close absorbs reclaimed
  time (repo maturity tour). Runbook and demo-ops skill notes update
  accordingly (private material, in-character rules unchanged).
- **Record updates already made by the grilling:** CONTEXT.md entries for
  replay mode, agent-output cache, and rehearsal ritual; ADR-0004 supersedes
  the presentation clause. This spec supersedes rather than edits Stage 4's.

## Testing Decisions

- A good test asserts external behavior at a seam, never implementation
  detail. No new seams; the two existing ones carry everything
  deterministic:
- **Chat route handlers with stubbed external commands** (prior art: the
  existing chat route tests with stub scripts injected via environment
  variables): with the switch on, dispatch invokes the runner with the
  replay flag and first-attempt selection; the signal route's auto-dispatch
  invokes it with follow-up selection; with the switch off, no caller passes
  the replay flag (the never-silent guarantee); the config exposure reports
  the mode the banner renders from.
- **Runner and capture mechanics under stubbed commands** (prior art: the
  prompt-shape mechanics test — stubbed claude/gh/npm in a throwaway
  clone): replay selects the requested attempt's entry; the placeholder is
  substituted with the fresh issue number in posted artifacts; the
  inter-stage delay is honored between beats; capture's lint rejects
  foreign issue numbers, shas, and dates, and normalizes the
  self-reference.
- **The rehearsal ritual certifies everything audience-facing** — banner
  appearance, choreography, per-scene clocks, the on-stage auto-merge — per
  the standing convention that agent behavior and stagecraft are proven by
  rehearsal, not unit tests. Leg 2 is the acceptance test of this spec.

## Out of Scope

- Semantic instance identity (problem class + occurrence) as the ledger's
  reference system — roadmap; the templating policy is the demo-scale
  answer (ADR-0004's consequences carry the pointer).
- Pre-run-as-history as the walkthrough's mode — remains the spec-blessed
  fallback pattern, but the walkthrough itself is replay-driven; the
  operator heard and declined the alternative.
- Mixed-mode walkthroughs (some dispatches live, some replayed) — the
  single switch deliberately makes this unrepresentable.
- Simulated agent latency — delays are pacing only; nothing implies an
  agent is generating.
- Interactive step-through replay (operator-gated beats) — the fixed delay
  is deterministic and rehearsable; step-through is not.
- Per-agent replay granularity — replay substitutes the whole attempt.
- Editing `docs/stage-4-spec.md`, its tickets, or any certified rehearsal
  record — stratigraphy.
- The M8 naming/README polish and the CodeRabbit sign-in — unchanged open
  items from Stage 4.

## Further Notes

- Measured replay: a real PR in 6.6–7 s with gates running for real; with a
  15–30 s inter-stage delay the walkthrough lands around 15 minutes —
  rhythm restored, dead weight gone. Leg 2's recorded clocks are the
  authoritative numbers; never promise timing from arithmetic.
- Leg-1 recapture is already owed (the follow-up entry doesn't exist), so
  the coherence lint arrives exactly when it's needed and costs no extra
  session.
- The trigger must still never fire a third time in a cycle: post-follow-up
  the class is healthy and a fresh auto-dispatch would abort in front of
  everyone. Unchanged from the certified runbook.
- Rebaseline discipline applies unchanged: the demo-baseline tag moves
  forward over this spec's commits before any reset.
- After implementation, the demo-ops skill's hard rules and the runbook
  choreography must be updated in the same change set — the ritual's
  definition now lives in three places (glossary, ADR-0004, runbook) and
  they must not drift.
