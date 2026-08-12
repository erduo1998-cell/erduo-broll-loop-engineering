---
name: broll-onboarding
description: Prepare common environment readiness before Direction, then only the backends selected by the validated post-Director runtime plan.
---

# B-roll onboarding

Act only as the environment and authorization coordinator. Do not direct the
film, collect production media, write HyperFrames source, integrate blocks,
render, or export.

## Inputs

- Skill root and intended production root
- production-run identity and SRT locator
- intended delivery directory and output profile
- runtime selection intent, defaulting to `auto`
- validated runtime-selection JSON from the bundled detector
- onboarding phase: `base`, `targeted`, or legacy-compatible `full`
- for `targeted`, the validated runtime plan and its exact required backend set
- current host and operating system
- onboarding mode: `inspect` or `repair`
- any previous onboarding handoff
- for repair mode only, the user's explicit authorization and approved repair
  list

## Required approach

Read `../../references/runtime/runtime-contract.md` and
`../../references/runtime/capability-matrix.json`, plus
`../../references/runtime/runtime-selection.md`. Verify the supplied selection
against `../../references/runtime/runtime-selection.schema.json` and record it
as part of the environment binding. Rerun the detector when its project root,
explicit choice, or evidence changed. Mixed evidence without an explicit
choice is `action-required`; do not resolve it by counting signals.
Inspection mode uses the detector without `--probe-cli` and therefore never
executes project-local code. Only after the user authorizes the exact Remotion
repair and local execution may the fresh repair Agent rerun it with
`--probe-cli`; record `readOnlyDetection: false` and `localCliExecuted: true`.

Both `hyperframes` and `remotion` are production routes. `auto` and `hybrid`
are planning intents, not executable runtimes. In `base` phase, do not install,
probe, or require either animation backend. Verify only common production facts
needed for Direction and material work. After Runtime Planner, `targeted` phase
checks exactly `requiredBackends`; it must not prepare an unused backend.

A required backend
whose matrix route is unavailable is `unsupported`. Missing, stale, or merely
claimed local readiness evidence is `action-required`; an unsupported required
capability is `unsupported`. Do not synthesize evidence or silently switch
runtimes.

For HyperFrames only, load the release-pinned official `hyperframes` and
`hyperframes-cli` Skills through the host's native Skill mechanism before
using HyperFrames commands. For Remotion, use only the project-local locked
dependencies and CLI; a global CLI or an `npx` download is not evidence.

Before every non-Pexels child process, use the host's native spawn/process API
to copy the required environment into an explicit child map, remove every key
whose ASCII case-folded name equals `PEXELS_API_KEY`, resolve case-insensitive
key collisions, and set `HYPERFRAMES_NO_TELEMETRY=1` by default. Pass the map
directly to the executable without a shell. Telemetry opt-in may change only
the telemetry value; Pexels-key removal remains mandatory. Do not use
shell-inline assignments or `env -u` as the contract. If the host cannot inject
or attest the sanitized map, invoke the command only through the parent Skill's
bundled `scripts/safe-spawn.mjs` using the command form documented in the
parent Skill. That launcher is the bounded no-log, no-shell trust
boundary. If neither route is available, stop before spawn as
`action-required`. Do not modify the user's shell profile. This privacy setting
neither proves the official Skill load nor replaces inspection of command
results.

Inspect the real environment. Do not accept file existence, a handoff claim, or
process exit status as sufficient proof.

Inspection mode is always first and must not modify the machine, configuration,
host Skill registration, browser cache, or user files. It produces one
complete repair and authorization request.

Repair mode must run in a different fresh Agent. Perform only the approved
repairs, then repeat the full inspection in that Agent.

Base checks:

- Node.js is version 22 or newer;
- FFmpeg and FFprobe both execute in the command environment production will
  use;
- the production and delivery directories are writable;
- the target filesystem has sufficient free space for the declared work;
- the intended target file is unused;
- Pexels access is securely configured without exposing the credential.

When the validated runtime plan requires HyperFrames, additionally check:

- the project-resolved HyperFrames CLI is available;
- the official core HyperFrames Skills are complete and current;
- the official HyperFrames doctor actually ran with JSON output;
- every doctor finding relevant to local production, including Chrome, is
  usable.

When the validated runtime plan requires Remotion, additionally check:

- `package.json` directly declares exact or lock-resolved `remotion` and
  `@remotion/cli` dependencies;
- both are locally installed at the same concrete version;
- the project-local `node_modules/.bin/remotion versions` probe actually
  succeeds by direct spawn without a shell, reports aligned packages, and
  names their exact shared version;
- the project's TypeScript/build entry and registered Composition are
  discoverable or, for a new authorized project, are assigned to the Builder;
- Chrome required by that exact local Remotion CLI is usable.

The release does not impose one global Remotion version. For an existing
project, preserve its exact lock when the matching package and CLI evidence
passes. For a genuinely new authorized Remotion project, resolve one current
stable Remotion version from npm registry metadata, confirm the identical
`@remotion/cli` version exists, resolve compatible exact React/TypeScript
packages, then write exact declarations and a v3 lock. Record the resolution
time and concrete versions. Do not write `latest` or a range and do not use an
`npx` download fallback as evidence.

When any planned Recipe requires `effects.dom-pixel-postprocess`, perform an
additional feature gate in the exact project-local runtime. Require Remotion
4.0.455 or newer, inspect the exact preview Chrome and HTML-in-canvas flag,
then create an unused minimal canary Composition inside the authorized
production bootstrap area. The canary must import and mount `<HtmlInCanvas>`,
record `HtmlInCanvas.isSupported()` in the browser without exposing unrelated
state, and render a real still through the local CLI. If WebGL2 is planned,
the canary must compile and draw a minimal WebGL2 shader using the selected
`angle` or `swangle` backend. Record the canary source hash, still hash,
browser version, exact Remotion version, paint backend, GL backend, and pass
result. Do not leave the canary inside a production Composition or treat a
package export check as render evidence.

Verify that the host can discover all fourteen public Skills installed by the
release installer:

- `erduo-broll-loop-engineering`
- `broll-onboarding`
- `broll-director`
- `broll-assets`
- `broll-master-build`
- `broll-master-integrate`
- `broll-render`
- `broll-shot-export`
- `broll-remotion-build`
- `broll-remotion-integrate`
- `broll-remotion-render`
- `broll-runtime-plan`
- `broll-hybrid-integrate`
- `broll-hybrid-render`

Onboarding does not register these Skills itself. Missing registration is
`action-required` and belongs to the release installer or host installation
workflow.

For delivery-space estimation only, parse the SRT read-only and extract the
final cue end time as integer milliseconds. Do not interpret meaning, merge
cues, create shots, or perform any Director work.

Fresh evidence is valid only for the same production run, host, command
`PATH`, onboarding phase, target delivery filesystem, selection or runtime-plan
identity, required backend CLI versions when targeted, runtime-capability
evidence, and Pexels validation state. Record these
bindings without exposing private paths. If any binding changes, the evidence
is stale and inspection must run again.

For HyperFrames, the official doctor JSON is authoritative evidence about what it inspected.
Its command always exits successfully, so read the top-level result and every
individual finding. Classify optional capabilities only against the selected
local delivery path; do not use a standing exemption list.

For HyperFrames, run the release doctor, which invokes the official Skills check against the
application-owned pinned source and then invokes the official HyperFrames
doctor. A missing or changed pinned core set is `action-required`. In an
authorized repair Agent, rerun the release installer so the eight official
Skills and eight project Skills share its backup and rollback transaction;
do not let a third-party installer write the real HOME directly. A canonical
remote `npx hyperframes skills check --json` is an optional maintenance check,
not readiness evidence for this pinned release.

If the HyperFrames doctor reports missing bundled Chrome, inspection mode records the
repair. In authorized repair mode, use the official browser ensure command,
then rerun doctor. Do not install an arbitrary browser as a substitute.

## Safe repair

Perform repairs only in a fresh repair-mode Agent and only when covered by the
user's one-time authorization.

- Prefer an already installed, trusted Node version manager. Otherwise explain
  the exact Node 22 installation required. Do not rewrite shell profiles or
  replace a system Node silently.
- Use an existing trusted package manager for FFmpeg only when the user has
  authorized that machine change. Do not install a package manager or
  impersonate administrator approval.
- Create or repair only application-owned directories. Do not recursively
  change permissions on user-owned directories.
- For a genuinely new project explicitly selected as Remotion, read
  `../../references/remotion-backend.md`. Inspection mode must include the
  official Remotion licensing-page review, intended-use confirmation, exact
  project-local package set, lock creation, registry/source inspection, and
  clean install in one grouped authorization request. After that confirmation
  and authorization, a fresh repair Agent may create only the minimal runtime
  shell in the new unused production project root: exact `package.json`,
  `package-lock.json`, local dependency tree, and required empty application
  directories. It must not author a Composition, shot source, assets, or other
  Builder artifacts. Rerun the detector and local CLI probe; rollback newly
  created bootstrap files if verification fails before any Builder owns them.
- For an existing Remotion project with missing or mismatched dependencies,
  inspection must report the exact proposed package and lock changes. Apply
  them only after explicit authorization and license confirmation; never
  require the user to install packages manually when the approved repair Agent
  can perform the bounded local change.
- Never delete files to recover disk space. Ask the user to free space or
  choose another location.
- Treat a host sandbox that prevents Chrome from starting as a host
  limitation, not an installation problem. Do not build a substitute
  renderer.

After any repair, repeat the affected check. In targeted/full phase rerun every
required backend's full preflight in the same command environment. HyperFrames
preflight includes official doctor. Base phase never bootstraps a backend.

## Human-only actions

Group all currently known human-only actions into one concise request:

- creating or signing in to a Pexels account and obtaining an API key;
- securely configuring that key through a discoverable public repository
  configuration tool's stdin or hidden interaction, or otherwise through
  `PEXELS_API_KEY` or a host secret;
- approving system or package-manager changes;
- granting restricted-directory access;
- choosing another disk or freeing space;
- completing cloud, Docker, proxy, or certificate setup if the user selects
  such a path.

Do not ask the user to paste a key into chat, Markdown, an ordinary handoff, or
a log. Never print, echo, serialize, or place it in a command argument. Use a
public repository configuration tool only when its safe stdin or hidden
interface is actually discoverable; do not invent one. If neither that tool
nor a host secret or environment mechanism is available, stop and explain the
limitation. A missing Pexels configuration is explicitly `action-required`.

## Deliverable

Write `broll-production/00-onboarding/environment-handoff.md`.

Record:

- host and operating-system facts without private paths;
- the actual Node, HyperFrames, FFmpeg, FFprobe, and Chrome findings;
- for HyperFrames, official doctor top-level and relevant individual results;
  for Remotion, the local CLI, Chrome, TypeScript, FFmpeg, and FFprobe facts;
- official Skills-check result;
- discovery result for the root Skill and all thirteen stage Skills;
- evidence binding for production run, host, command `PATH`, official CLI
  version, delivery filesystem, onboarding phase, selection/runtime-plan
  identity, required backends, runtime-capability evidence,
  and Pexels validation state;
- capability-matrix decision and concrete adapter/witness evidence, or the
  exact missing/unsupported fact, for a requested non-default runtime;
- final SRT cue end milliseconds used only for storage estimation;
- directory writability, free-space assessment, and target availability;
- Pexels status as `configured`, `configured-unverified`, or `missing`;
- repairs performed and their verification;
- human actions still required;
- `ready`, `degraded`, `action-required`, `unsupported`, or `blocked`;
- host-native trace references for official Skill loads and commands when the
  host exposes them.

Do not include credentials, full environment dumps, raw command output, home
directory prefixes, or unrelated installed software.

## Completion

Complete base phase as `ready` when common tools, paths, storage, Pexels, and
all fourteen public Skills are ready; backend readiness is deliberately
`not-yet-planned`, not degraded. Complete targeted/full phase only when every
capability needed by the planned path is verified, every required backend is
production-ready in the capability matrix, required dependency and CLI
evidence is real,
the delivery location is usable, and Pexels is securely configured for the
same recorded validation state. `degraded` is acceptable
only for a capability proved irrelevant to the planned path.

## Stop

Stop as `action-required` when an external account, key, permission, package
manager, administrator action, or storage decision cannot be safely automated.
Stop as `unsupported` when a required backend is not production-available or
the capability matrix says the requested route is unsupported. Stop as
`action-required` when the plan requires Remotion but its declared dependencies,
installed matching versions, or local CLI probe is missing. An existing
project with no Composition route is also `action-required`. A genuinely new
project whose verified bootstrap handoff explicitly assigns Composition
authoring and registration to the Remotion Builder/Integrator may complete
Onboarding as `ready`; absence of not-yet-authored composition source is not a
bootstrap blocker.

Stop as `unsupported` for `effects.dom-pixel-postprocess` when the exact local
version is older than 4.0.455, the preview browser does not support
HTML-in-canvas, the required flag cannot be enabled, the canary still fails,
or the selected WebGL2 backend cannot draw. Do not mark the whole Remotion
backend unsupported when only this optional capability failed.

Stop as `blocked` when an authorized repair fails, a required backend's Skills
or locked dependencies cannot be obtained, a required
executable remains unusable, Chrome is blocked by the host, the delivery path
remains unsafe, or the credential cannot be configured without exposure.

This handoff supports onboarding only. Render/Delivery must run every planned
route's complete preflight again in the exact formal-render environment;
hybrid delivery must also revalidate the frozen block-media contracts.
