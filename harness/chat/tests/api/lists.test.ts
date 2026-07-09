import { beforeEach, describe, expect, it } from "vitest";
import { writeFile } from "fs/promises";
import path from "path";
import { GET as listAutofixed } from "@/app/api/autofixed/route";
import { GET as listUnsolved } from "@/app/api/unsolved-issues/route";
import { freshStubEnv, spawnedCommands, stubDir, writeStub } from "@/tests/helpers";

const REPO = "https://github.com/acme/BugfixPrototype";

const MERGED_PRS = [
  { number: 4, title: "Fix #1: Done filter shows active tasks", url: `${REPO}/pull/4`, headRefName: "fix/issue-1" },
  { number: 9, title: "Fix #9: still open", url: `${REPO}/pull/9`, headRefName: "fix/issue-9" },
  { number: 10, title: "Update readme", url: `${REPO}/pull/10`, headRefName: "docs/readme" },
  { number: 12, title: "Fix #1: Done filter shows active tasks (rerun)", url: `${REPO}/pull/12`, headRefName: "fix/issue-1" },
];

const CLOSED_ISSUES = [
  { number: 1, title: "Done filter shows active tasks", url: `${REPO}/issues/1` },
];

const OPEN_ISSUES = [
  { number: 2, title: "Editing a task wipes its due date", url: `${REPO}/issues/2` },
  { number: 3, title: "Tasks sometimes vanish after a rename", url: `${REPO}/issues/3` },
];

beforeEach(async () => {
  await freshStubEnv();
  // The gh stub answers each query from a canned fixture, so the tests pin
  // the exact queries the routes make as well as the mapping of their output.
  process.env.CHAT_GH_CMD = await writeStub(
    "gh",
    `case "$*" in
  "pr list --state merged --json number,title,url,headRefName") cat "${stubDir()}/merged-prs.json" ;;
  "issue list --state closed --json number,title,url") cat "${stubDir()}/closed-issues.json" ;;
  "issue list --state open --json number,title,url") cat "${stubDir()}/open-issues.json" ;;
  *) echo "gh stub: unexpected args: $*" >&2; exit 1 ;;
esac`,
  );
  await writeFile(path.join(stubDir(), "merged-prs.json"), JSON.stringify(MERGED_PRS));
  await writeFile(path.join(stubDir(), "closed-issues.json"), JSON.stringify(CLOSED_ISSUES));
  await writeFile(path.join(stubDir(), "open-issues.json"), JSON.stringify(OPEN_ISSUES));
});

describe("GET /api/unsolved-issues", () => {
  it("maps open issues to cards", async () => {
    const res = await listUnsolved();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ issues: OPEN_ISSUES });
    expect(await spawnedCommands()).toEqual([
      "gh issue list --state open --json number,title,url",
    ]);
  });

  it("returns an honest error when the GitHub query fails", async () => {
    process.env.CHAT_GH_CMD = path.join(stubDir(), "does-not-exist");
    const res = await listUnsolved();
    expect(res.status).toBe(500);
    const { error } = await res.json();
    expect(error).toBeTruthy();
  });
});

describe("GET /api/autofixed", () => {
  it("lists merged fix-branch PRs whose issue is currently closed, latest PR per issue", async () => {
    // PR #4 is an older rehearsal-cycle merge for the same issue: merged PRs
    // live forever on GitHub, so only the newest one may represent the lane.
    const res = await listAutofixed();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      autofixed: [
        {
          issue: CLOSED_ISSUES[0],
          pr: { number: 12, title: "Fix #1: Done filter shows active tasks (rerun)", url: `${REPO}/pull/12` },
        },
      ],
    });
  });

  it("is empty when no fix-branch PR has a closed issue (post-reset state)", async () => {
    await writeFile(path.join(stubDir(), "closed-issues.json"), "[]");
    const res = await listAutofixed();
    expect(await res.json()).toEqual({ autofixed: [] });
  });
});
