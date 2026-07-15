# ADR-0004: The walkthrough demonstrates certified artifacts, not live generation

**Date:** 2026-07-14
**Status:** Accepted. Supersedes the presentation clause of the replay hard
rules (`docs/stage-4-spec.md`, 2026-07-12): "a replayed run is never presented
to an audience as live." The companion hard rule — **replay never certifies** —
stands unchanged and is load-bearing for this decision.

## Context

The certified walkthrough runs 20–25 minutes, dominated by waits on live
agent generation (a full-cast dispatch runs 9.5–12.5 minutes). The waits buy
authenticity but cost pace and carry on-stage risk, and the operator's intent
is a deterministic demo: interact with the chat and GitHub exactly as today,
with the agent-generation steps filled from the agent-output cache.

The invariant as written forbade that outright. It was authored when replay
was a build fixture only, and its honest demo-day variant was
pre-run-as-history: run the scenes live off-stage, then walk the fresh
artifacts. That alternative was put to the operator and declined — it
surrenders the interactive flow (dispatching, merging, and watching artifacts
arrive is itself the product's interface being demonstrated).

A silent replay was never on the table. The record is real and inspectable:
a replayed dispatch produces its plan comment, commits, PR, gate report, and
review within seconds of each other, so any post-pitch repo visitor can read
the timestamps. Whatever the demo claims must survive that reading.

## Decision

The walkthrough runs in replay mode behind the normal UI, and the claim is
narrated openly: **certified agent output, live machinery.** The audience is
told the agent work was generated and certified in earlier live runs; what
executes on stage — routing, git, PRs, gates, merges — is real. The tight
timestamps then corroborate the story instead of exposing it.

Supporting decisions, settled together:

- **One switch, never silent.** A single environment variable flips every
  dispatch path (human dispatch, the signal route's auto-dispatch, setup's
  pre-run) to replay and renders an always-visible banner in the chat —
  audience included. Off by default; a normal dispatch can never silently
  replay. A second variable is a tuning knob only: a fixed inter-stage delay
  so artifacts arrive at stage rhythm.
- **Beats unchanged, pace compressed.** The choreography keeps its beat
  structure and narration schedule; waits shrink from real agent latency to
  the configured delay. The delay is pacing, never dressed up as an agent
  thinking.
- **The growth story completes on stage.** The autonomous scene replays a
  separately captured follow-up attempt; the cache holds per-attempt entries,
  each declaring the state its patch applies to, with replay order enforced
  by the routing policy itself (a follow-up is only reachable after the first
  fix has merged).
- **Certification stays live and becomes two-legged.** Leg 1 (live runs,
  transcript audit, cache capture) is the only source of cache content and
  the only leg that certifies agents; it reruns when the cache goes stale.
  Leg 2 dress-rehearses the replayed walkthrough end-to-end in the exact
  demo-day configuration. Demo-ready requires both.
- **Cached prose is renumbered, narrowly.** At capture, an artifact's
  reference to its own issue number becomes a placeholder, substituted with
  the fresh number at replay; a capture-time lint rejects anything else that
  can go stale (foreign issue numbers, commit shas, dates). Disclosed here:
  the certified substance is untouched, only the self-pointer is refreshed.
  Cross-cycle references shown to the audience are instead generated live at
  filing time (the context report states its problem class and links its
  precedent), which is always current.

## Consequences

- The demo is deterministic and roughly 15 minutes; reliability is no longer
  bought with either live-generation risk or a faked one.
- The honesty claim survives inspection: narration, banner, and timestamps
  all tell the same story, and the walkthrough's centerpiece — precedent
  routing an issue past the human queue and merging autonomously — happens
  in the room.
- Agents now run only during leg-1 certification. There is no per-cycle
  canary: drift (model, dependency, prompt) surfaces at the next recapture,
  not at setup. Accepted deliberately in exchange for a fully deterministic
  cycle.
- The cache gains structure (per-attempt entries with declared bases) and a
  hygiene gate at capture; stale entries are recaptured, never patched by
  hand.
- Roadmap, not demo scope: semantic instance identity (problem class +
  occurrence) as the ledger's reference system. The templating policy is the
  demo-scale answer; a production ledger that needs querying should reference
  instances by their stable coordinates rather than tracker numbers.
