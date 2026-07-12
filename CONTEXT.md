# CONTEXT — ubiquitous language for BugfixPrototype

Glossary only. Decisions and their rationale live in `docs/` (specs, handoffs).

## Terms

- **Demo app** — the fictional "client codebase" (`demo-app/`): a small task-management
  web app with planted bugs. The disposable prop; the only thing the fixer agent may
  touch.
- **Harness** — the consultant's tooling (`harness/`): runner, reset, chat surface.
  The reusable pitch asset; invisible to the fixer agent and to the demo fiction.
- **Runner** — the one-shot process that turns a GitHub issue number into an open PR.
  Owns every git operation; the fixer agent only diagnoses, tests, and edits inside
  the demo app.
- **Fixer agent** — the non-interactive Claude Code session the runner spawns to
  diagnose and fix one bug.
- **Autofix lane** — bug classes the pipeline has proven competence on: issue in,
  PR opened and merged, **no human in the loop**. Humans meet this lane only as
  auditors, browsing the history of real closed issue→PR pairs.
- **Assisted lane** — bugs outside the proven classes: they queue as unsolved issues
  until a human **dispatches** an attempt. Dispatch is asynchronous and
  low-commitment — fire it from anywhere, review the PR later; a failed attempt is
  prior art, not a failure.
- **Dispatch** — the human act of telling the pipeline to attempt an assisted-lane
  issue.
- **Attempt** — one dispatch of the fixer agent on one issue, producing exactly
  one PR. Ends merged (the issue is solved) or closed-unmerged (the attempt is
  prior art; the issue returns to the queue). Attempts have history; issues have
  state.
- **Lifecycle state** — where an issue is in its life, on GitHub's native state
  machine: open; closed as completed (a merged fix closed it); closed as
  not-planned (abandoned). Never encodes who was trusted.
- **Lane marker** — the `autofixed` label: the auditable record that an issue
  was solved with no human in the loop, applied by the pipeline at the moment
  it merges without review. Lane is an axis orthogonal to lifecycle state.
- **Badge** — a solved card's lane, as shown in the chat: **autofixed** (lane
  marker present) or **human-approved** (absent — the fix merged through the
  assisted lane, a human clicking Merge).
- **Decline** — the human verdict rejecting an attempt: a reason stated in a
  comment, then the PR closed unmerged. Terminal for the attempt, not for the
  issue.
- **Demo cycle** — one reset-to-reset lifetime of the demo world. Each cycle
  files fresh issues; a finished cycle's issues are retired.
- **Retired issue** — an issue from a finished demo cycle, closed as
  not-planned. Belongs to no lane; kept forever for the audit trail.
- **Operator note** — optional free-text context a human attaches at dispatch, for
  when the issue alone is missing something the human knows. Appended to the fixer
  agent's fixed prompt as added context; a bare go-word ("do it") attaches nothing
  and the fixed prompt runs untouched. Never a replacement for the fixed prompt.
- **Routing policy** — the rule deciding which lane an issue lands in. Policy, not
  AI: validated bug classes autofix, everything else queues. Widening the policy as
  trust builds is the engagement's growth story.
- **Chat** — the single surface built in Stage 2: a messaging-app-style page where the
  operator commands the pipeline and sees its state. Stands in for Slack/Telegram/LINE
  in the fiction; commands in, bot replies (cards) out.
- **System of record** — GitHub. Issues, PRs, diffs are always real and are inspected
  on GitHub's own UI. The chat shows status and links; it never re-renders or fakes
  the record.
- **Answer key** — the gitignored private notes (`harness/private/`) holding root
  causes, prompts, gestures, and rehearsal records. Never committed.
- **In-character authorship invariant** — every committed artifact is written as if
  the planted bugs are unknown to the author.
- **Demo gesture** — the one UI action that makes a bug (or its fix) visible to the
  audience in seconds.
- **Baseline** — the tagged repo state with bugs planted, logs seeded, suite green.
  **Reset** rewinds the code to it and starts a fresh demo cycle: the old cycle's
  issues are retired, and fresh issues are filed with clean timelines.
- **Rehearsal ritual** — reset → run → audit transcript; a bug is demo-ready only
  after this passes with the exact demo-day configuration.
