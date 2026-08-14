#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { constants as fsConstants, createReadStream } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { sanitizedEnvironment } from './safe-spawn.mjs';
import { validateFrozenBlocks } from './validate-frozen-blocks.mjs';
import { canonicalJson } from './runtime-schema-validator.mjs';

const OUTPUT_LIMIT = 64 * 1024;

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

async function requireUnused(file, label) {
  try {
    await lstat(file);
    throw new Error(`${label} already exists; choose a new path`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function requireRegularFile(file, label) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`${label} must be a regular non-symlink file`);
}

export async function runCommand({ executable, args, cwd, env = process.env }) {
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
  const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
  return new Error(`${label} failed: ${detail.slice(-2_000)}`);
}

function escapeConcatPath(file) {
  return file.replaceAll("'", "'\\''");
}

function previewRaster(profile) {
  const scale = Math.min(1, 1920 / profile.width, 1080 / profile.height);
  const even = (value) => Math.max(2, Math.floor(value * scale / 2) * 2);
  return { width: even(profile.width), height: even(profile.height) };
}

function rationalEquals(value, numerator, denominator) {
  const match = /^([0-9]+)\/([1-9][0-9]*)$/u.exec(String(value ?? ''));
  if (!match) return false;
  return Number(match[1]) * denominator === numerator * Number(match[2]);
}

async function verifyMedia(file, { ffmpeg, ffprobe, runner, cwd }) {
  const probe = await runner({
    executable: ffprobe,
    args: ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file],
    cwd,
  });
  if (probe.code !== 0) throw commandFailure('FFprobe', probe);
  let facts;
  try { facts = JSON.parse(probe.stdout); } catch { throw new Error('FFprobe returned invalid JSON'); }
  const videoStreams = (facts.streams ?? []).filter(({ codec_type: type }) => type === 'video');
  if (videoStreams.length !== 1) throw new Error('assembled media must contain exactly one video stream');
  const decode = await runner({
    executable: ffmpeg,
    args: ['-v', 'error', '-nostdin', '-i', file, '-f', 'null', '-'],
    cwd,
  });
  if (decode.code !== 0) throw commandFailure('full decode', decode);
  return {
    container: facts.format?.format_name,
    width: videoStreams[0].width,
    height: videoStreams[0].height,
    codec: videoStreams[0].codec_name,
    pixelFormat: videoStreams[0].pix_fmt,
    fps: videoStreams[0].avg_frame_rate ?? videoStreams[0].r_frame_rate,
    colorSpace: videoStreams[0].color_space,
    colorTransfer: videoStreams[0].color_transfer,
    colorPrimaries: videoStreams[0].color_primaries,
    colorRange: videoStreams[0].color_range,
    frameCount: Number(videoStreams[0].nb_read_frames ?? videoStreams[0].nb_frames),
    startTimeSeconds: Number(videoStreams[0].start_time ?? facts.format?.start_time ?? 0),
    durationSeconds: Number(facts.format?.duration ?? 0),
    audioStreams: (facts.streams ?? []).filter(({ codec_type: type }) => type === 'audio').length,
    audioCodec: (facts.streams ?? []).find(({ codec_type: type }) => type === 'audio')?.codec_name ?? null,
    audioSampleRate: Number((facts.streams ?? []).find(({ codec_type: type }) => type === 'audio')?.sample_rate ?? 0) || null,
    audioChannels: (facts.streams ?? []).find(({ codec_type: type }) => type === 'audio')?.channels ?? null,
    ffprobePassed: true,
    fullDecodePassed: true,
  };
}

export async function assembleFrozenPreview({
  planFile,
  contractFiles,
  narrativeEnvelopeFile,
  visualSystemFile,
  outputFile,
  identityFile,
  ffmpeg = 'ffmpeg',
  ffprobe = 'ffprobe',
  runner = runCommand,
}) {
  const absolutePlan = path.resolve(planFile);
  const output = path.resolve(outputFile);
  const identity = path.resolve(identityFile);
  await Promise.all([requireUnused(output, 'preview'), requireUnused(identity, 'preview identity')]);
  const plan = JSON.parse(await readFile(absolutePlan, 'utf8'));
  const validation = await validateFrozenBlocks(plan, contractFiles.map((file) => path.resolve(file)), {
    narrativeEnvelopeFile,
    visualSystemFile,
    ffmpeg,
    ffprobe,
    runner,
  });
  const records = validation.verifiedRecords.map(({ file, contract: value }) => ({ file, value }));
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(path.dirname(identity), { recursive: true });
  const temporaryId = randomUUID();
  const concatFile = path.join(path.dirname(output), `.concat-${temporaryId}.txt`);
  const temporaryOutput = path.join(path.dirname(output), `.preview-${temporaryId}.mp4`);
  const temporaryIdentity = path.join(path.dirname(identity), `.identity-${temporaryId}.json`);
  try {
    const mediaFiles = records.map(({ file, value }) => path.resolve(path.dirname(file), value.media.path));
    await writeFile(concatFile, `${mediaFiles.map((file) => `file '${escapeConcatPath(file)}'`).join('\n')}\n`, { flag: 'wx' });
    const profile = records[0].value.profile;
    const audioPolicy = records[0].value.audioPolicy;
    const previewProfile = previewRaster(profile);
    const encode = await runner({
      executable: ffmpeg,
      args: [
        '-v', 'error', '-nostdin', '-f', 'concat', '-safe', '0', '-i', concatFile,
        ...(audioPolicy === 'silent' ? ['-an'] : ['-c:a', 'aac', '-b:a', '192k']),
        '-vf', `scale=${previewProfile.width}:${previewProfile.height}`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
        '-colorspace', profile.colorSpace, '-movflags', '+faststart', temporaryOutput,
      ],
      cwd: path.dirname(output),
    });
    if (encode.code !== 0) throw commandFailure('preview assembly', encode);
    await requireRegularFile(temporaryOutput, 'assembled preview');
    const mediaFacts = await verifyMedia(temporaryOutput, {
      ffmpeg, ffprobe, runner, cwd: path.dirname(output),
    });
    if (mediaFacts.width !== previewProfile.width || mediaFacts.height !== previewProfile.height) {
      throw new Error('assembled preview raster differs from the bounded preview profile');
    }
    if (!rationalEquals(mediaFacts.fps, profile.fpsNumerator, profile.fpsDenominator)) {
      throw new Error('assembled preview fps differs from the immutable production profile');
    }
    if (audioPolicy === 'silent' && mediaFacts.audioStreams !== 0) {
      throw new Error('assembled silent preview contains audio');
    }
    const expectedDurationSeconds = (validation.endMs - validation.startMs) / 1000;
    const frameToleranceSeconds = profile.fpsDenominator / profile.fpsNumerator;
    if (!Number.isFinite(mediaFacts.durationSeconds)
      || Math.abs(mediaFacts.durationSeconds - expectedDurationSeconds) > frameToleranceSeconds) {
      throw new Error('assembled preview duration differs from the runtime plan by more than one frame');
    }
    const previewSha256 = await hashFile(temporaryOutput);
    const contractBindings = await Promise.all(records.map(async ({ file }) => ({
      sha256: await hashFile(file),
    })));
    const identityValue = {
      schemaVersion: '1.0.0',
      planIdentity: plan.identity,
      frozenMediaIdentity: validation.aggregateIdentity,
      orderedContracts: contractBindings,
      sourceProfile: profile,
      previewProfile,
      preview: { sha256: previewSha256, mediaFacts },
      identity: '',
    };
    const { identity: _identity, ...identityInput } = identityValue;
    identityValue.identity = createHash('sha256').update(canonicalJson(identityInput)).digest('hex');
    await writeFile(temporaryIdentity, `${JSON.stringify(identityValue, null, 2)}\n`, { flag: 'wx' });
    await rename(temporaryOutput, output);
    await rename(temporaryIdentity, identity);
    return {
      status: 'preview-ready',
      preview: output,
      identity: identity,
      planIdentity: plan.identity,
      frozenMediaIdentity: validation.aggregateIdentity,
      units: records.length,
      mediaFacts,
    };
  } finally {
    await Promise.all([
      rm(concatFile, { force: true }),
      rm(temporaryOutput, { force: true }),
      rm(temporaryIdentity, { force: true }),
    ]);
  }
}

export async function deliverFrozenMaster({
  planFile,
  contractFiles,
  narrativeEnvelopeFile,
  visualSystemFile,
  identityFile,
  previewFile,
  outputFile,
  ffmpeg = 'ffmpeg',
  ffprobe = 'ffprobe',
  runner = runCommand,
}) {
  const identity = JSON.parse(await readFile(path.resolve(identityFile), 'utf8'));
  const { identity: claimedIdentity, ...identityInput } = identity;
  const computedIdentity = createHash('sha256').update(canonicalJson(identityInput)).digest('hex');
  if (!claimedIdentity || claimedIdentity !== computedIdentity) {
    throw new Error('preview identity is invalid or changed');
  }
  const preview = path.resolve(previewFile);
  const output = path.resolve(outputFile);
  await requireRegularFile(preview, 'approved preview');
  await requireUnused(output, 'master');
  if (await hashFile(preview) !== identity.preview?.sha256) {
    throw new Error('approved preview changed after identity was created');
  }
  await verifyMedia(preview, {
    ffmpeg, ffprobe, runner, cwd: path.dirname(preview),
  });
  const plan = JSON.parse(await readFile(path.resolve(planFile), 'utf8'));
  const validation = await validateFrozenBlocks(plan, contractFiles.map((file) => path.resolve(file)), {
    narrativeEnvelopeFile,
    visualSystemFile,
    ffmpeg,
    ffprobe,
    runner,
  });
  if (plan.identity !== identity.planIdentity
    || validation.aggregateIdentity !== identity.frozenMediaIdentity) {
    throw new Error('plan or frozen unit media changed after preview approval');
  }
  const records = validation.verifiedRecords.map(({ file, contract: value }) => ({ file, value }));
  const contractBindings = await Promise.all(records.map(async ({ file }) => ({ sha256: await hashFile(file) })));
  if (canonicalJson(contractBindings) !== canonicalJson(identity.orderedContracts)) {
    throw new Error('frozen unit contract changed after preview approval');
  }
  await mkdir(path.dirname(output), { recursive: true });
  const temporaryId = randomUUID();
  const concatFile = path.join(path.dirname(output), `.concat-master-${temporaryId}.txt`);
  const temporaryOutput = path.join(path.dirname(output), `.master-${temporaryId}.mp4`);
  let mediaFacts;
  try {
    const mediaFiles = records.map(({ file, value }) => path.resolve(path.dirname(file), value.media.path));
    await writeFile(concatFile, `${mediaFiles.map((file) => `file '${escapeConcatPath(file)}'`).join('\n')}\n`, { flag: 'wx' });
    const profile = records[0].value.profile;
    const productionProfile = plan.productionProfile;
    const masterPolicy = productionProfile.master;
    const audioPolicy = records[0].value.audioPolicy;
    const encode = await runner({
      executable: ffmpeg,
      args: [
        '-v', 'error', '-nostdin', '-f', 'concat', '-safe', '0', '-i', concatFile,
        ...(masterPolicy.audio.policy === 'silent'
          ? ['-an']
          : ['-c:a', masterPolicy.audio.codec, '-ar', String(masterPolicy.audio.sampleRate), '-ac', String(masterPolicy.audio.channels)]),
        '-c:v', masterPolicy.encoder,
        '-preset', masterPolicy.preset,
        '-crf', String(masterPolicy.crf),
        '-pix_fmt', masterPolicy.pixelFormat,
        '-colorspace', masterPolicy.color.space,
        '-color_trc', masterPolicy.color.transfer,
        '-color_primaries', masterPolicy.color.primaries,
        '-color_range', masterPolicy.color.range,
        ...(masterPolicy.fastStart ? ['-movflags', '+faststart'] : []),
        temporaryOutput,
      ],
      cwd: path.dirname(output),
    });
    if (encode.code !== 0) throw commandFailure('master assembly', encode);
    await requireRegularFile(temporaryOutput, 'assembled master');
    mediaFacts = await verifyMedia(temporaryOutput, {
      ffmpeg, ffprobe, runner, cwd: path.dirname(output),
    });
    if (mediaFacts.width !== profile.width || mediaFacts.height !== profile.height) {
      throw new Error('assembled master raster differs from the frozen source profile');
    }
    if (!String(mediaFacts.container ?? '').split(',').includes(masterPolicy.container)
      || mediaFacts.codec !== masterPolicy.codec
      || mediaFacts.pixelFormat !== masterPolicy.pixelFormat
      || !rationalEquals(mediaFacts.fps, productionProfile.fps.numerator, productionProfile.fps.denominator)
      || mediaFacts.colorSpace !== masterPolicy.color.space
      || mediaFacts.colorTransfer !== masterPolicy.color.transfer
      || mediaFacts.colorPrimaries !== masterPolicy.color.primaries
      || mediaFacts.colorRange !== masterPolicy.color.range
      || mediaFacts.startTimeSeconds !== 0) {
      throw new Error('assembled master differs from the immutable final master policy');
    }
    if (audioPolicy === 'silent' && mediaFacts.audioStreams !== 0) {
      throw new Error('assembled silent master contains audio');
    }
    if (masterPolicy.audio.policy === 'preserve-source'
      && (mediaFacts.audioStreams !== masterPolicy.audio.streams
        || mediaFacts.audioCodec !== masterPolicy.audio.codec
        || mediaFacts.audioSampleRate !== masterPolicy.audio.sampleRate
        || mediaFacts.audioChannels !== masterPolicy.audio.channels)) {
      throw new Error('assembled master audio differs from the immutable final master policy');
    }
    const expectedDurationSeconds = (validation.endMs - validation.startMs) / 1000;
    const frameToleranceSeconds = profile.fpsDenominator / profile.fpsNumerator;
    if (!Number.isFinite(mediaFacts.durationSeconds)
      || Math.abs(mediaFacts.durationSeconds - expectedDurationSeconds) > frameToleranceSeconds) {
      throw new Error('assembled master duration differs from the runtime plan by more than one frame');
    }
    await copyFile(temporaryOutput, output, fsConstants.COPYFILE_EXCL);
  } finally {
    await Promise.all([rm(concatFile, { force: true }), rm(temporaryOutput, { force: true })]);
  }
  const outputSha256 = await hashFile(output);
  return {
    status: 'master-ready',
    master: output,
    sha256: outputSha256,
    compositionIdentity: identity.identity,
    mediaFacts,
  };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { contracts: [] };
  for (let index = 0; index < rest.length; index += 1) {
    const name = rest[index];
    if (name === '--contract') {
      options.contracts.push(path.resolve(rest[++index]));
      continue;
    }
    if (!['--plan', '--narrative-envelope', '--visual-system', '--output', '--identity', '--preview', '--ffmpeg', '--ffprobe'].includes(name)) {
      throw new Error(`unknown argument ${name}`);
    }
    const value = rest[++index];
    if (!value) throw new Error(`${name} requires a value`);
    options[name.slice(2)] = value;
  }
  return { command, options };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  let result;
  if (command === 'preview') {
    if (!options.plan || !options.output || !options.identity || !options['narrative-envelope']
      || !options['visual-system'] || options.contracts.length === 0) {
      throw new Error('preview requires --plan, --narrative-envelope, --visual-system, --output, --identity, and one or more --contract');
    }
    result = await assembleFrozenPreview({
      planFile: options.plan,
      contractFiles: options.contracts,
      narrativeEnvelopeFile: options['narrative-envelope'],
      visualSystemFile: options['visual-system'],
      outputFile: options.output,
      identityFile: options.identity,
      ffmpeg: options.ffmpeg,
      ffprobe: options.ffprobe,
    });
  } else if (command === 'deliver') {
    if (!options.plan || !options.identity || !options.preview || !options.output
      || !options['narrative-envelope'] || !options['visual-system'] || options.contracts.length === 0) {
      throw new Error('deliver requires --plan, --narrative-envelope, --visual-system, --identity, --preview, --output, and one or more --contract');
    }
    result = await deliverFrozenMaster({
      planFile: options.plan,
      contractFiles: options.contracts,
      narrativeEnvelopeFile: options['narrative-envelope'],
      visualSystemFile: options['visual-system'],
      identityFile: options.identity,
      previewFile: options.preview,
      outputFile: options.output,
      ffmpeg: options.ffmpeg,
      ffprobe: options.ffprobe,
    });
  } else {
    throw new Error('usage: assemble-frozen-production.mjs <preview|deliver> ...');
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
