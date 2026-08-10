---
name: erduo-hyperframes-broll
description: Create editable, SRT-anchored B-roll through a Parent Producer and fresh isolated stage agents. Use for talking-head B-roll from an edited video plus SRT, or faceless B-roll from an SRT, with deterministic HyperFrames-or-Remotion routing, first-run environment onboarding, mandatory material collection, runtime-neutral direction, one final master, technical delivery, and optional master-derived shot export.
---

# Erduo HyperFrames B-roll

Act only as the Parent Producer. Read:

- [prompt-first workflow](references/prompt-first-workflow.md)
- [stage orchestration](references/stage-orchestration.md)
- [parent review checklist](references/parent-review-checklist.md)
- [handoff format](references/handoff-template.md)
- [first-run onboarding](references/first-run-onboarding.md)
- [runtime selection contract](references/runtime/runtime-selection.md)
- [runtime-neutral shot and backend contract](references/runtime/runtime-contract.md)
- [runtime capability matrix](references/runtime/capability-matrix.json)

The bundled Shotcraft catalog is runtime-neutral pattern knowledge. Discover it
progressively through `scripts/query-shotcraft.mjs`; do not load the catalog or
all card bodies into one context. A catalog entry is not a bundled Remotion
component, HyperFrames component, adapter, render witness, or parity claim.

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
- Select the render runtime before onboarding. Run
  `node <skill-root>/scripts/detect-runtime.mjs --project <project-root> --json`.
  When the user explicitly chose `hyperframes` or `remotion`, also pass that
  value with `--runtime`; an explicit choice outranks detected project signals.
  Otherwise use concrete package, config, and composition evidence. Mixed
  runtime evidence or an existing project with no runtime evidence is
  `action-required`; do not guess from a directory name. A genuinely new
  project with no explicit choice defaults to `hyperframes`.
- Preserve the router JSON as the runtime-selection artifact and validate it
  against `references/runtime/runtime-selection.schema.json`. Selection does
  not replace onboarding. A selected Remotion route is ready only when the
  project declares matching `remotion` and `@remotion/cli` dependencies, both
  are locally installed at the same version, and the project-local Remotion
  CLI returns real version evidence without a shell.
- Treat `status: selected` as permission to enter inspection-only Onboarding
  even when `readiness: action-required`. This is the normal state for a new
  project explicitly routed to Remotion: Onboarding proposes the exact local
  bootstrap, obtains one grouped authorization and Remotion-license
  confirmation, then a fresh repair Agent creates and verifies it. Only router
  `status: action-required` pauses for a runtime choice.
- Initial routing never uses `--probe-cli` or executes project-local code.
  After the user approves the grouped Remotion repair and local execution, the
  fresh Onboarding repair Agent reruns the same detector with `--probe-cli` to
  obtain local CLI readiness evidence.
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
host, command `PATH`, selected runtime CLI version, target delivery
filesystem, selected runtime, runtime-capability evidence, and Pexels
validation state. Any change requires a new inspection-only Onboarding Agent.

For the default `hyperframes` runtime, preserve all existing official Skill,
doctor, check, preview, and render requirements. For `remotion`, require
Onboarding to verify the selected production route, locked local dependency
versions, the project-local CLI probe, FFmpeg/FFprobe, Chrome used by Remotion,
and the exact Builder/Integrator/Render evidence required by the runtime
contract. Missing local dependency or CLI evidence is `action-required`.
Neither route may reuse the other route's readiness evidence.

The onboarding Agent coordinates environment and authorization only. On the
HyperFrames route it must use the release-pinned official HyperFrames Skill
and CLI guidance, actually run the official HyperFrames doctor and Skills
checks, and use the official browser command when Chrome repair is authorized.
On the Remotion route it must use the verified project-local dependencies and
CLI checks instead. It must not substitute one runtime's doctor or CLI evidence
for the other.

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
same-environment selected-runtime preflight immediately before formal
rendering; HyperFrames preflight includes official doctor.

## Dispatch the selected production chain

After onboarding is `ready`, use fresh agents in this order:

1. `broll-director`
2. `broll-assets`
3. branch on the unchanged runtime selection:
   - HyperFrames: one or more `broll-master-build` agents, then
     `broll-master-integrate`, then `broll-render`;
   - Remotion: one or more `broll-remotion-build` agents, then
     `broll-remotion-integrate`, then `broll-remotion-render`.
4. `broll-shot-export` only after an explicit user request

Do not dispatch both backend chains, route a Remotion run through the
HyperFrames stages, or switch runtimes after a backend failure. Director,
Assets, canonical Shot Recipes, and optional master-derived export remain
shared.

Assets and Pexels collection is mandatory. The Assets Agent must inspect user
material, consider controllable generation, perform real Pexels image and
video searches, evaluate candidates, and freeze selected files locally. It may
select zero Pexels items when none is suitable, but it may not skip the search
or omit the explanation.

The Director must author runtime-neutral Shot Recipes that conform to
`references/runtime/shot-recipe.schema.json` and the runtime contract. Runtime
APIs, component syntax, and backend implementation decisions belong to the
Builder, not the Director. No stage may claim that a recipe is portable merely
because it can be described; portability is determined by the capability
matrix and verified adapter evidence.

For every semantic shot, require the Director to search the Shotcraft catalog
with the bundled query command before deciding whether one primary pattern is
useful. A shot may bind exactly one primary card and style, or use no pattern.
A selected pattern requires a semantic reason, stable card ID, style key,
pinned upstream Git commit, and runtime-neutral fallback in the Shot Recipe.
The Director starts with statistics and a category-filtered list or directed
search, then reads only the selected card body. It must not run an unfiltered
list, force a decorative effect, or repeat one motion grammar merely because
the catalog contains it.

For the `hyperframes` route, require every Builder to load
the release-pinned official `hyperframes` Skill through
the host's native Skill mechanism before reading or writing HyperFrames source.
Require the Integrator to load it before assembly and Render/Delivery to load
it before doctor, check, preview, or render. A handoff claim or a CLI command
alone does not replace a real Skill load. Retain the available host-native
trace reference; if the host exposes no inspectable trace, report that
limitation honestly.

For the `remotion` route, require every Builder, the Integrator, and
Render/Delivery to follow the native Remotion contracts owned by their stage.
They must invoke only the verified project-local CLI, keep React/TSX and frame
conversion outside canonical Shot Recipes, and record the exact Remotion
version and integer-millisecond-to-frame rounding policy. Do not invoke
HyperFrames doctor, check, preview, or render as evidence for a Remotion run.

Require every stage to use the shared safe child-environment contract for all
non-Pexels processes: an explicit host-native environment map, removal of every
case variant of `PEXELS_API_KEY`, `HYPERFRAMES_NO_TELEMETRY=1` by default, and
direct spawn without a shell. Only a dedicated Pexels request receives the key.
When the host API cannot inject or attest that map, use the parent Skill's
bundled `scripts/safe-spawn.mjs` as the only approved bootstrap:
`node <parent-skill-root>/scripts/safe-spawn.mjs -- <executable> [args...]`.
The launcher is a bounded trust boundary: it never logs the environment,
rejects case-insensitive collisions, removes every Pexels-key variant, sets
telemetry off, and spawns directly without a shell. If neither route is
available, the owning stage stops before spawn as `action-required`.

All stages before the final official composition preview may proceed
unattended after onboarding is ready. Formal render must pause for explicit
user approval of that final preview. The preview-pass Render Agent stops with
an `action-required` handoff; after approval, dispatch a different fresh
Render Agent that verifies the approval still binds the unchanged integrated
composition, repeats preflight and check, and then renders.

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
- Treat a Shotcraft pattern as optional motion knowledge, not a required
  template. Use at most one primary pattern per shot, preserve its quality
  constraints when selected, and let content-specific direction override a
  merely attractive match.
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
