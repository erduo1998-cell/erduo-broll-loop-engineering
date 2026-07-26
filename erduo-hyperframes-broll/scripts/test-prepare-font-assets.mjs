import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PrepareFontAssetsError, prepareFontAssets } from './prepare-font-assets.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');

async function fixture(t, { seedCache = true } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'prepare-font-assets-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bytes = Buffer.from('fixture-pinned-noto-font-bytes');
  const license = Buffer.from('SIL Open Font License fixture');
  const commit = 'a'.repeat(40);
  const manifest = {
    schema_version: 1,
    policy: { font_binaries_in_public_package: false },
    sources: [{
      font_id: 'noto-fixture-vf-1.0', family: 'Noto Fixture CJK SC', roles: ['information', 'display'], version: '1.0',
      repository: 'https://github.com/notofonts/fixture', commit, source_path: 'Fonts/NotoFixture-VF.ttf',
      download_url: `https://raw.githubusercontent.com/notofonts/fixture/${commit}/Fonts/NotoFixture-VF.ttf`, bytes: bytes.length, sha256: hash(bytes), format: 'ttf-variable',
      license_id: 'OFL-1.1', license_path: 'assets/licenses/OFL.txt', license_sha256: hash(license), commercial_use: true, redistribution: true,
    }],
  };
  const manifestPath = path.join(root, 'assets/fonts/source-manifest.json');
  const cacheDir = path.join(root, 'cache');
  const projectDir = path.join(root, 'project');
  await Promise.all([fs.mkdir(path.dirname(manifestPath), { recursive: true }), fs.mkdir(path.join(root, 'assets/licenses'), { recursive: true }), fs.mkdir(cacheDir, { recursive: true })]);
  await Promise.all([fs.writeFile(manifestPath, JSON.stringify(manifest)), fs.writeFile(path.join(root, 'assets/licenses/OFL.txt'), license)]);
  if (seedCache) await fs.writeFile(path.join(cacheDir, 'noto-fixture-vf-1.0.ttf'), bytes);
  const displayBytes = Buffer.from('fixture-user-display-font');
  const displayPath = path.join(root, 'local-licensed-display.ttf');
  const displayLicensePath = path.join(root, 'local-display-license.txt');
  await Promise.all([fs.writeFile(displayPath, displayBytes), fs.writeFile(displayLicensePath, 'Fixture display license\n')]);
  const displaySelection = { schema_version: 1, primary_visual_dna: 'fixture-dna', display_font_id: 'fixture-display', family: 'Fixture User Display', file_path: displayPath, license_id: 'Fixture-License', license_file_path: displayLicensePath, commercial_scope: 'user-confirmed-licensed', display_text: '重点 001' };
  return { root, manifestPath, cacheDir, projectDir, bytes, license, manifest, displayBytes, displaySelection };
}

test('uses a strictly verified local cache and copies real font/license bytes into the project', async (t) => {
  const value = await fixture(t);
  let fetched = false;
  const result = await prepareFontAssets({ ...value, roles: ['information'], visibleText: '耳总ABC', subsetter: null, fetchFn: async () => { fetched = true; } });
  assert.equal(fetched, false);
  assert.equal(result.font_package.fonts.length, 1);
  assert.equal(result.prepared_files.length, 1);
  assert.equal(result.prepared_files[0].subset_mode, 'full-verified-copy');
  assert.deepEqual(await fs.readFile(path.join(value.projectDir, result.prepared_files[0].path)), value.bytes);
  assert.deepEqual(await fs.readFile(path.join(value.projectDir, result.license_files[0].path)), value.license);
  assert.equal(result.font_package.fonts.every((font) => font.css.src.startsWith('./assets/fonts/') && font.css.fallbacks.length === 0), true);
});

test('requires one rights-confirmed local display selection and copies its verified bytes into the generated project', async (t) => {
  const value = await fixture(t);
  const result = await prepareFontAssets({ ...value, roles: ['information', 'display'], visibleText: '支持文字', subsetter: null, displaySelection: value.displaySelection, displayGlyphCoverage: async () => ({ missing_codepoints: [] }) });
  assert.equal(result.font_package.schema_version, 2);
  assert.deepEqual(result.font_package.display_selection, { schema_version: 1, primary_visual_dna: 'fixture-dna', display_font_id: 'fixture-display', display_text: '重点 001' });
  const display = result.font_package.fonts.find((font) => font.role === 'display');
  assert.equal(display.font_id, 'fixture-display');
  assert.equal(display.source_status, 'user-provided-local');
  assert.deepEqual(await fs.readFile(path.join(value.projectDir, 'assets/fonts/user-supplied/fixture-display.ttf')), value.displayBytes);
  await assert.rejects(() => prepareFontAssets({ ...value, roles: ['display'], visibleText: '重点', subsetter: null, displaySelection: undefined }), (error) => error.code === 'display_font_selection_required');
});

test('downloads only a pinned match and uses a deterministic injected subsetter when available', async (t) => {
  const value = await fixture(t, { seedCache: false });
  const subsetBytes = Buffer.from('deterministic-subset');
  let subsetInput;
  const requested = [];
  const result = await prepareFontAssets({
    ...value,
    roles: ['information'],
    visibleText: 'BAA中',
    fetchFn: async (url) => { requested.push(url); return { ok: true, arrayBuffer: async () => value.bytes }; },
    subsetter: async (input) => { subsetInput = input; return subsetBytes; },
  });
  assert.equal(subsetInput.codepoints, 'AB中');
  assert.deepEqual(requested, [value.manifest.sources[0].download_url]);
  assert.equal(result.prepared_files[0].subset_mode, 'deterministic-subset');
  assert.equal(result.prepared_files[0].sha256, hash(subsetBytes));
  assert.deepEqual(await fs.readFile(path.join(value.cacheDir, 'noto-fixture-vf-1.0.ttf')), value.bytes);
  assert.deepEqual(await fs.readFile(path.join(value.projectDir, result.prepared_files[0].path)), subsetBytes);
});

function githubApiFixture(value, { contents = {}, blob = {}, contentsHeaders } = {}) {
  const source = value.manifest.sources[0];
  const blobSha = 'b'.repeat(40);
  const apiRoot = 'https://api.github.com/repos/notofonts/fixture';
  const contentsUrl = `${apiRoot}/contents/${source.source_path}?ref=${source.commit}`;
  const blobUrl = `${apiRoot}/git/blobs/${blobSha}`;
  return {
    contentsUrl,
    blobUrl,
    contents: {
      type: 'file', path: source.source_path, size: source.bytes, sha: blobSha, url: contentsUrl,
      html_url: `https://github.com/notofonts/fixture/blob/${source.commit}/${source.source_path}`,
      git_url: blobUrl,
      ...contents,
    },
    blob: { sha: blobSha, url: blobUrl, encoding: 'base64', size: source.bytes, content: value.bytes.toString('base64'), ...blob },
    contentsHeaders,
  };
}

test('falls back from a raw network failure to commit-bound GitHub Contents and Blob APIs', async (t) => {
  const value = await fixture(t, { seedCache: false });
  const api = githubApiFixture(value);
  const calls = [];
  const result = await prepareFontAssets({
    ...value,
    roles: ['information'],
    subsetter: null,
    fetchFn: async (url, options) => {
      calls.push({ url, options });
      if (url === value.manifest.sources[0].download_url) throw new Error('raw timeout');
      if (url === api.contentsUrl) return { ok: true, json: async () => api.contents };
      if (url === api.blobUrl) return { ok: true, json: async () => api.blob };
      assert.fail(`unexpected URL ${url}`);
    },
  });
  assert.deepEqual(calls.map((item) => item.url), [value.manifest.sources[0].download_url, api.contentsUrl, api.blobUrl]);
  assert.equal(calls.slice(1).every((item) => item.options.headers.Accept === 'application/vnd.github+json' && !('Authorization' in item.options.headers)), true);
  assert.equal(result.prepared_files[0].acquisition, 'github-api');
  assert.deepEqual(await fs.readFile(path.join(value.projectDir, result.prepared_files[0].path)), value.bytes);
});

test('never falls back after a successful raw response whose pinned integrity check fails', async (t) => {
  const value = await fixture(t, { seedCache: false });
  const calls = [];
  const wrong = Buffer.alloc(value.bytes.length, 1);
  await assert.rejects(() => prepareFontAssets({ ...value, roles: ['information'], subsetter: null, fetchFn: async (url) => { calls.push(url); return { ok: true, arrayBuffer: async () => wrong }; } }), (error) => error.code === 'font_source_integrity');
  assert.deepEqual(calls, [value.manifest.sources[0].download_url]);
});

test('fails closed on GitHub metadata drift, bad base64, oversized response, and final hash mismatch', async (t) => {
  async function expectFallbackFailure(overrides, code) {
    const value = await fixture(t, { seedCache: false });
    const api = githubApiFixture(value, overrides);
    await assert.rejects(() => prepareFontAssets({
      ...value,
      roles: ['information'],
      subsetter: null,
      fetchFn: async (url) => {
        if (url === value.manifest.sources[0].download_url) throw new Error('raw unavailable');
        if (url === api.contentsUrl) return { ok: true, headers: api.contentsHeaders, json: async () => api.contents };
        if (url === api.blobUrl) return { ok: true, json: async () => api.blob };
        assert.fail(`unexpected URL ${url}`);
      },
    }), (error) => error instanceof PrepareFontAssetsError && error.code === code);
  }

  await expectFallbackFailure({ contents: { path: 'Fonts/Other.ttf' } }, 'font_github_metadata_invalid');
  await expectFallbackFailure({ contents: { html_url: `https://github.com/notofonts/fixture/blob/${'c'.repeat(40)}/Fonts/NotoFixture-VF.ttf` } }, 'font_github_metadata_invalid');
  await expectFallbackFailure({ blob: { content: '%%%=' } }, 'font_github_base64_invalid');
  await expectFallbackFailure({ contentsHeaders: { get: () => String(97 * 1024 * 1024) } }, 'font_github_response_oversize');
  const wrong = Buffer.alloc(Buffer.byteLength('fixture-pinned-noto-font-bytes'), 1);
  await expectFallbackFailure({ blob: { content: wrong.toString('base64') } }, 'font_source_integrity');
});

test('fails closed on corrupt cache, license mismatch, and an unsupported role', async (t) => {
  const corrupt = await fixture(t);
  await fs.writeFile(path.join(corrupt.cacheDir, 'noto-fixture-vf-1.0.ttf'), 'wrong');
  await assert.rejects(() => prepareFontAssets({ ...corrupt, roles: ['information'], subsetter: null }), (error) => error instanceof PrepareFontAssetsError && error.code === 'font_source_integrity');

  const license = await fixture(t);
  await fs.writeFile(path.join(license.root, 'assets/licenses/OFL.txt'), 'wrong');
  await assert.rejects(() => prepareFontAssets({ ...license, roles: ['information'], subsetter: null }), (error) => error.code === 'font_license_integrity');

  const role = await fixture(t);
  await assert.rejects(() => prepareFontAssets({ ...role, roles: ['technical'], subsetter: null }), (error) => error.code === 'font_role_unavailable');
});
