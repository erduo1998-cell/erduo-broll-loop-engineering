import {
  assertNoLegacyActiveFields,
  createGateReceipt,
  fingerprintV3Value,
  validateGateReceipt,
  validateProductionContract,
  validateValidationPolicy,
} from './validate-production-contract.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const BLOCK_ID = /^B[0-9]{3}$/u;
const SHOT_ID = /^S[0-9]{3}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const PHASES = Object.freeze([
  'entry',
  'action',
  'result',
  'hold',
  'exit',
]);
const INPUT_FIELDS = Object.freeze([
  'prior_contract',
  'director_policy_receipt',
  'canonical_artifacts',
  'asset_manifest',
  'sealed_policy_receipt',
  'production_contract',
  'validation_policy',
  'block_manifest',
  'source_bundle',
  'source_conformance_receipt',
  'runtime_seek_receipt',
  'pixel_facts',
]);
const CANONICAL_ARTIFACT_FIELDS = Object.freeze([
  'parsedSrt',
  'shotPlan',
  'designSystem',
  'componentRegistry',
  'validationPolicy',
  'referenceStyleProfile',
  'fontPackage',
  'projection',
  'deliveryProfile',
]);
const MANIFEST_FIELDS = Object.freeze([
  'schema_version',
  'pipeline_contract_version',
  'block_id',
  'namespace',
  'mode',
  'production_contract_sha256',
  'projection_sha256',
  'asset_manifest_sha256',
  'start_frame',
  'end_frame',
  'shot_ids',
  'shots',
  'source_sha256',
  'runtime_sample_plan_sha256',
  'pixel_frame_plan_sha256',
  'block_manifest_sha256',
]);
const SOURCE_BUNDLE_FIELDS = Object.freeze([
  'schema_version',
  'block_id',
  'files',
  'materials',
  'font_package',
  'source_sha256',
]);
const PIXEL_FACT_FIELDS = Object.freeze([
  'schema_version',
  'block_id',
  'samples',
  'adjacent_pairs',
]);
const SAMPLE_FIELDS = Object.freeze([
  'sample_id',
  'shot_id',
  'phase',
  'frame',
  'mean_luma',
  'visible_coverage_ratio',
  'alpha_coverage_ratio',
  'frozen_ratio',
  'transform_matrix',
  'dom_overflow_px',
  'text_overflow_px',
  'text_clipped',
  'nondecorative_overlap_count',
  'primary_roi_visible_ratio',
  'functional_text_min_ratio',
  'microtext_only_result',
  'font_loaded',
  'font_family_match',
  'font_weight_match',
  'glyph_coverage',
  'result_visible',
  'subject_bbox',
  'focal_point',
  'density_facts',
  'geometry_signature',
]);
const ADJACENT_FIELDS = Object.freeze([
  'left_shot_id',
  'right_shot_id',
  'contract_declares_change',
  'phash_distance',
  'ssim',
  'geometry_changed',
  'focal_changed',
  'density_changed',
]);
const ASSET_MANIFEST_FIELDS = Object.freeze([
  'schema_version',
  'pipeline_contract_version',
  'authoring_topology_id',
  'validation_policy_id',
  'artifact_kind',
  'prior_contract_sha256',
  'director_policy_receipt_sha256',
  'shot_plan_sha256',
  'assets',
]);
const ASSET_FIELDS = Object.freeze([
  'shot_id',
  'asset_id',
  'route',
  'route_order',
  'selection_basis',
  'bytes_sha256',
  'size_bytes',
  'probe',
  'rights',
  'provenance',
  'crop',
  'safe_region',
  'focal_point',
  'title_relation',
  'consumer',
]);
const ROUTE_ORDER = Object.freeze([
  'user-media',
  'image-generation',
  'pexels',
  'native-auxiliary',
]);

class BlockPixelGateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BlockPixelGateError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new BlockPixelGateError(code, message);
};

function exact(value, fields, code, message) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...fields].sort())
  ) fail(code, message);
}

function validateAssetManifest(
  assetManifest,
  priorContract,
  directorReceipt,
  canonicalArtifacts,
) {
  exact(
    assetManifest,
    ASSET_MANIFEST_FIELDS,
    'pixel_gate_contract_invalid',
    'Pixel gate requires the actual P3 asset manifest.',
  );
  const shots = canonicalArtifacts?.shotPlan?.shots;
  if (
    assetManifest.schema_version !== 1
    || assetManifest.pipeline_contract_version !== 3
    || assetManifest.authoring_topology_id
      !== priorContract.authoring_topology_id
    || assetManifest.validation_policy_id
      !== priorContract.validation_policy_id
    || assetManifest.artifact_kind !== 'asset-facts-manifest'
    || assetManifest.prior_contract_sha256
      !== priorContract.production_contract_sha256
    || assetManifest.director_policy_receipt_sha256
      !== directorReceipt.receipt_sha256
    || assetManifest.shot_plan_sha256 !== priorContract.shot_plan_sha256
    || !Array.isArray(shots)
    || !Array.isArray(assetManifest.assets)
    || assetManifest.assets.length !== shots.length
  ) {
    fail(
      'pixel_gate_contract_invalid',
      'Pixel gate asset manifest is not bound to the director evidence.',
    );
  }
  const seenAssets = new Set();
  for (const [index, asset] of assetManifest.assets.entries()) {
    exact(
      asset,
      ASSET_FIELDS,
      'pixel_gate_contract_invalid',
      'Pixel gate asset manifest contains an invalid asset fact.',
    );
    exact(
      asset.selection_basis,
      ['status', 'evidence_refs'],
      'pixel_gate_contract_invalid',
      'Pixel gate asset selection basis is invalid.',
    );
    exact(
      asset.rights,
      ['status', 'basis', 'evidence_sha256'],
      'pixel_gate_contract_invalid',
      'Pixel gate asset rights evidence is invalid.',
    );
    exact(
      asset.provenance,
      ['origin', 'source_id'],
      'pixel_gate_contract_invalid',
      'Pixel gate asset provenance is invalid.',
    );
    exact(
      asset.consumer,
      ['consumer_id', 'role', 'element', 'fit'],
      'pixel_gate_contract_invalid',
      'Pixel gate asset consumer is invalid.',
    );
    if (
      asset.shot_id !== shots[index].shot_id
      || !SAFE_ID.test(asset.asset_id ?? '')
      || seenAssets.has(asset.asset_id)
      || !['user-media', 'image-generation', 'pexels'].includes(asset.route)
      || JSON.stringify(asset.route_order) !== JSON.stringify(ROUTE_ORDER)
      || asset.selection_basis.status !== 'sufficient'
      || !Array.isArray(asset.selection_basis.evidence_refs)
      || asset.selection_basis.evidence_refs.length < 1
      || !SHA256.test(asset.bytes_sha256 ?? '')
      || !Number.isSafeInteger(asset.size_bytes)
      || asset.size_bytes < 1
      || !asset.probe
      || typeof asset.probe !== 'object'
      || Array.isArray(asset.probe)
      || !['cleared', 'conditional'].includes(asset.rights.status)
      || !SHA256.test(asset.rights.evidence_sha256 ?? '')
      || asset.provenance.origin !== asset.route
      || asset.consumer.role !== 'ordinary-primary'
      || !['img', 'video'].includes(asset.consumer.element)
      || !['contain', 'cover'].includes(asset.consumer.fit)
    ) {
      fail(
        'pixel_gate_contract_invalid',
        'Pixel gate asset facts are incomplete or stale.',
      );
    }
    seenAssets.add(asset.asset_id);
  }
}

function validatePolicyReceipt(
  receipt,
  contract,
  validationPolicy,
  phase,
  scopeId,
) {
  let result;
  try {
    result = validateGateReceipt(receipt, {
      productionContract: contract,
      validationPolicy,
    });
  } catch (error) {
    fail(error?.code ?? 'pixel_gate_contract_invalid', error?.message
      ?? 'Pixel gate policy receipt is invalid.');
  }
  if (
    result.status !== 'passed'
    || result.gate !== 'policy-gate'
    || result.phase !== phase
    || result.scope_id !== scopeId
  ) {
    fail(
      'pixel_gate_contract_invalid',
      `Pixel gate requires the passed ${phase} policy receipt.`,
    );
  }
}

function validateProductionEvidence(input) {
  try {
    assertNoLegacyActiveFields(input);
    validateValidationPolicy(input.validation_policy);
    validateProductionContract(input.prior_contract, {
      artifacts: input.canonical_artifacts,
    });
  } catch (error) {
    fail(error?.code ?? 'pixel_gate_contract_invalid', error?.message
      ?? 'Pixel gate production evidence is invalid.');
  }
  exact(
    input.canonical_artifacts,
    CANONICAL_ARTIFACT_FIELDS,
    'pixel_gate_contract_invalid',
    'Pixel gate canonical artifacts must use the closed P3 shape.',
  );
  if (
    input.prior_contract.contract_phase !== 'director'
    || input.prior_contract.validation_policy_sha256
      !== input.validation_policy.validation_policy_sha256
  ) {
    fail(
      'pixel_gate_contract_invalid',
      'Pixel gate requires the exact director contract and policy.',
    );
  }
  validatePolicyReceipt(
    input.director_policy_receipt,
    input.prior_contract,
    input.validation_policy,
    'director',
    'director',
  );
  validateAssetManifest(
    input.asset_manifest,
    input.prior_contract,
    input.director_policy_receipt,
    input.canonical_artifacts,
  );
  try {
    validateProductionContract(input.production_contract, {
      artifacts: input.canonical_artifacts,
      priorContract: input.prior_contract,
      assetManifest: input.asset_manifest,
    });
  } catch (error) {
    fail(error?.code ?? 'pixel_gate_contract_invalid', error?.message
      ?? 'Pixel gate sealed production evidence is invalid.');
  }
  if (
    input.production_contract.contract_phase !== 'sealed'
    || input.production_contract.validation_policy_sha256
      !== input.validation_policy.validation_policy_sha256
  ) {
    fail(
      'pixel_gate_contract_invalid',
      'Pixel gate requires the exact sealed production contract and policy.',
    );
  }
  validatePolicyReceipt(
    input.sealed_policy_receipt,
    input.production_contract,
    input.validation_policy,
    'sealed',
    'sealed',
  );
}

function sourceBundleCore(sourceBundle) {
  return {
    schema_version: sourceBundle.schema_version,
    block_id: sourceBundle.block_id,
    files: sourceBundle.files.map((file) => ({
      relative_path: file.relative_path,
      media_type: file.media_type,
      bytes_sha256: file.bytes_sha256,
    })),
    materials: sourceBundle.materials.map((material) => ({
      asset_id: material.asset_id,
      media_kind: material.media_kind,
      consumer_role: material.consumer_role,
      bytes_sha256: material.bytes_sha256,
      auxiliary: material.auxiliary,
    })),
    font_package: {
      family: sourceBundle.font_package.family,
      weights: sourceBundle.font_package.weights,
      glyph_ranges: sourceBundle.font_package.glyph_ranges,
      bytes_sha256: sourceBundle.font_package.bytes_sha256,
    },
  };
}

function sourceInspectionState(sourceBundle, validationPolicy) {
  return fingerprintV3Value({
    inspection_schema: 'block-source-structural-v1',
    parser_kinds: ['parse5', 'acorn', 'postcss'],
    hyperframes_version:
      validationPolicy.tool_bindings.hyperframes_version,
    declared_dependency_set_sha256: fingerprintV3Value({
      materials: sourceBundle.materials.map((material) => ({
        asset_id: material.asset_id,
        bytes_sha256: material.bytes_sha256,
      })),
      font: {
        family: sourceBundle.font_package.family,
        bytes_sha256: sourceBundle.font_package.bytes_sha256,
      },
    }),
  });
}

function validateSourceBundle(sourceBundle, manifest) {
  exact(
    sourceBundle,
    SOURCE_BUNDLE_FIELDS,
    'pixel_source_bundle_invalid',
    'Pixel gate source bundle has an invalid shape.',
  );
  if (
    sourceBundle.schema_version !== 1
    || sourceBundle.block_id !== manifest.block_id
    || !Array.isArray(sourceBundle.files)
    || sourceBundle.files.length < 1
    || sourceBundle.files.length > 128
    || !Array.isArray(sourceBundle.materials)
    || sourceBundle.materials.length < 1
    || sourceBundle.materials.length > 128
    || !sourceBundle.font_package
    || typeof sourceBundle.font_package !== 'object'
    || Array.isArray(sourceBundle.font_package)
    || !SHA256.test(sourceBundle.source_sha256 ?? '')
    || fingerprintV3Value(sourceBundleCore(sourceBundle))
      !== sourceBundle.source_sha256
    || sourceBundle.source_sha256 !== manifest.source_sha256
  ) {
    fail(
      'pixel_source_bundle_invalid',
      'Pixel gate source bytes are not bound to the block manifest.',
    );
  }
}

function validateManifest(manifest, productionContract) {
  exact(
    manifest,
    MANIFEST_FIELDS,
    'pixel_block_manifest_invalid',
    'Pixel gate block manifest has an invalid shape.',
  );
  const core = Object.fromEntries(
    Object.entries(manifest).filter(
      ([key]) => key !== 'block_manifest_sha256',
    ),
  );
  if (
    manifest.schema_version !== 1
    || manifest.pipeline_contract_version !== 3
    || !BLOCK_ID.test(manifest.block_id ?? '')
    || !SAFE_ID.test(manifest.namespace ?? '')
    || !['faceless', 'talking-head'].includes(manifest.mode)
    || manifest.production_contract_sha256
      !== productionContract.production_contract_sha256
    || manifest.projection_sha256 !== productionContract.projection_sha256
    || manifest.asset_manifest_sha256
      !== productionContract.asset_manifest_sha256
    || !Number.isSafeInteger(manifest.start_frame)
    || !Number.isSafeInteger(manifest.end_frame)
    || manifest.start_frame < 0
    || manifest.end_frame <= manifest.start_frame
    || !Array.isArray(manifest.shot_ids)
    || manifest.shot_ids.length < 1
    || !Array.isArray(manifest.shots)
    || manifest.shots.length !== manifest.shot_ids.length
    || !SHA256.test(manifest.source_sha256 ?? '')
    || !SHA256.test(manifest.runtime_sample_plan_sha256 ?? '')
    || !SHA256.test(manifest.pixel_frame_plan_sha256 ?? '')
    || !SHA256.test(manifest.block_manifest_sha256 ?? '')
    || fingerprintV3Value(core) !== manifest.block_manifest_sha256
  ) {
    fail(
      'pixel_block_manifest_invalid',
      'Pixel gate block manifest is invalid or stale.',
    );
  }
}

function pixelFramePlan(manifest) {
  const plan = [];
  const seenShots = new Set();
  for (const [shotIndex, shot] of manifest.shots.entries()) {
    if (
      !shot
      || typeof shot !== 'object'
      || Array.isArray(shot)
      || !SHOT_ID.test(shot.shot_id ?? '')
      || shot.shot_id !== manifest.shot_ids[shotIndex]
      || seenShots.has(shot.shot_id)
      || !Number.isSafeInteger(shot.start_frame)
      || !Number.isSafeInteger(shot.end_frame)
      || shot.start_frame < manifest.start_frame
      || shot.end_frame > manifest.end_frame
      || shot.end_frame <= shot.start_frame
    ) {
      fail(
        'pixel_frame_plan_invalid',
        'Pixel frame plan contains an invalid shot.',
      );
    }
    seenShots.add(shot.shot_id);
    exact(
      shot.causal_lifecycle,
      PHASES,
      'pixel_frame_plan_invalid',
      'Every shot must bind all causal phases.',
    );
    const hold = shot.causal_lifecycle.hold;
    exact(
      hold,
      [
        'start_frame',
        'end_frame',
        'selectors',
        'timeline_call_ids',
      ],
      'pixel_frame_plan_invalid',
      'Pixel Hold checkpoint has an invalid shape.',
    );
    if (
      !Number.isSafeInteger(hold.start_frame)
      || !Number.isSafeInteger(hold.end_frame)
      || hold.start_frame < shot.start_frame
      || hold.end_frame > shot.end_frame
      || hold.end_frame <= hold.start_frame
      || !Array.isArray(hold.selectors)
      || hold.selectors.length < 1
      || !Array.isArray(hold.timeline_call_ids)
    ) {
      fail(
        'pixel_frame_plan_invalid',
        'Pixel Hold checkpoint is outside its shot.',
      );
    }
    plan.push({
      shot_id: shot.shot_id,
      phase: 'hold',
      frame: hold.start_frame,
    });
  }
  if (
    manifest.shots[0].start_frame !== manifest.start_frame
    || manifest.shots.at(-1).end_frame !== manifest.end_frame
    || manifest.shots.some(
      (shot, index) => index > 0
        && shot.start_frame !== manifest.shots[index - 1].end_frame,
    )
    || fingerprintV3Value(plan) !== manifest.pixel_frame_plan_sha256
  ) {
    fail(
      'pixel_frame_plan_invalid',
      'Pixel frame plan does not bind the current block windows.',
    );
  }
  return plan;
}

function validateReceiptLineage(
  receipt,
  gate,
  productionContract,
  validationPolicy,
  manifest,
  sourceBundle,
  sourceReceipt = null,
  stateOrFrame = 'source',
) {
  try {
    validateGateReceipt(receipt, {
      productionContract,
      validationPolicy,
    });
  } catch (error) {
    fail(error?.code ?? 'pixel_gate_lineage_invalid', error?.message
      ?? 'Pixel gate lineage receipt is invalid.');
  }
  if (
    receipt.gate !== gate
    || receipt.phase !== 'block'
    || receipt.scope_id !== manifest.block_id
    || receipt.status !== 'passed'
    || receipt.input_bindings.block_manifest_sha256
      !== manifest.block_manifest_sha256
    || receipt.input_bindings.source_sha256 !== sourceBundle.source_sha256
    || receipt.cache.cache_key_sha256 !== fingerprintV3Value({
      source_sha256: sourceBundle.source_sha256,
      policy_sha256: validationPolicy.validation_policy_sha256,
      production_contract_sha256:
        productionContract.production_contract_sha256,
      renderer_version: validationPolicy.tool_bindings.renderer_version,
      hyperframes_version:
        validationPolicy.tool_bindings.hyperframes_version,
      state_or_frame: stateOrFrame,
    })
    || sourceReceipt
      && receipt.input_bindings.source_conformance_receipt_sha256
        !== sourceReceipt.receipt_sha256
  ) {
    fail(
      'pixel_gate_lineage_invalid',
      'Pixel gate lineage does not bind current block bytes.',
    );
  }
}

function finite(value, code = 'pixel_facts_invalid') {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(code, 'Pixel technical fact contains a non-finite number.');
  }
  return value;
}

function ratio(value) {
  finite(value);
  if (value < 0 || value > 1) {
    fail('pixel_facts_invalid', 'Pixel ratio must be normalized to 0..1.');
  }
  return value;
}

function pixelCacheKey(input) {
  return fingerprintV3Value({
    source_sha256: input.source_bundle.source_sha256,
    policy_sha256: input.validation_policy.validation_policy_sha256,
    production_contract_sha256:
      input.production_contract.production_contract_sha256,
    renderer_version:
      input.validation_policy.tool_bindings.renderer_version,
    hyperframes_version:
      input.validation_policy.tool_bindings.hyperframes_version,
    state_or_frame: fingerprintV3Value({
      pixel_frame_plan_sha256:
        input.block_manifest.pixel_frame_plan_sha256,
      pixel_facts_sha256: fingerprintV3Value(input.pixel_facts),
    }),
  });
}

function receiptBindings(input) {
  const contract = input.production_contract;
  return {
    production_contract_sha256: contract.production_contract_sha256,
    shot_plan_sha256: contract.shot_plan_sha256,
    design_system_sha256: contract.design_system_sha256,
    validation_policy_sha256: contract.validation_policy_sha256,
    reference_style_profile_sha256:
      contract.reference_style_profile_sha256,
    font_package_sha256: contract.font_package_sha256,
    projection_sha256: contract.projection_sha256,
    asset_manifest_sha256: contract.asset_manifest_sha256,
    block_manifest_sha256:
      input.block_manifest.block_manifest_sha256,
    source_sha256: input.source_bundle.source_sha256,
    source_conformance_receipt_sha256:
      input.source_conformance_receipt.receipt_sha256,
    runtime_seek_receipt_sha256:
      input.runtime_seek_receipt.receipt_sha256,
  };
}

function validatePixelGeometry(sample, thresholds) {
  exact(
    sample.subject_bbox,
    ['x', 'y', 'width', 'height'],
    'pixel_facts_invalid',
    'Pixel subject geometry has an invalid shape.',
  );
  exact(
    sample.focal_point,
    ['x', 'y'],
    'pixel_facts_invalid',
    'Pixel focal point has an invalid shape.',
  );
  exact(
    sample.density_facts,
    ['functional_element_count', 'occupied_area_ratio'],
    'pixel_facts_invalid',
    'Pixel density facts have an invalid shape.',
  );
  const subjectBox = Object.fromEntries(
    ['x', 'y', 'width', 'height'].map(
      (field) => [field, finite(sample.subject_bbox[field])],
    ),
  );
  const focalPoint = Object.fromEntries(
    ['x', 'y'].map(
      (field) => [field, finite(sample.focal_point[field])],
    ),
  );
  const normalizedExtentFloor = Math.max(
    Number.EPSILON,
    thresholds.near_empty_coverage_max_ratio,
    thresholds.primary_roi_min_ratio,
  );
  const subjectArea = subjectBox.width * subjectBox.height;
  if (
    subjectBox.width < normalizedExtentFloor
    || subjectBox.height < normalizedExtentFloor
    || !Number.isFinite(subjectArea)
    || subjectArea < normalizedExtentFloor
    || !Number.isSafeInteger(
      sample.density_facts.functional_element_count,
    )
    || sample.density_facts.functional_element_count < 0
  ) {
    fail(
      'pixel_facts_invalid',
      'Pixel geometry or functional density is invalid.',
    );
  }
  ratio(sample.density_facts.occupied_area_ratio);
  const geometry = {
    subject_bbox: subjectBox,
    focal_point: focalPoint,
    density_facts: {
      functional_element_count:
        sample.density_facts.functional_element_count,
      occupied_area_ratio:
        sample.density_facts.occupied_area_ratio,
    },
  };
  if (sample.geometry_signature !== fingerprintV3Value(geometry)) {
    fail(
      'pixel_facts_invalid',
      'Pixel geometry signature does not match measured geometry.',
    );
  }
  return geometry;
}

function functionalTextMinimum(shot, typeRoles) {
  const minimums = [];
  for (const text of shot.functional_text ?? []) {
    const role = typeRoles.get(text.type_role);
    if (!role) {
      fail(
        'pixel_facts_invalid',
        'Pixel sample references an unregistered type role.',
      );
    }
    if (
      role.semantic_class === 'functional'
      && text.type_role !== 'microtext-texture'
    ) minimums.push(role.min_height_ratio);
  }
  return minimums.length ? Math.min(...minimums) : null;
}

function validateSample(
  sample,
  expected,
  shot,
  thresholds,
  typeRoles,
) {
  exact(
    sample,
    SAMPLE_FIELDS,
    'pixel_facts_invalid',
    'Pixel sample has an invalid closed shape.',
  );
  if (
    sample.sample_id !== `${expected.shot_id}:hold`
    || sample.shot_id !== expected.shot_id
    || sample.phase !== expected.phase
    || sample.frame !== expected.frame
    || !SHA256.test(sample.geometry_signature ?? '')
    || typeof sample.text_clipped !== 'boolean'
    || !Number.isSafeInteger(sample.nondecorative_overlap_count)
    || sample.nondecorative_overlap_count < 0
    || typeof sample.microtext_only_result !== 'boolean'
    || typeof sample.font_loaded !== 'boolean'
    || typeof sample.font_family_match !== 'boolean'
    || typeof sample.font_weight_match !== 'boolean'
    || typeof sample.glyph_coverage !== 'boolean'
    || typeof sample.result_visible !== 'boolean'
  ) {
    fail('pixel_facts_invalid', 'Pixel sample identity or scalar fact is invalid.');
  }
  finite(sample.mean_luma);
  if (sample.mean_luma < 0 || sample.mean_luma > 255) {
    fail('pixel_facts_invalid', 'Pixel luma must be normalized to 0..255.');
  }
  ratio(sample.visible_coverage_ratio);
  ratio(sample.alpha_coverage_ratio);
  ratio(sample.frozen_ratio);
  ratio(sample.primary_roi_visible_ratio);
  ratio(sample.functional_text_min_ratio);
  const geometry = validatePixelGeometry(sample, thresholds);
  finite(sample.dom_overflow_px);
  finite(sample.text_overflow_px);
  if (sample.dom_overflow_px < 0 || sample.text_overflow_px < 0) {
    fail('pixel_facts_invalid', 'Pixel overflow facts cannot be negative.');
  }
  if (
    !Array.isArray(sample.transform_matrix)
    || sample.transform_matrix.length !== 6
  ) {
    fail(
      'transform_non_finite',
      'Pixel transform must be a finite 2D matrix.',
    );
  }
  for (const item of sample.transform_matrix) {
    finite(item, 'transform_non_finite');
  }
  if (sample.mean_luma <= thresholds.near_black_luma_max) {
    fail('frame_near_black', 'Technical frame is near black.');
  }
  if (
    sample.visible_coverage_ratio
      <= thresholds.near_empty_coverage_max_ratio
  ) {
    fail('frame_near_empty', 'Technical frame is near empty.');
  }
  if (sample.alpha_coverage_ratio === 0) {
    fail('frame_fully_transparent', 'Technical frame is fully transparent.');
  }
  if (
    sample.dom_overflow_px
      > thresholds.text_overflow_tolerance_px
  ) fail('dom_overflow', 'Rendered DOM exceeds its declared bounds.');
  if (
    sample.text_clipped
    || sample.text_overflow_px
      > thresholds.text_overflow_tolerance_px
  ) fail('text_crop', 'Functional text is cropped or overflowing.');
  if (sample.nondecorative_overlap_count > 0) {
    fail('text_overlap', 'Non-decorative functional text overlaps.');
  }
  if (
    sample.primary_roi_visible_ratio
      < thresholds.primary_roi_min_ratio
  ) fail('primary_roi_missing', 'Primary material contributes no visible ROI.');
  const requiredFunctionalMinimum =
    functionalTextMinimum(shot, typeRoles);
  if (
    requiredFunctionalMinimum !== null
    && sample.functional_text_min_ratio < requiredFunctionalMinimum
  ) {
    fail(
      'functional_text_below_minimum',
      'Functional text does not meet its role-bound minimum.',
    );
  }
  if (sample.microtext_only_result) {
    fail(
      'microtext_only_result',
      'Microtext cannot carry the only result.',
    );
  }
  if (!sample.font_loaded || !sample.font_family_match) {
    fail('font_fallback_detected', 'Rendered font fell back or failed to load.');
  }
  if (!sample.font_weight_match) {
    fail(
      'font_weight_role_mismatch',
      'Rendered font weight does not match its functional role.',
    );
  }
  if (!sample.glyph_coverage) {
    fail(
      'font_glyph_source_unbound',
      'Rendered glyphs are not bound to the project font bytes.',
    );
  }
  if (!sample.result_visible) {
    fail(
      'readable_hold_missing',
      'Declared Hold does not contain its visible Result.',
    );
  }
  if (sample.frozen_ratio >= 0.999) {
    fail(
      'frozen_result_anomaly',
      'Technical samples indicate an abnormally frozen output.',
    );
  }
  return geometry;
}

function contractChangeFingerprint(shot) {
  return fingerprintV3Value({
    semantic_kind: shot.semantic_kind,
    component_id: shot.component_id,
    motion_profile_id: shot.motion_profile_id,
    layout_family: shot.layout_family,
    focal_role: shot.focal_role,
    primary_material_asset_id: shot.primary_material_asset_id,
    result_selector: shot.result_selector,
    functional_text: shot.functional_text.map((text) => ({
      type_role: text.type_role,
      semantic_responsibility: text.semantic_responsibility,
      primary_meaning: text.primary_meaning,
    })),
  });
}

function validateAdjacentPair(
  pair,
  expectedLeft,
  expectedRight,
  leftGeometry,
  rightGeometry,
  leftShot,
  rightShot,
) {
  exact(
    pair,
    ADJACENT_FIELDS,
    'pixel_facts_invalid',
    'Adjacent-result fact has an invalid closed shape.',
  );
  if (
    pair.left_shot_id !== expectedLeft
    || pair.right_shot_id !== expectedRight
    || typeof pair.contract_declares_change !== 'boolean'
    || !Number.isSafeInteger(pair.phash_distance)
    || pair.phash_distance < 0
    || pair.phash_distance > 64
    || typeof pair.geometry_changed !== 'boolean'
    || typeof pair.focal_changed !== 'boolean'
    || typeof pair.density_changed !== 'boolean'
  ) fail('pixel_facts_invalid', 'Adjacent-result identities are invalid.');
  ratio(pair.ssim);
  const contractDeclaresChange =
    contractChangeFingerprint(leftShot)
      !== contractChangeFingerprint(rightShot);
  const geometryChanged =
    fingerprintV3Value(leftGeometry)
      !== fingerprintV3Value(rightGeometry);
  const focalChanged =
    fingerprintV3Value(leftGeometry.focal_point)
      !== fingerprintV3Value(rightGeometry.focal_point);
  const densityChanged =
    fingerprintV3Value(leftGeometry.density_facts)
      !== fingerprintV3Value(rightGeometry.density_facts);
  if (
    contractDeclaresChange
    && pair.phash_distance === 0
    && pair.ssim === 1
  ) {
    fail(
      'adjacent_result_identity',
      'Adjacent Results are technically identical despite declared change.',
    );
  }
  if (
    pair.contract_declares_change !== contractDeclaresChange
    || pair.geometry_changed !== geometryChanged
    || pair.focal_changed !== focalChanged
    || pair.density_changed !== densityChanged
  ) {
    fail(
      'pixel_facts_invalid',
      'Adjacent-result change flags do not match measured facts.',
    );
  }
  const noMeasuredTechnicalChange = !geometryChanged
    && !focalChanged
    && !densityChanged;
  return (
    contractDeclaresChange
    && pair.phash_distance <= 1
    && pair.ssim >= 0.995
    && noMeasuredTechnicalChange
  );
}

export async function validateBlockPixelGate(input) {
  exact(
    input,
    INPUT_FIELDS,
    'pixel_gate_input_invalid',
    'Pixel gate input has an invalid shape.',
  );
  validateProductionEvidence(input);
  validateManifest(input.block_manifest, input.production_contract);
  validateSourceBundle(input.source_bundle, input.block_manifest);
  validateReceiptLineage(
    input.source_conformance_receipt,
    'source-conformance-gate',
    input.production_contract,
    input.validation_policy,
    input.block_manifest,
    input.source_bundle,
    null,
    sourceInspectionState(
      input.source_bundle,
      input.validation_policy,
    ),
  );
  validateReceiptLineage(
    input.runtime_seek_receipt,
    'runtime-seek-gate',
    input.production_contract,
    input.validation_policy,
    input.block_manifest,
    input.source_bundle,
    input.source_conformance_receipt,
    input.block_manifest.runtime_sample_plan_sha256,
  );
  exact(
    input.pixel_facts,
    PIXEL_FACT_FIELDS,
    'pixel_facts_invalid',
    'Pixel facts must use the closed technical-facts schema.',
  );
  const facts = input.pixel_facts;
  const plan = pixelFramePlan(input.block_manifest);
  if (
    facts.schema_version !== 1
    || facts.block_id !== input.block_manifest.block_id
    || !Array.isArray(facts.samples)
    || facts.samples.length !== plan.length
    || !Array.isArray(facts.adjacent_pairs)
    || facts.adjacent_pairs.length !== Math.max(0, plan.length - 1)
  ) fail('pixel_facts_invalid', 'Pixel facts do not cover the exact block.');
  const typeRoles = new Map(
    input.canonical_artifacts.designSystem.type_roles.map(
      (role) => [role.role, role],
    ),
  );
  const geometries = [];
  for (const [index, sample] of facts.samples.entries()) {
    geometries.push(validateSample(
      sample,
      plan[index],
      input.block_manifest.shots[index],
      input.validation_policy.pixel_thresholds,
      typeRoles,
    ));
  }
  let nearIdentityWarning = false;
  for (const [index, pair] of facts.adjacent_pairs.entries()) {
    nearIdentityWarning = validateAdjacentPair(
      pair,
      plan[index].shot_id,
      plan[index + 1].shot_id,
      geometries[index],
      geometries[index + 1],
      input.block_manifest.shots[index],
      input.block_manifest.shots[index + 1],
    ) || nearIdentityWarning;
  }
  const warnings = nearIdentityWarning
    ? ['adjacent_result_identity_warning'] : [];
  return createGateReceipt({
    gate: 'pixel-signal-gate',
    phase: 'block',
    scope_id: input.block_manifest.block_id,
    productionContract: input.production_contract,
    input_bindings: receiptBindings(input),
    status: 'passed',
    hard_failure_codes: [],
    warning_codes: warnings,
    metrics: {
      checked_shot_count: input.block_manifest.shot_ids.length,
      checked_sample_count: facts.samples.length,
      checked_adjacent_pair_count: facts.adjacent_pairs.length,
      technical_signal_set_sha256: fingerprintV3Value(facts),
      warning_count: warnings.length,
    },
    cache: {
      status: 'miss',
      cache_key_sha256: pixelCacheKey(input),
    },
    validationPolicy: input.validation_policy,
  });
}
