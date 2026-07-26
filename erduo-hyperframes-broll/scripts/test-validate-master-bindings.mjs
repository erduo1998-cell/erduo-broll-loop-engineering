import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fingerprintArtifactValue } from './artifact-manifest.mjs';
import { compileFrameProjection } from './compile-frame-projection.mjs';
import {
  fingerprintDesignBindingValue,
  inspectMasterBindings,
  MasterBindingError,
  validateMasterBindings,
} from './validate-master-bindings.mjs';

const sha = (letter) => letter.repeat(64);
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value) => Buffer.from(JSON.stringify(value), 'utf8');

function p6(width, height, pixels) {
  return Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii'), Buffer.from(pixels)]);
}

function p3(width, height, pixels) {
  return Buffer.from(`P3\n${width} ${height}\n255\n${[...pixels].join(' ')}\n`, 'ascii');
}

function artifactRecord(artifactId, bytes) {
  return { artifact_id: artifactId, sha256: hashBytes(bytes), size_bytes: bytes.length };
}

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

function lifecycle() {
  return {
    entry: { start_frame: 0, end_frame: 5, behavior: 'Material enters and establishes focus.' },
    action: { start_frame: 5, end_frame: 20, behavior: 'Material performs the semantic action.' },
    result: { start_frame: 20, end_frame: 28, behavior: 'Material resolves into the readable result.' },
    hold: { start_frame: 28, end_frame: 45, behavior: 'The readable result remains stable.' },
    exit: { start_frame: 45, end_frame: 50, behavior: 'Focus exits toward the next shot.' },
  };
}

function contribution(format = 'P6') {
  const width = 4;
  const height = 3;
  const disabledPixels = Buffer.alloc(width * height * 3);
  const enabledPixels = Buffer.from(disabledPixels);
  enabledPixels[(1 * width + 1) * 3] = 200;
  const diffPixels = Buffer.alloc(enabledPixels.length);
  diffPixels[(1 * width + 1) * 3] = 200;
  const encode = format === 'P3' ? p3 : p6;
  const enabled = encode(width, height, enabledPixels);
  const disabled = encode(width, height, disabledPixels);
  const diff = p6(width, height, diffPixels);
  const core = {
    schema_version: 1,
    pipeline_contract_version: 2,
    status: 'verified',
    producer: 'master-build-deterministic-roi-gate-v1',
    verification_mode: 'byte-resolved-pixel-ablation',
    capture_frame: 22,
    target_raster: { width, height },
    result_roi: { x: 1, y: 1, width: 2, height: 1 },
    capture_format: format,
    enabled_frame: artifactRecord('enabled-S001', enabled),
    disabled_frame: artifactRecord('disabled-S001', disabled),
    roi_diff: artifactRecord('diff-S001', diff),
    roi_pixel_count: 2,
    changed_pixel_count: 1,
  };
  const receipt = { ...core, gate_receipt_sha256: fingerprintArtifactValue(core) };
  return {
    receipt,
    artifacts: new Map([
      [receipt.enabled_frame.artifact_id, enabled],
      [receipt.disabled_frame.artifact_id, disabled],
      [receipt.roi_diff.artifact_id, diff],
    ]),
  };
}

function makeKit({ route, designHash, sourceBytes }) {
  const routeFacts = {
    'user-media': ['user-provided', 'user-ownership'],
    'image-generation': ['generated', 'generator-terms'],
    pexels: ['pexels', 'pexels-license'],
  };
  const [origin, basis] = routeFacts[route];
  const mediaKind = route === 'pexels' ? 'video' : 'image';
  const element = mediaKind === 'video' ? 'video' : 'img';
  const sourceHash = hashBytes(sourceBytes);
  return {
    schema_version: 1,
    pipeline_contract_version: 2,
    shot_id: 'S001',
    design_slice_sha256: designHash,
    target_raster: { width: 4, height: 3 },
    primary_asset: {
      asset_id: 'ordinary-S001',
      route,
      media_kind: mediaKind,
      duration_ms: mediaKind === 'video' ? 4000 : null,
      frozen: {
        locator_id: 'source-S001',
        sha256: sourceHash,
        size_bytes: sourceBytes.length,
        integrity_receipt_artifact_id: 'integrity-S001',
        integrity_receipt_sha256: sha('c'),
        verified_local: true,
      },
      provenance: {
        origin_kind: origin,
        source_record_id: 'provenance-S001',
        source_record_sha256: sha('d'),
      },
      rights: {
        review_status: 'cleared',
        basis,
        evidence_artifact_id: 'rights-S001',
        evidence_sha256: sha('e'),
        limitations: [],
      },
    },
    composition_fit: {
      coordinate_space: 'target-raster-px',
      subject_bbox: { x: 1, y: 1, width: 2, height: 1 },
      focal_point: { x: 1, y: 1 },
      output_crop_bbox: { x: 0, y: 0, width: 4, height: 3 },
      text_safe_regions: [{ x: 0, y: 0, width: 1, height: 1 }],
      protected_regions: [{ kind: 'primary-subject', bbox: { x: 1, y: 1, width: 2, height: 1 } }],
      motion: { source_motion: mediaKind === 'video' ? 'intrinsic' : 'static', treatment: 'locked', direction: 'none', amplitude_basis_points: 0 },
      palette: { dominant_hex: ['#112233'], background_luminance_basis_points: 3000, title_contrast_ratio_x100: 700 },
      title_relation: { mode: 'none', title_bbox: null, text_safe_region_index: null, min_clearance_px: 0 },
      result_roi: { x: 1, y: 1, width: 2, height: 1 },
    },
    consumer_plan: {
      consumer_id: 'primary-S001',
      role: 'primary',
      element,
      fit: 'cover',
      visible: true,
      opacity_basis_points: 10000,
      visible_window: { start_ms: 0, end_ms: 2000 },
      target_bbox: { x: 0, y: 0, width: 4, height: 3 },
      source_sha256: sourceHash,
    },
    target_preview: {
      artifact_id: 'preview-S001',
      frame_sha256: sha('f'),
      capture_receipt_artifact_id: 'capture-S001',
      capture_receipt_sha256: sha('1'),
      width: 4,
      height: 3,
      timestamp_ms: 1000,
    },
    selection_record: {
      candidates_considered: 1,
      candidates_rejected: 0,
      rejection_reasons: [],
      selected_reason: 'The ordinary subject, crop, and result ROI satisfy this shot.',
      fallback: { status: 'none', route: null, reason: null },
    },
    contribution_evidence: pendingContribution(),
  };
}

function fixture(route = 'user-media', format = 'P6', suppliedSourceBytes) {
  const planHash = sha('a');
  const parsedSrtHash = sha('b');
  const projection = compileFrameProjection({
    pipeline_contract_version: 2,
    artifact_id: 'projection-main',
    parsed_srt_sha256: parsedSrtHash,
    plan_sha256: planHash,
    fps: { numerator: 25, denominator: 1 },
    shots: [{ shot_id: 'S001', start_ms: 0, end_ms: 2000 }],
  });
  const projectionBytes = jsonBytes(projection);
  const designShot = {
    shot_id: 'S001',
    srt_window_ms: { start_ms: 0, end_ms: 2000 },
    start_frame: 0,
    duration_frames: 50,
    composition: {
      composition_bbox: { x: 0.075, y: 0.05, width: 0.8, height: 0.9 },
      focus_bbox: { x: 0.1125, y: 0.175, width: 0.3125, height: 0.45 },
    },
    motion: lifecycle(),
  };
  const design = {
    schema_version: 1,
    pipeline_contract_version: 2,
    parsed_srt_sha256: parsedSrtHash,
    plan_sha256: planHash,
    frame_projection: {
      projection_sha256: projection.receipt.projection_sha256,
    },
    shots: [designShot],
  };
  const designSliceBytes = jsonBytes(design);
  const designHash = hashBytes(designSliceBytes);
  const sourceBytes = suppliedSourceBytes ?? Buffer.from(`actual-${route}-source`, 'utf8');
  const kit = makeKit({ route, designHash, sourceBytes });
  const kitBytes = jsonBytes(kit);
  const kitRecord = {
    shot_id: 'S001',
    artifact_id: 'flat-shot-kit-S001',
    sha256: hashBytes(kitBytes),
    size_bytes: kitBytes.length,
  };
  const kitSet = {
    schema_version: 1,
    pipeline_contract_version: 2,
    director_manifest_sha256: sha('2'),
    shot_plan_sha256: planHash,
    design_slice_sha256: designHash,
    target_raster: { width: 4, height: 3 },
    shot_count: 1,
    kits: [kitRecord],
  };
  const flatShotKitSetBytes = jsonBytes(kitSet);
  const roi = contribution(format);
  const consumer = {
    consumer_id: kit.consumer_plan.consumer_id,
    shot_id: 'S001',
    asset_id: kit.primary_asset.asset_id,
    role: 'primary',
    element: kit.consumer_plan.element,
    fit: kit.consumer_plan.fit,
    visible: true,
    opacity_basis_points: 10000,
    source_element_id: 'hf-primary-S001',
    selector: '#hf-primary-S001',
    selector_sha256: fingerprintArtifactValue({ source_element_id: 'hf-primary-S001', selector: '#hf-primary-S001' }),
    source_sha256: kit.primary_asset.frozen.sha256,
    composition_fit: structuredClone(kit.composition_fit),
    visible_window_ms: structuredClone(kit.consumer_plan.visible_window),
    frame_window: structuredClone(projection.shots[0].frame_window),
  };
  const document = {
    schema_version: 3,
    pipeline_contract_version: 2,
    shot_plan_sha256: planHash,
    design_slice_sha256: designHash,
    flat_shot_kit_set_sha256: hashBytes(flatShotKitSetBytes),
    frame_projection_receipt_sha256: fingerprintArtifactValue(projection.receipt),
    target_raster: { width: 4, height: 3 },
    shots: [{
      shot_id: 'S001',
      design_shot_sha256: fingerprintDesignBindingValue(designShot),
      flat_shot_kit_artifact_id: kitRecord.artifact_id,
      flat_shot_kit_sha256: kitRecord.sha256,
      srt_window_ms: structuredClone(designShot.srt_window_ms),
      frame_window: structuredClone(projection.shots[0].frame_window),
      lifecycle: lifecycle(),
      ordinary_asset_id: kit.primary_asset.asset_id,
      primary_consumer_id: kit.consumer_plan.consumer_id,
      result_roi: structuredClone(kit.composition_fit.result_roi),
      contribution: roi.receipt,
    }],
    ordinary_assets: [{
      asset_id: kit.primary_asset.asset_id,
      shot_id: 'S001',
      route,
      media_kind: kit.primary_asset.media_kind,
      locator_id: kit.primary_asset.frozen.locator_id,
      source_sha256: kit.primary_asset.frozen.sha256,
      size_bytes: kit.primary_asset.frozen.size_bytes,
    }],
    primary_consumers: [consumer],
    auxiliary_consumers: [],
  };
  return {
    document,
    options: {
      designSliceBytes,
      frameProjectionBytes: projectionBytes,
      flatShotKitSetBytes,
      kitArtifacts: new Map([[kitRecord.artifact_id, kitBytes]]),
      sourceArtifacts: new Map([[kit.primary_asset.frozen.locator_id, sourceBytes]]),
      contributionArtifacts: roi.artifacts,
    },
  };
}

function expectCode(value, code) {
  assert.throws(
    () => validateMasterBindings(value.document, value.options),
    (error) => (error instanceof MasterBindingError || typeof error?.code === 'string') && error.code === code,
  );
}

test('validates schema 3 for user, generated, and Pexels ordinary routes with actual PPM evidence', () => {
  for (const [route, format] of [['user-media', 'P6'], ['image-generation', 'P3'], ['pexels', 'P6']]) {
    const value = fixture(route, format);
    const receipt = validateMasterBindings(value.document, value.options);
    assert.equal(receipt.shot_count, 1);
    assert.equal(receipt.verified_contribution_count, 1);
    assert.match(receipt.binding_sha256, /^[0-9a-f]{64}$/u);
  }
});

test('design binding hash supports finite normalized geometry and rejects unsafe numeric values', () => {
  const geometry = { bbox: { x: 0.075, y: 0.1, width: 0.333333, height: 0.8 } };
  assert.match(fingerprintDesignBindingValue(geometry), /^[0-9a-f]{64}$/u);
  const drifted = structuredClone(geometry);
  drifted.bbox.x += 1e-9;
  assert.notEqual(fingerprintDesignBindingValue(geometry), fingerprintDesignBindingValue(drifted));
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0]) {
    assert.throws(
      () => fingerprintDesignBindingValue({ value: invalid }),
      (error) => error instanceof MasterBindingError && error.code === 'design_binding_number_invalid',
    );
  }
});

test('legacy schema 2 remains inspect-only and cannot validate or resume', () => {
  const legacy = { schema_version: 2, shots: [], assets: [], consumers: [] };
  assert.deepEqual(inspectMasterBindings(legacy), {
    resume_eligible: false,
    code: 'pipeline_upgrade_required',
    schema_version: 2,
    pipeline_contract_version: null,
  });
  expectCode({ document: legacy, options: {} }, 'pipeline_upgrade_required');
});

test('schema 3 inspection stays non-resumable until actual bytes pass full validation', () => {
  assert.deepEqual(inspectMasterBindings({ schema_version: 3, pipeline_contract_version: 2 }), {
    resume_eligible: false,
    code: 'validation_required',
    schema_version: 3,
    pipeline_contract_version: 2,
    shot_count: null,
  });
  const value = fixture();
  const inspected = inspectMasterBindings(value.document);
  assert.equal(inspected.resume_eligible, false);
  assert.equal(inspected.code, 'validation_required');
  const validated = inspectMasterBindings(value.document, value.options);
  assert.equal(validated.resume_eligible, true);
  assert.match(validated.binding_sha256, /^[0-9a-f]{64}$/u);
});

test('machine schema matches schema-3 and full composition/ROI receipt shapes', async () => {
  const schema = JSON.parse(await readFile(new URL('../references/master-bindings-v3.schema.json', import.meta.url), 'utf8'));
  assert.equal(schema.properties.schema_version.const, 3);
  assert.equal(schema.properties.pipeline_contract_version.const, 2);
  assert.deepEqual(schema.$defs.primaryConsumer.properties.composition_fit.$ref, '#/$defs/compositionFit');
  assert.deepEqual(schema.$defs.compositionFit.required, [
    'coordinate_space',
    'subject_bbox',
    'focal_point',
    'output_crop_bbox',
    'text_safe_regions',
    'protected_regions',
    'motion',
    'palette',
    'title_relation',
    'result_roi',
  ]);
  assert.equal(schema.$defs.contribution.properties.capture_format.enum.includes('P6'), true);
  assert.equal(schema.$defs.contribution.properties.capture_format.enum.includes('P3'), true);
  assert.equal(schema.$defs.contribution.properties.changed_pixel_count.$ref, '#/$defs/positiveInteger');
});

test('requires actual design, projection, kit, source, and contribution bytes', () => {
  const design = fixture();
  design.options.designSliceBytes = undefined;
  expectCode(design, 'resolved_bytes_required');

  const kit = fixture();
  kit.options.kitArtifacts.delete('flat-shot-kit-S001');
  expectCode(kit, 'kit_bytes_missing');

  const source = fixture();
  source.options.sourceArtifacts.delete('source-S001');
  expectCode(source, 'ordinary_source_bytes_missing');

  const contributionBytes = fixture();
  contributionBytes.options.contributionArtifacts.delete('enabled-S001');
  expectCode(contributionBytes, 'roi_artifact_bytes_missing');
});

test('ordinary media larger than the JSON ceiling remains valid and hash-bound', () => {
  const largeSource = Buffer.alloc(16 * 1024 * 1024 + 1, 7);
  const value = fixture('user-media', 'P6', largeSource);
  assert.equal(validateMasterBindings(value.document, value.options).ordinary_asset_count, 1);
  value.options.sourceArtifacts.get('source-S001')[largeSource.length - 1] = 8;
  expectCode(value, 'ordinary_source_bytes_mismatch');
});

test('rejects kit, design, projection, or ordinary source drift', () => {
  const design = fixture();
  design.options.designSliceBytes = Buffer.concat([design.options.designSliceBytes, Buffer.from(' ')]);
  expectCode(design, 'design_slice_hash_mismatch');

  const projection = fixture();
  const projectionDoc = JSON.parse(projection.options.frameProjectionBytes);
  projectionDoc.shots[0].frame_window.end_frame += 1;
  projection.options.frameProjectionBytes = jsonBytes(projectionDoc);
  expectCode(projection, 'projection_tampered');

  const kit = fixture();
  const kitBytes = Buffer.concat([kit.options.kitArtifacts.get('flat-shot-kit-S001'), Buffer.from(' ')]);
  kit.options.kitArtifacts.set('flat-shot-kit-S001', kitBytes);
  expectCode(kit, 'kit_bytes_hash_mismatch');

  const source = fixture();
  source.options.sourceArtifacts.set('source-S001', Buffer.from('tampered source', 'utf8'));
  expectCode(source, 'ordinary_source_bytes_mismatch');
});

test('rejects a microscopic normalized-bbox drift in the actual design shot', () => {
  const value = fixture();
  const design = JSON.parse(value.options.designSliceBytes);
  design.shots[0].composition.focus_bbox.x += 1e-9;
  value.options.designSliceBytes = jsonBytes(design);
  const designHash = hashBytes(value.options.designSliceBytes);
  value.document.design_slice_sha256 = designHash;

  const kit = JSON.parse(value.options.kitArtifacts.get('flat-shot-kit-S001'));
  kit.design_slice_sha256 = designHash;
  const kitBytes = jsonBytes(kit);
  const kitHash = hashBytes(kitBytes);
  value.options.kitArtifacts.set('flat-shot-kit-S001', kitBytes);
  value.document.shots[0].flat_shot_kit_sha256 = kitHash;

  const kitSet = JSON.parse(value.options.flatShotKitSetBytes);
  kitSet.design_slice_sha256 = designHash;
  kitSet.kits[0].sha256 = kitHash;
  kitSet.kits[0].size_bytes = kitBytes.length;
  value.options.flatShotKitSetBytes = jsonBytes(kitSet);
  value.document.flat_shot_kit_set_sha256 = hashBytes(value.options.flatShotKitSetBytes);
  expectCode(value, 'shot_upstream_drift');
});

test('binds exact design shot, lifecycle, frame window, selector, and source hash', () => {
  const designShot = fixture();
  designShot.document.shots[0].design_shot_sha256 = sha('9');
  expectCode(designShot, 'shot_upstream_drift');

  const lifecycleDrift = fixture();
  lifecycleDrift.document.shots[0].lifecycle.result.behavior = 'Substituted behavior.';
  expectCode(lifecycleDrift, 'lifecycle_design_drift');

  const frameDrift = fixture();
  frameDrift.document.primary_consumers[0].frame_window.end_frame += 1;
  frameDrift.document.primary_consumers[0].frame_window.duration_frames += 1;
  expectCode(frameDrift, 'shot_upstream_drift');

  const selector = fixture();
  selector.document.primary_consumers[0].selector = '#another-source';
  expectCode(selector, 'primary_consumer_invalid');

  const sourceHash = fixture();
  sourceHash.document.primary_consumers[0].source_sha256 = sha('8');
  expectCode(sourceHash, 'primary_consumer_invalid');
});

test('requires the ordinary primary to cover the complete relative shot window', () => {
  for (const window of [
    { start_ms: 0, end_ms: 1500 },
    { start_ms: 200, end_ms: 2000 },
  ]) {
    const value = fixture();
    const kit = JSON.parse(value.options.kitArtifacts.get('flat-shot-kit-S001'));
    kit.consumer_plan.visible_window = window;
    const kitBytes = jsonBytes(kit);
    const kitHash = hashBytes(kitBytes);
    value.options.kitArtifacts.set('flat-shot-kit-S001', kitBytes);
    const kitSet = JSON.parse(value.options.flatShotKitSetBytes);
    kitSet.kits[0].sha256 = kitHash;
    kitSet.kits[0].size_bytes = kitBytes.length;
    value.options.flatShotKitSetBytes = jsonBytes(kitSet);
    value.document.flat_shot_kit_set_sha256 = hashBytes(value.options.flatShotKitSetBytes);
    value.document.shots[0].flat_shot_kit_sha256 = kitHash;
    value.document.primary_consumers[0].visible_window_ms = window;
    expectCode(value, 'consumer_shot_coverage_drift');
  }
});

test('binds the complete composition-fit record, not only crop or title metadata', () => {
  for (const mutate of [
    (fit) => { fit.text_safe_regions[0].width = 2; },
    (fit) => { fit.protected_regions[0].bbox.width = 1; },
    (fit) => { fit.motion.source_motion = 'intrinsic'; },
    (fit) => { fit.palette.dominant_hex = ['#445566']; },
  ]) {
    const value = fixture();
    mutate(value.document.primary_consumers[0].composition_fit);
    expectCode(value, 'consumer_kit_drift');
  }
});

test('rejects native primary, media-type substitution, and layered fields', () => {
  const native = fixture();
  native.document.ordinary_assets[0].route = 'hyperframes-native';
  expectCode(native, 'ordinary_asset_invalid');

  const wrongElement = fixture('pexels');
  wrongElement.document.primary_consumers[0].element = 'img';
  expectCode(wrongElement, 'primary_consumer_media_mismatch');

  const layered = fixture();
  layered.document.shots[0].scene_kit = { layers: [] };
  expectCode(layered, 'forbidden_decomposition_field');

  const hiddenUpstreamLayer = fixture();
  const design = JSON.parse(hiddenUpstreamLayer.options.designSliceBytes);
  design.shots[0].clean_plate = { artifact_id: 'not-allowed' };
  hiddenUpstreamLayer.options.designSliceBytes = jsonBytes(design);
  expectCode(hiddenUpstreamLayer, 'forbidden_decomposition_field');
});

test('allows native only as a bounded auxiliary consumer', () => {
  const value = fixture();
  value.document.auxiliary_consumers.push({
    consumer_id: 'aux-S001',
    shot_id: 'S001',
    role: 'auxiliary',
    source_kind: 'hyperframes-native',
    element: 'svg',
    selector: '#hf-aux-S001',
    visible_window_frames: { start_frame: 0, end_frame: 50, duration_frames: 50 },
  });
  assert.equal(validateMasterBindings(value.document, value.options).auxiliary_consumer_count, 1);

  value.document.auxiliary_consumers[0].role = 'primary';
  expectCode(value, 'auxiliary_consumer_invalid');
});

test('requires the immutable flat kit to remain pending while master carries verified proof', () => {
  const value = fixture();
  const kit = JSON.parse(value.options.kitArtifacts.get('flat-shot-kit-S001'));
  kit.contribution_evidence.status = 'verified';
  const bytes = jsonBytes(kit);
  value.options.kitArtifacts.set('flat-shot-kit-S001', bytes);
  value.document.shots[0].flat_shot_kit_sha256 = hashBytes(bytes);
  const set = JSON.parse(value.options.flatShotKitSetBytes);
  set.kits[0].sha256 = hashBytes(bytes);
  set.kits[0].size_bytes = bytes.length;
  value.options.flatShotKitSetBytes = jsonBytes(set);
  value.document.flat_shot_kit_set_sha256 = hashBytes(value.options.flatShotKitSetBytes);
  expectCode(value, 'unverified_contribution_claim');
});

test('rejects ROI proof outside the approved result phase or with a changed ROI', () => {
  const time = fixture();
  time.document.shots[0].contribution.capture_frame = 10;
  const { gate_receipt_sha256: ignored, ...core } = time.document.shots[0].contribution;
  time.document.shots[0].contribution.gate_receipt_sha256 = fingerprintArtifactValue(core);
  expectCode(time, 'contribution_window_or_roi_drift');

  const roi = fixture();
  roi.document.shots[0].contribution.result_roi = { x: 0, y: 0, width: 1, height: 1 };
  roi.document.shots[0].contribution.roi_pixel_count = 1;
  const { gate_receipt_sha256: ignoredRoi, ...roiCore } = roi.document.shots[0].contribution;
  roi.document.shots[0].contribution.gate_receipt_sha256 = fingerprintArtifactValue(roiCore);
  expectCode(roi, 'roi_count_mismatch');
});
