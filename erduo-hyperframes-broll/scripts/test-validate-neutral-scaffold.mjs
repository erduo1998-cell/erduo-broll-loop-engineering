import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { NeutralScaffoldError, validateNeutralScaffold } from './validate-neutral-scaffold.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(skillRoot, 'assets', 'hyperframes-template');
const scriptPath = path.join(skillRoot, 'scripts', 'validate-neutral-scaffold.mjs');
const execFileAsync = promisify(execFile);

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neutral-scaffold-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.cp(sourceRoot, root, { recursive: true });
  return root;
}

async function mutate(root, relative, change) {
  const file = path.join(root, relative);
  const before = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, change(before));
}

const rejects = async (promise, code) => assert.rejects(
  promise,
  (error) => error instanceof NeutralScaffoldError && error.code === code,
);

test('accepts the public structure-only neutral scaffold', async () => {
  const result = await validateNeutralScaffold(sourceRoot);
  assert.equal(result.schema_version, 1);
  assert.equal(result.pipeline_contract_version, 2);
  assert.equal(result.scaffold_profile, 'structure-only-neutral-v1');
  assert.deepEqual(result.root_profile, {
    composition_id: 'main',
    placeholder_duration_seconds: 1,
    width: 1920,
    height: 1080,
  });
  assert.deepEqual(result.runtime, {
    script_count: 0,
    style_link_count: 0,
    media_count: 0,
    remote_reference_count: 0,
  });
  assert.match(result.source_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.ok, true);
});

test('rejects remote or inline runtime, styles, media and network calls', async (t) => {
  for (const [snippet, code] of [
    ['<script src="https://example.test/runtime.js"></script>', 'runtime_forbidden'],
    ['<link rel="stylesheet" href="https://example.test/style.css">', 'runtime_forbidden'],
    ['<img src="./sample.png">', 'media_forbidden'],
    ['<script>fetch("./sample.json")</script>', 'runtime_forbidden'],
  ]) {
    const root = await fixture(t);
    await mutate(root, 'index.html', (value) => value.replace('</body>', `${snippet}</body>`));
    await rejects(validateNeutralScaffold(root), code);
  }
});

test('rejects gradients, glows, cards, grids and centered sample layouts', async (t) => {
  for (const [css, code] of [
    ['#root { background: radial-gradient(circle, #fff, #000); }', 'visual_signature'],
    ['.orb { box-shadow: 0 0 20px #fff; }', 'visual_signature'],
    ['.card { border-radius: 24px; }', 'visual_signature'],
    ['#root { display: grid; place-items: center; }', 'layout_topology'],
    ['#root { display: flex; justify-content: center; }', 'layout_topology'],
    ['#root { mask-image: linear-gradient(#000, transparent); }', 'visual_signature'],
  ]) {
    const root = await fixture(t);
    await mutate(root, 'index.html', (value) => value.replace('</style>', `${css}</style>`));
    await rejects(validateNeutralScaffold(root), code);
  }
});

test('rejects palette, font and readable placeholder content', async (t) => {
  const palette = await fixture(t);
  await mutate(palette, 'index.html', (value) => value.replace('background: transparent;', 'background: #090d18;'));
  await rejects(validateNeutralScaffold(palette), 'palette_forbidden');

  const font = await fixture(t);
  await mutate(font, 'index.html', (value) => value.replace('</style>', 'body { font-family: "Example"; }</style>'));
  await rejects(validateNeutralScaffold(font), 'font_forbidden');

  const copy = await fixture(t);
  await mutate(copy, 'index.html', (value) => value.replace('></div>', '>A visible relationship resolves.</div>'));
  await rejects(validateNeutralScaffold(copy), 'sample_content');

  const label = await fixture(t);
  await mutate(label, 'index.html', (value) => value.replace('id="root"', 'id="root" aria-label="sample scene"'));
  await rejects(validateNeutralScaffold(label), 'sample_content');
});

test('rejects Scene Kit, layered hero and decomposition defaults', async (t) => {
  for (const field of ['data-scene-kit="x"', 'data-layered="true"', 'data-hero-shot="true"', 'data-clean-plate="x"', 'data-alpha-decomposition="x"']) {
    const root = await fixture(t);
    await mutate(root, 'index.html', (value) => value.replace('data-start="0"', `${field}\n      data-start="0"`));
    await rejects(validateNeutralScaffold(root), 'deferred_capability');
  }
});

test('rejects mismatched metadata, remote registry and runtime dependency', async (t) => {
  const metadata = await fixture(t);
  await mutate(metadata, 'meta.json', (value) => value.replace('"pipelineContractVersion": 2', '"pipelineContractVersion": 1'));
  await rejects(validateNeutralScaffold(metadata), 'metadata_profile_mismatch');

  const registry = await fixture(t);
  await mutate(registry, 'hyperframes.json', (value) => value.replace('"paths"', '"registry": "https://example.test/registry",\n  "paths"'));
  await rejects(validateNeutralScaffold(registry), 'remote_registry');

  const dependency = await fixture(t);
  await mutate(dependency, 'package.json', (value) => value.replace('"scripts"', '"dependencies": {"gsap": "3.14.2"},\n  "scripts"'));
  await rejects(validateNeutralScaffold(dependency), 'runtime_dependency');

  const pin = await fixture(t);
  await mutate(pin, 'package.json', (value) => value.replace(/hyperframes@\d+\.\d+\.\d+ render/u, 'hyperframes@9.9.9 render'));
  await rejects(validateNeutralScaffold(pin), 'cli_pin_mismatch');
});

test('rejects bundled media and unsafe symlinks', async (t) => {
  const media = await fixture(t);
  await fs.writeFile(path.join(media, 'sample.mp4'), 'fixture');
  await rejects(validateNeutralScaffold(media), 'bundled_media');

  const symlink = await fixture(t);
  await fs.symlink(path.join(symlink, 'index.html'), path.join(symlink, 'linked.html'));
  await rejects(validateNeutralScaffold(symlink), 'unsafe_scaffold_entry');
});

test('CLI returns a path-free receipt, help and stable failure', async () => {
  const success = await execFileAsync(process.execPath, [scriptPath, sourceRoot]);
  const receipt = JSON.parse(success.stdout);
  assert.equal(receipt.ok, true);
  assert.equal(success.stdout.includes(sourceRoot), false);
  const help = await execFileAsync(process.execPath, [scriptPath, '--help']);
  assert.match(help.stdout, /^Usage:/u);
  await assert.rejects(
    execFileAsync(process.execPath, [scriptPath, '/private/scaffold-not-found']),
    (error) => error.code === 2
      && JSON.parse(error.stderr).error.code === 'scaffold_unreadable'
      && !error.stderr.includes('/private/'),
  );
});
