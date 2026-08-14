# Stage orchestration

## v0.9 ownership

| Work | Owner | Normal output |
| --- | --- | --- |
| Cached environment exception | Onboarding Agent, only when preflight requests it | `00-onboarding/` |
| Film meaning and visual direction | one Director Agent | `01-director/` |
| Runtime assignment and task packets | Parent runs `plan-runtime.mjs` | `01-runtime-plan/` |
| Shared material and fonts | one Assets Agent | `02-assets/` |
| Editable authoring and frozen unit media | one focused Builder per task packet | `03-build/<unit>/` or `03-remotion-build/<unit>/` |
| Unit validation, ordered assembly, preview, identity, delivery | Parent runs `assemble-frozen-production.mjs` | `05-delivery/` |
| Shot files | request-only export path | `06-shot-export/` |

Do not dispatch Runtime Planner, Integrator, or Render Agents in a normal v0.9
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
  --production-profile <broll-production/production-profile.json> \
  --production-root <broll-production>
```

The command atomically writes `01-runtime-plan/runtime-plan.json` and one
`01-runtime-plan/assignments/<unit-id>.json` per planned authoring unit. If that
directory exists, stop and use a new production root. The plan and every task
packet carry the same profile identity. Never edit the profile, plan, or a task
packet by hand.

Each packet contains only its unit/block/runtime, shots, window, owning Builder
Skill, exact input locators, immediate seams, one output directory, shared asset
and dependency policy, and editable-source plus frozen-media contract. Do not
attach the parent transcript, all Recipes, full catalogs, unrelated references,
other units' source, or long command logs.

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
  --contract <unit-1/block-media.json> \
  --contract <unit-2/block-media.json> \
  --output <05-delivery/preview.mp4> \
  --identity <05-delivery/composition-identity.json>
```

The script orders contracts from the plan, validates their files and hashes,
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
  --contract <unit-1/block-media.json> \
  --contract <unit-2/block-media.json> \
  --identity <05-delivery/composition-identity.json> \
  --preview <05-delivery/preview.mp4> \
  --output <unused-master.mp4>
```

Delivery re-hashes the approved preview, revalidates the same plan, contracts,
and frozen unit media, then assembles one full-raster H.264 master from those
unchanged units and fully decodes it. It performs no second creative pass,
installation, runtime integration, or Agent work.

This assembler supports H.264 MP4 delivery. Treat an explicit request for a
different master codec or container as unsupported until a deterministic
profile is implemented; do not silently substitute formats.

## One bounded visual witness

Before the user sees the preview, reactivate the original Director once. Pass
only the low-cost complete preview, SRT, shared plans, and Recipe locators. The
Director returns a compact `shotId` problem list for content mismatch,
unexplained visual burden, long spans without meaningful development, unreadable
copy, or whole-film inconsistency. It does not score aesthetics, propose a new
visual system, repeat deterministic beat/lint checks, or create another approval
stop. Route each concrete problem to its original owner, preserve unaffected
units, and regenerate the identity-bound preview after repairs.

Do not dispatch a new Reviewer Agent. If the host cannot inspect moving video,
record that limitation and do not claim this witness passed. The user still sees
only the final complete preview and remains the only aesthetic decision maker.

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
