# Tickets: Stage 3 — the judgment dispatch

Builds `docs/stage-3-spec.md`: the operator note, the prompt-contract styling
exception, and request #4, gated by a full re-rehearsal pass.

Work the **frontier**: any ticket whose blockers are all done. Here that is
ticket 1 and ticket 2 (parallel), then 3, then 4.

## Rebaseline demo-baseline over the Stage 2b commits

**What to build:** running `harness/reset.sh` becomes safe again. Today the
`demo-baseline` tag predates the Stage 2b harness commits, so a reset would
erase them from main. Follow the runbook's rebaseline procedure: rebuild the
baseline as buggy demo-app + latest harness, verify the demo-app tree is
identical to the old tag's, force-move the tag (and main) forward.

**Blocked by:** None — can start immediately.

- [x] The `demo-baseline` tag contains every harness and docs commit currently
      on main. (The Stage 2b move was already done 2026-07-12 before this
      ticket was picked up — the tag sat on the last Stage 2b harness commit;
      the Stage 3 move, same date, carried it over this stage's commits.)
- [x] `git diff <old-tag> demo-baseline -- demo-app` is empty. (Verified
      against old tag 06a79a5 at the Stage 3 move.)
- [x] A `reset.sh` run after this ticket would not delete any commit from
      main. (main force-pushed to equal the new baseline exactly.)

## Operator note, end to end

**What to build:** the operator can attach judgment at dispatch. Clicking
**Fix this** on an open issue card expands the card in place to an optional
free-text field plus a **Dispatch** button. Dispatching with the field empty
(after trimming whitespace) behaves exactly as today: the rehearsed prompt,
byte-identical, no trace anywhere. Dispatching with any text: the text is
posted to the GitHub issue as a comment before the run starts (if the comment
fails to post, the dispatch aborts and the runner never starts), then rides
to the runner as an optional second command-line argument, and the runner
splices it into the fixed prompt as a "note from the team" section between
the bug-report section and the `## Your job` contract. The contract itself
gains the styling-only exception sentence from the spec (a purely
presentational fix writes no new test and must instead justify, in its
mandatory `## Regression test` section, why no route-level test applies).

**Blocked by:** None — can start immediately.

- [ ] Chat walkthrough: Fix-this expands the card; empty-field dispatch works
      as before; a typed note appears as a comment on the real issue.
- [x] Route-seam test: dispatch with a note spawns the comment command and
      passes the note verbatim as the runner's second argument.
- [x] Route-seam test: dispatch with an empty or whitespace-only field spawns
      no comment command and passes no second argument.
- [x] Route-seam test: when the comment command fails, the dispatch aborts
      and the runner is never spawned.
- [x] The runner's prompt, run with a note argument, contains the note in the
      decided position; run without one, it is byte-identical to the current
      rehearsed prompt except for the amendment sentence. (Verified 2026-07-12
      by capturing the prompt through stubbed `gh`/`claude` in a scratch clone
      and byte-diffing old vs. new runner output.)
- [x] The amendment sentence appears in the contract for every run, with or
      without a note. (Same byte-diff verification.)

## Request #4 filed by reset

**What to build:** each demo cycle now starts with four fresh issues instead
of three. Author the request's complaint text in character (vague end-user
prose about the todo list being unpleasant to read; it must not reveal the
complaint is about color and must never contain the word "green") into the
gitignored answer key as `request-4.md`, in the same title-then-body layout
as the three bug files — the user reviews the text before it is ever filed.
`reset.sh` files it after bug 3, so the request sits last in the ascending
`/issues` queue, and retires it with the others at the next cycle.

**Blocked by:** Operator note, end to end (the prompt contract that can
handle a presentational report must exist before the request's issue can).

- [x] `harness/private/issues/request-4.md` exists, is user-reviewed, and is
      gitignored with the rest of the answer key. (Drafted and user-reviewed
      2026-07-12.)
- [x] After one reset: four open issues with clean timelines, the request
      created last (highest number), previous cycle's issues retired.
      (2026-07-12: reset filed #17–#20, request is #20; #11–#13 retired as
      "not planned".)
- [x] `/issues` in the chat shows four cards with the request at the bottom.
      (Verified against the live route.)
- [ ] The next reset retires the request along with the bugs.

## Re-rehearsal pass — the demo-ready gate

**What to build:** the certification that demo day replays only proven paths,
per the spec's testing decisions. Move the `demo-baseline` tag forward again
over this stage's commits. Then the full ritual: reset; setup (bug 1's
pre-run now executes under the amended prompt — re-verify and update its
rehearsal record); re-run bugs 2 and 3 and audit their transcripts (still
red-then-green at the route seam, the styling exception never invoked);
dispatch the request from the chat with the rehearsed note pasted verbatim
("use green for the text in the todo list") and audit that run (exception
used gracefully, justification present in the PR body, diff not hedged
across other styling axes); measure the request run's wall clock. Update the
answer key's rehearsal records, the runbook, and the choreography: the extra
click on dispatch, the assisted lane opening on the bottom card, the paste
beat, the request's narration cover, and the new deferral line for
mid-demo instruction requests. If any check fails, iterate the amendment
wording or the request text and re-run; until green, the demo is the Stage 2
floor.

**Blocked by:** Rebaseline demo-baseline over the Stage 2b commits; Operator
note, end to end; Request #4 filed by reset.

- [x] Tag moved forward over all Stage 3 commits before the first reset
      (2026-07-12, together with ticket 1's move — see above).
- [x] Bugs 2 and 3: transcripts audited — red-then-green route-seam tests,
      no use of the styling exception, no reads outside demo-app.
      (2026-07-12: PRs #23 and #24, both one-shot via chat dispatch and
      merged from the chat. Bug 2's first attempt, PR #22, matched the
      answer key but carried log-file run exhaust in its diff — discarded;
      the runner now restores runtime files before staging.)
- [x] Bug 1's setup pre-run re-verified under the amended prompt; rehearsal
      record updated. (2026-07-12: PR #21, one-shot, exception untouched.)
- [x] Request run: one-shot from the chat with the pasted note; exception
      justified in the PR body; fix is color-only; wall clock recorded.
      (Took three rehearsals, all 2026-07-12: r1 FAILED color-only — the v1
      text's lose-my-place line invited zebra striping; text iterated to v2.
      r2 passed every check but was discarded as contaminated — the fixer
      found rehearsal 1's compiled classes in the demo-app `.next` cache;
      reset.sh now clears that cache. r3 = certification PASS on a clean
      cache: PR #35, single color-only hunk, 419s. Observed range 144–419s —
      the spec's "much shorter than the bugs" expectation is corrected in
      the runbook.)
- [x] Runbook and choreography updated (dispatch click, bottom card, paste
      beat, narration, deferral line); rehearsal records current.
- [x] Demo-ready verdict recorded in the answer key. (PASS, 2026-07-12;
      world parked at opening inventory — #36 autofixed via PR #40,
      #37/#38/#39 open, zero open PRs.)
