---
name: erduo-hyperframes-broll
description: Create complete, editable HyperFrames B-roll from an edited talking-head video plus SRT, or from an SRT-only faceless script. Use when Codex or Claude Code must segment subtitles by meaning, route user/Pexels/generated/native visuals, build a candidate master covering 100% of the SRT timeline, export per-shot media for desktop editing, resume an interrupted B-roll run, or verify its delivery.
---

# Erduo HyperFrames B-roll

Orchestrate five installed stage Skills to create candidate B-roll that explains the narration rather than decorating it. Deliver a complete master plus removable per-shot media; let the user decide final adoption in the editor.

## Start safely

1. Require local file read/write access, shell execution, and a callable HyperFrames installation. Stop with a concrete missing-capability report when any is absent.
2. Read [references/workflow.md](references/workflow.md) and [references/stage-orchestration.md](references/stage-orchestration.md) completely before executing a new or resumed run.
3. Require installed `broll-preflight`, `broll-director`, `broll-assets`, `broll-render`, and `broll-verify` Skills. Detect an existing `.erduo-hyperframes-broll/run.json` and resume only matching verified stages.
4. Never expose secrets, private source paths, internal run state, provenance ledgers, or development-only sample content in the user report.

## Resolve the input mode

- For talking-head mode, require one edited source video and its matching SRT. Preserve source audio in the candidate master.
- For faceless mode, require an SRT. Keep the B-roll master silent unless the user explicitly supplies an audio track to preserve.
- Treat SRT timestamps as the time truth source. Do not extend the timeline to let an animation finish.
- Ask once whether the user has local images, clips, or a design reference. After the answer, run unattended except for the first missing Pexels credential or an actual blocking input error.

## Dispatch the pipeline

1. Ask the one material/design question once, perform capability detection, then dispatch `broll-preflight`.
2. Verify its receipt and dispatch `broll-director`. Require it to invoke `video-script-builder` for directing judgment; reject word-estimated timing, `video-spec-hf.md`, and any override of the asset order.
3. Verify each receipt before dispatching `broll-assets`, `broll-render`, and `broll-verify`, in that order. A failed stage resumes from itself; no later stage may run.
4. Only after the `verify` receipt passes, report delivery. Stage Skills must never separately announce completion.

## Preserve fixed product behavior

- Produce candidate visuals for 100% of the SRT timeline in both modes.
- Do not burn subtitles, add BGM, create a low-bitrate preview, show a thumbnail storyboard, emit `edit-manifest.json`, or create a separate three-format test clip.
- Prefer the user's design over the visual quality of talking-head footage; use footage stills only as blending constraints.
- Keep one hero motif per shot, vary at least two of layout, entrance direction, primary action, and focus position across adjacent shots, and do not replay a complete causal metaphor.
- Keep glow and particles out of ordinary Alpha output. Split soft light into black-background light media when required.

## Recover or fail honestly

- Retry only the failed shot or stage after classifying the error as input, credential, search, download, generation, build, render, or verification failure.
- Fall back from unavailable generation to HyperFrames-native visuals without leaving a timeline gap.
- Do not mark a template production, a render successful, or a platform supported from configuration or lint alone. Require the evidence gates recorded by the library and delivery validators.
- Report Windows and desktop-editor GUI behavior as `unverified` until real evidence exists; do not block a verified macOS delivery solely for that reason.

## Report the result

Return only the master path, per-shot directory, shot count, duration, asset routes used, verification result, and real remaining limitations. Do not require the user to read internal JSON or technical reports.
