import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  parseArgs,
  runValidateReferenceLibrary,
  validateFile,
} from './validate-reference-library.mjs';

const REGISTRY_PATH = path.join(
  path.resolve(fileURLToPath(new URL('..', import.meta.url))),
  'reference-library',
  'registry.json',
);

function baseEntry(overrides = {}) {
  return {
    id: 'STY-001',
    category: 'styles',
    tags: ['层级', '留白'],
    capabilities: ['主焦点', '减少噪音'],
    summary: '用于强调单一信息主线。',
    source_boundary: {
      user_reference_priority: true,
      usage_mode: 'advisory',
      provenance: 'sanitized-abstract',
      content_handling: 'non-literal-only',
    },
    dependencies: [],
    validation_status: 'draft',
    relative_path: 'styles/style-soft-hierarchy.md',
    ...overrides,
  };
}

function minimalEntries() {
  return [
    baseEntry(),
    baseEntry({
      id: 'SCN-001',
      category: 'scene-logic',
      tags: ['主张', '对比'],
      capabilities: ['关系解释', '流程闭环'],
      summary: '场景逻辑用于将叙事转为可见关系。',
      relative_path: 'scene-logic/scene-logic-claim-contrast.md',
    }),
    baseEntry({
      id: 'CPT-001',
      category: 'components',
      tags: ['关系', '组件'],
      capabilities: ['关系可视化'],
      summary: '关系组件用于补充局部解释。',
      relative_path: 'components/component-data-band.md',
    }),
    baseEntry({
      id: 'MOT-001',
      category: 'motion',
      tags: ['节奏', '状态'],
      capabilities: ['状态递进'],
      summary: '轻动效用于可见状态推进。',
      relative_path: 'motion/motion-gentle-rise.md',
      dependencies: ['SCN-001'],
    }),
    baseEntry({
      id: 'CPS-001',
      category: 'compositing',
      tags: ['全屏', '回退'],
      capabilities: ['安全全屏'],
      summary: '在关系不足时使用全屏回退。',
      relative_path: 'compositing/compositing-fullscreen-safe.md',
      dependencies: ['CPT-001'],
    }),
    baseEntry({
      id: 'QLT-001',
      category: 'quality-gates',
      tags: ['对比度', '可读性'],
      capabilities: ['质量门检查'],
      summary: '质量门用于在交付前拦截不可读画面。',
      relative_path: 'quality-gates/quality-contrast-gate.md',
      dependencies: ['STY-001'],
    }),
  ];
}

function withFixture(entries, { skipWrite = new Set() } = {}) {
  let cleanup;
  return (async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'rf-lib-'));
    for (const rawEntry of entries) {
      const entry = structuredClone(rawEntry);
      const entryPath = path.resolve(root, entry.relative_path);
      if (!skipWrite.has(entry.relative_path) && !path.isAbsolute(entry.relative_path)) {
        await fs.mkdir(path.dirname(entryPath), { recursive: true });
        await fs.writeFile(entryPath, `# fixture ${entry.id}\n`, 'utf8');
      }
    }
    await fs.writeFile(
      path.join(root, 'registry.json'),
      JSON.stringify(entries, null, 2),
      'utf8',
    );
    cleanup = async () => rm(root, { recursive: true, force: true });
    return {
      root,
      registryPath: path.join(root, 'registry.json'),
      cleanup,
    };
  })();
}

test('schema parser accepts help and defaults', () => {
  assert.deepEqual(parseArgs(['--help']), { help: true });
  assert.deepEqual(parseArgs([]).registry_path, REGISTRY_PATH);
  assert.deepEqual(parseArgs(['--h']), { error: true });
});

test('normal validation passes on committed minimal library', async () => {
  const result = await validateFile(REGISTRY_PATH);
  assert.equal(result.entry_count > 0, true);
  assert.equal(result.categories.styles >= 2, true);
  assert.equal(result.categories.motion >= 2, true);
  assert.equal(result.categories['quality-gates'] >= 1, true);
});

test('boundary allows expandable categories and advisory source boundaries', async () => {
  const fixture = await withFixture([
    baseEntry(),
    baseEntry({ id: 'SCN-001', category: 'scene-logic', relative_path: 'scene-logic/a.md' }),
    baseEntry({ id: 'SCN-002', category: 'scene-logic', relative_path: 'scene-logic/b.md', dependencies: ['SCN-001'] }),
    baseEntry({ id: 'SCN-003', category: 'scene-logic', relative_path: 'scene-logic/c.md', dependencies: ['SCN-002'] }),
    baseEntry({ id: 'STY-002', category: 'styles', relative_path: 'styles/a.md', dependencies: ['STY-001'] }),
    baseEntry({ id: 'CPT-001', category: 'components', relative_path: 'components/a.md' }),
    baseEntry({ id: 'MOT-001', category: 'motion', relative_path: 'motion/a.md', dependencies: ['SCN-001'] }),
    baseEntry({ id: 'CPS-001', category: 'compositing', relative_path: 'compositing/a.md', dependencies: ['CPT-001', 'MOT-001'] }),
    baseEntry({ id: 'QLT-001', category: 'quality-gates', relative_path: 'quality-gates/a.md', dependencies: ['STY-001'] }),
  ]);
  try {
    const result = await validateFile(fixture.registryPath);
    assert.equal(result.entry_count, 9);
    assert.equal(result.categories.styles, 2);
    assert.equal(result.categories['scene-logic'], 3);
    assert.equal(result.categories['quality-gates'], 1);
  } finally {
    await fixture.cleanup();
  }
});

test('failure: missing registry file', async () => {
  await assert.rejects(
    () => validateFile('/tmp/no-such-registry.json'),
    (error) => error.code === 'read_failed',
  );
});

test('failure: absolute relative_path is rejected', async () => {
  const entries = minimalEntries().map((entry) => structuredClone(entry));
  entries[0].relative_path = '/tmp/style/escape.md';
  const fixture = await withFixture(entries);
  try {
    await assert.rejects(
      () => validateFile(fixture.registryPath),
      (error) => error.code === 'invalid_relative_path',
    );
  } finally {
    await fixture.cleanup();
  }
});

test('failure: private source leak is rejected', async () => {
  const entries = minimalEntries().map((entry) => structuredClone(entry));
  entries[1].summary = '来源于耳朵的ip 私有文案。';
  const fixture = await withFixture(entries);
  try {
    await assert.rejects(
      () => validateFile(fixture.registryPath),
      (error) => error.code === 'private_source_leak',
    );
  } finally {
    await fixture.cleanup();
  }
});

test('failure: registry content too heavy is rejected', async () => {
  const entries = minimalEntries().map((entry) => structuredClone(entry));
  entries[2].extra_key = 'not-allowed';
  const fixture = await withFixture(entries);
  try {
    await assert.rejects(
      () => validateFile(fixture.registryPath),
      (error) => error.code === 'invalid_entry',
    );
  } finally {
    await fixture.cleanup();
  }
});

test('failure: missing dependency is rejected', async () => {
  const entries = minimalEntries().map((entry) => structuredClone(entry));
  entries[3].dependencies = ['CPT-999'];
  const fixture = await withFixture(entries);
  try {
    await assert.rejects(
      () => validateFile(fixture.registryPath),
      (error) => error.code === 'missing_dependency',
    );
  } finally {
    await fixture.cleanup();
  }
});

test('CLI output is machine-readable and non-sensitive', async () => {
  const entries = minimalEntries().map((entry) => structuredClone(entry));
  const missingPath = 'components/missing.md';
  entries[2].relative_path = missingPath;
  const fixture = await withFixture(entries, { skipWrite: new Set([missingPath]) });
  const stderr = [];
  const stdout = [];
  try {
    const exitCode = await runValidateReferenceLibrary([fixture.registryPath], {
      stderr: { write: (chunk) => stderr.push(chunk.toString()) },
      stdout: { write: (chunk) => stdout.push(chunk.toString()) },
      readFile: async (file, encoding) => fs.readFile(file, encoding),
      stat: fs.stat,
    });
    assert.equal(exitCode, 2);
    const text = stderr.join('');
    assert.equal(text.includes('/Users/'), false);
    assert.equal(text.includes('/tmp'), false);
    assert.equal(stdout.join(''), '');
  } finally {
    await fixture.cleanup();
  }
});
