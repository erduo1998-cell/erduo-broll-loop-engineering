---
name: broll-remotion-build
description: Build one runtime-plan-assigned Remotion authoring unit and deliver editable source plus one verified continuous frozen unit, or freeze an already verified multi-unit block.
---

# Remotion Builder

Own only one assigned authoring unit in one Remotion block. Do not change
Direction, routing, assets, other units, or final delivery. In hybrid
`block-freeze` mode, only join verified unit projects in plan order and freeze
the block; never revise unit creativity.

## Inputs and references

Require the validated unit assignment, shared narrative/visual locators,
assigned Recipes, immediate seams, frozen assets/fonts, output/audio policy,
targeted project preflight, license confirmation, and 0–2 selected references.
Run the Recipe validator. Use only exact project-local Remotion packages and
CLI; never global packages, download-style `npx`, HyperFrames execution, or
runtime switching.

Verify the immutable `assignment.productionProfile` against both its assignment
identity and the runtime plan. Use its exact raster, fps rational, mezzanine
container/codec/pixel/color/audio, and final-master policy. Never guess or
substitute an output profile.

Read `animation-craft.md`, `visual-craft.md`, `remotion-backend.md`, and
`motion-layout-lint.md`. Query only selected craft/card entries and their
manifest-pinned reference imports. Treat reference TSX as Apache-2.0 knowledge,
not a ready component: replace fixture content and excluded media, fonts,
textures, sounds, coordinates, and styling with frozen project inputs. Prefer a
project-local primitive only when it has a matching real render witness.

All commands follow `../../references/safe-execution.md`.

## Author

Write an isolated source project only under
`broll-production/03-remotion-build/<authoring-unit-id>/project/`. Register one
block Composition and assemble assigned semantic shots with deterministic
`Sequence` offsets using the backend reference's absolute millisecond/frame
mapping. Preserve Recipe meaning, visual job, focus, material roles, beat
boundaries, readable holds, and seams.

Build the maximum visible hero state first: focus, depth, edge anchors, media
geometry, support structure, and readable result. Then author attention,
primary causal action, dependent overlap/follow-through, one expressive peak,
settle, and hold. Use `spring` only when physical character needs it. Media
must drive crop, mask, path, annotation, palette, depth, or state—not a generic
frame.

Implement every non-still Recipe beat as a beat-bound development of a meaningful
primary, secondary, text, or structural element. Finite action may transform and
settle; progressive continuous subject action may fulfill a beat when it advances
to a new visible state. Background loops, particles, decorative lines, unbound
continuous motion, or unchanged motion declarations cannot fulfill a beat. Do
not add or compress beats by a fixed duration or count; realize the Director's
content-derived progression.

All visible motion must derive from current frame/fps, deterministic math, or a
fixed seed. No CSS time animation, timers, ambient effects/state, render-time
network, wall clock, or unseeded randomness. For HTML-in-canvas, require its
capability canary, smallest non-nested subtree, deterministic Canvas/GL state,
cleanup, and identity-bound GL backend; never silent fallback.

Create the exact package/lock and manifest closure required by
`remotion-backend.md`; freeze and hash source, config, assets, fonts, Recipes,
capabilities, attribution, and fallback decisions. Fonts must be project-local
and explicitly loaded. Never run a private per-unit `npm ci`. Call the bundled
`remotion-toolchain.mjs prepare`; identical dependency identities reuse one
production-root toolchain through the unit's `node_modules` link.

Run verifier, identity-bound shared-toolchain preparation, the unit typecheck,
truthful per-frame runtime geometry capture, and motion/layout lint with
`--recipes` pointing to this unit's assigned Recipe directory. Capture runtime
styling hashes when a planned material-state or attention change is not expressed
by geometry; never hash text content as a substitute for development. Beat
delivery cannot claim a pass when its principal development is unmeasured. Route
install, typecheck, browser trace, diagnostic render, and block freeze render
through `remotion-toolchain.mjs run-heavy`; its fixed limit is two. A pass produces no routine still,
unit preview, or AI frame inspection. Findings alone render bounded diagnostic
windows; fix owning source and rerun only affected gates. Canvas/WebGL content
must expose semantic bounds, not merely its canvas rectangle.

For a selected `diagram-*` craft entry, also capture actual rendered diagram
geometry at every declared readable hold: node rectangles, connector
polylines, and connector-label rectangles in canvas coordinates. Store it in
the shot's `diagramFrames` trace field. The shared lint rejects missing diagram
evidence, a connector crossing an unrelated node, a label touching a connector
or node, and two connectors sharing a visible path segment. Do not hand-author
or infer this evidence from JSX or SVG source.

## Deliver

Deliver editable project source, compact `receipt.json`, shared-toolchain
receipt, one continuous lossless/visually-lossless frozen unit, schema-valid
`block-media.json`, and minimal `handoff.md` with Composition ID, dependency
identity, manifest/QA locators, coverage, seams, exceptions, and next owner.
This frozen delivery is required for every normal authoring unit, not only
hybrid work. Match the production output policy's single width, height, fps,
codec, pixel format, color, and audio contract so a later script can concatenate
units without interpreting their source. Render it only after Recipe-bound lint passes. A silent policy
passes `--muted`, requires zero audio streams, and verifies exact frame duration
as `durationInFrames / fps`; FFprobe and fully decode the result and validate the
existing frozen-block contract. The final integrated moving preview remains the
only aesthetic review.
Write a compact source manifest for the editable source closure only: list every
source-owned file and hash plus its entrypoints; exclude dependencies, caches,
renders, and generated media. Bind `sourceIdentity` to that manifest so the
validator checks the declared closure without scanning the whole unit tree.

For multi-unit `block-freeze` mode, consume only passing project receipts, add
minimum Composition/Sequence glue, bind an aggregate source identity, run block
gates, and freeze one verified mezzanine. Return unit defects to their owner.

Complete only with deterministic runnable editable TSX, continuous coverage,
closed assets/fonts/licenses, passing verifier/typecheck, Recipe-bound beat
delivery and runtime-captured lint, and a verified continuous frozen unit with
manifest. Stop for missing facts, unsupported capability, unavailable exact
dependencies, false trace evidence, unmeasured principal beat development, or a
real failed gate.
