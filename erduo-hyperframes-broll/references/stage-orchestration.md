# Stage orchestration contract

## Active stages

The default runtime has four producer stages: `director`, `assets`, `master-build`, `render`. Input preflight and final verification are deterministic parent/render operations. Historical plan/asset/source/visual reviewer Skills are not dispatched by a new run.

Each producer receives one signed narrow packet: goal, brief hash, allowed upstream artifact IDs, required contracts and expected compact output. Full artifacts are resolved privately. The parent receives only a manifest envelope plus that gate's bounded fact/contact-sheet packet.

## Parent gates

| Producer | Parent decision | Required packet |
| --- | --- | --- |
| director | `shot_plan_review` | compact shot table, visual direction, prohibited directions, route/font facts |
| assets | `asset_fact_review` | candidate/selected contact sheet, geometry, reasons, route counts |
| master-build | `html_preview_review` | official-authoring evidence, source/pixel report, all-shot pre-master contact sheet |
| render | `final_frame_review` | final result-frame contact sheet, media/verify facts |

The parent decision binds the current manifest hash. No producer can create it. A deterministic gate failure cannot be waived by prose.

## Claude Code dispatch

Use one fresh `Agent(subagent_type: "general-purpose")` per producer. A successful run therefore has exactly four Agent calls. One failed creative gate may create one replacement producer context; cap the run at two total replacement contexts and never retry the same gate twice.

Reject a runtime whose root Skill and active stage Skills do not share one source fingerprint. In development, link them to the same project source rather than copying snapshots.

## Invalidation

Brief changes invalidate everything. Plan changes invalidate assets onward. Asset changes invalidate build onward. Source changes invalidate pre-master, render and final review. Master changes invalidate verify/final review. Resume only exact matches.
