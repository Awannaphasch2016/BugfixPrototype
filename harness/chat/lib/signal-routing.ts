import { readFile } from "fs/promises";
import { ghCmd, gitCmd, redactCmd, signalLogFile } from "@/lib/config";
import {
  applyRedactions,
  canonicalizePaths,
  codePointSpansToUtf16,
  composeContextReport,
  parseLogLines,
  parseRedactionSpans,
  selectExcerpt,
} from "@/lib/context-report";
import { dispatchIssue } from "@/lib/dispatch";
import { NEEDS_HUMAN_LABEL, SIGNAL_TITLE, signatureToClass } from "@/lib/problem-class";
import { acquireRunLock, releaseRunLock, runInFlight } from "@/lib/run-state";
import { run, runWithInput } from "@/lib/shell";
import { AUTOFIXED_LABEL, hasPrecedent } from "@/lib/solved";

// The routing policy as code (ADR-0002): dedupe by signature, then a
// label-and-PR lookup. An open issue for the signature absorbs the repeat; a
// precedented problem class auto-dispatches; a novel class files with
// needs-human and waits for a human. The ledger is labels on the system of
// record — nothing else is consulted.

export type RoutingVerdict =
  | { routed: "absorbed"; issue: number }
  | { routed: "needs-human"; issue: number; class: string }
  | { routed: "autofix"; issue: number; class: string; note?: "queued-behind-lock" };

/** Composing the context report failed — the fail-safe: no issue is filed. */
export class ComposeFailure extends Error {}

const CLASS_LABEL_COLOR = "1d76db";
const CLASS_LABEL_DESCRIPTION = "problem class — precedent ledger";
const NEEDS_HUMAN_COLOR = "d93f0b";
const NEEDS_HUMAN_DESCRIPTION = "novel problem class — waiting for a human dispatch";

const ISSUE_URL = /\/issues\/(\d+)/;
const BODY_PREAMBLE =
  "Auto-filed by the signaling layer: the error signature below fired in the " +
  "monitored application log.";

/**
 * Pull the signature out of a webhook body: either the plain `{signature}`
 * shape (the harness script's entry) or a Grafana-alertmanager-shaped body
 * (`alerts[0].annotations.signature ?? alerts[0].labels.signature`). Returns
 * null when no non-empty signature string is present.
 */
export function extractSignature(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const direct = (body as Record<string, unknown>).signature;
  if (typeof direct === "string" && direct.trim() !== "") return direct;

  const alerts = (body as Record<string, unknown>).alerts;
  if (!Array.isArray(alerts) || alerts.length === 0) return null;
  const alert = alerts[0];
  if (typeof alert !== "object" || alert === null) return null;
  for (const key of ["annotations", "labels"] as const) {
    const group = (alert as Record<string, unknown>)[key];
    if (typeof group !== "object" || group === null) continue;
    const sig = (group as Record<string, unknown>).signature;
    if (typeof sig === "string" && sig.trim() !== "") return sig;
  }
  return null;
}

/**
 * Route one signal. Throws ComposeFailure when the context report cannot be
 * produced (the route answers 502 and nothing is filed). A precedented
 * signal's auto-dispatch runs fire-and-forget — the webhook answer never
 * waits on a minutes-long run.
 */
export async function routeSignal(signature: string): Promise<RoutingVerdict> {
  const title = SIGNAL_TITLE(signature);

  // a. Dedupe: an open issue for the same signature absorbs the repeat.
  const openOut = await run(ghCmd(), [
    "issue", "list", "--state", "open", "--json", "number,title",
  ]);
  const open = JSON.parse(openOut) as { number: number; title: string }[];
  const existing = open.find((issue) => issue.title === title);
  if (existing) return { routed: "absorbed", issue: existing.number };

  // b. Context report — before anything is filed, and fail-safe: any failure
  // here (log unreadable, signature absent, redaction command failing) means
  // no issue exists with unredacted content.
  const report = await composeReport(signature);

  // c. Precedent: the label-and-PR lookup on the system of record.
  const classLabel = signatureToClass(signature);
  const precedented = await hasPrecedent(classLabel);

  // d. File, labels first so the create cannot race a missing label.
  await ensureLabel(classLabel, CLASS_LABEL_COLOR, CLASS_LABEL_DESCRIPTION);
  if (!precedented) {
    await ensureLabel(NEEDS_HUMAN_LABEL, NEEDS_HUMAN_COLOR, NEEDS_HUMAN_DESCRIPTION);
  }
  const labels = precedented ? [classLabel] : [classLabel, NEEDS_HUMAN_LABEL];
  const createArgs = ["issue", "create", "--title", title, "--body", `${BODY_PREAMBLE}\n\n${report}`];
  for (const label of labels) createArgs.push("--label", label);
  const createOut = await run(ghCmd(), createArgs);
  const match = ISSUE_URL.exec(createOut);
  if (!match) throw new Error("issue create reported no issue URL");
  const issue = Number(match[1]);

  if (!precedented) return { routed: "needs-human", issue, class: classLabel };

  // e. Auto-dispatch. Run-lock respected: with a run already in flight the
  // dispatch is skipped and the issue is left filed — the simplest honest
  // behavior; a human dispatches it (or the next firing is absorbed by it).
  // The peek-then-fire has a benign race: if another run grabs the lock in
  // between, the fired dispatch returns 409 and the issue is likewise left
  // filed — the same outcome, just without the note.
  if (runInFlight()) {
    return { routed: "autofix", issue, class: classLabel, note: "queued-behind-lock" };
  }
  void autoDispatchAndMerge(issue);
  return { routed: "autofix", issue, class: classLabel };
}

async function composeReport(signature: string): Promise<string> {
  try {
    const logText = await readFile(signalLogFile(), "utf8");
    const excerpt = selectExcerpt(parseLogLines(logText), signature);
    if (!excerpt) {
      throw new Error(`signature "${signature}" not found in the monitored log`);
    }
    const canonical = canonicalizePaths(excerpt.text);
    const spans = parseRedactionSpans(await runWithInput(redactCmd(), [], canonical));
    const redacted = applyRedactions(canonical, codePointSpansToUtf16(canonical, spans));
    return composeContextReport({ signature, excerpt: redacted, matchCount: excerpt.matchCount });
  } catch (error) {
    throw new ComposeFailure(
      `context report failed, refusing to file — ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

// Idempotent create: "already exists" is success (labels are repo-level state
// that persists across cycles); any other failure still aborts the filing.
async function ensureLabel(name: string, color: string, description: string): Promise<void> {
  try {
    await run(ghCmd(), ["label", "create", name, "--color", color, "--description", description]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/already exists/i.test(message)) throw error;
  }
}

// The precedented lane end-to-end: the shared dispatch core, then the
// setup.sh auto-merge flow — merge, sync the checkout, mark the lane on the
// record. Failures leave the record exactly as far as it truly got (an open
// PR, an unlabeled issue); GitHub is the story, nothing here re-tells it.
async function autoDispatchAndMerge(issue: number): Promise<void> {
  const result = await dispatchIssue(issue);
  if (!result.ok) return; // lock lost or run failed — the issue stays filed

  if (!acquireRunLock()) return; // a human got in first; they own the merge
  try {
    await run(ghCmd(), ["pr", "merge", String(result.prNumber), "--merge", "--delete-branch"]);
    await run(gitCmd(), ["checkout", "main"]);
    await run(gitCmd(), ["pull", "--ff-only", "origin", "main"]);
    await run(ghCmd(), ["issue", "edit", String(issue), "--add-label", AUTOFIXED_LABEL]);
  } catch {
    // Fire-and-forget: there is no response left to answer. The PR and issue
    // show exactly how far the lane got.
  } finally {
    releaseRunLock();
  }
}
