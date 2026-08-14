---
name: broll-hybrid-integrate
description: Read and verify legacy hybrid Integrator records or prepare a compact recovery report for a pre-v0.9 task. Do not use or dispatch this stage in a new v0.9 production; the Parent now validates and assembles frozen Builder clips directly.
---

# Legacy Hybrid Integrator

Treat this stage as read-only compatibility for production records created
before v0.9. Do not dispatch it in a new production, modify Builder output,
rerun FFmpeg, create a preview, or write a new hybrid identity.

When the user explicitly asks to inspect or recover an old task, read the
existing runtime plan, `../../references/runtime/frozen-block.schema.json`,
frozen media contracts, integration handoff, preview facts, and hybrid identity.
Verify from existing evidence that:

- every planned block appears once with matching runtime, shots, window, hash,
  profile, audio policy, and `noRealtimeNesting`;
- the recorded assembly followed runtime-plan order;
- preview and identity records agree without live runtime nesting;
- missing media, hash drift, profile mismatch, or stale approval is reported
  precisely.

Return a compact recovery report to the Parent with the last trustworthy
identity, available artifacts, concrete defect, and safest next owner. Do not
repair, reassemble, or silently migrate the old task.

For every new v0.9 production, the Parent runs
`scripts/assemble-frozen-production.mjs preview` and `deliver`; the script
matches contracts to units and assembles them in plan order.
