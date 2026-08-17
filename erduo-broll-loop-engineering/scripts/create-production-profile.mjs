#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_PRODUCTION_PROFILE,
  bindProductionProfile,
} from './plan-runtime.mjs';

export const SUPPORTED_MASTER_FORMAT = 'h264-mp4';
export const SUPPORTED_MEZZANINE_FORMATS = Object.freeze(['h264-mp4', 'ffv1-mkv']);

function positiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function greatestCommonDivisor(left, right) {
  let a = left;
  let b = right;
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export function parseFps(value = '30') {
  const match = String(value).match(/^(\d+)(?:\/(\d+))?$/u);
  if (!match) throw new Error('--fps must be a positive integer or rational such as 25 or 30000/1001');
  const numerator = positiveInteger(match[1], '--fps numerator');
  const denominator = positiveInteger(match[2] ?? '1', '--fps denominator');
  const divisor = greatestCommonDivisor(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}

export function createProductionProfile({
  width = DEFAULT_PRODUCTION_PROFILE.raster.width,
  height = DEFAULT_PRODUCTION_PROFILE.raster.height,
  fps = DEFAULT_PRODUCTION_PROFILE.fps,
  audio = 'silent',
  sampleRate = 48000,
  channels = 2,
  masterFormat = SUPPORTED_MASTER_FORMAT,
  mezzanineFormat = 'h264-mp4',
  mezzanineReason,
} = {}) {
  const raster = {
    width: positiveInteger(width, '--width'),
    height: positiveInteger(height, '--height'),
  };
  if (raster.width % 2 !== 0 || raster.height % 2 !== 0) {
    throw new Error('--width and --height must be even for the verified H.264 output');
  }
  if (masterFormat !== SUPPORTED_MASTER_FORMAT) {
    throw new Error(`--master-format currently supports only ${SUPPORTED_MASTER_FORMAT}`);
  }
  if (!SUPPORTED_MEZZANINE_FORMATS.includes(mezzanineFormat)) {
    throw new Error(`--mezzanine-format must be one of ${SUPPORTED_MEZZANINE_FORMATS.join(', ')}`);
  }
  if (mezzanineFormat === 'ffv1-mkv' && !String(mezzanineReason ?? '').trim()) {
    throw new Error('--mezzanine-reason is required for an explicit lossless FFV1 upgrade');
  }
  if (mezzanineFormat === 'h264-mp4' && mezzanineReason !== undefined) {
    throw new Error('--mezzanine-reason is only valid with --mezzanine-format ffv1-mkv');
  }
  if (!['silent', 'preserve-source'].includes(audio)) {
    throw new Error('--audio must be silent or preserve-source');
  }
  const normalizedFps = typeof fps === 'string' || typeof fps === 'number'
    ? parseFps(String(fps))
    : parseFps(`${fps?.numerator}/${fps?.denominator}`);
  const profile = structuredClone(DEFAULT_PRODUCTION_PROFILE);
  profile.raster = raster;
  profile.fps = normalizedFps;
  profile.mezzanine.gopFrames = Math.max(1, Math.round(
    2 * normalizedFps.numerator / normalizedFps.denominator,
  ));
  if (mezzanineFormat === 'ffv1-mkv') {
    profile.mezzanine = {
      container: 'matroska', codec: 'ffv1', encoder: 'ffv1',
      pixelFormat: 'yuv444p10le', class: 'lossless', preset: null, crf: null,
      gopFrames: 1, keyframeScenecut: false, upgradeReason: String(mezzanineReason).trim(),
      color: structuredClone(DEFAULT_PRODUCTION_PROFILE.mezzanine.color),
      audio: structuredClone(DEFAULT_PRODUCTION_PROFILE.mezzanine.audio),
    };
  }
  if (audio === 'preserve-source') {
    const normalizedSampleRate = positiveInteger(sampleRate, '--sample-rate');
    const normalizedChannels = positiveInteger(channels, '--channels');
    profile.mezzanine.audio = {
      policy: 'preserve-source', streams: 1,
      codec: mezzanineFormat === 'ffv1-mkv' ? 'pcm_s24le' : 'aac',
      sampleRate: normalizedSampleRate, channels: normalizedChannels,
    };
    profile.master.audio = {
      policy: 'preserve-source', streams: 1, codec: 'aac',
      sampleRate: normalizedSampleRate, channels: normalizedChannels,
    };
  }
  return bindProductionProfile(profile);
}

function parseArgs(argv) {
  const options = {};
  const known = new Set([
    '--output', '--width', '--height', '--fps', '--audio', '--sample-rate',
    '--channels', '--master-format', '--mezzanine-format', '--mezzanine-reason',
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (!known.has(name)) throw new Error(`unknown argument ${name}`);
    const value = argv[++index];
    if (!value) throw new Error(`${name} requires a value`);
    options[name.slice(2)] = value;
  }
  if (!options.output) throw new Error('--output is required');
  return {
    outputFile: path.resolve(options.output),
    profileOptions: {
      width: options.width,
      height: options.height,
      fps: options.fps,
      audio: options.audio,
      sampleRate: options['sample-rate'],
      channels: options.channels,
      masterFormat: options['master-format'],
      mezzanineFormat: options['mezzanine-format'],
      mezzanineReason: options['mezzanine-reason'],
    },
  };
}

export async function writeProductionProfile({ outputFile, ...profileOptions }) {
  const profile = createProductionProfile(profileOptions);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(profile, null, 2)}\n`, { flag: 'wx' });
  return { status: 'created', file: outputFile, productionProfile: profile };
}

async function main() {
  const { outputFile, profileOptions } = parseArgs(process.argv.slice(2));
  const result = await writeProductionProfile({ outputFile, ...profileOptions });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
