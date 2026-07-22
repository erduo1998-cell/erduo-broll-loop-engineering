#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprintValue } from './state.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const EXIT_INVALID = 2;
const EXIT_READ = 3;
const EXIT_USAGE = 64;
const TIMING_OPTIONS = new Set(['srt']);
const FORBIDDEN_OUTPUTS_REQUIRED = new Set(['video-spec-hf.md', 'word-estimated-timing', 'asset-route-override']);
const REQUIRED_DISALLOWED = new Set(['video-spec-hf.md', 'word-estimated-timing']);
const ALLOWED_ROUTES = new Set(['user-media', 'image-generation', 'pexels', 'hyperframes-native', 'mixed']);
const ALLOWED_SHOT_GOALS = new Set(['hook', 'data', 'relation', 'contrast', 'case', 'process', 'emotion', 'action', 'closure']);
const REQUIRED_QUALITY_CHECKS = new Set(['intent_card', 'visual_motif', 'shot_table', 'components_assets_taste', 'srt_timing', 'disallowed_outputs']);

export class DirectorMethodError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = 'DirectorMethodError';
    this.code = code;
    if (detail !== undefined) Object.assign(this, detail);
  }
}

const fail = (code, message, detail = {}) => { throw new DirectorMethodError(code, message, detail); };

function exactFields(value, fields, code, message, detail = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, detail);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code, message, detail);
}

function textValue(value, code, message, detail = {}, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(value)) fail(code, message, detail);
  return value.trim();
}

function stringList(value, { code, message, detail = {}, min = 0, max = 16, pattern } = {}) {
  if (!Array.isArray(value)) fail(code, message, detail);
  if (value.length < min || value.length > max) fail(code, message, detail);
  const normalized = value.map((item) => textValue(item, code, message, detail, 240));
  if (new Set(normalized).size !== normalized.length) fail(code, message, detail);
  if (pattern && normalized.some((item) => !pattern.test(item))) fail(code, message, detail);
  return normalized;
}

function validateOptionalEnhancer(value) {
  if (value === undefined || value === null) return { used: false };
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.used !== 'boolean') {
    fail('invalid_optional_enhancer', 'Optional enhancer metadata is invalid.');
  }
  if (value.used === false) {
    exactFields(value, ['used'], 'invalid_optional_enhancer', 'Unused enhancer metadata must contain only used=false.');
    return { used: false };
  }
  exactFields(value, ['used', 'name', 'version', 'license_id', 'output_sha256', 'absorbed_sections'], 'invalid_optional_enhancer', 'Used enhancer metadata is incomplete.');
  const name = textValue(value.name, 'invalid_optional_enhancer', 'Enhancer name is invalid.', {}, 120);
  const version = textValue(value.version, 'invalid_optional_enhancer', 'Enhancer version is invalid.', {}, 80);
  const licenseId = textValue(value.license_id, 'invalid_optional_enhancer', 'Enhancer license identifier is invalid.', {}, 120);
  if (!SHA256.test(value.output_sha256)) fail('invalid_optional_enhancer', 'Enhancer output hash is invalid.');
  const absorbedSections = stringList(value.absorbed_sections, {
    code: 'invalid_optional_enhancer',
    message: 'Enhancer absorbed sections are invalid.',
    min: 1,
    max: 12,
    pattern: /^[a-z][a-z0-9-]*$/u,
  });
  return { used: true, name, version, license_id: licenseId, output_sha256: value.output_sha256, absorbed_sections: absorbedSections };
}

function validateIntentCard(intentCard) {
  exactFields(intentCard, ['visual_personality', 'emotion_visual_map'], 'invalid_intent_card', 'Director intent card shape is invalid.');
  const visualPersonality = stringList(intentCard.visual_personality, {
    code: 'invalid_intent_card',
    message: 'Director visual personality is invalid.',
    detail: { field: 'visual_personality' },
    min: 1,
    max: 8,
  });
  const emotionMap = stringList(intentCard.emotion_visual_map, {
    code: 'invalid_intent_card',
    message: 'Director emotion-visual map is invalid.',
    detail: { field: 'emotion_visual_map' },
    min: 1,
    max: 16,
  }).map((entry) => {
    const match = entry.match(/^\s*([^|]+)\s*\|\s*(.+)$/u);
    if (!match) fail('invalid_intent_card', 'Director emotion-visual map entry must be "emotion | visual response".', { field: 'emotion_visual_map' });
    const state = textValue(match[1], 'invalid_intent_card', 'Director emotion-visual map emotion is invalid.', { field: 'emotion_visual_map' }, 80);
    const visual = textValue(match[2], 'invalid_intent_card', 'Director emotion-visual map visual response is invalid.', { field: 'emotion_visual_map' }, 220);
    return { state, visual_response: visual };
  });
  return { visual_personality: visualPersonality, emotion_visual_map: emotionMap };
}

function validateVisualMotif(visualMotif) {
  exactFields(visualMotif, ['motif_name', 'occurrence_notes'], 'invalid_visual_motif', 'Director visual motif shape is invalid.');
  const motifName = textValue(visualMotif.motif_name, 'invalid_visual_motif', 'Director visual motif name is invalid.', {}, 120);
  const occurrenceNotes = stringList(visualMotif.occurrence_notes, {
    code: 'invalid_visual_motif',
    message: 'Director visual motif occurrence notes are invalid.',
    detail: { field: 'occurrence_notes' },
    min: 1,
    max: 8,
  }).map((note) => textValue(note, 'invalid_visual_motif', 'Director visual motif note is invalid.', { field: 'occurrence_notes' }, 220));
  return { motif_name: motifName, occurrence_notes: occurrenceNotes };
}

function validateAssetRoles(roles, detail = {}) {
  const normalized = stringList(roles, {
    code: 'invalid_shot_asset_plan',
    message: 'Director shot asset roles are invalid.',
    detail,
    min: 1,
    max: 12,
    pattern: /^[A-Za-z0-9_-]+$/u,
  });
  return normalized.map((role) => {
    if (!role) fail('invalid_shot_asset_plan', 'Director shot asset role is invalid.', detail);
    return role;
  });
}

function validateAssetRolesAsObjects(values, detail = {}) {
  if (!Array.isArray(values)) fail('invalid_shot_asset_plan', 'Director shot asset roles are invalid.', detail);
  if (values.length < 1 || values.length > 12) fail('invalid_shot_asset_plan', 'Director shot asset roles are invalid.', detail);
  const normalized = [];
  const seen = new Set();
  for (const role of values) {
    if (!role || typeof role !== 'object' || Array.isArray(role)) fail('invalid_shot_asset_plan', 'Director shot asset role is invalid.', detail);
    exactFields(role, ['role', 'route', 'note'], 'invalid_shot_asset_plan', 'Director shot asset role shape is invalid.', detail);
    const roleName = textValue(role.role, 'invalid_shot_asset_plan', 'Director shot asset role is invalid.', detail, 80);
    if (seen.has(roleName)) fail('invalid_shot_asset_plan', 'Director shot asset roles must be unique.', detail);
    if (!ALLOWED_ROUTES.has(role.route)) fail('invalid_shot_asset_plan', 'Director shot asset route is invalid.', detail);
    const note = textValue(role.note, 'invalid_shot_asset_plan', 'Director shot asset note is invalid.', detail, 260);
    seen.add(roleName);
    normalized.push({ role: roleName, route: role.route, note });
  }
  return normalized;
}

function validateAssetRolesCompat(values, detail = {}) {
  if (!Array.isArray(values)) fail('invalid_shot_asset_plan', 'Director shot asset roles are invalid.', detail);
  if (values.length < 1 || values.length > 12) fail('invalid_shot_asset_plan', 'Director shot asset roles are invalid.', detail);
  const normalized = [];
  const seen = new Set();
  for (const value of values) {
    if (typeof value === 'string') {
      const role = textValue(value, 'invalid_shot_asset_plan', 'Director shot asset role is invalid.', detail, 80);
      if (seen.has(role)) fail('invalid_shot_asset_plan', 'Director shot asset roles must be unique.', detail);
      seen.add(role);
      normalized.push({ role, route: 'mixed', note: 'compat: route unspecified in historical output' });
      continue;
    }
    normalized.push(...validateAssetRolesAsObjects([value], detail));
  }
  return normalized;
}

function validateComponents(components, detail = {}) {
  return stringList(components, {
    code: 'invalid_shot_components',
    message: 'Director shot components are invalid.',
    detail,
    min: 1,
    max: 8,
    pattern: /^[a-z0-9-_.]+$/iu,
  });
}

function validateShotTable(shotTable) {
  if (!Array.isArray(shotTable) || shotTable.length === 0) fail('invalid_shot_table', 'Director shot table is missing or empty.');
  const normalized = [];
  let priorEnd = -1;
  for (let index = 0; index < shotTable.length; index += 1) {
    const shot = shotTable[index];
    const shotNumber = index + 1;
    const detail = { shot: shotNumber };
    exactFields(shot, ['shot_id', 'srt_start_ms', 'srt_end_ms', 'scene_goal', 'scene_goal_kind', 'components', 'asset_plan', 'taste_reason', 'quality_notes'], 'invalid_shot', 'Director shot shape is invalid.', detail);

    if (!/^S\d{3}$/u.test(shot.shot_id)) fail('invalid_shot_id', 'Director shot ID format is invalid.', detail);
    if (shot.shot_id !== `S${String(shotNumber).padStart(3, '0')}`) fail('invalid_shot_id', 'Director shot IDs must be stable and sequential.', detail);

    if (!Number.isSafeInteger(shot.srt_start_ms) || !Number.isSafeInteger(shot.srt_end_ms) || shot.srt_start_ms < 0 || shot.srt_end_ms <= shot.srt_start_ms) fail('invalid_shot_timing', 'Director shot timing is invalid.', detail);
    if (shot.srt_start_ms < priorEnd) fail('invalid_shot_timing', 'Director shot timing overlaps previous shot.', detail);
    priorEnd = shot.srt_end_ms;

    const sceneGoal = textValue(shot.scene_goal, 'invalid_shot_goal', 'Director shot scene goal is invalid.', detail, 260);
    if (!ALLOWED_SHOT_GOALS.has(shot.scene_goal_kind)) fail('invalid_shot_goal', 'Director shot goal kind is invalid.', detail);

    const components = validateComponents(shot.components, detail);

    if (!shot.asset_plan || typeof shot.asset_plan !== 'object' || Array.isArray(shot.asset_plan)) fail('invalid_shot_asset_plan', 'Director shot asset plan is invalid.', detail);
    exactFields(shot.asset_plan, ['preferred_route', 'roles'], 'invalid_shot_asset_plan', 'Director shot asset plan shape is invalid.', detail);
    if (!ALLOWED_ROUTES.has(shot.asset_plan.preferred_route)) fail('invalid_shot_asset_plan', 'Director shot preferred route is invalid.', detail);
    const assetPlan = {
      preferred_route: shot.asset_plan.preferred_route,
      roles: validateAssetRolesCompat(shot.asset_plan.roles, detail),
    };

    const tasteReason = textValue(shot.taste_reason, 'invalid_shot_taste', 'Director shot taste reason is invalid.', detail, 220);
    const qualityNotes = stringList(shot.quality_notes, {
      code: 'invalid_shot_quality',
      message: 'Director shot quality notes are invalid.',
      detail,
      min: 1,
      max: 10,
    });

    normalized.push({
      shot_id: shot.shot_id,
      srt_start_ms: shot.srt_start_ms,
      srt_end_ms: shot.srt_end_ms,
      scene_goal: sceneGoal,
      scene_goal_kind: shot.scene_goal_kind,
      components,
      asset_plan: assetPlan,
      taste_reason: tasteReason,
      quality_notes: qualityNotes,
    });
  }
  return normalized;
}

function validateQualitySummary(summary) {
  exactFields(summary, ['verdict', 'checks'], 'invalid_quality_summary', 'Director quality summary shape is invalid.');
  if (summary.verdict !== 'pass') fail('invalid_quality_summary', 'Director quality summary verdict must be pass.');
  if (!Array.isArray(summary.checks) || summary.checks.length < REQUIRED_QUALITY_CHECKS.size) fail('invalid_quality_summary', 'Director quality summary checks are incomplete.');

  const seen = new Set();
  const normalizedChecks = [];
  for (const item of summary.checks) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('invalid_quality_summary', 'Director quality check item is invalid.');
    exactFields(item, ['name', 'status', 'note'], 'invalid_quality_summary', 'Director quality check item shape is invalid.');
    if (!/^[a-z_]+$/u.test(item.name)) fail('invalid_quality_summary', 'Director quality check name is invalid.');
    if (item.status !== 'pass' && item.status !== 'warn') fail('invalid_quality_summary', 'Director quality check status is invalid.');
    if (seen.has(item.name)) fail('invalid_quality_summary', 'Director quality check names must be unique.');
    seen.add(item.name);
    normalizedChecks.push({
      name: item.name,
      status: item.status,
      note: textValue(item.note, 'invalid_quality_summary', 'Director quality check note is invalid.', {}, 240),
    });
  }

  for (const required of REQUIRED_QUALITY_CHECKS) {
    if (!seen.has(required)) fail('invalid_quality_summary', 'Director quality summary missing required checks.', { required });
  }
  return { verdict: 'pass', checks: normalizedChecks };
}

function validateAssetPolicy(policy) {
  exactFields(policy, ['route_priority', 'forbidden_outputs'], 'invalid_asset_policy', 'Director asset policy shape is invalid.');
  const routePriority = stringList(policy.route_priority, {
    code: 'invalid_asset_policy',
    message: 'Director route priority is invalid.',
    min: 4,
    max: 4,
    pattern: /^[a-z-]+$/u,
  });
  const expectedRoutePriority = ['user-media', 'image-generation', 'pexels', 'hyperframes-native'];
  if (routePriority.length !== expectedRoutePriority.length || routePriority.some((value, index) => value !== expectedRoutePriority[index])) fail('invalid_asset_policy', 'Director route priority must match user-media -> image-generation -> pexels -> hyperframes-native.');

  const forbidden = stringList(policy.forbidden_outputs, {
    code: 'invalid_asset_policy',
    message: 'Director forbidden outputs list is invalid.',
    min: 1,
    max: 16,
  });

  for (const required of REQUIRED_DISALLOWED) {
    if (!forbidden.includes(required)) fail('invalid_asset_policy', 'Director forbidden outputs are incomplete.');
  }
  return { route_priority: routePriority, forbidden_outputs: forbidden };
}

function validateDisallowedOutputs(disallowedOutputs, finalOutput) {
  const outputs = stringList(disallowedOutputs, {
    code: 'invalid_disallowed_outputs',
    message: 'Director disallowed outputs list is invalid.',
    min: 2,
    max: 12,
  });
  for (const required of FORBIDDEN_OUTPUTS_REQUIRED) {
    if (!outputs.includes(required)) fail('invalid_disallowed_outputs', 'Director disallowed outputs miss required entries.');
  }
  if (outputs.includes(finalOutput)) fail('invalid_final_output', 'Director contract forbids using a final-disallowed output.');

  return outputs;
}

export function validateDirectorMethod(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) fail('invalid_document', 'Director method document is invalid.');
  const allowedDocumentFields = new Set([
    'schema_version',
    'method_id',
    'time_source',
    'timing_method',
    'disallowed_outputs',
    'intent_card',
    'visual_motif',
    'shot_table',
    'quality_audit_summary',
    'asset_route_policy',
    'optional_enhancer',
    'final_output',
  ]);
  if (Object.keys(document).some((key) => !allowedDocumentFields.has(key))) fail('invalid_document', 'Director method document has unknown fields.');
  for (const required of allowedDocumentFields) {
    if (required === 'optional_enhancer') continue;
    if (!(required in document)) fail('invalid_document', 'Director method document is missing required fields.');
  }

  if (document.schema_version !== 1) fail('invalid_schema_version', 'Director method document schema_version must be 1.');
  if (document.method_id !== 'erduo-director-method-v1') fail('invalid_method_id', 'Director method ID is invalid.');
  if (document.time_source !== 'srt') fail('invalid_time_source', 'Director method document must declare SRT as time source.');
  if (!TIMING_OPTIONS.has(document.timing_method)) fail('invalid_timing_method', 'Director timing method must be SRT-based.');
  if (document.final_output !== undefined && !textValue(document.final_output, 'invalid_final_output', 'Director final output is invalid.', {}, 220)) fail('invalid_final_output', 'Director final output is invalid.');
  if (/\bvideo-spec-hf\.md\b/iu.test(document.final_output)) fail('invalid_final_output', 'Director final output cannot be video-spec-hf.md.');

  const disallowedOutputs = validateDisallowedOutputs(document.disallowed_outputs, document.final_output);
  const intentCard = validateIntentCard(document.intent_card);
  const visualMotif = validateVisualMotif(document.visual_motif);
  const shots = validateShotTable(document.shot_table);
  const qualitySummary = validateQualitySummary(document.quality_audit_summary);
  const policy = validateAssetPolicy(document.asset_route_policy);
  const optionalEnhancer = validateOptionalEnhancer(document.optional_enhancer);

  const normalized = {
    schema_version: 1,
    method_id: 'erduo-director-method-v1',
    time_source: 'srt',
    timing_method: document.timing_method,
    disallowed_outputs: [...new Set(disallowedOutputs)],
    final_output: document.final_output,
    intent_card: intentCard,
    visual_motif: visualMotif,
    shot_table: shots,
    quality_audit_summary: qualitySummary,
    asset_route_policy: policy,
    optional_enhancer: optionalEnhancer,
    shot_count: shots.length,
    timeline_ms: {
      start_ms: shots[0].srt_start_ms,
      end_ms: shots.at(-1).srt_end_ms,
    },
  };

  if (!Number.isSafeInteger(normalized.timeline_ms.start_ms) || normalized.timeline_ms.start_ms < 0 || !Number.isSafeInteger(normalized.timeline_ms.end_ms) || normalized.timeline_ms.end_ms <= normalized.timeline_ms.start_ms) fail('invalid_timeline', 'Director timeline is invalid.');

  normalized.contract_sha256 = fingerprintValue(normalized);
  return normalized;
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const pretty = argv.includes('--pretty');
  const positional = argv.filter((value) => !value.startsWith('--'));
  const explicitPrettyCount = argv.filter((value) => value === '--pretty').length;
  if (pretty && explicitPrettyCount !== 1) return { error: true };
  if (positional.length !== 1 || argv.length !== positional.length + (pretty ? 1 : 0)) return { error: true };
  return { document: positional[0], pretty };
}

export async function runValidateDirectorMethodCli(argv, adapters = {}) {
  const stdout = adapters.stdout ?? process.stdout;
  const stderr = adapters.stderr ?? process.stderr;
  const readFileInner = adapters.readFile ?? readFile;

  const args = parseArgs(argv);
  if (args.help) {
    stdout.write('Usage: node scripts/validate-director-method.mjs <director-method.json> [--pretty]\n');
    return 0;
  }
  if (args.error) {
    stderr.write('validate-director-method: invalid arguments (use --help)\n');
    return EXIT_USAGE;
  }

  let outputText;
  try {
    outputText = await readFileInner(args.document, 'utf8');
  } catch {
    stderr.write('validate-director-method: read failed.\n');
    return EXIT_READ;
  }

  try {
    const output = validateDirectorMethod(JSON.parse(outputText));
    stdout.write(`${JSON.stringify(output, null, args.pretty ? 2 : 0)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof DirectorMethodError) {
      stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code, message: error.message } })}\n`);
      return EXIT_INVALID;
    }
    stderr.write('validate-director-method: unexpected validation failure.\n');
    return EXIT_READ;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exit(await runValidateDirectorMethodCli(process.argv.slice(2)));
