# Shared command execution

All production stages use one command boundary. Prefer the host-native process
API with an explicit child environment. The implementation must remove every
case-insensitive `PEXELS_API_KEY` variant, reject case-insensitive environment
key collisions, set `HYPERFRAMES_NO_TELEMETRY=1` unless the user opted in, and
spawn the executable directly without a shell.

When the host cannot attest that boundary, invoke only:

`node <parent-skill-root>/scripts/safe-spawn.mjs -- <executable> [args...]`

The launcher never logs the environment. If neither route is available, stop
before spawning. Only the exact Pexels request may receive its credential, in
the smallest available scope; no other command may inherit it. Handoffs record
only the compact executor result, never environment values.
