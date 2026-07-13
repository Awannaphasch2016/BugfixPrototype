# ADR-0002: Routing by precedent

**Date:** 2026-07-12
**Status:** Accepted. Supersedes the hand-maintained bug-class allowlist
(routing policy prior to 2026-07-12).

## Context

The pipeline has two lanes: autofix (issue in, PR merged, no human in the
loop) and assisted (a human dispatches the attempt and merges the PR). Some
policy must decide which lane a piece of work lands in. The original policy
was a hand-maintained allowlist of bug classes the pipeline was trusted on.
An allowlist has a defect that gets worse as the platform grows: it asserts
trust by configuration. Nothing in the record explains *why* a class is
trusted, the list rots as classes are added ad hoc, and the growth story —
"the pipeline earns wider autonomy over time" — happens in a config file
where no one can watch it.

Alternatives considered: confidence scoring (the pipeline rates its own fix
and routes on the score) was rejected — self-assessment is not evidence, and
a threshold is an allowlist with extra steps.

## Decision

Route by precedent. Every signal is classified into a problem class, recorded
as a problem-class label on its issue. A class has precedent when a
closed-as-completed issue carrying that label has a merged fix-branch PR — a
human-approved fix of that class already in the history. Signals of a
precedented class route to the autofix lane; novel classes file an issue with
a needs-human label and wait for a human dispatch.

The precedent ledger is labels on the system of record (per ADR-0001): no
database, no config file. The merge of a novel-class fix is itself the act
that widens trust — the next signal of that class routes autonomously because
the evidence now exists, not because anyone edited a list. Initial precedents
are seeded with the environment's setup ritual; who first classified them,
human or agent, is deliberately unspecified — the ledger records outcomes,
not authorship of the taxonomy.

## Consequences

- Trust is earned from approved history and is inspectable: "why did this
  route autonomously?" is answered by a label query and a merged PR, not by
  us.
- The growth story demonstrates itself — an observer can watch a class cross
  from assisted to autonomous by watching one merge.
- Misclassification risk is bounded: a novel class always meets a human
  before its first fix merges, so a wrong label can widen trust only after a
  human has approved a fix under that label.
- Routing logic stays trivial (dedupe by signature, then a label-and-PR
  lookup), at the cost of expressiveness: there is no partial trust and no
  per-class confidence tuning. That is deliberate.
