# Release checklist

Use one real edited input and its matching SRT for both host runs. Keep the Codex and Claude Code runs isolated; compare their public delivery contracts, not private intermediate wording.

## Production gate

- [ ] Complete a fresh Codex run from confirmed brief through verified master.
- [ ] Complete a separate fresh Claude Code run with the same real input and confirmed brief.
- [ ] Confirm deterministic preflight and the four-producer artifact chain are current and hash-bound: director, assets, master build and render; deterministic verify must bind the rendered master.
- [ ] Confirm the main agent recorded all four direct reviews for the exact manifests: shot plan, asset facts/contact sheet, HTML/pre-master contact sheet and final frames.
- [ ] Confirm normal execution used four producer contexts; any replacement was one aggregate retry, never a reviewer or serial micro-fix chain.
- [ ] Inspect every shot's actual `entry`, `result` and `exit` evidence and required rendered master windows.
- [ ] Confirm source/pixel hard gates passed and would reject literal `\\uXXXX`, tiny type, invalid animation targets, terminal `scale:0`, black/empty, bright low-information, dominant-flat-color and adjacent-repeat output.
- [ ] Confirm selected Pexels material has visible pixel contribution and respects crop, focal and safe-overlay decisions.
- [ ] Confirm project-local licensed fonts load offline, cover required CJK glyphs and remain readable in rendered frames.
- [ ] Verify master decode, duration, dimensions, fps, SRT coverage, audio policy and master hash continuity.

## Publication gate

- [ ] Record the real Codex and Claude Code evidence in the support matrix; promote only the host rows actually proven.
- [ ] Keep Windows and Jianying/CapCut desktop GUI marked `unverified` until tested on those surfaces.
- [ ] Run the complete Node test suite and all 6 active Skill validations from the release candidate.
- [ ] Run the public-package and license-notice audits with zero findings.
- [ ] Confirm the release allowlist contains every published path and no internal governance, credentials, private media or rendered output.
- [ ] Confirm the redistribution/commercial status of all bundled user-provided display fonts; package integrity does not prove font rights.
- [ ] Publish only when both real host runs and every applicable gate above pass; otherwise keep the release marked pre-release.
