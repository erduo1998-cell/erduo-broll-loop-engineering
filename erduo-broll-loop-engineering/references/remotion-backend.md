# Remotion production backend

Read this reference only after the runtime router has selected `remotion`.
It defines the common contract for the Remotion Builder, Integrator, and
Render/Delivery stages. It does not change the HyperFrames route.

## Provenance and scope

The backend design is informed by the pinned Apache-2.0
`Vincentwei1021/video-shotcraft` source at Git commit
`41ee360d82f4c491ba9d88a24a4add7d8ff1cf8b`. Its useful production ideas are
native Remotion compositions, frame-owned state, per-shot still inspection,
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

## Runtime baseline

Create a self-contained project inside the production directory. Do not
install packages into the Skill repository or a global prefix. Use Node.js 22
or newer and exact versions in both `package.json` and `package-lock.json`:

| Package | Exact version |
| --- | --- |
| `remotion` | `4.0.484` |
| `@remotion/cli` | `4.0.484` |
| `react` | `19.2.7` |
| `react-dom` | `19.2.7` |
| `@types/react` | `19.2.17` |
| `typescript` | `6.0.3` |

Before installing or invoking Remotion, show the user the official
[Remotion licensing page](https://www.remotion.dev/docs/licensing) and record
their confirmation that the intended use is covered. Do not infer commercial
license eligibility from this Skill or from successful package installation.

Add another package only when the selected native implementation needs it.
Pin it exactly, resolve it through `https://registry.npmjs.org/`, review its
license, and record the reason and license in build notes. Generate the lock
before installation, inspect it for non-registry sources, then use `npm ci`.
Run only project-local binaries through their checked-in Node entry points; do
not let a command silently download a different CLI. `package.json` scripts
may expose the same exact commands for user convenience, but production stages
must invoke the local Node entry points directly.

Every non-Pexels child process must use the parent Skill's safe child
environment contract: remove all case variants of `PEXELS_API_KEY`, resolve
case-insensitive collisions, disable HyperFrames telemetry by default, and
spawn directly without a shell. Use `scripts/safe-spawn.mjs` when the host
cannot attest a native environment map.

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
2. `npm ci` in that block project;
3. the project-local TypeScript check through
   `node node_modules/typescript/bin/tsc --noEmit`;
4. a real project-local CLI `still` at the declared start, action/result, readable
   hold, and final safe frame for every shot;
5. a short real preview render for the block.

The Integrator runs the verifier with `--expect master`, performs a clean
`npm ci`, runs TypeScript check, renders seam stills, renders a complete
low-cost preview MP4, verifies that preview with FFprobe and a full decode,
then writes `composition-identity.json`. Preview output is evidence only; it
is not the formal master.

The Render/Delivery stage repeats verification, clean install, typecheck, and
representative stills in the exact final environment. It launches Remotion
Studio as the human preview surface and stops for explicit approval bound to
the composition identity. A different fresh Render Agent verifies the same
identity after approval, renders to a new attempt path, and uses FFprobe plus
a complete decode before moving one verified file to the unused final path.

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
selects exactly one backend before build, and all later handoffs preserve that
binding. Do not mix blocks, convert a failed block to the other runtime, or
pre-render one runtime merely to disguise it as the other.
