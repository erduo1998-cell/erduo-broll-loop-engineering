import { createHash } from 'node:crypto';
import {
  lstat,
  readFile,
} from 'node:fs/promises';
import path from 'node:path';
import {
  createGateReceipt,
  fingerprintV3Value,
  validateGateReceipt,
  validateProductionContract,
  validateValidationPolicy,
} from './validate-production-contract.mjs';
import { inspectBlockSource } from './inspect-block-source.mjs';

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
export const P3_EVIDENCE_FIELDS = Object.freeze([
  'prior_contract',
  'director_policy_receipt',
  'canonical_artifacts',
  'asset_manifest',
  'sealed_policy_receipt',
  'production_contract',
  'validation_policy',
]);
const SOURCE_INPUT_FIELDS = Object.freeze([
  ...P3_EVIDENCE_FIELDS,
  'block_manifest',
  'source_bundle',
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
const BLOCK_SHOT_FIELDS = Object.freeze([
  'shot_id',
  'start_frame',
  'end_frame',
  'semantic_kind',
  'component_id',
  'motion_profile_id',
  'layout_family',
  'focal_role',
  'palette_token_ids',
  'font_role_ids',
  'primary_material_asset_id',
  'native_auxiliary_asset_ids',
  'result_selector',
  'functional_text',
  'causal_lifecycle',
  'timeline_calls',
  'data_points',
]);
const FUNCTIONAL_TEXT_FIELDS = Object.freeze([
  'element_id',
  'selector',
  'type_role',
  'semantic_responsibility',
  'primary_meaning',
]);
const LIFECYCLE_FIELDS = Object.freeze([
  'start_frame',
  'end_frame',
  'selectors',
  'timeline_call_ids',
]);
const TIMELINE_CALL_FIELDS = Object.freeze([
  'call_id',
  'selector',
  'phase',
  'property',
  'start_frame',
  'end_frame',
  'from',
  'to',
  'repeat',
  'paused',
  'reversible',
]);
const SOURCE_BUNDLE_FIELDS = Object.freeze([
  'schema_version',
  'block_id',
  'files',
  'materials',
  'font_package',
  'source_sha256',
]);
const SOURCE_FILE_FIELDS = Object.freeze([
  'relative_path',
  'media_type',
  'content',
  'bytes_sha256',
]);
const MATERIAL_FIELDS = Object.freeze([
  'asset_id',
  'media_kind',
  'consumer_role',
  'local_path',
  'bytes_sha256',
  'auxiliary',
]);
const FONT_FIELDS = Object.freeze([
  'family',
  'weights',
  'glyph_ranges',
  'local_path',
  'bytes_sha256',
]);
const INSPECTION_FIELDS = Object.freeze([
  'schema_version',
  'inspector_id',
  'block_id',
  'source_sha256',
  'source_bytes_sha256',
  'actual_dependency_set_sha256',
  'parser_evidence',
  'hyperframes_check',
  'structural_facts',
  'inspection_sha256',
]);
const PARSER_FIELDS = Object.freeze([
  'html',
  'javascript',
  'css',
  'parser_set_sha256',
]);
const PARSER_RECORD_FIELDS = Object.freeze([
  'library',
  'kind',
  'version',
  'document_sha256',
  'node_count',
]);
const HYPERFRAMES_CHECK_FIELDS = Object.freeze([
  'tool',
  'version',
  'argv',
  'status',
  'checked_source_sha256',
  'project_source_sha256',
  'result_sha256',
  'tool_binding_sha256',
]);
const STRUCTURAL_FACT_FIELDS = Object.freeze([
  'dom_id_set_sha256',
  'selector_binding_set_sha256',
  'timeline_binding_set_sha256',
  'material_consumption_set_sha256',
  'visible_data_binding_set_sha256',
  'css_token_binding_set_sha256',
  'component_binding_set_sha256',
  'hard_failure_codes',
]);
const ALLOWED_SOURCE_MEDIA_TYPES = new Set([
  'text/html',
  'text/css',
  'text/javascript',
]);
const PRIVATE_SOURCE_PATH = /(?:^|[\s"'`(=:;,{\[])\/(?:Users|home|private|tmp|var\/folders)(?:\/|$)|(?:^|[\s"'`(=])[A-Za-z]:[\\/]+Users[\\/]/iu;
const REMOTE_OR_NETWORK = /(?:\b(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\/|\burl\s*\(\s*["']?\s*(?:https?:)?\/\/|\bimport\s*(?:\(|[^;\n]*?\bfrom\s*)["']\s*(?:https?:)?\/\/|(?:^|[^\w])(?:fetch|XMLHttpRequest|WebSocket|EventSource)\s*\()/iu;
const CJK_TEXT = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u;
const VISUAL_ONLY_PROPERTY = /^(?:alpha|display|opacity|visibility|visible)(?:[-_].*)?$/iu;

export class BlockSourceGateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BlockSourceGateError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new BlockSourceGateError(code, message);
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

function rethrow(error, fallback, message) {
  if (error?.code) throw error;
  fail(fallback, message);
}

function same(left, right) {
  return fingerprintV3Value(left) === fingerprintV3Value(right);
}

function safeStringList(value, {
  minimum = 0,
  maximum = 128,
  pattern = SAFE_ID,
  code = 'source_block_manifest_invalid',
} = {}) {
  if (
    !Array.isArray(value)
    || value.length < minimum
    || value.length > maximum
    || new Set(value).size !== value.length
    || value.some((item) => typeof item !== 'string' || !pattern.test(item))
  ) fail(code, 'A source manifest identifier set is invalid.');
  return value;
}

function validateAssetManifest(
  assetManifest,
  canonicalArtifacts,
  priorContract,
  directorReceipt,
) {
  exact(
    assetManifest,
    ASSET_MANIFEST_FIELDS,
    'source_p3_evidence_invalid',
    'The actual asset manifest has an invalid closed shape.',
  );
  if (
    assetManifest.schema_version !== 1
    || assetManifest.pipeline_contract_version !== 3
    || assetManifest.artifact_kind !== 'asset-facts-manifest'
    || assetManifest.prior_contract_sha256
      !== priorContract.production_contract_sha256
    || assetManifest.director_policy_receipt_sha256
      !== directorReceipt.receipt_sha256
    || assetManifest.shot_plan_sha256
      !== canonicalArtifacts.shotPlan.shot_plan_sha256
    || !Array.isArray(assetManifest.assets)
    || assetManifest.assets.length
      !== canonicalArtifacts.shotPlan.shots.length
  ) {
    fail(
      'source_p3_evidence_invalid',
      'The asset manifest is not the current complete P3 facts manifest.',
    );
  }
  const shotIds = new Set();
  const assetIds = new Set();
  for (const [index, asset] of assetManifest.assets.entries()) {
    exact(
      asset,
      ASSET_FIELDS,
      'source_p3_evidence_invalid',
      'An asset fact has an invalid closed shape.',
    );
    if (
      !SHOT_ID.test(asset.shot_id ?? '')
      || asset.shot_id
        !== canonicalArtifacts.shotPlan.shots[index]?.shot_id
      || !SAFE_ID.test(asset.asset_id ?? '')
      || shotIds.has(asset.shot_id)
      || assetIds.has(asset.asset_id)
      || !SHA256.test(asset.bytes_sha256 ?? '')
      || !Number.isSafeInteger(asset.size_bytes)
      || asset.size_bytes < 1
      || asset.consumer?.role !== 'ordinary-primary'
      || !['img', 'video'].includes(asset.consumer?.element)
    ) {
      fail(
        'source_p3_evidence_invalid',
        'An asset fact is invalid or out of canonical shot order.',
      );
    }
    shotIds.add(asset.shot_id);
    assetIds.add(asset.asset_id);
  }
}

export function validateP3ProductionEvidence(evidence) {
  exact(
    evidence,
    P3_EVIDENCE_FIELDS,
    'source_p3_evidence_invalid',
    'P4 requires the exact closed P3 evidence set.',
  );
  try {
    validateProductionContract(evidence.prior_contract, {
      artifacts: evidence.canonical_artifacts,
    });
  } catch (error) {
    rethrow(
      error,
      'source_p3_evidence_invalid',
      'The actual director contract or canonical artifacts are invalid.',
    );
  }
  exact(
    evidence.canonical_artifacts,
    CANONICAL_ARTIFACT_FIELDS,
    'production_contract_artifacts_required',
    'P4 requires all nine actual canonical artifacts.',
  );
  try {
    validateValidationPolicy(evidence.validation_policy);
  } catch (error) {
    rethrow(
      error,
      'source_p3_evidence_invalid',
      'The actual validation policy is invalid.',
    );
  }
  if (
    evidence.prior_contract.contract_phase !== 'director'
    || !same(
      evidence.validation_policy,
      evidence.canonical_artifacts.validationPolicy,
    )
  ) {
    fail(
      'source_p3_evidence_invalid',
      'P4 requires the exact director predecessor and canonical policy.',
    );
  }
  try {
    validateGateReceipt(evidence.director_policy_receipt, {
      productionContract: evidence.prior_contract,
      validationPolicy: evidence.validation_policy,
    });
  } catch (error) {
    rethrow(
      error,
      'source_p3_evidence_invalid',
      'The director policy receipt is invalid.',
    );
  }
  if (
    evidence.director_policy_receipt.gate !== 'policy-gate'
    || evidence.director_policy_receipt.phase !== 'director'
    || evidence.director_policy_receipt.scope_id !== 'director'
    || evidence.director_policy_receipt.status !== 'passed'
  ) {
    fail(
      'source_p3_evidence_invalid',
      'P4 requires the current passing director policy receipt.',
    );
  }
  validateAssetManifest(
    evidence.asset_manifest,
    evidence.canonical_artifacts,
    evidence.prior_contract,
    evidence.director_policy_receipt,
  );
  try {
    validateProductionContract(evidence.production_contract, {
      artifacts: evidence.canonical_artifacts,
      priorContract: evidence.prior_contract,
      assetManifest: evidence.asset_manifest,
    });
  } catch (error) {
    rethrow(
      error,
      'source_p3_evidence_invalid',
      'The sealed production contract is invalid.',
    );
  }
  if (evidence.production_contract.contract_phase !== 'sealed') {
    fail(
      'source_p3_evidence_invalid',
      'Block gates require the exact sealed production contract.',
    );
  }
  try {
    validateGateReceipt(evidence.sealed_policy_receipt, {
      productionContract: evidence.production_contract,
      validationPolicy: evidence.validation_policy,
    });
  } catch (error) {
    rethrow(
      error,
      'source_p3_evidence_invalid',
      'The sealed policy receipt is invalid.',
    );
  }
  if (
    evidence.sealed_policy_receipt.gate !== 'policy-gate'
    || evidence.sealed_policy_receipt.phase !== 'sealed'
    || evidence.sealed_policy_receipt.scope_id !== 'sealed'
    || evidence.sealed_policy_receipt.status !== 'passed'
  ) {
    fail(
      'source_p3_evidence_invalid',
      'P4 requires the current passing sealed policy receipt.',
    );
  }
  return {
    shotPlan: evidence.canonical_artifacts.shotPlan,
    designSystem: evidence.canonical_artifacts.designSystem,
    componentRegistry: evidence.canonical_artifacts.componentRegistry,
    fontPackage: evidence.canonical_artifacts.fontPackage,
    projection: evidence.canonical_artifacts.projection,
    assetManifest: evidence.asset_manifest,
    productionContract: evidence.production_contract,
    validationPolicy: evidence.validation_policy,
  };
}

function p3EvidenceFrom(input) {
  return Object.fromEntries(
    P3_EVIDENCE_FIELDS.map((field) => [field, input[field]]),
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

function validateSourceDocuments(sourceBundle) {
  const paths = new Set();
  const byType = new Map();
  for (const file of sourceBundle.files) {
    exact(
      file,
      SOURCE_FILE_FIELDS,
      'source_bundle_invalid',
      'Every source file must use the closed source-byte shape.',
    );
    const normalized = path.posix.normalize(file.relative_path ?? '');
    if (
      typeof file.relative_path !== 'string'
      || !file.relative_path
      || normalized !== file.relative_path
      || normalized.startsWith('../')
      || normalized.includes('/../')
      || path.posix.isAbsolute(normalized)
    ) fail('source_root_escape', 'A source file escapes the block root.');
    if (
      paths.has(normalized)
      || !ALLOWED_SOURCE_MEDIA_TYPES.has(file.media_type)
      || typeof file.content !== 'string'
      || Buffer.byteLength(file.content, 'utf8') > 8 * 1024 * 1024
      || !SHA256.test(file.bytes_sha256 ?? '')
      || createHash('sha256')
        .update(Buffer.from(file.content, 'utf8'))
        .digest('hex') !== file.bytes_sha256
    ) fail('source_bundle_invalid', 'Source file bytes or identity are invalid.');
    paths.add(normalized);
    byType.set(
      file.media_type,
      `${byType.get(file.media_type) ?? ''}\n${file.content}`,
    );
  }
  if (
    !paths.has('index.html')
    || !paths.has('styles.css')
    || !paths.has('block.js')
  ) fail('source_bundle_invalid', 'The block source entry set is incomplete.');
  return {
    html: byType.get('text/html') ?? '',
    css: byType.get('text/css') ?? '',
    javascript: byType.get('text/javascript') ?? '',
    all: sourceBundle.files.map((file) => file.content).join('\n'),
  };
}

async function actualFileHash(localPath, code) {
  if (typeof localPath !== 'string' || !path.isAbsolute(localPath)) {
    fail(code, 'Actual local bytes require one absolute private input locator.');
  }
  let stat;
  let bytes;
  try {
    stat = await lstat(localPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail(code, 'A material or font locator is not a regular non-symlink file.');
    }
    bytes = await readFile(localPath);
  } catch (error) {
    if (error instanceof BlockSourceGateError) throw error;
    fail(code, 'A material or font byte file cannot be opened.');
  }
  return {
    bytes,
    bytes_sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

async function validateInspectionEvidence(
  inspection,
  input,
  sourcePolicy,
) {
  exact(
    inspection,
    INSPECTION_FIELDS,
    'source_inspection_invalid',
    'Source inspection evidence has an invalid closed shape.',
  );
  exact(
    inspection.parser_evidence,
    PARSER_FIELDS,
    'source_inspection_invalid',
    'Source parser evidence has an invalid closed shape.',
  );
  for (const [field, library, kind, mediaType] of [
    ['html', 'parse5', 'dom-ast', 'text/html'],
    ['javascript', 'acorn', 'ecmascript-ast', 'text/javascript'],
    ['css', 'postcss', 'css-ast', 'text/css'],
  ]) {
    const record = inspection.parser_evidence[field];
    exact(
      record,
      PARSER_RECORD_FIELDS,
      'source_inspection_invalid',
      'One parser record has an invalid closed shape.',
    );
    const document = input.source_bundle.files.find(
      (file) => file.media_type === mediaType,
    );
    if (
      record.library !== library
      || record.kind !== kind
      || typeof record.version !== 'string'
      || !record.version
      || !Number.isSafeInteger(record.node_count)
      || record.node_count < 1
      || record.document_sha256 !== document?.bytes_sha256
    ) fail('source_inspection_invalid', 'Parser evidence is stale or unbound.');
  }
  const parserCore = {
    html: inspection.parser_evidence.html,
    javascript: inspection.parser_evidence.javascript,
    css: inspection.parser_evidence.css,
  };
  exact(
    inspection.hyperframes_check,
    HYPERFRAMES_CHECK_FIELDS,
    'source_inspection_invalid',
    'HyperFrames check evidence has an invalid closed shape.',
  );
  exact(
    inspection.structural_facts,
    STRUCTURAL_FACT_FIELDS,
    'source_inspection_invalid',
    'Structural facts have an invalid closed shape.',
  );
  const actualDependencies = {
    materials: [],
    font: {
      family: input.source_bundle.font_package.family,
      bytes_sha256: null,
    },
  };
  for (const material of input.source_bundle.materials) {
    const actual = await actualFileHash(
      material.local_path,
      'source_inspection_invalid',
    );
    actualDependencies.materials.push({
      asset_id: material.asset_id,
      bytes_sha256: actual.bytes_sha256,
    });
  }
  actualDependencies.font.bytes_sha256 = (
    await actualFileHash(
      input.source_bundle.font_package.local_path,
      'source_inspection_invalid',
    )
  ).bytes_sha256;
  const sourceBytesSha256 = fingerprintV3Value(
    input.source_bundle.files.map((file) => ({
      relative_path: file.relative_path,
      media_type: file.media_type,
      bytes_sha256: file.bytes_sha256,
    })).sort((left, right) => left.relative_path.localeCompare(
      right.relative_path,
    )),
  );
  const hf = inspection.hyperframes_check;
  const hfBinding = fingerprintV3Value({
    tool: hf.tool,
    version: hf.version,
    argv: hf.argv,
    checked_source_sha256: hf.checked_source_sha256,
  });
  const inspectionCore = { ...inspection };
  delete inspectionCore.inspection_sha256;
  if (
    inspection.schema_version !== 1
    || inspection.inspector_id !== 'block-source-structural-v1'
    || inspection.block_id !== input.block_manifest.block_id
    || inspection.source_sha256 !== input.source_bundle.source_sha256
    || inspection.source_bytes_sha256 !== sourceBytesSha256
    || inspection.actual_dependency_set_sha256
      !== fingerprintV3Value(actualDependencies)
    || inspection.parser_evidence.parser_set_sha256
      !== fingerprintV3Value(parserCore)
    || hf.tool !== 'hyperframes'
    || hf.version
      !== input.validation_policy.tool_bindings.hyperframes_version
    || !same(hf.argv, ['check', '--json'])
    || hf.status !== 'passed'
    || hf.checked_source_sha256 !== input.source_bundle.source_sha256
    || hf.tool_binding_sha256 !== hfBinding
    || !SHA256.test(hf.project_source_sha256 ?? '')
    || !SHA256.test(hf.result_sha256 ?? '')
    || inspection.inspection_sha256
      !== fingerprintV3Value(inspectionCore)
    || !Array.isArray(
      inspection.structural_facts.hard_failure_codes,
    )
    || new Set(
      inspection.structural_facts.hard_failure_codes,
    ).size !== inspection.structural_facts.hard_failure_codes.length
  ) fail('source_inspection_invalid', 'Source inspection evidence is stale.');
  for (const code of inspection.structural_facts.hard_failure_codes) {
    if (!sourcePolicy.has(code)) {
      fail(
        'source_inspection_invalid',
        'Source inspection emitted a code outside the current policy registry.',
      );
    }
  }
}

async function validateFontBytesAndSource(sourceBundle, evidence, texts) {
  exact(
    sourceBundle.font_package,
    FONT_FIELDS,
    'source_font_package_invalid',
    'The source font package has an invalid closed shape.',
  );
  const sourceFont = sourceBundle.font_package;
  const canonicalFont = evidence.fontPackage;
  const cssWeights = [...texts.css.matchAll(/font-weight\s*:\s*([1-9]00)(?:\s+([1-9]00))?/giu)]
    .flatMap((match) => match.slice(1, 3).filter(Boolean).map(Number));
  if (
    !Array.isArray(sourceFont.weights)
    || sourceFont.weights.some((weight) => !Number.isSafeInteger(weight))
    || cssWeights.some((weight) => !sourceFont.weights.includes(weight))
    || !same(sourceFont.weights, canonicalFont.weights)
  ) {
    fail(
      'font_weight_role_mismatch',
      'Source font weights do not bind the canonical role weights.',
    );
  }
  if (
    CJK_TEXT.test(texts.html)
    && (
      !Array.isArray(sourceFont.glyph_ranges)
      || !sourceFont.glyph_ranges.some((range) => /cjk|han/iu.test(range))
      || !same(sourceFont.glyph_ranges, canonicalFont.glyph_ranges)
    )
  ) {
    fail(
      'font_glyph_source_unbound',
      'Visible CJK glyphs are not bound to the canonical font bytes.',
    );
  }
  if (
    /\blocal\s*\(/iu.test(texts.css)
    || /font-family\s*:[^;}]*\b(?:sans-serif|serif|monospace|system-ui|cursive|fantasy)\b/iu
      .test(texts.css)
  ) {
    fail(
      'font_fallback_forbidden',
      'System, local and generic font fallbacks are forbidden.',
    );
  }
  if (
    sourceFont.family !== canonicalFont.family
    || sourceFont.local_path !== canonicalFont.local_path
    || sourceFont.bytes_sha256 !== canonicalFont.bytes_sha256
    || !/@font-face\s*\{[^}]*src\s*:\s*url\(\s*["']?\.\/[^)"']+["']?\s*\)/iu
      .test(texts.css)
  ) {
    fail(
      'source_font_package_invalid',
      'Source font declarations do not bind the canonical local font package.',
    );
  }
  const actual = await actualFileHash(
    sourceFont.local_path,
    'source_font_package_invalid',
  );
  if (
    actual.bytes_sha256 !== sourceFont.bytes_sha256
    || actual.bytes_sha256 !== canonicalFont.bytes_sha256
  ) fail('source_font_package_invalid', 'Font bytes drifted from the canonical package.');
}

async function validateMaterialBytes(sourceBundle, manifest, evidence) {
  const expectedPrimaryIds = new Set(
    manifest.shots.map((shot) => shot.primary_material_asset_id),
  );
  const expectedAuxiliaryIds = new Set(
    manifest.shots.flatMap((shot) => shot.native_auxiliary_asset_ids),
  );
  const assetById = new Map(
    evidence.assetManifest.assets.map((asset) => [asset.asset_id, asset]),
  );
  for (const shot of manifest.shots) {
    if (
      assetById.get(shot.primary_material_asset_id)?.shot_id
        !== shot.shot_id
    ) {
      fail(
        'source_asset_unbound',
        'A primary material was swapped across canonical shots.',
      );
    }
  }
  const seen = new Set();
  for (const material of sourceBundle.materials) {
    exact(
      material,
      MATERIAL_FIELDS,
      'source_asset_unbound',
      'A material has an invalid closed shape.',
    );
    if (
      !SAFE_ID.test(material.asset_id ?? '')
      || seen.has(material.asset_id)
      || !SHA256.test(material.bytes_sha256 ?? '')
      || typeof material.auxiliary !== 'boolean'
      || !['image', 'video', 'svg'].includes(material.media_kind)
      || !['ordinary-primary', 'native-auxiliary', 'control-media']
        .includes(material.consumer_role)
    ) fail('source_asset_unbound', 'A material identity or role is invalid.');
    const actual = await actualFileHash(
      material.local_path,
      'source_asset_unbound',
    );
    if (actual.bytes_sha256 !== material.bytes_sha256) {
      fail('source_asset_unbound', 'Material bytes do not match their hash.');
    }
    if (expectedPrimaryIds.has(material.asset_id)) {
      const asset = assetById.get(material.asset_id);
      if (
        !asset
        || material.consumer_role !== 'ordinary-primary'
        || material.auxiliary
        || material.bytes_sha256 !== asset.bytes_sha256
        || (
          asset.consumer.element === 'img'
          && material.media_kind !== 'image'
        )
        || (
          asset.consumer.element === 'video'
          && material.media_kind !== 'video'
        )
      ) fail('source_asset_unbound', 'Primary material is not bound to P3 facts.');
    } else if (expectedAuxiliaryIds.has(material.asset_id)) {
      if (
        material.consumer_role !== 'native-auxiliary'
        || !material.auxiliary
        || material.media_kind !== 'svg'
      ) fail('source_asset_unbound', 'Native auxiliary material role drifted.');
    } else if (
      material.consumer_role !== 'control-media'
      || material.auxiliary
    ) fail('source_asset_unbound', 'An undeclared material entered the block.');
    seen.add(material.asset_id);
  }
  for (const id of [...expectedPrimaryIds, ...expectedAuxiliaryIds]) {
    if (!seen.has(id)) fail('source_asset_unbound', 'A required material is missing.');
  }
}

function parseHtmlStartTags(html) {
  const tags = [];
  for (const match of html.matchAll(/<[A-Za-z][^<>]*>/gu)) {
    const source = match[0];
    const attributes = {};
    for (const attribute of source.matchAll(
      /\s([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(["'])(.*?)\2/gu,
    )) {
      attributes[attribute[1].toLowerCase()] = attribute[3];
    }
    tags.push({
      source,
      attributes,
    });
  }
  return tags;
}

function validateSourcePatterns(texts) {
  if (REMOTE_OR_NETWORK.test(texts.all)) {
    fail('remote_dependency', 'Runtime network or remote dependencies are forbidden.');
  }
  if (/\bMath\s*\.\s*random\s*\(/u.test(texts.javascript)) {
    fail('nondeterministic_random', 'Math.random is forbidden in frozen source.');
  }
  if (/\bDate\s*\.\s*now\s*\(/u.test(texts.javascript)) {
    fail('nondeterministic_clock', 'Date.now is forbidden in frozen source.');
  }
  if (PRIVATE_SOURCE_PATH.test(texts.all)) {
    fail('hardcoded_output_path', 'Hard-coded user paths are forbidden.');
  }
  if (
    /(?:timeline|tl)\s*\.\s*call\s*\([\s\S]{0,2048}?(?:classList\s*\.\s*add|setAttribute\s*\(|textContent\s*=)/iu
      .test(texts.javascript)
  ) {
    fail(
      'seek_irreversible_callback',
      'A one-way DOM mutation callback is not reversible under seek.',
    );
  }
  if (/\brepeat\s*:\s*-1\b/u.test(texts.javascript)) {
    fail('timeline_repeat_infinite', 'Infinite timeline repeat is forbidden.');
  }
  if (/\b(?:async|await)\b/u.test(texts.javascript)) {
    fail('source_hyperframes_invalid', 'Undeclared asynchronous source is forbidden.');
  }
  const timelines = [
    ...texts.javascript.matchAll(
      /HyperFrames\s*\.\s*timeline\s*\(\s*(\{[^}]*\})\s*\)/gisu,
    ),
  ];
  if (
    timelines.length < 1
    || timelines.some(
      (match) => !/\bpaused\s*:\s*true\b/iu.test(match[1]),
    )
  ) {
    fail('source_hyperframes_invalid', 'A paused HyperFrames timeline is required.');
  }
}

function registeredFacts(evidence) {
  return {
    paletteTokens: new Set(
      evidence.designSystem.palette_roles.map((item) => item.token),
    ),
    typeRoles: new Map(
      evidence.designSystem.type_roles.map((item) => [item.role, item]),
    ),
    motionProfiles: new Set(
      evidence.designSystem.motion_profiles.map(
        (item) => item.motion_profile_id,
      ),
    ),
    components: new Map(
      evidence.componentRegistry.components.map(
        (item) => [item.component_id, item],
      ),
    ),
  };
}

function validateDataPoint(point, canonicalPoint) {
  if (
    !point
    || typeof point !== 'object'
    || Array.isArray(point)
    || typeof point.source_ref !== 'string'
    || !point.source_ref
    || PRIVATE_SOURCE_PATH.test(point.source_ref)
    || !['measured', 'reported', 'illustrative']
      .includes(point.evidence_role)
  ) {
    fail(
      'numeric_provenance_missing',
      'Numeric evidence requires a bounded source and evidence role.',
    );
  }
  const formula = point.formula;
  const denominator = point.denominator;
  if (
    !formula
    || typeof formula !== 'object'
    || !denominator
    || typeof denominator !== 'object'
    || !Number.isFinite(point.value)
    || !Number.isFinite(denominator.value)
    || !Array.isArray(formula.operands)
    || formula.operands.length < 1
    || formula.operands.length > 8
    || formula.operands.some((item) => !Number.isFinite(item))
    || !['literal', 'add', 'subtract', 'multiply', 'divide', 'percentage']
      .includes(formula.operator)
    || formula.result_unit !== point.unit
  ) {
    fail('numeric_formula_conflict', 'Numeric formula facts are incomplete.');
  }
  let evaluated;
  switch (formula.operator) {
    case 'literal':
      evaluated = formula.operands.length === 1
        ? formula.operands[0] : Number.NaN;
      break;
    case 'add':
      evaluated = formula.operands.reduce(
        (total, item) => total + item,
        0,
      );
      break;
    case 'subtract':
      evaluated = formula.operands.length === 2
        ? formula.operands[0] - formula.operands[1] : Number.NaN;
      break;
    case 'multiply':
      evaluated = formula.operands.reduce(
        (total, item) => total * item,
        1,
      );
      break;
    case 'divide':
    case 'percentage':
      evaluated = formula.operands.length === 2
        && formula.operands[1] !== 0
        ? formula.operands[0] / formula.operands[1]
          * (formula.operator === 'percentage' ? 100 : 1)
        : Number.NaN;
      break;
    default:
      evaluated = Number.NaN;
  }
  if (
    !Number.isFinite(evaluated)
    || Math.abs(evaluated - point.value) > 1e-9
    || !formula.operands.includes(denominator.value)
    || (
      ['divide', 'percentage'].includes(formula.operator)
      && formula.operands[1] !== denominator.value
    )
    || !same(point, canonicalPoint)
  ) {
    if (point.source_ref !== canonicalPoint?.source_ref) {
      fail(
        'canonical_artifact_reference_unregistered',
        'A numeric source does not exist in the canonical shot plan.',
      );
    }
    fail('numeric_formula_conflict', 'Numeric formula does not evaluate to its value.');
  }
}

function validateCanonicalShot(
  blockShot,
  canonicalShot,
  projectionShot,
  facts,
  policy,
  blockId,
) {
  exact(
    blockShot,
    BLOCK_SHOT_FIELDS,
    'source_block_manifest_invalid',
    'A block shot has an invalid closed shape.',
  );
  if (
    blockShot.shot_id !== canonicalShot?.shot_id
    || blockShot.shot_id !== projectionShot?.shot_id
    || blockShot.start_frame !== projectionShot.frame_window.start_frame
    || blockShot.end_frame !== projectionShot.frame_window.end_frame
    || blockShot.semantic_kind !== canonicalShot.shot_kind
    || blockShot.layout_family !== canonicalShot.layout_family
    || blockShot.focal_role !== canonicalShot.focal_role
  ) fail('duration_truth_conflict', 'Block shot timing or identity drifted from projection.');
  const component = facts.components.get(blockShot.component_id);
  if (
    blockShot.component_id !== canonicalShot.component_id
    || !component
    || blockShot.motion_profile_id !== canonicalShot.motion_profile_id
    || !facts.motionProfiles.has(blockShot.motion_profile_id)
    || !component.motion_profile_ids.includes(blockShot.motion_profile_id)
    || blockShot.palette_token_ids.some(
      (token) => !facts.paletteTokens.has(token),
    )
    || blockShot.font_role_ids.some(
      (fontRole) => ![...facts.typeRoles.values()].some(
        (typeRole) => typeRole.font_role_id === fontRole,
      ),
    )
  ) {
    fail(
      'canonical_artifact_reference_unregistered',
      'A block design, component or motion reference is unregistered.',
    );
  }
  if (
    !Array.isArray(blockShot.functional_text)
    || blockShot.functional_text.length
      !== canonicalShot.text_elements.length
  ) {
    fail(
      'canonical_artifact_reference_unregistered',
      'Functional text does not bind canonical text elements.',
    );
  }
  for (const [index, text] of blockShot.functional_text.entries()) {
    exact(
      text,
      FUNCTIONAL_TEXT_FIELDS,
      'canonical_artifact_reference_unregistered',
      'A functional text binding is invalid.',
    );
    const canonicalText = canonicalShot.text_elements[index];
    const typeRole = facts.typeRoles.get(text.type_role);
    if (
      !typeRole
      || !component.allowed_type_roles.includes(text.type_role)
      || text.element_id !== canonicalText.element_id
      || text.selector !== canonicalText.selector
      || text.type_role !== canonicalText.type_role
      || text.semantic_responsibility
        !== canonicalText.semantic_responsibility
      || text.primary_meaning
        !== canonicalText.carries_primary_meaning
      || (
        text.type_role === 'microtext-texture'
        && text.primary_meaning
      )
    ) {
      fail(
        'canonical_artifact_reference_unregistered',
        'A functional type-role reference is unregistered or stale.',
      );
    }
  }
  if (
    !Array.isArray(blockShot.data_points)
    || blockShot.data_points.length !== canonicalShot.data_points.length
  ) {
    fail(
      'canonical_artifact_reference_unregistered',
      'Block data facts do not equal canonical data facts.',
    );
  }
  blockShot.data_points.forEach(
    (point, index) => validateDataPoint(
      point,
      canonicalShot.data_points[index],
    ),
  );
  exact(
    blockShot.causal_lifecycle,
    PHASES,
    'source_lifecycle_invalid',
    'Every block shot must bind all five lifecycle phases.',
  );
  const timelineById = new Map();
  if (!Array.isArray(blockShot.timeline_calls)) {
    fail('source_lifecycle_invalid', 'Timeline calls must be an array.');
  }
  for (const call of blockShot.timeline_calls) {
    exact(
      call,
      TIMELINE_CALL_FIELDS,
      'source_lifecycle_invalid',
      'A timeline call has an invalid closed shape.',
    );
    if (
      !SAFE_ID.test(call.call_id ?? '')
      || timelineById.has(call.call_id)
      || !PHASES.includes(call.phase)
      || typeof call.selector !== 'string'
      || !call.selector.startsWith('#')
      || typeof call.property !== 'string'
      || !Number.isSafeInteger(call.start_frame)
      || !Number.isSafeInteger(call.end_frame)
      || call.end_frame <= call.start_frame
      || !Number.isSafeInteger(call.repeat)
      || typeof call.paused !== 'boolean'
      || typeof call.reversible !== 'boolean'
    ) fail('source_lifecycle_invalid', 'Timeline call identity is invalid.');
    if (call.repeat < 0) {
      fail('timeline_repeat_infinite', 'Infinite timeline repeat is forbidden.');
    }
    if (!call.paused) {
      fail('source_hyperframes_invalid', 'Every timeline call must be paused.');
    }
    if (!call.reversible) {
      fail('seek_irreversible_callback', 'Timeline call is not seek reversible.');
    }
    const fullTail = call.start_frame
      + (call.end_frame - call.start_frame) * (call.repeat + 1);
    if (
      call.start_frame < blockShot.start_frame
      || call.end_frame > blockShot.end_frame
      || fullTail > blockShot.end_frame
    ) fail('timeline_tail_overflow', 'A finite timeline tail exits the shot window.');
    timelineById.set(call.call_id, call);
  }
  const rawAction = blockShot.causal_lifecycle?.action;
  const rawResult = blockShot.causal_lifecycle?.result;
  const rawHold = blockShot.causal_lifecycle?.hold;
  if (
    Number.isSafeInteger(rawResult?.start_frame)
    && Number.isSafeInteger(rawAction?.end_frame)
    && rawResult.start_frame < rawAction.end_frame
  ) {
    fail('result_precedes_action', 'Result appears before Action completes.');
  }
  const inferredComplex = canonicalShot.readability_class === 'complex'
    || policy.readable_hold_policy.complex_classes
      .includes(blockShot.semantic_kind)
    || ['chart', 'terminal-form-table', 'comparison']
      .includes(blockShot.component_id)
    || blockShot.data_points.length > 0
    || blockShot.functional_text.length >= 4;
  const requiredHold = inferredComplex
    ? policy.readable_hold_policy.complex_min_frames
    : policy.readable_hold_policy.ordinary_min_frames;
  if (
    Number.isSafeInteger(rawHold?.start_frame)
    && Number.isSafeInteger(rawHold?.end_frame)
    && rawHold.end_frame - rawHold.start_frame < requiredHold
  ) {
    fail('readable_hold_missing', 'Readable Hold is below the current policy.');
  }
  let previousEnd = blockShot.start_frame;
  for (const phase of PHASES) {
    const record = blockShot.causal_lifecycle[phase];
    exact(
      record,
      LIFECYCLE_FIELDS,
      'source_lifecycle_invalid',
      'A lifecycle phase has an invalid closed shape.',
    );
    const canonicalRecord = canonicalShot.causal_lifecycle[phase];
    const expectedStart = blockShot.start_frame + canonicalRecord.start_frame;
    const expectedEnd = blockShot.start_frame + canonicalRecord.end_frame;
    for (const selector of record.selectors ?? []) {
      const crossBlock = typeof selector === 'string'
        ? selector.match(/^#(B[0-9]{3})(?:[-_.]|$)/iu)
        : null;
      if (
        crossBlock
        && crossBlock[1].toUpperCase() !== blockId
      ) {
        fail('selector_cross_block', 'Selector points into another block.');
      }
      if (!canonicalRecord.selectors.includes(selector)) {
        fail('selector_orphan', 'A lifecycle selector is not canonical.');
      }
    }
    if (
      record.start_frame !== expectedStart
      || record.end_frame !== expectedEnd
      || record.start_frame !== previousEnd
      || !same(record.selectors, canonicalRecord.selectors)
      || !same(record.timeline_call_ids, canonicalRecord.timeline_calls)
      || record.selectors.length < 1
    ) fail('source_lifecycle_invalid', 'Lifecycle phases drifted from canonical facts.');
    for (const callId of record.timeline_call_ids) {
      const call = timelineById.get(callId);
      if (
        !call
        || call.phase !== phase
        || call.start_frame !== record.start_frame
        || call.end_frame !== record.end_frame
        || !record.selectors.includes(call.selector)
      ) fail('source_lifecycle_invalid', 'Lifecycle does not bind its timeline call.');
    }
    previousEnd = record.end_frame;
  }
  const actionCalls = blockShot.timeline_calls.filter(
    (call) => call.phase === 'action',
  );
  if (
    !actionCalls.some(
      (call) => (
        !VISUAL_ONLY_PROPERTY.test(call.property)
        && !same(call.from, call.to)
      ),
    )
  ) fail('source_semantic_action_missing', 'Action lacks a semantic non-opacity change.');
  const action = blockShot.causal_lifecycle.action;
  const result = blockShot.causal_lifecycle.result;
  const hold = blockShot.causal_lifecycle.hold;
  if (
    blockShot.result_selector !== canonicalShot.text_elements.find(
      (text) => (
        text.element_id
          === canonicalShot.result_state.semantic_carrier_element_id
      ),
    )?.selector
    || !result.selectors.includes(blockShot.result_selector)
    || !hold.selectors.includes(blockShot.result_selector)
  ) fail('source_lifecycle_invalid', 'Result carrier is not preserved through Hold.');
  if (
    blockShot.timeline_calls.some(
      (call) => (
        call.phase === 'result'
        && /^(?:scale|scaleX|scaleY)$/u.test(call.property)
        && Number(call.to) === 0
      ),
    )
  ) fail('terminal_result_invisible', 'Terminal Result is scaled to zero.');
}

function validateManifest(manifest, evidence) {
  exact(
    manifest,
    MANIFEST_FIELDS,
    'source_block_manifest_invalid',
    'The block manifest has an invalid closed shape.',
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
    || manifest.namespace !== `block-${manifest.block_id.toLowerCase()}`
    || !['faceless', 'talking-head'].includes(manifest.mode)
    || manifest.production_contract_sha256
      !== evidence.productionContract.production_contract_sha256
    || manifest.projection_sha256
      !== evidence.productionContract.projection_sha256
    || manifest.asset_manifest_sha256
      !== evidence.productionContract.asset_manifest_sha256
    || !Number.isSafeInteger(manifest.start_frame)
    || !Number.isSafeInteger(manifest.end_frame)
    || manifest.start_frame < 0
    || manifest.end_frame <= manifest.start_frame
    || !Array.isArray(manifest.shots)
    || manifest.shots.length < 1
    || manifest.shots.length > 8
    || !Array.isArray(manifest.shot_ids)
    || manifest.shot_ids.length !== manifest.shots.length
    || !SHA256.test(manifest.source_sha256 ?? '')
    || !SHA256.test(manifest.runtime_sample_plan_sha256 ?? '')
    || !SHA256.test(manifest.pixel_frame_plan_sha256 ?? '')
    || !SHA256.test(manifest.block_manifest_sha256 ?? '')
    || fingerprintV3Value(core) !== manifest.block_manifest_sha256
  ) fail('source_block_manifest_invalid', 'The block manifest is invalid or stale.');
  safeStringList(manifest.shot_ids, {
    minimum: 1,
    maximum: 8,
    pattern: SHOT_ID,
  });
  const canonicalIndex = evidence.shotPlan.shots.findIndex(
    (shot) => shot.shot_id === manifest.shot_ids[0],
  );
  const canonicalShots = evidence.shotPlan.shots.slice(
    canonicalIndex,
    canonicalIndex + manifest.shot_ids.length,
  );
  const projectionById = new Map(
    evidence.projection.shots.map((shot) => [shot.shot_id, shot]),
  );
  if (
    canonicalIndex < 0
    || !same(
      manifest.shot_ids,
      canonicalShots.map((shot) => shot.shot_id),
    )
  ) fail('duration_truth_conflict', 'Block shots are not one contiguous canonical slice.');
  const facts = registeredFacts(evidence);
  for (const [index, blockShot] of manifest.shots.entries()) {
    if (blockShot.shot_id !== manifest.shot_ids[index]) {
      fail('duration_truth_conflict', 'Block shot order has drifted.');
    }
    validateCanonicalShot(
      blockShot,
      canonicalShots[index],
      projectionById.get(blockShot.shot_id),
      facts,
      evidence.validationPolicy,
      manifest.block_id,
    );
  }
  if (
    manifest.start_frame !== manifest.shots[0].start_frame
    || manifest.end_frame !== manifest.shots.at(-1).end_frame
    || manifest.shots.some(
      (shot, index) => index > 0
        && shot.start_frame !== manifest.shots[index - 1].end_frame,
    )
  ) fail('duration_truth_conflict', 'Block duration has more than one truth.');
  const runtimePlan = manifest.shots.flatMap((shot) => (
    PHASES.map((phase) => ({
      shot_id: shot.shot_id,
      phase,
      frame: shot.causal_lifecycle[phase].start_frame,
    }))
  ));
  const pixelPlan = manifest.shots.map((shot) => ({
    shot_id: shot.shot_id,
    phase: 'hold',
    frame: shot.causal_lifecycle.hold.start_frame,
  }));
  if (
    fingerprintV3Value(runtimePlan)
      !== manifest.runtime_sample_plan_sha256
    || fingerprintV3Value(pixelPlan)
      !== manifest.pixel_frame_plan_sha256
  ) fail('duration_truth_conflict', 'Runtime or pixel frame plan is stale.');
}

function validateDomAndHyperFrames(sourceBundle, manifest, evidence, texts) {
  const tags = parseHtmlStartTags(texts.html);
  const ids = new Map();
  for (const tag of tags) {
    const id = tag.attributes.id;
    if (!id) continue;
    if (ids.has(id)) fail('selector_duplicate', 'HTML contains a duplicate ID selector.');
    ids.set(id, tag.attributes);
  }
  const registered = registeredFacts(evidence);
  for (const tag of tags) {
    const attributes = tag.attributes;
    for (const [attribute, value] of Object.entries(attributes)) {
      if (attribute.startsWith('data-token-')
        && !registered.paletteTokens.has(value)) {
        fail(
          'canonical_artifact_reference_unregistered',
          'Source uses an unregistered design token.',
        );
      }
      if (
        attribute === 'data-component'
        && !registered.components.has(value)
      ) {
        fail(
          'canonical_artifact_reference_unregistered',
          'Source uses an unregistered component.',
        );
      }
      if (
        attribute === 'data-motion-profile'
        && !registered.motionProfiles.has(value)
      ) {
        fail(
          'canonical_artifact_reference_unregistered',
          'Source uses an unregistered motion profile.',
        );
      }
      if (
        attribute === 'data-type-role'
        && !registered.typeRoles.has(value)
      ) {
        fail(
          'canonical_artifact_reference_unregistered',
          'Source uses an unregistered type role.',
        );
      }
    }
  }
  const allSelectors = manifest.shots.flatMap((shot) => [
    ...shot.timeline_calls.map((call) => call.selector),
    ...PHASES.flatMap(
      (phase) => shot.causal_lifecycle[phase].selectors,
    ),
    ...shot.functional_text.map((text) => text.selector),
  ]);
  for (const selector of allSelectors) {
    const crossBlock = selector.match(/^#(B[0-9]{3})(?:[-_.]|$)/iu);
    if (
      crossBlock
      && crossBlock[1].toUpperCase() !== manifest.block_id
    ) fail('selector_cross_block', 'Selector points into another block.');
    if (
      !selector.startsWith('#')
      || !ids.has(selector.slice(1))
    ) fail('selector_orphan', 'A declared selector has no source DOM target.');
  }
  for (const shot of manifest.shots) {
    const componentValues = tags.map(
      (tag) => tag.attributes['data-component'],
    ).filter(Boolean);
    const motionValues = tags.map(
      (tag) => tag.attributes['data-motion-profile'],
    ).filter(Boolean);
    if (
      !componentValues.includes(shot.component_id)
      || !motionValues.includes(shot.motion_profile_id)
    ) {
      fail(
        'canonical_artifact_reference_unregistered',
        'Declared component or motion profile is absent from source.',
      );
    }
    for (const text of shot.functional_text) {
      if (
        ids.get(text.selector.slice(1))?.['data-type-role']
          !== text.type_role
      ) {
        fail(
          'canonical_artifact_reference_unregistered',
          'Functional text role is not bound in source DOM.',
        );
      }
    }
  }
  const compactJavascript = texts.javascript.replace(/\s+/gu, '');
  const calls = manifest.shots.flatMap((shot) => shot.timeline_calls);
  if (
    (texts.javascript.match(/(?:timeline|tl)\s*\.\s*fromTo\s*\(/gu) ?? [])
      .length !== calls.length
  ) fail('source_manifest_mismatch', 'HyperFrames source call count drifted.');
  for (const call of calls) {
    const expectedTail = `.fromTo(${JSON.stringify(call.selector)},`
      + `{${call.property}:${JSON.stringify(call.from)}},`
      + `{${call.property}:${JSON.stringify(call.to)},`
      + `startFrame:${call.start_frame},endFrame:${call.end_frame},`
      + `repeat:${call.repeat}});`;
    if (
      !compactJavascript.includes(`timeline${expectedTail}`)
      && !compactJavascript.includes(`tl${expectedTail}`)
    ) {
      fail(
        'source_manifest_mismatch',
        'HyperFrames source does not bind a declared timeline call.',
      );
    }
  }
}

function sourceCacheKey(input) {
  const declaredDependencySetSha256 = fingerprintV3Value({
    materials: input.source_bundle.materials.map((material) => ({
      asset_id: material.asset_id,
      bytes_sha256: material.bytes_sha256,
    })),
    font: {
      family: input.source_bundle.font_package.family,
      bytes_sha256: input.source_bundle.font_package.bytes_sha256,
    },
  });
  const sourceInspectionState = fingerprintV3Value({
    inspection_schema: 'block-source-structural-v1',
    parser_kinds: ['parse5', 'acorn', 'postcss'],
    hyperframes_version:
      input.validation_policy.tool_bindings.hyperframes_version,
    declared_dependency_set_sha256: declaredDependencySetSha256,
  });
  return fingerprintV3Value({
    source_sha256: input.source_bundle.source_sha256,
    policy_sha256: input.validation_policy.validation_policy_sha256,
    production_contract_sha256:
      input.production_contract.production_contract_sha256,
    renderer_version:
      input.validation_policy.tool_bindings.renderer_version,
    hyperframes_version:
      input.validation_policy.tool_bindings.hyperframes_version,
    state_or_frame: sourceInspectionState,
  });
}

function receiptBindings(input) {
  const contract = input.production_contract;
  return {
    production_contract_sha256: contract.production_contract_sha256,
    shot_plan_sha256: contract.shot_plan_sha256,
    design_system_sha256: contract.design_system_sha256,
    component_registry_sha256: contract.component_registry_sha256,
    validation_policy_sha256: contract.validation_policy_sha256,
    reference_style_profile_sha256:
      contract.reference_style_profile_sha256,
    font_package_sha256: contract.font_package_sha256,
    projection_sha256: contract.projection_sha256,
    asset_manifest_sha256: contract.asset_manifest_sha256,
    block_manifest_sha256:
      input.block_manifest.block_manifest_sha256,
    source_sha256: input.source_bundle.source_sha256,
  };
}

export async function validateBlockSourceGate(
  input,
  options = { inspectSource: inspectBlockSource },
) {
  exact(
    input,
    SOURCE_INPUT_FIELDS,
    'source_gate_input_invalid',
    'Source gate input must contain exact P3 evidence and current block bytes.',
  );
  exact(
    options,
    ['inspectSource'],
    'source_gate_options_invalid',
    'Source gate requires exactly one source inspector.',
  );
  if (typeof options.inspectSource !== 'function') {
    fail(
      'source_gate_options_invalid',
      'Source gate requires exactly one source inspector.',
    );
  }
  const evidence = validateP3ProductionEvidence(p3EvidenceFrom(input));
  validateManifest(input.block_manifest, evidence);
  exact(
    input.source_bundle,
    SOURCE_BUNDLE_FIELDS,
    'source_bundle_invalid',
    'Source bundle has an invalid closed shape.',
  );
  if (
    input.source_bundle.schema_version !== 1
    || input.source_bundle.block_id !== input.block_manifest.block_id
    || !Array.isArray(input.source_bundle.files)
    || input.source_bundle.files.length < 1
    || input.source_bundle.files.length > 128
    || !Array.isArray(input.source_bundle.materials)
    || input.source_bundle.materials.length < 1
    || input.source_bundle.materials.length > 128
    || !SHA256.test(input.source_bundle.source_sha256 ?? '')
  ) fail('source_bundle_invalid', 'Source bundle identity is invalid.');
  const texts = validateSourceDocuments(input.source_bundle);
  if (
    fingerprintV3Value(sourceBundleCore(input.source_bundle))
      !== input.source_bundle.source_sha256
    || input.source_bundle.source_sha256
      !== input.block_manifest.source_sha256
  ) fail('source_bundle_invalid', 'Source bundle self-hash is invalid.');
  const inspection = await options.inspectSource({
    block_manifest: input.block_manifest,
    source_bundle: input.source_bundle,
    canonical_artifacts: input.canonical_artifacts,
    validation_policy: input.validation_policy,
  });
  const sourcePolicy = new Set(
    input.validation_policy.gate_policies[
      'source-conformance-gate'
    ].hard_failure_codes,
  );
  await validateInspectionEvidence(
    inspection,
    input,
    sourcePolicy,
  );
  for (const code of inspection.structural_facts.hard_failure_codes) {
    fail(code, 'Parsed source structure violates the current contract.');
  }
  validateSourcePatterns(texts);
  await validateFontBytesAndSource(input.source_bundle, evidence, texts);
  await validateMaterialBytes(input.source_bundle, input.block_manifest, evidence);
  validateDomAndHyperFrames(
    input.source_bundle,
    input.block_manifest,
    evidence,
    texts,
  );
  return createGateReceipt({
    gate: 'source-conformance-gate',
    phase: 'block',
    scope_id: input.block_manifest.block_id,
    productionContract: input.production_contract,
    input_bindings: receiptBindings(input),
    status: 'passed',
    hard_failure_codes: [],
    warning_codes: [],
    metrics: {
      checked_shot_count: input.block_manifest.shot_ids.length,
      checked_file_count: input.source_bundle.files.length,
      checked_material_count: input.source_bundle.materials.length,
      checked_timeline_call_count: input.block_manifest.shots.reduce(
        (count, shot) => count + shot.timeline_calls.length,
        0,
      ),
      canonical_artifact_count: CANONICAL_ARTIFACT_FIELDS.length,
      parsed_node_count:
        inspection.parser_evidence.html.node_count
        + inspection.parser_evidence.javascript.node_count
        + inspection.parser_evidence.css.node_count,
    },
    cache: {
      status: 'miss',
      cache_key_sha256: sourceCacheKey(input),
    },
    validationPolicy: input.validation_policy,
  });
}
