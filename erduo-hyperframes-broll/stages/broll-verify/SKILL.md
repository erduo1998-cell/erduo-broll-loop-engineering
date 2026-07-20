---
name: broll-verify
description: Verify B-roll delivery structure, timeline coverage, rendered media, and visible frames after rendering. Use only after a valid broll-render receipt or to resume a failed final verification stage.
---

# B-roll verify

1. Reject missing or invalid `render` receipts. Validate coverage, shared timing, media decodeability, duration, dimensions, audio policy, Alpha or black-light semantics, and visible boundary/midpoint frames.
2. Confirm one master and one stable per-shot file for every planned shot. Do not infer success from a filename, a lint exit code, or a container extension.
3. Write a path-free `verify` receipt only after every applicable gate passes. On failure, record the safe failing gate and allow resume from verification without rerendering valid media.
4. Return the final receipt to the parent. Only the parent may produce the user report: master path, shots directory, duration, shot count, asset routes, verified gates, and real limitations.
