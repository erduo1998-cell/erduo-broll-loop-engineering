---
name: erduo-broll-loop-engineering
description: Create editable, SRT-anchored B-roll with short semantic shots, shared Assets, runtime-native visual locking, focused Builders, lightweight frozen-unit assembly, and verified delivery across HyperFrames and Remotion.
---

# Erduo B-roll Loop Engineering

Act as Parent Producer. Keep creative decisions with one Director, one Assets
Agent, and multiple focused Builders. Run deterministic planning, assignment,
assembly, preview, identity, and delivery directly through bundled scripts. Do
not dispatch Runtime Planner, Integrator, or Render Agents in the normal v1
path. Their installed stage Skills remain only for older production records.

Do not author production source or choose material in Parent context. Review
compact receipts and return a concrete defect to its original creative owner.
Never pass the full parent transcript to a child or create a fresh full-history
revision Agent.

## Start

Require an SRT; talking-head mode also needs its edited video. Ask once for
optional user media and explicit brand, audio, privacy, output, and runtime
constraints. Default a new unique directory beside the SRT, `master.mp4`, H.264,
3840×2160, 30 fps, high quality, silent for faceless work. Never overwrite.
Turn those choices into `production-profile.json` with
`scripts/create-production-profile.mjs`; never hand-write profile JSON. The
verified output format is H.264 MP4. If the user gives no output constraint,
generate the default 3840×2160, 30 fps, silent profile.

Run the runtime detector, validator, and lightweight production preflight.
Explicit `auto`, `hybrid`, `hyperframes`, or `remotion` wins; a blank project
defaults to `auto`; ambiguous existing evidence stops for a choice. Parent
handles production-input and project-runtime fixes. Dispatch `broll-onboarding`
only when the cached preflight explicitly returns
`run-onboarding-diagnostic`. Normal production has no Onboarding Agent.

## Normal v1 flow

1. Dispatch `broll-director` with only the SRT, task constraints, optional user
   media locators, and 0–2 actually selected references. It creates the shared
   narrative/visual artifacts, compact runtime-neutral Shot Recipes, and a
   `representative-scenes.json` set with exactly one `opening`, one
   `information-dense`, and one `late` shot. A semantic shot is normally
   about 5–12 seconds. A shot over 15 seconds must explain the content-driven
   development that needs one continuous span; it cannot rely on background
   activity or held headline text.
2. Parent generates `<production-root>/production-profile.json` from the user's
   width, height, fps, audio, and output constraints, then runs
   `scripts/plan-runtime.mjs` with `--production-profile`, `--production-root`,
   and `--representative-scenes`. The script validates the Recipes and
   representative set, binds the complete
   profile hash, assigns backends, writes one immutable runtime plan, and writes
   plan-v3 profile hash, and writes minimal schema-v2 Lead and production task
   packets. Do not dispatch
   `broll-runtime-plan` or hand-edit generated JSON.
3. Run targeted lightweight preflight only for the backends named by the plan.
4. Dispatch `broll-assets` once. It freezes the complete plan's actual media and
   project-local fonts before Lead work begins and marks the representative
   subset. All Builders read one shared
   `02-assets/` store; never copy the full asset library into unit directories.
5. For each backend actually named by the plan, run
   `scripts/gate-builder-assignment.mjs` on its `role: lead`,
   `phase: visual-lock` packet, then dispatch the existing Builder. The Lead builds the backend's assigned
   representative scenes plus an importable runtime-native visual source under
   its assigned output tree. It must implement the frozen fonts, type hierarchy,
   palette, grid, safe areas, spacing, material/depth baseline, common content
   relationships, and enter/emphasize/change/exit/readable-hold motion tokens.
   This is shared infrastructure, not a shot template. HyperFrames and Remotion
   never share runtime source; a hybrid production shares only the Director's
   runtime-neutral visual tokens, and each backend has its own minimal source.
6. Assemble the three real moving representative scenes, reactivate the original
   Director for a concrete `shotId` witness, and write
   `04-visual-lock/visual-lock.json`. The lock binds the representative reasons,
   frozen visual tokens, assets/fonts, moving scene media, Director witness,
   shared source locators and source identities. Show those scenes to the user.
   Continue fan-out only after the user approves, requests and receives repair,
   or explicitly skips the lock. A skip records the risk and identity; it is
   never silent. Any bound source, font, asset, scene, or witness drift invalidates
   the lock. Validate it with `scripts/validate-visual-lock.mjs`.
7. Run `scripts/gate-builder-assignment.mjs` with the validated lock for every
   `role: builder`, `phase: production` packet, then dispatch it to `broll-master-build` or
   `broll-remotion-build`, including the validated visual-lock and matching
   backend shared-source locator. Source authoring may run concurrently. Each Builder
   returns editable source, its compact receipt, and one validated
   `block-media.json` plus continuous frozen unit media in the common profile.
   For runtime plan v3, the contract also binds the validated
   `visualLockIdentity` and that unit backend's `runtimeSourceIdentity`.
8. Parent runs `scripts/assemble-frozen-production.mjs preview` with the ordered
   unit contracts and the same `04-visual-lock/visual-lock.json`. The script
   revalidates the visual lock and shared-source identities, then validates hashes, time coverage, profile and
   audio closure, assembles one low-cost moving preview, fully decodes it, and
   freezes its identity. Do not dispatch an Integrator or Render Agent.
9. Before showing it to the user, reactivate the original Director once with
   only the low-cost complete preview, SRT, shared plans, and Recipe locators.
   Ask for a bounded visual witness: concrete `shotId` problems in content
   correspondence, comprehension burden, long-span development, readable copy,
   and whole-film coherence. Do not create a Reviewer Agent, score aesthetics,
   redesign the film, or repeat the script's beat checks. Return each concrete
   problem to the original Director or Builder and reassemble after repairs pass.
   If the host cannot inspect moving video, record that capability limit; never
   claim the witness passed.
10. The user makes the final aesthetic decision on the identity-bound moving
   preview. After approval, Parent runs
   `scripts/assemble-frozen-production.mjs deliver`; it verifies the unchanged
   visual lock, shared sources, plan, contracts, frozen media, and preview identity, then assembles the full
   requested raster master to a new `master.mp4` path and fully decodes it.
11. Run shot export only after an explicit request.

An action-required runtime plan returns to Director or runtime selection. A
failed unit returns to the same Builder with only the compact defect receipt.
An assembly failure returns to the unit identified by the script. Preserve all
unaffected units.

## Minimal Builder context

Treat each generated assignment JSON as the complete dispatch boundary. Give a
Builder only its stage Skill, assignment, assigned Recipes, shared narrative and
visual locators, immediate seams, shared asset/font plan, required backend
evidence, matching approved visual-lock/shared-source locator when present, and
0–2 selected references. A Lead receives only its assigned representative
Recipes and the same compact shared locators—not all film Recipes. Do not include other Recipes, full
catalogs, unrelated stage references, long logs, or parent conversation
history.

Every unit preserves editable source. Frozen media is only the deterministic
assembly boundary, not a replacement for source. A live shared-element
transition cannot cross independently rendered units. Keep that transition
inside one unit; otherwise end on the planned readable state and use the
declared matched seam. Do not claim seamless live cross-unit motion when the
contract proves only a cut or matched boundary.

Remotion units isolate source, not dependencies. Every unit uses
`remotion-toolchain.mjs`; one dependency identity installs once per
production root. Install, typecheck, browser trace, and render commands use its
fixed two-slot queue. HyperFrames Builders use the one release-pinned runtime.

## Film and motion

Use SRT integer milliseconds as time truth; cover zero through the final cue
end and group cues by meaning. Every shot needs a semantic purpose, a concrete
first-read anchor, the visible action that happens to it, a readable result,
and connection to its neighbors. Abstract metaphor remains valid, but it must
be carried by an immediately legible object, relationship, state, or spatial
change rather than abstract material, energy lines, or giant type alone. Keep one
coherent visual world while varying composition; do not turn the film into
repeated cards or subtitle copy.

Keep screen copy to the few words that truly need reading. Prefer the audience's
language and large readable type; use English only for a brand, proper name, or
content-specific need. Shared source must support multiple composition families
and cannot make every Recipe a reskinned instance of one layout.

Direction and Builders load animation/visual craft only inside their own stage.
Patterns are optional knowledge, not templates, scores, or routing evidence.
Shotcraft is problem-triggered only, never as a per-shot gate. A complete film may use zero Shotcraft cards.
Do not restrict visual invention to the fewest mechanisms, prefer an old answer
merely because it exists, limit abstraction, or require complex motion to
justify itself with a mechanical score.

Build the maximum visible hero state first, then attention, causal action,
dependent follow-through, settle, and readable hold. Implement the Recipe's
semantic micro-beats as real changes in subject, space, scale, depth, material,
relationship, or visual focus. Decorative lines, particles, or background loops
do not by themselves prove that a long shot develops. Media must shape crop,
mask, path, annotation, palette, depth, or state—not sit in a generic frame.

Builders start motion/layout evidence at Recipe beat boundaries, readable holds,
scene cuts, and the smallest additional samples required by the actual mechanism.
Only a discontinuity, collision, boundary exit, unsettled result, unreadable
hold, or unproven principal development escalates the affected window to dense
or per-frame capture and bounded diagnostic media. Connector geometry, complex
paths, Canvas/WebGL, and an explicit user requirement may need exact evidence
from the start. A passing unit produces no all-frame PNG sequence. Do not add a
review Agent, aesthetic score, or routine screenshot set. Visual lock is the
early direction decision; the complete moving preview is the final aesthetic
decision.

## Execution and report

All commands follow [shared command execution](references/safe-execution.md).
Use bundled validators instead of re-reading schemas. Stop only for a real
missing input, authorization, capability, irreconcilable constraint, or repeated
blocker without progress. Never overwrite an existing plan, preview, identity,
attempt, or master.

The v1 frozen-media assembler delivers H.264 MP4. If the user explicitly
requires another master codec or container, stop as unsupported instead of
silently substituting H.264 or claiming the requested profile was delivered.

Return the master path, resolution, duration, continuous coverage, material and
font sources, objective media facts, optional export paths, verified
limitations, and unresolved risks. Technical success never claims aesthetic
approval. Report cross-unit transitions honestly as cuts or matched seams unless
one Builder rendered the complete live transition inside one unit.
