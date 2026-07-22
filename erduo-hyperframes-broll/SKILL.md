---
name: erduo-hyperframes-broll
description: Create editable, SRT-anchored HyperFrames B-roll from an edited talking-head video or an SRT-only faceless script. Use when Codex or Claude Code must direct, source, author HTML with the official HyperFrames skills, visually approve and render a complete B-roll master through a short isolated pipeline.
---

# Erduo HyperFrames B-roll

Act as the main producer and visual decision-maker. Keep full SRT, plans, inventories, source and frame bundles in the private artifact store; accept only bounded fact/contact-sheet packets in the parent context.

Read [workflow](references/workflow.md) before a new or resumed run. Read a linked contract only when its gate is active; do not preload the reference library or all contracts.

## Start

1. Require local files, shell, HyperFrames, real subagents and actual image viewing. On Claude Code, every producer uses a fresh `Agent(subagent_type: "general-purpose")`; parent-side `Skill(broll-*)` is invalid.
2. Verify that the root and active stage Skills come from one source fingerprint. Stop on a copied/stale mixed installation.
3. Ask in order for SRT, safe Pexels configuration and one style/material reference. Then show one complete brief and wait for explicit confirmation of its hash.
4. The brief fixes SRT time truth, mode, raster/fps/audio/delivery, one visual direction, prohibited directions, native-primary ceiling, the material order `user-media → image-generation → Pexels → native auxiliary`, and local font roles.
5. Run deterministic preflight in the parent. Do not spend a child context on parsing, probing or configuration checks.
6. A main model with a proven image-judgment failure cannot approve pixels. Current evidence disqualifies `deepseek-v4-pro`; stop or hand visual gates to a verified image-capable main agent.

## Run four producer contexts

1. Dispatch `broll-director`. Inspect its bounded shot-plan packet and issue `shot_plan_review`. Reject generic templates, weak image purpose, repeated grammar, native overage or a missing single display-font selection.
2. Dispatch `broll-assets` from that accepted plan. Inspect the candidate/contact sheet and issue `asset_fact_review`. Reject weak relevance, grey-mask/background-only treatment, invalid geometry or a route that skips suitable user/generated material.
3. Dispatch `broll-master-build`. It must use `hyperframes:hyperframes` plus the necessary official CLI/animation skills to author the HTML. It runs the deterministic source/font/asset gates, captures target-raster `entry/result/exit` for every shot and returns one pre-master contact sheet. Inspect it and issue `html_preview_review` only when the actual pixels are readable, materially occupied and visually convincing.
4. Dispatch `broll-render`. It renders exactly one final 4K master and runs deterministic manifest, coverage, font, contribution and media verification. Inspect the final-frame contact sheet and issue `final_frame_review`, then deliver.

A successful run uses four children. If a creative gate fails, send one aggregated revision packet to that producer and retry once. If it still fails, stop with the evidence; never open a chain of micro-review agents. Dispatch `broll-shot-export` only after an explicit request.

## Hard failures

- Visible literal `\uXXXX`, duplicate/orphan DOM IDs, a `fromTo` end state with `scale:0`, below-minimum visible type, missing selected display font or any system/generic font fallback.
- Black/empty results, bright low-information or dominant-flat-color frames, huge dead zones, adjacent pixel repetition, hidden material or an unreadable result state.
- Pexels/generated assets without a visible type-correct consumer and measured result-region contribution.
- Missing official HyperFrames authoring evidence, stale hashes, final render before `html_preview_review`, or any producer claiming visual approval.

## Report

Return only the master path, duration, route counts, four main review results, deterministic verify result and real limitations. Do not expose private artifacts, source, frames, prompts, logs or credentials. Mark Windows and desktop-editor GUI behavior `unverified` until real evidence exists.
