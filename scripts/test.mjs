import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createGzip, gunzipSync, gzipSync } from 'node:zlib';
import {
  RELEASE_VERSION,
  SKILL_NAMES,
  applicationDataDir,
  atomicWriteJson,
  normalizeOfficialDoctor,
  runFile,
  sanitizedChildEnv,
} from './lib.mjs';
import { collectDoctor } from './doctor.mjs';
import { pexelsStatus, savePexelsKey } from './config.mjs';
import {
  installSkillLinks,
  runInstall,
  validateRuntimeLock,
} from './install.mjs';
import { runUninstall } from './uninstall.mjs';
import {
  RELEASE_FILES,
  REPOSITORY_ONLY_FILES,
  buildRelease,
  verifyReleaseArchiveRaw,
} from './package-release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PEXELS_ENV_FIELD = ['PEXELS', 'API', 'KEY'].join('_');
const PEXELS_ENV_FIELD_LOWER = PEXELS_ENV_FIELD.toLowerCase();
const PEXELS_ENV_FIELD_MIXED = ['Pexels', 'Api', 'Key'].join('_');
const execFileAsync = promisify(execFile);

async function isolated(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'erduo-opensource-test-'));
  t.after(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(base, { recursive: true, force: true });
  });
  const homeDir = path.join(base, 'home');
  const xdg = path.join(base, 'xdg');
  const npmCache = path.join(base, 'npm-cache');
  await Promise.all([
    mkdir(homeDir, { recursive: true }),
    mkdir(xdg, { recursive: true }),
    mkdir(npmCache, { recursive: true }),
  ]);
  return {
    base,
    homeDir,
    env: {
      HOME: homeDir,
      XDG_CONFIG_HOME: xdg,
      npm_config_cache: npmCache,
      PATH: path.join(base, 'mock-bin'),
    },
  };
}

async function createSkillFixture(base) {
  const repoRoot = path.join(base, 'repo');
  const skillRoot = path.join(repoRoot, 'erduo-hyperframes-broll');
  await mkdir(path.join(repoRoot, 'runtime'), { recursive: true });
  await cp(
    path.join(root, 'runtime', 'package.json'),
    path.join(repoRoot, 'runtime', 'package.json'),
  );
  await cp(
    path.join(root, 'runtime', 'package-lock.json'),
    path.join(repoRoot, 'runtime', 'package-lock.json'),
  );
  for (const name of SKILL_NAMES) {
    const directory = name === 'erduo-hyperframes-broll'
      ? skillRoot
      : path.join(skillRoot, 'stages', name);
    await mkdir(directory, { recursive: true });
    await writeFile(
      path.join(directory, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Isolated fixture Skill used only by local tests.\n---\n`,
      'utf8',
    );
  }
  return repoRoot;
}

async function entryExists(target) {
  try {
    await lstat(target);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function manifestFor(records, repoRoot) {
  return {
    schema_version: 1,
    product_version: 'fixture',
    installed_at: 'fixture',
    repo_root: await realpath(repoRoot),
    records: records.map((entry) => ({
      host: entry.host,
      name: entry.name,
      source: entry.source,
      target: entry.target,
      backup: entry.backup,
      action: entry.action,
    })),
  };
}

function doctorChecksWithDuplicateFfmpeg(okFirst) {
  return [
    { name: 'Version', ok: true },
    { name: 'Node.js', ok: true },
    { name: 'FFmpeg', ok: okFirst },
    { name: 'FFmpeg', ok: !okFirst },
    { name: 'FFprobe', ok: true },
    { name: 'Chrome', ok: true },
  ];
}

function createTarHeader(name, size, typeflag = '0') {
  const header = Buffer.alloc(512);
  const writeString = (value, start, length) => {
    const bytes = Buffer.from(value, 'utf8');
    assert.ok(bytes.length < length);
    bytes.copy(header, start);
  };
  const writeOctal = (value, start, length) => {
    const text = `${value.toString(8).padStart(length - 1, '0')}\0`;
    header.write(text, start, length, 'ascii');
  };
  writeString(name, 0, 100);
  writeOctal(typeflag === '5' || name.endsWith('/Install.command') ? 0o755 : 0o644, 100, 8);
  writeOctal(0, 108, 8);
  writeOctal(0, 116, 8);
  writeOctal(size, 124, 12);
  writeOctal(946684800, 136, 12);
  header.fill(0x20, 148, 156);
  header.write(typeflag, 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii');
  header.write('00', 263, 2, 'ascii');
  header.write('root', 265, 4, 'ascii');
  header.write('root', 297, 4, 'ascii');
  writeOctal(0, 329, 8);
  writeOctal(0, 337, 8);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return header;
}

function canonicalGzip(tar) {
  const compressed = gzipSync(tar, { level: 9 });
  compressed[9] = 255;
  return compressed;
}

function recalculateTarChecksum(header) {
  header.fill(0x20, 148, 156);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
}

function testTarRecords(tar) {
  const records = [];
  let offset = 0;
  while (offset + 512 <= tar.length && !tar.subarray(offset, offset + 512).every(
    (byte) => byte === 0,
  )) {
    const header = tar.subarray(offset, offset + 512);
    const sizeText = header.subarray(124, 136).toString('ascii')
      .replace(/[\0 ]+$/u, '')
      .trimStart();
    const size = Number.parseInt(sizeText || '0', 8);
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/su, '');
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/su, '');
    const member = prefix ? `${prefix}/${name}` : name;
    const paddedSize = Math.ceil(size / 512) * 512;
    records.push({
      offset,
      header,
      size,
      bodyOffset: offset + 512,
      end: offset + 512 + paddedSize,
      member,
      type: String.fromCharCode(header[156] || 48),
    });
    offset += 512 + paddedSize;
  }
  return { records, endOffset: offset };
}

function setTestTarPath(header, member) {
  const bytes = Buffer.from(member, 'utf8');
  header.fill(0, 0, 100);
  header.fill(0, 345, 500);
  if (bytes.length <= 100) {
    bytes.copy(header, 0);
    return;
  }
  const slash = member.lastIndexOf('/');
  const prefix = Buffer.from(member.slice(0, slash), 'utf8');
  const name = Buffer.from(member.slice(slash + 1), 'utf8');
  assert.ok(prefix.length <= 155 && name.length <= 100);
  name.copy(header, 0);
  prefix.copy(header, 345);
}

function mutateFirstMatchingHeader(tar, predicate, mutate) {
  const copy = Buffer.from(tar);
  const record = testTarRecords(copy).records.find(predicate);
  assert.ok(record);
  mutate(record.header, record);
  recalculateTarChecksum(record.header);
  return copy;
}

function cloneTarRecord(tar, predicate, mutate = () => {}) {
  const parsed = testTarRecords(tar);
  const record = parsed.records.find(predicate);
  assert.ok(record);
  const clone = Buffer.from(tar.subarray(record.offset, record.end));
  mutate(clone.subarray(0, 512), record);
  recalculateTarChecksum(clone.subarray(0, 512));
  return Buffer.concat([
    tar.subarray(0, parsed.endOffset),
    clone,
    tar.subarray(parsed.endOffset),
  ]);
}

function replaceTarRecordBody(tar, predicate, body) {
  const parsed = testTarRecords(tar);
  const record = parsed.records.find(predicate);
  assert.ok(record);
  const header = Buffer.from(record.header);
  header.fill(0, 124, 136);
  header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
  recalculateTarChecksum(header);
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([
    tar.subarray(0, record.offset),
    header,
    body,
    padding,
    tar.subarray(record.end),
  ]);
}

function paxRecord(key, value) {
  let length = Buffer.byteLength(`${key}=${value}\n`) + 2;
  while (true) {
    const text = `${length} ${key}=${value}\n`;
    const actual = Buffer.byteLength(text);
    if (actual === length) return Buffer.from(text, 'utf8');
    length = actual;
  }
}

function prependTarMetadata(tar, type, payload) {
  const padding = Buffer.alloc((512 - (payload.length % 512)) % 512);
  return Buffer.concat([
    createTarHeader('PaxHeader/security-metadata', payload.length, type),
    payload,
    padding,
    tar,
  ]);
}

function gzipWithOptionalField(canonical, flag, field) {
  const header = Buffer.from(canonical.subarray(0, 10));
  header[3] = flag;
  return Buffer.concat([header, field, canonical.subarray(10)]);
}

function createSingleMemberTar(name, body, typeflag = '0') {
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([
    createTarHeader(name, body.length, typeflag),
    body,
    padding,
    Buffer.alloc(1024),
  ]);
}

test('Pexels credential is validated, atomically stored with private mode, and never returned', async (t) => {
  const state = await isolated(t);
  const credential = 'fixture-credential-123456789';
  let request = null;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 200 };
  };
  const result = await savePexelsKey(credential, {
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
    fetchImpl,
  });
  assert.equal(result.configured, true);
  assert.equal(result.validated, true);
  assert.equal(JSON.stringify(result).includes(credential), false);
  assert.equal(request.options.headers.Authorization, credential);
  const file = path.join(
    applicationDataDir({ platform: 'darwin', homeDir: state.homeDir, env: state.env }),
    'config.json',
  );
  const stat = await lstat(file);
  if (process.platform !== 'win32') assert.equal(stat.mode & 0o777, 0o600);
  const status = await pexelsStatus({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
  });
  assert.deepEqual(status, {
    configured: true,
    validated: false,
    source: 'user-config',
  });
  assert.equal(JSON.stringify(status).includes(credential), false);
});

test('official doctor evaluation gates on JSON payload facts, not process exit', () => {
  const payload = {
    ok: false,
    checks: [
      { name: 'Version', ok: true },
      { name: 'Node.js', ok: true },
      { name: 'FFmpeg', ok: true },
      { name: 'FFprobe', ok: true },
      { name: 'Chrome', ok: true },
      { name: 'Docker', ok: false },
    ],
  };
  const normalized = normalizeOfficialDoctor(payload);
  assert.equal(normalized.top_level_ok, false);
  assert.equal(normalized.readiness_scope, 'required-local-render-facts-only');
  assert.equal(normalized.selected_local_render_ready, true);
  const failed = normalizeOfficialDoctor({
    ...payload,
    checks: payload.checks.map((fact) => fact.name === 'Chrome'
      ? { ...fact, ok: false }
      : fact),
  });
  assert.equal(failed.selected_local_render_ready, false);
  const sanitized = normalizeOfficialDoctor({
    ok: true,
    checks: [
      ...payload.checks,
      { name: `${path.sep}private${path.sep}machine${path.sep}detail`, ok: false },
    ],
  });
  assert.equal(sanitized.checks.at(-1).id, 'unknown-7');
  assert.equal(JSON.stringify(sanitized).includes('machine'), false);
});

test('official doctor rejects every missing or duplicate required local-render fact', () => {
  const required = ['Version', 'Node.js', 'FFmpeg', 'FFprobe', 'Chrome']
    .map((name) => ({ name, ok: true }));
  const invalidChecks = [
    required.filter((fact) => fact.name !== 'Chrome'),
    [...required, { name: 'FFmpeg', ok: false }],
    [
      ...required.filter((fact) => fact.name !== 'FFmpeg'),
      { name: 'FFmpeg', ok: false },
      { name: 'FFmpeg', ok: true },
    ],
  ];
  for (const checks of invalidChecks) {
    assert.throws(
      () => normalizeOfficialDoctor({ ok: false, checks }),
      (error) => error?.code === 'hyperframes_doctor_payload_invalid',
    );
  }
});

test('collectDoctor rejects both duplicate required-fact orders without exposing child credentials', async (t) => {
  const state = await isolated(t);
  for (const okFirst of [true, false]) {
    await t.test(okFirst ? 'ok-before-fail' : 'fail-before-ok', async () => {
      const appDir = path.join(state.base, okFirst ? 'doctor-ok-first' : 'doctor-fail-first');
      const cli = path.join(
        appDir,
        'runtime',
        'node_modules',
        'hyperframes',
        'dist',
        'cli.js',
      );
      await mkdir(path.dirname(cli), { recursive: true });
      await writeFile(cli, '// fixture only\n', 'utf8');
      const runner = async (command, args, options) => {
        assert.equal(options.env[PEXELS_ENV_FIELD], undefined);
        assert.equal(options.env[PEXELS_ENV_FIELD_LOWER], undefined);
        assert.equal(options.env[PEXELS_ENV_FIELD_MIXED], undefined);
        assert.equal(options.env.HYPERFRAMES_NO_TELEMETRY, '1');
        if (args.includes('skills')) {
          return { code: 0, stdout: JSON.stringify({ ok: true, installed: [] }), stderr: '' };
        }
        return {
          code: 0,
          stdout: JSON.stringify({
            ok: false,
            checks: doctorChecksWithDuplicateFfmpeg(okFirst),
          }),
          stderr: '',
        };
      };
      const report = await collectDoctor({
        homeDir: state.homeDir,
        env: {
          ...state.env,
          [PEXELS_ENV_FIELD]: 'uppercase-canary',
          [PEXELS_ENV_FIELD_LOWER]: 'lowercase-canary',
          [PEXELS_ENV_FIELD_MIXED]: 'mixedcase-canary',
        },
        platform: 'darwin',
        appDir,
        runner,
        fetchImpl: async () => {
          assert.fail('Pexels fetch must not run without a configured credential');
        },
      });
      assert.equal(report.status, 'action-required');
      assert.equal(report.hyperframes.official_doctor.payload_valid, false);
      assert.equal(
        report.hyperframes.official_doctor.reason,
        'hyperframes_doctor_payload_invalid',
      );
    });
  }
});

test('official child environment always disables telemetry and excludes Pexels credentials', () => {
  const credentialCanary = ['fixture', 'only'].join('-');
  const parent = {
    PATH: '/mock-bin',
    [PEXELS_ENV_FIELD]: credentialCanary,
    [PEXELS_ENV_FIELD_LOWER]: 'lower-case-canary',
    [PEXELS_ENV_FIELD_MIXED]: 'mixed-case-canary',
    HYPERFRAMES_NO_TELEMETRY: '0',
    hyperframes_no_telemetry: 'lower-case-zero',
  };
  const child = sanitizedChildEnv(parent);
  assert.equal(child[PEXELS_ENV_FIELD], undefined);
  assert.equal(child[PEXELS_ENV_FIELD_LOWER], undefined);
  assert.equal(child[PEXELS_ENV_FIELD_MIXED], undefined);
  assert.equal(child.HYPERFRAMES_NO_TELEMETRY, '1');
  assert.equal(child.hyperframes_no_telemetry, undefined);
  assert.equal(child.PATH, parent.PATH);
  assert.equal(parent[PEXELS_ENV_FIELD], credentialCanary);
  assert.equal(parent[PEXELS_ENV_FIELD_LOWER], 'lower-case-canary');
  assert.equal(parent[PEXELS_ENV_FIELD_MIXED], 'mixed-case-canary');
  assert.equal(parent.HYPERFRAMES_NO_TELEMETRY, '0');
  assert.equal(parent.hyperframes_no_telemetry, 'lower-case-zero');
  assert.equal(sanitizedChildEnv({ PATH: '/mock-bin' }).HYPERFRAMES_NO_TELEMETRY, '1');
});

test('the shared child-process wrapper sanitizes the actual spawned environment', async () => {
  const result = await runFile(process.execPath, [
    '-e',
    'process.stdout.write(JSON.stringify(process.env))',
  ], {
    env: {
      PATH: process.env.PATH,
      [PEXELS_ENV_FIELD]: 'uppercase-canary',
      [PEXELS_ENV_FIELD_LOWER]: 'lowercase-canary',
      [PEXELS_ENV_FIELD_MIXED]: 'mixedcase-canary',
      HYPERFRAMES_NO_TELEMETRY: '0',
      hyperframes_no_telemetry: 'lowercase-zero',
    },
  });
  assert.equal(result.code, 0);
  const child = JSON.parse(result.stdout);
  assert.equal(child[PEXELS_ENV_FIELD], undefined);
  assert.equal(child[PEXELS_ENV_FIELD_LOWER], undefined);
  assert.equal(child[PEXELS_ENV_FIELD_MIXED], undefined);
  assert.equal(child.HYPERFRAMES_NO_TELEMETRY, '1');
  assert.equal(child.hyperframes_no_telemetry, undefined);
});

test('public documentation states telemetry defaults, network boundaries, and external HyperFrames scope', async () => {
  const documents = await Promise.all([
    'README.md',
    'PRIVACY.md',
    'THIRD-PARTY-NOTICES.md',
    'RELEASE-CHECKLIST.md',
  ].map(async (name) => ({
    name,
    text: await readFile(path.join(root, name), 'utf8'),
  })));
  for (const { name, text } of documents) {
    assert.match(text, /本仓库自身[^。\n]*遥测/u, name);
    assert.match(text, /HYPERFRAMES_NO_TELEMETRY=1/u, name);
    assert.match(text, /npm registry/u, name);
    assert.match(text, /GitHub[^。\n]*官方 Skill/u, name);
    assert.match(text, /browser ensure/u, name);
    assert.match(text, /官方浏览器源/u, name);
    assert.match(text, /包外|发行包之外/u, name);
    assert.match(text, /HyperFrames 自身[^。\n]*政策约束/u, name);
  }
});

test('every production command surface requires a portable case-insensitive child environment map', async () => {
  const files = [
    'erduo-hyperframes-broll/SKILL.md',
    'erduo-hyperframes-broll/references/stage-orchestration.md',
    'erduo-hyperframes-broll/references/prompt-first-workflow.md',
    'erduo-hyperframes-broll/stages/broll-onboarding/SKILL.md',
    'erduo-hyperframes-broll/stages/broll-director/SKILL.md',
    'erduo-hyperframes-broll/stages/broll-assets/SKILL.md',
    'erduo-hyperframes-broll/stages/broll-master-build/SKILL.md',
    'erduo-hyperframes-broll/stages/broll-master-integrate/SKILL.md',
    'erduo-hyperframes-broll/stages/broll-render/SKILL.md',
    'erduo-hyperframes-broll/stages/broll-shot-export/SKILL.md',
  ];
  for (const file of files) {
    const text = await readFile(path.join(root, file), 'utf8');
    assert.match(text, /explicit\s+(?:host-native\s+)?(?:environment|child)\s+map/u, file);
    assert.match(text, /case(?: |-)(?:variant|folded|insensitive)/iu, file);
    assert.match(text, /PEXELS_API_KEY/u, file);
    assert.match(text, /HYPERFRAMES_NO_TELEMETRY=1/u, file);
    assert.match(text, /stop(?:s)?\s+before\s+spawn/u, file);
  }
  const onboarding = await readFile(
    path.join(root, 'erduo-hyperframes-broll', 'references', 'first-run-onboarding.md'),
    'utf8',
  );
  assert.doesNotMatch(
    onboarding,
    /HYPERFRAMES_NO_TELEMETRY=1\s+npx\s+hyperframes/u,
  );
  assert.match(onboarding, /native spawn\/process API/u);
});

test('Skill installation backs up occupied targets and uninstall restores them', async (t) => {
  const state = await isolated(t);
  const repoRoot = await createSkillFixture(state.base);
  const appDir = applicationDataDir({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
  });
  const occupied = path.join(state.homeDir, '.codex', 'skills', 'broll-director');
  await mkdir(occupied, { recursive: true });
  await writeFile(path.join(occupied, 'old.txt'), 'preserve me\n', 'utf8');
  let manifest;
  const records = await installSkillLinks({
    repoRoot,
    appDir,
    homeDir: state.homeDir,
    approveOccupied: true,
    timestamp: 'fixture',
    finalize: async (entries) => {
      manifest = await manifestFor(entries, repoRoot);
      await atomicWriteJson(path.join(appDir, 'install-manifest.json'), manifest);
    },
  });
  assert.equal(records.length, SKILL_NAMES.length * 2);
  assert.equal(records.filter((entry) => entry.backup).length, 1);
  assert.equal((await lstat(occupied)).isSymbolicLink(), true);
  const result = await runUninstall({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
    appDir,
    repoRoot,
  });
  assert.equal(result.removed, SKILL_NAMES.length * 2);
  assert.equal(result.restored, 1);
  assert.equal(await readFile(path.join(occupied, 'old.txt'), 'utf8'), 'preserve me\n');
  assert.equal(await entryExists(path.join(appDir, 'install-manifest.json')), false);
  assert.equal(await entryExists(path.join(appDir, 'uninstall-receipt.json')), true);
  await assert.rejects(
    runUninstall({
      platform: 'darwin',
      homeDir: state.homeDir,
      env: state.env,
      appDir,
      repoRoot,
    }),
    (error) => error?.code === 'install_manifest_missing',
  );
  await installSkillLinks({
    repoRoot,
    appDir,
    homeDir: state.homeDir,
    approveOccupied: true,
    timestamp: 'fixture-reinstall',
    finalize: async (entries) => {
      await atomicWriteJson(
        path.join(appDir, 'install-manifest.json'),
        await manifestFor(entries, repoRoot),
      );
    },
  });
  const secondResult = await runUninstall({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
    appDir,
    repoRoot,
  });
  assert.equal(secondResult.restored, 1);
  assert.equal(await readFile(path.join(occupied, 'old.txt'), 'utf8'), 'preserve me\n');
});

test('doctor uses only mocked official commands and isolated host/config paths', async (t) => {
  const state = await isolated(t);
  const repoRoot = await createSkillFixture(state.base);
  const appDir = applicationDataDir({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
  });
  const cli = path.join(
    appDir,
    'runtime',
    'node_modules',
    'hyperframes',
    'dist',
    'cli.js',
  );
  await mkdir(path.dirname(cli), { recursive: true });
  await writeFile(cli, '// mock only\n', 'utf8');
  for (const { hostRoot } of [
    { hostRoot: path.join(state.homeDir, '.codex', 'skills') },
    { hostRoot: path.join(state.homeDir, '.claude', 'skills') },
  ]) {
    await mkdir(hostRoot, { recursive: true });
    for (const name of SKILL_NAMES) {
      const source = name === 'erduo-hyperframes-broll'
        ? path.join(repoRoot, 'erduo-hyperframes-broll')
        : path.join(repoRoot, 'erduo-hyperframes-broll', 'stages', name);
      await symlink(await realpath(source), path.join(hostRoot, name), 'dir');
    }
  }
  const calls = [];
  const envCredential = ['fixture', 'env', 'credential'].join('-');
  const runner = async (_command, args, options) => {
    assert.equal(options.env.PEXELS_API_KEY, undefined);
    assert.equal(options.env.HYPERFRAMES_NO_TELEMETRY, '1');
    calls.push(args.slice(-3));
    if (args.includes('doctor')) {
      return {
        code: 0,
        stderr: '',
        stdout: JSON.stringify({
          ok: true,
          checks: ['Version', 'Node.js', 'FFmpeg', 'FFprobe', 'Chrome']
            .map((name) => ({ name, ok: true })),
        }),
      };
    }
    return { code: 0, stderr: '', stdout: JSON.stringify({ ok: true, installed: [] }) };
  };
  const report = await collectDoctor({
    env: { ...state.env, [PEXELS_ENV_FIELD]: envCredential },
    homeDir: state.homeDir,
    platform: 'darwin',
    arch: 'arm64',
    appDir,
    repoRoot,
    runner,
    nodeVersion: '22.17.0',
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  assert.equal(report.status, 'ready');
  assert.equal(report.hyperframes.official_doctor.selected_local_render_ready, true);
  assert.equal(report.custom_skills.ready_count, SKILL_NAMES.length * 2);
  assert.equal(JSON.stringify(report).includes('fixture-env-credential'), false);
  const rejected = await collectDoctor({
    env: { ...state.env, [PEXELS_ENV_FIELD]: envCredential },
    homeDir: state.homeDir,
    platform: 'darwin',
    arch: 'arm64',
    appDir,
    repoRoot,
    runner,
    nodeVersion: '22.17.0',
    fetchImpl: async () => ({ ok: false, status: 401 }),
  });
  assert.equal(rejected.status, 'action-required');
  assert.equal(rejected.pexels.configured, true);
  assert.equal(rejected.pexels.validated, false);
  assert.equal(JSON.stringify(rejected).includes('fixture-env-credential'), false);
  assert.equal(calls.length, 4);
});

test('Skill installation rolls back every change when a later step or manifest commit fails', async (t) => {
  const state = await isolated(t);
  const repoRoot = await createSkillFixture(state.base);
  const appDir = applicationDataDir({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
  });
  const occupied = path.join(
    state.homeDir,
    '.codex',
    'skills',
    'erduo-hyperframes-broll',
  );
  await mkdir(occupied, { recursive: true });
  await writeFile(path.join(occupied, 'old.txt'), 'original\n', 'utf8');

  await assert.rejects(
    installSkillLinks({
      repoRoot,
      appDir,
      homeDir: state.homeDir,
      approveOccupied: true,
      timestamp: 'rollback-step',
      stepHook: async ({ installed }) => {
        if (installed === 2) throw new Error('injected later-step failure');
      },
    }),
    /injected later-step failure/u,
  );
  assert.equal(await readFile(path.join(occupied, 'old.txt'), 'utf8'), 'original\n');
  assert.equal(
    await entryExists(path.join(state.homeDir, '.codex', 'skills', 'broll-onboarding')),
    false,
  );

  await assert.rejects(
    installSkillLinks({
      repoRoot,
      appDir,
      homeDir: state.homeDir,
      approveOccupied: true,
      timestamp: 'rollback-manifest',
      finalize: async () => {
        throw new Error('injected manifest failure');
      },
    }),
    /injected manifest failure/u,
  );
  assert.equal(await readFile(path.join(occupied, 'old.txt'), 'utf8'), 'original\n');
  assert.equal(
    await entryExists(path.join(state.homeDir, '.claude', 'skills', 'broll-render')),
    false,
  );
});

test('reinstall preserves the original backup chain and uninstall restores it', async (t) => {
  const state = await isolated(t);
  const repoRoot = await createSkillFixture(state.base);
  const appDir = applicationDataDir({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
  });
  const occupied = path.join(state.homeDir, '.codex', 'skills', 'broll-director');
  const manifestFile = path.join(appDir, 'install-manifest.json');
  await mkdir(occupied, { recursive: true });
  await writeFile(path.join(occupied, 'old.txt'), 'preserve across reinstall\n', 'utf8');

  await installSkillLinks({
    repoRoot,
    appDir,
    homeDir: state.homeDir,
    approveOccupied: true,
    timestamp: 'first',
    finalize: async (entries) => {
      await atomicWriteJson(manifestFile, await manifestFor(entries, repoRoot));
    },
  });
  const firstManifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  const originalBackup = firstManifest.records
    .find((record) => record.target === occupied).backup;
  assert.ok(originalBackup);

  await installSkillLinks({
    repoRoot,
    appDir,
    homeDir: state.homeDir,
    approveOccupied: true,
    timestamp: 'second',
    previousManifest: firstManifest,
    finalize: async (entries) => {
      await atomicWriteJson(manifestFile, await manifestFor(entries, repoRoot));
    },
  });
  const secondManifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  assert.equal(
    secondManifest.records.find((record) => record.target === occupied).backup,
    originalBackup,
  );

  const result = await runUninstall({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
    appDir,
    repoRoot,
  });
  assert.equal(result.restored, 1);
  assert.equal(
    await readFile(path.join(occupied, 'old.txt'), 'utf8'),
    'preserve across reinstall\n',
  );
});

test('uninstall rejects name, source, target, backup, and duplicate-record manifest tampering', async (t) => {
  const state = await isolated(t);
  const repoRoot = await createSkillFixture(state.base);
  const appDir = applicationDataDir({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
  });
  const manifestFile = path.join(appDir, 'install-manifest.json');
  let validManifest;
  await installSkillLinks({
    repoRoot,
    appDir,
    homeDir: state.homeDir,
    approveOccupied: true,
    timestamp: 'tamper',
    finalize: async (entries) => {
      validManifest = await manifestFor(entries, repoRoot);
      await atomicWriteJson(manifestFile, validManifest);
    },
  });

  const cases = [
    (manifest) => {
      manifest.records[0].name = 'not-an-owned-skill';
    },
    (manifest) => {
      manifest.records[0].source = path.join(state.homeDir, 'outside-source');
    },
    (manifest) => {
      manifest.records[0].target = path.join(state.homeDir, 'outside-link');
    },
    (manifest) => {
      manifest.records[0].backup = path.join(state.homeDir, 'outside-backup');
    },
    (manifest) => {
      manifest.records[1] = { ...manifest.records[0] };
    },
  ];
  for (const mutate of cases) {
    const tampered = structuredClone(validManifest);
    mutate(tampered);
    await atomicWriteJson(manifestFile, tampered);
    await assert.rejects(
      runUninstall({
        platform: 'darwin',
        homeDir: state.homeDir,
        env: state.env,
        appDir,
        repoRoot,
      }),
      (error) => error?.code === 'install_manifest_invalid',
    );
  }
  assert.equal(
    (await lstat(path.join(state.homeDir, '.codex', 'skills', 'broll-director')))
      .isSymbolicLink(),
    true,
  );
});

test('uninstall removes an owned dangling link without claiming a false removal', async (t) => {
  const state = await isolated(t);
  const repoRoot = await createSkillFixture(state.base);
  const appDir = applicationDataDir({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
  });
  const manifestFile = path.join(appDir, 'install-manifest.json');
  await installSkillLinks({
    repoRoot,
    appDir,
    homeDir: state.homeDir,
    approveOccupied: true,
    timestamp: 'dangling',
    finalize: async (entries) => {
      await atomicWriteJson(manifestFile, await manifestFor(entries, repoRoot));
    },
  });
  const source = path.join(
    repoRoot,
    'erduo-hyperframes-broll',
    'stages',
    'broll-director',
  );
  const target = path.join(state.homeDir, '.codex', 'skills', 'broll-director');
  await rm(source, { recursive: true });
  assert.equal((await lstat(target)).isSymbolicLink(), true);

  await runUninstall({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
    appDir,
    repoRoot,
  });
  assert.equal(await entryExists(target), false);
});

test('one-click installer orchestrates only mocked npm and official HyperFrames commands', async (t) => {
  const state = await isolated(t);
  const repoRoot = await createSkillFixture(state.base);
  const appDir = applicationDataDir({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
  });
  const mockNpmCli = path.join(state.base, 'mock-npm-cli.js');
  await writeFile(mockNpmCli, '// never executed; runner is mocked\n', 'utf8');
  const calls = [];
  const processCanary = ['child', 'process', 'canary'].join('-');
  let ffmpegInstalled = false;
  const runner = async (command, args, options) => {
    assert.equal(options.env.PEXELS_API_KEY, undefined);
    assert.equal(options.env.HYPERFRAMES_NO_TELEMETRY, '1');
    calls.push({ command, args });
    if (args.includes('ci') && args.includes('--ignore-scripts')) {
      const cli = path.join(
        appDir,
        'runtime',
        'node_modules',
        'hyperframes',
        'dist',
        'cli.js',
      );
      await mkdir(path.dirname(cli), { recursive: true });
      await writeFile(cli, '// mock only\n', 'utf8');
      await writeFile(
        path.join(appDir, 'runtime', 'node_modules', 'hyperframes', 'package.json'),
        `${JSON.stringify({ name: 'hyperframes', version: '0.7.72' })}\n`,
        'utf8',
      );
      return { code: 0, stdout: '', stderr: '' };
    }
    if (args.includes('skills') && args.includes('check')) {
      return { code: 0, stdout: JSON.stringify({ ok: true, installed: [] }), stderr: '' };
    }
    if (args.includes('doctor')) {
      return {
        code: 0,
        stderr: '',
        stdout: JSON.stringify({
          ok: true,
          checks: ['Version', 'Node.js', 'FFmpeg', 'FFprobe', 'Chrome']
            .map((name) => ({
              name,
              ok: !['FFmpeg', 'FFprobe'].includes(name) || ffmpegInstalled,
            })),
        }),
      };
    }
    if (command === 'brew' && args[0] === 'install' && args[1] === 'ffmpeg') {
      ffmpegInstalled = true;
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  const report = await runInstall({
    repoRoot,
    homeDir: state.homeDir,
    env: { ...state.env, [PEXELS_ENV_FIELD]: processCanary },
    platform: 'darwin',
    appDir,
    runner,
    approveOccupied: true,
    approveHomebrewFfmpeg: true,
    npmCli: mockNpmCli,
    fetchImpl: async () => ({ ok: true, status: 200 }),
  });
  assert.equal(report.status, 'installed');
  assert.equal(report.custom_skill_links, SKILL_NAMES.length * 2);
  assert.equal(report.official_doctor_selected_local_render_ready, true);
  assert.equal(calls.some(({ args }) => args.includes('skills') && args.includes('update')), true);
  assert.equal(calls.some(({ args }) => args.includes('skills') && args.includes('check')), true);
  assert.equal(calls.some(({ args }) => args.includes('browser') && args.includes('ensure')), true);
  assert.equal(calls.some(({ args }) => args.includes('doctor') && args.includes('--json')), true);
  assert.equal(calls.some(({ command, args }) => command === 'brew' && args[0] === '--version'), true);
  assert.equal(
    calls.some(({ command, args }) => command === 'brew'
      && args[0] === 'install'
      && args[1] === 'ffmpeg'),
    true,
  );
  const npmCi = calls.find(({ args }) => args.includes('ci'))?.args;
  assert.ok(npmCi);
  assert.equal(npmCi.includes('--ignore-scripts'), true);
  assert.equal(npmCi.includes('install'), false);
});

test('runInstall rejects both duplicate doctor fact orders before installing Skill links', async (t) => {
  const state = await isolated(t);
  for (const okFirst of [true, false]) {
    await t.test(okFirst ? 'ok-before-fail' : 'fail-before-ok', async () => {
      const scope = path.join(state.base, okFirst ? 'install-ok-first' : 'install-fail-first');
      const repoRoot = await createSkillFixture(scope);
      const homeDir = path.join(scope, 'home');
      const env = { ...state.env, HOME: homeDir };
      const appDir = applicationDataDir({ platform: 'darwin', homeDir, env });
      await mkdir(homeDir, { recursive: true });
      const mockNpmCli = path.join(scope, 'mock-npm-cli.js');
      await writeFile(mockNpmCli, '// fixture only\n', 'utf8');
      const runner = async (command, args, options) => {
        assert.equal(options.env[PEXELS_ENV_FIELD], undefined);
        assert.equal(options.env[PEXELS_ENV_FIELD_LOWER], undefined);
        assert.equal(options.env[PEXELS_ENV_FIELD_MIXED], undefined);
        assert.equal(options.env.HYPERFRAMES_NO_TELEMETRY, '1');
        if (args.includes('ci')) {
          const cli = path.join(
            appDir,
            'runtime',
            'node_modules',
            'hyperframes',
            'dist',
            'cli.js',
          );
          await mkdir(path.dirname(cli), { recursive: true });
          await writeFile(cli, '// fixture only\n', 'utf8');
          await writeFile(
            path.join(appDir, 'runtime', 'node_modules', 'hyperframes', 'package.json'),
            `${JSON.stringify({ name: 'hyperframes', version: '0.7.72' })}\n`,
            'utf8',
          );
          return { code: 0, stdout: '', stderr: '' };
        }
        if (args.includes('skills') && args.includes('check')) {
          return { code: 0, stdout: JSON.stringify({ ok: true, installed: [] }), stderr: '' };
        }
        if (args.includes('doctor')) {
          return {
            code: 0,
            stdout: JSON.stringify({
              ok: false,
              checks: doctorChecksWithDuplicateFfmpeg(okFirst),
            }),
            stderr: '',
          };
        }
        return { code: 0, stdout: '', stderr: '' };
      };
      await assert.rejects(
        runInstall({
          repoRoot,
          homeDir,
          env: {
            ...env,
            [PEXELS_ENV_FIELD]: 'uppercase-canary',
            [PEXELS_ENV_FIELD_LOWER]: 'lowercase-canary',
            [PEXELS_ENV_FIELD_MIXED]: 'mixedcase-canary',
          },
          platform: 'darwin',
          appDir,
          runner,
          npmCli: mockNpmCli,
        }),
        (error) => error?.code === 'hyperframes_doctor_payload_invalid',
      );
      for (const name of SKILL_NAMES) {
        assert.equal(
          await entryExists(path.join(homeDir, '.codex', 'skills', name)),
          false,
        );
        assert.equal(
          await entryExists(path.join(homeDir, '.claude', 'skills', name)),
          false,
        );
      }
    });
  }
});

async function listPublicReleaseFiles(directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && [
      '.git',
      'node_modules',
      '.cache',
      'cache',
      'coverage',
      'renders',
      'artifacts',
    ].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listPublicReleaseFiles(absolute));
    else if (entry.isSymbolicLink()) {
      assert.fail(`public release tree contains a symbolic link: ${absolute}`);
    } else if (entry.isFile()
      && !/(?:\.log|\.tmp|\.tar|\.tar\.gz|\.zip)$/u.test(entry.name)
      && entry.name !== '.DS_Store') files.push(absolute);
  }
  return files;
}

test('entire public release tree has no private path, original-author, private-sample, or obsolete architecture markers', async () => {
  assert.equal(await entryExists(path.join(root, 'STAGING-SOURCE.txt')), false);
  assert.equal(await entryExists(path.join(root, 'SHA256SUMS.txt')), false);
  const textFiles = (await listPublicReleaseFiles()).filter(
    (file) => path.extname(file).toLowerCase() !== '.jpg',
  );
  const text = (await Promise.all(textFiles.map(
    (file) => readFile(file, 'utf8'),
  ))).join('\n').toLowerCase();
  const forbidden = [
    ['/','users','/'].join(''),
    ['/','home','/'].join(''),
    ['reach','surge'].join(''),
    ['fei','caiclub'].join(''),
    ['废','才'].join(''),
    ['script','-only'].join(''),
    ['awesome','-design','-md'].join(''),
    ['taste','-skill'].join(''),
    ['video','-shotcraft'].join(''),
  ];
  for (const marker of forbidden) assert.equal(text.includes(marker), false, marker);
});

test('Node bootstrap uses only fixed v22.23.1 archive names and built-in macOS digests', async () => {
  const installer = await readFile(path.join(root, 'Install.command'), 'utf8');
  assert.match(installer, /NODE_VERSION='22\.23\.1'/u);
  assert.match(
    installer,
    /ef28d8fab2c0e4314522d4bb1b7173270aa3937e93b92cb7de79c112ac1fa953/u,
  );
  assert.match(
    installer,
    /b8da981b8a0b1241b70249204916da76c63573ddf5814dbd2d1e41069105cb81/u,
  );
  assert.match(installer, /node-v\\?\$\{NODE_VERSION\}-darwin-\\?\$\{node_arch\}\.tar\.gz/u);
  assert.match(installer, /nodejs\.org\/download\/release\/v\\?\$\{NODE_VERSION\}/u);
  assert.doesNotMatch(installer, /latest-v22|awk .*SHASUMS|archive_name=.*SHASUMS/u);
  assert.match(installer, /node\/installs\/v\\?\$\{version\}/u);
  assert.doesNotMatch(installer, /node\/v\\?\$version|NODE_BIN="\\?\$destination/u);
  assert.match(installer, /shopt -s nocasematch/u);
  assert.match(installer, /compgen -e/u);
  assert.match(installer, /PEXELS_API_KEY\) unset/u);
  assert.match(installer, /HYPERFRAMES_NO_TELEMETRY\) unset/u);
  assert.ok(
    installer.indexOf('shopt -s nocasematch') < installer.indexOf('ROOT_DIR='),
    'Pexels environment removal must precede every installer child',
  );
  assert.match(
    installer,
    /pexels_environment_name='PEXELS_API_KEY'/u,
  );
  assert.match(installer, /export "\$pexels_environment_name=\$captured_pexels_key"/u);
});

test('Install.command exposes a Pexels key only to the dedicated config process', async (t) => {
  const state = await isolated(t);
  const mockNode = path.join(state.base, 'mock-node');
  const logFile = path.join(state.base, 'child-env.log');
  const tempDir = path.join(state.base, 'tmp');
  await mkdir(tempDir);
  await writeFile(mockNode, [
    '#!/bin/bash',
    'set -euo pipefail',
    'label=other',
    'version_output=',
    'case "${1:-}" in',
    '  -p) label=node-major; version_output=22 ;;',
    '  */scripts/install.mjs) label=install ;;',
    '  */scripts/config.mjs) label=config ;;',
    'esac',
    'printf "%s|%s|%s|%s|%s|%s\\n" "$label" "${PEXELS_API_KEY-}" "${pexels_api_key-}" "${Pexels_Api_Key-}" "${HYPERFRAMES_NO_TELEMETRY-}" "${hyperframes_no_telemetry-}" >> "$ERDUO_TEST_LOG"',
    'if [ -n "$version_output" ]; then printf "%s\\n" "$version_output"; fi',
    '',
  ].join('\n'), 'utf8');
  await chmod(mockNode, 0o755);
  const result = await execFileAsync('/bin/bash', [path.join(root, 'Install.command')], {
    env: {
      HOME: state.homeDir,
      PATH: '/usr/bin:/bin',
      TMPDIR: tempDir,
      ERDUO_NODE_BIN: mockNode,
      ERDUO_TEST_LOG: logFile,
      [PEXELS_ENV_FIELD]: 'uppercase-canary',
      [PEXELS_ENV_FIELD_LOWER]: 'lowercase-canary',
      [PEXELS_ENV_FIELD_MIXED]: 'mixedcase-canary',
      HYPERFRAMES_NO_TELEMETRY: '0',
      hyperframes_no_telemetry: 'lowercase-zero',
    },
    encoding: 'utf8',
  });
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.includes('uppercase-canary'), false);
  const rows = (await readFile(logFile, 'utf8')).trimEnd().split('\n')
    .map((line) => line.split('|'));
  assert.deepEqual(rows.map(([label]) => label), ['node-major', 'install', 'config']);
  for (const [label, upper, lower, mixed, telemetry, lowerTelemetry] of rows) {
    assert.equal(lower, '', label);
    assert.equal(mixed, '', label);
    assert.equal(telemetry, '1', label);
    assert.equal(lowerTelemetry, '', label);
    assert.equal(upper, label === 'config' ? 'uppercase-canary' : '', label);
  }
});

test('Install.command preserves Node bootstrap download and checksum failures', async (t) => {
  const state = await isolated(t);
  const cases = [
    {
      name: 'curl-exit-7',
      expectedCode: 7,
      curl: ['#!/bin/bash', 'exit 7', ''],
      shasum: null,
    },
    {
      name: 'checksum-exit-9',
      expectedCode: 9,
      curl: [
        '#!/bin/bash',
        'set -euo pipefail',
        'output=',
        'while [ "$#" -gt 0 ]; do',
        '  if [ "$1" = "--output" ]; then shift; output="$1"; fi',
        '  shift',
        'done',
        '[ -n "$output" ] || exit 64',
        ': > "$output"',
        '',
      ],
      shasum: ['#!/bin/bash', 'exit 9', ''],
    },
  ];
  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const scope = path.join(state.base, fixture.name);
      const homeDir = path.join(scope, 'home');
      const tempDir = path.join(scope, 'tmp');
      const binDir = path.join(scope, 'bin');
      await Promise.all([
        mkdir(homeDir, { recursive: true }),
        mkdir(tempDir, { recursive: true }),
        mkdir(binDir, { recursive: true }),
      ]);
      const curl = path.join(binDir, 'curl');
      await writeFile(curl, fixture.curl.join('\n'), 'utf8');
      await chmod(curl, 0o755);
      if (fixture.shasum) {
        const shasum = path.join(binDir, 'shasum');
        await writeFile(shasum, fixture.shasum.join('\n'), 'utf8');
        await chmod(shasum, 0o755);
      }
      let failure = null;
      try {
        await execFileAsync('/bin/bash', [path.join(root, 'Install.command')], {
          env: {
            HOME: homeDir,
            PATH: `${binDir}:/usr/bin:/bin`,
            TMPDIR: tempDir,
          },
          encoding: 'utf8',
        });
      } catch (error) {
        failure = error;
      }
      assert.ok(failure, fixture.name);
      assert.equal(failure.code, fixture.expectedCode, fixture.name);
      assert.deepEqual(await readdir(tempDir), [], `${fixture.name}: temporary cleanup`);
    });
  }
});

test('release tar subprocesses receive the same sanitized child environment', async (t) => {
  const state = await isolated(t);
  const fixture = path.join(state.base, 'release-source');
  const archive = path.join(state.base, 'release.tar.gz');
  await cp(root, fixture, {
    recursive: true,
    filter: (source) => !['.git', 'node_modules'].includes(path.basename(source)),
  });
  const calls = [];
  const tarRunner = async (command, args, options) => {
    assert.equal(command, 'tar');
    assert.equal(options.env[PEXELS_ENV_FIELD], undefined);
    assert.equal(options.env[PEXELS_ENV_FIELD_LOWER], undefined);
    assert.equal(options.env[PEXELS_ENV_FIELD_MIXED], undefined);
    assert.equal(options.env.HYPERFRAMES_NO_TELEMETRY, '1');
    assert.equal(options.env.hyperframes_no_telemetry, undefined);
    assert.equal(options.env.COPYFILE_DISABLE, '1');
    assert.equal(options.env.copyfile_disable, undefined);
    if (args.includes('-cf')) {
      assert.equal(args.includes('--no-xattrs'), true);
      assert.equal(args.includes('ustar'), true);
      assert.equal(args.includes('--uid'), true);
      assert.equal(args.includes('--gid'), true);
      assert.equal(args.includes('--uname'), true);
      assert.equal(args.includes('--gname'), true);
    }
    calls.push(args.includes('-cf') ? '-cf' : args[0]);
    return execFileAsync('/usr/bin/tar', args, options);
  };
  const report = await buildRelease({
    repoRoot: fixture,
    output: archive,
    env: {
      ...state.env,
      [PEXELS_ENV_FIELD]: 'uppercase-canary',
      [PEXELS_ENV_FIELD_LOWER]: 'lowercase-canary',
      [PEXELS_ENV_FIELD_MIXED]: 'mixedcase-canary',
      HYPERFRAMES_NO_TELEMETRY: '0',
      hyperframes_no_telemetry: 'lowercase-zero',
      COPYFILE_DISABLE: '0',
      copyfile_disable: 'lowercase-zero',
    },
    tarRunner,
  });
  assert.equal(report.status, 'packaged');
  assert.deepEqual(calls, ['-cf', '-xzf']);
  assert.equal(report.raw_archive.regular, 43);
  assert.equal(report.raw_archive.appledouble, 0);
});

test('raw tar verifier rejects a valid-checksum AppleDouble member hidden from list views', async (t) => {
  const state = await isolated(t);
  const packageName = `erduo-hyperframes-broll-${RELEASE_VERSION}`;
  const fixtures = [
    {
      name: 'appledouble',
      member: `${packageName}/._README.md`,
      body: Buffer.alloc(163, 0x41),
      type: '0',
      code: 'release_archive_appledouble_forbidden',
    },
    {
      name: 'macosx',
      member: `${packageName}/__MACOSX/metadata`,
      body: Buffer.from('metadata'),
      type: '0',
      code: 'release_archive_appledouble_forbidden',
    },
    {
      name: 'unknown-member',
      member: `${packageName}/unexpected.txt`,
      body: Buffer.from('unexpected'),
      type: '0',
      code: 'release_archive_members_mismatch',
    },
    {
      name: 'symlink-type',
      member: `${packageName}/README.md`,
      body: Buffer.alloc(0),
      type: '2',
      code: 'release_archive_invalid',
    },
    {
      name: 'directory-count',
      member: `${packageName}/unexpected/`,
      body: Buffer.alloc(0),
      type: '5',
      code: 'release_archive_members_mismatch',
    },
  ];
  for (const fixture of fixtures) {
    const archive = path.join(state.base, `${fixture.name}.tar.gz`);
    await writeFile(
      archive,
      canonicalGzip(createSingleMemberTar(fixture.member, fixture.body, fixture.type)),
    );
    await assert.rejects(
      verifyReleaseArchiveRaw(archive),
      (error) => error?.code === fixture.code,
      fixture.name,
    );
  }
});

test('raw archive gate rejects the complete canonicality, metadata, path, type, and integrity matrix', async (t) => {
  const state = await isolated(t);
  const fixture = path.join(state.base, 'matrix-source');
  const validArchive = path.join(state.base, 'valid.tar.gz');
  await cp(root, fixture, {
    recursive: true,
    filter: (source) => !['.git', 'node_modules'].includes(path.basename(source)),
  });
  await buildRelease({ repoRoot: fixture, output: validArchive });
  const canonical = await readFile(validArchive);
  const tar = gunzipSync(canonical);
  const packageName = `erduo-hyperframes-broll-${RELEASE_VERSION}`;
  const localUserCanary = ['junwei', '001q'].join('');
  assert.deepEqual([...canonical.subarray(0, 10)], [
    0x1f, 0x8b, 0x08, 0, 0, 0, 0, 0, 2, 255,
  ]);
  for (const record of testTarRecords(tar).records) {
    const uname = record.header.subarray(265, 297).toString('utf8').replace(/\0.*$/su, '');
    const gname = record.header.subarray(297, 329).toString('utf8').replace(/\0.*$/su, '');
    assert.equal(uname, 'root');
    assert.equal(gname, 'root');
  }

  const readme = (record) => record.member.endsWith('/README.md') && record.type === '0';
  const manifest = (record) => record.member.endsWith('/SHA256SUMS.txt');
  const writeOctal = (header, value, start, length) => {
    header.fill(0, start, start + length);
    header.write(
      `${value.toString(8).padStart(length - 1, '0')}\0`,
      start,
      length,
      'ascii',
    );
  };
  const removeRecord = (sourceTar, predicate) => {
    const record = testTarRecords(sourceTar).records.find(predicate);
    assert.ok(record);
    return Buffer.concat([
      sourceTar.subarray(0, record.offset),
      sourceTar.subarray(record.end),
    ]);
  };
  const tamperManifestBody = () => {
    const copy = Buffer.from(tar);
    const record = testTarRecords(copy).records.find(manifest);
    copy[record.bodyOffset] = copy[record.bodyOffset] === 0x30 ? 0x31 : 0x30;
    return copy;
  };
  const duplicateManifestLine = () => {
    const record = testTarRecords(tar).records.find(manifest);
    const lines = tar.subarray(record.bodyOffset, record.bodyOffset + record.size)
      .toString('utf8')
      .trimEnd()
      .split('\n');
    lines[1] = lines[0];
    return replaceTarRecordBody(tar, manifest, Buffer.from(`${lines.join('\n')}\n`));
  };

  const tarCases = [
    {
      name: 'bad-header-checksum',
      code: 'release_archive_invalid',
      make: () => {
        const copy = Buffer.from(tar);
        copy[100] ^= 1;
        return copy;
      },
    },
    {
      name: 'bad-header-size',
      code: 'release_archive_invalid',
      make: () => mutateFirstMatchingHeader(tar, readme, (header) => {
        header.write('77777777777\0', 124, 12, 'ascii');
      }),
    },
    {
      name: 'pax-malformed',
      code: 'release_archive_invalid',
      make: () => prependTarMetadata(tar, 'x', Buffer.from('not-a-pax-record')),
    },
    {
      name: 'pax-duplicate-key',
      code: 'release_archive_invalid',
      make: () => prependTarMetadata(
        tar,
        'x',
        Buffer.concat([paxRecord('path', 'first'), paxRecord('path', 'second')]),
      ),
    },
    {
      name: 'pax-nul-value',
      code: 'release_archive_invalid',
      make: () => prependTarMetadata(
        tar,
        'x',
        paxRecord('comment', 'PRIVATE\0CANARY'),
      ),
    },
    {
      name: 'pax-unknown-canary',
      code: 'release_archive_invalid',
      make: () => prependTarMetadata(
        tar,
        'x',
        paxRecord('comment', 'PRIVATE-CANARY-PAX'),
      ),
    },
    {
      name: 'pax-global-canary',
      code: 'release_archive_invalid',
      make: () => prependTarMetadata(
        tar,
        'g',
        paxRecord('comment', 'PRIVATE-CANARY-GLOBAL'),
      ),
    },
    {
      name: 'pax-schily-xattr',
      code: 'release_archive_invalid',
      make: () => prependTarMetadata(
        tar,
        'x',
        paxRecord('SCHILY.xattr.user.audit', 'PRIVATE-CANARY-XATTR'),
      ),
    },
    {
      name: 'pax-libarchive-xattr',
      code: 'release_archive_invalid',
      make: () => prependTarMetadata(
        tar,
        'x',
        paxRecord('LIBARCHIVE.xattr.user.audit', 'PRIVATE-CANARY-LIBARCHIVE'),
      ),
    },
    {
      name: 'pax-acl',
      code: 'release_archive_invalid',
      make: () => prependTarMetadata(
        tar,
        'x',
        paxRecord('SCHILY.acl.access', 'user::rwx'),
      ),
    },
    {
      name: 'gnu-longname',
      code: 'release_archive_invalid',
      make: () => prependTarMetadata(
        tar,
        'L',
        Buffer.from(`${packageName}/README.md\0`),
      ),
    },
    {
      name: 'gnu-longlink',
      code: 'release_archive_invalid',
      make: () => prependTarMetadata(tar, 'K', Buffer.from('target\0')),
    },
    {
      name: 'absolute-path',
      code: 'release_archive_invalid',
      make: () => mutateFirstMatchingHeader(tar, readme, (header) => {
        setTestTarPath(header, '/absolute.txt');
      }),
    },
    {
      name: 'traversal-path',
      code: 'release_archive_invalid',
      make: () => mutateFirstMatchingHeader(tar, readme, (header) => {
        setTestTarPath(header, `${packageName}/../escape.txt`);
      }),
    },
    {
      name: 'embedded-nul-path',
      code: 'release_archive_invalid',
      make: () => mutateFirstMatchingHeader(tar, readme, (header) => {
        header.fill(0, 0, 100);
        Buffer.from(`${packageName}/bad`).copy(header, 0);
        header[8] = 0;
        header[9] = 0x58;
        header.fill(0, 345, 500);
      }),
    },
    {
      name: 'duplicate-member',
      code: 'release_archive_invalid',
      make: () => cloneTarRecord(tar, readme),
    },
    {
      name: 'casefold-collision',
      code: 'release_archive_invalid',
      make: () => cloneTarRecord(tar, readme, (header) => {
        setTestTarPath(header, `${packageName}/readme.md`);
      }),
    },
    {
      name: 'non-nfc-path',
      code: 'release_archive_invalid',
      make: () => cloneTarRecord(tar, readme, (header) => {
        setTestTarPath(header, `${packageName}/e\u0301.txt`);
      }),
    },
    ...['1', '2', '3', '4', '6', '7'].map((type) => ({
      name: `special-type-${type}`,
      code: 'release_archive_invalid',
      make: () => mutateFirstMatchingHeader(tar, readme, (header) => {
        header[156] = type.charCodeAt(0);
      }),
    })),
    {
      name: 'directory-closure',
      code: 'release_archive_members_mismatch',
      make: () => removeRecord(
        tar,
        (record) => record.type === '5' && record.member.endsWith('/references/'),
      ),
    },
    {
      name: 'manifest-body-tamper',
      code: 'release_archive_checksum_invalid',
      make: tamperManifestBody,
    },
    {
      name: 'manifest-duplicate-line',
      code: 'release_archive_checksum_invalid',
      make: duplicateManifestLine,
    },
    {
      name: 'unknown-member',
      code: 'release_archive_members_mismatch',
      make: () => cloneTarRecord(tar, readme, (header) => {
        setTestTarPath(header, `${packageName}/unknown.txt`);
      }),
    },
    {
      name: 'owner-uname',
      code: 'release_archive_invalid',
      make: () => mutateFirstMatchingHeader(tar, () => true, (header) => {
        header.fill(0, 265, 297);
        header.write(localUserCanary, 265, 'utf8');
      }),
    },
    {
      name: 'header-padding-canary',
      code: 'release_archive_invalid',
      make: () => mutateFirstMatchingHeader(tar, () => true, (header) => {
        header.write('PRIVATE', 500, 'ascii');
      }),
    },
    {
      name: 'body-padding-canary',
      code: 'release_archive_invalid',
      make: () => {
        const copy = Buffer.from(tar);
        const record = testTarRecords(copy).records.find(
          (candidate) => candidate.type === '0' && candidate.size % 512 !== 0,
        );
        assert.ok(record);
        copy[record.bodyOffset + record.size] = 0x50;
        return copy;
      },
    },
    {
      name: 'owner-gname',
      code: 'release_archive_invalid',
      make: () => mutateFirstMatchingHeader(tar, () => true, (header) => {
        header.fill(0, 297, 329);
        header.write('staff', 297, 'utf8');
      }),
    },
    {
      name: 'owner-uid',
      code: 'release_archive_invalid',
      make: () => mutateFirstMatchingHeader(tar, () => true, (header) => {
        writeOctal(header, 501, 108, 8);
      }),
    },
    {
      name: 'owner-gid',
      code: 'release_archive_invalid',
      make: () => mutateFirstMatchingHeader(tar, () => true, (header) => {
        writeOctal(header, 20, 116, 8);
      }),
    },
    {
      name: 'noncanonical-mode',
      code: 'release_archive_invalid',
      make: () => mutateFirstMatchingHeader(tar, readme, (header) => {
        writeOctal(header, 0o600, 100, 8);
      }),
    },
    {
      name: 'noncanonical-mtime',
      code: 'release_archive_invalid',
      make: () => mutateFirstMatchingHeader(tar, readme, (header) => {
        writeOctal(header, 1, 136, 12);
      }),
    },
  ];

  const gzipCases = [
    {
      name: 'gzip-comment',
      make: () => gzipWithOptionalField(
        canonical,
        0x10,
        Buffer.from('PRIVATE-CANARY-GZIP-COMMENT\0'),
      ),
    },
    {
      name: 'gzip-filename',
      make: () => gzipWithOptionalField(canonical, 0x08, Buffer.from('private-name\0')),
    },
    {
      name: 'gzip-extra',
      make: () => gzipWithOptionalField(canonical, 0x04, Buffer.from([2, 0, 0x41, 0x42])),
    },
    {
      name: 'gzip-header-crc',
      make: () => gzipWithOptionalField(canonical, 0x02, Buffer.from([0, 0])),
    },
    {
      name: 'gzip-reserved-flags',
      make: () => {
        const copy = Buffer.from(canonical);
        copy[3] = 0xe0;
        return copy;
      },
    },
    {
      name: 'gzip-mtime',
      make: () => {
        const copy = Buffer.from(canonical);
        copy.writeUInt32LE(1, 4);
        return copy;
      },
    },
    {
      name: 'gzip-xfl',
      make: () => {
        const copy = Buffer.from(canonical);
        copy[8] = 0;
        return copy;
      },
    },
    {
      name: 'gzip-os',
      make: () => {
        const copy = Buffer.from(canonical);
        copy[9] = 19;
        return copy;
      },
    },
    {
      name: 'gzip-concatenated-member',
      make: () => Buffer.concat([canonical, canonical]),
    },
    {
      name: 'gzip-trailing-bytes',
      make: () => Buffer.concat([canonical, Buffer.from('TRAILING')]),
    },
    {
      name: 'gzip-footer-crc',
      make: () => {
        const copy = Buffer.from(canonical);
        copy[copy.length - 8] ^= 1;
        return copy;
      },
    },
    {
      name: 'gzip-footer-isize',
      make: () => {
        const copy = Buffer.from(canonical);
        copy[copy.length - 4] ^= 1;
        return copy;
      },
    },
  ];

  for (const fixtureCase of tarCases) {
    await t.test(fixtureCase.name, async () => {
      const archive = path.join(state.base, `matrix-${fixtureCase.name}.tar.gz`);
      await writeFile(archive, canonicalGzip(fixtureCase.make()));
      await assert.rejects(
        verifyReleaseArchiveRaw(archive),
        (error) => error?.code === fixtureCase.code,
      );
    });
  }
  for (const fixtureCase of gzipCases) {
    await t.test(fixtureCase.name, async () => {
      const archive = path.join(state.base, `matrix-${fixtureCase.name}.tar.gz`);
      await writeFile(archive, fixtureCase.make());
      await assert.rejects(
        verifyReleaseArchiveRaw(archive),
        (error) => error?.code === 'release_archive_invalid',
      );
    });
  }
});

test('archive size gates reject sparse compressed input before read/allocation and gzip bombs', async (t) => {
  const state = await isolated(t);
  const sparse = path.join(state.base, 'oversized-sparse.tar.gz');
  const sparseHandle = await open(sparse, 'w');
  await sparseHandle.truncate(17 * 1024 * 1024);
  await sparseHandle.close();
  let opens = 0;
  let reads = 0;
  let allocations = 0;
  await assert.rejects(
    verifyReleaseArchiveRaw(sparse, {
      openImpl: async (...args) => {
        opens += 1;
        const handle = await open(...args);
        return {
          stat: (...statArgs) => handle.stat(...statArgs),
          read: (...readArgs) => {
            reads += 1;
            return handle.read(...readArgs);
          },
          close: () => handle.close(),
        };
      },
      allocate: (size) => {
        allocations += 1;
        return Buffer.allocUnsafe(size);
      },
    }),
    (error) => error?.code === 'release_archive_invalid',
  );
  assert.equal(opens, 0);
  assert.equal(reads, 0);
  assert.equal(allocations, 0);

  const bomb = path.join(state.base, 'decompression-bomb.tar.gz');
  const source = Readable.from((function* chunks() {
    const chunk = Buffer.alloc(1024 * 1024);
    for (let index = 0; index < 129; index += 1) yield chunk;
  }()));
  const compressedChunks = [];
  for await (const chunk of source.pipe(createGzip({ level: 9 }))) {
    compressedChunks.push(chunk);
  }
  const compressedBomb = Buffer.concat(compressedChunks);
  compressedBomb[9] = 255;
  await writeFile(bomb, compressedBomb);
  assert.ok(compressedBomb.length < 16 * 1024 * 1024);
  await assert.rejects(
    verifyReleaseArchiveRaw(bomb),
    (error) => error?.code === 'release_archive_invalid',
  );
});

test('runtime lock pins the complete HyperFrames graph with integrity and reviewed scripts', async () => {
  const publicPackage = JSON.parse(await readFile(path.join(root, 'package.json')));
  const packageJson = JSON.parse(await readFile(path.join(root, 'runtime', 'package.json')));
  const lock = JSON.parse(await readFile(path.join(root, 'runtime', 'package-lock.json')));
  assert.doesNotThrow(() => validateRuntimeLock(packageJson, lock));
  assert.equal(RELEASE_VERSION, '0.1.0-rc.2');
  assert.equal(publicPackage.version, RELEASE_VERSION);
  assert.equal(packageJson.version, RELEASE_VERSION);
  assert.equal(lock.version, RELEASE_VERSION);
  assert.equal(lock.packages[''].version, RELEASE_VERSION);
  assert.equal(packageJson.dependencies.hyperframes, '0.7.72');
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.packages[''].dependencies.hyperframes, '0.7.72');
  assert.equal(lock.packages['node_modules/hyperframes'].version, '0.7.72');
  assert.equal(typeof lock.packages['node_modules/hyperframes'].integrity, 'string');
  const registryWithoutIntegrity = Object.entries(lock.packages)
    .filter(([name, value]) => name && value.resolved?.startsWith('https://registry.npmjs.org/')
      && typeof value.integrity !== 'string');
  assert.deepEqual(registryWithoutIntegrity, []);
  const lifecycle = Object.entries(lock.packages)
    .filter(([, value]) => value.hasInstallScript === true)
    .map(([name, value]) => `${name}@${value.version}`)
    .toSorted();
  assert.deepEqual(lifecycle, [
    'node_modules/@google/genai@1.52.0',
    'node_modules/esbuild@0.25.12',
    'node_modules/onnxruntime-node@1.23.2',
    'node_modules/protobufjs@7.6.5',
    'node_modules/sharp@0.34.5',
  ]);
});

test('runtime lock validation fails closed for root and package-source tampering', async () => {
  const originalPackage = JSON.parse(
    await readFile(path.join(root, 'runtime', 'package.json'), 'utf8'),
  );
  const originalLock = JSON.parse(
    await readFile(path.join(root, 'runtime', 'package-lock.json'), 'utf8'),
  );
  const packageName = 'node_modules/hyperframes';
  const cases = [
    {
      name: 'extra-package-root-dependency',
      mutate(packageJson) {
        packageJson.dependencies.extra = '1.0.0';
      },
    },
    {
      name: 'root-dev-dependency',
      mutate(packageJson) {
        packageJson.devDependencies = { extra: '1.0.0' };
      },
    },
    {
      name: 'extra-lock-root-dependency',
      mutate(_packageJson, lock) {
        lock.packages[''].dependencies.extra = '1.0.0';
      },
    },
    {
      name: 'legacy-lock-dependency-map',
      mutate(_packageJson, lock) {
        lock.dependencies = { hyperframes: { version: '0.7.72' } };
      },
    },
    {
      name: 'git-source',
      mutate(_packageJson, lock) {
        lock.packages[packageName].resolved = 'git+https://example.invalid/package.git';
      },
    },
    {
      name: 'file-source',
      mutate(_packageJson, lock) {
        lock.packages[packageName].resolved = 'file:../outside';
      },
    },
    {
      name: 'link-package',
      mutate(_packageJson, lock) {
        lock.packages[packageName].link = true;
      },
    },
    {
      name: 'http-registry',
      mutate(_packageJson, lock) {
        lock.packages[packageName].resolved =
          'http://registry.npmjs.org/hyperframes/-/hyperframes-0.7.72.tgz';
      },
    },
    {
      name: 'different-https-host',
      mutate(_packageJson, lock) {
        lock.packages[packageName].resolved =
          'https://example.invalid/hyperframes-0.7.72.tgz';
      },
    },
    {
      name: 'missing-resolved',
      mutate(_packageJson, lock) {
        delete lock.packages[packageName].resolved;
      },
    },
    {
      name: 'missing-integrity',
      mutate(_packageJson, lock) {
        delete lock.packages[packageName].integrity;
      },
    },
    {
      name: 'invalid-integrity',
      mutate(_packageJson, lock) {
        lock.packages[packageName].integrity = 'sha1-not-allowed';
      },
    },
    {
      name: 'truncated-sha512-integrity',
      mutate(_packageJson, lock) {
        lock.packages[packageName].integrity = 'sha512-AAAA';
      },
    },
    {
      name: 'unsafe-lock-package-path',
      mutate(_packageJson, lock) {
        lock.packages['../outside'] = structuredClone(lock.packages[packageName]);
      },
    },
    {
      name: 'array-packages-map',
      mutate(_packageJson, lock) {
        lock.packages = [];
      },
    },
  ];
  for (const fixture of cases) {
    const packageJson = structuredClone(originalPackage);
    const lock = structuredClone(originalLock);
    fixture.mutate(packageJson, lock);
    assert.throws(
      () => validateRuntimeLock(packageJson, lock),
      (error) => error?.code === 'runtime_lock_invalid',
      fixture.name,
    );
  }
});

test('release packager accepts only the explicit tree and rejects media, SRT, env, secret, and unknown files', async (t) => {
  const state = await isolated(t);
  const fixture = path.join(state.base, 'release-source');
  await cp(root, fixture, {
    recursive: true,
    filter: (source) => !['.git', 'node_modules'].includes(path.basename(source)),
  });
  const archive = path.join(state.base, 'release.tar.gz');
  const report = await buildRelease({ repoRoot: fixture, output: archive });
  assert.equal(report.status, 'packaged');
  assert.equal(await entryExists(archive), true);
  assert.deepEqual(report.raw_archive, {
    regular: 43,
    directories: 21,
    metadata: report.raw_archive.metadata,
    appledouble: 0,
    symlinks: 0,
    special: 0,
    checksum_entries: 42,
  });
  const reproducibleArchive = path.join(state.base, 'release-reproducible.tar.gz');
  await buildRelease({ repoRoot: fixture, output: reproducibleArchive });
  assert.deepEqual(
    await readFile(reproducibleArchive),
    await readFile(archive),
    'canonical tar/gzip output must be byte-for-byte reproducible',
  );

  const extras = ['extra.jpg', 'captions.srt', '.env', 'secret.txt', 'unknown.bin'];
  for (const [index, name] of extras.entries()) {
    const file = path.join(fixture, name);
    await writeFile(file, 'not public\n', 'utf8');
    await assert.rejects(
      buildRelease({
        repoRoot: fixture,
        output: path.join(state.base, `rejected-${index}.tar.gz`),
      }),
      (error) => error?.code === 'release_file_set_mismatch',
    );
    await rm(file);
  }

  const readme = path.join(fixture, 'README.md');
  const original = await readFile(readme, 'utf8');
  const pexelsField = ['PEXELS', 'API', 'KEY'].join('_');
  const genericField = ['api', 'key'].join('_');
  const tokenField = ['to', 'ken'].join('');
  const secretValue = ['C'.repeat(16), '7'.repeat(16)].join('');
  const credentialCases = [
    `"${pexelsField}": "${secretValue}"`,
    `'${pexelsField}': '${secretValue}'`,
    `${pexelsField}: ${secretValue}`,
    `${pexelsField}: "${secretValue}"`,
    `${pexelsField}=${secretValue}`,
    `${pexelsField}='${secretValue}'`,
    `${genericField}: ${secretValue}`,
    `"${tokenField}": ${secretValue}`,
  ];
  for (const [index, credentialLike] of credentialCases.entries()) {
    await writeFile(readme, `${original}\n${credentialLike}\n`, 'utf8');
    await assert.rejects(
      buildRelease({
        repoRoot: fixture,
        output: path.join(state.base, `rejected-credential-${index}.tar.gz`),
      }),
      (error) => error?.code === 'release_sensitive_content_forbidden',
      credentialLike.slice(0, 32),
    );
  }
  await writeFile(readme, original, 'utf8');
  const yamlFile = path.join(
    fixture,
    'erduo-hyperframes-broll',
    'agents',
    'openai.yaml',
  );
  const yamlOriginal = await readFile(yamlFile, 'utf8');
  const namedSecretFields = [
    pexelsField.toLowerCase(),
    ['OpenAi', 'Api', 'Key'].join('_'),
    ['github', 'token'].join('_'),
    ['Aws', 'Secret', 'Access', 'Key'].join('_'),
  ];
  const yamlCredentialCases = namedSecretFields.flatMap((field) => [
    `${field}: ${secretValue}`,
    `${field}: "${secretValue}"`,
    `${field}=${secretValue}`,
    `${field}='${secretValue}'`,
  ]);
  yamlCredentialCases.push(`${genericField}: "${secretValue}"`);
  yamlCredentialCases.push(`${tokenField}: '${secretValue}'`);
  for (const [index, credentialLike] of yamlCredentialCases.entries()) {
    await writeFile(
      yamlFile,
      `${yamlOriginal}\ncredential_fixture:\n  ${credentialLike}\n`,
      'utf8',
    );
    await assert.rejects(
      buildRelease({
        repoRoot: fixture,
        output: path.join(state.base, `rejected-yaml-credential-${index}.tar.gz`),
      }),
      (error) => error?.code === 'release_sensitive_content_forbidden',
      credentialLike.slice(0, 32),
    );
  }
});

test('private configuration root rejects a symbolic link', async (t) => {
  const state = await isolated(t);
  const appDir = applicationDataDir({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
  });
  const outside = path.join(state.base, 'outside');
  await mkdir(path.dirname(appDir), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(
    path.join(outside, 'config.json'),
    `${JSON.stringify({ [PEXELS_ENV_FIELD.toLowerCase()]: 'symlink-read-canary' })}\n`,
    'utf8',
  );
  await symlink(outside, appDir, 'dir');
  await assert.rejects(
    atomicWriteJson(path.join(appDir, 'config.json'), { secret: 'fixture' }),
    (error) => error?.code === 'unsafe_directory_path',
  );
  let fetched = false;
  await assert.rejects(
    pexelsStatus({
      platform: 'darwin',
      homeDir: state.homeDir,
      env: state.env,
      validate: true,
      fetchImpl: async () => {
        fetched = true;
        return { ok: true, status: 200 };
      },
    }),
    (error) => error?.code === 'unsafe_directory_path',
  );
  assert.equal(fetched, false);
  assert.equal(await entryExists(path.join(outside, 'config.json')), true);
});

test('private directory creation rejects an intermediate symbolic-link component', async (t) => {
  const state = await isolated(t);
  const library = path.join(state.homeDir, 'Library');
  const support = path.join(library, 'Application Support');
  const outside = path.join(state.base, 'outside-support');
  const outsideAppDir = path.join(outside, 'erduo-hyperframes-broll');
  await mkdir(library);
  await mkdir(outsideAppDir, { recursive: true });
  await writeFile(
    path.join(outsideAppDir, 'config.json'),
    `${JSON.stringify({ [PEXELS_ENV_FIELD.toLowerCase()]: 'intermediate-canary' })}\n`,
    'utf8',
  );
  await symlink(outside, support, 'dir');
  let fetched = false;
  await assert.rejects(
    savePexelsKey(['fixture', 'key', 'value'].join('-'), {
      platform: 'darwin',
      homeDir: state.homeDir,
      env: state.env,
      fetchImpl: async () => {
        fetched = true;
        return { ok: true, status: 200 };
      },
    }),
    (error) => error?.code === 'unsafe_directory_path',
  );
  assert.equal(fetched, false);
  await assert.rejects(
    pexelsStatus({
      platform: 'darwin',
      homeDir: state.homeDir,
      env: state.env,
      validate: true,
      fetchImpl: async () => {
        fetched = true;
        return { ok: true, status: 200 };
      },
    }),
    (error) => error?.code === 'unsafe_directory_path',
  );
  assert.equal(fetched, false);
  assert.equal(await entryExists(path.join(outsideAppDir, 'config.json')), true);
});

test('public release source contains the parent plus seven prompt stage Skills', async () => {
  assert.equal(RELEASE_FILES.length, 42);
  const actualReleaseFiles = (await listPublicReleaseFiles())
    .map((file) => path.relative(root, file))
    .toSorted();
  assert.deepEqual(
    actualReleaseFiles,
    [...RELEASE_FILES, ...REPOSITORY_ONLY_FILES].toSorted(),
  );
  assert.equal(SKILL_NAMES.length, 8);
  const skillRoot = path.join(root, 'erduo-hyperframes-broll');
  const stageRoot = path.join(skillRoot, 'stages');
  const expectedStages = SKILL_NAMES.filter((name) => name !== 'erduo-hyperframes-broll')
    .toSorted();
  const stageEntries = await readdir(stageRoot, { withFileTypes: true });
  assert.equal(stageEntries.every((entry) => entry.isDirectory()), true);
  assert.deepEqual(stageEntries.map((entry) => entry.name).toSorted(), expectedStages);
  for (const stage of expectedStages) {
    const stageDirectory = path.join(stageRoot, stage);
    const files = (await listPublicReleaseFiles(stageDirectory))
      .map((file) => path.relative(stageDirectory, file))
      .toSorted();
    assert.deepEqual(files, ['SKILL.md', 'agents/openai.yaml'], stage);
  }
  const promptSurface = (await listPublicReleaseFiles(skillRoot))
    .map((file) => path.relative(skillRoot, file))
    .toSorted();
  assert.equal(promptSurface.length, 21);
  assert.equal(
    promptSurface.every((file) => /\.(?:md|yaml)$/u.test(file)),
    true,
  );
  for (const name of SKILL_NAMES) {
    const file = name === 'erduo-hyperframes-broll'
      ? path.join(skillRoot, 'SKILL.md')
      : path.join(stageRoot, name, 'SKILL.md');
    const contents = await readFile(file, 'utf8');
    assert.match(contents, /^---\n/u);
    assert.match(contents, new RegExp(`^name:\\s*${name}\\s*$`, 'mu'));
  }
});
