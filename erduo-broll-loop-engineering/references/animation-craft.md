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
runtime primitive. Separate the content decision from the creative solution and
generate each shot in this order:

```text
spoken meaning
→ audience obstacle
→ visual job
→ freely chosen visual idea
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

Generate the shot without Shotcraft from these questions:

1. What must the audience understand, what may be hard to grasp from speech
   alone, and what job should the picture perform?
2. What original concrete, abstract, metaphorical, diagrammatic, typographic,
   media-led, or mixed visual idea best performs that job? Explore freely; no
   route is the default and style must not decide meaning first.
3. What is the one first-read focus, and how does attention reach it before the
   decisive change?
4. What are the subject's material, mass, depth, support, and motion character?
5. What are the initial state, decisive action, settled result, and readable
   stable interval?
6. Which layers lead, which depend on them, and how do dependent layers finish?
7. Does the idea need authored key states or deterministic continuous motion?
8. What is the one expressive peak, and what remains restrained around it?
9. How does this action inherit from or hand energy to the neighboring shot?

Translate the answers into the compact runtime-neutral Recipe fields:
`audienceUnderstanding`, `visualJob`, `focus`, `heroFrame`, `microBeats`,
`readableHold`, material needs, and neighbor handoff. Describe observable motion
and results, not principle names or backend APIs. Give every beat its resulting
visible state and principal development, and cover intentional stability with a
`deliberate-stillness` beat. If this closes the shot, stop: no Shotcraft query or
no-pattern receipt is required. Query only for a named remaining technique
question or an explicit user request. A selected card may refine the mechanism
but must not originate the shot's meaning or movement character.

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

Use as many HyperFrames mechanisms and visual layers as the generated direction
needs. Do not treat mechanism count as a quality target or collapse a rich idea
into a caption-plus-image layout. For elastic motion pair axial scales coherently
rather than tweening layout dimensions. Put entrance, continuing motion, and
dependent motion on separate wrappers when their transform ownership would
conflict. All motion remains deterministic and seek-safe under the official
HyperFrames contract; continuous motion may run through a shot but cannot stand
in for its planned finite developments.

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
closure, rendering, and decoding. Runtime-captured per-frame geometry may also
detect discontinuity, abrupt speed/acceleration changes, failure to settle,
excessive reversal, synchronized starts, competing motion foci, short or moving
readable holds, safe-area exits, off-canvas elements, and strong unplanned
overlap. Only actual rendered DOM or scene geometry qualifies; static source
regex, Recipe prose, and hand-authored estimates do not.

When Recipes are supplied to the shared lint, it may additionally prove that
each planned non-still beat is bound to a non-decorative rendered action and that
the subject actually changes within that beat. Finite actions may transform and
settle; progressive continuous subject action may fulfill a beat when its end
state visibly advances. A background loop, particle drift, moving decorative
line, unbound continuous motion, or a motion declaration with unchanged rendered
state cannot satisfy a beat. For a long non-still beat, an opening change followed
by an undeclared long still tail also cannot satisfy the planned window; describe
intentional stability as `deliberate-stillness`. This is a technical risk filter,
not a fixed motion interval, beat count, or judgment that the chosen composition,
metaphor, rhythm, or animation is aesthetically correct.

Technical checks must not claim to prove anticipation, weight, overlap, timing, arcs,
exaggeration, or appeal. More precisely, these checks do not prove that
anticipation communicates, mass feels right,
follow-through is meaningful, arcs are pleasing, exaggeration serves the
story, or the result has appeal. Do not create a twelve-principle score or
multiply static review artifacts. Use the shared motion/layout lint as a risk
filter, render diagnostics only for findings, and leave one final moving
preview as the user's aesthetic decision. If generated motion is wrong, return
to the Director or owning Builder.
