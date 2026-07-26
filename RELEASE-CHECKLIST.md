# Release checklist

Use one real edited input and its matching SRT for both host runs. Keep the Codex and Claude Code runs isolated; compare their public delivery contracts, not private intermediate wording.

## Current disposition

This checkout is **pre-release only**: M21's script-only v3 migration and the required fresh real-input Codex/Claude Code end-to-end runs are not yet complete. Leave every gate below unchecked until its recorded evidence exists; deterministic tests alone do not authorize publication.

## Production gate

- [ ] Complete a fresh Codex run from confirmed brief through verified master.
- [ ] Complete a separate fresh Claude Code run with the same real input and confirmed brief.
- [ ] Confirm deterministic preflight and the active v3 topology are current and hash-bound: Director → Assets → bounded parallel Master Build → byte-preserving Integrate → one 4K Render → technical delivery → optional master-derived shot export.
- [ ] Confirm the only production gate receipt families are `policy-gate`, `source-conformance-gate`, `runtime-seek-gate`, `pixel-signal-gate` and `integration-delivery-gate`.
- [ ] Confirm Render accepted only the current sealed contract, all required five-gate receipts, the current integrated manifest and its no-rewrite proof; no parent artifact inspection or reviewer lineage authorized render.
- [ ] Confirm normal execution used `N + 4` isolated child contexts: director, assets, one author per deterministic block, independent integration and render. Each failing block may receive one aggregate block-scoped retry; a second failure stops the run.
- [ ] Confirm every block passed its three deterministic gates against actual source/runtime/pixel facts. Keep technical frames private and do not treat them as aesthetic approval.
- [ ] Confirm source/pixel hard gates passed and would reject literal `\\uXXXX`, tiny type, invalid animation targets, terminal `scale:0`, black/empty, bright low-information, dominant-flat-color and adjacent-repeat output.
- [ ] Confirm selected Pexels material has visible pixel contribution and respects crop, focal and safe-overlay decisions.
- [ ] Confirm project-local licensed fonts load offline, cover required CJK glyphs and remain readable in rendered frames.
- [ ] Verify master decode, duration, dimensions, fps, SRT coverage, audio policy and master hash continuity.
- [ ] Confirm ReachSurge remained private minimum calibration only and that no ReachSurge source, identity, verdict or hash entered a public receipt, production/reference profile, public package or user report.

## Publication gate

- [ ] Record the real Codex and Claude Code evidence in the support matrix; promote only the host rows actually proven.
- [ ] Keep Windows and Jianying/CapCut desktop GUI marked `unverified` until tested on those surfaces.
- [ ] Run the complete Node test suite and all 7 active Skill validations from the release candidate, including `broll-master-integrate`.
- [ ] Run the public-package and license-notice audits with zero findings.
- [ ] Confirm the release allowlist contains every published path and no internal governance, credentials, private media or rendered output.
- [ ] Confirm every user-provided display font used by the real run has an applicable local license file and explicit user-confirmed rights; display fonts are not bundled with this repository.
- [ ] Publish only when both real host runs and every applicable gate above pass; otherwise keep the release marked pre-release.
