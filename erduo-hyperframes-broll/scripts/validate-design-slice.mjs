#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FRAME_PROJECTION_CONTRACT,
  FRAME_PROJECTION_RULE,
  FrameProjectionError,
  validateFrameProjection,
} from './compile-frame-projection.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/u;
const ID = /^[a-z0-9][a-z0-9-]{1,63}$/u;
const SHOT_ID = /^S[0-9]{3}$/u;
const COMPOSITION_ID = /^F0[1-9]$/u;
const MOTION_ID = /^G(?:0[1-9]|10)$/u;
const CONTROL_CHARACTERS = /[\x00-\x08\x0b\x0c\x0e-\x1f]/u;
const LINE_BREAK = /[\r\n]/u;

const DISPLAY_ROLES = ['chapter-focus', 'core-number', 'emphasis', 'key-quote'];
const TYPE_ROLES = new Set(['display', 'body', 'meta', 'mono']);
const SPECIAL_MODES = new Set(['none', 'brush-vector', 'projective-plane', 'materialized-glyph', 'oversized-editorial', 'microtext-texture']);
const RENDERERS = new Set(['html', 'svg', 'image-generation']);
const NEGATIVE_SPACE_RESPONSIBILITIES = new Set(['focus', 'reading', 'emotion', 'material', 'transition']);
const PROTECTED_TYPES = new Set(['face', 'hands', 'product', 'evidence', 'title', 'number', 'logo', 'cta', 'material']);
const PHASE_NAMES = ['entry', 'action', 'result', 'hold', 'exit'];
const BANNED_FONT_FAMILIES = new Set([
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'sans-serif',
  'serif',
  'monospace',
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
  'arial',
  'helvetica',
  'roboto',
  'poppins',
  'montserrat',
  'inter',
]);

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRegistryPath = path.resolve(moduleDirectory, '../references/design-capability-registry.json');

export class DesignSliceError extends Error {
  constructor(code, message, shot) {
    super(message);
    this.name = 'DesignSliceError';
    this.code = code;
    if (shot !== undefined) this.shot = shot;
  }
}

function fail(code, message, shot) {
  throw new DesignSliceError(code, message, shot);
}

function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('invalid_number', 'Design slice contains a non-finite number.');
    return Number(value.toFixed(6));
  }
  if (!value || typeof value !== 'object') fail('invalid_value', 'Design slice contains an unsupported value.');
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function hashValue(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

function exact(value, fields, code, message, shot) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, shot);
  const actual = JSON.stringify(Object.keys(value).sort());
  const expected = JSON.stringify([...fields].sort());
  if (actual !== expected) fail(code, message, shot);
}

function text(value, code, message, shot, { min = 1, max = 600, lineBreak = true } = {}) {
  if (
    typeof value !== 'string'
    || value.trim().length < min
    || value.length > max
    || CONTROL_CHARACTERS.test(value)
    || (!lineBreak && LINE_BREAK.test(value))
  ) fail(code, message, shot);
  return value.trim();
}

function textList(value, code, message, shot, { min = 1, max = 12, itemMax = 600, lineBreak = true } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(code, message, shot);
  const normalized = value.map((item) => text(item, code, message, shot, { max: itemMax, lineBreak }));
  if (new Set(normalized).size !== normalized.length) fail(code, message, shot);
  return normalized;
}

function id(value, code, message, shot) {
  if (typeof value !== 'string' || !ID.test(value)) fail(code, message, shot);
  return value;
}

function integer(value, code, message, shot, min = 0) {
  if (!Number.isSafeInteger(value) || value < min) fail(code, message, shot);
  return value;
}

function normalizedBox(value, code, message, shot) {
  exact(value, ['x', 'y', 'width', 'height'], code, message, shot);
  for (const field of ['x', 'y', 'width', 'height']) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) fail(code, message, shot);
  }
  if (
    value.x < 0 || value.x > 1
    || value.y < 0 || value.y > 1
    || value.width <= 0 || value.width > 1
    || value.height <= 0 || value.height > 1
    || value.x + value.width > 1.000001
    || value.y + value.height > 1.000001
  ) fail(code, message, shot);
  return canonicalize(value);
}

function fontFamily(value, shot) {
  const family = text(value, 'invalid_font_reference', 'Font family is invalid.', shot, { max: 160, lineBreak: false });
  const normalized = family.toLowerCase().replaceAll('"', '').replaceAll("'", '').trim();
  const stack = normalized.split(',').map((item) => item.trim()).filter(Boolean);
  if (
    stack.some((item) => BANNED_FONT_FAMILIES.has(item))
    || /\blocal\s*\(/u.test(normalized)
    || /\bvar\s*\(/u.test(normalized)
  ) fail('system_font_fallback', 'System, generic, local() and variable font fallbacks are forbidden.', shot);
  return family;
}

function validateRegistryRecord(record, expectedId, allowedReportStatuses, expectedEvidenceStatuses, kind) {
  exact(record, ['id', 'name', 'report_status', 'evidence_status', 'default_eligible', kind === 'composition' ? 'semantic_uses' : 'promotion_note', ...(kind === 'composition' ? ['promotion_note'] : [])], 'invalid_design_registry', 'Design capability registry record is invalid.');
  if (record.id !== expectedId) fail('invalid_design_registry', 'Design capability registry IDs must be complete and ordered.');
  text(record.name, 'invalid_design_registry', 'Design capability registry name is invalid.', undefined, { max: 120 });
  if (!allowedReportStatuses.has(record.report_status) || !expectedEvidenceStatuses.has(record.evidence_status)) fail('invalid_design_registry', 'Design capability registry evidence status is invalid.');
  if (record.default_eligible !== false) fail('unsafe_design_registry_default', 'Uncalibrated design capabilities cannot be default eligible.');
  if (kind === 'composition') textList(record.semantic_uses, 'invalid_design_registry', 'Composition semantic uses are invalid.', undefined, { max: 10, itemMax: 120 });
  text(record.promotion_note, 'invalid_design_registry', 'Design capability promotion note is invalid.', undefined, { max: 400 });
}

export function validateDesignCapabilityRegistry(registry) {
  exact(registry, ['schema_version', 'registry_version', 'source', 'policy', 'composition_families', 'motion_grammars'], 'invalid_design_registry', 'Design capability registry shape is invalid.');
  if (registry.schema_version !== 1 || !SEMVER.test(registry.registry_version ?? '')) fail('invalid_design_registry', 'Design capability registry identity is invalid.');
  exact(registry.source, ['source_id', 'evidence_class', 'raw_evidence_available_in_project', 'author_calibrated', 'promotion_limit'], 'invalid_design_registry', 'Design capability registry source is invalid.');
  if (
    registry.source.source_id !== 'skill2-report-2026-07-23'
    || registry.source.evidence_class !== 'user-provided-synthesis'
    || registry.source.raw_evidence_available_in_project !== false
    || registry.source.author_calibrated !== false
    || registry.source.promotion_limit !== 'distilled-candidate-or-pattern-evidence-only'
  ) fail('invalid_design_registry', 'Design capability registry overstates its evidence.');
  exact(registry.policy, ['production_author_standard', 'default_selection_requires_author_calibration', 'default_eligibility_policy', 'scope_exclusions'], 'invalid_design_registry', 'Design capability registry policy is invalid.');
  if (
    registry.policy.production_author_standard !== false
    || registry.policy.default_selection_requires_author_calibration !== true
    || registry.policy.default_eligibility_policy !== 'deny-until-author-calibrated-and-render-verified'
  ) fail('invalid_design_registry', 'Design capability registry cannot claim production status.');
  const requiredExclusions = ['scene-kit', 'layered-hero', 'hero-shot-quota', 'clean-plate', 'matte', 'depth-map', 'alpha-layer-generation'];
  if (!Array.isArray(registry.policy.scope_exclusions) || JSON.stringify([...registry.policy.scope_exclusions].sort()) !== JSON.stringify(requiredExclusions.sort())) fail('invalid_design_registry', 'Design capability registry scope exclusions are invalid.');
  if (!Array.isArray(registry.composition_families) || registry.composition_families.length !== 9) fail('invalid_design_registry', 'Design capability registry must contain F01-F09.');
  if (!Array.isArray(registry.motion_grammars) || registry.motion_grammars.length !== 10) fail('invalid_design_registry', 'Design capability registry must contain G01-G10.');
  const compositionStatuses = new Set(['pattern', 'candidate']);
  const motionStatuses = new Set(['animation-invariant', 'animation-grammar', 'restricted-grammar', 'pattern-contract', 'candidate', 'narrow-domain-grammar']);
  const evidenceStatuses = new Set(['distilled-pattern-evidence', 'distilled-candidate-evidence']);
  registry.composition_families.forEach((record, index) => validateRegistryRecord(record, `F0${index + 1}`, compositionStatuses, evidenceStatuses, 'composition'));
  registry.motion_grammars.forEach((record, index) => validateRegistryRecord(record, `G${String(index + 1).padStart(2, '0')}`, motionStatuses, evidenceStatuses, 'motion'));
  return registry;
}

function validateStyleDna(value) {
  exact(value, ['dna_id', 'visual_invariants', 'subject_title_relationship', 'material_relationship', 'negative_space_policy', 'type_contrast_relationship', 'edge_bleed_relationship', 'prohibited_directions'], 'invalid_style_dna', 'Style DNA shape is invalid.');
  return {
    dna_id: id(value.dna_id, 'invalid_style_dna', 'Style DNA ID is invalid.'),
    visual_invariants: textList(value.visual_invariants, 'invalid_style_dna', 'Style DNA invariants are invalid.', undefined, { min: 2, max: 12, itemMax: 300 }),
    subject_title_relationship: text(value.subject_title_relationship, 'invalid_style_dna', 'Subject-title relationship is invalid.'),
    material_relationship: text(value.material_relationship, 'invalid_style_dna', 'Material relationship is invalid.'),
    negative_space_policy: text(value.negative_space_policy, 'invalid_style_dna', 'Negative-space policy is invalid.'),
    type_contrast_relationship: text(value.type_contrast_relationship, 'invalid_style_dna', 'Type-contrast relationship is invalid.'),
    edge_bleed_relationship: text(value.edge_bleed_relationship, 'invalid_style_dna', 'Edge-bleed relationship is invalid.'),
    prohibited_directions: textList(value.prohibited_directions, 'invalid_style_dna', 'Prohibited directions are invalid.', undefined, { min: 1, max: 12, itemMax: 300 }),
  };
}

function validateDisplayFontSelectionReference(value, styleDna) {
  exact(value, ['contract', 'selection_sha256', 'source_kind', 'primary_visual_dna', 'display_font_id', 'required_roles'], 'invalid_display_font_reference', 'Display-font selection reference shape is invalid.');
  if (
    value.contract !== 'scripts/validate-display-font-selection.mjs#user-local-v1'
    || value.source_kind !== 'user-provided-local'
    || !SHA256.test(value.selection_sha256 ?? '')
    || value.primary_visual_dna !== styleDna.dna_id
  ) fail('invalid_display_font_reference', 'Display-font selection reference is invalid.');
  id(value.display_font_id, 'invalid_display_font_reference', 'Display-font ID is invalid.');
  if (!Array.isArray(value.required_roles) || JSON.stringify([...value.required_roles].sort()) !== JSON.stringify(DISPLAY_ROLES)) fail('invalid_display_font_reference', 'Display-font roles must match the existing font contract.');
  return canonicalize(value);
}

function validateFrameProjectionReference(value, parsedSrtSha256, planSha256, projection) {
  exact(
    value,
    ['artifact_id', 'pipeline_contract_version', 'contract', 'projection_sha256', 'parsed_srt_sha256', 'plan_sha256', 'fps', 'rule_version'],
    'invalid_frame_projection_reference',
    'Frame-projection reference shape is invalid.',
  );
  if (!projection) fail('frame_projection_required', 'The exact frame-projection artifact is required.');
  exact(value.fps, ['numerator', 'denominator'], 'invalid_frame_projection_reference', 'Frame-projection fps reference is invalid.');
  let projected;
  try {
    projected = validateFrameProjection(projection);
  } catch (error) {
    if (error instanceof FrameProjectionError) fail(error.code, error.message, error.shot);
    fail('invalid_frame_projection', 'Frame-projection artifact is invalid.');
  }
  if (
    value.artifact_id !== projected.artifact_id
    || value.pipeline_contract_version !== 2
    || value.pipeline_contract_version !== projected.pipeline_contract_version
    || value.contract !== FRAME_PROJECTION_CONTRACT
    || value.contract !== projected.contract
    || value.projection_sha256 !== projected.receipt.projection_sha256
    || value.parsed_srt_sha256 !== parsedSrtSha256
    || value.parsed_srt_sha256 !== projected.parsed_srt_sha256
    || value.plan_sha256 !== planSha256
    || value.plan_sha256 !== projected.plan_sha256
    || value.rule_version !== FRAME_PROJECTION_RULE
    || value.rule_version !== projected.rule_version
    || !value.fps
    || value.fps.numerator !== projected.fps.numerator
    || value.fps.denominator !== projected.fps.denominator
  ) fail('frame_projection_binding_mismatch', 'Design slice does not bind the exact validated frame projection.');
  return {
    reference: canonicalize(value),
    projection: projected,
  };
}

function validateStyleDnaUse(value, shot) {
  exact(value, ['subject_title_relationship', 'material_relationship', 'negative_space_relationship', 'type_contrast_relationship', 'edge_bleed_relationship'], 'invalid_style_dna_use', 'Shot Style DNA use is invalid.', shot);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, text(item, 'invalid_style_dna_use', 'Shot Style DNA relationship is invalid.', shot, { min: 8, max: 400 })]));
}

function uniqueId(value, seen, code, message, shot) {
  const normalized = id(value, code, message, shot);
  if (seen.has(normalized)) fail(code, message, shot);
  seen.add(normalized);
  return normalized;
}

function validateComposition(value, registry, shot) {
  exact(value, ['family_id', 'selection_reason', 'evidence_status', 'composition_bbox', 'focus_bbox', 'reading_path', 'negative_space', 'protected_regions'], 'invalid_composition', 'Shot composition shape is invalid.', shot);
  const family = registry.composition_families.find((entry) => entry.id === value.family_id);
  if (!COMPOSITION_ID.test(value.family_id ?? '') || !family) fail('invalid_composition_family', 'Shot composition family is not registered.', shot);
  if (value.evidence_status !== family.evidence_status) fail('composition_evidence_mismatch', 'Shot composition evidence status must match the registry.', shot);
  if (!Array.isArray(value.reading_path) || value.reading_path.length < 1 || value.reading_path.length > 8) fail('invalid_reading_path', 'Shot reading path is invalid.', shot);
  const readingRoles = new Set();
  const readingPath = value.reading_path.map((item, index) => {
    exact(item, ['order', 'role', 'bbox'], 'invalid_reading_path', 'Shot reading path item is invalid.', shot);
    if (item.order !== index + 1) fail('invalid_reading_path', 'Shot reading path order must be contiguous.', shot);
    return {
      order: item.order,
      role: uniqueId(item.role, readingRoles, 'invalid_reading_path', 'Shot reading-path roles must be valid and unique.', shot),
      bbox: normalizedBox(item.bbox, 'invalid_bbox', 'Reading-path bbox must be normalized.', shot),
    };
  });
  if (!Array.isArray(value.negative_space) || value.negative_space.length < 1 || value.negative_space.length > 8) fail('invalid_negative_space', 'Shot negative-space plan is invalid.', shot);
  const negativeIds = new Set();
  const negativeSpace = value.negative_space.map((item) => {
    exact(item, ['region_id', 'bbox', 'responsibility'], 'invalid_negative_space', 'Negative-space region is invalid.', shot);
    if (!NEGATIVE_SPACE_RESPONSIBILITIES.has(item.responsibility)) fail('invalid_negative_space', 'Negative space lacks a valid responsibility.', shot);
    return {
      region_id: uniqueId(item.region_id, negativeIds, 'invalid_negative_space', 'Negative-space region IDs must be valid and unique.', shot),
      bbox: normalizedBox(item.bbox, 'invalid_bbox', 'Negative-space bbox must be normalized.', shot),
      responsibility: item.responsibility,
    };
  });
  if (!Array.isArray(value.protected_regions) || value.protected_regions.length > 12) fail('invalid_protected_region', 'Shot protected regions are invalid.', shot);
  const protectedIds = new Set();
  const protectedRegions = value.protected_regions.map((item) => {
    exact(item, ['region_id', 'bbox', 'protects', 'reason'], 'invalid_protected_region', 'Protected region is invalid.', shot);
    if (!PROTECTED_TYPES.has(item.protects)) fail('invalid_protected_region', 'Protected-region type is invalid.', shot);
    return {
      region_id: uniqueId(item.region_id, protectedIds, 'invalid_protected_region', 'Protected-region IDs must be valid and unique.', shot),
      bbox: normalizedBox(item.bbox, 'invalid_bbox', 'Protected-region bbox must be normalized.', shot),
      protects: item.protects,
      reason: text(item.reason, 'invalid_protected_region', 'Protected-region reason is invalid.', shot, { min: 8, max: 300 }),
    };
  });
  return {
    family_id: value.family_id,
    selection_reason: text(value.selection_reason, 'invalid_composition', 'Composition selection reason must be content-specific.', shot, { min: 20, max: 500 }),
    evidence_status: value.evidence_status,
    composition_bbox: normalizedBox(value.composition_bbox, 'invalid_bbox', 'Composition bbox must be normalized.', shot),
    focus_bbox: normalizedBox(value.focus_bbox, 'invalid_bbox', 'Focus bbox must be normalized.', shot),
    reading_path: readingPath,
    negative_space: negativeSpace,
    protected_regions: protectedRegions,
  };
}

function validateTypography(value, displaySelection, shot) {
  exact(value, ['selection_reason', 'elements'], 'invalid_typography', 'Shot typography shape is invalid.', shot);
  if (!Array.isArray(value.elements) || value.elements.length < 1 || value.elements.length > 16) fail('invalid_typography', 'Shot typography elements are invalid.', shot);
  const elementIds = new Set();
  const activeSpecialModes = new Set();
  const elements = value.elements.map((item) => {
    exact(item, ['element_id', 'role', 'content_lines', 'wrap_mode', 'font_id', 'font_family', 'fallback_families', 'weight', 'special_mode', 'renderer', 'factual', 'bbox'], 'invalid_typography', 'Typography element shape is invalid.', shot);
    if (!TYPE_ROLES.has(item.role)) fail('invalid_typography', 'Typography role is invalid.', shot);
    const contentLines = textList(item.content_lines, 'invalid_line_breaks', 'Typography requires explicit non-empty lines.', shot, { min: 1, max: 8, itemMax: 120, lineBreak: false });
    if (item.wrap_mode !== 'explicit-only') fail('invalid_line_breaks', 'Typography must use explicit-only wrapping.', shot);
    const fontId = id(item.font_id, 'invalid_font_reference', 'Typography font ID is invalid.', shot);
    if (item.role === 'display' && fontId !== displaySelection.display_font_id) fail('display_font_mismatch', 'Display typography must use the selected display font.', shot);
    if (!Array.isArray(item.fallback_families) || item.fallback_families.length !== 0) fail('system_font_fallback', 'Typography cannot declare fallback families.', shot);
    if (!Number.isSafeInteger(item.weight) || item.weight < 100 || item.weight > 900 || item.weight % 100 !== 0) fail('invalid_typography', 'Typography weight is invalid.', shot);
    if (!SPECIAL_MODES.has(item.special_mode)) fail('invalid_typography', 'Special typography mode is invalid.', shot);
    if (item.special_mode !== 'none') activeSpecialModes.add(item.special_mode);
    if (!RENDERERS.has(item.renderer)) fail('invalid_typography', 'Typography renderer is invalid.', shot);
    if (typeof item.factual !== 'boolean') fail('invalid_typography', 'Typography factual flag is invalid.', shot);
    if (item.renderer === 'image-generation') {
      fail(item.factual ? 'fact_text_image_generation' : 'readable_text_image_generation', 'Image generation cannot render final readable text.', shot);
    }
    return {
      element_id: uniqueId(item.element_id, elementIds, 'invalid_typography', 'Typography element IDs must be valid and unique.', shot),
      role: item.role,
      content_lines: contentLines,
      wrap_mode: item.wrap_mode,
      font_id: fontId,
      font_family: fontFamily(item.font_family, shot),
      fallback_families: [],
      weight: item.weight,
      special_mode: item.special_mode,
      renderer: item.renderer,
      factual: item.factual,
      bbox: normalizedBox(item.bbox, 'invalid_bbox', 'Typography bbox must be normalized.', shot),
    };
  });
  if (activeSpecialModes.size > 1) fail('multiple_special_type_modes', 'A shot can use at most one special typography mode.', shot);
  return {
    selection_reason: text(value.selection_reason, 'invalid_typography', 'Typography selection reason must explain content-specific hierarchy, line breaks, roles or special-mode choices.', shot, { min: 20, max: 500 }),
    elements,
  };
}

function validateMotion(value, durationFrames, registry, shot) {
  exact(value, ['grammar_id', 'selection_reason', 'evidence_status', ...PHASE_NAMES], 'invalid_motion', 'Shot motion shape is invalid.', shot);
  const grammar = registry.motion_grammars.find((entry) => entry.id === value.grammar_id);
  if (!MOTION_ID.test(value.grammar_id ?? '') || !grammar) fail('invalid_motion_grammar', 'Shot motion grammar is not registered.', shot);
  if (value.evidence_status !== grammar.evidence_status) fail('motion_evidence_mismatch', 'Shot motion evidence status must match the registry.', shot);
  const phases = {};
  let expectedStart = 0;
  for (const name of PHASE_NAMES) {
    const phase = value[name];
    exact(phase, ['start_frame', 'end_frame', 'behavior'], 'invalid_frame_window', `Motion ${name} window is invalid.`, shot);
    integer(phase.start_frame, 'invalid_frame_window', `Motion ${name} start frame is invalid.`, shot);
    integer(phase.end_frame, 'invalid_frame_window', `Motion ${name} end frame is invalid.`, shot, 1);
    if (phase.start_frame !== expectedStart || phase.end_frame <= phase.start_frame || phase.end_frame > durationFrames) fail('invalid_frame_window', 'Motion phases must be non-empty, contiguous and inside the shot.', shot);
    phases[name] = {
      start_frame: phase.start_frame,
      end_frame: phase.end_frame,
      behavior: text(phase.behavior, 'invalid_motion', `Motion ${name} behavior is invalid.`, shot, { min: 8, max: 400 }),
    };
    expectedStart = phase.end_frame;
  }
  if (expectedStart !== durationFrames) fail('invalid_frame_window', 'Motion exit must end exactly at the shot duration.', shot);
  return {
    grammar_id: value.grammar_id,
    selection_reason: text(value.selection_reason, 'invalid_motion', 'Motion selection reason must be content-specific.', shot, { min: 20, max: 500 }),
    evidence_status: value.evidence_status,
    ...phases,
  };
}

function validateContinuityException(value, shot) {
  if (value === null) return null;
  exact(value, ['content_driven', 'reason', 'semantic_link'], 'invalid_continuity_exception', 'Continuity exception shape is invalid.', shot);
  if (value.content_driven !== true) fail('invalid_continuity_exception', 'Continuity exception must be explicitly content-driven.', shot);
  return {
    content_driven: true,
    reason: text(value.reason, 'invalid_continuity_exception', 'Continuity exception reason is invalid.', shot, { min: 20, max: 400 }),
    semantic_link: text(value.semantic_link, 'invalid_continuity_exception', 'Continuity semantic link is invalid.', shot, { min: 12, max: 400 }),
  };
}

function validateAntiTemplate(value, shot) {
  exact(value, ['composition_signature', 'action_signature', 'focus_signature', 'geometry_signature', 'novelty_basis', 'continuity_exception'], 'invalid_anti_template', 'Anti-template signature shape is invalid.', shot);
  if (!SHA256.test(value.geometry_signature ?? '')) fail('invalid_anti_template', 'Geometry signature is invalid.', shot);
  return {
    composition_signature: id(value.composition_signature, 'invalid_anti_template', 'Composition signature is invalid.', shot),
    action_signature: id(value.action_signature, 'invalid_anti_template', 'Action signature is invalid.', shot),
    focus_signature: id(value.focus_signature, 'invalid_anti_template', 'Focus signature is invalid.', shot),
    geometry_signature: value.geometry_signature,
    novelty_basis: text(value.novelty_basis, 'invalid_anti_template', 'Novelty basis must be content-specific.', shot, { min: 20, max: 500 }),
    continuity_exception: validateContinuityException(value.continuity_exception, shot),
  };
}

export function computeGeometrySignature(shot) {
  if (!shot || typeof shot !== 'object') fail('invalid_geometry', 'Cannot compute geometry signature for an invalid shot.');
  const composition = shot.composition;
  const typography = shot.typography;
  return hashValue({
    family_id: composition?.family_id,
    composition_bbox: composition?.composition_bbox,
    focus_bbox: composition?.focus_bbox,
    reading_path: composition?.reading_path?.map(({ order, role, bbox }) => ({ order, role, bbox })),
    negative_space: composition?.negative_space?.map(({ region_id, bbox, responsibility }) => ({ region_id, bbox, responsibility })),
    protected_regions: composition?.protected_regions?.map(({ region_id, bbox, protects }) => ({ region_id, bbox, protects })),
    type_geometry: typography?.elements?.map(({ element_id, role, bbox }) => ({ element_id, role, bbox })),
  });
}

function readableCopySignature(shot) {
  return hashValue(shot.typography.elements.map(({ element_id, content_lines }) => ({ element_id, content_lines })));
}

export function validateDesignSlice(document, { registry, projection } = {}) {
  const capabilityRegistry = validateDesignCapabilityRegistry(registry);
  if (!document || document.pipeline_contract_version !== 2) fail('pipeline_upgrade_required', 'Design slice requires pipeline contract version 2.');
  exact(document, ['schema_version', 'pipeline_contract_version', 'registry_version', 'parsed_srt_sha256', 'plan_sha256', 'frame_projection', 'style_dna', 'display_font_selection', 'shots'], 'invalid_design_slice', 'Design slice shape is invalid.');
  if (
    document.schema_version !== 1
    || document.pipeline_contract_version !== 2
    || document.registry_version !== capabilityRegistry.registry_version
    || !SHA256.test(document.parsed_srt_sha256 ?? '')
    || !SHA256.test(document.plan_sha256 ?? '')
  ) fail('invalid_design_slice', 'Design slice identity is invalid.');
  const frameProjection = validateFrameProjectionReference(
    document.frame_projection,
    document.parsed_srt_sha256,
    document.plan_sha256,
    projection,
  );
  const styleDna = validateStyleDna(document.style_dna);
  const displayFontSelection = validateDisplayFontSelectionReference(document.display_font_selection, styleDna);
  if (!Array.isArray(document.shots) || document.shots.length < 1) fail('invalid_design_slice', 'Design slice must contain at least one shot.');
  if (document.shots.length !== frameProjection.projection.shots.length) fail('frame_projection_binding_mismatch', 'Design slice shot count does not match the projection artifact.');

  let expectedStart = frameProjection.projection.timeline.start_frame;
  let familyRun = 0;
  let previousFamily;
  let previousShot;
  const priorCompleteSignatures = new Set();
  const shots = document.shots.map((shotValue, index) => {
    const shotNumber = index + 1;
    exact(shotValue, ['shot_id', 'srt_window_ms', 'start_frame', 'duration_frames', 'semantic_claim', 'style_dna_use', 'composition', 'typography', 'motion', 'anti_template'], 'invalid_shot', 'Design-slice shot shape is invalid.', shotNumber);
    const expectedId = `S${String(shotNumber).padStart(3, '0')}`;
    if (!SHOT_ID.test(shotValue.shot_id ?? '') || shotValue.shot_id !== expectedId) fail('invalid_shot', 'Design-slice shots must be ordered S001 onward.', shotNumber);
    exact(shotValue.srt_window_ms, ['start_ms', 'end_ms'], 'invalid_srt_window', 'Design-slice SRT window is invalid.', shotNumber);
    integer(shotValue.srt_window_ms.start_ms, 'invalid_srt_window', 'Design-slice SRT start is invalid.', shotNumber);
    integer(shotValue.srt_window_ms.end_ms, 'invalid_srt_window', 'Design-slice SRT end is invalid.', shotNumber, 1);
    if (shotValue.srt_window_ms.end_ms <= shotValue.srt_window_ms.start_ms) fail('invalid_srt_window', 'Design-slice SRT window must be non-empty.', shotNumber);
    const projectedShot = frameProjection.projection.shots[index];
    if (
      projectedShot.shot_id !== expectedId
      || shotValue.srt_window_ms.start_ms !== projectedShot.srt_window_ms.start_ms
      || shotValue.srt_window_ms.end_ms !== projectedShot.srt_window_ms.end_ms
    ) fail('srt_projection_mismatch', 'Design-slice SRT window does not match the projection artifact.', shotNumber);
    integer(shotValue.start_frame, 'invalid_frame_window', 'Shot start frame is invalid.', shotNumber);
    const durationFrames = integer(shotValue.duration_frames, 'invalid_frame_window', 'Shot duration must contain all five motion phases.', shotNumber, 5);
    if (
      shotValue.start_frame !== projectedShot.frame_window.start_frame
      || durationFrames !== projectedShot.frame_window.duration_frames
      || shotValue.start_frame !== expectedStart
    ) fail('frame_projection_mismatch', 'Shot frame window must equal the shared millisecond projection.', shotNumber);
    expectedStart += durationFrames;
    const composition = validateComposition(shotValue.composition, capabilityRegistry, shotNumber);
    const typography = validateTypography(shotValue.typography, displayFontSelection, shotNumber);
    const shot = {
      shot_id: shotValue.shot_id,
      srt_window_ms: canonicalize(shotValue.srt_window_ms),
      start_frame: shotValue.start_frame,
      duration_frames: durationFrames,
      semantic_claim: text(shotValue.semantic_claim, 'invalid_shot', 'Shot semantic claim is invalid.', shotNumber, { min: 8, max: 600 }),
      style_dna_use: validateStyleDnaUse(shotValue.style_dna_use, shotNumber),
      composition,
      typography,
      motion: validateMotion(shotValue.motion, durationFrames, capabilityRegistry, shotNumber),
      anti_template: validateAntiTemplate(shotValue.anti_template, shotNumber),
    };
    const actualGeometrySignature = computeGeometrySignature(shot);
    if (shot.anti_template.geometry_signature !== actualGeometrySignature) fail('geometry_signature_mismatch', 'Declared geometry signature does not match normalized shot geometry.', shotNumber);
    const completeSignature = hashValue({
      composition_signature: shot.anti_template.composition_signature,
      action_signature: shot.anti_template.action_signature,
      focus_signature: shot.anti_template.focus_signature,
      geometry_signature: shot.anti_template.geometry_signature,
    });
    const recursFromEarlierShot = priorCompleteSignatures.has(completeSignature);

    if (composition.family_id === previousFamily) familyRun += 1;
    else familyRun = 1;
    previousFamily = composition.family_id;
    if (familyRun > 2) fail('composition_family_overuse', 'One composition family cannot run for more than two consecutive shots.', shotNumber);

    if (previousShot) {
      const repeatedTriple = (
        previousShot.anti_template.composition_signature === shot.anti_template.composition_signature
        && previousShot.anti_template.action_signature === shot.anti_template.action_signature
        && previousShot.anti_template.focus_signature === shot.anti_template.focus_signature
      );
      if (repeatedTriple && shot.anti_template.continuity_exception === null) fail('adjacent_signature_repeat', 'Adjacent composition, action and focus signatures cannot all repeat without a content-driven continuity exception.', shotNumber);
      if (!repeatedTriple && !recursFromEarlierShot && shot.anti_template.continuity_exception !== null) fail('unused_continuity_exception', 'Continuity exceptions require an adjacent repeated relationship or an earlier matching complete signature.', shotNumber);
      if (
        previousShot.anti_template.geometry_signature === shot.anti_template.geometry_signature
        && readableCopySignature(previousShot) !== readableCopySignature(shot)
      ) fail('text_only_geometry_change', 'Adjacent shots cannot keep identical geometry and only replace readable text.', shotNumber);
    } else if (shot.anti_template.continuity_exception !== null) {
      fail('unused_continuity_exception', 'The first shot cannot declare a continuity exception.', shotNumber);
    }
    priorCompleteSignatures.add(completeSignature);
    previousShot = shot;
    return shot;
  });

  const normalized = {
    schema_version: 1,
    pipeline_contract_version: 2,
    registry_version: document.registry_version,
    parsed_srt_sha256: document.parsed_srt_sha256,
    plan_sha256: document.plan_sha256,
    frame_projection: frameProjection.reference,
    style_dna: styleDna,
    display_font_selection: displayFontSelection,
    shots,
  };
  return {
    ...normalized,
    shot_count: shots.length,
    total_frames: frameProjection.projection.timeline.duration_frames,
    design_slice_sha256: hashValue(normalized),
  };
}

export async function loadDesignCapabilityRegistry(registryPath = defaultRegistryPath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(registryPath, 'utf8'));
  } catch {
    fail('design_registry_unreadable', 'Design capability registry cannot be read.');
  }
  return validateDesignCapabilityRegistry(parsed);
}

async function main(argv) {
  const usage = 'Usage: node validate-design-slice.mjs <design-slice.json> --projection <frame-projection.json> [--registry <registry.json>]';
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    process.stdout.write(`${usage}\n`);
    return;
  }
  const positional = [];
  let registryPath = defaultRegistryPath;
  let projectionPath;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--registry') {
      registryPath = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--projection') {
      projectionPath = argv[index + 1];
      index += 1;
    } else positional.push(argv[index]);
  }
  if (
    positional.length !== 1
    || typeof registryPath !== 'string'
    || !registryPath
    || typeof projectionPath !== 'string'
    || !projectionPath
  ) {
    process.stderr.write(`${usage}\n`);
    process.exitCode = 2;
    return;
  }
  try {
    const [document, registry, projection] = await Promise.all([
      readFile(positional[0], 'utf8').then((value) => JSON.parse(value)),
      loadDesignCapabilityRegistry(registryPath),
      readFile(projectionPath, 'utf8').then((value) => JSON.parse(value)),
    ]);
    const result = validateDesignSlice(document, { registry, projection });
    process.stdout.write(`${JSON.stringify({
      ok: true,
      shot_count: result.shot_count,
      total_frames: result.total_frames,
      design_slice_sha256: result.design_slice_sha256,
    })}\n`);
  } catch (error) {
    const code = error instanceof DesignSliceError ? error.code : 'design_slice_unreadable';
    process.stderr.write(`${JSON.stringify({ ok: false, code, message: error.message, ...(error.shot === undefined ? {} : { shot: error.shot }) })}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
