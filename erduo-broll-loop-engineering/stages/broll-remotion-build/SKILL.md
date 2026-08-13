---
name: broll-remotion-build
description: Build one focused runtime-plan authoring unit as deterministic Remotion React/TSX, with frozen media when the overall route is hybrid.
---

# B-roll Remotion Authoring-Unit Builder

Act only as the Builder for one assigned authoring unit inside one backend
block. Do not change the
runtime decision, rewrite Direction, collect assets, integrate other blocks,
render the formal master, or export shots.

The same Builder role also supports a hybrid-only `block-freeze` mode after all
authoring units in one Remotion backend block have technically passed. In this
mode, read only the block window and verified unit projects/manifests/receipts,
write only the minimum temporary block-level Composition/Sequence glue needed
to mount their verified source exports in plan order, and use the verified
local toolchain to typecheck, still/preview-test, render, and freeze the existing
block mezzanine plus `block-media.json`. Record normalized glue/unit-source
paths, per-file SHA-256, and one aggregate source identity. Do not change unit-
internal creative, timing, shots, or source, or run an aesthetic review.

## Backend contract

Read:

- `../../references/animation-craft.md`;
- `../../references/visual-craft.md`;
- `../../references/remotion-backend.md`;
- `../../references/runtime/runtime-contract.md`;
- `../../references/runtime/capability-matrix.json`;
- `../../references/runtime/remotion-project.schema.json`.

Require a validated runtime-plan authoring unit assigned wholly to one Remotion
backend block and a
`ready` targeted Remotion Onboarding handoff. For a
fresh blank project, that readiness must come from a fresh authorized repair
Agent that created a minimal exact project-local canary and actually verified
the local Remotion CLI version, Chrome, FFmpeg, and FFprobe after the user
confirmed the official Remotion licensing terms and dependency installation.
The canary Composition remains assigned to this Builder; it is not production
source or permission to skip this block project's own exact package, lock,
`npm ci`, verifier, and render gates. Stop before package work when any host,
route, authorization, capability, licensing, or local-CLI evidence is absent.

Use only a project-local exact Remotion installation. Do not load or invoke
HyperFrames, install a global package, import source from the installed Skill,
or silently switch runtime after an implementation problem.

Before every non-Pexels process, create an explicit child map,
remove every key whose ASCII case-folded name equals `PEXELS_API_KEY`, reject
case-insensitive key collisions, and set `HYPERFRAMES_NO_TELEMETRY=1`. Pass the
map directly to the executable without a shell. If the host cannot inject and
attest that map, use the parent Skill's bundled `scripts/safe-spawn.mjs`. If
neither route is available, stop before spawn as `action-required`.

## Inputs

- authoring-unit ID, parent block ID, and one contiguous integer-millisecond
  range;
- Director narrative-envelope and visual-system locators, assigned validated
  Shot Recipes only, runtime-plan identity, and exact unit/block assignment;
- frozen Assets-stage media, fonts, provenance, and licenses;
- neighboring seam summaries, output profile, and audio policy;
- only the 0–2 visual/craft/Shotcraft references selected for this unit;
- ready Remotion Onboarding, local-CLI canary, and licensing evidence.

Reject missing inputs, overlapping or zero-length Recipes, an unlisted or
unsupported Remotion capability, an unfrozen material, or a mixed-runtime
handoff. Run the parent `scripts/validate-shot-recipes.mjs` on the assigned
Recipe directory before authoring.

If any assigned Recipe requires `effects.dom-pixel-postprocess`, require the
same-run HTML-in-canvas Onboarding canary for the exact local Remotion,
browser, paint backend, and GL backend. A general Remotion CLI probe is not
enough. Reject stale evidence or a canary produced with another package lock,
browser, GL backend, or runtime plan.

## Resolve selected pattern knowledge

Do not load unassigned Recipes, whole-film repeated prose, the full craft
catalog, or the full Shotcraft catalog. Query one selected craft entry at a
time. Use at most one primary craft grammar per shot plus an optional
transition locator.

For each Recipe containing `patternRef`, run the parent query with its exact
card and style. Confirm the card, style, and pinned source revision match the
Recipe. Read the selected card body and only the `remotionSources` returned by
the query, including necessary shared fixture files. Sources may live under
`demos/` or `template/src/` in
`references/shotcraft/remotion-sources/`.

The query may display paths beginning with `remotion-sources/`. Before writing
the runtime manifest, normalize each one to the complete Skill-root-relative
form `references/shotcraft/remotion-sources/...`; `referenceFiles` accepts
only that form.

Treat those files as pinned Apache-2.0 reference implementations, not ready
components. Replace fixture content and every `staticFile`, image, video,
audio, texture, or font reference with the actual frozen local Assets-stage
input. Rework coordinates, copy, styling, duration, and visible states for the
Recipe. Never import the reference tree at runtime.

Reuse only a project-local primitive with a real render witness matching the
needed mechanism. If no witnessed primitive or usable reference exists,
implement the Recipe's runtime-neutral craft grammar from first principles.
Record `fallback` and its reason in the project manifest. Do not invent parity,
copy HyperFrames source, create placeholder media, or drop the shot.

## Author a runnable block

Write only under:

`broll-production/03-remotion-build/<authoring-unit-id>/`

Put the standalone runtime project in `project/`. Register exactly one block
Composition with `src/index.ts` and `src/Root.tsx`; assemble every assigned
shot in a block component using local `Sequence` offsets. Produce one native
React/TSX component per semantic shot unless a smaller shared component is
clearly safer.

Use the absolute millisecond-to-frame mapping in the backend reference. The
block Composition begins at the mapped block start but uses local frame zero;
each manifest shot retains absolute frames and computes `sequenceFrom`
relative to that mapped block start. Preserve Recipe windows, semantic result,
focus order, material roles, phase boundaries, and readable holds. Reject any
shot that maps to fewer than one frame.

Build the maximum visible hero-frame state in source first: establish focus,
background/midground/foreground relationship, supporting structure, edge
anchors, media geometry, and readable result. Do not create a new approval
artifact or stop for review. Before choosing `interpolate`, `spring`,
`Sequence`, or a procedural function,
reconstruct the Recipe's attention path, physical character, causal action,
key states or deterministic continuous motion, one expressive peak, and
settled readable result. Define those semantic states and frame windows first.
Use `spring` only when material, inertia, or landing calls for it; derive
dependent overlap and follow-through from the primary action instead of giving
layers unrelated animation. Add secondary action only when it strengthens
meaning. Do not emit principle labels, per-shot checklists, scores, or evidence
artifacts.

All visible motion must be reconstructed from `useCurrentFrame`,
`interpolate`, `spring`, `Sequence`, deterministic closed-form math, or a
fixed-seed helper. Do not use CSS time animation, ambient state/effects,
timers, network access during render, `Date`, `Math.random`, or unseeded
randomness. Verify arbitrary seek frames, not just forward playback.

When ordinary media is present, make its crop, focal geometry, palette, mask,
path, annotation, depth, or state drive the composition. A generic framed
thumbnail, white card, or title background does not satisfy asset fusion.

For `effects.dom-pixel-postprocess`, wrap only the smallest DOM subtree that
needs pixel processing. Do not wrap the full Composition merely for
convenience, and never nest `<HtmlInCanvas>`. Use `onPaint` for each captured
frame; use `onInit` plus an explicit cleanup function for WebGL2 resources.
Scale pixel-space values by the resolved pixel density where needed. Keep
shader uniforms and Canvas parameters as closed-form functions of the current
frame and fps. Freeze `angle` or `swangle` in `remotion.config.ts` for WebGL2,
list that file with manifest role `config`, and declare the complete
`runtimeFeatures.htmlInCanvas` object. Do not use WebGPU, the raw experimental
browser API, or a silent CSS fallback in this contract.

Create exact package metadata and a lockfile as defined in the backend
reference. Do not add optional, peer, bundled, workspace, override, or linked
dependencies; stop if the selected implementation cannot fit the closed exact
registry dependency set. Run lock generation and
`npm ci --ignore-scripts` only inside `project/`. List and hash every source,
config, lock, asset, and font in `remotion-project.json`; include Recipe
hashes, capabilities, source/fallback decision, and attribution.
Every declared font must be a frozen project-local file under `public/`, have
manifest role `font`, be loaded explicitly, and be used without a generic or
host-system fallback. Do not use the `font` shorthand; declare `fontFamily` or
`font-family` explicitly.

## Execute and inspect

Use a safe explicit child environment and direct local Node entry points.
Run, in order:

1. `scripts/remotion-verify.mjs --expect block`;
2. clean `npm ci --ignore-scripts`;
3. `node node_modules/typescript/bin/tsc --noEmit`;
4. local Remotion CLI `still` for every shot at its first safe frame, each
   action/result boundary, readable hold, and final safe frame;
5. a real local CLI preview render of the entire block to a new QA target.

For an HTML-in-canvas block, those stills and the preview must use the same
paint and GL backends recorded by Onboarding and the manifest. Inspect frames
inside the active distortion and inside the required readable hold. A green
typecheck without those rendered frames is not capability evidence.

When the run's audio policy is silent, include `--muted` in the preview render
and verify that the preview has no audio stream and closes at the exact frame
duration.
Write stills, previews, caches, and logs only beside `project/`, never inside
it. The verifier ignores only the project's root `.git/` and `node_modules/`;
all other project files belong to the manifest and identity closure.

Open and inspect the produced stills and sample frames from the preview.
Confirm focus, readability, frozen asset use, frame-boundary behavior, and
neighbor seams. A successful process without real output inspection is not
completion. After any source fix, refresh hashes, rerun the verifier,
typecheck, and affected still/render evidence.

## Deliverables

Alongside `project/`, deliver:

- compact `receipt.json` with Recipe-to-source decisions, pattern/craft
  provenance, reuse or native-fallback evidence, license decisions, frame
  mapping, material bindings, dependencies, and faithful variances;
- bounded command/version, typecheck, still, and preview evidence;
- `handoff.md` naming status, exact Composition ID, project manifest, coverage,
  receipt and QA locators, seams, exceptions, and next owner.

When the runtime plan results in `hybrid` and the backend block has one
authoring unit, formally freeze this block after its normal QA preview as one
lossless or visually-lossless local mezzanine and
write `block-media.json` conforming to
`../../references/runtime/frozen-block.schema.json`. Bind the exact project
identity, actual media SHA-256, profile, integer-millisecond window, frame
facts, FFprobe, full decode, opening/closing inspection, and
`noRealtimeNesting: true`. This is a Builder-owned intermediate, never the
approved master. For a single Remotion route, retain the existing source
handoff to the Remotion Integrator.

For a hybrid backend block with multiple authoring units, each unit pass stops
after its receipt and normal checks. A fresh `block-freeze` Builder requires
all unit verifier/typecheck/preview receipts to pass, proves their ordered
frame/millisecond coverage closes the block, assembles without importing the
other runtime, writes only block-level Composition/Sequence glue in one unused
block-freeze directory, runs verifier, clean install, typecheck, still/preview,
formal mezzanine render, FFprobe, full decode, and boundary inspection, then
writes the block mezzanine plus schema-valid `block-media.json`. Bind the
aggregate glue/unit-source identity into the frozen contract. It must not fix
or reinterpret a unit; return any gap, source/hash drift, failed receipt, glue
conflict, or render defect to the implicated unit Builder.

## Completion and stop

Complete only when every assigned Recipe has deterministic runnable TSX,
continuous millisecond and frame coverage, real local materials, traceable
pattern/fallback decisions, a verifier pass, a clean typecheck, inspected
stills, and a successful real block preview render.

Hybrid completion additionally requires the frozen media and contract needed
by the runtime-neutral Hybrid Integrator.
In multi-unit `block-freeze` mode, completion instead means the verified unit
closure and glue/source aggregate identity are recorded, the block-level
verifier/typecheck/still/render gates pass, and the resulting mezzanine and
contract pass FFprobe, full decode, boundary inspection, and frozen-block
validation.

Stop and return ownership when timing is contradictory, a required asset or
font is missing, the license is unconfirmed, a capability is unavailable, a
selected source revision cannot be verified, exact local dependencies cannot
be installed, browser execution fails, verifier/typecheck remains red, or a
real still/render cannot be produced. Do not weaken the Recipe or switch to
HyperFrames as a workaround.
