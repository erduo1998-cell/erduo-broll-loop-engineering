---
name: broll-shot-export
description: Export requested per-shot files from an already verified SRT-anchored B-roll master. Use only after the user explicitly asks for shot files.
---

# B-roll Shot Export

Act only as the optional Shot Export owner. Do not run unless the user has
explicitly requested individual shot files. Do not redesign, rebuild, or
rerender any shot.

## Inputs

- exact verified final master
- Render/Delivery technical verification and handoff
- Director shot plan with integer-millisecond windows
- explicit user request and desired subset
- destination directory and required output mode

## Export

Run every command through `../../references/safe-execution.md` and consume only
the compact executor result.

Confirm the final master is the one described by the delivery handoff. Cut the
requested shot windows directly from that master. Preserve the requested
integer-millisecond boundaries and choose the output format required for its
actual editing use.

Do not invoke HyperFrames render, rebuild source, alter timing, or create shots
that are not present in the verified master.

Use FFprobe and a complete decode to verify every exported file. Record its
source master, shot ID, time window, duration, media properties, and output
path.

## Deliverables

Write only under:

`broll-production/06-shot-export/`

Deliver:

- requested shot files;
- `export-index.md`;
- `handoff.md`.

## Completion

Complete when every requested export derives from the verified master, matches
its planned window, exists, is non-empty, and passes FFprobe and complete
decode.

## Stop

Stop when there is no explicit request, the master identity is uncertain, a
window is absent or outside the master, the destination is unsafe, or an export
cannot be decoded. Do not rerender to work around an export problem.
