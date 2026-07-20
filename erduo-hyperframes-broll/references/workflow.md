# Workflow contract

## Contents

1. [Inputs](#inputs)
2. [Persistent state](#persistent-state)
3. [Phase A — Preflight](#phase-a--preflight)
4. [Phase B — Directing](#phase-b--directing)
5. [Phase C — Asset routing](#phase-c--asset-routing)
6. [Phase D — HyperFrames build](#phase-d--hyperframes-build)
7. [Phase E — Verification](#phase-e--verification)
8. [Delivery contract](#delivery-contract)
9. [Failure and resume rules](#failure-and-resume-rules)

## Inputs

Accept exactly one of these modes:

- `talking-head`: edited video + matching SRT; optional local media directory and design reference.
- `faceless`: SRT; optional audio track, local media directory, and design reference.

Resolve files from explicit user paths. Do not guess between multiple plausible videos or subtitle files. Validate that the SRT starts at or after zero, has strictly valid windows, and does not exceed the controlling media duration in talking-head mode.

Ask once whether the user has local media or a design reference. Store that the question was answered so a resumed run does not ask again. Ask for a Pexels credential only when the first required Pexels call finds none; store credentials in the host's secure user configuration, never in the project or logs.

## Persistent state

Use `.erduo-hyperframes-broll/run.json` as the private resumability record. Keep it out of the user-facing deliverables.

Record:

- input fingerprints and normalized paths;
- mode, output root, aspect ratio, duration, and SRT checksum;
- whether the one-time local-media question was answered;
- semantic shot windows and their stable IDs;
- selected base template, borrowed patterns, motif IDs, and internal selection reasons;
- asset query, source, license/provenance, local frozen path, and checksum per shot;
- build, render, and verification state per artifact;
- failures with stage, code, safe message, and retryability.

Invalidate only the stages downstream of a changed fingerprint. Never reuse a render after its SRT window, design, source asset, composition code, or render settings change.

## Phase A — Preflight

1. Verify Node.js, ffmpeg/ffprobe, HyperFrames, required host capabilities, and output write access with `scripts/doctor.mjs`; its stable behavior is defined in [doctor-contract.md](doctor-contract.md).
2. Resolve configuration without printing credential values; follow [config-contract.md](config-contract.md) for user-level paths, precedence, storage, and safe status output.
3. Parse SRT with BOM, cross-platform newlines, integer milliseconds, multiline cues, and strict boundary validation according to [srt-contract.md](srt-contract.md).
4. Probe every controlling media file for decodeability, duration, dimensions, frame rate, and audio tracks.
5. Index user media by real metadata and filename/path language without copying private paths into public templates.
6. Create or resume state only after the input contract passes.

## Phase B — Directing

1. Read [semantic-segmentation.md](semantic-segmentation.md), merge subtitle cues into semantic shots, and validate the plan with `scripts/validate-shot-plan.mjs`; the model decides meaning while the script owns cue/time coverage.
2. Make the union of shot windows cover the complete SRT interval with no gap or overlap.
3. Read [concept-translation.md](concept-translation.md); for each shot, translate its claim into comprehension purpose, grounded visible structure, explanatory action, readable result, evidence boundary, asset needs, and anti-collision motif.
4. Run a separate silent/no-subtitle review and validate every brief with `scripts/validate-director-brief.mjs`. Replace generic decoration, invented evidence, subtitle dependence, or a cliché that does not explain the claim.
5. Protect user-design layers. Normalize the remaining signals for template matching.
6. Select one production base template. Borrow no more than two declared patterns from non-conflicting eligible templates.
7. Check the project motif ledger, adjacent-shot variation, repeated card structures, and complete-metaphor reuse.

When no production template is eligible, use the HyperFrames-native fallback. Never silently enable a draft.

## Phase C — Asset routing

For each shot, take the first semantically sufficient route:

1. User media: require content relevance, valid metadata, readable local file, sufficient dimensions, and a defensible crop.
2. Pexels: generate several concrete English queries, search image and video, filter metadata, freeze the chosen result locally, and retain source attribution.
3. Host image generation: use only when the host exposes a real image-generation capability; generate to a local file that matches protected design roles.
4. HyperFrames-native: use text, SVG, HTML/CSS, data relationships, shapes, and deterministic motion when media search/generation is unavailable or conceptually weaker.

Do not use logos, product interfaces, code output, prices, performance data, people, or events that were not supplied or verified.

## Phase D — HyperFrames build

Build the master and per-shot outputs from one normalized time model.

- The master uses SRT-global time.
- Every shot composition begins at local time zero and has exactly its master window duration.
- Talking-head masters retain source audio and do not burn subtitles or add BGM.
- Faceless B-roll masters are silent by default.
- Full-screen material renders to high-quality MP4.
- Crisp text, cards, and hard-edge cutouts may render to ProRes 4444 MOV after Alpha verification.
- Glow, particles, haze, and other soft light render to high-quality black-background MP4 for screen/lighten-style compositing.

Use the current installed HyperFrames skills and CLI output as technical truth. Historical command names, APIs, seek rules, and worker limits remain untrusted until they pass the current project checks.

## Phase E — Verification

Run all applicable gates:

1. Input: SRT validity, duration boundary, media decodeability, and writable paths.
2. Directing: complete coverage, meaningful concepts, one hero motif, protected user design, and no prohibited template borrowing.
3. Assets: local freeze, checksum, dimensions, crop, provenance, and no missing file. Run [asset-integrity-contract.md](asset-integrity-contract.md) after route selection; only its path-free receipt may enter build state.
4. HyperFrames: current lint/check/inspect behavior, deterministic seek, shared time truth, and successful render.
5. Media: codec/container, duration tolerance, dimensions, audio policy, Alpha semantics, and black level/light-layer semantics. Run [delivery-media-contract.md](delivery-media-contract.md); a filename extension alone is never evidence.
6. Visual: visible content at every shot midpoint and boundary; no blank frame, clipped focal content, unreadable result, or stale placeholder. Run [frame-visibility-contract.md](frame-visibility-contract.md); opaque, Alpha and black light layers have distinct pixel semantics.
7. Delivery: master plus all shot files exist, names are stable, count matches state, and the full SRT timeline remains covered.

Do not infer Alpha from `.mov`, light-layer behavior from a black thumbnail, or success from an exit code alone.

## Delivery contract

Create a delivery directory containing:

- one candidate master;
- one file per semantic shot;
- internal state and provenance outside the user-facing media folder.

Tell the user:

- master path;
- shots directory;
- count and total duration;
- whether user media, Pexels, image generation, or native graphics were used;
- which verification gates passed;
- any actual limitation, including unverified Windows or desktop-editor GUI behavior.

Generate this text only through [delivery-report-contract.md](delivery-report-contract.md), after every listed verification gate has passed.

Do not deliver a low-bitrate preview, thumbnail board, duplicate subtitle burn-in, automatic BGM, `edit-manifest.json`, or an isolated three-format test clip.

## Failure and resume rules

- Classify failures before retrying.
- Retry transient network and render failures with a bounded count.
- Reuse successful upstream stages whose fingerprints still match. Use [retry-resume-contract.md](retry-resume-contract.md): valid search/download/render cache hits skip producers, and only the current failed stage may retry within its bound.
- Replace only a failed asset or shot when downstream contracts permit it.
- Stop before paid or externally mutating work that falls outside the user's authorization.
- Surface the shortest actionable blocker when required local input, credential, codec, host capability, or renderer is genuinely unavailable.
