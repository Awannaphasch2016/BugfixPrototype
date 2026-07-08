# Stage 1 — Verified Bug-Fix Pipeline (Local Runner)

**Status:** `ready-for-agent`
**Tracker:** local (`docs/` is the tracker for build specs; GitHub Issues on this repo is reserved as demo scenery)
**Stage:** 1 of 3 (prototype maturity ladder). Stage 2 = GitHub Actions + dashboard. Stage 3 = mocked periphery (Trello, Telegram, trace viewer, knowledge base).

## Problem Statement

I am pitching a bug-fixing pipeline as a consulting deliverable. The prospective client's decision-makers are C-suite, formerly technical, not current on AI capabilities. They will not sign based on claims; they need to *see* an AI agent take a vague bug report and produce a reviewed, provably correct fix on a codebase that feels real.

I have roughly five hours. Whatever is complete at the deadline is what gets demoed, so the first deliverable must be a self-contained floor: a demo that works end-to-end on its own, with no dependency on later stages.

Live AI demos fail in two characteristic ways I must design against: the agent whiffs live (nondeterminism), or the demo depends on slow/flaky external services. Additionally, if any artifact in the repo reveals the planted bugs (an answer key, a suspicious test suite, a telltale commit), the agent's "diagnosis" is fake and the demo is a rigged trick that a technical validator could expose.

## Solution

A single repo containing two worlds:

1. **`demo-app/`** — a small, real-feeling task-management web app (the fictional "client codebase"): a task list UI over an HTTP API, structured logging, a green test suite, and three pre-planted bugs of escalating severity, each visible in the UI via a scripted gesture. Its git history, tests, logs, and issue reports are all authored *in character* — as if written by a developer who doesn't know the bugs exist.

2. **`harness/`** — my tooling: a one-shot runner script that takes a GitHub issue number, runs the fixer agent (Claude Code, non-interactive) scoped to `demo-app/`, and then deterministically handles all git mechanics (branch, commit, push, open PR). Plus a reset script that rewinds the demo to its tagged baseline, and a gitignored private directory holding the answer key.

The demo loop per bug: show the bug in the UI → show the vague GitHub issue → run the runner → agent diagnoses (reading logs where required), writes a regression test (red), fixes the code (green) → PR opens with the diagnosis narrative → approve via native GitHub review → merge → show the UI fixed.

Every bug is verified **one-shottable** before demo day by a rehearsal ritual (reset → run → audit the transcript), so the live demo replays a known-good path rather than gambling on a cold run.

## User Stories

1. As the demo operator, I want a task-management app with a visible UI, so that a non-technical audience can see each bug happen and see it fixed.
2. As the demo operator, I want each planted bug to have a one-action demo gesture in the UI, so that "before" and "after" are unmistakable in seconds.
3. As an audience member (C-suite, ex-technical), I want to see the bug reported the way my team reports bugs (a vague issue), so that the demo feels like my reality, not a lab setup.
4. As the demo operator, I want the three bugs to escalate in felt severity (wrong list → data corrupted → data gone), so that the demo builds tension toward the headline fix.
5. As the demo operator, I want the headline bug to be diagnosable *only* by reading the application logs, so that the demo proves the agent investigates like an engineer rather than pattern-matching code.
6. As the fixer agent, I want the issue text to state where application logs live, so that log-based diagnosis is discoverable without hints that give away the cause.
7. As the demo operator, I want a single command that takes an issue number and produces an open PR, so that triggering a fix live is one visible, narratable action.
8. As the demo operator, I want the runner — not the agent — to perform all git operations, so that no plumbing step can fail nondeterministically mid-demo.
9. As the demo operator, I want the fixer agent restricted to reading and editing only the demo app and running its tests, so that it cannot see harness code, specs, or anything out of character.
10. As the demo operator, I want the agent's PR to include both the fix and a new regression test that fails before the fix and passes after, so that the PR carries its own proof.
11. As an audience member, I want the PR description to narrate the diagnosis (citing the specific log lines for the log bug), so that I understand *how* the agent found the cause, not just that it did.
12. As the demo operator, I want to approve each fix through GitHub's native PR review, so that human-in-the-loop is shown with a tool the audience already trusts.
13. As the demo operator, I want fixes applied in demo order (1 → 2 → 3) with each merged before the next run, so that earlier regression tests protect later fixes that touch the same code paths.
14. As the demo operator, I want the baseline test suite green despite the planted bugs, so that the agent's first test run doesn't hand it the diagnosis and the repo doesn't look broken.
15. As the demo operator, I want every committed artifact (tests, comments, commit messages, log content) authored as if the bugs were unknown, so that neither the agent nor a sharp client can infer the answers from suspicious negative space.
16. As the demo operator, I want the full answer key (root causes, expected fixes, verified prompts, demo gestures, rehearsal records) in a gitignored private file, so that I can rehearse and narrate confidently while the pushed repo stays answer-free.
17. As the demo operator, I want a one-command reset that rewinds the repo (local and GitHub) to the tagged buggy baseline and closes open PRs, so that I can rehearse repeatedly and re-run the demo for future clients.
18. As the demo operator, I want each bug verified one-shottable via rehearsal before demo day, with the transcript audited (did it read the logs? did it peek outside the demo app? did it exploit test-coverage gaps?), so that the live run replays a proven path.
19. As the demo operator, I want realistic log noise (healthy traffic interleaved with the bug's signature), so that finding the signal is a genuine — but tractable — investigation.
20. As the consultant, I want the harness cleanly separated from the demo app, so that the harness becomes a reusable asset for future client demos with a swapped-in demo app.
21. As the demo operator, I want a recorded successful run as a fallback, so that a network or service failure in the room cannot kill the pitch.

## Implementation Decisions

- **Topology:** one repo, two worlds. `demo-app/` is the fictional client codebase and the only thing the fixer agent may touch. `harness/` holds the runner, reset tooling, and the gitignored `harness/private/` directory. `docs/` holds build specs (this file). Build specs are never GitHub issues — the repo's issue list is demo scenery containing exactly the three bug reports.
- **Demo app stack:** Next.js (App Router) + TypeScript, chosen for Vercel-native deployment later. UI is one page — task list with All/Active/Done tabs, a done-checkbox, inline title edit, due-date badge — deliberately minimal, styled with Tailwind. Storage is a simple local persistence layer (file/SQLite-class; whatever is idiomatic and fast) behind the API.
- **The UI renders truth and never contains a bug.** All three bugs are server-side, each localized to one or two modules with a fix of a few lines. This keeps every bug inside the one-shot envelope and makes the UI the impartial before/after witness.
- **Logging:** Pino, NDJSON, standard levels, `err` serialization, child loggers stamping per-request context. In local dev it writes to a log file inside the demo app, committed at the baseline. A seed script drives realistic traffic (mostly healthy, some tripping the bugs) against the running buggy app so log content is authentic app output, not hand-written fiction. No log database or service — the agent interrogates the file with its own tools (grep/jq); that interrogation, visible in the transcript, is a demo beat.
- **Bug definitions live only in the answer key** (`harness/private/bugs.md`, gitignored — created alongside this spec). This spec deliberately describes only their shape: three server-side bugs — (1) a wrong list-filtering comparison, code-diagnosable, the warm-up; (2) a partial-update handler that clobbers an unrelated field, requiring data-flow reading; (3) a silently swallowed validation error that drops writes for a particular payload shape, logged at error level but returning success — diagnosable only via the log signature, the headline. The answer key holds root causes, target modules, log signatures, verbatim issue texts, demo gestures, the verified prompt, and rehearsal records.
- **In-character authorship invariant:** every committed artifact is authored from the fiction in which the bugs are unknown. Bugs enter inside plausible feature commits (no commit ever names or isolates a bug); issue texts are vague PM prose; test coverage is organically partial (happy paths covered, gaps scattered — the bug paths are three gaps among many, never annotated with skips or TODOs); log noise is generated, not curated.
- **Runner:** a one-shot script — input: issue number; output: an open PR — with this deterministic sequence: fetch issue via `gh` → create a fix branch → invoke `claude -p` non-interactively with the fix prompt, working directory set to `demo-app/` → on success, commit (message derived from the agent's summary), push, and open the PR with a body containing the agent's diagnosis narrative. The agent's toolset is restricted to read/edit within the demo app and running its test suite; it performs no git operations. Exit non-zero, cleanly, if the agent fails — no partial pushes.
- **Isolation layers:** working-directory scoping to `demo-app/`, plus deny rules in the demo app's Claude settings blocking reads/edits outside it. Accepted residual risk: Bash side-doors are not fully blocked; this is acceptable because the answer key is absent from the repo entirely — there is nothing worth leaking. No effort is spent on airtight sandboxing.
- **Human-in-the-loop:** GitHub's native PR review/approve/merge. No custom approval UI in this stage.
- **Trigger:** explicitly human-initiated (run the script). No auto-trigger on issue-open, no watcher daemon. The same script becomes the payload of the Stage 2 GitHub Action and the Stage 2 dashboard button.
- **Baseline & reset:** the finished buggy state (bugs planted, logs committed, suite green) is tagged as the demo baseline. A reset script force-resets the mainline to the tag, force-pushes, and closes open PRs — rewinding both local and GitHub state. The initial publish pushes the entire repo (minus gitignored files) to GitHub; per-fix pushes are fix branches only.
- **Verification ritual (the definition of done for each bug):** reset → file/confirm the issue → run the runner → the PR's regression test goes red-then-green → transcript audit confirms: logs consulted (bug 3), no reads outside the demo app, no coverage-gap archaeology, no answer-key knowledge. Result recorded in the answer key. A bug is not demo-ready until this passes; if the agent shortcuts (e.g., diagnoses the log bug without the logs), the bug is redesigned until the intended road is load-bearing.
- **Credentials:** none new for this stage. The Codespaces-provided GitHub token covers issues/branches/PRs/force-push on this repo (verify once; PAT via Doppler as fallback). The fixer agent uses the already-authenticated local Claude Code CLI.

## Testing Decisions

- **One seam for the demo app: the HTTP API.** All automated tests attach at route-handler level (Vitest) — request in, response/state out. No tests attach to internals; refactors behind the seam must not break tests. The UI is a consumer of the same seam and gets no automated tests — it is verified manually via the three scripted demo gestures.
- **A good test here asserts externally observable behavior** (status codes, response bodies, subsequent reads reflecting writes) and never implementation details (function names, internal call order, storage layout).
- **The baseline suite is green and organically partial** — it covers healthy behavior, leaves the bug paths untested among other natural gaps, and contains no trace of bug awareness (in-character authorship). Coverage should look like a real small team's suite, not an exhaustive one with three suspicious holes.
- **The fixer agent authors the regression tests.** Each fix PR adds the missing test at the same HTTP seam: demonstrably red against the buggy baseline, green after the fix. These tests accumulate across the demo sequence, protecting later fixes that touch shared code paths (bugs 2 and 3 share a handler).
- **The runner is tested at its command-line seam by the rehearsal ritual itself** — reset, run against a real issue, inspect the PR and transcript. No unit tests for runner internals in this stage; the ritual runs at least three times per bug anyway.
- **Prior art:** none — this is the repo's first code. This spec's decisions establish the conventions.

## Out of Scope

- The dashboard (pipeline view and trigger button) — Stage 2.
- GitHub Actions / `@claude` in CI — Stage 2 (the runner is written so the Action wraps it without change).
- Trello integration (dumb-copy or enrichment agent), Telegram bot, knowledge-base panel, AI trace viewer, Datadog-style log viewer UI — Stage 3, mocked.
- Real external services: Datadog, Notion, Arize Phoenix, real Trello/Telegram wiring — post-prototype roadmap.
- Vercel deployment (the stack is chosen for it, but the demo runs locally; the file-based log is a local-dev convenience that must be swapped for a drain when deployment happens).
- Auto-trigger on issue-open, watcher daemons, custom approval UI, two-repo split (kept as a cheap later refactor), airtight agent sandboxing, DuckDB-class log querying.
- Fixing bugs beyond the three planted ones; multi-file/race-condition "harder" bugs.

## Further Notes

- **Time budget:** this stage is the must-finish floor of a ~5-hour window. Build order: demo app (API → UI → logging) → plausible-history seeding with bugs → seed traffic & commit logs → baseline tag → runner → reset script → verification ritual per bug → initial publish → file the three issues.
- **Demo choreography (per bug):** UI shows the bug → vague issue on screen → run the fix → narrate the agent's investigation → PR: glance at diff, regression test, and (bug 3) cited log lines → approve & merge → UI shows it fixed. Product-truth bookends; plumbing kept brief.
- **The one-shot goal is also a measurement:** each stage of this project is deliberately sized to be one-shottable by a coding agent, partly to learn current model limits. Rehearsal records in the answer key double as that data.
- **Reusability lean:** keep the harness generic where free (issue number in, PR out; nothing demo-app-specific hardcoded beyond a config point for the target directory), since the harness outlives this client as the pitch asset. Do not over-engineer for this — a config constant is enough.
- **Environment note:** development happens in GitHub Codespaces; secrets, when needed, come from Doppler. Stage 1 requires none beyond what the environment provides.
