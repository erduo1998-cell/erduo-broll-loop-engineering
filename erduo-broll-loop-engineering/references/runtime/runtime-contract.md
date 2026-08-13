# Runtime-neutral shot, planning, and frozen-media contract

## Production boundary

- New projects default to runtime intent `auto`, not an animation backend.
- Director finishes runtime-neutral Recipes before deterministic backend
  planning.
- Explicit/detected HyperFrames or Remotion forces the whole film and remains
  compatible with existing single-backend runs.
- Auto may result in HyperFrames, Remotion, or hybrid. Explicit hybrid permits
  both but never forces an evidence-free split.
- Hybrid means backend-native block construction followed by frozen-media
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
witness, or cross-runtime comparison. Runtime Planner may use it as lower
priority Remotion preference evidence and must surface
`reference-source-unverified`. A Builder reads only the selected card/source
closure and replaces every demo asset with Assets-stage material.

## Deterministic backend planning

After Recipe validation, run `scripts/plan-runtime.mjs` and then
`scripts/validate-runtime-plan.mjs`. Do not hand-author its JSON.

Evidence order is deterministic:

1. explicit/existing-project forced single backend, subject to native conflicts;
2. native-only capability classification;
3. strongest capability preference from the matrix;
4. exact selected-pattern backend reference evidence;
5. matrix portable default.

No semantic keyword, directory name, agent taste, or signal count participates.
Equal-priority backend conflicts stop. Decisions are made per shot, then
adjacent same-backend shots merge into contiguous blocks. Inside each block,
the planner creates ordered whole-shot `authoringUnits` that default to 1–3
shots and have an absolute maximum of 40 seconds. A hero, complex asset-fusion,
or complex camera shot may be one unit only when that shot is at most 40
seconds. Planner rejects an overlong shot and returns it to Director for a
semantic split; it never crosses a shot over units or accepts a solo exception.
Every plan records evidence, unverified
preferences, warnings, blocks, authoring units, required backends, integration
mode, and a canonical identity.

## Backend obligations

Every Builder must validate its assigned authoring unit, Recipes, and plan
identity; read only that unit, adjacent seam summaries, shared-system locators,
frozen assets/fonts, and 0–2 selected references; preserve semantic intent and
exact windows, resolve capabilities, use local materials
and fonts, produce deterministic seekable source, and record runtime/version,
time conversion, source identity, pattern/fallback decisions, and honest
variance. It never reroutes after failure.

For a single-backend plan, retain source through that backend's Integrator and
Render. Do not flatten merely because media export is possible.

For a hybrid plan, each Builder additionally freezes exactly one local
lossless or visually-lossless mezzanine for its planned block and writes a
schema-valid `block-media.json`. The contract binds:

When the block contains one authoring unit, its Builder may freeze it directly.
When it contains multiple units, all unit receipts must first pass; then one
fresh same-backend Builder runs a deterministic `block-freeze` pass over only
those verified unit source exports/receipts and the block window. It may write
only temporary block-level composition/sequence glue, must hash the glue and
all mounted unit source into an aggregate identity, and must run the selected
backend's normal technical commands to render and verify the mezzanine. It
cannot change unit-internal creative, timing, shots, or source and cannot
perform aesthetic review; any source/hash drift, glue conflict, or render
defect returns to the implicated unit owner.
This preserves one frozen contract per backend block without adding a stage or
allowing the Hybrid Integrator to execute an animation backend.

- block/runtime/shot/window identity;
- uniform raster, fps rational, pixel format, color space, mezzanine class,
  and audio policy;
- relative local media path and actual SHA-256;
- objective container/codec/duration/frame/audio facts;
- backend source identity, including block-level glue and mounted unit-source
  hashes for a multi-unit freeze pass;
- FFprobe, full decode, opening/closing inspection;
- `noRealtimeNesting: true`.

`scripts/validate-frozen-blocks.mjs` checks actual media hashes, profile/audio
closure, plan closure, and duration within one frame. A bad block returns to
its owning Builder; Integrator never transcodes a defect into compliance.

## Hybrid integration and approval

The runtime-neutral Hybrid Integrator receives only the validated plan and
frozen block artifacts. It assembles in block order with direct sanitized
FFmpeg/FFprobe, inspects every seam and relevant hold, renders a technical
preview, and freezes an identity over plan, ordered contracts, media hashes,
profile/audio policy, and assembly recipe.

User approval binds that exact hybrid identity. A different fresh Hybrid
Render Agent recomputes every identity and contract before formal delivery.
Any source identity, media hash, contract, profile, audio, plan, or integration
change invalidates approval. Formal hybrid delivery consumes frozen media only;
it never opens either animation runtime.

## Evidence gates

Keep these claims separate:

1. **Intent:** initial selector records auto/hybrid/forced-single intent.
2. **Plan:** deterministic planner assigns shots and contiguous blocks.
3. **Readiness:** targeted dependencies, CLI, browser, media tools, permissions,
   licensing, and paths pass for exactly the required backends.
4. **Backend:** each assigned runtime owns deterministic source and block QA.
5. **Frozen block:** hybrid-only schema, actual hash, probe/decode, and visual
   boundary evidence pass.
6. **Integration:** single-source or frozen-media master preview closes.
7. **Approval:** the user approves the unchanged integration identity.
8. **Delivery:** final master passes FFprobe, full decode, duration/audio, hash,
   and representative frame/seam inspection.
9. **Comparison:** only an explicit separate study may claim cross-runtime
   differences or parity.
