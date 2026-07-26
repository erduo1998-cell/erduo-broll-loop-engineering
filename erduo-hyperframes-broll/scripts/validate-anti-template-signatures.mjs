#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { computeGeometrySignature } from './validate-design-slice.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT_ID = /^S[0-9]{3}$/u;
const SIGNATURE_ID = /^[a-z0-9][a-z0-9-]{1,63}$/u;
const COMPLETE_SHORT_RELATIVE_NUMERATOR = 1;
const COMPLETE_SHORT_RELATIVE_DENOMINATOR = 5;
const COMPLETE_SHORT_MINIMUM_OCCURRENCES = 3;
const COMPLETE_LONG_RELATIVE_NUMERATOR = 1;
const COMPLETE_LONG_RELATIVE_DENOMINATOR = 8;
const COMPLETE_LONG_MINIMUM_OCCURRENCES = 8;
const SURFACE_SHORT_RELATIVE_NUMERATOR = 1;
const SURFACE_SHORT_RELATIVE_DENOMINATOR = 4;
const SURFACE_SHORT_MINIMUM_OCCURRENCES = 4;
const SURFACE_LONG_RELATIVE_NUMERATOR = 3;
const SURFACE_LONG_RELATIVE_DENOMINATOR = 20;
const SURFACE_LONG_MINIMUM_OCCURRENCES = 10;

export const ANTI_TEMPLATE_SIGNATURE_CONTRACT =
  'scripts/validate-anti-template-signatures.mjs#schema-v1';

export class AntiTemplateSignatureError extends Error {
  constructor(code, message, facts) {
    super(message);
    this.name = 'AntiTemplateSignatureError';
    this.code = code;
    if (facts !== undefined) this.facts = facts;
  }
}

const fail = (code, message, facts) => {
  throw new AntiTemplateSignatureError(code, message, facts);
};

function canonicalize(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('signature_facts_invalid', 'Signature facts contain a non-finite number.');
    return Number(value.toFixed(6));
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') fail('signature_facts_invalid', 'Signature facts contain an unsupported value.');
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonicalize(value)), 'utf8').digest('hex');
}

function requireText(value, code, message) {
  if (typeof value !== 'string' || !value.trim()) fail(code, message);
  return value;
}

function requireSignatureId(value, shotId, field) {
  if (typeof value !== 'string' || !SIGNATURE_ID.test(value)) {
    fail('signature_facts_invalid', `${shotId} has an invalid ${field}.`);
  }
  return value;
}

function completeHighFrequency(count, shotCount) {
  return (
    count >= COMPLETE_SHORT_MINIMUM_OCCURRENCES
    && count * COMPLETE_SHORT_RELATIVE_DENOMINATOR
      >= shotCount * COMPLETE_SHORT_RELATIVE_NUMERATOR
  ) || (
    count >= COMPLETE_LONG_MINIMUM_OCCURRENCES
    && count * COMPLETE_LONG_RELATIVE_DENOMINATOR
      >= shotCount * COMPLETE_LONG_RELATIVE_NUMERATOR
  );
}

function surfaceHighFrequency(count, shotCount) {
  return (
    count >= SURFACE_SHORT_MINIMUM_OCCURRENCES
    && count * SURFACE_SHORT_RELATIVE_DENOMINATOR
      >= shotCount * SURFACE_SHORT_RELATIVE_NUMERATOR
  ) || (
    count >= SURFACE_LONG_MINIMUM_OCCURRENCES
    && count * SURFACE_LONG_RELATIVE_DENOMINATOR
      >= shotCount * SURFACE_LONG_RELATIVE_NUMERATOR
  );
}

function hasNonAdjacentOccurrence(indices) {
  for (let left = 0; left < indices.length; left += 1) {
    for (let right = left + 1; right < indices.length; right += 1) {
      if (indices[right] - indices[left] > 1) return true;
    }
  }
  return false;
}

function addGroup(groups, fingerprintValue, shotId, index) {
  const group = groups.get(fingerprintValue) ?? {
    fingerprint: fingerprintValue,
    shot_ids: [],
    indices: [],
  };
  group.shot_ids.push(shotId);
  group.indices.push(index);
  groups.set(fingerprintValue, group);
}

function lifecycleShape(motion, shotId) {
  const phases = ['entry', 'action', 'result', 'hold', 'exit'];
  const duration = motion?.exit?.end_frame;
  if (!Number.isSafeInteger(duration) || duration <= 0) {
    fail('signature_facts_invalid', `${shotId} has an invalid motion duration.`);
  }
  return phases.map((phase) => {
    const value = motion?.[phase];
    if (!value || !Number.isSafeInteger(value.start_frame) || !Number.isSafeInteger(value.end_frame)) {
      fail('signature_facts_invalid', `${shotId} has an invalid motion lifecycle.`);
    }
    return {
      phase,
      start_eighth: Math.round((value.start_frame * 8) / duration),
      end_eighth: Math.round((value.end_frame * 8) / duration),
    };
  });
}

function quantizedBox(value, shotId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('signature_facts_invalid', `${shotId} has invalid geometry.`);
  }
  const result = {};
  for (const field of ['x', 'y', 'width', 'height']) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
      fail('signature_facts_invalid', `${shotId} has invalid geometry.`);
    }
    result[field] = Math.round(value[field] * 20) / 20;
  }
  return result;
}

function structuralGeometry(shot, shotId) {
  return {
    composition_bbox: quantizedBox(shot.composition?.composition_bbox, shotId),
    focus_bbox: quantizedBox(shot.composition?.focus_bbox, shotId),
    reading_path: shot.composition?.reading_path?.map(({ order, role, bbox }) => ({
      order,
      role,
      bbox: quantizedBox(bbox, shotId),
    })),
    negative_space: shot.composition?.negative_space?.map(({ responsibility, bbox }) => ({
      responsibility,
      bbox: quantizedBox(bbox, shotId),
    })),
    protected_regions: shot.composition?.protected_regions?.map(({ protects, bbox }) => ({
      protects,
      bbox: quantizedBox(bbox, shotId),
    })),
    type_geometry: shot.typography?.elements?.map(({ role, bbox }) => ({
      role,
      bbox: quantizedBox(bbox, shotId),
    })),
  };
}

function typeTopology(typography, shotId) {
  if (!Array.isArray(typography?.elements) || !typography.elements.length) {
    fail('signature_facts_invalid', `${shotId} has no typography topology.`);
  }
  return typography.elements.map((element) => ({
    role: requireText(element?.role, 'signature_facts_invalid', `${shotId} has an invalid typography role.`),
    special_mode: requireText(element?.special_mode, 'signature_facts_invalid', `${shotId} has an invalid typography mode.`),
    renderer: requireText(element?.renderer, 'signature_facts_invalid', `${shotId} has an invalid typography renderer.`),
    bbox: quantizedBox(element?.bbox, shotId),
  }));
}

function readableCopyFingerprint(typography, shotId) {
  return fingerprint(typography.elements.map((element) => ({
    role: requireText(element?.role, 'signature_facts_invalid', `${shotId} has an invalid typography role.`),
    content_lines: element?.content_lines,
  })));
}

function shotFacts(shot, index) {
  const expectedShotId = `S${String(index + 1).padStart(3, '0')}`;
  if (shot?.shot_id !== expectedShotId || !SHOT_ID.test(shot.shot_id)) {
    fail('signature_facts_invalid', 'Anti-template shots must be ordered S001 onward.');
  }
  const anti = shot.anti_template;
  if (!anti || typeof anti !== 'object' || Array.isArray(anti)) {
    fail('signature_facts_invalid', `${shot.shot_id} has no anti-template facts.`);
  }
  const geometrySignature = computeGeometrySignature(shot);
  if (!SHA256.test(anti.geometry_signature ?? '') || anti.geometry_signature !== geometrySignature) {
    fail('geometry_signature_mismatch', `${shot.shot_id} geometry signature does not match normalized design geometry.`);
  }
  const compositionSignature = requireSignatureId(
    anti.composition_signature,
    shot.shot_id,
    'composition signature',
  );
  const actionSignature = requireSignatureId(anti.action_signature, shot.shot_id, 'action signature');
  const focusSignature = requireSignatureId(anti.focus_signature, shot.shot_id, 'focus signature');
  const grammarId = requireText(
    shot.motion?.grammar_id,
    'signature_facts_invalid',
    `${shot.shot_id} has no motion grammar.`,
  );
  const typeShape = typeTopology(shot.typography, shot.shot_id);
  const lifecycle = lifecycleShape(shot.motion, shot.shot_id);
  const structuralGeometrySha256 = fingerprint(structuralGeometry(shot, shot.shot_id));
  return {
    shot_id: shot.shot_id,
    index,
    relationship_signature_sha256: fingerprint({
      composition_signature: compositionSignature,
      action_signature: actionSignature,
      focus_signature: focusSignature,
    }),
    complete_signature_sha256: fingerprint({
      composition_signature: compositionSignature,
      action_signature: actionSignature,
      focus_signature: focusSignature,
      geometry_signature: geometrySignature,
    }),
    surface_core_sha256: fingerprint({
      structural_geometry_sha256: structuralGeometrySha256,
      motion_grammar_id: grammarId,
      lifecycle,
      type_topology: typeShape,
    }),
    readable_copy_sha256: readableCopyFingerprint(shot.typography, shot.shot_id),
    continuity_exception: anti.continuity_exception,
  };
}

function validateContinuityBudget(facts) {
  const semanticLinks = new Set();
  const reasons = new Set();
  for (const [index, fact] of facts.entries()) {
    const continuity = fact.continuity_exception;
    if (continuity === null) continue;
    if (
      index === 0
      || continuity?.content_driven !== true
      || typeof continuity.reason !== 'string'
      || continuity.reason.trim().length < 20
      || typeof continuity.semantic_link !== 'string'
      || continuity.semantic_link.trim().length < 12
    ) {
      fail('continuity_exception_invalid', 'Continuity exception must identify one explicit content-driven adjacent pair.', {
        shot_id: fact.shot_id,
      });
    }
    const previous = facts[index - 1];
    const priorMatches = facts.slice(0, index)
      .filter((candidate) => candidate.complete_signature_sha256 === fact.complete_signature_sha256);
    const adjacentRelationshipMatch =
      previous.relationship_signature_sha256 === fact.relationship_signature_sha256;
    if (!priorMatches.length && !adjacentRelationshipMatch) {
      fail('continuity_exception_unbounded', 'A continuity exception must point back to an earlier matching complete signature.', {
        shot_id: fact.shot_id,
      });
    }
    if (
      previous.complete_signature_sha256 === fact.complete_signature_sha256
      && previous.continuity_exception !== null
    ) {
      fail('continuity_exception_unbounded', 'A continuity exception may cover one adjacent two-shot pair only.', {
        shot_ids: [previous.shot_id, fact.shot_id],
      });
    }
    const normalizeExplanationTemplate = (value) => value.trim()
      .replace(/\s+/gu, ' ')
      .replace(/S[0-9]{3}/giu, 'S#')
      .replace(/[0-9０-９一二三四五六七八九十百千]+/gu, '#')
      .toLowerCase();
    const normalizedSemanticLink = normalizeExplanationTemplate(continuity.semantic_link);
    const normalizedReason = normalizeExplanationTemplate(continuity.reason);
    if (semanticLinks.has(normalizedSemanticLink)) {
      fail('continuity_exception_unbounded', 'One semantic continuity link cannot be reused as an unlimited exemption.', {
        semantic_link_sha256: fingerprint(normalizedSemanticLink),
      });
    }
    if (reasons.has(normalizedReason)) {
      fail('continuity_exception_unbounded', 'One generic continuity reason cannot be copied across recurring shots.', {
        reason_sha256: fingerprint(normalizedReason),
      });
    }
    semanticLinks.add(normalizedSemanticLink);
    reasons.add(normalizedReason);
  }
  return semanticLinks.size;
}

export function deriveAntiTemplateSignatureFacts(designSlice) {
  if (!designSlice || designSlice.pipeline_contract_version !== 2 || !Array.isArray(designSlice.shots)
    || designSlice.shots.length < 1) {
    fail('pipeline_upgrade_required', 'Anti-template signature validation requires a version-2 design slice.');
  }
  const facts = designSlice.shots.map(shotFacts);
  const completeGroups = new Map();
  const surfaceGroups = new Map();
  for (const fact of facts) {
    addGroup(completeGroups, fact.complete_signature_sha256, fact.shot_id, fact.index);
    addGroup(surfaceGroups, fact.surface_core_sha256, fact.shot_id, fact.index);
  }
  const summarize = (group) => ({
    signature_sha256: group.fingerprint,
    count: group.shot_ids.length,
    shot_ids: group.shot_ids,
    non_adjacent: hasNonAdjacentOccurrence(group.indices),
  });
  return {
    schema_version: 1,
    pipeline_contract_version: 2,
    contract: ANTI_TEMPLATE_SIGNATURE_CONTRACT,
    authority: 'deterministic-signature-conflict-only',
    shot_count: facts.length,
    thresholds: {
      complete_short: {
        relative_numerator: COMPLETE_SHORT_RELATIVE_NUMERATOR,
        relative_denominator: COMPLETE_SHORT_RELATIVE_DENOMINATOR,
        minimum_occurrences: COMPLETE_SHORT_MINIMUM_OCCURRENCES,
      },
      complete_long: {
        relative_numerator: COMPLETE_LONG_RELATIVE_NUMERATOR,
        relative_denominator: COMPLETE_LONG_RELATIVE_DENOMINATOR,
        minimum_occurrences: COMPLETE_LONG_MINIMUM_OCCURRENCES,
      },
      surface_short: {
        relative_numerator: SURFACE_SHORT_RELATIVE_NUMERATOR,
        relative_denominator: SURFACE_SHORT_RELATIVE_DENOMINATOR,
        minimum_occurrences: SURFACE_SHORT_MINIMUM_OCCURRENCES,
      },
      surface_long: {
        relative_numerator: SURFACE_LONG_RELATIVE_NUMERATOR,
        relative_denominator: SURFACE_LONG_RELATIVE_DENOMINATOR,
        minimum_occurrences: SURFACE_LONG_MINIMUM_OCCURRENCES,
      },
    },
    continuity_exception_count: facts.filter((fact) => fact.continuity_exception !== null).length,
    complete_signature_groups: [...completeGroups.values()].map(summarize),
    surface_core_groups: [...surfaceGroups.values()].map((group) => ({
      ...summarize(group),
      readable_copy_count: new Set(
        group.indices.map((index) => facts[index].readable_copy_sha256),
      ).size,
    })),
    facts,
  };
}

export function validateAntiTemplateSignatures(designSlice) {
  const result = deriveAntiTemplateSignatureFacts(designSlice);
  const exceptionCount = validateContinuityBudget(result.facts);
  for (const group of result.complete_signature_groups) {
    if (group.non_adjacent && completeHighFrequency(group.count, result.shot_count)) {
      const groupFacts = group.shot_ids.map((shotId) => result.facts[Number(shotId.slice(1)) - 1]);
      const unexplained = groupFacts.filter((fact, index) => {
        if (index === 0) return false;
        const previousOccurrence = groupFacts[index - 1];
        return fact.index - previousOccurrence.index > 1 && fact.continuity_exception === null;
      });
      if (!unexplained.length) continue;
      fail(
        'full_film_complete_signature_repeat',
        'One complete composition/action/focus/geometry signature is reused at high frequency across non-adjacent shots without an explicit content-driven recurrence reason.',
        { ...group, unexplained_shot_ids: unexplained.map((fact) => fact.shot_id) },
      );
    }
  }
  for (const group of result.surface_core_groups) {
    if (
      group.readable_copy_count > 1
      && surfaceHighFrequency(group.count, result.shot_count)
    ) {
      fail(
        'surface_variant_template_reuse',
        'One structural composition is reused at high frequency while only readable copy or non-structural skin may vary.',
        group,
      );
    }
  }
  const publicFacts = {
    schema_version: result.schema_version,
    pipeline_contract_version: result.pipeline_contract_version,
    contract: result.contract,
    authority: result.authority,
    shot_count: result.shot_count,
    thresholds: result.thresholds,
    continuity_exception_count: exceptionCount,
    complete_signature_groups: result.complete_signature_groups,
    surface_core_groups: result.surface_core_groups,
  };
  return {
    ...publicFacts,
    signature_audit_sha256: fingerprint(publicFacts),
    ok: true,
  };
}
