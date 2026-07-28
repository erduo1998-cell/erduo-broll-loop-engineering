---
name: erduo-hyperframes-broll
description: Create editable, SRT-anchored B-roll through a Parent Producer and fresh isolated stage agents. Use for talking-head B-roll from an edited video plus SRT, or faceless B-roll from an SRT, with first-run environment onboarding, mandatory material collection, semantic HyperFrames building, one final master, technical delivery, and optional master-derived shot export.
---

# Erduo HyperFrames B-roll

Act only as the Parent Producer. Read:

- [prompt-first workflow](references/prompt-first-workflow.md)
- [stage orchestration](references/stage-orchestration.md)
- [parent review checklist](references/parent-review-checklist.md)
- [handoff format](references/handoff-template.md)
- [first-run onboarding](references/first-run-onboarding.md)

## Parent boundary

The Parent may clarify the production goal, dispatch fresh agents, read
Markdown handoffs, inspect bounded stage artifacts for a stated review
question, compare cross-stage facts, assign revisions to the owning stage, and
write the final user report.

The Parent must not create or modify production files, code, material, or
media; search or download material; install dependencies; run production
commands; render, decode, or export; or imitate a child role in the parent
context.

Stop when the host cannot create genuinely fresh isolated agents or cannot
perform a required official Skill load. Do not simulate isolation with role
labels.

## Establish the goal

- Require an SRT locator.
- For talking-head mode, also require the matching edited-video locator.
- Ask once whether the user has images, videos, logos, screenshots, or other
  ordinary material. These inputs are optional.
- Confirm the mode and explicit brand, content, audio, or privacy constraints.
- When the user does not specify a delivery location, choose one new
  timestamped directory beside the SRT. Use the SRT basename plus
  `-broll-YYYYMMDD-HHMMSS`, adding a unique suffix if needed.
- Default the delivery target inside that new directory to `master.mp4`,
  H.264 MP4, 3840×2160, 30 fps, and official high quality. Use another format,
  profile, or location only when the user explicitly requests it.
- Never overwrite an existing directory or target. If the requested target
  already exists, stop for a new target or create another uniquely named
  output directory with the user's approval.
- Do not request or depend on a `design.md`, visual-specification file, preset,
  or private example. The Director forms an original visual direction from the
  current SRT, goal, and optional material.

## Run onboarding when needed

On the first run, after migration, or whenever the current environment has no
fresh `ready` evidence, dispatch a fresh `broll-onboarding` Agent in
inspection-only mode before production.

Fresh ready evidence must belong to the same production run and bind the same
host, command `PATH`, official HyperFrames CLI version, target delivery
filesystem, and Pexels validation state. Any change requires a new
inspection-only Onboarding Agent.

The onboarding Agent coordinates environment and authorization only. It must
use the current official HyperFrames Skill and CLI guidance, actually run the
official HyperFrames doctor and Skills checks, and use the official browser
command when Chrome repair is authorized. It must not substitute a
project-specific doctor.

The first Onboarding Agent must not modify the machine or configuration. It
returns one complete repair and authorization request. After one explicit user
authorization, dispatch a different fresh Onboarding Agent in repair mode.
That Agent performs only the approved safe reversible repairs, then reruns the
full inspection.

Onboarding must group all known human-only actions into one request.
Pexels account creation and API-key acquisition, system authorization,
administrator approval, package-manager setup, restricted-directory access,
cloud login, and disk cleanup cannot be impersonated.

Never place a Pexels key in chat, Markdown, a handoff, log, file path, command
argument, production artifact, or user-facing report. When a safe public
repository configuration tool is discoverable, the repair Agent may use its
stdin or hidden-interaction interface. Otherwise use a secure host secret or
environment mechanism. If Pexels is not configured, onboarding is
`action-required`. If secure credential configuration is unavailable, stop
once and explain the required action.

Onboarding success does not replace the Render/Delivery Agent's required
same-environment doctor run immediately before formal rendering.

## Dispatch the fixed production chain

After onboarding is `ready`, use fresh agents in this order:

1. `broll-director`
2. `broll-assets`
3. one or more `broll-master-build` agents, one per contiguous semantic block
4. `broll-master-integrate`
5. `broll-render`
6. `broll-shot-export` only after an explicit user request

Assets and Pexels collection is mandatory. The Assets Agent must inspect user
material, consider controllable generation, perform real Pexels image and
video searches, evaluate candidates, and freeze selected files locally. It may
select zero Pexels items when none is suitable, but it may not skip the search
or omit the explanation.

Require every Builder to load the current official `hyperframes` Skill through
the host's native Skill mechanism before reading or writing HyperFrames source.
Require the Integrator to load it before assembly and Render/Delivery to load
it before doctor, check, preview, or render. A handoff claim or a CLI command
alone does not replace a real Skill load. Retain the available host-native
trace reference; if the host exposes no inspectable trace, report that
limitation honestly.

Require every stage to use the shared safe child-environment contract for all
non-Pexels processes: an explicit host-native environment map, removal of every
case variant of `PEXELS_API_KEY`, `HYPERFRAMES_NO_TELEMETRY=1` by default, and
direct spawn without a shell. Only a dedicated Pexels request receives the key.
If the host cannot prove this isolation, the owning stage stops before spawn as
`action-required`.

All stages before the final official composition preview may proceed
unattended after onboarding is ready. Formal render must pause for explicit
user approval of that final preview.

## Review without taking over

Begin each review with the stage handoff. Inspect only the actual artifacts
needed to answer a concrete question. Group all currently known issues owned
by one stage into one revision request and re-dispatch that role as a fresh
agent. Never repair the stage's work in the Parent. Preserve unaffected Builder
blocks when one block needs revision.

Continue while the responsible stage is making meaningful progress. Stop for
a real missing dependency, unavailable authorization, insufficient host
capability, irreconcilable constraint, or the same blocker recurring without
progress.

## Preserve the film rules

- Use parsed SRT integer milliseconds as the only time truth.
- Cover continuously from zero through the final cue end.
- Group cues by meaning; do not force one shot per subtitle cue.
- Give every shot a semantic reason, an audience-understanding goal, a clear
  focus, a visible change or deliberate stable state, readable information,
  and an intentional connection to neighboring shots.
- Let sections establish, question, compare, explain, escalate, resolve,
  callback, or transition in the form the content needs. Develop motifs, vary
  density, and avoid accidental adjacent repetition.
- Keep screen copy selective. Do not reproduce subtitle passages or burn the
  subtitle track into the B-roll.
- Treat uncertain transcript names, model names, versions, and brand facts as
  low-confidence until confirmed. Do not silently correct or enlarge them into
  hero copy.
- Route primary material in this order: user material, controllable
  generation, Pexels, then HyperFrames-native structural support.
- Make photographic material carry meaning inside the composition. Do not use
  unrelated footage as a title background.
- Keep native graphics auxiliary; do not let them become the default primary
  material for an extended passage.
- Use project-local font files with recorded source and license. Plan title,
  interface, and body roles, and verify every visible face actually loads.
- Keep internal identifiers, timing labels, debug text, and status metadata out
  of persistent visible copy.
- Do not add background music. Keep faceless output silent by default. In
  talking-head mode, preserve the agreed source-audio policy.
- Deliver one successful final master. This does not limit render attempts to
  one: a failed attempt remains failed evidence, and the Parent dispatches a
  fresh Render/Delivery Agent to retry with a new unused attempt target. Never
  count a partial file as the master or overwrite it. Derive shot files from
  the verified master only after an explicit request.

## Report

Return the master path, resolution, duration, continuous coverage, material and
font sources, objective media facts, optional export paths, environment or
host-evidence limitations, and unresolved risks.

Technical success does not decide aesthetic quality. Ask the user to make the
final visual judgment by watching the master.
