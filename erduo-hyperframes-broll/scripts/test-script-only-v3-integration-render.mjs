import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import {
  integrateScriptOnlyV3,
  verifyIntegratedMaster,
} from './integrate-script-only-v3.mjs';
import { renderAndVerifyScriptOnlyV3 } from './render-script-only-v3.mjs';
import {
  createBlockGateFixture,
  createSyntheticReceiptChain,
  rehashBlock,
} from './test-support-script-only-v3-block-gates.mjs';
import {
  fingerprintV3Value,
  validateGateReceipt,
} from './validate-production-contract.mjs';

const execFile = promisify(execFileCallback);
let root;
let fixture;
let deliveryProfile;

function rehashContract(contract, profile) {
  const core = structuredClone(contract);
  delete core.production_contract_sha256;
  core.delivery_profile_sha256 = fingerprintV3Value(profile);
  return {
    ...core,
    production_contract_sha256: fingerprintV3Value(core),
  };
}

function bindFixtureTo4K(current) {
  const next = current;
  deliveryProfile = {
    schema_version: 1,
    artifact_kind: 'delivery-profile',
    width: 3840,
    height: 2160,
    fps: { numerator: 25, denominator: 1 },
    codec: 'h264',
  };
  next.productionContract = rehashContract(next.productionContract, deliveryProfile);
  next.canonicalArtifacts.deliveryProfile = structuredClone(deliveryProfile);
  next.blocks = next.blocks.map((block) => {
    const updated = structuredClone(block);
    updated.block_manifest.production_contract_sha256 =
      next.productionContract.production_contract_sha256;
    return rehashBlock(updated);
  });
  return next;
}

function blockReceipts(current) {
  return current.blocks.map((block) => {
    const chain = createSyntheticReceiptChain({ fixture: current, block });
    return {
      block_id: block.block_manifest.block_id,
      gate_receipts: [chain.source, chain.runtime, chain.pixel],
    };
  });
}

async function integrate(outputRoot) {
  return integrateScriptOnlyV3({
    production_contract: fixture.productionContract,
    validation_policy: fixture.validationPolicy,
    shot_plan: fixture.canonicalArtifacts.shotPlan,
    blocks: fixture.blocks,
    block_receipts: blockReceipts(fixture),
    output_root: outputRoot,
    renderer_version: fixture.validationPolicy.tool_bindings.renderer_version,
    hyperframes_version: fixture.validationPolicy.tool_bindings.hyperframes_version,
  });
}

test.before(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'erduo-v3-p5-'));
  fixture = bindFixtureTo4K(await createBlockGateFixture({
    root: path.join(root, 'block-fixture'),
    mode: 'faceless',
    blockCount: 2,
  }));
});

test.after(async () => {
  await rm(root, { recursive: true, force: true });
});

test('integrates validated block bytes unchanged, renders once at 4K, and verifies actual media', async () => {
  const integratedRoot = path.join(root, 'integrated-main');
  const result = await integrate(integratedRoot);
  assert.equal(result.integration_manifest.ordered_block_ids.length, 2);
  assert.equal(result.no_rewrite_proof.status, 'passed');
  assert.deepEqual(validateGateReceipt(result.integration_receipt, {
    productionContract: fixture.productionContract,
    validationPolicy: fixture.validationPolicy,
  }), {
    status: 'passed',
    gate: 'integration-delivery-gate',
    phase: 'integration',
    scope_id: 'integration',
    receipt_sha256: result.integration_receipt.receipt_sha256,
  });
  const original = Buffer.from(
    fixture.blocks[0].source_bundle.files[0].content,
    'utf8',
  );
  const copied = await readFile(path.join(
    integratedRoot,
    'blocks',
    'B001',
    fixture.blocks[0].source_bundle.files[0].relative_path,
  ));
  assert.equal(copied.equals(original), true);

  const outputFile = path.join(root, 'final-4k.mp4');
  let renderCalls = 0;
  const delivery = await renderAndVerifyScriptOnlyV3({
    production_contract: fixture.productionContract,
    validation_policy: fixture.validationPolicy,
    delivery_profile: deliveryProfile,
    mode: 'faceless',
    integrated_root: integratedRoot,
    integration_manifest: result.integration_manifest,
    no_rewrite_proof: result.no_rewrite_proof,
    integration_receipt: result.integration_receipt,
    output_file: outputFile,
    render_master: async ({ output_path: outputPath, duration_ms: durationMs }) => {
      renderCalls += 1;
      await execFile('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=0x172033:s=3840x2160:d=${durationMs / 1000}:r=25`,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '40',
        '-pix_fmt',
        'yuv420p',
        outputPath,
      ]);
    },
  });
  assert.equal(renderCalls, 1);
  assert.equal(delivery.media_verification.artifacts[0].width, 3840);
  assert.equal(delivery.media_verification.artifacts[0].height, 2160);
  assert.equal(delivery.technical.checked_media_sha256, delivery.render.master_media_sha256);
  assert.deepEqual(validateGateReceipt(delivery.delivery_receipt, {
    productionContract: fixture.productionContract,
    validationPolicy: fixture.validationPolicy,
  }), {
    status: 'passed',
    gate: 'integration-delivery-gate',
    phase: 'delivery',
    scope_id: 'delivery',
    receipt_sha256: delivery.delivery_receipt.receipt_sha256,
  });
  const parentSafe = JSON.stringify(delivery);
  for (const forbidden of [
    'source_code_review',
    'main_review',
    'contact_sheet',
    'ReachSurge',
    '<!doctype',
    integratedRoot,
    outputFile,
  ]) assert.equal(parentSafe.includes(forbidden), false);
});

test('fails closed when integration bytes change or a stale output already exists', async () => {
  const integratedRoot = path.join(root, 'integrated-tamper');
  const result = await integrate(integratedRoot);
  const changed = path.join(integratedRoot, 'blocks', 'B001', 'styles.css');
  await writeFile(changed, `${await readFile(changed, 'utf8')}\n/* changed */\n`);
  await assert.rejects(() => verifyIntegratedMaster({
    output_root: integratedRoot,
    integration_manifest: result.integration_manifest,
    no_rewrite_proof: result.no_rewrite_proof,
  }), (error) => error.code === 'integrator_rewrite_detected');

  const cleanRoot = path.join(root, 'integrated-stale');
  const clean = await integrate(cleanRoot);
  const outputFile = path.join(root, 'occupied.mp4');
  await writeFile(outputFile, 'stale');
  await assert.rejects(() => renderAndVerifyScriptOnlyV3({
    production_contract: fixture.productionContract,
    validation_policy: fixture.validationPolicy,
    delivery_profile: deliveryProfile,
    mode: 'faceless',
    integrated_root: cleanRoot,
    integration_manifest: clean.integration_manifest,
    no_rewrite_proof: clean.no_rewrite_proof,
    integration_receipt: clean.integration_receipt,
    output_file: outputFile,
    render_master: async () => assert.fail('stale output must stop before render'),
  }), (error) => error.code === 'stale_delivery_output');
});
