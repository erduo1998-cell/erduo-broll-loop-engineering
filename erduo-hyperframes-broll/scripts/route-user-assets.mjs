#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprintValue } from './state.mjs';
import { semanticTokens } from './index-user-assets.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const ASSET_ID = /^UA-[0-9a-f]{16}$/u;
const SOURCE_ID = /^[A-Z][A-Z0-9-]{2,63}$/u;
const EXIT_INVALID = 2;
const EXIT_READ = 3;
const EXIT_USAGE = 64;

export class UserAssetRouteError extends Error {
  constructor(code, message, shotId) { super(message); this.name = 'UserAssetRouteError'; this.code = code; if (shotId) this.shot_id = shotId; }
}
function fail(code, message, shotId) { throw new UserAssetRouteError(code, message, shotId); }
function exact(value, fields, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(code, message);
}
function positive(value, code, message) { if (!Number.isSafeInteger(value) || value <= 0) fail(code, message); return value; }
function unique(values) { return [...new Set(values)]; }

function verifyBriefs(document) {
  exact(document, ['schema_version', 'plan_sha256', 'brief_count', 'briefs', 'briefs_sha256'], 'invalid_briefs', 'Validated director briefs are invalid.');
  if (document.schema_version !== 1 || !SHA256.test(document.plan_sha256) || !SHA256.test(document.briefs_sha256) || !Array.isArray(document.briefs) || document.brief_count !== document.briefs.length || !document.briefs.length) fail('invalid_briefs', 'Validated director briefs are invalid.');
  const { briefs_sha256, ...core } = document;
  if (fingerprintValue(core) !== briefs_sha256) fail('briefs_tampered', 'Director brief fingerprint is invalid.');
  const ids = new Set();
  for (const brief of document.briefs) {
    if (!brief || typeof brief.shot_id !== 'string' || ids.has(brief.shot_id) || !Number.isSafeInteger(brief.duration_ms) || brief.duration_ms <= 0 || !brief.representation || !brief.visible_action || !brief.evidence || !brief.asset_needs) fail('invalid_briefs', 'Validated director brief is invalid.');
    ids.add(brief.shot_id);
  }
}

function verifyIndex(index) {
  exact(index, ['schema_version', 'candidate_count', 'indexed_count', 'rejected_count', 'assets', 'rejected'], 'invalid_asset_index', 'User asset index is invalid.');
  if (index.schema_version !== 1 || !Array.isArray(index.assets) || index.indexed_count !== index.assets.length || !Number.isSafeInteger(index.candidate_count) || !Number.isSafeInteger(index.rejected_count)) fail('invalid_asset_index', 'User asset index is invalid.');
  const ids = new Set();
  for (const asset of index.assets) {
    exact(asset, ['asset_id', 'relative_path', 'media_kind', 'size_bytes', 'duration_ms', 'width', 'height', 'orientation', 'codec', 'semantic_tokens'], 'invalid_asset_index', 'Indexed asset shape is invalid.');
    if (!ASSET_ID.test(asset.asset_id) || ids.has(asset.asset_id) || !['image', 'video'].includes(asset.media_kind) || !Number.isSafeInteger(asset.size_bytes) || asset.size_bytes <= 0 || !Number.isSafeInteger(asset.width) || asset.width <= 0 || !Number.isSafeInteger(asset.height) || asset.height <= 0 || (asset.media_kind === 'image' ? asset.duration_ms !== null : !Number.isSafeInteger(asset.duration_ms) || asset.duration_ms <= 0) || !Array.isArray(asset.semantic_tokens) || new Set(asset.semantic_tokens).size !== asset.semantic_tokens.length || asset.semantic_tokens.some((value) => typeof value !== 'string')) fail('invalid_asset_index', 'Indexed asset metadata is invalid.');
    ids.add(asset.asset_id);
  }
  return fingerprintValue(index);
}

function verifyContext(context, briefsHash, assets) {
  exact(context, ['schema_version', 'briefs_sha256', 'target_width', 'target_height', 'evidence_assets'], 'invalid_context', 'User asset routing context is invalid.');
  if (context.schema_version !== 1 || context.briefs_sha256 !== briefsHash) fail('invalid_context', 'Routing context does not match director briefs.');
  positive(context.target_width, 'invalid_context', 'Target width is invalid.');
  positive(context.target_height, 'invalid_context', 'Target height is invalid.');
  if (!Array.isArray(context.evidence_assets)) fail('invalid_context', 'Evidence asset registry is invalid.');
  const keys = new Set(); const assetIds = new Set(assets.map((asset) => asset.asset_id));
  for (const item of context.evidence_assets) {
    exact(item, ['source_id', 'asset_id'], 'invalid_context', 'Evidence asset registry entry is invalid.');
    if (!SOURCE_ID.test(item.source_id) || !assetIds.has(item.asset_id) || keys.has(item.source_id)) fail('invalid_context', 'Evidence asset registry entry is invalid.');
    keys.add(item.source_id);
  }
}

function cropMetrics(asset, targetWidth, targetHeight) {
  const sourceRatio = asset.width / asset.height;
  const targetRatio = targetWidth / targetHeight;
  const retention = Math.min(sourceRatio / targetRatio, targetRatio / sourceRatio);
  const cropWidth = sourceRatio > targetRatio ? Math.floor(asset.height * targetRatio) : asset.width;
  const cropHeight = sourceRatio > targetRatio ? asset.height : Math.floor(asset.width / targetRatio);
  return { retention, crop_width: cropWidth, crop_height: cropHeight, usable: retention >= 0.55 && cropWidth >= targetWidth && cropHeight >= targetHeight };
}

function briefSubjectTokens(brief) {
  return unique((brief.representation.subjects ?? []).flatMap((value) => semanticTokens(String(value))));
}
function supportingTokens(brief) {
  return unique(semanticTokens(`${brief.visible_action.verb ?? ''} ${brief.representation.relationship ?? ''}`));
}
function evaluate(asset, brief, targetWidth, targetHeight, { requireSemantic = true } = {}) {
  const crop = cropMetrics(asset, targetWidth, targetHeight);
  if (!crop.usable) return { eligible: false, reason: 'CROP_OR_RESOLUTION_UNSUITABLE' };
  if (asset.media_kind === 'video' && asset.duration_ms < brief.duration_ms) return { eligible: false, reason: 'VIDEO_TOO_SHORT' };
  const tokens = new Set(asset.semantic_tokens);
  const subjectMatches = briefSubjectTokens(brief).filter((token) => tokens.has(token));
  if (requireSemantic && !subjectMatches.length) return { eligible: false, reason: 'NO_SUBJECT_TOKEN_MATCH' };
  const supportMatches = supportingTokens(brief).filter((token) => tokens.has(token));
  const headroom = Math.min(20, Math.floor((crop.crop_width * crop.crop_height) / (targetWidth * targetHeight)));
  const score = subjectMatches.length * 100 + supportMatches.length * 10 + Math.round(crop.retention * 10) + headroom + (asset.media_kind === 'video' ? 1 : 0);
  return { eligible: true, score, crop, subjectMatches, supportMatches };
}

function selection(brief, asset, evaluated, indexHash, evidence = false) {
  return {
    shot_id: brief.shot_id,
    route: 'user-media',
    asset_id: asset.asset_id,
    asset_index_sha256: indexHash,
    score: evaluated.score,
    crop_retention_basis_points: Math.round(evaluated.crop.retention * 10000),
    reason_codes: evidence ? ['LITERAL_EVIDENCE_REGISTERED', 'MEDIA_USABLE'] : ['SUBJECT_MATCH', 'MEDIA_USABLE'],
  };
}

export function routeUserMedia(briefs, assetIndex, context) {
  verifyBriefs(briefs);
  const indexHash = verifyIndex(assetIndex);
  verifyContext(context, briefs.briefs_sha256, assetIndex.assets);
  const assetById = new Map(assetIndex.assets.map((asset) => [asset.asset_id, asset]));
  const evidenceMap = new Map(context.evidence_assets.map((item) => [item.source_id, item.asset_id]));
  const routes = briefs.briefs.map((brief) => {
    const literal = ['user-material', 'verified-source'].includes(brief.evidence.mode);
    if (literal) {
      const required = brief.evidence.source_ids;
      const ids = required.map((sourceId) => evidenceMap.get(sourceId));
      if (!ids.length || ids.some((id) => !id) || new Set(ids).size !== ids.length) return { shot_id: brief.shot_id, route: 'unresolved', next_route: 'evidence_unresolved', reason_codes: ['LITERAL_EVIDENCE_ASSET_MISSING'] };
      const candidates = ids.map((id) => ({ asset: assetById.get(id), evaluated: evaluate(assetById.get(id), brief, context.target_width, context.target_height, { requireSemantic: false }) }));
      const usable = candidates.filter((item) => item.evaluated.eligible).sort((left, right) => right.evaluated.score - left.evaluated.score || left.asset.asset_id.localeCompare(right.asset.asset_id));
      if (!usable.length) return { shot_id: brief.shot_id, route: 'unresolved', next_route: 'evidence_unresolved', reason_codes: ['LITERAL_EVIDENCE_ASSET_UNSUITABLE'] };
      return selection(brief, usable[0].asset, usable[0].evaluated, indexHash, true);
    }
    const usable = assetIndex.assets.map((asset) => ({ asset, evaluated: evaluate(asset, brief, context.target_width, context.target_height) })).filter((item) => item.evaluated.eligible).sort((left, right) => right.evaluated.score - left.evaluated.score || left.asset.asset_id.localeCompare(right.asset.asset_id));
    if (!usable.length) return { shot_id: brief.shot_id, route: 'fallback', next_route: 'pexels', reason_codes: ['NO_SEMANTIC_USER_MEDIA_MATCH'] };
    return selection(brief, usable[0].asset, usable[0].evaluated, indexHash);
  });
  const core = { schema_version: 1, briefs_sha256: briefs.briefs_sha256, asset_index_sha256: indexHash, target: { width: context.target_width, height: context.target_height }, route_count: routes.length, routes };
  return { ...core, routes_sha256: fingerprintValue(core) };
}

export function parseRouteArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const prettyCount = argv.filter((value) => value === '--pretty').length; const unknown = argv.filter((value) => value.startsWith('-') && value !== '--pretty'); const positional = argv.filter((value) => !value.startsWith('-'));
  if (unknown.length || prettyCount > 1 || positional.length !== 3 || argv.length !== positional.length + prettyCount) return { error: true };
  return { briefs: positional[0], index: positional[1], context: positional[2], pretty: prettyCount === 1 };
}
export async function runRouteCli(argv, adapters = {}) {
  const stdout = adapters.stdout ?? process.stdout; const stderr = adapters.stderr ?? process.stderr; const readFile = adapters.readFile ?? fs.readFile; const args = parseRouteArgs(argv);
  if (args.help) { stdout.write('Usage: node scripts/route-user-assets.mjs <validated-briefs.json> <asset-index.json> <routing-context.json> [--pretty]\n'); return 0; }
  if (args.error) { stderr.write('route-user-assets: invalid arguments (use --help)\n'); return EXIT_USAGE; }
  try { const [briefText, indexText, contextText] = await Promise.all([readFile(args.briefs, 'utf8'), readFile(args.index, 'utf8'), readFile(args.context, 'utf8')]); stdout.write(`${JSON.stringify(routeUserMedia(JSON.parse(briefText), JSON.parse(indexText), JSON.parse(contextText)), null, args.pretty ? 2 : 0)}\n`); return 0; }
  catch (error) { if (error instanceof UserAssetRouteError) { stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code, message: error.message, ...(error.shot_id ? { shot_id: error.shot_id } : {}) } })}\n`); return EXIT_INVALID; } stderr.write(`${JSON.stringify({ ok: false, error: { code: 'read_failed', message: 'Routing inputs could not be read.' } })}\n`); return EXIT_READ; }
}
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exit(await runRouteCli(process.argv.slice(2)));
