import test from 'node:test';
import assert from 'node:assert/strict';
import { FlatShotKitError, runFlatShotKitCli, validateFlatShotKit } from './validate-flat-shot-kit.mjs';

const sha = (letter) => letter.repeat(64);

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

function fixture() {
  return {
    schema_version: 1,
    pipeline_contract_version: 2,
    shot_id: 'S001',
    design_slice_sha256: sha('a'),
    target_raster: { width: 1920, height: 1080 },
    primary_asset: {
      asset_id: 'pexels-314159',
      route: 'pexels',
      media_kind: 'video',
      duration_ms: 5000,
      frozen: {
        locator_id: 'frozen-pexels-314159',
        sha256: sha('b'),
        size_bytes: 123456,
        integrity_receipt_artifact_id: 'asset-integrity-S001',
        integrity_receipt_sha256: sha('c'),
        verified_local: true,
      },
      provenance: {
        origin_kind: 'pexels',
        source_record_id: 'pexels-source-314159',
        source_record_sha256: sha('d'),
      },
      rights: {
        review_status: 'cleared',
        basis: 'pexels-license',
        evidence_artifact_id: 'pexels-rights-314159',
        evidence_sha256: sha('e'),
        limitations: [],
      },
    },
    composition_fit: {
      coordinate_space: 'target-raster-px',
      subject_bbox: { x: 120, y: 180, width: 680, height: 720 },
      focal_point: { x: 460, y: 430 },
      output_crop_bbox: { x: 0, y: 0, width: 1920, height: 1080 },
      text_safe_regions: [{ x: 1060, y: 180, width: 680, height: 500 }],
      protected_regions: [
        { kind: 'primary-subject', bbox: { x: 100, y: 160, width: 720, height: 760 } },
        { kind: 'face', bbox: { x: 300, y: 190, width: 260, height: 260 } },
      ],
      motion: {
        source_motion: 'intrinsic',
        treatment: 'locked',
        direction: 'none',
        amplitude_basis_points: 0,
      },
      palette: {
        dominant_hex: ['#14202A', '#D8B27A'],
        background_luminance_basis_points: 2200,
        title_contrast_ratio_x100: 720,
      },
      title_relation: {
        mode: 'inside-text-safe-region',
        title_bbox: { x: 1120, y: 240, width: 520, height: 180 },
        text_safe_region_index: 0,
        min_clearance_px: 80,
      },
      result_roi: { x: 120, y: 180, width: 680, height: 720 },
    },
    consumer_plan: {
      consumer_id: 'primary-consumer-S001',
      role: 'primary',
      element: 'video',
      fit: 'cover',
      visible: true,
      opacity_basis_points: 10000,
      visible_window: { start_ms: 0, end_ms: 4000 },
      target_bbox: { x: 0, y: 0, width: 1920, height: 1080 },
      source_sha256: sha('b'),
    },
    target_preview: {
      artifact_id: 'flat-preview-S001',
      frame_sha256: sha('f'),
      capture_receipt_artifact_id: 'capture-receipt-S001',
      capture_receipt_sha256: sha('1'),
      width: 1920,
      height: 1080,
      timestamp_ms: 2000,
    },
    selection_record: {
      candidates_considered: 3,
      candidates_rejected: 2,
      rejection_reasons: [
        { code: 'subject-crop', count: 1 },
        { code: 'no-title-safe-area', count: 1 },
      ],
      selected_reason: 'The subject, target crop, and title-safe area remain readable together.',
      fallback: {
        status: 'available',
        route: 'image-generation',
        reason: 'Generate the same subject with a wider title-safe right side.',
      },
    },
    contribution_evidence: pendingContribution(),
  };
}

function expectCode(document, code) {
  assert.throws(
    () => validateFlatShotKit(document),
    (error) => error instanceof FlatShotKitError && error.code === code,
  );
}

test('accepts a frozen ordinary video with pending deterministic contribution work', () => {
  const receipt = validateFlatShotKit(fixture());
  assert.equal(receipt.shot_id, 'S001');
  assert.equal(receipt.primary_asset_sha256, sha('b'));
  assert.equal(receipt.contribution_status, 'pending-master-build');
  assert.match(receipt.flat_shot_kit_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(receipt).includes('pexels-314159'), false);
});

test('accepts the image/no-title/conditional-rights boundary while contribution remains pending', () => {
  const doc = fixture();
  doc.primary_asset = {
    asset_id: 'user-image-1',
    route: 'user-media',
    media_kind: 'image',
    duration_ms: null,
    frozen: { ...doc.primary_asset.frozen, locator_id: 'user-image-frozen' },
    provenance: {
      origin_kind: 'user-provided',
      source_record_id: 'user-source-1',
      source_record_sha256: sha('2'),
    },
    rights: {
      review_status: 'conditional',
      basis: 'user-ownership',
      evidence_artifact_id: 'user-rights-1',
      evidence_sha256: sha('3'),
      limitations: ['Internal campaign use only.'],
    },
  };
  doc.consumer_plan.element = 'background-image';
  doc.composition_fit.title_relation = {
    mode: 'none',
    title_bbox: null,
    text_safe_region_index: null,
    min_clearance_px: 0,
  };
  assert.equal(validateFlatShotKit(doc).contribution_status, 'pending-master-build');
});

test('uses the same ordinary-media contract for generated images', () => {
  const doc = fixture();
  doc.primary_asset = {
    asset_id: 'generated-image-1',
    route: 'image-generation',
    media_kind: 'image',
    duration_ms: null,
    frozen: { ...doc.primary_asset.frozen, locator_id: 'generated-image-frozen' },
    provenance: {
      origin_kind: 'generated',
      source_record_id: 'generation-record-1',
      source_record_sha256: sha('2'),
    },
    rights: {
      review_status: 'cleared',
      basis: 'generator-terms',
      evidence_artifact_id: 'generator-terms-1',
      evidence_sha256: sha('3'),
      limitations: [],
    },
  };
  doc.consumer_plan.element = 'img';
  assert.equal(validateFlatShotKit(doc).primary_asset_sha256, sha('b'));
});

test('rejects decomposition fields and native material pretending to be primary', () => {
  const decomposed = fixture();
  decomposed.primary_asset.layers = [];
  expectCode(decomposed, 'forbidden_decomposition_field');
  const native = fixture();
  native.primary_asset.route = 'hyperframes-native';
  expectCode(native, 'invalid_primary_route');
});

test('requires pipeline contract version 2', () => {
  const legacy = fixture();
  delete legacy.pipeline_contract_version;
  expectCode(legacy, 'pipeline_upgrade_required');
  const wrong = fixture();
  wrong.pipeline_contract_version = 1;
  expectCode(wrong, 'pipeline_upgrade_required');
});

test('rejects unfrozen, path-like, invalid-hash, and unauditable rights records', () => {
  const unfrozen = fixture();
  unfrozen.primary_asset.frozen.verified_local = false;
  expectCode(unfrozen, 'asset_not_frozen');
  const pathLike = fixture();
  pathLike.primary_asset.frozen.locator_id = '/private/source.mp4';
  expectCode(pathLike, 'invalid_artifact_id');
  const invalidHash = fixture();
  invalidHash.primary_asset.frozen.sha256 = 'metadata-only';
  expectCode(invalidHash, 'asset_not_frozen');
  const receiptPath = fixture();
  receiptPath.primary_asset.frozen.integrity_receipt_artifact_id = '../receipt.json';
  expectCode(receiptPath, 'invalid_artifact_id');
  const rights = fixture();
  rights.primary_asset.rights.review_status = 'unknown';
  expectCode(rights, 'rights_not_auditable');
});

test('rejects consumer media mismatches, hidden use, invalid windows, and preview drift', () => {
  const element = fixture();
  element.consumer_plan.element = 'img';
  expectCode(element, 'invalid_primary_consumer');
  const hidden = fixture();
  hidden.consumer_plan.visible = false;
  expectCode(hidden, 'invalid_primary_consumer');
  const window = fixture();
  window.consumer_plan.visible_window.end_ms = 6000;
  expectCode(window, 'invalid_visible_window');
  const preview = fixture();
  preview.target_preview.width = 1280;
  expectCode(preview, 'invalid_target_preview');
  const previewReceipt = fixture();
  previewReceipt.target_preview.capture_receipt_artifact_id = '/capture.json';
  expectCode(previewReceipt, 'invalid_artifact_id');
});

test('rejects out-of-canvas ROI and contradictory title protection', () => {
  const roi = fixture();
  roi.composition_fit.result_roi.x = 1800;
  expectCode(roi, 'geometry_outside_canvas');
  const focal = fixture();
  focal.composition_fit.focal_point = { x: 1000, y: 430 };
  expectCode(focal, 'focal_point_outside_subject');
  const title = fixture();
  title.composition_fit.title_relation.title_bbox = { x: 300, y: 200, width: 300, height: 200 };
  expectCode(title, 'title_overlaps_protected_region');
  const clearance = fixture();
  clearance.composition_fit.title_relation = {
    mode: 'outside-primary-subject',
    title_bbox: { x: 821, y: 240, width: 180, height: 180 },
    text_safe_region_index: null,
    min_clearance_px: 80,
  };
  expectCode(clearance, 'title_clearance_contradiction');
  const safe = fixture();
  safe.composition_fit.title_relation.text_safe_region_index = 4;
  expectCode(safe, 'title_relation_contradiction');
});

test('rejects every assets-stage attempt to self-report contribution', () => {
  const hashesOnly = fixture();
  hashesOnly.contribution_evidence.status = 'verified';
  hashesOnly.contribution_evidence.enabled_frame_sha256 = sha('8');
  hashesOnly.contribution_evidence.disabled_frame_sha256 = sha('9');
  expectCode(hashesOnly, 'unverified_contribution_claim');
  const overclaim = fixture();
  overclaim.contribution_evidence = {
    status: 'verified',
    producer: 'master-build-deterministic-roi-gate-v1',
    verification_mode: 'byte-resolved-pixel-ablation',
    enabled_frame_artifact_id: 'enabled',
    enabled_frame_sha256: sha('8'),
    disabled_frame_artifact_id: 'disabled',
    disabled_frame_sha256: sha('9'),
    roi_diff_artifact_id: 'roi-diff',
    roi_diff_sha256: sha('a'),
    roi_pixel_count: 680 * 720,
    changed_pixel_count: 680 * 720 + 1,
    gate_receipt_sha256: sha('b'),
  };
  expectCode(overclaim, 'unverified_contribution_claim');
});

test('rejects selection accounting drift, provenance drift, and native fallback', () => {
  const counts = fixture();
  counts.selection_record.rejection_reasons[0].count = 2;
  expectCode(counts, 'rejection_summary_mismatch');
  const provenance = fixture();
  provenance.primary_asset.provenance.origin_kind = 'generated';
  expectCode(provenance, 'provenance_route_mismatch');
  const fallback = fixture();
  fallback.selection_record.fallback.route = 'hyperframes-native';
  expectCode(fallback, 'invalid_fallback');
});

test('CLI emits only a path-free receipt and returns non-zero for invalid input', async () => {
  const writes = { stdout: '', stderr: '' };
  const adapters = {
    readFile: async () => JSON.stringify(fixture()),
    stdout: { write: (value) => { writes.stdout += value; } },
    stderr: { write: (value) => { writes.stderr += value; } },
  };
  assert.equal(await runFlatShotKitCli(['private.json'], adapters), 0);
  assert.equal(JSON.parse(writes.stdout).shot_id, 'S001');
  assert.equal(writes.stdout.includes('frozen-pexels'), false);
  const invalid = structuredClone(fixture());
  invalid.primary_asset.rights.review_status = 'unknown';
  writes.stdout = '';
  writes.stderr = '';
  assert.equal(await runFlatShotKitCli(['private.json'], { ...adapters, readFile: async () => JSON.stringify(invalid) }), 2);
  assert.equal(JSON.parse(writes.stderr).ok, false);
});
