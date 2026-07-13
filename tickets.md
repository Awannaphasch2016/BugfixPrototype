# Tickets: Stage 4 — the platform walkthrough

Builds `docs/stage-4-spec.md`: the signal→precedent→role-pipeline extension,
as a milestone ladder where **every finished ticket leaves the demo whole,
rehearsed, and strictly better** — the cut-line rule: wherever the clock
stops, the last green rung is the demo. (Stage 3's tickets shipped and were
certified 2026-07-12; see git history and the answer key's rehearsal records.)

Work the **frontier**: any ticket whose blockers are all done. Here that is
ticket 1, then 1b, then the ladder in order — the order *is* the priority.

## 1. Rebaseline demo-baseline over the Stage 4 docs commits

**What to build:** running `harness/reset.sh` stays safe. The research doc,
glossary additions, this spec, and these tickets are (or are about to be)
committed to main; the `demo-baseline` tag must move forward over them before
any reset. Follow the runbook's rebaseline procedure (cherry-pick
construction — never fast-forward once a cycle's autofix is on main).

**Blocked by:** None — can start immediately.

- [ ] Tag contains every harness/docs commit on main; demo-app tree identical
      to the previous tag's.
- [ ] A reset after this ticket would delete nothing from main.

## 1b. Replay fixture — the agent-output cache

**What to build:** the 10x iteration tool for every rung below. Capture: after
a run passes the rehearsal ritual, save its fix as a patch against the
`demo-baseline` tag plus its transcript, keyed by answer-key bug title, into
the answer key's cache directory (gitignored with the rest). Seed the cache by
capturing from the existing certified Stage 3 rehearsal PRs. Replay: the
runner gains a mode flag that applies the cached patch and copies the cached
transcript instead of spawning the fixer — branch, commit, push, PR, gates,
and comment posting all run for real. Two hard rules from the spec: replay
never certifies (rehearsal is always live, and any prompt-shape change makes
cached fixes stale as evidence), and a replayed run is never presented as
live — pre-run-for-real-and-show-as-history is the honest demo-day variant.

**Blocked by:** 1.

- [ ] Capture script produces patch + transcript keyed by bug title; cache is
      gitignored.
- [ ] A replay run on a fresh cycle yields a real PR whose diff matches the
      cached fix, in well under a minute of wall clock, with no agent
      invocation.
- [ ] Replay mode is impossible to trigger without the explicit flag (a
      normal dispatch can never silently replay).

## 2. M1 — Role pipeline (planner feeds fixer, reviewer post-hoc, CodeRabbit)

**What to build:** the attempt becomes a staged pipeline with attributed
artifacts. Vendor planner/reviewer(/debugger) templates into the agents
directory (Anthropic pr-review-toolkit/feature-dev, wshobson/agents; keep
licenses). The runner gains stages: planner runs first, its output posted to
the issue as an attributed plan comment AND spliced additively into the fixer
prompt between the bug report and the contract (operator-note mechanism —
note, when present, stays alongside). Fixer runs as today. After the PR
opens, the reviewer agent posts findings as PR comments — once, no revision
loop. Install the CodeRabbit GitHub App (PRs open ready, never draft).
Author the `role-agents` project skill. **This voids all rehearsal records:**
re-rehearse all four scenarios under the new prompt shape and update the
answer key's records — live runs, never replay (the cached fixes are evidence
about the old prompt; recapture the cache from the new certified runs).
Iterate the staging/posting/splice mechanics in replay mode first, so live
runs are spent on certification, not debugging.

**Blocked by:** 1, 1b.

- [ ] Plan comment appears on the issue before any commit exists; PR body or
      transcript proves the same plan text rode in the fixer's prompt
      (byte-diff through stubbed commands, Stage 3 pattern).
- [ ] Reviewer comments exactly once per PR; CodeRabbit reviews arrive on a
      real PR.
- [ ] All four scenarios one-shot under the new prompt shape; transcripts
      audited; rehearsal records updated; run times recorded (wall clock per
      stage — the narration schedule needs them).
- [ ] `role-agents` skill exists with the invocation + artifact-posting
      recipe.

## 3. M2 — Trace page and gate report

**What to build:** observability and gates become visible. Each attempt's
saved transcript is rendered to static HTML (claude-code-log) and the chat's
PR card links to it. The runner runs the demo-app's tests + lint as explicit
gates and posts a formatted gate report to the PR: suite counts, lint result,
and the regression test red-on-baseline → green-with-fix line.

**Blocked by:** 2.

- [ ] Every rehearsed attempt yields a browsable trace with expandable tool
      calls, linked from the chat.
- [ ] Gate report present on a rehearsed PR with the red→green line.
- [ ] A gate failure aborts before push (extends the runner's existing
      fail-clean contract).

## 4. M3 — Tester role via Playwright MCP

**What to build:** the tester agent drives the locally running demo app in a
real browser: reproduces the reported symptom on the baseline, verifies its
absence with the fix, and the runner commits the screenshots to the PR branch
(evidence directory) and embeds them in the PR body by URL. Playwright
browsers download at setup, never demo day. Author the
`playwright-mcp-localhost` skill.

**Blocked by:** 2 (runs inside the staged pipeline).

- [ ] A rehearsed PR shows before/after screenshots inline in its body.
- [ ] Tester stage wall clock recorded; full-cast dispatch total measured
      against the 20–25 minute walkthrough budget.
- [ ] Rehearsal transcript audit: tester touched only the app under test.

## 5. M4 — Docs corpus and planner citations

**What to build:** documentation-driven development becomes retrievable
evidence. Author, in character (bugs unknown), the corpus: operational
runbook(s), 2–4 ADRs (real decisions this repo made: routing-by-precedent,
gates-in-runner, system-of-record), and coding standards. The planner's
stage instructs it to consult the corpus and cite the section that guided
its plan; citation appears in the plan comment.

**Blocked by:** 2.

- [ ] Corpus committed; in-character authorship audit passes (no bug
      knowledge leaks).
- [ ] A rehearsed plan comment cites a real runbook/ADR section that
      plausibly guided the diagnosis.

## 6. M5 — Context report (pure module + Presidio)

**What to build:** the context-pipeline module: log lines in → selected
excerpt, canonicalized paths, redaction spans out — pure, vitest-tested.
Presidio invoked at the command boundary (spaCy model pre-downloaded at
setup). A harness filing script composes the context report into an issue
body (raw-vs-redacted visible) — this script is scene 2's fallback entry.
Seed the demo-app logs with fake personal data for the redaction beat to bite
on. Author the `presidio-redaction` skill.

**Blocked by:** 1 (parallel with 2–5 if hours allow, but the ladder order
governs when it must be *green*).

- [ ] Module tests: selection, canonicalization, redaction spans
      deterministic; redaction-command failure fails safe (no unredacted
      issue).
- [ ] A manually filed issue shows the context report with visible
      redactions; raw log line demonstrably dirtier.

## 7. M6 — Precedent routing behind the chat route

**What to build:** the routing policy becomes code and ledger. A chat-backend
route accepts a signal (webhook-shaped; also invocable by the harness
script), dedupes against open issues by signature, checks precedent (a
completed issue with the same problem-class label and a merged fix-branch
PR), and routes: auto-dispatch, or file with needs-human. Problem-class
labels join the reset/setup ritual so the opening state shows seeded
precedent. Chat surfaces auto-filed issues as cards.

**Blocked by:** 6.

- [ ] Route-seam tests (stubbed commands, Stage 3 prior art): repeat
      signature absorbed; precedented class dispatches; novel class files
      needs-human; ledger read is from labels only.
- [ ] Rehearsed scene: trigger step → script-invoked route → issue born in
      chat → routed correctly both ways (with and without seeded precedent).
- [ ] Merging the novel-class fix makes the same signature route autonomous
      on the next firing (the growth story, rehearsed).

## 8. M7 — Grafana + Loki + Alloy showpiece

**What to build:** the live detection scene's real front end. Alloy tails the
demo-app log into Loki; a Grafana dashboard shows the planted signature
firing; a Grafana alert POSTs the signal to the routing route. Fully local,
nothing downloaded on demo day. Author the `grafana-loki-local` skill.
**Fallback stays rehearsed:** if this rung is cut or flakes, scene 2 runs on
the script-invoked route narrated over the seeded log.

**Blocked by:** 7.

- [ ] Trigger step → dashboard shows the firing → alert → issue in chat,
      end-to-end on localhost, rehearsed twice.
- [ ] The fallback path remains green after all M7 changes.

## 9. Walkthrough certification — the demo-ready gate

**What to build:** the Stage 4 equivalent of Stage 3's re-rehearsal pass.
Move the tag forward over all Stage 4 commits. Full ritual: reset; setup
(seeded precedents present); every scene in spec order with the narration
schedule (what is on screen during every wait), wall clocks recorded;
transcript audits per attempt (role artifacts present, no out-of-bounds
reads). Author the `demo-ops` skill (ritual, recovery ladder, narration
schedule). Update runbook, choreography, and rehearsal records. Until green,
the demo is the last certified rung.

**Blocked by:** the highest completed rung (certify whatever the ladder
reached — this ticket runs even if the cut line fell at M3).

- [ ] Every built scene rehearsed end-to-end with narration schedule;
      total wall clock within 25 minutes.
- [ ] Demo-ready verdict recorded in the answer key with the rung reached.

## 10. M8 — Polish (only after certification)

**What to build:** looks-and-feel, explicitly last: the successor name +
README rewrite, decorative non-blocking GitHub Actions, any extra scenes.
Nothing here may touch the certified paths without re-certification.

**Blocked by:** 9.

- [ ] (deliberately empty until certification passes)
