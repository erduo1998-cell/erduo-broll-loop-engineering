import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { orchestrateFixture } from './orchestrate-stages.mjs';

async function run(t, options = {}) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'master-build-v2-chain-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const projectRoot = path.join(temporary, 'project');
  const result = await orchestrateFixture({
    fixtureId: 'faceless-basic',
    projectRoot,
    testOnlyLegacyInspection: true,
    ...options,
  });
  return { result, projectRoot };
}

const rejects = async (t, options, code) => {
  await assert.rejects(() => run(t, options), (error) => error?.code === code);
};

test('accepts actual schema-3 bytes, sequential same-track clips, class CSS and escaped explicit typography', async (t) => {
  const { projectRoot, result } = await run(t);
  assert.equal(result.shot_count, 2);
  const html = await readFile(path.join(projectRoot, '.erduo-hyperframes-broll', 'artifacts', 'master-build', 'index.html'), 'utf8');
  assert.match(html, /data-track-index="0"/u);
  assert.match(html, /<div data-scene-shot-id="S001"/u);
  assert.match(html, /<section data-scene-shot-id="S002"/u);
  assert.doesNotMatch(html, /style="/u);
  assert.match(html, /第 &quot;1&quot; &amp; &lt;结论&gt;/u);
  assert.match(html, /data-line-index="0" data-line-sha256="[0-9a-f]{64}"/u);
});

test('rejects random-origin seek pollution using resolved full-raster pixels', async (t) => {
  await rejects(t, { tamperSeekRandom: true }, 'seek_path_divergence');
});

test('accepts pixel-equivalent seek paths with distinct valid PPM encodings and hashes', async (t) => {
  const { result } = await run(t, { seekEquivalentEncoding: true });
  assert.equal(result.shot_count, 2);
});

test('rejects remote CSS and remote JavaScript anywhere in the source bundle', async (t) => {
  await rejects(t, { tamperSourceCssRemote: true }, 'remote_source_forbidden');
  await rejects(t, { tamperSourceJsRemote: true }, 'remote_source_forbidden');
});

test('rejects a vague or facts-unbound delivery profile id', async (t) => {
  await rejects(t, { tamperProfileId: true }, 'profile_gate_unbound');
});

test('rejects missing or changed design-slice consumption markers', async (t) => {
  await rejects(t, { tamperDesignBinding: true }, 'source_design_binding_drift');
});

test('rejects timing, duplicate selector and media-tag drift in authored source', async (t) => {
  await rejects(t, { tamperSourceTiming: true }, 'source_timing_drift');
  await rejects(t, { tamperSourceSelector: true }, 'source_selector_mismatch');
  await rejects(t, { tamperSourceType: true }, 'source_consumer_type_mismatch');
});

test('rejects missing actual local font face/runtime use and schema-2 bindings', async (t) => {
  await rejects(t, { tamperFontFace: true }, 'font_gate_unbound');
  await rejects(t, { tamperFontSelectionDna: true }, 'font_gate_unbound');
  await rejects(t, { tamperDirectorSelectionHash: true }, 'font_gate_unbound');
  await rejects(t, { tamperDesignFontId: true }, 'font_gate_unbound');
  await rejects(t, { tamperFontSourcePath: true }, 'font_gate_unbound');
  await rejects(t, { tamperBindingsSchema2: true }, 'pipeline_upgrade_required');
});

test('rejects the complete legacy M10 fixed-scaffold signature', async (t) => {
  await rejects(t, { tamperLegacySignature: true }, 'legacy_scaffold_signature_forbidden');
});
