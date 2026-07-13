import path from "path";

// The process boundary is the config point: the backend shells out to the
// runner, git, and the GitHub CLI through these paths so tests can substitute
// stub scripts and never run a real agent or touch GitHub.

export function repoRoot(): string {
  return process.env.CHAT_REPO_ROOT ?? path.resolve(process.cwd(), "..", "..");
}

export function runnerCmd(): string {
  return process.env.CHAT_RUNNER_CMD ?? path.join(repoRoot(), "harness", "run.sh");
}

export function ghCmd(): string {
  return process.env.CHAT_GH_CMD ?? "gh";
}

export function gitCmd(): string {
  return process.env.CHAT_GIT_CMD ?? "git";
}

export function redactCmd(): string {
  return process.env.CHAT_REDACT_CMD ?? path.join(repoRoot(), "harness", "redact.py");
}

export function signalLogFile(): string {
  return (
    process.env.SIGNAL_LOG_FILE ?? path.join(repoRoot(), "demo-app", "logs", "app.log")
  );
}
