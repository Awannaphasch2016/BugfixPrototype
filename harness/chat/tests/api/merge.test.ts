import { beforeEach, describe, expect, it } from "vitest";
import { POST as dispatch } from "@/app/api/dispatch/route";
import { POST as merge } from "@/app/api/merge/route";
import { freshStubEnv, jsonPost, spawnedCommands, writeStub } from "@/tests/helpers";

const mergePr = (pr: unknown) => jsonPost(merge, "http://localhost/api/merge", { pr });

beforeEach(freshStubEnv);

describe("POST /api/merge", () => {
  it("runs the fixed merge sequence, preceded by the two-file restore", async () => {
    const res = await mergePr(7);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(await spawnedCommands()).toEqual([
      "git checkout HEAD -- demo-app/data/tasks.json demo-app/logs/app.log",
      "gh pr merge 7 --merge --delete-branch",
      "git checkout main",
      "git pull --ff-only origin main",
    ]);
  });

  it("rejects a merge while a dispatch is in flight", async () => {
    process.env.CHAT_RUNNER_CMD = await writeStub(
      "runner",
      `sleep 0.3\necho "==> PR ready for review: https://github.com/acme/BugfixPrototype/pull/7"`,
    );
    const running = jsonPost(dispatch, "http://localhost/api/dispatch", { issue: 2 });
    await new Promise((r) => setTimeout(r, 100));

    expect((await mergePr(7)).status).toBe(409);

    expect((await running).status).toBe(200);
    expect((await mergePr(7)).status).toBe(200);
  });

  it("rejects a request without a valid PR number and spawns nothing", async () => {
    const res = await mergePr("7 --admin");
    expect(res.status).toBe(400);
    expect(await spawnedCommands()).toEqual([]);
  });

  it("returns an honest error when the merge fails, and frees the lock", async () => {
    process.env.CHAT_GH_CMD = await writeStub("gh", "exit 1");
    const res = await mergePr(7);
    expect(res.status).toBe(500);
    const { error } = await res.json();
    expect(error).toBeTruthy();

    process.env.CHAT_GH_CMD = await writeStub("gh");
    expect((await mergePr(7)).status).toBe(200);
  });
});
