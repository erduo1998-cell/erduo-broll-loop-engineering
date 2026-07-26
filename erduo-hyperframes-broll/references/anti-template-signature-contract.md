# Anti-template signature contract

Status: QAR-009 deterministic contract  
Runtime: pipeline contract version 2  
Validator: `scripts/validate-anti-template-signatures.mjs`

## Purpose and authority

This gate rejects measurable repetition in one already validated non-layered
design slice. It runs after `validate-design-slice.mjs`, which remains
responsible for the exact shared SRT-to-frame projection, normalized geometry
and per-shot shape.

The result has `authority: deterministic-signature-conflict-only`. A pass means only that
the declared and recomputed signature facts do not cross the frozen repetition
limits. It does not approve composition, typography, motion, material
integration, novelty or visual quality. The qualified main agent must still
inspect actual target-raster packets and pixels.

The contract does not define or permit Scene Kits, layers, hero-shot quotas,
mattes, depth maps, clean plates or alpha decomposition.

## Recomputed facts

For every shot the validator derives two comparable fingerprints:

1. `complete_signature_sha256` binds the declared composition, primary-action
   and focus signatures to the recomputed normalized geometry signature.
2. `surface_core_sha256` binds recomputed structural geometry quantized to
   five-percent target-raster cells, motion grammar and lifecycle eighths, and
   typography role/mode topology. Self-authored family/action/focus labels and
   DOM element IDs are excluded here so relabelling them cannot evade the
   surface test. A slight position or timing nudge is also insufficient to
   claim a new composition.

Readable copy is fingerprinted separately. Color, border radius, icon
substitution and rationale prose are deliberately excluded from novelty
evidence: changing them cannot establish a new composition. Actual source and
pixels may reveal additional sameness, but only main-agent visual review owns
that judgment.

## Explainable full-film thresholds

A complete signature is high-frequency when either:

- it occurs at least three times and covers at least one fifth of all shots; or
- it occurs at least eight times and covers at least one eighth of all shots.

Five occurrences in a one-hundred-shot film therefore do not fail. The first
rule catches dominant repetition in short and medium videos. The second catches
meaningful long-form recurrence without treating a five-percent motif as a
template.

A surface core is intentionally allowed more recurrence than a complete
signature. It is high-frequency only when it occurs at least four times and
covers one quarter of the film, or at least ten times and covers fifteen
percent of the film.

The validator rejects:

- a high-frequency complete signature with an unexplained non-adjacent reuse;
  and
- a high-frequency surface core with more than one readable-copy fingerprint.

These rules extend, rather than replace, the design-slice gate that already
rejects adjacent composition/action/focus repetition, adjacent unchanged
geometry with changed copy, and more than two consecutive uses of one family.

## Bounded continuity exception

`{content_driven: true, reason, semantic_link}` may explain one adjacent
two-shot continuity pair or one later recurrence of the same complete
signature. The later shot owns the exception. An exception:

- cannot begin on the first shot;
- cannot be chained into a three-shot run;
- must point back to an earlier matching complete signature;
- cannot reuse one `semantic_link` or copy one normalized `reason`; and
- may explain an exact recurring motif, but never exempts surface-variant
  reuse where only copy or non-structural skin changes.

This is a structural bound, not a script judgment that the reason is tasteful
or true. The main agent decides whether the claimed continuity is visually and
semantically justified.

## Existing QAR gates are reused

This validator does not duplicate HyperFrames or media parsers. QAR regression
must aggregate the existing authoritative gates:

| Fact | Existing authority | Existing regression |
|---|---|---|
| `30000/1001` millisecond-to-frame projection | `compile-frame-projection.mjs` + `validate-design-slice.mjs` | `test-compile-frame-projection.mjs`, `test-validate-design-slice.mjs` |
| direct/fresh, zero-origin, end-origin and random-origin seek equivalence | `validate-master-build-v2-chain.mjs` | `test-validate-master-build-v2-chain.mjs` |
| exact raster/fps/codec/audio delivery profile | `validate-master-build-v2-chain.mjs` | `test-validate-master-build-v2-chain.mjs` |
| ordinary-primary resolved-pixel ROI contribution | `roi-material-contribution.mjs` + master-build v2 chain | `test-roi-material-contribution.mjs`, `test-validate-master-build-v2-chain.mjs` |
| complete legacy M10 source signature | master-build v2 source gate | `test-validate-master-build-v2-chain.mjs` |
| legacy state, manifest, receipt and bindings resume | their version-2 inspectors/validators | `test-state.mjs`, `test-artifact-manifest.mjs`, `test-stage-receipt.mjs`, `test-validate-master-bindings.mjs` |

Passing any one of these facts cannot substitute for the others and cannot
issue a main-agent visual approval.
