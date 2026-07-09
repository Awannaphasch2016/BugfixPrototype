import { z } from "zod";
import { ghCmd, gitCmd } from "@/lib/config";
import { errorResponse } from "@/lib/http";
import { acquireRunLock, releaseRunLock } from "@/lib/run-state";
import { restoreRuntimeDirtiedFiles } from "@/lib/restore";
import { run } from "@/lib/shell";

const mergeSchema = z.object({ pr: z.number().int().positive() });

// Fixed script, no agent: merge the real PR, return to main, fast-forward
// pull. Next.js hot reload then makes the fix live in the demo app.
export async function POST(req: Request) {
  const body = mergeSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "pr must be a positive integer" }, { status: 400 });
  }
  if (!acquireRunLock()) {
    return Response.json({ error: "a run is already in flight" }, { status: 409 });
  }

  try {
    await restoreRuntimeDirtiedFiles();
    await run(ghCmd(), ["pr", "merge", String(body.data.pr), "--merge", "--delete-branch"]);
    await run(gitCmd(), ["checkout", "main"]);
    await run(gitCmd(), ["pull", "--ff-only", "origin", "main"]);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  } finally {
    releaseRunLock();
  }
}
