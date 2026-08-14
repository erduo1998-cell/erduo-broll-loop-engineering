---
name: broll-master-integrate
description: Read and verify legacy HyperFrames Integrator records or prepare a compact recovery report for a pre-v0.9 task. Do not use or dispatch this stage in a new v0.9 production; the Parent now assembles verified Builder clips directly.
---

# Legacy HyperFrames Integrator

Treat this stage as read-only compatibility for production records created
before v0.9. Do not dispatch it in a new production, do not reopen or modify the
old project, and do not run HyperFrames, integration, preview, or render
commands.

Read `../../references/runtime/runtime-contract.md`,
`../../references/runtime/capability-matrix.json`, and the legacy handoff only
when the user explicitly asks to inspect or recover an old task. Verify from the
existing evidence that:

- every expected HyperFrames block and shot was recorded once and in order;
- SRT timing, Recipe links, assets, fonts, check results, and
  `composition-identity.json` are internally consistent;
- no mixed-runtime source was presented as a HyperFrames master;
- any missing file, changed hash, unresolved check error, or stale approval is
  reported precisely.

Return a compact recovery report to the Parent with the last trustworthy
identity, available artifacts, concrete defect, and safest next owner. Do not
repair the old task, generate new integration artifacts, or convert it silently
into v0.9.

For every new v0.9 production, the Parent uses
`scripts/assemble-frozen-production.mjs preview` and `deliver` after Builders
return editable source plus verified frozen unit media.
