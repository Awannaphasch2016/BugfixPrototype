import { execFile } from "child_process";
import path from "path";
import { repoRoot } from "@/lib/config";

// No timeout: a dispatch holds its command open for the runner's full wall
// clock (minutes), and the open connection is the notification channel.
export function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { cwd: repoRoot(), maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `${path.basename(cmd)} ${args.join(" ")} failed: ${stderr.trim() || error.message}`,
            ),
          );
        } else {
          resolve(stdout);
        }
      },
    );
  });
}
