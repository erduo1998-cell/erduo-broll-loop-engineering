import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createArtifactManifest, fingerprintArtifactValue } from './artifact-manifest.mjs';
import { orchestrateFixture } from './orchestrate-stages.mjs';
import { parseSrt } from './parse-srt.mjs';
import {
  loadPackagedDesignLibrary,
  selectDirectorDesign,
} from './select-design.mjs';
import { fingerprintValue } from './state.mjs';
import { validateDirectorBriefs } from './validate-director-brief.mjs';
import {
  replayValidatedDirectorDesignSelection,
  validateDirectorV2Chain,
} from './validate-director-v2-chain.mjs';
import { validateAndNormalizeShotPlan } from './validate-shot-plan.mjs';

const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const replayLibrary = await loadPackagedDesignLibrary();

function replayInputs() {
  const srt = parseSrt(
    '1\n00:00:00,000 --> 00:00:04,000\nA signal passes through a gate.',
  );
  const plan = validateAndNormalizeShotPlan(srt, {
    schema_version: 1,
    srt_sha256: srt.content_sha256,
    shots: [{
      shot_id: 'S001',
      cue_start: 1,
      cue_end: 1,
      narrated_claim: 'A signal passes through a gate.',
      transition_reason: 'opening',
    }],
    chapters: [{
      chapter_id: 'C001',
      shot_start: 'S001',
      shot_end: 'S001',
      title: 'Gate',
      purpose: 'Explain the process.',
    }],
  });
  const directorBriefs = validateDirectorBriefs(plan, {
    schema_version: 1,
    plan_sha256: plan.plan_sha256,
    briefs: [{
      shot_id: 'S001',
      comprehension_purpose: 'Understand a gated workflow.',
      semantic_type: 'process',
      representation: {
        mode: 'process-system',
        subjects: ['signal', 'gate'],
        relationship: 'The gate controls passage.',
        grounding: 'The gate physically represents a workflow condition.',
      },
      visible_action: {
        verb: 'filter',
        from_state: 'The signal waits before the gate.',
        to_state: 'The accepted signal exits the gate.',
      },
      result_state: {
        visible_outcome: 'The accepted signal remains beyond the gate.',
        hold_intent: 'normal',
      },
      evidence: {
        mode: 'abstract-relationship',
        source_ids: [],
        claim_handling: 'non-literal',
      },
      silent_test: {
        expected_guess: 'A gate admitted one signal.',
        visible_clues: ['gate opens', 'signal exits'],
        ambiguity_risk: 'Rejected signals must remain dim.',
        verdict: 'pass',
        review_note: 'The open gate distinguishes acceptance from waiting.',
      },
      asset_needs: {
        preferred_route: 'hyperframes-native',
        primary_compositing: 'fullscreen',
        query_subjects: [],
        prohibitions: ['subtitle card'],
      },
      anti_collision: {
        motif_id: 'M-S001-GATE',
        varied_dimensions: ['layout', 'primary-action'],
        complete_metaphor_reuse: false,
      },
    }],
  });
  const selectionContext = {
    schema_version: 1,
    briefs_sha256: directorBriefs.briefs_sha256,
    topic_tags: ['ai-tools', 'workflow'],
    moods: ['calm', 'technical'],
    aspect_ratio: '16:9',
    information_density: 3,
    user_design_defined_layers: [],
    recent_base_template_ids: [],
    used_signature_motif_ids: [],
    requested_borrows: [],
  };
  const designSelection = selectDirectorDesign(
    directorBriefs,
    selectionContext,
    replayLibrary,
  );
  const artifactSha256s = {
    director_briefs_artifact_sha256: hashBytes(Buffer.from(JSON.stringify(directorBriefs))),
    selection_context_artifact_sha256: hashBytes(Buffer.from(JSON.stringify(selectionContext))),
    design_selection_artifact_sha256: hashBytes(Buffer.from(JSON.stringify(designSelection))),
    design_library_artifact_sha256: hashBytes(Buffer.from(JSON.stringify(replayLibrary))),
  };
  return {
    shotPlan: plan,
    directorBriefs,
    selectionContext,
    designSelection,
    designLibrary: replayLibrary,
    artifactSha256s,
  };
}

async function fixture(t) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'director-v2-chain-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const project = path.join(temporary, 'project');
  await orchestrateFixture({ fixtureId: 'faceless-basic', projectRoot: project, testOnlyLegacyInspection: true });
  const root = path.join(project, '.erduo-hyperframes-broll', 'artifacts', 'director');
  const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
  const receipt = JSON.parse(await readFile(path.join(project, '.erduo-hyperframes-broll', 'receipts', 'director.json'), 'utf8'));
  return { root, manifest, review: receipt.output.main_review_refs[0] };
}

async function resign({ root, manifest, review }, mutate) {
  const next = structuredClone(manifest);
  const records = new Map(next.artifacts.map((record) => [record.artifact_id, record]));
  const selectionRecord = records.get('display-selection');
  const pageRecord = records.get('all-shot-review-page-001');
  const packetRecord = records.get('all-shot-review-index');
  const selection = JSON.parse(await readFile(path.join(root, selectionRecord.locator_key), 'utf8'));
  const page = JSON.parse(await readFile(path.join(root, pageRecord.locator_key), 'utf8'));
  mutate({ selection, page });
  const selectionBytes = Buffer.from(JSON.stringify(selection), 'utf8');
  const pageBytes = Buffer.from(JSON.stringify(page), 'utf8');
  await writeFile(path.join(root, selectionRecord.locator_key), selectionBytes);
  await writeFile(path.join(root, pageRecord.locator_key), pageBytes);
  Object.assign(selectionRecord, { sha256: hashBytes(selectionBytes), size_bytes: selectionBytes.length });
  Object.assign(pageRecord, { sha256: hashBytes(pageBytes), size_bytes: pageBytes.length });
  const packet = JSON.parse(await readFile(path.join(root, packetRecord.locator_key), 'utf8'));
  packet.display_selection_sha256 = selectionRecord.sha256;
  Object.assign(packet.pages[0], { sha256: pageRecord.sha256, size_bytes: pageRecord.size_bytes });
  const { packet_sha256: ignored, ...packetCore } = packet;
  packet.packet_sha256 = fingerprintArtifactValue(packetCore);
  const packetBytes = Buffer.from(JSON.stringify(packet), 'utf8');
  await writeFile(path.join(root, packetRecord.locator_key), packetBytes);
  Object.assign(packetRecord, { sha256: hashBytes(packetBytes), size_bytes: packetBytes.length });
  const resigned = createArtifactManifest(next);
  const nextReview = {
    ...review,
    subject_manifest_sha256: resigned.manifest_sha256,
    display_selection_sha256: selectionRecord.sha256,
    inspected_packet_sha256: packetRecord.sha256,
    inspected_page_sha256s: [pageRecord.sha256],
  };
  return { root, manifest: resigned, review: nextReview };
}

test('validates hashes before parsing and rejects tampered bytes, symlinks and locator escape', async (t) => {
  const tampered = await fixture(t);
  await writeFile(path.join(tampered.root, 'all-shot-review-page-001.json'), '[]');
  await assert.rejects(() => validateDirectorV2Chain({ ...tampered, shotPlanReview: tampered.review }), (error) => error.code === 'artifact_hash_mismatch');

  const linked = await fixture(t);
  const pagePath = path.join(linked.root, 'all-shot-review-page-001.json');
  await unlink(pagePath); await symlink(path.join(linked.root, 'shot-plan.json'), pagePath);
  await assert.rejects(() => validateDirectorV2Chain({ ...linked, shotPlanReview: linked.review }), (error) => error.code === 'artifact_symlink');

  const escaped = await fixture(t);
  escaped.manifest.artifacts.find((record) => record.artifact_id === 'shot-plan').locator_key = '../shot-plan.json';
  await assert.rejects(() => validateDirectorV2Chain({ ...escaped, shotPlanReview: escaped.review }), (error) => error.code === 'artifact_path_escape');
});

test('uses canonical display-selection equality and rejects a page with the wrong shot identity', async (t) => {
  const reordered = await fixture(t);
  const valid = await resign(reordered, ({ selection }) => {
    const entries = Object.entries(selection).reverse();
    for (const key of Object.keys(selection)) delete selection[key];
    for (const [key, value] of entries) selection[key] = value;
  });
  const result = await validateDirectorV2Chain({ ...valid, shotPlanReview: valid.review });
  assert.equal(result.shot_count, 2);
  assert.match(result.signature_audit_sha256, /^[0-9a-f]{64}$/u);

  const wrong = await fixture(t);
  const invalid = await resign(wrong, ({ page }) => { page[0].shot_id = 'S002'; });
  await assert.rejects(() => validateDirectorV2Chain({ ...invalid, shotPlanReview: invalid.review }), (error) => error.code === 'director_packet_incomplete');
});

test('production replay rejects brief, context, library, and self-consistent selection substitution', async () => {
  const input = replayInputs();
  const receipt = await replayValidatedDirectorDesignSelection(input);
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.allow_draft, false);
  assert.equal(
    receipt.native_compiler_source_bundle_sha256,
    replayLibrary.nativeBaseCompiler.native_compiler_source_bundle_sha256,
  );

  const changedContext = structuredClone(input.selectionContext);
  changedContext.user_design_defined_layers = [
    'visual_system',
    'scene_grammar',
    'motion_grammar',
    'compositing',
  ];
  await assert.rejects(
    replayValidatedDirectorDesignSelection({
      ...input,
      selectionContext: changedContext,
    }),
    (error) => [
      'selection_replay_mismatch',
      'invalid_context',
    ].includes(error.code),
  );

  const changedBriefs = structuredClone(input.directorBriefs);
  changedBriefs.briefs[0].semantic_type = 'concept';
  const { briefs_sha256: ignoredBriefsSha256, ...briefCore } =
    changedBriefs;
  changedBriefs.briefs_sha256 = fingerprintValue(briefCore);
  await assert.rejects(
    replayValidatedDirectorDesignSelection({
      ...input,
      directorBriefs: changedBriefs,
    }),
    (error) => [
      'invalid_context',
      'selection_replay_mismatch',
    ].includes(error.code),
  );

  const structurallyInvalidBriefs =
    structuredClone(input.directorBriefs);
  structurallyInvalidBriefs.briefs[0].unvalidated_extra = true;
  const {
    briefs_sha256: ignoredInvalidBriefsSha256,
    ...invalidBriefsCore
  } = structurallyInvalidBriefs;
  structurallyInvalidBriefs.briefs_sha256 =
    fingerprintValue(invalidBriefsCore);
  await assert.rejects(
    replayValidatedDirectorDesignSelection({
      ...input,
      directorBriefs: structurallyInvalidBriefs,
    }),
    (error) => error.code === 'director_briefs_replay_invalid',
  );

  const changedLibrary = structuredClone(replayLibrary);
  changedLibrary.nativeBaseCompiler.summary =
    `${changedLibrary.nativeBaseCompiler.summary} substituted`;
  await assert.rejects(
    replayValidatedDirectorDesignSelection({
      ...input,
      designLibrary: changedLibrary,
    }),
    (error) => error.code === 'director_design_library_replay_mismatch',
  );

  const changedSelection = selectDirectorDesign(
    input.directorBriefs,
    {
      ...input.selectionContext,
      user_design_defined_layers: [
        'visual_system',
        'scene_grammar',
        'motion_grammar',
        'compositing',
      ],
    },
    replayLibrary,
  );
  await assert.rejects(
    replayValidatedDirectorDesignSelection({
      ...input,
      designSelection: changedSelection,
    }),
    (error) => [
      'selection_replay_mismatch',
      'selection_tampered',
    ].includes(error.code),
  );
});

test('calibration replay needs explicit template and exact trusted option-state hash', async () => {
  const input = replayInputs();
  const selectionContext = {
    ...input.selectionContext,
    user_template_id: 'quiet-editorial-print',
  };
  const options = { allowDraft: true };
  const optionsSha256 =
    fingerprintArtifactValue({ allow_draft: true });
  const designSelection = selectDirectorDesign(
    input.directorBriefs,
    selectionContext,
    replayLibrary,
    options,
  );
  await assert.rejects(
    replayValidatedDirectorDesignSelection({
      ...input,
      selectionContext,
      designSelection,
      options,
    }),
    (error) => error.code === 'director_calibration_option_untrusted',
  );
  const receipt = await replayValidatedDirectorDesignSelection({
    ...input,
    selectionContext,
    designSelection,
    options,
    expectedOptionsSha256: optionsSha256,
  });
  assert.equal(receipt.allow_draft, true);
  assert.equal(receipt.selection_options_sha256, optionsSha256);
  assert.equal(receipt.base_template_id, 'quiet-editorial-print');
});
