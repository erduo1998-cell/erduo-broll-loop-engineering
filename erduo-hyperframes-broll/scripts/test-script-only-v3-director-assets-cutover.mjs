import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createDeliveryPhaseReceipt,
  createRenderEvidence,
  createRuntimeBundle,
} from './test-support-script-only-v3-runtime.mjs';
import {
  createDirectorFixture,
  createOrdinaryMediaSelections,
} from './test-support-script-only-v3-director-assets.mjs';
import { orchestrateScriptOnlyV3 } from './orchestrate-stages.mjs';
import {
  fingerprintV3Value,
  validateGateReceipt,
  validateProductionContract,
} from './validate-production-contract.mjs';
import { compileProductionContract } from './compile-production-contract.mjs';
import { validateContextBudget } from './validate-context-budget.mjs';

const DIRECTOR_MODULE = './validate-director-chain.mjs';
const ASSETS_MODULE = './validate-assets-facts-chain.mjs';
const PROJECTION_MODULE = './compile-canonical-frame-projection.mjs';
const FORBIDDEN_ACTIVE_TERMS = Object.freeze([
  'shot_plan_review',
  'asset_fact_review',
  'html_preview_review',
  'final_frame_review',
  'style_conformance_review',
  'source_code_review',
  'main_review_refs',
  'visual-review',
  'contact_sheet',
  'contact-sheet',
  'media_locator',
  'inspected_visual_page',
  'trusted_capture',
  'style_integration_authorization',
  'stable_window',
]);

async function loadStageModule(specifier, exports) {
  let module;
  try {
    module = await import(specifier);
  } catch (error) {
    assert.fail(`P3 active module ${specifier} is required: ${error.code ?? error.message}`);
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

async function loadDirector() {
  return loadStageModule(DIRECTOR_MODULE, [
    'compileDirectorChain',
    'validateDirectorChain',
  ]);
}

async function loadAssets() {
  return loadStageModule(ASSETS_MODULE, [
    'freezeAssetsFactsChain',
    'validateAssetsFactsChain',
  ]);
}

async function loadProjection() {
  return loadStageModule(PROJECTION_MODULE, [
    'compileCanonicalFrameProjection',
    'validateCanonicalFrameProjection',
  ]);
}

function expectCode(action, code) {
  return assert.rejects(
    action,
    (error) => error?.code === code,
  );
}

function assertNoForbiddenFacts(value) {
  const serialized = JSON.stringify(value);
  for (const term of FORBIDDEN_ACTIVE_TERMS) {
    assert.equal(
      serialized.includes(term),
      false,
      `active parent result leaked forbidden term ${term}`,
    );
  }
  assert.equal(/(?:^|["'])image(?:\/|["'])/u.test(serialized), false);
  assert.equal(serialized.includes('data:image/'), false);
}

function assertBoundedReceipt(receipt, validationPolicy, contract) {
  assert.deepEqual(
    validateGateReceipt(receipt, {
      productionContract: contract,
      validationPolicy,
    }),
    {
      status: 'passed',
      gate: 'policy-gate',
      phase: contract.contract_phase,
      scope_id: contract.contract_phase,
      receipt_sha256: receipt.receipt_sha256,
    },
  );
  assert.ok(
    Buffer.byteLength(JSON.stringify(receipt), 'utf8')
      <= validationPolicy.context_budget.block_receipt_max_bytes,
  );
}

function assertBoundedParentEnvelope(result, validationPolicy) {
  assert.deepEqual(result.parent_envelope.gate_receipts, [result.policy_receipt]);
  assert.doesNotThrow(() => validateContextBudget(result.parent_envelope, {
    kind: 'stage-envelope',
    policy: validationPolicy.context_budget,
  }));
  assert.ok(
    Buffer.byteLength(JSON.stringify(result.parent_envelope), 'utf8')
      <= validationPolicy.context_budget.stage_envelope_max_bytes,
  );
  assertNoForbiddenFacts(result.parent_envelope);
}

async function compileDirector(fixture) {
  const director = await loadDirector();
  return director.compileDirectorChain({
    srt_bytes: fixture.srtBytes,
    ...fixture.canonicalArtifacts,
  });
}

test('canonical v3 projection derives exact cue coverage and frame truth for dynamic five-shot input', async () => {
  const fixture = createDirectorFixture({ shotCount: 5 });
  const projectionApi = await loadProjection();
  const projection = projectionApi.compileCanonicalFrameProjection({
    parsed_srt: fixture.canonicalArtifacts.parsedSrt,
    shot_plan: fixture.canonicalArtifacts.shotPlan,
    fps: fixture.canonicalArtifacts.shotPlan.fps,
  });
  assert.deepEqual(projection, fixture.canonicalArtifacts.projection);
  assert.deepEqual(
    projection.shots.map((shot) => shot.cue_ids),
    [['Q001'], ['Q002'], ['Q003'], ['Q004'], ['Q005']],
  );
  assert.deepEqual(projection.shots[0].frame_window, {
    start_frame: 0,
    end_frame: 100,
    duration_frames: 100,
  });
  assert.deepEqual(projection.shots.at(-1).frame_window, {
    start_frame: 400,
    end_frame: 500,
    duration_frames: 100,
  });
  assert.deepEqual(
    projectionApi.validateCanonicalFrameProjection(projection, {
      parsed_srt: fixture.canonicalArtifacts.parsedSrt,
      shot_plan: fixture.canonicalArtifacts.shotPlan,
      fps: fixture.canonicalArtifacts.shotPlan.fps,
    }),
    {
      status: 'passed',
      shot_count: 5,
      cue_count: 5,
      start_frame: 0,
      end_frame: 500,
    },
  );
});

test('canonical v3 projection rejects cue gaps, first/last drift, frame drift and stable_window', async () => {
  const fixture = createDirectorFixture({ shotCount: 5 });
  const projectionApi = await loadProjection();
  const input = {
    parsed_srt: fixture.canonicalArtifacts.parsedSrt,
    shot_plan: fixture.canonicalArtifacts.shotPlan,
    fps: fixture.canonicalArtifacts.shotPlan.fps,
  };
  const cueGap = structuredClone(input);
  cueGap.shot_plan.shots[2].cue_ids = [];
  await expectCode(
    async () => projectionApi.compileCanonicalFrameProjection(cueGap),
    'projection_cue_coverage_mismatch',
  );
  const firstBoundary = structuredClone(input);
  firstBoundary.shot_plan.shots[0].start_ms = 40;
  firstBoundary.shot_plan.shots[0].duration_ms -= 40;
  await expectCode(
    async () => projectionApi.compileCanonicalFrameProjection(firstBoundary),
    'projection_time_truth_mismatch',
  );
  const frameDrift = structuredClone(
    fixture.canonicalArtifacts.projection,
  );
  frameDrift.shots[4].frame_window.end_frame += 1;
  frameDrift.shots[4].frame_window.duration_frames += 1;
  await expectCode(
    async () => projectionApi.validateCanonicalFrameProjection(frameDrift, input),
    'projection_frame_mapping_mismatch',
  );
  const stableWindow = structuredClone(input);
  stableWindow.shot_plan.shots[0].stable_window = {
    from_ms: 1800,
    to_ms: 3600,
  };
  await expectCode(
    async () => projectionApi.compileCanonicalFrameProjection(stableWindow),
    'legacy_field_forbidden',
  );
});

test('director compiles one canonical director contract and bounded policy receipt from actual SRT and all P1 artifacts', async () => {
  const fixture = createDirectorFixture({ shotCount: 5 });
  const directorApi = await loadDirector();
  const result = await directorApi.compileDirectorChain({
    srt_bytes: fixture.srtBytes,
    ...fixture.canonicalArtifacts,
  });
  assert.deepEqual(
    Object.keys(result).sort(),
    [
      'parent_envelope',
      'policy_receipt',
      'production_contract',
    ],
  );
  assert.equal(result.production_contract.contract_phase, 'director');
  assert.equal(result.production_contract.pipeline_contract_version, 3);
  assert.equal(
    result.production_contract.authoring_topology_id,
    'script-only-authoring-cluster-v1',
  );
  assert.equal(
    result.production_contract.validation_policy_id,
    'script-only-production-v1',
  );
  assert.equal(
    Object.hasOwn(result.production_contract, 'asset_manifest_sha256'),
    false,
  );
  assert.equal(
    Object.hasOwn(result.production_contract, 'prior_contract_sha256'),
    false,
  );
  assert.equal(
    validateProductionContract(result.production_contract, {
      artifacts: fixture.canonicalArtifacts,
    }).contract_phase,
    'director',
  );
  assert.equal(result.policy_receipt.metrics.shot_count, 5);
  assert.equal(
    result.policy_receipt.input_bindings.parsed_srt_sha256,
    fingerprintV3Value(fixture.canonicalArtifacts.parsedSrt),
  );
  assertBoundedReceipt(
    result.policy_receipt,
    fixture.canonicalArtifacts.validationPolicy,
    result.production_contract,
  );
  assertBoundedParentEnvelope(
    result,
    fixture.canonicalArtifacts.validationPolicy,
  );
  assert.deepEqual(
    directorApi.validateDirectorChain(result, {
      srt_bytes: fixture.srtBytes,
      ...fixture.canonicalArtifacts,
    }),
    {
      status: 'passed',
      shot_count: 5,
      production_contract_sha256:
        result.production_contract.production_contract_sha256,
      receipt_sha256: result.policy_receipt.receipt_sha256,
    },
  );
});

test('director rejects stable_window, substituted SRT bytes, v2 identity and all main-review payloads', async () => {
  const fixture = createDirectorFixture();
  const directorApi = await loadDirector();
  const stableWindow = structuredClone(fixture);
  stableWindow.canonicalArtifacts.shotPlan.shots[0].stable_window = {
    from_ms: 2200,
    to_ms: 3400,
  };
  await expectCode(
    () => directorApi.compileDirectorChain({
      srt_bytes: stableWindow.srtBytes,
      ...stableWindow.canonicalArtifacts,
    }),
    'legacy_field_forbidden',
  );
  await expectCode(
    () => directorApi.compileDirectorChain({
      srt_bytes: Buffer.from(
        fixture.srtBytes.toString('utf8').replace('第 1 个', '已替换'),
        'utf8',
      ),
      ...fixture.canonicalArtifacts,
    }),
    'parsed_srt_binding_mismatch',
  );
  for (const injected of [
    { pipeline_contract_version: 2 },
    { main_review_refs: [] },
    { shot_plan_review: { status: 'approved' } },
    { review_packet: { status: 'approved' } },
  ]) {
    await expectCode(
      () => directorApi.compileDirectorChain({
        srt_bytes: fixture.srtBytes,
        ...fixture.canonicalArtifacts,
        ...injected,
      }),
      injected.pipeline_contract_version === 2
        ? 'pipeline_upgrade_required'
        : 'legacy_field_forbidden',
    );
  }
});

test('assets freezes actual ordinary-media bytes, probe, hash, rights, provenance and geometry before exact reseal', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'erduo-v3-assets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = createDirectorFixture({ shotCount: 5 });
  const director = await compileDirector(fixture);
  const media = await createOrdinaryMediaSelections(directory, fixture);
  const assetsApi = await loadAssets();
  const result = await assetsApi.freezeAssetsFactsChain({
    prior_contract: director.production_contract,
    director_policy_receipt: director.policy_receipt,
    canonical_artifacts: fixture.canonicalArtifacts,
    selections: media.selections,
  });
  assert.deepEqual(
    Object.keys(result).sort(),
    [
      'asset_manifest',
      'parent_envelope',
      'policy_receipt',
      'production_contract',
    ],
  );
  assert.equal(result.production_contract.contract_phase, 'sealed');
  assert.equal(
    result.production_contract.prior_contract_sha256,
    director.production_contract.production_contract_sha256,
  );
  assert.equal(
    result.production_contract.asset_manifest_sha256,
    fingerprintV3Value(result.asset_manifest),
  );
  assert.equal(
    validateProductionContract(result.production_contract, {
      artifacts: fixture.canonicalArtifacts,
      priorContract: director.production_contract,
      assetManifest: result.asset_manifest,
    }).contract_phase,
    'sealed',
  );
  assert.equal(result.asset_manifest.assets.length, 5);
  assert.equal(result.policy_receipt.metrics.asset_count, 5);
  for (const [index, asset] of result.asset_manifest.assets.entries()) {
    const selection = media.selections[index];
    assert.equal(asset.shot_id, selection.shot_id);
    assert.equal(asset.asset_id, selection.asset_id);
    assert.equal(asset.route, 'user-media');
    assert.deepEqual(asset.route_order, selection.route_order);
    assert.equal(asset.bytes_sha256, media.bytesSha256);
    assert.equal(asset.size_bytes, media.bytes.length);
    assert.deepEqual(asset.probe, media.actualProbe);
    assert.deepEqual(asset.rights, selection.rights);
    assert.deepEqual(asset.provenance, selection.provenance);
    assert.deepEqual(asset.crop, selection.crop);
    assert.deepEqual(asset.safe_region, selection.safe_region);
    assert.deepEqual(asset.focal_point, selection.focal_point);
    assert.deepEqual(asset.title_relation, selection.title_relation);
    assert.deepEqual(asset.consumer, selection.consumer);
    assert.equal(Object.hasOwn(asset, 'local_path'), false);
  }
  assertBoundedReceipt(
    result.policy_receipt,
    fixture.canonicalArtifacts.validationPolicy,
    result.production_contract,
  );
  assertBoundedParentEnvelope(
    result,
    fixture.canonicalArtifacts.validationPolicy,
  );
  assert.deepEqual(
    await assetsApi.validateAssetsFactsChain(result, {
      prior_contract: director.production_contract,
      director_policy_receipt: director.policy_receipt,
      canonical_artifacts: fixture.canonicalArtifacts,
      selections: media.selections,
    }),
    {
      status: 'passed',
      asset_count: 5,
      production_contract_sha256:
        result.production_contract.production_contract_sha256,
      asset_manifest_sha256:
        result.production_contract.asset_manifest_sha256,
      receipt_sha256: result.policy_receipt.receipt_sha256,
    },
  );
});

test('assets receipt contains no image, contact-sheet, media locator, private path or subjective/ReachSurge fact', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'erduo-v3-assets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = createDirectorFixture();
  const director = await compileDirector(fixture);
  const media = await createOrdinaryMediaSelections(directory, fixture);
  const assetsApi = await loadAssets();
  const result = await assetsApi.freezeAssetsFactsChain({
    prior_contract: director.production_contract,
    director_policy_receipt: director.policy_receipt,
    canonical_artifacts: fixture.canonicalArtifacts,
    selections: media.selections,
  });
  const receiptText = JSON.stringify(result.policy_receipt);
  assertNoForbiddenFacts(result.policy_receipt);
  assert.equal(receiptText.includes(directory), false);
  assert.equal(receiptText.includes(media.mediaPath), false);
  assert.equal(receiptText.toLowerCase().includes('reachsurge'), false);
  for (const subjective of [
    'beautiful',
    'premium',
    'taste',
    'aesthetic',
    'approved_visual_quality',
  ]) assert.equal(receiptText.toLowerCase().includes(subjective), false);
});

test('semantic insufficiency returns material_selection_requires_user_input without visual substitution', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'erduo-v3-assets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = createDirectorFixture();
  const director = await compileDirector(fixture);
  const media = await createOrdinaryMediaSelections(directory, fixture);
  media.selections[0].selection_basis = {
    status: 'insufficient',
    evidence_refs: [],
  };
  const assetsApi = await loadAssets();
  await expectCode(
    () => assetsApi.freezeAssetsFactsChain({
      prior_contract: director.production_contract,
      director_policy_receipt: director.policy_receipt,
      canonical_artifacts: fixture.canonicalArtifacts,
      selections: media.selections,
    }),
    'material_selection_requires_user_input',
  );
});

test('assets rejects v2 predecessors plus review, contact-sheet, preview-image and media-locator payloads', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'erduo-v3-assets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = createDirectorFixture();
  const director = await compileDirector(fixture);
  const media = await createOrdinaryMediaSelections(directory, fixture);
  const assetsApi = await loadAssets();
  const v2 = structuredClone(director.production_contract);
  v2.pipeline_contract_version = 2;
  await expectCode(
    () => assetsApi.freezeAssetsFactsChain({
      prior_contract: v2,
      director_policy_receipt: director.policy_receipt,
      canonical_artifacts: fixture.canonicalArtifacts,
      selections: media.selections,
    }),
    'pipeline_upgrade_required',
  );
  for (const injected of [
    { asset_fact_review: { status: 'approved' } },
    { contact_sheet: { artifact_id: 'sheet-1' } },
  ]) {
    await expectCode(
      () => assetsApi.freezeAssetsFactsChain({
        prior_contract: director.production_contract,
        director_policy_receipt: director.policy_receipt,
        canonical_artifacts: fixture.canonicalArtifacts,
        selections: media.selections,
        ...injected,
      }),
      'legacy_field_forbidden',
    );
  }
  for (const injected of [
    { preview_image: 'inline-image' },
    { media_locator: media.mediaPath },
  ]) {
    const selections = structuredClone(media.selections);
    Object.assign(selections[0], injected);
    await expectCode(
      () => assetsApi.freezeAssetsFactsChain({
        prior_contract: director.production_contract,
        director_policy_receipt: director.policy_receipt,
        canonical_artifacts: fixture.canonicalArtifacts,
        selections,
      }),
      'legacy_field_forbidden',
    );
  }
});

test('ReachSurge calibration metadata cannot substitute for a real ordinary-media fixture', async () => {
  const fixture = createDirectorFixture();
  const director = await compileDirector(fixture);
  const assetsApi = await loadAssets();
  const fakeSelections = fixture.canonicalArtifacts.shotPlan.shots.map((shot) => ({
    shot_id: shot.shot_id,
    asset_id: `reachsurge-${shot.shot_id}`,
    route: 'user-media',
    route_order: [
      'user-media',
      'image-generation',
      'pexels',
      'native-auxiliary',
    ],
    calibration_reference: 'reachsurge-positive-authoring-calibration',
    selection_basis: {
      status: 'sufficient',
      evidence_refs: ['reachsurge:S11'],
    },
  }));
  await expectCode(
    () => assetsApi.freezeAssetsFactsChain({
      prior_contract: director.production_contract,
      director_policy_receipt: director.policy_receipt,
      canonical_artifacts: fixture.canonicalArtifacts,
      selections: fakeSelections,
    }),
    'material_fixture_requires_real_media',
  );
});

test('new active director/assets modules do not import v2, visual review or contact-sheet chains', async () => {
  await Promise.all([loadDirector(), loadAssets(), loadProjection()]);
  const sources = await Promise.all([
    readFile(new URL(DIRECTOR_MODULE, import.meta.url), 'utf8'),
    readFile(new URL(ASSETS_MODULE, import.meta.url), 'utf8'),
    readFile(new URL(PROJECTION_MODULE, import.meta.url), 'utf8'),
  ]);
  for (const source of sources) {
    assert.equal(source.includes('validate-director-v2-chain'), false);
    assert.equal(source.includes('validate-assets-v2-chain'), false);
    assert.equal(source.includes('validate-main-review-packets'), false);
    assert.equal(source.includes('validate-style-conformance-review'), false);
    for (const term of FORBIDDEN_ACTIVE_TERMS) {
      assert.equal(source.includes(term), false, `active module contains ${term}`);
    }
  }
});

test('active v3 orchestration preserves dynamic N=5 blocks and final-summary budget', async () => {
  const bundle = createRuntimeBundle({ blockCount: 5 });
  const masterMediaSha256 = fingerprintV3Value({
    kind: 'real-master-fixture',
    block_count: 5,
  });
  const renderEvidence = createRenderEvidence({ bundle, masterMediaSha256 });
  const render = {
    master_media_sha256: renderEvidence.master_media_sha256,
    render_receipt_sha256: renderEvidence.render_receipt_sha256,
  };
  const technical = {
    status: 'passed',
    receipt_sha256: fingerprintV3Value({
      kind: 'technical-verify',
      master_media_sha256: masterMediaSha256,
    }),
    checked_media_sha256: masterMediaSha256,
    limitation_codes: [
      'pexels-key-unverified',
      'windows-unverified',
      'editor-gui-unverified',
      'user-font-license-unverified',
    ],
  };
  const result = await orchestrateScriptOnlyV3({
    run_id: 'p3-dynamic-five-blocks',
    production_contract: bundle.sealed,
    validation_policy: bundle.validationPolicy,
    policy_receipt: bundle.policyReceipt,
    block_receipts: bundle.blockReceipts,
    integration_manifest: bundle.integrationManifest,
    integration_receipt: bundle.integrationReceipt,
    no_rewrite_proof: bundle.noRewriteProof,
    render_master: async () => render,
    technical_verify: async () => technical,
    run_delivery_gate: async () => createDeliveryPhaseReceipt({
      bundle,
      render,
      technical,
    }),
  });
  assert.equal(result.block_count, 5);
  assert.equal(result.gate_receipts['source-conformance-gate'].length, 5);
  assert.equal(result.gate_receipts['runtime-seek-gate'].length, 5);
  assert.equal(result.gate_receipts['pixel-signal-gate'].length, 5);
  assert.ok(
    Buffer.byteLength(JSON.stringify(result), 'utf8')
      <= bundle.validationPolicy.context_budget.final_summary_max_bytes,
  );
});

test('P3 modules import one shared literal P1 legacy guard and never construct hidden local deny-lists', async () => {
  const contractApi = await import('./validate-production-contract.mjs');
  assert.equal(
    typeof contractApi.assertNoLegacyActiveFields,
    'function',
    'P1 must export one recursive legacy-field authority',
  );
  const sources = await Promise.all([
    readFile(new URL(DIRECTOR_MODULE, import.meta.url), 'utf8'),
    readFile(new URL(ASSETS_MODULE, import.meta.url), 'utf8'),
    readFile(new URL(PROJECTION_MODULE, import.meta.url), 'utf8'),
  ]);
  for (const source of sources) {
    assert.equal(source.includes('LEGACY_KEY_PARTS'), false);
    assert.equal(source.includes('LEGACY_KEYS'), false);
    assert.doesNotMatch(source, /parts\s*\.\s*join\s*\(/u);
    assert.doesNotMatch(source, /\.join\s*\(\s*['"][_-]['"]\s*\)/u);
    assert.match(source, /\bassertNoLegacyActiveFields\b/u);
  }
});

test('shared recursive legacy guard rejects snake, hyphen, dot and camel aliases for stable/contact/media fields', async () => {
  const fixture = createDirectorFixture({ shotCount: 2 });
  const projectionApi = await loadProjection();
  const directorApi = await loadDirector();
  const assetsApi = await loadAssets();
  const accepted = [];
  const aliases = [
    'stable_window',
    'stable-window',
    'stable.window',
    'stableWindow',
    'contact_sheet',
    'contact-sheet',
    'contact.sheet',
    'contactSheet',
    'media_locator',
    'media-locator',
    'media.locator',
    'mediaLocator',
  ];
  for (const key of aliases) {
    const projectionInput = {
      parsed_srt: structuredClone(fixture.canonicalArtifacts.parsedSrt),
      shot_plan: structuredClone(fixture.canonicalArtifacts.shotPlan),
      fps: structuredClone(fixture.canonicalArtifacts.shotPlan.fps),
    };
    projectionInput.shot_plan.shots[0][key] = {
      from_ms: 0,
      to_ms: 1,
    };
    try {
      projectionApi.compileCanonicalFrameProjection(projectionInput);
      accepted.push(`projection:${key}:accepted`);
    } catch (error) {
      if (error?.code !== 'legacy_field_forbidden') {
        accepted.push(`projection:${key}:${error?.code ?? error?.name}`);
      }
    }

    const directorFixture = createDirectorFixture({ shotCount: 2 });
    directorFixture.canonicalArtifacts.shotPlan.shots[0][key] = {
      from_ms: 0,
      to_ms: 1,
    };
    try {
      await directorApi.compileDirectorChain({
        srt_bytes: directorFixture.srtBytes,
        ...directorFixture.canonicalArtifacts,
      });
      accepted.push(`director:${key}:accepted`);
    } catch (error) {
      if (error?.code !== 'legacy_field_forbidden') {
        accepted.push(`director:${key}:${error?.code ?? error?.name}`);
      }
    }

    const assetsInput = {
      prior_contract: {
        pipeline_contract_version: 3,
        authoring_topology_id: 'script-only-authoring-cluster-v1',
        [key]: {},
      },
      canonical_artifacts: fixture.canonicalArtifacts,
      selections: [],
    };
    try {
      await assetsApi.freezeAssetsFactsChain(assetsInput);
      accepted.push(`assets:${key}:accepted`);
    } catch (error) {
      if (error?.code !== 'legacy_field_forbidden') {
        accepted.push(`assets:${key}:${error?.code ?? error?.name}`);
      }
    }
  }
  assert.deepEqual(accepted, []);
});

test('semantic insufficiency wins before media I/O even when the locator is empty or missing', async () => {
  const fixture = createDirectorFixture({ shotCount: 2 });
  const director = await compileDirector(fixture);
  const assetsApi = await loadAssets();
  const source = await readFile(new URL(ASSETS_MODULE, import.meta.url), 'utf8');
  const selectionBeforeIo =
    source.indexOf('normalizeSelectionBasis(selection.selection_basis)')
      < source.indexOf('actualMediaFacts(selection)');
  const wrongCodes = [];
  for (const localPath of ['', '/definitely/missing/p3-material.ppm']) {
    const selections = fixture.canonicalArtifacts.shotPlan.shots.map(
      (shot, index) => ({
        shot_id: shot.shot_id,
        asset_id: `insufficient-${String(index + 1).padStart(3, '0')}`,
        route: 'user-media',
        route_order: [
          'user-media',
          'image-generation',
          'pexels',
          'native-auxiliary',
        ],
        local_path: localPath,
        selection_basis: { status: 'insufficient', evidence_refs: [] },
        rights: {
          status: 'cleared',
          basis: 'user-owned-fixture',
          evidence_sha256: fingerprintV3Value({ shot_id: shot.shot_id }),
        },
        provenance: {
          origin: 'user-media',
          source_id: `insufficient-source-${index + 1}`,
        },
        crop: { x: 0, y: 0, width: 1, height: 1 },
        safe_region: { x: 0, y: 0, width: 1, height: 1 },
        focal_point: { x: 0, y: 0 },
        title_relation: { anchor: 'top-left', subject_clearance_px: 0 },
        consumer: {
          consumer_id: `primary-${shot.shot_id}`,
          role: 'ordinary-primary',
          element: 'img',
          fit: 'cover',
        },
      }),
    );
    try {
      await assetsApi.freezeAssetsFactsChain({
        prior_contract: director.production_contract,
        director_policy_receipt: director.policy_receipt,
        canonical_artifacts: fixture.canonicalArtifacts,
        selections,
      });
      wrongCodes.push(`${localPath || '<empty>'}:accepted`);
    } catch (error) {
      if (error?.code !== 'material_selection_requires_user_input') {
        wrongCodes.push(
          `${localPath || '<empty>'}:${error?.code ?? error?.name}`,
        );
      }
    }
  }
  assert.equal(
    selectionBeforeIo,
    true,
    'selection sufficiency must be checked before any material I/O',
  );
  assert.deepEqual(wrongCodes, []);
});

test('canonical projection matches P1 Set coverage when one SRT cue spans adjacent semantic shots', async () => {
  const fixture = createDirectorFixture({ shotCount: 2 });
  const artifacts = structuredClone(fixture.canonicalArtifacts);
  artifacts.parsedSrt.cues = [{
    cue_id: 'Q001',
    start_ms: 0,
    end_ms: 8000,
    text: '一个字幕窗口可以跨越两个连续语义镜头。',
  }];
  artifacts.shotPlan.parsed_srt_sha256 =
    fingerprintV3Value(artifacts.parsedSrt);
  artifacts.shotPlan.shots[0].cue_ids = ['Q001'];
  artifacts.shotPlan.shots[1].cue_ids = ['Q001'];
  const shotPlanCore = { ...artifacts.shotPlan };
  delete shotPlanCore.shot_plan_sha256;
  artifacts.shotPlan.shot_plan_sha256 =
    fingerprintV3Value(shotPlanCore);
  artifacts.projection.parsed_srt_sha256 =
    fingerprintV3Value(artifacts.parsedSrt);
  artifacts.projection.shot_plan_sha256 =
    artifacts.shotPlan.shot_plan_sha256;
  artifacts.projection.shots[0].cue_ids = ['Q001'];
  artifacts.projection.shots[1].cue_ids = ['Q001'];

  assert.doesNotThrow(() => compileProductionContract({
    contract_phase: 'director',
    ...artifacts,
  }));
  const projectionApi = await loadProjection();
  const projection = projectionApi.compileCanonicalFrameProjection({
    parsed_srt: artifacts.parsedSrt,
    shot_plan: artifacts.shotPlan,
    fps: artifacts.shotPlan.fps,
  });
  assert.deepEqual(
    projection.shots.map((shot) => shot.cue_ids),
    [['Q001'], ['Q001']],
  );
});

async function createDirectorReceiptAssetsFixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'erduo-v3-assets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = createDirectorFixture({ shotCount: 2 });
  const director = await compileDirector(fixture);
  const media = await createOrdinaryMediaSelections(directory, fixture);
  const assetsApi = await loadAssets();
  return {
    assetsApi,
    director,
    base: {
      prior_contract: director.production_contract,
      director_policy_receipt: director.policy_receipt,
      canonical_artifacts: fixture.canonicalArtifacts,
      selections: media.selections,
    },
  };
}

test('assets rejects a missing director policy receipt before any reseal', async (t) => {
  const { assetsApi, base } = await createDirectorReceiptAssetsFixture(t);
  const missingReceipt = structuredClone(base);
  delete missingReceipt.director_policy_receipt;
  await assert.rejects(
    () => assetsApi.freezeAssetsFactsChain(missingReceipt),
    (error) => error?.code === 'assets_director_receipt_required',
  );
});

test('assets accepts the exact passed director policy receipt and binds its predecessor', async (t) => {
  const {
    assetsApi,
    base,
  } = await createDirectorReceiptAssetsFixture(t);
  const result = await assetsApi.freezeAssetsFactsChain(base);
  assert.equal(result.production_contract.contract_phase, 'sealed');
  assert.equal(
    result.production_contract.prior_contract_sha256,
    base.prior_contract.production_contract_sha256,
  );
});

test('assets rejects a forged director policy receipt self-hash', async (t) => {
  const {
    assetsApi,
    base,
    director,
  } = await createDirectorReceiptAssetsFixture(t);
  const forged = structuredClone(director.policy_receipt);
  forged.receipt_sha256 = 'f'.repeat(64);
  await assert.rejects(
    () => assetsApi.freezeAssetsFactsChain({
      ...base,
      director_policy_receipt: forged,
    }),
    (error) => error?.code === 'gate_receipt_hash_mismatch',
  );
});

test('assets rejects a director policy receipt with the wrong scope', async (t) => {
  const {
    assetsApi,
    base,
    director,
  } = await createDirectorReceiptAssetsFixture(t);
  const wrongScope = structuredClone(director.policy_receipt);
  wrongScope.scope_id = 'another-director';
  const wrongScopeCore = { ...wrongScope };
  delete wrongScopeCore.receipt_sha256;
  wrongScope.receipt_sha256 = fingerprintV3Value(wrongScopeCore);
  await assert.rejects(
    () => assetsApi.freezeAssetsFactsChain({
      ...base,
      director_policy_receipt: wrongScope,
    }),
    (error) => error?.code === 'assets_director_receipt_invalid',
  );
});

test('assets rejects a director policy receipt bound to a different contract', async (t) => {
  const {
    assetsApi,
    base,
    director,
  } = await createDirectorReceiptAssetsFixture(t);
  const wrongContract = structuredClone(director.policy_receipt);
  wrongContract.production_contract_sha256 = 'e'.repeat(64);
  wrongContract.input_bindings.production_contract_sha256 =
    wrongContract.production_contract_sha256;
  const wrongContractCore = { ...wrongContract };
  delete wrongContractCore.receipt_sha256;
  wrongContract.receipt_sha256 = fingerprintV3Value(wrongContractCore);
  await assert.rejects(
    () => assetsApi.freezeAssetsFactsChain({
      ...base,
      director_policy_receipt: wrongContract,
    }),
    (error) => error?.code === 'gate_receipt_contract_unbound',
  );
});

test('stage yaml default prompts return the canonical contract artifacts as well as bounded receipts', async () => {
  const [directorYaml, assetsYaml] = await Promise.all([
    readFile(new URL('../stages/broll-director/agents/openai.yaml', import.meta.url), 'utf8'),
    readFile(new URL('../stages/broll-assets/agents/openai.yaml', import.meta.url), 'utf8'),
  ]);
  const directorReturn = directorYaml.split(/\breturn\b/iu).at(-1);
  const assetsReturn = assetsYaml.split(/\breturn\b/iu).at(-1);
  const missing = [];
  for (const term of ['contract', 'receipt', 'envelope']) {
    if (!new RegExp(`\\b${term}\\b`, 'iu').test(directorReturn)) {
      missing.push(`director:${term}`);
    }
  }
  for (const term of ['manifest', 'contract', 'receipt']) {
    if (!new RegExp(`\\b${term}\\b`, 'iu').test(assetsReturn)) {
      missing.push(`assets:${term}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('director stage freezes creative directives before assets facts and scoped block packets', async () => {
  const stage = await readFile(
    new URL('../stages/broll-director/SKILL.md', import.meta.url),
    'utf8',
  );
  const requiredClauses = [
    ['creative directive', /Freeze a closed `creative_directive`/u],
    ['every-shot attention plan', /Every shot has one compact\s+`attention_plan`/u],
    ['content-conditional DACNAY modules', /Enable DACNAY-derived\s+modules only when the current content calls for them/u],
    ['ordinary-shot exemption', /without invented photography, culture or title acts/u],
    ['relationship rather than template freeze', /not a fixed HTML,\s+CSS, DOM, visual skin, prompt recipe or F01–F09\/G01–G10 template/u],
    ['Builder freedom', /Builder keeps\s+freedom to choose the concrete composition, material treatment and motion\s+implementation/u],
    ['assets before parent packet', /Assets must reopen this exact\s+contract and freeze material facts before the parent compiles a Block Creative\s+Commission and its scoped block creative packet/u],
    ['raw parent payload prohibition', /never raw director\/assets contracts, raw\s+SRT, source, image, prompt or reference payloads/u],
    ['cross-block fact prohibition', /never facts belonging\s+to another block/u],
    ['no visual approval revival', /Do not create reviewer agents, visual approval packets,\s+contact pages, a visual\/aesthetic pass or producer self-approval/u],
    ['technical gates only', /Five gates\s+only test technical and contract facts; no stage may restore a legacy review\s+authority/u],
  ];
  for (const [label, pattern] of requiredClauses) {
    assert.match(stage, pattern, `director stage must retain ${label}`);
  }
  for (const legacyTerm of [
    'shot_plan_review',
    'asset_fact_review',
    'style_conformance_review',
    'source_code_review',
    'final_frame_review',
    'main_review_refs',
    'contact_sheet',
  ]) {
    assert.equal(
      stage.includes(legacyTerm),
      false,
      `director stage must not revive ${legacyTerm}`,
    );
  }
});
