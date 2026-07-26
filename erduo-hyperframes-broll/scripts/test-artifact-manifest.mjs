import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ArtifactManifestError, createArtifactEnvelope, createArtifactManifest, inspectArtifactManifest, validateArtifactManifest } from './artifact-manifest.mjs';
const sha = (letter) => letter.repeat(64);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const record = (overrides = {}) => ({ artifact_id: 'plan', kind: 'json', sha256: sha('a'), size_bytes: 1, media_type: 'application/json', locator_key: 'plan.json', required_by: ['source-conformance-gate'], ...overrides });
const manifest = (artifacts = [record()], overrides = {}) => createArtifactManifest({ run_id: 'run-fixture', stage: 'director', package_id: 'run-fixture-director', upstream_manifest_sha256: sha('b'), creative_brief_sha256: sha('c'), producer_isolation_sha256: sha('d'), artifacts, metrics: { shot_count: 2, native_primary_count: 0 }, ...overrides });

test('freezes a brief-bound package and exposes only bounded parent metrics', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-manifest-')); t.after(() => rm(root, { recursive: true, force: true }));
  const bytes = Buffer.from('x'); await writeFile(path.join(root, 'plan.json'), bytes);
  const value = manifest([record({ sha256: digest(bytes), size_bytes: bytes.length })]);
  await validateArtifactManifest(value, { root, expectedStage: 'director', expectedUpstream: sha('b'), expectedProducerIsolationSha256: sha('d'), expectedCreativeBriefSha256: sha('c') });
  const envelope = createArtifactEnvelope(value);
  assert.equal(value.pipeline_contract_version, 3); assert.equal(envelope.pipeline_contract_version, 3);
  assert.equal(value.authoring_topology_id, 'script-only-authoring-cluster-v1');
  assert.equal(envelope.validation_policy_id, 'script-only-production-v1');
  assert.equal(envelope.metrics.native_primary_count, 0); assert.equal(envelope.manifest_sha256, value.manifest_sha256); assert.equal(Object.hasOwn(envelope, 'artifacts'), false);
  await writeFile(path.join(root, 'plan.json'), 'tampered');
  await assert.rejects(() => validateArtifactManifest(value, { root }), (error) => error.code === 'artifact_hash_mismatch');
});
test('legacy manifest is inspectable but cannot validate or become a resumable envelope', async () => {
  const legacy = { ...manifest(), schema_version: 3, pipeline_contract_version: 2, authoring_topology_id: 'bounded-authoring-cluster-v1' };
  assert.equal((await inspectArtifactManifest(legacy)).resume_eligible, false);
  assert.equal((await inspectArtifactManifest(legacy)).code, 'pipeline_upgrade_required');
  await assert.rejects(() => validateArtifactManifest(legacy), (error) => error.code === 'pipeline_upgrade_required');
  assert.throws(() => createArtifactEnvelope(legacy), (error) => error.code === 'pipeline_upgrade_required');
  const tampered = manifest(); tampered.metrics.shot_count = 99;
  assert.equal((await inspectArtifactManifest(tampered)).code, 'artifact_hash_mismatch');
  assert.equal((await inspectArtifactManifest({ pipeline_contract_version: 2 })).code, 'pipeline_upgrade_required');
  assert.throws(
    () => createArtifactEnvelope(manifest([record({
      artifact_id: 'old-inspection-page',
      kind: 'review-page',
      locator_key: 'old-inspection-page.html',
      required_by: ['parent'],
    })])),
    (error) => error.code === 'artifact_parent_payload_forbidden',
  );
  assert.throws(
    () => createArtifactEnvelope(manifest([record()], { metrics: { frame_data: 'data:image/png;base64,AAAA' } })),
    (error) => error.code === 'artifact_parent_payload_forbidden',
  );
});
test('rejects locator escape, symlink, oversized JSON/source bundles, metrics and >16KiB manifests', async (t) => {
  assert.throws(() => manifest([record({ locator_key: '../bad.json' })]), (error) => error.code === 'artifact_path_escape');
  assert.throws(() => manifest([record({ size_bytes: 8 * 1024 * 1024 + 1 })]), (error) => error.code === 'artifact_size_exceeded');
  assert.throws(() => manifest([record({ kind: 'source-bundle', size_bytes: 64 * 1024 * 1024 + 1 })]), (error) => error.code === 'artifact_size_exceeded');
  assert.throws(() => manifest([record()], { metrics: Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`m${i}`, i])) }), (error) => error.code === 'artifact_metrics_invalid');
  const many = Array.from({ length: 180 }, (_, i) => record({ artifact_id: `a${i}`, locator_key: `deep/${'x'.repeat(50)}-${i}.json`, sha256: digest(String(i)) }));
  assert.throws(() => manifest(many), (error) => error.code === 'artifact_manifest_too_large');
  const root = await mkdtemp(path.join(os.tmpdir(), 'artifact-link-')); t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'target'), 'x'); await symlink(path.join(root, 'target'), path.join(root, 'plan.json'));
  await assert.rejects(() => validateArtifactManifest(manifest([record({ sha256: digest('x') })]), { root }), (error) => error instanceof ArtifactManifestError && error.code === 'artifact_symlink');
});
