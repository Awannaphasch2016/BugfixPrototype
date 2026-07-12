# Stage 2b — Fresh-Issue Cycles and Lane Relabel

**Status:** `ready-for-agent`
**Tracker:** local (`docs/` is the tracker for build specs; GitHub Issues on this repo is reserved as demo scenery)
**Stage:** amendment to Stage 2 (`docs/stage-2-spec.md`, built 2026-07-09). Stage 3 (the judgment dispatch) is unchanged and grows one item (see Out of Scope).

## Problem Statement

Rehearsing the Stage 2 walkthrough end-to-end exposed three cracks between the demo's claim ("everything you see is the real GitHub record") and what a curious audience member actually finds:

1. **Reopened issues carry rehearsal scars.** Reset works by reopening the same three issues, so a client who clicks into a bug report sees a timeline littered with "closed this / reopened this" events from every rehearsal cycle — machinery showing through the fiction of a freshly reported bug.
2. **The autofix lane cannot tell its lanes apart.** The lane is derived as "merged fix-branch PR whose issue is currently closed," and both lanes end in exactly that state, closed by the same account. The moment the operator merges an assisted-lane PR live, that issue pollutes the "fixed with no human in the loop" list — the one list whose honesty carries the pitch.
3. **The command names mislead.** `/list-recently-autofixed` implies a time filter that doesn't exist and (per crack 2) doesn't list only autofixed work; there is no view that shows both lanes side by side, which is the single most persuasive screen the two-lane story could have.

## Solution

Make each demo cycle file **fresh issues** with pristine timelines, and encode the two domain axes on GitHub's own primitives: **lifecycle** on the native issue state machine (`OPEN`; `CLOSED` as `completed` or `not planned`), and **lane** on one label (`autofixed`), applied at the only moment autofixing happens — setup's auto-merge. Retired cycles are closed as "not planned" (honestly: they were abandoned), which keeps them out of every lane forever without deleting anything a validator might audit.

The chat surface renames to three commands that partition the story: `/issues` (the open queue), `/solved` (everything completed, each card badged **autofixed** or **human-approved** — the two lanes on one screen), and `/autofixed` (the no-human subset). The runner, the demo app, and the dispatch/merge flows are untouched.

## User Stories

1. As an audience member, I want each demoed issue to have a clean timeline (filed, then fixed), so that nothing suggests the bug report is a staged prop.
2. As the demo operator, I want reset to retire the previous cycle's issues and file fresh ones, so that every rehearsal and the live demo start from identical, pristine GitHub state.
3. As the demo operator, I want retired issues closed as "not planned", so that the record honestly marks them as abandoned rehearsal artifacts rather than pretending they were completed or hiding them.
4. As the demo operator, I want the autofix lane to count only issues closed as completed, so that retired rehearsal issues can never haunt the lane.
5. As a validator auditing later, I want nothing deleted — old issues and merged PRs remain browsable — so that the "no fakes" claim survives scrutiny.
6. As the demo operator, I want the fresh-issue texts read from the answer key at filing time, so that the verbatim "client-filed" reports never appear in any committed script and the in-character authorship invariant holds.
7. As the demo operator, I want the issues filed in demo order so their numbers ascend 1→2→3 within a cycle, and the queue displayed in that order, so that the cards on screen match the choreography.
8. As the consultant, I want the lane recorded as an `autofixed` label applied by the pipeline at auto-merge, so that lane membership is a real, auditable GitHub artifact rather than an inference.
9. As the demo operator, I want the setup step to find bug 1's fresh issue number by its title, so that setup keeps working when the numbers change every cycle.
10. As the demo operator, I want setup's auto-merge to label both the issue and close it via the merge, so that the autofix lane self-populates with exactly one correctly-badged entry.
11. As a chat user, I want a `/issues` command listing open issues as dispatchable cards, so that the queue is one obvious word.
12. As a chat user, I want a `/solved` command listing completed issues with each card badged autofixed or human-approved, so that I see the scope of autonomy and the human's role on a single screen.
13. As a chat user, I want an `/autofixed` command listing only the no-human-in-the-loop fixes, so that the demo's opening beat is one click.
14. As the demo operator, I want the welcome message and chips updated to the three new commands with a one-line meaning each, so that a first-time user learns the mental model from the welcome screen alone.
15. As the demo operator, I want the old command names to answer with the graceful fallback (not silent aliases), so that the surface has exactly one vocabulary.
16. As an audience member, I want every solved card to link the real issue and its merged PR, so that each badge has a clickable receipt.
17. As the demo operator, I want the latest-merged-PR-per-issue rule retained in the solved and autofixed lists, so that multi-attempt histories show one card per issue.
18. As the demo operator, I want the demo choreography, runbook, and setup docs updated to title-based issue references, so that no document depends on issue numbers that now change per cycle.
19. As the demo operator, I want every renamed or re-derived path re-verified by the rehearsal ritual (reset → setup → full walkthrough), so that the live demo replays a proven path.

## Implementation Decisions

- **Two axes, two mechanisms (the core decision):** *lifecycle* lives on GitHub's native issue state (`OPEN`; `CLOSED` + `stateReason` of `completed` or `not planned`); *lane* lives on one label, `autofixed`. State is never used to encode lane; the label is never used to encode lifecycle. `DUPLICATE` is never repurposed — misusing a state's meaning is a fake in the record.
- **Reset gains cycle semantics:** teardown as today (rewind code to the baseline tag, close open PRs with branch deletion, delete fix branches), then retire every previous-cycle issue (reopen if closed, close with reason "not planned"), then file the three fresh issues. Reset remains the single "make the world fresh" command.
- **Issue texts live in the answer key** as one file per bug (title on the first line, body after), read by reset at filing time. The texts are already recorded verbatim in the answer key; they move into a machine-readable layout and remain gitignored.
- **Filing order is demo order** (severity 1→2→3), so fresh numbers ascend in demo order; the open-issues route sorts ascending by number to match.
- **Lane derivations:** `/issues` = state `OPEN`. `/solved` = state `CLOSED` + reason `completed`, joined to merged fix-branch PRs for the evidence link, deduped to the latest PR per issue; badge = `autofixed` label present → **autofixed**, absent → **human-approved**. `/autofixed` = the `/solved` set filtered to the label. No time-based filtering anywhere.
- **Setup discovers, runs, merges, labels:** setup locates bug 1's open issue by exact title match (title read from the same answer-key file), runs the runner on it, merges the PR (which closes the issue as `completed`), and applies the `autofixed` label to the issue. Assisted-lane flows never touch the label.
- **Command rename with no aliases:** the three commands replace the two old ones everywhere (welcome copy, chips, strict-match parser); old names fall through to the graceful fallback.
- **Route surface follows the commands:** the unsolved route renames to match `/issues`, a solved route is added, the autofixed route adopts the label + `completed` filters; dispatch, merge, and dispatch-status routes are unchanged.
- **The runner and demo app are untouched**, preserving every rehearsal guarantee; the runner is already issue-number-agnostic, and fresh numbers can never collide with old branches because GitHub never reuses numbers.
- **`/human-denied` is rejected as a concept, permanently:** a denied attempt is a closed-unmerged PR — attempt history, not an issue lane; the issue itself returns to the open queue. Closed-unmerged is a lifecycle fact; "denied" is an interpretation requiring its own recorded marker, which does not exist in this stage.
- **In-character authorship invariant and the answer key mechanism continue to govern** everything committed; runbook and choreography copy stay in the answer key.

## Testing Decisions

- **The existing chat route-handler seam is the only tested seam** — no new seams. The GitHub CLI stays stubbed at the process-boundary config point. Cover: the solved list maps stubbed state/label/PR output to badged cards; the autofixed list includes labeled+completed issues and excludes unlabeled, `not planned`, and open ones; the open-issues list sorts ascending; latest-PR-per-issue dedupe holds across the renamed routes.
- **A good test asserts externally observable behavior** (status codes, response bodies, spawned-command arguments), never implementation details. Prior art: the Stage 2 chat route tests.
- **The chat UI gets no automated tests** — verified by the demo walkthrough, as in Stage 2.
- **Reset and setup remain tested by the rehearsal ritual at their command-line seams** — no unit tests for script internals (standing decision). The ritual's definition of demo-ready now includes: fresh issues filed with clean timelines, retired issues show `not planned`, `/solved` shows correct badges after one auto-merge and one human merge.

## Out of Scope

- **The Decline flow — joins the Stage 3 judgment-dispatch bundle:** a Decline button beside Merge, the recorded denial reason (closing comment and/or label), and the "prior attempt (not merged)" line on issue cards. Denial-as-recorded-event ships together with the operator note, because both are "the human's decision, entering the record"; until then, declining is a manual GitHub act plus narration, and cards stay silent about dead attempts.
- Deleting issues or PRs, ever (breaks "Closes #N" references and the audit trail).
- A second GitHub account, issue-filing personas, or issue templates.
- Time-window filters ("recently") in any lane derivation.
- A fresh repository per demo (nuclear realism — rejected as disproportionate for the pitch).
- Any change to dispatch, merge, serialization, the recovery channel, the runner, or the demo app.

## Further Notes

- **Deviation record, superseding one Stage 2 line:** Stage 2 declared "no polling" out of scope; rehearsal through the Codespaces web proxy (which kills requests at ~100s) forced a recovery channel — the blocking dispatch request remains the primary notification channel, and the chat polls the dispatch-status route *only* after a transport-level failure. A localhost demo never takes that path. This note is the decision record for that deviation.
- **The baseline-tag footgun applies to this build too:** reset force-resets main to the `demo-baseline` tag, so after this stage's harness commits land on main, the tag must be moved forward (baseline = buggy demo-app + latest harness) before any reset. The rebaseline procedure is in the runbook.
- **Housekeeping before the first reset under new semantics:** the currently-open PR (assisted-lane attempt for the due-date issue) must be merged or closed first; the current cycle's issues #1–3 become the first retired generation.
- **Cost note:** each rehearsal cycle spends one runner invocation (~$1, ~2 min) in setup, plus one per live-demoed bug, unchanged from Stage 2.
