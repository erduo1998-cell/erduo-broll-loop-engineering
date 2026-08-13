---
name: broll-remotion-integrate
description: Integrate all verified Remotion block projects into one deterministic SRT-anchored master Composition, render technical preview evidence, and freeze the approval identity. Use after every Remotion Builder block is complete.
---

# B-roll Remotion Master Integrator

Act only as the Integrator for the selected Remotion production route. Do not
redesign shots, collect media, repair block-owned creative defects, render the
formal master, or mix HyperFrames source into the project.

## Backend contract

Read `../../references/remotion-backend.md`, the runtime contract, capability
matrix, and Remotion project schema. Require matching router, Onboarding, and
user licensing evidence plus a validated runtime plan whose resulting route is
single-backend `remotion`. Every
Builder handoff and manifest must name that same route, adapter version,
runtime baseline, frame rate, dimensions, and audio policy.

Before every non-Pexels process, create an explicit child map,
remove every key whose ASCII case-folded name equals `PEXELS_API_KEY`, reject
case-insensitive key collisions, and set `HYPERFRAMES_NO_TELEMETRY=1`. Pass the
map directly to the executable without a shell. If the host cannot inject and
attest that map, use the parent Skill's bundled `scripts/safe-spawn.mjs`. If
neither route is available, stop before spawn as `action-required`.

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

If any block uses `effects.dom-pixel-postprocess`, preserve its declared
HTML-in-canvas paint backends and require one project-wide non-nested capture
contract. Copy the identity-bound `remotion.config.ts` and require the same
`angle` or `swangle` value across every WebGL2 block; mixed GL backends are an
integration conflict. Do not wrap the assembled master in another
`<HtmlInCanvas>`. Merge the actual backend list into
`runtimeFeatures.htmlInCanvas` and rerun the verifier before any still.

## Execute integration gates

Use the safe explicit child environment and direct project-local Node entry
points. Then:

1. run `scripts/remotion-verify.mjs --expect master`;
2. perform clean `npm ci --ignore-scripts`;
3. run `node node_modules/typescript/bin/tsc --noEmit`;
4. render real stills immediately before and after every block seam and at all
   declared readable holds;
5. render the complete Composition once to a new low-cost preview MP4;
6. inspect sampled preview frames, run FFprobe, and decode the preview fully;
7. rerun the verifier and atomically create the new
   `composition-identity.json` with `--write-identity`.

Inspect stills and preview only for concrete integration, layout,
missing-resource, seam, and runtime defects. Do not turn this technical
inspection into an aesthetic score, approval stop, or independent review
stage.

For HTML-in-canvas, render additional stills during every active pixel effect
and every following readable hold. The full preview must use the frozen GL
backend and be visually inspected for blank captures, stale DOM frames,
resolution loss, shader orientation, clipping, and seams.

Never create the identity before the source closure and technical preview are
final. Preview files are evidence, not the formal master, and remain outside
the identity. If a source fix is needed, refresh file hashes and repeat every
affected gate before generating a new unused identity path.
For a silent audio policy, render the preview with `--muted` and require zero
audio streams plus exact `durationInFrames / fps` container duration.
Keep every still, preview, cache, log, and identity file in sibling evidence
paths outside `project/`; any non-dependency file inside `project/` must be
listed and hashed by its manifest.

## Deliverables

Deliver only under the integration directory:

- `project/`, containing the complete runnable Remotion master;
- `composition-identity.json` from the bundled verifier;
- `integration-notes.md`, including source namespaces, exact versions,
  millisecond/frame closure, seam review, Recipe/pattern traceability,
  dependency licenses, and accepted faithful variances;
- bounded verifier, typecheck, still, preview, FFprobe, and full-decode
  evidence;
- `handoff.md` naming the exact Composition and identity aggregate.

## Completion and stop

Complete only when every block and shot is present once, absolute millisecond
and integer-frame coverage both close, all resources resolve locally, source
is deterministic, verifier and typecheck pass, seams and holds have inspected
stills, the full preview renders and decodes, and the approval identity covers
the final project closure.

Stop when a block is missing or changed, runtimes or versions disagree,
Recipe/pattern traceability is incomplete, a source or asset collision cannot
be resolved without redesign, the license is unconfirmed, exact dependencies
cannot be installed, or any verifier/typecheck/still/preview/decode gate stays
red. Do not hide a defect by flattening a block to media or switching runtime.
