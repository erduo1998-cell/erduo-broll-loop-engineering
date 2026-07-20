# SRT parsing contract

`scripts/parse-srt.mjs` is the deterministic time-source boundary. It parses subtitle cues; it does not merge scenes, fill gaps, clamp to media, quantize to frames, or repair malformed input.

## Accepted input

- UTF-8 bytes, optionally beginning with one UTF-8 BOM.
- LF, CRLF, or CR line endings. Output normalizes them to LF.
- Blocks separated by one or more blank lines.
- Either every block begins with a positive numeric cue ID, or no block uses IDs. IDs must be strictly increasing and unique; gaps are allowed.
- Timestamp lines use `HH:MM:SS,mmm --> HH:MM:SS,mmm` or the dot-millisecond equivalent. Hours have at least two digits; minute and second fields are `00..59`; milliseconds contain exactly three digits.
- One or more non-empty text lines per cue. Multi-line text is preserved with normalized LF.

Reject mixed ID/no-ID blocks, malformed timestamps, trailing cue settings or garbage, empty cue text, unsafe integer times/IDs, `end <= start`, start-time regression, overlap, invalid UTF-8, NUL, and an empty file. A cue may begin exactly when the previous cue ends. Gaps are retained.

## Output model

All times are integer milliseconds:

```json
{
  "schema_version": 1,
  "cue_count": 1,
  "content_sha256": "...",
  "timeline": {
    "start_ms": 0,
    "end_ms": 1200,
    "duration_ms": 1200,
    "cue_duration_ms": 1200
  },
  "cues": [
    {
      "ordinal": 1,
      "id": 1,
      "start_ms": 0,
      "end_ms": 1200,
      "duration_ms": 1200,
      "text": "Hello",
      "lines": ["Hello"]
    }
  ]
}
```

`content_sha256` hashes the BOM-free, LF-normalized content, so equivalent Windows/macOS line endings serialize identically. It does not include a file path. `timeline.duration_ms` spans first cue start through last cue end; `cue_duration_ms` is the sum of cue windows and therefore exposes retained gaps.

## Errors and CLI

Parser errors expose only `code`, a safe message, and when known the one-based `cue` ordinal and `line`. They never include subtitle text or the absolute input path.

```bash
node scripts/parse-srt.mjs <file.srt> [--pretty]
node scripts/parse-srt.mjs - [--pretty]
```

`-` reads bounded stdin. Success writes one JSON document and exits `0`; parse/encoding failure exits `2`; safe read failure exits `3`; invalid arguments exit `64`; unexpected failure exits `70`.

## Test minimum

Cover BOM, LF/CRLF/CR equivalence, comma/dot milliseconds, multi-line Unicode, with/without IDs, ID gaps, exact adjacent boundaries, retained gaps, content hash stability, zero start, multi-digit hours, and rejection of empty input/text, mixed/duplicate/regressing IDs, malformed arrows/fields/precision, trailing settings, `end <= start`, overlap/regression, NUL, invalid UTF-8, unsafe integers, read errors, oversized stdin, safe errors, argument rules, and exit codes.
