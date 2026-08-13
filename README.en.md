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
- HyperFrames and Remotion are independent backends; visual parity is not claimed.
- Windows, desktop CapCut/Jianying import, and automatic repair of arbitrary existing projects are not verified.
- The complete technical contract and troubleshooting guide remain in the [Simplified Chinese README](README.md).

License: [MIT](LICENSE) · Support details: [SUPPORT-MATRIX.md](SUPPORT-MATRIX.md) · Contributions: [CONTRIBUTING.md](CONTRIBUTING.md)
