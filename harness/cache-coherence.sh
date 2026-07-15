#!/usr/bin/env bash
# Coherence at capture (stage-4b spec): cached prose can never go stale.
#
#   harness/cache-coherence.sh <cache-entry-dir> <own-issue-number>
#
# Two passes over the entry's prose artifacts — plan.md, review.md,
# evidence/evidence.md, and result.json's .result (the PR body):
#   1. normalize: every reference to the entry's OWN issue number becomes the
#      {{issue}} placeholder (replay substitutes the fresh cycle's number back
#      in — the one rewrite a cached artifact ever gets);
#   2. lint: any remaining issue number, any commit sha, any date fails
#      loudly, naming the offending line. A dirty artifact is fixed at its
#      source and recaptured — never patched in the cache.
#
# Patches, transcripts, and meta.json are exempt: they are diff/trace exhaust
# and bookkeeping, never re-posted verbatim as fresh prose.
set -euo pipefail

ENTRY="${1:?usage: harness/cache-coherence.sh <cache-entry-dir> <own-issue-number>}"
ISSUE="${2:?usage: harness/cache-coherence.sh <cache-entry-dir> <own-issue-number>}"
[[ -d "$ENTRY" ]] || { echo "ERROR: no such cache entry: $ENTRY" >&2; exit 1; }

PROSE_MD=(plan.md review.md evidence/evidence.md)

# Own-issue references, in every shape the artifacts use them: "#N",
# "issue N", "Issue N", "issue-N" (evidence paths), and the URL form
# ".../issues/N". Nothing else is touched.
normalize() {
  sed -E "s/#$ISSUE\b/#{{issue}}/g; s/\b([Ii]ssue[ -])$ISSUE\b/\1{{issue}}/g; s#(/issues/)$ISSUE\b#\1{{issue}}#g"
}

FAILED=0
check() { # <artifact-label> <file> <perl-regex> <what>
  local hits
  hits=$(grep -nP "$3" "$2" || true)
  [[ -n "$hits" ]] || return 0
  FAILED=1
  while IFS= read -r hit; do
    echo "COHERENCE: $4 in $1 line ${hit%%:*}: ${hit#*:}" >&2
  done <<<"$hits"
}

# The issue-number pattern's lookahead spares hex colors ("#22c55e" is not an
# issue reference); an all-digit token like "#123" still fails strict — a
# recapture costs minutes, a stale number on stage costs the pitch. The URL
# alternates catch tracker references the prose forms miss.
lint() { # <artifact-label> <file>
  check "$1" "$2" '#[0-9]+(?![0-9a-fA-F])|\b[Ii]ssue[ -]#?[0-9]+|/(issues|pull)/[0-9]+' "issue number (foreign — the own number is already {{issue}})"
  check "$1" "$2" '\b[0-9a-f]{7,40}\b' "commit sha (or sha-shaped token)"
  check "$1" "$2" '\b[0-9]{4}-[0-9]{2}-[0-9]{2}\b|\b[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}\b' "date"
}

for REL in "${PROSE_MD[@]}"; do
  FILE="$ENTRY/$REL"
  [[ -f "$FILE" ]] || continue
  normalize < "$FILE" > "$FILE.tmp"
  mv "$FILE.tmp" "$FILE"
  lint "$REL" "$FILE"
done

if [[ -f "$ENTRY/result.json" ]]; then
  RESULT_TMP=$(mktemp)
  trap 'rm -f "$RESULT_TMP"' EXIT
  jq -r '.result' "$ENTRY/result.json" | normalize > "$RESULT_TMP"
  jq --rawfile r "$RESULT_TMP" '.result = ($r | rtrimstr("\n"))' \
    "$ENTRY/result.json" > "$ENTRY/result.json.tmp"
  mv "$ENTRY/result.json.tmp" "$ENTRY/result.json"
  lint "result.json:.result" "$RESULT_TMP"
fi

if (( FAILED )); then
  echo "ERROR: coherence lint failed for $ENTRY — recapture from a clean source; never hand-edit the cache" >&2
  exit 1
fi
echo "==> coherence: $ENTRY clean (own issue #$ISSUE → {{issue}})"
