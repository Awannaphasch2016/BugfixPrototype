import { beforeEach, describe, expect, it } from "vitest";
import { POST as dispatch } from "@/app/api/dispatch/route";
import { freshStubEnv, jsonPost, spawnedCommands, writeStub } from "@/tests/helpers";

function dispatchIssue(issue: unknown) {
  return jsonPost(dispatch, "http://localhost/api/dispatch", { issue });
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
      "git checkout HEAD -- demo-app/data/tasks.json demo-app/logs/app.log",
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
