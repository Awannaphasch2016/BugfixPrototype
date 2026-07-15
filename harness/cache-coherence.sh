#!/usr/bin/env bash
# Coherence at capture (stage-4b spec; replay variables per ADR-0005):
# cached prose can never go stale.
#
#   harness/cache-coherence.sh <cache-entry-dir> <own-issue-number> \
#     [--precedent <n>] [--precedent-shas <sha>[,<sha>...]] \
#     [--run-date <YYYY-MM-DD>] [--firing-reqid <id>]
#
# Two passes over the entry's prose artifacts — plan.md, review.md,
# evidence/evidence.md, and result.json's .result (the PR body):
#
#   1. normalize: every reference whose fresh value replay can resolve
#      deterministically becomes a replay variable —
#        own issue number            → {{issue}}
#        precedent issue number      → {{precedent}}
#        precedent fix's commit shas → {{precedent_sha}}
#        the certified run's date    → {{today}}
#        the firing's request id     → {{fresh_reqid}}
#      Judgment prose is never rewritten; only these coordinates are.
#   2. lint: any REMAINING issue number, commit sha, or date fails loudly,
#      naming the offending line — except dates that are frozen-world
#      literals (verbatim in the baseline tag's tracked content, or derived
#      from the committed log's epoch timestamps): those can never go stale
#      because the world they describe is itself frozen at the tag.
#
# A dirty artifact is fixed at its source and recaptured — never patched in
# the cache. Patches, transcripts, and meta.json are exempt: diff/trace
# exhaust and bookkeeping, never re-posted verbatim as fresh prose.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT" # git lookups against the demo-baseline tag resolve from here

USAGE="usage: harness/cache-coherence.sh <cache-entry-dir> <own-issue-number> [--precedent <n>] [--precedent-shas <s>[,<s>...]] [--run-date <YYYY-MM-DD>] [--firing-reqid <id>]"
ENTRY="${1:?$USAGE}"
ISSUE="${2:?$USAGE}"
shift 2
PRECEDENT=""
PRECEDENT_SHAS=""
RUN_DATE=""
FIRING_REQID=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --precedent) PRECEDENT="${2:?$USAGE}"; shift 2 ;;
    --precedent-shas) PRECEDENT_SHAS="${2:?$USAGE}"; shift 2 ;;
    --run-date) RUN_DATE="${2:?$USAGE}"; shift 2 ;;
    --firing-reqid) FIRING_REQID="${2:?$USAGE}"; shift 2 ;;
    *) echo "ERROR: unknown flag: $1" >&2; echo "$USAGE" >&2; exit 1 ;;
  esac
done
[[ -d "$ENTRY" ]] || { echo "ERROR: no such cache entry: $ENTRY" >&2; exit 1; }

PROSE_MD=(plan.md review.md evidence/evidence.md)
TAG="demo-baseline"

# Each reference shape the artifacts use: "#N", "issue N", "Issue N",
# "issue-N" (evidence paths), and the URL form ".../issues/N". Shas match on
# their first seven characters so any cited prefix length normalizes.
SED_PROG="s/#$ISSUE\b/#{{issue}}/g; s/\b([Ii]ssue[ -])$ISSUE\b/\1{{issue}}/g; s#(/issues/)$ISSUE\b#\1{{issue}}#g"
if [[ -n "$PRECEDENT" ]]; then
  SED_PROG+="; s/#$PRECEDENT\b/#{{precedent}}/g; s/\b([Ii]ssue[ -])$PRECEDENT\b/\1{{precedent}}/g; s#(/issues/)$PRECEDENT\b#\1{{precedent}}#g"
fi
if [[ -n "$PRECEDENT_SHAS" ]]; then
  IFS=',' read -ra SHAS <<<"$PRECEDENT_SHAS"
  for SHA in "${SHAS[@]}"; do
    [[ "$SHA" =~ ^[0-9a-f]{7,40}$ ]] ||
      { echo "ERROR: --precedent-shas entry is not sha-shaped: $SHA" >&2; exit 1; }
    SED_PROG+="; s/\b${SHA:0:7}[0-9a-f]*\b/{{precedent_sha}}/g"
  done
fi
if [[ -n "$RUN_DATE" ]]; then
  SED_PROG+="; s/\b$RUN_DATE\b/{{today}}/g"
fi
if [[ -n "$FIRING_REQID" ]]; then
  SED_PROG+="; s/\b$FIRING_REQID\b/{{fresh_reqid}}/g"
fi

normalize() { sed -E "$SED_PROG"; }

# Frozen-world dates: literal strings in the baseline tag's tracked content,
# plus dates derived from the committed log's epoch "time" fields (prose
# renders those epochs as calendar dates). Both are as frozen as the world.
FROZEN_DATES=$(
  { git show "$TAG:demo-app/logs/app.log" 2>/dev/null |
      grep -oP '"time":\K[0-9]{10,13}' |
      while read -r T; do date -u -d "@${T:0:10}" +%F 2>/dev/null; done; } | sort -u
)
frozen_date() { # <YYYY-MM-DD or slash date> — 0 when the date cannot go stale
  grep -qxF "$1" <<<"$FROZEN_DATES" && return 0
  # Only the agents' reachable world counts as frozen: the baseline demo-app
  # tree (seeded log payloads, the docs corpus) and the project skills the
  # Skill tool hands every agent session. Both are frozen at the tag, so a
  # date quoted from them can never go stale. The wider repo's spec/record
  # dates deliberately do NOT qualify.
  git grep -qF "$1" "$TAG" -- demo-app .claude/skills >/dev/null 2>&1
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

check_dates() { # <artifact-label> <file>
  local toks tok hits
  toks=$(grep -oP '\b[0-9]{4}-[0-9]{2}-[0-9]{2}\b|\b[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4}\b' "$2" | sort -u || true)
  [[ -n "$toks" ]] || return 0
  while IFS= read -r tok; do
    frozen_date "$tok" && continue
    FAILED=1
    hits=$(grep -nF "$tok" "$2" || true)
    while IFS= read -r hit; do
      echo "COHERENCE: date in $1 line ${hit%%:*}: ${hit#*:}" >&2
    done <<<"$hits"
  done <<<"$toks"
}

# The issue-number pattern's lookahead spares hex colors ("#22c55e" is not an
# issue reference); an all-digit token like "#123" still fails strict — a
# recapture costs minutes, a stale number on stage costs the pitch. The URL
# alternates catch tracker references the prose forms miss.
lint() { # <artifact-label> <file>
  check "$1" "$2" '#[0-9]+(?![0-9a-fA-F])|\b[Ii]ssue[ -]#?[0-9]+|/(issues|pull)/[0-9]+' "issue number (foreign — own and precedent numbers are already variables)"
  check "$1" "$2" '\b[0-9a-f]{7,40}\b' "commit sha (or sha-shaped token)"
  check_dates "$1" "$2"
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
SUMMARY="own issue #$ISSUE → {{issue}}"
[[ -z "$PRECEDENT" ]] || SUMMARY+=", precedent #$PRECEDENT → {{precedent}}"
[[ -z "$FIRING_REQID" ]] || SUMMARY+=", firing $FIRING_REQID → {{fresh_reqid}}"
echo "==> coherence: $ENTRY clean ($SUMMARY)"
