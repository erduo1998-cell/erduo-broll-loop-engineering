#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTHORING_TOPOLOGY_ID,
  createScopedBlockCreativePacketCore,
  PIPELINE_CONTRACT_VERSION,
  ScriptOnlyV3ContractError,
  VALIDATION_POLICY_ID,
  fingerprintV3Value,
  validateScopedBlockCreativePacket,
  validateProductionContract,
} from './validate-production-contract.mjs';

export function compileProductionContract({
  contract_phase,
  parsedSrt,
  shotPlan,
  designSystem,
  componentRegistry,
  validationPolicy,
  referenceStyleProfile,
  fontPackage,
  projection,
  deliveryProfile,
  priorContract,
  assetManifest,
}) {
  const artifacts = {
    parsedSrt,
    shotPlan,
    designSystem,
    componentRegistry,
    validationPolicy,
    referenceStyleProfile,
    fontPackage,
    projection,
    deliveryProfile,
  };
  if (contract_phase === 'director' && (priorContract !== undefined || assetManifest !== undefined)) {
    throw new ScriptOnlyV3ContractError(
      'director_contract_asset_forbidden',
      'Director contract cannot contain an asset hash or predecessor placeholder.',
    );
  }
  if (contract_phase === 'sealed' && (!priorContract || !assetManifest)) {
    throw new ScriptOnlyV3ContractError(
      'sealed_contract_inputs_required',
      'Sealed contract requires the actual director contract and asset manifest.',
    );
  }
  if (!['director', 'sealed'].includes(contract_phase)) {
    throw new ScriptOnlyV3ContractError(
      'production_contract_phase_invalid',
      'Production contract phase must be director or sealed.',
    );
  }
  const core = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    contract_phase,
    parsed_srt_sha256: fingerprintV3Value(parsedSrt),
    shot_plan_sha256: shotPlan?.shot_plan_sha256,
    design_system_sha256: designSystem?.design_system_sha256,
    component_registry_sha256: componentRegistry?.component_registry_sha256,
    validation_policy_sha256: validationPolicy?.validation_policy_sha256,
    reference_style_profile_sha256: fingerprintV3Value(referenceStyleProfile),
    font_package_sha256: fingerprintV3Value(fontPackage),
    projection_sha256: fingerprintV3Value(projection),
    delivery_profile_sha256: fingerprintV3Value(deliveryProfile),
    ...(contract_phase === 'sealed' ? {
      prior_contract_sha256: priorContract.production_contract_sha256,
      asset_manifest_sha256: fingerprintV3Value(assetManifest),
    } : {}),
  };
  const contract = {
    ...core,
    production_contract_sha256: fingerprintV3Value(core),
  };
  validateProductionContract(contract, {
    artifacts,
    priorContract,
    assetManifest,
  });
  return contract;
}

export function compileScopedBlockCreativePacket({
  block,
  productionContract,
  artifacts,
  priorContract,
  assetManifest,
} = {}) {
  const core = createScopedBlockCreativePacketCore({
    block,
    productionContract,
    artifacts,
    priorContract,
    assetManifest,
  });
  const packet = {
    ...core,
    packet_sha256: fingerprintV3Value(core),
  };
  validateScopedBlockCreativePacket(packet, {
    block,
    productionContract,
    artifacts,
    priorContract,
    assetManifest,
  });
  return packet;
}

function usage() {
  return 'Usage: node compile-production-contract.mjs <director|sealed> <canonical-artifacts.json> [--prior <director-contract.json> --assets <asset-manifest.json>]';
}

async function main(argv) {
  if (argv.includes('--help')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const [contractPhase, artifactsPath] = argv;
  const priorIndex = argv.indexOf('--prior');
  const assetsIndex = argv.indexOf('--assets');
  if (!contractPhase || !artifactsPath) {
    throw new ScriptOnlyV3ContractError('usage', usage());
  }
  const [artifacts, priorContract, assetManifest] = await Promise.all([
    readFile(path.resolve(artifactsPath), 'utf8').then(JSON.parse),
    priorIndex < 0 ? undefined : readFile(path.resolve(argv[priorIndex + 1]), 'utf8').then(JSON.parse),
    assetsIndex < 0 ? undefined : readFile(path.resolve(argv[assetsIndex + 1]), 'utf8').then(JSON.parse),
  ]);
  process.stdout.write(`${JSON.stringify(compileProductionContract({
    contract_phase: contractPhase,
    ...artifacts,
    priorContract,
    assetManifest,
  }))}\n`);
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    const known = error instanceof ScriptOnlyV3ContractError;
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      code: known ? error.code : 'production_contract_compile_failed',
      message: known ? error.message : 'Production contract compilation failed.',
    })}\n`);
    process.exitCode = known && error.code === 'usage' ? 64 : 2;
  }
}
