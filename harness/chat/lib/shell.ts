import { execFile } from "child_process";
import path from "path";
import { repoRoot } from "@/lib/config";

// No timeout: a dispatch holds its command open for the runner's full wall
// clock (minutes), and the open connection is the notification channel.
export function run(cmd: string, args: string[]): Promise<string> {
  return runWithInput(cmd, args, null);
}

/**
 * Like run(), but writes `input` on the child's stdin first (the redaction
 * command's contract: text on stdin, spans JSON on stdout). `null` leaves
 * stdin untouched.
 */
export function runWithInput(
  cmd: string,
  args: string[],
  input: string | null,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
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
    if (input !== null && child.stdin) {
      // A command that dies before draining stdin raises EPIPE here; the
      // execFile callback already turns that death into a rejection.
      child.stdin.on("error", () => {});
      child.stdin.write(input, "utf8");
      child.stdin.end();
    }
  });
}
