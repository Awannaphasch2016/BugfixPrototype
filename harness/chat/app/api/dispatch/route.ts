import { z } from "zod";
import { dispatchIssue } from "@/lib/dispatch";

const dispatchSchema = z.object({
  issue: z.number().int().positive(),
  note: z.string().optional(),
});

export async function POST(req: Request) {
  const body = dispatchSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "issue must be a positive integer" }, { status: 400 });
  }
  // Empty-only normalization: trim, and an empty field leaves no trace — no
  // comment, no runner argument. Anything else is the note, verbatim.
  const note = body.data.note?.trim() || undefined;

  const result = await dispatchIssue(body.data.issue, note);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json({ prUrl: result.prUrl, prNumber: result.prNumber });
}
