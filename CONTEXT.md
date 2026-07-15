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
- **Request** — a filed issue whose complaint is not a defect: nothing is
  planted, nothing is broken; only the in-character complaint text is authored.
  Contrast with a planted bug, which has a root cause, a log signature, and a
  failing test waiting to be written. (Distinct from a build ticket on the
  `docs/` tracker — requests are demo scenery on GitHub Issues.)
- **Operator note** — optional free-text context a human attaches at dispatch, for
  when the issue alone is missing something the human knows. Added to the fixer
  agent's fixed prompt as reporting context and posted to the issue as a comment,
  so the judgment enters the record; an empty field attaches nothing and the fixed
  prompt runs untouched. Never a replacement for the fixed prompt.
- **Routing policy** — the rule deciding where a signal's work lands: problem
  classes with precedent go to the autofix lane; novel classes escalate to a human.
  Widening trust through accumulated precedent is the engagement's growth story.
  (Superseded the hand-maintained bug-class allowlist, 2026-07-12.)
- **Signal** — a detected anomaly in the monitored logs — an error signature
  firing — upstream of any issue. The signaling layer's unit of work.
- **Signaling layer** — the monitoring path that turns raw logs into routed work:
  detects signals, filters noise (repeats collapse into one), and routes each
  signal — autofix, enriched issue, or page-a-human.
- **Problem class** — the kind of defect a signal represents; the unit at which
  the pipeline accumulates trust.
- **Precedent** — a human-approved merged fix of a problem class: the evidence
  that lets later signals of that class route to the autofix lane. The demo's
  opening state seeds initial precedents; who first classified them (human or
  agent) is deliberately unspecified.
- **Context report** — the enriched summary attached to an auto-filed issue
  before agent handoff: relevant log excerpt selected, paths canonicalized,
  personal data visibly redacted.
- **Role agent** — a named specialist agent (planner, implementer, tester,
  reviewer, debugger) the runner invokes per stage of an attempt; each leaves an
  attributed artifact (comment, commit, review, screenshot) on the issue or PR.
- **Walkthrough** — the audience-facing demonstration: one defect's full
  lifecycle end-to-end, with every platform capability visible as a step or an
  artifact along the way. The demo is a deliberately narrow but honest sample of
  the full platform.
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
- **Trigger step** — the scripted, deterministic action that makes a reserved
  bug's error signature fire in the logs on cue, so the audience watches
  detection, routing, and issue-filing happen live. A demo gesture aimed at the
  signaling layer instead of at the audience's eyes.
- **Scene** — one beat of the walkthrough script, written as a user story. The
  scene list is the scoping constraint: nothing is built that no scene requires.
- **Baseline** — the tagged repo state with bugs planted, logs seeded, suite green.
  **Reset** rewinds the code to it and starts a fresh demo cycle: the old cycle's
  issues are retired, and fresh issues are filed with clean timelines.
- **Rehearsal ritual** — two legs, in order. Leg 1, certification: reset → live
  runs → transcript audit; the only leg that certifies agent output and fills
  the agent-output cache; re-run whenever the cache goes stale (any prompt- or
  stage-shape change). Leg 2, dress rehearsal: reset → the replayed walkthrough
  end-to-end with the exact demo-day configuration, clocks recorded. A scene is
  demo-ready only after both legs pass; replay never certifies.
- **Agent-output cache** — the answer-key store of rehearsal-certified fix
  patches and their transcripts, keyed by answer-key bug title and attempt.
  Every entry declares the state its patch applies to: the baseline for a
  first attempt; the baseline plus the prior fix for a follow-up attempt
  (replay order is enforced by the routing policy, which only reaches a
  follow-up after the first fix merged). Captured only from runs that passed
  the rehearsal ritual.
- **Replay mode** — the runner mode that applies a cached patch and transcript
  instead of spawning the fixer agent, while everything downstream (git, PR,
  comments, gates) runs for real. A development, pre-run, and on-stage tool; a
  replayed run is never presented as live *generation* — the audience is told
  the agent work is certified cache and the machinery is live. The record stays
  real; replay never certifies. (Presentation rule amended 2026-07-13,
  superseding "never shown to an audience"; see ADR-0004.)
- **Replay variables** — the coordinates in cached prose that capture
  normalizes and replay resolves from the fresh cycle's own record:
  `{{issue}}`, `{{precedent}}`, `{{precedent_sha}}`, `{{today}}`,
  `{{fresh_reqid}}`. A reference qualifies only if replay can resolve its
  fresh value deterministically with no operator input; judgment prose is
  never rewritten, and frozen-world dates (the agents' reachable world at
  the tag: baseline demo-app content and the project skills) pass the
  coherence lint verbatim. (ADR-0005, superseding ADR-0004's
  only-the-self-pointer clause.)
