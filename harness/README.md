# Harness (operator tooling)

The demo pipeline around `demo-app/`. The fixer agent never sees this
directory; this directory owns everything deterministic.

## Scripts

- `run.sh [--replay] <issue-number> [note]` — the one visible demo action,
  now a staged role pipeline: the **planner** (read-only) diagnoses and posts
  its plan to the issue as an attributed comment before any commit exists;
  the **fixer** implements (Claude Code, non-interactive, scoped to
  `demo-app/`) with the plan spliced additively into its prompt; the runner
  commits, pushes, and opens the PR itself; the **reviewer** then posts one
  post-hoc findings comment on the PR — no revision loop. The optional note
  (the operator's judgment, already on the issue as a comment by the time the
  runner starts) is spliced into the fixed prompt as a "note from the team"
  section between the bug report and the contract — added context, never a
  replacement; the plan section follows it, and the contract stays last.
  Per-stage wall clocks land in `harness/private/stages-issue-<n>.json`.
  Prompt composition is verified byte-for-byte by
  `harness/tests/prompt-shape.sh` (stubbed `claude`/`gh` in a throwaway
  clone — no network, no agent). Fails cleanly (nothing pushed) if the
  agent errors, changes nothing, or touches files outside the app. Agent
  output and session transcript land in `harness/private/` for the rehearsal
  audit. `--replay` swaps the fixer for the agent-output cache entry matching
  the issue's title (canned agent, real everything-else) — a build-time
  iteration and pre-run tool; replay never certifies a bug as demo-ready, a
  replayed run is never presented as live, and nothing replays without the
  explicit flag.
- `capture.sh <issue-number>` — saves a rehearsal-certified attempt into the
  agent-output cache (`harness/private/cache/`, gitignored with the answer
  key): the fix as a patch keyed by answer-key bug title, plus its transcript
  and result JSON. Capture only after the rehearsal ritual passes; any
  prompt-shape change makes the whole cache stale as evidence — recapture from
  freshly certified runs.
- `reset.sh` — starts a fresh demo cycle: force-resets main (local + GitHub)
  to the `demo-baseline` tag, closes open PRs, deletes `fix/*` branches,
  retires the previous cycle's issues (closed as "not planned"; completed ones
  are reopened first so the close reason can be rewritten, and issues already
  retired are never touched again), then files four fresh issues with clean
  timelines — bug 1 → bug 2 → bug 3 → request #4, in demo order so their
  numbers ascend and the request sits last in the queue. Issue texts are read
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
  solved and badged, bugs 2 and 3 open, no open PRs.

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
