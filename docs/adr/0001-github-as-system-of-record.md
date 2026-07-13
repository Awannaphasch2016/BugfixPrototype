# ADR-0001: GitHub is the system of record

**Date:** 2026-07-09
**Status:** Accepted

## Context

The pipeline produces artifacts constantly: issues, attempts, PRs, review
comments, merges. It also has a chat surface — a messaging-style page where
the operator commands the pipeline and watches its state. The obvious
temptation is to give the pipeline its own store: a database of attempts, a
dashboard that renders diffs, a status page that summarizes history. Every
such store is a second copy of the truth, and a second copy invites two
failure modes: drift (the copy disagrees with reality) and suspicion (an
audience shown a bespoke dashboard cannot tell rendered truth from rendered
theater).

## Decision

GitHub is the system of record. Issues, PRs, diffs, comments, and labels are
always real GitHub objects and are inspected on GitHub's own UI. The chat
shows status and links into the record; it never re-renders or fakes it. Any
pipeline state that matters beyond a single run must be expressible as a
GitHub object — an issue's lifecycle state, a label, a comment, a merged PR —
or it does not exist.

## Consequences

- The audit trail is native and independently verifiable: anyone with the
  repo URL can check every claim the pipeline makes, without trusting our
  rendering.
- There is no synchronization problem, because there is nothing to
  synchronize.
- Later capabilities inherit the constraint: anything shaped like a ledger or
  a policy input must be built from labels, issue states, and merged PRs
  (see ADR-0002), not from a side database.
- We take a hard dependency on the `gh` CLI and GitHub availability, and we
  live inside GitHub's data model — where it is awkward (issue numbers are
  not stable across cycles; images cannot be attached to comments via the
  CLI), we adapt to it rather than route around it.
