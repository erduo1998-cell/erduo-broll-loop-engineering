# Stage handoff

Every child writes a concise Markdown handoff. Link to actual artifacts instead
of copying long plans, source, logs, media, or command output into the handoff.

Use these headings:

```markdown
# Stage Handoff

## Stage and status
## Responsibility completed
## Inputs used
## Actual artifacts written
## SRT range and coverage
## Decisions and reasoning
## Visual-direction relationship
## Material and font use
## Connection to adjacent stages
## Official Skills and tools actually used
## Objective checks actually run
## Open issues and limitations
## Next owner and required inputs
## Completion or stop reason
```

Use only applicable headings. State `not applicable` briefly when omitting a
field could create ambiguity.

## Status language

Use one of:

- `complete`
- `needs-revision`
- `action-required`
- `unsupported`
- `blocked`

Do not use vague states such as “mostly complete” or “should work.”

## Stage additions

### Onboarding

Include sanitized Node, HyperFrames, Skills, FFmpeg, FFprobe, Chrome,
permission, free-space, target, and Pexels status. State whether official
doctor actually ran in the same command environment inspected by onboarding.
State `base`, `targeted`, or `full`, `inspect` or `repair`, whether the Agent
modified anything, and the production-run, host, command `PATH`,
selection/runtime-plan identity, required backend CLI versions, delivery
filesystem, and Pexels-state bindings. Include discovery of the root Skill and all thirteen
stage Skills, plus the final SRT cue end milliseconds used only for storage
estimation. Missing Pexels configuration is `action-required`.
Never include a key, environment dump, home prefix, or raw command output.
For stages that spawned a non-Pexels process, record only the host environment
map capability, `pexels_key_removed_case_insensitively=true`, and the telemetry
setting. Never record any environment value.

Also record the selected runtime and capability-matrix decision. For a
non-default runtime, name its dependency, CLI, composition-route, and witness
evidence locators or the exact `action-required`/`unsupported` result. Include
the router status, selection source, reason codes, and relative evidence
locators. Never let runtime selection stand in for readiness.

### Runtime Planner

Include selection identity, generated plan locator and identity, planner mode,
resulting route, ordered blocks, evidence per assignment, required readiness
targets, unverified preferences, warnings, and validator result. Confirm no
semantic keyword routing and no hand edits.

### Director

Include total cue coverage, film sections, semantic shot count, original visual
direction, motif and density decisions, uncertain terms, material needs, and
font roles. Include the validated `shot-recipes/` locator, per-file schema and
bundled-validator results, one-to-one shot mapping, and required capability
IDs. Confirm that Recipes use integer milliseconds and contain no
runtime-specific APIs or component syntax.
Include compact Shotcraft stats/category/search facts, selected card IDs and
style keys, pinned upstream Git commit, semantic reasons, declared fallbacks,
and explicit no-pattern decisions. Link selected cards; do not copy the
catalog or card bodies into the handoff.

### Assets and Pexels

Include user-material inspection, generation consideration, actual Pexels
searches, selected and rejected routes, local files, shot bindings,
composition-use plans, font files, sources, and licenses. When controllable
generation is unavailable, say so and record that Pexels continued. Preserve
separate real image and video search facts without inventing a fixed count.
Confirm the credential was scoped only to dedicated Pexels requests.
Include Shot Recipe bindings, objective media facts, and adapter-relevant
constraints without selecting runtime APIs.
For each selected Shotcraft pattern, include whether its real material
preconditions were met or which declared fallback was invoked. Do not describe
upstream demo media or runtime assets as collected production material.

### Builder

Include block ID and exact range, implemented shots, seam behavior, material
and font use, official HyperFrames Skill-load trace reference when available,
and actual CLI work. Include selected runtime, Recipe-to-runtime mapping,
capability evidence, and faithful implementation variances.
Include selected Shotcraft card/style/pinned-upstream-commit resolution, native
runtime implementation decisions, preserved quality constraints, and faithful
variances. For HyperFrames, retain the official Skill evidence. For Remotion,
record matching local dependency versions, Composition ownership, and the
integer-millisecond-to-frame rounding policy. When reference TSX was adapted,
record its manifest-pinned upstream paths and Apache-2.0 attribution; otherwise
state that implementation was original or used the declared fallback. Never
claim that excluded media, font, sound, texture, or dependency assets were
bundled.
When `effects.dom-pixel-postprocess` is present, also record the same-run
HTML-in-canvas canary locator, exact Remotion and browser versions, paint
backends, `nested: false`, frozen GL backend, active-effect stills, and readable
hold stills.
For a hybrid plan, include `block-media.json`, local mezzanine, actual hash,
source identity, profile/audio facts, FFprobe/full-decode/boundary inspection,
and `noRealtimeNesting: true`.

### Integrator

Include ordered blocks, continuous coverage, integration-owned changes,
resource resolution, selected-runtime check evidence, and applicable official
Skill-load trace reference. Confirm one production-ready runtime binding and
complete Recipe-to-runtime traceability. For Remotion, include the registered
Composition ID, source entry, FPS, frame-total calculation, and local CLI
version. Include the
`composition-identity.json` locator and aggregate SHA-256; never copy its full
file list into the handoff.
For HTML-in-canvas, include the merged runtime feature declaration, unchanged
GL config, non-nesting review, and full-preview capture/shader inspection.
Confirm selected pattern references match the Director Recipes and Builder
records and that no unselected card was introduced during integration.
For Hybrid Integrator, include ordered frozen contracts/media hashes,
validator aggregate, seam inspection, FFmpeg assembly recipe, no-live-nesting
proof, preview facts, and hybrid identity.

### Render and delivery

Include the selected runtime's same-environment preflight, delivery
supplements, standard check, explicit preview approval, final render arguments,
attempt identity, unused attempt target, final master path, FFprobe facts, and
complete-decode result. For HyperFrames include official doctor and Skill-load
trace evidence; for Remotion include local dependency, CLI, registered
Composition, typecheck, and still evidence. A failed attempt records its
partial file and remains failed; a retry belongs to a different fresh Agent
and uses a new target.
For HTML-in-canvas, include the repeated support/still canary and prove Studio,
preflight, preview, and render used the identity-bound paint and GL backends.
For a preview pass, record `action-required`, the preview locator, integrated
composition-identity aggregate SHA-256, and absence of approval; omit
render-only facts as not applicable. For a render pass, record the approval
evidence and prove it binds the recomputed unchanged composition identity.
Confirm that Runtime Selection, Onboarding, Integration, and the capability
matrix bind the same production-ready runtime. For Remotion, include the exact
local CLI version and Composition ID used by still/preview and render. Never
report one runtime's evidence as proof for the other.
For Hybrid Render, include frozen validation and identity recomputation,
identity-bound approval, FFmpeg-only assembly, cross-backend seam inspection,
and confirmation that neither animation runtime was opened.

### Shot export

Include source master, requested shot IDs, exact windows, output paths,
FFprobe, and complete-decode result.

## Privacy

Never include:

- credentials or secret values;
- command arguments containing credentials;
- complete environment variables;
- private home-directory prefixes;
- raw SRT text not needed for the handoff;
- complete source, frames, media, or long logs;
- claims that technical checks prove aesthetic quality.
