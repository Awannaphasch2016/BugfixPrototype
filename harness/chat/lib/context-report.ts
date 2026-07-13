// The context-pipeline module: log lines in → selected excerpt, canonicalized
// paths, redaction spans applied → composed context report out.
//
// Pure functions only — no subprocesses, no filesystem. The redaction spans
// are supplied from outside (the Presidio command boundary lives in
// harness/redact.py, invoked by bin/compose-report.ts); this module just
// applies them. Generic over any signature string: a signature is whatever
// substring identifies the firing lines in the monitored log.

export interface ParsedLogLine {
  /** The original line text, verbatim. */
  raw: string;
  /** The parsed pino object, or null when the line is not valid JSON. */
  json: Record<string, unknown> | null;
  level: number | null;
  time: number | null;
  msg: string | null;
}

export interface RedactionSpan {
  start: number;
  end: number;
  entity: string;
}

export interface Excerpt {
  /** Raw lines of the selected window. */
  lines: string[];
  /** The window joined with newlines — the text downstream stages operate on. */
  text: string;
  /** 0-based index of the window's first line in the input. */
  startLine: number;
  /** 0-based index of the window's last line in the input (inclusive). */
  endLine: number;
  /** 0-based index of the matched (most recent firing) line. */
  matchLine: number;
  /** How many lines in the whole log matched the signature. */
  matchCount: number;
}

export interface SelectOptions {
  /** Context lines kept before the matched line (default 8). */
  before?: number;
  /** Context lines kept after the matched line (default 2). */
  after?: number;
}

const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Parse NDJSON log text defensively: bad lines are kept, never thrown on. */
export function parseLogLines(text: string): ParsedLogLine[] {
  return text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((raw) => {
      let json: Record<string, unknown> | null = null;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
          json = parsed as Record<string, unknown>;
        }
      } catch {
        // Not JSON — keep the raw line; excerpts must survive dirty logs.
      }
      return {
        raw,
        json,
        level: json ? num(json.level) : null,
        time: json ? num(json.time) : null,
        msg: json ? str(json.msg) : null,
      };
    });
}

/**
 * Select the excerpt window around the most recent line containing the
 * signature. Deterministic: same log + same signature = same window.
 * Returns null when the signature never fired.
 */
export function selectExcerpt(
  lines: ParsedLogLine[],
  signature: string,
  opts: SelectOptions = {},
): Excerpt | null {
  const before = opts.before ?? 8;
  const after = opts.after ?? 2;

  const matches: number[] = [];
  lines.forEach((line, i) => {
    if (line.raw.includes(signature)) matches.push(i);
  });
  if (matches.length === 0) return null;

  const matchLine = matches[matches.length - 1];
  const startLine = Math.max(0, matchLine - before);
  const endLine = Math.min(lines.length - 1, matchLine + after);
  const windowLines = lines.slice(startLine, endLine + 1).map((l) => l.raw);

  return {
    lines: windowLines,
    text: windowLines.join("\n"),
    startLine,
    endLine,
    matchLine,
    matchCount: matches.length,
  };
}

/**
 * Canonicalize absolute filesystem paths to repo-relative form.
 *
 * Explicitly supplied repo roots are stripped first; then two generic
 * machine-specific prefixes are stripped wherever they appear (including
 * inside JSON-escaped stack traces): `/workspaces/<name>/` (dev-container
 * checkouts — the segment after it is already repo-relative) and
 * `/home/<user>/` (anything under a home directory loses the username).
 */
export function canonicalizePaths(text: string, repoRoots: string[] = []): string {
  let out = text;
  for (const root of repoRoots) {
    const prefix = root.endsWith("/") ? root : root + "/";
    out = out.split(prefix).join("");
  }
  out = out.replace(/\/workspaces\/[^/\s"'()\\]+\//g, "");
  out = out.replace(/\/home\/[^/\s"'()\\]+\//g, "");
  return out;
}

/**
 * Convert spans given as Unicode code point offsets (what Python's Presidio
 * reports) into JS string (UTF-16 code unit) offsets, so slicing in JS lands
 * on the same characters. Identity on plain ASCII.
 */
export function codePointSpansToUtf16(text: string, spans: RedactionSpan[]): RedactionSpan[] {
  // utf16Index[cp] = UTF-16 index where code point number `cp` starts.
  const utf16Index: number[] = [];
  let i = 0;
  for (const ch of text) {
    utf16Index.push(i);
    i += ch.length;
  }
  utf16Index.push(text.length); // one-past-the-end
  const at = (cp: number) =>
    utf16Index[Math.max(0, Math.min(cp, utf16Index.length - 1))];
  return spans.map((s) => ({ start: at(s.start), end: at(s.end), entity: s.entity }));
}

/**
 * Replace each span of the text with a visible `[REDACTED:<ENTITY>]` marker.
 *
 * Deterministic under any span order. Empty spans are ignored; out-of-range
 * spans are clamped. Overlapping spans merge into one marker labeled with the
 * earliest span's entity; adjacent (touching) spans merge only when they name
 * the same entity, otherwise both markers appear back to back.
 */
export function applyRedactions(text: string, spans: RedactionSpan[]): string {
  const clamp = (n: number) => Math.max(0, Math.min(n, text.length));
  const cleaned = spans
    .map((s) => ({ start: clamp(s.start), end: clamp(s.end), entity: s.entity }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const merged: RedactionSpan[] = [];
  for (const span of cleaned) {
    const last = merged[merged.length - 1];
    const overlaps = last !== undefined && span.start < last.end;
    const touchesSameEntity =
      last !== undefined && span.start === last.end && span.entity === last.entity;
    if (overlaps || touchesSameEntity) {
      last.end = Math.max(last.end, span.end);
    } else {
      merged.push({ ...span });
    }
  }

  let out = "";
  let cursor = 0;
  for (const span of merged) {
    out += text.slice(cursor, span.start) + `[REDACTED:${span.entity}]`;
    cursor = span.end;
  }
  return out + text.slice(cursor);
}

export interface ContextReportInput {
  /** The signature string that fired. */
  signature: string;
  /** The excerpt text, already canonicalized and redacted. */
  excerpt: string;
  /** How many times the signature fired in the captured log. */
  matchCount: number;
}

/** Compose the markdown context-report section for an issue body. */
export function composeContextReport(input: ContextReportInput): string {
  // The fence must be longer than any backtick run inside the excerpt.
  const longestRun = Math.max(0, ...[...input.excerpt.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  const times = `${input.matchCount} occurrence${input.matchCount === 1 ? "" : "s"}`;

  return [
    "## Context report",
    "",
    `**Signal signature:** \`${input.signature}\` — ${times} in the captured log; excerpt around the most recent firing.`,
    "",
    `${fence}log`,
    input.excerpt,
    fence,
    "",
    "_Filesystem paths in this excerpt are canonicalized to repo-relative form, and personal data has been redacted (`[REDACTED:<ENTITY>]`) before any handoff._",
    "",
  ].join("\n");
}
