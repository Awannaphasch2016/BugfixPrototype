import { mkdtemp, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

// Shared stub scaffolding for the route-handler tests: every external command
// (runner, git, gh) is replaced by a script that logs its argv and plays a
// canned part, so tests assert spawned-command arguments and mapped output.

let dir: string;
let logFile: string;

export const stubDir = () => dir;

export async function freshStubEnv() {
  dir = await mkdtemp(path.join(tmpdir(), "chat-test-"));
  logFile = path.join(dir, "commands.log");
  process.env.CHAT_REPO_ROOT = dir;
  process.env.CHAT_GIT_CMD = await writeStub("git");
  process.env.CHAT_GH_CMD = await writeStub("gh");
  process.env.CHAT_RUNNER_CMD = await writeStub("runner");
}

export async function writeStub(name: string, body = "") {
  const stubPath = path.join(dir, name);
  await writeFile(
    stubPath,
    `#!/usr/bin/env bash\necho "${name} $*" >> "${logFile}"\n${body}\n`,
    { mode: 0o755 },
  );
  return stubPath;
}

export async function spawnedCommands(): Promise<string[]> {
  const log = await readFile(logFile, "utf8").catch(() => "");
  return log.split("\n").filter(Boolean);
}

export function jsonPost(
  handler: (req: Request) => Promise<Response>,
  url: string,
  body: unknown,
) {
  return handler(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}
