# Disney animation principles: code-behavior review contract

The Disney twelve principles are the parent agent's **golden standard for reasoning about authored animation behavior**. They are not a request to add twelve effects, a checklist of CSS/GSAP fields, or a visual-model judgment from isolated frames.

Before approving master code, read the actual timelines, labels, keyframes, easing, transform values, layer order, opacity/scale relationships and declared shot purpose. Where available, inspect HyperFrames' animation map as an aid to find dead zones, lifecycle warnings and stagger problems. Then mentally execute each scene from its initial state through action, readable result and exit: determine where attention goes, what accelerates, which elements lead/follow, and whether the viewer can comfortably understand the intended change. If the logic violates a relevant principle, return a concrete code-change packet to `broll-master-build`; do not render first and hope sampled stills reveal it.

## Review reasoning

| Principle | What the reviewer reasons through in the code |
| --- | --- |
| Squash and stretch | For declared impact, material or elastic objects, does controlled scale/deformation communicate force and recover cleanly without distorting type, factual charts or logos? If no such material exists, it is genuinely inapplicable. |
| Anticipation | Before a consequential reveal, does the timeline prepare attention through position, opacity, framing or a subordinate cue, rather than abruptly popping the result with no lead-in? |
| Staging | Across the overlapping tweens and layer stack, is there one understandable focal path at each beat? Reject simultaneous competing entrances, central stacks and overlays that obscure the intended subject. |
| Straight-ahead / pose-to-pose | Is the construction method intentional and seek-safe? A designed pose sequence needs stable key poses and transitions; a continuous generative action needs a deterministic controlled evolution, never incidental runtime behavior. |
| Follow-through / overlap | When a main action lands or exits, do dependent layers, background and accents settle with an intentional relationship, rather than every transform stopping on the same frame like a rigid slide deck? |
| Ease in / ease out | Do spatial transitions use fitting easing and duration for weight/readability, rather than mechanical linear motion, unexplained overshoot or a speed change that fights narration? |
| Arcs | When code depicts physical, camera or attentional travel, does its x/y/rotation progression describe an intentional path rather than a generic straight-line drift? |
| Secondary action | Is ambient/background/supporting motion quieter, lower-priority and phase-related to the main action, rather than competing for attention or remaining unrelated decoration? |
| Timing | Does the timeline reserve enough setup, action and result-hold for the SRT claim to land? Reject unreadable text reveals, instant resets and motion that completes after its semantic window. |
| Exaggeration | Is the emphasis parameter—scale, contrast, speed, reveal or color—strong enough for the information weight but constrained by the user design and factual tone? |
| Solid drawing | Do code-defined scale, perspective, shadows, masks, spacing and layer relationships create deliberate visual depth/proportion instead of accidental collisions, flatness or false spatial logic? |
| Appeal | Taken as a whole, does the authored motion grammar avoid default AI/UI behavior and create the promised visual pull for this audience? This is assessed from the implemented hierarchy, rhythm, materials and transitions—not from a generic style preference. |

## Decision and repair

The reviewer does not mechanically require every principle. It decides which principles materially govern each shot, explains the motion behavior it inferred from code, and returns one of two outcomes:

- `approved`: the complete timeline has no unresolved relevant-principle violation;
- `revision_required`: name the faulty behavior, the governing principle, why the current keyframe/layer/easing logic causes it, and the desired behavioral correction.

A revision may change the complete master project, but it must be narrow: fix the identified motion logic without silently changing frozen timing, materials, copy or design direction. Rerun the reasoning review against the replacement code. `npx hyperframes check` proves framework correctness; it never substitutes for this animation-quality judgment.

All motion remains deterministic and seek-safe under current HyperFrames capabilities. These principles never authorize fake physics, decorative motion, unreadable type or departure from user design.
