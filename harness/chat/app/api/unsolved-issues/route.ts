import { ghCmd } from "@/lib/config";
import { errorResponse } from "@/lib/http";
import { run } from "@/lib/shell";

export const dynamic = "force-dynamic";

// The assisted lane's queue: open issues, straight from the system of record.
export async function GET() {
  try {
    const output = await run(ghCmd(), [
      "issue", "list", "--state", "open", "--json", "number,title,url",
    ]);
    return Response.json({ issues: JSON.parse(output) });
  } catch (error) {
    return errorResponse(error);
  }
}
