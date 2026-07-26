# Director all-shot deterministic facts packet contract

## Purpose and authority

The director produces the compatible `erduo-director-method-v1` artifact,
normalized shot plan, one plan-bound `design_slice`, canonical design
selection/selected-template content, the real project-local font package, one
paginated `visual_grammar_program` and the full-film authoring rules. This
packet lets assets and the later authoring cluster deterministically reopen all
planning facts. It is not a visual-review packet and does not create a parent
`shot_plan_review`.

The packet is valid only in a run with `pipeline_contract_version: 2`. It binds
the exact director manifest, shot plan, design slice, validated display-font
selection and shared frame-projection receipt. Time fields and their binding
come from the [design-slice contract](design-slice-contract.md); this packet
does not create another timeline or projection rule.

## Private artifacts

One director manifest contains at least these separately hashed artifacts:

- the compatible `director_method`;
- the normalized, SRT-bound shot plan;
- the validated `design_slice`;
- the complete validated `display_selection`;
- the validated `director-briefs` and exact `design-selection-context`;
- the canonical design-selection artifact and exact selected-template bytes;
- the complete packaged runtime design library and deterministic
  design-selection replay receipt;
- the real project-local font package, prepared after display selection and
  before visual grammar, plus its local font bytes/manifest;
- the shared frame-projection receipt consumed by the design slice;
- the complete validated paginated `visual_grammar_program`;
- the complete validated `whole_film_rules`;
- the design capability registry identity and validator receipts;
- one all-shot design-review artifact, or deterministic pages when the bounded
  artifact would exceed the structured-artifact limit.

Every artifact uses an opaque `artifact_id` and private `locator_key` under the
artifact-manifest contract. Absolute paths, file URLs, raw SRT text and
credentials are forbidden.

## Path-free packet index

The parent-facing packet index is canonical JSON no larger than the existing
8 KiB review-receipt limit. It contains:

```text
schema_version: 1
pipeline_contract_version: 2
parsed_srt_sha256
shot_plan_sha256
design_slice_sha256
display_selection_sha256
projection_sha256
director_briefs_sha256
design_selection_context_sha256
design_selection_sha256
design_selection_replay_sha256
selected_template_sha256
design_library_snapshot_sha256
font_package_sha256
visual_grammar_program_sha256
whole_film_rules_sha256
registry_version
shot_count
packet_sha256
pages[]
```

The packet cannot contain the final manifest hash because the packet is itself
an artifact hashed by that manifest. Every consumer supplies the non-circular
binding by reopening the subject manifest, resolving the canonical packet and
all pages, then comparing their actual byte hashes.

Each page entry contains only
`{artifact_id, sha256, size_bytes, shot_start, shot_end}`. Page ranges are
ordered, non-overlapping and cover `S001…SN` exactly once. Each resolved page
is canonical structured JSON within the artifact-manifest contract's
structured-artifact byte limit. `packet_sha256` binds the canonical index
without its own hash field.

The index is not a substitute for the pages. A consumer that cannot resolve and
hash-check every page must reject the chain.

## Required all-shot row

Each shot appears exactly once and the row must make the design decision
inspectable without loading private source documents. It shows:

- shot ID, semantic claim, authoritative SRT millisecond window and its derived
  frame window;
- composition family, registry evidence status and a content-specific reason;
- a simple normalized geometry thumbnail covering composition, focus, ordered
  reading path, protected regions and every owned negative-space region;
- the five per-shot Style DNA relationship applications;
- explicit title/copy lines, hierarchy, type bboxes, selected local font IDs
  and immutable display-font use, plus a content-specific reason for the
  hierarchy, line breaks, font roles and any special type mode;
- planned ordinary-material role and subject/title relationship;
- motion grammar, content-specific reason, entry/action/result/hold/exit
  lifecycle and readable result;
- composition, primary-action, focus and geometry signatures, plus the
  content-specific novelty basis and any continuity exception;
- prohibited directions and a direct statement that no deferred layered field
  is present.

A family/grammar ID, generic style adjective, route count or novelty claim
without the content-specific relationships and blueprint is invalid.

## Validation and freezing

Before freezing the manifest, the producer must:

1. validate and normalize the shot plan against the parsed SRT;
2. validate the design slice against
   `references/design-capability-registry.json` while supplying the exact
   shared projection artifact through the validator's required
   `--projection` input;
3. run `validate-anti-template-signatures.mjs` on that validated slice and
   resolve every deterministic full-film signature conflict; this result has
   no visual-approval authority;
4. replay design selection from the actual validated briefs/context, the
   complete currently loaded packaged library and the exact run-state-bound
   options; reject any substituted or self-consistent re-signed selection
   before VGP validation;
5. verify identical shot IDs/count, plan hash, SRT binding, display-selection
   hash, canonical design-selection/template hashes, real font-package hash,
   visual-grammar/rules hashes and shared projection binding across the frozen
   artifacts;
6. recompute every private artifact and packet/page SHA-256 from frozen bytes;
7. reject Scene Kit, hero-shot quota, layer, matte, depth, clean-plate,
   alpha-decomposition and host-specific fields.

Validator success proves only deterministic completeness and internal
coherence. It does not prove how an unimplemented composition, typography or
motion will look.

## Downstream facts boundary

Assets and authoring partitioning reopen the subject manifest, packet and every
page and bind:

```text
parsed_srt_sha256
shot_plan_sha256
design_slice_sha256
display_selection_sha256
projection_sha256
director_briefs_sha256
design_selection_context_sha256
design_selection_sha256
design_selection_replay_sha256
selected_template_sha256
design_library_snapshot_sha256
font_package_sha256
visual_grammar_program_sha256
whole_film_rules_sha256
packet_sha256
page_sha256s
```

The deterministic boundary rejects missing shots, SRT/projection disagreement,
incomplete material needs, invalid local-font selection, missing lifecycle
facts, unresolved signature conflicts, route violations, deferred layered
fields and internal logical contradictions. It must not claim that title
hierarchy, cards, grids, material fusion or animation pixels are visually good
before source exists.

A changed plan, design slice, canonical selection/template, display selection,
font package, visual grammar, rules, projection, packet or page invalidates
assets and every authoring chunk. Legacy `shot_plan_review` records remain
inspectable but are not required or resumable on the active topology.
