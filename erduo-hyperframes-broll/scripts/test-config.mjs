import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import {
  ConfigError,
  getConfigPath,
  getPexelsConfigStatus,
  loadPexelsApiKey,
  normalizePexelsKey,
  parseConfigArgs,
  readBoundedStdin,
  runConfigCli,
  savePexelsApiKey,
} from './config.mjs';

function error(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function entry({ file = true, symlink = false } = {}) {
  return { isFile: () => file, isSymbolicLink: () => symlink };
}

function readFs(text, overrides = {}) {
  return {
    lstat: async () => entry(),
    readFile: async () => text,
    ...overrides,
  };
}

function capture() {
  let value = '';
  return {
    stream: new Writable({ write(chunk, encoding, callback) { value += chunk.toString(); callback(); } }),
    value: () => value,
  };
}

test('config paths follow macOS/Linux XDG and Windows APPDATA rules', () => {
  assert.equal(
    getConfigPath({ platform: 'darwin', env: {}, homeDir: '/Users/alice' }),
    '/Users/alice/.config/erduo-hyperframes-broll/config.json',
  );
  assert.equal(
    getConfigPath({ platform: 'linux', env: { XDG_CONFIG_HOME: '/var/config' }, homeDir: '/home/a' }),
    '/var/config/erduo-hyperframes-broll/config.json',
  );
  assert.equal(
    getConfigPath({ platform: 'linux', env: { XDG_CONFIG_HOME: 'relative' }, homeDir: '/home/a' }),
    '/home/a/.config/erduo-hyperframes-broll/config.json',
  );
  assert.equal(
    getConfigPath({ platform: 'win32', env: { APPDATA: 'C:\\Users\\Alice\\AppData\\Roaming' }, homeDir: 'C:\\Users\\Alice' }),
    'C:\\Users\\Alice\\AppData\\Roaming\\erduo-hyperframes-broll\\config.json',
  );
  assert.equal(
    getConfigPath({ platform: 'win32', env: {}, homeDir: 'D:\\Profiles\\Alice' }),
    'D:\\Profiles\\Alice\\AppData\\Roaming\\erduo-hyperframes-broll\\config.json',
  );
});

test('environment credential has priority and does not touch the filesystem', async () => {
  const credential = await loadPexelsApiKey({
    env: { PEXELS_API_KEY: '  env-secret  ' },
    fsImpl: { lstat: async () => { throw new Error('must not read'); } },
  });
  assert.deepEqual(credential, { key: 'env-secret', source: 'environment' });
  assert.deepEqual(
    await getPexelsConfigStatus({ env: { PEXELS_API_KEY: 'env-secret' } }),
    { configured: true, source: 'environment' },
  );
});

test('empty environment falls back to valid user config', async () => {
  const credential = await loadPexelsApiKey({
    env: { PEXELS_API_KEY: '  ' },
    platform: 'linux',
    homeDir: '/home/alice',
    fsImpl: readFs('{"pexels_api_key":"file-secret"}'),
  });
  assert.deepEqual(credential, { key: 'file-secret', source: 'user_config' });
});

test('missing config yields safe none status', async () => {
  const status = await getPexelsConfigStatus({
    env: {},
    fsImpl: { lstat: async () => { throw error('ENOENT'); } },
  });
  assert.deepEqual(status, { configured: false, source: 'none' });
});

test('malformed, array, symlink, and non-file configs are rejected without content', async () => {
  const cases = [
    [readFs('not-json'), 'config_invalid'],
    [readFs('[]'), 'config_invalid'],
    [readFs('{}', { lstat: async () => entry({ symlink: true }) }), 'config_unsafe'],
    [readFs('{}', { lstat: async () => entry({ file: false }) }), 'config_unsafe'],
    [readFs('{}', { lstat: async () => { throw error('EACCES', '/private/path'); } }), 'config_read_failed'],
  ];
  for (const [fsImpl, code] of cases) {
    await assert.rejects(
      loadPexelsApiKey({ env: {}, fsImpl }),
      (err) => err instanceof ConfigError && err.code === code && !err.message.includes('/private/path'),
    );
  }
});

test('credential validation rejects empty, whitespace/control, non-text, and oversized values', () => {
  for (const value of ['', 'abc def', 'abc\ndef', null, 'x'.repeat(4097)]) {
    assert.throws(() => normalizePexelsKey(value), ConfigError);
  }
  assert.equal(normalizePexelsKey('  abc-123  '), 'abc-123');
});

test('real POSIX save preserves unrelated fields and applies user-only modes', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broll-config-test-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const dir = path.join(root, 'erduo-hyperframes-broll');
  const configPath = path.join(dir, 'config.json');
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(configPath, '{"theme":"dark","pexels_api_key":"old"}\n');

  const status = await savePexelsApiKey('new-secret', {
    platform: 'linux',
    env: { XDG_CONFIG_HOME: root },
    homeDir: '/unused',
  });
  const saved = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const fileMode = (await fs.stat(configPath)).mode & 0o777;
  const dirMode = (await fs.stat(dir)).mode & 0o777;
  assert.deepEqual(status, { configured: true, source: 'user_config' });
  assert.deepEqual(saved, { theme: 'dark', pexels_api_key: 'new-secret' });
  assert.equal(fileMode, 0o600);
  assert.equal(dirMode, 0o700);
  assert.equal((await fs.readdir(dir)).some((name) => name.endsWith('.tmp')), false);
});

test('save uses exclusive sibling temp, rename, and POSIX permission operations', async () => {
  const calls = [];
  const fsImpl = {
    lstat: async () => { throw error('ENOENT'); },
    mkdir: async (...args) => calls.push(['mkdir', ...args]),
    chmod: async (...args) => calls.push(['chmod', ...args]),
    writeFile: async (...args) => calls.push(['writeFile', ...args]),
    rename: async (...args) => calls.push(['rename', ...args]),
    unlink: async (...args) => calls.push(['unlink', ...args]),
  };
  await savePexelsApiKey('stored-secret', {
    platform: 'linux',
    env: {},
    homeDir: '/home/alice',
    fsImpl,
    makeId: () => 'fixed-id',
  });
  const write = calls.find(([name]) => name === 'writeFile');
  const rename = calls.find(([name]) => name === 'rename');
  assert.equal(write[1], '/home/alice/.config/erduo-hyperframes-broll/.config.json.0.fixed-id.tmp'.replace('.0.', `.${process.pid}.`));
  assert.equal(write[3].flag, 'wx');
  assert.equal(write[3].mode, 0o600);
  assert.equal(rename[1], write[1]);
  assert.equal(rename[2], '/home/alice/.config/erduo-hyperframes-broll/config.json');
  assert.equal(calls.some(([name]) => name === 'unlink'), false);
});

test('Windows save skips chmod while retaining exclusive temp write', async () => {
  const calls = [];
  const fsImpl = {
    lstat: async () => { throw error('ENOENT'); },
    mkdir: async (...args) => calls.push(['mkdir', ...args]),
    chmod: async (...args) => calls.push(['chmod', ...args]),
    writeFile: async (...args) => calls.push(['writeFile', ...args]),
    rename: async (...args) => calls.push(['rename', ...args]),
    unlink: async (...args) => calls.push(['unlink', ...args]),
  };
  await savePexelsApiKey('stored-secret', {
    platform: 'win32',
    env: { APPDATA: 'C:\\Config' },
    homeDir: 'C:\\Users\\Alice',
    fsImpl,
    makeId: () => 'id',
  });
  assert.equal(calls.some(([name]) => name === 'chmod'), false);
  assert.equal(calls.find(([name]) => name === 'writeFile')[3].flag, 'wx');
});

test('failed write leaves no claimed temp; failed rename cleans only its temp', async () => {
  let unlinkPath;
  const base = {
    lstat: async () => { throw error('ENOENT'); },
    mkdir: async () => {},
    chmod: async () => {},
  };
  await assert.rejects(
    savePexelsApiKey('secret', {
      fsImpl: { ...base, writeFile: async () => { throw error('EACCES'); }, rename: async () => {}, unlink: async () => assert.fail('must not unlink') },
    }),
    (err) => err.code === 'config_write_failed',
  );
  await assert.rejects(
    savePexelsApiKey('secret', {
      fsImpl: {
        ...base,
        writeFile: async () => {},
        rename: async () => { throw error('EPERM'); },
        unlink: async (value) => { unlinkPath = value; },
      },
      makeId: () => 'rename-failure',
    }),
    (err) => err.code === 'config_write_failed',
  );
  assert.match(unlinkPath, /\.config\.json\..+\.rename-failure\.tmp$/);
});

test('cleanup failure is safe and does not include path or key', async () => {
  const fsImpl = {
    lstat: async () => { throw error('ENOENT'); },
    mkdir: async () => {},
    chmod: async () => {},
    writeFile: async () => {},
    rename: async () => { throw error('EPERM', '/private/path secret-value'); },
    unlink: async () => { throw error('EACCES', '/private/temp secret-value'); },
  };
  await assert.rejects(
    savePexelsApiKey('secret-value', { fsImpl }),
    (err) => err.code === 'config_cleanup_failed' && !err.message.includes('secret-value') && !err.message.includes('/private'),
  );
});

test('bounded stdin accepts a key and rejects oversized input', async () => {
  assert.equal(await readBoundedStdin(Readable.from(['abc', '-123'])), 'abc-123');
  await assert.rejects(readBoundedStdin(Readable.from(['12345']), 4), (err) => err.code === 'input_too_large');
});

test('safe status and CLI output never expose the supplied environment key', async () => {
  const secret = 'a-very-private-key';
  const stdout = capture();
  const stderr = capture();
  const code = await runConfigCli(['status', '--json'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    options: { env: { PEXELS_API_KEY: secret } },
  });
  const result = JSON.parse(stdout.value());
  assert.equal(code, 0);
  assert.deepEqual(result, { configured: true, source: 'environment' });
  assert.equal(`${stdout.value()}${stderr.value()}`.includes(secret), false);
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test('safe configuration errors never expose key, raw JSON, or path', async () => {
  const secret = 'private-key-value';
  const stdout = capture();
  const stderr = capture();
  const code = await runConfigCli(['status', '--json'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    options: {
      env: {},
      homeDir: '/private/home',
      fsImpl: readFs(`{${secret}`),
    },
  });
  const combined = `${stdout.value()}${stderr.value()}`;
  assert.equal(code, 3);
  assert.equal(combined.includes(secret), false);
  assert.equal(combined.includes('/private/home'), false);
  assert.equal(JSON.parse(stdout.value()).code, 'config_invalid');
});

test('CLI parser requires stdin for setting and rejects extra/duplicate flags', () => {
  assert.deepEqual(parseConfigArgs(['--help']), { help: true });
  assert.equal(parseConfigArgs(['status', '--stdin']).error, true);
  assert.equal(parseConfigArgs(['set-pexels-key']).error, true);
  assert.equal(parseConfigArgs(['set-pexels-key', '--stdin', '--stdin']).error, true);
  assert.equal(parseConfigArgs(['set-pexels-key', 'literal-secret']).error, true);
  assert.deepEqual(parseConfigArgs(['set-pexels-key', '--stdin', '--json']), {
    action: 'set-pexels-key', json: true, stdin: true,
  });
});

test('CLI help, invalid args, and missing status have stable safe exit codes', async () => {
  const helpOut = capture();
  assert.equal(await runConfigCli(['--help'], { stdout: helpOut.stream }), 0);
  assert.match(helpOut.value(), /Usage:/);

  const invalidErr = capture();
  assert.equal(await runConfigCli(['--key', 'secret'], { stderr: invalidErr.stream }), 64);
  assert.doesNotMatch(invalidErr.value(), /secret/);

  const missingOut = capture();
  assert.equal(await runConfigCli(['status', '--json'], {
    stdout: missingOut.stream,
    options: { env: {}, fsImpl: { lstat: async () => { throw error('ENOENT'); } } },
  }), 2);
  assert.deepEqual(JSON.parse(missingOut.value()), { configured: false, source: 'none' });
});
