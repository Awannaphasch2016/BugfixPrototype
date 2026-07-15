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

// The one mode switch (stage-4b spec, ADR-0004): DEMO_REPLAY flips every
// dispatch path — chat dispatch, the signal route's auto-dispatch, setup's
// pre-run — to replay, and the UI banner renders from the same answer. Off by
// default: a normal dispatch can never silently replay. No per-path toggles
// exist, so a mixed-mode demo is unrepresentable.
export function replayMode(): boolean {
  const value = process.env.DEMO_REPLAY;
  return !!value && value !== "0" && value !== "false";
}

export function signalLogFile(): string {
  return (
    process.env.SIGNAL_LOG_FILE ?? path.join(repoRoot(), "demo-app", "logs", "app.log")
  );
}
