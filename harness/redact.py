#!/usr/bin/env python3
"""Redaction command boundary: text in, PII spans out.

Reads UTF-8 text on stdin, writes a JSON array of spans on stdout:

    [{"start": N, "end": N, "entity": "PERSON"}, ...]

Offsets are Unicode code point offsets into the input text (Python string
semantics); the caller converts to its own indexing if needed.

Exits nonzero on ANY failure (missing package, missing spaCy model, analyzer
error) — callers must treat a nonzero exit as "no redaction happened" and
refuse to publish the text. Models are installed by harness/install.sh at
setup time, never on demo day.
"""

import json
import re
import sys

# Personal-data entities only. Log excerpts are technical text; Presidio's
# full recognizer set false-positives all over it (epoch timestamps read as
# bank account numbers, stack-trace identifiers as URLs and driver licenses),
# which shreds the excerpt's diagnostic value. This list is what "personal
# data" means at this boundary; widen it deliberately, not by default.
ENTITIES = [
    "PERSON",
    "EMAIL_ADDRESS",
    "PHONE_NUMBER",
    "CREDIT_CARD",
    "IBAN_CODE",
    "US_SSN",
    "IP_ADDRESS",
]


def main() -> int:
    try:
        from presidio_analyzer import AnalyzerEngine

        text = sys.stdin.read()
        analyzer = AnalyzerEngine()  # default NLP engine: spaCy en_core_web_lg
        results = analyzer.analyze(text=text, language="en", entities=ENTITIES)
        # The NER-based PERSON recognizer misfires on code identifiers inside
        # stack traces. A span containing a character that can never occur in
        # a human name (digit, underscore, slash, brace, quote, newline) is
        # code, not a name — dropping it cannot under-redact.
        never_in_a_name = re.compile(r'[0-9_/\\{}\[\]<>()"\n]')
        spans = [
            {"start": r.start, "end": r.end, "entity": r.entity_type}
            for r in sorted(results, key=lambda r: (r.start, r.end))
            if not (
                r.entity_type == "PERSON"
                and never_in_a_name.search(text[r.start : r.end])
            )
        ]
        json.dump(spans, sys.stdout)
        sys.stdout.write("\n")
        return 0
    except Exception as exc:  # noqa: BLE001 — any failure must exit nonzero
        print(f"redact.py: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
