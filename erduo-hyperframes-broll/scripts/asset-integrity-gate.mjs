#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprintFile, fingerprintValue } from './state.mjs';
import { probeMedia } from './probe-media.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const ASSET_ID = /^UA-[0-9a-f]{16}$/u;
const PATH_OR_URL = /^(?:https?:|file:|\/|[A-Za-z]:[\\/]|\\\\)/u;
const ROUTES = new Set(['user-media', 'pexels', 'image-generation']);
const EXIT_INVALID = 2;
const EXIT_READ = 3;
const EXIT_USAGE = 64;

export class AssetIntegrityError extends Error {
  constructor(code, message, shotId) { super(message); this.name = 'AssetIntegrityError'; this.code = code; if (shotId) this.shot_id = shotId; }
}

function fail(code, message, shotId) { throw new AssetIntegrityError(code, message, shotId); }
function exact(value, fields, code = 'invalid_request') {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(code, 'Asset integrity input is invalid.');
}
function positive(value, shotId) { if (!Number.isSafeInteger(value) || value <= 0) fail('invalid_request', 'Asset integrity input is invalid.', shotId); return value; }
function nonNegative(value, shotId) { if (!Number.isSafeInteger(value) || value < 0) fail('invalid_request', 'Asset integrity input is invalid.', shotId); return value; }

export function cropMetrics(width, height, targetWidth, targetHeight) {
  const sourceRatio = width / height;
  const targetRatio = targetWidth / targetHeight;
  const retention = Math.min(sourceRatio / targetRatio, targetRatio / sourceRatio);
  const cropWidth = sourceRatio > targetRatio ? Math.floor(height * targetRatio) : width;
  const cropHeight = sourceRatio > targetRatio ? height : Math.floor(width / targetRatio);
  return { retention, crop_width: cropWidth, crop_height: cropHeight, usable: retention >= 0.55 && cropWidth >= targetWidth && cropHeight >= targetHeight };
}

function verifyAssetRef(route, assetRef, shotId) {
  if (route === 'user-media') {
    exact(assetRef, ['asset_id']);
    if (!ASSET_ID.test(assetRef.asset_id)) fail('invalid_asset_ref', 'Asset reference is invalid.', shotId);
  } else {
    exact(assetRef, [route === 'pexels' ? 'download_cache_key' : 'render_cache_key']);
    const key = route === 'pexels' ? assetRef.download_cache_key : assetRef.render_cache_key;
    if (!SHA256.test(key)) fail('invalid_asset_ref', 'Asset reference is invalid.', shotId);
  }
}

function verifyExpected(value, shotId) {
  exact(value, ['media_kind', 'width', 'height', 'duration_ms', 'min_duration_ms']);
  if (!['image', 'video'].includes(value.media_kind)) fail('invalid_request', 'Asset integrity input is invalid.', shotId);
  positive(value.width, shotId); positive(value.height, shotId); nonNegative(value.min_duration_ms, shotId);
  if (value.media_kind === 'image') {
    if (value.duration_ms !== null) fail('invalid_request', 'Asset integrity input is invalid.', shotId);
  } else if (!Number.isSafeInteger(value.duration_ms) || value.duration_ms < value.min_duration_ms) {
    fail('invalid_request', 'Asset integrity input is invalid.', shotId);
  }
}

export function validateAssetIntegrityRequest(document) {
  exact(document, ['schema_version', 'target_width', 'target_height', 'assets']);
  if (document.schema_version !== 1 || !Array.isArray(document.assets) || !document.assets.length) fail('invalid_request', 'Asset integrity input is invalid.');
  positive(document.target_width); positive(document.target_height);
  const shots = new Set();
  for (const item of document.assets) {
    exact(item, ['shot_id', 'route', 'asset_ref', 'expected']);
    if (typeof item.shot_id !== 'string' || !/^[A-Z][A-Z0-9_-]{0,63}$/u.test(item.shot_id) || shots.has(item.shot_id) || !ROUTES.has(item.route)) fail('invalid_request', 'Asset integrity input is invalid.', item?.shot_id);
    shots.add(item.shot_id);
    verifyAssetRef(item.route, item.asset_ref, item.shot_id);
    verifyExpected(item.expected, item.shot_id);
  }
  return document;
}

function mediaKind(probe) { return probe?.video?.primary && probe.duration_ms === null && probe.audio?.count === 0 ? 'image' : probe?.video?.primary ? 'video' : null; }
function safeRef(item) { return item.route === 'user-media' ? { asset_id: item.asset_ref.asset_id } : item.route === 'pexels' ? { download_cache_key: item.asset_ref.download_cache_key } : { render_cache_key: item.asset_ref.render_cache_key }; }

async function assertLocalFile(localPath, fsImpl, shotId) {
  if (typeof localPath !== 'string' || !localPath || PATH_OR_URL.test(localPath) && /^https?:|^file:/u.test(localPath)) fail('unverified_location', 'Resolved asset location is not a local file.', shotId);
  let stat;
  try { stat = await fsImpl.lstat(localPath); } catch { fail('asset_missing', 'Frozen asset is missing or unreadable.', shotId); }
  if (stat.isSymbolicLink() || !stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size <= 0) fail('asset_missing', 'Frozen asset is missing or unreadable.', shotId);
}

function assertProbe(item, probe, targetWidth, targetHeight) {
  const shotId = item.shot_id;
  const primary = probe?.video?.primary;
  if (!primary || mediaKind(probe) !== item.expected.media_kind || primary.display_width !== item.expected.width || primary.display_height !== item.expected.height || (item.expected.media_kind === 'image' ? probe.duration_ms !== null : probe.duration_ms !== item.expected.duration_ms || probe.duration_ms < item.expected.min_duration_ms)) fail('asset_metadata_changed', 'Frozen asset metadata no longer matches its selected record.', shotId);
  const crop = cropMetrics(primary.display_width, primary.display_height, targetWidth, targetHeight);
  if (!crop.usable) fail('crop_or_resolution_unsuitable', 'Frozen asset cannot satisfy the target crop and resolution.', shotId);
  return crop;
}

export async function verifyFrozenAssets(document, resolveAsset, {
  fsImpl = fs,
  probe = probeMedia,
  fingerprint = fingerprintFile,
} = {}) {
  validateAssetIntegrityRequest(document);
  if (typeof resolveAsset !== 'function' || typeof probe !== 'function' || typeof fingerprint !== 'function') fail('resolver_unavailable', 'Asset integrity resolver is unavailable.');
  const assets = [];
  for (const item of document.assets) {
    let localPath;
    try { localPath = await resolveAsset({ shot_id: item.shot_id, route: item.route, asset_ref: safeRef(item) }); } catch { fail('asset_missing', 'Frozen asset is missing or unreadable.', item.shot_id); }
    await assertLocalFile(localPath, fsImpl, item.shot_id);
    let actual;
    try { actual = await probe(localPath); } catch { fail('asset_unreadable', 'Frozen asset failed media verification.', item.shot_id); }
    const crop = assertProbe(item, actual, document.target_width, document.target_height);
    let file;
    try { file = await fingerprint(localPath); } catch { fail('asset_unreadable', 'Frozen asset failed integrity verification.', item.shot_id); }
    if (!SHA256.test(file?.sha256) || !Number.isSafeInteger(file.size_bytes) || file.size_bytes <= 0) fail('asset_unreadable', 'Frozen asset failed integrity verification.', item.shot_id);
    assets.push({ shot_id: item.shot_id, route: item.route, asset_ref: safeRef(item), frozen_sha256: file.sha256, size_bytes: file.size_bytes, media_kind: item.expected.media_kind, width: actual.video.primary.display_width, height: actual.video.primary.display_height, duration_ms: actual.duration_ms, crop_retention_basis_points: Math.round(crop.retention * 10_000) });
  }
  const core = { schema_version: 1, target_width: document.target_width, target_height: document.target_height, asset_count: assets.length, assets };
  return { ...core, integrity_sha256: fingerprintValue(core) };
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  if (argv.length !== 2 || argv.some((value) => value.startsWith('-'))) return { error: true };
  return { request: argv[0], locations: argv[1] };
}
function createResolver(locations) {
  exact(locations, ['schema_version', 'locations'], 'invalid_locations');
  if (locations.schema_version !== 1 || !Array.isArray(locations.locations)) fail('invalid_locations', 'Asset locations are invalid.');
  const lookup = new Map();
  for (const item of locations.locations) {
    exact(item, ['shot_id', 'route', 'asset_ref', 'local_path'], 'invalid_locations');
    if (typeof item.shot_id !== 'string' || !ROUTES.has(item.route) || typeof item.local_path !== 'string') fail('invalid_locations', 'Asset locations are invalid.');
    verifyAssetRef(item.route, item.asset_ref, item.shot_id);
    const key = JSON.stringify({ shot_id: item.shot_id, route: item.route, asset_ref: safeRef(item) });
    if (lookup.has(key)) fail('invalid_locations', 'Asset locations are invalid.');
    lookup.set(key, item.local_path);
  }
  return (item) => lookup.get(JSON.stringify(item));
}
export async function runAssetIntegrityCli(argv, adapters = {}) {
  const stdout = adapters.stdout ?? process.stdout; const stderr = adapters.stderr ?? process.stderr; const readFile = adapters.readFile ?? fs.readFile; const args = parseArgs(argv);
  if (args.help) { stdout.write('Usage: node scripts/asset-integrity-gate.mjs <asset-requests.json> <private-asset-locations.json>\n'); return 0; }
  if (args.error) { stderr.write('asset-integrity-gate: invalid arguments (use --help)\n'); return EXIT_USAGE; }
  try { const [request, locations] = await Promise.all([readFile(args.request, 'utf8'), readFile(args.locations, 'utf8')]); stdout.write(`${JSON.stringify(await verifyFrozenAssets(JSON.parse(request), createResolver(JSON.parse(locations)), adapters.options ?? {}))}\n`); return 0; }
  catch (error) { const safe = error instanceof AssetIntegrityError ? { code: error.code, message: error.message, ...(error.shot_id ? { shot_id: error.shot_id } : {}) } : { code: 'read_failed', message: 'Asset integrity inputs could not be read.' }; stderr.write(`${JSON.stringify({ ok: false, error: safe })}\n`); return error instanceof AssetIntegrityError ? EXIT_INVALID : EXIT_READ; }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exit(await runAssetIntegrityCli(process.argv.slice(2)));
