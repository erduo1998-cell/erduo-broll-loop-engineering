---
name: erduo-broll-loop-engineering
description: Create editable, SRT-anchored B-roll with runtime-neutral direction, deterministic post-Director auto routing across HyperFrames and Remotion, frozen-media hybrid integration, approval-bound delivery, and optional master-derived shot export.
---

# Erduo B-roll Loop Engineering

Act only as the Parent Producer. Read:

- [prompt-first workflow](references/prompt-first-workflow.md)
- [stage orchestration](references/stage-orchestration.md)
- [parent review checklist](references/parent-review-checklist.md)
- [handoff format](references/handoff-template.md)
- [visual craft](references/visual-craft.md)
- [first-run onboarding](references/first-run-onboarding.md)
- [runtime selection contract](references/runtime/runtime-selection.md)
- [runtime-neutral shot and backend contract](references/runtime/runtime-contract.md)
- [runtime capability matrix](references/runtime/capability-matrix.json)
- [post-Director runtime plan schema](references/runtime/runtime-plan.schema.json)
- [frozen block media schema](references/runtime/frozen-block.schema.json)

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
- Record runtime intent before onboarding. Run
  `node <skill-root>/scripts/detect-runtime.mjs --project <project-root> --json`.
  When the user explicitly chose `auto`, `hybrid`, `hyperframes`, or `remotion`, also pass that
  value with `--runtime`; an explicit choice outranks detected project signals.
  Otherwise use concrete package, config, and composition evidence. Mixed
  runtime evidence or an existing project with no runtime evidence is
  `action-required`; do not guess from a directory name. A genuinely new
  project with no explicit choice defaults to `auto`.
- Preserve the router JSON as the runtime-selection artifact and validate it
  against `references/runtime/runtime-selection.schema.json`. Selection does
  not replace onboarding. A selected Remotion route is ready only when the
  project declares matching `remotion` and `@remotion/cli` dependencies, both
  are locally installed at the same version, and the project-local Remotion
  CLI returns real version evidence without a shell.
- `auto` and `hybrid` return `planning-required`. They authorize base
  inspection-only Onboarding but no backend installation or CLI probe. A
  Director must finish runtime-neutral Recipes before Runtime Planner chooses
  exact backend blocks. Treat a single-backend `status: selected` as permission
  to enter full inspection-only Onboarding even when `readiness: action-required`.
  This is the normal state for a new
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

## Run phased onboarding when needed

On the first run, after migration, or whenever the current environment has no
fresh `ready` evidence, dispatch a fresh `broll-onboarding` Agent in
inspection-only mode before production.

For `auto` or `hybrid`, first dispatch base Onboarding. It binds common Node,
FFmpeg/FFprobe, production/delivery paths, storage, Pexels, and Skill discovery
only. It must not install or require both animation backends. After Direction
and validated Runtime Planner output, dispatch targeted Onboarding for exactly
`requiredBackends`. For explicit/detected single-backend routes, `full` keeps
the 0.4.x order and readiness behavior.

Fresh evidence must bind the production run, host, command `PATH`, onboarding
phase, selection/runtime-plan identity, target filesystem, required backend
CLI versions when targeted, capability evidence, and recorded Pexels state.
Pexels availability is informational until the Director/runtime plan declares
an actual Pexels-backed material need. Any binding change requires fresh
inspection.

For a plan requiring `hyperframes`, preserve all existing official Skill,
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
environment mechanism. Base/full Onboarding records a missing key without
blocking. Targeted Onboarding is `action-required` only when the validated plan
actually requires Pexels and secure credential configuration is unavailable.

Onboarding success does not replace the Render/Delivery Agent's required
same-environment selected-runtime preflight immediately before formal
rendering; HyperFrames preflight includes official doctor.

## Dispatch the planned production chain

Use fresh agents in this order:

1. base or full `broll-onboarding` according to selection intent;
2. `broll-director`;
3. `broll-runtime-plan`, using the bundled planner and validator rather than a
   prose judgment;
4. targeted `broll-onboarding` for the exact planned backend set when initial
   intent was `auto` or `hybrid`;
5. `broll-assets` for the always-required user-material/font/source closure;
   invoke generation and Pexels work only for declared material needs;
6. branch on the validated runtime plan:
   - HyperFrames: one or more `broll-master-build` agents, then
     `broll-master-integrate`, then `broll-render`;
   - Remotion: one or more `broll-remotion-build` agents, then
     `broll-remotion-integrate`, then `broll-remotion-render`;
   - Hybrid: dispatch each block to its assigned backend Builder, require each
     authoring unit to pass its backend Builder checks. When one backend block
     contains one unit, that Builder may freeze `block-media.json` and the local
     mezzanine directly. When it contains multiple units, dispatch one fresh
     same-backend Builder in block-freeze mode after all unit receipts pass;
     it reads only those verified unit source exports/receipts and the block
     window, writes only block-level temporary composition glue, records every
     glue/source hash and aggregate identity, runs the same backend's technical
     commands, and renders/freezes the existing block contract. It may not
     change unit-internal creative/source, rewrite shots, or perform aesthetic
     review; glue or render failure returns to the implicated unit owner. Then run
     `broll-hybrid-integrate` and `broll-hybrid-render`.
7. `broll-shot-export` only after an explicit user request.

Do not dispatch before a valid runtime plan, route a block through the wrong
Builder, or switch its assignment after failure. Hybrid may use both Builder
types, but never live-nests animation runtimes or feeds generated source into
the other backend. Cross-runtime exchange is frozen media only. Director,
Assets, canonical Recipes, and optional export remain shared.

The Assets stage always runs, but external acquisition is conditional. It must
inspect supplied material, close project-local fonts and provenance, and
process each Recipe v2 material need. For no-need/native-MG units it records a
compact no-search decision and must not call generation or Pexels. For a real
ordinary-media need it routes user material → authorized controllable
generation → Pexels → runtime-native structural support, performing only the
searches needed by that request. Fact, brand, logo, webpage, or real-interface
needs use appropriate factual sources rather than Pexels as a substitute.

The Director must author one shared `narrative-envelope.json`, one shared
`visual-system.json`, and compact runtime-neutral Shot Recipe v2 deltas that
conform to `references/runtime/shot-recipe.schema.json` and the runtime
contract. Keep global typography, palette, material rules, safe areas, and
prohibitions in the shared visual system instead of repeating them per shot.
Runtime APIs and component syntax belong to the assigned Builder. No stage may claim
that a recipe is portable merely because it can be described. Runtime Planner
uses declared capability IDs and exact pattern/backend evidence, never semantic
keywords. A pinned Remotion reference source is explicitly unverified
preference evidence unless a separate render witness exists.

Direction and both backend Builders must read
`references/animation-craft.md` and progressively query the runtime-neutral
craft catalog described by `references/visual-craft.md`. Treat craft as
authoring guidance, never runtime-routing evidence, a checklist, a score, or a
new QA artifact. Use at most one primary craft grammar per shot plus an optional
transition locator.

For every semantic shot, require the Director to search the Shotcraft catalog
with the bundled query command before deciding whether one primary pattern is
useful. A shot may bind exactly one primary card and style, or use no pattern.
A selected pattern requires a semantic reason, stable card ID, style key,
pinned upstream Git commit, and runtime-neutral fallback in the Shot Recipe.
The Director starts with statistics and a category-filtered list or directed
search, then reads only the selected card body. It must not run an unfiltered
list, force a decorative effect, or repeat one motion grammar merely because
the catalog contains it.

Require Runtime Planner to preserve backend blocks and also generate bounded
`authoringUnits` deterministically. Each unit belongs to one backend block,
contains complete semantic shots only, has an absolute maximum duration of 40
seconds, and defaults to 1–3 shots. A hero, complex asset-fusion, or complex
camera shot may form one unit only when that complete shot is at most 40
seconds. If any Director shot exceeds 40 seconds, Planner must reject the plan
and return it to Director for a semantic shot split; one shot may never cross
units. Dispatch Builders by authoring unit, not by an entire long backend block.

For the `hyperframes` route, require every Builder to load
the release-pinned official `hyperframes` Skill through
the host's native Skill mechanism before reading or writing HyperFrames source,
then progressively load the official creative and animation guidance and only
the references hit by its unit. Query reusable official registry blocks,
creative presets, animation blueprints, and transitions before writing a new
mechanism; reuse the mechanism while replacing content, material, layout,
typography, palette roles, and visual skin.
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
Reuse only project-local Remotion primitives backed by a real render witness.
When none matches, implement the runtime-neutral craft grammar natively rather
than inventing parity or copying HyperFrames source.

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

Each Builder reads only its authoring unit, adjacent seam summaries, the shared
narrative/visual-system locators, the unit Recipes, frozen assets/fonts, and
the 0–2 references actually selected for that unit. It must not load all film
Recipes, the full Shotcraft catalog, or the full craft catalog. Author the
maximum visible hero frame first, then add attention, primary causal action,
dependent follow-through, settle, and readable hold. Ordinary media must
participate through geometry, crop, mask, path, annotation, palette, depth, or
state—not as a generic framed thumbnail.

All stages before the final official composition preview may proceed
unattended after onboarding is ready. Formal render must pause for explicit
user approval of that final preview. The preview-pass Render Agent stops with
an `action-required` handoff; after approval, dispatch a different fresh
Render Agent that verifies the approval still binds the unchanged integrated
composition, repeats preflight and check, and then renders.

## Review without taking over

Begin each review with the compact receipt/handoff. Inspect only the artifacts
needed to answer a concrete contract or technical question: schema/coverage,
closed references, source/font/hash/identity, runtime ownership, lint/check,
probe/decode, or an explicit reported failure. Do not run a broad aesthetic
review, create an independent visual-review Agent, score craft, or require
extra screenshots when no concrete technical issue exists. Group all known
issues owned by one stage into one revision request and re-dispatch that role
as a fresh agent. Never repair the stage's work in the Parent. Preserve
unaffected authoring units when one unit needs revision.

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
- Use the shared visual system to unify visual-world logic, palette roles,
  typography, materials, depth, motion character, and motif meaning while
  varying at least three content-appropriate composition families across the
  film. Do not reduce unity to one repeated card layout.
- Give long shots visible micro-beat development that changes subject,
  topology, scale, depth, material state, relationship, or attention. Opacity,
  slight displacement, or same-layout copy replacement alone is not a new
  visual beat; deliberate stillness remains valid when semantically intended.
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

Technical success does not decide aesthetic quality. The only default
aesthetic gate is the user's explicit decision after watching the final
identity-bound composition preview; after approved rendering, report objective
master facts without inventing another visual-review gate.
