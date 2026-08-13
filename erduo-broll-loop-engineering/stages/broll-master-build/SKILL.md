---
name: broll-master-build
description: Build one focused runtime-plan authoring unit of an SRT-anchored B-roll film as real HyperFrames source after conditional Assets closure.
---

# B-roll HyperFrames Authoring-Unit Builder

Act only as the author of one assigned authoring unit inside one backend block.
Do not author another unit, change the film plan, collect missing assets,
assemble the master,
render the final film, or export shots.

The same Builder role also supports a hybrid-only `block-freeze` mode after all
authoring units in one HyperFrames backend block have technically passed. In
that mode, do not author or modify unit-internal source and do not revisit
Recipes. Read only the block window
and verified unit source exports/receipts. Write only the minimum temporary
block-level HyperFrames composition glue required to mount those exports in
plan order, run the official same-backend checks/render, and freeze the existing
block mezzanine plus `block-media.json`. Record normalized glue/unit-source
paths, per-file SHA-256, and one aggregate source identity. Do not change unit-
internal creative, timing, shots, or source, or run an aesthetic review.

## Runtime route

Read `../../references/animation-craft.md`,
`../../references/visual-craft.md`,
`../../references/runtime/runtime-contract.md`, the validated Director
Shot Recipes, and `../../references/runtime/capability-matrix.json` before
authoring. The recipe is the source of semantic intent; the selected adapter
owns runtime syntax and implementation.

For an assigned Recipe with `patternRef`, resolve exactly that card and style
from the installed Skill root:

```text
node scripts/query-shotcraft.mjs --card <card-id> --style <style-key>
```

Read no unselected card body and never load the full catalog. Use the card as
quality and motion-grammar knowledge: preserve the selected style's semantic
action, material assumptions, readable result state, hold, and known failure
constraints while adapting timings to the Recipe's absolute milliseconds.
The catalog does not supply a verified HyperFrames component.

Require a validated runtime-plan authoring unit assigned wholly to one
`hyperframes` backend block. Adapt each assigned
runtime-neutral recipe into HyperFrames-owned source under the existing
official Builder workflow without changing its shot window, semantic result,
material role, or readable hold. This is a traceable runtime implementation
decision, not a claim that an automatic HyperFrames adapter is bundled. Record
the recipe ID, capability IDs, implementation decision, and any faithful
variance in the compact `receipt.json`.

Implement selected patterns from first principles in native, deterministic,
seekable HyperFrames source under the official Skill guidance. Do not copy or
transpile upstream TSX, Remotion components, hooks, frame constants, demo
assets, fonts, sounds, or project configuration. Only when the user explicitly
requests migration of an existing Remotion implementation may a separate
runtime-porting workflow inspect that source; it must use the applicable
`remotion-to-hyperframes` guidance and lint/evidence gates, remain outside the
canonical Recipe, and must not turn Remotion production availability on.

Do not accept a Remotion-assigned shot, change a planner decision after a build
failure, or claim compatibility from prose alone.

## Official HyperFrames requirement

Before reading or writing any HyperFrames source, use the host's native Skill
mechanism to load the release-pinned official `hyperframes` Skill. Then load
the release-pinned official creative and animation Skills and only the
composition, typography, beat, blueprint, transition, keyframe, media, or CLI
references actually hit by this unit. Query the official registry, creative
preset, and animation blueprint/transition indexes before inventing a new
mechanism. Reuse mechanisms, not example content or skin.

A handoff statement, remembered rule, or CLI invocation alone does not replace
the real Skill load. Retain the host-native trace reference when available. If
the host cannot load the official Skill, stop before authoring.

Before every non-Pexels child process, use the host's native spawn/process API
to copy the required environment into an explicit child map, remove every key
whose ASCII case-folded name equals `PEXELS_API_KEY`, resolve case-insensitive
key collisions, and set `HYPERFRAMES_NO_TELEMETRY=1` by default. Pass the map
directly to the executable without a shell. Telemetry opt-in may change only
the telemetry value; Pexels-key removal remains mandatory. Do not use
shell-inline assignments or `env -u` as the contract. If the host cannot inject
or attest the sanitized map, invoke the command only through the parent Skill's
bundled `scripts/safe-spawn.mjs` using the command form documented in the
parent Skill. That launcher is the bounded no-log, no-shell trust
boundary. If neither route is available, stop before spawn as
`action-required`. This setting does not prove Skill loading or replace
required CLI review.

## Inputs

- assigned authoring-unit ID, parent block ID, and contiguous
  integer-millisecond range
- shared Director narrative-envelope and visual-system locators, assigned
  shots only, and the immediate preceding/following seam summaries
- validated runtime-neutral Shot Recipes for the assigned shots
- Assets material plan, local media, fonts, and licenses
- output profile and audio policy
- ready onboarding handoff
- selected runtime and capability-matrix decision
- validated runtime plan identity and exact unit/block assignment
- only the 0–2 visual/craft/Shotcraft references selected for this unit

## Author the block

Do not read unassigned Recipes, the full Shotcraft catalog, the full craft
catalog, or whole-film prose duplicated elsewhere. Read the complete assigned
unit before writing source. For each shot:

- preserve the assigned Shot Recipe ID and required capability IDs;
- preserve its exact SRT window and semantic purpose;
- choose a concrete composition that serves the audience-understanding goal;
- establish a clear focus and attention path;
- make the intended change, comparison, reveal, accumulation, interruption,
  callback, or deliberate stillness visible;
- leave required information readable;
- integrate selected photographic material as part of the composition;
- use native graphics only for meaningful structure and support;
- keep screen copy selective and safe;
- use the project-local font roles and actual font files;
- connect intentionally to neighboring shots and block seams.
- preserve Recipe v2 composition family, hero-frame relationship,
  `microBeats[]`, material need, and shared visual-system roles without copying
  the shared rules into per-shot notes.
- when `patternRef` exists, record its exact card ID, style key, source
  revision as the pinned upstream Git commit, native implementation decision,
  preserved constraints, and any faithful variance; when absent, do not force
  a catalog pattern.

Build the shot's maximum visible hero-frame state in source first: establish
the first-read focus, background/midground/foreground relationship, supporting
structure, edge anchors, and readable result. This is authoring, not a new
approval artifact or still-review gate. Then, before choosing an atomic rule,
blueprint, adapter, transition, or ease,
reconstruct the Recipe's attention path, physical character, causal action,
key states or continuous motion, one expressive peak, and settled readable
result. Build the one paused timeline in this order: key states, necessary
preparation, primary action, dependent follow-through, then only meaningful
secondary action. Derive dependent movement from the primary action and remove
uncausally ambient motion. Do not turn the twelve principles into visible
labels, per-shot checklists, evidence artifacts, or a reason to add effects.

Use at most one primary craft grammar per shot plus an optional transition.
When ordinary media is present, make its real geometry, crop, palette, mask,
path, annotation, depth, or state drive the composition; a generic framed
thumbnail does not satisfy asset fusion. Do not turn the plan into repeated
cards, a long native-only passage, unrelated
stock footage under titles, or ambient motion without informational purpose.
Do not expose internal shot IDs, milliseconds, debug labels, or status text in
the final image.

Use only local production assets. Keep timelines deterministic and seekable
according to the official HyperFrames guidance. Run the official development
checks appropriate while authoring and resolve real block-owned errors.

## Deliverables

Write only under:

`broll-production/03-build/<authoring-unit-id>/`

Deliver:

- real renderable HyperFrames source;
- local dependencies owned by the block;
- compact `receipt.json` binding unit, Recipes, source, assets/fonts, reuse
  decisions, seams, and checks;
- `handoff.md` containing only status, artifact locators, exceptions, and next
  owner.

When `runtime-plan.json` has `resultingRoute: hybrid` and the backend block has
one authoring unit, also render one local lossless or visually-lossless block
mezzanine after the normal source checks,
inspect its opening/closing and semantic hold frames, run FFprobe and a complete
decode, and write `block-media.json` conforming to
`../../references/runtime/frozen-block.schema.json`. The media and contract
remain inside this block directory. Set `noRealtimeNesting: true`, bind the
actual source identity and SHA-256, and do not call this intermediate a master.
For a single-runtime route, preserve the existing source handoff and do not
flatten it unnecessarily.

For a hybrid backend block with multiple authoring units, the unit pass stops
after its receipt and normal checks. A fresh `block-freeze` Builder requires
all unit receipts to pass, proves their ordered coverage closes the block, uses
the same sanitized environment and official HyperFrames contracts, creates
only block-level composition glue in one unused block-freeze directory, runs
official check/render plus FFprobe/full decode/boundary inspection, then writes
the block mezzanine and schema-valid `block-media.json`. Bind the aggregate
glue/unit-source identity into the frozen contract. It must not fix or
reinterpret a unit; return any gap, source/hash drift, failed receipt, glue
conflict, or render defect to the implicated unit Builder.

The compact receipt records recipe-to-runtime decisions, capability and reuse
evidence, faithful variances, material fusion, time coverage, seams, official
Skill loads, actual CLI work, and selected pattern/craft traceability without
copying reference bodies or narrating successful defaults.

## Completion

Complete when every assigned shot exists as real source, exact time coverage is
preserved, selected material and fonts are used correctly, the block is
seekable, seams are intentional, official checks show no unresolved
block-owned error, every recipe has a traceable runtime implementation, and the
handoff points to the actual artifacts.

Hybrid completion additionally requires the frozen media file and contract to
pass the bundled frozen-block validator when checked with all planned blocks.
In multi-unit `block-freeze` mode, completion instead means the verified unit
closure and glue/source aggregate identity are recorded, the block-level
official checks/render pass, and the resulting mezzanine/contract pass probe,
decode, boundary inspection, and frozen-block validation.

## Stop

Stop when the official HyperFrames Skill cannot be loaded, an assigned asset
or font is missing, timing is contradictory, the source cannot satisfy current
official rules, a recipe requires an unsupported capability, runtime evidence
is missing, a selected card, style, or pinned upstream Git commit cannot be
resolved, or the upstream creative decision is insufficient. Return the issue
to the owning stage. Do not create placeholder media or redesign another
stage's work.
