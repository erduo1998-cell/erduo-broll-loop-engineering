---
name: broll-remotion-build
description: Build one runtime-plan-assigned contiguous block as deterministic Remotion React/TSX, with frozen block media when the overall route is hybrid.
---

# B-roll Remotion Block Builder

Act only as the Builder for one assigned contiguous block. Do not change the
runtime decision, rewrite Direction, collect assets, integrate other blocks,
render the formal master, or export shots.

## Backend contract

Read:

- `../../references/remotion-backend.md`;
- `../../references/runtime/runtime-contract.md`;
- `../../references/runtime/capability-matrix.json`;
- `../../references/runtime/remotion-project.schema.json`.

Require a validated runtime-plan block assigned wholly to Remotion and a
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

- block ID and one contiguous integer-millisecond range;
- Director film plan, assigned validated Shot Recipes, runtime-plan identity, and exact block assignment;
- frozen Assets-stage media, fonts, provenance, and licenses;
- neighboring seam summaries, output profile, and audio policy;
- ready Remotion Onboarding, local-CLI canary, and licensing evidence.

Reject missing inputs, overlapping or zero-length Recipes, an unlisted or
unsupported Remotion capability, an unfrozen material, or a mixed-runtime
handoff. Run the parent `scripts/validate-shot-recipes.mjs` on the assigned
Recipe directory before authoring.

## Resolve selected pattern knowledge

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

If no usable reference source exists, implement the Recipe's declared
runtime-neutral fallback from first principles. Record `fallback` and its
reason in the project manifest. Do not invent a missing demo, create
placeholder media, or drop the shot.

## Author a runnable block

Write only under:

`broll-production/03-remotion-build/<block-id>/`

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

All visible motion must be reconstructed from `useCurrentFrame`,
`interpolate`, `spring`, `Sequence`, deterministic closed-form math, or a
fixed-seed helper. Do not use CSS time animation, ambient state/effects,
timers, network access during render, `Date`, `Math.random`, or unseeded
randomness. Verify arbitrary seek frames, not just forward playback.

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

- `build-notes.md` with Recipe-to-source decisions, pattern provenance,
  license decisions, frame mapping, material bindings, dependencies, and
  faithful variances;
- bounded command/version, typecheck, still, and preview evidence;
- `handoff.md` naming the exact Composition ID, project manifest, coverage,
  files, QA outputs, seams, and unresolved risks.

When the runtime plan results in `hybrid`, formally freeze this block after its
normal QA preview as one lossless or visually-lossless local mezzanine and
write `block-media.json` conforming to
`../../references/runtime/frozen-block.schema.json`. Bind the exact project
identity, actual media SHA-256, profile, integer-millisecond window, frame
facts, FFprobe, full decode, opening/closing inspection, and
`noRealtimeNesting: true`. This is a Builder-owned intermediate, never the
approved master. For a single Remotion route, retain the existing source
handoff to the Remotion Integrator.

## Completion and stop

Complete only when every assigned Recipe has deterministic runnable TSX,
continuous millisecond and frame coverage, real local materials, traceable
pattern/fallback decisions, a verifier pass, a clean typecheck, inspected
stills, and a successful real block preview render.

Hybrid completion additionally requires the frozen media and contract needed
by the runtime-neutral Hybrid Integrator.

Stop and return ownership when timing is contradictory, a required asset or
font is missing, the license is unconfirmed, a capability is unavailable, a
selected source revision cannot be verified, exact local dependencies cannot
be installed, browser execution fails, verifier/typecheck remains red, or a
real still/render cannot be produced. Do not weaken the Recipe or switch to
HyperFrames as a workaround.
