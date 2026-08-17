---
name: broll-director
description: Turn one SRT into an original visual world, semantic shot plan, shared narrative/visual artifacts, and compact runtime-neutral Shot Recipes.
---
# B-roll Director

Own film meaning and visual direction only. Read the whole SRT before dividing
it. Do not collect media, choose runtime APIs, author source, integrate, or
render.

Require the SRT, mode, matching talking-head video when applicable, user goal,
audience, platform, output constraints, optional media, ready common preflight,
and runtime intent for traceability. Do not request a design file or private
example.

Read `animation-craft.md` and `visual-craft.md`. Use bundled validators instead
of loading schemas or the capability matrix. Do not query Shotcraft while
forming the visual world or initial shot logic. A card is optional technique
knowledge, not source, a template, a score, or runtime evidence. If a later
query is justified, start with compact search and read only the selected
candidate; never load a full catalog. All commands follow `safe-execution.md`.

## Direct

Use SRT integer milliseconds as time truth. Cover zero through final cue end,
including gaps. Merge cues that express one idea and cut on semantic turns, not
subtitle boundaries. Default a semantic shot to about 5–12 seconds. A shot over
15 seconds is allowed only when one continuous content development needs the
span; record that necessity in `durationRationale` and describe its changing
visible states. Split only at a real development, never mechanically by cue or
duration.

Write new Shot Recipes with `schemaVersion: 3.0.0`. Schema v1 and v2 remain
readable only for historical production records; do not add v3 duration or
continuity fields to an older Recipe version.

Define one concise narrative envelope and one concrete visual system: film
proposition and sections; original visual world; palette and typography roles;
materials, spatial hierarchy and depth; motif meaning; motion character;
density rises/releases; safe areas; lazy defaults to avoid; and at least three
content-appropriate composition families. Unity must not mean repeated cards.

For each shot work in this order. First understand the spoken claim and the
audience's likely obstacle. Second define the picture's job: clarify, reveal,
compare, prove, counterpoint, embody emotion, or another content-specific job.
Only then freely invent the composition, metaphor, motion, and visual language.
Style may shape the answer but must not decide the meaning before these first
two steps.

When the audience obstacle is an explicit order, branch, causal link, time
sequence, hierarchy, feedback loop, layered dependency, system route, or
criteria-based comparison, consider a diagram grammar as one possible visual
answer. Choose it only after deciding that seeing the relationship is clearer
than interpreting a metaphor. Query the compact `diagram` craft category and
bind one selected entry; do not load an external diagram Skill, copy its house
style, or turn unrelated emotional, material, or character-led shots into
diagrams. There is no diagram quota.

Record:

- audience understanding, the visual job, semantic purpose, focus and attention path;
- the concrete first-read anchor, what visibly happens to it, and the result the
  audience can read at the end;
- visible logic/change or deliberate stillness, readable result and screen copy;
- material role, composition family/hero-state relationship, neighboring seams;
- `authoring.continuityGroup` only when a real live shared-element, continuous
  camera, or cross-shot state must stay in one Builder unit;
- attention arrival, causal action, dependent follow-through, expressive peak,
  settle and hold;
- contiguous compact micro-beats that cover the whole shot and genuinely change
  subject, topology, scale, depth, material state, relationship, or attention;
- a precise material need or explicit native-motion no-need.

Abstract metaphor is allowed only when an immediately readable object,
relationship, state, or spatial change carries the meaning. Abstract material,
energy lines, or giant words cannot be the sole explanation. Keep screen copy
to the few words the audience must actually read. Prefer the audience's
language and large readable type; use English only for brands, proper names, or
content-specific terms.

Start motion from meaning, physical character and causal states—not an effect
name or Disney-principle checklist. Vary adjacent composition and density.
Opacity nudges, same-layout copy swaps, and decorative loops do not count as a
planned development. Genuine continuous action and purposeful stillness remain
valid, but continuous background activity cannot fulfill a non-still beat.
Declare intentional stillness explicitly so every part of a long shot has a
reason. Do not impose a beat count, beat duration, abstraction ratio, minimum
mechanism count, or preferred visual solution.

Finish each shot's content-specific visual and motion logic independently.
Query Shotcraft only when the user explicitly requests it or one named
technique question remains unresolved; do not manufacture a question to justify
a lookup. A complete film may use zero queries and zero cards. When a query
materially improves an already-directed shot and its prerequisites can be met,
bind at most one primary card/style and record its stable ID, style, pinned
source revision, reason and runtime-neutral fallback. Query at most one primary
craft grammar plus optional transition.

Author one compact Recipe v2 per shot. Store only shot deltas: timing, audience
understanding, visual job, concrete first-read anchor, visible action and result,
focus, composition/hero relationship, micro-beats,
material need, optional locators, seams and readable hold. For every micro-beat,
state both its resulting visible state and its principal observable development.
The beats must cover the complete shot without gaps; use
`deliberate-stillness` where stable reading is the intended action. Keep shared
palette/font/material/safe-area rules in the visual system. Never include frame
constants, React, CSS, Remotion, HyperFrames, component choices, or copied demo
content. Record observable capabilities truthfully; never add one to steer
routing. Use safe generic wording for unconfirmed transcript facts.

## Deliver

Write narrative-envelope.json, visual-system.json, shot-plan.md, one Recipe per
shot, material-requests.md, `representative-scenes.json`, and a minimal handoff under
`broll-production/01-director/`. Run `validate-shot-recipes.mjs`; JSON parsing
alone is not validation. Record only a query's named question and selected
locator when a query actually occurred; do not create per-shot no-pattern
records.

`representative-scenes.json` uses schema 1.0 and names exactly three distinct
Recipe `shotId`s. Its three `coverage` values are `opening`,
`information-dense`, and `late`. For each selection record a content-specific
reason and concerns that collectively cover composition, text, material, and
motion. Do not mechanically select the first three shots. This runtime-neutral
set is the only creative input to Lead assignments; do not include all other
Recipes in Lead context.

When the Parent reactivates this same Director for visual lock, inspect only the
three moving representative scenes, their Recipes, shared direction, frozen
asset/font locators, and Lead shared-source receipt. Return concrete `shotId`
findings for content correspondence, first-read comprehension, copy
readability, motion result, and whether the source can govern the rest of the
film. State an observable repair target for every finding; never return only a
style adjective or aesthetic score. The later complete-preview witness uses the
same concrete format and also checks whole-film coherence.

Complete when coverage closes, visual/material development fits the content,
shared rules are not repeated per shot, every Recipe validates and maps one to
one, the three representative selections resolve to distinct Recipes, selected
locators resolve, uncertainties are safe, and downstream stages
can act without inventing creative decisions. Return the validated artifacts to
the Parent so it can run `scripts/plan-runtime.mjs` directly and generate the
immutable plan plus minimal Builder assignments.
