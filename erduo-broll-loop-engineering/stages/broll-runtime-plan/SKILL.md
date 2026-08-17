---
name: broll-runtime-plan
description: Read and verify legacy Runtime Planner handoffs from production records created before v0.9. Do not use or dispatch this stage in the normal v1 workflow; the Parent runs deterministic planning and assignment gates directly.
---

# Legacy B-roll Runtime Planner

Treat this stage as read-only compatibility for old production records. Do not
dispatch it in a normal v1 production, do not create a new plan here, and do
not reinterpret or edit an existing plan.

In v1 the Parent runs `scripts/plan-runtime.mjs` directly with the Director's
validated Recipes, runtime selection, narrative envelope, visual system, and
new production root. The script validates those inputs, writes the immutable
runtime plan, and writes one minimal assignment packet per authoring unit.

When reading a legacy handoff, verify only that:

- its plan JSON passes `scripts/validate-runtime-plan.mjs` using
  `../../references/runtime/capability-matrix.json`;
- every Director shot appears exactly once in a backend block and authoring
  unit;
- time coverage is continuous and unit boundaries contain whole shots;
- evidence and warnings are preserved without subjective reinterpretation.

Return a compact recovery report to the Parent with the last trustworthy plan
identity, available artifacts, concrete mismatch, and safest next owner. Do not
repair the record, convert it into a v1 plan, or continue an old Planner →
Integrator → Render chain as though it were the current workflow.
