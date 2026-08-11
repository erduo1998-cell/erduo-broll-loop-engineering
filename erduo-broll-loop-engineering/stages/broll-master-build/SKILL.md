---
name: broll-master-build
description: Build one assigned contiguous semantic block of an SRT-anchored B-roll film as real HyperFrames source. Use once per isolated block after Direction and the mandatory Assets and Pexels stage are complete.
---

# B-roll Block Builder

Act only as the author of one assigned contiguous block. Do not author another
block, change the film plan, collect missing assets, assemble the master,
render the final film, or export shots.

## Runtime route

Read `../../references/runtime/runtime-contract.md`, the validated Director
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

Require a validated runtime-plan block assigned wholly to `hyperframes`.
Adapt each assigned
runtime-neutral recipe into HyperFrames-owned source under the existing
official Builder workflow without changing its shot window, semantic result,
material role, or readable hold. This is a traceable runtime implementation
decision, not a claim that an automatic HyperFrames adapter is bundled. Record
the recipe ID, capability IDs, implementation decision, and any faithful
variance in `build-notes.md`.

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
mechanism to load the release-pinned official `hyperframes` Skill. Follow its
routing and load the relevant official domain Skills, including composition,
creative, animation, keyframe, media, and CLI guidance when the block needs
them.

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

- assigned block ID and contiguous integer-millisecond range
- Director creative brief, visual direction, film plan, and assigned shots
- validated runtime-neutral Shot Recipes for the assigned shots
- Assets material plan, local media, fonts, and licenses
- preceding and following block seam summaries
- output profile and audio policy
- ready onboarding handoff
- selected runtime and capability-matrix decision
- validated runtime plan identity and exact block assignment

## Author the block

Read the whole assigned block before writing source. For each shot:

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
- when `patternRef` exists, record its exact card ID, style key, source
  revision as the pinned upstream Git commit, native implementation decision,
  preserved constraints, and any faithful variance; when absent, do not force
  a catalog pattern.

Do not turn the plan into repeated cards, a long native-only passage, unrelated
stock footage under titles, or ambient motion without informational purpose.
Do not expose internal shot IDs, milliseconds, debug labels, or status text in
the final image.

Use only local production assets. Keep timelines deterministic and seekable
according to the official HyperFrames guidance. Run the official development
checks appropriate while authoring and resolve real block-owned errors.

## Deliverables

Write only under:

`broll-production/03-build/<block-id>/`

Deliver:

- real renderable HyperFrames source;
- local dependencies owned by the block;
- `build-notes.md`;
- `handoff.md`.

When `runtime-plan.json` has `resultingRoute: hybrid`, also render one local
lossless or visually-lossless block mezzanine after the normal source checks,
inspect its opening/closing and semantic hold frames, run FFprobe and a complete
decode, and write `block-media.json` conforming to
`../../references/runtime/frozen-block.schema.json`. The media and contract
remain inside this block directory. Set `noRealtimeNesting: true`, bind the
actual source identity and SHA-256, and do not call this intermediate a master.
For a single-runtime route, preserve the existing source handoff and do not
flatten it unnecessarily.

The notes explain major creative choices, recipe-to-runtime implementation
decisions, capability evidence, faithful implementation variances, material
integration, typography, time coverage, seam behavior, official Skill loads,
actual CLI work, and selected Shotcraft pattern traceability without copying
card bodies.

## Completion

Complete when every assigned shot exists as real source, exact time coverage is
preserved, selected material and fonts are used correctly, the block is
seekable, seams are intentional, official checks show no unresolved
block-owned error, every recipe has a traceable runtime implementation, and the
handoff points to the actual artifacts.

Hybrid completion additionally requires the frozen media file and contract to
pass the bundled frozen-block validator when checked with all planned blocks.

## Stop

Stop when the official HyperFrames Skill cannot be loaded, an assigned asset
or font is missing, timing is contradictory, the source cannot satisfy current
official rules, a recipe requires an unsupported capability, runtime evidence
is missing, a selected card, style, or pinned upstream Git commit cannot be
resolved, or the upstream creative decision is insufficient. Return the issue
to the owning stage. Do not create placeholder media or redesign another
stage's work.
