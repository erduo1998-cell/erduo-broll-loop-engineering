# Prompt-first production workflow

## Inputs and output

- Talking-head mode requires a matching edited source video and SRT.
- Faceless mode requires an SRT.
- User images, videos, logos, screenshots, ordinary references, and explicit
  brand restrictions are optional.
- A separate design file or preset is never required.
- When the user does not specify a delivery location, create one new
  timestamped directory beside the SRT using its basename plus
  `-broll-YYYYMMDD-HHMMSS`, with a unique suffix when needed.
- Default delivery is `master.mp4`: H.264 MP4, 3840×2160, 30 fps, official high
  quality.
- Never overwrite an existing directory, attempt target, or master path.
- Shot files are created only after an explicit request and are cut from the
  verified master.

## Runtime contract

Default runtime intent to `auto`. Read the runtime contract, validate Director
recipes, then run the deterministic post-Director planner and validator.
HyperFrames and Remotion are independent production routes; missing targeted
local readiness is `action-required`. Auto may resolve to one backend or
hybrid. Hybrid exchanges only schema-valid frozen block media and never nests
or translates runtime source.

The Director authors one runtime-neutral Shot Recipe per shot. The Assets
stage preserves runtime-neutral material roles and objective media facts. The
Builder owns its planned backend source. Single-backend Integrator/Render
stages accept only their own route. Hybrid uses the dedicated runtime-neutral
Integrator/Render. Describing a recipe is not backend evidence.

The bundled Shotcraft catalog is a runtime-neutral pattern reference, not a
second backend. Start with `scripts/query-shotcraft.mjs --stats`, then use a
directed cross-category `--search` or a category-filtered `--list` for compact
discovery, and `--card <id> --style <key>` only for the selected card. Search
uses whitespace-separated AND terms; retry a zero-result phrase with one or
two discriminating terms. Never run an unfiltered `--list` during production.
Do not load `references/shotcraft/catalog.json` or all card bodies into a stage
context. The catalog excludes upstream TSX, demo media, audio, textures, and
runtime assets; its entries are not verified HyperFrames components or
Remotion/HyperFrames parity witnesses.

## Cached production preflight

Installation or upgrade performs deep environment inspection once and writes
a machine-local readiness cache. Before Direction run the bundled lightweight
preflight. After runtime planning, run it for only the required backends.
Normal production dispatches no Onboarding Agent.

The cache binds stable release, machine, Node, installed-Skill, and pinned-tool
identities only. Production-run, SRT, project/output, runtime-plan, command
`PATH`, disk-space, and Pexels changes never invalidate it. Per-run preflight
checks readable input, unused writable output, storage, and requested cached
backend readiness and returns compact JSON.

Only `next: run-onboarding-diagnostic` launches one inspection-only Onboarding
Agent scoped to failed stable facts. After grouped authorization, a fresh
repair Agent applies approved reversible repairs and refreshes the cache.
`fix-production-input` and `fix-project-runtime` stay with Parent. Pexels is checked by Assets only when
a real Pexels material need exists.

## Official CLI privacy and network

Every stage follows [shared command execution](safe-execution.md) and consumes
only its compact result. Executor success does not prove an official Skill load
or replace command-result review.

Official HyperFrames Skills check and update access the official GitHub Skill
source. Treat that as declared network access. Skills check is part of
inspection; Skills update remains an authorized repair.

## Shared film logic

Director and both backend Builders read `animation-craft.md`. The twelve
animation principles operate there as prompt-time generation order, not as a
schema, routing taxonomy, per-shot checklist, or static review rubric. Motion
is generated from meaning through attention, physical character, causal
action, key states or continuous motion, one expressive peak, and settled
readability before a runtime mechanism is chosen.

Use parsed SRT integer milliseconds as the only time truth. Cover continuously
from zero through the final cue end. Group cues into semantic shots when they
express one idea; subtitle boundaries do not dictate shot count.

For every shot, decide:

- why it needs a visual and what the audience should understand;
- which visual logic or deliberate stability fits the content;
- how attention moves or settles;
- what visible change, relationship, comparison, or result carries meaning;
- what must remain readable;
- the material's semantic and compositional role;
- how the shot connects to its neighbors;
- what selective screen copy is useful without reproducing subtitles.

Let sections establish, question, compare, explain, escalate, resolve, return,
or transition in the form the content needs. Let motifs develop and return with
changed meaning. Shape density into rises, releases, and recovery moments.
Avoid accidental repetition without breaking purposeful continuity.

Treat suspicious names, versions, models, brands, and numerical claims as
low-confidence until confirmed. Use safe generic wording and report the
uncertainty rather than silently correcting it.

Route primary material in this order:

```text
user material
→ controllable generation
→ Pexels
→ HyperFrames-native structural support
```

Make photographic media participate in the composition. Native graphics may
support typography, relationships, information graphics, emphasis,
transitions, and local structure, but must not become the default primary
material across an extended passage.

Use project-local font files with source and license records. Plan title,
interface, and body roles. Do not rely on remote or system fonts.

Do not burn subtitles into the B-roll or add background music. Keep faceless
output silent by default. In talking-head mode, preserve the agreed
source-audio policy.

## 1. Direction

Dispatch a fresh Director Agent. It reads the actual inputs, understands the
whole film, and writes:

- `creative-brief.md`
- `visual-direction.md`
- `film-plan.md`
- `shot-plan.md`
- one schema-valid JSON object per shot under `shot-recipes/<shot-id>.json`
- `material-requests.md`
- `handoff.md`

After establishing each shot's meaning, the Director searches the catalog and
selects at most one primary pattern, or records an explicit no-pattern
decision in the shot plan. A selected `patternRef` records a resolvable card
ID, style key, pinned upstream Git commit, semantic reason, and fallback.
Pattern selection never replaces the shot's content-specific visual logic.

The visual direction arises from the current content, audience, goal, and
optional material. It is not selected from a bundled theme. The shot plan must
prove continuous time coverage, semantic grouping, whole-film development,
material intentions, typography roles, density variation, motif development,
adjacent variation, and safe handling of uncertain terms. The Recipe set uses
integer milliseconds, validates against the repository schema, maps one-to-one
to the shot plan, and contains no runtime APIs or component syntax.

## 2. Mandatory material collection

Dispatch a fresh Assets and Pexels Agent on every production run. It must:

1. inspect available user material;
2. consider suitable controllable generation;
3. perform real Pexels image and video searches;
4. evaluate relevance and composition before selection;
5. download every selected external item locally;
6. bind every selected item to planned shots and a composition-use plan;
7. source and freeze licensed project fonts.

A real Pexels search may produce zero selected items. The Agent explains the
search and rejections instead of forcing weak media. Selected media records its
subject, focal point, crop, safe overlay area, brightness, color temperature,
depth, movement, title relationship, source, creator, local path, and shot
binding.

For a selected pattern, Assets reads only that card and verifies its concrete
material preconditions. Missing screenshots, UI states, paired states, layers,
data, masks, or depth inputs invoke the declared fallback or return to the
Director; they are not replaced with fabricated or unrelated media.

When controllable generation is unavailable, record that fact and continue to
Pexels. Do not impose a fixed search count, but preserve evidence of real image
and video searches plus the selection or rejection reasoning.

## 3. Runtime planning and targeted readiness

Dispatch `broll-runtime-plan`, preserve its generated JSON, and run its schema
validator. The planner uses declared capability and exact pattern/backend
evidence, never semantic keywords, then merges adjacent same-runtime shots.
Run targeted cached preflight only for its `requiredBackends`; launch
Onboarding only when that preflight reports a missing or changed backend fact.

## 4. Block building

Dispatch each planned block to its assigned backend Builder. HyperFrames
Builders load official pinned Skills; Remotion Builders use only verified
project-local dependencies. Each reads only its selected pattern evidence. On
a hybrid route, every Builder additionally freezes one verified mezzanine and
schema-valid `block-media.json`; this intermediate is not the master.

## 5. Integration

Use the matching single-backend Integrator when the plan resolves to one
runtime. For hybrid, use `broll-hybrid-integrate`, which validates actual block
hashes and contracts, assembles only frozen media with FFmpeg/FFprobe, fully
decodes the moving preview, and freezes a runtime-neutral preview identity. Never live-nest or
translate runtime source.

## 6. Render and delivery

Use the Render stage matching the integrated identity. HyperFrames retains
official Skill/check requirements. Remotion retains local CLI,
Builder-owned typecheck receipts, and integrated trace/lint. Hybrid compares frozen-media identity and
FFmpeg checks without opening either animation runtime. Missing approval stops
at preview; a fresh Agent must verify unchanged identity before formal render.

Unattended execution ends at the final preview. Formal render waits for user
approval. After approval, the Parent dispatches a different fresh Render Agent
with evidence bound to the unchanged integrated composition. That Agent compares
identity and runs delivery-local target/media checks before formal render; a changed project requires a new
preview and approval.

One final master means one successfully verified delivered master, not one
render attempt. A failed attempt and any partial file remain failed evidence.
The Parent dispatches a fresh Render/Delivery Agent, which reuses unchanged identity evidence
and uses a new unused attempt target. No attempt or final target is overwritten.

Technical verification proves media behavior, not visual taste. The user
decides aesthetic acceptance by watching the master.

## 7. Optional shot export

Only after an explicit request, dispatch a fresh Shot Export Agent. It cuts the
requested integer-millisecond windows from the verified master without
rerendering, then uses FFprobe and complete decode on every exported file.
