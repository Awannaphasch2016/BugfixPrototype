import { errorResponse } from "@/lib/http";
import { solvedEntries } from "@/lib/solved";

export const dynamic = "force-dynamic";

// Everything completed, both lanes on one screen: each card badged
// "autofixed" or "human-approved" with its merged PR as the receipt.
export async function GET() {
  try {
    return Response.json({ solved: await solvedEntries() });
  } catch (error) {
    return errorResponse(error);
  }
}
