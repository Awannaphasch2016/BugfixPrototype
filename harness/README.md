# Harness (operator tooling)

The demo pipeline around `demo-app/`. The fixer agent never sees this
directory; this directory owns everything deterministic.

## Scripts

- `run.sh [--replay [--attempt <n>]] <issue-number> [note]` — the one
  visible demo action,
  now a staged role pipeline: the **planner** (read-only) diagnoses and posts
  its plan to the issue as an attributed comment before any commit exists;
  the **fixer** implements (Claude Code, non-interactive, scoped to
  `demo-app/`) with the plan spliced additively into its prompt; the runner
  commits, pushes, and opens the PR itself; the **tester** reproduces the
  symptom in a real browser on main's code and verifies its absence with the
  fix (screenshots committed to the branch under `evidence/`, embedded in
  the PR body — skipped with a warning if the app isn't running on :3000);
  the **reviewer** then posts one post-hoc findings comment on the PR — no
  revision loop. The optional note
  (the operator's judgment, already on the issue as a comment by the time the
  runner starts) is spliced into the fixed prompt as a "note from the team"
  section between the bug report and the contract — added context, never a
  replacement; the plan section follows it, and the contract stays last.
  Per-stage wall clocks land in `harness/private/stages-issue-<n>.json`.
  Between commit and push the runner executes the gates (ADR-0003): the
  app's suite and lint, plus red-on-baseline — main's app code under the
  branch's tests must fail for the reported reason; a gate failure aborts
  before anything is pushed, and the formatted gate report is posted to the
  PR. Each stage's transcript is also rendered to static HTML
  (claude-code-log) that the chat serves at `/api/trace/<issue>` and links
  from the PR card. Prompt composition and gate/report mechanics are
  verified byte-for-byte by `harness/tests/prompt-shape.sh` (stubbed
  `claude`/`gh`/`npm` in a throwaway clone — no network, no agent). Fails cleanly (nothing pushed) if the
  agent errors, changes nothing, or touches files outside the app. Agent
  output and session transcript land in `harness/private/` for the rehearsal
  audit. `--replay` swaps the agents for the agent-output cache entry
  matching the issue's title (certified agent output, real everything-else);
  `--attempt` selects the entry — 1 (default) is the first attempt, whose
  patch applies to the baseline; 2 is the follow-up, applying on top of the
  first fix's merged state. Replay substitutes the fresh issue number into
  each posted artifact's `{{issue}}` placeholder, and `DEMO_REPLAY_DELAY`
  (seconds) paces the artifact beats — stage rhythm for the walkthrough,
  never presented as agent latency; zero/unset keeps replay the instant
  build fixture. Replay never certifies a bug as demo-ready, is never
  presented as live *generation* (on stage it is narrated as certified agent
  output over live machinery, with the banner up — ADR-0004), and nothing
  replays without the explicit flag. Replay/capture mechanics are verified
  by `harness/tests/replay-mechanics.sh` (same stubbed-commands pattern).
- `capture.sh <issue-number> [--follow-up]` — saves a rehearsal-certified
  attempt into the agent-output cache (`harness/private/cache/<slug>/
  attempt-<n>/`, gitignored with the answer key): the fix as a patch keyed by
  answer-key bug title and attempt, plus its transcript and result JSON, each
  entry declaring the state its patch applies to (`--follow-up` writes
  attempt-2, based on the baseline plus attempt-1's fix). The final step is
  the coherence pass (`cache-coherence.sh`): the entry's own issue number
  becomes the `{{issue}}` placeholder, and any foreign issue number, commit
  sha, or date in cached prose rejects the capture — fix at the source and
  recapture. Capture only after the rehearsal ritual passes; any
  prompt-shape change makes the whole cache stale as evidence — recapture from
  freshly certified runs.
- `reset.sh` — starts a fresh demo cycle: force-resets main (local + GitHub)
  to the `demo-baseline` tag, closes open PRs, deletes `fix/*` branches,
  retires the previous cycle's issues (closed as "not planned"; completed ones
  are reopened first so the close reason can be rewritten, and issues already
  retired are never touched again), then files three fresh issues with clean
  timelines — bug 1 → bug 2 → request, in demo order so their numbers ascend
  and the request sits last in the queue. The reserved bug is deliberately
  not pre-filed: its issue is born live through the signaling layer (trigger
  step → detection → routing → enriched filing), or through
  `route-signal.sh`/`file-signal-issue.sh` as fallbacks. Issue texts are read
  at filing time from the answer key (`harness/private/issues/bug-<n>.md` and
  `request-4.md`, title on the first line, body after), so the verbatim
  reports never enter a commit. Nothing is ever deleted — retired issues and merged PRs stay
  browsable for later audit. Run between rehearsals and before the live demo.
- `setup.sh` — pre-demo step after `reset.sh`: finds bug 1's fresh issue by
  its exact answer-key title (issue numbers change every cycle), runs it
  through the pipeline, merges its PR with no human in the loop (the merge
  closes the issue as completed), and applies the `autofixed` label — the
  lane's auditable marker, applied at the only moment autofixing happens.
  Creates the label first if the repo lacks it. The demo opens with bug 1
  solved and badged, bugs 2 and 3 open, no open PRs. With `DEMO_REPLAY` set
  the pre-run replays bug 1's certified first attempt (prep in seconds); with
  it unset the run is live — leg 1's certification path.

## Chat control surface (`chat/`)

A small Next.js app (`npm run dev`, port 4000) standing in for
Slack/Telegram/LINE: the operator commands the pipeline from a chat page
instead of a terminal. Three commands partition the story, all backed by live
GitHub queries: `/issues` (the open queue, ascending by number so the cards
match the demo order), `/solved` (every issue closed as completed that has a
merged fix-branch PR, each card badged **autofixed** or **human-approved**
from the `autofixed` label — both lanes on one screen), and `/autofixed` (the
no-human-in-the-loop subset). Old command names get the graceful fallback,
not silent aliases. **Fix
this** on an issue card expands it in place to an optional operator-note field
plus **Dispatch**. Dispatching restores the two runtime-dirtied demo-app data
files and runs `run.sh` (one blocking request — the response is the PR card);
an empty field (after trimming) leaves no trace — the rehearsed prompt runs
byte-identical; any text is first posted to the issue as a comment (a failed
comment aborts the dispatch — the runner never starts) and then passed to
`run.sh` as its optional second argument;
**Merge** merges the real PR via `gh` and fast-forwards the local main so the
demo app hot-reloads with the fix. One run at a time; chat state is in-memory
and disposable. GitHub stays the system of record — the chat links to real
issues, PRs, and diffs, never re-renders them.

The blocking dispatch request is the notification channel on localhost. When
the browser reaches the backend through a proxy that caps request duration
(Codespaces web port forwarding kills requests at ~100s), the run keeps going
server-side and the page recovers its outcome from `/api/dispatch-status` —
polling is the fallback for proxied access only, never the primary path.

Route handlers are tested (`cd chat && npm test`) with the runner, `git`, and
`gh` replaced by stub scripts via `CHAT_RUNNER_CMD`/`CHAT_GIT_CMD`/
`CHAT_GH_CMD` (`CHAT_REPO_ROOT` overrides the working directory). The UI has
no automated tests; the rehearsal walkthrough covers it.

## Demo sequence

Fix bugs in order (1 → 2 → 3), merging each PR before running the next —
earlier regression tests protect later fixes that share code paths. Bug 1 is
pre-fixed by `setup.sh`; bugs 2 and 3 are dispatched live from the chat. Bugs
are identified by their answer-key titles, never by issue number — the
numbers change every cycle.

Per bug: show the symptom in the UI → `/issues` in the chat →
**Fix this** → leave the note field empty → **Dispatch** → walk the autofix
lane while the run blocks → PR card arrives → glance at the PR on GitHub
(diagnosis narrative, diff, red→green regression test) → **Merge** in the
chat → show the UI fixed. After bug 3, the request (bottom card) opens the
assisted lane: **Fix this** → paste the rehearsed note verbatim →
**Dispatch** — the note lands on the issue as a comment before the run
starts. The full runbook (setup, choreography, recovery ladder) lives in
`harness/private/`.

## Rehearsal ritual (definition of demo-ready, per bug)

1. `reset.sh` — confirm the previous cycle's issues show "not planned" and
   the fresh issues are open with clean timelines (filed, nothing else),
   numbered in demo order
2. confirm the fresh issue's text matches its answer-key file verbatim
3. `run.sh <fresh issue number>`
4. PR: regression test red on baseline, green with fix; fix matches the answer
   key in substance
5. transcript audit (`harness/private/transcript-issue-<n>.jsonl`): no reads
   outside `demo-app/`; bug 3 consulted `logs/app.log`; no coverage-gap
   archaeology
6. after one auto-merge (`setup.sh`) and one human merge, `/solved` shows both
   cards with the right badges — autofixed and human-approved
7. record the result in `harness/private/bugs.md`

## Isolation

`demo-app/.claude/settings.json` denies reads/edits outside the app directory
and allows only the tools the fix needs (file edits, test runs, log grepping).
Bash side-doors are not airtight by design — the answer key never enters the
repo, so there is nothing to leak.
