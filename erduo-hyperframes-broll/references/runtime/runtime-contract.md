# Runtime-neutral shot contract

Use this reference only when authoring, classifying, adapting, or reviewing a
runtime-neutral shot recipe. It does not change the default production chain.

## Current release boundary

- HyperFrames remains the default and only production backend established by
  this release.
- Remotion is an experimental backend boundary, not a bundled backend. This
  Skill does not install, authorize, configure, invoke, or render with
  Remotion.
- Do not claim Remotion/HyperFrames visual parity, timing parity, or render
  parity. A later backend-and-witness milestone must validate each claim with
  real source, dependencies, licenses, renders, and comparison evidence.
- Do not import shot cards, runtime source, media, fonts, sounds, or other
  third-party artifacts through this contract.

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

Classification is routing metadata, not evidence that an adapter works. Check
the entry's verification state. A contract-only or unverified entry cannot
support a cross-runtime compatibility claim. It does not disable the existing
HyperFrames production workflow when the entry's `hyperframesRoute` explicitly
names `existing-production-workflow` or `existing-production-contract`; that
route is a manual, runtime-owned implementation under the existing production
Skills, not evidence that an automatic adapter or Remotion equivalent exists.

Reject a recipe before build when it names an absent capability, requires an
unsupported capability, or targets a runtime that the capability cannot
serve. Do not silently simplify. Use the recipe's declared fallback or return
the decision to the Director.

## Adapter obligations

An eventual runtime adapter must:

1. validate the recipe and its integer-millisecond invariants;
2. resolve every required capability against the matrix;
3. preserve the shot window, semantic purpose, initial state, result state,
   focus order, readable hold, and material roles;
4. produce deterministic output for any requested time in the shot;
5. keep runtime source, configuration, dependency locks, and build evidence in
   its own output area;
6. report unsupported or lossy mappings instead of inventing equivalence;
7. record the runtime version, adapter version, time-conversion policy, and
   exact recipe identity used.

Use [remotion-hyperframes-map.md](remotion-hyperframes-map.md) only while
designing or reviewing an adapter. It is a concern map, not executable porting
instructions.

## Evidence gates

Keep these milestones separate:

1. **Contract:** schema, classification vocabulary, and review rules exist.
2. **Backend:** an adapter and its dependencies are explicitly added, licensed,
   installed, and tested.
3. **Witness:** the same recipe has real runtime-owned implementations and
   reproducible renders for the claimed route.
4. **Comparison:** objective timing, seek, media, and visual checks have run;
   accepted differences are documented.

This release establishes only the contract milestone. Until later milestones
are present, keep HyperFrames production behavior unchanged and describe
Remotion support as experimental and unavailable for production.
