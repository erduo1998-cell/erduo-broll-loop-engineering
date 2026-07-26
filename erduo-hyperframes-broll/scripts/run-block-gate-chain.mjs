import {
  createGateReceipt,
  fingerprintV3Value,
  validateGateReceipt,
} from './validate-production-contract.mjs';
import { createHash } from 'node:crypto';
import {
  lstat,
  readFile,
  realpath,
} from 'node:fs/promises';
import { validateContextBudget } from './validate-context-budget.mjs';
import {
  P3_EVIDENCE_FIELDS,
  validateP3ProductionEvidence,
} from './validate-block-source-gate.mjs';

const BLOCK_ID = /^B[0-9]{3}$/u;
const TECHNICAL_CODE = /^[a-z][a-z0-9_]{2,95}$/u;
const CHAIN_INPUT_FIELDS = Object.freeze([
  ...P3_EVIDENCE_FIELDS,
  'blocks',
]);
const BLOCK_FIELDS = Object.freeze([
  'block_manifest',
  'source_bundle',
  'runtime_sample_plan',
  'pixel_frame_plan',
  'pixel_facts',
]);
const GATE_ORDER = Object.freeze([
  'source-conformance-gate',
  'runtime-seek-gate',
  'pixel-signal-gate',
]);
const OWNED_CACHE_PROVENANCE = new WeakMap();

export class BlockGateChainError extends Error {
  constructor(code, message, failureCodes = []) {
    super(message);
    this.name = 'BlockGateChainError';
    this.code = code;
    this.failure_codes = failureCodes;
  }
}

const fail = (code, message, failureCodes = []) => {
  throw new BlockGateChainError(code, message, failureCodes);
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

function evidenceFrom(input) {
  return Object.fromEntries(
    P3_EVIDENCE_FIELDS.map((field) => [field, input[field]]),
  );
}

function commonGateInput(input) {
  return Object.fromEntries(
    P3_EVIDENCE_FIELDS.map((field) => [field, input[field]]),
  );
}

function validateBlocks(blocks, productionContract) {
  if (!Array.isArray(blocks) || blocks.length < 1 || blocks.length > 256) {
    fail(
      'block_gate_chain_input_invalid',
      'Block chain requires one dynamic non-empty block set.',
    );
  }
  for (const [index, block] of blocks.entries()) {
    exact(
      block,
      BLOCK_FIELDS,
      'block_gate_chain_input_invalid',
      'Each block must use the closed P4 private-input shape.',
    );
    const blockId = `B${String(index + 1).padStart(3, '0')}`;
    if (
      !block.block_manifest
      || block.block_manifest.block_id !== blockId
      || !BLOCK_ID.test(block.block_manifest.block_id ?? '')
      || block.source_bundle?.block_id !== blockId
      || block.block_manifest.production_contract_sha256
        !== productionContract.production_contract_sha256
      || block.block_manifest.source_sha256
        !== block.source_bundle?.source_sha256
      || !Array.isArray(block.runtime_sample_plan)
      || !Array.isArray(block.pixel_frame_plan)
      || !block.pixel_facts
      || typeof block.pixel_facts !== 'object'
      || Array.isArray(block.pixel_facts)
    ) {
      fail(
        'block_gate_chain_input_invalid',
        'Blocks must be the continuous current B001…BN sequence.',
      );
    }
  }
}

function cacheKey(gate, input, block) {
  const stateOrFrame = gate === 'source-conformance-gate'
    ? fingerprintV3Value({
      inspection_schema: 'block-source-structural-v1',
      parser_kinds: ['parse5', 'acorn', 'postcss'],
      hyperframes_version:
        input.validation_policy.tool_bindings.hyperframes_version,
      declared_dependency_set_sha256: fingerprintV3Value({
        materials: block.source_bundle.materials.map((material) => ({
          asset_id: material.asset_id,
          bytes_sha256: material.bytes_sha256,
        })),
        font: {
          family: block.source_bundle.font_package.family,
          bytes_sha256: block.source_bundle.font_package.bytes_sha256,
        },
      }),
    })
    : gate === 'runtime-seek-gate'
      ? block.block_manifest.runtime_sample_plan_sha256
      : fingerprintV3Value({
        pixel_frame_plan_sha256:
          block.block_manifest.pixel_frame_plan_sha256,
        pixel_facts_sha256: fingerprintV3Value(block.pixel_facts),
      });
  return fingerprintV3Value({
    source_sha256: block.source_bundle.source_sha256,
    policy_sha256: input.validation_policy.validation_policy_sha256,
    production_contract_sha256:
      input.production_contract.production_contract_sha256,
    renderer_version:
      input.validation_policy.tool_bindings.renderer_version,
    hyperframes_version:
      input.validation_policy.tool_bindings.hyperframes_version,
    state_or_frame: stateOrFrame,
  });
}

const hashBytes = (value) => createHash('sha256')
  .update(value)
  .digest('hex');

async function currentFileIdentity(localPath) {
  try {
    const stat = await lstat(localPath, { bigint: true });
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail(
        'source_asset_unbound',
        'A source dependency is not a regular non-symlink file.',
        ['source_asset_unbound'],
      );
    }
    const resolved = await realpath(localPath);
    const bytes = await readFile(localPath);
    return {
      bytes_sha256: hashBytes(bytes),
      real_path_sha256: hashBytes(Buffer.from(resolved, 'utf8')),
      device: stat.dev.toString(),
      inode: stat.ino.toString(),
      size: stat.size.toString(),
      mode: stat.mode.toString(),
      modified_ns: stat.mtimeNs.toString(),
      changed_ns: stat.ctimeNs.toString(),
    };
  } catch (error) {
    if (error instanceof BlockGateChainError) throw error;
    fail(
      'source_asset_unbound',
      'A source dependency cannot be identified or reread.',
      ['source_asset_unbound'],
    );
  }
}

async function currentGateProvenance(gate, input, block) {
  const common = {
    gate,
    cache_key_sha256: cacheKey(gate, input, block),
    block_manifest_sha256:
      block.block_manifest.block_manifest_sha256,
    source_sha256: block.source_bundle.source_sha256,
  };
  if (gate === 'source-conformance-gate') {
    const materials = [];
    for (const material of block.source_bundle.materials) {
      materials.push({
        asset_id: material.asset_id,
        file_identity: await currentFileIdentity(material.local_path),
      });
    }
    const fontIdentity = await currentFileIdentity(
      block.source_bundle.font_package.local_path,
    );
    return fingerprintV3Value({
      ...common,
      inspection_schema: 'block-source-structural-v1',
      parser_kinds: ['parse5', 'acorn', 'postcss'],
      source_files: block.source_bundle.files.map((file) => ({
        relative_path: file.relative_path,
        media_type: file.media_type,
        actual_bytes_sha256: hashBytes(
          Buffer.from(file.content, 'utf8'),
        ),
      })),
      actual_dependencies: {
        materials,
        font: {
          family: block.source_bundle.font_package.family,
          file_identity: fontIdentity,
        },
      },
    });
  }
  if (gate === 'pixel-signal-gate') {
    return fingerprintV3Value({
      ...common,
      pixel_frame_plan_sha256:
        block.block_manifest.pixel_frame_plan_sha256,
      pixel_facts_sha256: fingerprintV3Value(block.pixel_facts),
    });
  }
  return fingerprintV3Value({
    ...common,
    runtime_sample_plan_sha256:
      block.block_manifest.runtime_sample_plan_sha256,
  });
}

function ownedCache(cacheStore) {
  let entries = OWNED_CACHE_PROVENANCE.get(cacheStore);
  if (!entries) {
    entries = new Map();
    OWNED_CACHE_PROVENANCE.set(cacheStore, entries);
  }
  return entries;
}

function receiptBindings(gate, input, block, receipts) {
  const contract = input.production_contract;
  const common = {
    production_contract_sha256: contract.production_contract_sha256,
    shot_plan_sha256: contract.shot_plan_sha256,
    validation_policy_sha256: contract.validation_policy_sha256,
    font_package_sha256: contract.font_package_sha256,
    projection_sha256: contract.projection_sha256,
    asset_manifest_sha256: contract.asset_manifest_sha256,
    block_manifest_sha256:
      block.block_manifest.block_manifest_sha256,
    source_sha256: block.source_bundle.source_sha256,
  };
  if (gate === 'source-conformance-gate') {
    return {
      production_contract_sha256: contract.production_contract_sha256,
      shot_plan_sha256: contract.shot_plan_sha256,
      design_system_sha256: contract.design_system_sha256,
      component_registry_sha256:
        contract.component_registry_sha256,
      validation_policy_sha256: contract.validation_policy_sha256,
      reference_style_profile_sha256:
        contract.reference_style_profile_sha256,
      font_package_sha256: contract.font_package_sha256,
      projection_sha256: contract.projection_sha256,
      asset_manifest_sha256: contract.asset_manifest_sha256,
      block_manifest_sha256:
        block.block_manifest.block_manifest_sha256,
      source_sha256: block.source_bundle.source_sha256,
    };
  }
  if (gate === 'runtime-seek-gate') {
    return {
      ...common,
      source_conformance_receipt_sha256:
        receipts.source.receipt_sha256,
    };
  }
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
      block.block_manifest.block_manifest_sha256,
    source_sha256: block.source_bundle.source_sha256,
    source_conformance_receipt_sha256:
      receipts.source.receipt_sha256,
    runtime_seek_receipt_sha256:
      receipts.runtime.receipt_sha256,
  };
}

function gateInput(gate, input, block, receipts) {
  const common = commonGateInput(input);
  if (gate === 'source-conformance-gate') {
    return {
      ...common,
      block_manifest: block.block_manifest,
      source_bundle: block.source_bundle,
    };
  }
  if (gate === 'runtime-seek-gate') {
    return {
      ...common,
      block_manifest: block.block_manifest,
      source_bundle: block.source_bundle,
      source_conformance_receipt: receipts.source,
    };
  }
  return {
    ...common,
    block_manifest: block.block_manifest,
    source_bundle: block.source_bundle,
    source_conformance_receipt: receipts.source,
    runtime_seek_receipt: receipts.runtime,
    pixel_facts: block.pixel_facts,
  };
}

function receiptSlot(gate) {
  return gate === 'source-conformance-gate'
    ? 'source'
    : gate === 'runtime-seek-gate'
      ? 'runtime'
      : 'pixel';
}

function validateCurrentReceipt(
  receipt,
  gate,
  input,
  block,
  receipts,
  expectedCacheKey,
  { requireMiss = false } = {},
) {
  validateGateReceipt(receipt, {
    productionContract: input.production_contract,
    validationPolicy: input.validation_policy,
  });
  const expectedBindings = receiptBindings(
    gate,
    input,
    block,
    receipts,
  );
  if (
    receipt.gate !== gate
    || receipt.phase !== 'block'
    || receipt.scope_id !== block.block_manifest.block_id
    || receipt.status !== 'passed'
    || receipt.hard_failure_codes.length !== 0
    || receipt.cache.cache_key_sha256 !== expectedCacheKey
    || (
      requireMiss
      && receipt.cache.status !== 'miss'
    )
    || receipt.input_bindings.block_manifest_sha256
      !== block.block_manifest.block_manifest_sha256
    || receipt.input_bindings.source_sha256
      !== block.source_bundle.source_sha256
    || fingerprintV3Value(receipt.input_bindings)
      !== fingerprintV3Value(expectedBindings)
  ) {
    fail(
      'block_gate_receipt_invalid',
      'A block gate receipt is stale, failed or bound to another block.',
    );
  }
  return receipt;
}

function receiptFromCache(
  cached,
  gate,
  input,
  block,
  receipts,
  expectedCacheKey,
) {
  if (
    !cached
    || typeof cached !== 'object'
    || Array.isArray(cached)
    || cached.gate !== gate
    || cached.phase !== 'block'
    || cached.scope_id !== block.block_manifest.block_id
    || cached.status !== 'passed'
    || cached.input_bindings?.block_manifest_sha256
      !== block.block_manifest.block_manifest_sha256
    || cached.input_bindings?.source_sha256
      !== block.source_bundle.source_sha256
    || cached.cache?.cache_key_sha256 !== expectedCacheKey
  ) return null;
  try {
    validateGateReceipt(cached, {
      productionContract: input.production_contract,
      validationPolicy: input.validation_policy,
    });
  } catch {
    return null;
  }
  return createGateReceipt({
    gate,
    phase: 'block',
    scope_id: block.block_manifest.block_id,
    productionContract: input.production_contract,
    input_bindings: receiptBindings(
      gate,
      input,
      block,
      receipts,
    ),
    status: 'passed',
    hard_failure_codes: [],
    warning_codes: [...cached.warning_codes],
    metrics: structuredClone(cached.metrics),
    cache: {
      status: 'hit',
      cache_key_sha256: expectedCacheKey,
    },
    validationPolicy: input.validation_policy,
  });
}

async function runGate(
  gate,
  input,
  block,
  receipts,
  gateRunner,
  cacheStore,
) {
  const expectedCacheKey = cacheKey(gate, input, block);
  const storageKey = `${gate}:${expectedCacheKey}`;
  const provenance = await currentGateProvenance(
    gate,
    input,
    block,
  );
  const ownedEntries = ownedCache(cacheStore);
  const ownedEntry = ownedEntries.get(storageKey);
  const cached = (
    ownedEntry?.provenance === provenance
    && ownedEntry?.receipt_sha256
      === ownedEntry?.receipt?.receipt_sha256
  )
    ? ownedEntry.receipt
    : null;
  const hit = receiptFromCache(
    cached,
    gate,
    input,
    block,
    receipts,
    expectedCacheKey,
  );
  if (hit) {
    return validateCurrentReceipt(
      hit,
      gate,
      input,
      block,
      receipts,
      expectedCacheKey,
    );
  }
  const receipt = await gateRunner(
    gateInput(gate, input, block, receipts),
  );
  validateCurrentReceipt(
    receipt,
    gate,
    input,
    block,
    receipts,
    expectedCacheKey,
    { requireMiss: true },
  );
  await cacheStore.set(storageKey, receipt);
  ownedEntries.set(storageKey, {
    provenance,
    receipt_sha256: receipt.receipt_sha256,
    receipt: structuredClone(receipt),
  });
  return receipt;
}

function boundedFailureCodes(error, validationPolicy, gate) {
  const candidates = Array.isArray(error?.failure_codes)
    ? error.failure_codes
    : [error?.code];
  const registered = new Set(
    validationPolicy.gate_policies[gate]?.hard_failure_codes ?? [],
  );
  const result = [];
  for (const candidate of candidates) {
    if (
      typeof candidate === 'string'
      && TECHNICAL_CODE.test(candidate)
      && registered.has(candidate)
      && !result.includes(candidate)
    ) result.push(candidate);
    if (result.length === 8) break;
  }
  return result;
}

async function runBlockAttempt(
  input,
  block,
  gateRunners,
  cacheStore,
) {
  const receipts = {};
  for (const gate of GATE_ORDER) {
    const slot = receiptSlot(gate);
    const runner = gateRunners[slot];
    try {
      receipts[slot] = await runGate(
        gate,
        input,
        block,
        receipts,
        runner,
        cacheStore,
      );
    } catch (error) {
      Object.defineProperty(error, 'gate', {
        value: gate,
        enumerable: false,
        configurable: true,
      });
      throw error;
    }
  }
  return GATE_ORDER.map((gate) => receipts[receiptSlot(gate)]);
}

function validateOptions(options) {
  exact(
    options,
    ['gateRunners', 'cacheStore', 'replaceBlock'],
    'block_gate_chain_options_invalid',
    'Block chain requires gate runners, cache store and one replacement hook.',
  );
  exact(
    options.gateRunners,
    ['source', 'runtime', 'pixel'],
    'block_gate_chain_options_invalid',
    'Block chain requires exactly three gate runners.',
  );
  if (
    Object.values(options.gateRunners).some(
      (runner) => typeof runner !== 'function',
    )
    || typeof options.cacheStore?.get !== 'function'
    || typeof options.cacheStore?.set !== 'function'
    || typeof options.replaceBlock !== 'function'
  ) {
    fail(
      'block_gate_chain_options_invalid',
      'Block chain runtime hooks are invalid.',
    );
  }
}

async function runOneBlock(input, initialBlock, options) {
  let block = initialBlock;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const gateReceipts = await runBlockAttempt(
        input,
        block,
        options.gateRunners,
        options.cacheStore,
      );
      return {
        block_id: block.block_manifest.block_id,
        attempt,
        gate_receipts: gateReceipts,
      };
    } catch (error) {
      const failureCodes = boundedFailureCodes(
        error,
        input.validation_policy,
        error?.gate,
      );
      if (failureCodes.length === 0) {
        fail(
          'block_gate_failure_code_invalid',
          'A gate emitted a failure code outside the current policy registry.',
          [],
        );
      }
      if (attempt === 2) {
        fail(
          'block_gate_retry_exhausted',
          'One block exhausted its single aggregate retry.',
          failureCodes,
        );
      }
      let replacement;
      try {
        replacement = await options.replaceBlock({
          block,
          attempt: 2,
          failure_codes: failureCodes,
        });
      } catch (replacementError) {
        fail(
          'block_gate_retry_exhausted',
          'Block replacement failed during its single retry.',
          boundedFailureCodes(
            replacementError,
            input.validation_policy,
            error?.gate,
          ),
        );
      }
      if (
        !replacement
        || typeof replacement !== 'object'
        || Array.isArray(replacement)
        || replacement.block_manifest?.block_id
          !== block.block_manifest.block_id
      ) {
        fail(
          'block_gate_retry_exhausted',
          'Block replacement changed block identity.',
          ['block_replacement_invalid'],
        );
      }
      block = replacement;
    }
  }
  fail(
    'block_gate_retry_exhausted',
    'Block retry state is invalid.',
    ['block_retry_state_invalid'],
  );
}

export async function runBlockGateChain(input, options = {}) {
  exact(
    input,
    CHAIN_INPUT_FIELDS,
    'block_gate_chain_input_invalid',
    'Block gate chain input must contain exact P3 evidence and blocks.',
  );
  validateP3ProductionEvidence(evidenceFrom(input));
  validateBlocks(input.blocks, input.production_contract);
  validateOptions(options);
  const blocks = await Promise.all(
    input.blocks.map(
      (block) => runOneBlock(input, block, options),
    ),
  );
  const result = {
    status: 'passed',
    block_count: blocks.length,
    blocks,
  };
  validateContextBudget(result, {
    kind: 'stage-envelope',
    policy: input.validation_policy.context_budget,
  });
  return result;
}
