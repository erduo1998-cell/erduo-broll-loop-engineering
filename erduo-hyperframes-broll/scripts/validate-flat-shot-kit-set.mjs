#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  fingerprintArtifactValue,
  PIPELINE_CONTRACT_VERSION,
  validateArtifactManifest,
} from './artifact-manifest.mjs';
import {
  FlatShotKitError,
  validateFlatShotKit,
} from './validate-flat-shot-kit.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const ARTIFACT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const SHOT_ID = /^S\d{3}$/u;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const EXIT_INVALID = 2;
const EXIT_READ = 3;
const EXIT_USAGE = 64;

export class FlatShotKitSetError extends Error {
  constructor(code, message, field) {
    super(message);
    this.name = 'FlatShotKitSetError';
    this.code = code;
    if (field) this.field = field;
  }
}

function fail(code, message, field) {
  throw new FlatShotKitSetError(code, message, field);
}

function exact(value, fields, code = 'invalid_shape', field = '$') {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, 'Flat shot kit set record has an invalid shape.', field);
  }
}

function asBytes(value, field) {
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value);
  fail('resolved_bytes_required', 'Resolved artifact bytes are required.', field);
}

function hashBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseJsonBytes(value, field) {
  const bytes = asBytes(value, field);
  if (bytes.length === 0 || bytes.length > MAX_JSON_BYTES) {
    fail('artifact_size_invalid', 'Resolved JSON artifact has an invalid byte length.', field);
  }
  try {
    return { bytes, document: JSON.parse(bytes.toString('utf8')) };
  } catch {
    fail('artifact_json_invalid', 'Resolved artifact is not valid JSON.', field);
  }
}

function sameRaster(a, b) {
  return a.width === b.width && a.height === b.height;
}

function validateRaster(value) {
  exact(value, ['width', 'height'], 'invalid_target_raster', '$.target_raster');
  if (!Number.isSafeInteger(value.width) || value.width < 1 || value.width > 16384
    || !Number.isSafeInteger(value.height) || value.height < 1 || value.height > 16384) {
    fail('invalid_target_raster', 'Target raster is invalid.', '$.target_raster');
  }
}

function expectedShotId(index) {
  return `S${String(index + 1).padStart(3, '0')}`;
}

function validateDesignSliceShotOrder(designSlice) {
  if (designSlice?.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION) {
    fail('pipeline_upgrade_required', 'Resolved design slice must use pipeline contract version 2.', '$resolved.design_slice.pipeline_contract_version');
  }
  if (!Array.isArray(designSlice.shots) || designSlice.shots.length < 1 || designSlice.shots.length > 999) {
    fail('design_slice_invalid', 'Resolved design slice must contain current shots.', '$resolved.design_slice.shots');
  }
  return designSlice.shots.map((shot, index) => {
    const expected = expectedShotId(index);
    if (!shot || typeof shot !== 'object' || !SHOT_ID.test(shot.shot_id ?? '') || shot.shot_id !== expected) {
      fail('design_shot_order_invalid', 'Design slice shots must be ordered S001..SN.', `$.resolved.design_slice.shots[${index}].shot_id`);
    }
    return shot.shot_id;
  });
}

function normalizeKitArtifacts(value) {
  if (!(value instanceof Map)) {
    fail('resolved_kits_required', 'kitArtifacts must be a Map of artifact IDs to actual bytes.', '$resolved.kit_artifacts');
  }
  return value;
}

export async function validateFlatShotKitSet(index, {
  directorManifest,
  designSliceBytes,
  kitArtifacts,
} = {}) {
  if (index?.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION) {
    fail('pipeline_upgrade_required', 'Flat shot kit sets must use pipeline contract version 2.', '$.pipeline_contract_version');
  }
  exact(index, [
    'schema_version',
    'pipeline_contract_version',
    'director_manifest_sha256',
    'shot_plan_sha256',
    'design_slice_sha256',
    'target_raster',
    'shot_count',
    'kits',
  ]);
  if (index.schema_version !== 1 || !SHA256.test(index.director_manifest_sha256 ?? '')
    || !SHA256.test(index.shot_plan_sha256 ?? '')
    || !SHA256.test(index.design_slice_sha256 ?? '')) {
    fail('invalid_identity', 'Flat shot kit set identity is invalid.');
  }
  validateRaster(index.target_raster);
  if (!Number.isSafeInteger(index.shot_count) || index.shot_count < 1 || index.shot_count > 999
    || !Array.isArray(index.kits) || index.kits.length !== index.shot_count) {
    fail('shot_coverage_invalid', 'Shot count must equal the complete kit record count.', '$.kits');
  }

  if (!directorManifest || typeof directorManifest !== 'object' || Array.isArray(directorManifest)) {
    fail('director_manifest_required', 'The actual director manifest is required.', '$resolved.director_manifest');
  }
  await validateArtifactManifest(directorManifest, { expectedStage: 'director' });
  if (directorManifest.manifest_sha256 !== index.director_manifest_sha256) {
    fail('director_manifest_unbound', 'Kit set does not bind the resolved director manifest.', '$.director_manifest_sha256');
  }
  const designRecords = directorManifest.artifacts.filter((record) => record.artifact_id === 'design-slice');
  const planRecords = directorManifest.artifacts.filter((record) => record.artifact_id === 'shot-plan');
  if (designRecords.length !== 1) {
    fail('director_design_slice_missing', 'Director manifest must contain exactly one design-slice artifact.', '$resolved.director_manifest.artifacts');
  }
  if (planRecords.length !== 1) {
    fail('director_shot_plan_missing', 'Director manifest must contain exactly one shot-plan artifact.', '$resolved.director_manifest.artifacts');
  }

  const resolvedDesign = parseJsonBytes(designSliceBytes, '$resolved.design_slice');
  const resolvedDesignHash = hashBytes(resolvedDesign.bytes);
  const designRecord = designRecords[0];
  if (resolvedDesignHash !== index.design_slice_sha256
    || designRecord.sha256 !== resolvedDesignHash
    || designRecord.size_bytes !== resolvedDesign.bytes.length) {
    fail('design_slice_hash_mismatch', 'Resolved design-slice bytes do not match the set and director manifest.', '$.design_slice_sha256');
  }
  const designShotIds = validateDesignSliceShotOrder(resolvedDesign.document);
  if (resolvedDesign.document.plan_sha256 !== index.shot_plan_sha256
    || planRecords[0].sha256 !== index.shot_plan_sha256) {
    fail('shot_plan_unbound', 'Kit set, design slice and director manifest must bind one shot plan.', '$.shot_plan_sha256');
  }
  if (designShotIds.length !== index.shot_count) {
    fail('shot_coverage_invalid', 'Every current design-slice shot needs one flat kit.', '$.shot_count');
  }

  const resolvedKits = normalizeKitArtifacts(kitArtifacts);
  const artifactIds = new Set();
  const kitShotIds = new Set();
  const routeCounts = { user_media: 0, image_generation: 0, pexels: 0 };
  const rightsCounts = { cleared: 0, conditional: 0 };

  for (const [position, record] of index.kits.entries()) {
    exact(record, ['shot_id', 'artifact_id', 'sha256', 'size_bytes'], 'invalid_kit_record', `$.kits[${position}]`);
    const expected = expectedShotId(position);
    if (record.shot_id !== expected || record.shot_id !== designShotIds[position]) {
      fail('kit_order_invalid', 'Kit records must cover the design slice in S001..SN order.', `$.kits[${position}].shot_id`);
    }
    if (!ARTIFACT_ID.test(record.artifact_id ?? '') || !SHA256.test(record.sha256 ?? '')
      || !Number.isSafeInteger(record.size_bytes) || record.size_bytes < 1 || record.size_bytes > MAX_JSON_BYTES) {
      fail('invalid_kit_record', 'Kit artifact record is invalid.', `$.kits[${position}]`);
    }
    if (artifactIds.has(record.artifact_id) || kitShotIds.has(record.shot_id)) {
      fail('duplicate_kit_record', 'Kit artifact IDs and shot IDs must be unique.', `$.kits[${position}]`);
    }
    artifactIds.add(record.artifact_id);
    kitShotIds.add(record.shot_id);
    if (!resolvedKits.has(record.artifact_id)) {
      fail('kit_artifact_missing', 'A declared flat kit artifact is missing.', `$.kits[${position}].artifact_id`);
    }

    const resolvedKit = parseJsonBytes(resolvedKits.get(record.artifact_id), `$.resolved.kits[${position}]`);
    if (resolvedKit.bytes.length !== record.size_bytes || hashBytes(resolvedKit.bytes) !== record.sha256) {
      fail('kit_artifact_hash_mismatch', 'Resolved flat kit bytes do not match their set record.', `$.kits[${position}]`);
    }
    const kitReceipt = validateFlatShotKit(resolvedKit.document);
    if (kitReceipt.shot_id !== record.shot_id) {
      fail('kit_shot_mismatch', 'Resolved flat kit belongs to another shot.', `$.kits[${position}].shot_id`);
    }
    if (kitReceipt.design_slice_sha256 !== resolvedDesignHash) {
      fail('mixed_design_slice', 'Every flat kit must bind the resolved design slice.', `$.kits[${position}]`);
    }
    if (!sameRaster(resolvedKit.document.target_raster, index.target_raster)) {
      fail('mixed_target_raster', 'Every flat kit must use the set target raster.', `$.kits[${position}]`);
    }
    if (kitReceipt.contribution_status !== 'pending-master-build') {
      fail('assets_contribution_overclaim', 'Assets cannot verify primary-material contribution.', `$.kits[${position}]`);
    }
    routeCounts[resolvedKit.document.primary_asset.route.replace(/-/gu, '_')] += 1;
    rightsCounts[resolvedKit.document.primary_asset.rights.review_status] += 1;
  }

  if (resolvedKits.size !== index.kits.length) {
    fail('undeclared_kit_artifact', 'Resolved kit collection contains an undeclared artifact.', '$resolved.kit_artifacts');
  }

  return {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    director_manifest_sha256: index.director_manifest_sha256,
    shot_plan_sha256: index.shot_plan_sha256,
    design_slice_sha256: index.design_slice_sha256,
    target_raster: index.target_raster,
    shot_count: index.shot_count,
    flat_shot_kit_set_sha256: fingerprintArtifactValue(index),
    route_counts: routeCounts,
    rights_counts: rightsCounts,
    contribution_status_counts: { pending_master_build: index.shot_count },
  };
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  if (argv.length !== 7) return { error: true };
  const output = { input: argv[0] };
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || value.startsWith('-') || !['--director-manifest', '--design-slice', '--kit-root'].includes(flag)
      || Object.hasOwn(output, flag)) return { error: true };
    output[flag] = value;
  }
  if (!output['--director-manifest'] || !output['--design-slice'] || !output['--kit-root']) return { error: true };
  return output;
}

async function readRegular(file, adapters) {
  const lstat = adapters.lstat ?? fs.lstat;
  const readFile = adapters.readFile ?? fs.readFile;
  const stat = await lstat(file);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail('artifact_not_regular', 'Resolved artifact must be a regular non-symlink file.');
  }
  return readFile(file);
}

export async function runFlatShotKitSetCli(argv, adapters = {}) {
  const stdout = adapters.stdout ?? process.stdout;
  const stderr = adapters.stderr ?? process.stderr;
  const args = parseArgs(argv);
  if (args.help) {
    stdout.write('Usage: node scripts/validate-flat-shot-kit-set.mjs <set.json> --director-manifest <manifest.json> --design-slice <design-slice.json> --kit-root <directory>\n');
    return 0;
  }
  if (args.error) {
    stderr.write('validate-flat-shot-kit-set: invalid arguments (use --help)\n');
    return EXIT_USAGE;
  }
  try {
    const index = JSON.parse((await readRegular(args.input, adapters)).toString('utf8'));
    const directorManifest = JSON.parse((await readRegular(args['--director-manifest'], adapters)).toString('utf8'));
    const designSliceBytes = await readRegular(args['--design-slice'], adapters);
    const kitArtifacts = new Map();
    for (const record of index.kits ?? []) {
      if (!ARTIFACT_ID.test(record?.artifact_id ?? '')) fail('invalid_kit_record', 'Kit artifact record is invalid.');
      const kitFile = path.join(args['--kit-root'], `${record.artifact_id}.json`);
      kitArtifacts.set(record.artifact_id, await readRegular(kitFile, adapters));
    }
    const receipt = await validateFlatShotKitSet(index, {
      directorManifest,
      designSliceBytes,
      kitArtifacts,
    });
    stdout.write(`${JSON.stringify(receipt)}\n`);
    return 0;
  } catch (error) {
    const controlled = error instanceof FlatShotKitSetError
      || error instanceof FlatShotKitError
      || typeof error?.code === 'string' && error.code.startsWith('artifact_')
      || error?.code === 'pipeline_upgrade_required';
    const safe = controlled
      ? { code: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) }
      : { code: 'read_failed', message: 'Flat shot kit set inputs could not be read.' };
    stderr.write(`${JSON.stringify({ ok: false, error: safe })}\n`);
    return controlled ? EXIT_INVALID : EXIT_READ;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exit(await runFlatShotKitSetCli(process.argv.slice(2)));
