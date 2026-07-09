// Attempts are serialized against one checkout, like a deploy queue: dispatch
// and merge share this lock. In-memory by design — chat state is disposable
// and a restart recovers it. The flag lives on globalThis because the dev
// server can instantiate this module once per route bundle.
const state = globalThis as typeof globalThis & { __chatRunInFlight?: boolean };

export function acquireRunLock(): boolean {
  if (state.__chatRunInFlight) return false;
  state.__chatRunInFlight = true;
  return true;
}

export function releaseRunLock(): void {
  state.__chatRunInFlight = false;
}
