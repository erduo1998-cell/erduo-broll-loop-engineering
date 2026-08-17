---
name: broll-render
description: Read and verify legacy HyperFrames Render records for a pre-v0.9 task. Never dispatch this stage in a new v1 production; the Parent runs deterministic preview and delivery scripts.
---

# Legacy HyperFrames Render and Delivery

Treat this stage as read-only compatibility for production records created
before v0.9. Do not dispatch it in a new production, load or run HyperFrames,
open a preview, render a master, retry a failed attempt, or write delivery
artifacts.

Read `../../references/runtime/runtime-contract.md` and
`../../references/runtime/capability-matrix.json` only when the user
explicitly asks to inspect or recover an old task. Verify from existing
evidence that:

- the integrated project, check result, approval, and
  `composition-identity.json` refer to the same HyperFrames source closure;
- the recorded master has matching hash, SRT duration, raster, frame rate,
  audio policy, FFprobe facts, and complete-decode evidence;
- failed or partial attempts were not presented as a delivered master;
- any source drift, stale approval, missing file, or technical failure is
  reported precisely.

Return a compact recovery report to the Parent with the last trustworthy
identity, available artifacts, concrete defect, and safest next owner. Do not
resume rendering or silently migrate the old task.

For every new v1 production, the Parent runs
`scripts/assemble-frozen-production.mjs preview`, waits for the user's one
approval, and then runs `deliver` to an unused master path.
