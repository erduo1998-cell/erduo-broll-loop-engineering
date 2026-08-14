---
name: broll-hybrid-render
description: Read and verify legacy hybrid Render and Delivery records or prepare a compact recovery report for a pre-v0.9 task. Do not use or dispatch this stage in a new v0.9 production; the Parent now runs deterministic preview and delivery scripts.
---

# Legacy Hybrid Render and Delivery

Treat this stage as read-only compatibility for production records created
before v0.9. Do not dispatch it in a new production, rerun FFmpeg, create a
preview, deliver a master, retry an attempt, or modify frozen media.

When the user explicitly asks to inspect or recover an old task, read the
existing runtime plan, frozen contracts, hybrid integration identity, approval,
attempt receipts, and final media verification. Verify from existing evidence
that:

- approval binds the same plan, ordered contracts, media hashes, profile, audio
  policy, and preview identity used for delivery;
- the delivered master has matching hash, duration, raster, FFprobe facts, and
  complete-decode evidence;
- no live HyperFrames or Remotion source was opened during the recorded hybrid
  delivery;
- stale approval, changed media, missing files, or failed attempts are reported
  precisely.

Return a compact recovery report to the Parent with the last trustworthy
identity, available artifacts, concrete defect, and safest next owner. Do not
resume delivery or silently migrate the old task.

For every new v0.9 production, the Parent runs
`scripts/assemble-frozen-production.mjs preview` and `deliver` over verified
Builder unit contracts.
