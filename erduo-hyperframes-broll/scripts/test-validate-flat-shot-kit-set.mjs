import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createArtifactManifest } from './artifact-manifest.mjs';
import {
  FlatShotKitSetError,
  runFlatShotKitSetCli,
  validateFlatShotKitSet,
} from './validate-flat-shot-kit-set.mjs';

const sha = (letter) => letter.repeat(64);
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(JSON.stringify(value), 'utf8');

function pendingContribution() {
  return {
    status: 'pending-master-build',
    producer: 'master-build-deterministic-roi-gate-v1',
    verification_mode: 'byte-resolved-pixel-ablation',
    enabled_frame_artifact_id: null,
    enabled_frame_sha256: null,
    disabled_frame_artifact_id: null,
    disabled_frame_sha256: null,
    roi_diff_artifact_id: null,
    roi_diff_sha256: null,
    roi_pixel_count: null,
    changed_pixel_count: null,
    gate_receipt_sha256: null,
  };
}

function makeKit(shotId, designHash, route = 'user-media', raster = { width: 1920, height: 1080 }) {
  const routeFacts = {
    'user-media': ['user-provided', 'user-ownership', 'cleared'],
    'image-generation': ['generated', 'generator-terms', 'conditional'],
    pexels: ['pexels', 'pexels-license', 'cleared'],
  };
  const [origin, basis, reviewStatus] = routeFacts[route] ?? ['user-provided', 'user-ownership', 'cleared'];
  const sourceHash = sha(shotId.at(-1));
  return {
    schema_version: 1,
    pipeline_contract_version: 2,
    shot_id: shotId,
    design_slice_sha256: designHash,
    target_raster: raster,
    primary_asset: {
      asset_id: `asset-${shotId}`,
      route,
      media_kind: 'image',
      duration_ms: null,
      frozen: {
        locator_id: `frozen-${shotId}`,
        sha256: sourceHash,
        size_bytes: 2000,
        integrity_receipt_artifact_id: `asset-integrity-${shotId}`,
        integrity_receipt_sha256: sha('a'),
        verified_local: true,
      },
      provenance: {
        origin_kind: origin,
        source_record_id: `source-${shotId}`,
        source_record_sha256: sha('b'),
      },
      rights: {
        review_status: reviewStatus,
        basis,
        evidence_artifact_id: `rights-${shotId}`,
        evidence_sha256: sha('c'),
        limitations: reviewStatus === 'conditional' ? ['Use remains subject to generator terms.'] : [],
      },
    },
    composition_fit: {
      coordinate_space: 'target-raster-px',
      subject_bbox: { x: 100, y: 180, width: 700, height: 700 },
      focal_point: { x: 400, y: 420 },
      output_crop_bbox: { x: 0, y: 0, width: raster.width, height: raster.height },
      text_safe_regions: [{ x: 1050, y: 150, width: 700, height: 500 }],
      protected_regions: [
        { kind: 'primary-subject', bbox: { x: 80, y: 160, width: 740, height: 740 } },
      ],
      motion: {
        source_motion: 'static',
        treatment: 'pan',
        direction: 'right',
        amplitude_basis_points: 200,
      },
      palette: {
        dominant_hex: ['#112233'],
        background_luminance_basis_points: 3000,
        title_contrast_ratio_x100: 700,
      },
      title_relation: {
        mode: 'inside-text-safe-region',
        title_bbox: { x: 1100, y: 220, width: 500, height: 180 },
        text_safe_region_index: 0,
        min_clearance_px: 100,
      },
      result_roi: { x: 100, y: 180, width: 700, height: 700 },
    },
    consumer_plan: {
      consumer_id: `primary-${shotId}`,
      role: 'primary',
      element: 'img',
      fit: 'cover',
      visible: true,
      opacity_basis_points: 10000,
      visible_window: { start_ms: 0, end_ms: 4000 },
      target_bbox: { x: 0, y: 0, width: raster.width, height: raster.height },
      source_sha256: sourceHash,
    },
    target_preview: {
      artifact_id: `preview-${shotId}`,
      frame_sha256: sha('d'),
      capture_receipt_artifact_id: `capture-${shotId}`,
      capture_receipt_sha256: sha('e'),
      width: raster.width,
      height: raster.height,
      timestamp_ms: 2000,
    },
    selection_record: {
      candidates_considered: 1,
      candidates_rejected: 0,
      rejection_reasons: [],
      selected_reason: 'The selected subject and title-safe geometry jointly satisfy this shot.',
      fallback: { status: 'none', route: null, reason: null },
    },
    contribution_evidence: pendingContribution(),
  };
}

function makeFixture(routes = ['user-media', 'image-generation', 'pexels']) {
  const planBytes = jsonBytes({ schema_version: 1, shots: routes.map((_, index) => ({ shot_id: `S${String(index + 1).padStart(3, '0')}` })) });
  const planHash = hashBytes(planBytes);
  const designSlice = {
    schema_version: 1,
    pipeline_contract_version: 2,
    plan_sha256: planHash,
    shots: routes.map((_, index) => ({ shot_id: `S${String(index + 1).padStart(3, '0')}` })),
  };
  const designSliceBytes = jsonBytes(designSlice);
  const designHash = hashBytes(designSliceBytes);
  const designRecord = {
    artifact_id: 'design-slice',
    kind: 'json',
    sha256: designHash,
    size_bytes: designSliceBytes.length,
    media_type: 'application/json',
    locator_key: 'director/design-slice.json',
    required_by: ['assets'],
  };
  const planRecord = {
    artifact_id: 'shot-plan',
    kind: 'json',
    sha256: planHash,
    size_bytes: planBytes.length,
    media_type: 'application/json',
    locator_key: 'director/shot-plan.json',
    required_by: ['assets'],
  };
  const directorManifest = createArtifactManifest({
    run_id: 'run-kit-set',
    stage: 'director',
    package_id: 'run-kit-set-director',
    upstream_manifest_sha256: sha('1'),
    creative_brief_sha256: sha('2'),
    producer_isolation_sha256: sha('3'),
    artifacts: [planRecord, designRecord],
    metrics: { shot_count: routes.length },
  });
  const kitArtifacts = new Map();
  const records = routes.map((route, index) => {
    const shotId = `S${String(index + 1).padStart(3, '0')}`;
    const artifactId = `flat-shot-kit-${shotId}`;
    const bytes = jsonBytes(makeKit(shotId, designHash, route));
    kitArtifacts.set(artifactId, bytes);
    return { shot_id: shotId, artifact_id: artifactId, sha256: hashBytes(bytes), size_bytes: bytes.length };
  });
  const index = {
    schema_version: 1,
    pipeline_contract_version: 2,
    director_manifest_sha256: directorManifest.manifest_sha256,
    shot_plan_sha256: planHash,
    design_slice_sha256: designHash,
    target_raster: { width: 1920, height: 1080 },
    shot_count: routes.length,
    kits: records,
  };
  return { index, directorManifest, designSliceBytes, kitArtifacts };
}

async function expectCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => (error instanceof FlatShotKitSetError || typeof error?.code === 'string') && error.code === code,
  );
}

test('validates actual member bytes and emits path-free route and rights counts', async () => {
  const fixture = makeFixture();
  const receipt = await validateFlatShotKitSet(fixture.index, fixture);
  assert.deepEqual(receipt.route_counts, { user_media: 1, image_generation: 1, pexels: 1 });
  assert.deepEqual(receipt.rights_counts, { cleared: 2, conditional: 1 });
  assert.deepEqual(receipt.contribution_status_counts, { pending_master_build: 3 });
  assert.equal(receipt.shot_count, 3);
  assert.match(receipt.flat_shot_kit_set_sha256, /^[0-9a-f]{64}$/u);
  const serialized = JSON.stringify(receipt);
  assert.equal(serialized.includes('/'), false);
  assert.equal(serialized.includes('flat-shot-kit-S001'), false);
});

test('rejects tampered and missing member bytes instead of trusting summaries', async () => {
  const tampered = makeFixture(['user-media']);
  tampered.kitArtifacts.set('flat-shot-kit-S001', Buffer.concat([
    tampered.kitArtifacts.get('flat-shot-kit-S001'),
    Buffer.from(' ', 'utf8'),
  ]));
  await expectCode(validateFlatShotKitSet(tampered.index, tampered), 'kit_artifact_hash_mismatch');

  const missing = makeFixture(['user-media']);
  missing.kitArtifacts.delete('flat-shot-kit-S001');
  await expectCode(validateFlatShotKitSet(missing.index, missing), 'kit_artifact_missing');
});

test('rejects duplicate, missing and reordered S001..SN coverage', async () => {
  const duplicate = makeFixture(['user-media', 'pexels']);
  duplicate.index.kits[1].artifact_id = duplicate.index.kits[0].artifact_id;
  await expectCode(validateFlatShotKitSet(duplicate.index, duplicate), 'duplicate_kit_record');

  const missing = makeFixture(['user-media', 'pexels']);
  missing.index.kits.pop();
  await expectCode(validateFlatShotKitSet(missing.index, missing), 'shot_coverage_invalid');

  const reordered = makeFixture(['user-media', 'pexels']);
  reordered.index.kits.reverse();
  await expectCode(validateFlatShotKitSet(reordered.index, reordered), 'kit_order_invalid');
});

test('rejects mixed design hashes and target rasters after rehashing member bytes', async () => {
  const mixedDesign = makeFixture(['user-media', 'pexels']);
  const designKit = JSON.parse(mixedDesign.kitArtifacts.get('flat-shot-kit-S002').toString('utf8'));
  designKit.design_slice_sha256 = sha('f');
  const designKitBytes = jsonBytes(designKit);
  mixedDesign.kitArtifacts.set('flat-shot-kit-S002', designKitBytes);
  mixedDesign.index.kits[1].sha256 = hashBytes(designKitBytes);
  mixedDesign.index.kits[1].size_bytes = designKitBytes.length;
  await expectCode(validateFlatShotKitSet(mixedDesign.index, mixedDesign), 'mixed_design_slice');

  const mixedRaster = makeFixture(['user-media', 'pexels']);
  const rasterKit = JSON.parse(mixedRaster.kitArtifacts.get('flat-shot-kit-S002').toString('utf8'));
  rasterKit.target_raster = { width: 3840, height: 2160 };
  rasterKit.composition_fit.output_crop_bbox = { x: 0, y: 0, width: 3840, height: 2160 };
  rasterKit.consumer_plan.target_bbox = { x: 0, y: 0, width: 3840, height: 2160 };
  rasterKit.target_preview.width = 3840;
  rasterKit.target_preview.height = 2160;
  const rasterKitBytes = jsonBytes(rasterKit);
  mixedRaster.kitArtifacts.set('flat-shot-kit-S002', rasterKitBytes);
  mixedRaster.index.kits[1].sha256 = hashBytes(rasterKitBytes);
  mixedRaster.index.kits[1].size_bytes = rasterKitBytes.length;
  await expectCode(validateFlatShotKitSet(mixedRaster.index, mixedRaster), 'mixed_target_raster');
});

test('rejects native primary, layered fields and assets contribution overclaims', async () => {
  for (const [mutate, code] of [
    [(kit) => { kit.primary_asset.route = 'hyperframes-native'; }, 'invalid_primary_route'],
    [(kit) => { kit.layers = []; }, 'forbidden_decomposition_field'],
    [(kit) => { kit.contribution_evidence.status = 'verified'; }, 'unverified_contribution_claim'],
  ]) {
    const fixture = makeFixture(['user-media']);
    const kit = JSON.parse(fixture.kitArtifacts.get('flat-shot-kit-S001').toString('utf8'));
    mutate(kit);
    const bytes = jsonBytes(kit);
    fixture.kitArtifacts.set('flat-shot-kit-S001', bytes);
    fixture.index.kits[0].sha256 = hashBytes(bytes);
    fixture.index.kits[0].size_bytes = bytes.length;
    await expectCode(validateFlatShotKitSet(fixture.index, fixture), code);
  }
});

test('requires pipeline contract version 2 in the set and every member', async () => {
  const legacySet = makeFixture(['user-media']);
  legacySet.index.pipeline_contract_version = 1;
  await expectCode(validateFlatShotKitSet(legacySet.index, legacySet), 'pipeline_upgrade_required');

  const legacyKit = makeFixture(['user-media']);
  const kit = JSON.parse(legacyKit.kitArtifacts.get('flat-shot-kit-S001').toString('utf8'));
  delete kit.pipeline_contract_version;
  const bytes = jsonBytes(kit);
  legacyKit.kitArtifacts.set('flat-shot-kit-S001', bytes);
  legacyKit.index.kits[0].sha256 = hashBytes(bytes);
  legacyKit.index.kits[0].size_bytes = bytes.length;
  await expectCode(validateFlatShotKitSet(legacyKit.index, legacyKit), 'pipeline_upgrade_required');
});

test('CLI resolves regular kit files and emits no private paths', async () => {
  const fixture = makeFixture(['user-media']);
  const root = await mkdtemp(path.join(os.tmpdir(), 'flat-kit-set-'));
  const kitRoot = path.join(root, 'kits');
  await mkdir(kitRoot);
  const setFile = path.join(root, 'set.json');
  const manifestFile = path.join(root, 'director.json');
  const designFile = path.join(root, 'design.json');
  await writeFile(setFile, JSON.stringify(fixture.index));
  await writeFile(manifestFile, JSON.stringify(fixture.directorManifest));
  await writeFile(designFile, fixture.designSliceBytes);
  await writeFile(path.join(kitRoot, 'flat-shot-kit-S001.json'), fixture.kitArtifacts.get('flat-shot-kit-S001'));
  const writes = { stdout: '', stderr: '' };
  try {
    const code = await runFlatShotKitSetCli([
      setFile,
      '--director-manifest', manifestFile,
      '--design-slice', designFile,
      '--kit-root', kitRoot,
    ], {
      stdout: { write: (value) => { writes.stdout += value; } },
      stderr: { write: (value) => { writes.stderr += value; } },
    });
    assert.equal(code, 0);
    assert.equal(writes.stderr, '');
    assert.equal(writes.stdout.includes(root), false);
    assert.equal(JSON.parse(writes.stdout).shot_count, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
