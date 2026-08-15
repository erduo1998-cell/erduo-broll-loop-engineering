---
name: broll-master-build
description: Build one runtime-plan-assigned HyperFrames authoring unit and deliver editable source plus one verified continuous frozen unit, or freeze an already verified multi-unit block.
---

# HyperFrames Builder

Own only one assigned authoring unit in one HyperFrames block. Do not change
Direction, routing, assets, other units, or final delivery. In hybrid
`block-freeze` mode, only join already verified unit source in plan order and
freeze the block; never revise unit creativity.

## Load only what this unit needs

Require the validated unit assignment, shared narrative/visual locators,
assigned Recipes, immediate seam summaries, frozen assets/fonts, output/audio
policy, and 0–2 selected references. Run the Recipe validator. Do not load the
whole film, catalogs, schemas, or unrelated references.

Verify the immutable `assignment.productionProfile` against both its assignment
identity and the runtime plan. Use its exact raster, fps rational, mezzanine
container/codec/pixel/color/audio, and final-master policy. Never guess or
substitute an output profile.

Load the pinned official `hyperframes` Skill, then the specific creative,
animation, keyframe, media, registry, or CLI guidance needed by this unit. Read
`animation-craft.md`, `visual-craft.md`, and `motion-layout-lint.md`; query only
the selected craft/card entry. Reuse a verified mechanism when it fits, while
replacing its content, layout, typography, materials, palette, and visual skin.
Do not copy Remotion source or claim automatic parity.

All commands follow `../../references/safe-execution.md`.

## Author

Write only `broll-production/03-build/<authoring-unit-id>/`. Preserve exact
Recipe timing, meaning, visual job, focus order, material roles, beat boundaries,
readable holds, and neighboring handoffs.

Build the maximum visible hero state first: focus, foreground/background
relationship, edge anchors, media geometry, supporting structure, and readable
result. Then animate attention, primary causal action, dependent overlap and
follow-through, settle, and hold. Use secondary action only when it clarifies
meaning. Deliberate stillness is valid; unrelated layer motion is not.

Implement every non-still Recipe beat as a beat-bound development of a meaningful
primary, secondary, text, or structural element. Finite action may transform and
settle; progressive continuous subject action may fulfill a beat when it advances
to a new visible state. Background loops, particles, decorative lines, unbound
continuous motion, or unchanged motion declarations cannot fulfill a beat. Do
not add or compress beats by a fixed duration or count; realize the Director's
content-derived progression.

Keep motion deterministic and seekable. Let ordinary media drive crop, mask,
path, annotation, palette, depth, or state; a generic framed thumbnail is not
asset fusion. Keep internal IDs and debug text out of visible copy.

Run official authoring checks. Capture truthful rendered DOM or semantic scene
bounds for every frame when the official adapter exposes them, then run the
shared motion/layout lint with `--recipes` pointing to this unit's assigned
Recipe directory. Capture runtime styling hashes when a planned material-state
or attention change is not expressed by geometry; never hash text content as a
substitute for development. Record unsupported geometry as `unmeasured`; never
estimate it from source. Beat delivery cannot claim a pass when its principal
development is unmeasured. A pass produces no still, clip, preview, or AI frame
inspection. Only findings render their bounded diagnostic windows, after which
rerun affected checks and lint.

For a selected `diagram-*` craft entry, also capture actual rendered diagram
geometry at every declared readable hold: node rectangles, connector
polylines, and connector-label rectangles in canvas coordinates. Store it in
the shot's `diagramFrames` trace field. The shared lint rejects missing diagram
evidence, a connector crossing an unrelated node, a label touching a connector
or node, and two connectors sharing a visible path segment. Do not hand-author
or infer this evidence from source.

## Deliver

Deliver editable renderable source, local dependency locators, compact
`receipt.json`, one continuous lossless/visually-lossless frozen unit, a
schema-valid `block-media.json`, and a minimal `handoff.md` containing status,
locators, exceptions, and next owner. This frozen delivery is required for every
normal authoring unit, not only hybrid work. Match the production output policy's
single width, height, fps, codec, pixel format, color, and audio contract so a
later script can concatenate units without interpreting their source. Render it
only after Recipe-bound motion/layout lint passes; run FFprobe, full decode,
exact duration checks, and the existing frozen-block validator. The receipt binds Recipes, source,
assets/fonts, reuse decisions, seams, official checks, measured/unmeasured lint
coverage, frozen media, and its source identity.
Write a compact source manifest for the editable source closure only: list every
source-owned file and hash plus its entrypoints; exclude dependencies, caches,
renders, and generated media. Bind `sourceIdentity` to that manifest so the
validator checks the declared closure without scanning the whole unit tree.

For `block-freeze` mode, consume only passing receipts/source exports, add
minimum block glue, record aggregate source identity, run the same checks/lint,
render one mezzanine, and validate its frozen-block contract. Return any unit
defect to that unit owner.

Complete only when assigned Recipes have deterministic editable source,
continuous coverage, closed assets/fonts, passing official checks, Recipe-bound
beat delivery and motion/layout lint, and a verified continuous frozen unit with
manifest. Stop for missing input, unsupported capability, unavailable official
Skill, false geometry evidence, unmeasured principal beat development, or a real
failed gate.
