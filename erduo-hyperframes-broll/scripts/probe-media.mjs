#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultExecFileAsync } from './doctor.mjs';

const EXIT_INPUT = 2;
const EXIT_CAPABILITY = 3;
const EXIT_USAGE = 64;
const EXIT_INTERNAL = 70;

export class MediaProbeError extends Error {
  constructor(code, stage, message) {
    super(message);
    this.name = 'MediaProbeError';
    this.code = code;
    this.stage = stage;
  }
}

function fail(code, stage, message) {
  throw new MediaProbeError(code, stage, message);
}

export function decimalSecondsToMicros(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  const match = /^(\d+)(?:\.(\d+))?$/u.exec(text);
  if (!match) return null;
  const whole = BigInt(match[1]);
  const fraction = match[2] ?? '';
  const microsDigits = `${fraction.slice(0, 6)}000000`.slice(0, 6);
  let micros = whole * 1_000_000n + BigInt(microsDigits);
  if (fraction.length > 6 && Number(fraction[6]) >= 5) micros += 1n;
  if (micros > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(micros);
}

function strictPositiveInteger(value, code, message) {
  const text = String(value ?? '');
  if (!/^\d+$/u.test(text)) fail(code, 'normalize', message);
  const number = Number(text);
  if (!Number.isSafeInteger(number) || number <= 0) fail(code, 'normalize', message);
  return number;
}

function streamIndex(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail('invalid_stream_index', 'normalize', 'Media stream index is invalid.');
  return number;
}

export function parseFrameRate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d+)\/(\d+)$/u.exec(value.trim());
  if (!match) return null;
  const numeratorBig = BigInt(match[1]);
  const denominatorBig = BigInt(match[2]);
  if (numeratorBig <= 0n || denominatorBig <= 0n) return null;
  if (numeratorBig > BigInt(Number.MAX_SAFE_INTEGER) || denominatorBig > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const numerator = Number(numeratorBig);
  const denominator = Number(denominatorBig);
  return {
    numerator,
    denominator,
    value: Number((numerator / denominator).toFixed(6)),
  };
}

function normalizeRotation(stream) {
  const sideRotation = Array.isArray(stream.side_data_list)
    ? stream.side_data_list.find((item) => Number.isFinite(Number(item?.rotation)))?.rotation
    : undefined;
  const raw = sideRotation ?? stream.tags?.rotate ?? 0;
  const number = Number(raw);
  if (!Number.isFinite(number)) fail('invalid_rotation', 'normalize', 'Video rotation metadata is invalid.');
  return ((Math.round(number) % 360) + 360) % 360;
}

function choosePrimary(streams) {
  return streams.find((stream) => Number(stream.disposition?.default) === 1) ?? streams[0];
}

function normalizeVideo(stream) {
  const width = strictPositiveInteger(stream.width, 'invalid_video_dimensions', 'Video dimensions are invalid.');
  const height = strictPositiveInteger(stream.height, 'invalid_video_dimensions', 'Video dimensions are invalid.');
  const frameRate = parseFrameRate(stream.avg_frame_rate) ?? parseFrameRate(stream.r_frame_rate);
  if (!frameRate) fail('invalid_frame_rate', 'normalize', 'Video frame rate is missing or invalid.');
  const rotation = normalizeRotation(stream);
  const swap = rotation === 90 || rotation === 270;
  return {
    stream_index: streamIndex(stream.index),
    codec: typeof stream.codec_name === 'string' ? stream.codec_name : null,
    width,
    height,
    display_width: swap ? height : width,
    display_height: swap ? width : height,
    pixel_format: typeof stream.pix_fmt === 'string' ? stream.pix_fmt : null,
    rotation_degrees: rotation,
    frame_rate: frameRate,
  };
}

function normalizeAudio(stream) {
  return {
    stream_index: streamIndex(stream.index),
    codec: typeof stream.codec_name === 'string' ? stream.codec_name : null,
    sample_rate: strictPositiveInteger(stream.sample_rate, 'invalid_audio_metadata', 'Audio sample rate is invalid.'),
    channels: strictPositiveInteger(stream.channels, 'invalid_audio_metadata', 'Audio channel count is invalid.'),
    channel_layout: typeof stream.channel_layout === 'string' && stream.channel_layout ? stream.channel_layout : null,
  };
}

function durationFrom(payload) {
  const formatDuration = decimalSecondsToMicros(payload.format?.duration);
  if (formatDuration !== null) return formatDuration;
  const streamDurations = payload.streams
    .map((stream) => decimalSecondsToMicros(stream.duration))
    .filter((value) => value !== null);
  return streamDurations.length ? Math.max(...streamDurations) : null;
}

export function normalizeProbePayload(payload, sizeBytes) {
  if (!payload || !Array.isArray(payload.streams)) {
    fail('invalid_probe_json', 'probe', 'ffprobe returned malformed JSON.');
  }
  const videoStreams = payload.streams.filter((stream) => stream?.codec_type === 'video');
  const audioStreams = payload.streams.filter((stream) => stream?.codec_type === 'audio');
  if (videoStreams.length === 0 && audioStreams.length === 0) {
    fail('no_media_stream', 'normalize', 'No audio or video stream was found.');
  }
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    fail('invalid_file_size', 'input', 'Media file size is invalid.');
  }

  const durationUs = durationFrom(payload);
  const formatNames = typeof payload.format?.format_name === 'string'
    ? [...new Set(payload.format.format_name.split(',').map((value) => value.trim()).filter(Boolean))].sort()
    : [];
  const videoPrimary = videoStreams.length ? normalizeVideo(choosePrimary(videoStreams)) : null;
  const audioPrimary = audioStreams.length ? normalizeAudio(choosePrimary(audioStreams)) : null;
  const kind = videoStreams.length && audioStreams.length ? 'audiovisual' : videoStreams.length ? 'video' : 'audio';

  return {
    schema_version: 1,
    kind,
    size_bytes: sizeBytes,
    duration_us: durationUs,
    duration_ms: durationUs === null ? null : Math.round(durationUs / 1000),
    format_names: formatNames,
    video: { count: videoStreams.length, primary: videoPrimary },
    audio: { count: audioStreams.length, primary: audioPrimary },
  };
}

function commandFailure(error, tool, stage) {
  if (error?.code === 'ENOENT') {
    return new MediaProbeError(`${tool}_not_found`, stage, `${tool} is not available.`);
  }
  if (error?.killed || error?.code === 'ETIMEDOUT') {
    return new MediaProbeError(`${stage}_timeout`, stage, `${stage === 'probe' ? 'Media probe' : 'Media decode'} timed out.`);
  }
  return new MediaProbeError(`${stage}_failed`, stage, `${stage === 'probe' ? 'Media probe' : 'Media decode'} failed.`);
}

export async function probeMedia(input, {
  platform = process.platform,
  fsImpl = fs,
  execFileAsync = defaultExecFileAsync,
  resolvePath = path.resolve,
} = {}) {
  if (typeof input !== 'string' || !input) fail('invalid_input', 'input', 'A local media file is required.');
  const resolved = resolvePath(input);
  let stat;
  try {
    stat = await fsImpl.lstat(resolved);
  } catch (error) {
    if (error?.code === 'ENOENT') fail('input_not_found', 'input', 'Media input was not found.');
    fail('input_unreadable', 'input', 'Media input cannot be inspected.');
  }
  if (stat.isSymbolicLink() || !stat.isFile()) fail('input_unsafe', 'input', 'Media input must be a regular file.');
  if (!Number.isSafeInteger(stat.size) || stat.size <= 0) fail('input_empty', 'input', 'Media input is empty.');

  const ffprobe = platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  const ffmpeg = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  let probeOutput;
  try {
    probeOutput = await execFileAsync(
      ffprobe,
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', resolved],
      { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
    );
  } catch (error) {
    throw commandFailure(error, 'ffprobe', 'probe');
  }

  let payload;
  try {
    payload = JSON.parse(probeOutput.stdout);
  } catch {
    fail('invalid_probe_json', 'probe', 'ffprobe returned malformed JSON.');
  }
  const normalized = normalizeProbePayload(payload, stat.size);

  try {
    await execFileAsync(
      ffmpeg,
      ['-v', 'error', '-xerror', '-i', resolved, '-map', '0:v?', '-map', '0:a?', '-t', '1', '-f', 'null', '-'],
      { timeout: 120_000, maxBuffer: 1024 * 1024 },
    );
  } catch (error) {
    throw commandFailure(error, 'ffmpeg', 'decode');
  }

  return { ...normalized, decode: { ok: true, smoke_ms: 1000 } };
}

export function parseProbeArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const prettyCount = argv.filter((value) => value === '--pretty').length;
  const unknown = argv.filter((value) => value.startsWith('-') && value !== '--pretty');
  const positionals = argv.filter((value) => !value.startsWith('-'));
  if (unknown.length || prettyCount > 1 || positionals.length !== 1 || argv.length !== positionals.length + prettyCount) return { error: true };
  return { input: positionals[0], pretty: prettyCount === 1 };
}

function safeError(error) {
  return JSON.stringify({
    ok: false,
    error: { code: error.code, stage: error.stage, message: error.message },
  });
}

export async function runProbeCli(argv, adapters = {}) {
  const stdout = adapters.stdout ?? process.stdout;
  const stderr = adapters.stderr ?? process.stderr;
  const args = parseProbeArgs(argv);
  if (args.help) {
    stdout.write('Usage: node scripts/probe-media.mjs <local-media-file> [--pretty]\n');
    return 0;
  }
  if (args.error) {
    stderr.write('probe-media: invalid arguments (use --help)\n');
    return EXIT_USAGE;
  }
  try {
    const result = await probeMedia(args.input, adapters.probeOptions ?? {});
    stdout.write(`${JSON.stringify(result, null, args.pretty ? 2 : 0)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof MediaProbeError) {
      stderr.write(`${safeError(error)}\n`);
      return error.stage === 'input' ? EXIT_INPUT : EXIT_CAPABILITY;
    }
    stderr.write(`${JSON.stringify({ ok: false, error: { code: 'internal_error', stage: 'normalize', message: 'Unexpected media probe failure.' } })}\n`);
    return EXIT_INTERNAL;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exit(await runProbeCli(process.argv.slice(2)));
