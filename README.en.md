<div align="center">

# Erduo B-roll Loop Engineering

**Turn a complete original SRT and design into editable B-roll through an independent Director, fresh chapter Creators, Parent-run rendering, independent visual review, and focused repair by the original Creator.**

[简体中文](README.md) · **English** · [日本語](README.ja.md) · [한국어](README.ko.md) · [繁體中文](README.zh-TW.md)

[Demo](#real-output-demo) · [Install](#install) · [First run](#first-run) · [Limits](#verified-scope)

</div>

## Making motion graphics for your own talking-head videos? Start with Agent Motion

**If the introduction video brought you here and you want motion graphics for your own talking-head videos, we recommend [Agent Motion](https://github.com/erduo1998-cell/agent-motion#start).**

This project's multi-role, multi-stage B-roll workflow is involved and takes more effort to set up, understand, and maintain. Agent Motion is a closer fit for everyday talking-head production: give a coding agent your source video, complete SRT, and creative brief to produce an MP4 and editable project.

**[Go to Agent Motion for demos and setup →](https://github.com/erduo1998-cell/agent-motion#start)**

You can download Agent Motion as a ZIP and launch its installer. You still need Node.js 22+, a coding agent, and internet access for initial setup. It is a separate project, not an in-place upgrade. This repository's source, documentation, and past releases remain available for existing users and engineering reference.

Licenses differ: this project uses MIT; Agent Motion is for noncommercial use and requires prior written authorization for commercial use. See its [license](https://github.com/erduo1998-cell/agent-motion/blob/main/LICENSE).

## Real output demo

<p align="center">
  <img src="docs/images/demos/homepage-showcase.gif" alt="Real B-roll output showing SRT input, semantic direction, material integration, rendering and delivery" width="100%">
</p>

The lightweight GIF represents a complete 40-second, 3840 × 2160, 30 fps master. It demonstrates real visual capability; it does not promise the same picture for every input or visual parity between HyperFrames and Remotion.

## What it does

- Keeps the complete original SRT and design in one project and groups shots by meaning, timing, and continuity.
- Gives an independent Director the visual world and seams, then gives each fresh Creator one continuous passage, the originals, short shared direction, owned shot cards, and adjacent seam cards.
- Uses supplied media first and adds a material specialist only when real selection, search, or generation is needed.
- Lets the Parent run deterministic plan checks, per-shot render, decode, sheets, and preview assembly. Unchanged local results are reused after focused repairs.
- Requires a separate visual Reviewer to judge actual media. Specific feedback returns to the original Creator and only affected shots and seams are checked again.
- Has no mandatory three-sample set, five-shot canary, chapter shot count, material quota, or decorative element count in the v1.1.0 default flow.

## v1.1.0: Quality-first creative relay

The current default for new work is **independent Director → fresh continuous-passage Creator → Parent scripts → independent visual Reviewer → focused repair by the original Creator**. Picture quality comes first. Complete originals remain available to the creative roles, while focused task files avoid passing the Parent's full conversation, unrelated Skills, creator explanations, or cost figures into every decision.

The Parent uses [production commands](erduo-broll-loop-engineering/references/lean-production.md) to render, validate, assemble, and locally reuse unchanged output. A Creator views its render; the independent Reviewer then evaluates the real picture and moving seams. A contact sheet is not continuous playback, and technical success cannot approve aesthetics. Complex shared transitions or uncertain styles may use one representative passage before expansion, but this is a judgement call rather than a fixed gate.

The relay has validated focused rerender and reuse, but it has **not established lower end-to-end time or token use**. Task preparation cannot remove every host-injected instruction or enforce a sandbox. Existing Recipe/runtime-plan v1–v4 projects, explicit Remotion/hybrid work, and an explicitly requested five-shot version comparison stay on [legacy production](erduo-broll-loop-engineering/references/legacy-production.md) without silent migration.

## v1.0.1: Restore the Chapter Builder Loop

v1.0.1 is released. A semantic shot is still one independently decoded H.264 media boundary, while one Chapter Builder now owns the creative loop for normally 5–8 contiguous shots. It reads the complete original SRT and design, cannot change `truth`, may revise `creativeProposal` with one concise reason, and owns chapter composition, material, pacing, and seams.

Assets freezes known shared media/fonts without closing shot-specific `search`, `generate`, or `mixed` routes. Lead must build three final samples—native graphic/type, real-or-generated material fusion, and information-dense interface/process/data—plus the design's signature motion, fusion capabilities, and a short capability index. Every Chapter Builder must open the real six-frame sheets and chapter preview, repair defects, and return `accepted` or `revised`.

Production source no longer carries `inspection.tsx`, DOM trace markers, manual motion windows, or passing dense diagnostics. Parent owns deterministic render/decode/hash/contracts/sheets/preview. The positive twelve principles are a short role anchor; each shot selects only 2–4 relevant `craftIntent` values, with no score or proof work.

Production defaults to HyperFrames. Remotion is explicit opt-in or canary-only; `auto` is experimental opt-in. A five-shot canary must pass direct delivery, real Builder viewing, composition/material/signature-motion diversity, user preference of at least 3/5, and a ≤45-minute first preview before full production may start.

The 2026-08-18 179.866-second Remotion run remains failure evidence: 20/20 media contracts and decode passed, but it created 20 creative units, withheld the original design, used little material, and passing technical inspection did not produce acceptable visual quality. Its 203m13s / 54m17s / 63m13s timings also missed targets. It does not validate this reset or equal backends.

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
  <img src="docs/images/demos/quick-start.gif" alt="SRT to approved 4K master workflow" width="100%">
</p>

## Install

> These instructions install this project. For your own talking-head motion graphics, start with [Agent Motion's setup guide](https://github.com/erduo1998-cell/agent-motion#start).

### Standard Skill install

Use this on a machine that already has the pinned HyperFrames environment and only needs the fourteen project Skills registered in one host. Download `erduo-broll-loop-engineering-skills-v1.1.0.tar.gz` from the [v1.1.0 Release](https://github.com/erduo1998-cell/erduo-broll-loop-engineering/releases/tag/v1.1.0), extract it into a permanent directory, then run:

```bash
npx -y skills@1.5.22 add ./erduo-broll-loop-engineering-skills-1.1.0 --skill '*' --agent codex --global --full-depth
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

Restart your host after installation. The installer provisions the pinned HyperFrames environment and project Skills. It does not use `sudo`, edit your shell profile, or install Remotion globally. The same full package is available as `erduo-broll-loop-engineering-v1.1.0.tar.gz` on the v1.1.0 Release.

Run `node scripts/doctor.mjs` for diagnosis and `node scripts/uninstall.mjs` to remove the project Skill links; uninstall keeps user data by default. Maintainers can prepare a focused role task with `npm run task:creative -- --project /path/to/project --role director`.

## First run

Attach the complete original SRT and design, then ask:

```text
Use erduo-broll-loop-engineering to turn this complete original SRT and design into editable faceless B-roll shot files and a complete preview; create a full master only if I request it.
Keep the complete originals, use an independent Director, fresh continuous-passage Creators, Parent-run rendering, and independent visual review. Return visible defects to the original Creator for focused repair, then deliver ordered shots, editable source/assets, and the complete preview.
```

Talking-head mode also requires the matching edited video. Your images, clips, logos, and screenshots are optional but should be supplied at the start when available.

## Language support

UTF-8 SRT input is not restricted to Chinese. Actual language quality depends on the host model's understanding and on project fonts covering the required glyphs. Full subtitles are not burned into the default B-roll master.

## Verified scope

- The v1.1.0 relay has been exercised on macOS Codex with independent direction, creation and review, real decode, preview assembly, and focused rerender reuse. Claude Code installation/contracts are covered, but its same-input current-flow comparison remains pending.
- v1.1.0 new work defaults to pinned HyperFrames and delivers ordered shot files, editable HTML/assets, a complete preview, actual output facts, and remaining limitations. Draft and final output remain separate.
- In the historical v1.0.1 release, a same-input five-shot HyperFrames canary passed direct render, full decode, viewing receipts, composition/material diversity, and signature-motion gates. The user approved the result and explicitly chose to publish without producing the remaining shots or a full preview. Full-film production and equal-backend support are therefore not claimed.
- The historical v1.0.0 benchmark used a 179.866-second input and reached its first preview in about 242.05 minutes; v1.0.1's five-shot canary was accepted but the remaining film was cancelled. These are historical limits, not evidence that v1.1.0 lowers total time or tokens.
- Existing Remotion/hybrid projects use the v1.0.1-compatible legacy route. HyperFrames and Remotion are independent backends; visual parity is not claimed.
- Windows, desktop CapCut/Jianying import, and automatic repair of arbitrary existing projects are not verified.
- The complete technical contract and troubleshooting guide remain in the [Simplified Chinese README](README.md).

## Workflow

<p align="center">
  <img src="docs/images/workflow-zh.svg" alt="Workflow from complete SRT through independent direction, chapter creation, Parent rendering, visual review, focused repair and delivery" width="100%">
</p>

## Contact the author

<table>
  <tr>
    <td width="260" align="center">
      <img src="docs/images/wechat-contact.jpg" alt="Erduo WeChat QR code" width="220">
    </td>
    <td>
      <strong>刘冉 / 耳朵</strong><br><br>
      AI consultant · Former film director · Open-source Agent tool practitioner<br><br>
      GitHub: <a href="https://github.com/erduo1998-cell">@erduo1998-cell</a><br>
      Website: <a href="https://erduo.art">erduo.art</a><br>
      WeChat: scan the QR code on the left
    </td>
  </tr>
</table>

License: [MIT](LICENSE) · Support details: [SUPPORT-MATRIX.md](SUPPORT-MATRIX.md) · Contributions: [CONTRIBUTING.md](CONTRIBUTING.md)
