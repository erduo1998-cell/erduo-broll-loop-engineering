#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const testNames = [
  'test-doctor.mjs',
  'test-config.mjs',
  'test-parse-srt.mjs',
  'test-probe-media.mjs',
  'test-index-user-assets.mjs',
  'test-state.mjs',
  'test-cache.mjs',
  'test-input-integration.mjs',
];
const tests = testNames.map((name) => path.join(scriptDir, name));
const missing = tests.filter((file) => !existsSync(file));
if (missing.length) {
  process.stderr.write(`input-layer tests missing: ${missing.map((file) => path.basename(file)).join(', ')}\n`);
  process.exit(2);
}

const result = spawnSync(process.execPath, ['--test', ...tests], {
  cwd: scriptDir,
  stdio: 'inherit',
  shell: false,
});
if (result.error) {
  process.stderr.write('input-layer test runner could not start Node.js.\n');
  process.exit(70);
}
process.exit(result.status ?? 70);
