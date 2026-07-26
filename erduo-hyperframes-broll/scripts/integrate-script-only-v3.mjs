import { createHash } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import {
  AUTHORING_TOPOLOGY_ID,
  PIPELINE_CONTRACT_VERSION,
  VALIDATION_POLICY_ID,
  createGateReceipt,
  fingerprintV3Value,
  validateGateReceipt,
  validateV3ShotPlan,
  validateValidationPolicy,
} from './validate-production-contract.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const BLOCK_ID = /^B[0-9]{3}$/u;
const ALLOWED_MEDIA_TYPES = new Set([
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
  'application/json',
]);
const GATE_ORDER = [
  'source-conformance-gate',
  'runtime-seek-gate',
  'pixel-signal-gate',
];

export class ScriptOnlyIntegrationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ScriptOnlyIntegrationError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new ScriptOnlyIntegrationError(code, message);
};

const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hashText = (text) => hashBytes(Buffer.from(text, 'utf8'));

function exact(value, fields, code, message) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...fields].sort())
  ) fail(code, message);
}

function safeRelative(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath) {
    fail('integration_source_path_invalid', 'Block source path is invalid.');
  }
  const normalized = path.posix.normalize(relativePath);
  if (
    normalized !== relativePath
    || path.posix.isAbsolute(normalized)
    || normalized === '..'
    || normalized.startsWith('../')
    || normalized.includes('/../')
  ) fail('integration_source_path_invalid', 'Block source path escapes its block root.');
  return normalized;
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

function validateSourceBundle(block) {
  const { source_bundle: sourceBundle, block_manifest: manifest } = block;
  if (
    !sourceBundle
    || sourceBundle.schema_version !== 1
    || sourceBundle.block_id !== manifest.block_id
    || !Array.isArray(sourceBundle.files)
    || sourceBundle.files.length < 1
    || !Array.isArray(sourceBundle.materials)
    || !sourceBundle.font_package
    || !SHA256.test(sourceBundle.source_sha256 ?? '')
  ) fail('integration_source_bundle_invalid', 'Block source bundle is invalid.');

  const paths = new Set();
  const files = sourceBundle.files.map((file) => {
    exact(
      file,
      ['relative_path', 'media_type', 'content', 'bytes_sha256'],
      'integration_source_bundle_invalid',
      'Block source file shape is invalid.',
    );
    const relativePath = safeRelative(file.relative_path);
    if (
      paths.has(relativePath)
      || !ALLOWED_MEDIA_TYPES.has(file.media_type)
      || typeof file.content !== 'string'
    ) fail('integration_source_bundle_invalid', 'Block source file is invalid.');
    const bytes = Buffer.from(file.content, 'utf8');
    if (!bytes.length || hashBytes(bytes) !== file.bytes_sha256) {
      fail('block_source_changed', 'Current block source bytes differ from the validated hash.');
    }
    paths.add(relativePath);
    return {
      relative_path: relativePath,
      media_type: file.media_type,
      bytes,
      bytes_sha256: file.bytes_sha256,
      size_bytes: bytes.length,
    };
  });
  if (!paths.has('index.html') || !paths.has('styles.css') || !paths.has('block.js')) {
    fail('integration_source_bundle_invalid', 'Block source entry set is incomplete.');
  }
  if (fingerprintV3Value(sourceBundleCore(sourceBundle)) !== sourceBundle.source_sha256) {
    fail('block_source_changed', 'Current block source bundle differs from its validated identity.');
  }
  return files;
}

function validateManifest(block, productionContract) {
  const manifest = block.block_manifest;
  if (
    !manifest
    || manifest.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || !BLOCK_ID.test(manifest.block_id ?? '')
    || manifest.production_contract_sha256
      !== productionContract.production_contract_sha256
    || manifest.source_sha256 !== block.source_bundle?.source_sha256
    || !SHA256.test(manifest.block_manifest_sha256 ?? '')
    || !Array.isArray(manifest.shot_ids)
    || manifest.shot_ids.length < 1
    || !Number.isSafeInteger(manifest.start_frame)
    || !Number.isSafeInteger(manifest.end_frame)
    || manifest.end_frame <= manifest.start_frame
  ) fail('integration_block_manifest_invalid', 'Block manifest is invalid.');
  const core = { ...manifest };
  delete core.block_manifest_sha256;
  if (fingerprintV3Value(core) !== manifest.block_manifest_sha256) {
    fail('integration_block_manifest_invalid', 'Block manifest self-hash is invalid.');
  }
}

function validateBlockReceipts(record, block, productionContract, validationPolicy) {
  if (
    !record
    || record.block_id !== block.block_manifest.block_id
    || !Array.isArray(record.gate_receipts)
    || record.gate_receipts.length !== GATE_ORDER.length
  ) fail('integration_block_receipt_invalid', 'Block gate receipt set is invalid.');
  for (const [index, receipt] of record.gate_receipts.entries()) {
    validateGateReceipt(receipt, { productionContract, validationPolicy });
    if (
      receipt.gate !== GATE_ORDER[index]
      || receipt.phase !== 'block'
      || receipt.scope_id !== record.block_id
      || receipt.status !== 'passed'
      || receipt.hard_failure_codes.length
      || receipt.input_bindings.block_manifest_sha256
        !== block.block_manifest.block_manifest_sha256
      || receipt.input_bindings.source_sha256
        !== block.source_bundle.source_sha256
    ) fail('integration_block_receipt_invalid', 'Block receipt is stale, failed or reordered.');
  }
  if (
    record.gate_receipts[1].input_bindings.source_conformance_receipt_sha256
      !== record.gate_receipts[0].receipt_sha256
    || record.gate_receipts[2].input_bindings.source_conformance_receipt_sha256
      !== record.gate_receipts[0].receipt_sha256
    || record.gate_receipts[2].input_bindings.runtime_seek_receipt_sha256
      !== record.gate_receipts[1].receipt_sha256
  ) fail('integration_block_receipt_invalid', 'Block gate receipt lineage is broken.');
}

function validateCoverage(blocks, shotPlan) {
  const expectedShotIds = shotPlan.shots.map((shot) => shot.shot_id);
  const actualShotIds = blocks.flatMap((block) => block.block_manifest.shot_ids);
  if (JSON.stringify(actualShotIds) !== JSON.stringify(expectedShotIds)) {
    fail('integration_shot_coverage_invalid', 'Blocks do not cover the ordered shot plan exactly once.');
  }
  const namespaces = new Set();
  for (const [index, block] of blocks.entries()) {
    const expectedId = `B${String(index + 1).padStart(3, '0')}`;
    const manifest = block.block_manifest;
    if (
      manifest.block_id !== expectedId
      || typeof manifest.namespace !== 'string'
      || !manifest.namespace
      || namespaces.has(manifest.namespace)
      || index === 0 && manifest.start_frame !== 0
      || index > 0 && manifest.start_frame !== blocks[index - 1].block_manifest.end_frame
    ) fail('integration_order_or_seam_invalid', 'Block order, namespace or frame seam is invalid.');
    namespaces.add(manifest.namespace);
  }
}

function orderedReceiptSet(blockReceipts) {
  return blockReceipts.map((block) => ({
    block_id: block.block_id,
    source_conformance_receipt_sha256: block.gate_receipts[0].receipt_sha256,
    runtime_seek_receipt_sha256: block.gate_receipts[1].receipt_sha256,
    pixel_signal_receipt_sha256: block.gate_receipts[2].receipt_sha256,
  }));
}

function wrapperHtml(map) {
  const frames = map.blocks.map((block) => (
    `<iframe data-block-id="${block.block_id}" data-start-frame="${block.start_frame}" `
    + `data-end-frame="${block.end_frame}" src="${block.entry_source}"></iframe>`
  )).join('');
  return '<!doctype html><html><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}'
    + 'iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head>'
    + `<body data-integration-map-sha256="${map.map_sha256}">${frames}</body></html>`;
}

async function requireFreshOutputRoot(outputRoot) {
  if (typeof outputRoot !== 'string' || !path.isAbsolute(outputRoot)) {
    fail('integration_output_root_invalid', 'Integration output root must be an absolute private path.');
  }
  try {
    await lstat(outputRoot);
    fail('integration_output_occupied', 'Integration output root must not already exist.');
  } catch (error) {
    if (error instanceof ScriptOnlyIntegrationError) throw error;
    if (error?.code !== 'ENOENT') {
      fail('integration_output_root_invalid', 'Integration output root cannot be inspected.');
    }
  }
  await mkdir(outputRoot, { recursive: true });
}

async function writeAndReopenBlock(outputRoot, block, files) {
  const blockRoot = path.join(outputRoot, 'blocks', block.block_manifest.block_id);
  const proofs = [];
  for (const file of files) {
    const destination = path.join(blockRoot, ...file.relative_path.split('/'));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.bytes, { flag: 'wx' });
    const reopened = await readFile(destination);
    const afterHash = hashBytes(reopened);
    if (!reopened.equals(file.bytes) || afterHash !== file.bytes_sha256) {
      fail('integrator_rewrite_detected', 'Integrator changed validated block source bytes.');
    }
    proofs.push({
      relative_path: file.relative_path,
      media_type: file.media_type,
      size_bytes: reopened.length,
      before_sha256: file.bytes_sha256,
      after_sha256: afterHash,
    });
  }
  return proofs;
}

function integrationBindings({
  productionContract,
  orderedBlockReceiptSetSha256,
  masterWrapperSha256,
  integrationManifestSha256,
  noRewriteProofSha256,
  integratedSourceSha256,
  rendererVersionSha256,
  hyperframesVersionSha256,
}) {
  return {
    production_contract_sha256: productionContract.production_contract_sha256,
    parsed_srt_sha256: productionContract.parsed_srt_sha256,
    shot_plan_sha256: productionContract.shot_plan_sha256,
    design_system_sha256: productionContract.design_system_sha256,
    component_registry_sha256: productionContract.component_registry_sha256,
    validation_policy_sha256: productionContract.validation_policy_sha256,
    reference_style_profile_sha256: productionContract.reference_style_profile_sha256,
    font_package_sha256: productionContract.font_package_sha256,
    projection_sha256: productionContract.projection_sha256,
    delivery_profile_sha256: productionContract.delivery_profile_sha256,
    prior_contract_sha256: productionContract.prior_contract_sha256,
    asset_manifest_sha256: productionContract.asset_manifest_sha256,
    ordered_block_receipt_set_sha256: orderedBlockReceiptSetSha256,
    master_wrapper_sha256: masterWrapperSha256,
    integration_manifest_sha256: integrationManifestSha256,
    no_rewrite_proof_sha256: noRewriteProofSha256,
    integrated_source_sha256: integratedSourceSha256,
    renderer_version_sha256: rendererVersionSha256,
    hyperframes_version_sha256: hyperframesVersionSha256,
  };
}

export async function verifyIntegratedMaster({
  output_root,
  integration_manifest,
  no_rewrite_proof,
}) {
  const wrapperBytes = await readFile(path.join(output_root, 'index.html'));
  const mapBytes = await readFile(path.join(output_root, 'integration-map.json'));
  if (
    hashBytes(wrapperBytes) !== integration_manifest.master_wrapper_sha256
    || hashBytes(mapBytes) !== integration_manifest.integration_map_sha256
  ) fail('integrated_source_changed', 'Master wrapper or ordered map changed after integration.');
  const map = JSON.parse(mapBytes.toString('utf8'));
  if (map.map_sha256 !== fingerprintV3Value({
    schema_version: map.schema_version,
    ordered_block_ids: map.ordered_block_ids,
    blocks: map.blocks,
  })) fail('integrated_source_changed', 'Ordered integration map self-hash is invalid.');

  for (const block of no_rewrite_proof.blocks) {
    for (const file of block.files) {
      const bytes = await readFile(path.join(
        output_root,
        'blocks',
        block.block_id,
        ...file.relative_path.split('/'),
      ));
      if (
        bytes.length !== file.size_bytes
        || hashBytes(bytes) !== file.before_sha256
        || file.before_sha256 !== file.after_sha256
      ) fail('integrator_rewrite_detected', 'Integrated block bytes no longer match validated input.');
    }
  }
  const integratedCore = {
    master_wrapper_sha256: integration_manifest.master_wrapper_sha256,
    integration_map_sha256: integration_manifest.integration_map_sha256,
    ordered_blocks: no_rewrite_proof.blocks.map((block) => ({
      block_id: block.block_id,
      source_sha256: block.source_sha256,
      files: block.files.map((file) => ({
        relative_path: file.relative_path,
        bytes_sha256: file.after_sha256,
      })),
    })),
  };
  if (fingerprintV3Value(integratedCore) !== integration_manifest.integrated_source_sha256) {
    fail('integrated_source_changed', 'Integrated source identity no longer matches current bytes.');
  }
  return {
    status: 'passed',
    integrated_source_sha256: integration_manifest.integrated_source_sha256,
    block_count: no_rewrite_proof.blocks.length,
  };
}

export async function integrateScriptOnlyV3({
  production_contract: productionContract,
  validation_policy: validationPolicy,
  shot_plan: shotPlan,
  blocks,
  block_receipts: blockReceipts,
  output_root: outputRoot,
  renderer_version: rendererVersion,
  hyperframes_version: hyperframesVersion,
}) {
  validateValidationPolicy(validationPolicy);
  if (productionContract?.contract_phase !== 'sealed') {
    fail('integration_contract_unsealed', 'Integration requires the sealed v3 production contract.');
  }
  validateV3ShotPlan(shotPlan, validationPolicy);
  if (shotPlan.shot_plan_sha256 !== productionContract.shot_plan_sha256) {
    fail('integration_shot_plan_unbound', 'Integration shot plan differs from the sealed contract.');
  }
  if (
    !Array.isArray(blocks)
    || blocks.length < 1
    || blocks.length > 256
    || !Array.isArray(blockReceipts)
    || blockReceipts.length !== blocks.length
    || typeof rendererVersion !== 'string'
    || !rendererVersion
    || typeof hyperframesVersion !== 'string'
    || !hyperframesVersion
  ) fail('integration_input_invalid', 'Integration input is invalid.');

  const validatedFiles = [];
  for (const [index, block] of blocks.entries()) {
    validateManifest(block, productionContract);
    validatedFiles.push(validateSourceBundle(block));
    validateBlockReceipts(
      blockReceipts[index],
      block,
      productionContract,
      validationPolicy,
    );
  }
  validateCoverage(blocks, shotPlan);
  await requireFreshOutputRoot(outputRoot);

  const proofBlocks = [];
  for (const [index, block] of blocks.entries()) {
    proofBlocks.push({
      block_id: block.block_manifest.block_id,
      source_sha256: block.source_bundle.source_sha256,
      block_manifest_sha256: block.block_manifest.block_manifest_sha256,
      files: await writeAndReopenBlock(outputRoot, block, validatedFiles[index]),
    });
  }

  const mapCore = {
    schema_version: 1,
    ordered_block_ids: blocks.map((block) => block.block_manifest.block_id),
    blocks: blocks.map((block) => ({
      block_id: block.block_manifest.block_id,
      namespace: block.block_manifest.namespace,
      start_frame: block.block_manifest.start_frame,
      end_frame: block.block_manifest.end_frame,
      shot_ids: block.block_manifest.shot_ids,
      entry_source: `blocks/${block.block_manifest.block_id}/index.html`,
      source_sha256: block.source_bundle.source_sha256,
      block_manifest_sha256: block.block_manifest.block_manifest_sha256,
    })),
  };
  const map = { ...mapCore, map_sha256: fingerprintV3Value(mapCore) };
  const mapText = `${JSON.stringify(map)}\n`;
  const wrapper = wrapperHtml(map);
  await writeFile(path.join(outputRoot, 'integration-map.json'), mapText, { flag: 'wx' });
  await writeFile(path.join(outputRoot, 'index.html'), wrapper, { flag: 'wx' });

  const integratedCore = {
    master_wrapper_sha256: hashText(wrapper),
    integration_map_sha256: hashText(mapText),
    ordered_blocks: proofBlocks.map((block) => ({
      block_id: block.block_id,
      source_sha256: block.source_sha256,
      files: block.files.map((file) => ({
        relative_path: file.relative_path,
        bytes_sha256: file.after_sha256,
      })),
    })),
  };
  const integratedSourceSha256 = fingerprintV3Value(integratedCore);
  const orderedSetSha256 = fingerprintV3Value(orderedReceiptSet(blockReceipts));
  const rendererVersionSha256 = fingerprintV3Value(rendererVersion);
  const hyperframesVersionSha256 = fingerprintV3Value(hyperframesVersion);
  const manifestCore = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    production_contract_sha256: productionContract.production_contract_sha256,
    ordered_block_ids: map.ordered_block_ids,
    total_frames: blocks.at(-1).block_manifest.end_frame,
    fps: structuredClone(shotPlan.fps),
    duration_ms: Math.round(
      blocks.at(-1).block_manifest.end_frame
        * 1000
        * shotPlan.fps.denominator
        / shotPlan.fps.numerator,
    ),
    ordered_block_receipt_set_sha256: orderedSetSha256,
    master_wrapper_sha256: integratedCore.master_wrapper_sha256,
    integration_map_sha256: integratedCore.integration_map_sha256,
    integrated_source_sha256: integratedSourceSha256,
    renderer_version_sha256: rendererVersionSha256,
    hyperframes_version_sha256: hyperframesVersionSha256,
    ledger_bindings: {
      chapter_promise_payoff_sha256:
        fingerprintV3Value(shotPlan.chapter_promise_payoff_ledger),
      motif_callback_sha256: fingerprintV3Value(shotPlan.motif_callback_ledger),
      emphasis_sha256: fingerprintV3Value(shotPlan.emphasis_ledger),
      density_sha256: fingerprintV3Value(shotPlan.density_curve),
      time_truth_sha256: fingerprintV3Value(shotPlan.shots.map((shot) => ({
        shot_id: shot.shot_id,
        start_ms: shot.start_ms,
        end_ms: shot.end_ms,
      }))),
    },
  };
  const integrationManifest = {
    ...manifestCore,
    integration_manifest_sha256: fingerprintV3Value(manifestCore),
  };
  const noRewriteCore = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    status: 'passed',
    ordered_block_ids: map.ordered_block_ids,
    blocks: proofBlocks,
    integrated_source_sha256: integratedSourceSha256,
  };
  const noRewriteProof = {
    ...noRewriteCore,
    no_rewrite_proof_sha256: fingerprintV3Value(noRewriteCore),
  };
  const integrationReceipt = createGateReceipt({
    gate: 'integration-delivery-gate',
    phase: 'integration',
    scope_id: 'integration',
    productionContract,
    input_bindings: integrationBindings({
      productionContract,
      orderedBlockReceiptSetSha256: orderedSetSha256,
      masterWrapperSha256: integrationManifest.master_wrapper_sha256,
      integrationManifestSha256: integrationManifest.integration_manifest_sha256,
      noRewriteProofSha256: noRewriteProof.no_rewrite_proof_sha256,
      integratedSourceSha256,
      rendererVersionSha256,
      hyperframesVersionSha256,
    }),
    status: 'passed',
    hard_failure_codes: [],
    warning_codes: [],
    metrics: {
      block_count: blocks.length,
      shot_count: shotPlan.shots.length,
      source_file_count: proofBlocks.reduce((sum, block) => sum + block.files.length, 0),
      chapter_count: shotPlan.chapters.length,
      callback_count: shotPlan.motif_callback_ledger.length,
      emphasis_count: shotPlan.emphasis_ledger.length,
    },
    cache: {
      status: 'miss',
      cache_key_sha256: fingerprintV3Value({
        integrated_source_sha256: integratedSourceSha256,
        validation_policy_sha256: validationPolicy.validation_policy_sha256,
        renderer_version_sha256: rendererVersionSha256,
        hyperframes_version_sha256: hyperframesVersionSha256,
      }),
    },
    validationPolicy,
  });
  await verifyIntegratedMaster({
    output_root: outputRoot,
    integration_manifest: integrationManifest,
    no_rewrite_proof: noRewriteProof,
  });
  return {
    integration_manifest: integrationManifest,
    no_rewrite_proof: noRewriteProof,
    integration_receipt: integrationReceipt,
  };
}
