import { promises as fs } from 'node:fs';
import { fingerprintValue } from './state.mjs';

const TOKEN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MOTIF = /^MOTIF-[A-Z0-9-]+$/u;
const LAYERS = new Set(['visual_system', 'scene_grammar', 'motion_grammar', 'compositing']);
const PRIMARY_TO_OUTPUT = {
  fullscreen: 'fullscreen',
  'native-base-with-overlay': 'fullscreen',
  'hard-alpha-over-source': 'hard-alpha',
};
const SEMANTIC_SIGNALS = {
  concept: ['explanation'], process: ['process'], quantity: ['comparison'], relationship: ['network'],
  evidence: ['case'], emotion: ['reveal'], environment: ['opening'],
};
const REPRESENTATION_SIGNALS = {
  'physical-object': ['concrete-metaphor'], 'spatial-relation': ['network'], 'process-system': ['process'],
  'quantitative-chart': ['comparison'], 'documentary-evidence': ['case'], 'emotional-atmosphere': ['reveal'],
};
const ROUTE_MEDIA = {
  'user-media': ['photo'], pexels: ['photo'], 'image-generation': ['photo'],
  'hyperframes-native': ['native-graphics'], mixed: ['photo', 'native-graphics'],
};

export class DesignSelectionError extends Error {
  constructor(code, message, shotId) {
    super(message);
    this.name = 'DesignSelectionError';
    this.code = code;
    if (shotId) this.shot_id = shotId;
  }
}

function fail(code, message, shotId) { throw new DesignSelectionError(code, message, shotId); }
function unique(values) { return [...new Set(values)]; }
function intersection(left, right = []) { const set = new Set(right); return unique(left.filter((value) => set.has(value))); }
function tokenList(value, field, { motif = false } = {}) {
  const pattern = motif ? MOTIF : TOKEN;
  if (!Array.isArray(value) || new Set(value).size !== value.length || value.some((item) => typeof item !== 'string' || !pattern.test(item))) fail('invalid_context', `${field} is invalid.`);
  return value;
}

function validateContext(context, policy) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) fail('invalid_context', 'Design selection context is invalid.');
  const allowed = new Set(['schema_version', 'briefs_sha256', 'topic_tags', 'moods', 'aspect_ratio', 'information_density', 'user_template_id', 'user_design_defined_layers', 'allow_conditional_compositing', 'recent_base_template_ids', 'used_signature_motif_ids', 'requested_borrows']);
  if (Object.keys(context).some((key) => !allowed.has(key)) || context.schema_version !== 1 || context.policy_version !== undefined) fail('invalid_context', 'Design selection context shape is invalid.');
  if (!/^[0-9a-f]{64}$/u.test(context.briefs_sha256 ?? '')) fail('invalid_context', 'Brief fingerprint is invalid.');
  tokenList(context.topic_tags, 'topic_tags');
  tokenList(context.moods, 'moods');
  tokenList(context.recent_base_template_ids ?? [], 'recent_base_template_ids');
  tokenList(context.used_signature_motif_ids ?? [], 'used_signature_motif_ids', { motif: true });
  if (typeof context.aspect_ratio !== 'string' || !/^[1-9][0-9]*:[1-9][0-9]*$/u.test(context.aspect_ratio)) fail('invalid_context', 'Aspect ratio is invalid.');
  if (!Number.isInteger(context.information_density) || context.information_density < 1 || context.information_density > 5) fail('invalid_context', 'Information density is invalid.');
  if (context.user_template_id !== undefined && (typeof context.user_template_id !== 'string' || !TOKEN.test(context.user_template_id))) fail('invalid_context', 'User template ID is invalid.');
  if (context.allow_conditional_compositing !== undefined && typeof context.allow_conditional_compositing !== 'boolean') fail('invalid_context', 'Conditional compositing option is invalid.');
  const layers = context.user_design_defined_layers ?? [];
  if (!Array.isArray(layers) || new Set(layers).size !== layers.length || layers.some((item) => !LAYERS.has(item))) fail('invalid_context', 'Protected user layers are invalid.');
  const borrows = context.requested_borrows ?? [];
  if (!Array.isArray(borrows) || borrows.length > policy.selection.max_borrowed_patterns) fail('invalid_context', 'Requested borrows exceed the policy limit.');
  const keys = new Set();
  for (const borrow of borrows) {
    if (!borrow || typeof borrow !== 'object' || Object.keys(borrow).sort().join(',') !== 'pattern_id,template_id' || !TOKEN.test(borrow.template_id ?? '') || !TOKEN.test(borrow.pattern_id ?? '')) fail('invalid_context', 'Requested borrow is invalid.');
    const key = `${borrow.template_id}:${borrow.pattern_id}`;
    if (keys.has(key)) fail('invalid_context', 'Requested borrows must be unique.');
    keys.add(key);
  }
}

function aggregateBriefSignals(document) {
  if (!document || document.schema_version !== 1 || !/^[0-9a-f]{64}$/u.test(document.briefs_sha256 ?? '') || !Array.isArray(document.briefs) || document.brief_count !== document.briefs.length || document.briefs.length === 0) fail('invalid_briefs', 'Validated director briefs are invalid.');
  const { briefs_sha256, ...core } = document;
  if (fingerprintValue(core) !== briefs_sha256) fail('briefs_tampered', 'Director brief fingerprint is invalid.');
  const semanticTypes = [];
  const mediaTypes = [];
  const outputModes = [];
  for (const brief of document.briefs) {
    const literal = ['user-material', 'verified-source'].includes(brief.evidence?.mode);
    if (brief.representation?.mode === 'documentary-evidence' && !literal) fail('evidence_conflict', 'Documentary representation lacks literal evidence.', brief.shot_id);
    if (literal && !['user-media', 'mixed'].includes(brief.asset_needs?.preferred_route)) fail('evidence_conflict', 'Literal evidence is not routed through registered user media.', brief.shot_id);
    const output = PRIMARY_TO_OUTPUT[brief.asset_needs?.primary_compositing];
    if (!output) fail('compositing_conflict', 'Primary composition cannot be matched to a template.', brief.shot_id);
    semanticTypes.push(...(SEMANTIC_SIGNALS[brief.semantic_type] ?? []), ...(REPRESENTATION_SIGNALS[brief.representation?.mode] ?? []));
    mediaTypes.push(...(ROUTE_MEDIA[brief.asset_needs?.preferred_route] ?? []));
    if (brief.representation?.mode === 'quantitative-chart') mediaTypes.push('data');
    if (['spatial-relation', 'process-system'].includes(brief.representation?.mode)) mediaTypes.push('diagram');
    outputModes.push(output);
  }
  return { semantic_types: unique(semanticTypes), media_types: unique(mediaTypes), output_modes: unique(outputModes) };
}

function supportFor(template, outputMode) {
  return template.compositing?.modes?.find((item) => item.mode === outputMode)?.support ?? 'prohibited';
}

function score(template, profile, signals, context, policy, eligibleStatuses) {
  const rejections = [];
  const reasons = [];
  if (!eligibleStatuses.includes(template.status)) rejections.push({ code: 'STATUS_INELIGIBLE', detail: template.status });
  if (context.user_template_id && context.user_template_id !== template.id) rejections.push({ code: 'NOT_EXPLICIT_TEMPLATE' });
  const avoidedTopics = intersection(context.topic_tags, profile.avoid_topic_tags);
  const avoidedMoods = intersection(context.moods, profile.avoid_moods);
  if (avoidedTopics.length) rejections.push({ code: 'TOPIC_AVOID', values: avoidedTopics });
  if (avoidedMoods.length) rejections.push({ code: 'MOOD_AVOID', values: avoidedMoods });
  for (const outputMode of signals.output_modes) {
    const support = supportFor(template, outputMode);
    if (support === 'prohibited') rejections.push({ code: 'COMPOSITING_PROHIBITED', mode: outputMode });
    if (support === 'conditional' && !context.allow_conditional_compositing) rejections.push({ code: 'COMPOSITING_OPT_IN_REQUIRED', mode: outputMode });
  }
  if (rejections.length) return { template, score: Number.NEGATIVE_INFINITY, reasons, rejections };

  let points = 0;
  const weights = policy.selection.weights;
  for (const [values, profileValues, weightKey, code] of [
    [context.topic_tags, profile.topic_tags, 'topic', 'TOPIC_MATCH'],
    [signals.semantic_types, profile.semantic_types, 'semantic_type', 'SEMANTIC_MATCH'],
    [context.moods, profile.moods, 'mood', 'MOOD_MATCH'],
    [signals.media_types, profile.media_types, 'media_type', 'MEDIA_MATCH'],
  ]) {
    const matches = intersection(values, profileValues);
    if (matches.length) {
      const add = weights[weightKey] * Math.min(matches.length, 2) / 2;
      points += add;
      reasons.push({ code, values: matches, points: add });
    }
  }
  const [minimum, maximum] = profile.density_range;
  const distance = context.information_density < minimum ? minimum - context.information_density : context.information_density > maximum ? context.information_density - maximum : 0;
  const densityPoints = distance === 0 ? weights.density_fit : -(distance * weights.density_fit / 2);
  points += densityPoints;
  reasons.push({ code: distance === 0 ? 'DENSITY_MATCH' : 'DENSITY_DISTANCE', points: densityPoints });
  if (template.verification.declared_aspect_ratios.includes(context.aspect_ratio)) { points += weights.aspect_ratio_verified; reasons.push({ code: 'ASPECT_DECLARED', points: weights.aspect_ratio_verified }); }
  for (const outputMode of signals.output_modes) {
    const support = supportFor(template, outputMode);
    const add = support === 'allowed' ? weights.allowed_compositing : weights.conditional_compositing;
    points += add; reasons.push({ code: support === 'allowed' ? 'COMPOSITING_ALLOWED' : 'COMPOSITING_CONDITIONAL', mode: outputMode, points: add });
  }
  const recentIndex = (context.recent_base_template_ids ?? []).indexOf(template.id);
  if (recentIndex >= 0) { const penalty = weights.recent_template_penalty / (recentIndex + 1); points -= penalty; reasons.push({ code: 'BASE_COOLDOWN', points: -penalty }); }
  const used = intersection(template.reuse_policy.signature_motifs.map((item) => item.motif_id), context.used_signature_motif_ids ?? []);
  if (used.length) { const penalty = weights.used_signature_motif_penalty * used.length; points -= penalty; reasons.push({ code: 'MOTIF_COOLDOWN', values: used, points: -penalty }); }
  if (context.user_template_id === template.id) { points += 1000; reasons.unshift({ code: 'USER_TEMPLATE_OVERRIDE', points: 1000 }); }
  return { template, score: points, reasons, rejections };
}

function resolveBorrows(context, base, templates, eligibleStatuses) {
  const accepted = [];
  const rejected = [];
  const baseConflicts = new Set(base.reuse_policy.conflicts_with.map((item) => item.template_id));
  const blockedMotifs = new Set([...base.reuse_policy.signature_motifs.map((item) => item.motif_id), ...(context.used_signature_motif_ids ?? [])]);
  for (const borrow of context.requested_borrows ?? []) {
    const source = templates.find((item) => item.id === borrow.template_id);
    const reasonCodes = [];
    if (!source) reasonCodes.push('SOURCE_MISSING');
    else {
      if (!eligibleStatuses.includes(source.status)) reasonCodes.push('SOURCE_STATUS_INELIGIBLE');
      if (source.id === base.id) reasonCodes.push('SOURCE_IS_BASE');
      if (baseConflicts.has(source.id) || source.reuse_policy.conflicts_with.some((item) => item.template_id === base.id)) reasonCodes.push('BASE_CONFLICT');
      const pattern = source.reuse_policy.borrowable_patterns.find((item) => item.pattern_id === borrow.pattern_id);
      if (!pattern) reasonCodes.push('PATTERN_UNDECLARED');
      else if (pattern.forbidden_with.some((motif) => blockedMotifs.has(motif))) reasonCodes.push('MOTIF_CONFLICT');
    }
    if (reasonCodes.length) rejected.push({ ...borrow, reason_codes: reasonCodes });
    else accepted.push(borrow);
  }
  return { accepted, rejected };
}

export function selectDirectorDesign(document, context, library, options = {}) {
  const { templates, policy } = library ?? {};
  if (!Array.isArray(templates) || templates.length === 0 || !policy?.selection || !Array.isArray(policy.profiles)) fail('invalid_library', 'Packaged design library is invalid.');
  validateContext(context, policy);
  if (context.briefs_sha256 !== document.briefs_sha256) fail('invalid_context', 'Context does not reference the supplied briefs.');
  const signals = aggregateBriefSignals(document);
  const protectedLayers = context.user_design_defined_layers ?? [];
  if (protectedLayers.length === LAYERS.size) {
    const core = { schema_version: 1, briefs_sha256: document.briefs_sha256, mode: 'user-design-native-supplement', base_template: null, fallback: 'hyperframes-native', protected_user_layers: protectedLayers, signals, borrowed_patterns: [], borrow_rejections: (context.requested_borrows ?? []).map((item) => ({ ...item, reason_codes: ['NO_BASE_TEMPLATE'] })) };
    return { ...core, selection_sha256: fingerprintValue(core) };
  }
  const profiles = new Map(policy.profiles.map((profile) => [profile.template_id, profile]));
  if (new Set(templates.map((item) => item.id)).size !== templates.length || templates.some((item) => !profiles.has(item.id))) fail('invalid_library', 'Packaged template profiles are incomplete.');
  const eligibleStatuses = options.allowDraft ? policy.selection.development_eligible_statuses : policy.selection.default_eligible_statuses;
  const candidates = templates.map((template) => score(template, profiles.get(template.id), signals, context, policy, eligibleStatuses)).sort((left, right) => right.score - left.score || left.template.id.localeCompare(right.template.id));
  const winner = candidates.find((item) => item.rejections.length === 0);
  if (!winner) {
    const core = { schema_version: 1, briefs_sha256: document.briefs_sha256, mode: protectedLayers.length ? 'user-design-native-supplement' : 'native-fallback', base_template: null, fallback: policy.selection.no_candidate_fallback, protected_user_layers: protectedLayers, signals, borrowed_patterns: [], borrow_rejections: [], candidate_rejections: candidates.map((item) => ({ template_id: item.template.id, reason_codes: item.rejections })) };
    return { ...core, selection_sha256: fingerprintValue(core) };
  }
  const borrows = resolveBorrows(context, winner.template, templates, eligibleStatuses);
  const core = { schema_version: 1, briefs_sha256: document.briefs_sha256, mode: protectedLayers.length ? 'supplement-user-design' : 'base-template', base_template: winner.template.id, template_status: winner.template.status, protected_user_layers: protectedLayers, signals, score: winner.score, reasons: winner.reasons, borrowed_patterns: borrows.accepted, borrow_rejections: borrows.rejected, alternatives: candidates.filter((item) => item !== winner && item.rejections.length === 0).slice(0, 3).map((item) => ({ template_id: item.template.id, score: item.score })), candidate_rejections: candidates.filter((item) => item.rejections.length).map((item) => ({ template_id: item.template.id, reason_codes: item.rejections })) };
  return { ...core, selection_sha256: fingerprintValue(core) };
}

export async function loadPackagedDesignLibrary(adapters = {}) {
  const readFile = adapters.readFile ?? fs.readFile;
  const readDir = adapters.readdir ?? fs.readdir;
  const base = new URL('../references/design-library/', import.meta.url);
  const policy = JSON.parse(await readFile(new URL('library-policy.json', base), 'utf8'));
  const directory = new URL('templates/', base);
  const names = (await readDir(directory)).filter((name) => name.endsWith('.json')).sort();
  const templates = await Promise.all(names.map(async (name) => JSON.parse(await readFile(new URL(name, directory), 'utf8'))));
  return { policy, templates };
}
