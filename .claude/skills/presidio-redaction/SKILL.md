---
name: presidio-redaction
description: How this repo redacts personal data from log excerpts with Microsoft Presidio before anything reaches an issue or an agent. Use when changing harness/redact.py, the context-report pipeline, or debugging missing/over-eager redactions or a failing filing script.
---

# Presidio redaction — the context report's sanitization boundary

Every context report filed by the signaling layer carries a log excerpt that
was sanitized first: filesystem paths canonicalized, personal data replaced by
visible `[REDACTED:<ENTITY>]` markers. This skill covers the redaction half —
where Presidio lives, its contract, and the gotchas already paid for.

## Where things live

- `harness/redact.py` — the entire Presidio surface: UTF-8 text on stdin, a
  JSON array of spans `[{"start":N,"end":N,"entity":"PERSON"}]` on stdout,
  nonzero exit on any failure. Nothing else in the repo imports Presidio.
- `harness/chat/lib/context-report.ts` — the pure pipeline (parse → select
  excerpt → canonicalize paths → apply spans → compose report). No
  subprocesses, no fs; fully unit-tested (`tests/context-report.test.ts`).
- `harness/chat/bin/compose-report.ts` — the CLI seam that joins the two: it
  invokes the redaction command and applies the spans. Run via `npx tsx`.
- `harness/file-signal-issue.sh` — scene 2's fallback filing entry; composes
  the report and files the issue via `gh`.
- Command paths are env-overridable per the `lib/config.ts` pattern:
  `CHAT_REDACT_CMD` (default `harness/redact.py`), `CHAT_GH_CMD`,
  `SIGNAL_LOG_FILE`. Tests stub them with bash scripts.

## The fail-safe contract

If the redaction command exits nonzero, emits malformed spans, or dies before
reading stdin, **no report is produced and no issue is filed** — the CLI
prints nothing on stdout and exits nonzero, and the filing script propagates
that. Never "fall back" to publishing unredacted text; a broken redactor must
break the filing, loudly. The contract is pinned by tests in
`harness/chat/tests/context-report.test.ts` ("filing seam" describe block).

## Setup, never demo day

`harness/install.sh` (idempotent) installs `presidio-analyzer` and downloads
the spaCy model `en_core_web_lg` (~600 MB), then smoke-tests the boundary.
Run it at setup time. On demo day nothing downloads: if the model is missing,
`redact.py` exits nonzero and the fail-safe fires — which is detectable in
rehearsal, not on stage.

## Gotchas actually hit

- **Default recognizers shred technical text.** With no `entities=` filter,
  Presidio flagged pino epoch timestamps as `US_BANK_NUMBER`, stack-trace
  line:column offsets as `US_DRIVER_LICENSE`, dates as `DATE_TIME` (with
  spans that swallowed adjacent JSON), and code identifiers as `URL`/`NRP`.
  `redact.py` therefore analyzes a deliberate personal-data entity list
  (PERSON, EMAIL_ADDRESS, PHONE_NUMBER, CREDIT_CARD, IBAN_CODE, US_SSN,
  IP_ADDRESS). Widen it deliberately, and re-check a real excerpt when you do.
- **PERSON still misfires on code.** spaCy's NER reads identifiers like
  `Span.traceAsyncFn` as names; one span even crossed a `\n` and ate stack
  structure. `redact.py` drops PERSON spans whose text contains a character
  that can never occur in a human name (digit, underscore, slash, brace,
  bracket, quote, newline) — a filter that cannot under-redact. Residual
  false positives on clean identifiers (e.g. `DevServer.handleRequest`) are
  left redacted on purpose: erring toward redaction is the honest side.
- **Offset semantics differ.** Presidio reports Unicode code point offsets
  (Python string indexing); JS strings index UTF-16 code units. Any non-BMP
  character (emoji in a task title) shifts every later span. The CLI converts
  with `codePointSpansToUtf16` before applying spans — keep that call if you
  touch the seam.
- **Redact exactly the text you analyzed.** Spans are offsets into the
  precise string sent on stdin. Canonicalize paths *before* redaction, never
  after, or the offsets are garbage. The "applies the spans" test pins this
  by having the stub locate a name in whatever text it receives.
- **First analyze is slow.** `AnalyzerEngine()` loads the spaCy model
  (~10 s). Fine for a one-shot CLI; don't put it in a per-line loop, and
  don't let a demo-day surface construct it repeatedly.
- **A command that ignores stdin causes EPIPE.** If the redact command exits
  without draining stdin, the naive Node spawn crashes with an unhandled
  `EPIPE` instead of failing cleanly. `compose-report.ts` swallows stdin
  write errors and lets the exit code carry the failure; there is a
  regression test (`/bin/false` as the redact command).
