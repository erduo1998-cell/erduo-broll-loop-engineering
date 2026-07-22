import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { orchestrateFixture } from './orchestrate-stages.mjs';

test('orchestrates four producer packages in order and resumes without redoing verified work', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'broll-staged-e2e-')); t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'new-project-root');
  const first = await orchestrateFixture({ fixtureId: 'faceless-basic', projectRoot: root });
  assert.deepEqual(first.stages.map((entry) => entry.stage), ['director', 'assets', 'master-build', 'render']);
  assert.deepEqual(first.stages.map((entry) => entry.action), ['completed', 'completed', 'completed', 'completed']);
  assert.equal(first.coverage_basis_points, 10000);
  assert.match(await readFile(path.join(root, 'hyperframes-project', 'index.html'), 'utf8'), /data-duration="4"/u);
  const second = await orchestrateFixture({ fixtureId: 'faceless-basic', projectRoot: root });
  assert.deepEqual(second.stages.map((entry) => entry.action), ['reused', 'reused', 'reused', 'reused']);
  const receipt = JSON.parse(await readFile(path.join(root, '.erduo-hyperframes-broll', 'receipts', 'director.json'), 'utf8'));
  assert.equal(receipt.schema_version, 2);
  assert.deepEqual(receipt.output.review_refs, []);
  assert.deepEqual(receipt.output.main_review_refs.map((entry) => entry.gate), ['shot_plan_review']);
  const manifest = JSON.parse(await readFile(path.join(root, '.erduo-hyperframes-broll', 'artifacts', 'director', 'manifest.json'), 'utf8'));
  assert.equal(receipt.output.manifest_envelope.manifest_sha256, manifest.manifest_sha256);
  const sourceManifest = JSON.parse(await readFile(path.join(root, '.erduo-hyperframes-broll', 'artifacts', 'master-build', 'manifest.json'), 'utf8'));
  const renderReceipt = JSON.parse(await readFile(path.join(root, '.erduo-hyperframes-broll', 'receipts', 'render.json'), 'utf8'));
  const masterBuildReceipt = JSON.parse(await readFile(path.join(root, '.erduo-hyperframes-broll', 'receipts', 'master-build.json'), 'utf8'));
  assert.deepEqual(masterBuildReceipt.output.review_refs, []);
  assert.deepEqual(masterBuildReceipt.output.main_review_refs.map((entry) => entry.gate), ['html_preview_review']);
  assert.equal(masterBuildReceipt.output.manifest_envelope.metrics.source_gate_passed, true);
  assert.equal(masterBuildReceipt.output.manifest_envelope.metrics.pixel_gate_passed, true);
  assert.equal(masterBuildReceipt.output.manifest_envelope.metrics.official_hyperframes_skill_used, true);
  assert.match(masterBuildReceipt.output.manifest_envelope.metrics.official_hyperframes_creation_sha256, /^[0-9a-f]{64}$/u);
  assert.match(sourceManifest.manifest_sha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(renderReceipt.output.review_refs, []);
  assert.deepEqual(renderReceipt.output.main_review_refs.map((entry) => entry.gate), ['final_frame_review']);
  assert.equal(renderReceipt.output.manifest_envelope.metrics.coverage_basis_points, 10000);
  assert.equal(renderReceipt.output.manifest_envelope.metrics.verify_passed, true);
  assert.equal(first.state.stages.preflight.status, 'complete');
  assert.equal(first.state.stages.verify.status, 'complete');
  assert.equal(JSON.stringify(receipt).includes('/Users/'), false);
});

test('refuses final render when main preview approval is absent', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'broll-staged-no-main-preview-')); t.after(() => rm(temporary, { recursive: true, force: true }));
  await assert.rejects(
    () => orchestrateFixture({ fixtureId: 'faceless-basic', projectRoot: path.join(temporary, 'project'), omitMainPreviewReview: true }),
    (error) => error?.code === 'main_agent_review_missing',
  );
});

test('refuses final render when official HyperFrames authoring evidence is absent', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'broll-staged-no-official-hf-')); t.after(() => rm(temporary, { recursive: true, force: true }));
  await assert.rejects(
    () => orchestrateFixture({ fixtureId: 'faceless-basic', projectRoot: path.join(temporary, 'project'), omitOfficialHyperframesSkill: true }),
    (error) => error?.code === 'official_hyperframes_skill_missing',
  );
});

test('refuses malformed pre-master evidence before final render', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'broll-staged-bad-preflight-')); t.after(() => rm(temporary, { recursive: true, force: true }));
  await assert.rejects(
    () => orchestrateFixture({ fixtureId: 'faceless-basic', projectRoot: path.join(temporary, 'project'), tamperPreMasterEvidence: true }),
    (error) => error?.code === 'visual_preflight_frame_mismatch',
  );
});

test('refuses a display selection that is not bound to the font package', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'broll-staged-bad-display-')); t.after(() => rm(temporary, { recursive: true, force: true }));
  await assert.rejects(
    () => orchestrateFixture({ fixtureId: 'faceless-basic', projectRoot: path.join(temporary, 'project'), tamperDisplaySelection: true }),
    (error) => error?.code === 'display_selection_unbound',
  );
});
