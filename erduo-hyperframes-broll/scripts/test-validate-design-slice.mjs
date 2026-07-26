import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  DesignSliceError,
  computeGeometrySignature,
  validateDesignCapabilityRegistry,
  validateDesignSlice,
} from './validate-design-slice.mjs';
import { compileFrameProjection } from './compile-frame-projection.mjs';

const registry = JSON.parse(await readFile(new URL('../references/design-capability-registry.json', import.meta.url), 'utf8'));
const execFileAsync = promisify(execFile);
const sha = (letter) => letter.repeat(64);
const box = (x, y, width, height) => ({ x, y, width, height });

function shot(index, {
  startFrame = (index - 1) * 50,
  durationFrames = 50,
  startMs = (index - 1) * 2000,
  endMs = startMs + (durationFrames * 40),
  familyId = `F0${index}`,
  grammarId = `G0${index}`,
  x = (index - 1) * 0.08,
  copy = `第 ${index} 个结论`,
  compositionSignature = `composition-${index}`,
  actionSignature = `action-${index}`,
  focusSignature = `focus-${index}`,
  continuityException = null,
  secondTypeElement = null,
} = {}) {
  const value = {
    shot_id: `S${String(index).padStart(3, '0')}`,
    srt_window_ms: { start_ms: startMs, end_ms: endMs },
    start_frame: startFrame,
    duration_frames: durationFrames,
    semantic_claim: `第 ${index} 镜把口播中的因果关系转成可读结果。`,
    style_dna_use: {
      subject_title_relationship: '主体压住标题边缘，但不遮挡主要识别特征。',
      material_relationship: '真实材质承担语义证据，图形只负责建立关系。',
      negative_space_relationship: '右上留白负责引导首读标题并隔离主体。',
      type_contrast_relationship: '展示字形成重心，正文只承担解释层级。',
      edge_bleed_relationship: '主体可在下沿出血，事实文字保持在保护区内。',
    },
    composition: {
      family_id: familyId,
      selection_reason: `第 ${index} 镜需要把当前因果对象组织成明确阅读路径，因此选择这个构图拓扑。`,
      evidence_status: registry.composition_families.find((item) => item.id === familyId).evidence_status,
      composition_bbox: box(x, 0.05, 0.72, 0.88),
      focus_bbox: box(x + 0.04, 0.16, 0.28, 0.42),
      reading_path: [
        { order: 1, role: 'primary-title', bbox: box(x + 0.34, 0.14, 0.32, 0.18) },
        { order: 2, role: 'material-result', bbox: box(x + 0.04, 0.42, 0.34, 0.3) },
      ],
      negative_space: [
        { region_id: 'title-air', bbox: box(x + 0.34, 0.05, 0.32, 0.08), responsibility: 'reading' },
      ],
      protected_regions: [
        { region_id: 'evidence-safe', bbox: box(x + 0.04, 0.42, 0.34, 0.3), protects: 'evidence', reason: '结论所依赖的真实证据不能被文字或装饰遮挡。' },
      ],
    },
    typography: {
      selection_reason: `第 ${index} 镜用展示字建立首读层级，按语义断成明确行，并限制一个特殊模式避免装饰争抢材料焦点。`,
      elements: [
        {
          element_id: 'display-claim',
          role: 'display',
          content_lines: [copy],
          wrap_mode: 'explicit-only',
          font_id: 'fixture-display',
          font_family: 'Fixture Display Embedded',
          fallback_families: [],
          weight: 700,
          special_mode: 'oversized-editorial',
          renderer: 'html',
          factual: true,
          bbox: box(x + 0.34, 0.14, 0.32, 0.18),
        },
        ...(secondTypeElement ? [secondTypeElement] : []),
      ],
    },
    motion: {
      grammar_id: grammarId,
      selection_reason: `第 ${index} 镜必须让材料动作先发生再显露结论，因此选择这条因果动效语法。`,
      evidence_status: registry.motion_grammars.find((item) => item.id === grammarId).evidence_status,
      entry: { start_frame: 0, end_frame: 5, behavior: '主体从画外进入并建立第一视觉焦点。' },
      action: { start_frame: 5, end_frame: 20, behavior: '材料响应语义动作并显露因果关系。' },
      result: { start_frame: 20, end_frame: 28, behavior: '标题与材料锁定成一个可读的结果状态。' },
      hold: { start_frame: 28, end_frame: 45, behavior: '结果保持稳定，观众可以完整读取结论。' },
      exit: { start_frame: 45, end_frame: 50, behavior: '焦点沿阅读路径退出并交棒给下一镜。' },
    },
    anti_template: {
      composition_signature: compositionSignature,
      action_signature: actionSignature,
      focus_signature: focusSignature,
      geometry_signature: sha('0'),
      novelty_basis: `第 ${index} 镜使用这段口播独有的因果对象作为视觉结果，而不是替换模板文案。`,
      continuity_exception: continuityException,
    },
  };
  if (durationFrames !== 50) {
    value.motion = {
      grammar_id: grammarId,
      selection_reason: `第 ${index} 镜必须在最短帧窗内完整建立动作、结果、停留和交棒。`,
      evidence_status: registry.motion_grammars.find((item) => item.id === grammarId).evidence_status,
      entry: { start_frame: 0, end_frame: 1, behavior: '第一帧建立主体视觉焦点。' },
      action: { start_frame: 1, end_frame: 2, behavior: '第二帧执行唯一主要动作。' },
      result: { start_frame: 2, end_frame: 3, behavior: '第三帧形成可读取结果态。' },
      hold: { start_frame: 3, end_frame: 4, behavior: '第四帧保持结果供观众读取。' },
      exit: { start_frame: 4, end_frame: durationFrames, behavior: '最后阶段完成焦点交棒和退出。' },
    };
  }
  value.anti_template.geometry_signature = computeGeometrySignature(value);
  return value;
}

function document(shots = [shot(1), shot(2)]) {
  const parsedSrtSha256 = sha('c');
  const planSha256 = sha('a');
  const projection = compileFrameProjection({
    pipeline_contract_version: 2,
    artifact_id: 'projection-main',
    parsed_srt_sha256: parsedSrtSha256,
    plan_sha256: planSha256,
    fps: { numerator: 25, denominator: 1 },
    shots: shots.map((item) => ({
      shot_id: item.shot_id,
      start_ms: item.srt_window_ms.start_ms,
      end_ms: item.srt_window_ms.end_ms,
    })),
  });
  return {
    schema_version: 1,
    pipeline_contract_version: 2,
    registry_version: '1.0.0',
    parsed_srt_sha256: parsedSrtSha256,
    plan_sha256: planSha256,
    frame_projection: {
      artifact_id: projection.artifact_id,
      pipeline_contract_version: 2,
      contract: projection.contract,
      projection_sha256: projection.receipt.projection_sha256,
      parsed_srt_sha256: projection.parsed_srt_sha256,
      plan_sha256: projection.plan_sha256,
      fps: projection.fps,
      rule_version: projection.rule_version,
    },
    style_dna: {
      dna_id: 'editorial-material-dna',
      visual_invariants: ['每镜只有一个明确焦点', '材料关系先于装饰图形'],
      subject_title_relationship: '标题与主体发生遮挡或边缘关系，但不损伤识别。',
      material_relationship: '真实或生成材料负责承载语义证据。',
      negative_space_policy: '每块留白必须服务焦点、阅读、情绪、材料或转场。',
      type_contrast_relationship: '展示字、正文和元信息通过尺度与密度形成对比。',
      edge_bleed_relationship: '只允许非事实主体受控出血，文字与证据保持完整。',
      prohibited_directions: ['禁止连续中心卡片只换文字', '禁止默认青色 HUD 与发光圆角卡片'],
    },
    display_font_selection: {
      contract: 'scripts/validate-display-font-selection.mjs#user-local-v1',
      selection_sha256: sha('b'),
      source_kind: 'user-provided-local',
      primary_visual_dna: 'editorial-material-dna',
      display_font_id: 'fixture-display',
      required_roles: ['key-quote', 'chapter-focus', 'core-number', 'emphasis'],
    },
    shots,
  };
}

function projectionFor(value) {
  return compileFrameProjection({
    pipeline_contract_version: 2,
    artifact_id: value.frame_projection.artifact_id,
    parsed_srt_sha256: value.parsed_srt_sha256,
    plan_sha256: value.plan_sha256,
    fps: value.frame_projection.fps,
    shots: value.shots.map((item) => ({
      shot_id: item.shot_id,
      start_ms: item.srt_window_ms.start_ms,
      end_ms: item.srt_window_ms.end_ms,
    })),
  });
}

function validate(value, projection = projectionFor(value)) {
  return validateDesignSlice(value, { registry, projection });
}

function resign(value) {
  for (const item of value.shots) item.anti_template.geometry_signature = computeGeometrySignature(item);
  return value;
}

test('registry keeps all distilled F/G capabilities ineligible by default and outside layered scope', () => {
  const result = validateDesignCapabilityRegistry(registry);
  assert.equal(result.composition_families.length, 9);
  assert.equal(result.motion_grammars.length, 10);
  assert.equal([...result.composition_families, ...result.motion_grammars].every((item) => item.default_eligible === false), true);
  assert.equal(result.policy.scope_exclusions.includes('scene-kit'), true);
  assert.equal(result.policy.scope_exclusions.includes('layered-hero'), true);
});

test('CLI help prints usage and exits successfully', async () => {
  const script = fileURLToPath(new URL('./validate-design-slice.mjs', import.meta.url));
  const { stdout, stderr } = await execFileAsync(process.execPath, [script, '--help']);
  assert.match(stdout, /^Usage: node validate-design-slice\.mjs/u);
  assert.equal(stderr, '');
});

test('CLI requires and consumes the exact projection artifact', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'design-slice-'));
  const script = fileURLToPath(new URL('./validate-design-slice.mjs', import.meta.url));
  const value = document();
  const designPath = path.join(directory, 'design.json');
  const projectionPath = path.join(directory, 'projection.json');
  try {
    await Promise.all([
      writeFile(designPath, JSON.stringify(value), 'utf8'),
      writeFile(projectionPath, JSON.stringify(projectionFor(value)), 'utf8'),
    ]);
    const { stdout } = await execFileAsync(process.execPath, [script, designPath, '--projection', projectionPath]);
    assert.equal(JSON.parse(stdout).ok, true);
    await assert.rejects(execFileAsync(process.execPath, [script, designPath]), (error) => error.code === 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('validates and deterministically hashes a normal multi-shot design slice', () => {
  const first = validate(document());
  const second = validate(document());
  assert.equal(first.shot_count, 2);
  assert.equal(first.total_frames, 100);
  assert.match(first.design_slice_sha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(first, second);
});

test('validates an exact 30000/1001 projection and non-frame-aligned SRT boundaries', () => {
  const value = document([
    shot(1, { startMs: 0, endMs: 1001, startFrame: 0, durationFrames: 30 }),
    shot(2, { startMs: 1001, endMs: 2002, startFrame: 30, durationFrames: 30 }),
  ]);
  const projection = compileFrameProjection({
    pipeline_contract_version: 2,
    artifact_id: 'projection-main',
    parsed_srt_sha256: value.parsed_srt_sha256,
    plan_sha256: value.plan_sha256,
    fps: { numerator: 30000, denominator: 1001 },
    shots: value.shots.map((item) => ({
      shot_id: item.shot_id,
      start_ms: item.srt_window_ms.start_ms,
      end_ms: item.srt_window_ms.end_ms,
    })),
  });
  value.frame_projection = {
    artifact_id: projection.artifact_id,
    pipeline_contract_version: 2,
    contract: projection.contract,
    projection_sha256: projection.receipt.projection_sha256,
    parsed_srt_sha256: projection.parsed_srt_sha256,
    plan_sha256: projection.plan_sha256,
    fps: projection.fps,
    rule_version: projection.rule_version,
  };
  const result = validate(value, projection);
  assert.equal(result.total_frames, 60);
  assert.deepEqual(result.frame_projection.fps, { numerator: 30000, denominator: 1001 });
});

test('rejects missing, wrong or tampered projection bindings', () => {
  const missing = document();
  assert.throws(
    () => validateDesignSlice(missing, { registry }),
    (error) => error.code === 'frame_projection_required',
  );

  for (const mutate of [
    (value) => { value.parsed_srt_sha256 = sha('d'); },
    (value) => { value.plan_sha256 = sha('d'); },
    (value) => { value.frame_projection.fps.numerator = 30; },
    (value) => { value.frame_projection.rule_version = 'other-rule-v1'; },
    (value) => { value.frame_projection.projection_sha256 = sha('d'); },
  ]) {
    const value = document();
    const projection = projectionFor(value);
    mutate(value);
    assert.throws(() => validate(value, projection), (error) => [
      'frame_projection_binding_mismatch',
      'invalid_frame_projection_reference',
    ].includes(error.code));
  }
});

test('rejects missing or wrong design-slice pipeline contract versions', () => {
  for (const mutate of [
    (value) => { delete value.pipeline_contract_version; },
    (value) => { value.pipeline_contract_version = 1; },
  ]) {
    const value = document();
    const projection = projectionFor(value);
    mutate(value);
    assert.throws(
      () => validateDesignSlice(value, { registry, projection }),
      (error) => error.code === 'pipeline_upgrade_required',
    );
  }
  const missingProjectionVersion = document();
  const projection = projectionFor(missingProjectionVersion);
  delete missingProjectionVersion.frame_projection.pipeline_contract_version;
  assert.throws(
    () => validateDesignSlice(missingProjectionVersion, { registry, projection }),
    (error) => error.code === 'invalid_frame_projection_reference',
  );
});

test('rejects hand-edited frame mirrors and SRT millisecond windows', () => {
  const frameEdit = document();
  const projection = projectionFor(frameEdit);
  frameEdit.shots[1].start_frame += 1;
  assert.throws(() => validate(frameEdit, projection), (error) => error.code === 'frame_projection_mismatch');

  const srtEdit = document();
  const originalProjection = projectionFor(srtEdit);
  srtEdit.shots[1].srt_window_ms.start_ms += 1;
  assert.throws(() => validate(srtEdit, originalProjection), (error) => error.code === 'srt_projection_mismatch');
});

test('accepts normalized edge bboxes and the minimum five-frame lifecycle', () => {
  const boundaryShot = shot(1, { durationFrames: 5, startFrame: 0, familyId: 'F09', grammarId: 'G10', x: 0 });
  boundaryShot.composition.composition_bbox = box(0, 0, 1, 1);
  boundaryShot.composition.focus_bbox = box(0, 0, 1, 1);
  boundaryShot.composition.reading_path = [{ order: 1, role: 'full-frame-focus', bbox: box(0, 0, 1, 1) }];
  boundaryShot.composition.negative_space = [{ region_id: 'transition-air', bbox: box(0.99, 0.99, 0.01, 0.01), responsibility: 'transition' }];
  boundaryShot.composition.protected_regions = [];
  boundaryShot.typography.elements[0].bbox = box(0, 0, 1, 1);
  resign(document([boundaryShot]));
  const result = validate(document([boundaryShot]));
  assert.equal(result.total_frames, 5);
});

test('accepts an explicit content-driven exception only when adjacent signatures repeat', () => {
  const second = shot(2, {
    compositionSignature: 'composition-1',
    actionSignature: 'action-1',
    focusSignature: 'focus-1',
    continuityException: {
      content_driven: true,
      reason: '这两个连续语义点是同一个因果过程的输入与输出，必须保持视线锚点。',
      semantic_link: 'S001 建立输入，S002 在同一对象上显露不可逆的输出结果。',
    },
  });
  const result = validate(document([shot(1), second]));
  assert.equal(result.shot_count, 2);
});

test('accepts an explicit content-driven recurrence of an earlier complete non-adjacent signature', () => {
  const first = shot(1, {
    familyId: 'F01',
    grammarId: 'G01',
    x: 0,
    copy: '回环对象',
    compositionSignature: 'loop-composition',
    actionSignature: 'loop-action',
    focusSignature: 'loop-focus',
  });
  const middle = shot(2);
  const recurring = shot(3, {
    familyId: 'F01',
    grammarId: 'G03',
    x: 0,
    copy: '回环对象',
    compositionSignature: 'loop-composition',
    actionSignature: 'loop-action',
    focusSignature: 'loop-focus',
    continuityException: {
      content_driven: true,
      reason: '第三镜回到第一镜的因果对象，用相同结果态闭合章节问题。',
      semantic_link: 'S003 closes the causal loop opened by S001',
    },
  });
  const value = document([first, middle, recurring]);
  assert.equal(validate(value).shot_count, 3);
});

test('rejects out-of-range normalized composition geometry', () => {
  const value = document();
  value.shots[0].composition.focus_bbox = box(0.9, 0.1, 0.2, 0.2);
  assert.throws(() => validate(value), (error) => error instanceof DesignSliceError && error.code === 'invalid_bbox');
});

test('rejects composition or motion evidence statuses that do not match the registry', () => {
  const composition = document();
  composition.shots[0].composition.evidence_status = 'distilled-candidate-evidence';
  assert.throws(() => validate(composition), (error) => error.code === 'composition_evidence_mismatch');
  const motion = document();
  motion.shots[0].motion.evidence_status = 'distilled-candidate-evidence';
  assert.throws(() => validate(motion), (error) => error.code === 'motion_evidence_mismatch');
});

test('rejects gaps, overlaps and malformed Entry-Action-Result-Hold-Exit windows', () => {
  const gap = document();
  gap.shots[1].start_frame = 51;
  assert.throws(() => validate(gap), (error) => error.code === 'frame_projection_mismatch');
  const phaseGap = document();
  phaseGap.shots[0].motion.result.start_frame = 21;
  assert.throws(() => validate(phaseGap), (error) => error.code === 'invalid_frame_window');
  const badExit = document();
  badExit.shots[0].motion.exit.end_frame = 49;
  assert.throws(() => validate(badExit), (error) => error.code === 'invalid_frame_window');
});

test('rejects system or generic font fallback and selected display-font mismatch', () => {
  const system = document();
  system.shots[0].typography.elements[0].font_family = 'Fixture Display, sans-serif';
  assert.throws(() => validate(system), (error) => error.code === 'system_font_fallback');
  const fallback = document();
  fallback.shots[0].typography.elements[0].fallback_families = ['Arial'];
  assert.throws(() => validate(fallback), (error) => error.code === 'system_font_fallback');
  const mismatch = document();
  mismatch.shots[0].typography.elements[0].font_id = 'other-display';
  assert.throws(() => validate(mismatch), (error) => error.code === 'display_font_mismatch');
});

test('rejects factual text delegated to image generation and implicit line wrapping', () => {
  const generatedFact = document();
  generatedFact.shots[0].typography.elements[0].renderer = 'image-generation';
  assert.throws(() => validate(generatedFact), (error) => error.code === 'fact_text_image_generation');
  const implicitBreak = document();
  implicitBreak.shots[0].typography.elements[0].content_lines = ['第一行\n第二行'];
  assert.throws(() => validate(implicitBreak), (error) => error.code === 'invalid_line_breaks');
});

test('rejects missing or generic typography selection reasoning', () => {
  const missing = document();
  delete missing.shots[0].typography.selection_reason;
  assert.throws(() => validate(missing), (error) => error.code === 'invalid_typography');
  const generic = document();
  generic.shots[0].typography.selection_reason = '好看';
  assert.throws(() => validate(generic), (error) => error.code === 'invalid_typography');
});

test('rejects more than one special typography mode in one shot', () => {
  const value = document();
  value.shots[0].typography.elements.push({
    element_id: 'brush-note',
    role: 'meta',
    content_lines: ['人工确认笔触'],
    wrap_mode: 'explicit-only',
    font_id: 'fixture-meta',
    font_family: 'Fixture Meta Embedded',
    fallback_families: [],
    weight: 500,
    special_mode: 'brush-vector',
    renderer: 'svg',
    factual: false,
    bbox: box(0.1, 0.78, 0.24, 0.1),
  });
  resign(value);
  assert.throws(() => validate(value), (error) => error.code === 'multiple_special_type_modes');
});

test('rejects adjacent repeated composition-action-focus signatures without a content exception', () => {
  const value = document([
    shot(1),
    shot(2, {
      compositionSignature: 'composition-1',
      actionSignature: 'action-1',
      focusSignature: 'focus-1',
    }),
  ]);
  assert.throws(() => validate(value), (error) => error.code === 'adjacent_signature_repeat');
});

test('rejects one composition family repeated for more than two shots', () => {
  const value = document([
    shot(1, { familyId: 'F04' }),
    shot(2, { familyId: 'F04' }),
    shot(3, { startFrame: 100, familyId: 'F04', grammarId: 'G03' }),
  ]);
  assert.throws(() => validate(value), (error) => error.code === 'composition_family_overuse');
});

test('rejects unchanged adjacent geometry with only readable copy replaced', () => {
  const first = shot(1);
  const second = structuredClone(first);
  second.shot_id = 'S002';
  second.srt_window_ms = { start_ms: 2000, end_ms: 4000 };
  second.start_frame = 50;
  second.semantic_claim = '第二镜只是替换文案，但没有重新组织视觉关系。';
  second.typography.elements[0].content_lines = ['换了一句话'];
  second.anti_template.composition_signature = 'declared-composition-change';
  second.anti_template.action_signature = 'declared-action-change';
  second.anti_template.focus_signature = 'declared-focus-change';
  second.anti_template.novelty_basis = '虽然声明不同签名，但几何没有变化，所以这个镜头必须被确定性拒绝。';
  const value = resign(document([first, second]));
  assert.throws(() => validate(value), (error) => error.code === 'text_only_geometry_change');
});

test('rejects forged geometry signatures and unused continuity exceptions', () => {
  const forged = document();
  forged.shots[0].anti_template.geometry_signature = sha('f');
  assert.throws(() => validate(forged), (error) => error.code === 'geometry_signature_mismatch');
  const unused = document();
  unused.shots[1].anti_template.continuity_exception = {
    content_driven: true,
    reason: '这一例外没有对应重复签名，因此不允许作为预防性豁免存在。',
    semantic_link: 'S001 与 S002 的签名本来就不同。',
  };
  assert.throws(() => validate(unused), (error) => error.code === 'unused_continuity_exception');
});
