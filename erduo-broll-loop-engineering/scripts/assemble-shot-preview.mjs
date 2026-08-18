#!/usr/bin/env node

import { lstat, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  commandFailure,
  hashFile,
  probeAndDecode,
  requireRegularFile,
  runCommand,
} from './shot-media-lib.mjs';
import { validateShotMedia } from './validate-shot-media.mjs';

function escapeConcatPath(file) {
  return file.replaceAll("'", "'\\''");
}

function previewRaster(profile) {
  const scale = Math.min(1, 1920 / profile.raster.width, 1080 / profile.raster.height);
  const even = (value) => Math.max(2, Math.floor(value * scale / 2) * 2);
  return { width: even(profile.raster.width), height: even(profile.raster.height) };
}

async function assembleVerifiedContracts({
  contracts, deliveryRoot, outputFile, label, ffmpeg, ffprobe, runner,
}) {
  if (!Array.isArray(contracts) || contracts.length === 0) throw new Error(`${label} has no verified shot contracts`);
  const delivery = path.resolve(deliveryRoot);
  const output = path.resolve(outputFile);
  const outputRelative = path.relative(delivery, output);
  if (outputRelative.startsWith('..') || path.isAbsolute(outputRelative)) throw new Error(`${label} output escapes the delivery root`);
  let existing = false;
  try {
    await requireRegularFile(output, label);
    existing = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const mediaFiles = contracts.map((contract) => {
    if (contract?.renderTarget?.mode !== 'direct-runtime-render'
      || contract.renderTarget.id !== contract.shotId
      || contract?.media?.fullDecode !== 'passed') {
      throw new Error(`${contract?.shotId ?? 'unknown shot'} cannot enter ${label} without a direct decoded contract`);
    }
    const mediaFile = path.resolve(delivery, contract.media.path);
    const relative = path.relative(delivery, mediaFile);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${contract.shotId} media escapes the delivery root`);
    return mediaFile;
  });
  for (const [index, mediaFile] of mediaFiles.entries()) {
    await requireRegularFile(mediaFile, `${contracts[index].shotId} preview media`);
    if (contracts[index].media.sha256 && contracts[index].media.sha256 !== await hashFile(mediaFile)) {
      throw new Error(`${contracts[index].shotId} media hash changed before ${label}`);
    }
  }
  const raster = previewRaster({raster: {width: contracts[0].media.width, height: contracts[0].media.height}});
  const expectedDuration = contracts.reduce((total, contract) => total + contract.media.durationMs, 0);
  const assertPreviewFacts = (facts) => {
    const frameMs = 1_000 / contracts[0].media.fps;
    if (facts.codec !== 'h264' || facts.width !== raster.width || facts.height !== raster.height) {
      throw new Error(`${label} codec or raster differs from its bounded low-cost profile`);
    }
    if (Math.abs(facts.fps - contracts[0].media.fps) > 1e-6) throw new Error(`${label} fps differs from verified shot media`);
    if (!Number.isFinite(facts.durationMs) || Math.abs(facts.durationMs - expectedDuration) > frameMs + 1) {
      throw new Error(`${label} duration differs from its verified shot subset by more than one frame`);
    }
  };
  if (existing) {
    const facts = await probeAndDecode(output, {ffmpeg, ffprobe, runner, cwd: path.dirname(output), shotId: label});
    assertPreviewFacts(facts);
    return {preview: output, mediaFacts: facts, sha256: await hashFile(output), recovered: true};
  }
  await mkdir(path.dirname(output), {recursive: true});
  const concatFile = path.join(path.dirname(output), `.verified-preview-concat-${process.pid}-${Date.now()}.txt`);
  try {
    await writeFile(concatFile, `${mediaFiles.map((file) => `file '${escapeConcatPath(file)}'`).join('\n')}\n`, {flag: 'wx'});
    const assembled = await runner({
      executable: ffmpeg,
      args: [
        '-v', 'error', '-nostdin', '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-an', '-vf', `scale=${raster.width}:${raster.height}`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', output,
      ],
      cwd: path.dirname(output),
    });
    if (assembled.code !== 0) throw commandFailure(`${label} assembly`, assembled);
    await requireRegularFile(output, label);
    const facts = await probeAndDecode(output, {ffmpeg, ffprobe, runner, cwd: path.dirname(output), shotId: label});
    assertPreviewFacts(facts);
    return {preview: output, mediaFacts: facts, sha256: await hashFile(output)};
  } catch (error) {
    await rm(output, {force: true});
    throw error;
  } finally {
    await rm(concatFile, {force: true});
  }
}

export async function assembleChapterPreview({
  unitId, contracts, deliveryRoot, outputFile = path.join(deliveryRoot, 'chapter-previews', `${unitId}.mp4`),
  ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', runner = runCommand,
}) {
  if (!/^U[0-9]{3}$/u.test(unitId ?? '')) throw new Error('chapter preview requires a valid authoring unit id');
  if (contracts.some((contract) => contract.unitId !== unitId)) throw new Error('chapter preview contracts must belong to one authoring unit');
  const result = await assembleVerifiedContracts({
    contracts: [...contracts].sort((left, right) => left.order - right.order),
    deliveryRoot, outputFile, label: `${unitId} chapter preview`, ffmpeg, ffprobe, runner,
  });
  return {status: 'chapter-preview-ready', unitId, shots: contracts.length, ...result};
}

export async function assembleCanaryPreview({
  contracts, deliveryRoot, outputFile = path.join(deliveryRoot, 'canary-preview.mp4'),
  ffmpeg = 'ffmpeg', ffprobe = 'ffprobe', runner = runCommand,
}) {
  if (contracts.length !== 5) throw new Error('canary preview requires exactly five verified shot contracts');
  const result = await assembleVerifiedContracts({
    contracts, deliveryRoot, outputFile, label: 'five-shot canary preview', ffmpeg, ffprobe, runner,
  });
  return {status: 'canary-preview-ready', shots: 5, shotIds: contracts.map(({shotId}) => shotId), ...result};
}

export async function assembleShotPreview({
  planFile,
  recipesDirectory,
  sourceManifestFile,
  sourceManifestFiles = [],
  productionRoot,
  deliveryRoot = path.join(productionRoot, '05-delivery'),
  outputFile = path.join(deliveryRoot, 'preview.mp4'),
  ffmpeg = 'ffmpeg',
  ffprobe = 'ffprobe',
  runner = runCommand,
}) {
  const output = path.resolve(outputFile);
  try {
    await lstat(output);
    throw new Error('preview already exists; choose a new output path');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  const validation = await validateShotMedia({
    planFile, recipesDirectory, sourceManifestFile, sourceManifestFiles, productionRoot, deliveryRoot,
    ffmpeg, ffprobe, runner,
  });
  const delivery = path.resolve(deliveryRoot);
  const mediaFiles = validation.deliveryIndex.shots.map(({ file }) => path.resolve(delivery, file));
  for (const [index, mediaFile] of mediaFiles.entries()) {
    const relative = path.relative(delivery, mediaFile);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`shot ${index + 1} escapes the delivery root`);
  }
  await mkdir(path.dirname(output), { recursive: true });
  const concatFile = path.join(path.dirname(output), `.shot-preview-concat-${process.pid}-${Date.now()}.txt`);
  try {
    await writeFile(concatFile, `${mediaFiles.map((file) => `file '${escapeConcatPath(file)}'`).join('\n')}\n`, { flag: 'wx' });
    const width = validation.contracts[0].media.width;
    const height = validation.contracts[0].media.height;
    const raster = previewRaster({ raster: { width, height } });
    const assembled = await runner({
      executable: ffmpeg,
      args: [
        '-v', 'error', '-nostdin', '-f', 'concat', '-safe', '0', '-i', concatFile,
        '-an', '-vf', `scale=${raster.width}:${raster.height}`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', output,
      ],
      cwd: path.dirname(output),
    });
    if (assembled.code !== 0) throw commandFailure('shot preview assembly', assembled);
    await requireRegularFile(output, 'assembled shot preview');
    const facts = await probeAndDecode(output, {
      ffmpeg, ffprobe, runner, cwd: path.dirname(output), shotId: 'preview',
    });
    const expectedDuration = validation.endMs - validation.startMs;
    const frameMs = 1_000 / validation.contracts[0].media.fps;
    if (facts.codec !== 'h264' || facts.width !== raster.width || facts.height !== raster.height) {
      throw new Error('preview codec or raster differs from its bounded low-cost profile');
    }
    if (Math.abs(facts.fps - validation.contracts[0].media.fps) > 1e-6) {
      throw new Error('preview fps differs from the verified shot media');
    }
    if (!Number.isFinite(facts.durationMs) || Math.abs(facts.durationMs - expectedDuration) > frameMs + 1) {
      throw new Error('preview duration differs from the verified shot coverage by more than one frame');
    }
    return { status: 'preview-ready', preview: output, shots: validation.shots, mediaFacts: facts };
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  } finally {
    await rm(concatFile, { force: true });
  }
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith('--') || !value) throw new Error(`invalid argument ${name ?? ''}`);
    const key = name.slice(2);
    if (key === 'source-manifest') options[key] = [...(options[key] ?? []), value];
    else options[key] = value;
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  for (const required of ['plan', 'recipes', 'source-manifest', 'production-root', 'output']) {
    if (!options[required]) throw new Error(`--${required} is required`);
  }
  const result = await assembleShotPreview({
    planFile: options.plan, recipesDirectory: options.recipes,
    sourceManifestFiles: options['source-manifest'], productionRoot: options['production-root'],
    deliveryRoot: options['delivery-root'], outputFile: options.output,
    ffmpeg: options.ffmpeg, ffprobe: options.ffprobe,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
