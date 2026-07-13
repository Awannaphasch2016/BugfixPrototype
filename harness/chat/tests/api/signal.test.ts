import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeFile } from "fs/promises";
import path from "path";
import { POST as signal } from "@/app/api/signal/route";
import { acquireRunLock, releaseRunLock } from "@/lib/run-state";
import { freshStubEnv, jsonPost, spawnedCommands, stubDir, writeStub } from "@/tests/helpers";

// The routing route, tested at the Stage 3 seam: every external command is a
// stub that logs its argv, so these tests pin the exact command sequences of
// each routing verdict — and that the fail-safe files nothing.

const REPO = "https://github.com/acme/BugfixPrototype";
const SIGNATURE = "task update failed validation";
const TITLE = `[signal] ${SIGNATURE}`;
const CLASS = "class:task-update-failed-validation";

const LOG_LINES = [
  `{"level":30,"time":1,"msg":"listed tasks"}`,
  `{"level":50,"time":2,"msg":"${SIGNATURE}","taskId":"w2qf81zk"}`,
  `{"level":30,"time":3,"msg":"task updated"}`,
].join("\n");

// Precedent fixture: a completed issue wearing the class label, whose merged
// fix-branch PR is the human-approved receipt (ADR-0002).
const PRECEDENT_CLOSED = [
  {
    number: 30,
    title: TITLE,
    url: `${REPO}/issues/30`,
    stateReason: "COMPLETED",
    labels: [{ name: CLASS }],
  },
];
const PRECEDENT_MERGED = [
  { number: 31, title: `Fix #30: ${TITLE}`, url: `${REPO}/pull/31`, headRefName: "fix/issue-30" },
];

const postSignal = (body: unknown) => jsonPost(signal, "http://localhost/api/signal", body);

async function stubGh(fixtures: {
  open?: unknown[];
  merged?: unknown[];
  closed?: unknown[];
}) {
  await writeFile(path.join(stubDir(), "open-issues.json"), JSON.stringify(fixtures.open ?? []));
  await writeFile(path.join(stubDir(), "merged-prs.json"), JSON.stringify(fixtures.merged ?? []));
  await writeFile(path.join(stubDir(), "closed-issues.json"), JSON.stringify(fixtures.closed ?? []));
  process.env.CHAT_GH_CMD = await writeStub(
    "gh",
    `case "$*" in
  "issue list --state open --json number,title") cat "${stubDir()}/open-issues.json" ;;
  "pr list --state merged --limit 500 --json number,title,url,headRefName") cat "${stubDir()}/merged-prs.json" ;;
  "issue list --state closed --limit 500 --json number,title,url,stateReason,labels") cat "${stubDir()}/closed-issues.json" ;;
  "label create "*) : ;;
  "issue create "*) echo "${REPO}/issues/42" ;;
  "pr merge "*) : ;;
  "issue edit "*) : ;;
  *) echo "gh stub: unexpected args: $*" >&2; exit 1 ;;
esac`,
  );
}

beforeEach(async () => {
  await freshStubEnv();
  await stubGh({});
  const logPath = path.join(stubDir(), "app.log");
  await writeFile(logPath, LOG_LINES);
  process.env.SIGNAL_LOG_FILE = logPath;
  // The redaction boundary: text on stdin, spans JSON on stdout.
  process.env.CHAT_REDACT_CMD = await writeStub("redact", `cat > /dev/null\necho "[]"`);
  process.env.CHAT_RUNNER_CMD = await writeStub(
    "runner",
    `echo "==> PR ready for review: ${REPO}/pull/7"`,
  );
});

describe("POST /api/signal", () => {
  it("absorbs a repeat: an open issue with the signal title, and nothing is created", async () => {
    await stubGh({ open: [{ number: 12, title: TITLE }] });
    const res = await postSignal({ signature: SIGNATURE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ routed: "absorbed", issue: 12 });
    // Dedupe is the whole flow: no redaction, no ledger read, no create.
    expect(await spawnedCommands()).toEqual([
      "gh issue list --state open --json number,title",
    ]);
  });

  it("files a novel class with the class and needs-human labels, after redaction and a labels-only ledger read", async () => {
    const res = await postSignal({ signature: SIGNATURE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ routed: "needs-human", issue: 42, class: CLASS });

    const commands = await spawnedCommands();
    expect(commands.slice(0, 6)).toEqual([
      "gh issue list --state open --json number,title",
      "redact",
      "gh pr list --state merged --limit 500 --json number,title,url,headRefName",
      "gh issue list --state closed --limit 500 --json number,title,url,stateReason,labels",
      `gh label create ${CLASS} --color 1d76db --description problem class — precedent ledger`,
      "gh label create needs-human --color d93f0b --description novel problem class — waiting for a human dispatch",
    ]);
    expect(commands).toHaveLength(7);
    expect(commands[6]).toMatch(
      new RegExp(`^gh issue create --title \\[signal\\] ${SIGNATURE} --body `),
    );
    expect(commands[6]).toContain("## Context report");
    expect(commands[6]).toContain(`--label ${CLASS} --label needs-human`);
    // Nothing dispatches on a novel class: the issue waits for a human.
    expect(commands.some((c) => c.startsWith("runner"))).toBe(false);
  });

  it("routes a precedented class to autofix: files without needs-human, then dispatches, merges, and labels autofixed", async () => {
    await stubGh({ closed: PRECEDENT_CLOSED, merged: PRECEDENT_MERGED });
    const res = await postSignal({ signature: SIGNATURE });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ routed: "autofix", issue: 42, class: CLASS });

    // The webhook answered without waiting on the run; the fire-and-forget
    // chain lands in the command log as it completes.
    await vi.waitFor(async () => {
      expect((await spawnedCommands()).at(-1)).toBe("gh issue edit 42 --add-label autofixed");
    });

    const commands = await spawnedCommands();
    expect(commands.slice(0, 5)).toEqual([
      "gh issue list --state open --json number,title",
      "redact",
      "gh pr list --state merged --limit 500 --json number,title,url,headRefName",
      "gh issue list --state closed --limit 500 --json number,title,url,stateReason,labels",
      `gh label create ${CLASS} --color 1d76db --description problem class — precedent ledger`,
    ]);
    expect(commands[5]).toMatch(/^gh issue create --title /);
    expect(commands[5]).toContain(`--label ${CLASS}`);
    expect(commands[5]).not.toContain("needs-human");
    // The shared dispatch core (restore, runner), then the setup.sh flow:
    // merge, sync the checkout, mark the lane on the record.
    expect(commands.slice(6)).toEqual([
      "git show HEAD:demo-app/data/tasks.json",
      "git show HEAD:demo-app/logs/app.log",
      "runner 42",
      "gh pr merge 7 --merge --delete-branch",
      "git checkout main",
      "git pull --ff-only origin main",
      "gh issue edit 42 --add-label autofixed",
    ]);
  });

  it("skips the auto-dispatch when a run is in flight: still routed autofix, noted queued-behind-lock", async () => {
    await stubGh({ closed: PRECEDENT_CLOSED, merged: PRECEDENT_MERGED });
    expect(acquireRunLock()).toBe(true);
    try {
      const res = await postSignal({ signature: SIGNATURE });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        routed: "autofix",
        issue: 42,
        class: CLASS,
        note: "queued-behind-lock",
      });
    } finally {
      releaseRunLock();
    }
    // The issue is left filed; the runner never starts.
    const commands = await spawnedCommands();
    expect(commands.some((c) => c.startsWith("gh issue create"))).toBe(true);
    expect(commands.some((c) => c.startsWith("runner"))).toBe(false);
  });

  it("fails safe on a redaction-command failure: 502, and no issue is created", async () => {
    process.env.CHAT_REDACT_CMD = await writeStub("redact", "exit 1");
    const res = await postSignal({ signature: SIGNATURE });
    expect(res.status).toBe(502);
    const { error } = await res.json();
    expect(error).toMatch(/refusing to file/);

    const commands = await spawnedCommands();
    expect(commands.some((c) => c.startsWith("gh issue create"))).toBe(false);
    expect(commands.some((c) => c.startsWith("gh label create"))).toBe(false);
  });

  it("accepts a Grafana-alertmanager-shaped body, annotations first, labels as fallback", async () => {
    await stubGh({ open: [{ number: 12, title: TITLE }] });
    const viaAnnotations = await postSignal({
      alerts: [{ annotations: { signature: SIGNATURE }, labels: { alertname: "noise" } }],
    });
    expect(await viaAnnotations.json()).toEqual({ routed: "absorbed", issue: 12 });

    const viaLabels = await postSignal({
      alerts: [{ annotations: {}, labels: { signature: SIGNATURE } }],
    });
    expect(await viaLabels.json()).toEqual({ routed: "absorbed", issue: 12 });
  });

  it("rejects a body with no signature string cleanly: 400, nothing spawned", async () => {
    for (const garbage of [
      {},
      { signature: 7 },
      { signature: "  " },
      { alerts: [] },
      { alerts: [{ annotations: { signature: 3 } }] },
      "just a string",
      null,
    ]) {
      const res = await postSignal(garbage);
      expect(res.status).toBe(400);
    }
    expect(await spawnedCommands()).toEqual([]);
  });
});
