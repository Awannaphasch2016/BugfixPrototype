import { gitCmd } from "@/lib/config";
import { run } from "@/lib/shell";

// Exactly the two demo-app files that running the app dirties. A restore, not
// a clear: the committed baseline log carries diagnostic content the fixer
// agent depends on. Any other dirt still aborts the run, by design.
export const RUNTIME_DIRTIED_FILES = [
  "demo-app/data/tasks.json",
  "demo-app/logs/app.log",
] as const;

export async function restoreRuntimeDirtiedFiles(): Promise<void> {
  await run(gitCmd(), ["checkout", "HEAD", "--", ...RUNTIME_DIRTIED_FILES]);
}
