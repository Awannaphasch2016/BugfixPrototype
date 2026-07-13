import { writeFile } from "fs/promises";
import path from "path";
import { gitCmd, repoRoot } from "@/lib/config";
import { run } from "@/lib/shell";

// Exactly the two demo-app files that running the app dirties. A restore, not
// a clear: the committed baseline log carries diagnostic content the fixer
// agent depends on. Any other dirt still aborts the run, by design.
export const RUNTIME_DIRTIED_FILES = [
  "demo-app/data/tasks.json",
  "demo-app/logs/app.log",
] as const;

// IN PLACE (truncate + rewrite), never `git checkout`: the dev server's
// logger holds an fd to the log's inode, and a checkout swaps the inode —
// every later log line would land in an orphaned file and the signaling
// layer would tail a dead path (found live, Stage 4 rehearsal, 2026-07-13).
export async function restoreRuntimeDirtiedFiles(): Promise<void> {
  for (const file of RUNTIME_DIRTIED_FILES) {
    const committed = await run(gitCmd(), ["show", `HEAD:${file}`]);
    await writeFile(path.join(repoRoot(), file), committed);
  }
}
