import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  checkBinary,
  checkHyperFrames,
  checkNode,
  checkWorkdir,
  computeResult,
  createExecFileRunner,
  createSanitizer,
  exitCodeForResult,
  filterCredentialEnv,
  parseCliArgs,
  runDoctor,
} from './doctor.mjs';

const requiredModernChecks = () => [
  { name: 'Version', ok: true, detail: '0.7.64 (latest)' },
  { name: 'Node.js', ok: true, detail: 'v26.4.0' },
  { name: 'FFmpeg', ok: true, detail: 'ffmpeg 8.1.2' },
  { name: 'FFprobe', ok: true, detail: 'ffprobe 8.1.2' },
  { name: 'Chrome', ok: true, detail: 'bundled' },
];

function error(code, { killed = false } = {}) {
  return Object.assign(new Error(code), { code, killed });
}

function fakeFs(overrides = {}) {
  return {
    promises: {
      stat: async () => ({ isDirectory: () => true }),
      writeFile: async () => {},
      unlink: async () => {},
      ...overrides,
    },
  };
}

function fakeRunner({ hyperframesChecks = requiredModernChecks(), failures = {}, calls = [] } = {}) {
  return async (file, args) => {
    calls.push({ file, args });
    const id = file.startsWith('ffmpeg') ? 'ffmpeg' : file.startsWith('ffprobe') ? 'ffprobe' : 'hyperframes';
    if (failures[id]) throw failures[id];
    if (id === 'ffmpeg') return { stdout: 'ffmpeg version 8.1.2 Copyright\n', stderr: '' };
    if (id === 'ffprobe') return { stdout: 'ffprobe version 8.1.2 Copyright\n', stderr: '' };
    return { stdout: JSON.stringify({ ok: true, checks: hyperframesChecks }), stderr: '' };
  };
}

test('ready result uses current HyperFrames name/ok/detail payload', async () => {
  const result = await runDoctor({
    nodeVersion: 'v26.4.0',
    execFileAsync: fakeRunner(),
    fsImpl: fakeFs(),
    pf: 'darwin',
    cpuArch: 'arm64',
    workdir: '/tmp/project with spaces',
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  assert.equal(result.checks.find((c) => c.id === 'hyperframes').version, '0.7.64');
});

test('optional upstream failures produce degraded, not blocked', async () => {
  const checks = [...requiredModernChecks(), { name: 'Docker', ok: false, detail: 'missing' }];
  const result = await runDoctor({
    execFileAsync: fakeRunner({ hyperframesChecks: checks }),
    fsImpl: fakeFs(),
    pf: 'linux',
    cpuArch: 'x64',
  });
  assert.equal(result.status, 'degraded');
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, ['hyperframes_optional_docker']);
  assert.equal(exitCodeForResult(result), 0);
});

test('legacy id/status HyperFrames payload remains accepted', async () => {
  const checks = requiredModernChecks().map(({ name, detail }) => ({
    id: name,
    status: 'pass',
    version: name === 'Version' ? detail : undefined,
  }));
  const result = await checkHyperFrames(fakeRunner({ hyperframesChecks: checks }), 'darwin');
  assert.equal(result.status, 'pass');
  assert.equal(result.version, '0.7.64');
});

test('old and malformed Node versions fail', () => {
  assert.equal(checkNode('v21.9.0').status, 'fail');
  assert.equal(checkNode('not-a-version').status, 'fail');
});

test('missing ffmpeg and failed ffprobe are required failures', async () => {
  const missing = await checkBinary('ffmpeg', fakeRunner({ failures: { ffmpeg: error('ENOENT') } }), 'darwin');
  const failed = await checkBinary('ffprobe', fakeRunner({ failures: { ffprobe: error(1) } }), 'darwin');
  assert.equal(missing.status, 'fail');
  assert.match(missing.message, /not found/);
  assert.equal(failed.status, 'fail');
});

test('missing, non-zero, and timed-out HyperFrames fail safely', async () => {
  for (const failure of [error('ENOENT'), error(3), error('ETIMEDOUT', { killed: true })]) {
    const result = await checkHyperFrames(fakeRunner({ failures: { hyperframes: failure } }), 'darwin');
    assert.equal(result.status, 'fail');
    assert.doesNotMatch(result.message, /secret|stdout/i);
  }
});

test('malformed HyperFrames JSON and missing required checks fail', async () => {
  const malformed = await checkHyperFrames(async () => ({ stdout: 'not-json', stderr: '' }), 'darwin');
  const missing = await checkHyperFrames(fakeRunner({ hyperframesChecks: requiredModernChecks().slice(0, 4) }), 'darwin');
  assert.equal(malformed.status, 'fail');
  assert.equal(missing.status, 'fail');
  assert.match(missing.message, /Chrome/);
});

test('failed current required HyperFrames check blocks', async () => {
  const checks = requiredModernChecks();
  checks[2] = { name: 'FFmpeg', ok: false, detail: 'secret raw detail' };
  const result = await checkHyperFrames(fakeRunner({ hyperframesChecks: checks }), 'darwin');
  assert.equal(result.status, 'fail');
  assert.match(result.message, /FFmpeg/);
  assert.doesNotMatch(result.message, /secret raw detail/);
});

test('Windows uses executable suffixes and npx.cmd without a shell', async () => {
  const calls = [];
  await checkBinary('ffmpeg', fakeRunner({ calls }), 'win32');
  await checkHyperFrames(fakeRunner({ calls }), 'win32');
  assert.equal(calls[0].file, 'ffmpeg.exe');
  assert.equal(calls[1].file, 'npx.cmd');
  assert.deepEqual(calls[1].args, ['--no-install', 'hyperframes', 'doctor', '--json']);
});

test('workdir rejects missing, non-directory, and failed writes', async () => {
  const missing = await checkWorkdir('/missing', fakeFs({ stat: async () => { throw error('ENOENT'); } }));
  const file = await checkWorkdir('/file', fakeFs({ stat: async () => ({ isDirectory: () => false }) }));
  const denied = await checkWorkdir('/denied', fakeFs({ writeFile: async () => { throw error('EACCES'); } }));
  assert.equal(missing.status, 'fail');
  assert.equal(file.status, 'fail');
  assert.equal(denied.status, 'fail');
});

test('workdir with spaces writes and removes only its unique probe', async () => {
  const seen = [];
  const target = '/tmp/a project';
  const result = await checkWorkdir(target, fakeFs({
    stat: async (path) => { seen.push(['stat', path]); return { isDirectory: () => true }; },
    writeFile: async (path, contents, options) => { seen.push(['write', path, contents, options]); },
    unlink: async (path) => { seen.push(['unlink', path]); },
  }));
  assert.equal(result.status, 'pass');
  assert.equal(seen[0][1], target);
  assert.match(seen[1][1], /^\/tmp\/a project\/\.doctor-probe-/);
  assert.equal(seen[1][3].flag, 'wx');
  assert.equal(seen[2][1], seen[1][1]);
});

test('cleanup failure is a blocking workdir failure', async () => {
  const result = await checkWorkdir('/tmp/project', fakeFs({ unlink: async () => { throw error('EACCES'); } }));
  assert.equal(result.status, 'fail');
  assert.match(result.message, /cleanup failed/);
});

test('sanitizer redacts workdir, home, and credential values', () => {
  const sanitize = createSanitizer('/Users/alice', '/Users/alice/My Project', {
    PEXELS_API_KEY: 'secret-value',
    NORMAL_VALUE: 'visible-value',
  });
  const output = sanitize('/Users/alice/My Project /Users/alice secret-value visible-value');
  assert.equal(output, '$WORKDIR $HOME [REDACTED] visible-value');
  assert.deepEqual(filterCredentialEnv({ API_TOKEN: 'x', SAFE: 'y' }), {
    API_TOKEN: '[REDACTED]',
    SAFE: 'y',
  });
});

test('computeResult strips internal warning fields and has stable exit codes', () => {
  const ready = computeResult([{ id: 'x', required: true, status: 'pass', message: 'ok' }], 'darwin', 'arm64');
  const blocked = computeResult([{ id: 'x', required: true, status: 'fail', message: 'no' }], 'darwin', 'arm64');
  assert.equal(exitCodeForResult(ready), 0);
  assert.equal(exitCodeForResult(blocked), 2);
  assert.equal('_warnings' in ready.checks[0], false);
});

test('argument parser and real CLI expose help and usage errors without probing', () => {
  assert.deepEqual(parseCliArgs(['--help']), { help: true });
  assert.equal(parseCliArgs(['--unknown']).error, true);
  const doctorPath = fileURLToPath(new URL('./doctor.mjs', import.meta.url));
  const help = spawnSync(process.execPath, [doctorPath, '--help'], { encoding: 'utf8' });
  const invalid = spawnSync(process.execPath, [doctorPath, '--unknown'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage:/);
  assert.equal(invalid.status, 64);
  assert.match(invalid.stderr, /invalid arguments/);
});

test('exec runner captures callback output and forces shell false', async () => {
  let received;
  const runner = createExecFileRunner((file, args, options, callback) => {
    received = { file, args, options };
    callback(null, 'captured stdout', 'captured stderr');
  });
  const output = await runner('tool', ['--version'], { extra: { shell: true } });
  assert.deepEqual(output, { stdout: 'captured stdout', stderr: 'captured stderr' });
  assert.equal(received.options.shell, false);
});
