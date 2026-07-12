# Stage 3 — The Judgment Dispatch (operator note + request #4)

**Status:** `ready-for-agent`
**Tracker:** local (`docs/` is the tracker for build specs; GitHub Issues on this repo is reserved as demo scenery)
**Stage:** builds on Stage 2 (`docs/stage-2-spec.md`) and Stage 2b (`docs/stage-2b-spec.md`). Resolves every open question in `docs/stage-3-handoff.md` and supersedes it. Also supersedes two previously decided lines, each with new information recorded below: the handoff's go-word normalization (decision 3 there) and the Stage 2b line bundling the Decline flow into Stage 3.

## Problem Statement

The Stage 2 floor dispatches an attempt with zero human context: the agent works
from the issue alone. That leaves the pitch without an answer to the question
every client asks — "what if the bot needs to be told something only we know?" —
except as a roadmap deferral. Two concrete gaps:

1. **No judgment channel.** A subjective complaint (a color preference) is
   unfixable by the pipeline: the answer exists in no issue, log, or file. The
   demo cannot show the human supplying it.
2. **The prompt contract is unsatisfiable for presentational reports.** The
   fixed contract demands a route-seam regression test that fails for the
   reported reason; a styling change has no such test, and an agent forced to
   produce one will thrash or fabricate.

Framing that governed every trade-off below: the prototype exists to **show
features**, not implementation correctness or expressiveness.

## Solution

Add the **operator note**: clicking Fix-this now expands the issue card in
place to an optional free-text field plus a Dispatch button. An empty field
dispatches exactly as today — the rehearsed prompt, byte-identical. Any typed
text is a note: it is posted to the issue as a comment (the judgment enters
the record), passed to the runner as an optional second argument, and spliced
into the fixed prompt as a "note from the team" section between the bug
report and the `## Your job` contract. One sentence is added to the contract
letting a styling-only fix justify, in its mandatory `## Regression test`
section, why no route-seam test applies.

The demo of the feature is **request #4**: a fourth demo-cycle issue, filed
fresh by reset each cycle like the three bugs, whose complaint is a vague,
subjective gripe about the todo list's readability. Nothing is planted; only
the in-character complaint text is authored. On demo day the operator pastes
the rehearsed note — "use green for the text in the todo list" — and the
agent does the rest.

Any edit to the fixed prompt voids the rehearsed guarantee, so the feature is
demo-gated behind a **full re-rehearsal pass**; if that pass is not green by
demo day, the demo runs on the Stage 2 floor and the note stays a roadmap
line.

## User Stories

1. As the demo operator, I want Fix-this to expand the card to an optional
   context field + Dispatch, so that I can attach judgment at the moment of
   dispatch.
2. As the demo operator, I want an empty field to dispatch the byte-identical
   rehearsed prompt, so that bugs 2 and 3 keep replaying their proven path.
3. As the consultant, I want any non-empty text attached as a "note from the
   team" section between the bug report and the contract, so that a note can
   color the investigation but never displace the test/scope/format rules.
4. As a validator auditing later, I want a surviving note posted as an issue
   comment before the run starts, so that the one human judgment in the
   pipeline is a clickable part of the record ("where did green come from?"
   has an answer).
5. As the demo operator, I want the dispatch to abort if the comment fails to
   post, so that a noted run always has its note on record.
6. As the consultant, I want the note to ride as an optional second CLI
   argument to the runner, so that the runner remains the only owner of git
   and prompt assembly.
7. As the fixer agent, I want the contract to let a styling-only fix explain
   why no route-seam test applies, so that an honest report replaces a forced
   nonsense test.
8. As an audience member, I want request #4 filed fresh each cycle with a
   clean timeline, so that the fourth card is as real as the other three.
9. As the demo operator, I want the request's complaint vague and free of the
   word "green" (and of design vocabulary), so that the note is visibly
   load-bearing — the agent could not have derived the fix from any artifact.
10. As the demo operator, I want to enter the note live by pasting the
    rehearsed verbatim text, so that the audience watches judgment attach
    while the byte-exact rehearsed prompt is preserved.
11. As the demo operator, I want the full re-rehearsal pass to gate
    demo-readiness, so that the live demo replays only proven paths.

## Implementation Decisions

- **The note is added context, never a replacement prompt** (handoff decision
  1, unchanged): the fixed prompt is the harness contract; a human-supplied
  prompt would void rehearsals, break the PR-body pipe, and tell a sharp
  viewer the human did the steering.
- **Placement** (handoff decision 2, unchanged): the note section sits after
  the bug report, before `## Your job`, so it reads as reporting context and
  the binding rules stay last.
- **Normalization is empty-only — supersedes the handoff's go-word list.**
  Trim whitespace; empty → nothing attached (no runner argument, no comment,
  prompt byte-identical). Any other text is a note, verbatim. New
  information: the agent is robust to filler words, the three-word list
  ("go", "do it", "fix it") guarded a moment the live-instruction policy
  already forbids, and its coverage was arbitrary (caught "fix it", missed
  "ok"). The guard against on-stage filler is operator discipline; the list
  can return later as hardening if the prototype needs it.
- **A surviving note enters the record**: the dispatch route posts it as an
  issue comment (existing stubbed-`gh` pattern, as the merge route already
  writes to GitHub) *before* starting the runner; a comment failure aborts
  the dispatch — a failing `gh` there predicts the runner's `gh` calls
  failing, and the invariant "a noted run always has its note on record"
  stays unconditional.
- **Runner transport** (handoff decision 8, unchanged): optional second CLI
  argument; the dispatch route passes the surviving note through.
- **The prompt amendment** — one sentence appended to contract step 2:
  > Exception: if the fix is purely presentational (styling only — no API
  > route's behavior changes), write no new test; instead your
  > "## Regression test" section must explain in one or two sentences why no
  > route-level test can capture the change.
  The criterion is checkable ("no API route's behavior changes" — bugs 1–3
  all change route behavior, closing the hatch to them by construction), and
  the mandatory justification turns the exemption into audience-visible
  evidence rather than a silent skip. Final wording is empirically gated by
  rehearsal. A wider fix — adding a UI/DOM test seam so styling becomes
  testable — was considered and rejected: the jsdom version is a tautology
  the project's own testing doctrine forbids, the real-browser version
  imports timing flakiness into the suite every rehearsed bug must keep
  green, and either rewords the contract sentence the proven bugs depend on.
- **Request #4 is the demo of the note** (handoff decision 5, unchanged):
  they ship together or not at all; placement is the assisted-lane opener.
- **"Request", not "ticket" or "bug 4":** the fourth scenario is an issue
  whose complaint is not a defect — nothing planted, nothing broken. The
  handoff's casual "ticket #4" collides with the build-ticket vocabulary
  (`/to-tickets`), so the demo-fiction concept is named **request**
  (glossary entry added). Same scenario, new name.
- **Reset files it, every cycle**, reading `harness/private/issues/
  request-4.md` (title first line, body after — same layout as the bugs),
  same clean-timeline and retirement semantics. Filing order is bug 1 →
  bug 2 → bug 3 → request, so the request sits **last** in the ascending
  `/issues` queue; the choreography opens the assisted lane on the bottom
  card. (A live-filed or hand-filed issue was rejected: improvised typing on
  stage, and it would rot "reset is the single make-the-world-fresh
  command".)
- **The request's complaint text is vague (option B)**: in-character end-user
  prose that does not reveal the complaint is about color and never names
  green — the vaguer the report, the more visibly the note carries the
  judgment. Risk accepted: a vague report invites hedged fixes (color *and*
  font size); the first rehearsal is the test, and a messy diff tightens the
  wording toward naming color until the intended road is load-bearing. The
  text is authored at implementation time into the answer key (never
  committed), operator-reviewed before first filing.
- **Demo-day note entry: live paste of the proven verbatim text** (kept in
  the answer key with the demo-day material). Live typing risks a typo
  converting a rehearsed run into an unrehearsed one; pre-filling is staged
  machinery showing through. Pasting is live-visible and byte-exact. The
  rehearsal ritual performs the same paste-and-dispatch.
- **The Decline flow is demoted from the Stage 3 bundle back to a roadmap
  talking point — supersedes the Stage 2b out-of-scope line that bundled it
  in.** New information: declining is inherently a code-reading act — you
  cannot honestly reject a PR without reviewing it, which happens on GitHub,
  where comment-and-close are already native one click from the diff. A chat
  Decline button serves a persona that should not be making merge calls.
  (Merge-from-chat survives the same argument only because it is a demo
  beat.) The independently useful fragment — the "prior attempt (not
  merged)" line on issue cards — is card rendering, not a decline action; it
  is named here so it is not forgotten, and deferred with the rest.
- **Choreography updates:** bugs 2 and 3 gain one click (Fix-this → expand →
  leave empty → Dispatch). The live-instruction policy tightens to its final
  form: the only note ever typed on stage is the rehearsed paste; improvised
  notes remain forbidden.
- **Rebaseline, twice:** the pending tag move (Stage 2b commits) happens
  before any Stage 3 work meets a reset; after Stage 3's harness commits
  land, the tag moves again before the re-rehearsal pass. Reset force-rewinds
  main to the tag — an unmoved tag destroys the new harness.

## Testing Decisions

- **The existing chat route-handler seam is the only tested seam** — no new
  seams. Cover at that seam: dispatch with a note → spawned commands include
  the issue comment and the runner's second argument, note verbatim;
  dispatch with an empty/whitespace field → no comment call, no second
  argument; comment-command failure → dispatch aborts and the runner is
  never spawned.
- **The chat UI gets no automated tests** — verified by the demo walkthrough,
  as in Stage 2.
- **Reset and setup remain tested by the rehearsal ritual** at their
  command-line seams (standing decision).
- **The re-rehearsal pass (the feature's price, accepted):** every prompt
  edit voids the byte-identical guarantee, so demo-ready now means — all
  three bugs re-run under the amended prompt with transcript audits,
  checking they still produce red-then-green route-seam tests and **never
  touch the styling exception**; request #4 rehearsed with its exact note
  pasted verbatim, checking it uses the exception gracefully (justification
  in the PR body, no flailing, no hedged multi-axis diff); bug 1's setup
  pre-run — which now also runs under the amended prompt on every reset —
  re-verified and its rehearsal record updated. Measure the request's run
  length in rehearsal before choreographing narration around it (expected
  much shorter than the 105–190s bugs).

## Out of Scope

- The Decline flow and the "prior attempt (not merged)" card line (demoted to
  roadmap — see Implementation Decisions).
- Go-word normalization (the three-word list) — later hardening if the
  prototype needs it.
- A UI/DOM test seam for styling (rejected — see the prompt-amendment
  decision).
- Replacement prompts, prompt templates, or any operator control over the
  contract beyond the note.
- Everything formerly called "Stage 3" (Trello, Telegram, log viewer, trace
  viewer, knowledge base, boards) — roadmap talking points, unchanged.

## Further Notes

- The rehearsed demo-day note is the one-liner recorded in the handoff and
  answer key: "use green for the text in the todo list". The request's
  complaint text, being client-authored fiction, lives only in the answer key
  (in-character authorship invariant); this spec deliberately does not quote
  it.
- Cost note: the re-rehearsal pass spends one runner invocation per bug plus
  one for the request (~$1, ~2 min each), plus transcript-audit attention;
  each subsequent rehearsal cycle grows by one short request run.
- If an audience member proposes an instruction mid-demo *after* this ships,
  the deferral line updates: the feature exists, but "for today's run I'll
  let it work from the report" — improvised notes on stage are still a live
  gamble against an unrehearsed prompt.
