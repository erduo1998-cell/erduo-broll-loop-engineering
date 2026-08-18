# Stage orchestration

## v1.0.1 creative ownership

| Work | Owner | Normal output |
| --- | --- | --- |
| Meaning, chapters, immutable truth, creative proposals, motion map | one Director | `01-director/` |
| Runtime plan and assignment packets | Parent deterministic scripts | `01-runtime-plan/` |
| Known shared media, fonts, licenses, open shot routes | one Assets Agent | `02-assets/` |
| Three final samples, signature motion, shared capabilities | Lead mode of selected Builder | `04-visual-lock/` |
| Five-shot canary decision | owning Builders + user | `04-visual-lock/canary/` |
| Contiguous chapter creative loop, normally 5–8 shots | one Chapter Builder per unit | `03-build/<unit>/` |
| Direct shot rendering, media facts, contracts, six-frame sheets, chapter preview | Parent standard command | `05-delivery/` |
| Complete preview and optional Master | Parent assembly from validated shots | `05-delivery/` |

Do not dispatch Runtime Planner, Integrator, Render, Reviewer, inspection, or
evidence Agents. A semantic shot is the truth/media/check boundary. A chapter
is the creative boundary. Direct shot delivery never implies one Agent per shot.

## Runtime and gate order

v1.0.1 production defaults to HyperFrames. Remotion requires explicit opt-in or
a canary assignment. `auto` is experimental and explicit only. Failure never
silently reroutes.

Parent creates the production profile and runtime plan with bundled scripts;
never hand-edit generated JSON. Normal units contain 5–8 contiguous shots and
roughly 35–70 seconds. Only closed technical conflicts may justify a solo unit.
Media still render one shot per direct runtime entry.

```text
node scripts/create-production-profile.mjs \
  --output <production-root>/production-profile.json \
  --width <width> --height <height> --fps <fps> \
  --audio <audio-policy> --master-format h264-mp4

node scripts/plan-runtime.mjs \
  --recipes <production-root>/01-director/shot-recipes \
  --selection <runtime-selection.json> \
  --narrative-envelope <production-root>/01-director/narrative-envelope.json \
  --visual-system <production-root>/01-director/visual-system.json \
  --representative-scenes <production-root>/01-director/representative-scenes.json \
  --motion-map <production-root>/01-director/motion-map.json \
  --original-srt <production-root>/00-input/original.srt \
  --original-design <production-root>/00-input/original-design.md \
  --hyperframes-executable <verified-absolute-hyperframes-cli> \
  --production-profile <production-root>/production-profile.json \
  --production-root <production-root>
```

All four direct creative-context arguments and the selected backend's verified
executable are required for normal Recipe v4 production. Use
`--remotion-executable` instead for an explicit Remotion route. Omitting
`--representative-scenes` selects only the legacy planning path; omitting the
motion map, either original input, or executable cannot produce a valid v4 plan
or assignment packet.

Run the Lead sample gate, then the five-shot creative canary. Full production is
blocked until all canary technical/visual-baseline conditions pass and the user
selects this version for at least 3/5 shots. A failed canary returns to its
original Lead or Chapter Builder; it never starts the full film.

## Direct original context

Director, Lead, and every Chapter Builder receive readable locators and SHA-256
identities for the complete original SRT and original design. Neither may be
replaced by narrative/visual summaries. Each Builder packet also contains:

1. its contiguous chapter and each shot's immutable `truth` plus revisable
   `creativeProposal`;
2. previous/next and chapter-boundary seams;
3. all three Lead sample locators, matching shared source, and the short
   content-relation capability index;
4. the shared asset/font/provenance index and live
   `native|provided|search|generate|mixed` shot routes;
5. selected backend facts, exact standard command, output paths, view-receipt
   target, and at most two selected references.

Do not pass Parent/other stage Skills, generic craft references, schemas,
validator/lint source, complete catalogs, unrelated Recipes, long logs, or
Parent history. Original task inputs are not redundant rule files. Generated
AGENTS, CLAUDE, and role prompts come from one role-charter source; the packet
repeats its short execution anchor/recovery fields after compression.

## Director and Assets

Director writes Recipe v4 with immutable `truth` and revisable
`creativeProposal`, recommends semantic chapters and seams, and selects 2–4
relevant `craftIntent` values. Director never writes `authoring.solo`.

Assets freezes known shared media, local fonts, licenses, provenance, and
reusable derivatives. It does not close shot-specific search/generation based
on a first proposal. A global route restriction must cite a real user,
capability, authorization, or cost boundary. Chapter Builders may move a shot
from native to search, generate, or mixed with one concise reason and source
record.

## Lead samples and capabilities

Lead reads the complete original SRT/design, compact motion map, exactly three
representative Recipes, and shared asset/font index. Lead builds:

- one native graphic/type final sample;
- one real-or-generated material-fusion final sample;
- one information-dense interface/process/data final sample;
- every design-named signature motion as a real sample behavior or runnable
  primitive;
- reusable crop, mask, depth, background-fusion, source-binding, preparation,
  main-action, overlap, settle, and readable-hold capabilities;
- a sub-one-page index stating which content relationship each capability fits.

Samples must differ in silhouette, composition, and primary action. Shared
source may contain tokens, primitives, and base components, never a fill-in
whole-shot template. Lead runs the exact standard command, opens sample sheets
and short previews, repairs visible defects, and returns `accepted|revised`.
Those samples become final source for their shots.

## Chapter Builder loop

One Chapter Builder owns understand → choose → build → render → view → revise
for its whole contiguous unit. It cannot change `truth`, but may replace a
creative proposal and material route when a better solution serves truth; one
short reason is enough. It uses Lead capabilities without copying Lead layouts
and must vary composition, entry, material, and rhythm across the chapter.

Builder exposes one direct runtime target per shot and runs only the assignment
standard command. It then opens every six-frame sheet plus the chapter preview.
It repairs coverage, accumulated states, floating connectors, empty containers,
unreadable results, unsettled action, design mismatch, or repeated structure.
Handoff requires one compact viewing result:

```text
status: accepted | revised
viewed: six-frame-sheets + chapter-preview
change: <required only when revised>
```

No long viewing essay or extra approval document is required.

## No proof work in creative source

Lead and Builder do not create `inspection.tsx`, diagnostic Compositions,
`data-erduo-trace*`, visual-weight/focus-group/layer metadata, manual motion
windows, passing dense diagnostics, or capture/trace/lint/screenshot/frame-scan/
hash/probe/decode/manifest/contract/receipt/proof tools. The role prompt's
positive twelve-principle anchor guides creation; it is not scored or traced.

Parent owns render, FFprobe, full decode, hash, identity, media contracts,
six-frame sheets, chapter previews, and assembly. Success stores compact media
facts. Failure stores only the smallest shot/window/issue/image-or-log evidence
needed by the original owner.

## Delivery and revisions

Every final shot is directly rendered from its own runtime entry and fully
decoded. `delivery-index.json` is the sequence truth. Complete preview and any
requested Master use only unchanged validated shot files.

Technical checks may report objective defects but never appeal, metaphor
quality, animation weight, twelve-principle compliance, or user preference.
Only the creative owner who viewed the actual output can return
`accepted|revised`; only the user can pass canary and final aesthetics.
