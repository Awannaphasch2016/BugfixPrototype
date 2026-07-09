import { beforeEach, describe, expect, it } from "vitest";
import { POST as dispatch } from "@/app/api/dispatch/route";
import { GET as dispatchStatus } from "@/app/api/dispatch-status/route";
import { freshStubEnv, jsonPost, writeStub } from "@/tests/helpers";

const dispatchIssue = (issue: unknown) =>
  jsonPost(dispatch, "http://localhost/api/dispatch", { issue });

const status = async () => (await dispatchStatus()).json();

beforeEach(async () => {
  await freshStubEnv();
  process.env.CHAT_RUNNER_CMD = await writeStub(
    "runner",
    `echo "==> PR ready for review: https://github.com/acme/BugfixPrototype/pull/7"`,
  );
});

// The status route is the recovery channel: if a proxy between the browser
// and the backend kills the blocking dispatch request, the client polls this
// to pick up the outcome of the run that kept going server-side.
describe("GET /api/dispatch-status", () => {
  it("reports running while a dispatch is in flight", async () => {
    process.env.CHAT_RUNNER_CMD = await writeStub(
      "runner",
      `sleep 0.3\necho "==> PR ready for review: https://github.com/acme/BugfixPrototype/pull/7"`,
    );
    const running = dispatchIssue(2);
    await new Promise((r) => setTimeout(r, 100));

    expect(await status()).toEqual({ status: "running", issue: 2 });
    await running;
  });

  it("reports the PR after a successful dispatch", async () => {
    await dispatchIssue(2);
    expect(await status()).toEqual({
      status: "done",
      issue: 2,
      prUrl: "https://github.com/acme/BugfixPrototype/pull/7",
      prNumber: 7,
    });
  });

  it("reports failure after the runner fails", async () => {
    process.env.CHAT_RUNNER_CMD = await writeStub("runner", "exit 1");
    await dispatchIssue(3);
    const s = await status();
    expect(s.status).toBe("failed");
    expect(s.issue).toBe(3);
    expect(s.error).toBeTruthy();
  });
});
