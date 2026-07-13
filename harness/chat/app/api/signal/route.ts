import { errorResponse } from "@/lib/http";
import { ComposeFailure, extractSignature, routeSignal } from "@/lib/signal-routing";

// The signaling layer's entry: the Grafana alert webhook POSTs here, and
// harness/route-signal.sh invokes the same route by script (the rehearsed
// fallback and the test entry). Body: {signature} or a Grafana-alertmanager-
// shaped payload carrying the signature in annotations or labels.
export async function POST(req: Request) {
  const body: unknown = await req.json().catch(() => null);
  const signature = extractSignature(body);
  if (!signature) {
    return Response.json(
      { error: "no signature string in body: expected {signature} or alerts[0].annotations.signature" },
      { status: 400 },
    );
  }

  try {
    return Response.json(await routeSignal(signature));
  } catch (error) {
    // Fail safe: a context report that cannot be composed (above all a
    // failing redaction) files nothing and says so.
    return errorResponse(error, error instanceof ComposeFailure ? 502 : 500);
  }
}
