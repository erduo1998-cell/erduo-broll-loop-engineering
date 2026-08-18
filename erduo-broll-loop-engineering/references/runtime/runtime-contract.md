# Runtime-neutral shot, planning, and frozen-media contract

## Production boundary

- New projects default to HyperFrames. Remotion is explicit opt-in or canary;
  `auto` and `hybrid` are experimental explicit routes in v1.0.1.
- Director finishes runtime-neutral Recipes before deterministic backend
  planning.
- Explicit/detected HyperFrames or Remotion forces the whole film and remains
  compatible with existing single-backend runs.
- Explicit experimental auto may result in HyperFrames, Remotion, or hybrid.
  Explicit hybrid permits both but never forces an evidence-free split.
- Legacy hybrid means backend-native block construction followed by frozen-media
  exchange. Never translate generated source, import one runtime into the
  other, or nest live previews/renderers.
- Remotion selection/planning is not readiness. Require exact matching local
  `remotion` and `@remotion/cli` plus real project-local CLI evidence.
- Do not claim visual, timing, or render parity. Each backend proves its own
  implementation; hybrid proves only the frozen-media seam and delivery path.
- Grandfathered schema-1 single-runtime runs continue unchanged and are not
  retroactively routed.

## Shared direction and runtime-neutral Recipe v2

Director writes the whole-film context once in `narrative-envelope.json` and
the visual world once in `visual-system.json`. The latter owns palette and
typography roles, material/depth logic, composition families, motif semantics,
rhythm, safe areas, and global prohibitions.

The canonical compact Recipe v2 contains only the shot delta: communication
goal/focus, composition family, hero-frame relationship, visible
`microBeats[]`, shot-specific material need, optional craft/pattern locators,
neighbor handoff, and readability hold. Do not repeat shared system rules. It
contains no React/TSX/hooks/frames, HyperFrames markup/selectors/CLI, runtime
paths, dependency versions, or copied implementation source. Schema-1 runs
remain readable and are not retroactively migrated.

Use parsed SRT integer milliseconds as the sole time truth. Shot windows are
`[startMs,endMs)`. Phases and readability windows remain absolute integers
inside their shot. Runtime adapters record their deterministic frame/tick
rounding outside the Recipe.

`requiredCapabilities` must name the most specific observable needs registered
in `capability-matrix.json`. Director does not add capabilities merely to steer
a backend. Unknown and unsupported IDs stop before planning/build.

## Shotcraft evidence

One Recipe may contain zero or one `patternRef`: stable card ID, exact style,
pinned upstream commit, semantic reason, and runtime-neutral fallback. Catalog
knowledge is progressively queried. Never bulk-load it.

The pinned Remotion source index is exact backend-native source evidence for a
selected card. It is not a registered component, dependency closure, render
witness, or cross-runtime comparison. The deterministic planning script may
use it as lower priority Remotion preference evidence and must surface
`reference-source-unverified`. A Builder reads only the selected card/source
closure and replaces every demo asset with Assets-stage material.

## Deterministic backend planning

After Recipe validation, the Parent runs `scripts/plan-runtime.mjs` with
`--recipes`, `--selection`, `--narrative-envelope`, `--visual-system`, and an
unused `--production-root`. A normal v1 call also supplies the validated
`--representative-scenes` artifact; omitting it retains the legacy v2 planning
path. Before that call, it runs
`scripts/create-production-profile.mjs` with the user's width, height, fps,
audio, and supported output-format constraints, then passes the generated file
through `--production-profile`. With no explicit constraints the generator
locks 3840×2160, 30 fps, silent H.264 MP4. The script validates inputs and
atomically writes the hash-bound profile into the plan plus every minimal
Builder assignment. Do not dispatch a Runtime Planner Agent or hand-author its
JSON.

Evidence order is deterministic:

1. explicit/existing-project forced single backend, subject to native conflicts;
2. native-only capability classification;
3. strongest capability preference from the matrix;
4. exact selected-pattern backend reference evidence;
5. matrix portable default.

No semantic keyword, directory name, agent taste, or signal count participates.
Equal-priority backend conflicts stop. Decisions are made per shot, then
adjacent same-backend shots merge into contiguous blocks. Inside each block,
the planner creates ordered whole-shot `authoringUnits` independently from shot
duration. Ordinary short-shot units commonly contain 5–8 adjacent shots; for an
ordinary single-backend film around 180 seconds, target 2–3 production Builders.
These are deterministic targets, not hard caps. Runtime changes, complex 3D or
material work, exclusive state, and declared `authoring.continuityGroup`
boundaries override them. The planner never crosses backends or non-contiguous
time, splits a shot, or breaks a live transition merely to hit a count.
Every plan records evidence, unverified
preferences, warnings, blocks, authoring units, required backends, integration
mode, and a canonical identity.

## Backend obligations

Every Builder must validate its role/phase assignment, Recipes, and plan
identity; read only those Recipes, adjacent seam summaries, shared-system locators,
frozen assets/fonts, and 0–2 selected references; preserve semantic intent and
exact windows, resolve capabilities, use local materials
and fonts, produce deterministic seekable source, and record runtime/version,
time conversion, source identity, pattern/fallback decisions, and honest
variance. It never reroutes after failure.

For every v1 production assignment, each Builder also freezes exactly one local lossless or
visually-lossless mezzanine for its assigned authoring unit and writes a
schema-valid `block-media.json`. Editable runtime-native source remains beside
the unit; frozen media is the deterministic assembly boundary, not a
replacement for source. A live effect that must cross a boundary belongs in
one authoring unit; otherwise use the declared readable seam.

Before production fan-out, each required backend uses one existing Builder in
Lead mode to create its assigned representative moving scenes and importable
runtime-native visual source. Hybrid shares runtime-neutral visual tokens, not
source. `04-visual-lock/visual-lock.json` binds those scenes, source identities,
assets/fonts, the original Director's concrete witness, and the user's
`approved` or explicit `skipped` decision. A deterministic assignment gate
rejects production packets before that contract validates.

The contract binds:

- block/runtime/shot/window identity;
- uniform raster, fps rational, pixel format, color space, mezzanine class,
  and audio policy;
- relative local media path and actual SHA-256;
- objective container/codec/duration/frame/audio facts;
- backend source identity for the owning authoring unit;
- for runtime plan v3, the validated visual-lock identity and the owning
  backend's runtime-native shared-source identity;
- FFprobe and full decode;
- `noRealtimeNesting: true`.

`scripts/validate-frozen-blocks.mjs` checks actual media hashes, profile/audio
closure, plan closure, v3 visual-lock/shared-source identity, and duration within one frame. A bad unit returns to its
owning Builder; assembly never transcodes a defect into compliance.

## Scripted assembly, approval, and delivery

After every planned unit passes, the Parent runs
`scripts/assemble-frozen-production.mjs preview` with the plan, narrative
envelope, visual system, representative scenes, visual lock, every unit contract, a new preview path, and a new
identity path. The script resolves contracts against the plan and assembles in
plan order; CLI contract arguments may be supplied in any order. Missing,
duplicate, unplanned, or changed contracts fail closed.

The preview identity binds the plan, shared artifacts, plan-ordered contract
hashes, frozen media hashes, v3 visual-lock identity, profile/audio policy, and preview bytes. User
approval binds that exact identity. After approval, the Parent runs
`scripts/assemble-frozen-production.mjs deliver` with the same evidence. It
revalidates the visual lock, shared-source identities, and everything else,
then encodes a new full-spec master from frozen unit
media. It never copies the preview, opens an animation runtime, or dispatches
an Integrator or Render Agent.

## Evidence gates

Keep these claims separate:

1. **Intent:** initial selector records auto/hybrid/forced-single intent.
2. **Plan:** deterministic Parent script assigns shots, blocks, and Builder packets.
3. **Readiness:** targeted dependencies, CLI, browser, media tools, permissions,
   licensing, and paths pass for exactly the required backends.
4. **Backend:** each assigned runtime owns deterministic source; Remotion
   installs once per dependency identity and retains unit-specific
   typecheck/geometry receipts.
5. **Frozen unit:** every Builder unit's schema, actual hash, probe/decode, and
   boundary evidence pass.
6. **Assembly:** plan-ordered frozen-media assembly closes one final moving preview.
7. **Approval:** the user approves the unchanged integration identity.
8. **Delivery:** final master passes FFprobe, full decode, duration/audio, and hash.
9. **Comparison:** only an explicit separate study may claim cross-runtime
   differences or parity.
