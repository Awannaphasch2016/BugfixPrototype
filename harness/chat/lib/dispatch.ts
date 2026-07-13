import { ghCmd, runnerCmd } from "@/lib/config";
import {
  acquireRunLock,
  recordDispatch,
  releaseRunLock,
} from "@/lib/run-state";
import { restoreRuntimeDirtiedFiles } from "@/lib/restore";
import { run } from "@/lib/shell";

// The dispatch core, shared by the dispatch route (human-initiated, note
// optional) and the signal route's auto-dispatch (precedented signals, no
// note). One lock, one restore, one runner invocation, one recorded outcome —
// both callers get exactly the machinery the rehearsals certified.

export type DispatchResult =
  | { ok: true; prUrl: string; prNumber: number }
  | { ok: false; status: number; error: string };

const PR_URL = /https:\/\/github\.com\/\S+\/pull\/(\d+)/g;

export async function dispatchIssue(issue: number, note?: string): Promise<DispatchResult> {
  if (!acquireRunLock()) {
    return { ok: false, status: 409, error: "a run is already in flight" };
  }
  recordDispatch({ status: "running", issue });

  try {
    await restoreRuntimeDirtiedFiles();
    if (note) {
      // The judgment enters the record before the run starts; if the comment
      // fails to post, the dispatch aborts and the runner is never spawned.
      await run(ghCmd(), ["issue", "comment", String(issue), "--body", note]);
    }
    const output = await run(runnerCmd(), note ? [String(issue), note] : [String(issue)]);

    const prUrl = [...output.matchAll(PR_URL)].at(-1);
    if (!prUrl) {
      const error = "runner finished but reported no PR URL";
      recordDispatch({ status: "failed", issue, error });
      return { ok: false, status: 500, error };
    }
    recordDispatch({
      status: "done",
      issue,
      prUrl: prUrl[0],
      prNumber: Number(prUrl[1]),
    });
    return { ok: true, prUrl: prUrl[0], prNumber: Number(prUrl[1]) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordDispatch({ status: "failed", issue, error: message });
    return { ok: false, status: 500, error: message };
  } finally {
    releaseRunLock();
  }
}
