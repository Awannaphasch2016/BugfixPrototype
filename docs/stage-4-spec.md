# Stage 4 — The Platform Walkthrough (signal → precedent → role pipeline)

**Status:** `ready-for-agent`
**Tracker:** local (`docs/` is the tracker for build specs; GitHub Issues on this repo is reserved as demo scenery)
**Stage:** builds on Stage 3 (`docs/stage-3-spec.md`). Grounded in the grilling session of 2026-07-12; tool choices are justified in `docs/research/tool-stack-research.md` (primary-sourced, dated). Vocabulary per `CONTEXT.md` — new terms this stage: signal, signaling layer, problem class, precedent, context report, role agent, walkthrough.

## Problem Statement

The Stage 3 demo proves two things convincingly: fix quality (vague issue in,
merged PR out) and human judgment (the operator note). But the pitch has grown
wider than bug-fixing. The audience should leave convinced they watched a
narrow but honest sample of a full AI engineering platform — production
detecting its own defects, context engineered and sanitized before any agent
sees it, specialist agents collaborating with attributed artifacts, trust that
widens from approved history rather than configuration, and every agent action
inspectable after the fact. Today none of that is visible:

1. **No detection story.** Issues appear because `reset.sh` filed them. The
   audience never sees a defect become a work item.
2. **No orchestration story.** One fixer agent does everything; there is no
   plan, no independent review, no browser-verified proof on the PR.
3. **No governance story beyond the lanes.** The routing policy exists as
   narration, not as evidence the audience can inspect.
4. **No observability story.** The transcripts exist but nothing renders them.

Two constraints govern everything: a **~15-hour build budget**, and the
**cut-line rule** — if time runs out, the demo shown is the last milestone
that passed rehearsal, so build order must be a ladder of always-demoable
states sorted by evidence-of-agent-maturity per hour. The walkthrough script's
scenes are the scoping constraint: nothing is built that no scene requires.

## Solution

Extend the pipeline into a walkthrough of one defect's full lifecycle, built
as eight milestones (M1–M8) where every rung ends rehearsed and demoable.

**The arc:** the operator performs a trigger step — a deterministic action
that makes the reserved bug's error signature fire in the logs on cue. The
signaling layer (Grafana + Loki + Alloy locally; a narrated script fallback)
detects the signal, dedupes the noise, and routes it: a problem class with
precedent auto-dispatches; a novel class files an enriched issue for a human.
The filed issue carries a context report — the relevant log excerpt selected,
paths canonicalized, personal data visibly redacted. The attempt then runs as
a role pipeline: the planner posts its diagnosis to the issue *and* the runner
splices it additively into the fixer's prompt (the operator-note mechanism);
the fixer implements; the runner runs the gates (tests + lint) and posts a
red-on-baseline→green report to the PR; the tester agent reproduces the
symptom in a real browser via Playwright MCP and commits screenshots to the
PR branch; the reviewer agent and CodeRabbit comment post-hoc. A human merges
from the chat, informed by the reviews — and that merge is the precedent that
lets the next signal of this class route autonomously.

**Pacing:** the full role cast runs on every dispatch, and every agent wait is
a scripted scene — the Grafana dashboard while the planner runs, the rendered
trace while the fixer runs, the PR diff and gate report while the tester runs,
the runbooks/ADRs and the precedent ledger on later rounds. The waits are
where half the capabilities get seen; the walkthrough honestly runs 20–25
minutes and the narration schedule is itself rehearsed.

### Scene list (each scene names the rung it needs)

1. **Opening state** — chat shows the solved history, badges, and precedent
   labels; the audience sees trust already earned. *(M6)*
2. **Birth of an issue** — trigger step → signal fires → detection →
   dedupe → routed as novel → issue appears in chat carrying a context report,
   with the raw log beside it to show the redaction. *(M5, M7; M7 fallback:
   the same route invoked by script, narrated over the seeded log)*
3. **Full-cast dispatch** — operator dispatches; plan comment lands (wait:
   Grafana dashboard); commits and PR (wait: rendered trace, expanded tool
   calls); gate report (wait: PR diff); tester screenshots; reviewer +
   CodeRabbit comments; human merge; the app visibly heals. *(M1–M3)*
4. **Precedented dispatch** — a second bug whose class has precedent routes
   with no human at entry; waits showcase the runbook citations and ADRs the
   planner leaned on. *(M4, M6)*
5. **The judgment dispatch** — the Stage 3 request scene, unchanged: human
   knowledge the pipeline cannot have, supplied as an operator note. *(exists)*
6. **Close** — the precedent ledger one entry richer ("this class is now
   autonomous"), the repo maturity tour (docs, ADRs, research), roadmap via
   the mention-only tools. *(M4, M8)*

## User Stories

1. As an audience member, I want to watch an error in a running app become a
   GitHub issue with no human typing, so that I believe defect detection is
   real and not staged paperwork.
2. As an audience member, I want repeated firings of the same error to
   collapse into one issue, so that I believe the signaling layer filters
   noise rather than spamming the queue.
3. As an audience member, I want to see the raw log line next to the filed
   issue's context report, so that I can verify the personal data was redacted
   and the paths canonicalized before any agent saw them.
4. As an audience member, I want novel problem classes to visibly escalate to
   a human while precedented classes route autonomously, so that I understand
   trust is earned from approved history, not asserted by the AI.
5. As an audience member, I want the merge of a novel-class fix to visibly
   create the precedent that automates the next occurrence, so that the growth
   story demonstrates itself instead of being narrated.
6. As an audience member, I want to read a planner's diagnosis on the issue
   before any code changes, so that I see deliberate work, not a black box.
7. As an audience member, I want proof the plan actually fed the
   implementation, so that the orchestration is real rather than theater.
8. As an audience member, I want browser screenshots on the PR showing the
   symptom before the fix and its absence after, so that I trust the fix
   without reading the diff.
9. As an audience member, I want an independent reviewer's findings on the PR
   before a human merges, so that I see machine review informing human
   judgment.
10. As an audience member, I want a gate report on the PR showing the
    regression test red on baseline and green with the fix, so that I believe
    no unproven change can merge.
11. As an audience member, I want to watch the agent's live trace — tools
    called, files read, tests run — so that agent work feels inspectable, not
    magical.
12. As an audience member, I want the planner to cite the runbook or ADR it
    relied on, so that I see documentation actually steering the agents.
13. As an audience member, I want the waits between artifacts filled with the
    platform's own surfaces (dashboard, trace, diff, ledger), so that latency
    reads as depth instead of dead air.
14. As an operator, I want a trigger step that fires the reserved bug's error
    signature deterministically on cue, so that the detection scene cannot
    stall on stage.
15. As an operator, I want the signal route invocable by script without
    Grafana running, so that the detection scene has a rehearsed fallback.
16. As an operator, I want every dispatch to run the same full role pipeline,
    so that the audience never sees two visibly different pipelines and asks
    which one is the real product.
17. As an operator, I want the reviewer to comment exactly once with no
    revision loop, so that a dispatch's wall clock stays predictable on stage.
18. As an operator, I want each milestone to leave the demo whole and
    rehearsed, so that wherever the clock stops, I still have my best demo.
19. As an operator, I want the narration schedule rehearsed alongside the
    runs, so that I know what I am showing during every wait.
20. As an operator, I want the chat to surface the new artifacts (auto-filed
    issues, trace links, gate reports) as cards, so that the single-surface
    story from Stage 2 survives the new machinery.
21. As a consultant (repo visitor after the pitch), I want ADRs, coding
    standards, runbooks, and the tool research committed in-repo, so that the
    repository itself communicates engineering maturity.
22. As a consultant, I want rejected tools recorded with reasons, so that the
    tool choices read as diligence rather than fashion.
23. As a future implementer (agent or human), I want niche tool knowledge
    captured as project skills at the milestone that needs it, so that no
    later session relearns Alloy configs or MCP flags from scratch.
24. As the fixer agent, I want the planner's output spliced between the bug
    report and my contract — added context, never a replacement — so that my
    rehearsed contract still governs the attempt.
25. As the demo world's fiction, I want runbooks and ADRs authored as if the
    planted bugs are unknown, so that the in-character authorship invariant
    holds across every new committed artifact.
26. As an implementer, I want a runner replay mode fed by an agent-output
    cache of rehearsal-certified fixes, so that iterating on everything
    downstream of generation (staging, posting, gates, traces, chat cards)
    takes seconds instead of minutes of agent latency per attempt.
27. As an operator, I want any run I cannot afford to risk live to be
    pre-run for real shortly before the demo and presented as the fresh
    history it genuinely is, so that reliability never has to be bought with
    a faked live run.

## Implementation Decisions

- **Adopted tools (research-backed):** CodeRabbit (automated PR review, free
  on public repos); role-agent templates vendored into the Claude Code agents
  directory from Anthropic's pr-review-toolkit/feature-dev and the
  wshobson/agents collection; Playwright MCP for the tester; Microsoft
  Presidio for redaction; daaain/claude-code-log to render transcripts;
  Grafana + Loki + Alloy (fully local) for the signaling showpiece; GitHub
  labels as the precedent ledger. Everything else in the research doc is
  mention-only or rejected there.
- **Routing lives behind a chat-app route.** The Grafana alert webhook POSTs
  to the chat backend; the same route is invocable by a harness script (the
  trigger step's fallback and the test entry point). Routing logic: dedupe
  (an open issue for the same signature absorbs repeats), precedent check
  (does a closed-as-completed issue with the same problem-class label have a
  merged fix-branch PR?), then route — auto-dispatch, or file with a
  needs-human label.
- **Precedent = labels on the system of record.** A problem-class label on
  issues; precedent exists when a completed issue of that class has a merged
  fix. No database — the audit trail is the trust ledger. Seeded initial
  precedents ride the reset ritual; who first classified them is deliberately
  unspecified.
- **Planner feeds fixer additively.** The planner's output is spliced into
  the fixer prompt between the bug-report section and the contract, exactly
  the operator-note mechanism. The same text is posted to the issue as the
  plan comment. This changes the fixer's input shape once and voids all
  rehearsal records once; every milestone's rehearsal recertifies.
- **Reviewer is post-hoc.** One pass, findings posted as PR comments to
  inform the human's merge decision. The revision loop is roadmap, gated on
  the same trust principle as the lanes.
- **Gates run in the runner.** Tests + lint execute inside the run, and the
  runner posts a formatted gate report to the PR, including the regression
  test's red-on-baseline→green result. No GitHub Actions until the demo is
  proven end-to-end (functionality precedes looks-and-feel).
- **Tester evidence is committed, not attached.** Screenshots go onto the PR
  branch and are embedded in the PR body by URL — the GitHub CLI cannot
  upload images to comments.
- **Trace rendering is static and local.** Transcripts already saved by the
  runner are rendered to HTML per attempt; the chat links to them. No cloud
  tracing; LangFuse/Phoenix are the named production swap-ins.
- **Context pipeline is a pure module.** Log lines in; selected excerpt,
  canonicalized paths, and redaction spans out. Presidio is invoked at the
  command boundary; its models (and Playwright's browsers, and the reranker
  if ever adopted) are downloaded at setup time, never on demo day.
- **Dual issue entry.** One reserved bug (chosen at implementation from the
  answer key; the natural candidate is the bug whose diagnosis is genuinely
  log-driven) enters live via the signaling layer; the remaining bugs and the
  request stay pre-filed by reset with their rehearsed texts unchanged.
- **Milestone ladder is the build order** (M1 role pipeline → M2 trace +
  gates → M3 tester → M4 docs corpus + citations → M5 context report → M6
  precedent routing → M7 Grafana → M8 polish), sorted by agent-maturity
  evidence per hour; the Grafana rung sits nearest the cut line because it
  is the most hours, the least agent evidence, and the only rung with a
  built-in fallback.
- **Project skills are authored just-in-time** at the milestone that needs
  them: role-agents, playwright-mcp-localhost, presidio-redaction,
  grafana-loki-local, and demo-ops (reset/setup/rehearsal ritual, recovery
  ladder, narration schedule).
- **Agent-output cache + replay mode.** After a run passes the rehearsal
  ritual, its fix is captured as a patch against the baseline tag plus its
  transcript, keyed by answer-key bug title (issue numbers change every
  cycle; titles and the tagged baseline don't), stored with the answer key —
  never committed. The runner gains a replay mode: apply the cached patch and
  transcript instead of spawning the fixer; branch, commit, push, PR, gates,
  and comment posting all run for real. Not `git stash` — a stash is mutable
  workspace state that dies with the clone; patch files against a tag are
  durable and survive resets. Two hard rules: replay never substitutes for
  live certification (a cached fix is evidence about the prompt that produced
  it, so any prompt-shape change invalidates replay as proof), and a replayed
  run is never presented to an audience as live — the record-is-real
  invariant. Demo-day insurance is the honest variant: pre-run for real
  before the audience arrives and present as history (the setup pre-run
  pattern, generalized).
- **In-character authorship extends to the new corpus.** Runbooks, ADRs, and
  coding standards are written as if the planted bugs are unknown; they are
  both demo evidence (documentation-driven development) and the planner's
  retrieval corpus.

## Testing Decisions

- A good test asserts external behavior at a seam, never implementation
  detail. Two seams carry everything deterministic:
- **Chat route handlers with stubbed external commands** (prior art: the
  existing chat route tests with stub scripts injected via environment
  variables). The webhook/routing route is tested for: dedupe absorbs a
  repeat signature; precedent present routes to dispatch; precedent absent
  files with the needs-human label; redaction command failure fails safe
  (no issue filed with unredacted content).
- **The pure context-pipeline module** (new, function-level): deterministic
  selection, canonicalization, and redaction-span output under vitest, no
  subprocesses.
- **Agent behavior is certified by the rehearsal ritual, not unit tests:**
  reset → run → transcript audit, per bug, with the exact demo-day
  configuration — extended this stage to audit role artifacts (plan comment
  present and spliced, gate report on the PR, screenshots present, reviewer
  commented once) and the narration schedule. Prior art: the Stage 3
  re-rehearsal pass, including its byte-diff verification of prompt
  composition through stubbed commands.
- Runner changes are proven by rehearsal, as `run.sh` always has been; the
  demo-app's own suite stays in-character and untouched by harness tests.
- **Replay mode is the iteration fixture** for all downstream runner and chat
  work: it sits between the full stub scripts (chat-route tests) and a live
  run — canned agent, real everything-else. Build-time iteration uses it;
  certification never does. The rehearsal ritual always runs live.

## Out of Scope

- The reviewer→implementer revision loop (roadmap; trust-gated).
- GitHub Actions workflows, decorative or otherwise, until the demo is proven.
- Confidence scoring / AI self-assessment routing — routing is precedent-only.
- Cloud tracing (LangFuse/Phoenix), Linear/Notion mirrors, hosted rerankers,
  promptfoo/Ragas eval suites, Zed/ACP replay — all mention-only, per the
  research doc.
- A knowledge-chat command in the chat surface — no scene requires it.
- The project's new name, README rewrite, and any rebranding (M8 polish, after
  the demo is proven; the deprecated name persists until then).
- Multi-repo topologies, real production deployment, second GitHub accounts.

## Further Notes

- **Budget:** fixture ≈ 0.75h, M1 ≈ 3.5h, M2 ≈ 1.5h, M3 ≈ 1.5h, M4 ≈ 2h,
  M5 ≈ 2h, M6 ≈ 1.5h, M7 ≈ 3.5h — ≈ 16h before M8. The overrun lands on M7
  by design. The fixture is spend on every subsequent rung, not on one: each
  rung's downstream iteration rides replay mode, so its cost amortizes across
  the whole ladder (and later rungs' estimates assume it exists).
- **Fallback ladder:** M7 degrades to the script-invoked route narrated over
  the seeded log; every scene survives.
- **Demo-day gotchas imported from the research doc:** CodeRabbit skips draft
  PRs by default (the runner opens PRs ready — keep it so); pre-download all
  local models and browsers at setup; Promtail is EOL — Loki configs must use
  Alloy; plain non-bare agent invocation uses CLI login while bare mode needs
  an API key and explicit MCP config.
- **Rebaseline discipline:** the demo-baseline tag must move forward over
  this stage's harness/docs commits before any reset (Stage 3's tag-move trap
  applies; after setup has auto-merged, cherry-pick construction only).
- The walkthrough runs 20–25 minutes honestly; the Stage 3 runbook's
  choreography grows a narration schedule column per scene.
