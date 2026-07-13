# ADR-0003: Gates run in the runner

**Date:** 2026-07-13
**Status:** Accepted

## Context

No unproven change should merge: every attempt must pass the target app's
test suite and lint, and the regression test must be shown red on the
baseline and green with the fix. The conventional home for such gates is CI —
GitHub Actions on this repo. But the platform is still being proven
end-to-end, and hosted CI charges for that proof in the wrong currency:
queue latency and runner cold starts make an attempt's wall clock
unpredictable (fatal for a timed, staged walkthrough), a red herring in a
workflow file becomes a debugging session in someone else's environment, and
a decorative green check adds looks before the functionality it decorates
exists. The project's standing rule applies: functionality precedes
looks-and-feel.

## Decision

Gates execute inside the runner. As part of every attempt, the runner runs
the app's tests and lint itself and posts a formatted gate report to the PR:
suite counts, lint result, and the regression test's red-on-baseline →
green-with-fix line. A gate failure aborts the attempt before anything is
pushed, extending the runner's existing fail-clean contract. No GitHub
Actions workflows — decorative or otherwise — until the demo is proven
end-to-end; CI migration is a polish-stage question.

## Consequences

- Gate evidence lives on the PR as an attributed report, satisfying ADR-0001:
  the proof is on the record, not in a runner's local terminal.
- Attempt wall clock stays deterministic and local — no queue, no cold start,
  no network flake between the fix and its proof.
- The gate is not a branch-protection status check; it is evidence for the
  human merge decision, and its integrity rests on the runner rather than on
  a third-party executor. Acceptable while merges are human-approved or
  precedent-gated (ADR-0002).
- The report format is the interface. When CI eventually takes over
  execution, it should produce the same report, so nothing downstream — chat
  cards, reviewers, audit habits — has to change.
