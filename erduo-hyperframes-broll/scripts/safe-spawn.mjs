#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PEXELS_KEY = 'pexels_api_key';
const TELEMETRY_KEY = 'hyperframes_no_telemetry';

function fail(message, code = 64) {
  process.stderr.write(`safe-spawn: ${message}\n`);
  process.exit(code);
}

export function sanitizedEnvironment(source = process.env) {
  const child = {};
  const names = new Map();
  for (const [name, value] of Object.entries(source)) {
    const folded = name.toLowerCase();
    if (folded === PEXELS_KEY || folded === TELEMETRY_KEY) continue;
    if (names.has(folded)) {
      throw new Error(`case-insensitive environment collision: ${names.get(folded)} / ${name}`);
    }
    names.set(folded, name);
    if (typeof value === 'string') child[name] = value;
  }
  child.HYPERFRAMES_NO_TELEMETRY = '1';
  return child;
}

export function runSafeSpawn(argv, { env = process.env, spawn = spawnSync } = {}) {
  if (argv[0] !== '--' || argv.length < 2) {
    throw new Error('usage: node scripts/safe-spawn.mjs -- <executable> [arguments...]');
  }
  const [executable, ...args] = argv.slice(1);
  const result = spawn(executable, args, {
    env: sanitizedEnvironment(env),
    shell: false,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return Number.isInteger(result.status) ? result.status : 1;
}

if (process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runSafeSpawn(process.argv.slice(2));
  } catch (error) {
    fail(error.message, error?.code === 'ENOENT' ? 127 : 64);
  }
}
