# Remotion production backend

Read this reference only after the runtime router has selected `remotion`.
It defines the common contract for the Remotion Builder, Integrator, and
Render/Delivery stages. It does not change the HyperFrames route.

## Provenance and scope

The backend design is informed by the pinned Apache-2.0
`Vincentwei1021/video-shotcraft` source at Git commit
`41ee360d82f4c491ba9d88a24a4add7d8ff1cf8b`. Its useful production ideas are
native Remotion compositions, frame-owned state, runtime geometry inspection,
ordered `Sequence` assembly, and render verification. This repository's stage
contracts and verifier are original. Imported reference TSX remains under
`references/shotcraft/remotion-sources/` with its own manifest, provenance,
and license notice.

The imported TSX is auditable reference source, not an installed component
library. Never import production code from the installed Skill directory.
For a selected card, query the card first and use only its returned
`remotionSources` under either `demos/` or `template/src/`, plus required
shared fixtures. Adapt the motion grammar to
the actual Shot Recipe, frozen assets, typography, dimensions, and timing.
Normalize query results beginning with `remotion-sources/` to the full
Skill-root-relative `references/shotcraft/remotion-sources/...` form before
recording manifest `referenceFiles`.
If substantial upstream code is retained, preserve an Apache-2.0 notice in
the generated source and record the exact upstream paths in build notes.

The imported reference set contains no image, video, audio, or font payloads.
Replace external-media imports with Assets-stage files. A missing demo is not
a blocker: implement the Recipe's declared fallback from first principles and
record why the fallback was used. Never describe a card or demo as a ready
production component.

## Project-resolved runtime version

Create a self-contained source/manifest project inside the production
directory. Do not install packages into the Skill repository or a global
prefix. Use Node.js 22 or newer. This release deliberately does not pin one
global Remotion version.

Every production project still has to be reproducible:

- `remotion` and `@remotion/cli` must be exact semver declarations at the same
  concrete version;
- `react` and `react-dom` must also use the same exact version;
- `@types/react`, `typescript`, and every additional dependency must be exact;
- `package-lock.json` v3 must close over those declarations using only npm
  registry HTTPS tarballs with integrity values;
- the installed packages and project-local `remotion versions` probe exposed
  through its shared-toolchain link must
  report the same version recorded in `remotion-project.json`.

For an existing project, preserve its compatible exact lock after the local
CLI and required feature canaries pass. For a genuinely new project, the
authorized Onboarding repair Agent reads current stable registry metadata,
selects one concrete Remotion version for which the same
`@remotion/cli` version exists, resolves compatible exact React and TypeScript
packages, records the resolution time and package metadata, and then writes
the exact project declarations and lock. Never put `latest`, a caret, a tilde,
or a range into a production project. Never let `npx` choose or download a
runtime during Build, Integration, Preview, or Render.

Before installing or invoking Remotion, show the user the official
[Remotion licensing page](https://www.remotion.dev/docs/licensing) and record
their confirmation that the intended use is covered. Do not infer commercial
license eligibility from this Skill or from successful package installation.

Add another package only when the selected native implementation needs it.
Pin it exactly, resolve it through `https://registry.npmjs.org/`, review its
license, and record the reason and license in build notes. Generate the lock
before preparation and inspect it for non-registry sources. Run only binaries
through the unit/master's `node_modules` link and checked-in Node entry points;
do not let a command silently download a different CLI. `package.json` scripts
may expose the same exact commands for user convenience, but production stages
must invoke the local Node entry points directly.

## Shared dependency toolchain

Source isolation does not require dependency duplication. Run the bundled
preparer from the parent Skill root for every Remotion unit and master:

```text
node scripts/remotion-toolchain.mjs prepare \
  --project <unit-or-master-project> \
  --production-root <broll-production> \
  --receipt <unit-or-master-evidence/toolchain.json>
```

The script derives an identity from the exact dependency declarations, full
lock closure, Node major, platform, and architecture. The first caller installs
that identity under `.remotion-toolchains/`; later matching callers reuse it
and receive a project-root `node_modules` link. A different exact closure gets
another toolchain. Never run private per-unit `npm ci`, copy `node_modules`, or
delete an existing private dependency tree automatically; stop and migrate it
explicitly. The dependency link is the only permitted project symlink and the
verifier continues to exclude dependency bytes from production identity.

Wrap every install, typecheck, browser geometry trace, diagnostic render,
block freeze, Studio launch, and formal render:

```text
node scripts/remotion-toolchain.mjs run-heavy \
  --production-root <broll-production> \
  --cwd <unit-or-master-project> -- \
  <direct executable> [arguments...]
```

The fixed two-slot queue prevents an arbitrary number of Builders from running
heavy local processes together. Source authoring does not use this queue. Do
not add automatic CPU/memory tuning; the bounded queue is the complete resource
rule. A shared npm cache may reduce downloads, but it is not dependency reuse
and never substitutes for the shared toolchain receipt.

Every command follows [shared command execution](safe-execution.md) and consumes
only its compact result.

## HTML-in-canvas capability

`effects.dom-pixel-postprocess` is a native Remotion capability for capturing
a live deterministic DOM subtree into `<HtmlInCanvas>` and post-processing it
with Canvas 2D or WebGL2. It is an implementation capability inside a Remotion
shot, not a new runtime and not a bridge to HyperFrames.

Version numbers alone do not prove this experimental browser capability. The
cached readiness plus the capability-specific preflight must bind the exact local Remotion version,
browser, and render backend, and must include a real project-local still
canary whose source imports and mounts `<HtmlInCanvas>`. Require Remotion
`4.0.455` or newer, confirm `HtmlInCanvas.isSupported()` in the preview
browser, and render the canary through the same local CLI used for production.
The current Studio preview floor is Chrome 149 with
`chrome://flags/#canvas-draw-element` enabled; record the exact browser fact
rather than assuming a future browser keeps the same experimental API.

The initial production contract supports only:

- `canvas-2d`, using `drawElementImage()` in `onPaint`;
- `webgl2`, initializing and cleaning GPU resources through `onInit` and
  drawing the current `elementImage` in `onPaint`;
- one non-nested capture layer at any point in the rendered component tree;
- frame-derived effect parameters from `useCurrentFrame()` and the canonical
  fps, with a real readable hold after any readability-reducing distortion.

WebGPU, nested `<HtmlInCanvas>`, undocumented crop APIs, direct browser API
use, ambient animation loops, and silent visual fallbacks are outside this
contract. A failed support check or still canary is `unsupported` for this
capability, not permission to weaken the Recipe or switch backend.

For WebGL2, freeze either `angle` or `swangle` in the identity-bound
`remotion.config.ts` through
`Config.setChromiumOpenGlRenderer()`. Use `angle` when the verified render host
has the required GPU path and `swangle` for a verified software path. Builder,
Integrator, Studio/preflight, and formal Render must use the same value.

When this capability appears in any shot, `remotion-project.json` must declare:

```json
{
  "runtimeFeatures": {
    "htmlInCanvas": {
      "paintBackends": ["canvas-2d"],
      "nested": false,
      "chromiumOpenGlRenderer": "browser-default"
    }
  }
}
```

For WebGL2, use `"paintBackends": ["webgl2"]` or list both actually used
backends, and set `chromiumOpenGlRenderer` to the frozen `angle` or `swangle`
value. The verifier rejects a capability/manifest mismatch, an unsupported
backend, an older Remotion version, missing component/context evidence, or a
missing GL configuration.

## Canonical frame mapping

The SRT-bound Shot Recipe remains the time truth. At integer `fps`, map every
absolute millisecond boundary independently with exact half-up rounding:

```text
frame(ms) = floor((ms * fps + 500) / 1000)
```

For a shot `[startMs, endMs)`, use:

```text
startFrame       = frame(startMs)
endFrame         = frame(endMs)
durationInFrames = endFrame - startFrame
sequenceFrom     = startFrame - compositionStartFrame
```

Use the same conversion for phases and readable holds. Never accumulate
rounded durations, because that introduces drift. Reject a mapping with a
non-positive frame duration. At a shared millisecond boundary, the previous
exclusive `endFrame` must equal the next inclusive `startFrame`; therefore
adjacent shots have no frame gap or overlap. Record both source milliseconds
and mapped frames in `remotion-project.json`.

The resulting media duration is the integer-frame representation of the SRT
end, not a claim that arbitrary milliseconds divide evenly by the frame rate.
Record boundary quantization in technical verification.

## Project and manifest contract

Each runnable block project and integrated master contains:

- `src/index.ts`, which calls `registerRoot`;
- `src/Root.tsx`, which registers exactly the declared `Composition`;
- frame-driven shot source under `src/`;
- project-local frozen assets under `public/` when needed;
- `package.json`, `package-lock.json`, and `tsconfig.json`;
- `remotion-project.json`, conforming to
  `references/runtime/remotion-project.schema.json`.

List every production input in the manifest's `files` array with a SHA-256.
The verifier rejects omitted project files, symlinks, path traversal, hash
mismatches, range dependency versions, non-npm registry lock sources, invalid
frame mapping, and known ambient-time or CSS-time APIs.

Run from the installed parent Skill root:

```text
node scripts/remotion-verify.mjs \
  --project <project-directory> \
  --manifest <project-directory>/remotion-project.json \
  --expect <block|master> \
  --json
```

The master Integrator creates the approval identity atomically by adding:

```text
--write-identity <new-composition-identity.json>
```

The command refuses to overwrite an identity. On preview and render passes,
compare the unchanged project with:

```text
--identity <composition-identity.json>
```

The identity covers the manifest and every production file recorded in it.
The verifier ignores only root `.git/` and root `node_modules/`; every other
file under `project/` must appear in the manifest and identity. Put caches,
stills, previews, logs, and rendered outputs in sibling evidence directories
outside `project/`, where they never enter the identity.

## Deterministic source rules

Reconstruct every visual state from the requested frame. Use
`useCurrentFrame()`, `interpolate()`, `spring()`, `Sequence`, deterministic
closed-form math, and fixed-seed helpers. Keep phase and readable-hold
boundaries derived from the canonical absolute mapping.

Do not use `Date`, `Math.random`, Web Crypto randomness, timers,
`requestAnimationFrame`, ambient React state/effects, network requests during
render, CSS `animation`/`transition`, or environment-dependent behavior.
Precompute remote or asynchronous facts before build and freeze the results as
licensed local inputs. Media and fonts must resolve from project-local files.
When source declares a font family, place every font under `public/`, list it
with role `font`, load it explicitly with `@font-face`, `FontFace`, or a
deterministic local loader, and use only that declared family. Generic or host
system fallbacks such as `sans-serif`, `system-ui`, or `-apple-system` are not
reproducible evidence and are rejected by the verifier. Font shorthand is also
rejected: declare `fontFamily` or `font-family` explicitly so the local family
binding can be inspected.

## Executable gates

The Builder runs, in order:

1. the bundled verifier with `--expect block`;
2. shared-toolchain preparation, which performs `npm ci` only for a new
   dependency identity;
3. the project-local TypeScript check through the two-slot wrapper and
   `node node_modules/typescript/bin/tsc --noEmit`;
4. runtime capture of meaningful DOM/scene geometry for every frame through
   the same wrapper;
5. `scripts/motion-layout-lint.mjs` against that trace, with rendered
   diagnostics only for returned finding windows.

The Integrator runs the verifier with `--expect master`, reuses unchanged
Builder toolchain/typecheck receipts, prepares the master against the same
dependency identity when possible, typechecks only integration glue, captures and lints the full master geometry
once, then writes `composition-identity.json`. It does not repeat unit stills
or create a second preview.

The Render/Delivery stage verifies unchanged identity and the prior master lint
instead of repeating install, typecheck, trace, or still sets. It launches
Remotion Studio as the single human moving-preview surface and stops for
explicit approval bound to the composition identity. The approved pass verifies
the same identity, renders to a new attempt path, and uses FFprobe plus a
complete decode before moving one verified file to the unused final path.

Read `references/motion-layout-lint.md` for the shared trace contract and
limits. Static source regex cannot establish geometry or easing quality. A
passing trace suppresses AI frame inspection; findings alone trigger bounded
diagnostic renders. Code cannot prove perceived weight, meaningful arcs,
exaggeration, appeal, or story clarity, so the final moving preview remains the
only aesthetic decision.

Invoke `node node_modules/@remotion/cli/remotion-cli.js` with the manifest's
entry point and Composition ID explicitly for studio, still, and render.
Never infer a composition ID from file names, use
`latest`, overwrite an output, treat an exit code alone as evidence, or claim
visual parity with HyperFrames.

For a faceless or otherwise silent audio policy, pass `--muted` explicitly to
every preview and formal render. Do not infer silence from the absence of an
`Audio` component: Remotion may otherwise emit a near-silent audio stream and
extend the container beyond the exact frame duration. Verify zero audio
streams and `durationInFrames / fps` container duration with FFprobe.

## Backend boundary

Remotion and HyperFrames share the Director Recipe, selected pattern intent,
and frozen Assets handoff. They do not share runtime source. A production run
uses a validated post-Director runtime plan before build, and every later
handoff preserves its block binding. A single-backend plan never mixes blocks.
A hybrid plan exchanges only schema-valid frozen block media through the Hybrid
Integrator. Do not convert a failed block to the other runtime or pre-render it
merely to disguise a reroute.
