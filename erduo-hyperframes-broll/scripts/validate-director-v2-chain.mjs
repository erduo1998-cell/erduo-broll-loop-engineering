import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateFrameProjection } from './compile-frame-projection.mjs';
import { validateDesignSlice } from './validate-design-slice.mjs';
import { validateAntiTemplateSignatures } from './validate-anti-template-signatures.mjs';
import { fingerprintArtifactValue, validateArtifactManifest } from './artifact-manifest.mjs';
import { validateManifestMainReviewPacket } from './validate-main-review-packets.mjs';
import { validateFontPackage } from './validate-font-package.mjs';
import { validateDirectorBriefs } from './validate-director-brief.mjs';
import { validateVisualGrammarProgram } from './validate-visual-grammar-program.mjs';
import { validateWholeFilmRules } from './validate-whole-film-rules.mjs';
import {
  designLibrarySnapshotSha256,
  loadPackagedDesignLibrary,
  replayDirectorDesignSelection,
} from './select-design.mjs';
import { fingerprintRenderValue } from './state.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT_ID = /^S[0-9]{3}$/u;
const REQUIRED_ARTIFACTS = [
  'director-method',
  'shot-plan',
  'design-slice',
  'display-selection',
  'frame-projection',
  'design-capability-registry',
  'all-shot-review-index',
];
const CURRENT_AUTHORING_ARTIFACTS = [
  'director-briefs',
  'design-selection-context',
  'design-selection-replay-receipt',
  'design-selection',
  'selected-template',
  'design-library-snapshot',
  'font-package',
  'visual-grammar-program',
  'whole-film-rules',
];

export class DirectorV2ChainError extends Error {
  constructor(code, message) { super(message); this.name = 'DirectorV2ChainError'; this.code = code; }
}
const fail = (code, message) => { throw new DirectorV2ChainError(code, message); };
const exact = (value, fields, code = 'director_chain_invalid') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(code, 'Director version-2 chain has an invalid shape.');
};
const designValidationOptions = (
  designSelection,
  effectiveBase,
  designLibrary,
) => ({
  designSelection,
  designLibrary,
  ...(designSelection?.base_template === 'hyperframes-native'
    ? { nativeBaseCompiler: effectiveBase }
    : { baseTemplate: effectiveBase }),
});
const REPLAY_RECEIPT_FIELDS = [
  'schema_version',
  'pipeline_contract_version',
  'artifact_type',
  'status',
  'director_briefs_artifact_sha256',
  'selection_context_artifact_sha256',
  'design_selection_artifact_sha256',
  'design_library_artifact_sha256',
  'briefs_sha256',
  'design_selection_sha256',
  'design_library_snapshot_sha256',
  'design_library_runtime_sha256',
  'native_compiler_source_bundle_sha256',
  'selection_options_sha256',
  'allow_draft',
  'base_template_id',
  'base_template_sha256',
  'visual_grammar_guard_code',
  'replay_receipt_sha256',
];

function selectionReplayOptions(value, selectionContext, packagedLibrary, expectedSha256) {
  const options = value ?? { allowDraft: false };
  exact(
    options,
    ['allowDraft'],
    'director_selection_options_invalid',
  );
  if (typeof options.allowDraft !== 'boolean') {
    fail(
      'director_selection_options_invalid',
      'Director design-selection replay options are invalid.',
    );
  }
  const optionsSha256 = fingerprintArtifactValue({
    allow_draft: options.allowDraft,
  });
  if (options.allowDraft) {
    const calibrationIds =
      packagedLibrary.policy?.selection?.calibration_only_template_ids;
    if (!Array.isArray(calibrationIds)
      || !calibrationIds.includes(selectionContext?.user_template_id)
      || expectedSha256 !== optionsSha256) {
      fail(
        'director_calibration_option_untrusted',
        'Draft calibration is allowed only through a trusted option binding that explicitly names a calibration-only template.',
      );
    }
  } else if (expectedSha256 !== undefined
    && expectedSha256 !== optionsSha256) {
    fail(
      'director_selection_options_mismatch',
      'Director design-selection replay options differ from the trusted run-state binding.',
    );
  }
  return { options, optionsSha256 };
}

export function validateDirectorDesignSelectionReplayReceipt(
  receipt,
  expected = {},
) {
  exact(
    receipt,
    REPLAY_RECEIPT_FIELDS,
    'director_selection_replay_receipt_invalid',
  );
  const { replay_receipt_sha256: declaredSha256, ...core } = receipt;
  if (receipt.schema_version !== 1
    || receipt.pipeline_contract_version !== 2
    || receipt.artifact_type !== 'director-design-selection-replay-receipt'
    || receipt.status !== 'passed'
    || REPLAY_RECEIPT_FIELDS
      .filter((field) => field.endsWith('_sha256'))
      .some((field) => !SHA256.test(receipt[field] ?? ''))
    || typeof receipt.allow_draft !== 'boolean'
    || typeof receipt.base_template_id !== 'string'
    || !receipt.base_template_id
    || typeof receipt.visual_grammar_guard_code !== 'string'
    || !receipt.visual_grammar_guard_code
    || declaredSha256 !== fingerprintArtifactValue(core)) {
    fail(
      'director_selection_replay_receipt_invalid',
      'Director design-selection replay receipt is invalid.',
    );
  }
  for (const [field, value] of Object.entries(expected)) {
    if (value !== undefined && receipt[field] !== value) {
      fail(
        'director_selection_replay_receipt_mismatch',
        'Director design-selection replay receipt differs from the expected frozen chain.',
      );
    }
  }
  return receipt;
}

export async function replayValidatedDirectorDesignSelection({
  shotPlan,
  directorBriefs,
  selectionContext,
  designSelection,
  designLibrary,
  artifactSha256s,
  options,
  expectedOptionsSha256,
  loadLibrary = loadPackagedDesignLibrary,
}) {
  exact(artifactSha256s, [
    'director_briefs_artifact_sha256',
    'selection_context_artifact_sha256',
    'design_selection_artifact_sha256',
    'design_library_artifact_sha256',
  ], 'director_selection_replay_input_invalid');
  if (Object.values(artifactSha256s).some((value) => !SHA256.test(value ?? ''))) {
    fail(
      'director_selection_replay_input_invalid',
      'Director design-selection replay requires exact artifact hashes.',
    );
  }
  try {
    exact(
      directorBriefs,
      [
        'schema_version',
        'plan_sha256',
        'brief_count',
        'briefs',
        'briefs_sha256',
      ],
      'director_briefs_replay_invalid',
    );
    const normalizedBriefs = validateDirectorBriefs(shotPlan, {
      schema_version: directorBriefs.schema_version,
      plan_sha256: directorBriefs.plan_sha256,
      briefs: directorBriefs.briefs.map((brief) => {
        const { duration_ms: ignoredDuration, ...inputBrief } = brief;
        return inputBrief;
      }),
    });
    if (fingerprintRenderValue(normalizedBriefs)
        !== fingerprintRenderValue(directorBriefs)) {
      fail(
        'director_briefs_replay_invalid',
        'Frozen director briefs do not equal the validated canonical briefs for the current shot plan.',
      );
    }
  } catch (error) {
    if (error instanceof DirectorV2ChainError) throw error;
    fail(
      'director_briefs_replay_invalid',
      error?.message
        ?? 'Frozen director briefs failed canonical validation.',
    );
  }
  const packagedLibrary = await loadLibrary();
  let actualRuntimeSha256;
  let packagedRuntimeSha256;
  try {
    actualRuntimeSha256 = fingerprintRenderValue(designLibrary);
    packagedRuntimeSha256 = fingerprintRenderValue(packagedLibrary);
  } catch {
    fail(
      'director_design_library_replay_mismatch',
      'Director design library cannot be canonically replayed.',
    );
  }
  if (actualRuntimeSha256 !== packagedRuntimeSha256) {
    fail(
      'director_design_library_replay_mismatch',
      'Frozen director design library differs from the loaded packaged runtime library.',
    );
  }
  const replayOptions = selectionReplayOptions(
    options,
    selectionContext,
    packagedLibrary,
    expectedOptionsSha256,
  );
  let replay;
  try {
    replay = replayDirectorDesignSelection(
      directorBriefs,
      selectionContext,
      packagedLibrary,
      designSelection,
      replayOptions.options,
    );
  } catch (error) {
    fail(
      error?.code ?? 'director_selection_replay_failed',
      error?.message
        ?? 'Director design selection does not replay from current inputs.',
    );
  }
  const core = {
    schema_version: 1,
    pipeline_contract_version: 2,
    artifact_type: 'director-design-selection-replay-receipt',
    status: 'passed',
    ...artifactSha256s,
    briefs_sha256: directorBriefs.briefs_sha256,
    design_selection_sha256: replay.selection_sha256,
    design_library_snapshot_sha256:
      designLibrarySnapshotSha256(packagedLibrary),
    design_library_runtime_sha256: packagedRuntimeSha256,
    native_compiler_source_bundle_sha256:
      packagedLibrary.nativeBaseCompiler.native_compiler_source_bundle_sha256,
    selection_options_sha256: replayOptions.optionsSha256,
    allow_draft: replayOptions.options.allowDraft,
    base_template_id: replay.base_template,
    base_template_sha256: replay.base_template_sha256,
    visual_grammar_guard_code:
      replay.visual_grammar_compilation.guard_code,
  };
  return validateDirectorDesignSelectionReplayReceipt({
    ...core,
    replay_receipt_sha256: fingerprintArtifactValue(core),
  });
}

async function readJsonArtifact(root, record) {
  let value;
  try { value = JSON.parse(await readFile(path.resolve(root, record.locator_key), 'utf8')); } catch { fail('director_artifact_unreadable', `Director artifact ${record.artifact_id} is not readable JSON.`); }
  return value;
}

export async function validateDirectorV2Chain({
  manifest,
  root,
  shotPlanReview,
  factsOnly = false,
  designSelectionReplayOptions,
  expectedDesignSelectionOptionsSha256,
}) {
  if (manifest?.pipeline_contract_version !== 2) fail('pipeline_upgrade_required', 'Director chain requires pipeline contract version 2.');
  if (manifest.stage !== 'director') fail('director_chain_invalid', 'Director chain must use the director manifest.');
  await validateArtifactManifest(manifest, { root, expectedStage: 'director' });
  const records = new Map(manifest.artifacts.map((record) => [record.artifact_id, record]));
  for (const artifactId of REQUIRED_ARTIFACTS) if (!records.has(artifactId)) fail('director_artifact_missing', `Director manifest is missing ${artifactId}.`);
  if (factsOnly) {
    for (const artifactId of CURRENT_AUTHORING_ARTIFACTS) {
      if (!records.has(artifactId)) {
        fail(
          'director_artifact_missing',
          `Current director manifest is missing ${artifactId}.`,
        );
      }
    }
  }
  const pageRecords = manifest.artifacts.filter((record) => record.artifact_id.startsWith('all-shot-review-page-'));
  if (!pageRecords.length) fail('director_packet_incomplete', 'Director manifest must contain at least one all-shot review page.');

  const [plan, designSlice, displaySelection, projection, registry, packet] = await Promise.all([
    readJsonArtifact(root, records.get('shot-plan')),
    readJsonArtifact(root, records.get('design-slice')),
    readJsonArtifact(root, records.get('display-selection')),
    readJsonArtifact(root, records.get('frame-projection')),
    readJsonArtifact(root, records.get('design-capability-registry')),
    readJsonArtifact(root, records.get('all-shot-review-index')),
  ]);
  let currentAuthoring = null;
  if (factsOnly) {
    const [
      directorBriefs,
      selectionContext,
      frozenSelectionReplayReceipt,
      designSelection,
      baseTemplate,
      designLibrary,
      fontPackage,
      visualGrammarProgram,
      wholeFilmRules,
    ] = await Promise.all(CURRENT_AUTHORING_ARTIFACTS.map(
      (artifactId) => readJsonArtifact(root, records.get(artifactId)),
    ));
    let fontReceipt;
    let visualReceipt;
    let rulesReceipt;
    let selectionReplayReceipt;
    try {
      selectionReplayReceipt =
        await replayValidatedDirectorDesignSelection({
          shotPlan: plan,
          directorBriefs,
          selectionContext,
          designSelection,
          designLibrary,
          artifactSha256s: {
            director_briefs_artifact_sha256:
              records.get('director-briefs').sha256,
            selection_context_artifact_sha256:
              records.get('design-selection-context').sha256,
            design_selection_artifact_sha256:
              records.get('design-selection').sha256,
            design_library_artifact_sha256:
              records.get('design-library-snapshot').sha256,
          },
          options: designSelectionReplayOptions,
          expectedOptionsSha256:
            expectedDesignSelectionOptionsSha256,
        });
      validateDirectorDesignSelectionReplayReceipt(
        frozenSelectionReplayReceipt,
      );
      if (fingerprintArtifactValue(frozenSelectionReplayReceipt)
          !== fingerprintArtifactValue(selectionReplayReceipt)) {
        fail(
          'director_selection_replay_receipt_mismatch',
          'Frozen director selection-replay receipt differs from independent replay.',
        );
      }
      fontReceipt = validateFontPackage(fontPackage, {
        artifactManifest: manifest,
      });
      visualReceipt = validateVisualGrammarProgram(visualGrammarProgram, {
        projection,
        ...designValidationOptions(
          designSelection,
          baseTemplate,
          designLibrary,
        ),
      });
      rulesReceipt = validateWholeFilmRules(wholeFilmRules, {
        visualGrammarProgram,
        projection,
        ...designValidationOptions(
          designSelection,
          baseTemplate,
          designLibrary,
        ),
      });
    } catch (error) {
      fail(
        error?.code ?? 'director_authoring_artifact_invalid',
        error?.message
          ?? 'Director visual grammar, rules, design, or font package is invalid.',
      );
    }
    if (visualGrammarProgram.bindings.design_slice_sha256
        !== records.get('design-slice').sha256
      || visualGrammarProgram.bindings.display_selection_sha256
        !== records.get('display-selection').sha256
      || visualGrammarProgram.bindings.font_package_sha256
        !== fontReceipt.font_package_sha256
      || wholeFilmRules.bindings.visual_grammar_program_sha256
        !== visualReceipt.program_sha256) {
      fail(
        'director_chain_unbound',
        'Director design, display, font, visual grammar, and whole-film rules are not one frozen chain.',
      );
    }
    currentAuthoring = {
      directorBriefs,
      selectionContext,
      designSelection,
      baseTemplate,
      designLibrary,
      fontPackage,
      visualGrammarProgram,
      wholeFilmRules,
      fontReceipt,
      visualReceipt,
      rulesReceipt,
      selectionReplayReceipt,
      selectionReplayArtifactSha256:
        records.get('design-selection-replay-receipt').sha256,
    };
  }
  if (plan?.pipeline_contract_version !== 2 || !SHA256.test(plan.parsed_srt_sha256 ?? '') || !Array.isArray(plan.shots) || !plan.shots.length) fail('shot_plan_invalid', 'Director shot plan lacks version-2 SRT bindings.');
  for (const [index, shot] of plan.shots.entries()) {
    if (shot?.shot_id !== `S${String(index + 1).padStart(3, '0')}` || !SHOT_ID.test(shot.shot_id)
      || !Number.isSafeInteger(shot.start_ms) || !Number.isSafeInteger(shot.end_ms) || shot.end_ms <= shot.start_ms) fail('shot_plan_invalid', 'Director shot plan windows are invalid.');
  }
  const validatedProjection = validateFrameProjection(projection);
  const validatedDesign = validateDesignSlice(designSlice, { registry, projection: validatedProjection });
  const signatureAudit = validateAntiTemplateSignatures(validatedDesign);
  if (designSlice.plan_sha256 !== records.get('shot-plan').sha256
    || designSlice.parsed_srt_sha256 !== plan.parsed_srt_sha256
    || fingerprintArtifactValue(displaySelection) !== fingerprintArtifactValue(designSlice.display_font_selection)) {
    fail('director_chain_unbound', 'Plan, design slice and display selection do not bind the same frozen chain.');
  }
  if (validatedProjection.plan_sha256 !== designSlice.plan_sha256
    || validatedProjection.parsed_srt_sha256 !== designSlice.parsed_srt_sha256
    || validatedDesign.shot_count !== plan.shots.length) fail('director_chain_unbound', 'Projection or design-slice shot identity does not match the plan.');

  const currentPacketBindings = [
    'director_briefs_sha256',
    'design_selection_context_sha256',
    'design_selection_sha256',
    'design_selection_replay_sha256',
    'selected_template_sha256',
    'design_library_snapshot_sha256',
    'font_package_sha256',
    'visual_grammar_program_sha256',
    'whole_film_rules_sha256',
  ];
  const packetFields = [
    'schema_version',
    'pipeline_contract_version',
    'parsed_srt_sha256',
    'shot_plan_sha256',
    'design_slice_sha256',
    'display_selection_sha256',
    'projection_sha256',
    ...(factsOnly ? currentPacketBindings : []),
    'registry_version',
    'shot_count',
    'pages',
    'packet_sha256',
  ];
  exact(packet, packetFields);
  const packetCore = Object.fromEntries(
    packetFields
      .filter((field) => field !== 'packet_sha256')
      .map((field) => [field, packet[field]]),
  );
  if (packet.schema_version !== 1 || packet.pipeline_contract_version !== 2
    || packet.parsed_srt_sha256 !== plan.parsed_srt_sha256
    || packet.shot_plan_sha256 !== records.get('shot-plan').sha256
    || packet.design_slice_sha256 !== records.get('design-slice').sha256
    || packet.display_selection_sha256 !== records.get('display-selection').sha256
    || packet.projection_sha256 !== records.get('frame-projection').sha256
    || factsOnly && (
      packet.director_briefs_sha256
        !== records.get('director-briefs').sha256
      || packet.design_selection_context_sha256
        !== records.get('design-selection-context').sha256
      || packet.design_selection_sha256
        !== records.get('design-selection').sha256
      || packet.design_selection_replay_sha256
        !== records.get('design-selection-replay-receipt').sha256
      || packet.selected_template_sha256
        !== records.get('selected-template').sha256
      || packet.design_library_snapshot_sha256
        !== records.get('design-library-snapshot').sha256
      || packet.font_package_sha256 !== records.get('font-package').sha256
      || packet.visual_grammar_program_sha256
        !== records.get('visual-grammar-program').sha256
      || packet.whole_film_rules_sha256
        !== records.get('whole-film-rules').sha256
    )
    || packet.registry_version !== registry.registry_version
    || packet.packet_sha256 !== fingerprintArtifactValue(packetCore)
    || packet.shot_count !== plan.shots.length || !Array.isArray(packet.pages) || packet.pages.length !== pageRecords.length) {
    fail('director_packet_unbound', 'All-shot packet does not bind the complete director artifact set.');
  }
  let nextShot = 1;
  const inspectedPageSha256s = [];
  for (const page of packet.pages) {
    exact(page, ['artifact_id', 'sha256', 'size_bytes', 'shot_start', 'shot_end']);
    const record = records.get(page.artifact_id);
    if (!record || record.sha256 !== page.sha256 || !pageRecords.includes(record)
      || record.size_bytes !== page.size_bytes
      || page.shot_start !== nextShot || !Number.isSafeInteger(page.shot_end) || page.shot_end < page.shot_start) fail('director_packet_incomplete', 'All-shot packet pages are missing, unbound or non-contiguous.');
    const rows = await readJsonArtifact(root, record);
    if (!Array.isArray(rows) || rows.length !== page.shot_end - page.shot_start + 1) fail('director_packet_incomplete', 'All-shot packet page does not cover its declared shots.');
    for (const [offset, row] of rows.entries()) {
      const expectedShotId = `S${String(page.shot_start + offset).padStart(3, '0')}`;
      if (row?.shot_id !== expectedShotId) fail('director_packet_incomplete', 'All-shot packet rows do not match the declared contiguous shot range.');
    }
    nextShot = page.shot_end + 1;
    inspectedPageSha256s.push(record.sha256);
  }
  if (nextShot !== plan.shots.length + 1) fail('director_packet_incomplete', 'All-shot packet does not cover every shot.');

  if (!factsOnly) {
    if (!shotPlanReview || shotPlanReview.gate !== 'shot_plan_review' || shotPlanReview.status !== 'approved'
      || shotPlanReview.subject_manifest_sha256 !== manifest.manifest_sha256
      || shotPlanReview.reviewer_isolation_sha256 === manifest.producer_isolation_sha256
      || shotPlanReview.parsed_srt_sha256 !== plan.parsed_srt_sha256
      || shotPlanReview.shot_plan_sha256 !== records.get('shot-plan').sha256
      || shotPlanReview.design_slice_sha256 !== records.get('design-slice').sha256
      || shotPlanReview.display_selection_sha256 !== records.get('display-selection').sha256
      || shotPlanReview.projection_sha256 !== records.get('frame-projection').sha256
      || shotPlanReview.inspected_packet_sha256 !== records.get('all-shot-review-index').sha256
      || JSON.stringify(shotPlanReview.inspected_page_sha256s) !== JSON.stringify(inspectedPageSha256s)) {
      fail('director_review_unbound', 'Parent shot-plan review does not bind the complete inspected director chain.');
    }
    try {
      await validateManifestMainReviewPacket({
        review: shotPlanReview,
        manifest,
        root,
      });
    } catch (error) {
      fail(error?.code ?? 'director_review_unbound', error?.message ?? 'Shot-plan review authority is invalid.');
    }
  }
  const currentReceipt = factsOnly ? {
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    design_selection_replay_sha256:
      currentAuthoring.selectionReplayReceipt.replay_receipt_sha256,
    design_selection_replay_artifact_sha256:
      currentAuthoring.selectionReplayArtifactSha256,
    design_selection_sha256:
      currentAuthoring.designSelection.selection_sha256,
    base_template_id: currentAuthoring.visualGrammarProgram.bindings
      .base_template_id,
    base_template_sha256: currentAuthoring.visualGrammarProgram.bindings
      .base_template_sha256,
    design_library_snapshot_sha256:
      currentAuthoring.visualGrammarProgram.bindings
        .design_library_snapshot_sha256,
    font_package_sha256:
      currentAuthoring.fontReceipt.font_package_sha256,
    visual_grammar_program_sha256:
      currentAuthoring.visualReceipt.program_sha256,
    whole_film_rules_sha256:
      currentAuthoring.rulesReceipt.whole_film_rules_sha256,
    projection_sha256:
      validatedProjection.receipt.projection_sha256,
  } : {};
  return {
    pipeline_contract_version: 2,
    resume_eligible: true,
    ...(factsOnly ? { approval_basis: 'deterministic-director-facts' } : {}),
    ...(factsOnly ? {
      design_selection_replay_receipt:
        currentAuthoring.selectionReplayReceipt,
    } : {}),
    shot_count: plan.shots.length,
    plan_sha256: records.get('shot-plan').sha256,
    design_slice_sha256: records.get('design-slice').sha256,
    signature_audit_sha256: signatureAudit.signature_audit_sha256,
    packet_sha256: records.get('all-shot-review-index').sha256,
    inspected_page_sha256s: inspectedPageSha256s,
    ...currentReceipt,
    ...(factsOnly ? {
      deterministic_facts_sha256: fingerprintArtifactValue({
        shot_count: plan.shots.length,
        plan_sha256: records.get('shot-plan').sha256,
        design_slice_sha256: records.get('design-slice').sha256,
        signature_audit_sha256: signatureAudit.signature_audit_sha256,
        packet_sha256: records.get('all-shot-review-index').sha256,
        inspected_page_sha256s: inspectedPageSha256s,
        ...currentReceipt,
      }),
    } : {}),
  };
}

export async function validateDirectorFactsV2Chain(options) {
  return validateDirectorV2Chain({
    ...options,
    shotPlanReview: null,
    factsOnly: true,
  });
}
