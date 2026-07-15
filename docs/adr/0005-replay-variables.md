# ADR-0005: Cached prose references live coordinates through replay variables

**Date:** 2026-07-15
**Status:** Accepted. Supersedes ADR-0004's "cached prose is renumbered,
narrowly" clause (only the self-pointer is refreshed). Decided with the
operator during leg-1 certification, when the coherence lint rejected the
follow-up attempt's capture.

## Context

The stage-4b coherence lint did its job on first contact: the autonomous
follow-up's certified artifacts failed capture, because a good follow-up
diagnosis *necessarily* cites its precedent — the prior issue's number, the
prior fix's commit, and the dates separating the log's historical firings
from the fresh one. The tension is structural, and partly self-inflicted:
the context report deliberately links the precedent on the issue itself
(stage-4b), so a diligent planner will always repeat it. Under ADR-0004's
narrow renumbering rule, the follow-up scene's prose could never be cached
clean, no matter how many times it was recaptured.

## Decision

A reference in cached prose may become a **replay variable** if and only if
replay can deterministically resolve its fresh value from the fresh cycle's
own record, with no operator input. Judgment prose is never rewritten; only
these coordinates are:

| variable            | capture normalizes            | replay resolves from                 |
|---------------------|-------------------------------|--------------------------------------|
| `{{issue}}`         | the entry's own issue number  | the dispatched issue number          |
| `{{precedent}}`     | the precedent issue number    | the fresh issue body's precedent link |
| `{{precedent_sha}}` | the precedent fix's commit(s) | the precedent's merged PR, first commit |
| `{{today}}`         | the certified run's date      | the clock (the fresh firing IS today) |
| `{{fresh_reqid}}`   | the firing's request id       | the level-50 line in the fresh issue body's excerpt |

Two supporting rules:

- **Frozen-world literals pass the lint.** A date that lives in the baseline
  demo-app tree — verbatim in seeded content, or derived from the committed
  log's epoch timestamps — cannot go stale, because the world it describes
  is frozen at the tag. Only the agents' world (`demo-app/`) qualifies; the
  wider repo's spec and record dates deliberately do not.
- **A variable that cannot resolve aborts the replay** — better no artifact
  than a lying one. Capture reads its values from the record itself (issue
  body, merged PRs), never from operator input.

## Consequences

- The follow-up attempt captures clean without loosening the lint's grip on
  genuinely foreign references; recapture works straight from the existing
  GitHub record, no agent re-run required.
- Replayed prose now states the fresh cycle's true coordinates everywhere —
  issue, precedent, commit, date, and firing request-id all agree with the
  issue's own context report and the log. This is the demo-scale expression
  of semantic instance identity (ADR-0004's roadmap note): prose references
  by stable role, resolved to coordinates at presentation time.
- Disclosed residue: run-specific tokens outside the lint's three classes
  (process pids, an agent's own repro request-ids) remain verbatim in
  replayed prose. They describe the certified run and are presented as such.
