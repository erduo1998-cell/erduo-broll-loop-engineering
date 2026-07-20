# Configuration contract

The Pexels credential is user-scoped secret state. It never belongs in a project, run state, provenance file, command-line argument, log, exception message, or user-facing report.

## Resolution order

1. A non-empty `PEXELS_API_KEY` environment variable.
2. `pexels_api_key` in the user configuration file.
3. No credential.

Environment values are trimmed. An empty environment value does not mask a valid user configuration. Invalid user JSON is an actionable configuration error; do not silently replace it.

## User configuration path

- macOS and Linux: `${XDG_CONFIG_HOME}/erduo-hyperframes-broll/config.json` when `XDG_CONFIG_HOME` is absolute, otherwise `${HOME}/.config/erduo-hyperframes-broll/config.json`.
- Windows: `${APPDATA}\erduo-hyperframes-broll\config.json` when `APPDATA` is set, otherwise `${HOME}\AppData\Roaming\erduo-hyperframes-broll\config.json`.

Path computation accepts injected platform, environment, and home values for deterministic tests. Public status output never includes the resolved path.

## API and CLI

`scripts/config.mjs` exposes:

- a secret-bearing internal loader for the later Pexels client;
- a safe status function returning only `{ configured, source }`, where source is `environment`, `user_config`, or `none`;
- an explicit save function returning the same safe status shape.

The public command surface is:

```bash
node scripts/config.mjs status [--json]
node scripts/config.mjs set-pexels-key --stdin [--json]
```

There is no `--key`, positional key, environment override for the destination, or output mode that prints the credential. `set-pexels-key` reads a bounded value from stdin, validates it, stores it, and prints only safe status. Invalid arguments exit `64`; missing configuration/status exits `2`; safe configuration errors exit `3`; unexpected internal errors exit `70`.

## Storage safety

- Preserve unrelated top-level fields in an existing object.
- Reject malformed JSON, arrays, symlinks, and non-regular existing config paths without overwriting them.
- Create the application directory with user-only permissions on POSIX.
- Write a unique sibling temporary file with exclusive creation and mode `0600`, then rename it into place and re-apply `0600` on POSIX.
- In `finally`, remove only the temporary file created by the current operation. Never truncate the destination before the complete replacement is ready.
- A failed write or rename leaves the previous configuration intact and yields a stable safe error code/message without a path or credential.

## Credential validation

Trim surrounding whitespace; reject an empty value, embedded ASCII control/whitespace characters, or a value longer than 4096 characters. Do not claim the key is accepted by Pexels until an actual API request succeeds.

## Test minimum

Cover environment priority, empty environment fallback, missing configuration, valid user configuration, malformed JSON, array JSON, three-platform path rules, relative XDG fallback, preserved fields, POSIX modes, exclusive temp write and rename, symlink/non-file rejection, read/write/rename/cleanup failures, bounded stdin, invalid credentials, safe status/errors, CLI help/argument errors, and a scan proving the supplied key never appears in stdout, stderr, safe return objects, or error messages.
