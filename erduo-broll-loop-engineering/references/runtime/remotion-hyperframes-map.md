# Remotion and HyperFrames concern map

Read this file only when designing or reviewing a runtime adapter. This map
does not install either runtime, provide porting code, or claim that matching
renders exist.

## Mapping boundary

Map a validated semantic recipe independently into each runtime. Do not use
Remotion source as the canonical representation and do not treat a mechanical
TSX-to-HyperFrames rewrite as the compatibility layer.

```text
validated semantic recipe
├── Remotion adapter        -> Remotion-owned source and evidence
└── HyperFrames adapter      -> HyperFrames-owned source and evidence
```

New production projects default to HyperFrames. Remotion is explicit opt-in or
canary, and auto planning is experimental until both runtimes have the same
creative viewing-and-revision loop. Both branches are independent production concerns. The Parent's deterministic planning script
assigns a shot only from exact capability or pattern/backend evidence;
targeted readiness then verifies the required dependencies, licenses, source
path, and witnesses.

## Concern mapping

| Concern | Runtime-neutral recipe | Remotion adapter responsibility | HyperFrames adapter responsibility |
| --- | --- | --- | --- |
| Time truth | absolute integer milliseconds | convert milliseconds to frame evaluation with a declared rounding policy | convert milliseconds to the runtime timeline without changing shot boundaries |
| Shot window | inclusive `startMs`, exclusive `endMs` | place runtime-owned composition or sequence inside the exact window | place runtime-owned composition or track inside the exact window |
| Visual state | initial state, result state, focus order | reconstruct every state from requested time | make every state deterministic and seekable from requested time |
| Motion | semantic phases and visible change | choose runtime-native interpolation or composition logic | choose a supported seek-safe timeline or keyframe implementation |
| Readability | absolute hold window and readable items | preserve stable readable output through the declared window | preserve stable readable output through the declared window |
| Material | semantic role and acceptable kinds | resolve a frozen local asset through runtime-owned source | resolve the same frozen local asset through runtime-owned source |
| Text and fonts | selective copy plus font role | load project-local licensed fonts in the runtime project | load project-local licensed fonts in the HyperFrames project |
| Composition reuse | capability ID and semantic requirements | select a verified Remotion-owned implementation | select a verified HyperFrames-owned implementation |
| Runtime state | none in canonical recipe | avoid ambient state that cannot be reconstructed from time | avoid hidden mutable state that breaks deterministic seek |
| Output evidence | expected semantics and time windows | Builder owns check, frozen-unit render, and media facts | Builder owns official check, frozen-unit render, and media facts |

## Non-mechanical mappings

Treat the following as design reviews, not syntax substitutions:

- frame evaluation versus integer-millisecond timeline conversion;
- React component composition versus HyperFrames composition and track
  structure;
- hooks, effects, context, or mutable state versus deterministic state at an
  arbitrary seek time;
- runtime-specific media loaders, font loaders, package assets, and browser
  assumptions;
- physics, easing, random values, masks, filters, shaders, and third-party UI
  libraries;
- runtime-specific audio timing, metadata discovery, and asynchronous work.

If semantic behavior cannot be preserved independently, classify the required
capability as `native-remotion`, `native-hyperframes`, `interop`, or
`unsupported`. Do not label a lossy translation `portable`.

## Future witness review

For a future capability to advance beyond `contract-only`, preserve evidence
for each runtime independently:

- exact recipe and capability-matrix versions;
- runtime, adapter, dependency, and browser versions;
- dependency license and asset provenance review;
- declared millisecond-to-runtime conversion and rounding policy;
- deterministic start, action, result, readable-hold, and end observations;
- arbitrary seek checks, not only linear playback;
- actual check and render results with objective media facts;
- known visual or timing differences.

Only after both witnesses exist may a comparison run. Similarity evidence may
support a narrow documented claim; it must not be generalized into automatic
Remotion/HyperFrames render parity.
