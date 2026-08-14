#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream, realpathSync } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, validateSchemaValue } from './runtime-schema-validator.mjs';
import { validateRuntimePlan } from './validate-runtime-plan.mjs';
import { sanitizedEnvironment } from './safe-spawn.mjs';

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(skillRoot, 'references', 'runtime', 'frozen-block.schema.json');
const OUTPUT_LIMIT = 64 * 1024;

function inside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`);
}

async function hashFile(file) {
  const digest = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('data', (chunk) => digest.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return digest.digest('hex');
}

export async function runFrozenMediaCommand({ executable, args, cwd, env = process.env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd,
      env: sanitizedEnvironment(env),
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const append = (current, chunk) => `${current}${chunk.toString('utf8')}`.slice(-OUTPUT_LIMIT);
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

function commandFailure(label, result) {
  return `${label} failed: ${(result.stderr?.trim() || result.stdout?.trim() || `exit ${result.code}`).slice(-2000)}`;
}

function parseRational(value) {
  const match = /^([0-9]+)\/([1-9][0-9]*)$/u.exec(String(value ?? ''));
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  const gcd = (left, right) => right === 0 ? left : gcd(right, left % right);
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function sameRational(actual, expectedNumerator, expectedDenominator) {
  const expected = parseRational(`${expectedNumerator}/${expectedDenominator}`);
  return actual?.numerator === expected?.numerator && actual?.denominator === expected?.denominator;
}

function relativeLocator(value) {
  return typeof value === 'string' && value.length > 0 && !path.isAbsolute(value)
    && value.split(/[\\/]/u).every((part) => part && part !== '.' && part !== '..');
}

async function verifiedRegularInside(root, locatorValue, label) {
  if (!relativeLocator(locatorValue)) throw new Error(`${label} must be a closed relative path`);
  const candidate = path.resolve(root, locatorValue);
  const canonical = await realpath(candidate);
  const info = await lstat(candidate);
  if (!inside(root, canonical) || !info.isFile() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink inside its declared root`);
  }
  return { canonical, info };
}

async function verifySourceClosure(contract, contractDirectory) {
  if (!contract.source) throw new Error('source manifest binding is required');
  if (!relativeLocator(contract.source.root)) throw new Error('source.root must be a closed relative path');
  const sourceRootCandidate = path.resolve(contractDirectory, contract.source.root);
  const sourceRoot = await realpath(sourceRootCandidate);
  const rootInfo = await lstat(sourceRootCandidate);
  if (!inside(contractDirectory, sourceRoot) || !rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error('source.root must be a real directory inside the Builder unit');
  }
  const manifestRecord = await verifiedRegularInside(contractDirectory, contract.source.manifestPath, 'source.manifestPath');
  const manifestBody = await readFile(manifestRecord.canonical);
  if (await hashFile(manifestRecord.canonical) !== contract.source.manifestSha256) {
    throw new Error('source manifest SHA-256 mismatch');
  }
  let manifest;
  try { manifest = JSON.parse(manifestBody.toString('utf8')); } catch { throw new Error('source manifest is invalid JSON'); }
  if (manifest?.schemaVersion !== '1.0.0' || !Array.isArray(manifest.files)
    || manifest.files.length < 1 || manifest.files.length > 10_000
    || manifest.files.length !== contract.source.fileCount) {
    throw new Error('source manifest must declare 1-10000 editable closure files and the exact fileCount');
  }
  const locators = new Set();
  for (const [index, item] of manifest.files.entries()) {
    if (!relativeLocator(item?.path) || !/^[0-9a-f]{64}$/u.test(item?.sha256 ?? '')
      || !Number.isSafeInteger(item?.sizeBytes) || item.sizeBytes < 0 || locators.has(item.path)) {
      throw new Error(`source manifest file ${index} is invalid or duplicated`);
    }
    locators.add(item.path);
    const sourceFile = await verifiedRegularInside(sourceRoot, item.path, `source file ${item.path}`);
    if (sourceFile.info.size !== item.sizeBytes || await hashFile(sourceFile.canonical) !== item.sha256) {
      throw new Error(`source file ${item.path} differs from its editable closure`);
    }
  }
  if (!contract.source.entrypoints.every((entrypoint) => locators.has(entrypoint))) {
    throw new Error('every source entrypoint must belong to the verified editable closure');
  }
  const sourceIdentity = createHash('sha256').update(canonicalJson(manifest)).digest('hex');
  if (sourceIdentity !== contract.sourceIdentity) throw new Error('sourceIdentity does not match the editable source closure');
  return { sourceIdentity, manifestSha256: contract.source.manifestSha256 };
}

async function inspectMedia(file, { ffmpeg, ffprobe, runner, cwd }) {
  const probe = await runner({
    executable: ffprobe,
    args: ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file],
    cwd,
  });
  if (probe.code !== 0) throw new Error(commandFailure('FFprobe', probe));
  let value;
  try { value = JSON.parse(probe.stdout); } catch { throw new Error('FFprobe returned invalid JSON'); }
  const video = (value.streams ?? []).filter(({ codec_type: type }) => type === 'video');
  if (video.length !== 1) throw new Error('media must contain exactly one video stream');
  const audio = (value.streams ?? []).filter(({ codec_type: type }) => type === 'audio');
  const decode = await runner({
    executable: ffmpeg,
    args: ['-v', 'error', '-nostdin', '-xerror', '-i', file, '-map', '0', '-f', 'null', '-'],
    cwd,
  });
  if (decode.code !== 0) throw new Error(commandFailure('full media decode', decode));
  const stream = video[0];
  return {
    container: value.format?.format_name,
    codec: stream.codec_name,
    width: stream.width,
    height: stream.height,
    fps: parseRational(stream.avg_frame_rate ?? stream.r_frame_rate),
    pixelFormat: stream.pix_fmt,
    colorSpace: stream.color_space,
    colorTransfer: stream.color_transfer,
    colorPrimaries: stream.color_primaries,
    colorRange: stream.color_range,
    durationMs: Math.round(Number(value.format?.duration ?? stream.duration) * 1000),
    frameCount: Number(stream.nb_read_frames ?? stream.nb_frames),
    audioStreams: audio.length,
    audioCodec: audio[0]?.codec_name ?? null,
    audioSampleRate: audio[0]?.sample_rate ? Number(audio[0].sample_rate) : null,
    audioChannels: audio[0]?.channels ?? null,
    startTimeMs: Math.round(Number(stream.start_time ?? value.format?.start_time ?? 0) * 1000),
  };
}

function expectedFrozenProfile(productionProfile) {
  if (!productionProfile) return null;
  return {
    width: productionProfile.raster.width,
    height: productionProfile.raster.height,
    fpsNumerator: productionProfile.fps.numerator,
    fpsDenominator: productionProfile.fps.denominator,
    pixelFormat: productionProfile.mezzanine.pixelFormat,
    colorSpace: productionProfile.mezzanine.color.space,
    colorTransfer: productionProfile.mezzanine.color.transfer,
    colorPrimaries: productionProfile.mezzanine.color.primaries,
    colorRange: productionProfile.mezzanine.color.range,
    mezzanineClass: productionProfile.mezzanine.class,
  };
}

function compareMedia(contract, facts, productionProfile, errors, label) {
  const expectedProfile = expectedFrozenProfile(productionProfile);
  const frameMs = 1000 * contract.profile.fpsDenominator / contract.profile.fpsNumerator;
  const declared = contract.media;
  const comparisons = [
    ['codec', facts.codec, declared.codec],
    ['width', facts.width, contract.profile.width],
    ['height', facts.height, contract.profile.height],
    ['pixel format', facts.pixelFormat, contract.profile.pixelFormat],
    ['color space', facts.colorSpace, contract.profile.colorSpace],
    ['color transfer', facts.colorTransfer, contract.profile.colorTransfer],
    ['color primaries', facts.colorPrimaries, contract.profile.colorPrimaries],
    ['color range', facts.colorRange, contract.profile.colorRange],
    ['frame count', facts.frameCount, declared.frameCount],
    ['audio stream count', facts.audioStreams, declared.audioStreams],
    ['start time', facts.startTimeMs, declared.startTimeMs],
  ];
  for (const [name, actual, expected] of comparisons) {
    if (actual !== expected) errors.push(`${label}: actual ${name} ${JSON.stringify(actual)} differs from contract ${JSON.stringify(expected)}`);
  }
  if (!String(facts.container ?? '').split(',').includes(declared.container)) {
    errors.push(`${label}: actual container ${JSON.stringify(facts.container)} differs from contract ${JSON.stringify(declared.container)}`);
  }
  if (!sameRational(facts.fps, contract.profile.fpsNumerator, contract.profile.fpsDenominator)) {
    errors.push(`${label}: actual fps rational differs from contract`);
  }
  if (!Number.isFinite(facts.durationMs) || Math.abs(facts.durationMs - declared.durationMs) > frameMs) {
    errors.push(`${label}: actual duration differs from contract by more than one frame`);
  }
  const expectedAudio = productionProfile?.mezzanine?.audio;
  if (expectedAudio && (facts.audioStreams !== expectedAudio.streams
    || (expectedAudio.streams > 0 && facts.audioCodec !== expectedAudio.codec)
    || (expectedAudio.streams > 0 && facts.audioSampleRate !== expectedAudio.sampleRate)
    || (expectedAudio.streams > 0 && facts.audioChannels !== expectedAudio.channels))) {
    errors.push(`${label}: actual audio streams differ from the immutable production profile`);
  }
  if (expectedProfile && canonicalJson(contract.profile) !== canonicalJson(expectedProfile)) {
    errors.push(`${label}: frozen media profile differs from the immutable production profile`);
  }
}

export async function validateFrozenBlocks(plan, contractFiles, sharedArtifactFiles = {}) {
  const {
    ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', runner = runFrozenMediaCommand,
    ...runtimeArtifactFiles
  } = sharedArtifactFiles;
  await validateRuntimePlan(plan, runtimeArtifactFiles);
  if (plan.status !== 'planned' || plan.integrationMode !== 'frozen-block-media') {
    throw new Error('frozen media validation requires a planned frozen-media runtime plan');
  }
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
  const records = [];
  const errors = [];
  for (const file of contractFiles) {
    let contract;
    try { contract = JSON.parse(await readFile(file, 'utf8')); } catch { errors.push(`${file}: invalid JSON`); continue; }
    validateSchemaValue(contract, schema, schema, file, errors);
    let verified = null;
    if (!contract?.media?.path || path.isAbsolute(contract.media.path)) {
      errors.push(`${file}: media.path must be relative to its contract directory`);
    } else {
      const contractDirectory = await realpath(path.dirname(file));
      const mediaCandidate = path.resolve(contractDirectory, contract.media.path);
      try {
        const mediaCanonical = await realpath(mediaCandidate);
        const info = await lstat(mediaCandidate);
        if (!inside(contractDirectory, mediaCanonical) || !info.isFile() || info.isSymbolicLink()) errors.push(`${file}: media file must be a regular non-symlink inside the block directory`);
        else {
          const mediaSha256 = await hashFile(mediaCanonical);
          if (mediaSha256 !== contract.media.sha256) errors.push(`${file}: media SHA-256 mismatch`);
          try {
            const [mediaFacts, source] = await Promise.all([
              inspectMedia(mediaCanonical, { ffmpeg, ffprobe, runner, cwd: contractDirectory }),
              plan.schemaVersion === '2.0.0' ? verifySourceClosure(contract, contractDirectory) : Promise.resolve(null),
            ]);
            verified = { mediaPath: mediaCanonical, mediaSha256, mediaFacts, source };
          } catch (error) { errors.push(`${file}: ${error.message}`); }
        }
      } catch { errors.push(`${file}: media file is missing or unreadable`); }
    }
    if (plan.schemaVersion === '2.0.0' && contract.productionProfileIdentity !== plan.productionProfile.identity) {
      errors.push(`${file}: production profile identity differs from the runtime plan`);
    }
    records.push({
      file: path.resolve(file), contract, verified,
      contractSha256: await hashFile(path.resolve(file)),
    });
  }
  const targets = plan.schemaVersion === '2.0.0' ? plan.authoringUnits : plan.blocks;
  const ordered = [];
  const unused = new Set(records.map((_, index) => index));
  if (records.length !== targets.length) errors.push('frozen media count does not match runtime plan');
  let referenceProfile = null;
  let referenceAudio = null;
  for (const target of targets) {
    const match = [...unused].find((index) => {
      const candidate = records[index].contract;
      return candidate.blockId === target.blockId
        && candidate.runtime === target.runtime
        && candidate.window.startMs === target.window.startMs
        && candidate.window.endMs === target.window.endMs
        && JSON.stringify(candidate.shotIds) === JSON.stringify(target.shotIds);
    });
    if (match === undefined) {
      errors.push(`${target.unitId ?? target.blockId}: frozen contract is missing or differs from the runtime plan`);
      continue;
    }
    unused.delete(match);
    const record = records[match];
    const contract = record.contract;
    ordered.push(record);
    const timelineDuration = target.window.endMs - target.window.startMs;
    const frameDurationMs = Math.ceil(1000 * contract.profile.fpsDenominator / contract.profile.fpsNumerator);
    const label = target.unitId ?? target.blockId;
    if (Math.abs(contract.media.durationMs - timelineDuration) > frameDurationMs) errors.push(`${label}: media duration differs from timeline by more than one frame`);
    const expectedFrameCount = Math.round(
      timelineDuration * contract.profile.fpsNumerator / (1000 * contract.profile.fpsDenominator),
    );
    if (contract.media.frameCount !== expectedFrameCount) errors.push(`${label}: frame count differs from the runtime-plan window and fps rational`);
    if (contract.audioPolicy === 'silent' && contract.media.audioStreams !== 0) errors.push(`${label}: silent block contains audio streams`);
    if (contract.media.startTimeMs !== 0) errors.push(`${label}: frozen media must start at zero`);
    if (record.verified) compareMedia(contract, record.verified.mediaFacts, plan.productionProfile, errors, label);
    if (plan.schemaVersion === '2.0.0') {
      const expected = plan.productionProfile.mezzanine;
      if (contract.media.container !== expected.container || contract.media.codec !== expected.codec
        || contract.audioPolicy !== expected.audio.policy || contract.media.audioStreams !== expected.audio.streams) {
        errors.push(`${label}: frozen media declarations differ from the immutable production profile`);
      }
    }
    const profileKey = canonicalJson(contract.profile);
    if (referenceProfile === null) referenceProfile = profileKey;
    else if (profileKey !== referenceProfile) errors.push(`${label}: frozen media profile differs across blocks`);
    if (referenceAudio === null) referenceAudio = contract.audioPolicy;
    else if (contract.audioPolicy !== referenceAudio) errors.push(`${label}: audio policy differs across blocks`);
  }
  if (unused.size) errors.push('one or more frozen contracts are not assigned by the runtime plan');
  if (errors.length) throw new Error(`frozen block validation failed:\n${errors.join('\n')}`);
  const aggregateIdentity = createHash('sha256').update(canonicalJson({
    planIdentity: plan.identity,
    records: ordered.map(({ contract, contractSha256, verified }) => ({
      contract, contractSha256, mediaSha256: verified.mediaSha256,
      sourceManifestSha256: verified.source?.manifestSha256 ?? null,
    })),
  })).digest('hex');
  const result = {
    status: 'valid', blocks: ordered.length,
    startMs: ordered[0].contract.window.startMs, endMs: ordered.at(-1).contract.window.endMs,
    aggregateIdentity,
  };
  Object.defineProperty(result, 'verifiedRecords', { value: ordered, enumerable: false });
  return result;
}

async function main() {
  const [planFile, ...argumentsAfterPlan] = process.argv.slice(2);
  if (!planFile) throw new Error('usage: node scripts/validate-frozen-blocks.mjs <runtime-plan.json> [--narrative-envelope <file> --visual-system <file>] <block-media.json>...');
  const sharedArtifactFiles = {};
  const contractFiles = [];
  for (let index = 0; index < argumentsAfterPlan.length; index += 1) {
    const value = argumentsAfterPlan[index];
    if (value === '--narrative-envelope' || value === '--visual-system') {
      const file = argumentsAfterPlan[index + 1];
      if (!file) throw new Error(`${value} requires a file`);
      const key = value === '--narrative-envelope' ? 'narrativeEnvelopeFile' : 'visualSystemFile';
      if (sharedArtifactFiles[key]) throw new Error(`duplicate ${value}`);
      sharedArtifactFiles[key] = path.resolve(file);
      index += 1;
    } else {
      contractFiles.push(path.resolve(value));
    }
  }
  if (contractFiles.length === 0) throw new Error('at least one block-media.json is required');
  const plan = JSON.parse(await readFile(path.resolve(planFile), 'utf8'));
  const result = await validateFrozenBlocks(plan, contractFiles, sharedArtifactFiles);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
