# Main-review packet contract

## Current gates

A current `pipeline_contract_version: 2` run with
`authoring_topology_id: bounded-authoring-cluster-v1` has three direct
main-agent gates and no reviewer context:

| gate | subject | authority |
| --- | --- | --- |
| `asset_fact_review` | assets manifest | `fact-review` |
| `style_conformance_review` | all current frozen block source/still/facts bytes | `static-style-review` |
| `source_code_review` | integrated-source manifest | `source-review` |

Director approval is deterministic only. Block producers have deterministic
gates and evidence only; they cannot issue the parent style decision.
`shot_plan_review`, `html_preview_review` and
`final_frame_review` belong to the superseded fixed-four topology; their
records are legacy inspection-only and cannot authorize assets, resume, render
or delivery in a current run.

## Common binding

Every current review binds:

- pipeline contract version 2, current authoring-topology ID and the exact
  gate/subject type;
- subject manifest and producer/integrator isolation SHA-256;
- fixed main-agent role, explicit model ID and main-agent isolation SHA-256;
- a canonical path-free packet index;
- every declared page-table, source, facts and optional supplemental artifact
  in exact order;
- gate-specific director/rules/projection/design/kit/block/integration hashes;
- a deterministic result limited to `status`, `facts_sha256` and bounded
  `failure_codes`.

The main-agent isolation must differ from the subject producer/integrator and,
for style/source review, every block producer. A producer, integrator, script
or reviewer child cannot issue any current main review.

## Asset fact packet

The retained assets packet uses paired visual/facts pages with identical
contiguous shot ranges. The parent resolves and views all candidate/selection
pages, then binds `asset_fact_review` to:

```text
subject_manifest_sha256
director_manifest_sha256
whole_film_rules_sha256
shot_plan_sha256
design_slice_sha256
flat_shot_kit_set_sha256
review_packet_sha256
inspected_visual_page_sha256s[]
inspected_facts_page_sha256s[]
```

Its authority is `fact-review`; `visual_decision` is absent/null. It may reject
weak relevance, route skipping, subject loss, crop/safe-region conflict,
invalid geometry, provenance/rights gaps or material-as-wallpaper intent. It
cannot approve future composition, animation or pixels.

## Static style-conformance packet

After all current block bytes pass their seven deterministic gates, the parent
resolves and reads every block source plus its authoritative source-bound
entry/result/exit captures and independently recomputed objective pixel facts.
The complete machine shape, capture lineage, decision rules and failure codes
are owned by
[the static style-conformance contract](style-conformance-review-contract.md).

The gate binds the exact visual-grammar program, actual compact shared
directive and per-shot recipes, whole-film rules, design, chunk plan, every
current block manifest/source byte, every capture/facts generation and the
qualified main-agent isolation. It checks only implemented static visual
identity/anti-identity, attention geometry, subject/title relationship, real
HTML/SVG text, accent load, material/texture, responsible negative space and
adjacent result-frame text-swap sameness.

Approval requires complete source/still/facts coverage, all static checks
passing, zero findings and explicit false values for still-derived animation,
rhythm, transition, lifecycle and seek approval. Revision findings are grouped
by owning block and consume that block's single aggregate retry. After any
replacement, every current binding/evidence/review artifact is regenerated.

The integrator independently reruns the style validator over actual current
bytes and requires the resulting `style-integration-authorization`. Neither a
producer summary, prior evidence generation, review hash alone nor an outer
re-sign can authorize integration.

## Source review packet

The integration stage freezes a root packet index no larger than 4096 bytes
and all of its artifact references inside the integration manifest. To keep
actual long-form source review bounded without sampling, the root declares the
first page-table artifact, exact table/page counts and a SHA-256 over the
complete ordered page-table reference list. Each canonical page table is no
larger than 1 MiB, carries its ordinal/count and the exact next-table reference,
so the root and table chain deterministically declare one or more ordered page
tables without making the root grow with film length. Each page table declares:

- actual source pages for every integrated HTML/CSS/JavaScript file;
- paired source-facts pages;
- optional supplemental visual/facts pairs used only for font, crop and
  material-visibility checks.

The integration manifest also freezes the exact ordered page-table/page
reference arrays and their artifact-set SHA-256; they must agree with root and
chain traversal. At most 256 page tables and 1024 total declared pages are
allowed. One source
or facts page is at most 1 MiB; one supplemental image is at most 32 MiB.
Source pages preserve exact UTF-8 source text with file identity and contiguous
line ranges. For every source file, ranges start at line 1, have no gap,
overlap or reordering, and end at its exact final line. Empty, omitted,
summarized or regenerated source pages fail.

Every artifact reference declares opaque artifact ID, SHA-256, byte size and
media type. Source media types are limited to `text/html`, `text/css`,
`text/javascript` and `application/javascript`; facts/page tables are
`application/json`; supplemental pages are images. All bytes must resolve from
the integrated subject manifest.

`source_code_review` binds:

```text
subject_manifest_sha256
whole_film_rules_sha256
chunk_plan_sha256
wrapper_sha256
ordered_block_map_sha256
block_hash_ledger_sha256
integration_gate_sha256
style_integration_authorization_sha256
style_source_ledger_sha256
style_validator_receipt_sha256
review_packet_sha256
inspected_page_table_sha256s[]
inspected_source_page_sha256s[]
inspected_facts_page_sha256s[]
inspected_supplemental_visual_page_sha256s[]
inspected_supplemental_facts_page_sha256s[]
```

The arrays must exactly equal resolved packet order. The review carries:

```json
{
  "authority_scope": "source-review",
  "source_decision": {
    "outcome": "approved",
    "read_all_source_pages": true,
    "position_z_order_checked": true,
    "shot_order_checked": true,
    "duration_checked": true,
    "five_phase_lifecycle_checked": true,
    "selectors_checked": true,
    "cross_block_seams_checked": true,
    "source_errors_checked": true,
    "static_checks_limited_to_font_crop_material_visibility": true,
    "animation_approved_from_stills": false,
    "finding_count": 0,
    "decision_sha256": "<sha256>"
  }
}
```

Approval requires every boolean above to have the shown value and
`finding_count: 0`. Rejection requires at least one bound finding. This gate
checks actual source position/z-order, shot order, duration, complete
`Entry → Action → Result → Hold → Exit` lifecycles, selectors/IDs,
cross-block seams and source errors. It is not a pixel-aesthetic review.

## Deterministic and static-evidence limits

Deterministic outputs cannot contain aesthetic approval, quality scores,
subjective verdicts, animation approval or a delivery-ready claim. A
deterministic pass cannot create a main review, and a main review cannot waive
a deterministic failure.

Outside `style_conformance_review`, static images may supplement only:

- actual local font load/readability;
- crop correctness;
- visible ordinary-material presence/contribution.

No static gate can prove or approve motion, animation timing, easing,
transition quality, five-phase lifecycle execution or cross-block temporal
behavior.

## Lifecycle and fail-closed behavior

The producing stage returns packets without a main review. The parent resolves
all bytes and creates the decision. Every consumer and resume boundary reopens
the subject manifest, canonical packet, all page tables and all declared pages,
then reruns the complete validator. Comparing a receipt, authority summary or
hash-shaped field is insufficient.

Changing a block byte, authoritative capture, pixel-facts generation, style
packet or style review invalidates style authorization, integration,
`source_code_review` and render. Changing a source-review packet, page table,
source page, facts page, supplemental page, wrapper/map, integration receipt or
outer review invalidates `source_code_review` and render. Re-signing an outer
receipt, cross-manifest replacement, missing pages, sampling or stale summaries
fail closed.
