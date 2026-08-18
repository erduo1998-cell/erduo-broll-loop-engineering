---
name: erduo-broll-loop-engineering
description: Create editable SRT-anchored B-roll through a Director, shared Assets, three Lead samples, and 5–8-shot Chapter Builders that render, view, and revise their own work. Use for original-SRT/design-to-video production with HyperFrames by default, explicit Remotion canaries, direct per-shot H.264 delivery, six-frame sheets, and a complete preview.
---

# Erduo B-roll Loop Engineering

Act as Parent Producer. Keep creative judgment with one Director, one Assets
Agent, one Lead, and a small number of Chapter Builders. Parent runs bundled
planning, rendering, media validation, identity, and assembly scripts. Never
dispatch Runtime Planner, Integrator, Render, Reviewer, inspection, or evidence
Agents in normal v1.0.1 production.

Do not author production source, choose a shot's creative proposal, or judge
aesthetics in Parent context. Return a visible defect to the same creative
owner. Never send full Parent history or create a fresh full-history revision
Agent.

## Inputs and runtime policy

Require the complete original SRT and original design. Talking-head mode also
requires the matching edited video. Ask once for optional user media and explicit
brand, audio, privacy, output, material-service, and runtime constraints. Pass
the original SRT/design files and identities directly to Director, Lead, and
every Chapter Builder; no intermediate summary may replace them.

Create a fresh production directory beside the SRT. Use
`create-production-profile.mjs` for all output choices; never hand-write profile
JSON. Default to one independent H.264 MP4 per semantic shot, 3840×2160,
30 fps, high quality, and silent for faceless work. A combined `master.mp4` is
optional. Never overwrite.

Runtime policy for v1.0.1:

- production default: `hyperframes`;
- Remotion: explicit opt-in or canary only;
- `auto`: experimental and explicit only, never a blank-project default;
- backend failure never silently reroutes.

Run lightweight preflight for the selected backend. Dispatch Onboarding only
when preflight returns `run-onboarding-diagnostic`.

## Creative-loop production

1. Dispatch Director with the complete original SRT/design, task constraints,
   optional media index, and at most two selected references. Director writes
   semantic chapters, shared direction, Recipe v4 files with immutable `truth`
   and revisable `creativeProposal`, a compact motion map, and three
   representative choices. Director never writes `authoring.solo`.
2. Parent finalizes Director identities, generates the production profile, and
   runs `plan-runtime.mjs`. Normal authoring units are contiguous chapters of
   5–8 shots and roughly 35–70 seconds; semantic shot and final media boundaries
   remain one shot. A normal 15–24-shot film should not become one Agent per
   shot. Never hand-edit generated plans or assignments.
3. Dispatch Assets once. It freezes known shared media, fonts, licenses, and
   reusable derivatives, while keeping each shot's `native`, `provided`,
   `search`, `generate`, or `mixed` route open. A global external-material ban
   requires an actual user, capability, authorization, or cost restriction.
4. Dispatch the Lead with the complete original SRT/design, motion map, exactly
   three representative Recipes, and shared asset/font index. Lead builds three
   final samples: native graphic/type, real-or-generated material fusion, and
   information-dense interface/process/data. Lead also supplies the design's
   runnable signature motion, reusable material/motion capabilities, and a
   sub-one-page content-relation capability index. A whole-shot fill-in template
   is forbidden.
5. Lead runs the assignment's standard command, opens all three six-frame
   sheets and short previews, repairs visible defects, and returns `accepted` or
   `revised`. These sources become the final sources for their shots.
6. Build only the five-shot creative canary first. Each Chapter Builder receives
   the complete original SRT/design, its chapter truth/proposals, neighboring
   seams, Lead samples/capability index, shared assets/fonts, open material
   routes, exact runtime, output paths, and standard command.
7. Each Chapter Builder owns understand → choose → build → render → view → revise
   for its contiguous shots. It may revise `creativeProposal` with one concise
   reason but cannot change `truth`. It runs only the Parent standard command,
   opens every six-frame sheet and its chapter preview, repairs real defects,
   and returns one concise `accepted` or `revised` viewing conclusion.
8. Parent checks file/media facts, direct-shot coverage, FFprobe, full decode,
   hashes, source identity, contracts, and order. Success creates compact media
   facts only. Failure keeps the smallest `shotId + window + issue + image/log`
   evidence and returns it to the same owner.
9. Show the five-shot canary and Lead samples to the user without exposing
   backend implementation. Full production is blocked until the user chooses
   this version for at least 3/5 shots and all canary gates pass. If it fails,
   revise the canary; do not run the full film to increase sunk cost.
10. After canary approval, dispatch one Chapter Builder per remaining chapter,
    reuse Lead shots, render every semantic shot directly, and assemble the
    complete preview only from validated shot files. The user makes the final
    aesthetic decision.
11. Deliver ordered independent shot files, editable source, provenance, and
    `delivery-index.json`. Build a full Master only when requested, from the
    unchanged validated shots. `broll-shot-export` is legacy-only.

## Canary hard gate

Before full production, require all of the following:

- 5/5 shots directly render and fully decode;
- the owning Builder viewed every sheet or short preview and returned
  `accepted|revised`;
- zero coverage, accumulation, unsupported-line, empty-container, or unreadable
  result defects;
- at least three distinct composition families;
- at least two shots use real or generated material unless the input genuinely
  does not need it and the user agrees;
- design energy, type hierarchy, and at least two signature motions are visible;
- user prefers this version for at least 3/5 shots;
- assignment-to-first-canary-preview wall time is at most 45 minutes.

No automatic score may replace the user's choice.

## Role and context boundaries

Follow [safe execution](references/safe-execution.md) for every bundled command.
Shotcraft is problem-triggered guidance, never as a per-shot gate. A complete film
may use zero Shotcraft cards; do not manufacture a question to justify a query.
No query and no `patternRef` is a complete valid result.

Treat each assignment plus its injected role charter as the dispatch boundary.
Original SRT/design are task facts and must not be removed as “duplicate rules.”
Do not send Parent/other stage Skills, common craft references, schemas,
validator/lint source, full catalogs, unrelated Recipes, long logs, or Parent
conversation history.

The role prompt includes a short positive twelve-principle anchor. Each Recipe
selects only 2–4 relevant `craftIntent` values; Builders implement them in the
real image without scores or trace. Re-anchor from the packet after context
compression.

Lead and Builder source must not contain `inspection.tsx`, diagnostic
Compositions, `data-erduo-trace*`, visual-weight/focus-group/layer proof fields,
hand-authored motion windows, passing diagnostics, or self-built capture,
trace, lint, screenshot, hash, probe, decode, manifest, contract, receipt, or
proof tools.

## Creative ownership

`truth` contains timing, source cues, spoken facts, audience outcome, required
readable result, chapter, and seams. It is immutable. `creativeProposal`
contains metaphor, objects, composition, motion idea, material route, key
states, and rationale. The owning Builder may replace it when the new solution
serves truth better and records one concise reason.

One Chapter Builder controls composition change, pacing, material choice, and
adjacent handoffs across normally 5–8 shots. It uses Lead capabilities without
copying Lead layouts. Three consecutive shots may not reuse the same layout
skeleton, entry, and rhythm.

Media must affect crop, mask, path, annotation, palette, depth, geometry, or
state. It cannot sit in a generic frame. Build the strongest readable result,
then staging, necessary anticipation, causal main action, weaker overlap,
settle, and hold. Stable stillness is valid; decorative loops do not prove
development.

## Mechanical checks and revisions

Parent owns deterministic rendering, FFprobe, full decode, hash, source
identity, shot contract, six-frame-sheet generation, chapter-preview generation,
and final assembly. These checks may reject missing files, wrong media facts,
black/near-empty frames, safe-area escape, obvious occlusion, or missing fonts.
They must not claim appeal, metaphor quality, weight, craft-principle success,
or user approval.

The creative owner must open actual sheets/previews and repair low-level errors:
premature answers, coverage, accumulating old/new states, floating connectors,
empty containers, unreadable type/results, unsettled actions, design energy or
density mismatch, and repeated chapter structure. Rerender only affected shots.

## Execution and report

Use bundled scripts and safe execution. Stop only for missing input,
authorization, capability, irreconcilable constraint, a failed user canary
choice, or repeated blocker without progress. Never overwrite a plan, preview,
identity, attempt, or Master.

Return canary status and user choice first. After approved full production,
return the ordered shot directory, delivery index, preview, optional Master,
resolution, duration, coverage, material/font sources, objective media facts,
Builder `accepted|revised` conclusions, limitations, and unresolved risks.
Technical success never claims aesthetic approval.
