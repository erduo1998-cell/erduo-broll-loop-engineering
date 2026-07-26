import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseSrt } from './parse-srt.mjs';
import { probeMedia } from './probe-media.mjs';
import {
  AUTHORING_TOPOLOGY_ID,
  PIPELINE_CONTRACT_VERSION,
  VALIDATION_POLICY_ID,
  fingerprintV3Value,
} from './validate-production-contract.mjs';
import { createValidationPolicy } from './test-support-script-only-v3-runtime.mjs';

const COMPONENT_IDS = Object.freeze([
  'hero-stat',
  'chapter-card',
  'comparison',
  'pipeline',
  'topology',
  'terminal-form-table',
  'device-metaphor',
  'chart',
  'cta',
  'ordinary-media-frame',
]);

const hash = (value) => fingerprintV3Value(value);
const withHash = (value, field) => ({ ...value, [field]: hash(value) });

function cueId(index) {
  return `Q${String(index + 1).padStart(3, '0')}`;
}

function shotId(index) {
  return `S${String(index + 1).padStart(3, '0')}`;
}

function timestamp(milliseconds) {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    `${String(seconds).padStart(2, '0')},${String(millis).padStart(3, '0')}`,
  ].join(':');
}

function createSrtBytes(shotCount) {
  const blocks = Array.from({ length: shotCount }, (_, index) => {
    const start = index * 4000;
    const end = start + 4000;
    return [
      String(index + 1),
      `${timestamp(start)} --> ${timestamp(end)}`,
      `第 ${index + 1} 个输入经过规则节点后得到可辨识结果。`,
    ].join('\n');
  });
  return Buffer.from(`${blocks.join('\n\n')}\n`, 'utf8');
}

function createParsedSrt(srtBytes) {
  const parsed = parseSrt(srtBytes);
  return {
    schema_version: 1,
    artifact_kind: 'parsed-srt',
    cues: parsed.cues.map((cue, index) => ({
      cue_id: cueId(index),
      start_ms: cue.start_ms,
      end_ms: cue.end_ms,
      text: cue.text,
    })),
  };
}

function createCreativeDirective({ nextShotId = null } = {}) {
  return withHash({
    primary_visual_decision: '让结果对象承担第一阅读焦点，并保留标题安全区作为阅读与交接责任。',
    attention_plan: {
      primary_focus_ref: 'semantic-object:qualified-result',
      reading_order_refs: [
        'semantic-object:qualified-result',
        'semantic-object:rule-engine',
      ],
      negative_space_region_refs: ['safe-region:title-safe'],
      transition_exit_ref: nextShotId
        ? `next-shot:${nextShotId}` : 'semantic-object:qualified-result',
    },
    modules: [],
  }, 'creative_directive_sha256');
}

function createShot(index, shotCount) {
  const id = shotId(index);
  const startMs = index * 4000;
  const endMs = startMs + 4000;
  const odd = index % 2 === 0;
  const actionId = `route-input-${id.toLowerCase()}`;
  const resultElementId = `${id.toLowerCase()}-result-label`;
  const prefix = `#${id.toLowerCase()}`;
  return {
    shot_id: id,
    chapter_id: 'C01',
    shot_kind: 'process',
    start_ms: startMs,
    end_ms: endMs,
    duration_ms: endMs - startMs,
    semantic_claim: `第 ${index + 1} 个输入经过规则节点后得到可辨识结果。`,
    creative_directive: createCreativeDirective({
      nextShotId: index === shotCount - 1 ? null : shotId(index + 1),
    }),
    cognitive_action: {
      primary_action_id: actionId,
      actions: [{
        action_id: actionId,
        verb: 'route',
        actor_object_id: 'lead-packet',
        target_object_ids: ['qualified-result'],
      }],
    },
    visual_structure: odd ? '横向三节点因果管线。' : '纵向输入与结果对比。',
    semantic_objects: [
      {
        object_id: 'lead-packet',
        continuity_id: 'lead-packet',
        semantic_role: 'input',
        initial_state: 'unqualified',
        result_state: 'qualified',
      },
      {
        object_id: 'rule-engine',
        continuity_id: 'rule-engine',
        semantic_role: 'operator',
        initial_state: 'idle',
        result_state: 'applied',
      },
      {
        object_id: 'qualified-result',
        continuity_id: 'qualified-result',
        semantic_role: 'result',
        initial_state: 'unqualified',
        result_state: 'qualified',
      },
    ],
    spatial_relation: {
      relation_id: `route-${id.toLowerCase()}`,
      subject_object_id: 'lead-packet',
      predicate: 'passes-through',
      object_id: 'rule-engine',
      direction: 'left-to-right',
    },
    input_state: {
      object_id: 'lead-packet',
      property: 'qualification',
      value: 'unqualified',
    },
    operation: {
      action_id: actionId,
      actor_object_id: 'lead-packet',
      target_object_ids: ['qualified-result'],
      property: 'qualification',
      from: 'unqualified',
      to: 'qualified',
    },
    result_state: {
      object_id: 'qualified-result',
      property: 'qualification',
      value: 'qualified',
      semantic_carrier_element_id: resultElementId,
    },
    readability_class: 'ordinary',
    hold_window: { from_ms: startMs + 1800, to_ms: startMs + 3600 },
    transition_owner: index === shotCount - 1 ? 'host' : 'next-shot',
    callback_of: null,
    payoff_shot_id: null,
    text_roles: ['display', 'body', 'status'],
    text_elements: [
      {
        element_id: resultElementId,
        selector: `${prefix}-result`,
        type_role: 'display',
        semantic_responsibility: 'result',
        carries_primary_meaning: true,
      },
      {
        element_id: `${id.toLowerCase()}-input-label`,
        selector: `${prefix}-input-label`,
        type_role: 'body',
        semantic_responsibility: 'input',
        carries_primary_meaning: false,
      },
      {
        element_id: `${id.toLowerCase()}-rule-label`,
        selector: `${prefix}-rule-label`,
        type_role: 'status',
        semantic_responsibility: 'operation',
        carries_primary_meaning: false,
      },
    ],
    cue_ids: [cueId(index)],
    focal_role: odd ? 'pipeline-core' : 'primary-result',
    density_level: odd ? 2 : 3,
    layout_family: odd ? 'pipeline' : 'comparison',
    metaphor_id: odd ? 'four-stage-axis' : 'before-after-result',
    dominant_axis: odd ? 'horizontal' : 'vertical',
    primary_primitive: odd ? 'nodes-and-line' : 'paired-values',
    component_id: odd ? 'pipeline' : 'comparison',
    motion_profile_id: odd ? 'causal-flow' : 'causal-compare',
    causal_lifecycle: {
      entry: {
        start_frame: 0,
        end_frame: 10,
        selectors: [`${prefix}-input`],
        timeline_calls: [`${id.toLowerCase()}-entry`],
      },
      action: {
        start_frame: 10,
        end_frame: 35,
        selectors: [`${prefix}-input`, `${prefix}-rule`],
        timeline_calls: [`${id.toLowerCase()}-action`],
      },
      result: {
        start_frame: 35,
        end_frame: 45,
        selectors: [`${prefix}-result`],
        timeline_calls: [`${id.toLowerCase()}-result`],
      },
      hold: {
        start_frame: 45,
        end_frame: 90,
        selectors: [`${prefix}-result`],
        timeline_calls: [`${id.toLowerCase()}-hold`],
      },
      exit: {
        start_frame: 90,
        end_frame: 100,
        selectors: [`${prefix}-input`, `${prefix}-rule`, `${prefix}-result`],
        timeline_calls: [`${id.toLowerCase()}-exit`],
      },
    },
    data_points: [],
  };
}

function createShotPlan(parsedSrt, shotCount) {
  const shots = Array.from(
    { length: shotCount },
    (_, index) => createShot(index, shotCount),
  );
  const first = shots[0];
  const last = shots.at(-1);
  return withHash({
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    parsed_srt_sha256: hash(parsedSrt),
    fps: { numerator: 25, denominator: 1 },
    shots,
    chapters: [{
      chapter_id: 'C01',
      shot_ids: shots.map((shot) => shot.shot_id),
      problem_or_goal: '证明规则节点如何把输入变成可验证结果。',
      mechanism: '输入按顺序通过结构化规则节点。',
      result: '全部结果态在字幕窗口内稳定可读。',
      next_chapter_handoff: '把已验证结果交给下一章节继续处理。',
    }],
    chapter_promise_payoff_ledger: [{
      promise_id: 'promise-lead-packet',
      promise_chapter_id: 'C01',
      promise_shot_id: first.shot_id,
      payoff_chapter_id: 'C01',
      payoff_shot_id: last.shot_id,
      object_id: 'lead-packet',
      direction: 'left-to-right',
      required_state_delta: {
        property: 'qualification',
        from: 'unqualified',
        to: 'qualified',
      },
    }],
    motif_callback_ledger: [],
    emphasis_ledger: [],
    density_curve: shots.map((shot) => ({
      shot_id: shot.shot_id,
      density_level: shot.density_level,
    })),
    layout_and_metaphor_cooldown: shots.slice(1).map((shot, index) => ({
      from_shot_id: shots[index].shot_id,
      to_shot_id: shot.shot_id,
      changed_dimensions: [
        'core-geometry',
        'focus-position',
        'density',
        'motion-causality',
      ],
    })),
  }, 'shot_plan_sha256');
}

function createReferenceStyleProfile() {
  return {
    schema_version: 1,
    profile_id: 'fixture-project-profile',
    project_id: 'fixture-project',
    project_only: true,
    public_default: false,
    status: 'draft',
    parameters: {
      palette_direction: 'project-specific neutral',
      typography_direction: 'project-local role hierarchy',
    },
  };
}

function createDesignSystem(profile) {
  const typeRoles = [
    ['display', 'functional', true],
    ['body', 'functional', true],
    ['status', 'functional', true],
    ['data', 'functional', true],
    ['meta', 'functional', false],
    ['microtext-texture', 'texture', false],
  ].map(([role, semanticClass, mayCarryPrimaryMeaning]) => ({
    role,
    semantic_class: semanticClass,
    may_carry_primary_meaning: mayCarryPrimaryMeaning,
    min_height_ratio: role === 'display'
      ? 0.04 : role === 'microtext-texture' ? 0.004 : 0.01,
    font_role_id: `${role}-font`,
  }));
  return withHash({
    schema_version: 1,
    design_system_id: 'fixture-design-system-v1',
    reference_style_profile: {
      profile_id: profile.profile_id,
      profile_sha256: hash(profile),
      project_id: profile.project_id,
      project_only: profile.project_only,
      public_default: profile.public_default,
      status: profile.status,
    },
    palette_roles: [
      { role: 'background', token: 'color.background', value: '#101828' },
      { role: 'foreground', token: 'color.foreground', value: '#F8FAFC' },
      { role: 'accent', token: 'color.accent', value: '#38BDF8' },
    ],
    type_roles: typeRoles,
    safe_regions: [
      { region_id: 'title-safe', x: 0.08, y: 0.08, width: 0.84, height: 0.84 },
    ],
    spacing_tokens: [
      { token: 'space-1', value_px: 16 },
      { token: 'space-2', value_px: 32 },
    ],
    radius_tokens: [{ token: 'radius-card', value_px: 24 }],
    material_recipes: [{
      recipe_id: 'surface-primary',
      description: 'Use one project-bound surface without a universal skin.',
    }],
    z_bands: [
      { band_id: 'background', min: 0, max: 99 },
      { band_id: 'content', min: 100, max: 499 },
      { band_id: 'annotation', min: 500, max: 799 },
    ],
    component_roles: COMPONENT_IDS.map((componentId) => ({
      component_id: componentId,
      role: `${componentId} semantic role`,
    })),
    motion_profiles: [
      {
        motion_profile_id: 'causal-flow',
        entry_frames: 10,
        action_frames_min: 20,
        finite_repeat_only: true,
        paused_timeline_required: true,
      },
      {
        motion_profile_id: 'causal-compare',
        entry_frames: 10,
        action_frames_min: 20,
        finite_repeat_only: true,
        paused_timeline_required: true,
      },
    ],
    identity_invariants: [
      'Keep one first-read focal role per visible beat.',
      'Keep functional typography distinct from texture microtext.',
    ],
    anti_identity_rules: [
      'Do not repeat the same core geometry with copy-only swaps.',
      'Do not use ambient motion as the only semantic action.',
    ],
    prohibited_motifs: ['unregistered-template-skin'],
    whole_film_budget_refs: [
      'emphasis_budget',
      'density_curve',
      'layout_and_metaphor_cooldown',
    ],
  }, 'design_system_sha256');
}

function createComponentRegistry() {
  return withHash({
    schema_version: 1,
    registry_id: 'fixture-component-registry-v1',
    components: COMPONENT_IDS.map((componentId) => ({
      component_id: componentId,
      semantic_roles: [`${componentId} primary semantic role`],
      allowed_type_roles: ['display', 'body', 'status', 'data', 'meta'],
      layout_contract: {
        layout_families: ['pipeline', 'comparison', 'semantic-layout'],
        focal_roles: ['pipeline-core', 'primary-result'],
        dominant_axes: ['horizontal', 'vertical'],
      },
      motion_profile_ids: ['causal-flow', 'causal-compare'],
      z_band_ids: ['content', 'annotation'],
      stable_result_assertions: [
        'primary-result-visible',
        'functional-text-readable',
      ],
      status_color_roles: ['foreground', 'accent'],
      allows_overshoot: false,
      allows_stroke_animation: componentId === 'topology',
      allows_overflow: false,
    })),
  }, 'component_registry_sha256');
}

function createProjection(parsedSrt, shotPlan) {
  return {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    artifact_kind: 'frame-projection',
    parsed_srt_sha256: hash(parsedSrt),
    shot_plan_sha256: shotPlan.shot_plan_sha256,
    fps: structuredClone(shotPlan.fps),
    shots: shotPlan.shots.map((shot) => ({
      shot_id: shot.shot_id,
      cue_ids: structuredClone(shot.cue_ids),
      srt_window_ms: { start_ms: shot.start_ms, end_ms: shot.end_ms },
      frame_window: {
        start_frame: Math.round(shot.start_ms / 40),
        end_frame: Math.round(shot.end_ms / 40),
        duration_frames: Math.round(shot.duration_ms / 40),
      },
    })),
  };
}

export function createDirectorFixture({ shotCount = 5 } = {}) {
  if (!Number.isSafeInteger(shotCount) || shotCount < 2 || shotCount > 32) {
    throw new TypeError('shotCount must be an integer from 2 through 32.');
  }
  const srtBytes = createSrtBytes(shotCount);
  const parsedSrt = createParsedSrt(srtBytes);
  const shotPlan = createShotPlan(parsedSrt, shotCount);
  const referenceStyleProfile = createReferenceStyleProfile();
  const canonicalArtifacts = {
    parsedSrt,
    shotPlan,
    designSystem: createDesignSystem(referenceStyleProfile),
    componentRegistry: createComponentRegistry(),
    validationPolicy: createValidationPolicy(),
    referenceStyleProfile,
    fontPackage: {
      schema_version: 1,
      artifact_kind: 'font-package',
      content: 'actual project-local font package fixture bytes',
    },
    projection: createProjection(parsedSrt, shotPlan),
    deliveryProfile: {
      schema_version: 1,
      artifact_kind: 'delivery-profile',
      width: 64,
      height: 36,
      fps: { numerator: 25, denominator: 1 },
      codec: 'h264',
    },
  };
  return {
    srtBytes,
    canonicalArtifacts,
    expected: {
      pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
      authoring_topology_id: AUTHORING_TOPOLOGY_ID,
      validation_policy_id: VALIDATION_POLICY_ID,
      shot_count: shotCount,
    },
  };
}

function ppmBytes(width, height) {
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii');
  const pixels = Buffer.alloc(width * height * 3);
  for (let offset = 0; offset < pixels.length; offset += 3) {
    const pixel = offset / 3;
    pixels[offset] = pixel % width;
    pixels[offset + 1] = Math.floor(pixel / width);
    pixels[offset + 2] = 127;
  }
  return Buffer.concat([header, pixels]);
}

export async function createOrdinaryMediaSelections(
  directory,
  directorFixture,
) {
  const mediaPath = path.join(directory, 'ordinary-primary.ppm');
  const bytes = ppmBytes(64, 36);
  await writeFile(mediaPath, bytes);
  const actualProbe = await probeMedia(mediaPath);
  const bytesSha256 = createHash('sha256').update(bytes).digest('hex');
  const selections = directorFixture.canonicalArtifacts.shotPlan.shots.map(
    (shot, index) => ({
      shot_id: shot.shot_id,
      asset_id: `ordinary-primary-${String(index + 1).padStart(3, '0')}`,
      route: 'user-media',
      route_order: [
        'user-media',
        'image-generation',
        'pexels',
        'native-auxiliary',
      ],
      local_path: mediaPath,
      selection_basis: {
        status: 'sufficient',
        evidence_refs: [`user-selection:${shot.shot_id}`],
      },
      rights: {
        status: 'cleared',
        basis: 'user-owned-fixture',
        evidence_sha256: hash({
          shot_id: shot.shot_id,
          basis: 'user-owned-fixture',
        }),
      },
      provenance: {
        origin: 'user-media',
        source_id: `fixture-source-${String(index + 1).padStart(3, '0')}`,
      },
      crop: { x: 0, y: 0, width: 64, height: 36 },
      safe_region: { x: 4, y: 4, width: 56, height: 28 },
      focal_point: { x: 32, y: 18 },
      title_relation: {
        anchor: 'top-left',
        subject_clearance_px: 8,
      },
      consumer: {
        consumer_id: `primary-${shot.shot_id}`,
        role: 'ordinary-primary',
        element: 'img',
        fit: 'cover',
      },
    }),
  );
  return {
    mediaPath,
    bytes,
    bytesSha256,
    actualProbe,
    selections,
  };
}
