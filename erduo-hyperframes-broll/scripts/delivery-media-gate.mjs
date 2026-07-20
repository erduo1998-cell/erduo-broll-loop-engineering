#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fingerprintValue } from './state.mjs';
import { probeMedia } from './probe-media.mjs';

const execFile = promisify(execFileCallback);
const KINDS = new Set(['fullscreen', 'hard-alpha', 'light-pass', 'talking-head-master', 'faceless-master']);
const PATH_OR_URL = /^(?:https?:|file:|\/|[A-Za-z]:[\\/]|\\\\)/u;
const EXIT_INVALID = 2; const EXIT_READ = 3; const EXIT_USAGE = 64;
export class DeliveryMediaError extends Error { constructor(code, message, artifactId) { super(message); this.name = 'DeliveryMediaError'; this.code = code; if (artifactId) this.artifact_id = artifactId; } }
const fail = (code, message, artifactId) => { throw new DeliveryMediaError(code, message, artifactId); };
function exact(value, fields, code = 'invalid_request') { if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(code, 'Delivery media input is invalid.'); }
function positive(value, id) { if (!Number.isSafeInteger(value) || value <= 0) fail('invalid_request', 'Delivery media input is invalid.', id); return value; }
function hasAlpha(pixelFormat) { return typeof pixelFormat === 'string' && /(?:^|[^a-z])a|yuva|rgba|gbrap/iu.test(pixelFormat); }
function safeArtifact(item) { return { artifact_id: item.artifact_id, kind: item.kind }; }

function verifyExpected(value, id) {
  exact(value, ['duration_ms', 'width', 'height', 'frame_rate']); positive(value.duration_ms, id); positive(value.width, id); positive(value.height, id);
  exact(value.frame_rate, ['numerator', 'denominator']); positive(value.frame_rate.numerator, id); positive(value.frame_rate.denominator, id);
}
export function validateDeliveryRequest(document) {
  exact(document, ['schema_version', 'artifacts']);
  if (document.schema_version !== 1 || !Array.isArray(document.artifacts) || !document.artifacts.length) fail('invalid_request', 'Delivery media input is invalid.');
  const ids = new Set();
  for (const item of document.artifacts) {
    exact(item, ['artifact_id', 'kind', 'expected']);
    if (typeof item.artifact_id !== 'string' || !/^[A-Z][A-Z0-9_-]{0,63}$/u.test(item.artifact_id) || ids.has(item.artifact_id) || !KINDS.has(item.kind)) fail('invalid_request', 'Delivery media input is invalid.', item?.artifact_id);
    ids.add(item.artifact_id); verifyExpected(item.expected, item.artifact_id);
  }
  return document;
}
function frameTolerance(expected) { return Math.max(1, Math.ceil(1000 * expected.denominator / expected.numerator)); }
function hasMovFamily(probe) { return Array.isArray(probe.format_names) && probe.format_names.includes('mov'); }
function expectedAudioCount(kind) { return kind === 'talking-head-master' ? 1 : 0; }
function validateProbe(item, probe) {
  const id = item.artifact_id; const video = probe?.video?.primary; const audio = probe?.audio;
  if (!probe?.decode?.ok || !video || !hasMovFamily(probe) || probe.duration_ms === null) fail('media_invalid', 'Rendered media is not a decodable visual container.', id);
  if (Math.abs(probe.duration_ms - item.expected.duration_ms) > frameTolerance(item.expected.frame_rate) || video.display_width !== item.expected.width || video.display_height !== item.expected.height || video.frame_rate?.numerator !== item.expected.frame_rate.numerator || video.frame_rate?.denominator !== item.expected.frame_rate.denominator) fail('media_metadata_mismatch', 'Rendered media does not match its delivery contract.', id);
  if (!audio || audio.count !== expectedAudioCount(item.kind) || (audio.count && !audio.primary)) fail('audio_policy_mismatch', 'Rendered media violates the delivery audio policy.', id);
  if (item.kind === 'hard-alpha') {
    if (video.codec !== 'prores' || !hasAlpha(video.pixel_format)) fail('alpha_format_mismatch', 'Hard-alpha media is not a verified Alpha format.', id);
  } else if (video.codec !== 'h264' || hasAlpha(video.pixel_format)) fail('opaque_format_mismatch', 'Opaque delivery media has an invalid codec or Alpha channel.', id);
}
function parseStats(text) { const min = /lavfi\.signalstats\.YMIN=([0-9.]+)/u.exec(text); const max = /lavfi\.signalstats\.YMAX=([0-9.]+)/u.exec(text); if (!min || !max) throw new Error('signal stats unavailable'); return { min: Number(min[1]), max: Number(max[1]) }; }
export async function signalStats(localPath, mode, { execFileAsync = execFile, platform = process.platform } = {}) {
  const ffmpeg = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'; const filter = mode === 'alpha' ? 'alphaextract,signalstats,metadata=print' : 'signalstats,metadata=print';
  const result = await execFileAsync(ffmpeg, ['-v', 'info', '-i', localPath, '-vf', filter, '-frames:v', '1', '-f', 'null', '-'], { timeout: 120_000, maxBuffer: 1024 * 1024 });
  return parseStats(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
}
export async function fullDecode(localPath, { execFileAsync = execFile, platform = process.platform } = {}) {
  const ffmpeg = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'; await execFileAsync(ffmpeg, ['-v', 'error', '-xerror', '-i', localPath, '-map', '0:v?', '-map', '0:a?', '-f', 'null', '-'], { timeout: 300_000, maxBuffer: 1024 * 1024 });
}
async function assertFile(localPath, fsImpl, id) {
  if (typeof localPath !== 'string' || !localPath || /^https?:|^file:/u.test(localPath)) fail('artifact_missing', 'Rendered media is missing or unreadable.', id);
  try { const stat = await fsImpl.lstat(localPath); if (stat.isSymbolicLink() || !stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size <= 0) fail('artifact_missing', 'Rendered media is missing or unreadable.', id); } catch (error) { if (error instanceof DeliveryMediaError) throw error; fail('artifact_missing', 'Rendered media is missing or unreadable.', id); }
}
function validateSignal(item, stats) {
  if (!stats || !Number.isFinite(stats.min) || !Number.isFinite(stats.max) || stats.min > stats.max) fail('pixel_analysis_failed', 'Rendered media pixels could not be verified.', item.artifact_id);
  if (item.kind === 'hard-alpha' && !(stats.min < stats.max && stats.max > 0)) fail('alpha_semantics_invalid', 'Hard-alpha media has no verified transparent and opaque pixels.', item.artifact_id);
  if (item.kind === 'light-pass' && !(stats.min <= 24 && stats.max > stats.min)) fail('light_pass_semantics_invalid', 'Light-pass media is not a visible near-black light layer.', item.artifact_id);
}
export async function verifyDeliveryMedia(document, resolveArtifact, { fsImpl = fs, probe = probeMedia, decode = fullDecode, analyze = signalStats } = {}) {
  validateDeliveryRequest(document); if (typeof resolveArtifact !== 'function' || typeof probe !== 'function' || typeof decode !== 'function' || typeof analyze !== 'function') fail('resolver_unavailable', 'Delivery media verifier is unavailable.');
  const artifacts = [];
  for (const item of document.artifacts) {
    let localPath; try { localPath = await resolveArtifact(safeArtifact(item)); } catch { fail('artifact_missing', 'Rendered media is missing or unreadable.', item.artifact_id); }
    await assertFile(localPath, fsImpl, item.artifact_id);
    let metadata; try { metadata = await probe(localPath); } catch { fail('media_invalid', 'Rendered media could not be probed.', item.artifact_id); }
    validateProbe(item, metadata);
    try { await decode(localPath); } catch { fail('full_decode_failed', 'Rendered media failed a full decode.', item.artifact_id); }
    if (item.kind === 'hard-alpha' || item.kind === 'light-pass') { let stats; try { stats = await analyze(localPath, item.kind === 'hard-alpha' ? 'alpha' : 'light'); } catch { fail('pixel_analysis_failed', 'Rendered media pixels could not be verified.', item.artifact_id); } validateSignal(item, stats); }
    artifacts.push({ artifact_id: item.artifact_id, kind: item.kind, duration_ms: metadata.duration_ms, width: metadata.video.primary.display_width, height: metadata.video.primary.display_height, frame_rate: metadata.video.primary.frame_rate, codec: metadata.video.primary.codec, pixel_format: metadata.video.primary.pixel_format, audio_count: metadata.audio.count, ...(item.kind === 'hard-alpha' || item.kind === 'light-pass' ? { pixel_semantics: item.kind === 'hard-alpha' ? 'transparent-and-opaque' : 'visible-near-black' } : {}) });
  }
  const core = { schema_version: 1, artifact_count: artifacts.length, artifacts }; return { ...core, verification_sha256: fingerprintValue(core) };
}
function parseArgs(argv) { if (argv.includes('--help') || argv.includes('-h')) return { help: true }; if (argv.length !== 2 || argv.some((value) => value.startsWith('-'))) return { error: true }; return { request: argv[0], locations: argv[1] }; }
function createResolver(locations) { exact(locations, ['schema_version', 'locations'], 'invalid_locations'); if (locations.schema_version !== 1 || !Array.isArray(locations.locations)) fail('invalid_locations', 'Delivery media locations are invalid.'); const map = new Map(); for (const entry of locations.locations) { exact(entry, ['artifact_id', 'kind', 'local_path'], 'invalid_locations'); if (typeof entry.artifact_id !== 'string' || !KINDS.has(entry.kind) || typeof entry.local_path !== 'string' || map.has(`${entry.artifact_id}:${entry.kind}`)) fail('invalid_locations', 'Delivery media locations are invalid.'); map.set(`${entry.artifact_id}:${entry.kind}`, entry.local_path); } return ({ artifact_id, kind }) => map.get(`${artifact_id}:${kind}`); }
export async function runDeliveryMediaCli(argv, adapters = {}) { const stdout = adapters.stdout ?? process.stdout; const stderr = adapters.stderr ?? process.stderr; const readFile = adapters.readFile ?? fs.readFile; const args = parseArgs(argv); if (args.help) { stdout.write('Usage: node scripts/delivery-media-gate.mjs <delivery-request.json> <private-media-locations.json>\n'); return 0; } if (args.error) { stderr.write('delivery-media-gate: invalid arguments (use --help)\n'); return EXIT_USAGE; } try { const [request, locations] = await Promise.all([readFile(args.request, 'utf8'), readFile(args.locations, 'utf8')]); stdout.write(`${JSON.stringify(await verifyDeliveryMedia(JSON.parse(request), createResolver(JSON.parse(locations)), adapters.options ?? {}))}\n`); return 0; } catch (error) { const safe = error instanceof DeliveryMediaError ? { code: error.code, message: error.message, ...(error.artifact_id ? { artifact_id: error.artifact_id } : {}) } : { code: 'read_failed', message: 'Delivery media inputs could not be read.' }; stderr.write(`${JSON.stringify({ ok: false, error: safe })}\n`); return error instanceof DeliveryMediaError ? EXIT_INVALID : EXIT_READ; } }
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); if (isMain) process.exit(await runDeliveryMediaCli(process.argv.slice(2)));
