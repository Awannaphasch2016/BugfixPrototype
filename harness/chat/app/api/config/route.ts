import { replayMode } from "@/lib/config";

// The mode exposure the replay banner renders from (stage-4b): one boolean,
// read from the same switch that flips every dispatch path — the banner can
// never disagree with what a dispatch would actually do.
export async function GET() {
  return Response.json({ replay: replayMode() });
}
