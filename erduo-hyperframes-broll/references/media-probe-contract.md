# Media probe contract

`scripts/probe-media.mjs` turns one local regular media file into normalized metadata and a decode-smoke result. It never infers media type, Alpha, duration, or decodability from a filename or extension.

## Commands

Run subprocesses without a shell and with bounded output/time:

```text
ffprobe -v error -print_format json -show_format -show_streams <absolute-input>
ffmpeg -v error -xerror -i <absolute-input> -map 0:v? -map 0:a? -t 1 -f null -
```

Use `ffprobe.exe`/`ffmpeg.exe` on Windows. The resolved absolute input exists only in the subprocess argument list; it never appears in JSON, safe errors, or logs. A path containing spaces stays one argument.

## Input gate

- `lstat` the resolved path and reject missing paths, symlinks, and non-regular files.
- Reject an empty file before probing.
- Distinguish executable missing, timeout, non-zero probe/decode, malformed JSON, and no audio/video stream.
- The one-second decode is a smoke check, not proof that every frame is intact. Full output decodeability remains a delivery QA responsibility.

## Normalization

Return exactly one JSON document shaped as:

```json
{
  "schema_version": 1,
  "kind": "video",
  "size_bytes": 12345,
  "duration_us": 1000000,
  "duration_ms": 1000,
  "format_names": ["mov", "mp4"],
  "video": { "count": 1, "primary": {} },
  "audio": { "count": 1, "primary": {} },
  "decode": { "ok": true, "smoke_ms": 1000 }
}
```

- `kind` is `video`, `audio`, or `audiovisual`; still images count as `video` streams but may have null duration.
- Parse decimal seconds to integer microseconds without binary floating-point drift; round only beyond six fractional digits, then derive milliseconds by nearest-integer rounding.
- Prefer `format.duration`; otherwise use the greatest valid stream duration. Null is allowed only when ffprobe provides no duration.
- Split comma-separated `format_name`, trim, deduplicate, and sort.
- Count all audio/video streams. Choose a disposition-default stream as primary, otherwise the first stream of that type.
- Video primary fields: `stream_index`, `codec`, coded `width/height`, `display_width/display_height`, `pixel_format`, normalized clockwise `rotation_degrees`, and exact `frame_rate` with integer `numerator`, `denominator`, and a rounded numeric `value`.
- Prefer a positive `avg_frame_rate`; fall back to positive `r_frame_rate`. Reject unsafe/malformed rational values for a present primary video stream rather than guessing.
- Rotation comes from numeric `side_data_list[].rotation`, then `tags.rotate`, defaulting to zero. Swap display dimensions for 90/270 degrees.
- Audio primary fields: `stream_index`, `codec`, integer `sample_rate`, integer `channels`, and nullable `channel_layout`.
- Do not copy arbitrary ffprobe tags, filenames, paths, titles, comments, handler names, or raw child output.

## Errors and CLI

```bash
node scripts/probe-media.mjs <local-media-file> [--pretty]
```

Success exits `0`. Input errors exit `2`; probe/decode capability failures exit `3`; invalid arguments exit `64`; unexpected failures exit `70`. Safe error JSON contains `ok:false`, stable `code`, stage (`input`, `probe`, `decode`, or `normalize`), and a fixed message. It contains no input path or raw stderr.

## Test minimum

Cover audiovisual/video-only/audio-only/still metadata, format/stream duration fallback, decimal rounding, 30000/1001 and fallback frame rates, rotation and display dimensions, default-stream selection, multiple streams, format normalization, Windows executable names, paths with spaces as one argument, missing/symlink/directory/empty input, missing executable, timeout, non-zero probe/decode, malformed JSON, no media streams, malformed/zero/unsafe frame rates, invalid dimensions/audio integers, safe errors, argument rules, and exit codes. Codex acceptance must additionally generate and probe a real video, real audio file, and deliberately damaged file with the installed ffmpeg/ffprobe.
