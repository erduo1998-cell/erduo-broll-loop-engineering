# Motion and layout lint

Use this reference only in a backend Builder or Integrator. It replaces routine
AI inspection of repeated stills. The final identity-bound moving preview is
the only default human aesthetic review.

## What the lint can establish

`scripts/motion-layout-lint.mjs` consumes runtime-captured element geometry for
every frame. It can report:

- discontinuous position, scale, size, or opacity changes;
- hard transition edges, abrupt acceleration changes, failure to settle, and
  excessive direction reversals;
- declared readable holds that are too short or still moving;
- most elements starting together or too many independent focus groups moving
  at once;
- focus-bearing elements outside the shared safe area;
- wholly off-canvas visible elements and strong unplanned overlap between
  independent groups.

These are code-checkable projections of slow in/slow out, timing, follow
through, staging, and readable composition. They are risk signals, not a
Disney-principle score.

The lint cannot prove anticipation communicates the right idea, perceived
mass, pleasing arcs, meaningful exaggeration, story clarity, or appeal. The
user decides those properties from one final moving preview.

## Instrument the actual runtime

Do not manufacture the trace from Recipe prose, keyframe declarations, CSS
source, or hand-authored estimates. Instrument the rendered composition:

1. mark only meaningful visible elements with stable IDs, one role, one focus
   group, safe-area policy, optional allowed overlaps, and finite motion
   windows;
2. seek the real runtime to every frame in order;
3. after layout and paint settle for that requested frame, capture each marked
   element's canvas-space rectangle and effective opacity;
4. bind the trace to the exact composition identity and validate it against
   `references/runtime/motion-layout-trace.schema.json`;
5. run `motion-layout-lint.mjs` and preserve its compact JSON result outside
   production source.

For Remotion, capture DOM geometry from the project-local rendered
Composition. `getBoundingClientRect()` is acceptable only after the exact
frame has rendered; normalize transforms into the returned canvas-space box.
For Canvas/WebGL content, expose scene-owned semantic bounds rather than the
single canvas rectangle.

For HyperFrames, use rendered DOM geometry when the selected official adapter
exposes the elements. For Canvas, SVG abstraction, or Three/WebGPU content,
export semantic scene bounds from the same deterministic frame function. If
the current official runtime has no truthful geometry hook for an element,
record it as unmeasured; do not infer it with source regex or claim full lint
coverage. Standard runtime checks and the final moving preview remain valid,
but they do not turn the missing geometry into a pass.

## Handle findings

`status: pass` requires no still, clip, AI visual analysis, or prose QA report.
Store the one-line result locator in the compact receipt.

`status: attention` returns `diagnosticWindows`. Render only those bounded
frames or short clips, repair the owning source, recapture the affected trace,
and rerun the lint. Do not sample unrelated frames. An intentional exception
must name the finding code, affected element, exact reason, and bounded window;
never waive an error by calling it aesthetic.

Run the full-composition lint once after integration because cross-block seams
and accumulated layout are not visible in isolated units. Do not rerun an
unchanged passing trace during delivery; identity comparison is enough.
