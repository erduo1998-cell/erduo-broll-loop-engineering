# erduo-hyperframes-broll

`erduo-hyperframes-broll` is an agent Skill that turns an edited talking-head video plus SRT, or an SRT-only faceless script, into an editable HyperFrames B-roll master. It treats the SRT as the timing truth, authors long films through bounded isolated agents, integrates block source without rewriting, renders one final 4K master, and verifies the rendered media before reporting delivery.

## Release status

The repository currently contains a **pre-release candidate**. M21's script-only v3 migration and its fresh, real-input Codex and Claude Code end-to-end runs are still incomplete. Earlier deterministic fixtures passed on macOS, but they do not establish production verification. Do not describe this checkout as production-verified until the dual-host gate is recorded in [the support matrix](erduo-hyperframes-broll/references/support-matrix.md).

Use the public [release checklist](RELEASE-CHECKLIST.md) for the final dual-host production gate and publication decision.

## What it delivers

- Candidate visuals covering 100% of the SRT timeline.
- One verified master by default.
- Master-derived per-shot files only when requested after master verification.
- No burned subtitles or automatic BGM; faceless masters are silent unless the confirmed brief says otherwise.

The master is a production candidate, not a promise that every generated shot should remain in the final edit.

## Current authoring topology

Current runs require:

```text
pipeline_contract_version: 3
authoring_topology_id: script-only-authoring-cluster-v1
validation_policy_id: script-only-production-v1
```

The active workflow is:

```text
Director
→ Assets
→ bounded parallel Master Build
→ byte-preserving Integrate
→ one 4K Render
→ technical delivery
→ optional master-derived shot export
```

The public defaults are at most 8 shots and at most 45,000 ms per chunk. A
single shot longer than that duration remains one singleton chunk; shots are
never split. Every run emits only the five script-only v3 gate families:
`policy-gate`, `source-conformance-gate`, `runtime-seek-gate`,
`pixel-signal-gate` and `integration-delivery-gate`. A failed block may be
replaced once without rebuilding passing blocks.

The integrator may add only the deterministic wrapper and integration map. It
must preserve every chunk source byte. Render authority is limited to the
current sealed contract, all required five-gate receipts, the current
integrated manifest and its no-rewrite proof. Render runs once; afterward only
deterministic technical media verification remains.

Earlier pipeline artifacts are inspection-only and cannot resume into v3.
ReachSurge is private minimum authoring calibration and a source of generalized
negative fixtures only. Its source, identity, verdicts and hashes never enter
public receipts, production/reference profiles, the public package or the user
report. Deep Current remains project-only and is not a public default.

## Requirements

- macOS for the currently validated baseline. Windows and Jianying/CapCut desktop GUI import remain unverified.
- A local agent host with filesystem read/write, shell execution, and isolated subagent/task support.
- Node.js, `ffmpeg`/`ffprobe`, and a locally installed HyperFrames CLI plus its current Skills.
- A Pexels Image & Video API key. The key is stored only in the user configuration or `PEXELS_API_KEY`; it is never included in project state or this repository.
- Every active `broll-*` stage Skill enumerated by `install-stage-skills.mjs`, including the independent integrator, installed beside the parent Skill.

The director method is self-contained in this package. An external director enhancer is optional and may be used only when its public source, fixed version, license, and provenance are recorded. Its absence or failure must never block a run.

## Install from a checkout

The checkout is the canonical source. Install by symlink so every host and
stage resolves the same revision. Replace `<repo>` with the absolute checkout
path.

### Codex

```bash
node "<repo>/erduo-hyperframes-broll/scripts/install-stage-skills.mjs" ~/.codex/skills
```

### Claude Code

```bash
node "<repo>/erduo-hyperframes-broll/scripts/install-stage-skills.mjs" ~/.claude/skills
```

The installer refuses to replace occupied paths by default. During a planned
takeover, preserve an existing installation and replace it atomically:

```bash
node "<repo>/erduo-hyperframes-broll/scripts/install-stage-skills.mjs" \
  ~/.codex/skills \
  --backup-occupied "<backup-directory>"
```

Restart the host after installing Skills.

## Development takeover and testing

Open the repository root—the directory containing `AGENTS.md`—rather than a
global Skill installation. The current top-level Codex CLI is the default
executor for routine development tests.

Run the complete deterministic gate from any working directory:

```bash
node "<repo>/erduo-hyperframes-broll/scripts/run-project-tests.mjs" \
  --project-root "<repo>"
```

This checks project governance, all Node tests, all seven active Skill layouts,
the public-package and license boundaries, and `git diff --check`. When the
official Skill validator and a Python environment with PyYAML are available,
the same command also runs that validator for all seven Skills. Routine
deterministic tests never replace the final dual-host production gate listed in
the [release checklist](RELEASE-CHECKLIST.md).

## Portable development snapshots

Create a self-verifying archive outside the repository:

```bash
node "<repo>/erduo-hyperframes-broll/scripts/create-portable-snapshot.mjs" \
  create "<repo>" "<destination>/erduo-hyperframes-broll-portable.tar.gz"
```

The archive includes `.git`, tracked changes and untracked work, plus a
SHA-256 manifest. It excludes runtime caches, `node_modules`, and renders.
After extracting, verify it before continuing:

```bash
node "<extracted-repo>/erduo-hyperframes-broll/scripts/create-portable-snapshot.mjs" \
  verify "<extracted-repo>"
```

Node.js, FFmpeg/FFprobe, HyperFrames, API keys, global Skill links and private
external provenance are machine-level dependencies and must be provisioned
separately after migration.

## Fonts

The repository does not bundle display fonts. A run that needs a title/emphasis face accepts only a local user-provided font together with its local license file and an explicit `user-confirmed-licensed` declaration; it copies the verified bytes and license into that generated project only. Users remain responsible for having the required rights.

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
