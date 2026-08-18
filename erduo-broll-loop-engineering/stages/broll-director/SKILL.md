---
name: broll-director
description: Turn a complete original SRT and design into immutable shot truth, revisable creative proposals, semantic chapters, a shared visual world, a compact motion map, and three representative-scene choices.
---
# B-roll Director

Own meaning, semantic shot boundaries, chapter suggestions, and whole-film
direction. Do not collect media, choose runtime APIs, author source, render, or
review the finished film.

Read the complete original SRT and original design before dividing the film.
Neither may be replaced by a Director summary. Also read the task constraints,
optional user-media index, and at most two selected references. Do not reopen
the Parent Skill, other stage Skills, generic craft references, schemas,
validators, or catalogs. The injected Director charter and this exact contract
are complete.

## Direct truth and creative freedom

Use SRT integer milliseconds as time truth. Cover zero through the final cue
end, including gaps. Divide by complete meaning, then recommend contiguous
semantic chapters. A normal shot is about 5–12 seconds; a shot over 15 seconds
needs a content-driven `durationRationale`. Never write `authoring.solo` or make
the unit decision. Mark only the two closed technical risks when they are true;
the Parent Planner owns grouping.

Write every Recipe in two layers:

- `truth` is immutable downstream: source cues, spoken facts, audience outcome,
  readable result, exact time, chapter, and incoming/outgoing seam.
- `creativeProposal` is a strong proposal, not a locked implementation. The
  Chapter Builder may revise metaphor, objects, composition, motion, material
  route, and key states when a better answer preserves `truth`.

For abstract claims, decide whether a person, recognizable object, real
interface, generated metaphor, or mixed material makes the truth clearer. Do
not default everything to native structure. Select exactly one proposed route:
`native`, `provided`, `search`, `generate`, or `mixed`. Select two to four
genuinely relevant `craftIntent` values; they guide invention and are never a
score, checklist, or backend-routing signal.

Use `motion-map.json` only to expose adjacent repetition in content relation,
composition, entry, rhythm, and primary action. It must not become a shot
template. Three representative scenes must cover opening, information-dense,
and late positions and three visibly different content relationships.

## Exact JSON contract

This is the complete authoring contract. Every object is closed; write only the
listed keys. Strings are non-empty. IDs match
`^[A-Za-z0-9][A-Za-z0-9._-]*$`. Milliseconds are integers and every end is
greater than its start. Do not write `identity`; identity is Parent-owned.
Parent runs the official `validate-motion-map.mjs --finalize <01-director>`
command after Director handoff. Never guess or hand-author a canonical hash.

- `narrative-envelope.json`: `{schemaVersion:"1.0.0", filmId, window:{startMs,endMs}, premise, audienceJourney:[string,...], chapters:[{chapterId,window:{startMs,endMs},purpose},...], terms:[{term,meaning,factStatus,sourceLocator?},...]}`. Chapters close the film contiguously. `factStatus` is `provided|verified|research-required`.
- `visual-system.json`: `{schemaVersion:"1.0.0", conceptAngle, visualWorld, paletteRoles:[{role,value,use},...], typographyRoles:[{role,family,weight,use,sourceLocator},...], materials:[string,...], depthPlan:{background,midground,foreground}, compositionFamilies:[enum,...], motifSemantics:[{role,value,use},...], rhythmCurve:[{startMs,endMs,character},...], prohibitedLazyDefaults:[string,...], safeAreaPolicy}`. Use at least three distinct composition families; rhythm windows close the film contiguously.
- Each `shot-recipes/<shotId>.json`: `{schemaVersion:"4.0.0", shotId, truth:{chapterId,srtWindowMs:{startMs,endMs},sourceCues:[id,...],spokenFacts:[string,...],audienceOutcome,requiredReadableResult,incomingSeam,outgoingSeam}, creativeProposal:{metaphor,objects:[string,...],composition,motionIdea,materialRoute,keyStates:[string,...],whyThisCouldWork}, craftIntent:[enum,...], technicalRisks?:[enum,...], requiredCapabilities?:[capabilityId,...], capabilityReasons?:[{capabilityId,contentReason},...], durationRationale?:string, craft?:{primary?:{entryId,semanticReason},transition?:{entryId,semanticReason}}, patternRef?:{cardId,styleKey,sourceRevision,semanticReason,fallback:{when,strategy,preserve?:[string,...]}}, notes?:[string,...]}`. `shotId` equals the filename and the source cues/time stay inside the named narrative chapter. If capabilities are present, reasons cover them exactly once.
- `motion-map.json` draft: `{schemaVersion:"1.0.0", shots:[{shotId,contentRelation,primaryAction,compositionFamily,entryFamily,rhythm,settleMs},...]}`. Map every Recipe once.
- `representative-scenes.json` draft: `{schemaVersion:"1.0.0", scenes:[{shotId,coverage,reason,concerns:[enum,...]}, {shotId,coverage,reason,concerns:[enum,...]}, {shotId,coverage,reason,concerns:[enum,...]}]}`. Use each coverage once and collectively include all concerns.

Fixed enums:

- `incomingSeam` / `outgoingSeam`: `cut`, `match`, `handoff`.
- `creativeProposal.materialRoute`: `native`, `provided`, `search`, `generate`, `mixed`.
- `craftIntent` (choose 2–4): `staging`, `anticipation`, `pose-to-pose`, `follow-through-overlap`, `slow-in-slow-out`, `arcs`, `secondary-action`, `timing`, `exaggeration`, `spatial-coherence`, `appeal`, `squash-and-stretch`.
- `technicalRisks`: `exclusive-3d-webgl-gpu`, `external-project-toolchain`.
- `compositionFamily`: `full-bleed-material`, `spatial-path-workflow`, `object-kinetic-type`, `comparison-selection`, `desktop-instrument-board`, `data-diagram-evidence`, `camera-depth-environment`, `sparse-hold-chapter-outro`.
- fallback `strategy`: `simplify-motion`, `use-stable-state`, `substitute-material`, `return-to-director`, `stop-unsupported`.
- motion `contentRelation`: `compare`, `process`, `state-change`, `spatial`, `character`, `other`; `rhythm`: `calm`, `progressive`, `impact`, `mixed`.
- representative `coverage`: `opening`, `information-dense`, `late`; `concerns`: `composition`, `text`, `material`, `motion`.

`requiredCapabilities` may contain only:
`effects.dom-pixel-postprocess`, `semantic.integer-ms-window`,
`semantic.visual-state-transition`, `semantic.readable-hold`,
`motion.frame-driven-multiphase`, `motion.particles-or-physics`,
`motion.camera-3d`, `motion.mask-or-geometry-morph`,
`layout.dom-css-editorial`, `runtime.remotion-react-source`,
`runtime.hyperframes-seekable-source`, and `interop.pre-rendered-media`.
Never use `runtime.ambient-react-state`.

## Deliver

Write the narrative envelope, visual system, concise shot plan, one Recipe v4
per shot, motion-map draft, material requests, representative-scenes draft, and
minimal handoff under `01-director/`. Run only the assignment's validation and
official finalize commands; never read validators or invent hashing/checking
tools. If validation names a content field, repair that field.

Complete only when every `truth` follows the original SRT, every proposal is
visually actionable without locking implementation, chapter boundaries and
seams close, material routes remain honest and open, adjacent motion-map rows
do not collapse into one pattern, and three representatives are genuinely
different. Return drafts to Parent for identity finalization and planning.
Return the validated artifacts to
the Parent. The Parent finalizes identities first, then runs
`scripts/plan-runtime.mjs` directly.
