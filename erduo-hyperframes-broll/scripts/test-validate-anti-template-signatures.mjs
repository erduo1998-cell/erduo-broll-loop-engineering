import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AntiTemplateSignatureError,
  deriveAntiTemplateSignatureFacts,
  validateAntiTemplateSignatures,
} from './validate-anti-template-signatures.mjs';
import { computeGeometrySignature } from './validate-design-slice.mjs';

const box = (x, y, width, height) => ({ x, y, width, height });

function shot(index, {
  familyId = `F0${((index - 1) % 9) + 1}`,
  grammarId = `G${String(((index - 1) % 10) + 1).padStart(2, '0')}`,
  geometryVariant = index,
  compositionSignature = `composition-${index}`,
  actionSignature = `action-${index}`,
  focusSignature = `focus-${index}`,
  copy = `第 ${index} 个语义结果`,
  continuityException = null,
} = {}) {
  const offset = (geometryVariant % 100) / 1000;
  const value = {
    shot_id: `S${String(index).padStart(3, '0')}`,
    composition: {
      family_id: familyId,
      composition_bbox: box(offset, 0.05, 0.72, 0.88),
      focus_bbox: box(offset + 0.04, 0.16, 0.28, 0.42),
      reading_path: [
        { order: 1, role: 'primary-title', bbox: box(offset + 0.34, 0.14, 0.32, 0.18) },
        { order: 2, role: 'material-result', bbox: box(offset + 0.04, 0.42, 0.34, 0.3) },
      ],
      negative_space: [
        { region_id: 'title-air', bbox: box(offset + 0.34, 0.05, 0.32, 0.08), responsibility: 'reading' },
      ],
      protected_regions: [
        { region_id: 'evidence-safe', bbox: box(offset + 0.04, 0.42, 0.34, 0.3), protects: 'evidence' },
      ],
    },
    typography: {
      elements: [{
        element_id: 'display-claim',
        role: 'display',
        content_lines: [copy],
        special_mode: 'oversized-editorial',
        renderer: 'html',
        bbox: box(offset + 0.34, 0.14, 0.32, 0.18),
      }],
    },
    motion: {
      grammar_id: grammarId,
      entry: { start_frame: 0, end_frame: 5 },
      action: { start_frame: 5, end_frame: 20 },
      result: { start_frame: 20, end_frame: 28 },
      hold: { start_frame: 28, end_frame: 45 },
      exit: { start_frame: 45, end_frame: 50 },
    },
    anti_template: {
      composition_signature: compositionSignature,
      action_signature: actionSignature,
      focus_signature: focusSignature,
      geometry_signature: '0'.repeat(64),
      continuity_exception: continuityException,
    },
  };
  value.anti_template.geometry_signature = computeGeometrySignature(value);
  return value;
}

function design(shots, dnaId = 'fixture-dna') {
  return {
    pipeline_contract_version: 2,
    style_dna: { dna_id: dnaId },
    shots,
  };
}

function repeatOptions(ordinal, { reason, semanticLink } = {}) {
  const explanations = {
    2: {
      reason: '反向因果刚刚被证据揭示，此处复现开场对象是为了让反证落回原命题。',
      semanticLink: 'counter-evidence-returns-to-opening-object',
    },
    3: {
      reason: '末段证据需要与问题首尾相扣，此处再次调用开场对象形成结论闭环。',
      semanticLink: 'closing-proof-resolves-opening-question',
    },
  };
  return {
    familyId: 'F01',
    grammarId: 'G01',
    geometryVariant: 1,
    compositionSignature: 'recurring-composition',
    actionSignature: 'recurring-action',
    focusSignature: 'recurring-focus',
    copy: '同一个章节回环视觉对象',
    continuityException: ordinal === 1 ? null : {
      content_driven: true,
      reason: reason ?? explanations[ordinal].reason,
      semantic_link: semanticLink ?? explanations[ordinal].semanticLink,
    },
  };
}

test('accepts two semantically and visually distinct non-layered DNA fixtures without forcing isomorphism', () => {
  const causalEditorial = design(
    Array.from({ length: 6 }, (_, index) => shot(index + 1, {
      familyId: ['F01', 'F04', 'F06', 'F02', 'F07', 'F09'][index],
      grammarId: ['G01', 'G04', 'G06', 'G02', 'G07', 'G09'][index],
      geometryVariant: index + 1,
      compositionSignature: `causal-topology-${index + 1}`,
      actionSignature: `causal-action-${index + 1}`,
      focusSignature: `causal-focus-${index + 1}`,
      copy: `政策反馈链第 ${index + 1} 个因果节点`,
    })),
    'kinetic-causal-editorial',
  );
  const archivalEvidence = design(
    Array.from({ length: 6 }, (_, index) => shot(index + 1, {
      familyId: ['F08', 'F03', 'F05', 'F01', 'F06', 'F04'][index],
      grammarId: ['G10', 'G03', 'G05', 'G08', 'G06', 'G04'][index],
      geometryVariant: index + 31,
      compositionSignature: `archive-topology-${index + 1}`,
      actionSignature: `archive-action-${index + 1}`,
      focusSignature: `archive-focus-${index + 1}`,
      copy: `档案证据第 ${index + 1} 个核验节点`,
    })),
    'quiet-archival-evidence',
  );
  const causal = validateAntiTemplateSignatures(causalEditorial);
  const archival = validateAntiTemplateSignatures(archivalEvidence);
  assert.equal(causal.ok, true);
  assert.equal(archival.ok, true);
  assert.notEqual(causal.signature_audit_sha256, archival.signature_audit_sha256);
  const causalFacts = deriveAntiTemplateSignatureFacts(causalEditorial);
  const archivalFacts = deriveAntiTemplateSignatureFacts(archivalEvidence);
  const causalCores = new Set(causalFacts.facts.map((item) => item.surface_core_sha256));
  assert.equal(archivalFacts.facts.some((item) => causalCores.has(item.surface_core_sha256)), false);
});

test('rejects unexplained non-adjacent high-frequency complete signatures', () => {
  const repeated = design(Array.from({ length: 5 }, (_, index) => {
    const ordinal = index + 1;
    return [1, 3, 5].includes(ordinal)
      ? shot(ordinal, { ...repeatOptions(1), continuityException: null })
      : shot(ordinal);
  }));
  assert.throws(
    () => validateAntiTemplateSignatures(repeated),
    (error) => error instanceof AntiTemplateSignatureError
      && error.code === 'full_film_complete_signature_repeat'
      && error.facts.unexplained_shot_ids.join(',') === 'S003,S005',
  );
});

test('accepts a specifically explained recurring motif and rejects copied exemption reasons', () => {
  const explained = design(Array.from({ length: 5 }, (_, index) => {
    const ordinal = index + 1;
    if (ordinal === 1) return shot(ordinal, repeatOptions(1));
    if (ordinal === 3) return shot(ordinal, repeatOptions(2));
    if (ordinal === 5) return shot(ordinal, repeatOptions(3));
    return shot(ordinal);
  }));
  assert.equal(validateAntiTemplateSignatures(explained).continuity_exception_count, 2);

  const copied = structuredClone(explained);
  copied.shots[4].anti_template.continuity_exception.reason =
    copied.shots[2].anti_template.continuity_exception.reason;
  assert.throws(
    () => validateAntiTemplateSignatures(copied),
    (error) => error.code === 'continuity_exception_unbounded',
  );
});

test('allows five occurrences in one hundred shots instead of treating a five-percent motif as a template', () => {
  const repeatedOrdinals = new Set([1, 21, 41, 61, 81]);
  const longDesign = design(Array.from({ length: 100 }, (_, index) => {
    const ordinal = index + 1;
    return repeatedOrdinals.has(ordinal)
      ? shot(ordinal, { ...repeatOptions(1), continuityException: null })
      : shot(ordinal);
  }));
  const result = validateAntiTemplateSignatures(longDesign);
  assert.equal(result.ok, true);
  assert.equal(
    result.complete_signature_groups.find((group) => group.count === 5).count,
    5,
  );
});

test('rejects high-frequency structural reuse whose declared composition and readable copy merely change', () => {
  const repeatedOrdinals = new Set([1, 3, 5, 7]);
  const surfaceVariants = design(Array.from({ length: 8 }, (_, index) => {
    const ordinal = index + 1;
    return repeatedOrdinals.has(ordinal)
      ? shot(ordinal, {
        familyId: 'F01',
        grammarId: 'G01',
        geometryVariant: ordinal,
        compositionSignature: `surface-label-${ordinal}`,
        actionSignature: 'surface-action',
        focusSignature: 'surface-focus',
        copy: `只替换第 ${ordinal} 个标题`,
      })
      : shot(ordinal);
  }));
  assert.throws(
    () => validateAntiTemplateSignatures(surfaceVariants),
    (error) => error.code === 'surface_variant_template_reuse',
  );
});

test('rejects forged geometry and an unlimited three-shot continuity chain', () => {
  const forged = design([shot(1)]);
  forged.shots[0].anti_template.geometry_signature = 'f'.repeat(64);
  assert.throws(
    () => validateAntiTemplateSignatures(forged),
    (error) => error.code === 'geometry_signature_mismatch',
  );

  const chained = design([
    shot(1, repeatOptions(1)),
    shot(2, repeatOptions(2)),
    shot(3, repeatOptions(3)),
  ]);
  assert.throws(
    () => validateAntiTemplateSignatures(chained),
    (error) => error.code === 'continuity_exception_unbounded',
  );
});
