import { ghCmd } from "@/lib/config";
import { run } from "@/lib/shell";

type GhPr = { number: number; title: string; url: string; headRefName: string };
type GhLabel = { name: string };
type GhIssue = {
  number: number;
  title: string;
  url: string;
  stateReason: string;
  labels: GhLabel[];
};

export type IssueRef = { number: number; title: string; url: string };
export type PrRef = { number: number; title: string; url: string };
export type Badge = "autofixed" | "human-approved";
export type SolvedEntry = { issue: IssueRef; pr: PrRef; badge: Badge };

const FIX_BRANCH = /^fix\/issue-(\d+)$/;
// The lane marker (CONTEXT.md): applied by the pipeline at the moment it
// merges without review — setup.sh's seeding and the signal route's
// auto-dispatch are the two places that moment happens.
export const AUTOFIXED_LABEL = "autofixed";
const LANE_LABEL = AUTOFIXED_LABEL;

// Two axes, two mechanisms: lifecycle is GitHub's native issue state (only
// "closed as completed" counts as solved — retired rehearsal issues are
// "not planned" and stay out forever, even though retirement never strips
// the lane label they earned in their own cycle); lane is the `autofixed`
// label, applied by the pipeline at auto-merge. Each solved card carries its
// merged PR as the clickable receipt, so completed issues without a merged
// fix-branch PR don't appear.
export async function solvedEntries(): Promise<SolvedEntry[]> {
  return (await solvedRecords()).map(({ issue, pr }) => ({
    issue: { number: issue.number, title: issue.title, url: issue.url },
    pr,
    badge: issue.labels.some((label) => label.name === LANE_LABEL)
      ? "autofixed"
      : "human-approved",
  }));
}

// The precedent ledger read (ADR-0002): a problem class has precedent when a
// closed-as-completed issue carrying its label has a merged fix-branch PR —
// exactly a solved record whose issue wears the label. Labels ride the solved
// queries; no other store exists to consult. Returns the precedent issue
// itself (the most recent, when a class has several) so the context report
// can link it at filing time (stage-4b: correct every cycle, never cached).
export async function precedentFor(classLabel: string): Promise<IssueRef | null> {
  const wearing = (await solvedRecords()).filter(({ issue }) =>
    issue.labels.some((label) => label.name === classLabel),
  );
  const latest = wearing.at(-1);
  return latest
    ? { number: latest.issue.number, title: latest.issue.title, url: latest.issue.url }
    : null;
}

async function solvedRecords(): Promise<{ issue: GhIssue; pr: PrRef }[]> {
  // Nothing is ever deleted, so closed issues and merged PRs accumulate a few
  // per cycle forever — gh's default cap of 30 would silently truncate the
  // record an auditor browses.
  const [prsOut, issuesOut] = await Promise.all([
    run(ghCmd(), [
      "pr", "list", "--state", "merged", "--limit", "500",
      "--json", "number,title,url,headRefName",
    ]),
    run(ghCmd(), [
      "issue", "list", "--state", "closed", "--limit", "500",
      "--json", "number,title,url,stateReason,labels",
    ]),
  ]);
  const prs: GhPr[] = JSON.parse(prsOut);
  const completed = new Map<number, GhIssue>(
    (JSON.parse(issuesOut) as GhIssue[])
      .filter((issue) => issue.stateReason === "COMPLETED")
      .map((issue) => [issue.number, issue]),
  );

  // Merged PRs live forever, so a re-attempted issue has several merged PRs
  // sharing the same fix branch — only the latest merge represents it.
  const latestPerIssue = new Map<number, { issue: GhIssue; pr: PrRef }>();
  for (const pr of prs) {
    const match = FIX_BRANCH.exec(pr.headRefName);
    const issue = match && completed.get(Number(match[1]));
    if (!issue) continue;
    const existing = latestPerIssue.get(issue.number);
    if (existing && existing.pr.number > pr.number) continue;
    latestPerIssue.set(issue.number, {
      issue,
      pr: { number: pr.number, title: pr.title, url: pr.url },
    });
  }

  return [...latestPerIssue.values()].sort((a, b) => a.issue.number - b.issue.number);
}
