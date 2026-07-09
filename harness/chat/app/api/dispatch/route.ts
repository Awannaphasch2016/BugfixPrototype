import { z } from "zod";
import { runnerCmd } from "@/lib/config";
import { errorResponse } from "@/lib/http";
import { acquireRunLock, releaseRunLock } from "@/lib/lock";
import { restoreRuntimeDirtiedFiles } from "@/lib/restore";
import { run } from "@/lib/shell";

const dispatchSchema = z.object({ issue: z.number().int().positive() });

const PR_URL = /https:\/\/github\.com\/\S+\/pull\/(\d+)/g;

export async function POST(req: Request) {
  const body = dispatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "issue must be a positive integer" }, { status: 400 });
  }
  if (!acquireRunLock()) {
    return Response.json({ error: "a run is already in flight" }, { status: 409 });
  }

  try {
    await restoreRuntimeDirtiedFiles();
    const output = await run(runnerCmd(), [String(body.data.issue)]);

    const prUrl = [...output.matchAll(PR_URL)].at(-1);
    if (!prUrl) {
      return Response.json(
        { error: "runner finished but reported no PR URL" },
        { status: 500 },
      );
    }
    return Response.json({ prUrl: prUrl[0], prNumber: Number(prUrl[1]) });
  } catch (error) {
    return errorResponse(error);
  } finally {
    releaseRunLock();
  }
}
