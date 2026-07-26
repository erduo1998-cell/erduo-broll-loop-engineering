import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  createValidationPolicy,
  receiptBindings,
} from './test-support-script-only-v3-runtime.mjs';
import {
  createDirectorFixture,
} from './test-support-script-only-v3-director-assets.mjs';
import {
  createGateReceipt,
  fingerprintV3Value,
  validateGateReceipt,
  validateProductionContract,
  validateValidationPolicy,
} from './validate-production-contract.mjs';
import { compileDirectorChain } from './validate-director-chain.mjs';
import { freezeAssetsFactsChain } from './validate-assets-facts-chain.mjs';

const execFileAsync = promisify(execFile);
const hashBytes = (value) => createHash('sha256').update(value).digest('hex');
const hash = (value) => fingerprintV3Value(value);

export const SOURCE_FAILURE_CASES = Object.freeze([
  ['remote dependency', 'remote_dependency', 'remote_dependency'],
  ['Math.random', 'math_random', 'nondeterministic_random'],
  ['Date.now', 'date_now', 'nondeterministic_clock'],
  ['repeat -1', 'repeat_infinite', 'timeline_repeat_infinite'],
  [
    'irreversible callback',
    'irreversible_callback',
    'seek_irreversible_callback',
  ],
  ['duplicate selector', 'selector_duplicate', 'selector_duplicate'],
  ['orphan selector', 'selector_orphan', 'selector_orphan'],
  ['cross-block selector', 'selector_cross_block', 'selector_cross_block'],
  [
    'terminal scale zero',
    'terminal_scale_zero',
    'terminal_result_invisible',
  ],
  ['tween tail overflow', 'tween_overflow', 'timeline_tail_overflow'],
  [
    'Result before Action',
    'result_before_action',
    'result_precedes_action',
  ],
  ['missing readable Hold', 'hold_missing', 'readable_hold_missing'],
  [
    'numeric formula conflict',
    'numeric_formula',
    'numeric_formula_conflict',
  ],
  [
    'numeric provenance missing',
    'numeric_provenance',
    'numeric_provenance_missing',
  ],
  [
    'CJK glyph source unbound',
    'font_glyph',
    'font_glyph_source_unbound',
  ],
  [
    'font weight role mismatch',
    'font_weight',
    'font_weight_role_mismatch',
  ],
  ['system or local font fallback', 'font_fallback', 'font_fallback_forbidden'],
  ['hard-coded user path', 'hardcoded_path', 'hardcoded_output_path'],
  ['source root escape', 'root_escape', 'source_root_escape'],
  [
    'duration truth conflict',
    'duration_conflict',
    'duration_truth_conflict',
  ],
  [
    'unregistered design token',
    'unregistered_token',
    'canonical_artifact_reference_unregistered',
  ],
  [
    'unregistered component',
    'unregistered_component',
    'canonical_artifact_reference_unregistered',
  ],
  [
    'unregistered motion profile',
    'unregistered_motion',
    'canonical_artifact_reference_unregistered',
  ],
  [
    'unregistered type role',
    'unregistered_type',
    'canonical_artifact_reference_unregistered',
  ],
  [
    'unregistered canonical data reference',
    'unregistered_data_ref',
    'canonical_artifact_reference_unregistered',
  ],
  [
    'native auxiliary bytes/hash drift',
    'auxiliary_hash',
    'source_asset_unbound',
  ],
  [
    'native auxiliary consumer-role drift',
    'auxiliary_role',
    'source_asset_unbound',
  ],
]);

export const RUNTIME_FAILURE_CASES = Object.freeze([
  ['four-path state divergence', 'state_mismatch', 'seek_state_hash_mismatch'],
  ['missing end_to_t', 'missing_end_to_t', 'seek_end_to_t_missing'],
  ['Result visible before Action', 'result_before_action', 'result_precedes_action'],
  ['repeat path drift', 'repeat_drift', 'repeat_state_drift'],
  ['loaded font drift', 'font_drift', 'font_runtime_mismatch'],
  ['runtime network request', 'network_request', 'runtime_network_request'],
  ['runtime console failure', 'console_error', 'runtime_console_error'],
]);

export const PIXEL_FAILURE_CASES = Object.freeze([
  ['near-black output', 'near_black', 'frame_near_black'],
  ['near-empty output', 'near_empty', 'frame_near_empty'],
  ['fully transparent output', 'transparent', 'frame_fully_transparent'],
  ['NaN transform', 'nan_transform', 'transform_non_finite'],
  ['DOM overflow', 'dom_overflow', 'dom_overflow'],
  ['functional text crop', 'text_crop', 'text_crop'],
  ['zero primary ROI', 'primary_roi_zero', 'primary_roi_missing'],
  ['font fallback', 'font_fallback', 'font_fallback_detected'],
  ['missing result during Hold', 'hold_missing', 'readable_hold_missing'],
  [
    'undeclared adjacent identity',
    'adjacent_identity',
    'adjacent_result_identity',
  ],
]);

const SOURCE_HARD_FAILURES = [
  ...new Set(SOURCE_FAILURE_CASES.map((item) => item[2])),
  'source_inspection_invalid',
  'source_parser_failed',
  'hyperframes_check_failed',
];
const RUNTIME_HARD_FAILURES = [
  ...RUNTIME_FAILURE_CASES.map((item) => item[2]),
  'runtime_primary_material_mismatch',
  'runtime_result_missing',
  'runtime_display_state_invalid',
  'runtime_block_manifest_invalid',
  'runtime_gate_contract_invalid',
  'runtime_probe_required',
  'runtime_sample_plan_invalid',
  'runtime_source_bundle_invalid',
  'runtime_source_receipt_invalid',
  'runtime_state_invalid',
];
const PIXEL_HARD_FAILURES = [
  ...PIXEL_FAILURE_CASES.map((item) => item[2]),
  'pixel_facts_invalid',
  'text_overlap',
  'microtext_only_result',
  'functional_text_below_minimum',
  'font_weight_role_mismatch',
  'font_glyph_source_unbound',
  'frozen_result_anomaly',
];

function rehashDocument(document) {
  return {
    ...document,
    bytes_sha256: hashBytes(Buffer.from(document.content, 'utf8')),
  };
}

function sourceBundleCore(sourceBundle) {
  return {
    schema_version: sourceBundle.schema_version,
    block_id: sourceBundle.block_id,
    files: sourceBundle.files.map((file) => ({
      relative_path: file.relative_path,
      media_type: file.media_type,
      bytes_sha256: file.bytes_sha256,
    })),
    materials: sourceBundle.materials.map((material) => ({
      asset_id: material.asset_id,
      media_kind: material.media_kind,
      consumer_role: material.consumer_role,
      bytes_sha256: material.bytes_sha256,
      auxiliary: material.auxiliary,
    })),
    font_package: {
      family: sourceBundle.font_package.family,
      weights: sourceBundle.font_package.weights,
      glyph_ranges: sourceBundle.font_package.glyph_ranges,
      bytes_sha256: sourceBundle.font_package.bytes_sha256,
    },
  };
}

export function rehashBlock(block) {
  const next = structuredClone(block);
  next.source_bundle.files = next.source_bundle.files.map(rehashDocument);
  next.source_bundle.source_sha256 = hash(sourceBundleCore(next.source_bundle));
  next.block_manifest.source_sha256 = next.source_bundle.source_sha256;
  const manifestCore = { ...next.block_manifest };
  delete manifestCore.block_manifest_sha256;
  next.block_manifest.block_manifest_sha256 = hash(manifestCore);
  return next;
}

function withPolicyHash(value) {
  const core = structuredClone(value);
  delete core.validation_policy_sha256;
  return {
    ...core,
    validation_policy_sha256: hash(core),
  };
}

export function createP4ValidationPolicy() {
  const policy = structuredClone(createValidationPolicy());
  policy.gate_policies['source-conformance-gate'] = {
    hard_failure_codes: [...SOURCE_HARD_FAILURES],
    warning_codes: ['source_conformance_calibration_warning'],
  };
  policy.gate_policies['runtime-seek-gate'] = {
    hard_failure_codes: [...RUNTIME_HARD_FAILURES],
    warning_codes: ['runtime_seek_calibration_warning'],
  };
  policy.gate_policies['pixel-signal-gate'] = {
    hard_failure_codes: [...new Set(PIXEL_HARD_FAILURES)],
    warning_codes: [
      'adjacent_result_identity_warning',
      'pixel_signal_calibration_warning',
    ],
  };
  const result = withPolicyHash(policy);
  validateValidationPolicy(result);
  return result;
}

function ppmBytes(width, height) {
  const header = Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii');
  const pixels = Buffer.alloc(width * height * 3);
  for (let offset = 0; offset < pixels.length; offset += 3) {
    const pixel = offset / 3;
    pixels[offset] = (pixel * 13) % 256;
    pixels[offset + 1] = (Math.floor(pixel / width) * 29) % 256;
    pixels[offset + 2] = 173;
  }
  return Buffer.concat([header, pixels]);
}

async function createRealMaterials(root) {
  const materialRoot = path.join(root, 'materials');
  await mkdir(materialRoot, { recursive: true });
  const imagePath = path.join(materialRoot, 'ordinary-primary.ppm');
  const videoPath = path.join(materialRoot, 'ordinary-primary.mp4');
  const auxiliaryPath = path.join(materialRoot, 'native-auxiliary.svg');
  const fontPath = path.join(materialRoot, 'fixture-sans.woff2');
  const imageBytes = ppmBytes(64, 36);
  const auxiliaryBytes = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="36"><path d="M4 18H60" stroke="#fff"/></svg>',
    'utf8',
  );
  const fontBytes = Buffer.concat([
    Buffer.from('wOF2', 'ascii'),
    Buffer.from('fixture-cjk-latin-weights-400-700', 'utf8'),
  ]);
  await Promise.all([
    writeFile(imagePath, imageBytes),
    writeFile(auxiliaryPath, auxiliaryBytes),
    writeFile(fontPath, fontBytes),
  ]);
  await execFileAsync('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=0x335577:s=64x36:d=0.24:r=25',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    videoPath,
  ]);
  const videoBytes = await readFile(videoPath);
  return {
    image: {
      asset_id: 'ordinary-image',
      media_kind: 'image',
      consumer_role: 'ordinary-primary',
      local_path: imagePath,
      bytes_sha256: hashBytes(imageBytes),
      auxiliary: false,
    },
    video: {
      asset_id: 'ordinary-video',
      media_kind: 'video',
      consumer_role: 'ordinary-primary',
      local_path: videoPath,
      bytes_sha256: hashBytes(videoBytes),
      auxiliary: false,
    },
    auxiliary: {
      asset_id: 'native-relationship-line',
      media_kind: 'svg',
      consumer_role: 'native-auxiliary',
      local_path: auxiliaryPath,
      bytes_sha256: hashBytes(auxiliaryBytes),
      auxiliary: true,
    },
    font: {
      family: 'Fixture Sans',
      weights: [400, 700],
      glyph_ranges: ['latin', 'cjk-unified'],
      local_path: fontPath,
      bytes_sha256: hashBytes(fontBytes),
    },
  };
}

function rehashSelfDocument(document, field) {
  const core = structuredClone(document);
  delete core[field];
  return {
    ...core,
    [field]: hash(core),
  };
}

function canonicalDataPoint(shotId) {
  return {
    data_id: `${shotId.toLowerCase()}-rate`,
    label: `${shotId} illustrative completion rate`,
    value: 80,
    unit: 'percent',
    denominator: {
      value: 100,
      unit: 'units',
      basis: '100 units',
    },
    formula: {
      operator: 'percentage',
      operands: [80, 100],
      result_unit: 'percent',
    },
    source_ref: `fixture:${shotId}`,
    evidence_role: 'illustrative',
  };
}

function createP4CanonicalArtifacts({
  shotCount,
  materials,
  validationPolicy,
}) {
  const directorFixture = createDirectorFixture({ shotCount });
  const canonicalArtifacts = structuredClone(
    directorFixture.canonicalArtifacts,
  );
  canonicalArtifacts.validationPolicy = validationPolicy;
  canonicalArtifacts.fontPackage = {
    schema_version: 1,
    artifact_kind: 'font-package',
    family: materials.font.family,
    weights: [...materials.font.weights],
    glyph_ranges: [...materials.font.glyph_ranges],
    local_path: materials.font.local_path,
    bytes_sha256: materials.font.bytes_sha256,
  };
  canonicalArtifacts.shotPlan.shots.forEach((shot, index) => {
    shot.text_elements.push({
      element_id: `${shot.shot_id.toLowerCase()}-micro-label`,
      selector: `#${shot.shot_id.toLowerCase()}-micro`,
      type_role: 'microtext-texture',
      semantic_responsibility: 'texture-only',
      carries_primary_meaning: false,
    });
    shot.text_roles = [
      ...new Set(shot.text_elements.map((element) => element.type_role)),
    ];
    if ((index + 1) % 3 !== 0) return;
    shot.shot_kind = 'data';
    shot.readability_class = 'complex';
    shot.component_id = 'chart';
    shot.data_points = [canonicalDataPoint(shot.shot_id)];
    shot.text_elements[0].type_role = 'data';
    shot.text_roles = [
      ...new Set(shot.text_elements.map((element) => element.type_role)),
    ];
  });
  canonicalArtifacts.shotPlan = rehashSelfDocument(
    canonicalArtifacts.shotPlan,
    'shot_plan_sha256',
  );
  canonicalArtifacts.componentRegistry.components.forEach((component) => {
    if (!component.allowed_type_roles.includes('microtext-texture')) {
      component.allowed_type_roles.push('microtext-texture');
    }
  });
  canonicalArtifacts.componentRegistry = rehashSelfDocument(
    canonicalArtifacts.componentRegistry,
    'component_registry_sha256',
  );
  canonicalArtifacts.projection.shot_plan_sha256 =
    canonicalArtifacts.shotPlan.shot_plan_sha256;
  return {
    srtBytes: directorFixture.srtBytes,
    canonicalArtifacts,
  };
}

function createP3Selections(canonicalArtifacts, materials) {
  return canonicalArtifacts.shotPlan.shots.map((shot, index) => {
    const selected = index % 2 === 0 ? materials.image : materials.video;
    return {
      shot_id: shot.shot_id,
      asset_id: `${selected.asset_id}-${shot.shot_id}`,
      route: 'user-media',
      route_order: [
        'user-media',
        'image-generation',
        'pexels',
        'native-auxiliary',
      ],
      local_path: selected.local_path,
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
        source_id: `fixture-source-${shot.shot_id}`,
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
        element: selected.media_kind === 'video' ? 'video' : 'img',
        fit: 'cover',
      },
    };
  });
}

async function createActualP3Chain({
  shotCount,
  materials,
  validationPolicy,
}) {
  const { srtBytes, canonicalArtifacts } = createP4CanonicalArtifacts({
    shotCount,
    materials,
    validationPolicy,
  });
  const directorInput = {
    srt_bytes: srtBytes,
    ...canonicalArtifacts,
  };
  const director = await compileDirectorChain(directorInput);
  const selections = createP3Selections(canonicalArtifacts, materials);
  const assets = await freezeAssetsFactsChain({
    prior_contract: director.production_contract,
    director_policy_receipt: director.policy_receipt,
    canonical_artifacts: canonicalArtifacts,
    selections,
  });
  validateProductionContract(assets.production_contract, {
    artifacts: canonicalArtifacts,
    priorContract: director.production_contract,
    assetManifest: assets.asset_manifest,
  });
  validateGateReceipt(director.policy_receipt, {
    productionContract: director.production_contract,
    validationPolicy,
  });
  validateGateReceipt(assets.policy_receipt, {
    productionContract: assets.production_contract,
    validationPolicy,
  });
  return {
    srtBytes,
    canonicalArtifacts,
    priorContract: director.production_contract,
    directorPolicyReceipt: director.policy_receipt,
    assetManifest: assets.asset_manifest,
    sealedPolicyReceipt: assets.policy_receipt,
    productionContract: assets.production_contract,
    selections,
  };
}

const phaseWindow = (shotStart, offsetStart, offsetEnd) => ({
  start_frame: shotStart + offsetStart,
  end_frame: shotStart + offsetEnd,
});

function createShot({
  blockId,
  canonicalShot,
  projectionShot,
  asset,
  materials,
}) {
  const shotId = canonicalShot.shot_id;
  const shotStart = projectionShot.frame_window.start_frame;
  const endFrame = projectionShot.frame_window.end_frame;
  const phaseWindows = Object.fromEntries(
    Object.entries(canonicalShot.causal_lifecycle).map(
      ([phase, record]) => [
        phase,
        phaseWindow(
          shotStart,
          record.start_frame,
          record.end_frame,
        ),
      ],
    ),
  );
  const selectors = Object.fromEntries(
    Object.entries(canonicalShot.causal_lifecycle).map(
      ([phase, record]) => [phase, record.selectors[0]],
    ),
  );
  const callProperties = {
    entry: ['opacity', 0, 1],
    action: ['translateX', -12, 0],
    result: ['scale', 0.92, 1],
    hold: ['translateX', 0, 0],
    exit: ['opacity', 1, 0],
  };
  const calls = Object.entries(phaseWindows).map(([phase, window]) => {
    const [property, from, to] = callProperties[phase];
    return {
      call_id:
        canonicalShot.causal_lifecycle[phase].timeline_calls[0],
      selector: selectors[phase],
      phase,
      property,
      ...window,
      from,
      to,
      repeat: 0,
      paused: true,
      reversible: true,
    };
  });
  return {
    shot_id: shotId,
    start_frame: shotStart,
    end_frame: endFrame,
    semantic_kind: canonicalShot.shot_kind,
    component_id: canonicalShot.component_id,
    motion_profile_id: canonicalShot.motion_profile_id,
    layout_family: canonicalShot.layout_family,
    focal_role: canonicalShot.focal_role,
    palette_token_ids: [
      'color.background',
      'color.foreground',
      'color.accent',
    ],
    font_role_ids: [
      ...new Set(
        canonicalShot.text_elements.map(
          (element) => `${element.type_role}-font`,
        ),
      ),
    ],
    primary_material_asset_id: asset.asset_id,
    native_auxiliary_asset_ids:
      canonicalShot.shot_kind === 'data'
        ? [materials.auxiliary.asset_id] : [],
    result_selector: canonicalShot.text_elements.find(
      (element) => (
        element.element_id
          === canonicalShot.result_state.semantic_carrier_element_id
      ),
    ).selector,
    functional_text: canonicalShot.text_elements.map((element) => ({
      element_id: element.element_id,
      selector: element.selector,
      type_role: element.type_role,
      semantic_responsibility: element.semantic_responsibility,
      primary_meaning: element.carries_primary_meaning,
    })),
    causal_lifecycle: Object.fromEntries(
      Object.entries(phaseWindows).map(([phase, window]) => [
        phase,
        {
          ...window,
          selectors: [
            ...canonicalShot.causal_lifecycle[phase].selectors,
          ],
          timeline_call_ids: [
            ...canonicalShot.causal_lifecycle[phase].timeline_calls,
          ],
        },
      ]),
    ),
    timeline_calls: calls,
    data_points: structuredClone(canonicalShot.data_points),
  };
}

function renderHtml(blockId, shots) {
  const shotMarkup = shots.map((shot) => {
    const id = shot.shot_id.toLowerCase();
    const durationSeconds = Math.max(
      0.04,
      (shot.end_frame - shot.start_frame) / 25,
    );
    const startSeconds = Math.max(
      0,
      (shot.start_frame - shots[0].start_frame) / 25,
    );
    const primaryTag = shot.primary_material_asset_id
      .startsWith('ordinary-image-')
      ? `<img id="${id}-primary" class="clip" src="./materials/ordinary-primary.ppm" data-start="${startSeconds}" data-duration="${durationSeconds}" data-asset-id="${shot.primary_material_asset_id}" data-consumer-role="ordinary-primary" alt="" />`
      : `<video id="${id}-primary" class="clip" src="./materials/ordinary-primary.mp4" data-start="${startSeconds}" data-duration="${durationSeconds}" data-asset-id="${shot.primary_material_asset_id}" data-consumer-role="ordinary-primary" muted></video>`;
    const resultText = shot.functional_text.find(
      (element) => element.selector === shot.result_selector,
    );
    const inputText = shot.functional_text.find(
      (element) => element.selector === `#${id}-input-label`,
    );
    const ruleText = shot.functional_text.find(
      (element) => element.selector === `#${id}-rule-label`,
    );
    const microtext = shot.functional_text.find(
      (element) => element.type_role === 'microtext-texture',
    );
    const dataPoint = shot.data_points[0] ?? null;
    const dataAttributes = dataPoint
      ? [
        `data-data-id="${dataPoint.data_id}"`,
        `data-value="${dataPoint.value}"`,
        `data-unit="${dataPoint.unit}"`,
        `data-denominator-value="${dataPoint.denominator.value}"`,
        `data-denominator-unit="${dataPoint.denominator.unit}"`,
        `data-formula-operator="${dataPoint.formula.operator}"`,
        `data-formula-operands="${dataPoint.formula.operands.join(',')}"`,
        `data-source-ref="${dataPoint.source_ref}"`,
        `data-evidence-role="${dataPoint.evidence_role}"`,
      ].join(' ')
      : '';
    const resultCopy = dataPoint
      ? `${dataPoint.value} ${dataPoint.unit}`
      : '结果';
    return [
      `<section data-block-id="${blockId}" data-shot-id="${shot.shot_id}">`,
      `<div id="${id}-input" data-token-background="color.background">${primaryTag}</div>`,
      `<div id="${id}-rule" data-component="${shot.component_id}" data-motion-profile="${shot.motion_profile_id}">规则</div>`,
      `<div id="${id}-result" data-type-role="${resultText.type_role}" data-token-foreground="color.foreground" ${dataAttributes}>${resultCopy}</div>`,
      `<p id="${id}-input-label" data-type-role="${inputText.type_role}">输入</p>`,
      `<p id="${id}-rule-label" data-type-role="${ruleText.type_role}">规则状态</p>`,
      `<small id="${id}-micro" data-type-role="${microtext.type_role}">texture</small>`,
      shot.native_auxiliary_asset_ids.length
        ? '<svg data-native-auxiliary="native-relationship-line" data-asset-id="native-relationship-line" data-consumer-role="native-auxiliary"><path d="M0 0H10"/></svg>'
        : '',
      '</section>',
    ].join('');
  }).join('');
  const blockDurationSeconds = Math.max(
    0.04,
    (shots.at(-1).end_frame - shots[0].start_frame) / 25,
  );
  return [
    '<!doctype html><html><head>',
    '<link rel="stylesheet" href="./styles.css" />',
    '</head><body>',
    `<main id="${blockId.toLowerCase()}-root" data-composition-id="${blockId}" data-no-timeline data-start="0" data-duration="${blockDurationSeconds}" data-width="1920" data-height="1080">`,
    shotMarkup,
    '</main>',
    '<script>globalThis.HyperFrames={timeline(){const timeline={fromTo(){return timeline;}};return timeline;}};</script>',
    '<script type="module" src="./block.js"></script>',
    '</body></html>',
  ].join('');
}

function renderJavascript(blockId, shots) {
  return [
    'const timeline = HyperFrames.timeline({ paused: true });',
    ...shots.flatMap((shot) => shot.timeline_calls.map((call) => (
      `timeline.fromTo("${call.selector}", {${call.property}:${JSON.stringify(call.from)}}, {${call.property}:${JSON.stringify(call.to)}, startFrame:${call.start_frame}, endFrame:${call.end_frame}, repeat:${call.repeat}});`
    ))),
    'window.__timelines = window.__timelines || {};',
    `window.__timelines[${JSON.stringify(blockId)}] = timeline;`,
    'export default timeline;',
  ].join('\n');
}

function createPixelFacts(blockId, shots) {
  return {
    schema_version: 1,
    block_id: blockId,
    samples: shots.map((shot, index) => {
      const actualGeometry = {
        subject_bbox: {
          x: 4 + index,
          y: 4,
          width: 40,
          height: 24,
        },
        focal_point: {
          x: 24 + index,
          y: 16,
        },
        density_facts: {
          functional_element_count: shot.functional_text.filter(
            (element) => element.type_role !== 'microtext-texture',
          ).length,
          occupied_area_ratio: 0.42 + index * 0.01,
        },
      };
      return {
        sample_id: `${shot.shot_id}:hold`,
        shot_id: shot.shot_id,
        phase: 'hold',
        frame: shot.causal_lifecycle.hold.start_frame,
        mean_luma: 72,
        visible_coverage_ratio: 0.62,
        alpha_coverage_ratio: 1,
        frozen_ratio: 0.1,
        transform_matrix: [1, 0, 0, 1, 0, 0],
        dom_overflow_px: 0,
        text_overflow_px: 0,
        text_clipped: false,
        nondecorative_overlap_count: 0,
        primary_roi_visible_ratio: 0.45,
        functional_text_min_ratio: 0.018,
        microtext_only_result: false,
        font_loaded: true,
        font_family_match: true,
        font_weight_match: true,
        glyph_coverage: true,
        result_visible: true,
        ...actualGeometry,
        geometry_signature: hash(actualGeometry),
      };
    }),
    adjacent_pairs: shots.slice(1).map((shot, index) => ({
      left_shot_id: shots[index].shot_id,
      right_shot_id: shot.shot_id,
      contract_declares_change: true,
      phash_distance: 18,
      ssim: 0.78,
      geometry_changed: true,
      focal_changed: true,
      density_changed: true,
    })),
  };
}

function createBlock({
  index,
  mode,
  materials,
  p3Chain,
}) {
  const blockId = `B${String(index).padStart(3, '0')}`;
  const firstShotIndex = (index - 1) * 3;
  const canonicalShots = p3Chain.canonicalArtifacts.shotPlan.shots
    .slice(firstShotIndex, firstShotIndex + 3);
  const projections = p3Chain.canonicalArtifacts.projection.shots
    .slice(firstShotIndex, firstShotIndex + 3);
  const assets = canonicalShots.map((shot) => (
    p3Chain.assetManifest.assets.find(
      (asset) => asset.shot_id === shot.shot_id,
    )
  ));
  const shots = canonicalShots.map((canonicalShot, shotIndex) => createShot({
    blockId,
    canonicalShot,
    projectionShot: projections[shotIndex],
    asset: assets[shotIndex],
    materials,
  }));
  const html = renderHtml(blockId, shots);
  const css = [
    '@font-face{font-family:"Fixture Sans";src:url("./materials/fixture-sans.woff2") format("woff2");font-weight:400 700;}',
    ':root{--color-background:#101828;--color-foreground:#F8FAFC;--color-accent:#38BDF8;}',
    'html,body{width:1920px;height:1080px;margin:0;overflow:hidden;}',
    'body{font-family:"Fixture Sans";background:var(--color-background);color:var(--color-foreground);}',
    '[data-composition-id]{position:relative;width:1920px;height:1080px;overflow:hidden;}',
    'section{position:relative;min-height:240px;}',
    '[data-type-role="microtext-texture"]{font-size:8px;}',
    '[data-type-role="body"]{font-size:18px;}',
    '[data-type-role="status"]{font-size:18px;}',
    '[data-type-role="data"]{font-size:24px;font-weight:700;}',
  ].join('\n');
  const javascript = renderJavascript(blockId, shots);
  const files = [
    {
      relative_path: 'index.html',
      media_type: 'text/html',
      content: html,
    },
    {
      relative_path: 'styles.css',
      media_type: 'text/css',
      content: css,
    },
    {
      relative_path: 'block.js',
      media_type: 'text/javascript',
      content: javascript,
    },
  ].map(rehashDocument);
  const sourceBundle = {
    schema_version: 1,
    block_id: blockId,
    files,
    materials: [
      ...assets.map((asset) => {
        const selection = p3Chain.selections.find(
          (item) => item.asset_id === asset.asset_id,
        );
        return {
          asset_id: asset.asset_id,
          media_kind:
            selection.consumer.element === 'video' ? 'video' : 'image',
          consumer_role: 'ordinary-primary',
          local_path: selection.local_path,
          bytes_sha256: asset.bytes_sha256,
          auxiliary: false,
        };
      }),
      structuredClone(materials.auxiliary),
      ...(mode === 'talking-head'
        ? [{
          ...structuredClone(
            assets.map((asset) => {
              const selection = p3Chain.selections.find(
                (item) => item.asset_id === asset.asset_id,
              );
              return {
                asset_id: asset.asset_id,
                media_kind:
                  selection.consumer.element === 'video'
                    ? 'video' : 'image',
                consumer_role: 'ordinary-primary',
                local_path: selection.local_path,
                bytes_sha256: asset.bytes_sha256,
                auxiliary: false,
              };
            }).find((material) => material.media_kind === 'video')
              ?? {
                ...materials.video,
                asset_id: assets[0].asset_id,
              },
          ),
          asset_id: 'talking-head-control',
          consumer_role: 'control-media',
        }]
        : []),
    ],
    font_package: structuredClone(materials.font),
  };
  sourceBundle.source_sha256 = hash(sourceBundleCore(sourceBundle));
  const runtimeSamplePlan = shots.flatMap((shot) => (
    Object.entries(shot.causal_lifecycle).map(([phase, record]) => ({
      shot_id: shot.shot_id,
      phase,
      frame: record.start_frame,
    }))
  ));
  const pixelFramePlan = shots.map((shot) => ({
    shot_id: shot.shot_id,
    phase: 'hold',
    frame: shot.causal_lifecycle.hold.start_frame,
  }));
  const manifestCore = {
    schema_version: 1,
    pipeline_contract_version: 3,
    block_id: blockId,
    namespace: `block-${blockId.toLowerCase()}`,
    mode,
    production_contract_sha256:
      p3Chain.productionContract.production_contract_sha256,
    projection_sha256: p3Chain.productionContract.projection_sha256,
    asset_manifest_sha256:
      p3Chain.productionContract.asset_manifest_sha256,
    start_frame: shots[0].start_frame,
    end_frame: shots.at(-1).end_frame,
    shot_ids: shots.map((shot) => shot.shot_id),
    shots,
    source_sha256: sourceBundle.source_sha256,
    runtime_sample_plan_sha256: hash(runtimeSamplePlan),
    pixel_frame_plan_sha256: hash(pixelFramePlan),
  };
  return {
    block_manifest: {
      ...manifestCore,
      block_manifest_sha256: hash(manifestCore),
    },
    source_bundle: sourceBundle,
    runtime_sample_plan: runtimeSamplePlan,
    pixel_frame_plan: pixelFramePlan,
    pixel_facts: createPixelFacts(blockId, shots),
  };
}

export async function createBlockGateFixture({
  root,
  mode = 'faceless',
  blockCount = 2,
} = {}) {
  if (!['faceless', 'talking-head'].includes(mode)) {
    throw new TypeError('mode must be faceless or talking-head.');
  }
  if (!Number.isSafeInteger(blockCount) || blockCount < 1 || blockCount > 8) {
    throw new TypeError('blockCount must be an integer from 1 through 8.');
  }
  const materials = await createRealMaterials(root);
  const validationPolicy = createP4ValidationPolicy();
  const p3Chain = await createActualP3Chain({
    shotCount: blockCount * 3,
    materials,
    validationPolicy,
  });
  const blocks = Array.from({ length: blockCount }, (_, index) => createBlock({
    index: index + 1,
    mode,
    materials,
    p3Chain,
  }));
  return {
    mode,
    root,
    materials,
    validationPolicy,
    canonicalArtifacts: p3Chain.canonicalArtifacts,
    priorContract: p3Chain.priorContract,
    directorPolicyReceipt: p3Chain.directorPolicyReceipt,
    assetManifest: p3Chain.assetManifest,
    sealedPolicyReceipt: p3Chain.sealedPolicyReceipt,
    productionContract: p3Chain.productionContract,
    selections: p3Chain.selections,
    blocks,
  };
}

function appendSource(block, relativePath, text) {
  const next = structuredClone(block);
  const document = next.source_bundle.files.find(
    (item) => item.relative_path === relativePath,
  );
  document.content += `\n${text}`;
  return rehashBlock(next);
}

export function mutateSourceBlock(block, scenario) {
  let next = structuredClone(block);
  const shot = next.block_manifest.shots[0];
  const action = shot.timeline_calls.find((call) => call.phase === 'action');
  const result = shot.timeline_calls.find((call) => call.phase === 'result');
  if (scenario === 'remote_dependency') {
    return appendSource(
      next,
      'index.html',
      '<script src="https://cdn.jsdelivr.net/npm/gsap/dist/gsap.min.js"></script>',
    );
  }
  if (scenario === 'math_random') {
    return appendSource(next, 'block.js', 'const randomSeed = Math.random();');
  }
  if (scenario === 'date_now') {
    return appendSource(next, 'block.js', 'const currentTime = Date.now();');
  }
  if (scenario === 'repeat_infinite') {
    result.repeat = -1;
  } else if (scenario === 'irreversible_callback') {
    return appendSource(
      next,
      'block.js',
      'timeline.call(() => document.querySelector("#sticky").classList.add("done"));',
    );
  } else if (scenario === 'selector_duplicate') {
    return appendSource(
      next,
      'index.html',
      `<div id="${shot.result_selector.slice(1)}"></div>`,
    );
  } else if (scenario === 'selector_orphan') {
    action.selector = `#${next.block_manifest.block_id}-orphan`;
    shot.causal_lifecycle.action.selectors = [action.selector];
  } else if (scenario === 'selector_cross_block') {
    action.selector = '#B999-S999-object';
    shot.causal_lifecycle.action.selectors = [action.selector];
  } else if (scenario === 'terminal_scale_zero') {
    result.to = 0;
  } else if (scenario === 'tween_overflow') {
    result.repeat = 2;
    result.end_frame = shot.end_frame - 5;
  } else if (scenario === 'result_before_action') {
    result.start_frame = action.start_frame;
    result.end_frame = action.end_frame - 1;
    shot.causal_lifecycle.result.start_frame = result.start_frame;
    shot.causal_lifecycle.result.end_frame = result.end_frame;
  } else if (scenario === 'hold_missing') {
    const dataShot = next.block_manifest.shots.find(
      (item) => item.semantic_kind === 'data',
    );
    dataShot.causal_lifecycle.hold.end_frame =
      dataShot.causal_lifecycle.hold.start_frame + 44;
  } else if (scenario === 'numeric_formula') {
    const dataShot = next.block_manifest.shots.find(
      (item) => item.data_points.length,
    );
    dataShot.data_points[0].value = 81;
  } else if (scenario === 'numeric_provenance') {
    const dataShot = next.block_manifest.shots.find(
      (item) => item.data_points.length,
    );
    dataShot.data_points[0].source_ref = '';
  } else if (scenario === 'font_glyph') {
    next.source_bundle.font_package.glyph_ranges = ['latin'];
  } else if (scenario === 'font_weight') {
    next.source_bundle.font_package.weights = [400];
    return appendSource(
      next,
      'styles.css',
      '[data-type-role="data"]{font-weight:700;}',
    );
  } else if (scenario === 'font_fallback') {
    return appendSource(
      next,
      'styles.css',
      '@font-face{font-family:"Fixture Sans";src:local("Arial"),url("./materials/fixture-sans.woff2");} body{font-family:"Fixture Sans",sans-serif;}',
    );
  } else if (scenario === 'hardcoded_path') {
    return appendSource(
      next,
      'block.js',
      'const outputPath = "/Users/alice/render/output.mp4";',
    );
  } else if (scenario === 'root_escape') {
    next.source_bundle.files[2].relative_path = '../escape.js';
  } else if (scenario === 'duration_conflict') {
    next.block_manifest.end_frame += 1;
  } else if (scenario === 'unregistered_token') {
    shot.palette_token_ids[0] = 'color.unregistered';
    return appendSource(
      next,
      'index.html',
      '<div data-token-background="color.unregistered"></div>',
    );
  } else if (scenario === 'unregistered_component') {
    shot.component_id = 'unregistered-component';
    return appendSource(
      next,
      'index.html',
      '<div data-component="unregistered-component"></div>',
    );
  } else if (scenario === 'unregistered_motion') {
    shot.motion_profile_id = 'unregistered-motion';
    return appendSource(
      next,
      'index.html',
      '<div data-motion-profile="unregistered-motion"></div>',
    );
  } else if (scenario === 'unregistered_type') {
    shot.functional_text[0].type_role = 'unregistered-type';
    return appendSource(
      next,
      'index.html',
      '<p data-type-role="unregistered-type">invalid</p>',
    );
  } else if (scenario === 'unregistered_data_ref') {
    const dataShot = next.block_manifest.shots.find(
      (item) => item.data_points.length,
    );
    dataShot.data_points[0].source_ref = 'fixture:unregistered';
  } else if (scenario === 'auxiliary_hash') {
    const auxiliary = next.source_bundle.materials.find(
      (material) => material.consumer_role === 'native-auxiliary',
    );
    auxiliary.bytes_sha256 = 'f'.repeat(64);
  } else if (scenario === 'auxiliary_role') {
    const auxiliary = next.source_bundle.materials.find(
      (material) => material.consumer_role === 'native-auxiliary',
    );
    auxiliary.consumer_role = 'ordinary-primary';
  } else {
    throw new TypeError(`Unknown source mutation: ${scenario}`);
  }
  return rehashBlock(next);
}

function normalizedRuntimeState(block, sample) {
  const shot = block.block_manifest.shots.find(
    (item) => item.shot_id === sample.shot_id,
  );
  const phaseIndex = ['entry', 'action', 'result', 'hold', 'exit']
    .indexOf(sample.phase);
  return {
    text_content: `${sample.shot_id}:${sample.phase}`,
    class_list: ['fixture-state', `phase-${sample.phase}`],
    display: 'block',
    visibility: 'visible',
    opacity: sample.phase === 'entry' ? 0.75 : 1,
    transform_matrix: [1, 0, 0, 1, phaseIndex * 3, 0],
    bounding_box: { x: 4, y: 4, width: 56, height: 28 },
    z_index: 10,
    svg_attributes: { viewBox: '0 0 64 36' },
    media_time_ms: Math.round(sample.frame * 40),
    loaded_font_family: 'Fixture Sans',
    loaded_font_weight: 400,
    primary_material_consumer: {
      asset_id: shot.primary_material_asset_id,
      visible: true,
    },
    console_errors: [],
    network_requests: [],
    result_visible: phaseIndex >= 2 && sample.phase !== 'exit',
  };
}

export function createRuntimeProbe(block, scenario = 'passed') {
  const calls = [];
  const probeRuntime = async (request) => {
    calls.push(structuredClone(request));
    if (
      scenario === 'missing_end_to_t'
      && request.path === 'end_to_t'
    ) return null;
    const state = normalizedRuntimeState(block, request);
    if (scenario === 'state_mismatch' && request.path === 'zero_to_t') {
      state.class_list.push('diverged');
    }
    if (
      scenario === 'result_before_action'
      && request.phase === 'action'
    ) state.result_visible = true;
    if (scenario === 'repeat_drift' && request.path === 'repeat_to_t') {
      state.transform_matrix[4] += 1;
    }
    if (scenario === 'font_drift' && request.path === 'end_to_t') {
      state.loaded_font_family = 'system-ui';
    }
    if (scenario === 'network_request') {
      state.network_requests = ['https://cdn.invalid/runtime.js'];
    }
    if (scenario === 'console_error') {
      state.console_errors = ['runtime_failure'];
    }
    return state;
  };
  return { calls, probeRuntime };
}

export function mutatePixelFacts(block, scenario) {
  const facts = structuredClone(block.pixel_facts);
  const sample = facts.samples[0];
  if (scenario === 'near_black') {
    sample.mean_luma = 0;
  } else if (scenario === 'near_empty') {
    sample.visible_coverage_ratio = 0;
  } else if (scenario === 'transparent') {
    sample.alpha_coverage_ratio = 0;
  } else if (scenario === 'nan_transform') {
    sample.transform_matrix[0] = Number.NaN;
  } else if (scenario === 'dom_overflow') {
    sample.dom_overflow_px = 4;
  } else if (scenario === 'text_crop') {
    sample.text_clipped = true;
    sample.text_overflow_px = 3;
  } else if (scenario === 'primary_roi_zero') {
    sample.primary_roi_visible_ratio = 0;
  } else if (scenario === 'font_fallback') {
    sample.font_loaded = false;
    sample.font_family_match = false;
  } else if (scenario === 'hold_missing') {
    sample.result_visible = false;
  } else if (scenario === 'adjacent_identity') {
    facts.adjacent_pairs[0] = {
      ...facts.adjacent_pairs[0],
      phash_distance: 0,
      ssim: 1,
      geometry_changed: false,
      focal_changed: false,
      density_changed: false,
    };
  } else {
    throw new TypeError(`Unknown pixel mutation: ${scenario}`);
  }
  return facts;
}

export function blockGateCacheKey({
  gate,
  fixture,
  block,
}) {
  const stateOrFrame = gate === 'source-conformance-gate'
    ? hash({
      inspection_schema: 'block-source-structural-v1',
      parser_kinds: ['parse5', 'acorn', 'postcss'],
      hyperframes_version:
        fixture.validationPolicy.tool_bindings.hyperframes_version,
      declared_dependency_set_sha256: hash({
        materials: block.source_bundle.materials.map((material) => ({
          asset_id: material.asset_id,
          bytes_sha256: material.bytes_sha256,
        })),
        font: {
          family: block.source_bundle.font_package.family,
          bytes_sha256: block.source_bundle.font_package.bytes_sha256,
        },
      }),
    })
    : gate === 'runtime-seek-gate'
      ? block.block_manifest.runtime_sample_plan_sha256
      : hash({
        pixel_frame_plan_sha256:
          block.block_manifest.pixel_frame_plan_sha256,
        pixel_facts_sha256: hash(block.pixel_facts),
      });
  return hash({
    source_sha256: block.source_bundle.source_sha256,
    policy_sha256: fixture.validationPolicy.validation_policy_sha256,
    production_contract_sha256:
      fixture.productionContract.production_contract_sha256,
    renderer_version:
      fixture.validationPolicy.tool_bindings.renderer_version,
    hyperframes_version:
      fixture.validationPolicy.tool_bindings.hyperframes_version,
    state_or_frame: stateOrFrame,
  });
}

export function createSyntheticBlockReceipt({
  fixture,
  block,
  gate,
  sourceReceipt = null,
  runtimeReceipt = null,
  cacheStatus = 'miss',
}) {
  const bindingOverrides = {
    block_manifest_sha256:
      block.block_manifest.block_manifest_sha256,
    source_sha256: block.source_bundle.source_sha256,
  };
  if (gate !== 'source-conformance-gate') {
    bindingOverrides.source_conformance_receipt_sha256 =
      sourceReceipt.receipt_sha256;
  }
  if (gate === 'pixel-signal-gate') {
    bindingOverrides.runtime_seek_receipt_sha256 =
      runtimeReceipt.receipt_sha256;
  }
  const inputBindings = receiptBindings(
    gate,
    'block',
    fixture.productionContract,
    block.block_manifest.block_id,
    bindingOverrides,
  );
  return createGateReceipt({
    gate,
    phase: 'block',
    scope_id: block.block_manifest.block_id,
    productionContract: fixture.productionContract,
    input_bindings: inputBindings,
    status: 'passed',
    hard_failure_codes: [],
    warning_codes: [],
    metrics: {
      checked_shot_count: block.block_manifest.shot_ids.length,
      checked_sample_count: gate === 'runtime-seek-gate'
        ? block.runtime_sample_plan.length * 4
        : gate === 'pixel-signal-gate'
          ? block.pixel_facts.samples.length
          : block.source_bundle.files.length,
    },
    cache: {
      status: cacheStatus,
      cache_key_sha256: blockGateCacheKey({ gate, fixture, block }),
    },
    validationPolicy: fixture.validationPolicy,
  });
}

export function createSyntheticReceiptChain({
  fixture,
  block,
  cacheStatus = 'miss',
}) {
  const source = createSyntheticBlockReceipt({
    fixture,
    block,
    gate: 'source-conformance-gate',
    cacheStatus,
  });
  const runtime = createSyntheticBlockReceipt({
    fixture,
    block,
    gate: 'runtime-seek-gate',
    sourceReceipt: source,
    cacheStatus,
  });
  const pixel = createSyntheticBlockReceipt({
    fixture,
    block,
    gate: 'pixel-signal-gate',
    sourceReceipt: source,
    runtimeReceipt: runtime,
    cacheStatus,
  });
  return { source, runtime, pixel };
}

export function sourceGateInput(fixture, block) {
  return {
    prior_contract: fixture.priorContract,
    director_policy_receipt: fixture.directorPolicyReceipt,
    canonical_artifacts: fixture.canonicalArtifacts,
    asset_manifest: fixture.assetManifest,
    sealed_policy_receipt: fixture.sealedPolicyReceipt,
    production_contract: fixture.productionContract,
    validation_policy: fixture.validationPolicy,
    block_manifest: block.block_manifest,
    source_bundle: block.source_bundle,
  };
}

export function runtimeGateInput(fixture, block, sourceReceipt) {
  return {
    prior_contract: fixture.priorContract,
    director_policy_receipt: fixture.directorPolicyReceipt,
    canonical_artifacts: fixture.canonicalArtifacts,
    asset_manifest: fixture.assetManifest,
    sealed_policy_receipt: fixture.sealedPolicyReceipt,
    production_contract: fixture.productionContract,
    validation_policy: fixture.validationPolicy,
    block_manifest: block.block_manifest,
    source_bundle: block.source_bundle,
    source_conformance_receipt: sourceReceipt,
  };
}

export function pixelGateInput(
  fixture,
  block,
  sourceReceipt,
  runtimeReceipt,
  pixelFacts = block.pixel_facts,
) {
  return {
    prior_contract: fixture.priorContract,
    director_policy_receipt: fixture.directorPolicyReceipt,
    canonical_artifacts: fixture.canonicalArtifacts,
    asset_manifest: fixture.assetManifest,
    sealed_policy_receipt: fixture.sealedPolicyReceipt,
    production_contract: fixture.productionContract,
    validation_policy: fixture.validationPolicy,
    block_manifest: block.block_manifest,
    source_bundle: block.source_bundle,
    source_conformance_receipt: sourceReceipt,
    runtime_seek_receipt: runtimeReceipt,
    pixel_facts: pixelFacts,
  };
}

export function blockGateChainInput(fixture, blocks = fixture.blocks) {
  return {
    prior_contract: fixture.priorContract,
    director_policy_receipt: fixture.directorPolicyReceipt,
    canonical_artifacts: fixture.canonicalArtifacts,
    asset_manifest: fixture.assetManifest,
    sealed_policy_receipt: fixture.sealedPolicyReceipt,
    production_contract: fixture.productionContract,
    validation_policy: fixture.validationPolicy,
    blocks,
  };
}

export function hashOnlyCanonicalArtifacts(fixture) {
  return {
    parsed_srt_sha256:
      fixture.productionContract.parsed_srt_sha256,
    shot_plan_sha256:
      fixture.productionContract.shot_plan_sha256,
    design_system_sha256:
      fixture.productionContract.design_system_sha256,
    component_registry_sha256:
      fixture.productionContract.component_registry_sha256,
    validation_policy_sha256:
      fixture.productionContract.validation_policy_sha256,
    reference_style_profile_sha256:
      fixture.productionContract.reference_style_profile_sha256,
    font_package_sha256:
      fixture.productionContract.font_package_sha256,
    projection_sha256:
      fixture.productionContract.projection_sha256,
    delivery_profile_sha256:
      fixture.productionContract.delivery_profile_sha256,
  };
}

export function createMemoryCacheStore() {
  const records = new Map();
  return {
    records,
    async get(key) {
      return records.has(key) ? structuredClone(records.get(key)) : null;
    },
    async set(key, value) {
      records.set(key, structuredClone(value));
    },
  };
}
