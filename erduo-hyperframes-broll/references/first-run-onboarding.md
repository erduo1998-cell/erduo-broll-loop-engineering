# First-run onboarding

Use this reference when the Parent dispatches `broll-onboarding`.

## Purpose

Prove that the selected local production and delivery path can run before
creative work begins. Detect real capabilities, coordinate one grouped user
authorization, perform only safe reversible repair, and return a sanitized
handoff.

Onboarding is environment preparation. It does not decide creative quality and
does not replace Render/Delivery's same-environment doctor run.

## Required sequence

### 1. Establish the target

Identify:

- production-run identity and onboarding mode;
- SRT locator;
- operating system and architecture;
- Skill root and production root;
- delivery directory and intended output profile;
- selected runtime, defaulting to `hyperframes`;
- local render path;
- current command environment;
- whether the run is first use, post-migration, or a recheck.

Do not disclose private absolute paths in the handoff.

Ready evidence is fresh only for the same production run, host, command
`PATH`, official HyperFrames CLI version, target delivery filesystem, selected
runtime, runtime-capability decision, and Pexels validation state. Record these
bindings safely. If any value changes, discard the earlier readiness
conclusion and dispatch a new inspection-only Agent.

Read the runtime capability matrix before environment checks. A selected
runtime whose `productionAvailable` value is false is `unsupported` for formal
production in this release; stop without installing or probing that runtime.

### 2. Inspect before modifying

The first Onboarding Agent always runs in `inspect` mode. It must not install,
update, download, register, configure, create persistent directories, or modify
user files. It reports every currently known repair and human-only action in
one request.

After the user authorizes that request, dispatch a different fresh Agent in
`repair` mode. It performs only the approved work and repeats the full
inspection. Do not continue the first Agent into repair.

### 3. Read only the SRT duration fact

Parse the SRT read-only and extract only the final cue end time as integer
milliseconds for delivery-space estimation. Do not interpret transcript
meaning, merge cues, create sections or shots, or write Director artifacts.

### 4. Check Node

The official HyperFrames CLI requires Node.js 22 or newer.

Run a real Node version query and parse the result. Command availability alone
is insufficient.

If Node is missing or older, inspection mode reports the repair. In an
authorized fresh repair Agent:

- prefer an already installed trusted version manager;
- otherwise explain the supported Node 22 installation;
- perform the repair only after explicit authorization;
- avoid modifying shell startup files or system links silently;
- repeat the version query in the exact command environment production will
  use.

If no trusted, authorized installation path exists, stop as
`action-required`.

### 5. Load official guidance

Through the host's native Skill mechanism, load:

- `hyperframes`
- `hyperframes-cli`

Follow the release-pinned official guidance rather than remembered commands. Retain a
host-native trace reference when available.

For every non-Pexels command below, use the host's native spawn/process API to
copy the required environment into an explicit child map, remove every key whose
ASCII case-folded name equals `PEXELS_API_KEY`, resolve case-insensitive key
collisions, and set `HYPERFRAMES_NO_TELEMETRY=1` by default. Pass that map
directly to the executable without a shell. A telemetry opt-in may change only
the telemetry value; Pexels-key removal remains mandatory. Do not rely on a
POSIX-only inline assignment or `env -u`, and do not persist settings to the
user's shell profile. If the host cannot inject or attest the sanitized map,
use the parent Skill's bundled `scripts/safe-spawn.mjs` as the only approved
bounded no-log, no-shell bootstrap. If neither route is available, stop before
spawn as `action-required`. This contract applies to Node, npx, HyperFrames,
browser descendants, package managers, FFmpeg, and FFprobe.

### 6. Check official HyperFrames Skills

From the public release root, run:

```bash
node scripts/doctor.mjs --json
```

Invoke this command through the sanitized child map defined above. The release
doctor binds the official Skills check to the application-owned pinned source,
then runs the official HyperFrames doctor. It does not contact the mutable
remote Skill head for readiness.

If the pinned core set is incomplete or changed and repair is authorized, rerun
the public release installer from the same release root:

```bash
./Install.command
```

The installer exact-fetches the fixed HyperFrames commit, runs the locked
Skills CLI only inside an isolated HOME, verifies the exact eight-Skill core,
and commits official plus project Skill links in one backup/rollback
transaction. Then rerun the release doctor. Do not recreate a missing Skill
from memory or run a third-party installer directly against the real HOME.

`npx hyperframes skills check --json` without `--source` is an optional
canonical-remote maintenance check. Its result can inform an explicit upgrade
decision, but it does not invalidate the reproducible pinned baseline by
itself.

The release installer owns registration of the public Skill set. Verify that
the host can discover all eight:

- `erduo-hyperframes-broll`
- `broll-onboarding`
- `broll-director`
- `broll-assets`
- `broll-master-build`
- `broll-master-integrate`
- `broll-render`
- `broll-shot-export`

Onboarding must not create registration itself. Missing discovery is
`action-required` for the release installer or host installation workflow.

### 7. Run official doctor

Run:

```bash
npx hyperframes doctor --json
```

The command always exits successfully. Parse the JSON. Record the top-level
result and inspect every finding relevant to this local path, including:

- CLI version;
- Node;
- CPU, memory, and disk;
- renderer environment;
- FFmpeg;
- FFprobe;
- Chrome;
- Docker and container facts only when that path is selected.

A false or failed finding required by the selected path, or one whose
relevance cannot be established, requires repair and doctor rerun. A
capability proved outside the selected path may be recorded as unavailable but
unused.

Do not use a fixed exception list or infer success from the process exit code.

### 8. Repair Chrome through the official command

When doctor reports missing bundled Chrome, inspection mode records the
repair. In an authorized fresh repair Agent, run:

```bash
npx hyperframes browser ensure
```

Then rerun official doctor.

If Chrome exists but cannot start because of host sandbox restrictions, report
the host limitation. Do not repeatedly reinstall Chrome or construct another
renderer. Ask the user to choose an available non-restricted, Docker, or cloud
path when appropriate.

### 9. Check FFmpeg and FFprobe

Doctor supplies the primary facts. Also confirm both tools execute in the same
command environment production will use.

When missing:

- use an existing trusted package manager only after authorization;
- do not install a package manager automatically;
- do not impersonate administrator approval;
- rerun both executable checks and official doctor after repair.

FFmpeg does not substitute for FFprobe.

### 10. Check directories and storage

For the production and delivery directories:

- confirm each intended directory exists or can be safely created;
- use a unique exclusive probe file to verify write and cleanup;
- confirm the planned target filename does not exist;
- inspect free bytes on the target filesystem;
- compare storage with the declared duration, resolution, local assets, and
  expected render workspace.

Use the read-only final SRT cue end milliseconds as the duration input. Do not
perform semantic analysis.

Create or repair only application-owned directories. Do not recursively change
permissions on user-owned paths. Do not delete files to recover space.

When space is insufficient or cannot be judged safely, ask the user to free
space or select another location.

### 11. Check Pexels access safely

Resolve only whether `PEXELS_API_KEY` is securely configured. Never print,
echo, serialize, or place the value in:

- a command argument;
- a handoff;
- a log;
- a project file;
- a production artifact;
- a user-facing report.

When a public repository configuration tool is actually discoverable, a fresh
authorized repair Agent may use only its stdin or hidden-interaction interface.
Do not invent a tool or use any interface that places the key in command
arguments. If no such tool is discoverable, use a secure host secret or
`PEXELS_API_KEY` environment mechanism.

If missing, status is `action-required`. Ask once for the human-only actions:

1. create or sign in to a Pexels account;
2. obtain an Image and Video API key;
3. place it in a secure host secret or `PEXELS_API_KEY` environment setting.

Do not ask the user to paste it into chat or an ordinary Markdown artifact. If
the host cannot provide a safe repository tool, secure secret channel, or
environment mechanism, stop.

Onboarding may report `configured-unverified` when it can prove secure
presence but cannot test authentication without exposing the value. The
mandatory Assets Agent validates access through its real Pexels searches.

### 12. Group external authorization

Before repair, present one consolidated request covering every currently known
human decision:

- Node installation or version-manager use;
- HyperFrames Skills update and network access;
- bundled Chrome download;
- FFmpeg package-manager change;
- Pexels account and secret configuration;
- system permission or restricted-directory access;
- storage cleanup or alternate location;
- optional Docker, proxy, certificate, or cloud authentication.
- release-installer or host action when any of the eight public Skills is not
  discoverable.

Do not interrupt separately for items already known in the same inspection.

## Status meanings

- `ready`: every capability required by the selected local production path is
  verified, all eight public Skills are discoverable, the directories are
  usable, and Pexels is securely configured for the recorded validation state.
- `degraded`: a capability is unavailable but proved irrelevant to the selected
  path.
- `action-required`: an external account, secret, permission, package-manager
  decision, administrator action, or storage choice requires the user.
- `unsupported`: the selected runtime or a required runtime capability has no
  approved production route in the current capability matrix.
- `blocked`: authorized repair failed or a required local capability remains
  unavailable.

Do not call the environment ready merely because doctor completed or because
some executables exist.

## Sanitized handoff

Write `broll-production/00-onboarding/environment-handoff.md`.

Include:

- onboarding mode and whether any modification occurred;
- readiness bindings for run, host, command `PATH`, official CLI version,
  delivery filesystem, selected runtime, runtime-capability decision, and
  Pexels validation state;
- target mode and output profile;
- safe platform and architecture facts;
- Node version result;
- HyperFrames CLI and Skills status;
- host discovery of the root Skill and all seven stage Skills;
- official doctor top-level result and selected-path findings;
- FFmpeg, FFprobe, and Chrome status;
- production and delivery-directory status;
- free-space assessment and unique-target result;
- Pexels status without its value;
- final SRT cue end milliseconds used only for storage estimation;
- repairs performed and verification;
- remaining human actions;
- final onboarding status;
- available host-native trace references.

Do not include raw JSON, complete command output, credentials, environment
dumps, private path prefixes, or unrelated installed software.
