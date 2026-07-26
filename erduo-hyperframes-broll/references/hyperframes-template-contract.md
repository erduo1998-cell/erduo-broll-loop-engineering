# HyperFrames neutral scaffold contract

## Authority and purpose

`assets/hyperframes-template/` is the version-2 structure-only starting point
for `broll-master-build`. Its profile is
`structure-only-neutral-v1` and its cross-pipeline identity is
`pipeline_contract_version: 2`.

The scaffold is not a composition design, a template family, a sample scene or
a creative HTML compiler. The master-build producer copies it and then uses
the official HyperFrames authoring skills to replace the empty root with the
approved design slice and flat Shot Kits. Project scripts may validate,
package and inspect the result, but cannot pour content into a fixed visual
skin.

The placeholder one-second, 1920×1080 root only makes the directory a
well-formed project before authoring. Master-build must replace duration and
raster from the approved projection/profile. Neither value is design
authority.

## Required baseline

The unopened scaffold must contain:

- one `index.html` with exactly one empty `#root`;
- `data-composition-id="main"`;
- `data-no-timeline` while the pristine root has no authored motion;
- `data-scaffold-profile="structure-only-neutral-v1"`;
- `data-pipeline-contract-version="2"`;
- finite positive placeholder duration and dimensions;
- only a box-model reset, canvas bounds, overflow containment and transparent
  background;
- no bundled runtime, font, media, component, scene or sample content;
- `meta.json` with the same scaffold profile and pipeline version;
- a private package with only pinned HyperFrames CLI commands;
- local composition/component/asset path declarations, with no remote registry
  override.

The baseline validator applies to the pristine copied scaffold. Once official
authoring has populated the project, the source, font, asset, binding, seek and
pixel gates own the resulting composition; the populated project is not
expected to remain empty.

## Authored timing handoff

The scaffold has no time authority. Master-build consumes the director's
approved integer-millisecond SRT windows and their one shared rational frame
projection. It derives clip starts, durations and the root end from that
artifact; no producer may independently divide milliseconds, round each shot
or hand-edit a frame boundary. A non-zero first SRT timestamp remains a real
empty interval from root time zero rather than being shifted away.

## Forbidden baseline signatures

The neutral scaffold fails if its runtime source includes any of the following:

- remote or inline JavaScript, remote stylesheet, CSS import, network fetch,
  remote media, iframe, object or embedded runtime;
- a palette, opaque canvas color, gradient, glow, shadow, orb, card, HUD,
  decorative radius, sample component or full-frame treatment;
- grid/flex/centering/alignment rules, columns, panels or any other layout
  topology;
- visible placeholder words, numbers, icons or labels;
- a font face, font family, bundled font or fallback stack;
- Scene Kit, layered hero, layer/matte/depth/clean-plate/alpha-decomposition
  fields or defaults.

Scene Kit and layered delivery remain deferred. An ordinary image or video may
later be cropped, treated and combined with native auxiliary information; that
future authored composition is still one flat composition and is outside this
baseline scaffold check.

## Validation

Run:

```bash
node scripts/validate-neutral-scaffold.mjs assets/hyperframes-template
```

The command checks actual local files and returns a path-free JSON receipt. A
passing receipt proves only that the starting scaffold has no default visual
signature or remote runtime. It does not prove a future authored composition,
pixel contribution or visual quality.

`scripts/build-m10-composition.mjs` is retained only as a legacy M10 regression
fixture. It is not the version-2 production scaffold and cannot satisfy this
contract or official-authoring evidence.
