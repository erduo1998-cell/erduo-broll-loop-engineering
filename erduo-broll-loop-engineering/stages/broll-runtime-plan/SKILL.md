---
name: broll-runtime-plan
description: Deterministically assign validated runtime-neutral Shot Recipes to HyperFrames or Remotion after Direction, then merge adjacent same-backend shots into contiguous build blocks.
---

# B-roll Runtime Planner

Act only as the post-Director runtime planner. Do not change Shot Recipes,
reinterpret the SRT, collect assets, install a backend, author source, render,
or integrate media.

## Inputs

- validated `runtime-selection.json`;
- Director `shot-recipes/` and handoff;
- `../../references/runtime/capability-matrix.json`;
- the pinned Shotcraft Remotion source index;
- production root and one unused planner output directory.

The initial selector records intent. `auto` and explicit `hybrid` do not prove
backend readiness. Existing-project or explicit `hyperframes`/`remotion`
selection remains a forced single-backend route unless a native capability
conflict stops planning.

## Deterministic planning

Run the parent Skill's bundled command through the safe child environment:

```text
node scripts/plan-runtime.mjs \
  --recipes <director-shot-recipes> \
  --selection <runtime-selection.json> \
  --json
```

Preserve stdout exactly as `broll-production/01-runtime-plan/runtime-plan.json`
and run `scripts/validate-runtime-plan.mjs` against it. Do not edit generated
JSON by hand.

The planner uses only declared capability IDs, capability-matrix planning
evidence, exact selected `patternRef`, and the pinned backend source index. It
never reads semantics as keywords and never infers complexity from prose. A
Remotion reference source is preference evidence, not a render witness; the
plan must expose it under `unverifiedPreferences`. Operator-confirmed
production experience is a preference, not a parity claim.

Runtime is decided per shot. Adjacent shots assigned to the same runtime are
then merged into one contiguous block. Do not create an extra runtime switch
for style variety. Explicit `hybrid` must still have evidence-backed work for
both backends; if planning collapses to one backend, stop instead of forcing an
artificial split. `auto` may legitimately resolve to one backend or hybrid.

## Deliverables

Write only:

- `broll-production/01-runtime-plan/runtime-plan.json`;
- `broll-production/01-runtime-plan/handoff.md`.

The handoff reports selection identity, resulting route, block boundaries,
required backend readiness targets, warnings, unverified preferences, planner
identity, and validator result.

## Completion and stop

Complete only when every Director shot appears once, coverage is continuous
from zero, blocks are contiguous, plan identity validates, and the required
backend set is exact.

Stop as `action-required` for conflicting equal-priority evidence, incompatible
native requirements, explicit-single conflicts, explicit-hybrid collapse,
unknown capability or pattern evidence, recipe drift, gaps, or overlaps. Return
the issue to Director or runtime selection; never resolve it with subjective
keywords.
