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
- Shows three representative moving scenes for visual lock before bulk production, then stops again at the complete preview before verified delivery.

## v1.0.0 Visual Lock Before Bulk Production

- Director shots normally target about 5–12 seconds of complete meaning. Runtime Plan v3 independently groups several short shots into each Builder unit; 2–3 Builders is the planning target for an ordinary 180-second single-backend film, not a forced quota.
- A Lead Builder first produces one opening, one information-dense, and one late representative scene plus importable visual source for each actual backend. The user approves, requests revision, or explicitly skips the lock before remaining Builders fan out.
- Ordinary single-backend units default to high-quality H.264 MP4 (`libx264 / medium / CRF 12`). FFV1 remains an explicit, reason-bound upgrade for Hybrid, transparency, or a real lossless exchange need.
- Motion/layout checks sample beat boundaries, readable holds, cuts, and necessary points first. Only findings and inherently precise diagrams or paths escalate to dense traces; passing work does not generate full-film frame PNGs.
- Public-safe production metrics cover stage time, Agent calls, units, files/bytes, render/trace/decode/hash work, failures/retries, and optional host token facts. Missing token facts remain unknown and are never estimated from private session storage.

The [v1.0.0 public production benchmark](docs/V1.0.0-BENCHMARK.md) now records one real Codex run on the same 179.866-second SRT: 20 Shot Recipe v3 files, one Lead plus three production Builders, 10 Agent calls, zero full-history calls, no external assets, 213 files, and 156,980 KiB of disk use. Preview and master passed full decode. Director start to first preview took about 242.05 minutes, missing the 120-minute target; Lead took 62.90 minutes, missing the 45-minute target. One Director visual-lock rejection was fixed and rechecked, but the user did not watch or approve the aesthetics, so visual lock is `skipped`. Host tokens are unknown, A/V sync was not tested, and the same-input Claude Code comparison remains pending.

## v0.9.2 Same Production, Safer Installation

v0.9.2 changes packaging and installation only. Director, Assets, multiple Builders, 152 Shotcraft cards, eight diagram grammars, runtime routing, preview approval, and delivery contracts are unchanged from v0.9.1. The standard Skill archive excludes the environment bootstrapper, test fixtures, and release tooling; the full archive keeps the pinned one-click environment setup.

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

The checks can flag missing planned development and measurable motion/layout risks. They cannot judge whether animation is sophisticated or make an aesthetic decision. Visual lock controls bulk fan-out; the complete moving preview controls delivery. Cross-backend visual parity is not claimed.

<p align="center">
  <img src="https://raw.githubusercontent.com/erduo1998-cell/erduo-broll-loop-engineering/main/docs/images/demos/quick-start.gif" alt="SRT to approved 4K master workflow" width="100%">
</p>

## Install

### Standard Skill install

Use this on a machine that already has the pinned HyperFrames environment and only needs the fourteen project Skills registered in one host. Download `erduo-broll-loop-engineering-skills-v1.0.0.tar.gz` from the [v1.0.0 Release](https://github.com/erduo1998-cell/erduo-broll-loop-engineering/releases/tag/v1.0.0), extract it into a permanent directory, then run:

```bash
npx -y skills@1.5.22 add ./erduo-broll-loop-engineering-skills-1.0.0 --skill '*' --agent codex --global --full-depth
# replace codex with claude-code for Claude Code
```

This path uses the Skills CLI universal host store and does not execute this repository's one-click environment bootstrapper. It never silently prepares Node, a browser, or FFmpeg and never reduces production capability. If Node 22.20+, FFmpeg/FFprobe, the pinned HyperFrames runtime, its eight official Skills, or its browser are missing, preflight stops and the full install below is required.

### Full environment install

Use this for a first install or when machine readiness is unknown.

```bash
git clone https://github.com/erduo1998-cell/erduo-broll-loop-engineering.git
cd erduo-broll-loop-engineering
./Install.command
```

Restart your host after installation. The installer provisions the pinned HyperFrames environment and thirteen stage Skills. It does not use `sudo`, edit your shell profile, or install Remotion globally. The same full package is available as `erduo-broll-loop-engineering-v1.0.0.tar.gz` on the v1.0.0 Release.

## First run

Attach an SRT and ask:

```text
Use erduo-broll-loop-engineering to turn this SRT into a faceless B-roll master.
Continue unattended, but stop for my visual lock on the three representative scenes and again for final-preview delivery approval.
```

Talking-head mode also requires the matching edited video. Your images, clips, logos, and screenshots are optional but should be supplied at the start when available.

## Language support

UTF-8 SRT input is not restricted to Chinese. Actual language quality depends on the host model's understanding and on project fonts covering the required glyphs. Full subtitles are not burned into the default B-roll master.

## Verified scope

- Codex completed the v1.0.0 production benchmark on macOS. Claude Code installation/contracts are covered, but its same-input v1 production comparison remains pending.
- Default delivery: H.264 MP4, 3840 × 2160, 30 fps.
- Default unit media: high-quality H.264 MP4. Lossless FFV1 requires an explicit reason; Hybrid never shares runtime-specific visual source across backends.
- Output policy is generated by `create-production-profile.mjs`, never hand-written. The Parent always passes that file to `plan-runtime.mjs --production-profile`; explicit width, height, fps, audio, and H.264 MP4 policy are hash-bound into the plan, every Builder assignment, and delivery checks. For example, `--width 1080 --height 1920 --fps 25 --audio silent --master-format h264-mp4` creates a vertical 25 fps profile instead of falling back to the default.
- HyperFrames and Remotion are independent backends; visual parity is not claimed.
- Windows, desktop CapCut/Jianying import, and automatic repair of arbitrary existing projects are not verified.
- The complete technical contract and troubleshooting guide remain in the [Simplified Chinese README](README.md).

License: [MIT](LICENSE) · Support details: [SUPPORT-MATRIX.md](SUPPORT-MATRIX.md) · Contributions: [CONTRIBUTING.md](CONTRIBUTING.md)
