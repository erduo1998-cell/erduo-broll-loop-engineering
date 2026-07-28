# Stage orchestration

## Ownership

| Stage | Fresh owner | Normal working area | Parent review |
| --- | --- | --- | --- |
| Environment | Onboarding Agent | `broll-production/00-onboarding/` | handoff and relevant official environment facts |
| Direction | Director Agent | `broll-production/01-director/` | handoff and relevant plans |
| Material | Assets and Pexels Agent | `broll-production/02-assets/` | handoff, search record, inventory, and material plan |
| Blocks | one Builder Agent per contiguous block | `broll-production/03-build/<block-id>/` | handoff, notes, and source portions needed for a stated question |
| Assembly | Integrator Agent | `broll-production/04-integrate/` | handoff, integration notes, official check, and relevant project portions |
| Master | Render and Delivery Agent | `broll-production/05-delivery/` | handoff, preflight, preview approval, final arguments, and media facts |
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
- the unique new output directory, default `master.mp4` H.264 MP4 at
  3840×2160, 30 fps, high quality, or the user's explicit alternative;
- the shared Markdown handoff format;
- a clear prohibition against doing another stage's work.

Do not combine roles in one child or continue a blocked stage in the Parent.
When review finds several issues owned by one stage, combine them into one
revision request and re-dispatch that role as a fresh Agent. Keep unaffected
Builder blocks when one block needs revision.

## Onboarding

Dispatch Onboarding when:

- this is the first run;
- the project moved to another machine or user profile;
- Node, HyperFrames, Skills, FFmpeg, FFprobe, Chrome, permissions, storage, or
  Pexels status may have changed;
- no current ready handoff exists for this production and delivery path.
- the production-run identity, host, command `PATH`, official HyperFrames CLI
  version, target delivery filesystem, or Pexels validation state changed.

First dispatch a fresh inspection-only Onboarding Agent. It must not modify the
machine or configuration. The Parent asks the user for one grouped
authorization based on that inspection, then dispatches a different fresh
repair Agent. The repair Agent performs only approved work and repeats the full
inspection.

The release installer owns initial registration. Onboarding verifies that the
root Skill and all seven stage Skills are discoverable; it does not create
their host registration.

Onboarding may parse only the final SRT cue end milliseconds for
delivery-space estimation. It does not group cues or make film decisions.

Do not let onboarding replace the Render Agent's same-environment official
doctor run.

## Partition Builders

Assign each Builder a bounded, contiguous semantic span. Place boundaries at
clean chapter or meaning handoffs. Do not split one semantic shot across
Builders, overlap windows, or reduce planned density merely to use fewer
agents. A short film may have one block.

## Official HyperFrames loading

Before any Builder reads or writes HyperFrames source, require a real load of
the current official `hyperframes` Skill through the host's native Skill
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
host cannot pass a demonstrably sanitized environment map, stop before spawn as
`action-required`. Only a dedicated Pexels request may receive the credential,
in the smallest available scope. Handoffs record only the environment-map
capability, `pexels_key_removed_case_insensitively=true`, and the telemetry
setting, never environment values. These settings neither prove Skill loading
nor replace command and result review.

Official Skills check and update access the official GitHub Skill source. This
network access must be declared; update still requires repair authorization.

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
- material, Pexels, download, provenance, crop, and font issues to Assets;
- block source and block-owned visual implementation to its Builder;
- wrapper, resource conflicts, order, and integration-owned seams to
  Integrator;
- formal environment, output arguments, render, and media verification to
  Render/Delivery;
- slice timing and exported-file verification to Shot Export.

Continue review and revision while the owning stage is making meaningful
progress. Stop for a missing authorization, unsupported host capability,
irreconcilable constraint, or the same blocker recurring without progress.

Formal render requires explicit approval of the official final composition
preview. Unattended production ends at that pause.

A failed render attempt belongs to the current Render/Delivery Agent. Preserve
its evidence and partial target, then dispatch a different fresh Agent using a
new unused attempt target. Exactly one successfully verified final master is
delivered; attempt count is not artificially limited.

Never hide a failure by substituting placeholder media, changing SRT time,
creating an alternate renderer, overwriting a target, or describing a partial
output as the master.
