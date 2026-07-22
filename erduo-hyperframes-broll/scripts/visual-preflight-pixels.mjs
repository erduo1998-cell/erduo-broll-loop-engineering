import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT = /^S\d{3}$/u;
const STATE_NAMES = ['entry', 'result', 'exit'];
const MAX_FINDINGS = 512;

export class VisualPreflightError extends Error {
  constructor(code, message, shot_id) {
    super(message);
    this.name = 'VisualPreflightError';
    this.code = code;
    if (shot_id) this.shot_id = shot_id;
  }
}

const fail = (code, message, shotId) => { throw new VisualPreflightError(code, message, shotId); };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const exact = (value, fields, code = 'visual_preflight_invalid', shotId) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(code, 'Visual preflight evidence has an invalid shape.', shotId);
};

function validateState(state, shotId) {
  exact(state, ['timestamp_ms', 'frame_sha256', 'frame_artifact_id'], 'visual_preflight_state_invalid', shotId);
  if (!Number.isSafeInteger(state.timestamp_ms) || state.timestamp_ms < 0
    || !SHA256.test(state.frame_sha256 ?? '') || typeof state.frame_artifact_id !== 'string' || !state.frame_artifact_id.trim()) {
    fail('visual_preflight_state_invalid', 'A preflight state needs a timestamp, frame hash and internal artifact ID.', shotId);
  }
}

/**
 * This schema deliberately does not alter final schema-v2 visual evidence.  It is
 * an internal, pre-master evidence document whose artifact IDs are resolved by the
 * isolated reviewer.  Its image bytes must be full-resolution lossless stills.
 */
export function validateVisualPreflightEvidence(evidence) {
  exact(evidence, ['schema_version', 'evidence_kind', 'shots']);
  if (evidence.schema_version !== 1 || evidence.evidence_kind !== 'internal-pre-master-stills'
    || !Array.isArray(evidence.shots) || evidence.shots.length === 0) {
    fail('visual_preflight_invalid', 'Pre-master visual evidence is invalid.');
  }
  const ids = new Set();
  for (const shot of evidence.shots) {
    exact(shot, ['shot_id', 'entry', 'result', 'exit'], 'visual_preflight_invalid', shot?.shot_id);
    if (!SHOT.test(shot.shot_id ?? '') || ids.has(shot.shot_id)) fail('visual_preflight_invalid', 'Shot IDs must be unique S-numbers.', shot?.shot_id);
    ids.add(shot.shot_id);
    for (const stateName of STATE_NAMES) validateState(shot[stateName], shot.shot_id);
    if (!(shot.entry.timestamp_ms < shot.result.timestamp_ms && shot.result.timestamp_ms < shot.exit.timestamp_ms)) {
      fail('visual_preflight_state_invalid', 'Entry, result and exit timestamps must be strictly ordered.', shot.shot_id);
    }
    if (new Set(STATE_NAMES.map((stateName) => shot[stateName].frame_sha256)).size !== 3) {
      fail('visual_preflight_state_invalid', 'Entry, result and exit evidence must be distinct frame bytes.', shot.shot_id);
    }
  }
  return { shot_count: evidence.shots.length };
}

function ppmTokens(bytes) {
  const tokens = [];
  let token = '';
  let comment = false;
  for (const byte of bytes) {
    if (comment) { if (byte === 10 || byte === 13) comment = false; continue; }
    if (byte === 35) { if (token) { tokens.push(token); token = ''; } comment = true; continue; }
    if (byte === 9 || byte === 10 || byte === 13 || byte === 32) { if (token) { tokens.push(token); token = ''; } continue; }
    token += String.fromCharCode(byte);
  }
  if (token) tokens.push(token);
  return tokens;
}

function ppmHeaderEnd(bytes) {
  let values = 0;
  let inToken = false;
  let comment = false;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (comment) { if (byte === 10 || byte === 13) comment = false; continue; }
    if (byte === 35) { comment = true; inToken = false; continue; }
    const space = byte === 9 || byte === 10 || byte === 13 || byte === 32;
    if (!space && !inToken) { inToken = true; values += 1; }
    if (space && inToken) {
      inToken = false;
      if (values === 4) return index + 1;
    }
  }
  return -1;
}

/** Decode a P3/P6 PPM.  Renderers may use PNG/WebP/JPEG too; CLI decoding uses ffmpeg. */
export function decodePpm(bytes) {
  if (!Buffer.isBuffer(bytes)) fail('visual_preflight_decode_failed', 'Frame bytes are unavailable.');
  const magic = bytes.subarray(0, 2).toString('ascii');
  if (!['P3', 'P6'].includes(magic)) fail('visual_preflight_decode_failed', 'Frame is not a supported PPM image.');
  if (magic === 'P3') {
    const tokens = ppmTokens(bytes);
    if (tokens.length < 4) fail('visual_preflight_decode_failed', 'PPM header is incomplete.');
    const [format, widthText, heightText, maxText, ...pixels] = tokens;
    const width = Number(widthText); const height = Number(heightText); const max = Number(maxText);
    if (format !== 'P3' || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || max !== 255 || pixels.length !== width * height * 3) fail('visual_preflight_decode_failed', 'PPM image dimensions are invalid.');
    const rgb = Uint8Array.from(pixels.map(Number));
    if (rgb.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) fail('visual_preflight_decode_failed', 'PPM pixels are invalid.');
    return { width, height, rgb };
  }
  const headerEnd = ppmHeaderEnd(bytes);
  const header = ppmTokens(bytes.subarray(0, headerEnd));
  const width = Number(header[1]); const height = Number(header[2]); const max = Number(header[3]);
  if (headerEnd < 0 || header[0] !== 'P6' || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || max !== 255) fail('visual_preflight_decode_failed', 'PPM image dimensions are invalid.');
  const rgb = bytes.subarray(headerEnd);
  if (rgb.length !== width * height * 3) fail('visual_preflight_decode_failed', 'PPM pixel payload is invalid.');
  return { width, height, rgb: Uint8Array.from(rgb) };
}

function decodeImagePath(framePath) {
  const direct = spawnSync('ffmpeg', ['-v', 'error', '-i', framePath, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'ppm', 'pipe:1'], { encoding: null, maxBuffer: 256 * 1024 * 1024 });
  if (direct.error || direct.status !== 0 || !direct.stdout?.length) fail('visual_preflight_decode_failed', 'Frame image could not be decoded into pixels.');
  return decodePpm(direct.stdout);
}

function frameMetrics(frame) {
  const { width, height, rgb } = frame;
  const pixelCount = width * height;
  let sum = 0; let squared = 0; let nearBlack = 0; let bright = 0;
  const colorBins = new Map();
  const grid = Array.from({ length: 64 }, () => ({ sum: 0, count: 0, bright: 0 }));
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 3;
    const lum = (0.2126 * rgb[offset] + 0.7152 * rgb[offset + 1] + 0.0722 * rgb[offset + 2]) / 255;
    sum += lum; squared += lum * lum;
    if (lum < 0.03) nearBlack += 1;
    if (lum > 0.08) bright += 1;
    const x = index % width; const y = Math.floor(index / width);
    const cell = grid[Math.min(7, Math.floor(y * 8 / height)) * 8 + Math.min(7, Math.floor(x * 8 / width))];
    cell.sum += lum; cell.count += 1; if (lum > 0.08) cell.bright += 1;
    const colorBin = ((rgb[offset] >> 4) << 8) | ((rgb[offset + 1] >> 4) << 4) | (rgb[offset + 2] >> 4);
    colorBins.set(colorBin, (colorBins.get(colorBin) ?? 0) + 1);
  }
  const mean = sum / pixelCount;
  const gridLuminance = grid.map((cell) => cell.sum / cell.count);
  const activeGridRatio = grid.filter((cell) => cell.bright / cell.count > 0.02).length / grid.length;
  return {
    width, height,
    mean_luminance: mean,
    luminance_stddev: Math.sqrt(Math.max(0, squared / pixelCount - mean * mean)),
    near_black_ratio: nearBlack / pixelCount,
    bright_pixel_ratio: bright / pixelCount,
    active_grid_ratio: activeGridRatio,
    dominant_color_ratio: Math.max(...colorBins.values()) / pixelCount,
    grid_luminance: gridLuminance,
  };
}

function compareFrames(left, right) {
  if (left.width !== right.width || left.height !== right.height) fail('visual_preflight_geometry_mismatch', 'Adjacent result frames have different dimensions.');
  const pixels = left.width * left.height;
  let absolute = 0; let changed = 0;
  const gridDelta = Array.from({ length: 64 }, () => ({ delta: 0, count: 0 }));
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * 3;
    const a = (0.2126 * left.rgb[offset] + 0.7152 * left.rgb[offset + 1] + 0.0722 * left.rgb[offset + 2]) / 255;
    const b = (0.2126 * right.rgb[offset] + 0.7152 * right.rgb[offset + 1] + 0.0722 * right.rgb[offset + 2]) / 255;
    const delta = Math.abs(a - b);
    absolute += delta; if (delta > 0.08) changed += 1;
    const x = index % left.width; const y = Math.floor(index / left.width);
    const cell = gridDelta[Math.min(7, Math.floor(y * 8 / left.height)) * 8 + Math.min(7, Math.floor(x * 8 / left.width))];
    cell.delta += delta; cell.count += 1;
  }
  const coarse = gridDelta.reduce((total, cell) => total + cell.delta / cell.count, 0) / gridDelta.length;
  return { mean_absolute_delta: absolute / pixels, changed_pixel_ratio: changed / pixels, coarse_grid_delta: coarse };
}

const isSparseNearBlack = (metrics) => metrics.near_black_ratio > 0.97
  && metrics.bright_pixel_ratio < 0.04 && metrics.active_grid_ratio < 0.10
  && metrics.luminance_stddev < 0.18;
const isSparseBrightFlat = (metrics) => metrics.mean_luminance > 0.88
  && ((metrics.luminance_stddev < 0.045 && metrics.dominant_color_ratio > 0.55)
    || (metrics.luminance_stddev < 0.08 && metrics.dominant_color_ratio > 0.90));
const isVisuallyRepeated = (comparison) => comparison.mean_absolute_delta < 0.015
  && comparison.changed_pixel_ratio < 0.07 && comparison.coarse_grid_delta < 0.03;
const compactMetrics = (metrics) => ({
  mean_luminance: Number(metrics.mean_luminance.toFixed(4)),
  near_black_ratio: Number(metrics.near_black_ratio.toFixed(4)),
  bright_pixel_ratio: Number(metrics.bright_pixel_ratio.toFixed(4)),
  active_grid_ratio: Number(metrics.active_grid_ratio.toFixed(4)),
  dominant_color_ratio: Number(metrics.dominant_color_ratio.toFixed(4)),
});
const compactComparison = (comparison) => ({
  mean_absolute_delta: Number(comparison.mean_absolute_delta.toFixed(4)),
  changed_pixel_ratio: Number(comparison.changed_pixel_ratio.toFixed(4)),
  coarse_grid_delta: Number(comparison.coarse_grid_delta.toFixed(4)),
});

function scopeShots(evidence, shotIds) {
  if (!shotIds) return evidence.shots;
  if (!Array.isArray(shotIds) || !shotIds.length || shotIds.some((id) => !SHOT.test(id))) fail('visual_preflight_scope_invalid', 'Affected-shot scope is invalid.');
  const selected = new Set(shotIds);
  const missing = shotIds.filter((id) => !evidence.shots.some((shot) => shot.shot_id === id));
  if (missing.length) fail('visual_preflight_scope_invalid', 'Affected-shot scope references a missing shot.');
  return evidence.shots.filter((shot) => selected.has(shot.shot_id));
}

/**
 * Analyze actual RGB pixels.  `readFrame` must resolve the reviewer-private
 * artifact ID and return the exact lossless still bytes.  No DOM, metadata or
 * frame hash difference can create a pass: hashes are verified before pixels are
 * decoded, then all selected findings are accumulated.
 */
export async function analyzeVisualPreflight(evidence, { readFrame, shotIds } = {}) {
  validateVisualPreflightEvidence(evidence);
  if (typeof readFrame !== 'function') fail('visual_preflight_reader_missing', 'A private frame reader is required.');
  const selectedShots = scopeShots(evidence, shotIds);
  const decoded = new Map(); const stateMetrics = new Map();
  for (const shot of selectedShots) {
    for (const stateName of STATE_NAMES) {
      const state = shot[stateName];
      const resolved = await readFrame(state.frame_artifact_id, state);
      const bytes = Buffer.isBuffer(resolved) ? resolved : resolved?.bytes;
      if (!Buffer.isBuffer(bytes) || sha256(bytes) !== state.frame_sha256) fail('visual_preflight_frame_mismatch', 'Frame bytes do not match frozen evidence.', shot.shot_id);
      const frame = Buffer.isBuffer(resolved) ? decodePpm(bytes) : resolved.decoded;
      if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || !(frame.rgb instanceof Uint8Array)) fail('visual_preflight_decode_failed', 'Frame image could not be decoded into pixels.', shot.shot_id);
      decoded.set(`${shot.shot_id}:${stateName}`, frame);
      stateMetrics.set(`${shot.shot_id}:${stateName}`, frameMetrics(frame));
    }
  }
  const findings = [];
  const addFinding = (finding) => { if (findings.length < MAX_FINDINGS) findings.push(finding); };
  for (const shot of selectedShots) {
    const resultMetrics = stateMetrics.get(`${shot.shot_id}:result`);
    if (isSparseNearBlack(resultMetrics)) {
      addFinding({ code: 'sparse_near_black_result', severity: 'error', shot_ids: [shot.shot_id], state: 'result', metrics: compactMetrics(resultMetrics), message: 'Result is near-black with too little distributed visual material; small text alone is not a scene.' });
    }
    if (isSparseBrightFlat(resultMetrics)) {
      addFinding({ code: 'sparse_bright_flat_result', severity: 'error', shot_ids: [shot.shot_id], state: 'result', metrics: compactMetrics(resultMetrics), message: 'Result is a bright low-information or dominant-flat-color frame; tiny marks on a blank field are not a scene.' });
    }
  }
  const selectedSet = new Set(selectedShots.map((shot) => shot.shot_id));
  for (let index = 1; index < evidence.shots.length; index += 1) {
    const previous = evidence.shots[index - 1]; const current = evidence.shots[index];
    if (!selectedSet.has(previous.shot_id) && !selectedSet.has(current.shot_id)) continue;
    // Partial re-review retains the immediately adjacent comparison; it does not
    // silently approve an edited shot merely because its neighbour was omitted.
    for (const shot of [previous, current]) {
      if (!decoded.has(`${shot.shot_id}:result`)) {
        const state = shot.result; const resolved = await readFrame(state.frame_artifact_id, state); const bytes = Buffer.isBuffer(resolved) ? resolved : resolved?.bytes;
        if (!Buffer.isBuffer(bytes) || sha256(bytes) !== state.frame_sha256) fail('visual_preflight_frame_mismatch', 'Frame bytes do not match frozen evidence.', shot.shot_id);
        const frame = Buffer.isBuffer(resolved) ? decodePpm(bytes) : resolved.decoded;
        if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height) || !(frame.rgb instanceof Uint8Array)) fail('visual_preflight_decode_failed', 'Frame image could not be decoded into pixels.', shot.shot_id);
        decoded.set(`${shot.shot_id}:result`, frame);
      }
    }
    const comparison = compareFrames(decoded.get(`${previous.shot_id}:result`), decoded.get(`${current.shot_id}:result`));
    if (isVisuallyRepeated(comparison)) {
      addFinding({ code: 'adjacent_visual_repetition', severity: 'error', shot_ids: [previous.shot_id, current.shot_id], state: 'result', metrics: compactComparison(comparison), message: 'Adjacent results have insufficient pixel-level visual change; DOM, labels and hash differences do not count as a new scene.' });
    }
  }
  return {
    schema_version: 1,
    criteria_version: 'visual-preflight-pixels.v2',
    status: findings.some((finding) => finding.severity === 'error') ? 'revision_required' : 'approved',
    scope: shotIds ? 'affected_shots_plus_adjacent_comparisons' : 'complete_timeline',
    inspected_shot_ids: selectedShots.map((shot) => shot.shot_id),
    inspected_state_count: selectedShots.length * STATE_NAMES.length,
    findings,
  };
}

function parseArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || !argv[index + 1]) return null;
    args.set(argv[index], argv[index + 1]);
  }
  if (!args.has('--evidence') || !args.has('--artifact-map')) return null;
  return { evidence: args.get('--evidence'), artifactMap: args.get('--artifact-map'), output: args.get('--output'), shotIds: args.get('--shot-ids')?.split(',').filter(Boolean) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options) {
    process.stderr.write('Usage: node visual-preflight-pixels.mjs --evidence evidence.json --artifact-map private-frame-map.json [--shot-ids S001,S002] [--output report.json]\n');
    process.exitCode = 2; return;
  }
  const evidence = JSON.parse(await fs.readFile(options.evidence, 'utf8'));
  const artifactMap = JSON.parse(await fs.readFile(options.artifactMap, 'utf8'));
  const report = await analyzeVisualPreflight(evidence, {
    shotIds: options.shotIds,
    readFrame: async (artifactId) => {
      const framePath = artifactMap[artifactId];
      if (typeof framePath !== 'string' || !framePath) fail('visual_preflight_frame_missing', 'A frozen frame artifact is unavailable.');
      // Decode common lossless still formats via ffmpeg, then re-encode PPM for the
      // analyzer. PPM remains a full-resolution internal evidence format, not a
      // user-facing preview or a low-bitrate review video.
      const bytes = await fs.readFile(framePath);
      if (bytes.subarray(0, 2).toString('ascii') === 'P3' || bytes.subarray(0, 2).toString('ascii') === 'P6') return bytes;
      return { bytes, decoded: decodeImagePath(path.resolve(framePath)) };
    },
  });
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) await fs.writeFile(options.output, text); else process.stdout.write(text);
  if (report.status !== 'approved') process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => { process.stderr.write(`${error.code ?? 'visual_preflight_failed'}: ${error.message}\n`); process.exitCode = 1; });
}
