// CLI entry for the context pipeline, run via `npx tsx bin/compose-report.ts`.
// Used by harness/file-signal-issue.sh (scene 2's fallback filing entry).
//
//   tsx bin/compose-report.ts --log <path> --signature <string>
//
// Reads the log file, selects the excerpt around the signature's most recent
// firing, canonicalizes paths, sends the excerpt to the redaction command
// (CHAT_REDACT_CMD, default harness/redact.py) and applies the spans it
// reports, then prints the composed context report on stdout.
//
// FAIL-SAFE CONTRACT: if the redaction command exits nonzero, emits invalid
// spans, or the signature never fired, this process prints nothing on stdout
// and exits nonzero — so no issue is ever filed with unredacted content.

import { spawn } from "child_process";
import { readFileSync } from "fs";
import { redactCmd } from "../lib/config";
import {
  applyRedactions,
  canonicalizePaths,
  codePointSpansToUtf16,
  composeContextReport,
  parseLogLines,
  selectExcerpt,
  type RedactionSpan,
} from "../lib/context-report";

function fail(message: string): never {
  process.stderr.write(`compose-report: ${message}\n`);
  process.exit(1);
}

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) fail(`missing required argument ${name}`);
  return process.argv[i + 1];
}

/** Run the redaction command with `text` on stdin; resolve with its stdout. */
function redact(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(redactCmd(), [], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", (err) => reject(new Error(`redaction command failed to start: ${err.message}`)));
    // A command that dies before draining stdin raises EPIPE here; the
    // "close" handler already turns that death into a rejection.
    child.stdin.on("error", () => {});
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`redaction command exited ${code}: ${stderr.trim()}`));
    });
    child.stdin.write(text, "utf8");
    child.stdin.end();
  });
}

function parseSpans(json: string): RedactionSpan[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error("spans output is not a JSON array");
  return parsed.map((s: unknown) => {
    const span = s as { start?: unknown; end?: unknown; entity?: unknown };
    if (
      typeof span.start !== "number" ||
      typeof span.end !== "number" ||
      typeof span.entity !== "string"
    ) {
      throw new Error("span missing start/end/entity");
    }
    return { start: span.start, end: span.end, entity: span.entity };
  });
}

async function main() {
  const logPath = arg("--log");
  const signature = arg("--signature");

  let logText: string;
  try {
    logText = readFileSync(logPath, "utf8");
  } catch (err) {
    fail(`cannot read log file ${logPath}: ${(err as Error).message}`);
  }

  const excerpt = selectExcerpt(parseLogLines(logText), signature);
  if (!excerpt) fail(`signature "${signature}" not found in ${logPath}; nothing to report`);

  const canonical = canonicalizePaths(excerpt.text);

  let spans: RedactionSpan[];
  try {
    spans = parseSpans(await redact(canonical));
  } catch (err) {
    // The fail-safe: bad or failing redaction means no report at all.
    fail(`redaction failed, refusing to emit an unredacted report — ${(err as Error).message}`);
  }

  const redacted = applyRedactions(canonical, codePointSpansToUtf16(canonical, spans));
  process.stdout.write(
    composeContextReport({ signature, excerpt: redacted, matchCount: excerpt.matchCount }),
  );
}

main().catch((err: Error) => fail(err.message));
