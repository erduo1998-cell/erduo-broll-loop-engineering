<div align="center">

# Erduo B-roll Loop Engineering

**Turn an SRT and an optional edited talking-head video into an editable, reviewable B-roll master with Codex or Claude Code.**

[简体中文](README.md) · **English** · [日本語](README.ja.md) · [한국어](README.ko.md) · [繁體中文](README.zh-TW.md)

[Demo](#real-output-demo) · [Install](#install) · [First run](#first-run) · [Limits](#verified-scope)

</div>

## Real output demo

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/demos/infinite-canvas-pipeline.gif" alt="A continuous infinite-canvas journey from SRT timing to an approved 4K master" width="100%">
</p>

This 12-second concept film travels through one continuous world: SRT timing, semantic direction and frozen material, deterministic backend routing, then preview approval and a technically verified 4K master. Generated environment assets share one art direction; typography and camera motion are deterministic HyperFrames animation. It demonstrates the production path, not the output of a particular user SRT or a claim of visual parity between backends.

## What it does

- Converts integer-millisecond SRT timing into semantic shots rather than one shot per subtitle.
- Freezes a shared visual system and compact shot recipes before implementation.
- Routes complete shot blocks to HyperFrames, Remotion, or a frozen-media hybrid plan using project evidence.
- Uses supplied media first and sources extra material only when a shot requires it.
- Stops at the complete composition preview for approval, then renders and verifies one 4K master.

## v0.9.1 Creative Production and Clearer Diagrams

- Keeps one Director, one Assets role, and multiple focused Builders. It does not reduce animation to fixed templates or restrict composition, metaphor, or motion complexity.
- The Parent directly runs deterministic scripts for backend planning, task dispatch, validation, clip assembly, and preview preparation, with no Runtime Planner, Integrator, or Render Agent. One production shares assets and identical dependencies instead of copying complete projects.
- Each Builder delivers editable source plus a validated video clip with a common profile. Scripts concatenate the clips; they do not claim to understand or merge arbitrary HyperFrames and Remotion source.
- The complete preview is capped at 1080p and encoded with `veryfast / CRF 22`. Its approval identity binds the runtime plan, narrative envelope, visual system, every shot contract, and the actual clip hashes.
- Delivery must pass `--plan`, `--narrative-envelope`, `--visual-system`, and every `--contract` again. It rechecks identity and creates the full-spec `medium / CRF 16` master from frozen clips; it never copies the preview as the master.
- Turns spoken meaning and emotion into animation beats. Builders must make the subject, space, hierarchy, relationships, or visual focus visibly develop; decorative loops do not count as the main animation.
- When speech depends on process, cause, time order, hierarchy, feedback, dependency, a system route, or aligned comparison, the Director may select one of eight compact diagram grammars. There is no diagram quota, external full Skill load, or fixed visual skin.
- Builders still design space, material, and motion from the film's visual system. Runtime-captured checks only reject connectors crossing unrelated nodes, labels touching paths or nodes, shared connector paths, and canvas escape; they do not score the diagram style.
- Sends targeted revisions back to the responsible Builder without giving every Builder the full production history.

The checks can flag missing planned development and measurable motion/layout risks. They cannot judge whether animation is sophisticated or make an aesthetic decision, so the single complete moving preview remains the user gate. Cross-backend visual parity is not claimed.

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/demos/quick-start.gif" alt="SRT to approved 4K master workflow" width="100%">
</p>

## Install

Requirements: macOS, Node.js 20 or later, FFmpeg/FFprobe, and Codex or Claude Code.

```bash
git clone https://github.com/erduo1998-cell/erduo-broll-loop-engineering.git
cd erduo-broll-loop-engineering
./Install.command
```

Restart your host after installation. The installer provisions the pinned HyperFrames environment and thirteen stage Skills. It does not use `sudo`, edit your shell profile, or install Remotion globally.

## First run

Attach an SRT and ask:

```text
Use erduo-broll-loop-engineering to turn this SRT into a faceless B-roll master.
Continue unattended until the final preview requires my approval.
```

Talking-head mode also requires the matching edited video. Your images, clips, logos, and screenshots are optional but should be supplied at the start when available.

## Language support

UTF-8 SRT input is not restricted to Chinese. Actual language quality depends on the host model's understanding and on project fonts covering the required glyphs. Full subtitles are not burned into the default B-roll master.

## Verified scope

- Verified hosts: Codex and Claude Code on macOS.
- Default delivery: H.264 MP4, 3840 × 2160, 30 fps.
- Output policy is generated by `create-production-profile.mjs`, never hand-written. The Parent always passes that file to `plan-runtime.mjs --production-profile`; explicit width, height, fps, audio, and H.264 MP4 policy are hash-bound into the plan, every Builder assignment, and delivery checks. For example, `--width 1080 --height 1920 --fps 25 --audio silent --master-format h264-mp4` creates a vertical 25 fps profile instead of falling back to the default.
- HyperFrames and Remotion are independent backends; visual parity is not claimed.
- Windows, desktop CapCut/Jianying import, and automatic repair of arbitrary existing projects are not verified.
- The complete technical contract and troubleshooting guide remain in the [Simplified Chinese README](README.md).

License: [MIT](LICENSE) · Support details: [SUPPORT-MATRIX.md](SUPPORT-MATRIX.md) · Contributions: [CONTRIBUTING.md](CONTRIBUTING.md)
