# Workflow contract

## Inputs and brief

Accept `talking-head` (edited video + matching SRT) or `faceless` (SRT, optional reference/audio). Ask for SRT, Pexels configuration and one style/material reference, then confirm one hash-bound brief. SRT is the time truth.

The brief fixes mode, raster/fps/audio/delivery, one visual direction, prohibited directions, native-primary ceiling, local font plan and material order `user-media → image-generation → Pexels → native auxiliary`. Missing Pexels, local fonts, HyperFrames, subagents or reliable image inspection is a blocker.

## Context boundary

Keep raw SRT, complete plans, inventories, HTML and frame bundles in the private artifact store. The parent may receive only compact manifests and four bounded packets:

- shot table + design/type/route facts;
- asset candidate/selection contact sheet;
- target-raster pre-master contact sheet + hard-gate report;
- final-frame contact sheet + media facts.

On Claude Code each producer runs in a fresh `Agent(subagent_type: "general-purpose")` and invokes exactly one stage Skill. Normal success uses four children. Do not create reviewer children or run a stage Skill inline in the parent.

## Canonical path

1. Parent runs deterministic input/capability preflight.
2. `broll-director` freezes the SRT-anchored plan and one display selection. Parent issues `shot_plan_review` from the bounded packet.
3. `broll-assets` freezes user/generated/Pexels material and consumers. Parent issues `asset_fact_review` from the contact sheet.
4. `broll-master-build` uses official HyperFrames authoring skills, then runs deterministic source/font/asset checks and captures every shot's full-raster `entry/result/exit`. Parent issues `html_preview_review` from the pre-master contact sheet and pixel report.
5. `broll-render` renders one final 4K master and runs deterministic verify. Parent issues `final_frame_review` from final frames/media facts and delivers.
6. `broll-shot-export` runs only after an explicit request.

At each creative gate return one aggregate revision packet. The responsible producer gets at most one retry. A second failure stops the run; do not multiply micro-review contexts.

## Mandatory gates

- Director: semantic coverage, concrete hero/action/result, rhythm, route ceiling, one compatible display font and no fixed-template repetition.
- Assets: relevant selected material, correct geometry/consumer, source order, local checksums and visible composition intent.
- Source: official HyperFrames authoring evidence; no visible `\uXXXX`, duplicate/orphan IDs, terminal `scale:0`, tiny type, font fallback, hidden/invalid consumer or route mismatch.
- Pixels: no black/empty, bright low-information, dominant-flat-color, huge dead-zone or adjacent-repeat result; generated/Pexels contribution must be measurable.
- Final: decode, duration, raster/fps/audio, full SRT coverage, current hashes and main review refs.

Media probes, hashes, receipts and producer prose never approve visual quality. The main agent must actually view the pre-master and final contact sheets. A model with demonstrated image-review failure—including the current `deepseek-v4-pro` evidence—cannot sign either visual gate.

## Resume and report

Reuse only exact brief/upstream/source hashes. A changed plan invalidates assets onward; changed assets invalidate build onward; changed source invalidates pre-master and render; changed master invalidates verify/final review.

Report the master, duration, route counts, four main reviews, deterministic verify and real limitations. Keep private paths, source, frames, logs and credentials out of the user report.
