import { ghCmd } from "@/lib/config";
import { errorResponse } from "@/lib/http";
import { run } from "@/lib/shell";

export const dynamic = "force-dynamic";

type Issue = { number: number; title: string; url: string };

// The open queue, straight from the system of record. Fresh issues are filed
// in demo order each cycle, so ascending numbers put the cards on screen in
// the order the choreography walks them.
export async function GET() {
  try {
    const output = await run(ghCmd(), [
      "issue", "list", "--state", "open", "--json", "number,title,url",
    ]);
    const issues = (JSON.parse(output) as Issue[]).sort((a, b) => a.number - b.number);
    return Response.json({ issues });
  } catch (error) {
    return errorResponse(error);
  }
}
