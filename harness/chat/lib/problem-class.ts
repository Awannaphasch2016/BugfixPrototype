// Problem-class vocabulary (CONTEXT.md, ADR-0002): a signal's signature maps
// deterministically to a problem-class label, the unit at which the pipeline
// accumulates trust. Pure string functions only.

/** The label a novel-class issue carries while it waits for a human dispatch. */
export const NEEDS_HUMAN_LABEL = "needs-human";

/**
 * Map a signature to its problem-class label: "class:" + kebab-slug, where
 * the slug is the signature's lowercase alphanumeric runs joined by "-".
 * Same signature, same class — the classification is the function.
 */
export function signatureToClass(signature: string): string {
  const runs = signature.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return "class:" + runs.join("-");
}

/**
 * The exact title of a signal's issue. Dedupe matches on this title, so it
 * must be a pure function of the signature and nothing else.
 */
export function SIGNAL_TITLE(signature: string): string {
  return "[signal] " + signature;
}
