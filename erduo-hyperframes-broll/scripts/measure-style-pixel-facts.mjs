#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprintArtifactValue } from './artifact-manifest.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const BLOCK_ID = /^B\d{3}$/u;
const SHOT_ID = /^S\d{3}$/u;
const ARTIFACT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const TOOL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const TOOL_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+/-]{0,95}$/u;
const TOPOLOGY_ID = 'bounded-authoring-cluster-v1';
const STATES = ['entry', 'result', 'exit'];
const MAX_IMAGE_BYTES = 128 * 1024 * 1024;
const MAX_PIXELS = 100_000_000;
const CHROMA_THRESHOLD = 32;
const EDGE_THRESHOLD = 24;
const OCCUPANCY_THRESHOLD = 24;

export class StylePixelFactsError extends Error {
  constructor(code, message, field) {
    super(message);
    this.name = 'StylePixelFactsError';
    this.code = code;
    if (field) this.field = field;
  }
}

const fail = (code, message, field) => {
  throw new StylePixelFactsError(code, message, field);
};
const exact = (value, fields, code = 'style_pixel_request_invalid', field = '$') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, 'Style-pixel value has an invalid shape.', field);
  }
};
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const basisPoints = (part, whole) => Math.round((part * 10_000) / whole);
const milli = (value) => Math.round(value * 1000);

function validateLocator(locator, field) {
  if (typeof locator !== 'string' || !locator || locator.includes('\\') || path.posix.isAbsolute(locator)) {
    fail('style_frame_locator_invalid', 'Frame locator must be a portable relative path.', field);
  }
  const normalized = path.posix.normalize(locator);
  if (normalized !== locator || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    fail('style_frame_locator_invalid', 'Frame locator escapes its evidence root.', field);
  }
}

function validateRoi(roi, field) {
  exact(roi, ['x', 'y', 'width', 'height'], 'style_roi_invalid', field);
  if (![roi.x, roi.y, roi.width, roi.height].every(Number.isSafeInteger)
    || roi.x < 0 || roi.y < 0 || roi.width < 1 || roi.height < 1) {
    fail('style_roi_invalid', 'Declared ROI must be a positive integer rectangle.', field);
  }
}

function validateRequest(document) {
  exact(document, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'block_id',
    'block_manifest_sha256',
    'source_sha256s',
    'projection_sha256',
    'review_generation',
    'renderer',
    'frames',
  ]);
  exact(document.renderer, ['tool_id', 'tool_version', 'receipt_sha256'], 'style_pixel_request_invalid', '$.renderer');
  if (document.schema_version !== 1 || document.pipeline_contract_version !== 2
    || document.authoring_topology_id !== TOPOLOGY_ID || !BLOCK_ID.test(document.block_id ?? '')
    || !SHA256.test(document.block_manifest_sha256 ?? '')
    || !Array.isArray(document.source_sha256s) || document.source_sha256s.length < 1
    || document.source_sha256s.length > 64 || document.source_sha256s.some((item) => !SHA256.test(item))
    || !SHA256.test(document.projection_sha256 ?? '')
    || !Number.isSafeInteger(document.review_generation) || document.review_generation < 1
    || !TOOL_ID.test(document.renderer.tool_id ?? '') || !TOOL_VERSION.test(document.renderer.tool_version ?? '')
    || !SHA256.test(document.renderer.receipt_sha256 ?? '')
    || !Array.isArray(document.frames) || document.frames.length < 3 || document.frames.length > 24) {
    fail('style_pixel_request_invalid', 'Style-pixel request identity or bindings are invalid.');
  }
  const artifactIds = new Set();
  const pairs = new Set();
  const shotStates = new Map();
  for (const [index, frame] of document.frames.entries()) {
    exact(frame, [
      'artifact_id',
      'shot_id',
      'state',
      'locator',
      'projected_frame',
      'timestamp_ms',
      'shot_recipe_sha256',
      'declared_roi',
    ], 'style_pixel_request_invalid', `$.frames[${index}]`);
    if (!ARTIFACT_ID.test(frame.artifact_id ?? '') || artifactIds.has(frame.artifact_id)
      || !SHOT_ID.test(frame.shot_id ?? '') || !STATES.includes(frame.state)
      || !Number.isSafeInteger(frame.projected_frame) || frame.projected_frame < 0
      || !Number.isSafeInteger(frame.timestamp_ms) || frame.timestamp_ms < 0
      || !SHA256.test(frame.shot_recipe_sha256 ?? '')
      || !(frame.declared_roi === null || (typeof frame.declared_roi === 'object' && !Array.isArray(frame.declared_roi)))) {
      fail('style_pixel_request_invalid', 'Frame identity, state, or ROI is invalid.', `$.frames[${index}]`);
    }
    validateLocator(frame.locator, `$.frames[${index}].locator`);
    if (frame.declared_roi !== null) validateRoi(frame.declared_roi, `$.frames[${index}].declared_roi`);
    artifactIds.add(frame.artifact_id);
    const pair = `${frame.shot_id}:${frame.state}`;
    if (pairs.has(pair)) fail('style_state_duplicate', 'A shot state is declared more than once.', `$.frames[${index}]`);
    pairs.add(pair);
    if (!shotStates.has(frame.shot_id)) shotStates.set(frame.shot_id, new Set());
    shotStates.get(frame.shot_id).add(frame.state);
  }
  for (const [shotId, states] of shotStates) {
    if (states.size !== STATES.length || STATES.some((state) => !states.has(state))) {
      fail('style_three_state_incomplete', 'Every shot requires entry, result, and exit frames.', `$.frames:${shotId}`);
    }
  }
  if (document.frames.length !== shotStates.size * STATES.length) {
    fail('style_three_state_incomplete', 'Every declared frame must belong to one complete three-state shot.');
  }
  const shotIds = [...shotStates.keys()];
  const sortedShotIds = [...shotIds].sort();
  if (JSON.stringify(shotIds) !== JSON.stringify(sortedShotIds)) {
    fail('style_shot_order_invalid', 'Style frames must be grouped in ascending shot order.');
  }
  for (const shotId of shotIds) {
    const shotFrames = document.frames.filter((frame) => frame.shot_id === shotId);
    const actualStates = shotFrames.map((frame) => frame.state);
    if (JSON.stringify(actualStates) !== JSON.stringify(STATES)) {
      fail('style_state_order_invalid', 'Each shot must declare entry, result, and exit in that order.', `$.frames:${shotId}`);
    }
    if (!(shotFrames[0].projected_frame < shotFrames[1].projected_frame
      && shotFrames[1].projected_frame < shotFrames[2].projected_frame
      && shotFrames[0].timestamp_ms < shotFrames[1].timestamp_ms
      && shotFrames[1].timestamp_ms < shotFrames[2].timestamp_ms)
      || new Set(shotFrames.map((frame) => frame.shot_recipe_sha256)).size !== 1) {
      fail('style_capture_projection_invalid', 'Three-state capture coordinates must be strictly ordered and bind one shot recipe.', `$.frames:${shotId}`);
    }
  }
  return document;
}

async function resolveFrame(root, locator, field) {
  const lexicalRoot = path.resolve(root);
  let rootStat;
  let resolvedRoot;
  try {
    const filesystemRoot = path.parse(lexicalRoot).root;
    let rootCursor = filesystemRoot;
    for (const component of path.relative(filesystemRoot, lexicalRoot).split(path.sep).filter(Boolean)) {
      rootCursor = path.join(rootCursor, component);
      const componentStat = await lstat(rootCursor);
      if (componentStat.isSymbolicLink()) {
        fail('style_frame_root_symlink_ancestor', 'Frame evidence root cannot traverse a symlink component.', field);
      }
    }
    rootStat = await lstat(lexicalRoot);
    resolvedRoot = await realpath(lexicalRoot);
  } catch (error) {
    if (error instanceof StylePixelFactsError) throw error;
    fail('style_frame_root_required', 'Frame evidence root is missing or unresolved.', field);
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    fail('style_frame_root_symlink', 'Frame evidence root must be a real directory, not a symlink.', field);
  }
  const target = path.resolve(lexicalRoot, locator);
  if (!target.startsWith(`${lexicalRoot}${path.sep}`)) {
    fail('style_frame_locator_invalid', 'Frame locator escapes its evidence root.', field);
  }
  let cursor = lexicalRoot;
  for (const component of locator.split('/')) {
    cursor = path.join(cursor, component);
    let componentStat;
    try {
      componentStat = await lstat(cursor);
    } catch (error) {
      if (error?.code === 'ENOENT') fail('style_frame_missing', 'Declared style frame is missing.', field);
      throw error;
    }
    if (componentStat.isSymbolicLink()) {
      fail('style_frame_symlink_ancestor', 'Frame locators cannot traverse a symlink component.', field);
    }
  }
  let stat;
  try {
    stat = await lstat(target);
  } catch (error) {
    if (error?.code === 'ENOENT') fail('style_frame_missing', 'Declared style frame is missing.', field);
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail('style_frame_not_regular', 'Declared style frame must be a regular non-symlink file.', field);
  }
  let resolvedTarget;
  try {
    resolvedTarget = await realpath(target);
  } catch {
    fail('style_frame_missing', 'Declared style frame cannot be resolved.', field);
  }
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    fail('style_frame_realpath_escape', 'Resolved frame path escapes its real evidence root.', field);
  }
  if (stat.size < 1 || stat.size > MAX_IMAGE_BYTES) {
    fail('style_frame_size_invalid', 'Declared style frame has an invalid byte size.', field);
  }
  return { bytes: await readFile(resolvedTarget) };
}

function runToolWithInput(command, args, input, { maxOutput, code }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(error);
    };
    child.on('error', () => rejectOnce(new StylePixelFactsError(code, `${command} could not be started.`)));
    child.stdout.on('data', (chunk) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutput) {
        rejectOnce(new StylePixelFactsError(code, `${command} output exceeded its deterministic limit.`));
      } else stdout.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.reduce((sum, item) => sum + item.length, 0) < 1024 * 1024) stderr.push(Buffer.from(chunk));
    });
    child.on('close', (exitCode) => {
      if (settled) return;
      settled = true;
      if (exitCode !== 0) {
        reject(new StylePixelFactsError(code, `${command} rejected the declared image bytes.`));
      } else resolve(Buffer.concat(stdout));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function probeImageBytes(bytes, { ffprobePath }) {
  let stdout;
  try {
    stdout = await runToolWithInput(ffprobePath, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width,height',
      '-of', 'json',
      'pipe:0',
    ], bytes, { maxOutput: 1024 * 1024, code: 'style_image_probe_failed' });
  } catch (error) {
    if (error instanceof StylePixelFactsError) throw error;
    fail('style_image_probe_failed', 'ffprobe could not inspect declared style-frame bytes.');
  }
  let parsed;
  try {
    parsed = JSON.parse(stdout.toString('utf8'));
  } catch {
    fail('style_image_probe_failed', 'ffprobe returned invalid image metadata.');
  }
  const stream = parsed?.streams?.[0];
  const mediaType = stream?.codec_name === 'png' ? 'image/png'
    : stream?.codec_name === 'mjpeg' ? 'image/jpeg' : null;
  if (!mediaType) fail('style_image_format_unsupported', 'Only actual PNG and JPEG frames are accepted.');
  if (!Number.isSafeInteger(stream.width) || stream.width < 1
    || !Number.isSafeInteger(stream.height) || stream.height < 1
    || stream.width * stream.height > MAX_PIXELS) {
    fail('style_image_raster_invalid', 'Style-frame raster is invalid or exceeds the pixel limit.');
  }
  return { width: stream.width, height: stream.height, media_type: mediaType };
}

async function decodeRgbaBytes(bytes, raster, { ffmpegPath }) {
  let stdout;
  try {
    stdout = await runToolWithInput(ffmpegPath, [
      '-v', 'error',
      '-i', 'pipe:0',
      '-frames:v', '1',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      'pipe:1',
    ], bytes, {
      maxOutput: raster.width * raster.height * 4 + 1024,
      code: 'style_image_decode_failed',
    });
  } catch (error) {
    if (error instanceof StylePixelFactsError) throw error;
    fail('style_image_decode_failed', 'ffmpeg could not decode declared style-frame bytes.');
  }
  const pixels = Buffer.from(stdout);
  if (pixels.length !== raster.width * raster.height * 4) {
    fail('style_image_decode_failed', 'Decoded RGBA pixels do not match the probed raster.');
  }
  return pixels;
}

function regionFacts(rgba, raster, roi) {
  const x0 = roi?.x ?? 0;
  const y0 = roi?.y ?? 0;
  const width = roi?.width ?? raster.width;
  const height = roi?.height ?? raster.height;
  const pixelCount = width * height;
  const lumas = new Uint8Array(pixelCount);
  let lumaSum = 0;
  let lumaSquareSum = 0;
  let chromaCount = 0;
  let alphaNonzero = 0;
  let opaqueCount = 0;
  let index = 0;
  const border = [];
  for (let y = y0; y < y0 + height; y += 1) {
    for (let x = x0; x < x0 + width; x += 1) {
      const offset = (y * raster.width + x) * 4;
      const red = rgba[offset];
      const green = rgba[offset + 1];
      const blue = rgba[offset + 2];
      const alpha = rgba[offset + 3];
      const luma = (54 * red + 183 * green + 19 * blue + 128) >> 8;
      lumas[index] = luma;
      lumaSum += luma;
      lumaSquareSum += luma * luma;
      if (Math.max(red, green, blue) - Math.min(red, green, blue) >= CHROMA_THRESHOLD) chromaCount += 1;
      if (alpha > 0) alphaNonzero += 1;
      if (alpha === 255) opaqueCount += 1;
      if (x === x0 || y === y0 || x === x0 + width - 1 || y === y0 + height - 1) {
        border.push([red, green, blue, alpha]);
      }
      index += 1;
    }
  }
  const borderMean = [0, 1, 2, 3].map((channel) => Math.round(
    border.reduce((sum, pixel) => sum + pixel[channel], 0) / border.length,
  ));
  let occupiedCount = 0;
  index = 0;
  for (let y = y0; y < y0 + height; y += 1) {
    for (let x = x0; x < x0 + width; x += 1) {
      const offset = (y * raster.width + x) * 4;
      const deviation = Math.max(
        Math.abs(rgba[offset] - borderMean[0]),
        Math.abs(rgba[offset + 1] - borderMean[1]),
        Math.abs(rgba[offset + 2] - borderMean[2]),
        Math.abs(rgba[offset + 3] - borderMean[3]),
      );
      if (deviation >= OCCUPANCY_THRESHOLD) occupiedCount += 1;
      index += 1;
    }
  }
  let edgeCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const current = lumas[y * width + x];
      const horizontal = x + 1 < width ? Math.abs(current - lumas[y * width + x + 1]) : 0;
      const vertical = y + 1 < height ? Math.abs(current - lumas[(y + 1) * width + x]) : 0;
      if (Math.max(horizontal, vertical) >= EDGE_THRESHOLD) edgeCount += 1;
    }
  }
  const mean = lumaSum / pixelCount;
  const variance = Math.max(0, lumaSquareSum / pixelCount - mean * mean);
  return {
    pixel_count: pixelCount,
    average_luma_milli: milli(mean),
    luma_stddev_milli: milli(Math.sqrt(variance)),
    chroma_pixel_basis_points: basisPoints(chromaCount, pixelCount),
    edge_pixel_basis_points: basisPoints(edgeCount, pixelCount),
    border_deviation_occupancy_basis_points: basisPoints(occupiedCount, pixelCount),
    alpha_nonzero_basis_points: basisPoints(alphaNonzero, pixelCount),
    opaque_pixel_basis_points: basisPoints(opaqueCount, pixelCount),
  };
}

export async function measureStyleFrameBytes(value, {
  declaredRoi = null,
  ffmpegPath = 'ffmpeg',
  ffprobePath = 'ffprobe',
  field = '$frame',
} = {}) {
  const bytes = Buffer.isBuffer(value) || value instanceof Uint8Array ? Buffer.from(value) : null;
  if (!bytes || bytes.length < 1 || bytes.length > MAX_IMAGE_BYTES) {
    fail('style_frame_size_invalid', 'Resolved style-frame bytes are missing or oversized.', field);
  }
  if (declaredRoi !== null) validateRoi(declaredRoi, `${field}.declared_roi`);
  const raster = await probeImageBytes(bytes, { ffprobePath });
  if (declaredRoi
    && (declaredRoi.x + declaredRoi.width > raster.width
      || declaredRoi.y + declaredRoi.height > raster.height)) {
    fail('style_roi_outside_raster', 'Declared ROI extends outside the actual image raster.', `${field}.declared_roi`);
  }
  const rgba = await decodeRgbaBytes(bytes, raster, { ffmpegPath });
  return {
    sha256: hashBytes(bytes),
    size_bytes: bytes.length,
    media_type: raster.media_type,
    width: raster.width,
    height: raster.height,
    decoded_rgba_sha256: hashBytes(rgba),
    measurement_thresholds: {
      chroma_delta: CHROMA_THRESHOLD,
      edge_luma_delta: EDGE_THRESHOLD,
      border_deviation_delta: OCCUPANCY_THRESHOLD,
    },
    whole_frame_facts: regionFacts(rgba, raster, null),
    declared_roi: declaredRoi,
    roi_facts: declaredRoi ? regionFacts(rgba, raster, declaredRoi) : null,
  };
}

async function measureFrame(frame, document, root, options) {
  const resolved = await resolveFrame(root, frame.locator, `$.frames:${frame.artifact_id}`);
  const measured = await measureStyleFrameBytes(resolved.bytes, {
    declaredRoi: frame.declared_roi,
    ...options,
    field: `$.frames:${frame.artifact_id}`,
  });
  const captureCore = {
    artifact_id: frame.artifact_id,
    block_manifest_sha256: document.block_manifest_sha256,
    source_sha256s: document.source_sha256s,
    shot_id: frame.shot_id,
    phase: frame.state,
    projected_frame: frame.projected_frame,
    timestamp_ms: frame.timestamp_ms,
    projection_sha256: document.projection_sha256,
    shot_recipe_sha256: frame.shot_recipe_sha256,
    renderer_tool_id: document.renderer.tool_id,
    renderer_tool_version: document.renderer.tool_version,
    renderer_receipt_sha256: document.renderer.receipt_sha256,
    review_generation: document.review_generation,
    sha256: measured.sha256,
    size_bytes: measured.size_bytes,
    media_type: measured.media_type,
    width: measured.width,
    height: measured.height,
    decoded_rgba_sha256: measured.decoded_rgba_sha256,
  };
  return {
    ...captureCore,
    capture_binding_sha256: fingerprintArtifactValue(captureCore),
    measurement_thresholds: measured.measurement_thresholds,
    whole_frame_facts: measured.whole_frame_facts,
    declared_roi: measured.declared_roi,
    roi_facts: measured.roi_facts,
  };
}

/**
 * Measure objective pixel facts from actual frozen PNG/JPEG bytes.
 *
 * This function intentionally has no pass/fail thresholds and returns no
 * aesthetic, style, readability, emphasis, or delivery verdict.
 */
export async function measureStylePixelFacts(document, {
  root,
  ffmpegPath = 'ffmpeg',
  ffprobePath = 'ffprobe',
} = {}) {
  validateRequest(document);
  if (typeof root !== 'string' || !root) {
    fail('style_frame_root_required', 'A frame evidence root is required.');
  }
  const frames = [];
  for (const frame of document.frames) {
    frames.push(await measureFrame(frame, document, root, { ffmpegPath, ffprobePath }));
  }
  const core = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: TOPOLOGY_ID,
    producer: 'measure-style-pixel-facts-v1',
    authority_scope: 'objective-pixel-facts-only',
    block_id: document.block_id,
    block_manifest_sha256: document.block_manifest_sha256,
    source_sha256s: document.source_sha256s,
    projection_sha256: document.projection_sha256,
    review_generation: document.review_generation,
    renderer: document.renderer,
    shot_count: new Set(frames.map((frame) => frame.shot_id)).size,
    frame_count: frames.length,
    frames,
  };
  return { ...core, facts_sha256: fingerprintArtifactValue(core) };
}

function usage() {
  return `Usage:
  node measure-style-pixel-facts.mjs --input <request.json> --root <frame-root> [--output <facts.json>]
                                     [--ffmpeg <path>] [--ffprobe <path>]

Measures path-free objective facts from actual PNG/JPEG pixels. It never emits
an aesthetic verdict or approves animation, rhythm, transitions, lifecycle, or seek behavior.
`;
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const allowed = new Set(['--input', '--root', '--output', '--ffmpeg', '--ffprobe']);
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(key) || typeof value !== 'string' || value.startsWith('--')) {
      fail('style_pixel_cli_invalid', 'Invalid command-line arguments. Use --help.');
    }
    result[key.slice(2)] = value;
  }
  if (!result.input || !result.root) fail('style_pixel_cli_invalid', '--input and --root are required. Use --help.');
  return result;
}

async function cli(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  let document;
  try {
    document = JSON.parse(await readFile(args.input, 'utf8'));
  } catch {
    fail('style_pixel_input_unreadable', 'Input request is missing or invalid JSON.');
  }
  const result = await measureStylePixelFacts(document, {
    root: args.root,
    ffmpegPath: args.ffmpeg ?? 'ffmpeg',
    ffprobePath: args.ffprobe ?? 'ffprobe',
  });
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (args.output) await writeFile(args.output, output, 'utf8');
  else process.stdout.write(output);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  cli(process.argv.slice(2)).catch((error) => {
    const code = error instanceof StylePixelFactsError ? error.code : 'style_pixel_internal_error';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
