# Runtime-neutral shot contract

Use this reference when selecting, authoring, adapting, or reviewing one of
the two independent production backends for a runtime-neutral shot recipe.

## Production boundary

- HyperFrames remains the default production backend for a genuinely new
  project whose user did not choose a runtime.
- Remotion is an independent production backend selected by explicit user
  choice or unambiguous existing-project evidence. It is not a translation
  through HyperFrames.
- Run and preserve the deterministic router described in
  [runtime-selection.md](runtime-selection.md) before onboarding. Explicit
  choice wins; mixed evidence is `action-required`; never infer from a
  directory name.
- Remotion selection is not readiness. Require direct declarations and local
  installations of matching `remotion` and `@remotion/cli` versions plus a
  successful project-local CLI version probe. Never download a CLI during
  detection or substitute a global executable.
- Do not claim Remotion/HyperFrames visual parity, timing parity, or render
  parity. Each route must prove its own source, dependency, preview, render,
  and media facts. Cross-runtime parity requires a separate comparison.
- The bundled Shotcraft catalog imports pinned runtime-neutral card knowledge
  and separately manifest-pinned Remotion reference TSX under Apache-2.0. The
  reference source is not installed or executed in place and includes no
  dependency tree, preview media, external textures, fonts, or sounds.

## Shotcraft pattern references

Treat `references/shotcraft/catalog.json` and its card bodies as progressively
loaded knowledge, not production source. Start with catalog statistics, use a
category-filtered list or directed search, then read only a selected card with
`scripts/query-shotcraft.mjs`. Do not load the catalog or all cards into one
agent context.

A Shot Recipe may contain one optional `patternRef`. When present, it records
one stable card ID, one style key belonging to that card, the catalog's pinned
40-character upstream Git commit in `sourceRevision`, a content-specific
semantic reason, and a runtime-neutral fallback. Omit `patternRef` when no card
improves the shot; never use a sentinel `none` card. Pattern timing expressed
as upstream frames is tuning history only and must be rewritten as absolute
integer milliseconds inside the actual Recipe window.

Pattern selection does not prove backend support, install dependencies, or
establish a verified component. The selected runtime's Builder reads only the
selected card and implements its motion grammar natively. A HyperFrames
Builder follows the official HyperFrames Skills. A Remotion Builder may adapt
only the selected card's manifest-pinned reference TSX into the production
project, must replace missing media with Assets-stage files, and must preserve
Apache-2.0 attribution when substantial source remains. It never imports or
executes production code from the installed Skill directory. Migrating
existing source between runtimes remains a separate user-requested workflow.

## Separate semantic intent from runtime source

The canonical recipe describes what a shot must communicate and what visible
states must occur. It may name semantic requirements, materials, motion
phases, readability, and fallback behavior.

The canonical recipe must not contain:

- React, TSX, hooks, components, Remotion props, frame calculations, or package
  configuration;
- HyperFrames markup, registry blocks, DOM selectors, animation-library calls,
  CLI arguments, or project configuration;
- runtime-specific paths, generated source, installation instructions, or
  dependency versions;
- copied third-party implementation code or embedded licensed assets.

Keep runtime selection and generated runtime source outside the canonical
recipe. An adapter consumes a validated recipe and writes a separate,
runtime-owned artifact. Never write adapter output back into the recipe.

## Canonical time

Use parsed SRT integer milliseconds as the sole time truth.

- `window.startMs` is inclusive and `window.endMs` is exclusive.
- Require `endMs > startMs`.
- Store every phase and readability boundary as an absolute integer
  millisecond on the same production timeline.
- Require phases and readability windows to stay inside the shot window.
- Do not store frames, floating-point seconds, runtime ticks, or values derived
  from a runtime's frame rate in the recipe.
- Convert milliseconds to runtime-native time only inside an adapter. Define
  and record the adapter's rounding policy with its output.

JSON Schema cannot express every ordering and containment rule above. The
recipe validator or owning stage must enforce them before adapter dispatch.

## Capability routing

Read [capability-matrix.json](capability-matrix.json) only when a recipe names
`requiredCapabilities` or a runtime route is being reviewed. Use exactly one
classification per listed capability:

- `portable`: the semantic requirement is intended to have independent native
  implementations for both runtimes;
- `native-remotion`: the requirement is intentionally Remotion-specific;
- `native-hyperframes`: the requirement is intentionally
  HyperFrames-specific;
- `interop`: the runtimes exchange a frozen artifact instead of translating
  the implementation;
- `unsupported`: no approved deterministic route exists.

Classification is routing metadata, not evidence of parity. Check the entry's
verification state. A contract-only entry cannot support a cross-runtime
compatibility claim. A named `existing-production-workflow` or
`native-production-workflow` is an independent runtime-owned implementation;
it does not prove an automatic adapter or equivalence with the other backend.

Reject a recipe before build when it names an absent capability, requires an
unsupported capability, or targets a runtime that the capability cannot
serve. Do not silently simplify. Use the recipe's declared fallback or return
the decision to the Director.

## Backend obligations

Every runtime-owned Builder and Integrator must:

1. validate the recipe and its integer-millisecond invariants;
2. resolve every required capability against the matrix;
3. preserve the shot window, semantic purpose, initial state, result state,
   focus order, readable hold, and material roles;
4. produce deterministic output for any requested time in the shot;
5. keep runtime source, configuration, dependency locks, and build evidence in
   its own output area;
6. report unsupported or lossy mappings instead of inventing equivalence;
7. record the runtime version, stage-contract version, time-conversion policy,
   and exact recipe identity used.

For Remotion, convert each absolute millisecond boundary with the project FPS
and one declared deterministic rounding policy. Use Remotion's frame-driven
APIs, register the final Composition explicitly, run TypeScript/build checks,
and use only the verified project-local CLI for stills and rendering. Do not
write frames back into the canonical Recipe.

Use [remotion-hyperframes-map.md](remotion-hyperframes-map.md) only while
designing or reviewing an adapter. It is a concern map, not executable porting
instructions.

## Evidence gates

Keep these claims separate:

1. **Selection:** router output identifies one runtime without guessing.
2. **Readiness:** required local dependencies, CLI, renderer, media tools, and
   permissions are proven for that runtime.
3. **Backend:** the selected runtime owns deterministic source, integration,
   preview, and render commands for the exact Recipes.
4. **Witness:** that runtime's real composition renders reproducibly and passes
   its declared technical checks.
5. **Comparison:** only when requested, both runtime witnesses pass objective
   timing, seek, media, and visual comparisons with accepted differences
   documented.

This release establishes independent production routes, not automatic source
translation or visual parity. A failure in one route must not be hidden by
silently switching to the other.
