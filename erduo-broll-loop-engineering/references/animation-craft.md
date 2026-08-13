# Animation craft generation protocol

## Purpose

Use Disney's twelve animation principles as upstream thinking prompts for
Direction and backend-native authoring. They generate motion decisions; they
are not a shot checklist, runtime capability taxonomy, evidence schema, or
still-frame review rubric.

Use this protocol together with the shared visual system, compact Recipe v2
`microBeats[]`, and progressively queried craft guidance. Do not duplicate its
rules in every Recipe or expand it into a longer downstream prompt.

Do not begin with an effect, easing curve, spring, transition, catalog card, or
runtime primitive. Generate each shot in this order:

```text
meaning
→ attention
→ body and material
→ causal action
→ key states or continuous motion
→ one expressive peak
→ settle and readable stability
→ native runtime implementation
```

Do not write principle names, scores, compliance tables, or twelve-item
inventories into Shot Recipes, manifests, handoffs, or QA artifacts. Do not
require every shot to exhibit every principle. Deliberate stillness can be the
right generated result.

## Compile the twelve principles into five decisions

### Direct attention before action

This compiles **Anticipation**, **Staging**, and **Secondary Action**.

- Give the shot one first-read focus.
- Before an important change, send attention to where the change will happen.
- Let the primary action lead. Secondary action may clarify cause, scale,
  reaction, or atmosphere, but it must derive from and remain subordinate to
  the primary action.
- Do not start every element together or animate decoration merely to keep the
  frame busy.

### Give every moving element a body

This compiles **Squash and Stretch**, **Solid Drawing**, and the physical side
of **Appeal**.

- Decide material, mass, volume, rigidity, support, depth, and character before
  choosing motion.
- Paper, glass, metal, interface panels, text, photographs, people, and liquid
  must not share one generic spring personality.
- Deformation, perspective, shadow, balance, and center of mass must agree.
- Preserve perceived volume when elastic deformation is appropriate. Do not
  squash screenshots, body copy, logos, or serious data by default.

### Make action causal and let it finish

This compiles **Slow In and Slow Out**,
**Follow Through and Overlapping Action**, and **Timing**.

- Build important action as preparation → action → settle, not uniform travel
  from A to B.
- Choose speed and acceleration from mass, distance, emotion, and narrative
  urgency. Do not give unrelated actions one default duration or ease.
- Derive dependent layers from the primary action. They may lag, overshoot,
  oscillate, or stop at different times, but must not run as unrelated ambient
  loops.
- Let the result become stable long enough to be understood. Stability is the
  consequence of motion, not the absence of design.

### Choose key states or continuous motion deliberately

This compiles **Straight Ahead Action and Pose to Pose** plus **Arcs**.

- Explanation, comparison, reveal, and argument shots normally begin with
  clear initial, decisive, and result states; motion connects those states.
- Organic growth, particles, crowds, fluids, procedural trails, and other
  continuously evolving phenomena may be generated as continuous motion, but
  their state must remain a deterministic function of time.
- Organic or weighted motion normally follows an arc. Straight paths belong to
  mechanical, interface, constrained, or intentionally severe motion.
- The choice is an authoring strategy, not a label to expose downstream.

### Spend exaggeration once

This compiles **Exaggeration**, the expressive side of **Timing**, and
**Appeal**.

- Give each shot one primary expressive peak.
- Push the property that carries the meaning: scale, speed, pause, path,
  hierarchy, contrast, deformation, or density.
- Keep other properties restrained so the peak remains legible.
- Appeal means clear, specific, and worth watching; it does not mean cute,
  bouncy, glossy, or maximally animated.

## Director generation procedure

Before querying Shotcraft or describing motion phases, generate the shot from
these questions:

1. What must the audience understand, and what is the one first-read focus?
2. How does attention reach that focus before the decisive change?
3. What are the subject's material, mass, depth, support, and motion character?
4. What are the initial state, decisive action, settled result, and readable
   stable interval?
5. Which layers lead, which depend on them, and how do dependent layers finish?
6. Does the idea need authored key states or deterministic continuous motion?
7. What is the one expressive peak, and what remains restrained around it?
8. How does this action inherit from or hand energy to the neighboring shot?

Translate the answers into the existing runtime-neutral Recipe fields:
`semantics.focus`, `semantics.visualLogic`, `visualState`, `motion.phases`,
`readability`, materials, and neighbor connection. Describe observable motion
and results, not principle names or backend APIs. Query Shotcraft only after
this motion direction exists; a card may refine the mechanism but must not
originate the shot's meaning or movement character.

## HyperFrames Builder generation procedure

Read the Recipe and reconstruct its attention path, physical character, causal
action, key states, expressive peak, and stable result before selecting an
atomic rule, blueprint, adapter, transition, or ease.

Author in this order:

1. author the maximum visible hero frame first, including focus, depth layers,
   supporting structure, media relationship, and stable readable result;
2. place the initial, decisive, result, and stable states on the one paused,
   seekable timeline;
3. add only the preparation needed to direct attention;
4. connect the primary action using motion consistent with the subject's body;
5. derive lag, overlap, overshoot, and settling of dependent layers from that
   primary action;
6. add secondary action only when it strengthens meaning;
7. remove ambient motion that has no informational or emotional cause.

Use the smallest set of HyperFrames mechanisms that preserves the generated
direction. For elastic motion pair axial scales coherently rather than tweening
layout dimensions. Put entrance, continuing motion, and dependent motion on
separate wrappers when their transform ownership would conflict. All motion
remains finite, deterministic, and seek-safe under the official HyperFrames
contract.

## Remotion Builder generation procedure

Author the same maximum visible hero frame first, without creating a preview
approval artifact. Read the generated direction before choosing
`interpolate()`, `spring()`, `Sequence`, or a procedural function. Define a
small number of semantic states
and their frame windows first, then reconstruct every visible state from the
current frame and fps.

Use `spring()` only when the declared material, inertia, or landing genuinely
calls for it. Do not spring every property. Derive follow-through with explicit
offset functions from the primary action. Continuous motion such as particles
or trails must be closed-form or fixed-seed and seekable at an arbitrary frame.
Preserve the stable result instead of letting procedural motion obscure it.

## Boundary of verification

Technical checks may prove time coverage, deterministic seeking, file and font
closure, material visibility, frame boundaries, readable windows, rendering,
and decoding. Stills may diagnose layout, missing assets, clipping, or a known
boundary state.

They must not claim to prove anticipation, weight, overlap, timing, arcs,
exaggeration, or appeal. Do not create principle evidence files or recover this
protocol as a post-build scoring system. If generated motion is wrong, return
to the Director's motion direction or the owning Builder's native authoring;
do not compensate by multiplying static review artifacts.
