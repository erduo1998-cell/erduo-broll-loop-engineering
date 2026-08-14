---
name: broll-remotion-render
description: Read and verify legacy Remotion Render and Delivery records or prepare a compact recovery report for a pre-v0.9 task. Do not use or dispatch this stage in a new v0.9 production; the Parent now runs deterministic preview and delivery scripts.
---

# Legacy Remotion Render and Delivery

Treat this stage as read-only compatibility for production records created
before v0.9. Do not dispatch it in a new production, install or launch Remotion,
open Studio, render a Composition, retry an attempt, or write delivery
artifacts.

When the user explicitly asks to inspect or recover an old task, consult
`../../references/remotion-backend.md`,
`../../references/runtime/runtime-contract.md`, the existing master manifest,
identity, approval, render receipt, and media verification. Verify from existing
evidence that:

- project source, exact dependency lock, Composition ID, prior lint, and
  approval share one unchanged identity;
- the delivered file matches the recorded hash, frame-derived duration, raster,
  audio policy, FFprobe facts, and complete-decode evidence;
- global, ranged, or downloaded-on-demand Remotion was not treated as valid
  production evidence;
- failed or partial attempts were not presented as a master.

Return a compact recovery report to the Parent with the last trustworthy
identity, available artifacts, concrete defect, and safest next owner. Do not
resume rendering or silently migrate the old task.

For every new v0.9 production, the Remotion Builder returns editable source plus
verified frozen unit media and the Parent runs the common preview/delivery
assembler.
