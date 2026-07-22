# erduo-hyperframes-broll

`erduo-hyperframes-broll` is an agent Skill that turns an edited talking-head video plus SRT, or an SRT-only faceless script, into an editable HyperFrames B-roll master. It treats the SRT as the timing truth, delegates heavy stages to isolated agents, and verifies the rendered media before reporting delivery.

## Release status

The repository currently contains a **pre-release candidate**. Earlier deterministic fixtures passed on macOS, but the re-architected production pipeline has not yet passed the final real-input Codex and Claude Code run. Do not describe this checkout as production-verified until that gate is recorded in [the support matrix](erduo-hyperframes-broll/references/support-matrix.md).

Use the public [release checklist](RELEASE-CHECKLIST.md) for the final dual-host production gate and publication decision.

## What it delivers

- Candidate visuals covering 100% of the SRT timeline.
- One verified master by default.
- Master-derived per-shot files only when requested after master verification.
- No burned subtitles or automatic BGM; faceless masters are silent unless the confirmed brief says otherwise.

The master is a production candidate, not a promise that every generated shot should remain in the final edit.

## Requirements

- macOS for the currently validated baseline. Windows and Jianying/CapCut desktop GUI import remain unverified.
- A local agent host with filesystem read/write, shell execution, and isolated subagent/task support.
- Node.js, `ffmpeg`/`ffprobe`, and a locally installed HyperFrames CLI plus its current Skills.
- A Pexels Image & Video API key. The key is stored only in the user configuration or `PEXELS_API_KEY`; it is never included in project state or this repository.
- Every active `broll-*` stage Skill enumerated by `install-stage-skills.mjs`, installed beside the parent Skill.

The director method is self-contained in this package. An external director enhancer is optional and may be used only when its public source, fixed version, license, and provenance are recorded. Its absence or failure must never block a run.

## Install from a checkout

The commands below install by symlink so updates remain tied to one source tree. Replace `<repo>` with the absolute checkout path.

### Codex

```bash
ln -s "<repo>/erduo-hyperframes-broll" ~/.codex/skills/erduo-hyperframes-broll
node "<repo>/erduo-hyperframes-broll/scripts/install-stage-skills.mjs" ~/.codex/skills
```

### Claude Code

```bash
ln -s "<repo>/erduo-hyperframes-broll" ~/.claude/skills/erduo-hyperframes-broll
node "<repo>/erduo-hyperframes-broll/scripts/install-stage-skills.mjs" ~/.claude/skills
```

Restart the host after installing Skills. The installer refuses to replace occupied stage paths.

## Fonts

The repository bundles 19 user-provided display fonts for project-level title/emphasis selection. Their files and hashes are audited, but their redistribution and commercial-use rights have not been independently verified; do not treat repository inclusion as a license grant.

Full Noto CJK information-font binaries are not bundled. On first production use, the runtime first tries the pinned official `raw_url`; only a network or HTTP failure may use GitHub Contents → Blob APIs against the same repository, commit and source path. Any successful response whose byte length or SHA-256 differs from the pin fails closed—there is no mirror fallback. After verification against the bundled OFL-1.1 text, the runtime should subset the required glyphs when a validated subsetter is available; otherwise it copies the verified complete font into the generated project. Both paths use project-local `@font-face`. Network fonts, system-font fallback, or an unverified download are release failures. See [the font source contract](erduo-hyperframes-broll/references/font-sources.md).

## Public release boundary

Only paths listed in [release-allowlist.txt](release-allowlist.txt) may be staged or published. Internal governance, handoff logs, private source paths, production samples, rendered media, credentials, and user data are deliberately excluded by `.gitignore`. Do not use `git add -f` to bypass this boundary.

Before a release, run:

```bash
node erduo-hyperframes-broll/scripts/audit-public-package.mjs erduo-hyperframes-broll
node erduo-hyperframes-broll/scripts/audit-license-notices.mjs erduo-hyperframes-broll
```

## License and third-party sources

Project code and documentation are licensed under the root [MIT License](LICENSE). Bundled or runtime-acquired third-party materials retain their own licenses. See [third-party notices](erduo-hyperframes-broll/references/third-party-notices.md). Pexels media is not redistributed in this repository; users remain responsible for the provider's current terms and for retaining provenance.
