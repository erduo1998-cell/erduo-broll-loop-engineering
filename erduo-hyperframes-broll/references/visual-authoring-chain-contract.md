# Visual authoring chain bridge

## Scope

`scripts/validate-visual-authoring-chain.mjs` is the deterministic orchestration
bridge between the frozen visual grammar, the existing chunk planner, asset
selection, block authoring, static style review and integration.

It is not a producer stage, a second chunk planner or a creative author. The
active identities remain:

```text
pipeline_contract_version: 2
authoring_topology_id: bounded-authoring-cluster-v1
```

The existing deterministic `authoringPlan.chunks` planner is the sole
authority for boundaries. Planner identities remain `C001…C999`; bounded
runtime/WFR/style identities remain `B001…B999`. The bridge validates the
actual complete `authoringPlan`, then freezes the strict ordinal identity
projection `Cnnn ↔ Bnnn`. This mapping is not another plan.

Every B record binds `planner_chunk_id`, `planner_chunk_spec_sha256`,
`authoring_plan_sha256` and the canonical `identity_projection_sha256`.
Ordered shots and millisecond windows come byte-for-byte from the C record;
frames come only from the bound shared projection; namespace is exactly
`bnnn`; seam neighbors remain B IDs. Reorder, gap, rename, split, merge,
window drift, foreign chunk-spec hash or mapping-hash drift fails. The bridge
cannot choose a different boundary to improve aesthetics or scheduling.

## Director ordering

The director performs these operations in order:

1. freeze the display selection;
2. freeze the validated director briefs and exact selection context, load the
   complete packaged runtime library, replay the selection with the exact
   run-state-bound option and freeze its deterministic replay receipt;
3. run the existing project-local font preparation path over the complete
   visible-character set and freeze the real `font-package` artifact plus its
   local font bytes and manifest;
4. compile and validate the paginated `visual-grammar-program`, binding the
   actual font-package artifact SHA-256;
5. compile and validate `whole_film_rules`, binding the same package and
   program;
6. freeze all artifacts and deterministic receipts in the director manifest.

The font hash is never synthesized. A missing, stale or block-local package is
a hard failure. Blocks copy and independently validate the exact frozen bytes;
they do not prepare a variant.

## Asset recipe-use binding

`createAssetVisualGrammarBindings()` and
`validateAssetVisualGrammarBindings()` bind one actual Flat Shot Kit to every
shot recipe. The closed artifact records:

```text
director_manifest_sha256
design_selection_replay_sha256
visual_grammar_program_sha256
whole_film_rules_sha256
design_slice_sha256
flat_shot_kit_set_sha256
shot_count
shots[]
asset_visual_bindings_sha256
```

Each shot binds the exact recipe and Flat Shot Kit hashes plus three
deterministic application hashes:

- crop/attention geometry: subject, focal point, output crop, text-safe and
  protected regions, and result ROI;
- title relationship: typography and anchor-treatment recipe values plus the
  kit title relation;
- material treatment: material/texture and color recipe values plus route,
  media kind, treatment motion, palette, consumer element and target preview.

These hashes prove exact recipe/kit consumption and stale-data rejection. They
do not approve whether the crop, title or material looks good; that authority
remains with `asset_fact_review` and later static style review.

## Block binding and progressive disclosure

`bindVisualAuthoringChunkPlan()` receives the actual validated
`authoringPlan`, its hash reopened from the actual manifest, the director
selection-replay receipt, its asserted B identity projection, actual visual
grammar, whole-film rules, shared projection, validated design-slice document,
complete ordered Flat Shot Kit inputs and validated asset visual-binding
document. It validates the complete chain and adds one exact
`authoring_context` to each identity-projected block.
The plan policy must exactly equal the frozen WFR policy. Its complete ordered
shot/windows must exactly equal both projection and VGP recipes, while
concatenated C chunks must cover the same set once. A valid but substituted
plan, truncated prefix/suffix, smaller-policy regrouping, duplicate or omission
fails before B projection.
The context is reconstructed by `extractWholeFilmBlockContext()` and contains:

- the compact actual identity and anti-identity directives;
- all ten stable visual invariants;
- only that block's recipe bytes and original recipe hashes;
- exact global policies, timing truth, namespace and neighboring seam duties.

It excludes the complete program, page indexes, unrelated recipes,
provenance records, private locations and private author instructions.

Each block record additionally freezes, in allocated shot order,
`allowed_design_shot_sha256s[]`,
`allowed_flat_shot_kit_sha256s[]`,
`allowed_asset_visual_binding_sha256s[]` and
`scoped_materials_sha256` plus `block_authoring_context_sha256`. These are
reconstructed from the complete
validated upstream sets; callers cannot supply an independent per-block list.

`extractVisualBlockAuthoringPacket()` returns one block only and embeds one
self-contained `scoped_materials` object. For every allocated shot it carries
the exact design-shot record, complete Flat Shot Kit and asset visual-binding
row together with their canonical SHA-256 values. The object also binds the
full design-slice, kit-set and asset-binding identities, exact shot count/order
and `scoped_materials_sha256`, and declares:

```text
self_contained: true
exact_allocated_shot_set_only: true
undeclared_side_inputs_forbidden: true
```

A block producer must validate this packet before reading recipes or writing
source and may not load a replacement record through a side channel.
Re-signing, omitting, appending, reordering, swapping or substituting a design
record, kit, asset-binding row, context, recipe, boundary or namespace does not
pass reconstruction against the frozen complete inputs.

## Static style gate and retry

After every current block has passed the existing seven deterministic gates,
freeze its source-bound `entry/result/exit` stills and run
`measure-style-pixel-facts.mjs`. The qualified main agent then reads every
declared source and still and issues `style_conformance_review`.

`createStyleIntegrationAuthorization()` reconstructs the expected bindings
from the current block manifest/source hashes and reruns
`validateStyleConformanceReview()` with the operator-pinned trusted HyperFrames
capture runner. That runner re-renders the complete ordered entry/result/exit
schedule from actual source bytes, entrypoint, projection and renderer config;
the validator remeasures returned bytes and requires exact equality with the
submitted stills and frozen capture receipt. A missing runner, producer-owned
callback, mock receipt or stale config fails. It emits approval only when the result is
exactly approved. It binds:

```text
chunk_plan_sha256
authoring_plan_sha256
identity_projection_sha256
visual_grammar_program_sha256
whole_film_rules_sha256
design_slice_sha256
design_selection_replay_sha256
block_set_sha256
chunk_set_sha256
style_source_ledger_sha256
packet_index_bytes_sha256
style_conformance_review_sha256
style_validator_receipt_sha256
authorization_sha256
```

The authorization includes an exact ordinal C↔B source ledger. Every style
block source record and byte is independently projected against the actual
integration chunk manifest/source map; artifact ID, relative path, media type,
size, SHA-256, order, producer isolation and manifest identity must agree.

Any changed block, source, still, facts, packet, review, source ledger or
integration chunk invalidates the authorization. The integrator must call
`validateStyleIntegrationAuthorization()` against current bytes before
assembly and freeze the authorization as an integration input.

A `revision_required` review is grouped by owning `block_id`. It consumes that
block's one aggregate retry. Unchanged passing blocks may be reused. After any
replacement, rebuild evidence, expected bindings, packet, review and
authorization over all current block bytes. A second failure for the same
block stops the run.

The style gate is static-only. It cannot approve animation, rhythm,
transitions, five-phase lifecycle execution or seek behavior from stills.
Existing source/runtime/seek gates and the post-integration
`source_code_review` retain those authorities.

## Invalidation

- Visual grammar, whole-film rules, projection, design, display or font change:
  invalidate assets, chunk binding and every block.
- A Flat Shot Kit or asset visual-binding change: invalidate its consuming
  block, style review, integration, source review and render.
- A block source/evidence change: invalidate style review/authorization,
  integration, source review and render; preserve unrelated current blocks.
- A style packet/review/authorization change: invalidate integration and every
  downstream artifact.
- Integration/wrapper/source change: invalidate source review and render.

The bridge never adds Scene Kits, layers, mattes, depth, clean plates, alpha
decomposition, layered-hero quotas or host-specific creative branches.
