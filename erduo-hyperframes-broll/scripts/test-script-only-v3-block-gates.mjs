import assert from 'node:assert/strict';
import {
  copyFile,
  lstat,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  PIXEL_FAILURE_CASES,
  RUNTIME_FAILURE_CASES,
  SOURCE_FAILURE_CASES,
  blockGateChainInput,
  blockGateCacheKey,
  createBlockGateFixture,
  createMemoryCacheStore,
  createRuntimeProbe,
  createSyntheticBlockReceipt,
  createSyntheticReceiptChain,
  hashOnlyCanonicalArtifacts,
  mutatePixelFacts,
  mutateSourceBlock,
  pixelGateInput,
  rehashBlock,
  runtimeGateInput,
  sourceGateInput,
} from './test-support-script-only-v3-block-gates.mjs';
import {
  ALIAS_SOURCE_FAILURE_CASES,
  HYPERFRAMES_CHECK_FIELDS,
  INSPECTION_EVIDENCE_FIELDS,
  PARSER_EVIDENCE_FIELDS,
  PARSER_RECORD_FIELDS,
  STRUCTURAL_FACT_FIELDS,
  TERMINAL_RUNTIME_FAILURE_CASES,
  TERMINAL_SOURCE_FAILURE_CASES,
  createSourceInspectionEvidence,
  createTerminalRuntimeProbe,
  mutateTerminalSourceBlock,
  recomputePixelGeometrySignature,
  runActualBlockHyperframesCheck,
  runLocalHyperframesFixtureCheck,
} from './test-support-script-only-v3-block-gates-terminal.mjs';
import {
  fingerprintV3Value,
  validateGateReceipt,
  validateProductionContract,
  validateValidationPolicy,
} from './validate-production-contract.mjs';
import { validateContextBudget } from './validate-context-budget.mjs';

const SOURCE_MODULE = './validate-block-source-gate.mjs';
const INSPECTOR_MODULE = './inspect-block-source.mjs';
const RUNTIME_MODULE = './validate-block-runtime-gate.mjs';
const PIXEL_MODULE = './validate-block-pixel-gate.mjs';
const CHAIN_MODULE = './run-block-gate-chain.mjs';
const GATE_MODULES = [
  SOURCE_MODULE,
  RUNTIME_MODULE,
  PIXEL_MODULE,
  CHAIN_MODULE,
];
const SEEK_PATHS = [
  'fresh_direct',
  'zero_to_t',
  'end_to_t',
  'repeat_to_t',
];
const FORBIDDEN_ACTIVE_IMPORTS = [
  'validate-director-v2-chain',
  'validate-assets-v2-chain',
  'validate-master-build-v2-chain',
  'validate-main-review-packets',
  'validate-style-conformance-review',
  'visual-preflight-pixels',
  'measure-style-pixel-facts',
  'style_conformance_review',
  'source_code_review',
  'main_review_refs',
];
const CANONICAL_ARTIFACT_FIELDS = [
  'parsedSrt',
  'shotPlan',
  'designSystem',
  'componentRegistry',
  'validationPolicy',
  'referenceStyleProfile',
  'fontPackage',
  'projection',
  'deliveryProfile',
];
const P3_EVIDENCE_INPUT_FIELDS = [
  'prior_contract',
  'director_policy_receipt',
  'canonical_artifacts',
  'asset_manifest',
  'sealed_policy_receipt',
  'production_contract',
  'validation_policy',
];
const SOURCE_INPUT_FIELDS = [
  ...P3_EVIDENCE_INPUT_FIELDS,
  'block_manifest',
  'source_bundle',
];
const RUNTIME_INPUT_FIELDS = [
  ...SOURCE_INPUT_FIELDS,
  'source_conformance_receipt',
];
const PIXEL_INPUT_FIELDS = [
  ...RUNTIME_INPUT_FIELDS,
  'runtime_seek_receipt',
  'pixel_facts',
];
const CHAIN_INPUT_FIELDS = [
  ...P3_EVIDENCE_INPUT_FIELDS,
  'blocks',
];

let fixtureRoot;
let faceless;
let talkingHead;

test.before(async () => {
  fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'erduo-v3-p4-gates-'));
  faceless = await createBlockGateFixture({
    root: path.join(fixtureRoot, 'faceless'),
    mode: 'faceless',
    blockCount: 5,
  });
  talkingHead = await createBlockGateFixture({
    root: path.join(fixtureRoot, 'talking-head'),
    mode: 'talking-head',
    blockCount: 2,
  });
});

test.after(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

async function loadModule(specifier, exports) {
  let module;
  try {
    module = await import(specifier);
  } catch (error) {
    assert.fail(
      `P4 active module ${specifier} is required: ${error.code ?? error.message}`,
    );
  }
  for (const name of exports) {
    assert.equal(
      typeof module[name],
      'function',
      `${specifier} must export ${name}`,
    );
  }
  return module;
}

const loadSource = () => loadModule(
  SOURCE_MODULE,
  ['validateBlockSourceGate'],
);
const loadRuntime = () => loadModule(
  RUNTIME_MODULE,
  ['validateBlockRuntimeGate'],
);
const loadPixel = () => loadModule(
  PIXEL_MODULE,
  ['validateBlockPixelGate'],
);
const loadChain = () => loadModule(
  CHAIN_MODULE,
  ['runBlockGateChain'],
);

function expectCode(action, code) {
  return assert.rejects(
    action,
    (error) => error?.code === code,
  );
}

function assertExactKeys(value, fields, label) {
  assert.deepEqual(
    Object.keys(value).sort(),
    [...fields].sort(),
    `${label} must use the closed actual-evidence input shape`,
  );
}

function rehashSelfDocument(document, field) {
  const core = structuredClone(document);
  delete core[field];
  return {
    ...core,
    [field]: fingerprintV3Value(core),
  };
}

function assertPassedReceipt(receipt, gate, fixture, block) {
  assert.deepEqual(
    validateGateReceipt(receipt, {
      productionContract: fixture.productionContract,
      validationPolicy: fixture.validationPolicy,
    }),
    {
      status: 'passed',
      gate,
      phase: 'block',
      scope_id: block.block_manifest.block_id,
      receipt_sha256: receipt.receipt_sha256,
    },
  );
  assert.equal(
    receipt.cache.cache_key_sha256,
    blockGateCacheKey({ gate, fixture, block }),
  );
  assert.ok(
    Buffer.byteLength(JSON.stringify(receipt), 'utf8')
      <= fixture.validationPolicy.context_budget.block_receipt_max_bytes,
  );
  assert.doesNotThrow(() => validateContextBudget(receipt, {
    kind: 'block-receipt',
    policy: fixture.validationPolicy.context_budget,
  }));
}

function assertNoParentLeak(value, roots = [faceless.root, talkingHead.root]) {
  const serialized = JSON.stringify(value);
  for (const root of roots) assert.equal(serialized.includes(root), false);
  for (const term of [
    '<!doctype',
    '<html',
    'data:image/',
    'frame_png',
    'image_url',
    'pixel_facts',
    'source_bundle',
    'visual_score',
    'subjective_quality',
    'contact_sheet',
    'ReachSurge',
  ]) {
    assert.equal(serialized.includes(term), false, `parent result leaked ${term}`);
  }
}

test('faceless fixture freezes real three-shot image, video and native-auxiliary material without changing route ownership', async () => {
  assert.equal(faceless.mode, 'faceless');
  assert.equal(faceless.blocks.length, 5);
  assert.equal(faceless.blocks.every(
    (block) => block.block_manifest.shot_ids.length === 3,
  ), true);
  const materials = [
    faceless.materials.image,
    faceless.materials.video,
    faceless.materials.auxiliary,
    faceless.materials.font,
  ];
  for (const material of materials) {
    const stat = await lstat(material.local_path);
    assert.equal(stat.isFile(), true);
    assert.equal(stat.isSymbolicLink(), false);
    assert.match(material.bytes_sha256, /^[0-9a-f]{64}$/u);
  }
  assert.equal(
    (await readFile(faceless.materials.image.local_path))
      .subarray(0, 2)
      .toString('ascii'),
    'P6',
  );
  assert.equal(
    (await readFile(faceless.materials.video.local_path))
      .subarray(4, 8)
      .toString('ascii'),
    'ftyp',
  );
  assert.match(
    await readFile(faceless.materials.auxiliary.local_path, 'utf8'),
    /<svg\b/u,
  );
  const source = faceless.blocks[0].source_bundle;
  assert.equal(
    source.materials.filter(
      (item) => item.consumer_role === 'ordinary-primary',
    ).length,
    3,
  );
  assert.equal(
    source.materials.filter(
      (item) => item.consumer_role === 'native-auxiliary' && item.auxiliary,
    ).length,
    1,
  );
  assert.equal(
    faceless.blocks[0].block_manifest.shots.some(
      (shot) => shot.native_auxiliary_asset_ids.length,
    ),
    true,
  );
  assert.deepEqual(
    source.materials
      .filter((item) => item.consumer_role === 'ordinary-primary')
      .map((item) => item.asset_id),
    faceless.assetManifest.assets
      .slice(0, 3)
      .map((item) => item.asset_id),
  );
});

test('talking-head fixture keeps one real control medium and the same three-shot B-roll contract', async () => {
  assert.equal(talkingHead.mode, 'talking-head');
  assert.equal(talkingHead.blocks.length, 2);
  assert.equal(talkingHead.blocks[0].block_manifest.shot_ids.length, 3);
  const roles = talkingHead.blocks[0].source_bundle.materials.map(
    (item) => item.consumer_role,
  );
  assert.equal(roles.includes('control-media'), true);
  assert.equal(roles.includes('ordinary-primary'), true);
  assert.equal(roles.includes('native-auxiliary'), true);
  assert.doesNotThrow(() => validateValidationPolicy(
    talkingHead.validationPolicy,
  ));
  assert.equal(
    talkingHead.validationPolicy.profile_policy.public_default_profile_id,
    null,
  );
  assert.equal(
    talkingHead.validationPolicy.profile_policy
      .forbidden_public_default_profiles
      .includes('deep-current-hud'),
    true,
  );
});

test('P4 fixture is derived from the actual P3 director and assets chain, not a hash-only contract', () => {
  assert.equal(faceless.priorContract.contract_phase, 'director');
  assert.equal(faceless.productionContract.contract_phase, 'sealed');
  assert.equal(
    faceless.productionContract.prior_contract_sha256,
    faceless.priorContract.production_contract_sha256,
  );
  assert.equal(
    faceless.productionContract.asset_manifest_sha256,
    fingerprintV3Value(faceless.assetManifest),
  );
  assert.deepEqual(
    Object.keys(faceless.canonicalArtifacts).sort(),
    [...CANONICAL_ARTIFACT_FIELDS].sort(),
  );
  assert.deepEqual(validateProductionContract(
    faceless.productionContract,
    {
      artifacts: faceless.canonicalArtifacts,
      priorContract: faceless.priorContract,
      assetManifest: faceless.assetManifest,
    },
  ), {
    status: 'passed',
    contract_phase: 'sealed',
    production_contract_sha256:
      faceless.productionContract.production_contract_sha256,
    prior_contract_sha256:
      faceless.productionContract.prior_contract_sha256,
    asset_manifest_sha256:
      faceless.productionContract.asset_manifest_sha256,
  });
  for (const [receipt, contract, phase, scope] of [
    [
      faceless.directorPolicyReceipt,
      faceless.priorContract,
      'director',
      'director',
    ],
    [
      faceless.sealedPolicyReceipt,
      faceless.productionContract,
      'sealed',
      'sealed',
    ],
  ]) {
    assert.deepEqual(validateGateReceipt(receipt, {
      productionContract: contract,
      validationPolicy: faceless.validationPolicy,
    }), {
      status: 'passed',
      gate: 'policy-gate',
      phase,
      scope_id: scope,
      receipt_sha256: receipt.receipt_sha256,
    });
  }
});

test('every positive Hold binds actual shot, projection, result and exit windows and data uses the complex 45-frame minimum', () => {
  const byId = new Map(
    faceless.canonicalArtifacts.shotPlan.shots.map(
      (shot) => [shot.shot_id, shot],
    ),
  );
  const projectionById = new Map(
    faceless.canonicalArtifacts.projection.shots.map(
      (shot) => [shot.shot_id, shot],
    ),
  );
  const complexMinimum =
    faceless.validationPolicy.readable_hold_policy.complex_min_frames;
  for (const block of faceless.blocks) {
    assert.equal(
      block.block_manifest.start_frame,
      projectionById.get(block.block_manifest.shot_ids[0])
        .frame_window.start_frame,
    );
    assert.equal(
      block.block_manifest.end_frame,
      projectionById.get(block.block_manifest.shot_ids.at(-1))
        .frame_window.end_frame,
    );
    for (const shot of block.block_manifest.shots) {
      const canonical = byId.get(shot.shot_id);
      const projection = projectionById.get(shot.shot_id);
      const holdFrames =
        shot.causal_lifecycle.hold.end_frame
        - shot.causal_lifecycle.hold.start_frame;
      assert.equal(shot.start_frame, projection.frame_window.start_frame);
      assert.equal(shot.end_frame, projection.frame_window.end_frame);
      assert.equal(
        shot.causal_lifecycle.result.end_frame,
        shot.causal_lifecycle.hold.start_frame,
      );
      assert.equal(
        shot.causal_lifecycle.hold.end_frame,
        shot.causal_lifecycle.exit.start_frame,
      );
      assert.equal(shot.causal_lifecycle.exit.end_frame, shot.end_frame);
      assert.ok(holdFrames >= complexMinimum);
      if (shot.semantic_kind === 'data') {
        assert.equal(canonical.shot_kind, 'data');
        assert.equal(canonical.readability_class, 'complex');
        assert.equal(holdFrames, complexMinimum);
      }
      for (const call of shot.timeline_calls) {
        assert.ok(call.start_frame >= shot.start_frame);
        assert.ok(call.end_frame <= shot.end_frame);
      }
    }
  }
});

test('source, runtime, pixel and chain inputs use exact closed P3 actual-evidence shapes', () => {
  const block = faceless.blocks[0];
  const sourceInput = sourceGateInput(faceless, block);
  const source = createSyntheticBlockReceipt({
    fixture: faceless,
    block,
    gate: 'source-conformance-gate',
  });
  const runtimeInput = runtimeGateInput(
    faceless,
    block,
    source,
  );
  const runtime = createSyntheticBlockReceipt({
    fixture: faceless,
    block,
    gate: 'runtime-seek-gate',
    sourceReceipt: source,
  });
  const pixelInput = pixelGateInput(
    faceless,
    block,
    source,
    runtime,
  );
  const chainInput = blockGateChainInput(faceless);
  assertExactKeys(sourceInput, SOURCE_INPUT_FIELDS, 'source');
  assertExactKeys(runtimeInput, RUNTIME_INPUT_FIELDS, 'runtime');
  assertExactKeys(pixelInput, PIXEL_INPUT_FIELDS, 'pixel');
  assertExactKeys(chainInput, CHAIN_INPUT_FIELDS, 'chain');
  for (const input of [
    sourceInput,
    runtimeInput,
    pixelInput,
    chainInput,
  ]) {
    assert.strictEqual(
      input.canonical_artifacts,
      faceless.canonicalArtifacts,
    );
    assert.strictEqual(
      input.asset_manifest,
      faceless.assetManifest,
    );
    assert.strictEqual(
      input.director_policy_receipt,
      faceless.directorPolicyReceipt,
    );
    assert.strictEqual(
      input.sealed_policy_receipt,
      faceless.sealedPolicyReceipt,
    );
  }
});

test('runtime, pixel and chain reject removal of the actual canonical-artifact bundle', async () => {
  const block = faceless.blocks[0];
  const receipts = createSyntheticReceiptChain({
    fixture: faceless,
    block,
  });
  const runtimeInput = runtimeGateInput(
    faceless,
    block,
    receipts.source,
  );
  const pixelInput = pixelGateInput(
    faceless,
    block,
    receipts.source,
    receipts.runtime,
  );
  const chainInput = blockGateChainInput(
    faceless,
    [block],
  );
  delete runtimeInput.canonical_artifacts;
  delete pixelInput.canonical_artifacts;
  delete chainInput.canonical_artifacts;
  const [runtimeApi, pixelApi, chainApi] = await Promise.all([
    loadRuntime(),
    loadPixel(),
    loadChain(),
  ]);
  await expectCode(
    () => runtimeApi.validateBlockRuntimeGate(
      runtimeInput,
      { probeRuntime: createRuntimeProbe(block).probeRuntime },
    ),
    'runtime_gate_input_invalid',
  );
  await expectCode(
    () => pixelApi.validateBlockPixelGate(pixelInput),
    'pixel_gate_input_invalid',
  );
  await expectCode(
    () => chainApi.runBlockGateChain(chainInput, {}),
    'block_gate_chain_input_invalid',
  );
});

test('P4 exposes four clean active modules without importing v2 or main-review implementations', async () => {
  await Promise.all([
    loadSource(),
    loadRuntime(),
    loadPixel(),
    loadChain(),
  ]);
  const sources = await Promise.all(GATE_MODULES.map(
    (specifier) => readFile(new URL(specifier, import.meta.url), 'utf8'),
  ));
  for (const source of sources) {
    for (const term of FORBIDDEN_ACTIVE_IMPORTS) {
      assert.equal(source.includes(term), false, `active P4 source contains ${term}`);
    }
  }
});

for (const fixtureName of ['faceless', 'talking-head']) {
  test(`source gate accepts the real minimum ${fixtureName} three-shot block`, async () => {
    const fixture = fixtureName === 'faceless' ? faceless : talkingHead;
    const block = fixture.blocks[0];
    const api = await loadSource();
    const inspection = await createSourceInspectionEvidence(
      fixture,
      block,
    );
    const receipt = await api.validateBlockSourceGate(
      sourceGateInput(fixture, block),
      { inspectSource: async () => inspection },
    );
    assertPassedReceipt(
      receipt,
      'source-conformance-gate',
      fixture,
      block,
    );
    assertNoParentLeak(receipt);
  });
}

test('source gate rejects a missing actual canonical-artifact bundle before inspecting source hashes', async () => {
  const api = await loadSource();
  const input = sourceGateInput(faceless, faceless.blocks[0]);
  delete input.canonical_artifacts;
  await expectCode(
    () => api.validateBlockSourceGate(input),
    'source_gate_input_invalid',
  );
});

test('source gate rejects a hash-only canonical-artifact surrogate', async () => {
  const api = await loadSource();
  const input = sourceGateInput(faceless, faceless.blocks[0]);
  input.canonical_artifacts = hashOnlyCanonicalArtifacts(faceless);
  await expectCode(
    () => api.validateBlockSourceGate(input),
    'production_contract_artifacts_required',
  );
});

test('source gate rejects fake canonical artifacts even when their old hash strings look valid', async () => {
  const api = await loadSource();
  const input = sourceGateInput(faceless, faceless.blocks[0]);
  input.canonical_artifacts = structuredClone(
    faceless.canonicalArtifacts,
  );
  input.canonical_artifacts.designSystem.palette_roles[0].value =
    '#000000';
  await expectCode(
    () => api.validateBlockSourceGate(input),
    'design_system_hash_mismatch',
  );
});

test('source gate rejects a rehashed actual document that no longer matches the sealed contract hash', async () => {
  const api = await loadSource();
  const input = sourceGateInput(faceless, faceless.blocks[0]);
  input.canonical_artifacts = structuredClone(
    faceless.canonicalArtifacts,
  );
  input.canonical_artifacts.designSystem.palette_roles[0].value =
    '#000000';
  input.canonical_artifacts.designSystem = rehashSelfDocument(
    input.canonical_artifacts.designSystem,
    'design_system_sha256',
  );
  await expectCode(
    () => api.validateBlockSourceGate(input),
    'production_contract_binding_mismatch',
  );
});

test('readable-Hold negative fixture targets a data shot at 44 frames, explicitly below complex_min_frames', () => {
  const block = mutateSourceBlock(
    faceless.blocks[0],
    'hold_missing',
  );
  const dataShot = block.block_manifest.shots.find(
    (shot) => shot.semantic_kind === 'data',
  );
  const holdFrames =
    dataShot.causal_lifecycle.hold.end_frame
    - dataShot.causal_lifecycle.hold.start_frame;
  assert.equal(holdFrames, 44);
  assert.ok(
    holdFrames
      < faceless.validationPolicy.readable_hold_policy
        .complex_min_frames,
  );
});

for (const [label, scenario, code] of SOURCE_FAILURE_CASES) {
  test(`source gate rejects ${label} with ${code}`, async () => {
    const api = await loadSource();
    const block = mutateSourceBlock(faceless.blocks[0], scenario);
    const inspection = await createSourceInspectionEvidence(
      faceless,
      block,
      { structuralFailureCodes: [code] },
    );
    await expectCode(
      () => api.validateBlockSourceGate(
        sourceGateInput(faceless, block),
        { inspectSource: async () => inspection },
      ),
      code,
    );
  });
}

test('runtime gate samples all four paths including end_to_t at every causal phase', async () => {
  const block = faceless.blocks[0];
  const source = createSyntheticBlockReceipt({
    fixture: faceless,
    block,
    gate: 'source-conformance-gate',
  });
  const probe = createRuntimeProbe(block);
  const api = await loadRuntime();
  const receipt = await api.validateBlockRuntimeGate(
    runtimeGateInput(faceless, block, source),
    { probeRuntime: probe.probeRuntime },
  );
  assertPassedReceipt(receipt, 'runtime-seek-gate', faceless, block);
  assert.equal(
    probe.calls.length,
    block.runtime_sample_plan.length * SEEK_PATHS.length,
  );
  for (const sample of block.runtime_sample_plan) {
    assert.deepEqual(
      probe.calls
        .filter(
          (call) => (
            call.shot_id === sample.shot_id
            && call.phase === sample.phase
            && call.frame === sample.frame
          ),
        )
        .map((call) => call.path),
      SEEK_PATHS,
    );
  }
  assertNoParentLeak(receipt);
});

for (const [label, scenario, code] of RUNTIME_FAILURE_CASES) {
  test(`runtime gate rejects ${label} with ${code}`, async () => {
    const block = faceless.blocks[0];
    const source = createSyntheticBlockReceipt({
      fixture: faceless,
      block,
      gate: 'source-conformance-gate',
    });
    const probe = createRuntimeProbe(block, scenario);
    const api = await loadRuntime();
    await expectCode(
      () => api.validateBlockRuntimeGate(
        runtimeGateInput(faceless, block, source),
        { probeRuntime: probe.probeRuntime },
      ),
      code,
    );
  });
}

test('pixel gate accepts closed structured technical facts and returns no technical frame', async () => {
  const block = faceless.blocks[0];
  const chain = createSyntheticReceiptChain({
    fixture: faceless,
    block,
  });
  const api = await loadPixel();
  const receipt = await api.validateBlockPixelGate(pixelGateInput(
    faceless,
    block,
    chain.source,
    chain.runtime,
  ));
  assertPassedReceipt(receipt, 'pixel-signal-gate', faceless, block);
  assertNoParentLeak(receipt);
});

for (const [label, scenario, code] of PIXEL_FAILURE_CASES) {
  test(`pixel gate rejects ${label} with ${code}`, async () => {
    const block = faceless.blocks[0];
    const chain = createSyntheticReceiptChain({
      fixture: faceless,
      block,
    });
    const api = await loadPixel();
    await expectCode(
      () => api.validateBlockPixelGate(pixelGateInput(
        faceless,
        block,
        chain.source,
        chain.runtime,
        mutatePixelFacts(block, scenario),
      )),
      code,
    );
  });
}

test('pixel gate rejects image, path, source and subjective payloads outside the closed technical-facts schema', async () => {
  const block = faceless.blocks[0];
  const chain = createSyntheticReceiptChain({
    fixture: faceless,
    block,
  });
  const api = await loadPixel();
  for (const injected of [
    { frame_png: 'data:image/png;base64,AAAA' },
    { frame_path: '/Users/alice/private/frame.png' },
    { html_source: '<html></html>' },
    { visual_score: 99 },
  ]) {
    await expectCode(
      () => api.validateBlockPixelGate(pixelGateInput(
        faceless,
        block,
        chain.source,
        chain.runtime,
        {
          ...structuredClone(block.pixel_facts),
          ...injected,
        },
      )),
      'pixel_facts_invalid',
    );
  }
});

test('three block receipts use exact P1 lineage, deterministic cache keys and the 16 KiB ceiling', async () => {
  const block = faceless.blocks[0];
  const sourceApi = await loadSource();
  const runtimeApi = await loadRuntime();
  const pixelApi = await loadPixel();
  const source = await sourceApi.validateBlockSourceGate(
    sourceGateInput(faceless, block),
  );
  const probe = createRuntimeProbe(block);
  const runtime = await runtimeApi.validateBlockRuntimeGate(
    runtimeGateInput(faceless, block, source),
    { probeRuntime: probe.probeRuntime },
  );
  const pixel = await pixelApi.validateBlockPixelGate(pixelGateInput(
    faceless,
    block,
    source,
    runtime,
  ));
  for (const receipt of [source, runtime, pixel]) {
    assertPassedReceipt(receipt, receipt.gate, faceless, block);
  }
  assert.equal(
    runtime.input_bindings.source_conformance_receipt_sha256,
    source.receipt_sha256,
  );
  assert.equal(
    pixel.input_bindings.source_conformance_receipt_sha256,
    source.receipt_sha256,
  );
  assert.equal(
    pixel.input_bindings.runtime_seek_receipt_sha256,
    runtime.receipt_sha256,
  );
  assertNoParentLeak({ source, runtime, pixel });
});

function blockLookup(blocks) {
  return new Map(blocks.map((block) => [
    block.block_manifest.block_id,
    block,
  ]));
}

function createGateRunners(fixture, blocks, calls, {
  rejectSource = null,
} = {}) {
  const lookup = blockLookup(blocks);
  const record = (gate, blockId) => {
    const key = `${gate}:${blockId}`;
    calls.set(key, (calls.get(key) ?? 0) + 1);
  };
  return {
    source: async (input) => {
      assertExactKeys(input, SOURCE_INPUT_FIELDS, 'chain source');
      assert.equal(
        fingerprintV3Value(input.canonical_artifacts),
        fingerprintV3Value(fixture.canonicalArtifacts),
      );
      const blockId = input.block_manifest.block_id;
      record('source', blockId);
      if (rejectSource?.(input)) {
        const error = new Error('Source gate rejected the current block.');
        error.code = 'remote_dependency';
        throw error;
      }
      return createSyntheticBlockReceipt({
        fixture,
        block: lookup.get(blockId),
        gate: 'source-conformance-gate',
      });
    },
    runtime: async (input) => {
      assertExactKeys(input, RUNTIME_INPUT_FIELDS, 'chain runtime');
      assert.equal(
        fingerprintV3Value(input.canonical_artifacts),
        fingerprintV3Value(fixture.canonicalArtifacts),
      );
      const blockId = input.block_manifest.block_id;
      record('runtime', blockId);
      return createSyntheticBlockReceipt({
        fixture,
        block: lookup.get(blockId),
        gate: 'runtime-seek-gate',
        sourceReceipt: input.source_conformance_receipt,
      });
    },
    pixel: async (input) => {
      assertExactKeys(input, PIXEL_INPUT_FIELDS, 'chain pixel');
      assert.equal(
        fingerprintV3Value(input.canonical_artifacts),
        fingerprintV3Value(fixture.canonicalArtifacts),
      );
      const blockId = input.block_manifest.block_id;
      record('pixel', blockId);
      return createSyntheticBlockReceipt({
        fixture,
        block: lookup.get(blockId),
        gate: 'pixel-signal-gate',
        sourceReceipt: input.source_conformance_receipt,
        runtimeReceipt: input.runtime_seek_receipt,
      });
    },
  };
}

test('block chain preserves dynamic N block order and returns only three bounded technical receipts per block', async () => {
  const api = await loadChain();
  const calls = new Map();
  const gateRunners = createGateRunners(
    faceless,
    faceless.blocks,
    calls,
  );
  const result = await api.runBlockGateChain(
    blockGateChainInput(faceless),
    {
    gateRunners,
    cacheStore: createMemoryCacheStore(),
    replaceBlock: async () => {
      assert.fail('passing block chain must not request a replacement');
    },
    },
  );
  assert.equal(result.status, 'passed');
  assert.equal(result.block_count, 5);
  assert.deepEqual(
    result.blocks.map((block) => block.block_id),
    ['B001', 'B002', 'B003', 'B004', 'B005'],
  );
  for (const block of result.blocks) {
    assert.equal(block.attempt, 1);
    assert.deepEqual(
      block.gate_receipts.map((receipt) => receipt.gate),
      [
        'source-conformance-gate',
        'runtime-seek-gate',
        'pixel-signal-gate',
      ],
    );
    assert.equal(
      block.gate_receipts.every((receipt) => receipt.cache.status === 'miss'),
      true,
    );
  }
  assert.equal(calls.size, 15);
  assertNoParentLeak(result);
});

test('one failed block consumes one aggregate replacement while passing block cache remains valid and the second run is all hit', async () => {
  const api = await loadChain();
  const cacheStore = createMemoryCacheStore();
  const original = faceless.blocks.slice(0, 3);
  const bad = mutateSourceBlock(original[1], 'remote_dependency');
  let repaired = structuredClone(original[1]);
  repaired.source_bundle.files.find(
    (file) => file.relative_path === 'block.js',
  ).content += '\n// repaired replacement source';
  repaired = rehashBlock(repaired);
  const firstBlocks = [original[0], bad, original[2]];
  const currentBlocks = [original[0], repaired, original[2]];
  const calls = new Map();
  const gateRunners = createGateRunners(
    faceless,
    currentBlocks,
    calls,
    {
      rejectSource: (input) => input.source_bundle.files.some(
        (file) => file.content.includes('cdn.jsdelivr.net'),
      ),
    },
  );
  const replacements = [];
  const first = await api.runBlockGateChain(
    blockGateChainInput(faceless, firstBlocks),
    {
    gateRunners,
    cacheStore,
    replaceBlock: async ({
      block,
      attempt,
      failure_codes: failureCodes,
    }) => {
      replacements.push({
        block_id: block.block_manifest.block_id,
        attempt,
        failure_codes: failureCodes,
      });
      assert.equal(block.block_manifest.block_id, 'B002');
      assert.equal(attempt, 2);
      assert.deepEqual(failureCodes, ['remote_dependency']);
      return repaired;
    },
    },
  );
  assert.equal(first.status, 'passed');
  assert.equal(
    first.blocks.find((block) => block.block_id === 'B002').attempt,
    2,
  );
  assert.deepEqual(replacements, [{
    block_id: 'B002',
    attempt: 2,
    failure_codes: ['remote_dependency'],
  }]);
  assert.equal(calls.get('source:B001'), 1);
  assert.equal(calls.get('runtime:B001'), 1);
  assert.equal(calls.get('pixel:B001'), 1);
  assert.equal(calls.get('source:B002'), 2);
  assert.equal(calls.get('runtime:B002'), 1);
  assert.equal(calls.get('pixel:B002'), 1);
  assert.equal(calls.get('source:B003'), 1);
  const callSnapshot = fingerprintV3Value([...calls.entries()]);

  const second = await api.runBlockGateChain(
    blockGateChainInput(faceless, currentBlocks),
    {
    gateRunners,
    cacheStore,
    replaceBlock: async () => {
      assert.fail('an all-hit run must not request block replacement');
    },
    },
  );
  assert.equal(second.status, 'passed');
  assert.equal(
    second.blocks.every(
      (block) => block.gate_receipts.every(
        (receipt) => receipt.cache.status === 'hit',
      ),
    ),
    true,
  );
  assert.equal(fingerprintV3Value([...calls.entries()]), callSnapshot);
  assertNoParentLeak({ first, second });
});

test('a second failure for one block stops after its single aggregate retry and exposes only bounded technical failure codes', async () => {
  const api = await loadChain();
  const bad = mutateSourceBlock(
    faceless.blocks[0],
    'remote_dependency',
  );
  const calls = new Map();
  const gateRunners = createGateRunners(
    faceless,
    [bad],
    calls,
    { rejectSource: () => true },
  );
  let captured;
  try {
    await api.runBlockGateChain(
      blockGateChainInput(faceless, [bad]),
      {
      gateRunners,
      cacheStore: createMemoryCacheStore(),
      replaceBlock: async () => structuredClone(bad),
      },
    );
    assert.fail('a twice-failed block must stop the chain');
  } catch (error) {
    captured = error;
  }
  assert.equal(captured?.code, 'block_gate_retry_exhausted');
  assert.equal(calls.get('source:B001'), 2);
  assert.deepEqual(captured?.failure_codes, ['remote_dependency']);
  const serialized = JSON.stringify(captured);
  assert.equal(serialized.includes(faceless.root), false);
  assert.equal(serialized.toLowerCase().includes('reachsurge'), false);
  assert.equal(serialized.includes('<html'), false);
});

test('the legal source-bound fixture passes the installed HyperFrames 0.7.70 JSON check', async () => {
  const block = faceless.blocks[0];
  const result = await runLocalHyperframesFixtureCheck({
    sourceSha256: block.source_bundle.source_sha256,
  });
  assert.equal(result.ok, true);
  assert.equal(result.version, '0.7.70');
  assert.deepEqual(result.argv, ['check', '--json']);
  assert.equal(result.json.ok, true);
  assert.equal(result.json._meta.version, '0.7.70');
  assert.match(result.project_source_sha256, /^[0-9a-f]{64}$/u);
  assert.match(result.result_sha256, /^[0-9a-f]{64}$/u);
});

test('the real source inspector returns closed parser, tool and source-bound evidence', async () => {
  const api = await loadModule(
    INSPECTOR_MODULE,
    ['inspectBlockSource'],
  );
  const block = faceless.blocks[0];
  const evidence = await api.inspectBlockSource({
    block_manifest: block.block_manifest,
    source_bundle: block.source_bundle,
    canonical_artifacts: faceless.canonicalArtifacts,
    validation_policy: faceless.validationPolicy,
  });
  assertExactKeys(
    evidence,
    INSPECTION_EVIDENCE_FIELDS,
    'source inspection',
  );
  assertExactKeys(
    evidence.parser_evidence,
    PARSER_EVIDENCE_FIELDS,
    'parser evidence',
  );
  for (const [field, library, kind] of [
    ['html', 'parse5', 'dom-ast'],
    ['javascript', 'acorn', 'ecmascript-ast'],
    ['css', 'postcss', 'css-ast'],
  ]) {
    assertExactKeys(
      evidence.parser_evidence[field],
      PARSER_RECORD_FIELDS,
      `${library} parser evidence`,
    );
    assert.equal(evidence.parser_evidence[field].library, library);
    assert.equal(evidence.parser_evidence[field].kind, kind);
    assert.ok(evidence.parser_evidence[field].node_count > 0);
  }
  assertExactKeys(
    evidence.hyperframes_check,
    HYPERFRAMES_CHECK_FIELDS,
    'HyperFrames check evidence',
  );
  assertExactKeys(
    evidence.structural_facts,
    STRUCTURAL_FACT_FIELDS,
    'structural facts',
  );
  assert.equal(evidence.inspector_id, 'block-source-structural-v1');
  assert.equal(evidence.block_id, block.block_manifest.block_id);
  assert.equal(
    evidence.source_sha256,
    block.source_bundle.source_sha256,
  );
  assert.equal(
    evidence.hyperframes_check.checked_source_sha256,
    block.source_bundle.source_sha256,
  );
  assert.equal(evidence.hyperframes_check.tool, 'hyperframes');
  assert.equal(evidence.hyperframes_check.version, '0.7.70');
  assert.equal(evidence.hyperframes_check.status, 'passed');
  assert.deepEqual(
    evidence.hyperframes_check.argv,
    ['check', '--json'],
  );
  assert.deepEqual(evidence.structural_facts.hard_failure_codes, []);
});

test('source gate uses its source-inspector option and rejects caller-shaped evidence injection', async () => {
  const api = await loadSource();
  const block = faceless.blocks[0];
  const evidence = await createSourceInspectionEvidence(
    faceless,
    block,
  );
  let calls = 0;
  const receipt = await api.validateBlockSourceGate(
    sourceGateInput(faceless, block),
    {
      inspectSource: async (request) => {
        calls += 1;
        assertExactKeys(
          request,
          [
            'block_manifest',
            'source_bundle',
            'canonical_artifacts',
            'validation_policy',
          ],
          'source inspector request',
        );
        return evidence;
      },
    },
  );
  assert.equal(calls, 1);
  assertPassedReceipt(
    receipt,
    'source-conformance-gate',
    faceless,
    block,
  );
  const injected = sourceGateInput(faceless, block);
  injected.source_inspection = evidence;
  await expectCode(
    () => api.validateBlockSourceGate(injected, {
      inspectSource: async () => evidence,
    }),
    'source_gate_input_invalid',
  );
});

for (
  const [
    label,
    scenario,
    code,
  ] of TERMINAL_SOURCE_FAILURE_CASES
) {
  test(`structural inspector rejects ${label} with ${code}`, async () => {
    const api = await loadSource();
    const block = mutateTerminalSourceBlock(
      faceless.blocks[0],
      scenario,
    );
    const evidence = await createSourceInspectionEvidence(
      faceless,
      block,
      { structuralFailureCodes: [code] },
    );
    await expectCode(
      () => api.validateBlockSourceGate(
        sourceGateInput(faceless, block),
        { inspectSource: async () => evidence },
      ),
      code,
    );
  });
}

for (
  const [
    label,
    scenario,
    code,
  ] of TERMINAL_RUNTIME_FAILURE_CASES
) {
  test(`runtime gate rejects ${label} with ${code}`, async () => {
    const api = await loadRuntime();
    const block = faceless.blocks[0];
    const source = createSyntheticBlockReceipt({
      fixture: faceless,
      block,
      gate: 'source-conformance-gate',
    });
    const probe = createTerminalRuntimeProbe(block, scenario);
    await expectCode(
      () => api.validateBlockRuntimeGate(
        runtimeGateInput(faceless, block, source),
        { probeRuntime: probe.probeRuntime },
      ),
      code,
    );
  });
}

test('pixel gate recomputes the canonical functional min_height_ratio', async () => {
  const api = await loadPixel();
  const block = faceless.blocks[0];
  const receipts = createSyntheticReceiptChain({
    fixture: faceless,
    block,
  });
  const facts = structuredClone(block.pixel_facts);
  facts.samples[0].functional_text_min_ratio = 0.009;
  await expectCode(
    () => api.validateBlockPixelGate(pixelGateInput(
      faceless,
      block,
      receipts.source,
      receipts.runtime,
      facts,
    )),
    'functional_text_below_minimum',
  );
});

test('pixel gate recomputes geometry_signature from bbox, focal point and density facts', async () => {
  const api = await loadPixel();
  const block = faceless.blocks[0];
  const receipts = createSyntheticReceiptChain({
    fixture: faceless,
    block,
  });
  const facts = structuredClone(block.pixel_facts);
  facts.samples[0].subject_bbox.x += 1;
  assert.notEqual(
    facts.samples[0].geometry_signature,
    recomputePixelGeometrySignature(facts.samples[0]),
  );
  await expectCode(
    () => api.validateBlockPixelGate(pixelGateInput(
      faceless,
      block,
      receipts.source,
      receipts.runtime,
      facts,
    )),
    'pixel_facts_invalid',
  );
});

test('identical recomputed geometry signatures cannot pass through asserted change flags', async () => {
  const api = await loadPixel();
  const block = faceless.blocks[0];
  const receipts = createSyntheticReceiptChain({
    fixture: faceless,
    block,
  });
  const facts = structuredClone(block.pixel_facts);
  const left = facts.samples[0];
  const right = facts.samples[1];
  right.subject_bbox = structuredClone(left.subject_bbox);
  right.focal_point = structuredClone(left.focal_point);
  right.density_facts = structuredClone(left.density_facts);
  right.geometry_signature = recomputePixelGeometrySignature(right);
  assert.equal(left.geometry_signature, right.geometry_signature);
  assert.deepEqual(
    [
      facts.adjacent_pairs[0].geometry_changed,
      facts.adjacent_pairs[0].focal_changed,
      facts.adjacent_pairs[0].density_changed,
    ],
    [true, true, true],
  );
  await expectCode(
    () => api.validateBlockPixelGate(pixelGateInput(
      faceless,
      block,
      receipts.source,
      receipts.runtime,
      facts,
    )),
    'pixel_facts_invalid',
  );
});

async function runSourceFactCacheMutation({
  material,
  replacementBytes,
}) {
  const api = await loadChain();
  const block = faceless.blocks[0];
  const blocks = [block];
  const calls = new Map();
  const cacheStore = createMemoryCacheStore();
  const gateRunners = createGateRunners(
    faceless,
    blocks,
    calls,
  );
  const options = {
    gateRunners,
    cacheStore,
    replaceBlock: async () => {
      assert.fail('cache-fact rerun must not replace a passing block');
    },
  };
  await api.runBlockGateChain(
    blockGateChainInput(faceless, blocks),
    options,
  );
  const original = await readFile(material.local_path);
  try {
    await writeFile(material.local_path, replacementBytes);
    const second = await api.runBlockGateChain(
      blockGateChainInput(faceless, blocks),
      options,
    );
    assert.equal(calls.get('source:B001'), 2);
    assert.equal(
      second.blocks[0].gate_receipts[0].cache.status,
      'miss',
    );
  } finally {
    await writeFile(material.local_path, original);
  }
}

test('stale actual image bytes cause a source cache miss and gate rerun', async () => {
  const material = faceless.blocks[0].source_bundle.materials.find(
    (item) => item.media_kind === 'image',
  );
  await runSourceFactCacheMutation({
    material,
    replacementBytes: Buffer.from('stale-image-bytes', 'utf8'),
  });
});

test('stale actual font bytes cause a source cache miss and gate rerun', async () => {
  await runSourceFactCacheMutation({
    material: faceless.blocks[0].source_bundle.font_package,
    replacementBytes: Buffer.from('stale-font-bytes', 'utf8'),
  });
});

test('stale pixel facts cause only the pixel cache to miss and rerun', async () => {
  const api = await loadChain();
  const original = faceless.blocks[0];
  const changed = structuredClone(original);
  changed.pixel_facts.samples[0].mean_luma += 1;
  const calls = new Map();
  const cacheStore = createMemoryCacheStore();
  const firstRunners = createGateRunners(
    faceless,
    [original],
    calls,
  );
  await api.runBlockGateChain(
    blockGateChainInput(faceless, [original]),
    {
      gateRunners: firstRunners,
      cacheStore,
      replaceBlock: async () => assert.fail('passing cache run'),
    },
  );
  const changedRunners = createGateRunners(
    faceless,
    [changed],
    calls,
  );
  const second = await api.runBlockGateChain(
    blockGateChainInput(faceless, [changed]),
    {
      gateRunners: changedRunners,
      cacheStore,
      replaceBlock: async () => assert.fail('passing cache rerun'),
    },
  );
  assert.equal(calls.get('source:B001'), 1);
  assert.equal(calls.get('runtime:B001'), 1);
  assert.equal(calls.get('pixel:B001'), 2);
  assert.deepEqual(
    second.blocks[0].gate_receipts.map(
      (receipt) => receipt.cache.status,
    ),
    ['hit', 'hit', 'miss'],
  );
});

test('external prefilled public receipts never hit while a same-store chain-owned second run does', async () => {
  const api = await loadChain();
  const block = faceless.blocks[0];
  const cacheStore = createMemoryCacheStore();
  const publicReceipts = createSyntheticReceiptChain({
    fixture: faceless,
    block,
    cacheStatus: 'miss',
  });
  for (const receipt of Object.values(publicReceipts)) {
    cacheStore.records.set(
      receipt.cache.cache_key_sha256,
      structuredClone(receipt),
    );
  }
  const calls = new Map();
  const gateRunners = createGateRunners(
    faceless,
    [block],
    calls,
  );
  const options = {
    gateRunners,
    cacheStore,
    replaceBlock: async () => assert.fail('passing cache run'),
  };
  const first = await api.runBlockGateChain(
    blockGateChainInput(faceless, [block]),
    options,
  );
  assert.deepEqual(
    first.blocks[0].gate_receipts.map(
      (receipt) => receipt.cache.status,
    ),
    ['miss', 'miss', 'miss'],
  );
  assert.equal(calls.size, 3);
  const snapshot = fingerprintV3Value([...calls.entries()]);
  const second = await api.runBlockGateChain(
    blockGateChainInput(faceless, [block]),
    options,
  );
  assert.deepEqual(
    second.blocks[0].gate_receipts.map(
      (receipt) => receipt.cache.status,
    ),
    ['hit', 'hit', 'hit'],
  );
  assert.equal(fingerprintV3Value([...calls.entries()]), snapshot);
});

test('only failure codes in the current gate policy registry can reach replacement', async () => {
  const api = await loadChain();
  const block = faceless.blocks[0];
  const allowed = new Set(
    Object.values(faceless.validationPolicy.gate_policies)
      .flatMap((policy) => policy.hard_failure_codes),
  );
  const base = createGateRunners(faceless, [block], new Map());
  let first = true;
  let replacementPayload;
  const result = await api.runBlockGateChain(
    blockGateChainInput(faceless, [block]),
    {
      gateRunners: {
        ...base,
        source: async (input) => {
          if (first) {
            first = false;
            const error = new Error('parser failed');
            error.code = 'source_parser_failed';
            throw error;
          }
          return base.source(input);
        },
      },
      cacheStore: createMemoryCacheStore(),
      replaceBlock: async (payload) => {
        replacementPayload = payload;
        return structuredClone(block);
      },
    },
  );
  assert.equal(result.status, 'passed');
  assert.equal(
    replacementPayload.failure_codes.every((code) => allowed.has(code)),
    true,
  );

  let unregisteredReachedReplacement = false;
  await assert.rejects(
    () => api.runBlockGateChain(
      blockGateChainInput(faceless, [block]),
      {
        gateRunners: {
          ...base,
          source: async () => {
            const error = new Error('not registered');
            error.code = 'invented_unregistered_failure';
            throw error;
          },
        },
        cacheStore: createMemoryCacheStore(),
        replaceBlock: async () => {
          unregisteredReachedReplacement = true;
          return structuredClone(block);
        },
      },
    ),
    (error) => (
      error?.code === 'block_gate_failure_code_invalid'
      && !error.failure_codes?.includes('invented_unregistered_failure')
    ),
  );
  assert.equal(unregisteredReachedReplacement, false);
});

test('ReachSurge, gold, private and profile error fields cannot reach replacement or parent output', async () => {
  const api = await loadChain();
  const block = faceless.blocks[0];
  const base = createGateRunners(faceless, [block], new Map());
  let first = true;
  let replacementPayload;
  const result = await api.runBlockGateChain(
    blockGateChainInput(faceless, [block]),
    {
      gateRunners: {
        ...base,
        source: async (input) => {
          if (!first) return base.source(input);
          first = false;
          const error = new Error('bounded technical failure');
          error.code = 'remote_dependency';
          error.reachsurge_gold = 'RS-GOLD-SECRET';
          error.private_payload = 'PRIVATE-SECRET';
          error.profile_packet = 'PROFILE-SECRET';
          throw error;
        },
      },
      cacheStore: createMemoryCacheStore(),
      replaceBlock: async (payload) => {
        replacementPayload = structuredClone(payload);
        return structuredClone(block);
      },
    },
  );
  const serialized = JSON.stringify({
    replacementPayload,
    result,
  });
  for (const secret of [
    'RS-GOLD-SECRET',
    'PRIVATE-SECRET',
    'PROFILE-SECRET',
    'reachsurge_gold',
    'private_payload',
    'profile_packet',
  ]) {
    assert.equal(serialized.toLowerCase().includes(secret.toLowerCase()), false);
  }
});

test('initial B001 through BN gate runs are parallel but parent output remains ordered', async () => {
  const api = await loadChain();
  const blocks = faceless.blocks;
  const base = createGateRunners(faceless, blocks, new Map());
  let sourceStarts = 0;
  let release;
  const allStarted = new Promise((resolve) => {
    release = resolve;
  });
  const gateRunners = {
    ...base,
    source: async (input) => {
      sourceStarts += 1;
      if (sourceStarts === blocks.length) release();
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('initial blocks did not run in parallel')),
          500,
        );
        allStarted.then(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
      return base.source(input);
    },
  };
  const result = await api.runBlockGateChain(
    blockGateChainInput(faceless, blocks),
    {
      gateRunners,
      cacheStore: createMemoryCacheStore(),
      replaceBlock: async () => assert.fail('parallel passing run'),
    },
  );
  assert.equal(sourceStarts, blocks.length);
  assert.deepEqual(
    result.blocks.map((blockResult) => blockResult.block_id),
    ['B001', 'B002', 'B003', 'B004', 'B005'],
  );
});

test('the actual legal block source must fail Source Gate when its own HyperFrames project fails', async () => {
  const api = await loadSource();
  const block = faceless.blocks[0];
  const positive = await runActualBlockHyperframesCheck(block);
  assert.equal(positive.version, '0.7.70');
  assert.equal(positive.ok, true);

  const broken = structuredClone(block);
  const html = broken.source_bundle.files.find(
    (file) => file.relative_path === 'index.html',
  );
  html.content = html.content.replace(
    ` data-composition-id="${block.block_manifest.block_id}"`,
    '',
  );
  const rehashed = rehashBlock(broken);
  const actualCheck = await runActualBlockHyperframesCheck(rehashed);
  assert.equal(actualCheck.ok, false);
  assert.equal(
    actualCheck.json.lint.findings.some(
      (finding) => finding.code === 'root_missing_composition_id',
    ),
    true,
  );
  await expectCode(
    () => api.validateBlockSourceGate(
      sourceGateInput(faceless, rehashed),
    ),
    'hyperframes_check_failed',
  );
});

for (const [label, scenario, code] of ALIAS_SOURCE_FAILURE_CASES) {
  test(`source structural analysis rejects ${label} with ${code}`, async () => {
    const api = await loadSource();
    const block = mutateTerminalSourceBlock(
      faceless.blocks[0],
      scenario,
    );
    await expectCode(
      () => api.validateBlockSourceGate(
        sourceGateInput(faceless, block),
      ),
      code,
    );
  });
}

test('same-byte symlink replacement cannot reuse a regular-file source cache entry', async () => {
  const root = path.join(fixtureRoot, 'same-byte-symlink-cache');
  const fixture = await createBlockGateFixture({
    root,
    mode: 'faceless',
    blockCount: 1,
  });
  const block = fixture.blocks[0];
  const material = block.source_bundle.materials.find(
    (item) => item.media_kind === 'image',
  );
  const backup = `${material.local_path}.regular-backup`;
  await copyFile(material.local_path, backup);
  const api = await loadChain();
  const sourceApi = await loadSource();
  const calls = new Map();
  const base = createGateRunners(fixture, [block], calls);
  let sourceCalls = 0;
  let replacementCalls = 0;
  const gateRunners = {
    ...base,
    source: async (input) => {
      sourceCalls += 1;
      return sourceApi.validateBlockSourceGate(input);
    },
  };
  const cacheStore = createMemoryCacheStore();
  const options = {
    gateRunners,
    cacheStore,
    replaceBlock: async ({ failure_codes: failureCodes }) => {
      replacementCalls += 1;
      assert.deepEqual(failureCodes, ['source_asset_unbound']);
      await unlink(material.local_path);
      await copyFile(backup, material.local_path);
      return structuredClone(block);
    },
  };
  try {
    const first = await api.runBlockGateChain(
      blockGateChainInput(fixture, [block]),
      options,
    );
    assert.equal(first.blocks[0].gate_receipts[0].cache.status, 'miss');
    await unlink(material.local_path);
    await symlink(backup, material.local_path);
    assert.equal((await lstat(material.local_path)).isSymbolicLink(), true);
    const second = await api.runBlockGateChain(
      blockGateChainInput(fixture, [block]),
      options,
    );
    assert.equal(replacementCalls, 1);
    assert.equal(sourceCalls, 2);
    assert.equal(second.blocks[0].attempt, 2);
    assert.equal(second.blocks[0].gate_receipts[0].cache.status, 'miss');
  } finally {
    await rm(material.local_path, { force: true });
    await copyFile(backup, material.local_path);
    await rm(backup, { force: true });
  }
});

test('a missing source material maps to a registered source failure and exactly one replacement', async () => {
  const root = path.join(fixtureRoot, 'missing-material-chain');
  const fixture = await createBlockGateFixture({
    root,
    mode: 'faceless',
    blockCount: 1,
  });
  const block = fixture.blocks[0];
  const material = block.source_bundle.materials[0];
  const backup = `${material.local_path}.missing-backup`;
  await copyFile(material.local_path, backup);
  await unlink(material.local_path);
  const api = await loadChain();
  const calls = new Map();
  const base = createGateRunners(fixture, [block], calls);
  let replacementCalls = 0;
  try {
    const result = await api.runBlockGateChain(
      blockGateChainInput(fixture, [block]),
      {
        gateRunners: base,
        cacheStore: createMemoryCacheStore(),
        replaceBlock: async ({ failure_codes: failureCodes }) => {
          replacementCalls += 1;
          assert.deepEqual(failureCodes, ['source_asset_unbound']);
          await copyFile(backup, material.local_path);
          return structuredClone(block);
        },
      },
    );
    assert.equal(replacementCalls, 1);
    assert.equal(result.blocks[0].attempt, 2);
    assert.equal(calls.get('source:B001'), 1);
  } finally {
    await rm(material.local_path, { force: true });
    await copyFile(backup, material.local_path);
    await rm(backup, { force: true });
  }
});

test('a pixel-only failure code emitted by Source Gate never reaches replacement', async () => {
  const api = await loadChain();
  const block = faceless.blocks[0];
  const base = createGateRunners(faceless, [block], new Map());
  let replacementCalls = 0;
  await assert.rejects(
    () => api.runBlockGateChain(
      blockGateChainInput(faceless, [block]),
      {
        gateRunners: {
          ...base,
          source: async () => {
            const error = new Error('wrong gate code');
            error.code = 'frame_near_black';
            throw error;
          },
        },
        cacheStore: createMemoryCacheStore(),
        replaceBlock: async () => {
          replacementCalls += 1;
          return structuredClone(block);
        },
      },
    ),
    (error) => error?.code === 'block_gate_failure_code_invalid',
  );
  assert.equal(replacementCalls, 0);
});

test('HyperFrames 0.7.70 is rebuildable from package lock and the skill-local binary is preferred', async () => {
  const packageDocument = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const lockDocument = await readFile(
    new URL('../pnpm-lock.yaml', import.meta.url),
    'utf8',
  );
  const inspectorSource = await readFile(
    new URL(INSPECTOR_MODULE, import.meta.url),
    'utf8',
  );
  assert.equal(packageDocument.dependencies?.hyperframes, '0.7.70');
  assert.match(
    lockDocument,
    /hyperframes:\s*\n\s+specifier:\s+0\.7\.70\s*\n\s+version:\s+0\.7\.70/u,
  );
  assert.match(lockDocument, /hyperframes@0\.7\.70:/u);
  assert.match(
    inspectorSource,
    /new URL\(['"]\.\.\/node_modules\/\.bin\/hyperframes['"], import\.meta\.url\)/u,
  );
});

test('runtime causal selectors and timeline_call_ids must bind actual source-plan nodes', async () => {
  const api = await loadRuntime();
  let block = structuredClone(faceless.blocks[0]);
  block.block_manifest.shots[0].causal_lifecycle.entry.selectors = [
    '#ghost-causal-node',
  ];
  block.block_manifest.shots[0]
    .causal_lifecycle.entry.timeline_call_ids = [
      'ghost-timeline-call',
    ];
  const phases = ['entry', 'action', 'result', 'hold', 'exit'];
  block.block_manifest.runtime_sample_plan_sha256 = fingerprintV3Value(
    block.block_manifest.shots.flatMap((shot) => phases.map((phase) => ({
      shot_id: shot.shot_id,
      phase,
      frame: shot.causal_lifecycle[phase].start_frame,
    }))),
  );
  block = rehashBlock(block);
  const source = createSyntheticBlockReceipt({
    fixture: faceless,
    block,
    gate: 'source-conformance-gate',
  });
  await expectCode(
    () => api.validateBlockRuntimeGate(
      runtimeGateInput(faceless, block, source),
      { probeRuntime: createRuntimeProbe(block).probeRuntime },
    ),
    'runtime_sample_plan_invalid',
  );
});

test('result_visible false cannot contradict a fully visible computed state', async () => {
  const api = await loadRuntime();
  const block = faceless.blocks[0];
  const source = createSyntheticBlockReceipt({
    fixture: faceless,
    block,
    gate: 'source-conformance-gate',
  });
  const base = createRuntimeProbe(block).probeRuntime;
  await expectCode(
    () => api.validateBlockRuntimeGate(
      runtimeGateInput(faceless, block, source),
      {
        probeRuntime: async (request) => {
          const state = await base(request);
          if (['entry', 'action', 'exit'].includes(request.phase)) {
            state.result_visible = false;
            state.display = 'block';
            state.visibility = 'visible';
            state.opacity = 1;
            state.bounding_box = {
              x: 4,
              y: 4,
              width: 56,
              height: 28,
            };
          }
          return state;
        },
      },
    ),
    'runtime_display_state_invalid',
  );
});

test('Number.MIN_VALUE subject bbox is rejected even with a recomputed geometry signature', async () => {
  const api = await loadPixel();
  const block = faceless.blocks[0];
  const receipts = createSyntheticReceiptChain({
    fixture: faceless,
    block,
  });
  const facts = structuredClone(block.pixel_facts);
  facts.samples[0].subject_bbox.width = Number.MIN_VALUE;
  facts.samples[0].subject_bbox.height = Number.MIN_VALUE;
  facts.samples[0].geometry_signature =
    recomputePixelGeometrySignature(facts.samples[0]);
  await expectCode(
    () => api.validateBlockPixelGate(pixelGateInput(
      faceless,
      block,
      receipts.source,
      receipts.runtime,
      facts,
    )),
    'pixel_facts_invalid',
  );
});

test('every explicit runtime failure code is registered and runtime_state_invalid gets one replacement', async () => {
  const runtimeSource = await readFile(
    new URL(RUNTIME_MODULE, import.meta.url),
    'utf8',
  );
  const explicitCodes = new Set(
    [...runtimeSource.matchAll(
      /fail\(\s*['"]([a-z][a-z0-9_]+)['"]/gu,
    )].map((match) => match[1]),
  );
  explicitCodes.add('seek_end_to_t_missing');
  const registered = new Set(
    faceless.validationPolicy
      .gate_policies['runtime-seek-gate'].hard_failure_codes,
  );
  assert.deepEqual(
    [...explicitCodes].filter((code) => !registered.has(code)).sort(),
    [],
  );

  const api = await loadChain();
  const block = faceless.blocks[0];
  const base = createGateRunners(faceless, [block], new Map());
  let runtimeCalls = 0;
  let replacementCalls = 0;
  const result = await api.runBlockGateChain(
    blockGateChainInput(faceless, [block]),
    {
      gateRunners: {
        ...base,
        runtime: async (input) => {
          runtimeCalls += 1;
          if (runtimeCalls === 1) {
            const error = new Error('invalid normalized runtime state');
            error.code = 'runtime_state_invalid';
            throw error;
          }
          return base.runtime(input);
        },
      },
      cacheStore: createMemoryCacheStore(),
      replaceBlock: async ({ failure_codes: failureCodes }) => {
        replacementCalls += 1;
        assert.deepEqual(failureCodes, ['runtime_state_invalid']);
        return structuredClone(block);
      },
    },
  );
  assert.equal(result.status, 'passed');
  assert.equal(result.blocks[0].attempt, 2);
  assert.equal(runtimeCalls, 2);
  assert.equal(replacementCalls, 1);
});
