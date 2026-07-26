import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { REAL_LIMITATION_CODES } from './delivery-report.mjs';
import { verifyDeliveryMedia } from './delivery-media-gate.mjs';
import { verifyIntegratedMaster } from './integrate-script-only-v3.mjs';
import {
  createGateReceipt,
  fingerprintV3Value,
  validateGateReceipt,
  validateValidationPolicy,
} from './validate-production-contract.mjs';

export class ScriptOnlyRenderError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ScriptOnlyRenderError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new ScriptOnlyRenderError(code, message);
};

const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function outputExists(localPath) {
  try {
    await lstat(localPath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    fail('render_output_unreadable', 'Render output path cannot be inspected.');
  }
}

function validateProfile(profile, productionContract, integrationManifest) {
  if (
    !profile
    || profile.schema_version !== 1
    || profile.artifact_kind !== 'delivery-profile'
    || profile.width !== 3840
    || profile.height !== 2160
    || profile.codec !== 'h264'
    || !profile.fps
    || profile.fps.numerator !== integrationManifest.fps?.numerator
    || profile.fps.denominator !== integrationManifest.fps?.denominator
    || fingerprintV3Value(profile) !== productionContract.delivery_profile_sha256
  ) fail('delivery_profile_mismatch', 'Render requires the exact sealed 4K delivery profile.');
}

function validateIntegrationAuthority({
  productionContract,
  validationPolicy,
  integrationManifest,
  noRewriteProof,
  integrationReceipt,
}) {
  validateGateReceipt(integrationReceipt, {
    productionContract,
    validationPolicy,
  });
  if (
    integrationReceipt.gate !== 'integration-delivery-gate'
    || integrationReceipt.phase !== 'integration'
    || integrationReceipt.status !== 'passed'
    || integrationReceipt.scope_id !== 'integration'
    || integrationManifest.production_contract_sha256
      !== productionContract.production_contract_sha256
    || integrationReceipt.input_bindings.integration_manifest_sha256
      !== integrationManifest.integration_manifest_sha256
    || integrationReceipt.input_bindings.no_rewrite_proof_sha256
      !== noRewriteProof.no_rewrite_proof_sha256
    || integrationReceipt.input_bindings.integrated_source_sha256
      !== integrationManifest.integrated_source_sha256
    || integrationReceipt.input_bindings.master_wrapper_sha256
      !== integrationManifest.master_wrapper_sha256
  ) fail('render_integration_authority_invalid', 'Render input is not the current passed integration.');
}

function deliveryBindings({
  productionContract,
  integrationReceipt,
  integrationManifest,
  noRewriteProof,
  render,
  technical,
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
    ordered_block_receipt_set_sha256:
      integrationReceipt.input_bindings.ordered_block_receipt_set_sha256,
    master_wrapper_sha256: integrationManifest.master_wrapper_sha256,
    integration_manifest_sha256: integrationManifest.integration_manifest_sha256,
    no_rewrite_proof_sha256: noRewriteProof.no_rewrite_proof_sha256,
    integrated_source_sha256: integrationManifest.integrated_source_sha256,
    renderer_version_sha256:
      integrationReceipt.input_bindings.renderer_version_sha256,
    hyperframes_version_sha256:
      integrationReceipt.input_bindings.hyperframes_version_sha256,
    integration_receipt_sha256: integrationReceipt.receipt_sha256,
    render_receipt_sha256: render.render_receipt_sha256,
    technical_verify_receipt_sha256: technical.receipt_sha256,
    master_media_sha256: render.master_media_sha256,
  };
}

export async function renderAndVerifyScriptOnlyV3({
  production_contract: productionContract,
  validation_policy: validationPolicy,
  delivery_profile: deliveryProfile,
  mode,
  integrated_root: integratedRoot,
  integration_manifest: integrationManifest,
  no_rewrite_proof: noRewriteProof,
  integration_receipt: integrationReceipt,
  output_file: outputFile,
  render_master: renderMaster,
  delivery_adapters: deliveryAdapters = {},
}) {
  validateValidationPolicy(validationPolicy);
  if (productionContract?.contract_phase !== 'sealed') {
    fail('render_contract_unsealed', 'Render requires the sealed v3 production contract.');
  }
  if (!['faceless', 'talking-head'].includes(mode)) {
    fail('render_mode_invalid', 'Render mode is invalid.');
  }
  if (
    typeof integratedRoot !== 'string'
    || !path.isAbsolute(integratedRoot)
    || typeof outputFile !== 'string'
    || !path.isAbsolute(outputFile)
    || typeof renderMaster !== 'function'
  ) fail('render_input_invalid', 'Render paths or adapter are invalid.');
  validateProfile(deliveryProfile, productionContract, integrationManifest);
  validateIntegrationAuthority({
    productionContract,
    validationPolicy,
    integrationManifest,
    noRewriteProof,
    integrationReceipt,
  });
  await verifyIntegratedMaster({
    output_root: integratedRoot,
    integration_manifest: integrationManifest,
    no_rewrite_proof: noRewriteProof,
  });
  if (await outputExists(outputFile)) {
    fail('stale_delivery_output', 'Final output already exists; file existence is not render authority.');
  }

  let renderCalls = 0;
  renderCalls += 1;
  await renderMaster({
    entry_path: path.join(integratedRoot, 'index.html'),
    output_path: outputFile,
    width: deliveryProfile.width,
    height: deliveryProfile.height,
    fps: structuredClone(deliveryProfile.fps),
    duration_ms: integrationManifest.duration_ms,
    network_enabled: false,
  });
  if (renderCalls !== 1 || !await outputExists(outputFile)) {
    fail('render_failed', 'Exactly one final render must create the master.');
  }
  const masterBytes = await readFile(outputFile);
  if (!masterBytes.length) fail('render_failed', 'Final render is empty.');
  const masterMediaSha256 = hashBytes(masterBytes);
  const mediaVerification = await verifyDeliveryMedia({
    schema_version: 1,
    artifacts: [{
      artifact_id: 'MASTER',
      kind: mode === 'talking-head' ? 'talking-head-master' : 'faceless-master',
      expected: {
        duration_ms: integrationManifest.duration_ms,
        width: deliveryProfile.width,
        height: deliveryProfile.height,
        frame_rate: structuredClone(deliveryProfile.fps),
      },
    }],
  }, async () => outputFile, deliveryAdapters);

  const renderCore = {
    production_contract_sha256: productionContract.production_contract_sha256,
    integration_manifest_sha256: integrationManifest.integration_manifest_sha256,
    no_rewrite_proof_sha256: noRewriteProof.no_rewrite_proof_sha256,
    integrated_source_sha256: integrationManifest.integrated_source_sha256,
    delivery_profile_sha256: productionContract.delivery_profile_sha256,
    renderer_version_sha256:
      integrationReceipt.input_bindings.renderer_version_sha256,
    hyperframes_version_sha256:
      integrationReceipt.input_bindings.hyperframes_version_sha256,
    master_media_sha256: masterMediaSha256,
  };
  const render = {
    master_media_sha256: masterMediaSha256,
    render_receipt_sha256: fingerprintV3Value(renderCore),
  };
  const technicalCore = {
    status: 'passed',
    checked_media_sha256: masterMediaSha256,
    media_verification_sha256: mediaVerification.verification_sha256,
    integration_manifest_sha256: integrationManifest.integration_manifest_sha256,
    delivery_profile_sha256: productionContract.delivery_profile_sha256,
    renderer_version_sha256:
      integrationReceipt.input_bindings.renderer_version_sha256,
    hyperframes_version_sha256:
      integrationReceipt.input_bindings.hyperframes_version_sha256,
    limitation_codes: REAL_LIMITATION_CODES,
  };
  const technical = {
    status: 'passed',
    receipt_sha256: fingerprintV3Value(technicalCore),
    checked_media_sha256: masterMediaSha256,
    limitation_codes: [...REAL_LIMITATION_CODES],
  };
  const deliveryReceipt = createGateReceipt({
    gate: 'integration-delivery-gate',
    phase: 'delivery',
    scope_id: 'delivery',
    productionContract,
    input_bindings: deliveryBindings({
      productionContract,
      integrationReceipt,
      integrationManifest,
      noRewriteProof,
      render,
      technical,
    }),
    status: 'passed',
    hard_failure_codes: [],
    warning_codes: [],
    metrics: {
      render_count: renderCalls,
      master_bytes: masterBytes.length,
      duration_ms: integrationManifest.duration_ms,
      width: deliveryProfile.width,
      height: deliveryProfile.height,
      fps_numerator: deliveryProfile.fps.numerator,
      fps_denominator: deliveryProfile.fps.denominator,
      decoded: true,
    },
    cache: {
      status: 'bypass',
      cache_key_sha256: fingerprintV3Value({
        integrated_source_sha256: integrationManifest.integrated_source_sha256,
        delivery_profile_sha256: productionContract.delivery_profile_sha256,
        renderer_version_sha256:
          integrationReceipt.input_bindings.renderer_version_sha256,
        hyperframes_version_sha256:
          integrationReceipt.input_bindings.hyperframes_version_sha256,
      }),
    },
    validationPolicy,
  });
  return {
    render,
    technical,
    delivery_receipt: deliveryReceipt,
    media_verification: mediaVerification,
  };
}
