---
name: broll-preflight
description: Validate B-roll project inputs, host capabilities, SRT time truth, media bounds, and resumable state before directing. Use only as the preflight stage dispatched by erduo-hyperframes-broll or when repairing a failed B-roll input gate.
---

# B-roll preflight

1. Receive the parent's project packet and no new creative brief. Read the shared stage contract before acting.
2. Run doctor, configuration-safe status, SRT parsing, controlling-media probe, and writable-output checks. Reuse the existing state only when its manifest fingerprints match.
3. Treat SRT timestamps as the only B-roll time truth. For talking-head mode, reject SRT that exceeds controlling media; for faceless mode, use the final SRT end when no audio controls duration.
4. Write only the private run state and a path-free `preflight` receipt. It must declare mode, SRT hash, time source, and detected capabilities.
5. On failure, return the safe failure code and stop. Do not direct scenes or ask the one-time user-material question again when state records the answer.

Pass the validated receipt to `broll-director`; never announce delivery to the user.
