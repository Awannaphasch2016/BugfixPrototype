# Architecture decision records

Decisions that shape the pipeline platform, one file each, numbered in the
order they were accepted and never rewritten — a superseding decision gets a
new record that names what it replaces. Each record states its context, the
decision, and the consequences we accepted; the stage specs in `docs/` hold
the surrounding narrative and the trade-offs in full. Current records:
[ADR-0001](0001-github-as-system-of-record.md) makes GitHub the system of
record, [ADR-0002](0002-routing-by-precedent.md) routes work by precedent
instead of a hand-maintained allowlist, and
[ADR-0003](0003-gates-run-in-the-runner.md) keeps test and lint gates inside
the runner until the demo is proven.
