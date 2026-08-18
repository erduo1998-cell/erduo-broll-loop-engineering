# Motion and layout lint

Use this reference only in a backend Builder. It replaces routine
AI inspection of repeated stills. Representative moving scenes provide the
early visual-lock decision; the identity-bound complete preview provides the
final human aesthetic decision.

## What the lint can establish

`scripts/motion-layout-lint.mjs` consumes runtime-captured element geometry.
The normal first pass samples Recipe beat boundaries, readable holds, scene
cuts, and only the mechanism-specific points needed to prove the declared
change. It can report:

- discontinuous position, scale, size, or opacity changes;
- hard transition edges, abrupt acceleration changes, failure to settle, and
  excessive direction reversals;
- declared readable holds that are too short or still moving;
- most elements starting together or too many independent focus groups moving
  at once;
- focus-bearing elements outside the shared safe area;
- wholly off-canvas visible elements and strong unplanned overlap between
  independent groups;
- when supplied the validated Shot Recipe directory, whether every planned
  non-still beat is bound to a non-decorative rendered action and produces an
  actual rendered geometry, visibility, or captured appearance change;
- for a Recipe selecting a `diagram-*` craft entry, whether every readable
  hold includes actual rendered node/connector/connector-label geometry, and
  whether labels touch paths or nodes, connectors cross unrelated nodes, two
  connectors share a path, or diagram geometry leaves the canvas.

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
2. seek the real runtime first to Recipe beat boundaries, readable holds, scene
   cuts, and the smallest additional samples required by the mechanism;
3. after layout and paint settle for that requested frame, capture each marked
   element's canvas-space rectangle and effective opacity;
4. when geometry cannot express a material-state or attention change, capture
   a SHA-256 of computed visible styling such as fill, stroke, color, filter,
   clip, or path state; exclude text content and hand-authored evidence labels;
5. bind the trace to the exact Builder unit source identity and validate it
   against `references/runtime/motion-layout-trace.schema.json`;
6. run `motion-layout-lint.mjs --trace <trace> --recipes <assigned-recipes>` and
   preserve its compact JSON result outside production source.

When the Recipe's primary craft ID begins with `diagram-`, use trace schema
`1.1.0` and add one `diagramFrames` entry inside every readable hold. Capture
node rectangles, connector polylines, and connector-label rectangles from the
same rendered DOM or scene at that exact frame. Connector labels are separate
from labels intentionally contained inside nodes. The check rejects contact
or collision only; it does not prescribe diagonal versus orthogonal lines,
node shapes, spacing grids, palette, number of nodes, or a house style.

The Recipe directory is mandatory for a Builder pass. The lint maps each
Recipe beat into its rendered shot window. A non-still beat passes only when a
primary, secondary, text, or structural element explicitly binds its motion to
that beat and the captured runtime state actually changes. A progressive
continuous subject action may fulfill a beat when its end state advances;
ambient, looping, unbound, or decorative motion cannot. An explicit
`deliberate-stillness` beat needs no fabricated movement.

Once a non-still beat produces its bound, non-decorative state change, the
resolved state may remain still for settling or reading. Unchanged duration is
not a defect and must never trigger dense capture or a request for more motion.
The lint checks whether the declared change happened, not whether the screen
keeps changing.

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

`status: pass` with Recipe evidence requires no still, clip, AI visual analysis,
or prose QA report.
Store the one-line result locator in the compact receipt.

`status: attention` returns `diagnosticWindows`. Render only those bounded
frames or short clips, escalate only those windows to dense or per-frame trace
when necessary, repair the owning source, recapture the affected trace,
and rerun the lint. Do not sample unrelated frames. An intentional exception
must name the finding code, affected element, exact reason, and bounded window;
never waive an error by calling it aesthetic.

Run the sampled lint once for each Builder assignment before accepting its
media. Exact connector/path evidence, complex Canvas/WebGL, or an explicit user
requirement may begin with dense capture. Do not rerun
an unchanged passing unit trace during Parent assembly or delivery; source and
media identity comparison is enough. Cross-unit rhythm and seams remain visible
in the one complete moving preview rather than being claimed by a source lint.

No passing path generates an all-frame PNG sequence. This check rejects a paper
plan whose declared non-still beat produces no rendered subject change. It does
not punish a stable result, readable hold, or settled tail, and it never asks a
Builder to add ambient or continuous movement. It does not prove that a metaphor is
understandable, a diagram is the right explanation, a rhythm feels right, or
an animation is beautiful; those remain creative judgments in the final moving
preview.
