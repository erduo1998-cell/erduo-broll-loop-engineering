---
name: broll-master-build
description: Build assigned HyperFrames representative scenes and shared visual source as Lead, or one production authoring unit with editable source and verified frozen media.
---

# HyperFrames Builder

Own only one assignment in one HyperFrames block. `role: lead` with
`phase: visual-lock` builds only the assigned representative scenes and shared
visual source; `role: builder` with `phase: production` builds one authoring
unit. Do not change
Direction, routing, assets, other units, or final delivery. In hybrid
`block-freeze` mode, only join already verified unit source in plan order and
freeze the block; never revise unit creativity.

## Load only what this unit needs

Require the validated unit assignment, shared narrative/visual locators,
assigned Recipes, immediate seam summaries, frozen assets/fonts, output/audio
policy, and 0–2 selected references. A production assignment additionally
requires a validated approved-or-explicitly-skipped
`04-visual-lock/visual-lock.json` and the matching HyperFrames shared-source
locator and identity. Run the Recipe validator. Do not load the
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

For a Lead assignment, write only
`broll-production/04-visual-lock/hyperframes/scenes/` and
`broll-production/04-visual-lock/hyperframes/shared-source/`. Build the assigned
representative scenes as real moving outputs. Make the shared source directly
importable by later HyperFrames units and include local font loading, type
hierarchy, palette, grid, safe areas, spacing, background/material/depth
baseline, common content-relationship primitives, and enter/emphasize/change/
exit/readable-hold motion tokens. Bind its editable-source manifest and identity.
It is infrastructure, not a layout template; the scenes must still use
different content-appropriate compositions.

For a production assignment, write only
`broll-production/03-build/<authoring-unit-id>/`, import the identity-bound
shared source, and preserve exact
Recipe timing, meaning, visual job, focus order, material roles, beat boundaries,
readable holds, and neighboring handoffs.

Every shot begins with the Recipe's concrete first-read anchor, makes the
declared action happen visibly, and settles into its readable result. Do not let
abstract material, energy lines, giant type, or English filler replace an
immediately understandable object, relationship, state, or spatial change.
Use shared primitives without reskinning one layout across the film.

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
bounds first at Recipe beat boundaries, readable holds, scene cuts, and the
smallest mechanism-specific samples. Capture runtime styling hashes when a
planned material-state or attention change is not expressed by geometry; never
hash text content as a substitute for development. A finding or unproven
principal development escalates only its diagnostic window to dense or
per-frame capture. Connector geometry, complex paths, Canvas/WebGL, and an
explicit user requirement may demand exact evidence from the start. Record
unsupported geometry as `unmeasured`; never estimate it from source. Beat
delivery cannot claim a pass when its principal development is unmeasured. A
pass produces no all-frame PNG sequence, still, clip, preview, or AI frame
inspection. Only findings render bounded diagnostic windows, after which rerun
affected checks and lint.

For a selected `diagram-*` craft entry, also capture actual rendered diagram
geometry at every declared readable hold: node rectangles, connector
polylines, and connector-label rectangles in canvas coordinates. Store it in
the shot's `diagramFrames` trace field. The shared lint rejects missing diagram
evidence, a connector crossing an unrelated node, a label touching a connector
or node, and two connectors sharing a visible path segment. Do not hand-author
or infer this evidence from source.

## Deliver

A Lead delivers its assigned moving representative scenes, importable shared
visual source, compact receipt, source manifest/identity, objective check
locators, and the minimal facts needed by the Director and visual-lock
contract. It does not author unassigned Recipes or claim that the user approved
the direction.

For a production assignment, deliver editable renderable source, local dependency locators, compact
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
For a runtime plan v3 production unit, also write the assignment gate's exact
`visualLockIdentity` and matching HyperFrames `runtimeSourceIdentity` into
`block-media.json`; never recompute or substitute either value.

For `block-freeze` mode, consume only passing receipts/source exports, add
minimum block glue, record aggregate source identity, run the same checks/lint,
render one mezzanine, and validate its frozen-block contract. Return any unit
defect to that unit owner.

Complete a Lead assignment only when every assigned representative scene moves,
the importable shared source and manifest close, checks pass, and identities are
ready for Director witness and visual-lock validation. Complete a production
assignment only when assigned Recipes have deterministic editable source,
continuous coverage, closed assets/fonts, passing official checks, Recipe-bound
beat delivery and motion/layout lint, and a verified continuous frozen unit with
manifest. Stop for missing input, unsupported capability, unavailable official
Skill, false geometry evidence, unmeasured principal beat development, or a real
failed gate.
