---
name: playwright-mcp-localhost
description: How this repo drives headless chromium against the demo app on localhost:3000 via Playwright MCP from a non-interactive claude -p run. Use when changing the tester stage, debugging a browser-launch or screenshot failure, or re-deriving the MCP flags after a version bump.
---

# Playwright MCP against localhost — the tester role's browser

The tester agent reproduces a bug's symptom in a real browser and captures
screenshot evidence. It runs as a non-interactive `claude -p` from the
`demo-app/` cwd with the Playwright MCP server attached via `--mcp-config`.
Everything below was verified live on 2026-07-13 with `@playwright/mcp@0.0.78`
(bundled Playwright 1.62.0-alpha) and Claude Code 2.1.207.

## The exact working invocation

Run from `demo-app/` cwd (the sandbox settings there govern the run), with the
dev server already answering on port 3000:

```bash
claude -p "<tester prompt>" --output-format json --mcp-config '{"mcpServers":{"playwright":{"command":"npx","args":["@playwright/mcp@latest","--browser","chromium","--headless","--isolated","--output-dir","<abs tmp dir>"]}}}'
```

Verified end to end: prompt "Open http://localhost:3000 in the browser, wait
for the task list to render, and take a screenshot saved as smoke.png" →
`is_error: false`, a real 1280x720 PNG on disk, ~35 s wall clock.

## Flag gotchas (each one cost a failed run)

- **The default browser is the Chrome *channel*, not bundled chromium.**
  With no `--browser` flag the server tries `/opt/google/chrome/chrome` and
  every tool call fails with "Chromium distribution 'chrome' is not found".
  Google Chrome is not installed in this codespace and doesn't need to be.
- **`--browser chromium` works but is undocumented.** `--help` lists only
  `chrome, firefox, webkit, msedge`; `chromium` is nonetheless accepted and
  selects the bundled Chrome-for-Testing / headless-shell build. Keep the flag
  explicit — never rely on the default.
- **The browser download is version-pinned to the MCP's bundled Playwright.**
  A bare `npx playwright install chromium` resolves a *different* Playwright
  version and downloads a build the MCP may refuse (it did: the MCP wanted
  build 1232, stable Playwright installed 1228). Install via the MCP's own
  undocumented subcommand: `npx @playwright/mcp@latest install-browser
  chromium chrome-for-testing`. `harness/install.sh` does this idempotently at
  setup — demo day never downloads. If a tool call ever errors with
  "Browser X is not installed", the error names the exact token to pass
  to `install-browser`.
- **`--headless` is required** — headed is the default and there is no display
  server here.
- **`--isolated`** keeps the browser profile in memory, so no cookie/storage
  state leaks between tester runs (a fresh browser per dispatch is the honest
  reproduction).
- **`--output-dir` must be an absolute path**; the server also writes
  per-action exhaust there (`page-<ts>.yml` snapshots, `console-<ts>.log`).

## Where screenshots land (filename × --output-dir)

`browser_take_screenshot`'s `filename` argument resolves against the **server's
cwd** (the workspace root — i.e. `demo-app/` when launched as above), *not*
against `--output-dir`:

- `filename: "smoke.png"` → `demo-app/smoke.png`.
- `filename` omitted → auto-named `page-<timestamp>.png` inside `--output-dir`.
- Absolute `filename` → honored, but file access is restricted to the
  workspace roots plus the output dir; paths elsewhere need
  `--allow-unrestricted-file-access` (don't — keep the fence).

For the tester stage this cwd-relative behavior is the feature, not the bug:
prompting the agent to save `evidence/issue-<n>/before.png` lands the PNG
inside `demo-app/`, exactly where the runner commits it to the PR branch —
screenshots must be **committed and embedded by URL** because `gh` cannot
upload images to PR comments (research doc, Question D). Screenshots are
viewport-sized (1280x720) by default; the tool takes `fullPage: true` when the
symptom sits below the fold.

## Waiting for the task list

`browser_navigate` auto-waits for load and returns an accessibility-tree
snapshot; on this app the task list is present in that first snapshot, so no
explicit wait was needed in practice. Trust but verify: have the tester check
the returned snapshot for the list items (or call `browser_snapshot`) before
shooting, and fall back to `browser_wait_for` with a known task title if the
snapshot comes back empty. Don't screenshot blind on a timer. Note the page
logs one console error even when healthy — a non-empty `console-*.log` is not
by itself a reproduced symptom; match the specific signature.

## Auth/session quirks

None. The app is unauthenticated plain HTTP on localhost — no certificate,
cookie, or login hurdles for headless chromium. `--isolated` guarantees each
run starts sessionless. The only precondition is the dev server itself:
`npm run dev` in `demo-app/` must be answering on port 3000 *before* the
tester stage starts, or navigation fails outright.

## Sandbox permissions (why the run is allowed at all)

Non-interactive `claude -p` cannot prompt, so any tool not allowlisted is
silently denied — the agent politely reports it couldn't open the browser.
`demo-app/.claude/settings.json` therefore carries `"mcp__playwright"` in
`permissions.allow`: the server-level rule that admits every tool of that one
MCP server. (`mcp__playwright__*` is **not** valid rule syntax — wildcards
aren't supported for MCP rules; a bare server name is the documented way.)
The rest of the sandbox is untouched: no file access outside `demo-app/`,
read-only bash.

## The two-phase pattern (how the runner uses this)

The tester runs twice around the fix, same invocation both times:

1. **Reproduce on baseline** — before the fix is applied (or with the PR
   branch's app code checked out to main's version), the tester drives the
   reported flow and captures `evidence/issue-<n>/before.png` showing the
   symptom. If the symptom does *not* reproduce on baseline, that's a stage
   failure worth surfacing, not a pass.
2. **Verify with fix** — with the fix applied, the same flow, capturing
   `evidence/issue-<n>/after.png` showing the symptom gone.

Both PNGs are committed to the PR branch by the runner (never by the agent —
the agent runs no git) and embedded in the PR body by URL. A fresh
`--isolated` browser per phase keeps the two captures independent.
