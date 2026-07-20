import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { MediaProbeError } from './probe-media.mjs';
import {
  AssetIndexError,
  collectAssetCandidates,
  indexUserAssets,
  mapLimit,
  orientationFor,
  parseIndexArgs,
  runIndexCli,
  semanticTokens,
  stableAssetId,
  toPosixRelative,
} from './index-user-assets.mjs';

function capture() {
  let value = '';
  return {
    stream: new Writable({ write(chunk, encoding, callback) { value += chunk.toString(); callback(); } }),
    value: () => value,
  };
}

function visualProbe({ duration = 1000, width = 1920, height = 1080, audio = 0, codec = 'h264', size = 123 } = {}) {
  return {
    size_bytes: size,
    duration_ms: duration,
    video: { count: 1, primary: { display_width: width, display_height: height, codec } },
    audio: { count: audio },
  };
}

async function makeRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broll-assets-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('indexes a mixed nested directory with stable sorting and isolated rejects', async (t) => {
  const root = await makeRoot(t);
  await fs.mkdir(path.join(root, 'nested'));
  await fs.mkdir(path.join(root, 'node_modules'));
  await fs.mkdir(path.join(root, 'deliverables'));
  await fs.writeFile(path.join(root, 'HeroShot.MP4'), 'x');
  await fs.writeFile(path.join(root, '产品截图.PNG'), 'x');
  await fs.writeFile(path.join(root, 'bad.mp4'), 'x');
  await fs.writeFile(path.join(root, 'nested', 'square.jpg'), 'x');
  await fs.writeFile(path.join(root, 'notes.txt'), 'ignored');
  await fs.writeFile(path.join(root, '.hidden.png'), 'ignored');
  await fs.writeFile(path.join(root, 'node_modules', 'skip.mp4'), 'ignored');
  await fs.writeFile(path.join(root, 'deliverables', 'skip.mp4'), 'ignored');
  await fs.symlink(path.join(root, 'HeroShot.MP4'), path.join(root, 'linked.mov'));

  const probe = async (absolute) => {
    const name = path.basename(absolute);
    await new Promise((resolve) => setTimeout(resolve, name === 'HeroShot.MP4' ? 8 : 1));
    if (name === 'bad.mp4') throw new MediaProbeError('probe_failed', 'probe', 'Media probe failed.');
    if (name === '产品截图.PNG') return visualProbe({ duration: null, width: 800, height: 1200, audio: 0, codec: 'png' });
    if (name === 'square.jpg') return visualProbe({ duration: null, width: 500, height: 500, audio: 0, codec: 'mjpeg' });
    return visualProbe();
  };

  const result = await indexUserAssets(root, { probe, limits: { concurrency: 3 } });
  assert.equal(result.candidate_count, 5);
  assert.equal(result.indexed_count, 3);
  assert.equal(result.rejected_count, 2);
  assert.deepEqual(result.assets.map((asset) => asset.relative_path), ['HeroShot.MP4', 'nested/square.jpg', '产品截图.PNG']);
  assert.deepEqual(result.rejected.map((item) => item.relative_path), ['bad.mp4', 'linked.mov']);
  assert.equal(result.assets[0].media_kind, 'video');
  assert.equal(result.assets[1].orientation, 'square');
  assert.equal(result.assets[2].media_kind, 'image');
  assert.equal(result.assets[2].orientation, 'portrait');
  assert.equal(JSON.stringify(result).includes(root), false);
});

test('empty valid directory succeeds', async (t) => {
  const root = await makeRoot(t);
  assert.deepEqual(await indexUserAssets(root, { probe: async () => assert.fail('no probe') }), {
    schema_version: 1,
    candidate_count: 0,
    indexed_count: 0,
    rejected_count: 0,
    assets: [],
    rejected: [],
  });
});

test('audio-only probe is rejected while visual siblings survive', async (t) => {
  const root = await makeRoot(t);
  await fs.writeFile(path.join(root, 'renamed.mp4'), 'x');
  await fs.writeFile(path.join(root, 'visual.mov'), 'x');
  const result = await indexUserAssets(root, {
    probe: async (absolute) => path.basename(absolute) === 'renamed.mp4'
      ? { size_bytes: 1, duration_ms: 1000, video: { count: 0, primary: null }, audio: { count: 1 } }
      : visualProbe(),
  });
  assert.equal(result.indexed_count, 1);
  assert.equal(result.rejected[0].code, 'not_visual');
});

test('stable IDs use normalized relative path and do not change with metadata', () => {
  assert.match(stableAssetId('folder/hero.mp4'), /^UA-[0-9a-f]{16}$/u);
  assert.equal(stableAssetId('folder/hero.mp4'), stableAssetId('folder/hero.mp4'));
  assert.notEqual(stableAssetId('folder/hero.mp4'), stableAssetId('folder/other.mp4'));
});

test('semantic tokens handle camel case, punctuation, digits, and Chinese bigrams', () => {
  const tokens = semanticTokens('产品素材/AIProductHero-2026_增长曲线.png');
  for (const expected of ['ai', 'product', 'hero', '2026', '产品素材', '产品', '品素', '素材', '增长曲线', '增长', '长曲', '曲线']) {
    assert.equal(tokens.includes(expected), true, expected);
  }
  const many = semanticTokens(`${Array.from({ length: 100 }, (_, i) => `token${i}`).join('-')}.png`);
  assert.equal(many.length, 64);
  assert.deepEqual([...many].sort(), many);
});

test('path and orientation helpers normalize deterministic values', () => {
  assert.equal(toPosixRelative('folder\\nested\\file.mp4'), 'folder/nested/file.mp4');
  assert.equal(orientationFor(1920, 1080), 'landscape');
  assert.equal(orientationFor(1080, 1920), 'portrait');
  assert.equal(orientationFor(1000, 1000), 'square');
});

test('mapLimit caps concurrency and preserves input order', async () => {
  let active = 0;
  let peak = 0;
  const output = await mapLimit([4, 3, 2, 1], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, value));
    active -= 1;
    return value * 10;
  });
  assert.equal(peak, 2);
  assert.deepEqual(output, [40, 30, 20, 10]);
});

test('candidate count, depth, and per-file size limits are enforced', async (t) => {
  const root = await makeRoot(t);
  await fs.writeFile(path.join(root, 'a.mp4'), 'xx');
  await fs.writeFile(path.join(root, 'b.png'), 'xx');
  await assert.rejects(
    collectAssetCandidates(root, { limits: { maxCandidates: 1 } }),
    (error) => error instanceof AssetIndexError && error.code === 'candidate_limit',
  );
  const sized = await collectAssetCandidates(root, { limits: { maxFileBytes: 1 } });
  assert.equal(sized.rejected.length, 2);
  assert.equal(sized.rejected.every((item) => item.code === 'asset_too_large'), true);

  const deepRoot = await makeRoot(t);
  await fs.mkdir(path.join(deepRoot, 'level'));
  await fs.writeFile(path.join(deepRoot, 'level', 'image.png'), 'x');
  await assert.rejects(
    collectAssetCandidates(deepRoot, { limits: { maxDepth: 0 } }),
    (error) => error.code === 'depth_limit',
  );
});

test('path containment rejects a malicious relative result', async () => {
  let lstatCount = 0;
  const fsImpl = {
    lstat: async () => {
      lstatCount += 1;
      return lstatCount === 1
        ? { isSymbolicLink: () => false, isDirectory: () => true }
        : { isSymbolicLink: () => false, isDirectory: () => false, isFile: () => true, size: 1 };
    },
    readdir: async () => [{ name: 'escape.png' }],
  };
  const maliciousPath = { ...path.posix, relative: () => '../escape.png' };
  await assert.rejects(
    collectAssetCandidates('/private/root', { fsImpl, pathImpl: maliciousPath, resolvePath: (value) => value }),
    (error) => error.code === 'path_escape' && !error.message.includes('/private/root'),
  );
});

test('root missing, file, symlink, and read failure return safe root errors', async (t) => {
  const root = await makeRoot(t);
  const file = path.join(root, 'file.txt');
  const link = path.join(root, 'link');
  await fs.writeFile(file, 'x');
  await fs.symlink(root, link);
  const missing = path.join(root, 'private-missing');
  for (const [value, code] of [[missing, 'root_not_found'], [file, 'invalid_root'], [link, 'invalid_root']]) {
    await assert.rejects(indexUserAssets(value), (error) => error.code === code && !error.message.includes(value));
  }
  await assert.rejects(
    indexUserAssets('/private/root', {
      fsImpl: {
        lstat: async () => ({ isSymbolicLink: () => false, isDirectory: () => true }),
        readdir: async () => { throw new Error('/private/root denied'); },
      },
      resolvePath: (value) => value,
    }),
    (error) => error.code === 'traversal_failed' && !error.message.includes('/private/root'),
  );
});

test('CLI parser and safe outputs have stable exit codes', async (t) => {
  assert.deepEqual(parseIndexArgs(['--help']), { help: true });
  assert.deepEqual(parseIndexArgs(['assets', '--pretty']), { root: 'assets', pretty: true });
  for (const args of [[], ['a', 'b'], ['a', '--json'], ['a', '--pretty', '--pretty']]) assert.equal(parseIndexArgs(args).error, true);

  const root = await makeRoot(t);
  const stdout = capture();
  assert.equal(await runIndexCli([root], { stdout: stdout.stream, indexOptions: { probe: async () => assert.fail('none') } }), 0);
  assert.equal(JSON.stringify(JSON.parse(stdout.value())).includes(root), false);

  const missingErr = capture();
  assert.equal(await runIndexCli(['/private/missing'], { stderr: missingErr.stream }), 2);
  assert.equal(missingErr.value().includes('/private/missing'), false);

  const usageErr = capture();
  assert.equal(await runIndexCli([], { stderr: usageErr.stream }), 64);
});
