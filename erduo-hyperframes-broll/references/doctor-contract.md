# Doctor contract

`scripts/doctor.mjs` performs a read-only preflight plus one reversible write probe. It does not install tools, download a browser, modify user configuration, or print environment values.

Node.js, FFmpeg/FFprobe, HyperFrames and its browser are machine-level
dependencies. Portable project snapshots deliberately do not bundle them; run
doctor again after every migration and provision missing capabilities on the
destination machine.

## Command surface

```bash
node scripts/doctor.mjs [--json] [--workdir <path>]
```

- The default work directory is the current directory.
- `--json` writes exactly one JSON document to stdout. Diagnostics belong on stderr only when JSON cannot be produced.
- `--help` exits `0`; invalid arguments exit `64`; an unexpected internal failure exits `70`.
- A usable environment (`ready` or `degraded`) exits `0`. A missing required capability (`blocked`) exits `2`.

Tests may import exported functions and inject process, filesystem, and command-runner adapters. There is no public environment variable or CLI flag that fakes probe results.

## Required checks

Use stable IDs and preserve this order:

1. `node`: current runtime is Node.js 22 or newer.
2. `ffmpeg`: `ffmpeg -version` resolves and exits successfully.
3. `ffprobe`: `ffprobe -version` resolves and exits successfully.
4. `hyperframes`: `npx --no-install hyperframes doctor --json` resolves, returns parseable JSON, and its required render checks pass.
5. `workdir`: the target exists as a directory and accepts creation and removal of a uniquely named probe file.

For the upstream HyperFrames payload, require successful checks named `Version`, `Node.js`, `FFmpeg`, `FFprobe`, and `Chrome`. Do not gate on its top-level `ok`, because optional Docker, BGM, TTS, or transcription checks may make that value false. Preserve optional upstream failures only as sanitized warning IDs.

Invoke `npx.cmd` on Windows and `npx` elsewhere. Never enable a shell for subprocesses. A missing executable, timeout, non-zero exit, malformed version, malformed JSON, or missing required upstream check is a failed required check.

## Result model

The JSON document has this stable top level:

```json
{
  "schema_version": 1,
  "status": "ready",
  "ok": true,
  "platform": "darwin",
  "arch": "arm64",
  "checks": [],
  "warnings": []
}
```

- `status`: `ready` when every required check passes and there are no optional warnings; `degraded` when required checks pass but optional upstream checks warn/fail; `blocked` when any required check fails.
- `ok`: true for `ready` and `degraded`, false only for `blocked`.
- Every check contains `id`, `required`, `status` (`pass` or `fail`), and a short `message`. It may include a normalized `version`, but never an executable path or raw child-process output.
- `warnings` contains stable lowercase IDs such as `hyperframes_optional_docker`; it never includes raw upstream details.
- Human output is a compact status line followed by one line per failed required check and optional warning.

## Privacy and safety

- Replace the user home prefix with `$HOME`, the selected work directory with `$WORKDIR`, and any detected credential value with `[REDACTED]` before a message can leave the process.
- Treat environment names containing `KEY`, `TOKEN`, `SECRET`, `COOKIE`, `PASSWORD`, or `AUTH` as credentials. Never print their values or forward the full environment into diagnostic output.
- Keep child output bounded and use a finite timeout.
- The work probe creates a unique file inside the exact resolved target directory, closes it, and removes only that file in `finally`. It must not overwrite an existing path.
- Do not run `hyperframes browser ensure`, install packages, or use the network as a fallback. A locally unavailable HyperFrames CLI is a blocker with an actionable message.

## Test minimum

Cover ready, optional-warning/degraded, old Node, missing ffmpeg, failed ffprobe, missing HyperFrames, non-zero HyperFrames, malformed HyperFrames JSON, missing required upstream checks, nonexistent work directory, non-directory target, failed write, failed cleanup, paths containing spaces, Windows `npx.cmd`, secret/path redaction, CLI argument errors, and stable exit codes.
