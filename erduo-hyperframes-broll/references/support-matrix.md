# Support matrix

`baseline verified` means a small deterministic fixture proved installation, HyperFrames checks, rendering and media validation. It does **not** mean the current re-architected production pipeline has passed a real-input visual-quality gate.

| Surface | Baseline | Current production pipeline | Evidence / limit |
| --- | --- | --- | --- |
| macOS + Codex | baseline verified | pending final real-input E2E | The older 4-second fixture passed HyperFrames 0.7.64 check, render, decode and frame visibility. It did not exercise the complete current artifact-first pipeline and self-contained director method. |
| macOS + Claude Code | baseline verified | two real-input runs failed; short-pipeline re-test required | The 2026-07-22 latest run used a stale copied Skill set and `deepseek-v4-pro`, created 20 child contexts over about 2h04m, rendered literal `\\uXXXX`, black spans and bright low-information frames, then falsely reported zero visual findings. It is failure evidence, not production verification. `deepseek-v4-pro` is not accepted for main visual gates. |
| Windows | unverified | unverified | Path/config/command contracts have deterministic tests, but no Windows host has run the current pipeline. |
| Jianying/CapCut desktop GUI | unverified | unverified | Outputs target MP4, ProRes 4444 MOV and black-background light-pass contracts, but no current GUI import test exists. |

The current production status may become `verified` only after the re-architected pipeline completes the same real-input gate on the named host and the actual rendered result passes the documented visual and media review. No `pending`, `failed`, or `unverified` row may be described as supported in package metadata, user reports or release notes.

The public package has no required third-party director Skill. Its director method is bundled. Optional enhancers are accepted only with public source, pinned version and license evidence, and never affect baseline support.
