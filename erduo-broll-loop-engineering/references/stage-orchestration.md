# Stage orchestration

## Ownership

| Stage | Fresh owner | Normal working area | Parent review |
| --- | --- | --- | --- |
| Environment | Onboarding Agent | `broll-production/00-onboarding/` | handoff and relevant official environment facts |
| Direction | Director Agent | `broll-production/01-director/` | handoff and relevant plans |
| Runtime plan | Runtime Planner Agent | `broll-production/01-runtime-plan/` | generated plan, identity, warnings, and validator result |
| Material | Assets and Pexels Agent | `broll-production/02-assets/` | handoff, search record, inventory, and material plan |
| HyperFrames blocks | one `broll-master-build` Agent per contiguous block | `broll-production/03-build/<block-id>/` | handoff, notes, and source portions needed for a stated question |
| Remotion blocks | one `broll-remotion-build` Agent per contiguous block | `broll-production/03-remotion-build/<block-id>/` | handoff, manifest, native source evidence, and bounded QA |
| HyperFrames assembly | `broll-master-integrate` Agent | `broll-production/04-integrate/` | handoff, integration notes, official check, and relevant project portions |
| Remotion assembly | `broll-remotion-integrate` Agent | `broll-production/04-remotion-integrate/` | handoff, registered Composition, identity, preview, and media facts |
| Hybrid assembly | `broll-hybrid-integrate` Agent | `broll-production/04-hybrid-integrate/` | frozen contracts/media hashes, seam evidence, preview, and identity |
| HyperFrames master | `broll-render` Agent | `broll-production/05-delivery/` | handoff, preflight, preview approval, final arguments, and media facts |
| Remotion master | `broll-remotion-render` Agent | `broll-production/05-remotion-delivery/` | handoff, local CLI preflight, preview approval, final arguments, and media facts |
| Hybrid master | `broll-hybrid-render` Agent | `broll-production/05-hybrid-delivery/` | unchanged frozen identity, approval, FFmpeg assembly, and media facts |
| Shot files | Shot Export Agent, only on request | `broll-production/06-shot-export/` | handoff, export index, and media facts |

Every production action belongs to its stage Agent. The Parent does not create
working areas, modify artifacts, search for media, install dependencies, or run
media and HyperFrames commands.

## Dispatch fresh agents

Give each child:

- its exact stage Skill;
- one stage responsibility;
- production-root and input-artifact locators;
- the user goal and constraints relevant to that stage;
- the selection intent, validated runtime-plan identity, exact block/runtime
  assignment, capability evidence, and relevant contract/Recipe locators;
- the validated runtime-selection artifact and its evidence bindings;
- for Director, Assets, and Builder, the bundled Shotcraft query command and
  only the selected card/style locators needed by that stage; never the full
  catalog or all card bodies;
- the unique new output directory, default `master.mp4` H.264 MP4 at
  3840×2160, 30 fps, high quality, or the user's explicit alternative;
- the shared Markdown handoff format;
- a clear prohibition against doing another stage's work.

Do not combine roles in one child or continue a blocked stage in the Parent.
When review finds several issues owned by one stage, combine them into one
revision request and re-dispatch that role as a fresh Agent. Keep unaffected
Builder blocks when one block needs revision.

Record runtime intent before Onboarding with the bundled detector. New projects
default to `auto`; explicit choices win; ambiguous existing evidence still
stops. Auto/hybrid run base Onboarding, runtime-neutral Director, deterministic
Runtime Planner, then targeted Onboarding for exactly the required backends.
Assets remains shared. Dispatch each planned block to its assigned Builder.
Single routes keep native Integrator/Render; hybrid uses frozen block media and
the dedicated runtime-neutral Integrator/Render. Never silently switch after a
failure.

## Onboarding

Dispatch Onboarding when:

- this is the first run;
- the project moved to another machine or user profile;
- Node, HyperFrames, Skills, FFmpeg, FFprobe, Chrome, permissions, storage, or
  Pexels status may have changed;
- no current ready handoff exists for this production and delivery path.
- the production-run identity, host, command `PATH`, onboarding phase,
  selection/runtime-plan identity, any required backend CLI version, target
  delivery filesystem, runtime-capability evidence, or Pexels validation
  state changed.

First dispatch a fresh inspection-only Onboarding Agent. It must not modify the
machine or configuration. The Parent asks the user for one grouped
authorization based on that inspection, then dispatches a different fresh
repair Agent. The repair Agent performs only approved work and repeats the full
inspection.

The release installer owns initial registration. Onboarding verifies that the
root Skill and all thirteen stage Skills are discoverable; it does not create
their host registration.

Onboarding may parse only the final SRT cue end milliseconds for
delivery-space estimation. It does not group cues or make film decisions.

Do not let onboarding replace the Render Agent's same-environment official
doctor run.

## Plan and partition Builders

Use only the deterministic Runtime Planner's bounded contiguous blocks. It
decides per shot from capability/pattern evidence, then merges adjacent
same-backend shots. Do not split a shot, hand-adjust a backend, or add runtime
switches for variety. A short film may have one block.

Pass only each block's validated runtime-neutral Shot Recipes, plus the
runtime plan's exact block assignment, capability/pattern evidence, and
selected Shotcraft cards. Builders
resolve and read only a Recipe's one primary card/style, then record a
one-to-one mapping from each recipe to its runtime-owned implementation and
pattern reference. Do not let the Director embed runtime code, let a Builder
silently weaken semantic results for runtime convenience, or treat an
unselected card as authorization to change the shot. This release does not
claim automatic source translation or a library of preverified components.
Manifest-pinned Shotcraft TSX is auditable reference source only, never an
installed component or an in-place production import.

## Official HyperFrames loading

Before any Builder reads or writes HyperFrames source, require a real load of
the release-pinned official `hyperframes` Skill through the host's native Skill
mechanism. Require the Integrator to perform the same load before assembly and
Render/Delivery before doctor, check, preview, or render.

A handoff statement or command alone does not prove the Skill load. Retain the
minimum host-native trace reference needed to verify each fresh child and
required official Skill load. If the host exposes no inspectable trace, state
that evidence limitation rather than inventing proof.

Before any non-Pexels child process, use the host's native spawn/process API to
copy the required environment into an explicit child map, remove every key whose
ASCII case-folded name equals `PEXELS_API_KEY`, resolve case-insensitive key
collisions, and set `HYPERFRAMES_NO_TELEMETRY=1` by default. Pass that map
directly to the target executable without a shell. This applies to Node, npx,
HyperFrames CLI and browser descendants, package managers, FFmpeg, FFprobe,
doctor, check, update, preview, and render. A telemetry opt-in may change only
the telemetry value; Pexels-key removal remains mandatory.

Do not use a POSIX-only inline assignment or `env -u` as the contract. If the
host cannot inject or attest a demonstrably sanitized environment map, use the
parent Skill's bundled `scripts/safe-spawn.mjs` as the only approved bounded
no-log, no-shell bootstrap. If neither route is available, stop before spawn as
`action-required`. Only a dedicated Pexels request may receive the credential,
in the smallest available scope. Handoffs record only the environment-map
capability, `pexels_key_removed_case_insensitively=true`, and the telemetry
setting, never environment values. These settings neither prove Skill loading
nor replace command and result review.

Official Skills check and update access the official GitHub Skill source. This
network access must be declared; update still requires repair authorization.

## Native Remotion execution

For a selected Remotion route, every Builder, the Integrator, and
Render/Delivery use only the exact project-local CLI proven by Onboarding.
They must record matching `remotion` and `@remotion/cli` versions, the
millisecond-to-frame rounding policy, registered Composition ID, source entry,
and actual check/still/render evidence. Run the executable directly without a
shell through the same sanitized child environment contract. Do not invoke
HyperFrames Skills, doctor, check, preview, or render as evidence for this
route.

The Remotion Builder authors native deterministic React/TSX from the assigned
runtime-neutral Recipes and selected card semantics. The Integrator registers
one ordered Composition and proves continuous frame coverage. Render/Delivery
uses a real project-local still or Studio artifact for the approval pause,
then renders an unused target and verifies it with FFprobe and complete decode.
These stages may adapt a selected card's manifest-pinned reference TSX into
the production project with the required Apache-2.0 attribution. They must not
execute or import it in place, claim it is a ready component, or invent media,
fonts, sounds, textures, or dependencies that the reference set excludes.

## Pass artifacts and review evidence

Pass file and directory locators between children. A downstream child may read
the upstream artifacts its role needs.

The Parent begins with the concise handoff, then reads only the actual plans,
inventories, notes, source portions, integration results, technical facts, or
host evidence needed to verify a stated review question. Bounded read-only
inspection must not become another production stage.

## Revisions and blockers

Return issues to the owning stage:

- environment and authorization to Onboarding;
- film meaning, timing, visual direction, and material intent to Director;
- runtime-neutral Recipe meaning and schema gaps to Director;
- Shotcraft selection, semantic reason, style key, pinned upstream Git commit,
  or fallback gaps to Director;
- material, Pexels, download, provenance, crop, and font issues to Assets;
- block source and block-owned visual implementation to its Builder;
- selected-card native implementation and card-quality variances to its
  Builder;
- runtime implementation decisions and unsupported capabilities to its Builder,
  or to Onboarding when required adapter evidence is missing;
- wrapper, resource conflicts, order, and integration-owned seams to
  Integrator;
- formal environment, output arguments, render, and media verification to
  Render/Delivery;
- slice timing and exported-file verification to Shot Export.

Continue review and revision while the owning stage is making meaningful
progress. Stop for a missing authorization, unsupported host capability,
irreconcilable constraint, or the same blocker recurring without progress.

Formal render requires explicit approval of the official final composition
preview. Unattended production ends at that pause. The preview-pass Render
Agent stops with an `action-required` handoff. After approval, dispatch a
different fresh Render Agent; it verifies approval against the unchanged
composition and repeats preflight and check before rendering.

A failed render attempt belongs to the current Render/Delivery Agent. Preserve
its evidence and partial target, then dispatch a different fresh Agent using a
new unused attempt target. Exactly one successfully verified final master is
delivered; attempt count is not artificially limited.

Never hide a failure by substituting placeholder media, changing SRT time,
creating an alternate renderer, overwriting a target, or describing a partial
output as the master.
