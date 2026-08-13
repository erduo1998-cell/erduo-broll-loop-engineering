# First-run and changed-environment onboarding

Use this reference only after `production-preflight.mjs` returns
`next: run-onboarding-diagnostic`. Normal video production does not dispatch an
Onboarding Agent.

## Two layers

Installation readiness is machine state. Production readiness is run state.
Do not bind them together.

The installation/upgrade workflow performs the expensive checks once and
writes `environment-readiness.json` in the application-owned data directory.
The cache records only stable facts:

- product version and cache schema;
- platform, architecture, and a non-secret host identifier;
- Node major and minimum support result;
- expected release Skill count and installation-manifest identity;
- FFmpeg and FFprobe execution results;
- pinned HyperFrames runtime/official-Skills identities and doctor readiness;
- backends whose toolchains have real readiness evidence;
- creation time.

Never bind this cache to a production-run ID, SRT, project or output path,
runtime-plan identity, command `PATH`, disk free-space value, or Pexels state.
Those facts vary normally and must not trigger another deep environment audit.

## Production preflight

Before Direction, Parent runs:

```text
node <release-root>/scripts/production-preflight.mjs \
  --srt <srt> --output <target> --project <project-root> --json
```

It performs bounded local checks only:

- readiness cache exists and matches current release/machine/tool identity;
- current Node remains supported;
- SRT is a readable regular file;
- project root exists;
- output target is unused and its existing parent is writable;
- available space exceeds a small declared floor.

After Runtime Planner, add `--runtime hyperframes` and/or
`--runtime remotion` for each required backend. A runtime-plan or SRT change
does not invalidate the cache; it merely selects which cached backend fact is
needed.

The JSON result has three routing outcomes:

- `status: ready`, `next: continue`: proceed without Onboarding;
- `next: fix-production-input`: resolve SRT/output/project facts without an
  environment Agent;
- `next: fix-project-runtime`: repair the exact project-local Remotion
  declaration, lock, installation, or CLI identity without Onboarding;
- `next: run-onboarding-diagnostic`: dispatch one Onboarding Agent scoped to
  the returned stable fact IDs.

Do not ask an Agent to reread raw command output. The script result is the
handoff.

## When diagnosis is justified

Run deep diagnosis only for a missing cache, release upgrade/migration,
machine or architecture change, Node major/support change, install-manifest or
Skill-set change, pinned tool identity change, a required backend absent from
the cache, or a real production command failure that identifies an environment
dependency.

Inspection is read-only and checks only the failed facts. One grouped request
contains all known repairs and human-only actions. A fresh repair Agent applies
only explicitly authorized reversible changes and refreshes the cache with:

```text
node <release-root>/scripts/doctor.mjs --refresh-cache --json
```

For HyperFrames, the diagnostic loads pinned official Skills and runs the
official JSON doctor. For Remotion, it verifies exact local dependencies and
the direct project-local CLI. Optional feature canaries are run only when a
planned Recipe actually requests that capability.

## Pexels

Pexels is material routing, not environment readiness. Do not read, validate,
or cache its credential during onboarding or common production preflight.
When Assets reaches a real Pexels-backed need, that stage checks secure access
and asks once for a human action if unavailable. No need means no credential
check.

Never expose the credential in chat, Markdown, logs, file paths, command
arguments, artifacts, or reports.

## Execution boundary

All commands follow [shared command execution](safe-execution.md). Stages
consume its compact result and do not duplicate implementation details.

## Handoff

The exception-path handoff contains failed fact IDs, diagnostic scope, compact
results, repairs proposed/performed, remaining human action, cache refresh
status, and final status. It excludes production-run bindings, SRT duration,
output details, Pexels status, full environment dumps, and unrelated software.
