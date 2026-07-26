import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprintRenderValue, fingerprintValue } from './state.mjs';

const TOKEN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MOTIF = /^MOTIF-[A-Z0-9-]+$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const SOURCE_ID = /^[A-Z][A-Z0-9-]{2,63}$/u;
const GIT_COMMIT = /^[0-9a-f]{40}$/u;
const NATIVE_SOURCE_BINDINGS = [
  { artifact_id: 'native-fallback-contract', relative_path: 'references/native-fallback-contract.md' },
  { artifact_id: 'native-fallback-compiler', relative_path: 'scripts/native-fallback.mjs' },
  { artifact_id: 'visual-grammar-compiler-contract', relative_path: 'references/visual-grammar-compiler-contract.md' },
];
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
  'user-media': ['photo'], 'image-generation': ['photo'], pexels: ['photo'],
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

function validateSourceRegistry(templates, registry) {
  if (!registry || registry.schema_version !== '1.0.0' || !Array.isArray(registry.sources) || registry.sources.length === 0 || !Array.isArray(registry.duplicate_groups)) fail('invalid_library', 'Packaged source registry is invalid.');
  const sources = new Map();
  for (const source of registry.sources) {
    const roles = source?.allowed_evidence_roles;
    const pinFields = ['repository', 'audited_commit', 'license_id', 'license_path', 'license_sha256'];
    const hasPin = pinFields.some((field) => source?.[field] !== undefined);
    const pinValid = !hasPin || (/^https:\/\/github\.com\//u.test(source.repository ?? '') && GIT_COMMIT.test(source.audited_commit ?? '') && typeof source.license_id === 'string' && source.license_id.length > 0 && typeof source.license_path === 'string' && source.license_path.length > 0 && !source.license_path.startsWith('/') && !source.license_path.split(/[\\/]/u).includes('..') && SHA256.test(source.license_sha256 ?? ''));
    if (!SOURCE_ID.test(source?.source_id ?? '') || sources.has(source.source_id) || !SHA256.test(source.content_hash ?? '') || !['A', 'B', 'C'].includes(source.authority) || !Array.isArray(roles) || roles.length === 0 || new Set(roles).size !== roles.length || roles.some((role) => typeof role !== 'string' || !TOKEN.test(role)) || typeof source.evidence_ref !== 'string' || source.evidence_ref.length === 0 || !pinValid) fail('invalid_library', 'Packaged source registry record is invalid.');
    sources.set(source.source_id, source);
  }
  for (const template of templates) {
    for (const record of template.provenance?.records ?? []) {
      const source = sources.get(record.source_id);
      if (!source || source.content_hash !== record.content_hash || !source.allowed_evidence_roles.includes(record.evidence_role)) fail('invalid_library', 'Template provenance is not bound to the packaged source registry.');
    }
  }
}

function normalizedPackagePath(value) {
  return typeof value === 'string' && value.length > 0 && !value.includes('\\') && !path.posix.isAbsolute(value) && path.posix.normalize(value) === value && value !== '.' && !value.startsWith('../') && !value.includes('/../');
}

function sourceBundleFingerprint(sourceRefs) {
  return fingerprintRenderValue({
    source_refs: [...sourceRefs].sort((left, right) => left.artifact_id.localeCompare(right.artifact_id)),
  });
}

export function nativeCompilerSourceBundleSha256(compiler) {
  if (!compiler?.provenance || !Array.isArray(compiler.provenance.source_refs)) fail('invalid_library', 'Packaged native compiler source bundle is invalid.');
  return sourceBundleFingerprint(compiler.provenance.source_refs);
}

function validateNativeBaseCompiler(compiler) {
  const keys = ['adaptation_knobs', 'artifact_type', 'artifact_version', 'catalog_scope', 'compiler_contract', 'hard_rules', 'id', 'native_compiler_source_bundle_sha256', 'provenance', 'schema_version', 'status', 'summary'];
  if (!compiler || typeof compiler !== 'object' || Array.isArray(compiler) || JSON.stringify(Object.keys(compiler).sort()) !== JSON.stringify(keys)) fail('invalid_library', 'Packaged native base compiler is invalid.');
  if (compiler.schema_version !== 1 || compiler.artifact_type !== 'native-base-compiler' || compiler.artifact_version !== 1 || compiler.id !== 'hyperframes-native' || compiler.status !== 'built-in' || compiler.catalog_scope !== 'non-template' || typeof compiler.summary !== 'string' || compiler.summary.length === 0 || compiler.compiler_contract !== 'references/native-fallback-contract.md#hyperframes-native-auxiliary-contract' || !SHA256.test(compiler.native_compiler_source_bundle_sha256 ?? '')) fail('invalid_library', 'Packaged native base compiler identity is invalid.');
  const provenanceKeys = ['evidence_role', 'source_kind', 'source_refs'];
  if (!compiler.provenance || JSON.stringify(Object.keys(compiler.provenance).sort()) !== JSON.stringify(provenanceKeys) || compiler.provenance.source_kind !== 'packaged-native-compiler' || compiler.provenance.evidence_role !== 'built-in-runtime-contract' || !Array.isArray(compiler.provenance.source_refs) || compiler.provenance.source_refs.length !== NATIVE_SOURCE_BINDINGS.length) fail('invalid_library', 'Packaged native base compiler provenance is invalid.');
  for (let index = 0; index < NATIVE_SOURCE_BINDINGS.length; index += 1) {
    const reference = compiler.provenance.source_refs[index];
    const expected = NATIVE_SOURCE_BINDINGS[index];
    if (!reference || JSON.stringify(Object.keys(reference).sort()) !== JSON.stringify(['artifact_id', 'relative_path', 'sha256', 'size_bytes']) || reference.artifact_id !== expected.artifact_id || reference.relative_path !== expected.relative_path || !TOKEN.test(reference.artifact_id ?? '') || !normalizedPackagePath(reference.relative_path) || !SHA256.test(reference.sha256 ?? '') || !Number.isSafeInteger(reference.size_bytes) || reference.size_bytes < 1) fail('invalid_library', 'Packaged native base compiler source reference is invalid.');
  }
  if (nativeCompilerSourceBundleSha256(compiler) !== compiler.native_compiler_source_bundle_sha256) fail('invalid_library', 'Packaged native compiler source bundle fingerprint is invalid.');
  if (!Array.isArray(compiler.hard_rules) || compiler.hard_rules.length < 1 || new Set(compiler.hard_rules).size !== compiler.hard_rules.length || compiler.hard_rules.some((rule) => typeof rule !== 'string' || rule.length === 0)) fail('invalid_library', 'Packaged native base compiler rules are invalid.');
  if (!Array.isArray(compiler.adaptation_knobs) || compiler.adaptation_knobs.length < 1 || compiler.adaptation_knobs.length > 9) fail('invalid_library', 'Packaged native base compiler axes are invalid.');
  const axisIds = new Set();
  for (const knob of compiler.adaptation_knobs) {
    if (!knob || JSON.stringify(Object.keys(knob).sort()) !== JSON.stringify(['constraints', 'id', 'options', 'purpose']) || !TOKEN.test(knob.id ?? '') || axisIds.has(knob.id) || typeof knob.purpose !== 'string' || knob.purpose.length === 0 || !Array.isArray(knob.options) || knob.options.length < 2 || knob.options.length > 16 || new Set(knob.options).size !== knob.options.length || knob.options.some((option) => typeof option !== 'string' || !TOKEN.test(option)) || !Array.isArray(knob.constraints) || knob.constraints.length < 1 || new Set(knob.constraints).size !== knob.constraints.length || knob.constraints.some((constraint) => typeof constraint !== 'string' || constraint.length === 0)) fail('invalid_library', 'Packaged native base compiler axis is invalid.');
    axisIds.add(knob.id);
  }
}

export function designLibrarySnapshotSha256(library) {
  const { templates, policy, sourceRegistry, nativeBaseCompiler } = library ?? {};
  if (!Array.isArray(templates) || templates.length === 0 || !policy?.selection || !sourceRegistry || !nativeBaseCompiler) fail('invalid_library', 'Packaged design library is invalid.');
  validateSourceRegistry(templates, sourceRegistry);
  validateNativeBaseCompiler(nativeBaseCompiler);
  return fingerprintRenderValue({
    policy,
    source_registry: sourceRegistry,
    templates: [...templates].sort((left, right) => String(left?.id ?? '').localeCompare(String(right?.id ?? ''))),
    native_base_compiler: nativeBaseCompiler,
    native_compiler_source_bundle_sha256: nativeBaseCompiler.native_compiler_source_bundle_sha256,
  });
}

async function resolveSafePackageRoot(packageRoot, { lstat, realpath }) {
  if (typeof packageRoot !== 'string' || packageRoot.length === 0) fail('invalid_library', 'Packaged design library root is invalid.');
  const lexicalRoot = path.resolve(packageRoot);
  let rootStat;
  let resolvedRoot;
  try {
    const filesystemRoot = path.parse(lexicalRoot).root;
    let cursor = filesystemRoot;
    for (const component of path.relative(filesystemRoot, lexicalRoot).split(path.sep).filter(Boolean)) {
      cursor = path.join(cursor, component);
      const componentStat = await lstat(cursor);
      if (componentStat.isSymbolicLink()) fail('native_source_root_symlink', 'Packaged design library root traverses a symbolic link.');
    }
    rootStat = await lstat(lexicalRoot);
    resolvedRoot = await realpath(lexicalRoot);
  } catch (error) {
    if (error instanceof DesignSelectionError) throw error;
    fail('native_source_root_invalid', 'Packaged design library root cannot be safely resolved.');
  }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('native_source_root_invalid', 'Packaged design library root must be a real directory.');
  return { lexicalRoot, resolvedRoot };
}

async function verifyNativeCompilerSourceBytes(compiler, packageRoot, adapters = {}) {
  const lstat = adapters.lstat ?? fs.lstat;
  const realpath = adapters.realpath ?? fs.realpath;
  const readFile = adapters.readFile ?? fs.readFile;
  const { lexicalRoot, resolvedRoot } = await resolveSafePackageRoot(packageRoot, { lstat, realpath });
  for (const reference of compiler.provenance.source_refs) {
    if (!normalizedPackagePath(reference.relative_path)) fail('native_source_path_invalid', 'Native compiler source path is invalid.');
    const target = path.resolve(lexicalRoot, ...reference.relative_path.split('/'));
    const relativeTarget = path.relative(lexicalRoot, target);
    if (relativeTarget === '..' || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) fail('native_source_path_escape', 'Native compiler source path escapes the package root.');
    let cursor = lexicalRoot;
    let stat;
    for (const component of reference.relative_path.split('/')) {
      cursor = path.join(cursor, component);
      try {
        stat = await lstat(cursor);
      } catch {
        fail('native_source_missing', 'Native compiler source artifact is missing.');
      }
      if (stat.isSymbolicLink()) fail('native_source_symlink', 'Native compiler source path traverses a symbolic link.');
    }
    if (!stat?.isFile() || stat.isSymbolicLink()) fail('native_source_not_regular', 'Native compiler source artifact is not a regular file.');
    if (stat.size !== reference.size_bytes) fail('native_source_size_mismatch', 'Native compiler source artifact size does not match its binding.');
    let resolvedTarget;
    try {
      resolvedTarget = await realpath(target);
    } catch {
      fail('native_source_missing', 'Native compiler source artifact cannot be resolved.');
    }
    if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) fail('native_source_realpath_escape', 'Native compiler source artifact escapes the real package root.');
    let bytes;
    try {
      bytes = await readFile(resolvedTarget);
    } catch {
      fail('native_source_missing', 'Native compiler source artifact cannot be read.');
    }
    const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    if (buffer.length !== reference.size_bytes) fail('native_source_size_mismatch', 'Native compiler source artifact byte size does not match its binding.');
    if (createHash('sha256').update(buffer).digest('hex') !== reference.sha256) fail('native_source_hash_mismatch', 'Native compiler source artifact hash does not match its binding.');
  }
}

function score(template, profile, signals, context, policy, eligibleStatuses, calibrationOnlyTemplateIds) {
  const rejections = [];
  const reasons = [];
  const calibrationOnly = calibrationOnlyTemplateIds.has(template.id);
  if (!eligibleStatuses.includes(template.status)) rejections.push({ code: 'STATUS_INELIGIBLE', detail: template.status });
  if (calibrationOnly && context.user_template_id !== template.id) rejections.push({ code: 'CALIBRATION_EXPLICIT_SELECTION_REQUIRED' });
  if (context.user_template_id && context.user_template_id !== template.id) rejections.push({ code: 'NOT_EXPLICIT_TEMPLATE' });
  if (calibrationOnly && !template.verification?.declared_aspect_ratios?.includes(context.aspect_ratio)) rejections.push({ code: 'CALIBRATION_ASPECT_UNSUPPORTED', aspect_ratio: context.aspect_ratio });
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
  const { templates, policy, sourceRegistry, nativeBaseCompiler } = library ?? {};
  if (!Array.isArray(templates) || templates.length === 0 || !policy?.selection || !Array.isArray(policy.profiles) || !sourceRegistry || !nativeBaseCompiler) fail('invalid_library', 'Packaged design library is invalid.');
  validateSourceRegistry(templates, sourceRegistry);
  validateNativeBaseCompiler(nativeBaseCompiler);
  const librarySnapshotSha256 = designLibrarySnapshotSha256(library);
  const nativeBaseSha256 = fingerprintRenderValue(nativeBaseCompiler);
  const nativeSourceBundleSha256 = nativeBaseCompiler.native_compiler_source_bundle_sha256;
  validateContext(context, policy);
  if (context.briefs_sha256 !== document.briefs_sha256) fail('invalid_context', 'Context does not reference the supplied briefs.');
  const signals = aggregateBriefSignals(document);
  const protectedLayers = context.user_design_defined_layers ?? [];
  if (protectedLayers.length === LAYERS.size) {
    const core = { schema_version: 1, briefs_sha256: document.briefs_sha256, mode: 'user-design-native-supplement', base_template: nativeBaseCompiler.id, base_template_sha256: nativeBaseSha256, design_library_snapshot_sha256: librarySnapshotSha256, native_compiler_source_bundle_sha256: nativeSourceBundleSha256, visual_grammar_compilation: { eligible: true, guard_code: 'NATIVE_SUPPORT_ONLY_USER_LAYERS_PROTECTED' }, template_status: nativeBaseCompiler.status, fallback: 'hyperframes-native', protected_user_layers: protectedLayers, signals, borrowed_patterns: [], borrow_rejections: (context.requested_borrows ?? []).map((item) => ({ ...item, reason_codes: ['NATIVE_SUPPORT_ONLY'] })) };
    return { ...core, selection_sha256: fingerprintValue(core) };
  }
  const profiles = new Map(policy.profiles.map((profile) => [profile.template_id, profile]));
  if (new Set(templates.map((item) => item.id)).size !== templates.length || templates.some((item) => !profiles.has(item.id))) fail('invalid_library', 'Packaged template profiles are incomplete.');
  const calibrationIds = policy.selection.calibration_only_template_ids ?? [];
  if (!Array.isArray(calibrationIds) || new Set(calibrationIds).size !== calibrationIds.length || calibrationIds.some((item) => typeof item !== 'string' || !TOKEN.test(item) || !templates.some((template) => template.id === item))) fail('invalid_library', 'Calibration-only template policy is invalid.');
  const calibrationOnlyTemplateIds = new Set(calibrationIds);
  const eligibleStatuses = options.allowDraft ? policy.selection.development_eligible_statuses : policy.selection.default_eligible_statuses;
  const candidates = templates.map((template) => score(template, profiles.get(template.id), signals, context, policy, eligibleStatuses, calibrationOnlyTemplateIds)).sort((left, right) => right.score - left.score || left.template.id.localeCompare(right.template.id));
  const winner = candidates.find((item) => item.rejections.length === 0);
  if (!winner) {
    const core = { schema_version: 1, briefs_sha256: document.briefs_sha256, mode: protectedLayers.length ? 'user-design-native-supplement' : 'native-fallback', base_template: nativeBaseCompiler.id, base_template_sha256: nativeBaseSha256, design_library_snapshot_sha256: librarySnapshotSha256, native_compiler_source_bundle_sha256: nativeSourceBundleSha256, visual_grammar_compilation: { eligible: true, guard_code: protectedLayers.length ? 'NATIVE_SUPPORT_ONLY_USER_LAYERS_PROTECTED' : 'NATIVE_BASE_COMPILER_BOUND' }, template_status: nativeBaseCompiler.status, fallback: policy.selection.no_candidate_fallback, protected_user_layers: protectedLayers, signals, borrowed_patterns: [], borrow_rejections: [], candidate_rejections: candidates.map((item) => ({ template_id: item.template.id, reason_codes: item.rejections })) };
    return { ...core, selection_sha256: fingerprintValue(core) };
  }
  const borrows = resolveBorrows(context, winner.template, templates, eligibleStatuses);
  const core = { schema_version: 1, briefs_sha256: document.briefs_sha256, mode: protectedLayers.length ? 'supplement-user-design' : 'base-template', base_template: winner.template.id, base_template_sha256: fingerprintRenderValue(winner.template), design_library_snapshot_sha256: librarySnapshotSha256, native_compiler_source_bundle_sha256: nativeSourceBundleSha256, visual_grammar_compilation: { eligible: true, guard_code: 'BASE_TEMPLATE_BOUND' }, template_status: winner.template.status, protected_user_layers: protectedLayers, signals, score: winner.score, reasons: winner.reasons, borrowed_patterns: borrows.accepted, borrow_rejections: borrows.rejected, alternatives: candidates.filter((item) => item !== winner && item.rejections.length === 0).slice(0, 3).map((item) => ({ template_id: item.template.id, score: item.score })), candidate_rejections: candidates.filter((item) => item.rejections.length).map((item) => ({ template_id: item.template.id, reason_codes: item.rejections })) };
  return { ...core, selection_sha256: fingerprintValue(core) };
}

export function replayDirectorDesignSelection(document, context, library, selection, options = {}) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection) || !SHA256.test(selection.selection_sha256 ?? '')) fail('invalid_selection', 'Design selection artifact is invalid.');
  const { selection_sha256: declaredSha256, ...core } = selection;
  try {
    if (fingerprintValue(core) !== declaredSha256) fail('selection_tampered', 'Design selection fingerprint is invalid.');
  } catch (error) {
    if (error instanceof DesignSelectionError) throw error;
    fail('selection_tampered', 'Design selection cannot be canonically fingerprinted.');
  }
  const replay = selectDirectorDesign(document, context, library, options);
  if (fingerprintRenderValue(replay) !== fingerprintRenderValue(selection)) fail('selection_replay_mismatch', 'Design selection does not replay from the supplied briefs, context, and library.');
  return replay;
}

export async function loadPackagedDesignLibrary(adapters = {}) {
  const readFile = adapters.readFile ?? fs.readFile;
  const readDir = adapters.readdir ?? fs.readdir;
  const packageRoot = adapters.packageRoot ?? fileURLToPath(new URL('../', import.meta.url));
  await resolveSafePackageRoot(packageRoot, { lstat: adapters.lstat ?? fs.lstat, realpath: adapters.realpath ?? fs.realpath });
  const base = path.join(path.resolve(packageRoot), 'references', 'design-library');
  const policy = JSON.parse(await readFile(path.join(base, 'library-policy.json'), 'utf8'));
  const sourceRegistry = JSON.parse(await readFile(path.join(base, 'source-registry.json'), 'utf8'));
  const nativeBaseCompiler = JSON.parse(await readFile(path.join(base, 'native-base-compiler.json'), 'utf8'));
  const directory = path.join(base, 'templates');
  const names = (await readDir(directory)).filter((name) => name.endsWith('.json')).sort();
  const templates = await Promise.all(names.map(async (name) => JSON.parse(await readFile(path.join(directory, name), 'utf8'))));
  validateSourceRegistry(templates, sourceRegistry);
  validateNativeBaseCompiler(nativeBaseCompiler);
  await verifyNativeCompilerSourceBytes(nativeBaseCompiler, packageRoot, adapters);
  return { policy, templates, sourceRegistry, nativeBaseCompiler };
}
