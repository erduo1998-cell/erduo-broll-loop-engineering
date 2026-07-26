#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprintArtifactValue, PIPELINE_CONTRACT_VERSION } from './artifact-manifest.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT_ID = /^S\d{3}$/u;
const ARTIFACT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const PRIMARY_ROUTES = new Set(['user-media', 'image-generation', 'pexels']);
const MEDIA_KINDS = new Set(['image', 'video']);
const FORBIDDEN_FIELD = /(?:^|_)(?:layer|layers|matte|depth_map|clean_plate|scene_kit|hero)(?:$|_)/iu;
const EXIT_INVALID = 2;
const EXIT_READ = 3;
const EXIT_USAGE = 64;

export class FlatShotKitError extends Error {
  constructor(code, message, field) {
    super(message);
    this.name = 'FlatShotKitError';
    this.code = code;
    if (field) this.field = field;
  }
}

function fail(code, message, field) {
  throw new FlatShotKitError(code, message, field);
}

function exact(value, fields, code = 'invalid_shape', field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, 'Flat shot kit record has an invalid shape.', field);
  }
}

function normalizedKey(value) {
  return value.replace(/([a-z0-9])([A-Z])/gu, '$1_$2').replace(/-/gu, '_').toLowerCase();
}

function rejectForbiddenFields(value, trail = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectForbiddenFields(item, `${trail}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const field = `${trail}.${key}`;
    if (FORBIDDEN_FIELD.test(normalizedKey(key))) fail('forbidden_decomposition_field', 'Flat shot kits cannot contain decomposition fields.', field);
    rejectForbiddenFields(child, field);
  }
}

function isSha(value) { return typeof value === 'string' && SHA256.test(value); }
function isArtifactId(value) { return typeof value === 'string' && ARTIFACT_ID.test(value); }
function positiveInteger(value) { return Number.isSafeInteger(value) && value > 0; }
function basisPoints(value) { return Number.isSafeInteger(value) && value >= 0 && value <= 10000; }

function validateArtifactId(value, field) {
  if (!isArtifactId(value)) fail('invalid_artifact_id', 'Artifact IDs must be opaque and path-free.', field);
}

function validateBbox(value, canvas, field) {
  exact(value, ['x', 'y', 'width', 'height'], 'invalid_geometry', field);
  if (![value.x, value.y].every((item) => Number.isSafeInteger(item) && item >= 0)
    || !positiveInteger(value.width) || !positiveInteger(value.height)
    || value.x + value.width > canvas.width || value.y + value.height > canvas.height) {
    fail('geometry_outside_canvas', 'Rectangle must remain inside the target raster.', field);
  }
  return value;
}

function sameBbox(a, b) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function contains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

function intersects(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

function pointInsideBbox(point, bbox) {
  return point.x >= bbox.x && point.x < bbox.x + bbox.width
    && point.y >= bbox.y && point.y < bbox.y + bbox.height;
}

function rectangleEdgeDistance(a, b) {
  const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  return Math.hypot(dx, dy);
}

function validatePrimaryAsset(asset) {
  exact(asset, ['asset_id', 'route', 'media_kind', 'duration_ms', 'frozen', 'provenance', 'rights'], 'invalid_primary_asset', '$.primary_asset');
  validateArtifactId(asset.asset_id, '$.primary_asset.asset_id');
  if (!PRIMARY_ROUTES.has(asset.route)) fail('invalid_primary_route', 'Primary material must use an ordinary media route.', '$.primary_asset.route');
  if (!MEDIA_KINDS.has(asset.media_kind)
    || asset.media_kind === 'image' && asset.duration_ms !== null
    || asset.media_kind === 'video' && !positiveInteger(asset.duration_ms)) {
    fail('invalid_media_truth', 'Primary media kind and duration are inconsistent.', '$.primary_asset');
  }

  exact(asset.frozen, ['locator_id', 'sha256', 'size_bytes', 'integrity_receipt_artifact_id', 'integrity_receipt_sha256', 'verified_local'], 'asset_not_frozen', '$.primary_asset.frozen');
  validateArtifactId(asset.frozen.locator_id, '$.primary_asset.frozen.locator_id');
  validateArtifactId(asset.frozen.integrity_receipt_artifact_id, '$.primary_asset.frozen.integrity_receipt_artifact_id');
  if (!isSha(asset.frozen.sha256) || !positiveInteger(asset.frozen.size_bytes)
    || !isSha(asset.frozen.integrity_receipt_sha256) || asset.frozen.verified_local !== true) {
    fail('asset_not_frozen', 'Selected primary material needs a valid local-freeze record.', '$.primary_asset.frozen');
  }

  exact(asset.provenance, ['origin_kind', 'source_record_id', 'source_record_sha256'], 'invalid_provenance', '$.primary_asset.provenance');
  validateArtifactId(asset.provenance.source_record_id, '$.primary_asset.provenance.source_record_id');
  if (!isSha(asset.provenance.source_record_sha256)) fail('invalid_provenance', 'Provenance record hash is invalid.', '$.primary_asset.provenance.source_record_sha256');
  const originByRoute = { 'user-media': 'user-provided', 'image-generation': 'generated', pexels: 'pexels' };
  if (asset.provenance.origin_kind !== originByRoute[asset.route]) fail('provenance_route_mismatch', 'Provenance origin does not match the selected route.', '$.primary_asset.provenance.origin_kind');

  exact(asset.rights, ['review_status', 'basis', 'evidence_artifact_id', 'evidence_sha256', 'limitations'], 'rights_not_auditable', '$.primary_asset.rights');
  validateArtifactId(asset.rights.evidence_artifact_id, '$.primary_asset.rights.evidence_artifact_id');
  if (!['cleared', 'conditional'].includes(asset.rights.review_status) || !isSha(asset.rights.evidence_sha256)
    || !Array.isArray(asset.rights.limitations) || asset.rights.limitations.length > 16
    || asset.rights.limitations.some((item) => typeof item !== 'string' || !item.trim() || item.length > 240)
    || asset.rights.review_status === 'conditional' && asset.rights.limitations.length === 0) {
    fail('rights_not_auditable', 'Selected primary material needs auditable cleared or conditional rights.', '$.primary_asset.rights');
  }
  const basisByRoute = { 'user-media': 'user-ownership', 'image-generation': 'generator-terms', pexels: 'pexels-license' };
  if (asset.rights.basis !== basisByRoute[asset.route]) fail('rights_route_mismatch', 'Rights basis does not match the selected route.', '$.primary_asset.rights.basis');
}

function validateMotion(value) {
  exact(value, ['source_motion', 'treatment', 'direction', 'amplitude_basis_points'], 'invalid_motion', '$.composition_fit.motion');
  if (!['static', 'intrinsic'].includes(value.source_motion)
    || !['locked', 'pan', 'zoom', 'pan-zoom'].includes(value.treatment)
    || !['none', 'left', 'right', 'up', 'down', 'in', 'out'].includes(value.direction)
    || !basisPoints(value.amplitude_basis_points)) fail('invalid_motion', 'Motion decision is invalid.', '$.composition_fit.motion');
  if (value.treatment === 'locked') {
    if (value.direction !== 'none' || value.amplitude_basis_points !== 0) fail('invalid_motion', 'Locked treatment cannot claim movement.', '$.composition_fit.motion');
  } else if (value.direction === 'none' || value.amplitude_basis_points === 0) {
    fail('invalid_motion', 'Moving treatment needs a direction and positive amplitude.', '$.composition_fit.motion');
  }
}

function validateComposition(value, canvas) {
  exact(value, ['coordinate_space', 'subject_bbox', 'focal_point', 'output_crop_bbox', 'text_safe_regions', 'protected_regions', 'motion', 'palette', 'title_relation', 'result_roi'], 'invalid_composition_fit', '$.composition_fit');
  if (value.coordinate_space !== 'target-raster-px') fail('invalid_coordinate_space', 'Composition coordinates must use target-raster pixels.', '$.composition_fit.coordinate_space');
  const subject = validateBbox(value.subject_bbox, canvas, '$.composition_fit.subject_bbox');
  const crop = validateBbox(value.output_crop_bbox, canvas, '$.composition_fit.output_crop_bbox');
  const roi = validateBbox(value.result_roi, canvas, '$.composition_fit.result_roi');
  if (!contains(crop, roi)) fail('roi_outside_consumer', 'Result ROI must be inside the visible primary material crop.', '$.composition_fit.result_roi');
  exact(value.focal_point, ['x', 'y'], 'invalid_geometry', '$.composition_fit.focal_point');
  if (!Number.isSafeInteger(value.focal_point.x) || !Number.isSafeInteger(value.focal_point.y)
    || value.focal_point.x < 0 || value.focal_point.y < 0
    || value.focal_point.x >= canvas.width || value.focal_point.y >= canvas.height) {
    fail('geometry_outside_canvas', 'Focal point must remain inside the target raster.', '$.composition_fit.focal_point');
  }
  if (!pointInsideBbox(value.focal_point, subject)) {
    fail('focal_point_outside_subject', 'Focal point must remain inside the primary subject rectangle.', '$.composition_fit.focal_point');
  }

  if (!Array.isArray(value.text_safe_regions) || value.text_safe_regions.length < 1 || value.text_safe_regions.length > 8) fail('invalid_text_safe_regions', 'At least one bounded text-safe region is required.', '$.composition_fit.text_safe_regions');
  const safeRegions = value.text_safe_regions.map((item, index) => validateBbox(item, canvas, `$.composition_fit.text_safe_regions[${index}]`));
  if (!Array.isArray(value.protected_regions) || value.protected_regions.length < 1 || value.protected_regions.length > 16) fail('invalid_protected_regions', 'At least one protected region is required.', '$.composition_fit.protected_regions');
  const protectedRegions = value.protected_regions.map((item, index) => {
    exact(item, ['kind', 'bbox'], 'invalid_protected_regions', `$.composition_fit.protected_regions[${index}]`);
    if (!['primary-subject', 'face', 'product', 'logo'].includes(item.kind)) fail('invalid_protected_regions', 'Protected region kind is invalid.', `$.composition_fit.protected_regions[${index}].kind`);
    return { kind: item.kind, bbox: validateBbox(item.bbox, canvas, `$.composition_fit.protected_regions[${index}].bbox`) };
  });
  if (!protectedRegions.some((item) => item.kind === 'primary-subject' && contains(item.bbox, subject))) fail('subject_not_protected', 'Primary subject must be covered by a protected region.', '$.composition_fit.protected_regions');

  validateMotion(value.motion);
  exact(value.palette, ['dominant_hex', 'background_luminance_basis_points', 'title_contrast_ratio_x100'], 'invalid_palette', '$.composition_fit.palette');
  if (!Array.isArray(value.palette.dominant_hex) || value.palette.dominant_hex.length < 1 || value.palette.dominant_hex.length > 5
    || new Set(value.palette.dominant_hex).size !== value.palette.dominant_hex.length
    || value.palette.dominant_hex.some((item) => typeof item !== 'string' || !/^#[0-9a-f]{6}$/iu.test(item))
    || !basisPoints(value.palette.background_luminance_basis_points)
    || !Number.isSafeInteger(value.palette.title_contrast_ratio_x100)
    || value.palette.title_contrast_ratio_x100 < 100 || value.palette.title_contrast_ratio_x100 > 2100) {
    fail('invalid_palette', 'Palette observation is invalid.', '$.composition_fit.palette');
  }

  const title = value.title_relation;
  exact(title, ['mode', 'title_bbox', 'text_safe_region_index', 'min_clearance_px'], 'invalid_title_relation', '$.composition_fit.title_relation');
  if (!Number.isSafeInteger(title.min_clearance_px) || title.min_clearance_px < 0) fail('invalid_title_relation', 'Title clearance is invalid.', '$.composition_fit.title_relation.min_clearance_px');
  if (title.mode === 'none') {
    if (title.title_bbox !== null || title.text_safe_region_index !== null || title.min_clearance_px !== 0) fail('title_relation_contradiction', 'A missing title cannot claim placement or clearance.', '$.composition_fit.title_relation');
  } else {
    if (!['inside-text-safe-region', 'outside-primary-subject'].includes(title.mode) || title.title_bbox === null) fail('invalid_title_relation', 'Title relation is invalid.', '$.composition_fit.title_relation');
    const titleBbox = validateBbox(title.title_bbox, canvas, '$.composition_fit.title_relation.title_bbox');
    if (protectedRegions.some((item) => intersects(item.bbox, titleBbox))) fail('title_overlaps_protected_region', 'Title cannot overlap a protected region.', '$.composition_fit.title_relation.title_bbox');
    const actualClearance = Math.min(...protectedRegions.map((item) => rectangleEdgeDistance(item.bbox, titleBbox)));
    if (actualClearance < title.min_clearance_px) fail('title_clearance_contradiction', 'Declared title clearance exceeds the measured distance from a protected region.', '$.composition_fit.title_relation.min_clearance_px');
    if (title.mode === 'inside-text-safe-region') {
      if (!Number.isSafeInteger(title.text_safe_region_index) || !safeRegions[title.text_safe_region_index]
        || !contains(safeRegions[title.text_safe_region_index], titleBbox)) fail('title_relation_contradiction', 'Title must be contained by its referenced text-safe region.', '$.composition_fit.title_relation');
    } else if (title.text_safe_region_index !== null || intersects(subject, titleBbox)) {
      fail('title_relation_contradiction', 'Title placement contradicts the declared subject relationship.', '$.composition_fit.title_relation');
    }
  }
  return { crop, roi };
}

function validateConsumer(value, asset, canvas, crop) {
  exact(value, ['consumer_id', 'role', 'element', 'fit', 'visible', 'opacity_basis_points', 'visible_window', 'target_bbox', 'source_sha256'], 'invalid_consumer', '$.consumer_plan');
  validateArtifactId(value.consumer_id, '$.consumer_plan.consumer_id');
  const allowedElements = asset.media_kind === 'image' ? ['img', 'background-image'] : ['video'];
  if (value.role !== 'primary' || !allowedElements.includes(value.element)
    || !['cover', 'contain'].includes(value.fit) || value.visible !== true
    || value.opacity_basis_points !== 10000 || value.source_sha256 !== asset.frozen.sha256) {
    fail('invalid_primary_consumer', 'Consumer must visibly and truthfully use the frozen primary material.', '$.consumer_plan');
  }
  exact(value.visible_window, ['start_ms', 'end_ms'], 'invalid_visible_window', '$.consumer_plan.visible_window');
  if (!Number.isSafeInteger(value.visible_window.start_ms) || value.visible_window.start_ms < 0
    || !positiveInteger(value.visible_window.end_ms) || value.visible_window.end_ms <= value.visible_window.start_ms
    || asset.media_kind === 'video' && value.visible_window.end_ms - value.visible_window.start_ms > asset.duration_ms) {
    fail('invalid_visible_window', 'Primary consumer needs a valid visible window supported by the media.', '$.consumer_plan.visible_window');
  }
  const target = validateBbox(value.target_bbox, canvas, '$.consumer_plan.target_bbox');
  if (!sameBbox(target, crop)) fail('consumer_crop_mismatch', 'Primary consumer rectangle must match the composition crop.', '$.consumer_plan.target_bbox');
}

function validatePreview(value, canvas, window) {
  exact(value, ['artifact_id', 'frame_sha256', 'capture_receipt_artifact_id', 'capture_receipt_sha256', 'width', 'height', 'timestamp_ms'], 'invalid_target_preview', '$.target_preview');
  validateArtifactId(value.artifact_id, '$.target_preview.artifact_id');
  validateArtifactId(value.capture_receipt_artifact_id, '$.target_preview.capture_receipt_artifact_id');
  if (!isSha(value.frame_sha256) || !isSha(value.capture_receipt_sha256)
    || value.width !== canvas.width || value.height !== canvas.height
    || !Number.isSafeInteger(value.timestamp_ms)
    || value.timestamp_ms < window.start_ms || value.timestamp_ms >= window.end_ms) {
    fail('invalid_target_preview', 'Target preview must bind a full-raster frame inside the visible window.', '$.target_preview');
  }
}

function validateSelection(value) {
  exact(value, ['candidates_considered', 'candidates_rejected', 'rejection_reasons', 'selected_reason', 'fallback'], 'invalid_selection_record', '$.selection_record');
  if (!positiveInteger(value.candidates_considered) || !Number.isSafeInteger(value.candidates_rejected) || value.candidates_rejected < 0
    || value.candidates_rejected !== value.candidates_considered - 1
    || typeof value.selected_reason !== 'string' || !value.selected_reason.trim() || value.selected_reason.length > 400
    || !Array.isArray(value.rejection_reasons) || value.rejection_reasons.length > 16) fail('invalid_selection_record', 'Selection counts or selected reason are invalid.', '$.selection_record');
  let summarized = 0;
  for (const [index, reason] of value.rejection_reasons.entries()) {
    exact(reason, ['code', 'count'], 'invalid_selection_record', `$.selection_record.rejection_reasons[${index}]`);
    if (typeof reason.code !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(reason.code) || !positiveInteger(reason.count)) fail('invalid_selection_record', 'Rejection summary is invalid.', `$.selection_record.rejection_reasons[${index}]`);
    summarized += reason.count;
  }
  if (summarized !== value.candidates_rejected) fail('rejection_summary_mismatch', 'Rejection reasons must account for every rejected candidate.', '$.selection_record.rejection_reasons');
  exact(value.fallback, ['status', 'route', 'reason'], 'invalid_fallback', '$.selection_record.fallback');
  if (value.fallback.status === 'none') {
    if (value.fallback.route !== null || value.fallback.reason !== null) fail('invalid_fallback', 'A missing fallback cannot claim a route or reason.', '$.selection_record.fallback');
  } else if (value.fallback.status !== 'available' || !PRIMARY_ROUTES.has(value.fallback.route)
    || typeof value.fallback.reason !== 'string' || !value.fallback.reason.trim() || value.fallback.reason.length > 240) {
    fail('invalid_fallback', 'Fallback must use an ordinary material route with a reason.', '$.selection_record.fallback');
  }
}

function validateContribution(value) {
  const fields = ['status', 'producer', 'verification_mode', 'enabled_frame_artifact_id', 'enabled_frame_sha256', 'disabled_frame_artifact_id', 'disabled_frame_sha256', 'roi_diff_artifact_id', 'roi_diff_sha256', 'roi_pixel_count', 'changed_pixel_count', 'gate_receipt_sha256'];
  exact(value, fields, 'invalid_contribution_evidence', '$.contribution_evidence');
  if (value.producer !== 'master-build-deterministic-roi-gate-v1'
    || value.verification_mode !== 'byte-resolved-pixel-ablation') {
    fail('invalid_contribution_evidence', 'Contribution evidence must come from the deterministic ROI gate.', '$.contribution_evidence');
  }
  const evidenceFields = fields.slice(3);
  if (value.status !== 'pending-master-build' || evidenceFields.some((field) => value[field] !== null)) {
    fail('unverified_contribution_claim', 'Assets must leave contribution pending for master-build and cannot self-report proof.', '$.contribution_evidence');
  }
}

export function validateFlatShotKit(document) {
  rejectForbiddenFields(document);
  if (document?.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION) {
    fail('pipeline_upgrade_required', 'Flat shot kits must use pipeline contract version 2.', '$.pipeline_contract_version');
  }
  exact(document, ['schema_version', 'pipeline_contract_version', 'shot_id', 'design_slice_sha256', 'target_raster', 'primary_asset', 'composition_fit', 'consumer_plan', 'target_preview', 'selection_record', 'contribution_evidence']);
  if (document.schema_version !== 1 || !SHOT_ID.test(document.shot_id ?? '') || !isSha(document.design_slice_sha256)) fail('invalid_identity', 'Flat shot kit identity is invalid.');
  exact(document.target_raster, ['width', 'height'], 'invalid_target_raster', '$.target_raster');
  if (!positiveInteger(document.target_raster.width) || !positiveInteger(document.target_raster.height)
    || document.target_raster.width > 16384 || document.target_raster.height > 16384) fail('invalid_target_raster', 'Target raster is invalid.', '$.target_raster');
  validatePrimaryAsset(document.primary_asset);
  const geometry = validateComposition(document.composition_fit, document.target_raster);
  validateConsumer(document.consumer_plan, document.primary_asset, document.target_raster, geometry.crop);
  validatePreview(document.target_preview, document.target_raster, document.consumer_plan.visible_window);
  validateSelection(document.selection_record);
  validateContribution(document.contribution_evidence);
  return {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    shot_id: document.shot_id,
    design_slice_sha256: document.design_slice_sha256,
    primary_asset_sha256: document.primary_asset.frozen.sha256,
    contribution_status: document.contribution_evidence.status,
    flat_shot_kit_sha256: fingerprintArtifactValue(document),
  };
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  if (argv.length !== 1 || argv[0].startsWith('-')) return { error: true };
  return { input: argv[0] };
}

export async function runFlatShotKitCli(argv, adapters = {}) {
  const stdout = adapters.stdout ?? process.stdout;
  const stderr = adapters.stderr ?? process.stderr;
  const readFile = adapters.readFile ?? fs.readFile;
  const args = parseArgs(argv);
  if (args.help) {
    stdout.write('Usage: node scripts/validate-flat-shot-kit.mjs <private-flat-shot-kit.json>\n');
    return 0;
  }
  if (args.error) {
    stderr.write('validate-flat-shot-kit: invalid arguments (use --help)\n');
    return EXIT_USAGE;
  }
  try {
    const document = JSON.parse(await readFile(args.input, 'utf8'));
    stdout.write(`${JSON.stringify(validateFlatShotKit(document))}\n`);
    return 0;
  } catch (error) {
    const safe = error instanceof FlatShotKitError
      ? { code: error.code, message: error.message, ...(error.field ? { field: error.field } : {}) }
      : { code: 'read_failed', message: 'Flat shot kit could not be read.' };
    stderr.write(`${JSON.stringify({ ok: false, error: safe })}\n`);
    return error instanceof FlatShotKitError ? EXIT_INVALID : EXIT_READ;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exit(await runFlatShotKitCli(process.argv.slice(2)));
