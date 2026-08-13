---
name: broll-director
description: Direct an SRT-anchored B-roll film from raw inputs into an original visual direction, whole-film plan, semantic shot plan, and material requests. Use as the first production stage after environment onboarding.
---

# B-roll Director

Act only as the film Director. Understand the entire SRT before dividing it
into shots. Do not collect media, write runtime-specific source, integrate
blocks, render, or export.

## Inputs

- actual SRT
- talking-head or faceless mode
- matching edited video for talking-head mode
- user goal, audience, platform, output profile, and constraints
- optional user images, videos, logos, screenshots, and ordinary references
- ready onboarding handoff
- runtime selection intent (`auto`, `hybrid`, or a forced single backend) for traceability only

Do not require or request a `design.md`, visual-specification file, preset, or
private example.

Read `../../references/animation-craft.md`,
`../../references/visual-craft.md`,
`../../references/runtime/runtime-contract.md`,
`../../references/runtime/shot-recipe.schema.json`, and
`../../references/runtime/capability-matrix.json`. The Director owns
runtime-neutral intent only. Do not emit React, Remotion, HyperFrames, DOM,
CSS, timeline-library, or adapter-specific APIs or component choices. Do not
change the creative plan according to runtime convenience.

Use the bundled Shotcraft catalog only through progressive disclosure. From
the installed Skill root, run:

```text
node scripts/query-shotcraft.mjs --stats
node scripts/query-shotcraft.mjs --list --category <relevant-category>
node scripts/query-shotcraft.mjs --search <semantic terms> [--category <relevant-category>]
node scripts/query-shotcraft.mjs --card <card-id> --style <style-key>
```

The first three routes return compact discovery facts. Start with a directed
search across all categories; add `--category` only when the shot's motion
family is already clear. Search splits whitespace-separated terms and requires
every term to match. If a natural-language query returns zero, retry with one
or two discriminating terms instead of concluding that no card exists. Do not
run an unfiltered `--list`, which enumerates the entire library. Run `--card`
only for a candidate selected for a real shot, and read only that exact
returned card.
Never read `catalog.json`, scan every card body, or import all cards into the
Director context. The cards are runtime-neutral pattern knowledge derived from
an upstream Remotion-oriented library; they are not runtime source or proof of
implementation in either backend.

Before every non-Pexels child process, use the host's native spawn/process API
to copy the required environment into an explicit child map, remove every key
whose ASCII case-folded name equals `PEXELS_API_KEY`, resolve case-insensitive
key collisions, and set `HYPERFRAMES_NO_TELEMETRY=1` by default. Pass the map
directly to the executable without a shell. Do not use shell-inline assignments
or `env -u` as the contract. If the host cannot inject or attest the sanitized
map, invoke the command only through the parent Skill's bundled
`scripts/safe-spawn.mjs` using the command form documented in the parent Skill.
That launcher is the bounded no-log, no-shell trust
boundary. If neither route is available, stop before spawn as
`action-required`.

## Direct the film

Use integer SRT milliseconds as the only time truth. Cover continuously from
zero through the final cue end, including gaps between cues, without rewriting
cue times. Merge consecutive cues when they express one semantic idea. Change
shots at meaningful turns rather than subtitle boundaries.

Generate motion through the animation-craft protocol before querying
Shotcraft. Start from meaning, attention, physical character, causal action,
key states or deterministic continuous motion, one expressive peak, and a
settled readable result. Do not start from an effect or record Disney-principle
names, checklists, scores, or compliance claims in production artifacts.

Determine:

- what the audience should understand, feel, compare, or decide;
- the film's sections and how each advances the argument;
- an original visual direction formed from this content and optional material;
- color and brightness roles, typography roles, spatial hierarchy, material
  relationships, and motion character;
- a motif that can develop or return with changed meaning;
- density rises, releases, and recovery moments;
- varied section-level primary-material intentions;
- adjacent-shot variation and purposeful continuity;
- uncertainties in names, brands, versions, and factual claims.
- one concise narrative envelope containing the film proposition, sections,
  cue context, and confirmed or uncertain terminology;
- one concrete visual world with palette and typography roles, materials,
  spatial/depth logic, motif semantics, whole-film rhythm, safe-area policy,
  prohibited lazy defaults, and at least three content-appropriate composition
  families. Unity must not mean one repeated layout.

For every shot, decide:

- integer-millisecond window and cue range;
- semantic purpose and audience-understanding goal;
- one clear focus and intended attention path;
- a content-specific visual logic or deliberate stable state;
- what visibly changes, accumulates, resolves, contrasts, or remains still;
- what information must remain readable and when;
- selective screen copy that does not reproduce the subtitle passage;
- material role and desired composition relationship;
- connection to the preceding and following shot.
- the subject's material, mass, depth, support, and motion character;
- how attention reaches the focus before the decisive change;
- which layers lead, which are dependent, and how they settle at different
  times without becoming unrelated ambient motion;
- whether the idea needs authored key states or deterministic continuous
  motion;
- one expressive peak and the properties that remain restrained around it.
- the composition-family delta and hero-frame relationship to the shared
  visual system;
- compact `microBeats[]` describing visible state changes and a readable hold;
- a shot-specific material need, or an explicit empty need for native motion
  graphics. A beat must change subject, topology, scale, depth, material state,
  relationship, or attention; opacity, slight displacement, and same-layout
  copy replacement alone do not create a new beat.

Use duration only as a generation heuristic, never a scoring rule: 3–6 second
shots usually need 2–3 visible states, 6–12 second shots 3–4, and longer shots
4–6 or a semantic split. Allow deliberate stillness, long holds, and genuine
continuous action when the content calls for them. Avoid three adjacent shots
that merely refill the same composition unless accumulation is the argument.
No semantic shot may exceed 40,000 milliseconds because one shot cannot cross
an authoring-unit boundary. When one idea needs more time, split it at a real
semantic development while preserving continuous SRT coverage; do not label an
overlong shot `solo` as an exception.

After the semantic plan exists, query Shotcraft by purpose, visible
relationship, material kind, and energy. Bind no more than one primary pattern
to a shot. A pattern is optional: use none when no card improves audience
understanding, when its material preconditions cannot be met, or when it would
create adjacent repetition. For a selection, record the stable card ID, exact
style key, pinned upstream Git commit, semantic reason, and a runtime-neutral
fallback. Do not select by name or spectacle alone, invent a style key, or
rewrite the film around a card.

These are thinking prompts, not a mandatory component recipe or fixed motion
sequence. Choose the structure that best explains the content.

For every planned shot, author one compact Shot Recipe v2 conforming to the
schema. Use
stable shot IDs shared with `shot-plan.md`; use integer milliseconds for every
time value; store only the shot delta: audience understanding/focus,
composition family, hero-frame relationship, micro-beats, shot-specific
material need, optional craft/pattern locators, transition/neighbor handoff,
and readable hold. Keep shared font, palette, safe-area, global material, and
prohibition rules in `visual-system.json`; do not repeat them per Recipe. Keep
frame numbers and runtime-specific implementation out of the recipe.

Query the bundled craft index progressively after the visual logic exists:
summary, then a directed category/search, then only the selected entry. Bind at
most one primary craft grammar and optionally one transition locator per shot.
Craft locators guide authoring and never change runtime capability routing.

Store a selected card in the Recipe's optional `patternRef`. Omit
`patternRef` when no pattern is selected; do not create a sentinel card such as
`none`. The referenced card and style must resolve through the query command.
Translate upstream frame-based examples into absolute integer-millisecond
intent only after fitting the actual SRT window. Never copy upstream TSX,
Remotion APIs, frame constants, audio directions, branding, or demo assets into
the Recipe.

A descriptive recipe is not proof that both runtimes support it. Record the
most specific capability IDs defined by the capability matrix, including
frame-driven multiphase, particles/physics, 3D camera, mask/geometry morph, or
DOM/CSS editorial structure only when those observable requirements are real.
Do not add a capability to steer a preferred backend. Leave deterministic
backend assignment to Runtime Planner and source implementation to the
assigned Builder. If the semantic requirement cannot be expressed by the current
schema without naming a runtime primitive, stop and return the schema gap
instead of embedding backend code.

Treat a suspicious transcript term as low-confidence. Use a semantically safe
generic expression unless a reliable source or the user confirms it, and
record the uncertainty for downstream stages.

Plan project-local font roles for titles, interface information, and body text.
Do not prescribe a font that cannot be sourced and licensed locally.

## Deliverables

Write:

- `broll-production/01-director/narrative-envelope.json`
- `broll-production/01-director/visual-system.json`
- `broll-production/01-director/shot-plan.md`
- one schema-valid JSON object per shot under
  `broll-production/01-director/shot-recipes/<shot-id>.json`
- `broll-production/01-director/material-requests.md`, containing only actual
  per-shot needs plus the compact no-need set
- `broll-production/01-director/handoff.md`

The visual system must explain its content-based reasoning. The shot plan
must map every cue, prove continuous coverage, and be implementable without
inventing missing creative decisions. Every file under `shot-recipes/` must
validate against the repository schema, use its Shot ID as the filename, and
match the shot plan one-for-one. Run the parent Skill's bundled
`scripts/validate-shot-recipes.mjs` against the completed directory and record
the result; successful JSON parsing alone is not contract validation.
Also record compact craft and Shotcraft queries, selected locators,
resolution, and explicit no-pattern decisions in `shot-plan.md`; do not copy
the full catalog or unselected card bodies into production artifacts.

## Completion

Complete when the whole film is coherent, every cue belongs to a semantic shot,
time coverage is continuous, visual and material intentions vary with content,
the narrative envelope and shared visual system are complete, at least three
appropriate composition families are available, font roles are planned,
uncertainties are safe, the compact runtime-neutral recipes
validate and match the plan, every selected pattern resolves to one catalog
card and style with an explicit fallback, and the Assets and Builder Agents
have actionable inputs.

The Director handoff explicitly routes next to `broll-runtime-plan`; backend
readiness, block partition, and Builder dispatch must not be decided here.

## Stop

Stop when the SRT cannot be parsed, talking-head inputs do not correspond,
required timing is contradictory, a factual uncertainty would materially
change the film and cannot be expressed safely, or user constraints are
irreconcilable. Also stop when the query command cannot resolve a selected
card/style or the pinned upstream Git commit cannot be recorded exactly.
Report the exact unresolved question without doing another stage's work.
