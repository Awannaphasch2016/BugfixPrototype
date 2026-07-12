import { beforeEach, describe, expect, it } from "vitest";
import { writeFile } from "fs/promises";
import path from "path";
import { GET as listAutofixed } from "@/app/api/autofixed/route";
import { GET as listIssues } from "@/app/api/issues/route";
import { GET as listSolved } from "@/app/api/solved/route";
import { freshStubEnv, spawnedCommands, stubDir, writeStub } from "@/tests/helpers";

const REPO = "https://github.com/acme/BugfixPrototype";

const MERGED_PRS = [
  // Past-cycle merges: their issues are retired (closed as "not planned") but
  // the PRs live forever — they must never resurface in any lane.
  { number: 3, title: "Fix #1: Done tab shows the wrong tasks", url: `${REPO}/pull/3`, headRefName: "fix/issue-1" },
  { number: 5, title: "Fix #2: Due dates keep disappearing", url: `${REPO}/pull/5`, headRefName: "fix/issue-2" },
  // Current cycle: one autofixed, one human-approved — each issue with two
  // merged PRs, so the latest-PR-per-issue rule is observable on both routes.
  { number: 8, title: "Fix #4: Done tab shows the wrong tasks (first try)", url: `${REPO}/pull/8`, headRefName: "fix/issue-4" },
  { number: 10, title: "Fix #4: Done tab shows the wrong tasks", url: `${REPO}/pull/10`, headRefName: "fix/issue-4" },
  { number: 11, title: "Fix #5: Due dates keep disappearing", url: `${REPO}/pull/11`, headRefName: "fix/issue-5" },
  { number: 13, title: "Fix #5: Due dates keep disappearing (rerun)", url: `${REPO}/pull/13`, headRefName: "fix/issue-5" },
  // Noise: a non-fix branch and a fix branch whose issue isn't closed.
  { number: 14, title: "Update readme", url: `${REPO}/pull/14`, headRefName: "docs/readme" },
  { number: 15, title: "Fix #99: still open", url: `${REPO}/pull/15`, headRefName: "fix/issue-99" },
];

const CLOSED_ISSUES = [
  { number: 1, title: "Done tab shows the wrong tasks", url: `${REPO}/issues/1`, stateReason: "NOT_PLANNED", labels: [] },
  // A retired issue keeps the label it earned in its own cycle — retirement
  // never strips labels, so the "not planned" reason alone must exclude it.
  { number: 2, title: "Due dates keep disappearing", url: `${REPO}/issues/2`, stateReason: "NOT_PLANNED", labels: [{ name: "autofixed" }] },
  { number: 4, title: "Done tab shows the wrong tasks", url: `${REPO}/issues/4`, stateReason: "COMPLETED", labels: [{ name: "autofixed" }] },
  { number: 5, title: "Due dates keep disappearing", url: `${REPO}/issues/5`, stateReason: "COMPLETED", labels: [] },
  // Completed by hand with no merged fix-branch PR: no receipt, no card.
  { number: 9, title: "Stale demo note", url: `${REPO}/issues/9`, stateReason: "COMPLETED", labels: [] },
];

// The stub answers out of demo order; the route must sort ascending so the
// cards on screen match the filing (and demo) choreography.
const OPEN_ISSUES = [
  { number: 8, title: "Some tasks disappear after being marked done", url: `${REPO}/issues/8` },
  { number: 6, title: "Done tab shows the wrong tasks", url: `${REPO}/issues/6` },
  { number: 7, title: "Due dates keep disappearing", url: `${REPO}/issues/7` },
];

const ISSUE_4 = { number: 4, title: "Done tab shows the wrong tasks", url: `${REPO}/issues/4` };
const ISSUE_5 = { number: 5, title: "Due dates keep disappearing", url: `${REPO}/issues/5` };
const PR_10 = { number: 10, title: "Fix #4: Done tab shows the wrong tasks", url: `${REPO}/pull/10` };
const PR_13 = { number: 13, title: "Fix #5: Due dates keep disappearing (rerun)", url: `${REPO}/pull/13` };

beforeEach(async () => {
  await freshStubEnv();
  // The gh stub answers each query from a canned fixture, so the tests pin
  // the exact queries the routes make as well as the mapping of their output.
  process.env.CHAT_GH_CMD = await writeStub(
    "gh",
    `case "$*" in
  "pr list --state merged --limit 500 --json number,title,url,headRefName") cat "${stubDir()}/merged-prs.json" ;;
  "issue list --state closed --limit 500 --json number,title,url,stateReason,labels") cat "${stubDir()}/closed-issues.json" ;;
  "issue list --state open --json number,title,url") cat "${stubDir()}/open-issues.json" ;;
  *) echo "gh stub: unexpected args: $*" >&2; exit 1 ;;
esac`,
  );
  await writeFile(path.join(stubDir(), "merged-prs.json"), JSON.stringify(MERGED_PRS));
  await writeFile(path.join(stubDir(), "closed-issues.json"), JSON.stringify(CLOSED_ISSUES));
  await writeFile(path.join(stubDir(), "open-issues.json"), JSON.stringify(OPEN_ISSUES));
});

describe("GET /api/issues", () => {
  it("maps open issues to cards, sorted ascending by number", async () => {
    const res = await listIssues();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      issues: [OPEN_ISSUES[1], OPEN_ISSUES[2], OPEN_ISSUES[0]],
    });
    expect(await spawnedCommands()).toEqual([
      "gh issue list --state open --json number,title,url",
    ]);
  });

  it("returns an honest error when the GitHub query fails", async () => {
    process.env.CHAT_GH_CMD = path.join(stubDir(), "does-not-exist");
    const res = await listIssues();
    expect(res.status).toBe(500);
    const { error } = await res.json();
    expect(error).toBeTruthy();
  });
});

describe("GET /api/solved", () => {
  it("lists completed issues with a merged fix-branch PR, badged by the autofixed label", async () => {
    const res = await listSolved();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      solved: [
        { issue: ISSUE_4, pr: PR_10, badge: "autofixed" },
        // Two merged attempts exist for issue #5; only the latest represents it.
        { issue: ISSUE_5, pr: PR_13, badge: "human-approved" },
      ],
    });
  });

  it("excludes retired (not planned) issues even when they carry the label", async () => {
    const { solved } = await (await listSolved()).json();
    const numbers = solved.map((entry: { issue: { number: number } }) => entry.issue.number);
    expect(numbers).not.toContain(1);
    expect(numbers).not.toContain(2);
  });

  it("returns an honest error when the GitHub query fails", async () => {
    process.env.CHAT_GH_CMD = path.join(stubDir(), "does-not-exist");
    const res = await listSolved();
    expect(res.status).toBe(500);
    const { error } = await res.json();
    expect(error).toBeTruthy();
  });
});

describe("GET /api/autofixed", () => {
  it("lists only labeled completed issues — the no-human-in-the-loop subset, latest PR per issue", async () => {
    // Issue #4 has an older merged attempt (PR #8); only PR #10 may show.
    const res = await listAutofixed();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      autofixed: [{ issue: ISSUE_4, pr: PR_10 }],
    });
  });

  it("is empty right after reset, when every closed issue is retired", async () => {
    await writeFile(
      path.join(stubDir(), "closed-issues.json"),
      JSON.stringify(CLOSED_ISSUES.map((issue) => ({ ...issue, stateReason: "NOT_PLANNED" }))),
    );
    const res = await listAutofixed();
    expect(await res.json()).toEqual({ autofixed: [] });
  });
});
