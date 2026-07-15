import { beforeEach, describe, expect, it } from "vitest";
import { POST as dispatch } from "@/app/api/dispatch/route";
import { freshStubEnv, jsonPost, spawnedCommands, writeStub } from "@/tests/helpers";

function dispatchIssue(issue: unknown, note?: string) {
  return jsonPost(
    dispatch,
    "http://localhost/api/dispatch",
    note === undefined ? { issue } : { issue, note },
  );
}

beforeEach(async () => {
  await freshStubEnv();
  process.env.CHAT_RUNNER_CMD = await writeStub(
    "runner",
    `echo "==> PR ready for review: https://github.com/acme/BugfixPrototype/pull/7"`,
  );
});

describe("POST /api/dispatch", () => {
  it("runs the runner on the issue and returns the PR URL from its output", async () => {
    const res = await dispatchIssue(2);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      prUrl: "https://github.com/acme/BugfixPrototype/pull/7",
      prNumber: 7,
    });
  });

  it("restores exactly the two runtime-dirtied data files before the runner starts", async () => {
    await dispatchIssue(2);
    expect(await spawnedCommands()).toEqual([
      "git show HEAD:demo-app/data/tasks.json",
      "git show HEAD:demo-app/logs/app.log",
      "runner 2",
    ]);
  });

  it("rejects a second dispatch while a run is in flight, and accepts one after", async () => {
    process.env.CHAT_RUNNER_CMD = await writeStub(
      "runner",
      `sleep 0.3\necho "==> PR ready for review: https://github.com/acme/BugfixPrototype/pull/7"`,
    );
    const first = dispatchIssue(2);
    await new Promise((r) => setTimeout(r, 100));

    const second = await dispatchIssue(3);
    expect(second.status).toBe(409);

    expect((await first).status).toBe(200);
    expect((await dispatchIssue(3)).status).toBe(200);
  });

  it("rejects a request without a valid issue number and spawns nothing", async () => {
    const res = await dispatchIssue("2; rm -rf /");
    expect(res.status).toBe(400);
    expect(await spawnedCommands()).toEqual([]);
  });

  it("posts a note as an issue comment, then passes it verbatim as the runner's second argument", async () => {
    const res = await dispatchIssue(2, "use green for the text in the todo list");
    expect(res.status).toBe(200);
    expect(await spawnedCommands()).toEqual([
      "git show HEAD:demo-app/data/tasks.json",
      "git show HEAD:demo-app/logs/app.log",
      "gh issue comment 2 --body use green for the text in the todo list",
      "runner 2 use green for the text in the todo list",
    ]);
  });

  it("trims the note; whitespace-only dispatches exactly as today — no comment, no second argument", async () => {
    const res = await dispatchIssue(2, "  \n\t ");
    expect(res.status).toBe(200);
    expect(await spawnedCommands()).toEqual([
      "git show HEAD:demo-app/data/tasks.json",
      "git show HEAD:demo-app/logs/app.log",
      "runner 2",
    ]);
  });

  it("aborts the dispatch when the comment fails to post: the runner never starts", async () => {
    process.env.CHAT_GH_CMD = await writeStub("gh", "exit 1");
    const res = await dispatchIssue(2, "use green for the text in the todo list");
    expect(res.status).toBe(500);
    const commands = await spawnedCommands();
    expect(commands.some((c) => c.startsWith("runner"))).toBe(false);

    // the lock is freed: a follow-up dispatch goes through
    expect((await dispatchIssue(2)).status).toBe(200);
  });

  it("passes the replay flag with the first attempt when the replay switch is on", async () => {
    process.env.DEMO_REPLAY = "1";
    const res = await dispatchIssue(2);
    expect(res.status).toBe(200);
    expect(await spawnedCommands()).toEqual([
      "git show HEAD:demo-app/data/tasks.json",
      "git show HEAD:demo-app/logs/app.log",
      "runner --replay --attempt 1 2",
    ]);
  });

  it("keeps the note behind the replay flags — the runner still sees it last", async () => {
    process.env.DEMO_REPLAY = "1";
    await dispatchIssue(2, "use green for the text in the todo list");
    expect((await spawnedCommands()).at(-1)).toBe(
      "runner --replay --attempt 1 2 use green for the text in the todo list",
    );
  });

  it("treats DEMO_REPLAY=0 as off: no replay flag reaches the runner", async () => {
    process.env.DEMO_REPLAY = "0";
    await dispatchIssue(2);
    expect((await spawnedCommands()).at(-1)).toBe("runner 2");
  });

  it("returns an honest error when the runner fails, and frees the lock", async () => {
    process.env.CHAT_RUNNER_CMD = await writeStub("runner", "exit 1");
    const res = await dispatchIssue(2);
    expect(res.status).toBe(500);
    const { error } = await res.json();
    expect(error).toBeTruthy();

    process.env.CHAT_RUNNER_CMD = await writeStub(
      "runner",
      `echo "==> PR ready for review: https://github.com/acme/BugfixPrototype/pull/8"`,
    );
    expect((await dispatchIssue(2)).status).toBe(200);
  });
});
