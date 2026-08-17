# Stage orchestration

## v1 ownership

| Work | Owner | Normal output |
| --- | --- | --- |
| Cached environment exception | Onboarding Agent, only when preflight requests it | `00-onboarding/` |
| Film meaning and visual direction | one Director Agent | `01-director/` |
| Runtime assignment and task packets | Parent runs `plan-runtime.mjs` | `01-runtime-plan/` |
| Shared material and fonts | one Assets Agent | `02-assets/` |
| Representative scenes and runtime-native visual source | existing Builder in Lead assignment mode | `04-visual-lock/<runtime>/` |
| Visual lock identity and user decision | Parent, original Director witness, then user | `04-visual-lock/visual-lock.json` |
| Editable authoring and frozen unit media | one focused Builder per task packet | `03-build/<unit>/` or `03-remotion-build/<unit>/` |
| Unit validation, ordered assembly, preview, identity, delivery | Parent runs `assemble-frozen-production.mjs` | `05-delivery/` |
| Shot files | request-only export path | `06-shot-export/` |

Do not dispatch Runtime Planner, Integrator, or Render Agents in a normal v1
production. Their stage Skills remain installed only so old runs and old
handoffs can still be read. The Parent may run deterministic scripts and
backend commands, but may not write creative source, select assets, or silently
repair a Builder's work.

## Create the plan and task packets

After Direction validates, generate the constrained profile first. Omit the
optional dimensions and fps only when the user accepted the 4K/30 default:

```text
node scripts/create-production-profile.mjs \
  --output <broll-production/production-profile.json> \
  --width <width> \
  --height <height> \
  --fps <fps> \
  --audio <silent-or-preserve-source> \
  --master-format h264-mp4
```

Then run:

```text
node scripts/plan-runtime.mjs \
  --recipes <broll-production/01-director/shot-recipes> \
  --selection <runtime-selection.json> \
  --narrative-envelope <broll-production/01-director/narrative-envelope.json> \
  --visual-system <broll-production/01-director/visual-system.json> \
  --representative-scenes <broll-production/01-director/representative-scenes.json> \
  --production-profile <broll-production/production-profile.json> \
  --production-root <broll-production>
```

The command atomically writes schema-3 `01-runtime-plan/runtime-plan.json`, one
schema-2 Lead packet per required backend, and schema-2 production packets under
`01-runtime-plan/assignments/`. Omitting `--representative-scenes` is a legacy
v2 compatibility path, not a normal v1 production. If that
directory exists, stop and use a new production root. The plan and every task
packet carry the same profile identity. Never edit the profile, plan, or a task
packet by hand.

Each packet contains only its role/phase, unit/block/runtime, assigned shots,
window, owning Builder
Skill, exact input locators, immediate seams, one output directory, shared asset
and dependency policy, and editable-source plus frozen-media contract. Do not
attach the parent transcript, all Recipes, full catalogs, unrelated references,
other units' source, or long command logs.

The planner groups short semantic shots independently from shot direction. For
an ordinary single-backend film around 180 seconds, target 2–3 production
Builders, commonly 5–8 adjacent short shots per unit. These are targets, not
quotas: backend changes, complex 3D/camera/material work, exclusive state, or a
real live-transition boundary may require another unit. A declared
`authoring.continuityGroup` stays inside one unit. Never cross a backend or
non-contiguous time, split a shot, or destroy a live transition to hit the
target.

Before dispatching any packet, gate it rather than interpreting its JSON by
hand:

```text
node scripts/gate-builder-assignment.mjs \
  --plan <01-runtime-plan/runtime-plan.json> \
  --assignment <01-runtime-plan/assignments/packet.json> \
  --production-root <broll-production> \
  [--visual-lock <04-visual-lock/visual-lock.json>]
```

A Lead packet passes before a lock exists. Every production packet fails closed
until the supplied lock validates with status `approved` or `skipped`.

## Lead scenes and visual lock

Assets closes the complete shared material/font store once, before Lead work.
For every backend in the plan, dispatch only its `role: lead`,
`phase: visual-lock` packet. Across those packets the three assigned Recipes are
exactly the Director's `opening`, `information-dense`, and `late`
representatives. The Lead receives no unrelated Recipes or parent history.

Each Lead returns real moving scene media and directly importable shared source
under `04-visual-lock/<runtime>/`. The shared source implements the frozen font
loading/type hierarchy, palette, grid, safe areas, spacing, background/material/
depth baseline, common content relationships, and motion tokens. It is not a
complete-film template. In hybrid, each backend has its own source and source
identity; only runtime-neutral Director tokens are shared.

Reactivate the original Director with only the representative media and bound
locators. Its witness names `shotId`, observable problem, and repair target for
content correspondence, first-read comprehension, copy readability, motion
result, and whole-film applicability. The Parent binds that witness, moving
media, shared source identities, assets/fonts, representative reasons, and the
user decision in `04-visual-lock/visual-lock.json`. Validate it before fan-out:

```text
node scripts/validate-visual-lock.mjs \
  <04-visual-lock/visual-lock.json> \
  <01-runtime-plan/runtime-plan.json> \
  <broll-production>
```

The user may approve, request bounded repair, or explicitly skip. A skip must
bind its risk and identity. Any bound media, source, asset, font, or witness
drift invalidates the lock. After validation, gate and dispatch each production
packet with the lock.

## Shared files, not copies

Assets writes one `02-assets/` tree. Builders read files from that tree and
record hashes; they do not duplicate the complete library inside each unit.
Copy a file into runtime-local public storage only when that runtime requires
it, and copy only the files that unit actually uses.

Remotion source directories stay isolated. Identical exact dependency closures
reuse one immutable `.remotion-toolchains/<identity>/` install through each
unit's `node_modules` link. Every install, typecheck, browser trace, diagnostic,
and unit render uses the fixed two-slot queue. HyperFrames uses the one pinned
installed runtime rather than private unit installations.

## Builder delivery contract

Every Builder returns both editable runtime-native source with its compact
receipt, and one continuous verified unit video with `block-media.json` in the
plan's common profile. For runtime-plan v2 the frozen-media validator matches
contracts to `authoringUnits`, so multiple unit contracts may name the same
backend block. Exact block ID, runtime, window, and shot list must still match.

Unit media must pass FFprobe, full decode, opening/closing state checks, hash
binding, duration tolerance, raster/fps/pixel/color closure, and audio policy
before assembly. Frozen media is an assembly boundary, not the editable
product; keep source and its identity beside the unit.

A live shared-element, continuous camera, or cross-boundary effect cannot be
reconstructed after independent unit renders. Keep all shots needed by that
live effect inside one unit. Otherwise use the Director's prepared readable end
state and matched seam. Do not describe a cut or matched seam as a continuous
live transition.

## Assemble and deliver

After every planned unit passes, run:

```text
node scripts/assemble-frozen-production.mjs preview \
  --plan <01-runtime-plan/runtime-plan.json> \
  --narrative-envelope <01-director/narrative-envelope.json> \
  --visual-system <01-director/visual-system.json> \
  --representative-scenes <01-director/representative-scenes.json> \
  --visual-lock <04-visual-lock/visual-lock.json> \
  --contract <unit-1/block-media.json> \
  --contract <unit-2/block-media.json> \
  --output <05-delivery/preview.mp4> \
  --identity <05-delivery/composition-identity.json>
```

For runtime plan v3, the script first revalidates the visual lock and requires
every unit contract to bind its exact lock and backend shared-source identities.
It then orders contracts from the plan, validates their files and hashes,
creates a bounded 1080p-or-smaller H.264 review copy with a fast preset, runs
FFprobe and a complete decode, and binds the plan plus ordered contract/media
hashes and preview bytes to one identity. It does not execute either animation
runtime, translate source, nest runtimes, inspect aesthetics, or create another
preview.

The user approves or rejects that moving preview. Rejection returns concrete
shots to their original Builder or film meaning to the original Director. Keep
unaffected units. After approval run:

```text
node scripts/assemble-frozen-production.mjs deliver \
  --plan <01-runtime-plan/runtime-plan.json> \
  --narrative-envelope <01-director/narrative-envelope.json> \
  --visual-system <01-director/visual-system.json> \
  --representative-scenes <01-director/representative-scenes.json> \
  --visual-lock <04-visual-lock/visual-lock.json> \
  --contract <unit-1/block-media.json> \
  --contract <unit-2/block-media.json> \
  --identity <05-delivery/composition-identity.json> \
  --preview <05-delivery/preview.mp4> \
  --output <unused-master.mp4>
```

Delivery re-hashes the approved preview, revalidates the same visual lock,
backend shared sources, plan, contracts, and frozen unit media, then assembles
one full-raster H.264 master from those
unchanged units and fully decodes it. It performs no second creative pass,
installation, runtime integration, or Agent work.

This assembler supports H.264 MP4 delivery. Treat an explicit request for a
different master codec or container as unsupported until a deterministic
profile is implemented; do not silently substitute formats.

## Bounded Director witnesses

The early visual-lock witness is defined above. Before the user sees the complete
preview, reactivate the original Director once more. Pass
only the low-cost complete preview, SRT, shared plans, and Recipe locators. The
Director returns a compact `shotId` problem list for content mismatch,
unexplained visual burden, long spans without meaningful development, unreadable
copy, or whole-film inconsistency. It does not score aesthetics, propose a new
visual system, repeat deterministic beat/lint checks, or create another approval
stop. Route each concrete problem to its original owner, preserve unaffected
units, and regenerate the identity-bound preview after repairs.

Do not dispatch a new Reviewer Agent. If the host cannot inspect moving video,
record that limitation and do not claim this witness passed. The user decides
the early visual direction from representative scenes and the final aesthetic
result from the complete preview; technical checks cannot make either decision.

## Revisions and blockers

Send one compact defect receipt to the original owner: film meaning, timing,
direction, or unit grouping to Director; material, provenance, fusion, or fonts
to Assets; source, beat implementation, unit media, seams, checks, or hashes to
that unit's Builder; environment dependency to Onboarding only when preflight
requests it; invalid plan input to Director or runtime selection.

Do not reroute a failed unit, change SRT time, substitute placeholder media,
overwrite evidence, or open a new full-history revision Agent. Stop only for a
real missing input, authorization, capability, irreconcilable constraint, or
the same blocker recurring without progress.
