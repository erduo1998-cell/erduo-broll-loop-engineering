---
name: broll-remotion-integrate
description: Read and verify legacy Remotion Integrator records or prepare a compact recovery report for a pre-v0.9 task. Do not use or dispatch this stage in a new v0.9 production; the Parent now assembles verified Builder clips directly.
---

# Legacy Remotion Integrator

Treat this stage as read-only compatibility for production records created
before v0.9. Do not dispatch it in a new production, modify the old project,
install dependencies, launch Remotion, capture geometry, or generate a new
identity.

When the user explicitly asks to inspect or recover an old task, read the
existing runtime plan, Remotion project manifest, Builder receipts, integration
handoff, motion/layout result, and `composition-identity.json`. Consult
`../../references/remotion-backend.md`,
`../../references/runtime/runtime-contract.md`, and
`../../references/runtime/capability-matrix.json` only to interpret those
records.

Verify from existing evidence that:

- the recorded project is single-backend Remotion with one exact dependency
  identity;
- every expected shot, Recipe, asset, font, frame window, and source hash is
  represented once;
- verifier, typecheck, geometry, lint, and identity records agree;
- no frozen-media or HyperFrames source was passed off as native Remotion
  integration.

Return a compact recovery report to the Parent with the last trustworthy
identity, available artifacts, concrete defect, and safest next owner. Do not
repair, render, or silently migrate the old task.

For every new v0.9 production, Builders return editable source plus verified
frozen unit media and the Parent runs the deterministic preview/delivery
assembler directly.
