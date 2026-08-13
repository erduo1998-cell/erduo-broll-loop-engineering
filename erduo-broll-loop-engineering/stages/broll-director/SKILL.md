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
of loading schemas or the capability matrix. Query Shotcraft/craft progressively:
start with compact search, then read only a candidate selected for a real shot.
Never load a full catalog. A card is optional knowledge, not source, a template,
a score, or runtime evidence. All commands follow `safe-execution.md`.

## Direct

Use SRT integer milliseconds as time truth. Cover zero through final cue end,
including gaps. Merge cues that express one idea and cut on semantic turns, not
subtitle boundaries. No shot may exceed 40 seconds; split only at a real
development.

Define one concise narrative envelope and one concrete visual system: film
proposition and sections; original visual world; palette and typography roles;
materials, spatial hierarchy and depth; motif meaning; motion character;
density rises/releases; safe areas; lazy defaults to avoid; and at least three
content-appropriate composition families. Unity must not mean repeated cards.

For each shot decide:

- audience understanding, semantic purpose, focus and attention path;
- visible logic/change or deliberate stillness, readable result and screen copy;
- material role, composition family/hero-state relationship, neighboring seams;
- attention arrival, causal action, dependent follow-through, expressive peak,
  settle and hold;
- compact micro-beats that genuinely change subject, topology, scale, depth,
  material state, relationship, or attention;
- a precise material need or explicit native-motion no-need.

Start motion from meaning, physical character and causal states—not an effect
name or Disney-principle checklist. Vary adjacent composition and density.
Opacity nudges or same-layout copy swaps do not count as development; genuine
continuous action and purposeful stillness remain valid.

After the shot logic exists, query Shotcraft by purpose, relationship, material
and energy. Bind at most one primary card/style per shot only when it improves
understanding and its material prerequisites can be met; otherwise use none.
Record its stable ID, style, pinned source revision, reason and runtime-neutral
fallback. Query at most one primary craft grammar plus optional transition.

Author one compact Recipe v2 per shot. Store only shot deltas: timing, focus,
composition/hero relationship, micro-beats, material need, optional locators,
seams and readable hold. Keep shared palette/font/material/safe-area rules in
the visual system. Never include frame constants, React, CSS, Remotion,
HyperFrames, component choices, or copied demo content. Record observable
capabilities truthfully; never add one to steer routing. Use safe generic wording
for unconfirmed transcript facts.

## Deliver

Write narrative-envelope.json, visual-system.json, shot-plan.md, one Recipe per
shot, material-requests.md, and a minimal handoff under
`broll-production/01-director/`. Run `validate-shot-recipes.mjs`; JSON parsing
alone is not validation. Record only compact selected queries/locators and
explicit no-pattern decisions.

Complete when coverage closes, visual/material development fits the content,
shared rules are not repeated per shot, every Recipe validates and maps one to
one, selected locators resolve, uncertainties are safe, and downstream stages
can act without inventing creative decisions. Route next to Runtime Planner.
