import {
  assertNoLegacyActiveFields,
  createGateReceipt,
  fingerprintV3Value,
  validateGateReceipt,
  validateProductionContract,
  validateValidationPolicy,
} from './validate-production-contract.mjs';
import { parse as parseHtml } from 'parse5';

const SHA256 = /^[0-9a-f]{64}$/u;
const BLOCK_ID = /^B[0-9]{3}$/u;
const SHOT_ID = /^S[0-9]{3}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const SEEK_PATHS = Object.freeze([
  'fresh_direct',
  'zero_to_t',
  'end_to_t',
  'repeat_to_t',
]);
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
const STATE_FIELDS = Object.freeze([
  'text_content',
  'class_list',
  'display',
  'visibility',
  'opacity',
  'transform_matrix',
  'bounding_box',
  'z_index',
  'svg_attributes',
  'media_time_ms',
  'loaded_font_family',
  'loaded_font_weight',
  'primary_material_consumer',
  'console_errors',
  'network_requests',
  'result_visible',
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
const DISPLAY_VALUES = Object.freeze(new Set([
  'none',
  'contents',
  'block',
  'flow-root',
  'inline',
  'inline-block',
  'run-in',
  'list-item',
  'flex',
  'inline-flex',
  'grid',
  'inline-grid',
  'table',
  'inline-table',
  'table-row-group',
  'table-header-group',
  'table-footer-group',
  'table-row',
  'table-cell',
  'table-column-group',
  'table-column',
  'table-caption',
  'ruby',
  'ruby-base',
  'ruby-text',
  'ruby-base-container',
  'ruby-text-container',
]));
const VISIBILITY_VALUES = Object.freeze(new Set([
  'visible',
  'hidden',
  'collapse',
]));

class BlockRuntimeGateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BlockRuntimeGateError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new BlockRuntimeGateError(code, message);
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

function finite(value, code = 'runtime_state_invalid') {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(code, 'Runtime state contains a non-finite number.');
  }
  return value;
}

function safeString(value, code = 'runtime_state_invalid', maximum = 4096) {
  if (
    typeof value !== 'string'
    || Buffer.byteLength(value, 'utf8') > maximum
    || /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(value)
  ) fail(code, 'Runtime state contains invalid text.');
  return value;
}

function exactStringList(value, code = 'runtime_state_invalid') {
  if (
    !Array.isArray(value)
    || value.length > 128
    || value.some((item) => typeof item !== 'string'
      || Buffer.byteLength(item, 'utf8') > 1024)
  ) fail(code, 'Runtime state contains an invalid string list.');
  return [...new Set(value)].sort();
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
    'runtime_gate_contract_invalid',
    'Runtime gate requires the actual P3 asset manifest.',
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
      'runtime_gate_contract_invalid',
      'Runtime gate asset manifest is not bound to the director evidence.',
    );
  }
  const seenAssets = new Set();
  for (const [index, asset] of assetManifest.assets.entries()) {
    exact(
      asset,
      ASSET_FIELDS,
      'runtime_gate_contract_invalid',
      'Runtime gate asset manifest contains an invalid asset fact.',
    );
    exact(
      asset.selection_basis,
      ['status', 'evidence_refs'],
      'runtime_gate_contract_invalid',
      'Runtime gate asset selection basis is invalid.',
    );
    exact(
      asset.rights,
      ['status', 'basis', 'evidence_sha256'],
      'runtime_gate_contract_invalid',
      'Runtime gate asset rights evidence is invalid.',
    );
    exact(
      asset.provenance,
      ['origin', 'source_id'],
      'runtime_gate_contract_invalid',
      'Runtime gate asset provenance is invalid.',
    );
    exact(
      asset.consumer,
      ['consumer_id', 'role', 'element', 'fit'],
      'runtime_gate_contract_invalid',
      'Runtime gate asset consumer is invalid.',
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
        'runtime_gate_contract_invalid',
        'Runtime gate asset facts are incomplete or stale.',
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
    fail(error?.code ?? 'runtime_gate_contract_invalid', error?.message
      ?? 'Runtime gate policy receipt is invalid.');
  }
  if (
    result.status !== 'passed'
    || result.gate !== 'policy-gate'
    || result.phase !== phase
    || result.scope_id !== scopeId
  ) {
    fail(
      'runtime_gate_contract_invalid',
      `Runtime gate requires the passed ${phase} policy receipt.`,
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
    fail(error?.code ?? 'runtime_gate_contract_invalid', error?.message
      ?? 'Runtime gate production evidence is invalid.');
  }
  exact(
    input.canonical_artifacts,
    CANONICAL_ARTIFACT_FIELDS,
    'runtime_gate_contract_invalid',
    'Runtime gate canonical artifacts must use the closed P3 shape.',
  );
  if (
    input.prior_contract.contract_phase !== 'director'
    || input.prior_contract.validation_policy_sha256
      !== input.validation_policy.validation_policy_sha256
  ) {
    fail(
      'runtime_gate_contract_invalid',
      'Runtime gate requires the exact director contract and policy.',
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
    fail(error?.code ?? 'runtime_gate_contract_invalid', error?.message
      ?? 'Runtime gate sealed production evidence is invalid.');
  }
  if (
    input.production_contract.contract_phase !== 'sealed'
    || input.production_contract.validation_policy_sha256
      !== input.validation_policy.validation_policy_sha256
  ) {
    fail(
      'runtime_gate_contract_invalid',
      'Runtime gate requires the exact sealed production contract and policy.',
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
    'runtime_source_bundle_invalid',
    'Runtime gate source bundle has an invalid shape.',
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
      'runtime_source_bundle_invalid',
      'Runtime gate source bytes are not bound to the block manifest.',
    );
  }
}

function validateManifest(manifest, productionContract) {
  exact(
    manifest,
    MANIFEST_FIELDS,
    'runtime_block_manifest_invalid',
    'Runtime gate block manifest has an invalid shape.',
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
      'runtime_block_manifest_invalid',
      'Runtime gate block manifest is invalid or stale.',
    );
  }
}

function sourceDomIds(sourceBundle) {
  const ids = new Set();
  const visit = (node) => {
    if (node?.attrs) {
      const id = node.attrs.find((attribute) => attribute.name === 'id');
      if (id?.value) ids.add(id.value);
    }
    for (const child of node?.childNodes ?? []) visit(child);
    if (node?.content) visit(node.content);
  };
  for (const file of sourceBundle.files) {
    if (file.media_type !== 'text/html') continue;
    try {
      visit(parseHtml(file.content));
    } catch {
      fail(
        'runtime_sample_plan_invalid',
        'Runtime source DOM cannot bind causal selectors.',
      );
    }
  }
  return ids;
}

function runtimeSamplePlan(manifest, sourceBundle) {
  const plan = [];
  const seenShots = new Set();
  const domIds = sourceDomIds(sourceBundle);
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
        'runtime_sample_plan_invalid',
        'Runtime sample plan contains an invalid shot.',
      );
    }
    seenShots.add(shot.shot_id);
    exact(
      shot.causal_lifecycle,
      PHASES,
      'runtime_sample_plan_invalid',
      'Every shot must bind all causal runtime phases.',
    );
    if (!Array.isArray(shot.timeline_calls)) {
      fail(
        'runtime_sample_plan_invalid',
        'Runtime shot timeline calls are missing.',
      );
    }
    const timelineCalls = new Map();
    for (const call of shot.timeline_calls) {
      if (
        !call
        || typeof call !== 'object'
        || Array.isArray(call)
        || !SAFE_ID.test(call.call_id ?? '')
        || timelineCalls.has(call.call_id)
        || !PHASES.includes(call.phase)
        || typeof call.selector !== 'string'
      ) {
        fail(
          'runtime_sample_plan_invalid',
          'Runtime shot timeline calls are invalid.',
        );
      }
      timelineCalls.set(call.call_id, call);
    }
    for (const phase of PHASES) {
      const record = shot.causal_lifecycle[phase];
      exact(
        record,
        [
          'start_frame',
          'end_frame',
          'selectors',
          'timeline_call_ids',
        ],
        'runtime_sample_plan_invalid',
        'Causal runtime phase has an invalid shape.',
      );
      if (
        !Number.isSafeInteger(record.start_frame)
        || !Number.isSafeInteger(record.end_frame)
        || record.start_frame < shot.start_frame
        || record.end_frame > shot.end_frame
        || record.end_frame <= record.start_frame
        || !Array.isArray(record.selectors)
        || record.selectors.length < 1
        || !Array.isArray(record.timeline_call_ids)
        || record.timeline_call_ids.length < 1
      ) {
        fail(
          'runtime_sample_plan_invalid',
          'Causal runtime phase is outside its shot.',
        );
      }
      if (
        new Set(record.selectors).size !== record.selectors.length
        || new Set(record.timeline_call_ids).size
          !== record.timeline_call_ids.length
        || record.selectors.some((selector) => (
          typeof selector !== 'string'
          || !selector.startsWith('#')
          || !domIds.has(selector.slice(1))
        ))
        || record.timeline_call_ids.some((callId) => {
          const call = timelineCalls.get(callId);
          return !call
            || call.phase !== phase
            || !record.selectors.includes(call.selector);
        })
      ) {
        fail(
          'runtime_sample_plan_invalid',
          'Causal selectors or timeline calls do not bind actual source-plan nodes.',
        );
      }
      plan.push({
        shot_id: shot.shot_id,
        phase,
        frame: record.start_frame,
      });
    }
  }
  if (
    manifest.shots[0].start_frame !== manifest.start_frame
    || manifest.shots.at(-1).end_frame !== manifest.end_frame
    || manifest.shots.some(
      (shot, index) => index > 0
        && shot.start_frame !== manifest.shots[index - 1].end_frame,
    )
    || fingerprintV3Value(plan) !== manifest.runtime_sample_plan_sha256
  ) {
    fail(
      'runtime_sample_plan_invalid',
      'Runtime sample plan does not bind the current block windows.',
    );
  }
  return plan;
}

function validateRuntimeTruth(input) {
  const canonicalFont = input.canonical_artifacts.fontPackage;
  const sourceFont = input.source_bundle.font_package;
  if (
    sourceFont.family !== canonicalFont.family
    || sourceFont.bytes_sha256 !== canonicalFont.bytes_sha256
    || fingerprintV3Value(sourceFont.weights)
      !== fingerprintV3Value(canonicalFont.weights)
    || fingerprintV3Value(sourceFont.glyph_ranges)
      !== fingerprintV3Value(canonicalFont.glyph_ranges)
    || !Array.isArray(canonicalFont.weights)
    || canonicalFont.weights.length < 1
  ) {
    fail(
      'font_runtime_mismatch',
      'Runtime font declaration is not bound to the canonical font package.',
    );
  }
  const canonicalShots = new Map(
    input.canonical_artifacts.shotPlan.shots.map(
      (shot) => [shot.shot_id, shot],
    ),
  );
  const projectionShots = new Map(
    input.canonical_artifacts.projection.shots.map(
      (shot) => [shot.shot_id, shot],
    ),
  );
  const assetFacts = new Map(
    input.asset_manifest.assets.map(
      (asset) => [asset.shot_id, asset],
    ),
  );
  const sourceMaterials = new Map(
    input.source_bundle.materials
      .filter((material) => material.consumer_role === 'ordinary-primary')
      .map((material) => [material.asset_id, material]),
  );
  const shotTruth = new Map();
  for (const blockShot of input.block_manifest.shots) {
    const canonicalShot = canonicalShots.get(blockShot.shot_id);
    const projectionShot = projectionShots.get(blockShot.shot_id);
    const asset = assetFacts.get(blockShot.shot_id);
    const material = sourceMaterials.get(asset?.asset_id);
    if (
      !canonicalShot
      || !projectionShot
      || !asset
      || blockShot.start_frame !== projectionShot.frame_window.start_frame
      || blockShot.end_frame !== projectionShot.frame_window.end_frame
      || blockShot.component_id !== canonicalShot.component_id
      || blockShot.motion_profile_id !== canonicalShot.motion_profile_id
      || blockShot.layout_family !== canonicalShot.layout_family
      || blockShot.focal_role !== canonicalShot.focal_role
      || blockShot.primary_material_asset_id !== asset.asset_id
      || !material
      || material.bytes_sha256 !== asset.bytes_sha256
      || material.auxiliary !== false
    ) {
      fail(
        'runtime_primary_material_mismatch',
        'Runtime shot truth is not bound to its projection and primary asset fact.',
      );
    }
    shotTruth.set(blockShot.shot_id, {
      primary_asset_id: asset.asset_id,
    });
  }
  const allowedFontWeights = new Set(
    canonicalFont.weights.map((weight) => String(weight)),
  );
  return {
    font_family: canonicalFont.family,
    allowed_font_weights: allowedFontWeights,
    shots: shotTruth,
  };
}

function validateSourceReceipt(
  receipt,
  productionContract,
  validationPolicy,
  manifest,
  sourceBundle,
) {
  try {
    validateGateReceipt(receipt, {
      productionContract,
      validationPolicy,
    });
  } catch (error) {
    fail(error?.code ?? 'runtime_source_receipt_invalid', error?.message
      ?? 'Source-conformance receipt is invalid.');
  }
  if (
    receipt.gate !== 'source-conformance-gate'
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
      state_or_frame: sourceInspectionState(
        sourceBundle,
        validationPolicy,
      ),
    })
  ) {
    fail(
      'runtime_source_receipt_invalid',
      'Runtime gate requires the passing source receipt for current bytes.',
    );
  }
}

function normalizeRuntimeState(value, phase) {
  exact(
    value,
    STATE_FIELDS,
    'runtime_state_invalid',
    'Runtime probe returned an invalid normalized state.',
  );
  safeString(value.text_content);
  const classList = exactStringList(value.class_list);
  safeString(value.display, 'runtime_state_invalid', 120);
  safeString(value.visibility, 'runtime_state_invalid', 120);
  if (
    !DISPLAY_VALUES.has(value.display)
    || !VISIBILITY_VALUES.has(value.visibility)
  ) {
    fail(
      'runtime_display_state_invalid',
      'Runtime display or visibility is not a legal computed CSS value.',
    );
  }
  finite(value.opacity);
  if (value.opacity < 0 || value.opacity > 1) {
    fail('runtime_state_invalid', 'Runtime opacity is outside 0..1.');
  }
  if (
    !Array.isArray(value.transform_matrix)
    || value.transform_matrix.length !== 6
  ) {
    fail(
      'runtime_state_invalid',
      'Runtime transform must be a finite 2D matrix.',
    );
  }
  const transformMatrix = value.transform_matrix.map((item) => finite(item));
  exact(
    value.bounding_box,
    ['x', 'y', 'width', 'height'],
    'runtime_state_invalid',
    'Runtime bounding box is invalid.',
  );
  const boundingBox = Object.fromEntries(
    ['x', 'y', 'width', 'height'].map(
      (field) => [field, finite(value.bounding_box[field])],
    ),
  );
  if (boundingBox.width < 0 || boundingBox.height < 0) {
    fail('runtime_state_invalid', 'Runtime bounding-box dimensions are invalid.');
  }
  if (
    !(Number.isSafeInteger(value.z_index) || value.z_index === 'auto')
    || !(value.media_time_ms === null
      || Number.isSafeInteger(value.media_time_ms)
        && value.media_time_ms >= 0)
  ) fail('runtime_state_invalid', 'Runtime z-index or media time is invalid.');
  if (
    !value.svg_attributes
    || typeof value.svg_attributes !== 'object'
    || Array.isArray(value.svg_attributes)
    || Object.keys(value.svg_attributes).length > 128
  ) fail('runtime_state_invalid', 'Runtime SVG attributes are invalid.');
  const svgAttributes = Object.fromEntries(
    Object.entries(value.svg_attributes).map(([key, item]) => {
      if (!/^[A-Za-z_:][A-Za-z0-9_.:-]{0,95}$/u.test(key)) {
        fail('runtime_state_invalid', 'Runtime SVG attribute name is invalid.');
      }
      return [key, safeString(item, 'runtime_state_invalid', 1024)];
    }),
  );
  safeString(value.loaded_font_family, 'runtime_state_invalid', 240);
  if (
    !(Number.isSafeInteger(value.loaded_font_weight)
      || typeof value.loaded_font_weight === 'string'
      && value.loaded_font_weight.length > 0
      && value.loaded_font_weight.length <= 80)
  ) fail('runtime_state_invalid', 'Runtime loaded font weight is invalid.');
  exact(
    value.primary_material_consumer,
    ['asset_id', 'visible'],
    'runtime_state_invalid',
    'Runtime primary-material state is invalid.',
  );
  if (
    !SAFE_ID.test(value.primary_material_consumer.asset_id ?? '')
    || typeof value.primary_material_consumer.visible !== 'boolean'
    || typeof value.result_visible !== 'boolean'
  ) fail('runtime_state_invalid', 'Runtime material/result visibility is invalid.');
  const computedVisible = value.display !== 'none'
    && value.visibility === 'visible'
    && value.opacity > 0
    && boundingBox.width > 0
    && boundingBox.height > 0;
  if (
    phase === 'entry'
    && value.result_visible === false
    && computedVisible
    && value.opacity === 1
  ) {
    fail(
      'runtime_display_state_invalid',
      'Runtime result visibility contradicts its computed entry state.',
    );
  }
  const consoleErrors = exactStringList(value.console_errors);
  const networkRequests = exactStringList(value.network_requests);
  return {
    text_content: value.text_content,
    class_list: classList,
    display: value.display,
    visibility: value.visibility,
    opacity: value.opacity,
    transform_matrix: transformMatrix,
    bounding_box: boundingBox,
    z_index: value.z_index,
    svg_attributes: svgAttributes,
    media_time_ms: value.media_time_ms,
    loaded_font_family: value.loaded_font_family,
    loaded_font_weight: value.loaded_font_weight,
    primary_material_consumer: {
      asset_id: value.primary_material_consumer.asset_id,
      visible: value.primary_material_consumer.visible,
    },
    console_errors: consoleErrors,
    network_requests: networkRequests,
    result_visible: value.result_visible,
  };
}

function runtimeCacheKey(input) {
  return fingerprintV3Value({
    source_sha256: input.source_bundle.source_sha256,
    policy_sha256: input.validation_policy.validation_policy_sha256,
    production_contract_sha256:
      input.production_contract.production_contract_sha256,
    renderer_version:
      input.validation_policy.tool_bindings.renderer_version,
    hyperframes_version:
      input.validation_policy.tool_bindings.hyperframes_version,
    state_or_frame: input.block_manifest.runtime_sample_plan_sha256,
  });
}

function receiptBindings(input) {
  const contract = input.production_contract;
  return {
    production_contract_sha256: contract.production_contract_sha256,
    shot_plan_sha256: contract.shot_plan_sha256,
    validation_policy_sha256: contract.validation_policy_sha256,
    font_package_sha256: contract.font_package_sha256,
    projection_sha256: contract.projection_sha256,
    asset_manifest_sha256: contract.asset_manifest_sha256,
    block_manifest_sha256:
      input.block_manifest.block_manifest_sha256,
    source_sha256: input.source_bundle.source_sha256,
    source_conformance_receipt_sha256:
      input.source_conformance_receipt.receipt_sha256,
  };
}

export async function validateBlockRuntimeGate(input, options = {}) {
  exact(
    input,
    INPUT_FIELDS,
    'runtime_gate_input_invalid',
    'Runtime gate input has an invalid shape.',
  );
  exact(
    options,
    ['probeRuntime'],
    'runtime_probe_required',
    'Runtime gate requires exactly one runtime probe.',
  );
  if (typeof options.probeRuntime !== 'function') {
    fail('runtime_probe_required', 'Runtime gate requires a runtime probe.');
  }
  validateProductionEvidence(input);
  validateManifest(input.block_manifest, input.production_contract);
  validateSourceBundle(input.source_bundle, input.block_manifest);
  validateSourceReceipt(
    input.source_conformance_receipt,
    input.production_contract,
    input.validation_policy,
    input.block_manifest,
    input.source_bundle,
  );
  const plan = runtimeSamplePlan(
    input.block_manifest,
    input.source_bundle,
  );
  const runtimeTruth = validateRuntimeTruth(input);
  const stateBindings = [];
  for (const sample of plan) {
    const states = new Map();
    for (const seekPath of SEEK_PATHS) {
      const request = {
        block_id: input.block_manifest.block_id,
        shot_id: sample.shot_id,
        phase: sample.phase,
        frame: sample.frame,
        path: seekPath,
      };
      const raw = await options.probeRuntime(request);
      if (raw === null || raw === undefined) {
        fail(
          seekPath === 'end_to_t'
            ? 'seek_end_to_t_missing'
            : 'runtime_state_invalid',
          `Runtime probe did not return ${seekPath}.`,
        );
      }
      states.set(
        seekPath,
        normalizeRuntimeState(raw, sample.phase),
      );
    }
    const stateList = SEEK_PATHS.map((seekPath) => states.get(seekPath));
    if (stateList.some((state) => state.network_requests.length > 0)) {
      fail(
        'runtime_network_request',
        'Runtime gate observed a network request.',
      );
    }
    if (stateList.some((state) => state.console_errors.length > 0)) {
      fail(
        'runtime_console_error',
        'Runtime gate observed a console failure.',
      );
    }
    const expectedShot = runtimeTruth.shots.get(sample.shot_id);
    if (
      stateList.some((state) => (
        state.primary_material_consumer.asset_id
          !== expectedShot.primary_asset_id
        || state.primary_material_consumer.visible !== true
      ))
    ) {
      fail(
        'runtime_primary_material_mismatch',
        'Runtime primary material does not match the frozen asset fact.',
      );
    }
    if (
      ['entry', 'action'].includes(sample.phase)
      && stateList.some((state) => state.result_visible)
    ) {
      fail(
        'result_precedes_action',
        'Result is visible before its Action completes.',
      );
    }
    if (
      ['result', 'hold'].includes(sample.phase)
      && stateList.some((state) => (
        !state.result_visible
        || state.display === 'none'
        || state.visibility !== 'visible'
        || state.opacity <= 0
        || state.bounding_box.width <= 0
        || state.bounding_box.height <= 0
      ))
    ) {
      fail(
        'runtime_result_missing',
        'Runtime Result is not visibly present during Result and Hold.',
      );
    }
    if (
      sample.phase === 'exit'
      && stateList.some((state) => state.result_visible)
    ) {
      fail(
        'runtime_result_missing',
        'Runtime Result remains visible at the declared Exit checkpoint.',
      );
    }
    if (
      stateList.some((state) => (
        state.loaded_font_family !== runtimeTruth.font_family
        || !runtimeTruth.allowed_font_weights.has(
          String(state.loaded_font_weight),
        )
      ))
    ) {
      fail(
        'font_runtime_mismatch',
        'Loaded font family or weight does not match the canonical package.',
      );
    }
    const fontStates = stateList.map((state) => fingerprintV3Value({
      family: state.loaded_font_family,
      weight: state.loaded_font_weight,
    }));
    if (new Set(fontStates).size !== 1) {
      fail(
        'font_runtime_mismatch',
        'Loaded font family or weight drifts across seek paths.',
      );
    }
    const stateHashes = new Map(SEEK_PATHS.map(
      (seekPath) => [
        seekPath,
        fingerprintV3Value(states.get(seekPath)),
      ],
    ));
    if (
      stateHashes.get('repeat_to_t')
      !== stateHashes.get('fresh_direct')
    ) {
      fail(
        'repeat_state_drift',
        'Repeated seek does not return the cold deterministic state.',
      );
    }
    if (new Set(stateHashes.values()).size !== 1) {
      fail(
        'seek_state_hash_mismatch',
        'Runtime seek paths produce different normalized states.',
      );
    }
    stateBindings.push({
      shot_id: sample.shot_id,
      phase: sample.phase,
      frame: sample.frame,
      state_sha256: stateHashes.get('fresh_direct'),
    });
  }
  return createGateReceipt({
    gate: 'runtime-seek-gate',
    phase: 'block',
    scope_id: input.block_manifest.block_id,
    productionContract: input.production_contract,
    input_bindings: receiptBindings(input),
    status: 'passed',
    hard_failure_codes: [],
    warning_codes: [],
    metrics: {
      checked_shot_count: input.block_manifest.shot_ids.length,
      checked_checkpoint_count: plan.length,
      checked_sample_count: plan.length * SEEK_PATHS.length,
      state_set_sha256: fingerprintV3Value(stateBindings),
      network_request_count: 0,
      console_error_count: 0,
    },
    cache: {
      status: 'miss',
      cache_key_sha256: runtimeCacheKey(input),
    },
    validationPolicy: input.validation_policy,
  });
}
