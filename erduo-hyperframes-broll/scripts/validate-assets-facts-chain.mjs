import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { compileProductionContract } from './compile-production-contract.mjs';
import { probeMedia } from './probe-media.mjs';
import {
  AUTHORING_TOPOLOGY_ID,
  PIPELINE_CONTRACT_VERSION,
  ScriptOnlyV3ContractError,
  VALIDATION_POLICY_ID,
  assertNoLegacyActiveFields,
  createGateReceipt,
  fingerprintV3Value,
  validateGateReceipt,
  validateProductionContract,
} from './validate-production-contract.mjs';
import { validateContextBudget } from './validate-context-budget.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT_ID = /^S[0-9]{3}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const ROUTES = Object.freeze([
  'user-media',
  'image-generation',
  'pexels',
]);
const ROUTE_ORDER = Object.freeze([
  ...ROUTES,
  'native-auxiliary',
]);
const INPUT_FIELDS = Object.freeze([
  'prior_contract',
  'director_policy_receipt',
  'canonical_artifacts',
  'selections',
]);
const ARTIFACT_FIELDS = Object.freeze([
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
const SELECTION_FIELDS = Object.freeze([
  'shot_id',
  'asset_id',
  'route',
  'route_order',
  'local_path',
  'selection_basis',
  'rights',
  'provenance',
  'crop',
  'safe_region',
  'focal_point',
  'title_relation',
  'consumer',
]);
const RESULT_FIELDS = Object.freeze([
  'asset_manifest',
  'parent_envelope',
  'policy_receipt',
  'production_contract',
]);
const CONTRACT_BINDINGS = Object.freeze([
  'production_contract_sha256',
  'parsed_srt_sha256',
  'shot_plan_sha256',
  'design_system_sha256',
  'component_registry_sha256',
  'validation_policy_sha256',
  'reference_style_profile_sha256',
  'font_package_sha256',
  'projection_sha256',
  'delivery_profile_sha256',
  'prior_contract_sha256',
  'asset_manifest_sha256',
]);
const PRIVATE_PATH = /(?:^|[/\\])(?:Users|home|private|tmp|var[/\\]folders)(?:[/\\]|$)|^[A-Za-z]:[\\/]|^file:\/\//iu;
const SUBJECTIVE_OR_PRIVATE = /\b(?:aesthetic|beautiful|gold(?:en)?|premium|prompt|reachsurge|subjective|taste|visual)\b|(?:审美|漂亮|高级|金样|校准|私有)/iu;

const fail = (code, message) => {
  throw new ScriptOnlyV3ContractError(code, message);
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

function safeText(value, field, { max = 160, allowColon = false } = {}) {
  const pattern = allowColon
    ? /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u
    : SAFE_ID;
  if (
    typeof value !== 'string'
    || !value
    || Buffer.byteLength(value, 'utf8') > max
    || !pattern.test(value)
    || PRIVATE_PATH.test(value)
    || SUBJECTIVE_OR_PRIVATE.test(value)
  ) {
    fail('asset_fact_invalid', `Asset ${field} must be a bounded technical identifier.`);
  }
  return value;
}

function finiteNumber(value, field, { minimum = 0, exclusive = false } = {}) {
  if (
    typeof value !== 'number'
    || !Number.isFinite(value)
    || (exclusive ? value <= minimum : value < minimum)
  ) {
    fail('asset_geometry_invalid', `Asset ${field} is invalid.`);
  }
  return value;
}

function rectangle(value, field) {
  exact(
    value,
    ['x', 'y', 'width', 'height'],
    'asset_geometry_invalid',
    `Asset ${field} has an invalid shape.`,
  );
  return {
    x: finiteNumber(value.x, `${field}.x`),
    y: finiteNumber(value.y, `${field}.y`),
    width: finiteNumber(value.width, `${field}.width`, {
      minimum: 0,
      exclusive: true,
    }),
    height: finiteNumber(value.height, `${field}.height`, {
      minimum: 0,
      exclusive: true,
    }),
  };
}

function point(value) {
  exact(
    value,
    ['x', 'y'],
    'asset_geometry_invalid',
    'Asset focal point has an invalid shape.',
  );
  return {
    x: finiteNumber(value.x, 'focal_point.x'),
    y: finiteNumber(value.y, 'focal_point.y'),
  };
}

function contains(outer, inner) {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

function containsPoint(rect, value) {
  return value.x >= rect.x
    && value.y >= rect.y
    && value.x <= rect.x + rect.width
    && value.y <= rect.y + rect.height;
}

function normalizeSelectionBasis(value) {
  exact(
    value,
    ['status', 'evidence_refs'],
    'asset_selection_basis_invalid',
    'Asset selection basis has an invalid shape.',
  );
  if (value.status === 'insufficient') {
    fail(
      'material_selection_requires_user_input',
      'Structured material facts are insufficient; user input is required.',
    );
  }
  if (
    value.status !== 'sufficient'
    || !Array.isArray(value.evidence_refs)
    || value.evidence_refs.length < 1
    || value.evidence_refs.length > 16
  ) {
    fail(
      'material_selection_requires_user_input',
      'Structured material facts are insufficient; user input is required.',
    );
  }
  return {
    status: value.status,
    evidence_refs: value.evidence_refs.map((item) => {
      if (
        typeof item !== 'string'
        || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(item)
        || Buffer.byteLength(item, 'utf8') > 160
        || PRIVATE_PATH.test(item)
      ) {
        fail(
          'material_selection_requires_user_input',
          'Structured material facts are insufficient; user input is required.',
        );
      }
      return item;
    }),
  };
}

function precheckSelectionBasisStatus(value) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.status !== 'sufficient'
  ) {
    fail(
      'material_selection_requires_user_input',
      'Structured material facts are insufficient; user input is required.',
    );
  }
}

function normalizeRights(value) {
  exact(
    value,
    ['status', 'basis', 'evidence_sha256'],
    'asset_rights_invalid',
    'Asset rights record has an invalid shape.',
  );
  if (!['cleared', 'conditional'].includes(value.status)
    || !SHA256.test(value.evidence_sha256 ?? '')) {
    fail('asset_rights_invalid', 'Asset rights record is not auditable.');
  }
  return {
    status: value.status,
    basis: safeText(value.basis, 'rights basis'),
    evidence_sha256: value.evidence_sha256,
  };
}

function normalizeProvenance(value, route) {
  exact(
    value,
    ['origin', 'source_id'],
    'asset_provenance_invalid',
    'Asset provenance record has an invalid shape.',
  );
  if (value.origin !== route) {
    fail('asset_provenance_invalid', 'Asset provenance does not match its route.');
  }
  return {
    origin: value.origin,
    source_id: safeText(value.source_id, 'provenance source'),
  };
}

function normalizeTitleRelation(value) {
  exact(
    value,
    ['anchor', 'subject_clearance_px'],
    'asset_geometry_invalid',
    'Asset title relationship has an invalid shape.',
  );
  return {
    anchor: safeText(value.anchor, 'title anchor'),
    subject_clearance_px: finiteNumber(
      value.subject_clearance_px,
      'title_relation.subject_clearance_px',
    ),
  };
}

function normalizeConsumer(value) {
  exact(
    value,
    ['consumer_id', 'role', 'element', 'fit'],
    'asset_consumer_invalid',
    'Asset consumer has an invalid shape.',
  );
  if (
    value.role !== 'ordinary-primary'
    || !['img', 'video'].includes(value.element)
    || !['contain', 'cover'].includes(value.fit)
  ) {
    fail('asset_consumer_invalid', 'Asset consumer is not an ordinary primary consumer.');
  }
  return {
    consumer_id: safeText(value.consumer_id, 'consumer id'),
    role: value.role,
    element: value.element,
    fit: value.fit,
  };
}

function validateConsumerMediaType(consumer, probe) {
  const stillImage = probe.duration_us === null
    && probe.audio?.count === 0;
  if (
    stillImage && consumer.element !== 'img'
    || !stillImage && consumer.element !== 'video'
  ) {
    fail(
      'asset_consumer_invalid',
      'Asset consumer element does not match the probed media type.',
    );
  }
}

function rasterFromProbe(probe) {
  const video = probe?.video?.primary;
  if (
    !video
    || !Number.isSafeInteger(video.display_width)
    || !Number.isSafeInteger(video.display_height)
    || video.display_width <= 0
    || video.display_height <= 0
  ) {
    fail(
      'material_fixture_requires_real_media',
      'Ordinary material must contain a decodable visual stream.',
    );
  }
  return {
    x: 0,
    y: 0,
    width: video.display_width,
    height: video.display_height,
  };
}

async function actualMediaFacts(materialSelection) {
  if (
    typeof materialSelection?.local_path !== 'string'
    || !materialSelection.local_path
  ) {
    fail(
      'material_fixture_requires_real_media',
      'A real local ordinary-media file is required.',
    );
  }
  let before;
  let bytes;
  let probe;
  let verifiedBytes;
  let after;
  try {
    before = await lstat(materialSelection.local_path);
    if (!before.isFile() || before.isSymbolicLink()) {
      fail(
        'material_fixture_requires_real_media',
        'Ordinary material must be a regular local file.',
      );
    }
    bytes = await readFile(materialSelection.local_path);
    probe = await probeMedia(materialSelection.local_path);
    verifiedBytes = await readFile(materialSelection.local_path);
    after = await lstat(materialSelection.local_path);
  } catch (error) {
    if (error instanceof ScriptOnlyV3ContractError) throw error;
    fail(
      'material_fixture_requires_real_media',
      'Ordinary material bytes cannot be read, probed and decoded.',
    );
  }
  if (
    bytes.length < 1
    || !bytes.equals(verifiedBytes)
    || before.size !== bytes.length
    || after.size !== bytes.length
    || before.dev !== after.dev
    || before.ino !== after.ino
    || before.mtimeMs !== after.mtimeMs
  ) {
    fail(
      'material_fixture_changed_during_freeze',
      'Ordinary material changed while its facts were being frozen.',
    );
  }
  return {
    bytes_sha256: createHash('sha256').update(bytes).digest('hex'),
    size_bytes: bytes.length,
    probe,
  };
}

function validateInputShape(input) {
  if (
    input?.prior_contract?.pipeline_contract_version !== undefined
    && input.prior_contract.pipeline_contract_version
      !== PIPELINE_CONTRACT_VERSION
  ) {
    fail(
      'pipeline_upgrade_required',
      'Legacy production artifacts cannot enter the active assets chain.',
    );
  }
  assertNoLegacyActiveFields(input);
  if (
    !input
    || !Object.hasOwn(input, 'director_policy_receipt')
    || input.director_policy_receipt === undefined
    || input.director_policy_receipt === null
  ) {
    fail(
      'assets_director_receipt_required',
      'Assets requires the actual passed director policy receipt.',
    );
  }
  exact(
    input,
    INPUT_FIELDS,
    'assets_chain_input_invalid',
    'Assets chain requires the director contract, canonical artifacts and selections.',
  );
  exact(
    input.canonical_artifacts,
    ARTIFACT_FIELDS,
    'assets_chain_input_invalid',
    'Assets chain requires the complete canonical artifact set.',
  );
  validateProductionContract(input.prior_contract, {
    artifacts: input.canonical_artifacts,
  });
  if (input.prior_contract.contract_phase !== 'director') {
    fail(
      'assets_prior_contract_invalid',
      'Assets must seal the exact director-phase predecessor.',
    );
  }
  const directorReceipt = validateGateReceipt(
    input.director_policy_receipt,
    {
      productionContract: input.prior_contract,
      validationPolicy: input.canonical_artifacts.validationPolicy,
    },
  );
  if (
    directorReceipt.status !== 'passed'
    || directorReceipt.gate !== 'policy-gate'
    || directorReceipt.phase !== 'director'
    || directorReceipt.scope_id !== 'director'
  ) {
    fail(
      'assets_director_receipt_invalid',
      'Assets requires the current passed director policy receipt and scope.',
    );
  }
  if (!Array.isArray(input.selections)) {
    fail('assets_selection_set_invalid', 'Assets selections must be an array.');
  }
}

async function freezeAssetManifest(input) {
  validateInputShape(input);
  const shots = input.canonical_artifacts.shotPlan.shots;
  if (input.selections.length !== shots.length) {
    fail(
      'assets_selection_set_invalid',
      'Every canonical shot must have exactly one ordinary-media selection.',
    );
  }
  const seenShots = new Set();
  const seenAssets = new Set();
  const assets = [];
  for (let index = 0; index < input.selections.length; index += 1) {
    const selection = input.selections[index];
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
      fail('assets_selection_invalid', 'Asset selection has an invalid shape.');
    }
    precheckSelectionBasisStatus(selection.selection_basis);
    if (typeof selection.local_path !== 'string' || !selection.local_path) {
      fail(
        'material_fixture_requires_real_media',
        'A real local ordinary-media file is required.',
      );
    }
    exact(
      selection,
      SELECTION_FIELDS,
      'assets_selection_invalid',
      'Asset selection has an invalid shape.',
    );
    const selectionBasis = normalizeSelectionBasis(selection.selection_basis);
    if (
      selectionBasis.evidence_refs.some((item) => (
        SUBJECTIVE_OR_PRIVATE.test(item)
      ))
    ) {
      fail(
        'material_selection_requires_user_input',
        'Private calibration cannot substitute for ordinary-media selection facts.',
      );
    }
    const expectedShot = shots[index]?.shot_id;
    if (
      !SHOT_ID.test(selection.shot_id ?? '')
      || selection.shot_id !== expectedShot
      || seenShots.has(selection.shot_id)
    ) {
      fail(
        'assets_selection_set_invalid',
        'Asset selections must follow the unique canonical shot order.',
      );
    }
    if (
      !SAFE_ID.test(selection.asset_id ?? '')
      || seenAssets.has(selection.asset_id)
    ) {
      fail('assets_selection_invalid', 'Asset IDs must be unique technical identifiers.');
    }
    if (
      !ROUTES.includes(selection.route)
      || JSON.stringify(selection.route_order) !== JSON.stringify(ROUTE_ORDER)
    ) {
      fail(
        'asset_route_invalid',
        'Ordinary material must use the frozen user, generation, then provider route order.',
      );
    }
    const crop = rectangle(selection.crop, 'crop');
    const safeRegion = rectangle(selection.safe_region, 'safe_region');
    const focalPoint = point(selection.focal_point);
    const rights = normalizeRights(selection.rights);
    const provenance = normalizeProvenance(
      selection.provenance,
      selection.route,
    );
    const titleRelation = normalizeTitleRelation(selection.title_relation);
    const consumer = normalizeConsumer(selection.consumer);
    const facts = await actualMediaFacts(selection);
    const raster = rasterFromProbe(facts.probe);
    if (
      !contains(raster, crop)
      || !contains(crop, safeRegion)
      || !containsPoint(crop, focalPoint)
    ) {
      fail(
        'asset_geometry_invalid',
        'Crop, safe region and focal point must bind the actual media raster.',
      );
    }
    const asset = {
      shot_id: selection.shot_id,
      asset_id: selection.asset_id,
      route: selection.route,
      route_order: [...ROUTE_ORDER],
      selection_basis: selectionBasis,
      bytes_sha256: facts.bytes_sha256,
      size_bytes: facts.size_bytes,
      probe: facts.probe,
      rights,
      provenance,
      crop,
      safe_region: safeRegion,
      focal_point: focalPoint,
      title_relation: titleRelation,
      consumer,
    };
    validateConsumerMediaType(asset.consumer, facts.probe);
    seenShots.add(selection.shot_id);
    seenAssets.add(selection.asset_id);
    assets.push(asset);
  }
  return {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    artifact_kind: 'asset-facts-manifest',
    prior_contract_sha256:
      input.prior_contract.production_contract_sha256,
    director_policy_receipt_sha256:
      input.director_policy_receipt.receipt_sha256,
    shot_plan_sha256:
      input.canonical_artifacts.shotPlan.shot_plan_sha256,
    assets,
  };
}

function contractBindings(contract) {
  return Object.fromEntries(
    CONTRACT_BINDINGS.map((field) => [field, contract[field]]),
  );
}

function parentEnvelope(contract, receipt) {
  return {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    stage: 'assets',
    status: 'passed',
    production_contract_sha256: contract.production_contract_sha256,
    asset_manifest_sha256: contract.asset_manifest_sha256,
    gate_receipts: [receipt],
  };
}

async function freezeAssetsFactsChainInternal(input) {
  const assetManifest = await freezeAssetManifest(input);
  const productionContract = compileProductionContract({
    contract_phase: 'sealed',
    ...input.canonical_artifacts,
    priorContract: input.prior_contract,
    assetManifest,
  });
  const inputBindings = contractBindings(productionContract);
  const validationPolicy = input.canonical_artifacts.validationPolicy;
  const policyReceipt = createGateReceipt({
    gate: 'policy-gate',
    phase: 'sealed',
    scope_id: 'sealed',
    productionContract,
    input_bindings: inputBindings,
    status: 'passed',
    hard_failure_codes: [],
    warning_codes: [],
    metrics: {
      asset_count: assetManifest.assets.length,
      ordinary_primary_count: assetManifest.assets.length,
    },
    cache: {
      status: 'miss',
      cache_key_sha256: fingerprintV3Value({
        scope_id: 'sealed',
        input_bindings: inputBindings,
      }),
    },
    validationPolicy,
  });
  const envelope = parentEnvelope(productionContract, policyReceipt);
  validateContextBudget(envelope, {
    kind: 'stage-envelope',
    policy: validationPolicy.context_budget,
  });
  return {
    asset_manifest: assetManifest,
    parent_envelope: envelope,
    policy_receipt: policyReceipt,
    production_contract: productionContract,
  };
}

export async function freezeAssetsFactsChain(input) {
  return freezeAssetsFactsChainInternal(input);
}

export async function validateAssetsFactsChain(result, input) {
  assertNoLegacyActiveFields(result);
  exact(
    result,
    RESULT_FIELDS,
    'assets_chain_result_invalid',
    'Assets result must contain one manifest, contract, receipt and envelope.',
  );
  validateInputShape(input);
  validateProductionContract(result.production_contract, {
    artifacts: input.canonical_artifacts,
    priorContract: input.prior_contract,
    assetManifest: result.asset_manifest,
  });
  validateGateReceipt(result.policy_receipt, {
    productionContract: result.production_contract,
    validationPolicy: input.canonical_artifacts.validationPolicy,
  });
  const expectedEnvelope = parentEnvelope(
    result.production_contract,
    result.policy_receipt,
  );
  if (
    fingerprintV3Value(result.parent_envelope)
      !== fingerprintV3Value(expectedEnvelope)
  ) {
    fail(
      'assets_chain_result_invalid',
      'Assets parent envelope does not bind the current manifest and receipt.',
    );
  }
  validateContextBudget(result.parent_envelope, {
    kind: 'stage-envelope',
    policy: input.canonical_artifacts.validationPolicy.context_budget,
  });
  const expected = await freezeAssetsFactsChainInternal(input);
  if (fingerprintV3Value(result) !== fingerprintV3Value(expected)) {
    fail(
      'assets_chain_result_invalid',
      'Assets result is not the deterministic current chain output.',
    );
  }
  return {
    status: 'passed',
    asset_count: result.asset_manifest.assets.length,
    production_contract_sha256:
      result.production_contract.production_contract_sha256,
    asset_manifest_sha256:
      result.production_contract.asset_manifest_sha256,
    receipt_sha256: result.policy_receipt.receipt_sha256,
  };
}
