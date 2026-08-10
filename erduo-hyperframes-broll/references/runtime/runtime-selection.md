# Runtime selection

Select one production runtime before onboarding, direction, or implementation.
This decision changes the backend stages, not the shared Director, Assets, or
canonical Shot Recipe contract.

## Decision order

1. Honor an explicit user choice of `hyperframes` or `remotion`.
2. Otherwise inspect the exact existing project root for package dependencies,
   package scripts, known config files, and composition source signals.
3. When only one runtime has evidence, select it.
4. When both runtimes have evidence, stop as `action-required` and ask which
   backend owns this production. Do not infer ownership from signal counts.
5. When an existing package project has no runtime evidence, stop as
   `action-required`.
6. For a genuinely new project with no explicit choice or runtime evidence,
   default to `hyperframes`.

Never choose from a directory name, repository name, prose file, lockfile text,
or a transitive dependency. Never let auto-detection override an explicit user
choice.

## Deterministic command

Run:

```text
node <skill-root>/scripts/detect-runtime.mjs --project <project-root> --json
```

For an explicit choice, add `--runtime hyperframes` or `--runtime remotion`.
The command writes only JSON to stdout. A completed selection exits 0 even
when readiness still needs onboarding repair; an unresolved selection exits 2
and invalid input exits 1. Preserve its result as
`broll-production/00-onboarding/runtime-selection.json` and validate it against
`runtime-selection.schema.json`.

Default detection is bounded and read-only. It skips symlinks and
build/dependency directories, caps traversal and file reads, does not use a
shell, and never uses directory-name heuristics. It never executes a
project-local binary.

Only an authorized Remotion Onboarding repair may add `--probe-cli`. That
explicit mode runs the project-local `remotion versions` binary, marks
`readOnlyDetection: false` and `localCliExecuted: true`, and gives the child a
minimal allowlisted environment rather than the parent's full environment.
Do not use probe mode for initial routing or before the user approves the
local project execution/repair.

## Remotion readiness gate

Selecting Remotion and proving it ready are separate facts. A Remotion route
is locally ready only when all of these are true in the selected project:

- `package.json` directly declares both `remotion` and `@remotion/cli`;
- both packages exist locally and report the same concrete version;
- the project-local `node_modules/.bin/remotion versions` command runs
  directly without a shell, confirms package alignment, and returns the exact
  shared version.

Do not use a global CLI, `npx` download, package-lock entry, transitive package,
or command availability as a substitute. A failed or disabled probe makes
`readiness` equal `action-required`; it does not undo a successful runtime
selection. Continue into inspection-only Onboarding, which groups the exact
project-local bootstrap or repair for user authorization. A fresh authorized
repair Agent then reruns the detector with `--probe-cli`, verifies the
remaining Remotion render environment, and records the same dependency and CLI
evidence.

## Runtime fork

Both routes share SRT parsing, semantic direction, Shotcraft lookup, Assets,
and validated runtime-neutral Shot Recipes. After Assets:

- `hyperframes` dispatches the HyperFrames Builder, Integrator, preview, and
  render contracts with the release-pinned official Skills and CLI;
- `remotion` dispatches native React/TSX Builder, registration/integration,
  `remotion still` preview, and `remotion render` delivery contracts through
  the verified project-local CLI.

Never translate one backend's generated source into the other merely because
the router selected a runtime. The Shot Recipe is the shared handoff; each
backend owns its implementation and evidence independently.
