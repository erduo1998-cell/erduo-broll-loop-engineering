---
name: broll-onboarding
description: Prepare a fresh or changed machine for an erduo-hyperframes-broll run. Use before production when no current ready environment handoff exists, coordinating safe reversible repairs and the human-only authorizations required for Node, HyperFrames Skills, FFmpeg, FFprobe, Chrome, storage, permissions, and Pexels access.
---

# B-roll onboarding

Act only as the environment and authorization coordinator. Do not direct the
film, collect production media, write HyperFrames source, integrate blocks,
render, or export.

## Inputs

- Skill root and intended production root
- production-run identity and SRT locator
- intended delivery directory and output profile
- selected runtime, defaulting to `hyperframes`
- current host and operating system
- onboarding mode: `inspect` or `repair`
- any previous onboarding handoff
- for repair mode only, the user's explicit authorization and approved repair
  list

## Required approach

Read `../../references/runtime/runtime-contract.md` and
`../../references/runtime/capability-matrix.json`. Record the selected runtime
as part of the environment binding. `hyperframes` is the only
production-ready runtime in this release. `remotion` is an experimental
adapter contract, not a formal delivery backend.

If the selected runtime has `productionAvailable: false`, stop as
`unsupported` before environment repair; do not install or probe it. For any
future non-default runtime marked production-available, inspect the matrix
route and the exact adapter version and witness evidence required by the
runtime contract. Missing, stale, or merely claimed local evidence is
`action-required`; a capability marked unsupported is `unsupported`. Do not
synthesize witness evidence or weaken the default HyperFrames requirements.

Load the release-pinned official `hyperframes` and `hyperframes-cli` Skills through
the host's native Skill mechanism before using HyperFrames commands.

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

Check:

- Node.js is version 22 or newer;
- the project-resolved HyperFrames CLI is available;
- the official core HyperFrames Skills are complete and current;
- FFmpeg and FFprobe both execute in the command environment production will
  use;
- the official HyperFrames doctor was actually run with JSON output;
- every doctor finding relevant to local production, including Chrome, is
  usable;
- the production and delivery directories are writable;
- the target filesystem has sufficient free space for the declared work;
- the intended target file is unused;
- Pexels access is securely configured without exposing the credential.

Verify that the host can discover all eight public Skills installed by the
release installer:

- `erduo-hyperframes-broll`
- `broll-onboarding`
- `broll-director`
- `broll-assets`
- `broll-master-build`
- `broll-master-integrate`
- `broll-render`
- `broll-shot-export`

Onboarding does not register these Skills itself. Missing registration is
`action-required` and belongs to the release installer or host installation
workflow.

For delivery-space estimation only, parse the SRT read-only and extract the
final cue end time as integer milliseconds. Do not interpret meaning, merge
cues, create shots, or perform any Director work.

Fresh evidence is valid only for the same production run, host, command
`PATH`, official HyperFrames CLI version, target delivery filesystem, selected
runtime, runtime-capability evidence, and Pexels validation state. Record these
bindings without exposing private paths. If any binding changes, the evidence
is stale and inspection must run again.

The official doctor JSON is authoritative evidence about what it inspected.
Its command always exits successfully, so read the top-level result and every
individual finding. Classify optional capabilities only against the selected
local delivery path; do not use a standing exemption list.

Run the release doctor, which invokes the official Skills check against the
application-owned pinned source and then invokes the official HyperFrames
doctor. A missing or changed pinned core set is `action-required`. In an
authorized repair Agent, rerun the release installer so the eight official
Skills and eight project Skills share its backup and rollback transaction;
do not let a third-party installer write the real HOME directly. A canonical
remote `npx hyperframes skills check --json` is an optional maintenance check,
not readiness evidence for this pinned release.

If the doctor reports missing bundled Chrome, inspection mode records the
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
- Never delete files to recover disk space. Ask the user to free space or
  choose another location.
- Treat a host sandbox that prevents Chrome from starting as a host
  limitation, not an installation problem. Do not build a substitute
  renderer.

After any repair, repeat the affected check and rerun official doctor in the
same command environment.

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
- official doctor top-level and relevant individual results;
- official Skills-check result;
- discovery result for the root Skill and all seven stage Skills;
- evidence binding for production run, host, command `PATH`, official CLI
  version, delivery filesystem, selected runtime, runtime-capability evidence,
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

Complete as `ready` only when every capability needed by the selected local
production path is verified, the selected runtime is explicitly
production-ready in the capability matrix, all eight public Skills are
discoverable, the delivery location is usable, and Pexels is securely
configured for the same recorded validation state. `degraded` is acceptable
only for a capability proved irrelevant to the selected path.

## Stop

Stop as `action-required` when an external account, key, permission, package
manager, administrator action, or storage decision cannot be safely automated.
Stop as `unsupported` when the selected runtime is not production-available or
the capability matrix says the requested route is unsupported. For a future
production-available non-default runtime, stop as `action-required` when its
required local adapter or witness evidence is missing.

Stop as `blocked` when an authorized repair fails, the official Skills cannot
be obtained, a required executable remains unusable, Chrome is blocked by the
host, the delivery path remains unsafe, or the credential cannot be configured
without exposure.

This handoff supports onboarding only. Render/Delivery must run official doctor
again in the exact formal-render environment.
