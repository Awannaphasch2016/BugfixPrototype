import { errorResponse } from "@/lib/http";
import { solvedEntries } from "@/lib/solved";

export const dynamic = "force-dynamic";

// The no-human-in-the-loop subset of the solved list: same derivation,
// filtered to the lane label.
export async function GET() {
  try {
    const entries = await solvedEntries();
    return Response.json({
      autofixed: entries
        .filter((entry) => entry.badge === "autofixed")
        .map(({ issue, pr }) => ({ issue, pr })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
