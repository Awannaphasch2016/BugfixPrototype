import { ghCmd } from "@/lib/config";
import { errorResponse } from "@/lib/http";
import { run } from "@/lib/shell";

export const dynamic = "force-dynamic";

type GhIssue = { number: number; title: string; url: string; labels: { name: string }[] };

// The open queue, straight from the system of record. Fresh issues are filed
// in demo order each cycle, so ascending numbers put the cards on screen in
// the order the choreography walks them. Labels ride along so the cards can
// show the routing verdict (problem class, needs-human).
export async function GET() {
  try {
    const output = await run(ghCmd(), [
      "issue", "list", "--state", "open", "--json", "number,title,url,labels",
    ]);
    const issues = (JSON.parse(output) as GhIssue[])
      .sort((a, b) => a.number - b.number)
      .map(({ number, title, url, labels }) => ({
        number,
        title,
        url,
        labels: labels.map((label) => label.name),
      }));
    return Response.json({ issues });
  } catch (error) {
    return errorResponse(error);
  }
}
