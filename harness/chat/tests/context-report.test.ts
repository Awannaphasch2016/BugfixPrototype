import { execFile } from "child_process";
import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyRedactions,
  canonicalizePaths,
  codePointSpansToUtf16,
  composeContextReport,
  parseLogLines,
  selectExcerpt,
  type RedactionSpan,
} from "@/lib/context-report";

// A synthetic pino-shaped log. The module is generic over any signature
// string; these tests never depend on the demo app's real log content.
const line = (time: number, level: number, msg: string, extra = "") =>
  `{"level":${level},"time":${time},"pid":11,"hostname":"box","reqId":"r${time}",` +
  `"method":"GET","route":"/api/things"${extra ? "," + extra : ""},"msg":"${msg}"}`;

const logOf = (...lines: string[]) => lines.join("\n") + "\n";

describe("parseLogLines", () => {
  it("parses NDJSON lines into level/time/msg plus the raw line", () => {
    const parsed = parseLogLines(logOf(line(1000, 30, "listed things")));
    expect(parsed).toHaveLength(1);
    expect(parsed[0].level).toBe(30);
    expect(parsed[0].time).toBe(1000);
    expect(parsed[0].msg).toBe("listed things");
    expect(parsed[0].raw).toContain('"reqId":"r1000"');
  });

  it("keeps unparseable lines defensively instead of throwing", () => {
    const parsed = parseLogLines("not json at all\n" + line(2, 30, "ok"));
    expect(parsed).toHaveLength(2);
    expect(parsed[0].json).toBeNull();
    expect(parsed[0].raw).toBe("not json at all");
    expect(parsed[1].msg).toBe("ok");
  });

  it("skips blank lines", () => {
    expect(parseLogLines("\n" + line(1, 30, "a") + "\n\n")).toHaveLength(1);
  });
});

describe("selectExcerpt", () => {
  const lines = [
    line(1, 30, "warmup"),
    line(2, 30, "listed things"),
    line(3, 50, "thing exploded"),
    line(4, 30, "listed things"),
    line(5, 30, "listed things"),
    line(6, 50, "thing exploded"),
    line(7, 30, "aftermath"),
  ];

  it("windows around the most recent matching line, deterministically", () => {
    const a = selectExcerpt(parseLogLines(logOf(...lines)), "thing exploded", {
      before: 2,
      after: 1,
    });
    const b = selectExcerpt(parseLogLines(logOf(...lines)), "thing exploded", {
      before: 2,
      after: 1,
    });
    expect(a).not.toBeNull();
    expect(a!.startLine).toBe(3);
    expect(a!.endLine).toBe(6);
    expect(a!.matchLine).toBe(5);
    expect(a!.matchCount).toBe(2);
    expect(a!.lines).toHaveLength(4);
    expect(a!.text).toBe(a!.lines.join("\n"));
    expect(a).toEqual(b);
  });

  it("clamps the window at the ends of the log", () => {
    const ex = selectExcerpt(parseLogLines(logOf(...lines.slice(0, 3))), "thing exploded", {
      before: 10,
      after: 10,
    });
    expect(ex!.startLine).toBe(0);
    expect(ex!.endLine).toBe(2);
  });

  it("returns null when no line matches the signature", () => {
    expect(selectExcerpt(parseLogLines(logOf(...lines)), "never happened")).toBeNull();
  });
});

describe("canonicalizePaths", () => {
  it("strips an explicitly supplied repo root", () => {
    expect(
      canonicalizePaths("at /repo/root/demo-app/lib/logger.ts:3:1", ["/repo/root"]),
    ).toBe("at demo-app/lib/logger.ts:3:1");
  });

  it("makes /workspaces/<name>/ paths repo-relative", () => {
    expect(canonicalizePaths("Error at /workspaces/SomeRepo/src/x.ts:1:2")).toBe(
      "Error at src/x.ts:1:2",
    );
  });

  it("strips any /home/<user>/ prefix", () => {
    expect(canonicalizePaths("read /home/alice/proj/notes.txt")).toBe("read proj/notes.txt");
  });

  it("rewrites every occurrence, including inside JSON-escaped stacks", () => {
    const input =
      '"stack":"at PATCH (/workspaces/Repo/demo-app/app/route.ts:1:1)\\n at go (/workspaces/Repo/demo-app/lib/x.ts:2:2)"';
    const out = canonicalizePaths(input);
    expect(out).not.toContain("/workspaces/");
    expect(out).toContain("(demo-app/app/route.ts:1:1)");
    expect(out).toContain("(demo-app/lib/x.ts:2:2)");
  });

  it("leaves ordinary text and relative paths alone", () => {
    expect(canonicalizePaths("demo-app/lib/x.ts is fine")).toBe("demo-app/lib/x.ts is fine");
  });
});

describe("applyRedactions", () => {
  const text = "Call Ada Lovelace at 555-0100 today";

  it("replaces each span with a visible entity marker", () => {
    const spans: RedactionSpan[] = [
      { start: 5, end: 17, entity: "PERSON" },
      { start: 21, end: 29, entity: "PHONE_NUMBER" },
    ];
    expect(applyRedactions(text, spans)).toBe(
      "Call [REDACTED:PERSON] at [REDACTED:PHONE_NUMBER] today",
    );
  });

  it("is independent of span order", () => {
    const spans: RedactionSpan[] = [
      { start: 21, end: 29, entity: "PHONE_NUMBER" },
      { start: 5, end: 17, entity: "PERSON" },
    ];
    expect(applyRedactions(text, spans)).toBe(
      "Call [REDACTED:PERSON] at [REDACTED:PHONE_NUMBER] today",
    );
  });

  it("merges overlapping spans, keeping the earliest span's entity", () => {
    const spans: RedactionSpan[] = [
      { start: 5, end: 12, entity: "PERSON" },
      { start: 9, end: 17, entity: "EMAIL_ADDRESS" },
    ];
    expect(applyRedactions(text, spans)).toBe("Call [REDACTED:PERSON] at 555-0100 today");
  });

  it("merges adjacent spans of the same entity, keeps distinct entities separate", () => {
    expect(
      applyRedactions("abcdef", [
        { start: 0, end: 2, entity: "PERSON" },
        { start: 2, end: 4, entity: "PERSON" },
      ]),
    ).toBe("[REDACTED:PERSON]ef");
    expect(
      applyRedactions("abcdef", [
        { start: 0, end: 2, entity: "PERSON" },
        { start: 2, end: 4, entity: "PHONE_NUMBER" },
      ]),
    ).toBe("[REDACTED:PERSON][REDACTED:PHONE_NUMBER]ef");
  });

  it("ignores empty spans and clamps out-of-range spans", () => {
    expect(applyRedactions("abc", [{ start: 1, end: 1, entity: "PERSON" }])).toBe("abc");
    expect(applyRedactions("abc", [{ start: 2, end: 99, entity: "PERSON" }])).toBe(
      "ab[REDACTED:PERSON]",
    );
  });

  it("redacts nothing when given no spans", () => {
    expect(applyRedactions(text, [])).toBe(text);
  });
});

describe("codePointSpansToUtf16", () => {
  it("converts Python-style code point offsets to JS string indices", () => {
    // The emoji is one code point but two UTF-16 units; "Ada" starts at
    // code point 2 but JS index 3.
    const text = "🎉 Ada x";
    const [span] = codePointSpansToUtf16(text, [{ start: 2, end: 5, entity: "PERSON" }]);
    expect(text.slice(span.start, span.end)).toBe("Ada");
  });

  it("is the identity on plain ASCII text", () => {
    const spans = [{ start: 1, end: 3, entity: "PERSON" }];
    expect(codePointSpansToUtf16("abcdef", spans)).toEqual(spans);
  });
});

describe("composeContextReport", () => {
  it("names the signature, fences the excerpt, and states the sanitization", () => {
    const report = composeContextReport({
      signature: "thing exploded",
      excerpt: '{"level":50,"msg":"thing exploded","who":"[REDACTED:PERSON]"}',
      matchCount: 2,
    });
    expect(report).toContain("## Context report");
    expect(report).toContain("`thing exploded`");
    expect(report).toContain("2 occurrence");
    expect(report).toMatch(/```log\n[^]*thing exploded[^]*\n```/);
    expect(report.toLowerCase()).toContain("canonicalized");
    expect(report.toLowerCase()).toContain("redacted");
  });

  it("grows the code fence past any backtick run inside the excerpt", () => {
    const report = composeContextReport({
      signature: "s",
      excerpt: "weird ``` inside",
      matchCount: 1,
    });
    expect(report).toContain("````log\nweird ``` inside\n````");
  });
});

// --- The filing seam: compose-report CLI + redaction command boundary ------
//
// The CLI is what harness/file-signal-issue.sh invokes; the redaction command
// is stubbed exactly like the chat's other command boundaries. The contract
// under test: a failing redaction command means NO report on stdout and a
// nonzero exit — the filing script then files nothing (fail safe).

const chatRoot = path.resolve(__dirname, "..");
const tsxBin = path.join(chatRoot, "node_modules", ".bin", "tsx");
const cli = path.join(chatRoot, "bin", "compose-report.ts");

let dir: string;

function runCli(
  args: string[],
  env: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      tsxBin,
      [cli, ...args],
      { cwd: chatRoot, env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        resolve({ code: error ? (error as { code?: number }).code ?? 1 : 0, stdout, stderr });
      },
    );
  });
}

async function writeExecutable(name: string, body: string) {
  const p = path.join(dir, name);
  await writeFile(p, `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
  return p;
}

describe("compose-report CLI (filing seam)", () => {
  let logFile: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "context-report-"));
    logFile = path.join(dir, "app.log");
    await writeFile(
      logFile,
      logOf(
        line(1, 30, "creating task", '"payload":{"title":"Call Ada Lovelace"}'),
        line(2, 50, "thing exploded"),
      ),
    );
  });

  it("fails safe: a failing redaction command means nonzero exit and no report", async () => {
    const redact = await writeExecutable("redact-fail", "echo 'model missing' >&2\nexit 3");
    const res = await runCli(["--log", logFile, "--signature", "thing exploded"], {
      CHAT_REDACT_CMD: redact,
    });
    expect(res.code).not.toBe(0);
    expect(res.stdout).toBe("");
    expect(res.stderr.toLowerCase()).toContain("redact");
  });

  it("fails safe when the redaction command dies before reading its input", async () => {
    const res = await runCli(["--log", logFile, "--signature", "thing exploded"], {
      CHAT_REDACT_CMD: "/bin/false",
    });
    expect(res.code).not.toBe(0);
    expect(res.stdout).toBe("");
    expect(res.stderr.toLowerCase()).toContain("redact");
  });

  it("applies the spans the redaction command reports", async () => {
    // Stub finds "Ada Lovelace" in whatever text it is given and reports its
    // span, proving the CLI redacts the same text it sent for analysis.
    const redact = await writeExecutable(
      "redact-ok",
      `python3 -c "
import json, sys
text = sys.stdin.read()
i = text.find('Ada Lovelace')
spans = [] if i < 0 else [{'start': i, 'end': i + len('Ada Lovelace'), 'entity': 'PERSON'}]
print(json.dumps(spans))
"`,
    );
    const res = await runCli(["--log", logFile, "--signature", "thing exploded"], {
      CHAT_REDACT_CMD: redact,
    });
    expect(res.stderr).toBe("");
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("[REDACTED:PERSON]");
    expect(res.stdout).not.toContain("Ada Lovelace");
    expect(res.stdout).toContain("thing exploded");
  });

  it("fails with a clear error when the signature never fired", async () => {
    const redact = await writeExecutable("redact-ok", 'echo "[]"');
    const res = await runCli(["--log", logFile, "--signature", "ghost"], {
      CHAT_REDACT_CMD: redact,
    });
    expect(res.code).not.toBe(0);
    expect(res.stdout).toBe("");
    expect(res.stderr).toContain("ghost");
  });
});
