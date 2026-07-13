import { promises as fs } from "fs";
import path from "path";
import { repoRoot } from "@/lib/config";

// Serves the attempt's rendered trace (static HTML written by the runner
// into harness/private/). The chat links to it from the PR card; GitHub
// stays the record for issues/PRs/diffs, the trace is the one artifact that
// lives only on the operator's machine. ?stage=planner|reviewer selects a
// stage transcript; default is the fixer's.
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ issue: string }> },
) {
  const { issue } = await params;
  if (!/^\d+$/.test(issue)) {
    return new Response("bad issue number", { status: 400 });
  }
  const stage = new URL(req.url).searchParams.get("stage");
  const suffix = stage === "planner" || stage === "reviewer" ? `-${stage}` : "";
  const file = path.join(
    repoRoot(),
    "harness",
    "private",
    `trace-issue-${issue}${suffix}.html`,
  );
  try {
    const html = await fs.readFile(file, "utf8");
    return new Response(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return new Response("no trace rendered for this attempt", { status: 404 });
  }
}
