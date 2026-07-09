// Attempts are serialized against one checkout, like a deploy queue: dispatch
// and merge share the lock. In-memory by design — chat state is disposable
// and a restart recovers it. Everything lives on globalThis because the dev
// server can instantiate this module once per route bundle.

export type DispatchOutcome =
  | { status: "idle" }
  | { status: "running"; issue: number }
  | { status: "done"; issue: number; prUrl: string; prNumber: number }
  | { status: "failed"; issue: number; error: string };

const state = globalThis as typeof globalThis & {
  __chatRunInFlight?: boolean;
  __chatLastDispatch?: DispatchOutcome;
};

export function acquireRunLock(): boolean {
  if (state.__chatRunInFlight) return false;
  state.__chatRunInFlight = true;
  return true;
}

export function releaseRunLock(): void {
  state.__chatRunInFlight = false;
}

// The last dispatch's outcome outlives its HTTP request on purpose: if a
// proxy between the browser and this backend kills the blocking request,
// the run keeps going here, and the client recovers the result from this.
export function recordDispatch(outcome: DispatchOutcome): void {
  state.__chatLastDispatch = outcome;
}

export function lastDispatch(): DispatchOutcome {
  return state.__chatLastDispatch ?? { status: "idle" };
}
