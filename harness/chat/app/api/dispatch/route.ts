import { z } from "zod";
import { runnerCmd } from "@/lib/config";
import { errorResponse } from "@/lib/http";
import {
  acquireRunLock,
  recordDispatch,
  releaseRunLock,
} from "@/lib/run-state";
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
  const issue = body.data.issue;
  recordDispatch({ status: "running", issue });

  try {
    await restoreRuntimeDirtiedFiles();
    const output = await run(runnerCmd(), [String(issue)]);

    const prUrl = [...output.matchAll(PR_URL)].at(-1);
    if (!prUrl) {
      const error = "runner finished but reported no PR URL";
      recordDispatch({ status: "failed", issue, error });
      return Response.json({ error }, { status: 500 });
    }
    recordDispatch({
      status: "done",
      issue,
      prUrl: prUrl[0],
      prNumber: Number(prUrl[1]),
    });
    return Response.json({ prUrl: prUrl[0], prNumber: Number(prUrl[1]) });
  } catch (error) {
    recordDispatch({
      status: "failed",
      issue,
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(error);
  } finally {
    releaseRunLock();
  }
}
