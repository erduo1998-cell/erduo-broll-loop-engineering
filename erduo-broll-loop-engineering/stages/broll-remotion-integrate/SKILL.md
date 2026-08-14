---
name: broll-remotion-integrate
description: Integrate all verified Remotion block projects into one deterministic SRT-anchored master Composition, render technical preview evidence, and freeze the approval identity. Use after every Remotion Builder block is complete.
---

# B-roll Remotion Master Integrator

Act only as the Integrator for the selected Remotion production route. Do not
redesign shots, collect media, repair block-owned creative defects, render the
formal master, or mix HyperFrames source into the project.

## Backend contract

Read `../../references/remotion-backend.md`,
`../../references/motion-layout-lint.md`, the runtime contract, capability
matrix, and Remotion project schema. Require matching router, Onboarding, and
user licensing evidence plus a validated runtime plan whose resulting route is
single-backend `remotion`. Every
Builder handoff and manifest must name that same route, adapter version,
runtime baseline, frame rate, dimensions, and audio policy.

Run every command through `../../references/safe-execution.md` and consume only
the compact executor result.

## Inputs

- Director film/shot plan and every validated canonical Shot Recipe;
- frozen material and font plans with provenance;
- every expected Remotion authoring-unit project, manifest, compact receipt,
  QA evidence, and handoff, grouped by planned backend block;
- output profile, audio policy, runtime decision, Onboarding evidence, and
  Remotion licensing confirmation.

Reject hybrid plans and frozen-media block handoffs; those belong to
`broll-hybrid-integrate`. Never flatten a single-runtime source route here.

Before copying source, rerun the bundled verifier with `--expect block` on
every block. Reject a missing block, hash change, unverified pattern revision,
mixed runtime/version, incomplete Recipe mapping, broken asset, or failed
Builder evidence.

## Integrate

Write only under:

`broll-production/04-remotion-integrate/`

Create one self-contained master in `project/`. Copy runtime-owned shot source
and frozen assets into collision-free block namespaces; do not import from a
Builder directory or the installed Skill at render time. Resolve only
integration-owned paths, resource names, shared deterministic helpers, and
seams. Return shot-owned source, timing, creative, material, font, or
attribution defects to the responsible Builder.

Register exactly one final Composition. Assemble all shots in Director order
with `Sequence`, using the canonical absolute boundary mapping and
`sequenceFrom = startFrame - masterStartFrame`. Require continuous coverage
from zero through the mapped final SRT cue end with no omitted, duplicated,
overlapped, retimed, or zero-frame shot. Preserve every Recipe SHA-256,
capability, pattern/fallback decision, readable hold, and frozen material
binding.

Create one exact package and lock closure. List and hash every master source,
config, lock, asset, and font in `project/remotion-project.json`. Its `kind`
must be `master`; its Composition ID, entry point, raster, fps, duration, and
shot map must equal actual source rather than a handoff claim.
Prepare it through `remotion-toolchain.mjs`: reuse the existing immutable
toolchain when the dependency identity matches, and install once only when the
master declares a genuinely different exact closure. Never copy a unit's
physical `node_modules` tree into the master.

If any block uses `effects.dom-pixel-postprocess`, preserve its declared
HTML-in-canvas paint backends and require one project-wide non-nested capture
contract. Copy the identity-bound `remotion.config.ts` and require the same
`angle` or `swangle` value across every WebGL2 block; mixed GL backends are an
integration conflict. Do not wrap the assembled master in another
`<HtmlInCanvas>`. Merge the actual backend list into
`runtimeFeatures.htmlInCanvas` and rerun the verifier before geometry capture.

## Execute integration gates

Use the safe explicit child environment and direct project-local Node entry
points. Then:

1. run `scripts/remotion-verify.mjs --expect master`;
2. verify each Builder's shared-toolchain and unit typecheck receipt;
3. typecheck only integration-owned master glue through the two-slot heavy queue;
4. capture actual per-frame master geometry through that queue and run the bundled motion/layout
   lint once across the complete Composition;
5. render only lint diagnostic windows while resolving findings;
6. rerun the verifier and atomically create the new
   `composition-identity.json` with `--write-identity`.

Do not make a duplicate low-cost preview or routine seam/hold still set. A
passing lint needs no AI visual analysis. Findings may trigger only their
bounded diagnostic frames or clips; return shot-owned findings to its Builder.
This machine gate detects measurable motion/layout risks, not aesthetic
quality.

For HTML-in-canvas, require semantic Canvas/GL bounds from the same
identity-bound frame function and use the frozen GL backend. Do not infer
internal geometry from the canvas rectangle.

Never create the identity before the source closure and full-composition lint
are final. If a source fix is needed, refresh file hashes and repeat every
affected gate before generating a new unused identity path.
Keep every trace, lint result, diagnostic, cache, log, and identity file in sibling evidence
paths outside `project/`; any non-dependency file inside `project/` must be
listed and hashed by its manifest.

When a finding-triggered diagnostic clip is needed under a silent policy, pass
`--muted`, require zero audio streams, and verify exact frame duration as
`durationInFrames / fps` for its bounded window.

## Deliverables

Deliver only under the integration directory:

- `project/`, containing the complete runnable Remotion master;
- `composition-identity.json` from the bundled verifier;
- `integration-notes.md`, including source namespaces, exact versions,
  millisecond/frame closure, seam review, Recipe/pattern traceability,
  dependency licenses, and accepted faithful variances;
- bounded verifier, typecheck, full-composition motion/layout lint, and
  exception-triggered diagnostic evidence;
- `handoff.md` naming the exact Composition and identity aggregate.

## Completion and stop

Complete only when every block and shot is present once, absolute millisecond
and integer-frame coverage both close, all resources resolve locally, source
is deterministic, Builder receipts and integration-glue typecheck pass, the full-composition lint closes
measurable motion/layout risks, and the approval identity covers the final
project closure.

Stop when a block is missing or changed, runtimes or versions disagree,
Recipe/pattern traceability is incomplete, a source or asset collision cannot
be resolved without redesign, the license is unconfirmed, exact dependencies
cannot be installed, or any verifier/typecheck/trace/lint gate stays
red. Do not hide a defect by flattening a block to media or switching runtime.
