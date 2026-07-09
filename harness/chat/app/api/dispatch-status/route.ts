import { lastDispatch } from "@/lib/run-state";

export const dynamic = "force-dynamic";

// Recovery channel for the blocking dispatch: reports the current/last run's
// outcome so a client whose request was killed mid-run (proxied access, e.g.
// Codespaces port forwarding caps requests at ~100s) can still get its PR.
export async function GET() {
  return Response.json(lastDispatch());
}
