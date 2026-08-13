import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readlink,
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
  APP_NAME,
  AUTO_HYBRID_SKILL_NAMES,
  HYPERFRAMES_SKILLS_COMMIT,
  HYPERFRAMES_SKILL_NAMES,
  HYPERFRAMES_VERSION,
  INSTALL_SKILL_NAMES,
  LEGACY_APP_NAME,
  LEGACY_SKILL_NAMES,
  RELEASE_VERSION,
  REMOTION_SKILL_NAMES,
  SKILL_NAMES,
  SKILLS_CLI_VERSION,
  V3_SKILL_NAMES,
  V4_SKILL_NAMES,
  applicationDataDir,
  atomicWriteJson,
  normalizeOfficialDoctor,
  officialSkillBundleRoot,
  runFile,
  sanitizedChildEnv,
  validateInstallManifest,
} from './lib.mjs';
import { collectDoctor } from './doctor.mjs';
import { pexelsStatus, savePexelsKey } from './config.mjs';
import {
  installSkillLinks,
  isSupportedNodeVersion,
  npmCliPath,
  preparePinnedOfficialSkills,
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
import { validateRecipeDirectory } from '../erduo-broll-loop-engineering/scripts/validate-shot-recipes.mjs';
import { queryCraft } from '../erduo-broll-loop-engineering/scripts/query-craft.mjs';
import { validateCraftCatalog } from '../erduo-broll-loop-engineering/scripts/craft-catalog.mjs';
import { planRuntime } from '../erduo-broll-loop-engineering/scripts/plan-runtime.mjs';
import { validateRuntimePlan } from '../erduo-broll-loop-engineering/scripts/validate-runtime-plan.mjs';
import { validateSchemaValue } from '../erduo-broll-loop-engineering/scripts/runtime-schema-validator.mjs';
import { validateFrozenBlocks } from '../erduo-broll-loop-engineering/scripts/validate-frozen-blocks.mjs';
import {
  runSafeSpawn,
  sanitizedEnvironment as sanitizedSkillEnvironment,
} from '../erduo-broll-loop-engineering/scripts/safe-spawn.mjs';
import { detectRuntime } from '../erduo-broll-loop-engineering/scripts/detect-runtime.mjs';
import {
  validateHtmlInCanvasFeature,
  validateFontClosure,
  validateRemotionVersionPolicy,
  walkProject as walkRemotionProject,
} from '../erduo-broll-loop-engineering/scripts/remotion-verify.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE_PACKAGE_MODE = existsSync(path.join(root, 'SHA256SUMS.txt'));
const runtimeReferenceRoot = path.join(
  root,
  'erduo-broll-loop-engineering',
  'references',
  'runtime',
);
const shotcraftRoot = path.join(
  root,
  'erduo-broll-loop-engineering',
  'references',
  'shotcraft',
);
const shotcraftQuery = path.join(
  root,
  'erduo-broll-loop-engineering',
  'scripts',
  'query-shotcraft.mjs',
);
const craftRoot = path.join(root, 'erduo-broll-loop-engineering', 'references', 'craft');
const craftQuery = path.join(root, 'erduo-broll-loop-engineering', 'scripts', 'query-craft.mjs');
const safeSpawnScript = path.join(
  root,
  'erduo-broll-loop-engineering',
  'scripts',
  'safe-spawn.mjs',
);
const runtimeDetectorScript = path.join(
  root,
  'erduo-broll-loop-engineering',
  'scripts',
  'detect-runtime.mjs',
);
const shotcraftUpstream = Object.freeze({
  repository: 'https://github.com/Vincentwei1021/video-shotcraft',
  commit: '41ee360d82f4c491ba9d88a24a4add7d8ff1cf8b',
  libraryRevision: 'bdd94be16d60fa8f',
  license: 'Apache-2.0',
});
const PEXELS_ENV_FIELD = ['PEXELS', 'API', 'KEY'].join('_');
const PEXELS_ENV_FIELD_LOWER = PEXELS_ENV_FIELD.toLowerCase();
const PEXELS_ENV_FIELD_MIXED = ['Pexels', 'Api', 'Key'].join('_');
const execFileAsync = promisify(execFile);

async function writeSharedDirectorArtifacts(directory, endMs = 3000) {
  const narrativeEnvelopeFile = path.join(directory, 'narrative-envelope.json');
  const visualSystemFile = path.join(directory, 'visual-system.json');
  await writeFile(narrativeEnvelopeFile, `${JSON.stringify({
    schemaVersion: '1.0.0', filmId: 'fixture', window: { startMs: 0, endMs },
    premise: 'Fixture premise.', audienceJourney: ['understand'],
    chapters: [{ chapterId: 'C01', window: { startMs: 0, endMs }, purpose: 'Cover fixture.' }], terms: [],
  })}\n`);
  await writeFile(visualSystemFile, `${JSON.stringify({
    schemaVersion: '1.0.0', conceptAngle: 'Fixture angle', visualWorld: 'Fixture world',
    paletteRoles: [{ role: 'field', value: '#ffffff', use: 'field' }, { role: 'focus', value: '#000000', use: 'focus' }],
    typographyRoles: [{ role: 'display', family: 'Fixture Sans', weight: '700', use: 'focus', sourceLocator: 'fonts/fixture.woff2' }],
    materials: ['paper'], depthPlan: { background: 'field', midground: 'structure', foreground: 'focus' },
    compositionFamilies: ['data-diagram-evidence', 'full-bleed-material', 'sparse-hold-chapter-outro'],
    motifSemantics: [], rhythmCurve: [{ startMs: 0, endMs, character: 'resolve' }],
    prohibitedLazyDefaults: ['generic card grid'], safeAreaPolicy: 'Use task safe area.',
  })}\n`);
  return { narrativeEnvelopeFile, visualSystemFile };
}

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
  const skillRoot = path.join(repoRoot, 'erduo-broll-loop-engineering');
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
    const directory = name === 'erduo-broll-loop-engineering'
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

async function writeMockPinnedRuntime(appDir) {
  const runtimeModules = path.join(appDir, 'runtime', 'node_modules');
  const hyperframesRoot = path.join(runtimeModules, 'hyperframes');
  const skillsRoot = path.join(runtimeModules, 'skills');
  await mkdir(path.join(hyperframesRoot, 'dist'), { recursive: true });
  await mkdir(path.join(skillsRoot, 'dist'), { recursive: true });
  await writeFile(path.join(hyperframesRoot, 'dist', 'cli.js'), '// fixture only\n', 'utf8');
  await writeFile(path.join(skillsRoot, 'dist', 'cli.mjs'), '// fixture only\n', 'utf8');
  await writeFile(
    path.join(hyperframesRoot, 'package.json'),
    `${JSON.stringify({ name: 'hyperframes', version: HYPERFRAMES_VERSION })}\n`,
    'utf8',
  );
  await writeFile(
    path.join(skillsRoot, 'package.json'),
    `${JSON.stringify({ name: 'skills', version: SKILLS_CLI_VERSION })}\n`,
    'utf8',
  );
}

async function createOfficialSourceFixture(appDir) {
  const sources = [];
  for (const name of HYPERFRAMES_SKILL_NAMES) {
    const source = path.join(
      appDir,
      'official-skills',
      HYPERFRAMES_SKILLS_COMMIT,
      'skills',
      name,
    );
    await mkdir(source, { recursive: true });
    await writeFile(
      path.join(source, 'SKILL.md'),
      `---\nname: ${name}\ndescription: Isolated official fixture.\n---\n`,
    );
    sources.push({ name, source });
  }
  return sources;
}

async function mockPinnedOfficialCommand(command, args, options) {
  if (command === 'git' && args[0] === 'init') {
    const source = args.at(-1);
    await mkdir(source, { recursive: true });
    await writeFile(
      path.join(source, 'skills-manifest.json'),
      `${JSON.stringify({ source: 'fixture', skills: {} })}\n`,
      'utf8',
    );
    return { code: 0, stdout: '', stderr: '' };
  }
  if (command === 'git' && args.includes('rev-parse')) {
    return { code: 0, stdout: `${HYPERFRAMES_SKILLS_COMMIT}\n`, stderr: '' };
  }
  if (args[1] === 'add' && args.includes('--agent') && args.includes('universal')) {
    const store = path.join(options.env.HOME, '.agents', 'skills');
    for (const name of HYPERFRAMES_SKILL_NAMES) {
      const skill = path.join(store, name);
      await mkdir(skill, { recursive: true });
      await writeFile(path.join(skill, 'SKILL.md'), `---\nname: ${name}\ndescription: fixture\n---\n`, 'utf8');
    }
    return { code: 0, stdout: '', stderr: '' };
  }
  return null;
}

function expectedArchiveDirectoryCount() {
  const directories = new Set(['.']);
  for (const file of RELEASE_FILES) {
    let directory = path.posix.dirname(file);
    while (directory !== '.') {
      directories.add(directory);
      directory = path.posix.dirname(directory);
    }
  }
  return directories.size;
}

async function manifestFor(records, repoRoot, schemaVersion = 5) {
  return {
    schema_version: schemaVersion,
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

async function createLegacyV3Installation({ repoRoot, appDir, homeDir }) {
  const canonicalRepoRoot = await realpath(repoRoot);
  const records = [];
  for (const { host, root: hostRoot } of [
    { host: 'codex', root: path.join(homeDir, '.codex', 'skills') },
    { host: 'claude-code', root: path.join(homeDir, '.claude', 'skills') },
  ]) {
    await mkdir(hostRoot, { recursive: true });
    for (const name of [...HYPERFRAMES_SKILL_NAMES, ...V3_SKILL_NAMES]) {
      const source = HYPERFRAMES_SKILL_NAMES.includes(name)
        ? path.join(appDir, 'official-skills', HYPERFRAMES_SKILLS_COMMIT, 'skills', name)
        : (name === LEGACY_APP_NAME
          ? path.join(canonicalRepoRoot, LEGACY_APP_NAME)
          : path.join(canonicalRepoRoot, LEGACY_APP_NAME, 'stages', name));
      const target = path.join(hostRoot, name);
      await symlink(source, target, 'dir');
      let backup = null;
      if (host === 'codex' && name === LEGACY_APP_NAME) {
        backup = path.join(appDir, 'backups', 'legacy-v3', host, name);
        await mkdir(backup, { recursive: true });
        await writeFile(path.join(backup, 'preserved.txt'), 'pre-rename parent Skill\n');
      }
      records.push({ host, name, source, target, backup, action: 'linked' });
    }
  }
  return {
    schema_version: 3,
    product_version: '0.3.0',
    installed_at: 'fixture',
    repo_root: canonicalRepoRoot,
    records,
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
  const pinnedUpdate = normalizeOfficialDoctor({
    ...payload,
    checks: payload.checks.map((fact) => fact.name === 'Version'
      ? { ...fact, ok: false }
      : fact),
    _meta: {
      version: HYPERFRAMES_VERSION,
      latestVersion: '0.7.104',
      updateAvailable: true,
    },
  });
  assert.equal(pinnedUpdate.selected_local_render_ready, true);
  assert.equal(pinnedUpdate.top_level_ok, false);
  assert.equal(pinnedUpdate.installed_version, HYPERFRAMES_VERSION);
  assert.equal(pinnedUpdate.update_available, true);
  const unprovedVersion = normalizeOfficialDoctor({
    ...payload,
    checks: payload.checks.map((fact) => fact.name === 'Version'
      ? { ...fact, ok: false }
      : fact),
  });
  assert.equal(unprovedVersion.selected_local_render_ready, false);
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

test('bundled safe-spawn is a no-shell fallback when the host cannot inject an environment map', async () => {
  const parent = {
    PATH: process.env.PATH,
    [PEXELS_ENV_FIELD]: 'uppercase-canary',
    [PEXELS_ENV_FIELD_LOWER]: 'lowercase-canary',
    [PEXELS_ENV_FIELD_MIXED]: 'mixedcase-canary',
    HYPERFRAMES_NO_TELEMETRY: '0',
    hyperframes_no_telemetry: 'lowercase-zero',
  };
  const child = sanitizedSkillEnvironment(parent);
  assert.equal(child[PEXELS_ENV_FIELD], undefined);
  assert.equal(child[PEXELS_ENV_FIELD_LOWER], undefined);
  assert.equal(child[PEXELS_ENV_FIELD_MIXED], undefined);
  assert.equal(child.HYPERFRAMES_NO_TELEMETRY, '1');
  assert.equal(child.hyperframes_no_telemetry, undefined);
  assert.throws(
    () => sanitizedSkillEnvironment({ PATH: 'one', Path: 'two' }),
    /case-insensitive environment collision/u,
  );

  let spawnCall;
  const status = runSafeSpawn(['--', '/mock/tool', '--flag'], {
    env: parent,
    spawn: (executable, args, options) => {
      spawnCall = { executable, args, options };
      return { status: 7 };
    },
  });
  assert.equal(status, 7);
  assert.equal(spawnCall.executable, '/mock/tool');
  assert.deepEqual(spawnCall.args, ['--flag']);
  assert.equal(spawnCall.options.shell, false);
  assert.equal(spawnCall.options.stdio, 'inherit');
  assert.equal(spawnCall.options.env[PEXELS_ENV_FIELD], undefined);
  assert.equal(spawnCall.options.env.HYPERFRAMES_NO_TELEMETRY, '1');

  const actual = await execFileAsync(process.execPath, [
    safeSpawnScript,
    '--',
    process.execPath,
    '-e',
    'process.stdout.write(JSON.stringify({pexels:Object.keys(process.env).some((key)=>key.toLowerCase()==="pexels_api_key"),telemetry:process.env.HYPERFRAMES_NO_TELEMETRY}))',
  ], { env: parent, encoding: 'utf8' });
  assert.deepEqual(JSON.parse(actual.stdout), { pexels: false, telemetry: '1' });

  const aliasedScript = safeSpawnScript.replace(/^\/private\/tmp\//u, '/tmp/');
  const throughPathAlias = await execFileAsync(process.execPath, [
    aliasedScript,
    '--',
    process.execPath,
    '-e',
    'process.stdout.write("path-alias-executed")',
  ], { env: parent, encoding: 'utf8' });
  assert.equal(throughPathAlias.stdout, 'path-alias-executed');
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

test('public runtime claims expose two independent backends without globally bundling Remotion', async () => {
  const publicPackage = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const runtimePackage = JSON.parse(
    await readFile(path.join(root, 'runtime', 'package.json'), 'utf8'),
  );
  const installedNames = [
    ...Object.keys(publicPackage.dependencies ?? {}),
    ...Object.keys(publicPackage.devDependencies ?? {}),
    ...Object.keys(runtimePackage.dependencies ?? {}),
    ...Object.keys(runtimePackage.devDependencies ?? {}),
  ];
  assert.equal(installedNames.some((name) => /remotion/iu.test(name)), false);

  const readme = await readFile(path.join(root, 'README.md'), 'utf8');
  const support = await readFile(path.join(root, 'SUPPORT-MATRIX.md'), 'utf8');
  const checklist = await readFile(path.join(root, 'RELEASE-CHECKLIST.md'), 'utf8');
  assert.match(readme, /默认 `auto`/u);
  assert.match(readme, /Remotion Build → Integrate → Render/u);
  assert.match(readme, /不会把 Remotion 加入共享 runtime 或全局安装/u);
  assert.match(readme, /现有项目按真实特征判断/u);
  assert.match(readme, /hybrid[^。\n]*冻结区块媒体/u);
  assert.match(readme, /152 张卡片不等于 152 个已经渲染验证的 HyperFrames 组件/u);
  assert.match(support, /Remotion runtime \| project-local supported workflow/u);
  assert.match(support, /不全局安装 Remotion/u);
  assert.match(checklist, /Remotion/u);

  for (const [name, text] of [['README.md', readme], ['SUPPORT-MATRIX.md', support]]) {
    assert.doesNotMatch(text, /(?:已完成|支持)(?:任意|全部|所有)[^。\n]*(?:Remotion|双端)[^。\n]*(?:转换|渲染)/u, name);
    assert.doesNotMatch(text, /(?:Remotion|双端)[^。\n]*(?:完全一致|全自动转换已完成|生产可用已验证)/u, name);
  }
});

test('runtime router chooses explicit/default routes and stops on mixed project evidence', async (t) => {
  const state = await isolated(t);
  const selectionSchema = JSON.parse(await readFile(
    path.join(runtimeReferenceRoot, 'runtime-selection.schema.json'),
    'utf8',
  ));
  const blank = path.join(state.base, 'blank');
  await mkdir(blank);
  const defaultRoute = await detectRuntime({ projectRoot: blank, probeCli: false, env: state.env });
  assert.deepEqual(validateSchemaValue(defaultRoute, selectionSchema, selectionSchema), []);
  assert.equal(defaultRoute.status, 'selected');
  assert.equal(defaultRoute.schemaVersion, '2.0.0');
  assert.equal(defaultRoute.selectedRuntime, 'auto');
  assert.equal(defaultRoute.selectionSource, 'default');
  assert.equal(defaultRoute.projectKind, 'new');
  assert.equal(defaultRoute.readiness, 'planning-required');
  assert.equal(defaultRoute.planningRequired, true);

  const explicitRoute = await detectRuntime({
    projectRoot: blank,
    explicitRuntime: 'remotion',
    probeCli: false,
    env: state.env,
  });
  assert.deepEqual(validateSchemaValue(explicitRoute, selectionSchema, selectionSchema), []);
  assert.equal(explicitRoute.selectedRuntime, 'remotion');
  assert.equal(explicitRoute.selectionSource, 'explicit');
  assert.equal(explicitRoute.readiness, 'action-required');

  const mixed = path.join(state.base, 'mixed');
  await mkdir(mixed);
  await writeFile(path.join(mixed, 'package.json'), `${JSON.stringify({
    dependencies: { remotion: '4.0.1', '@remotion/cli': '4.0.1', hyperframes: '0.7.104' },
  })}\n`);
  const mixedRoute = await detectRuntime({ projectRoot: mixed, probeCli: false, env: state.env });
  assert.deepEqual(validateSchemaValue(mixedRoute, selectionSchema, selectionSchema), []);
  assert.equal(mixedRoute.status, 'action-required');
  assert.equal(mixedRoute.selectedRuntime, null);
  assert.ok(mixedRoute.reasonCodes.includes('mixed-runtime-evidence'));
});

test('runtime router accepts only matching project-local Remotion packages and CLI evidence', async (t) => {
  const state = await isolated(t);
  const selectionSchema = JSON.parse(await readFile(
    path.join(runtimeReferenceRoot, 'runtime-selection.schema.json'),
    'utf8',
  ));
  const project = path.join(state.base, 'remotion-project');
  const version = '4.0.484';
  await mkdir(path.join(project, 'node_modules', 'remotion'), { recursive: true });
  await mkdir(path.join(project, 'node_modules', '@remotion', 'cli'), { recursive: true });
  await mkdir(path.join(project, 'node_modules', '.bin'), { recursive: true });
  await writeFile(path.join(project, 'package.json'), `${JSON.stringify({
    dependencies: { remotion: version, '@remotion/cli': version },
  })}\n`);
  for (const [name, directory] of [
    ['remotion', path.join(project, 'node_modules', 'remotion')],
    ['@remotion/cli', path.join(project, 'node_modules', '@remotion', 'cli')],
  ]) {
    await writeFile(path.join(directory, 'package.json'), `${JSON.stringify({ name, version })}\n`);
  }
  const cli = path.join(project, 'node_modules', '.bin', 'remotion');
  const marker = path.join(project, 'cli-executed');
  await writeFile(cli, `#!/bin/sh\nprintf '%s\\n' executed > '${marker}'\n[ "$1" = versions ] || exit 9\nprintf '%s\\n' 'All packages have the correct version.' 'On version: ${version}'\n`);
  await chmod(cli, 0o755);
  const secret = 'must-not-appear-in-router-result';
  const readOnlyResult = await detectRuntime({
    projectRoot: project,
    env: { ...state.env, [PEXELS_ENV_FIELD]: secret },
  });
  assert.equal(readOnlyResult.selectedRuntime, 'remotion');
  assert.equal(readOnlyResult.readiness, 'action-required');
  assert.equal(readOnlyResult.safety.readOnlyDetection, true);
  assert.equal(readOnlyResult.safety.localCliExecuted, false);
  assert.equal(existsSync(marker), false);
  const result = await detectRuntime({
    projectRoot: project,
    probeCli: true,
    env: { ...state.env, [PEXELS_ENV_FIELD]: secret },
  });
  assert.deepEqual(validateSchemaValue(result, selectionSchema, selectionSchema), []);
  assert.equal(result.selectedRuntime, 'remotion');
  assert.equal(result.selectionSource, 'detected');
  assert.equal(result.readiness, 'ready');
  assert.equal(result.evidence.remotion.cliEvidence.version, version);
  assert.equal(result.evidence.remotion.dependencyEvidence.exactAlignedDeclarations, true);
  assert.equal(result.safety.readOnlyDetection, false);
  assert.equal(result.safety.localCliExecuted, true);
  assert.equal(existsSync(marker), true);
  assert.equal(JSON.stringify(result).includes(secret), false);

  await writeFile(path.join(project, 'package.json'), `${JSON.stringify({
    dependencies: { remotion: `^${version}`, '@remotion/cli': version },
  })}\n`);
  const ranged = await detectRuntime({ projectRoot: project, probeCli: true, env: state.env });
  assert.deepEqual(validateSchemaValue(ranged, selectionSchema, selectionSchema), []);
  assert.equal(ranged.readiness, 'action-required');
  assert.equal(ranged.evidence.remotion.dependencyEvidence.exactAlignedDeclarations, false);
});

test('runtime router CLI keeps selected-but-not-ready Remotion actionable at exit zero', async (t) => {
  const state = await isolated(t);
  const blank = path.join(state.base, 'blank-cli');
  await mkdir(blank);
  const { stdout } = await execFileAsync(process.execPath, [
    runtimeDetectorScript,
    '--project',
    blank,
    '--runtime',
    'remotion',
    '--json',
  ], { env: state.env });
  const result = JSON.parse(stdout);
  assert.equal(result.status, 'selected');
  assert.equal(result.selectedRuntime, 'remotion');
  assert.equal(result.readiness, 'action-required');
  assert.equal(result.productionRouteAvailable, true);
  assert.deepEqual(await readdir(blank), []);
});

test('Shotcraft catalog and manifest close 152 upstream cards and 209 unique styles by hash', async () => {
  const catalogPath = path.join(shotcraftRoot, 'catalog.json');
  const manifestPath = path.join(shotcraftRoot, 'manifest.json');
  const [catalogData, manifestData] = await Promise.all([
    readFile(catalogPath),
    readFile(manifestPath),
  ]);
  const catalog = JSON.parse(catalogData);
  const manifest = JSON.parse(manifestData);
  const patternSchema = JSON.parse(await readFile(
    path.join(runtimeReferenceRoot, 'shot-pattern.schema.json'),
    'utf8',
  ));
  const adaptationNotice = /byte-identical to the pinned upstream sources/u;
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(catalog.upstream, shotcraftUpstream);
  assert.deepEqual(manifest.upstream, shotcraftUpstream);
  assert.match(catalog.adaptationNotice, adaptationNotice);
  assert.equal(catalog.adaptationNotice, manifest.adaptationNotice);
  assert.deepEqual(catalog.stats.cards, 152);
  assert.deepEqual(catalog.stats.styles, 209);
  assert.deepEqual(manifest.stats, { cards: 152, styles: 209 });
  assert.equal(catalog.cards.length, 152);
  assert.equal(manifest.cards.length, 152);
  assert.equal(patternSchema.additionalProperties, false);
  assert.equal(patternSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  const requiredCardFields = [...patternSchema.required].toSorted();
  const allowedCardFields = Object.keys(patternSchema.properties).toSorted();
  assert.deepEqual(requiredCardFields, allowedCardFields);
  assert.equal(patternSchema.$defs.style.additionalProperties, false);

  const digest = (data) => createHash('sha256').update(data).digest('hex');
  assert.equal(manifest.catalog.target,
    'erduo-broll-loop-engineering/references/shotcraft/catalog.json');
  assert.equal(manifest.catalog.bytes, catalogData.length);
  assert.equal(manifest.catalog.sha256, digest(catalogData));
  assert.equal(
    manifest.catalog.sha256,
    'ece17d1aa2b7d76b4f533f33d7127c61941de68927a9459000baf419593a4593',
  );
  const aggregateCardDigest = manifest.cards
    .toSorted((left, right) => left.target.localeCompare(right.target))
    .map((record) => `${record.sha256}  ${record.target}\n`)
    .join('');
  assert.equal(
    digest(aggregateCardDigest),
    '3372d5c434ce58b1c91de6b1b069102000f28dcac709feeda23ee55bee51506b',
  );

  const names = new Set();
  const styleKeys = new Set();
  const manifestByName = new Map(manifest.cards.map((card) => [card.name, card]));
  assert.equal(manifestByName.size, 152);
  for (const card of catalog.cards) {
    assert.deepEqual(Object.keys(card).toSorted(), allowedCardFields, card.name);
    for (const field of requiredCardFields) assert.notEqual(card[field], undefined, field);
    assert.match(card.name, new RegExp(patternSchema.properties.name.pattern, 'u'));
    assert.match(card.category, new RegExp(patternSchema.properties.category.pattern, 'u'));
    assert.match(card.source, new RegExp(patternSchema.properties.source.pattern, 'u'));
    assert.match(card.upstreamUrl, new RegExp(patternSchema.properties.upstreamUrl.pattern, 'u'));
    assert.match(card.localSource, new RegExp(patternSchema.properties.localSource.pattern, 'u'));
    assert.equal(new Set(card.tags).size, card.tags.length, card.name);
    assert.equal(card.tags.length >= patternSchema.properties.tags.minItems, true, card.name);
    assert.equal(names.has(card.name), false, card.name);
    names.add(card.name);
    const record = manifestByName.get(card.name);
    assert.ok(record, card.name);
    assert.equal(card.category, record.category);
    assert.equal(card.source, record.source);
    assert.equal(card.upstreamUrl, record.upstreamUrl);
    assert.equal(card.localSource, `cards/${card.category}/${card.name}.md`);
    assert.equal(
      card.upstreamUrl,
      `${shotcraftUpstream.repository}/blob/${shotcraftUpstream.commit}/${card.source}`,
    );
    const body = await readFile(path.join(root, record.target));
    assert.equal(record.bytes, body.length, record.target);
    assert.equal(record.sha256, digest(body), record.target);
    for (const style of card.styles) {
      const styleAllowed = Object.keys(patternSchema.$defs.style.properties);
      assert.equal(Object.keys(style).every((key) => styleAllowed.includes(key)), true, style.key);
      for (const field of patternSchema.$defs.style.required) {
        assert.equal(typeof style[field], 'string', `${style.key}:${field}`);
        assert.equal(style[field].length > 0, true, `${style.key}:${field}`);
      }
      assert.match(style.key, new RegExp(
        patternSchema.$defs.style.properties.key.pattern,
        'u',
      ));
      assert.equal(styleKeys.has(style.key), false, style.key);
      styleKeys.add(style.key);
    }
  }
  assert.equal(names.size, 152);
  assert.equal(styleKeys.size, 209);

  const attribution = await readFile(path.join(root, manifest.attribution.target));
  assert.equal(manifest.attribution.bytes, attribution.length);
  assert.equal(manifest.attribution.sha256, digest(attribution));
  assert.equal(
    manifest.attribution.sha256,
    '3853b1a686e1ce3ad52884af392167c1e659a48da5b0d435f031386c738f1f0c',
  );
  const actualCardTargets = (await listPublicReleaseFiles(path.join(shotcraftRoot, 'cards')))
    .map((file) => path.relative(root, file))
    .toSorted();
  assert.deepEqual(
    actualCardTargets,
    manifest.cards.map((card) => card.target).toSorted(),
  );

  if (!RELEASE_PACKAGE_MODE) {
    const sync = await readFile(path.join(root, 'scripts', 'sync-video-shotcraft.mjs'), 'utf8');
    assert.match(sync, /copyFileSync\(item\.sourcePath, item\.targetPath\)/u);
    assert.match(sync, new RegExp(shotcraftUpstream.commit, 'u'));
  }
  const license = await readFile(
    path.join(root, 'third_party', 'licenses', 'video-shotcraft-APACHE-2.0.txt'),
  );
  assert.equal(license.length, 11340);
  assert.equal(
    digest(license),
    'b2ce9877a55547ada9b870150664d1468ff777e67cc9888806a73927d31c5771',
  );
  assert.equal(
    RELEASE_FILES
      .filter((file) => /\.(?:tsx?|jsx?)$/iu.test(file))
      .every((file) => file.startsWith(
        'erduo-broll-loop-engineering/references/shotcraft/remotion-sources/',
      )),
    true,
  );
  assert.equal(
    RELEASE_FILES.some((file) => /\.(?:png|jpe?g|webp|gif|mp4|mov|wav|mp3)$/iu.test(file)),
    false,
  );
});

test('Shotcraft Remotion source manifest is a pinned, hash-closed non-media subset', async () => {
  const sourceRoot = path.join(shotcraftRoot, 'remotion-sources');
  const manifest = JSON.parse(await readFile(path.join(sourceRoot, 'manifest.json'), 'utf8'));
  const index = JSON.parse(await readFile(path.join(sourceRoot, 'index.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.deepEqual(manifest.upstream, {
    repository: shotcraftUpstream.repository,
    commit: shotcraftUpstream.commit,
    license: shotcraftUpstream.license,
  });
  assert.equal(manifest.stats.cards, 152);
  assert.equal(manifest.stats.sourceFiles, manifest.files.length);
  assert.equal(
    createHash('sha256')
      .update(await readFile(path.join(sourceRoot, 'manifest.json')))
      .digest('hex'),
    'ab6a3a82788f624678b7405399f4c71c50f227c7915ecd317c5d997441dc9e8c',
  );
  assert.equal(index.stats.cards, 152);
  assert.equal(index.stats.sourceFiles, manifest.files.length);
  const records = [manifest.index, manifest.sourceDescription, ...manifest.files];
  const targets = new Set();
  for (const record of records) {
    assert.equal(targets.has(record.target), false, record.target);
    targets.add(record.target);
    assert.match(record.sha256, /^[a-f0-9]{64}$/u);
    const absolute = path.join(root, record.target);
    const body = await readFile(absolute);
    const info = await lstat(absolute);
    assert.equal(info.isFile() && !info.isSymbolicLink(), true, record.target);
    assert.equal(body.length, record.bytes, record.target);
    assert.equal(createHash('sha256').update(body).digest('hex'), record.sha256, record.target);
    assert.doesNotMatch(record.target, /\.(?:png|jpe?g|gif|webp|mp4|mov|mp3|wav|woff2?|ttf|otf)$/iu);
  }
  const actual = (await listPublicReleaseFiles(sourceRoot))
    .map((file) => path.relative(root, file))
    .toSorted();
  assert.deepEqual(
    actual,
    ['erduo-broll-loop-engineering/references/shotcraft/remotion-sources/manifest.json', ...targets]
      .toSorted(),
  );
});

test('Shotcraft query keeps discovery concise and loads only an explicitly selected card', async () => {
  const runQuery = async (...args) => execFileAsync(process.execPath, [shotcraftQuery, ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  const stats = JSON.parse((await runQuery('--stats')).stdout);
  assert.equal(stats.cards, 152);
  assert.equal(stats.styles, 209);
  assert.deepEqual(stats.upstream, shotcraftUpstream);

  const multi = JSON.parse((await runQuery(
    '--search', '急推 特写', '--category', 'camera',
  )).stdout);
  assert.equal(multi.results.some((card) => card.name === 'crash-zoom-punch'), true);
  const single = JSON.parse((await runQuery('--search', '特写')).stdout);
  assert.equal(single.results.some((card) => card.name === 'crash-zoom-punch'), true);
  assert.equal(single.shown <= 20, true);
  assert.equal('intention' in single.results[0], false);

  await assert.rejects(
    runQuery('--search', ' \t '),
    (error) => /requires non-whitespace text/u.test(error?.stderr ?? ''),
  );
  const selected = (await runQuery(
    '--card', 'crash-zoom-punch', '--style', 'crash-zoom-punch',
  )).stdout;
  assert.match(selected, new RegExp(
    `${shotcraftUpstream.repository}/blob/${shotcraftUpstream.commit}/references/shots/camera/crash-zoom-punch.md`,
    'u',
  ));
  assert.match(selected, /## Upstream card body/u);
  assert.doesNotMatch(selected, /undefined/u);
  await assert.rejects(
    runQuery('--style', 'crash-zoom-punch'),
    (error) => /requires --card/u.test(error?.stderr ?? ''),
  );
});

test('Shotcraft sync refuses destination symlinks and rebuilds a dirty output as a manifest closure', async (t) => {
  if (RELEASE_PACKAGE_MODE) {
    t.skip('repository-only synchronization maintenance is not shipped in the release archive');
    return;
  }
  const state = await isolated(t);
  const source = path.join(state.base, 'upstream-fixture');
  const mockBin = path.join(state.base, 'mock-bin');
  const syncScript = path.join(root, 'scripts', 'sync-video-shotcraft.mjs');
  const catalog = JSON.parse(await readFile(path.join(shotcraftRoot, 'catalog.json')));
  await Promise.all([
    mkdir(path.join(source, '.git'), { recursive: true }),
    mkdir(path.join(source, 'gallery', 'api'), { recursive: true }),
    mkdir(path.join(source, 'references', 'shots'), { recursive: true }),
    mkdir(mockBin, { recursive: true }),
  ]);
  await writeFile(
    path.join(source, 'gallery', 'api', 'library.json'),
    `${JSON.stringify({ revision: catalog.upstream.libraryRevision, cards: catalog.cards })}\n`,
  );
  for (const card of catalog.cards) {
    const sourceCard = path.join(source, ...card.source.split('/'));
    await mkdir(path.dirname(sourceCard), { recursive: true });
    await cp(path.join(shotcraftRoot, ...card.localSource.split('/')), sourceCard);
  }
  await cp(
    path.join(shotcraftRoot, 'upstream-attribution.md'),
    path.join(source, 'references', 'shots', 'ATTRIBUTION.md'),
  );
  const mockGit = path.join(mockBin, 'git');
  await writeFile(mockGit, [
    '#!/bin/sh',
    'if [ "$1" = "rev-parse" ]; then',
    `  printf '%s\\n' '${shotcraftUpstream.commit}'`,
    '  exit 0',
    'fi',
    'if [ "$1" = "status" ]; then exit 0; fi',
    'exit 2',
    '',
  ].join('\n'));
  await chmod(mockGit, 0o755);
  const env = { ...process.env, PATH: `${mockBin}:/usr/bin:/bin` };
  const runSync = (destination) => execFileAsync(process.execPath, [
    syncScript,
    '--source', source,
    '--destination', destination,
  ], { cwd: root, env, encoding: 'utf8' });
  const prepareDestination = async (name) => {
    const destination = path.join(state.base, name);
    await mkdir(
      path.join(destination, 'erduo-broll-loop-engineering', 'references'),
      { recursive: true },
    );
    await writeFile(
      path.join(destination, 'erduo-broll-loop-engineering', 'SKILL.md'),
      '---\nname: erduo-broll-loop-engineering\ndescription: Fixture.\n---\n',
    );
    return destination;
  };

  const symlinkDestination = await prepareDestination('symlink-destination');
  const outside = path.join(state.base, 'outside-shotcraft');
  const sentinel = path.join(outside, 'sentinel.txt');
  await mkdir(outside);
  await writeFile(sentinel, 'must remain unchanged\n');
  await symlink(
    outside,
    path.join(
      symlinkDestination,
      'erduo-broll-loop-engineering',
      'references',
      'shotcraft',
    ),
    'dir',
  );
  await assert.rejects(
    runSync(symlinkDestination),
    (error) => error?.code === 1 && /must be a real directory/u.test(error?.stderr ?? ''),
  );
  assert.equal(await readFile(sentinel, 'utf8'), 'must remain unchanged\n');

  const dirtyDestination = await prepareDestination('dirty-destination');
  const dirtyShotcraft = path.join(
    dirtyDestination,
    'erduo-broll-loop-engineering',
    'references',
    'shotcraft',
  );
  await mkdir(path.join(dirtyShotcraft, 'stale'), { recursive: true });
  await writeFile(path.join(dirtyShotcraft, 'stale', 'extra.tsx'), 'private demo\n');
  await writeFile(path.join(dirtyShotcraft, 'stale', 'extra.mp4'), 'not media\n');
  const result = JSON.parse((await runSync(dirtyDestination)).stdout);
  assert.deepEqual(result, {
    status: 'synced',
    cards: 152,
    styles: 209,
    categories: 10,
    commit: shotcraftUpstream.commit,
    libraryRevision: shotcraftUpstream.libraryRevision,
  });
  assert.equal(await entryExists(path.join(dirtyShotcraft, 'stale')), false);
  const generatedManifest = JSON.parse(await readFile(
    path.join(dirtyShotcraft, 'manifest.json'),
  ));
  const actual = (await listPublicReleaseFiles(dirtyShotcraft))
    .map((file) => path.relative(dirtyDestination, file))
    .toSorted();
  assert.deepEqual(actual, [
    generatedManifest.catalog.target,
    generatedManifest.attribution.target,
    ...generatedManifest.cards.map((card) => card.target),
    'erduo-broll-loop-engineering/references/shotcraft/manifest.json',
  ].toSorted());
});

test('runtime recipe schemas preserve a runtime-neutral integer-millisecond v1/v2 contract', async () => {
  const [schema, legacy] = await Promise.all([
    readFile(path.join(runtimeReferenceRoot, 'shot-recipe.schema.json'), 'utf8').then(JSON.parse),
    readFile(path.join(runtimeReferenceRoot, 'shot-recipe-v1.schema.json'), 'utf8').then(JSON.parse),
  ]);
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.schemaVersion.const, '2.0.0');
  assert.equal(legacy.properties.schemaVersion.const, '1.0.0');
  assert.deepEqual(
    [...schema.required].toSorted(),
    [
      'audienceUnderstanding',
      'compositionFamily',
      'cueIds',
      'focus',
      'heroFrame',
      'materialNeeds',
      'microBeats',
      'neighborHandoff',
      'readableHold',
      'requiredCapabilities',
      'schemaVersion',
      'shotId',
      'window',
    ],
  );
  assert.equal(schema.properties.runtime, undefined);
  assert.equal(schema.properties.fps, undefined);
  assert.equal(schema.properties.frames, undefined);
  assert.equal(schema.properties.requiredCapabilities.minItems, 1);
  assert.equal(schema.properties.requiredCapabilities.uniqueItems, true);

  const integerMillisecondFields = [];
  function collectIntegerMillisecondFields(value, pointer = '#') {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      const childPointer = `${pointer}/${key}`;
      if (/Ms$/u.test(key)) {
        integerMillisecondFields.push(childPointer);
        assert.equal(child.type, 'integer', childPointer);
        assert.equal(Number.isInteger(child.minimum), true, childPointer);
      }
      collectIntegerMillisecondFields(child, childPointer);
    }
  }
  collectIntegerMillisecondFields(schema);
  assert.deepEqual(integerMillisecondFields.toSorted(), [
    '#/$defs/microBeat/properties/endMs',
    '#/$defs/microBeat/properties/startMs',
    '#/$defs/window/properties/endMs',
    '#/$defs/window/properties/startMs',
    '#/properties/readableHold/properties/endMs',
    '#/properties/readableHold/properties/startMs',
  ]);
  assert.deepEqual(schema.$defs.window.required.toSorted(), ['endMs', 'startMs']);
  assert.deepEqual(
    schema.$defs.microBeat.required.toSorted(),
    ['beatId', 'change', 'endMs', 'startMs', 'visibleState'],
  );
});

test('shared narrative and visual contracts are strict and craft query is progressively bounded', async () => {
  const [narrativeSchema, visualSchema, catalog] = await Promise.all([
    readFile(path.join(runtimeReferenceRoot, 'narrative-envelope.schema.json'), 'utf8').then(JSON.parse),
    readFile(path.join(runtimeReferenceRoot, 'visual-system.schema.json'), 'utf8').then(JSON.parse),
    readFile(path.join(craftRoot, 'catalog.json'), 'utf8').then(JSON.parse),
  ]);
  const narrative = {
    schemaVersion: '1.0.0', filmId: 'benchmark', window: { startMs: 0, endMs: 12000 },
    premise: 'A useful idea becomes visible.', audienceJourney: ['question', 'evidence', 'resolution'],
    chapters: [{ chapterId: 'C01', window: { startMs: 0, endMs: 12000 }, purpose: 'Resolve the premise.' }],
    terms: [{ term: 'example', meaning: 'A bounded fact.', factStatus: 'provided' }],
  };
  assert.deepEqual(validateSchemaValue(narrative, narrativeSchema, narrativeSchema), []);
  assert.match(validateSchemaValue({ ...narrative, extra: true }, narrativeSchema, narrativeSchema)[0], /additional property/u);
  const visual = {
    schemaVersion: '1.0.0', conceptAngle: 'A physical evidence bench', visualWorld: 'Paper and instruments',
    paletteRoles: [
      { role: 'field', value: '#EEE9DF', use: 'background' },
      { role: 'signal', value: '#C33A28', use: 'decisions' },
    ],
    typographyRoles: [{ role: 'display', family: 'Fixture Sans', weight: '700', use: 'focus', sourceLocator: 'fonts/display.woff2' }],
    materials: ['paper', 'ink'], depthPlan: { background: 'field', midground: 'evidence', foreground: 'focus' },
    compositionFamilies: ['full-bleed-material', 'data-diagram-evidence', 'sparse-hold-chapter-outro'],
    motifSemantics: [], rhythmCurve: [{ startMs: 0, endMs: 12000, character: 'build then resolve' }],
    prohibitedLazyDefaults: ['unmotivated cyan-purple glow'], safeAreaPolicy: 'Keep focus inside the frozen task safe area.',
  };
  assert.deepEqual(validateSchemaValue(visual, visualSchema, visualSchema), []);
  assert.match(validateSchemaValue({ ...visual, compositionFamilies: ['full-bleed-material'] }, visualSchema, visualSchema)[0], /too few items/u);

  const summary = queryCraft(catalog, { summary: true });
  assert.equal(summary.entries, 11);
  assert.equal(summary.categories.length, 11);
  assert.equal(JSON.stringify(summary).includes('motionGrammar'), false);
  const category = queryCraft(catalog, { category: 'asset-fusion' });
  assert.deepEqual(category.results.map(({ id }) => id), ['media-geometry-fusion']);
  assert.equal('motionGrammar' in category.results[0], false);
  const search = queryCraft(catalog, { search: 'readable result' });
  assert.deepEqual(search.results.map(({ id }) => id), ['diagram-causal-transform', 'resolved-hold']);
  const selected = queryCraft(catalog, { entry: 'media-geometry-fusion' });
  assert.equal(selected.category, 'asset-fusion');
  assert.match(selected.motionGrammar, /media geometry/u);
  assert.throws(() => queryCraft(catalog, { category: 'not-real' }), /unknown category/u);
  assert.throws(() => validateCraftCatalog({ ...catalog, schemaVersion: '2.0.0' }), /unsupported schemaVersion/u);
  assert.throws(() => validateCraftCatalog({ ...catalog, entries: [...catalog.entries, catalog.entries[0]] }), /duplicate id/u);
  assert.throws(() => validateCraftCatalog({
    ...catalog,
    entries: catalog.entries.map((entry, index) => index === 1
      ? { ...entry, hyperframesLocator: catalog.entries[0].hyperframesLocator } : entry),
  }), /duplicate hyperframesLocator/u);
  assert.throws(() => validateCraftCatalog({ ...catalog, extra: true }), /root fields are not closed/u);

  const { stdout } = await execFileAsync(process.execPath, [craftQuery, '--summary']);
  assert.deepEqual(JSON.parse(stdout), summary);
});

test('shot recipe validator accepts a valid recipe and rejects semantic or capability drift', async (t) => {
  const state = await isolated(t);
  const recipeDirectory = path.join(state.base, 'shot-recipes');
  await mkdir(recipeDirectory);
  const recipe = {
    schemaVersion: '1.0.0',
    shotId: 'S01',
    window: { startMs: 0, endMs: 2000 },
    semantics: {
      purpose: 'Explain a change.',
      audienceUnderstanding: 'The value increases.',
      focus: 'Primary value',
      visualLogic: 'Initial value becomes the result.',
      neighborConnection: 'Continue from the preceding premise.',
    },
    visualState: {
      initial: 'The initial value is visible.',
      result: 'The result value is visible.',
      focusOrder: ['label', 'value'],
    },
    motion: {
      phases: [{
        name: 'action',
        startMs: 200,
        endMs: 1200,
        intent: 'Reveal the increase.',
        visibleChange: 'The value changes from initial to result.',
        easingIntent: 'decelerate',
      }],
    },
    readability: {
      holdStartMs: 1200,
      holdEndMs: 2000,
      readableItems: ['value'],
    },
    materials: [],
    requiredCapabilities: [
      'semantic.integer-ms-window',
      'semantic.visual-state-transition',
      'semantic.readable-hold',
    ],
    patternRef: {
      cardId: 'crash-zoom-punch',
      styleKey: 'crash-zoom-punch',
      sourceRevision: shotcraftUpstream.commit,
      semanticReason: 'The rapid push makes the new value the decisive focus.',
      fallback: {
        when: 'The push would reduce readability.',
        strategy: 'simplify-motion',
        preserve: ['result value', 'readable hold'],
      },
    },
  };
  const recipePath = path.join(recipeDirectory, 'S01.json');
  await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`);
  assert.deepEqual(await validateRecipeDirectory(recipeDirectory), {
    status: 'valid',
    recipes: 1,
  });

  const compactRecipe = {
    schemaVersion: '2.0.0', shotId: 'S01', window: { startMs: 0, endMs: 2000 },
    cueIds: ['cue-1'], audienceUnderstanding: 'The value increases.', focus: 'Primary value',
    compositionFamily: 'data-diagram-evidence',
    heroFrame: {
      relationship: 'The value sits on its verified baseline.',
      layers: { background: 'baseline field', midground: 'evidence axis', foreground: 'result value' },
    },
    microBeats: [
      { beatId: 'b1', startMs: 0, endMs: 1000, visibleState: 'Baseline appears.', change: 'topology' },
      { beatId: 'b2', startMs: 1000, endMs: 1600, visibleState: 'Value lands.', change: 'attention' },
    ],
    materialNeeds: [], requiredCapabilities: recipe.requiredCapabilities,
    readableHold: { startMs: 1600, endMs: 2000, items: ['value'] },
    craft: { primary: { entryId: 'stat-evidence-build', semanticReason: 'Connect the value to evidence.' } },
    patternRef: recipe.patternRef,
    neighborHandoff: { incoming: 'Continue baseline.', outgoing: 'Carry value.' },
  };
  await writeFile(recipePath, `${JSON.stringify(compactRecipe, null, 2)}\n`);
  assert.deepEqual(await validateRecipeDirectory(recipeDirectory), { status: 'valid', recipes: 1 });
  const compactSecond = {
    ...compactRecipe,
    shotId: 'S02',
    window: { startMs: 2000, endMs: 4000 },
    cueIds: ['cue-2'],
    microBeats: compactRecipe.microBeats.map((beat) => ({
      ...beat, startMs: beat.startMs + 2000, endMs: beat.endMs + 2000,
    })),
    readableHold: { startMs: 3600, endMs: 4000, items: ['value'] },
  };
  const secondPath = path.join(recipeDirectory, 'S02.json');
  await writeFile(secondPath, `${JSON.stringify(compactSecond, null, 2)}\n`);
  assert.deepEqual(await validateRecipeDirectory(recipeDirectory), { status: 'valid', recipes: 2 });
  await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`);
  await assert.rejects(
    validateRecipeDirectory(recipeDirectory),
    /recipe directory mixes schema versions: 1\.0\.0, 2\.0\.0/u,
  );
  await rm(secondPath);
  await writeFile(recipePath, `${JSON.stringify(compactRecipe, null, 2)}\n`);
  await writeFile(recipePath, `${JSON.stringify({
    ...compactRecipe, craft: { transition: { entryId: 'stat-evidence-build', semanticReason: 'Invalid category.' } },
  }, null, 2)}\n`);
  await assert.rejects(validateRecipeDirectory(recipeDirectory), /transition locator must reference the transition category/u);
  await writeFile(recipePath, `${JSON.stringify({
    ...compactRecipe, craft: { primary: { entryId: 'semantic-seam-carry', semanticReason: 'Invalid category.' } },
  }, null, 2)}\n`);
  await assert.rejects(validateRecipeDirectory(recipeDirectory), /primary locator must not reference the transition category/u);
  await writeFile(recipePath, `${JSON.stringify({ ...compactRecipe, schemaVersion: '3.0.0' }, null, 2)}\n`);
  await assert.rejects(validateRecipeDirectory(recipeDirectory), /unsupported recipe schema version/u);

  await writeFile(recipePath, `${JSON.stringify({
    ...recipe,
    readability: { ...recipe.readability, holdEndMs: 2100 },
  }, null, 2)}\n`);
  await assert.rejects(
    validateRecipeDirectory(recipeDirectory),
    /hold window must stay inside the shot window/u,
  );

  await writeFile(recipePath, `${JSON.stringify({
    ...recipe,
    requiredCapabilities: ['runtime.ambient-react-state'],
  }, null, 2)}\n`);
  await assert.rejects(
    validateRecipeDirectory(recipeDirectory),
    /unsupported capability runtime\.ambient-react-state/u,
  );

  await writeFile(recipePath, `${JSON.stringify({
    ...recipe,
    requiredCapabilities: ['semantic.not-registered'],
  }, null, 2)}\n`);
  await assert.rejects(
    validateRecipeDirectory(recipeDirectory),
    /unknown capability semantic\.not-registered/u,
  );

  for (const [name, patternRef, expected] of [
    [
      'unknown card',
      { ...recipe.patternRef, cardId: 'not-a-bundled-card' },
      /unknown Shotcraft card not-a-bundled-card/u,
    ],
    [
      'style outside card',
      { ...recipe.patternRef, styleKey: 'ai-stream-response' },
      /style ai-stream-response does not belong to card crash-zoom-punch/u,
    ],
    [
      'source revision drift',
      { ...recipe.patternRef, sourceRevision: '0'.repeat(40) },
      /must equal bundled Shotcraft revision/u,
    ],
  ]) {
    await writeFile(recipePath, `${JSON.stringify({ ...recipe, patternRef }, null, 2)}\n`);
    await assert.rejects(validateRecipeDirectory(recipeDirectory), expected, name);
  }
});

test('post-Director runtime planner is deterministic, evidence-based, contiguous, and schema-valid', async (t) => {
  const state = await isolated(t);
  const recipes = path.join(state.base, 'recipes');
  await mkdir(recipes);
  const makeRecipe = ({ shotId, startMs, endMs, capabilities, patternRef }) => ({
    schemaVersion: '1.0.0', shotId, window: { startMs, endMs },
    semantics: {
      purpose: `Purpose ${shotId}`, audienceUnderstanding: `Understanding ${shotId}`,
      focus: `Focus ${shotId}`, visualLogic: `Logic ${shotId}`, neighborConnection: `Connection ${shotId}`,
    },
    visualState: { initial: 'Initial', result: 'Result', focusOrder: ['focus'] },
    motion: { phases: [{ name: 'action', startMs, endMs, intent: 'Change', visibleChange: 'Result appears' }] },
    readability: { holdStartMs: startMs, holdEndMs: endMs, readableItems: [] },
    materials: [], requiredCapabilities: capabilities,
    ...(patternRef ? { patternRef } : {}),
  });
  const common = ['semantic.integer-ms-window', 'semantic.visual-state-transition', 'semantic.readable-hold'];
  const recipeList = [
    makeRecipe({ shotId: 'S01', startMs: 0, endMs: 1000, capabilities: [...common, 'layout.dom-css-editorial'] }),
    makeRecipe({
      shotId: 'S02', startMs: 1000, endMs: 2000, capabilities: common,
      patternRef: {
        cardId: 'crash-zoom-punch', styleKey: 'crash-zoom-punch', sourceRevision: shotcraftUpstream.commit,
        semanticReason: 'Exact selected pattern evidence.',
        fallback: { when: 'Unavailable', strategy: 'simplify-motion' },
      },
    }),
    makeRecipe({
      shotId: 'S03', startMs: 2000, endMs: 3000,
      capabilities: [...common, 'motion.frame-driven-multiphase', 'effects.dom-pixel-postprocess'],
    }),
  ];
  await Promise.all(recipeList.map((recipe) => writeFile(
    path.join(recipes, `${recipe.shotId}.json`), `${JSON.stringify(recipe, null, 2)}\n`,
  )));
  const selectionFile = path.join(state.base, 'selection.json');
  await writeFile(selectionFile, `${JSON.stringify({
    schemaVersion: '2.0.0', status: 'selected', selectedRuntime: 'auto', selectionSource: 'default',
  })}\n`);
  const sharedArtifactFiles = await writeSharedDirectorArtifacts(state.base);
  const first = await planRuntime({ recipesDirectory: recipes, selectionFile, ...sharedArtifactFiles });
  const second = await planRuntime({ recipesDirectory: recipes, selectionFile, ...sharedArtifactFiles });
  assert.deepEqual(first, second);
  assert.deepEqual(await validateRuntimePlan(first, sharedArtifactFiles), { status: 'valid', shots: 3, blocks: 2, authoringUnits: 2, route: 'hybrid' });
  assert.match(first.sharedArtifacts.narrativeEnvelope.sha256, /^[0-9a-f]{64}$/u);
  await assert.rejects(validateRuntimePlan(first), /narrative envelope file is required/u);
  const originalNarrative = await readFile(sharedArtifactFiles.narrativeEnvelopeFile, 'utf8');
  await writeFile(sharedArtifactFiles.narrativeEnvelopeFile, originalNarrative.replace('Fixture premise.', 'Changed premise.'));
  await assert.rejects(validateRuntimePlan(first, sharedArtifactFiles), /content hash does not match/u);
  await writeFile(sharedArtifactFiles.narrativeEnvelopeFile, originalNarrative);
  assert.equal(first.schemaVersion, '2.0.0');
  assert.equal(first.resultingRoute, 'hybrid');
  assert.deepEqual(first.requiredBackends, ['hyperframes', 'remotion']);
  assert.deepEqual(first.blocks.map(({ runtime, window, shotIds }) => ({ runtime, window, shotIds })), [
    { runtime: 'hyperframes', window: { startMs: 0, endMs: 1000 }, shotIds: ['S01'] },
    { runtime: 'remotion', window: { startMs: 1000, endMs: 3000 }, shotIds: ['S02', 'S03'] },
  ]);
  assert.equal(first.shots[0].decision, 'capability-preference');
  assert.equal(first.shots[1].decision, 'pattern-reference');
  assert.match(first.shots[1].unverifiedPreferences[0], /not a render witness/u);
  assert.equal(first.shots[2].decision, 'native-required');
  assert.equal(first.shots[2].evidence[0].id, 'effects.dom-pixel-postprocess');
  assert.deepEqual(first.authoringUnits.map(({ blockId, runtime, shotIds }) => ({ blockId, runtime, shotIds })), [
    { blockId: 'B001', runtime: 'hyperframes', shotIds: ['S01'] },
    { blockId: 'B002', runtime: 'remotion', shotIds: ['S02', 'S03'] },
  ]);
  assert.deepEqual(first.authoringUnits[1].context.recipes, ['shot-recipes/S02.json', 'shot-recipes/S03.json']);

  const legacySelection = path.join(state.base, 'legacy-selection.json');
  await writeFile(legacySelection, `${JSON.stringify({
    schemaVersion: '1.0.0', status: 'selected', selectedRuntime: 'remotion', selectionSource: 'explicit',
  })}\n`);
  const grandfathered = await planRuntime({ recipesDirectory: recipes, selectionFile: legacySelection, ...sharedArtifactFiles });
  assert.equal(grandfathered.planningMode, 'forced-single');
  assert.equal(grandfathered.resultingRoute, 'remotion');
  assert.equal(grandfathered.blocks.length, 1);
  assert.equal(grandfathered.authoringUnits.length, 1);
});

test('runtime planner partitions focused units deterministically at shot, count, duration, solo, and backend boundaries', async (t) => {
  const state = await isolated(t);
  const recipes = path.join(state.base, 'recipes');
  await mkdir(recipes);
  const common = ['semantic.integer-ms-window', 'semantic.visual-state-transition', 'semantic.readable-hold'];
  const windows = [[0, 10000], [10000, 20000], [20000, 30000], [30000, 45000], [45000, 85000]];
  for (const [index, [startMs, endMs]] of windows.entries()) {
    const shotId = `S${String(index + 1).padStart(2, '0')}`;
    const recipe = {
      schemaVersion: '2.0.0', shotId, window: { startMs, endMs }, cueIds: [`cue-${index + 1}`],
      audienceUnderstanding: shotId, focus: shotId, compositionFamily: 'data-diagram-evidence',
      heroFrame: { relationship: 'Evidence supports focus.', layers: { background: 'field', midground: 'evidence', foreground: 'focus' } },
      microBeats: [{ beatId: 'b1', startMs, endMs, visibleState: 'Complete state.', change: 'relationship' }],
      materialNeeds: [], requiredCapabilities: common,
      readableHold: { startMs, endMs, items: [] }, neighborHandoff: { incoming: 'In.', outgoing: 'Out.' },
      ...(index === 2 ? { authoring: { solo: true, reason: 'Hero shot.' } } : {}),
    };
    await writeFile(path.join(recipes, `${shotId}.json`), `${JSON.stringify(recipe)}\n`);
  }
  const selectionFile = path.join(state.base, 'selection.json');
  await writeFile(selectionFile, `${JSON.stringify({ schemaVersion: '2.0.0', status: 'selected', selectedRuntime: 'hyperframes', selectionSource: 'explicit' })}\n`);
  const sharedArtifactFiles = await writeSharedDirectorArtifacts(state.base, 85000);
  const plan = await planRuntime({ recipesDirectory: recipes, selectionFile, ...sharedArtifactFiles });
  assert.deepEqual(plan.authoringUnits.map(({ window, shotIds }) => ({ window, shotIds })), [
    { window: { startMs: 0, endMs: 20000 }, shotIds: ['S01', 'S02'] },
    { window: { startMs: 20000, endMs: 30000 }, shotIds: ['S03'] },
    { window: { startMs: 30000, endMs: 45000 }, shotIds: ['S04'] },
    { window: { startMs: 45000, endMs: 85000 }, shotIds: ['S05'] },
  ]);
  assert.deepEqual(await validateRuntimePlan(plan, sharedArtifactFiles), { status: 'valid', shots: 5, blocks: 1, authoringUnits: 4, route: 'hyperframes' });

  const broken = structuredClone(plan);
  broken.authoringUnits[0].shotIds.push('S03');
  broken.authoringUnits[0].window.endMs = 30000;
  broken.authoringUnits[0].context.recipes.push('shot-recipes/S03.json');
  broken.authoringUnits[1].shotIds = ['S04'];
  broken.authoringUnits[1].window = { startMs: 30000, endMs: 45000 };
  broken.authoringUnits[1].context.recipes = ['shot-recipes/S04.json'];
  const { computeRuntimePlanIdentity } = await import('../erduo-broll-loop-engineering/scripts/validate-runtime-plan.mjs');
  broken.identity = computeRuntimePlanIdentity(broken);
  await assert.rejects(validateRuntimePlan(broken, sharedArtifactFiles), /units must close over every shot exactly once/u);

  const longRecipePath = path.join(recipes, 'S05.json');
  const longRecipe = JSON.parse(await readFile(longRecipePath, 'utf8'));
  longRecipe.window.endMs = 85001;
  longRecipe.microBeats[0].endMs = 85001;
  longRecipe.readableHold.endMs = 85001;
  await writeFile(longRecipePath, `${JSON.stringify(longRecipe)}\n`);
  await writeFile(sharedArtifactFiles.narrativeEnvelopeFile, (await readFile(sharedArtifactFiles.narrativeEnvelopeFile, 'utf8')).replaceAll('85000', '85001'));
  await writeFile(sharedArtifactFiles.visualSystemFile, (await readFile(sharedArtifactFiles.visualSystemFile, 'utf8')).replaceAll('85000', '85001'));
  const stopped = await planRuntime({ recipesDirectory: recipes, selectionFile, ...sharedArtifactFiles });
  assert.equal(stopped.status, 'action-required');
  assert.match(stopped.warnings.join('\n'), /semantic shot exceeds 40000ms/u);

  const invalidDispatch = structuredClone(plan);
  invalidDispatch.authoringUnits.at(-1).window.endMs = 85001;
  invalidDispatch.shots.at(-1).window.endMs = 85001;
  invalidDispatch.blocks.at(-1).window.endMs = 85001;
  invalidDispatch.sharedArtifacts = stopped.sharedArtifacts;
  invalidDispatch.identity = computeRuntimePlanIdentity(invalidDispatch);
  await assert.rejects(
    validateRuntimePlan(invalidDispatch, sharedArtifactFiles),
    /authoring unit exceeds 40000ms/u,
  );
});

test('frozen block validator checks actual hashes and rejects profile, audio, and media drift', async (t) => {
  const state = await isolated(t);
  const plan = {
    schemaVersion: '1.0.0', status: 'planned', planningMode: 'auto',
    selection: { schemaVersion: '2.0.0', selectedRuntime: 'auto', selectionSource: 'default' },
    resultingRoute: 'hybrid', requiredBackends: ['hyperframes', 'remotion'],
    integrationMode: 'frozen-block-media', frozenMediaContractVersion: '1.0.0',
    shots: [
      { shotId: 'S01', window: { startMs: 0, endMs: 1000 }, runtime: 'hyperframes', decision: 'portable-default', evidence: [{ kind: 'portable-default', id: 'default', runtime: 'hyperframes', priority: 0, verification: 'contract-only', locator: 'matrix' }], unverifiedPreferences: [] },
      { shotId: 'S02', window: { startMs: 1000, endMs: 2000 }, runtime: 'remotion', decision: 'capability-preference', evidence: [{ kind: 'capability-preference', id: 'complex', runtime: 'remotion', priority: 90, verification: 'operator-confirmed', locator: 'matrix' }], unverifiedPreferences: [] },
    ],
    blocks: [
      { blockId: 'B001', runtime: 'hyperframes', window: { startMs: 0, endMs: 1000 }, shotIds: ['S01'] },
      { blockId: 'B002', runtime: 'remotion', window: { startMs: 1000, endMs: 2000 }, shotIds: ['S02'] },
    ],
    warnings: [], identity: '',
  };
  const { computeRuntimePlanIdentity } = await import('../erduo-broll-loop-engineering/scripts/validate-runtime-plan.mjs');
  plan.identity = computeRuntimePlanIdentity(plan);
  const contractFiles = [];
  for (const [index, block] of plan.blocks.entries()) {
    const directory = path.join(state.base, block.blockId);
    await mkdir(directory);
    const mediaPath = path.join(directory, 'block.mkv');
    const body = Buffer.from(`frozen-block-${index}`);
    await writeFile(mediaPath, body);
    const contract = {
      schemaVersion: '1.0.0', blockId: block.blockId, runtime: block.runtime,
      window: block.window, shotIds: block.shotIds,
      profile: { width: 1920, height: 1080, fpsNumerator: 30, fpsDenominator: 1, pixelFormat: 'yuv444p10le', colorSpace: 'bt709', mezzanineClass: 'lossless' },
      audioPolicy: 'silent',
      media: { path: 'block.mkv', sha256: createHash('sha256').update(body).digest('hex'), container: 'matroska', codec: 'ffv1', durationMs: 1000, frameCount: 30, audioStreams: 0 },
      sourceIdentity: String(index + 1).repeat(64),
      verification: { ffprobePassed: true, fullDecodePassed: true, openingFrameInspected: true, closingFrameInspected: true },
      noRealtimeNesting: true,
    };
    const contractFile = path.join(directory, 'block-media.json');
    await writeFile(contractFile, `${JSON.stringify(contract, null, 2)}\n`);
    contractFiles.push(contractFile);
  }
  const valid = await validateFrozenBlocks(plan, contractFiles);
  assert.equal(valid.status, 'valid');
  assert.equal(valid.blocks, 2);

  const second = JSON.parse(await readFile(contractFiles[1], 'utf8'));
  await writeFile(contractFiles[1], `${JSON.stringify({ ...second, profile: { ...second.profile, width: 1280 } }, null, 2)}\n`);
  await assert.rejects(validateFrozenBlocks(plan, contractFiles), /profile differs across blocks/u);
  await writeFile(contractFiles[1], `${JSON.stringify({ ...second, media: { ...second.media, sha256: '0'.repeat(64) } }, null, 2)}\n`);
  await assert.rejects(validateFrozenBlocks(plan, contractFiles), /media SHA-256 mismatch/u);
  await writeFile(contractFiles[1], `${JSON.stringify({ ...second, media: { ...second.media, audioStreams: 1 } }, null, 2)}\n`);
  await assert.rejects(validateFrozenBlocks(plan, contractFiles), /silent block contains audio streams/u);
});

test('runtime capability matrix is closed, traceable, and makes no render-parity claim', async () => {
  const matrix = JSON.parse(
    await readFile(path.join(runtimeReferenceRoot, 'capability-matrix.json'), 'utf8'),
  );
  const classifications = [
    'interop',
    'native-hyperframes',
    'native-remotion',
    'portable',
    'unsupported',
  ];
  const verificationStates = [
    'backend-verified',
    'comparison-verified',
    'contract-only',
    'witness-verified',
  ];
  assert.equal(matrix.matrixVersion, '3.1.0');
  assert.equal(matrix.defaultRuntime, 'auto');
  assert.equal(matrix.portableDefaultRuntime, 'hyperframes');
  assert.equal(matrix.runtimes.hyperframes.maturity, 'production-route');
  assert.equal(matrix.runtimes.hyperframes.productionAvailable, true);
  assert.equal(matrix.runtimes.remotion.maturity, 'production-route');
  assert.equal(matrix.runtimes.remotion.bundledByThisContract, false);
  assert.equal(matrix.runtimes.remotion.installedByThisContract, false);
  assert.equal(matrix.runtimes.remotion.authorizedByThisContract, false);
  assert.equal(matrix.runtimes.remotion.productionAvailable, true);
  assert.equal(matrix.unlistedCapabilityPolicy, 'reject-before-build');
  assert.match(matrix.contractOnlyPolicy, /never proves cross-runtime parity/u);
  assert.equal(matrix.patternPlanning.preferredRuntime, 'remotion');
  assert.equal(matrix.patternPlanning.verification, 'reference-source-unverified');
  assert.equal(matrix.renderParityClaimed, false);
  assert.deepEqual(Object.keys(matrix.classifications).toSorted(), classifications);
  assert.deepEqual(Object.keys(matrix.verificationStates).toSorted(), verificationStates);

  const capabilityIds = matrix.capabilities.map(({ id }) => id);
  assert.equal(new Set(capabilityIds).size, capabilityIds.length);
  assert.deepEqual(capabilityIds.toSorted(), [
    'effects.dom-pixel-postprocess',
    'interop.pre-rendered-media',
    'layout.dom-css-editorial',
    'motion.camera-3d',
    'motion.frame-driven-multiphase',
    'motion.mask-or-geometry-morph',
    'motion.particles-or-physics',
    'runtime.ambient-react-state',
    'runtime.hyperframes-seekable-source',
    'runtime.remotion-react-source',
    'semantic.integer-ms-window',
    'semantic.readable-hold',
    'semantic.visual-state-transition',
  ]);
  for (const capability of matrix.capabilities) {
    assert.ok(classifications.includes(capability.classification), capability.id);
    assert.ok(verificationStates.includes(capability.verification), capability.id);
    assert.equal(typeof capability.hyperframesRoute, 'string', capability.id);
    assert.equal(typeof capability.remotionRoute, 'string', capability.id);
    assert.ok(capability.meaning.length > 0, capability.id);
  }
  for (const capabilityId of [
    'motion.camera-3d',
    'motion.frame-driven-multiphase',
    'motion.mask-or-geometry-morph',
    'motion.particles-or-physics',
  ]) {
    const capability = matrix.capabilities.find(({ id }) => id === capabilityId);
    assert.equal(capability.planning.preferredRuntime, 'remotion');
    assert.equal(capability.planning.verification, 'operator-confirmed');
  }
  for (const capabilityId of [
    'semantic.integer-ms-window',
    'semantic.readable-hold',
    'semantic.visual-state-transition',
  ]) {
    const capability = matrix.capabilities.find(({ id }) => id === capabilityId);
    assert.equal(capability.hyperframesRoute, 'existing-production-workflow');
    assert.equal(capability.remotionRoute, 'native-production-workflow');
  }
  const htmlInCanvas = matrix.capabilities.find(
    ({ id }) => id === 'effects.dom-pixel-postprocess',
  );
  assert.equal(htmlInCanvas.classification, 'native-remotion');
  assert.equal(htmlInCanvas.minimumRemotionVersion, '4.0.455');
  assert.equal(htmlInCanvas.readinessGate, 'project-local-html-in-canvas-still-canary');
});

test('runtime references and production Skills preserve the adapter evidence gates', async () => {
  const contract = await readFile(path.join(runtimeReferenceRoot, 'runtime-contract.md'), 'utf8');
  const concernMap = await readFile(
    path.join(runtimeReferenceRoot, 'remotion-hyperframes-map.md'),
    'utf8',
  );
  assert.match(contract, /New projects default to runtime intent `auto`/u);
  assert.match(contract, /Hybrid means backend-native block construction followed by frozen-media/u);
  assert.match(contract, /No semantic keyword, directory name, agent taste, or signal count participates/u);
  assert.match(contract, /reference-source-unverified/u);
  assert.match(contract, /Never translate generated source, import one runtime into the\s+other, or nest live previews\/renderers/u);
  assert.match(contract, /Intent:[\s\S]*Plan:[\s\S]*Readiness:[\s\S]*Backend:[\s\S]*Frozen block:[\s\S]*Integration:[\s\S]*Approval:[\s\S]*Delivery:[\s\S]*Comparison:/u);
  assert.match(concernMap, /do not treat a mechanical\s+TSX-to-HyperFrames rewrite as the compatibility layer/u);
  assert.match(concernMap, /must not be generalized into automatic\s+Remotion\/HyperFrames render parity/u);

  const requiredReferences = {
    'erduo-broll-loop-engineering/SKILL.md': [
      'references/animation-craft.md',
      'references/runtime/runtime-contract.md',
      'references/runtime/shot-recipe.schema.json',
      'references/runtime/capability-matrix.json',
      'references/runtime/runtime-plan.schema.json',
      'references/runtime/frozen-block.schema.json',
    ],
    'erduo-broll-loop-engineering/stages/broll-runtime-plan/SKILL.md': [
      '../../references/runtime/capability-matrix.json',
    ],
    'erduo-broll-loop-engineering/stages/broll-hybrid-integrate/SKILL.md': [
      '../../references/runtime/frozen-block.schema.json',
    ],
    'erduo-broll-loop-engineering/stages/broll-onboarding/SKILL.md': [
      '../../references/runtime/runtime-contract.md',
      '../../references/runtime/capability-matrix.json',
    ],
    'erduo-broll-loop-engineering/stages/broll-director/SKILL.md': [
      '../../references/animation-craft.md',
      '../../references/runtime/runtime-contract.md',
      '../../references/runtime/shot-recipe.schema.json',
      '../../references/runtime/capability-matrix.json',
    ],
    'erduo-broll-loop-engineering/stages/broll-assets/SKILL.md': [
      '../../references/runtime/runtime-contract.md',
    ],
    'erduo-broll-loop-engineering/stages/broll-master-build/SKILL.md': [
      '../../references/animation-craft.md',
      '../../references/runtime/runtime-contract.md',
      '../../references/runtime/capability-matrix.json',
    ],
    'erduo-broll-loop-engineering/stages/broll-master-integrate/SKILL.md': [
      '../../references/runtime/runtime-contract.md',
      '../../references/runtime/capability-matrix.json',
    ],
    'erduo-broll-loop-engineering/stages/broll-render/SKILL.md': [
      '../../references/runtime/runtime-contract.md',
      '../../references/runtime/capability-matrix.json',
    ],
    'erduo-broll-loop-engineering/stages/broll-remotion-build/SKILL.md': [
      '../../references/animation-craft.md',
    ],
  };
  for (const [file, references] of Object.entries(requiredReferences)) {
    const text = await readFile(path.join(root, file), 'utf8');
    for (const reference of references) assert.ok(text.includes(reference), `${file}: ${reference}`);
  }

  const onboardingReference = await readFile(
    path.join(root, 'erduo-broll-loop-engineering', 'references', 'first-run-onboarding.md'),
    'utf8',
  );
  assert.match(onboardingReference, /`unsupported`: a required backend or runtime capability/u);
  const directorSkill = await readFile(
    path.join(root, 'erduo-broll-loop-engineering', 'stages', 'broll-director', 'SKILL.md'),
    'utf8',
  );
  assert.match(directorSkill, /parent Skill's bundled\s+`scripts\/validate-shot-recipes\.mjs`/u);
  const renderSkill = await readFile(
    path.join(root, 'erduo-broll-loop-engineering', 'stages', 'broll-render', 'SKILL.md'),
    'utf8',
  );
  assert.match(renderSkill, /optional prior approval evidence/u);
  assert.match(renderSkill, /dispatches a different fresh\s+Render\/Delivery Agent/u);
  assert.match(renderSkill, /Recompute and compare the\s+Integrator's `composition-identity\.json`/u);
  assert.doesNotMatch(renderSkill, /- explicit user approval of the official final composition preview/u);
  const integratorSkill = await readFile(
    path.join(root, 'erduo-broll-loop-engineering', 'stages', 'broll-master-integrate', 'SKILL.md'),
    'utf8',
  );
  assert.match(integratorSkill, /aggregate SHA-256 of that canonical list/u);

  const hyperframesBuilderSkill = await readFile(
    path.join(root, 'erduo-broll-loop-engineering', 'stages', 'broll-master-build', 'SKILL.md'),
    'utf8',
  );
  assert.match(hyperframesBuilderSkill, /Prove the local motion mechanism before full authoring/u);
  assert.match(hyperframesBuilderSkill, /minimal disposable canary/u);
  assert.match(hyperframesBuilderSkill, /snapshots at two times/u);
  assert.match(hyperframesBuilderSkill, /nonblank, meaningfully different states/u);
  assert.match(hyperframesBuilderSkill, /not a new\s+stage, approval, aesthetic review/u);
  assert.match(hyperframesBuilderSkill, /Do not guess that GSAP, WAAPI, Anime\.js, CSS playback/u);
});

test('animation craft is prompt-time generation guidance, not a review schema', async () => {
  const craft = await readFile(
    path.join(root, 'erduo-broll-loop-engineering', 'references', 'animation-craft.md'),
    'utf8',
  );
  for (const principle of [
    'Squash and Stretch',
    'Anticipation',
    'Staging',
    'Straight Ahead Action and Pose to Pose',
    'Follow Through and Overlapping Action',
    'Slow In and Slow Out',
    'Arcs',
    'Secondary Action',
    'Timing',
    'Exaggeration',
    'Solid Drawing',
    'Appeal',
  ]) assert.match(craft, new RegExp(principle, 'u'), principle);
  assert.match(craft, /meaning[\s\S]*attention[\s\S]*body and material[\s\S]*causal action/u);
  assert.match(craft, /not a shot checklist, runtime capability taxonomy, evidence schema, or\s+still-frame review rubric/u);
  assert.match(craft, /must not claim to prove anticipation, weight, overlap, timing, arcs,\s+exaggeration, or appeal/u);

  const schema = await readFile(
    path.join(runtimeReferenceRoot, 'shot-recipe.schema.json'),
    'utf8',
  );
  const matrix = await readFile(
    path.join(runtimeReferenceRoot, 'capability-matrix.json'),
    'utf8',
  );
  for (const text of [schema, matrix]) {
    assert.doesNotMatch(text, /animationPrinciples|squash-stretch|anticipation-score/u);
  }
});

test('Remotion production contracts close silent-audio and local-font evidence', async () => {
  const backend = await readFile(
    path.join(root, 'erduo-broll-loop-engineering', 'references', 'remotion-backend.md'),
    'utf8',
  );
  const build = await readFile(
    path.join(root, 'erduo-broll-loop-engineering', 'stages', 'broll-remotion-build', 'SKILL.md'),
    'utf8',
  );
  const integrate = await readFile(
    path.join(root, 'erduo-broll-loop-engineering', 'stages', 'broll-remotion-integrate', 'SKILL.md'),
    'utf8',
  );
  const render = await readFile(
    path.join(root, 'erduo-broll-loop-engineering', 'stages', 'broll-remotion-render', 'SKILL.md'),
    'utf8',
  );
  const verifier = await readFile(
    path.join(root, 'erduo-broll-loop-engineering', 'scripts', 'remotion-verify.mjs'),
    'utf8',
  );
  for (const [name, text] of [
    ['backend', backend],
    ['build', build],
    ['integrate', integrate],
    ['render', render],
  ]) {
    assert.match(text, /--muted/u, name);
    assert.match(text, /zero\s+audio\s+streams|no\s+audio\s+stream/u, name);
    assert.match(text, /durationInFrames\s*\/\s*fps|exact\s+frame\s+duration/u, name);
  }
  assert.match(backend, /Generic or host\s+system fallbacks/u);
  assert.match(build, /manifest role `font`/u);
  assert.match(verifier, /manifest lists no project-local font/u);
  assert.match(verifier, /Generic or host-system font fallback is forbidden/u);
  assert.match(verifier, /no explicit project-local font loader/u);
  assert.match(verifier, /Font shorthand is forbidden/u);
  assert.match(verifier, /optionalDependencies/u);
  assert.match(verifier, /Linked lock package is forbidden/u);
});

test('Remotion version policy accepts changing exact project locks and rejects drift', () => {
  for (const remotionVersion of ['4.0.455', '4.0.484', '5.2.1']) {
    const dependencies = {
      remotion: remotionVersion,
      '@remotion/cli': remotionVersion,
      react: '19.2.7',
      'react-dom': '19.2.7',
      '@types/react': '19.2.17',
      typescript: '6.0.3',
    };
    const errors = [];
    validateRemotionVersionPolicy(dependencies, dependencies, errors);
    assert.deepEqual(errors, [], remotionVersion);
  }

  const errors = [];
  validateRemotionVersionPolicy({
    remotion: '^4.0.500',
    '@remotion/cli': '4.0.501',
    react: '19.2.7',
    'react-dom': '19.2.6',
    '@types/react': '19.2.17',
    typescript: '6.0.3',
  }, {}, errors);
  assert.ok(errors.some((error) => /remotion must use an exact semver/u.test(error)));
  assert.ok(errors.some((error) => /remotion and @remotion\/cli must use the same exact/u.test(error)));
  assert.ok(errors.some((error) => /react and react-dom must use the same exact/u.test(error)));
});

test('Remotion verifier binds HTML-in-canvas capability to version, source, and GL config', () => {
  const baseManifest = {
    packageVersions: { remotion: '4.0.455' },
    shots: [{ requiredCapabilities: ['effects.dom-pixel-postprocess'] }],
    runtimeFeatures: {
      htmlInCanvas: {
        paintBackends: ['canvas-2d'],
        nested: false,
        chromiumOpenGlRenderer: 'browser-default',
      },
    },
  };
  const canvasContents = new Map([[
    'src/Effect.tsx',
    Buffer.from("import {HtmlInCanvas} from 'remotion'; export const Effect=()=> <HtmlInCanvas width={1} height={1} onPaint={({canvas})=>canvas.getContext('2d')}><div /></HtmlInCanvas>;"),
  ]]);
  const canvasErrors = [];
  validateHtmlInCanvasFeature(baseManifest, canvasContents, new Map(), canvasErrors);
  assert.deepEqual(canvasErrors, []);

  const webGlManifest = {
    ...baseManifest,
    packageVersions: { remotion: '4.1.0' },
    runtimeFeatures: {
      htmlInCanvas: {
        paintBackends: ['webgl2'],
        nested: false,
        chromiumOpenGlRenderer: 'angle',
      },
    },
  };
  const webGlContents = new Map([
    ['src/Effect.tsx', Buffer.from("import {HtmlInCanvas} from 'remotion'; export const Effect=()=> <HtmlInCanvas width={1} height={1} onInit={({canvas})=>{canvas.getContext('webgl2'); return ()=>{};}}><div /></HtmlInCanvas>;")],
    ['remotion.config.ts', Buffer.from("Config.setChromiumOpenGlRenderer('angle');\n")],
  ]);
  const webGlErrors = [];
  validateHtmlInCanvasFeature(
    webGlManifest,
    webGlContents,
    new Map([['remotion.config.ts', { path: 'remotion.config.ts', role: 'config' }]]),
    webGlErrors,
  );
  assert.deepEqual(webGlErrors, []);

  const invalidErrors = [];
  validateHtmlInCanvasFeature(
    { ...baseManifest, packageVersions: { remotion: '4.0.454' } },
    canvasContents,
    new Map(),
    invalidErrors,
  );
  assert.ok(invalidErrors.some((error) => /requires Remotion 4\.0\.455 or newer/u.test(error)));
});

test('Remotion font verifier rejects shorthand and host fallback before render', () => {
  const errors = [];
  validateFontClosure(
    new Map([[
      'src/Card.tsx',
      Buffer.from("export const Card = () => <div style={{font: '700 40px Arial, sans-serif'}}>x</div>;\n"),
    ]]),
    new Map(),
    errors,
  );
  assert.deepEqual(errors, [
    'Font shorthand is forbidden; declare fontFamily or font-family explicitly',
    'Source declares a font family but manifest lists no project-local font',
    'Generic or host-system font fallback is forbidden; bind the declared project-local font explicitly',
    'Source declares a font family but has no explicit project-local font loader',
  ]);
});

test('Remotion project closure cannot hide production files in output-named directories', async (t) => {
  const state = await isolated(t);
  const project = path.join(state.base, 'project');
  await Promise.all([
    mkdir(path.join(project, '.git'), { recursive: true }),
    mkdir(path.join(project, 'node_modules'), { recursive: true }),
    mkdir(path.join(project, 'out'), { recursive: true }),
    mkdir(path.join(project, 'src', 'qa'), { recursive: true }),
    mkdir(path.join(project, 'stills'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(project, '.git', 'ignored'), 'git metadata\n'),
    writeFile(path.join(project, 'node_modules', 'ignored.js'), 'dependency\n'),
    writeFile(path.join(project, 'out', 'hidden.tsx'), 'export const hidden = Date.now();\n'),
    writeFile(path.join(project, 'src', 'qa', 'hidden.ts'), 'export const hidden = Math.random();\n'),
    writeFile(path.join(project, 'stills', 'evidence.png'), 'not a real png\n'),
  ]);
  const walked = await walkRemotionProject(project);
  assert.deepEqual(walked.errors, []);
  assert.deepEqual(walked.found.toSorted(), [
    'out/hidden.tsx',
    'src/qa/hidden.ts',
    'stills/evidence.png',
  ]);
});

test('every production command surface requires a portable case-insensitive child environment map', async () => {
  const files = [
    'erduo-broll-loop-engineering/SKILL.md',
    'erduo-broll-loop-engineering/references/stage-orchestration.md',
    'erduo-broll-loop-engineering/references/prompt-first-workflow.md',
    'erduo-broll-loop-engineering/stages/broll-onboarding/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-director/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-assets/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-master-build/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-master-integrate/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-render/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-shot-export/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-remotion-build/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-remotion-integrate/SKILL.md',
    'erduo-broll-loop-engineering/stages/broll-remotion-render/SKILL.md',
  ];
  for (const file of files) {
    const text = await readFile(path.join(root, file), 'utf8');
    assert.match(
      text,
      /(?:explicit\s+(?:host-native\s+)?(?:environment|child)\s+map|explicit child environment map)/u,
      file,
    );
    assert.match(text, /case(?: |-)(?:variant|folded|insensitive)/iu, file);
    assert.match(text, /PEXELS_API_KEY/u, file);
    assert.match(text, /HYPERFRAMES_NO_TELEMETRY=1/u, file);
    assert.match(text, /stop(?:s)?\s+before\s+spawn/u, file);
  }
  const onboarding = await readFile(
    path.join(root, 'erduo-broll-loop-engineering', 'references', 'first-run-onboarding.md'),
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
  const additionalSources = await createOfficialSourceFixture(appDir);
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
    additionalSources,
    finalize: async (entries) => {
      manifest = await manifestFor(entries, repoRoot);
      await atomicWriteJson(path.join(appDir, 'install-manifest.json'), manifest);
    },
  });
  assert.equal(records.length, INSTALL_SKILL_NAMES.length * 2);
  assert.equal(records.filter((entry) => entry.backup).length, 1);
  assert.equal((await lstat(occupied)).isSymbolicLink(), true);
  const result = await runUninstall({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
    appDir,
    repoRoot,
  });
  assert.equal(result.removed, INSTALL_SKILL_NAMES.length * 2);
  assert.equal(result.restored, 1);
  assert.equal(await readFile(path.join(occupied, 'old.txt'), 'utf8'), 'preserve me\n');
  assert.equal(await entryExists(path.join(appDir, 'install-manifest.json')), false);
  assert.equal(await entryExists(path.join(appDir, 'uninstall-receipt.json')), true);
  const receipt = JSON.parse(await readFile(path.join(appDir, 'uninstall-receipt.json'), 'utf8'));
  assert.equal(receipt.remotion_projects_preserved, true);
  assert.equal(JSON.stringify(receipt).includes(state.homeDir), false);
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
    additionalSources,
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

test('install manifest schemas 1 through 4 remain strict migration inputs for schema 5', async (t) => {
  const state = await isolated(t);
  const repoRoot = await createSkillFixture(state.base);
  const canonicalRepoRoot = await realpath(repoRoot);
  const appDir = applicationDataDir({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
  });
  const hosts = [
    { host: 'codex', root: path.join(state.homeDir, '.codex', 'skills') },
    { host: 'claude-code', root: path.join(state.homeDir, '.claude', 'skills') },
  ];
  const recordsFor = (names, {
    parentName = LEGACY_APP_NAME,
    skillRootName = LEGACY_APP_NAME,
  } = {}) => hosts.flatMap(({ host, root: hostRoot }) => names.map((name) => ({
    host,
    name,
    source: HYPERFRAMES_SKILL_NAMES.includes(name)
      ? path.join(appDir, 'official-skills', HYPERFRAMES_SKILLS_COMMIT, 'skills', name)
      : (name === parentName
        ? path.join(canonicalRepoRoot, skillRootName)
        : path.join(canonicalRepoRoot, skillRootName, 'stages', name)),
    target: path.join(hostRoot, name),
    backup: null,
    action: 'linked',
  })));
  const schema1 = {
    schema_version: 1,
    repo_root: canonicalRepoRoot,
    records: recordsFor(LEGACY_SKILL_NAMES),
  };
  const schema2Names = [...HYPERFRAMES_SKILL_NAMES, ...LEGACY_SKILL_NAMES];
  const schema2 = {
    schema_version: 2,
    repo_root: canonicalRepoRoot,
    records: recordsFor(schema2Names),
  };
  const schema3Names = [...HYPERFRAMES_SKILL_NAMES, ...V3_SKILL_NAMES];
  const schema3 = {
    schema_version: 3,
    repo_root: canonicalRepoRoot,
    records: recordsFor(schema3Names),
  };
  const schema4 = {
    schema_version: 4,
    repo_root: canonicalRepoRoot,
    records: recordsFor([...HYPERFRAMES_SKILL_NAMES, ...V4_SKILL_NAMES], {
      parentName: APP_NAME,
      skillRootName: APP_NAME,
    }),
  };
  assert.equal(validateInstallManifest(schema1, {
    repoRoot: canonicalRepoRoot,
    appDir,
    homeDir: state.homeDir,
  }).records.length, 16);
  assert.equal(validateInstallManifest(schema2, {
    repoRoot: canonicalRepoRoot,
    appDir,
    homeDir: state.homeDir,
  }).records.length, 32);
  assert.equal(validateInstallManifest(schema3, {
    repoRoot: canonicalRepoRoot,
    appDir,
    homeDir: state.homeDir,
  }).records.length, 38);
  assert.equal(validateInstallManifest(schema4, {
    repoRoot: canonicalRepoRoot,
    appDir,
    homeDir: state.homeDir,
  }).records.length, 38);
  assert.throws(() => validateInstallManifest({
    ...schema2,
    records: [...schema2.records, ...recordsFor([REMOTION_SKILL_NAMES[0]])],
  }, {
    repoRoot: canonicalRepoRoot,
    appDir,
    homeDir: state.homeDir,
  }), (error) => error?.code === 'install_manifest_invalid');
});

test('schema 3 rename migration rebinds stages and safely retires the old parent Skill', async (t) => {
  const state = await isolated(t);
  const repoRoot = await createSkillFixture(state.base);
  const appDir = applicationDataDir({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
  });
  const additionalSources = await createOfficialSourceFixture(appDir);
  const previousManifest = await createLegacyV3Installation({
    repoRoot,
    appDir,
    homeDir: state.homeDir,
  });
  let currentManifest;
  const records = await installSkillLinks({
    repoRoot,
    appDir,
    homeDir: state.homeDir,
    previousManifest,
    additionalSources,
    timestamp: 'rename-success',
    finalize: async (entries) => {
      currentManifest = await manifestFor(entries, repoRoot);
    },
  });
  assert.equal(records.length, INSTALL_SKILL_NAMES.length * 2);
  assert.equal(currentManifest.schema_version, 5);
  assert.equal(validateInstallManifest(currentManifest, {
    repoRoot: await realpath(repoRoot),
    appDir,
    homeDir: state.homeDir,
  }).records.length, INSTALL_SKILL_NAMES.length * 2);

  const codexRoot = path.join(state.homeDir, '.codex', 'skills');
  const claudeRoot = path.join(state.homeDir, '.claude', 'skills');
  assert.equal(
    await readFile(path.join(codexRoot, LEGACY_APP_NAME, 'preserved.txt'), 'utf8'),
    'pre-rename parent Skill\n',
  );
  assert.equal(await entryExists(path.join(claudeRoot, LEGACY_APP_NAME)), false);
  for (const hostRoot of [codexRoot, claudeRoot]) {
    assert.equal((await lstat(path.join(hostRoot, APP_NAME))).isSymbolicLink(), true);
    assert.equal(
      await realpath(path.join(hostRoot, 'broll-director')),
      path.join(await realpath(repoRoot), APP_NAME, 'stages', 'broll-director'),
    );
  }
});

test('failed schema 3 rename migration restores every old link and backup', async (t) => {
  const state = await isolated(t);
  const repoRoot = await createSkillFixture(state.base);
  const appDir = applicationDataDir({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
  });
  const additionalSources = await createOfficialSourceFixture(appDir);
  const previousManifest = await createLegacyV3Installation({
    repoRoot,
    appDir,
    homeDir: state.homeDir,
  });
  await assert.rejects(
    installSkillLinks({
      repoRoot,
      appDir,
      homeDir: state.homeDir,
      previousManifest,
      additionalSources,
      timestamp: 'rename-rollback',
      finalize: async () => {
        throw new Error('rename finalize canary');
      },
    }),
    /rename finalize canary/u,
  );
  for (const hostRoot of [
    path.join(state.homeDir, '.codex', 'skills'),
    path.join(state.homeDir, '.claude', 'skills'),
  ]) {
    assert.equal(await entryExists(path.join(hostRoot, APP_NAME)), false);
    assert.equal(
      path.resolve(
        hostRoot,
        await readlink(path.join(hostRoot, LEGACY_APP_NAME)),
      ),
      path.join(await realpath(repoRoot), LEGACY_APP_NAME),
    );
    assert.equal(
      path.resolve(
        hostRoot,
        await readlink(path.join(hostRoot, 'broll-director')),
      ),
      path.join(await realpath(repoRoot), LEGACY_APP_NAME, 'stages', 'broll-director'),
    );
  }
  const backup = previousManifest.records.find((record) => (
    record.host === 'codex' && record.name === LEGACY_APP_NAME
  )).backup;
  assert.equal(await readFile(path.join(backup, 'preserved.txt'), 'utf8'), 'pre-rename parent Skill\n');
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
      const source = name === 'erduo-broll-loop-engineering'
        ? path.join(repoRoot, 'erduo-broll-loop-engineering')
        : path.join(repoRoot, 'erduo-broll-loop-engineering', 'stages', name);
      await symlink(await realpath(source), path.join(hostRoot, name), 'dir');
    }
  }
  const calls = [];
  const envCredential = ['fixture', 'env', 'credential'].join('-');
  const runner = async (_command, args, options) => {
    assert.equal(options.env.PEXELS_API_KEY, undefined);
    assert.equal(options.env.HYPERFRAMES_NO_TELEMETRY, '1');
    calls.push(args);
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
  const skillsCheck = calls.find((args) => args.includes('skills') && args.includes('check'));
  const pinnedSkillSource = officialSkillBundleRoot(appDir);
  assert.deepEqual(skillsCheck, [
    cli,
    'skills',
    'check',
    '--dir',
    path.join(pinnedSkillSource, 'skills'),
    '--source',
    pinnedSkillSource,
    '--json',
  ]);
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
    'erduo-broll-loop-engineering',
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
  const additionalSources = await createOfficialSourceFixture(appDir);
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
    additionalSources,
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
    additionalSources,
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
  const additionalSources = await createOfficialSourceFixture(appDir);
  const manifestFile = path.join(appDir, 'install-manifest.json');
  await installSkillLinks({
    repoRoot,
    appDir,
    homeDir: state.homeDir,
    approveOccupied: true,
    timestamp: 'dangling',
    additionalSources,
    finalize: async (entries) => {
      await atomicWriteJson(manifestFile, await manifestFor(entries, repoRoot));
    },
  });
  const source = path.join(
    repoRoot,
    'erduo-broll-loop-engineering',
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
  const occupiedSkill = path.join(
    state.homeDir,
    '.codex',
    'skills',
    'erduo-broll-loop-engineering',
  );
  await mkdir(occupiedSkill, { recursive: true });
  await writeFile(path.join(occupiedSkill, 'preserved.txt'), 'pre-existing Skill\n', 'utf8');
  const calls = [];
  const processCanary = ['child', 'process', 'canary'].join('-');
  let ffmpegInstalled = false;
  const runner = async (command, args, options) => {
    assert.equal(options.env.PEXELS_API_KEY, undefined);
    assert.equal(options.env.HYPERFRAMES_NO_TELEMETRY, '1');
    calls.push({ command, args, options });
    if (args.includes('ci') && args.includes('--ignore-scripts')) {
      await writeMockPinnedRuntime(appDir);
      return { code: 0, stdout: '', stderr: '' };
    }
    const pinned = await mockPinnedOfficialCommand(command, args, options);
    if (pinned) return pinned;
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
  assert.equal(report.official_skill_links, HYPERFRAMES_SKILL_NAMES.length * 2);
  assert.equal(report.total_skill_links, INSTALL_SKILL_NAMES.length * 2);
  assert.equal(report.backed_up, 1);
  assert.equal(report.inherited_backups, 0);
  assert.equal(report.official_doctor_selected_local_render_ready, true);
  assert.equal(report.official_skills_commit, HYPERFRAMES_SKILLS_COMMIT);
  const stagedAdd = calls.find(({ args }) => args[1] === 'add' && args.includes('--full-depth'));
  assert.ok(stagedAdd);
  assert.notEqual(stagedAdd.options.env.HOME, state.homeDir);
  assert.equal(stagedAdd.options.env.HOME.startsWith(appDir), true);
  assert.equal(stagedAdd.options.env.CODEX_HOME.startsWith(stagedAdd.options.env.HOME), true);
  assert.equal(stagedAdd.options.env.CLAUDE_CONFIG_DIR.startsWith(stagedAdd.options.env.HOME), true);
  assert.equal(calls.some(({ args }) => args[1] === 'add' && args.includes('--full-depth')), true);
  assert.equal(calls.some(({ args }) => args.includes('skills') && args.includes('update')), false);
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
  const npmCall = calls.find(({ args }) => args.includes('ci'));
  assert.ok(npmCi);
  assert.equal(npmCi.includes('--ignore-scripts'), true);
  assert.equal(npmCi.includes('--prefix'), false);
  assert.equal(npmCall.options.cwd, path.join(appDir, 'runtime'));
  assert.equal(npmCi.includes('install'), false);
  const manifest = JSON.parse(await readFile(path.join(appDir, 'install-manifest.json'), 'utf8'));
  assert.equal(manifest.schema_version, 5);
  assert.equal(manifest.records.length, INSTALL_SKILL_NAMES.length * 2);
  for (const name of HYPERFRAMES_SKILL_NAMES) {
    for (const hostRoot of [
      path.join(state.homeDir, '.codex', 'skills'),
      path.join(state.homeDir, '.claude', 'skills'),
    ]) {
      const target = path.join(hostRoot, name);
      assert.equal((await lstat(target)).isSymbolicLink(), true);
    }
  }
  const rerun = await runInstall({
    repoRoot,
    homeDir: state.homeDir,
    env: state.env,
    platform: 'darwin',
    appDir,
    runner,
    npmCli: mockNpmCli,
  });
  assert.equal(rerun.backed_up, 0);
  assert.equal(rerun.inherited_backups, 1);
});

test('pinned official Skill staging rejects commit drift without writing host Skill roots', async (t) => {
  const state = await isolated(t);
  const appDir = applicationDataDir({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
  });
  await mkdir(appDir, { recursive: true });
  const runner = async (command, args, options) => {
    assert.notEqual(options.env.HOME, state.homeDir);
    const mocked = await mockPinnedOfficialCommand(command, args, options);
    if (command === 'git' && args.includes('rev-parse')) {
      return { code: 0, stdout: `${'0'.repeat(40)}\n`, stderr: '' };
    }
    return mocked ?? { code: 0, stdout: '', stderr: '' };
  };
  await assert.rejects(
    preparePinnedOfficialSkills({
      cli: path.join(appDir, 'runtime', 'mock-hyperframes.js'),
      appDir,
      homeDir: state.homeDir,
      env: state.env,
      runner,
    }),
    (error) => error?.code === 'hyperframes_skills_commit_mismatch',
  );
  for (const rootName of ['.codex', '.claude', '.agents']) {
    assert.equal(await entryExists(path.join(state.homeDir, rootName, 'skills')), false);
  }
  assert.equal(await entryExists(path.join(appDir, 'official-skills')), false);
  assert.equal(
    (await readdir(appDir)).some((name) => name.startsWith('.official-skills-stage-')),
    false,
  );
});

test('pinned official Skill staging rejects symbolic links before the host transaction', async (t) => {
  const state = await isolated(t);
  const appDir = applicationDataDir({
    platform: 'darwin',
    homeDir: state.homeDir,
    env: state.env,
  });
  await mkdir(appDir, { recursive: true });
  const outside = path.join(state.base, 'outside-skill.md');
  await writeFile(outside, 'outside\n', 'utf8');
  const runner = async (command, args, options) => {
    if (command === 'git' && args[0] === 'init') {
      return mockPinnedOfficialCommand(command, args, options);
    }
    if (command === 'git' && args.includes('rev-parse')) {
      return { code: 0, stdout: `${HYPERFRAMES_SKILLS_COMMIT}\n`, stderr: '' };
    }
    if (args[1] === 'add') {
      const store = path.join(options.env.HOME, '.agents', 'skills');
      for (const name of HYPERFRAMES_SKILL_NAMES) {
        const skill = path.join(store, name);
        await mkdir(skill, { recursive: true });
        if (name === 'hyperframes') await symlink(outside, path.join(skill, 'SKILL.md'));
        else await writeFile(path.join(skill, 'SKILL.md'), `---\nname: ${name}\n---\n`, 'utf8');
      }
      return { code: 0, stdout: '', stderr: '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  };
  await assert.rejects(
    preparePinnedOfficialSkills({
      cli: path.join(appDir, 'runtime', 'mock-hyperframes.js'),
      appDir,
      homeDir: state.homeDir,
      env: state.env,
      runner,
    }),
    (error) => error?.code === 'official_skill_bundle_unsafe',
  );
  assert.equal(await entryExists(path.join(appDir, 'official-skills')), false);
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
          await writeMockPinnedRuntime(appDir);
          return { code: 0, stdout: '', stderr: '' };
        }
        const pinned = await mockPinnedOfficialCommand(command, args, options);
        if (pinned) return pinned;
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
  assert.equal(
    await entryExists(path.join(root, 'SHA256SUMS.txt')),
    RELEASE_PACKAGE_MODE,
  );
  const textFiles = (await listPublicReleaseFiles()).filter(
    (file) => !/^\.(?:gif|jpe?g|png|webp)$/u.test(path.extname(file).toLowerCase()),
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
  ];
  for (const marker of forbidden) assert.equal(text.includes(marker), false, marker);

  const sourceMarker = ['video','-shotcraft'].join('');
  const sourceFiles = [];
  for (const file of textFiles) {
    if ((await readFile(file, 'utf8')).toLowerCase().includes(sourceMarker)) {
      sourceFiles.push(path.relative(root, file));
    }
  }
  const expectedSourceFiles = [
    'CHANGELOG.md',
    'README.md',
    'RELEASE-CHECKLIST.md',
    'SUPPORT-MATRIX.md',
    'THIRD-PARTY-NOTICES.md',
    'erduo-broll-loop-engineering/references/runtime/shot-pattern.schema.json',
    'erduo-broll-loop-engineering/references/shotcraft/catalog.json',
    'erduo-broll-loop-engineering/references/shotcraft/manifest.json',
    'erduo-broll-loop-engineering/references/remotion-backend.md',
    'erduo-broll-loop-engineering/references/shotcraft/remotion-sources/SOURCE.md',
    'erduo-broll-loop-engineering/references/shotcraft/remotion-sources/index.json',
    'erduo-broll-loop-engineering/references/shotcraft/remotion-sources/manifest.json',
    'scripts/package-release.mjs',
    'scripts/test.mjs',
  ];
  if (!RELEASE_PACKAGE_MODE) expectedSourceFiles.push(
    'scripts/sync-video-shotcraft.mjs',
    'scripts/sync-video-shotcraft-remotion.mjs',
  );
  if (RELEASE_PACKAGE_MODE) expectedSourceFiles.push('SHA256SUMS.txt');
  assert.deepEqual(sourceFiles.toSorted(), expectedSourceFiles.toSorted());
});

test('Node bootstrap uses only fixed v22.23.1 archive names and built-in macOS digests', async () => {
  const installer = await readFile(path.join(root, 'Install.command'), 'utf8');
  assert.equal(isSupportedNodeVersion('22.19.9'), false);
  assert.equal(isSupportedNodeVersion('22.20.0'), true);
  assert.equal(isSupportedNodeVersion('22.23.1'), true);
  assert.equal(isSupportedNodeVersion('23.0.0'), true);
  assert.equal(isSupportedNodeVersion('invalid'), false);
  assert.match(installer, /NODE_MIN_VERSION='22\.20\.0'/u);
  assert.match(installer, /NODE_VERSION='22\.23\.1'/u);
  assert.match(installer, /node_supported/u);
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

test('installer resolves npm from the selected Node sibling symlink used by Homebrew', async (t) => {
  const state = await isolated(t);
  const bin = path.join(state.base, 'runtime', 'bin');
  const npmCli = path.join(state.base, 'npm', 'bin', 'npm-cli.js');
  const nodeExecutable = path.join(bin, 'node');
  await mkdir(bin, { recursive: true });
  await mkdir(path.dirname(npmCli), { recursive: true });
  await writeFile(nodeExecutable, 'node fixture\n');
  await writeFile(npmCli, 'npm fixture\n');
  await symlink(npmCli, path.join(bin, 'npm'));
  assert.equal(
    await npmCliPath({ env: {}, execPath: nodeExecutable }),
    await realpath(npmCli),
  );
  await assert.rejects(
    npmCliPath({ env: {}, execPath: path.join(state.base, 'missing', 'node') }),
    (error) => error?.code === 'npm_unavailable',
  );
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
    '  -e) label=node-version ;;',
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
  assert.deepEqual(rows.map(([label]) => label), ['node-version', 'install', 'config']);
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
  assert.equal(report.raw_archive.regular, RELEASE_FILES.length + 1);
  assert.equal(report.raw_archive.appledouble, 0);
});

test('raw tar verifier rejects a valid-checksum AppleDouble member hidden from list views', async (t) => {
  const state = await isolated(t);
  const packageName = `erduo-broll-loop-engineering-${RELEASE_VERSION}`;
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
  const packageName = `erduo-broll-loop-engineering-${RELEASE_VERSION}`;
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

test('runtime lock pins the complete HyperFrames and Skills CLI graph with integrity', async () => {
  const publicPackage = JSON.parse(await readFile(path.join(root, 'package.json')));
  const packageJson = JSON.parse(await readFile(path.join(root, 'runtime', 'package.json')));
  const lock = JSON.parse(await readFile(path.join(root, 'runtime', 'package-lock.json')));
  assert.doesNotThrow(() => validateRuntimeLock(packageJson, lock));
  assert.equal(RELEASE_VERSION, '0.7.0');
  assert.equal(publicPackage.version, RELEASE_VERSION);
  assert.equal(packageJson.version, RELEASE_VERSION);
  assert.equal(lock.version, RELEASE_VERSION);
  assert.equal(lock.packages[''].version, RELEASE_VERSION);
  assert.equal(packageJson.dependencies.hyperframes, '0.7.104');
  assert.equal(packageJson.dependencies.skills, SKILLS_CLI_VERSION);
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.packages[''].dependencies.hyperframes, '0.7.104');
  assert.equal(lock.packages['node_modules/hyperframes'].version, '0.7.104');
  assert.equal(lock.packages['node_modules/skills'].version, SKILLS_CLI_VERSION);
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
    'node_modules/onnxruntime-node@1.21.1',
    'node_modules/protobufjs@7.6.5',
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
        lock.dependencies = { hyperframes: { version: '0.7.104' } };
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
          'http://registry.npmjs.org/hyperframes/-/hyperframes-0.7.104.tgz';
      },
    },
    {
      name: 'different-https-host',
      mutate(_packageJson, lock) {
        lock.packages[packageName].resolved =
          'https://example.invalid/hyperframes-0.7.104.tgz';
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
    regular: RELEASE_FILES.length + 1,
    directories: expectedArchiveDirectoryCount(),
    metadata: report.raw_archive.metadata,
    appledouble: 0,
    symlinks: 0,
    special: 0,
    checksum_entries: RELEASE_FILES.length,
  });
  const reproducibleArchive = path.join(state.base, 'release-reproducible.tar.gz');
  await buildRelease({ repoRoot: fixture, output: reproducibleArchive });
  assert.deepEqual(
    await readFile(reproducibleArchive),
    await readFile(archive),
    'canonical tar/gzip output must be byte-for-byte reproducible',
  );

  const fixtureManifestPath = path.join(
    fixture,
    'erduo-broll-loop-engineering',
    'references',
    'shotcraft',
    'manifest.json',
  );
  const originalManifestText = await readFile(fixtureManifestPath, 'utf8');
  const changedManifest = JSON.parse(originalManifestText);
  const changedRecord = changedManifest.cards[0];
  const changedCardPath = path.join(fixture, changedRecord.target);
  const originalCard = await readFile(changedCardPath);
  const changedCard = Buffer.concat([originalCard, Buffer.from('\nchanged together\n')]);
  changedRecord.bytes = changedCard.length;
  changedRecord.sha256 = createHash('sha256').update(changedCard).digest('hex');
  await writeFile(changedCardPath, changedCard);
  await writeFile(fixtureManifestPath, `${JSON.stringify(changedManifest, null, 2)}\n`);
  await assert.rejects(
    buildRelease({
      repoRoot: fixture,
      output: path.join(state.base, 'rejected-card-and-manifest-drift.tar.gz'),
    }),
    (error) => error?.code === 'release_shotcraft_manifest_invalid',
  );
  await writeFile(changedCardPath, originalCard);
  await writeFile(fixtureManifestPath, originalManifestText);

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
    'erduo-broll-loop-engineering',
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

test('old repository name remains only in the bounded migration surface', async () => {
  const oldName = ['erduo', 'hyperframes', 'broll'].join('-');
  const textFiles = (await listPublicReleaseFiles()).filter(
    (file) => !/^\.(?:gif|jpe?g|png|webp)$/u.test(path.extname(file).toLowerCase()),
  );
  const filesWithOldName = [];
  for (const file of textFiles) {
    if ((await readFile(file, 'utf8')).includes(oldName)) {
      filesWithOldName.push(path.relative(root, file));
    }
  }
  assert.deepEqual(filesWithOldName.toSorted(), [
    '.gitignore',
    'Install.command',
    'scripts/lib.mjs',
  ]);

  const readme = await readFile(path.join(root, 'README.md'), 'utf8');
  const parentSkill = await readFile(
    path.join(root, 'erduo-broll-loop-engineering', 'SKILL.md'),
    'utf8',
  );
  const packageMetadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const runtimeMetadata = JSON.parse(
    await readFile(path.join(root, 'runtime', 'package.json'), 'utf8'),
  );
  const openAiMetadata = await readFile(
    path.join(root, 'erduo-broll-loop-engineering', 'agents', 'openai.yaml'),
    'utf8',
  );
  assert.match(readme, /erduo1998-cell\/erduo-broll-loop-engineering/u);
  assert.doesNotMatch(readme, new RegExp(oldName, 'u'));
  assert.match(parentSkill, /^name: erduo-broll-loop-engineering$/mu);
  assert.equal(packageMetadata.name, 'erduo-broll-loop-engineering');
  assert.equal(runtimeMetadata.name, 'erduo-broll-loop-engineering-runtime');
  assert.match(openAiMetadata, /\$erduo-broll-loop-engineering/u);
});

test('private directory creation rejects an intermediate symbolic-link component', async (t) => {
  const state = await isolated(t);
  const library = path.join(state.homeDir, 'Library');
  const support = path.join(library, 'Application Support');
  const outside = path.join(state.base, 'outside-support');
  const outsideAppDir = path.join(outside, 'erduo-broll-loop-engineering');
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

test('public release source contains the parent plus thirteen prompt stage Skills', async () => {
  assert.ok(RELEASE_FILES.length > 206);
  const actualReleaseFiles = (await listPublicReleaseFiles())
    .map((file) => path.relative(root, file))
    .toSorted();
  assert.deepEqual(
    actualReleaseFiles,
    (RELEASE_PACKAGE_MODE
      ? [...RELEASE_FILES, 'SHA256SUMS.txt']
      : [...RELEASE_FILES, ...REPOSITORY_ONLY_FILES]).toSorted(),
  );
  assert.equal(SKILL_NAMES.length, 14);
  assert.deepEqual(AUTO_HYBRID_SKILL_NAMES, [
    'broll-runtime-plan',
    'broll-hybrid-integrate',
    'broll-hybrid-render',
  ]);
  assert.deepEqual(REMOTION_SKILL_NAMES, [
    'broll-remotion-build',
    'broll-remotion-integrate',
    'broll-remotion-render',
  ]);
  const skillRoot = path.join(root, 'erduo-broll-loop-engineering');
  const stageRoot = path.join(skillRoot, 'stages');
  const expectedStages = SKILL_NAMES.filter((name) => name !== 'erduo-broll-loop-engineering')
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
  assert.deepEqual(
    promptSurface,
    RELEASE_FILES
      .filter((file) => file.startsWith('erduo-broll-loop-engineering/'))
      .map((file) => file.slice('erduo-broll-loop-engineering/'.length))
      .toSorted(),
  );
  assert.equal(promptSurface.every((file) => (
    /\.(?:json|md|mjs|yaml)$/u.test(file)
      || (/\.(?:ts|tsx)$/u.test(file)
        && file.startsWith('references/shotcraft/remotion-sources/'))
  )), true);
  for (const name of SKILL_NAMES) {
    const file = name === 'erduo-broll-loop-engineering'
      ? path.join(skillRoot, 'SKILL.md')
      : path.join(stageRoot, name, 'SKILL.md');
    const contents = await readFile(file, 'utf8');
    assert.match(contents, /^---\n/u);
    assert.match(contents, new RegExp(`^name:\\s*${name}\\s*$`, 'mu'));
    assert.match(contents, /^description:\s*\S.+$/mu);
    const frontmatter = contents.match(/^---\n([\s\S]*?)\n---\n/u)?.[1];
    assert.ok(frontmatter, name);
    assert.deepEqual(
      frontmatter.split('\n').map((line) => line.split(':', 1)[0]).toSorted(),
      ['description', 'name'],
      name,
    );
  }

  assert.equal(REPOSITORY_ONLY_FILES.includes('.github/workflows/ci.yml'), true);
  if (!RELEASE_PACKAGE_MODE) {
    const workflow = await readFile(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
    assert.match(workflow, /actions\/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7\.0\.1/u);
    assert.match(workflow, /actions\/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7\.0\.0/u);
    assert.match(workflow, /run: npm test/u);
    assert.doesNotMatch(workflow, /uses:\s*[^\n]+@v\d+/u);
  }
});
