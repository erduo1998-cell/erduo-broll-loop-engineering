import { createHash } from 'node:crypto';
import { fingerprintArtifactValue, PIPELINE_CONTRACT_VERSION } from './artifact-manifest.mjs';
import { validateFrameProjection } from './compile-frame-projection.mjs';
import { validateFlatShotKit } from './validate-flat-shot-kit.mjs';
import { verifyMaterialContribution } from './roi-material-contribution.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT_ID = /^S\d{3}$/u;
const ARTIFACT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const ELEMENT_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/u;
const ORDINARY_ROUTES = new Set(['user-media', 'image-generation', 'pexels']);
const DEFERRED_FIELD = /(?:^|_)(?:layer|layers|layered|matte|depth|depth_map|clean_plate|scene_kit|hero_shot|alpha_decomposition)(?:$|_)/iu;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;

export class MasterBindingError extends Error {
  constructor(code, message, field) {
    super(message);
    this.name = 'MasterBindingError';
    this.code = code;
    if (field) this.field = field;
  }
}

const fail = (code, message, field) => {
  throw new MasterBindingError(code, message, field);
};

const exact = (value, fields, code = 'master_bindings_invalid', field = '$') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, 'Master binding record has an invalid shape.', field);
  }
};

const isSha = (value) => typeof value === 'string' && SHA256.test(value);
const same = (left, right) => fingerprintArtifactValue(left) === fingerprintArtifactValue(right);
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

function canonicalDesignBindingValue(value, field = '$design_binding') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)
      || Math.abs(value) > Number.MAX_SAFE_INTEGER) {
      fail('design_binding_number_invalid', 'Design binding numbers must be finite, non-negative-zero, and within the safe numeric magnitude.', field);
    }
    return value;
  }
  if (!value || typeof value !== 'object') {
    fail('design_binding_value_invalid', 'Design binding contains an unsupported value.', field);
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => canonicalDesignBindingValue(item, `${field}[${index}]`));
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('design_binding_value_invalid', 'Design binding objects must be plain JSON records.', field);
  }
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalDesignBindingValue(value[key], `${field}.${key}`)]),
  );
}

export function fingerprintDesignBindingValue(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonicalDesignBindingValue(value)), 'utf8')
    .digest('hex');
}

function normalizedKey(value) {
  return value.replace(/([a-z0-9])([A-Z])/gu, '$1_$2').replace(/-/gu, '_').toLowerCase();
}

function rejectDeferredFields(value, trail = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectDeferredFields(item, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const field = `${trail}.${key}`;
    if (DEFERRED_FIELD.test(normalizedKey(key))) {
      fail('forbidden_decomposition_field', 'Master bindings cannot contain deferred layered or Scene Kit fields.', field);
    }
    rejectDeferredFields(child, field);
  }
}

function asBytes(value, field) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    fail('resolved_bytes_required', 'Actual artifact bytes are required.', field);
  }
  const bytes = Buffer.from(value);
  if (bytes.length < 1) {
    fail('resolved_bytes_invalid', 'Resolved artifact bytes have an invalid size.', field);
  }
  return bytes;
}

function parseJsonBytes(value, field) {
  const bytes = asBytes(value, field);
  if (bytes.length > MAX_JSON_BYTES) fail('resolved_json_size_invalid', 'Resolved JSON artifact exceeds the deterministic size limit.', field);
  try {
    return { bytes, document: JSON.parse(bytes.toString('utf8')), sha256: hashBytes(bytes) };
  } catch {
    fail('resolved_json_invalid', 'Resolved artifact is not valid JSON.', field);
  }
}

function asSourceBytes(value, field) {
  const bytes = asBytes(value, field);
  if (bytes.length > MAX_SOURCE_BYTES) {
    fail('ordinary_source_size_exceeded', 'Resolved ordinary source exceeds the 2 GiB in-memory validation limit.', field);
  }
  return bytes;
}

function requireMap(value, field) {
  if (!(value instanceof Map)) fail('resolved_artifact_map_required', 'Resolved artifacts must be supplied as a Map.', field);
  return value;
}

function expectedShotId(index) {
  return `S${String(index + 1).padStart(3, '0')}`;
}

function validateFrameWindow(value, field) {
  exact(value, ['start_frame', 'end_frame', 'duration_frames'], 'frame_window_invalid', field);
  if (!Number.isSafeInteger(value.start_frame) || value.start_frame < 0
    || !Number.isSafeInteger(value.end_frame) || value.end_frame <= value.start_frame
    || value.duration_frames !== value.end_frame - value.start_frame) {
    fail('frame_window_invalid', 'Frame window must be a positive half-open integer interval.', field);
  }
}

function validateMsWindow(value, field) {
  exact(value, ['start_ms', 'end_ms'], 'visible_window_invalid', field);
  if (!Number.isSafeInteger(value.start_ms) || value.start_ms < 0
    || !Number.isSafeInteger(value.end_ms) || value.end_ms <= value.start_ms) {
    fail('visible_window_invalid', 'Millisecond window must be a positive half-open integer interval.', field);
  }
}

function validateBbox(value, raster, field) {
  exact(value, ['x', 'y', 'width', 'height'], 'composition_binding_invalid', field);
  if (!Number.isSafeInteger(value.x) || value.x < 0
    || !Number.isSafeInteger(value.y) || value.y < 0
    || !Number.isSafeInteger(value.width) || value.width < 1
    || !Number.isSafeInteger(value.height) || value.height < 1
    || value.x + value.width > raster.width || value.y + value.height > raster.height) {
    fail('composition_binding_invalid', 'Bound geometry must remain inside the target raster.', field);
  }
}

function validateLifecycle(value, durationFrames, field) {
  exact(value, ['entry', 'action', 'result', 'hold', 'exit'], 'lifecycle_binding_invalid', field);
  let cursor = 0;
  for (const phase of ['entry', 'action', 'result', 'hold', 'exit']) {
    exact(value[phase], ['start_frame', 'end_frame', 'behavior'], 'lifecycle_binding_invalid', `${field}.${phase}`);
    if (value[phase].start_frame !== cursor
      || !Number.isSafeInteger(value[phase].end_frame) || value[phase].end_frame <= cursor
      || typeof value[phase].behavior !== 'string' || !value[phase].behavior.trim()) {
      fail('lifecycle_binding_invalid', 'Motion lifecycle must be contiguous, non-empty, and descriptive.', `${field}.${phase}`);
    }
    cursor = value[phase].end_frame;
  }
  if (cursor !== durationFrames) fail('lifecycle_binding_invalid', 'Motion lifecycle must end at the shot duration.', field);
}

function parseResolvedInputs(document, options) {
  const design = parseJsonBytes(options.designSliceBytes, '$resolved.design_slice');
  const projection = parseJsonBytes(options.frameProjectionBytes, '$resolved.frame_projection');
  const kitSet = parseJsonBytes(options.flatShotKitSetBytes, '$resolved.flat_shot_kit_set');
  rejectDeferredFields(design.document, '$resolved.design_slice');
  rejectDeferredFields(projection.document, '$resolved.frame_projection');
  rejectDeferredFields(kitSet.document, '$resolved.flat_shot_kit_set');
  if (document.design_slice_sha256 !== design.sha256) fail('design_slice_hash_mismatch', 'Master bindings do not bind the actual design-slice bytes.', '$.design_slice_sha256');
  if (document.flat_shot_kit_set_sha256 !== kitSet.sha256) fail('flat_shot_kit_set_hash_mismatch', 'Master bindings do not bind the actual flat-kit-set bytes.', '$.flat_shot_kit_set_sha256');
  const validatedProjection = validateFrameProjection(projection.document);
  const receiptHash = fingerprintArtifactValue(validatedProjection.receipt);
  if (document.frame_projection_receipt_sha256 !== receiptHash) {
    fail('frame_projection_receipt_mismatch', 'Master bindings do not bind the actual shared projection receipt.', '$.frame_projection_receipt_sha256');
  }
  if (design.document?.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || kitSet.document?.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION) {
    fail('pipeline_upgrade_required', 'Resolved design and kit-set artifacts must use pipeline contract version 2.');
  }
  exact(kitSet.document, [
    'schema_version',
    'pipeline_contract_version',
    'director_manifest_sha256',
    'shot_plan_sha256',
    'design_slice_sha256',
    'target_raster',
    'shot_count',
    'kits',
  ], 'flat_shot_kit_set_invalid', '$resolved.flat_shot_kit_set');
  if (kitSet.document.schema_version !== 1 || !isSha(kitSet.document.director_manifest_sha256)
    || !isSha(kitSet.document.shot_plan_sha256) || !isSha(kitSet.document.design_slice_sha256)) {
    fail('flat_shot_kit_set_invalid', 'Resolved flat-kit-set identity is invalid.', '$resolved.flat_shot_kit_set');
  }
  if (design.document.plan_sha256 !== document.shot_plan_sha256
    || kitSet.document.shot_plan_sha256 !== document.shot_plan_sha256
    || validatedProjection.plan_sha256 !== document.shot_plan_sha256) {
    fail('shot_plan_drift', 'Plan binding differs across master, design, kit set, or projection.');
  }
  if (kitSet.document.design_slice_sha256 !== design.sha256
    || design.document.frame_projection?.projection_sha256 !== validatedProjection.receipt.projection_sha256
    || design.document.parsed_srt_sha256 !== validatedProjection.parsed_srt_sha256) {
    fail('upstream_artifact_drift', 'Design, projection, and kit-set artifacts are not one approved upstream chain.');
  }
  if (!Array.isArray(design.document.shots) || !design.document.shots.length
    || !Array.isArray(validatedProjection.shots)
    || !Array.isArray(kitSet.document.kits)
    || design.document.shots.length !== validatedProjection.shots.length
    || design.document.shots.length !== kitSet.document.kits.length
    || kitSet.document.shot_count !== design.document.shots.length) {
    fail('shot_coverage_invalid', 'Resolved design, projection, and kit set must cover the same shots.');
  }
  exact(kitSet.document.target_raster, ['width', 'height'], 'target_raster_invalid', '$resolved.flat_shot_kit_set.target_raster');
  if (!same(document.target_raster, kitSet.document.target_raster)) {
    fail('target_raster_drift', 'Master target raster differs from the approved flat-kit set.', '$.target_raster');
  }
  return { design, projection: validatedProjection, kitSet };
}

function resolveKits(kitSet, kitArtifacts) {
  const resolved = requireMap(kitArtifacts, '$resolved.kit_artifacts');
  const kits = new Map();
  for (const [index, record] of kitSet.document.kits.entries()) {
    exact(record, ['shot_id', 'artifact_id', 'sha256', 'size_bytes'], 'kit_record_invalid', `$resolved.flat_shot_kit_set.kits[${index}]`);
    if (record.shot_id !== expectedShotId(index) || !ARTIFACT_ID.test(record.artifact_id ?? '')
      || !isSha(record.sha256) || !Number.isSafeInteger(record.size_bytes) || record.size_bytes < 1) {
      fail('kit_record_invalid', 'Flat-kit set member record is invalid.', `$resolved.flat_shot_kit_set.kits[${index}]`);
    }
    if (!resolved.has(record.artifact_id)) fail('kit_bytes_missing', 'Actual approved flat-kit bytes are missing.', `$resolved.kits.${record.artifact_id}`);
    const parsed = parseJsonBytes(resolved.get(record.artifact_id), `$resolved.kits.${record.artifact_id}`);
    if (parsed.sha256 !== record.sha256 || parsed.bytes.length !== record.size_bytes) {
      fail('kit_bytes_hash_mismatch', 'Resolved flat-kit bytes do not match their set record.', `$resolved.kits.${record.artifact_id}`);
    }
    const receipt = validateFlatShotKit(parsed.document);
    if (receipt.shot_id !== record.shot_id || receipt.design_slice_sha256 !== kitSet.document.design_slice_sha256
      || !same(parsed.document.target_raster, kitSet.document.target_raster)
      || receipt.contribution_status !== 'pending-master-build') {
      fail('kit_upstream_drift', 'Resolved flat kit differs from the approved design, raster, shot, or pending state.', `$resolved.kits.${record.artifact_id}`);
    }
    kits.set(record.shot_id, { record, document: parsed.document });
  }
  if (resolved.size !== kits.size) fail('undeclared_kit_bytes', 'Resolved kit map contains undeclared artifacts.', '$resolved.kit_artifacts');
  return kits;
}

function validateOrdinaryAssets(document, kits, sourceArtifacts) {
  const sources = requireMap(sourceArtifacts, '$resolved.source_artifacts');
  const assets = new Map();
  const usedSources = new Set();
  if (!Array.isArray(document.ordinary_assets) || document.ordinary_assets.length !== kits.size) {
    fail('ordinary_asset_coverage_invalid', 'Every shot needs exactly one ordinary primary asset.', '$.ordinary_assets');
  }
  for (const [index, asset] of document.ordinary_assets.entries()) {
    const field = `$.ordinary_assets[${index}]`;
    exact(asset, ['asset_id', 'shot_id', 'route', 'media_kind', 'locator_id', 'source_sha256', 'size_bytes'], 'ordinary_asset_invalid', field);
    const kit = kits.get(asset.shot_id)?.document;
    if (!kit || asset.shot_id !== expectedShotId(index) || !ARTIFACT_ID.test(asset.asset_id ?? '')
      || assets.has(asset.asset_id) || !ORDINARY_ROUTES.has(asset.route)
      || !['image', 'video'].includes(asset.media_kind) || !ARTIFACT_ID.test(asset.locator_id ?? '')
      || !isSha(asset.source_sha256) || !Number.isSafeInteger(asset.size_bytes) || asset.size_bytes < 1) {
      fail('ordinary_asset_invalid', 'Ordinary assets must be ordered, unique, and use a non-native image/video route.', field);
    }
    const expected = kit.primary_asset;
    if (asset.asset_id !== expected.asset_id || asset.route !== expected.route
      || asset.media_kind !== expected.media_kind || asset.locator_id !== expected.frozen.locator_id
      || asset.source_sha256 !== expected.frozen.sha256 || asset.size_bytes !== expected.frozen.size_bytes) {
      fail('ordinary_asset_kit_drift', 'Ordinary asset binding differs from the approved flat kit.', field);
    }
    if (!sources.has(asset.locator_id)) fail('ordinary_source_bytes_missing', 'Actual ordinary source bytes are required.', field);
    const bytes = asSourceBytes(sources.get(asset.locator_id), `$resolved.source_artifacts.${asset.locator_id}`);
    if (bytes.length !== asset.size_bytes || hashBytes(bytes) !== asset.source_sha256) {
      fail('ordinary_source_bytes_mismatch', 'Ordinary source bytes do not match the approved kit.', field);
    }
    usedSources.add(asset.locator_id);
    assets.set(asset.asset_id, asset);
  }
  if ([...sources.keys()].some((key) => !usedSources.has(key))) {
    fail('undeclared_source_bytes', 'Resolved source map contains bytes not declared by schema-3 bindings.', '$resolved.source_artifacts');
  }
  return assets;
}

function validatePrimaryConsumers(document, kits, assets) {
  if (!Array.isArray(document.primary_consumers) || document.primary_consumers.length !== kits.size) {
    fail('primary_consumer_coverage_invalid', 'Every shot needs exactly one visible primary consumer.', '$.primary_consumers');
  }
  const consumers = new Map();
  const selectors = new Set();
  for (const [index, consumer] of document.primary_consumers.entries()) {
    const field = `$.primary_consumers[${index}]`;
    exact(consumer, [
      'consumer_id',
      'shot_id',
      'asset_id',
      'role',
      'element',
      'fit',
      'visible',
      'opacity_basis_points',
      'source_element_id',
      'selector',
      'selector_sha256',
      'source_sha256',
      'composition_fit',
      'visible_window_ms',
      'frame_window',
    ], 'primary_consumer_invalid', field);
    const kit = kits.get(consumer.shot_id)?.document;
    const asset = assets.get(consumer.asset_id);
    if (!kit || !asset || consumer.shot_id !== expectedShotId(index)
      || consumer.consumer_id !== kit.consumer_plan.consumer_id || consumers.has(consumer.consumer_id)
      || consumer.asset_id !== kit.primary_asset.asset_id || consumer.role !== 'primary'
      || consumer.visible !== true || consumer.opacity_basis_points !== 10000
      || !ELEMENT_ID.test(consumer.source_element_id ?? '')
      || consumer.selector !== `#${consumer.source_element_id}` || selectors.has(consumer.selector)
      || consumer.selector_sha256 !== fingerprintArtifactValue({ source_element_id: consumer.source_element_id, selector: consumer.selector })
      || consumer.source_sha256 !== asset.source_sha256) {
      fail('primary_consumer_invalid', 'Primary consumer identity, visibility, selector, or source binding is invalid.', field);
    }
    const allowedElements = asset.media_kind === 'video' ? ['video'] : ['img', 'background-image'];
    if (!allowedElements.includes(consumer.element)
      || consumer.element !== kit.consumer_plan.element || consumer.fit !== kit.consumer_plan.fit) {
      fail('primary_consumer_media_mismatch', 'Primary consumer is not type-correct for the approved ordinary asset.', field);
    }
    exact(consumer.composition_fit, [
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
    ], 'composition_binding_invalid', `${field}.composition_fit`);
    if (!same(consumer.composition_fit, kit.composition_fit)
      || !same(consumer.visible_window_ms, kit.consumer_plan.visible_window)
    ) {
      fail('consumer_kit_drift', 'Consumer composition-fit or window differs from the approved flat kit.', field);
    }
    validateBbox(consumer.composition_fit.output_crop_bbox, document.target_raster, `${field}.composition_fit.output_crop_bbox`);
    validateBbox(consumer.composition_fit.result_roi, document.target_raster, `${field}.composition_fit.result_roi`);
    validateMsWindow(consumer.visible_window_ms, `${field}.visible_window_ms`);
    validateFrameWindow(consumer.frame_window, `${field}.frame_window`);
    consumers.set(consumer.consumer_id, consumer);
    selectors.add(consumer.selector);
  }
  return consumers;
}

function validateAuxiliaryConsumers(document, shotIds, primaryConsumers) {
  if (!Array.isArray(document.auxiliary_consumers)) fail('auxiliary_consumer_invalid', 'Auxiliary consumers must be an array.', '$.auxiliary_consumers');
  const ids = new Set(primaryConsumers.keys());
  const selectors = new Set([...primaryConsumers.values()].map((item) => item.selector));
  for (const [index, consumer] of document.auxiliary_consumers.entries()) {
    const field = `$.auxiliary_consumers[${index}]`;
    exact(consumer, ['consumer_id', 'shot_id', 'role', 'source_kind', 'element', 'selector', 'visible_window_frames'], 'auxiliary_consumer_invalid', field);
    if (!ARTIFACT_ID.test(consumer.consumer_id ?? '') || ids.has(consumer.consumer_id)
      || !shotIds.has(consumer.shot_id) || consumer.role !== 'auxiliary'
      || consumer.source_kind !== 'hyperframes-native'
      || !['html', 'svg', 'canvas'].includes(consumer.element)
      || typeof consumer.selector !== 'string' || !/^#[A-Za-z][A-Za-z0-9._:-]{0,127}$/u.test(consumer.selector)
      || selectors.has(consumer.selector)) {
      fail('auxiliary_consumer_invalid', 'Native consumers are allowed only as unique auxiliary consumers.', field);
    }
    validateFrameWindow(consumer.visible_window_frames, `${field}.visible_window_frames`);
    ids.add(consumer.consumer_id);
    selectors.add(consumer.selector);
  }
}

function validateShots(document, resolved, kits, assets, consumers, contributionArtifacts) {
  if (!Array.isArray(document.shots) || document.shots.length !== kits.size) {
    fail('shot_coverage_invalid', 'Schema-3 shot bindings must cover every approved shot.', '$.shots');
  }
  const contributionBytes = requireMap(contributionArtifacts, '$resolved.contribution_artifacts');
  const usedContributionArtifacts = new Set();
  for (const [index, shot] of document.shots.entries()) {
    const field = `$.shots[${index}]`;
    exact(shot, [
      'shot_id',
      'design_shot_sha256',
      'flat_shot_kit_artifact_id',
      'flat_shot_kit_sha256',
      'srt_window_ms',
      'frame_window',
      'lifecycle',
      'ordinary_asset_id',
      'primary_consumer_id',
      'result_roi',
      'contribution',
    ], 'shot_binding_invalid', field);
    const expectedId = expectedShotId(index);
    const designShot = resolved.design.document.shots[index];
    const projectedShot = resolved.projection.shots[index];
    const kitEntry = kits.get(expectedId);
    const asset = assets.get(shot.ordinary_asset_id);
    const consumer = consumers.get(shot.primary_consumer_id);
    if (shot.shot_id !== expectedId || designShot?.shot_id !== expectedId || projectedShot?.shot_id !== expectedId
      || shot.design_shot_sha256 !== fingerprintDesignBindingValue(designShot)
      || !kitEntry || shot.flat_shot_kit_artifact_id !== kitEntry.record.artifact_id
      || shot.flat_shot_kit_sha256 !== kitEntry.record.sha256
      || !same(shot.srt_window_ms, designShot.srt_window_ms)
      || !same(shot.srt_window_ms, projectedShot.srt_window_ms)
      || !same(shot.frame_window, projectedShot.frame_window)
      || shot.frame_window.start_frame !== designShot.start_frame
      || shot.frame_window.duration_frames !== designShot.duration_frames
      || !asset || asset.shot_id !== expectedId || !consumer || consumer.shot_id !== expectedId
      || consumer.asset_id !== asset.asset_id
      || !same(shot.result_roi, kitEntry.document.composition_fit.result_roi)
      || !same(consumer.frame_window, shot.frame_window)
      || !same(consumer.composition_fit.result_roi, shot.result_roi)) {
      fail('shot_upstream_drift', 'Shot binding differs from the exact design shot, projection, kit, asset, or consumer.', field);
    }
    if (consumer.visible_window_ms.start_ms !== 0
      || consumer.visible_window_ms.end_ms !== shot.srt_window_ms.end_ms - shot.srt_window_ms.start_ms) {
      fail('consumer_shot_coverage_drift', 'Primary consumer must remain visible for the complete relative shot window.', `${field}.primary_consumer_id`);
    }
    validateMsWindow(shot.srt_window_ms, `${field}.srt_window_ms`);
    validateFrameWindow(shot.frame_window, `${field}.frame_window`);
    validateLifecycle(shot.lifecycle, shot.frame_window.duration_frames, `${field}.lifecycle`);
    const expectedLifecycle = {
      entry: designShot.motion.entry,
      action: designShot.motion.action,
      result: designShot.motion.result,
      hold: designShot.motion.hold,
      exit: designShot.motion.exit,
    };
    if (!same(shot.lifecycle, expectedLifecycle)) fail('lifecycle_design_drift', 'Bound lifecycle differs from the exact approved design shot.', `${field}.lifecycle`);
    const contribution = verifyMaterialContribution(shot.contribution, { artifacts: contributionBytes });
    const resultStart = shot.frame_window.start_frame + shot.lifecycle.result.start_frame;
    const resultEnd = shot.frame_window.start_frame + shot.lifecycle.result.end_frame;
    if (contribution.capture_frame < resultStart || contribution.capture_frame >= resultEnd
      || !same(shot.contribution.target_raster, document.target_raster)
      || !same(shot.contribution.result_roi, shot.result_roi)) {
      fail('contribution_window_or_roi_drift', 'ROI ablation must use the frozen result phase, raster, and result ROI.', `${field}.contribution`);
    }
    for (const record of [shot.contribution.enabled_frame, shot.contribution.disabled_frame, shot.contribution.roi_diff]) {
      if (usedContributionArtifacts.has(record.artifact_id)) {
        fail('contribution_artifact_reused', 'Each shot needs independent enabled, disabled, and diff evidence artifacts.', `${field}.contribution`);
      }
      usedContributionArtifacts.add(record.artifact_id);
    }
  }
  if ([...contributionBytes.keys()].some((key) => !usedContributionArtifacts.has(key))) {
    fail('undeclared_contribution_bytes', 'Contribution artifact map contains undeclared bytes.', '$resolved.contribution_artifacts');
  }
}

export function inspectMasterBindings(document, resolvedOptions) {
  if (!document || document.schema_version !== 3 || document.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION) {
    return {
      resume_eligible: false,
      code: 'pipeline_upgrade_required',
      schema_version: Number.isSafeInteger(document?.schema_version) ? document.schema_version : null,
      pipeline_contract_version: Number.isSafeInteger(document?.pipeline_contract_version)
        ? document.pipeline_contract_version
        : null,
    };
  }
  if (resolvedOptions === undefined) {
    return {
      resume_eligible: false,
      code: 'validation_required',
      schema_version: 3,
      pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
      shot_count: Array.isArray(document.shots) ? document.shots.length : null,
    };
  }
  const receipt = validateMasterBindings(document, resolvedOptions);
  return {
    resume_eligible: true,
    code: null,
    schema_version: 3,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    shot_count: receipt.shot_count,
    binding_sha256: receipt.binding_sha256,
  };
}

export function validateMasterBindings(document, {
  designSliceBytes,
  frameProjectionBytes,
  flatShotKitSetBytes,
  kitArtifacts,
  sourceArtifacts,
  contributionArtifacts,
} = {}) {
  rejectDeferredFields(document);
  if (document?.schema_version !== 3 || document?.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION) {
    fail('pipeline_upgrade_required', 'Only schema-3, pipeline-version-2 master bindings may validate or resume.');
  }
  exact(document, [
    'schema_version',
    'pipeline_contract_version',
    'shot_plan_sha256',
    'design_slice_sha256',
    'flat_shot_kit_set_sha256',
    'frame_projection_receipt_sha256',
    'target_raster',
    'shots',
    'ordinary_assets',
    'primary_consumers',
    'auxiliary_consumers',
  ]);
  if (!isSha(document.shot_plan_sha256) || !isSha(document.design_slice_sha256)
    || !isSha(document.flat_shot_kit_set_sha256) || !isSha(document.frame_projection_receipt_sha256)) {
    fail('master_bindings_invalid', 'Schema-3 upstream hashes are invalid.');
  }
  exact(document.target_raster, ['width', 'height'], 'target_raster_invalid', '$.target_raster');
  if (!Number.isSafeInteger(document.target_raster.width) || document.target_raster.width < 1
    || document.target_raster.width > 16384
    || !Number.isSafeInteger(document.target_raster.height) || document.target_raster.height < 1
    || document.target_raster.height > 16384) {
    fail('target_raster_invalid', 'Master target raster is invalid.', '$.target_raster');
  }

  const resolved = parseResolvedInputs(document, { designSliceBytes, frameProjectionBytes, flatShotKitSetBytes });
  const kits = resolveKits(resolved.kitSet, kitArtifacts);
  const assets = validateOrdinaryAssets(document, kits, sourceArtifacts);
  const consumers = validatePrimaryConsumers(document, kits, assets);
  validateShots(document, resolved, kits, assets, consumers, contributionArtifacts);
  validateAuxiliaryConsumers(document, new Set(document.shots.map((shot) => shot.shot_id)), consumers);
  return {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    shot_count: document.shots.length,
    ordinary_asset_count: document.ordinary_assets.length,
    primary_consumer_count: document.primary_consumers.length,
    auxiliary_consumer_count: document.auxiliary_consumers.length,
    verified_contribution_count: document.shots.length,
    binding_sha256: fingerprintArtifactValue(document),
  };
}
