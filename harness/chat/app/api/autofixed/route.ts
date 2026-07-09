import { ghCmd } from "@/lib/config";
import { errorResponse } from "@/lib/http";
import { run } from "@/lib/shell";

export const dynamic = "force-dynamic";

type GhPr = { number: number; title: string; url: string; headRefName: string };
type GhIssue = { number: number; title: string; url: string };

const FIX_BRANCH = /^fix\/issue-(\d+)$/;

// The autofix lane is derived, never stored: merged fix-branch PRs whose
// issue is currently closed. Reset reopens all issues, so it self-heals —
// merged PRs from past rehearsal cycles can't pollute the lane.
export async function GET() {
  try {
    const [prsOut, issuesOut] = await Promise.all([
      run(ghCmd(), ["pr", "list", "--state", "merged", "--json", "number,title,url,headRefName"]),
      run(ghCmd(), ["issue", "list", "--state", "closed", "--json", "number,title,url"]),
    ]);
    const prs: GhPr[] = JSON.parse(prsOut);
    const closedIssues = new Map<number, GhIssue>(
      (JSON.parse(issuesOut) as GhIssue[]).map((issue) => [issue.number, issue]),
    );

    // Merged PRs live forever, so a re-fixed issue has one merged PR per
    // rehearsal cycle sharing the same fix branch — only the latest merge
    // represents the lane.
    const latestPerIssue = new Map<number, { issue: GhIssue; pr: Omit<GhPr, "headRefName"> }>();
    for (const pr of prs) {
      const match = FIX_BRANCH.exec(pr.headRefName);
      const issue = match && closedIssues.get(Number(match[1]));
      if (!issue) continue;
      const existing = latestPerIssue.get(issue.number);
      if (existing && existing.pr.number > pr.number) continue;
      latestPerIssue.set(issue.number, {
        issue,
        pr: { number: pr.number, title: pr.title, url: pr.url },
      });
    }
    return Response.json({ autofixed: [...latestPerIssue.values()] });
  } catch (error) {
    return errorResponse(error);
  }
}
