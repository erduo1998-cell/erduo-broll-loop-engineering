# Legacy v2 inspection policy

Pipeline v2, `bounded-authoring-cluster-v1`, fixed-four packets and all
main-review artifacts are `inspection-only`.

They may be read for history or migration diagnostics. They cannot:

- resume into `pipeline_contract_version: 3`;
- be re-signed or have their identity fields replaced;
- authorize a director or sealed production contract;
- authorize build, integration, render, delivery or shot export.

Forbidden active v3 fields include `shot_plan_review`, `asset_fact_review`,
`html_preview_review`, `final_frame_review`, `style_conformance_review`,
`source_code_review`, `main_review_refs`, `visual-review`, contact sheet,
`inspected_visual_page`, trusted capture and style-integration authorization.
`stable_window` is also legacy author-asserted evidence and is forbidden.
This rejection is recursive across every canonical artifact, actual reference
profile, font package, projection, delivery profile and sealed asset manifest.

`inspectV3Compatibility()` returns fixed non-authorizing facts for legacy
objects. `validateProductionContract()` rejects them with
`pipeline_upgrade_required`; changing only the version/topology still fails
when legacy fields remain.

This file is the only intended long-term description of the old inspection
path. P1 does not delete existing v2 implementation files; active-graph
disconnection and legacy cleanup occur in P2/P6.

## Retired test inventory

The active v3 acceptance inventory contains 24 files and is frozen in
`scripts/run-project-tests.mjs`. The other 71 currently discovered test files
belong to pre-ARC-004 template, v2, visual-review or superseded delivery paths.
They remain available for inspection but are never executed by the active
acceptance runner:

- `scripts/test-match-template.mjs`
- `scripts/test-project-status.mjs`
- `scripts/test-template-candidate.mjs`
- `scripts/test-template-library-validator.mjs`
- `scripts/test-template-validator.mjs`
- `scripts/test-transition-template.mjs`
- `erduo-hyperframes-broll/scripts/test-asset-integrity-gate.mjs`
- `erduo-hyperframes-broll/scripts/test-audit-license-notices.mjs`
- `erduo-hyperframes-broll/scripts/test-build-faceless-master.mjs`
- `erduo-hyperframes-broll/scripts/test-build-fullscreen-composition.mjs`
- `erduo-hyperframes-broll/scripts/test-build-hard-alpha-composition.mjs`
- `erduo-hyperframes-broll/scripts/test-build-hyperframes-timeline.mjs`
- `erduo-hyperframes-broll/scripts/test-build-light-pass-composition.mjs`
- `erduo-hyperframes-broll/scripts/test-build-m10-composition.mjs`
- `erduo-hyperframes-broll/scripts/test-build-shot-render-plan.mjs`
- `erduo-hyperframes-broll/scripts/test-build-talking-head-master.mjs`
- `erduo-hyperframes-broll/scripts/test-cache.mjs`
- `erduo-hyperframes-broll/scripts/test-check-coverage.mjs`
- `erduo-hyperframes-broll/scripts/test-check-m10-content-quality.mjs`
- `erduo-hyperframes-broll/scripts/test-compare-e2e-contract.mjs`
- `erduo-hyperframes-broll/scripts/test-config.mjs`
- `erduo-hyperframes-broll/scripts/test-delivery-media-gate.mjs`
- `erduo-hyperframes-broll/scripts/test-doctor.mjs`
- `erduo-hyperframes-broll/scripts/test-extract-director-enhancer-evidence.mjs`
- `erduo-hyperframes-broll/scripts/test-failed-visual-regression.mjs`
- `erduo-hyperframes-broll/scripts/test-frame-visibility-gate.mjs`
- `erduo-hyperframes-broll/scripts/test-image-generation.mjs`
- `erduo-hyperframes-broll/scripts/test-index-user-assets.mjs`
- `erduo-hyperframes-broll/scripts/test-input-integration.mjs`
- `erduo-hyperframes-broll/scripts/test-input-layer.mjs`
- `erduo-hyperframes-broll/scripts/test-input-time-gate.mjs`
- `erduo-hyperframes-broll/scripts/test-measure-style-pixel-facts.mjs`
- `erduo-hyperframes-broll/scripts/test-native-fallback.mjs`
- `erduo-hyperframes-broll/scripts/test-parse-srt.mjs`
- `erduo-hyperframes-broll/scripts/test-pexels-search.mjs`
- `erduo-hyperframes-broll/scripts/test-plan-m10-asset-routes.mjs`
- `erduo-hyperframes-broll/scripts/test-prepare-font-assets.mjs`
- `erduo-hyperframes-broll/scripts/test-probe-media.mjs`
- `erduo-hyperframes-broll/scripts/test-retry-resume.mjs`
- `erduo-hyperframes-broll/scripts/test-review-receipt.mjs`
- `erduo-hyperframes-broll/scripts/test-roi-material-contribution.mjs`
- `erduo-hyperframes-broll/scripts/test-route-user-assets.mjs`
- `erduo-hyperframes-broll/scripts/test-run-e2e-fixture.mjs`
- `erduo-hyperframes-broll/scripts/test-select-design.mjs`
- `erduo-hyperframes-broll/scripts/test-shot-design-gate.mjs`
- `erduo-hyperframes-broll/scripts/test-template-visual-grammar-constraints.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-anti-template-signatures.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-assets-v2-chain.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-authoring-topology.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-context-budget.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-design-slice.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-director-brief.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-director-method.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-director-v2-chain.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-display-font-selection.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-flat-shot-kit-set.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-flat-shot-kit.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-m10-visual-contract.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-main-review-packets.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-master-bindings.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-master-build-v2-chain.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-neutral-scaffold.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-reference-library.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-render-source.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-shot-plan.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-style-conformance-review.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-visual-authoring-chain.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-visual-evidence.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-visual-grammar-program.mjs`
- `erduo-hyperframes-broll/scripts/test-validate-whole-film-rules.mjs`
- `erduo-hyperframes-broll/scripts/test-visual-preflight-pixels.mjs`

A missing active entry, an unclassified new `test-*.mjs`, a missing retired
entry or any overlap between the inventories fails closed. Retired files must
not be reactivated merely to increase the reported test count.
