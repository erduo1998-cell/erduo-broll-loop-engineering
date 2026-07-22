import { createHash } from 'node:crypto';

const SHA256 = /^[0-9a-f]{64}$/u;
const HEX = /^#[0-9a-f]{6}$/iu;
const FRAME_ID = /^FRAME-[A-Z0-9-]{3,40}$/u;
const SHOT_ID = /^S\d{3}$/u;

const SPEAKER_PRESENCE = new Set(['single-speaker', 'multiple-speakers', 'none-visible']);
const BACKGROUND_COMPLEXITY = new Set(['plain', 'moderate', 'busy']);
const OVERLAY_CAPABILITY = new Set(['strong', 'limited', 'unsafe']);
const FEASIBILITY = new Set(['yes', 'conditional', 'no']);
const GRAMMAR_FAMILIES = new Set(['quote', 'data-relationship', 'contrast', 'case', 'process', 'emotion-turn', 'action-close', 'evidence', 'custom']);
const COMPOSITING_MODES = new Set(['fullscreen-broll', 'speaker-hard-alpha-overlay', 'speaker-split-screen', 'local-component', 'light-pass-support', 'speaker-context-return']);
const MATERIAL_ROLES = new Set(['background-hero', 'explanatory-media', 'generated-illustration', 'local-component', 'text-quote', 'chart-diagram', 'native-support', 'speaker-still']);
const ROUTES = new Set(['user-media', 'image-generation', 'pexels', 'hyperframes-native']);
const FUSION_MODES = new Set(['no-speaker-needed', 'context-match', 'speaker-overlay', 'split-screen', 'cutaway-return']);
const DIRECTOR_SECTIONS = new Set(['intent-card', 'visual-motif', 'scene-table', 'component-material-plan', 'taste-rationale', 'quality-self-check']);

function fingerprintValue(value) {
  const visit = (item) => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isFinite(item)) fail('invalid_hash_value', 'Cannot hash non-finite numbers.');
      return Number(item.toFixed(6));
    }
    if (!item || typeof item !== 'object') fail('invalid_hash_value', 'Cannot hash unsupported values.');
    if (Array.isArray(item)) return item.map(visit);
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, visit(item[key])]));
  };
  return createHash('sha256').update(JSON.stringify(visit(value)), 'utf8').digest('hex');
}

export class M10VisualContractError extends Error {
  constructor(code, message, shot) {
    super(message);
    this.name = 'M10VisualContractError';
    this.code = code;
    if (shot !== undefined) this.shot = shot;
  }
}

function fail(code, message, shot) {
  throw new M10VisualContractError(code, message, shot);
}

function exact(value, fields, code, message, shot) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, shot);
  const actual = JSON.stringify(Object.keys(value).sort());
  const expected = JSON.stringify([...fields].sort());
  if (actual !== expected) fail(code, message, shot);
}

function text(value, code, message, shot, max = 800) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(value)) fail(code, message, shot);
  return value.trim();
}

function textList(value, { code, message, shot, min = 0, max = 10, pattern } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail(code, message, shot);
  const normalized = value.map((item) => text(item, code, message, shot, 180));
  if (new Set(normalized).size !== normalized.length) fail(code, message, shot);
  if (pattern && normalized.some((item) => !pattern.test(item))) fail(code, message, shot);
  return normalized;
}

function enumValue(value, allowed, code, message, shot) {
  if (!allowed.has(value)) fail(code, message, shot);
  return value;
}

function number(value, code, message, shot, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) fail(code, message, shot);
  return value;
}

function normalizedBox(value, code, message, shot) {
  exact(value, ['x', 'y', 'width', 'height'], code, message, shot);
  const box = {
    x: number(value.x, code, message, shot, { max: 1 }),
    y: number(value.y, code, message, shot, { max: 1 }),
    width: number(value.width, code, message, shot, { min: 0.01, max: 1 }),
    height: number(value.height, code, message, shot, { min: 0.01, max: 1 }),
  };
  if (box.x + box.width > 1.001 || box.y + box.height > 1.001) fail(code, message, shot);
  return box;
}

function validatePlan(plan) {
  if (!plan || plan.schema_version !== 1 || !SHA256.test(plan.plan_sha256) || !Array.isArray(plan.shots) || plan.shots.length === 0 || plan.shot_count !== plan.shots.length) fail('invalid_shot_plan', 'Shot plan is invalid.');
  for (let index = 0; index < plan.shots.length; index += 1) {
    const expected = `S${String(index + 1).padStart(3, '0')}`;
    if (plan.shots[index].shot_id !== expected || !Number.isSafeInteger(plan.shots[index].duration_ms) || plan.shots[index].duration_ms <= 0) fail('invalid_shot_plan', 'Shot plan contains an invalid shot.');
  }
}

export function validateFrameFusionAnalysis(document) {
  exact(document, ['schema_version', 'srt_sha256', 'frames', 'global_constraints'], 'invalid_frame_fusion', 'Frame fusion document shape is invalid.');
  if (document.schema_version !== 1 || !SHA256.test(document.srt_sha256) || !Array.isArray(document.frames) || document.frames.length === 0) fail('invalid_frame_fusion', 'Frame fusion identity is invalid.');
  const frameIds = new Set();
  const normalizedFrames = document.frames.map((frame) => {
    exact(frame, ['frame_id', 'image_sha256', 'width', 'height', 'speaker_presence', 'speaker_box', 'safe_zones', 'lighting', 'palette', 'background', 'overlay_capability', 'fullscreen_cutaway', 'hard_alpha'], 'invalid_frame_fusion', 'Frame fusion frame shape is invalid.');
    if (!FRAME_ID.test(frame.frame_id) || frameIds.has(frame.frame_id) || !SHA256.test(frame.image_sha256)) fail('invalid_frame_fusion', 'Frame ID or image hash is invalid.');
    frameIds.add(frame.frame_id);
    if (!Number.isSafeInteger(frame.width) || !Number.isSafeInteger(frame.height) || frame.width < 320 || frame.height < 320) fail('invalid_frame_fusion', 'Frame dimensions are invalid.');
    const speakerPresence = enumValue(frame.speaker_presence, SPEAKER_PRESENCE, 'invalid_frame_fusion', 'Speaker presence is invalid.');
    const speakerBox = speakerPresence === 'none-visible' ? null : normalizedBox(frame.speaker_box, 'invalid_frame_fusion', 'Speaker box is invalid.');
    if (speakerPresence === 'none-visible' && frame.speaker_box !== null) fail('invalid_frame_fusion', 'Speaker box must be null when no speaker is visible.');
    const safeZones = textList(frame.safe_zones, { code: 'invalid_frame_fusion', message: 'Safe zones are invalid.', min: 1, max: 8 });
    exact(frame.lighting, ['brightness', 'contrast', 'direction', 'risk'], 'invalid_frame_fusion', 'Lighting shape is invalid.');
    const lighting = {
      brightness: text(frame.lighting.brightness, 'invalid_frame_fusion', 'Lighting brightness is invalid.', undefined, 120),
      contrast: text(frame.lighting.contrast, 'invalid_frame_fusion', 'Lighting contrast is invalid.', undefined, 120),
      direction: text(frame.lighting.direction, 'invalid_frame_fusion', 'Lighting direction is invalid.', undefined, 120),
      risk: text(frame.lighting.risk, 'invalid_frame_fusion', 'Lighting risk is invalid.', undefined, 240),
    };
    exact(frame.palette, ['dominant_hex', 'avoid_hex', 'notes'], 'invalid_frame_fusion', 'Palette shape is invalid.');
    const dominantHex = textList(frame.palette.dominant_hex, { code: 'invalid_frame_fusion', message: 'Dominant palette is invalid.', min: 1, max: 6, pattern: HEX });
    const avoidHex = textList(frame.palette.avoid_hex, { code: 'invalid_frame_fusion', message: 'Avoid palette is invalid.', max: 6, pattern: HEX });
    exact(frame.background, ['complexity', 'description', 'risk'], 'invalid_frame_fusion', 'Background shape is invalid.');
    const background = {
      complexity: enumValue(frame.background.complexity, BACKGROUND_COMPLEXITY, 'invalid_frame_fusion', 'Background complexity is invalid.'),
      description: text(frame.background.description, 'invalid_frame_fusion', 'Background description is invalid.', undefined, 240),
      risk: text(frame.background.risk, 'invalid_frame_fusion', 'Background risk is invalid.', undefined, 240),
    };
    exact(frame.overlay_capability, ['rating', 'usable_zones', 'reason'], 'invalid_frame_fusion', 'Overlay capability shape is invalid.');
    const overlayCapability = {
      rating: enumValue(frame.overlay_capability.rating, OVERLAY_CAPABILITY, 'invalid_frame_fusion', 'Overlay rating is invalid.'),
      usable_zones: textList(frame.overlay_capability.usable_zones, { code: 'invalid_frame_fusion', message: 'Overlay zones are invalid.', min: 1, max: 8 }),
      reason: text(frame.overlay_capability.reason, 'invalid_frame_fusion', 'Overlay reason is invalid.', undefined, 240),
    };
    exact(frame.fullscreen_cutaway, ['feasibility', 'return_rule'], 'invalid_frame_fusion', 'Fullscreen cutaway shape is invalid.');
    exact(frame.hard_alpha, ['feasibility', 'edge_risk'], 'invalid_frame_fusion', 'Hard alpha shape is invalid.');
    return {
      frame_id: frame.frame_id,
      image_sha256: frame.image_sha256,
      width: frame.width,
      height: frame.height,
      speaker_presence: speakerPresence,
      speaker_box: speakerBox,
      safe_zones: safeZones,
      lighting,
      palette: { dominant_hex: dominantHex, avoid_hex: avoidHex, notes: text(frame.palette.notes, 'invalid_frame_fusion', 'Palette notes are invalid.', undefined, 240) },
      background,
      overlay_capability: overlayCapability,
      fullscreen_cutaway: {
        feasibility: enumValue(frame.fullscreen_cutaway.feasibility, FEASIBILITY, 'invalid_frame_fusion', 'Fullscreen cutaway feasibility is invalid.'),
        return_rule: text(frame.fullscreen_cutaway.return_rule, 'invalid_frame_fusion', 'Fullscreen return rule is invalid.', undefined, 240),
      },
      hard_alpha: {
        feasibility: enumValue(frame.hard_alpha.feasibility, FEASIBILITY, 'invalid_frame_fusion', 'Hard alpha feasibility is invalid.'),
        edge_risk: text(frame.hard_alpha.edge_risk, 'invalid_frame_fusion', 'Hard alpha edge risk is invalid.', undefined, 240),
      },
    };
  });
  exact(document.global_constraints, ['design_priority', 'user_reference_policy', 'notes'], 'invalid_frame_fusion', 'Global fusion constraints are invalid.');
  if (document.global_constraints.design_priority !== 'user-reference-over-internal-reference-over-still-frame') fail('invalid_frame_fusion', 'Design priority must keep user references above internal references and still frames.');
  const core = {
    schema_version: 1,
    srt_sha256: document.srt_sha256,
    frame_count: normalizedFrames.length,
    frames: normalizedFrames,
    global_constraints: {
      design_priority: document.global_constraints.design_priority,
      user_reference_policy: text(document.global_constraints.user_reference_policy, 'invalid_frame_fusion', 'User reference policy is invalid.', undefined, 360),
      notes: text(document.global_constraints.notes, 'invalid_frame_fusion', 'Global notes are invalid.', undefined, 360),
    },
  };
  return { ...core, frame_fusion_sha256: fingerprintValue(core) };
}

function validateOptionalEnhancer(value) {
  if (value === undefined || value === null) return { used: false };
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.used !== 'boolean') fail('invalid_director_summary', 'Optional enhancer metadata is invalid.');
  if (value.used === false) {
    exact(value, ['used'], 'invalid_director_summary', 'Unused enhancer metadata must contain only used=false.');
    return { used: false };
  }
  exact(value, ['used', 'name', 'version', 'license_id', 'output_sha256', 'absorbed_sections'], 'invalid_director_summary', 'Used enhancer metadata is incomplete.');
  if (!SHA256.test(value.output_sha256)) fail('invalid_director_summary', 'Enhancer output hash is invalid.');
  return {
    used: true,
    name: text(value.name, 'invalid_director_summary', 'Enhancer name is invalid.', undefined, 120),
    version: text(value.version, 'invalid_director_summary', 'Enhancer version is invalid.', undefined, 80),
    license_id: text(value.license_id, 'invalid_director_summary', 'Enhancer license identifier is invalid.', undefined, 120),
    output_sha256: value.output_sha256,
    absorbed_sections: textList(value.absorbed_sections, { code: 'invalid_director_summary', message: 'Enhancer absorbed sections are invalid.', min: 1, max: 12, pattern: /^[a-z][a-z0-9-]*$/u }),
  };
}

export function validateDirectorSummary(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) fail('invalid_director_summary', 'Director summary shape is invalid.');
  const allowed = new Set(['method_id', 'absorbed_sections', 'adapter_boundaries', 'optional_enhancer']);
  if (Object.keys(summary).some((key) => !allowed.has(key)) || !['method_id', 'absorbed_sections', 'adapter_boundaries'].every((key) => key in summary)) fail('invalid_director_summary', 'Director summary shape is invalid.');
  if (summary.method_id !== 'erduo-director-method-v1') fail('invalid_director_summary', 'Director summary method ID is invalid.');
  const sections = textList(summary.absorbed_sections, { code: 'invalid_director_summary', message: 'Director absorbed sections are invalid.', min: DIRECTOR_SECTIONS.size, max: 12 });
  for (const required of DIRECTOR_SECTIONS) if (!sections.includes(required)) fail('invalid_director_summary', `Director summary is missing ${required}.`);
  exact(summary.adapter_boundaries, ['time_source', 'asset_policy_owner', 'final_delivery_owner', 'director_method_role'], 'invalid_director_summary', 'Director adapter boundaries are invalid.');
  if (summary.adapter_boundaries.time_source !== 'srt' || summary.adapter_boundaries.asset_policy_owner !== 'erduo-hyperframes-broll' || summary.adapter_boundaries.final_delivery_owner !== 'erduo-hyperframes-broll' || summary.adapter_boundaries.director_method_role !== 'bundled-directing-authority') fail('invalid_director_summary', 'Director adapter boundaries conflict with this product.');
  const core = {
    method_id: summary.method_id,
    absorbed_sections: sections,
    adapter_boundaries: summary.adapter_boundaries,
    optional_enhancer: validateOptionalEnhancer(summary.optional_enhancer),
  };
  return { ...core, director_summary_sha256: fingerprintValue(core) };
}

function validateMaterialRoles(value, shot) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 6) fail('missing_material_roles', 'Shot needs material roles.', shot);
  const roleNames = new Set();
  return value.map((role) => {
    exact(role, ['role', 'route_order', 'purpose', 'fallback_limit'], 'invalid_material_role', 'Material role shape is invalid.', shot);
    const roleName = enumValue(role.role, MATERIAL_ROLES, 'invalid_material_role', 'Material role is invalid.', shot);
    if (roleNames.has(roleName)) fail('invalid_material_role', 'Material roles must be unique per shot.', shot);
    roleNames.add(roleName);
    const routeOrder = textList(role.route_order, { code: 'invalid_material_role', message: 'Material route order is invalid.', shot, min: 1, max: 4 });
    if (routeOrder.some((route) => !ROUTES.has(route))) fail('invalid_material_role', 'Material route is invalid.', shot);
    return {
      role: roleName,
      route_order: routeOrder,
      purpose: text(role.purpose, 'invalid_material_role', 'Material purpose is invalid.', shot, 260),
      fallback_limit: text(role.fallback_limit, 'invalid_material_role', 'Material fallback limit is invalid.', shot, 260),
    };
  });
}

function validateReferenceUse(value, shot) {
  exact(value, ['user_reference_alignment', 'internal_atom_candidates', 'selection_policy'], 'invalid_reference_use', 'Reference use shape is invalid.', shot);
  const candidates = textList(value.internal_atom_candidates, { code: 'invalid_reference_use', message: 'Reference atom candidates are invalid.', shot, max: 8, pattern: /^[a-z][a-z0-9-]*\/[a-z0-9-]+$/u });
  const policy = text(value.selection_policy, 'invalid_reference_use', 'Reference selection policy is invalid.', shot, 360);
  if (/\b(?:must use|forced|mandatory template|强制使用|必须套用)\b/iu.test(policy)) fail('forced_reference', 'Internal references cannot be mandatory templates.', shot);
  return {
    user_reference_alignment: text(value.user_reference_alignment, 'invalid_reference_use', 'User reference alignment is invalid.', shot, 360),
    internal_atom_candidates: candidates,
    selection_policy: policy,
  };
}

function narrationCopied(screenText, narratedClaim) {
  if (screenText === null) return false;
  if (typeof screenText !== 'string') return true;
  const normalizedScreen = screenText.replace(/\s+/gu, '').toLowerCase();
  const normalizedClaim = narratedClaim.replace(/\s+/gu, '').toLowerCase();
  return normalizedScreen.length > 5 && normalizedClaim.includes(normalizedScreen) && normalizedScreen.length / Math.max(normalizedClaim.length, 1) > 0.55;
}

export function validateM10VisualContract(plan, frameFusion, directorSummary, document) {
  validatePlan(plan);
  const normalizedFusion = frameFusion.frame_fusion_sha256 ? frameFusion : validateFrameFusionAnalysis(frameFusion);
  const normalizedDirector = directorSummary.director_summary_sha256 ? directorSummary : validateDirectorSummary(directorSummary);
  exact(document, ['schema_version', 'plan_sha256', 'frame_fusion_sha256', 'director_summary_sha256', 'shots'], 'invalid_visual_contract', 'Visual contract document shape is invalid.');
  if (document.schema_version !== 1 || document.plan_sha256 !== plan.plan_sha256 || document.frame_fusion_sha256 !== normalizedFusion.frame_fusion_sha256 || document.director_summary_sha256 !== normalizedDirector.director_summary_sha256 || !Array.isArray(document.shots) || document.shots.length !== plan.shots.length) fail('invalid_visual_contract', 'Visual contract identity does not match upstream inputs.');
  const frameIds = new Set(normalizedFusion.frames.map((frame) => frame.frame_id));
  let nativePrimaryCount = 0;
  const normalizedShots = document.shots.map((shotContract, index) => {
    const shotNumber = index + 1;
    const expectedId = plan.shots[index].shot_id;
    exact(shotContract, ['shot_id', 'information_intent', 'visual_grammar', 'compositing', 'material_roles', 'component_intent', 'motion', 'frame_fusion', 'reference_use', 'quality_notes'], 'invalid_shot_contract', 'Shot visual contract shape is invalid.', shotNumber);
    if (shotContract.shot_id !== expectedId || !SHOT_ID.test(shotContract.shot_id)) fail('invalid_shot_contract', 'Shot contract order is invalid.', shotNumber);
    exact(shotContract.information_intent, ['narrated_claim', 'viewer_should_understand', 'readable_outcome'], 'invalid_information_intent', 'Information intent shape is invalid.', shotNumber);
    const narratedClaim = text(shotContract.information_intent.narrated_claim, 'invalid_information_intent', 'Narrated claim is invalid.', shotNumber);
    exact(shotContract.visual_grammar, ['family', 'agent_choice_reason', 'screen_text'], 'invalid_visual_grammar', 'Visual grammar shape is invalid.', shotNumber);
    const family = enumValue(shotContract.visual_grammar.family, GRAMMAR_FAMILIES, 'invalid_visual_grammar', 'Visual grammar family is invalid.', shotNumber);
    const screenText = shotContract.visual_grammar.screen_text;
    if (screenText !== null) text(screenText, 'invalid_visual_grammar', 'Screen text is invalid.', shotNumber, 80);
    if (narrationCopied(screenText, narratedClaim)) fail('copied_subtitle_card', 'Screen text mechanically copies the narration.', shotNumber);
    exact(shotContract.compositing, ['mode', 'reason'], 'invalid_compositing', 'Compositing shape is invalid.', shotNumber);
    const materialRoles = validateMaterialRoles(shotContract.material_roles, shotNumber);
    if (materialRoles[0].route_order[0] === 'hyperframes-native') nativePrimaryCount += 1;
    exact(shotContract.component_intent, ['needed', 'description', 'native_scope'], 'invalid_component_intent', 'Component intent shape is invalid.', shotNumber);
    if (typeof shotContract.component_intent.needed !== 'boolean') fail('invalid_component_intent', 'Component need flag is invalid.', shotNumber);
    if (shotContract.component_intent.native_scope === 'whole-film-default') fail('native_default', 'Native graphics cannot be a whole-film default.', shotNumber);
    exact(shotContract.motion, ['key_action', 'transition_intent', 'result_hold'], 'invalid_motion', 'Motion shape is invalid.', shotNumber);
    exact(shotContract.frame_fusion, ['mode', 'frame_ids', 'constraints_used', 'decision_reason'], 'invalid_frame_fusion_decision', 'Shot frame fusion decision shape is invalid.', shotNumber);
    const fusionMode = enumValue(shotContract.frame_fusion.mode, FUSION_MODES, 'invalid_frame_fusion_decision', 'Shot fusion mode is invalid.', shotNumber);
    const shotFrameIds = textList(shotContract.frame_fusion.frame_ids, { code: 'invalid_frame_fusion_decision', message: 'Shot frame IDs are invalid.', shot: shotNumber, max: 4, pattern: FRAME_ID });
    if (fusionMode !== 'no-speaker-needed' && shotFrameIds.length === 0) fail('missing_frame_fusion_decision', 'Shot needs frame IDs for the chosen fusion mode.', shotNumber);
    for (const frameId of shotFrameIds) if (!frameIds.has(frameId)) fail('invalid_frame_fusion_decision', 'Shot references an unknown frame ID.', shotNumber);
    const constraintsUsed = textList(shotContract.frame_fusion.constraints_used, { code: 'missing_frame_fusion_decision', message: 'Shot needs concrete fusion constraints.', shot: shotNumber, min: 1, max: 8 });
    exact(shotContract.quality_notes, ['not_subtitle_burn', 'not_native_default', 'not_media_only_pass', 'judgment_note'], 'invalid_quality_notes', 'Quality notes shape is invalid.', shotNumber);
    if (shotContract.quality_notes.not_subtitle_burn !== true || shotContract.quality_notes.not_native_default !== true || shotContract.quality_notes.not_media_only_pass !== true) fail('invalid_quality_notes', 'Quality notes must explicitly reject known failure modes.', shotNumber);
    return {
      shot_id: expectedId,
      duration_ms: plan.shots[index].duration_ms,
      information_intent: {
        narrated_claim: narratedClaim,
        viewer_should_understand: text(shotContract.information_intent.viewer_should_understand, 'invalid_information_intent', 'Viewer understanding is invalid.', shotNumber, 360),
        readable_outcome: text(shotContract.information_intent.readable_outcome, 'invalid_information_intent', 'Readable outcome is invalid.', shotNumber, 360),
      },
      visual_grammar: {
        family,
        agent_choice_reason: text(shotContract.visual_grammar.agent_choice_reason, 'invalid_visual_grammar', 'Visual grammar reason is invalid.', shotNumber, 360),
        screen_text: screenText,
      },
      compositing: {
        mode: enumValue(shotContract.compositing.mode, COMPOSITING_MODES, 'invalid_compositing', 'Compositing mode is invalid.', shotNumber),
        reason: text(shotContract.compositing.reason, 'invalid_compositing', 'Compositing reason is invalid.', shotNumber, 360),
      },
      material_roles: materialRoles,
      component_intent: {
        needed: shotContract.component_intent.needed,
        description: text(shotContract.component_intent.description, 'invalid_component_intent', 'Component description is invalid.', shotNumber, 360),
        native_scope: text(shotContract.component_intent.native_scope, 'invalid_component_intent', 'Native scope is invalid.', shotNumber, 220),
      },
      motion: {
        key_action: text(shotContract.motion.key_action, 'invalid_motion', 'Key action is invalid.', shotNumber, 260),
        transition_intent: text(shotContract.motion.transition_intent, 'invalid_motion', 'Transition intent is invalid.', shotNumber, 260),
        result_hold: text(shotContract.motion.result_hold, 'invalid_motion', 'Result hold is invalid.', shotNumber, 260),
      },
      frame_fusion: {
        mode: fusionMode,
        frame_ids: shotFrameIds,
        constraints_used: constraintsUsed,
        decision_reason: text(shotContract.frame_fusion.decision_reason, 'invalid_frame_fusion_decision', 'Fusion decision reason is invalid.', shotNumber, 360),
      },
      reference_use: validateReferenceUse(shotContract.reference_use, shotNumber),
      quality_notes: {
        not_subtitle_burn: true,
        not_native_default: true,
        not_media_only_pass: true,
        judgment_note: text(shotContract.quality_notes.judgment_note, 'invalid_quality_notes', 'Judgment note is invalid.', shotNumber, 360),
      },
    };
  });
  if (nativePrimaryCount === normalizedShots.length) fail('native_default', 'A whole film cannot use hyperframes-native as every primary route.');
  const core = {
    schema_version: 1,
    plan_sha256: plan.plan_sha256,
    frame_fusion_sha256: normalizedFusion.frame_fusion_sha256,
    director_summary_sha256: normalizedDirector.director_summary_sha256,
    shot_count: normalizedShots.length,
    shots: normalizedShots,
  };
  return { ...core, visual_contract_sha256: fingerprintValue(core) };
}
