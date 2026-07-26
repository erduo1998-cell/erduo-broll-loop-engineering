import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSrt } from './parse-srt.mjs';
import { validateAndNormalizeShotPlan } from './validate-shot-plan.mjs';
import { validateDirectorBriefs } from './validate-director-brief.mjs';
import { fingerprintRenderValue, fingerprintValue } from './state.mjs';
import { designLibrarySnapshotSha256, loadPackagedDesignLibrary, nativeCompilerSourceBundleSha256, replayDirectorDesignSelection, selectDirectorDesign } from './select-design.mjs';

const skillRoot = fileURLToPath(new URL('../', import.meta.url));
const library = await loadPackagedDesignLibrary();
const legacyProfileHashes = {
  'greenroom-writing': '6c5f105a5182e57e26cf551f0b503c5885f5328d54b23490df44d8e4fc180fab',
  'forbidden-red-gold': '28bee3608a915233648ac9d6f5ee77977c413387fc861a775015c3cedfdc8933',
  'deep-current-hud': 'f81e613bb212a30e3c90e07584d47575f568d42d5b56b5cbd1be21d2214b0bec',
  'restrained-gradient-flow': 'a03683de1cc44c6b901728d05b22ffc9bde319ff1a9f17227ef748b566b18dd0',
  'soft-aurora-workbench': 'cac03902b5740b6b8c0e6b904b45f7262dc9ee41b70c8be338a7470b3e3b8bde',
  'neon-cyber-overlay': 'a4971f6a19e0351ae291e2ab2f6d765c6e5f64cca58a4dc7e30473b61c7ddd46',
};
const srt = parseSrt('1\n00:00:00,000 --> 00:00:04,000\nA signal passes through a gate.');
const plan = validateAndNormalizeShotPlan(srt, { schema_version: 1, srt_sha256: srt.content_sha256, shots: [{ shot_id: 'S001', cue_start: 1, cue_end: 1, narrated_claim: 'A signal passes through a gate.', transition_reason: 'opening' }], chapters: [{ chapter_id: 'C001', shot_start: 'S001', shot_end: 'S001', title: 'Gate', purpose: 'Explain the process.' }] });

function document(overrides = {}) {
  return validateDirectorBriefs(plan, { schema_version: 1, plan_sha256: plan.plan_sha256, briefs: [{
    shot_id: 'S001', comprehension_purpose: 'Understand a gated workflow.', semantic_type: overrides.semantic_type ?? 'process',
    representation: { mode: overrides.representation ?? 'process-system', subjects: ['signal', 'gate'], relationship: 'The gate controls passage.', grounding: 'The gate physically represents a workflow condition.' },
    visible_action: { verb: 'filter', from_state: 'The signal waits before the gate.', to_state: 'The accepted signal exits the gate.' },
    result_state: { visible_outcome: 'The accepted signal remains beyond the gate.', hold_intent: 'normal' },
    evidence: overrides.evidence ?? { mode: 'abstract-relationship', source_ids: [], claim_handling: 'non-literal' },
    silent_test: { expected_guess: 'A gate admitted one signal.', visible_clues: ['gate opens', 'signal exits'], ambiguity_risk: 'Rejected signals must remain dim.', verdict: 'pass', review_note: 'The open gate and signal beyond it distinguish acceptance from waiting.' },
    asset_needs: { preferred_route: overrides.route ?? 'hyperframes-native', primary_compositing: overrides.primary ?? 'fullscreen', query_subjects: overrides.queries ?? [], prohibitions: ['subtitle card'] },
    anti_collision: { motif_id: 'M-S001-GATE', varied_dimensions: ['layout', 'primary-action'], complete_metaphor_reuse: false },
  }] });
}

function context(doc, overrides = {}) { return { schema_version: 1, briefs_sha256: doc.briefs_sha256, topic_tags: ['ai-tools', 'workflow'], moods: ['calm', 'technical'], aspect_ratio: '16:9', information_density: 3, user_design_defined_layers: [], recent_base_template_ids: [], used_signature_motif_ids: [], requested_borrows: [], ...overrides }; }

async function packagedLibraryFixture(t) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'broll-design-library-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const files = [
    'references/design-library/library-policy.json',
    'references/design-library/source-registry.json',
    'references/design-library/native-base-compiler.json',
    'references/native-fallback-contract.md',
    'references/visual-grammar-compiler-contract.md',
    'scripts/native-fallback.mjs',
    ...(await readdir(path.join(skillRoot, 'references', 'design-library', 'templates'))).filter((name) => name.endsWith('.json')).map((name) => `references/design-library/templates/${name}`),
  ];
  for (const relative of files) {
    const target = path.join(root, ...relative.split('/'));
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(skillRoot, ...relative.split('/')), target);
  }
  return root;
}

async function mutateNativeCompiler(root, mutate) {
  const target = path.join(root, 'references', 'design-library', 'native-base-compiler.json');
  const compiler = JSON.parse(await readFile(target, 'utf8'));
  mutate(compiler);
  await writeFile(target, `${JSON.stringify(compiler, null, 2)}\n`);
}

test('public selection honestly falls back while every packaged template is draft', () => {
  const doc = document(); const result = selectDirectorDesign(doc, context(doc), library);
  assert.equal(result.mode, 'native-fallback'); assert.equal(result.base_template, 'hyperframes-native'); assert.equal(result.fallback, 'hyperframes-native');
  assert.equal(result.base_template_sha256, fingerprintRenderValue(library.nativeBaseCompiler));
  assert.equal(result.design_library_snapshot_sha256, designLibrarySnapshotSha256(library));
  assert.equal(result.native_compiler_source_bundle_sha256, nativeCompilerSourceBundleSha256(library.nativeBaseCompiler));
  assert.deepEqual(result.visual_grammar_compilation, { eligible: true, guard_code: 'NATIVE_BASE_COMPILER_BOUND' });
});

test('development option selects one policy-ranked base template', () => {
  const doc = document(); const result = selectDirectorDesign(doc, context(doc), library, { allowDraft: true });
  assert.equal(result.base_template, 'soft-aurora-workbench'); assert.equal(result.template_status, 'draft'); assert.equal(result.mode, 'base-template');
  assert.ok(result.candidate_rejections.find((item) => item.template_id === 'quiet-editorial-print').reason_codes.some((reason) => reason.code === 'CALIBRATION_EXPLICIT_SELECTION_REQUIRED'));
});

test('seven-template catalog preserves the six ordinary profile definitions', () => {
  assert.equal(library.templates.length, 7);
  assert.deepEqual(library.templates.map((item) => item.id).sort(), ['deep-current-hud', 'forbidden-red-gold', 'greenroom-writing', 'neon-cyber-overlay', 'quiet-editorial-print', 'restrained-gradient-flow', 'soft-aurora-workbench']);
  assert.equal(library.nativeBaseCompiler.id, 'hyperframes-native');
  assert.equal(library.nativeBaseCompiler.status, 'built-in');
  assert.equal(library.templates.some((item) => item.id === library.nativeBaseCompiler.id), false);
  assert.equal(library.policy.profiles.some((item) => item.template_id === library.nativeBaseCompiler.id), false);
  assert.deepEqual(Object.fromEntries(library.policy.profiles.filter((profile) => profile.template_id !== 'quiet-editorial-print').map((profile) => [profile.template_id, fingerprintValue(profile)])), legacyProfileHashes);
});

test('calibration template provenance is pinned to the registered source and license', () => {
  const source = library.sourceRegistry.sources.find((item) => item.source_id === 'GC-ZINE-001');
  assert.deepEqual(source, {
    source_id: 'GC-ZINE-001',
    content_hash: 'd4e1199623ee4d98e948189308eedc601f83ab0ae923568c6e9240f89c783b8b',
    authority: 'C',
    allowed_evidence_roles: ['inspiration-only'],
    evidence_ref: 'reference-library/styles/style-quiet-editorial-print-compiler.md',
    repository: 'https://github.com/LiamGvchi/gc-minimal-zine-poster',
    audited_commit: 'd2768f2a3488856af08ae5b2a3f8970d59197fdd',
    license_id: 'MIT',
    license_path: 'assets/licenses/gc-minimal-zine-poster-MIT.txt',
    license_sha256: 'd15c81ae8fa9a0b4b1db46c66e4490cc92e4898fb1f55e030559fbd2a2e2a232',
  });
  const template = library.templates.find((item) => item.id === 'quiet-editorial-print');
  assert.deepEqual(template.provenance.source_ids, [source.source_id]);
  assert.deepEqual(template.provenance.content_hashes, [source.content_hash]);
});

test('calibration policy and provenance bindings fail closed when tampered', () => {
  const doc = document();
  const badPolicy = structuredClone(library);
  badPolicy.policy.selection.calibration_only_template_ids = ['missing-template'];
  assert.throws(() => selectDirectorDesign(doc, context(doc), badPolicy, { allowDraft: true }), (error) => error.code === 'invalid_library');

  const badRegistry = structuredClone(library);
  badRegistry.sourceRegistry.sources.find((item) => item.source_id === 'GC-ZINE-001').content_hash = '0'.repeat(64);
  assert.throws(() => selectDirectorDesign(doc, context(doc), badRegistry, { allowDraft: true }), (error) => error.code === 'invalid_library');
});

test('library snapshot canonicalizes template order and binds policy, registry, native compiler, and source bundle', () => {
  const reordered = structuredClone(library);
  reordered.templates.reverse();
  assert.equal(designLibrarySnapshotSha256(reordered), designLibrarySnapshotSha256(library));

  const changedPolicy = structuredClone(library);
  changedPolicy.policy.selection.base_template_count = 2;
  assert.notEqual(designLibrarySnapshotSha256(changedPolicy), designLibrarySnapshotSha256(library));

  const changedRegistry = structuredClone(library);
  changedRegistry.sourceRegistry.sources.find((item) => item.source_id === 'GC-ZINE-001').audited_commit = 'a'.repeat(40);
  assert.notEqual(designLibrarySnapshotSha256(changedRegistry), designLibrarySnapshotSha256(library));

  const changedNative = structuredClone(library);
  changedNative.nativeBaseCompiler.summary = `${changedNative.nativeBaseCompiler.summary} Changed.`;
  assert.notEqual(designLibrarySnapshotSha256(changedNative), designLibrarySnapshotSha256(library));

  const changedSourceBundle = structuredClone(library);
  changedSourceBundle.nativeBaseCompiler.provenance.source_refs[0].sha256 = 'a'.repeat(64);
  changedSourceBundle.nativeBaseCompiler.native_compiler_source_bundle_sha256 = nativeCompilerSourceBundleSha256(changedSourceBundle.nativeBaseCompiler);
  assert.notEqual(designLibrarySnapshotSha256(changedSourceBundle), designLibrarySnapshotSha256(library));
});

test('native compiler is independently hash-bound, required, and replay-protected', () => {
  const doc = document();
  const ctx = context(doc);
  const selected = selectDirectorDesign(doc, ctx, library);
  assert.deepEqual(replayDirectorDesignSelection(doc, ctx, library, selected), selected);

  const changedNative = structuredClone(library);
  changedNative.nativeBaseCompiler.summary = `${changedNative.nativeBaseCompiler.summary} Changed.`;
  assert.notEqual(designLibrarySnapshotSha256(changedNative), designLibrarySnapshotSha256(library));
  assert.throws(() => replayDirectorDesignSelection(doc, ctx, changedNative, selected), (error) => error.code === 'selection_replay_mismatch');

  const invalidNative = structuredClone(library);
  invalidNative.nativeBaseCompiler.id = 'other-native';
  assert.throws(() => selectDirectorDesign(doc, ctx, invalidNative), (error) => error.code === 'invalid_library');

  const missingNative = structuredClone(library);
  delete missingNative.nativeBaseCompiler;
  assert.throws(() => selectDirectorDesign(doc, ctx, missingNative), (error) => error.code === 'invalid_library');
});

test('loader verifies every native compiler source byte, path, hash, size, and symlink ancestor', async (t) => {
  const byteTamper = await packagedLibraryFixture(t);
  const byteTarget = path.join(byteTamper, 'references', 'native-fallback-contract.md');
  const original = await readFile(byteTarget);
  const changed = Buffer.from(original);
  changed[0] = changed[0] === 35 ? 36 : 35;
  await writeFile(byteTarget, changed);
  await assert.rejects(() => loadPackagedDesignLibrary({ packageRoot: byteTamper }), (error) => error.code === 'native_source_hash_mismatch');

  const pathTamper = await packagedLibraryFixture(t);
  await mutateNativeCompiler(pathTamper, (compiler) => { compiler.provenance.source_refs[0].relative_path = 'references/other-contract.md'; });
  await assert.rejects(() => loadPackagedDesignLibrary({ packageRoot: pathTamper }), (error) => error.code === 'invalid_library');

  const hashTamper = await packagedLibraryFixture(t);
  await mutateNativeCompiler(hashTamper, (compiler) => {
    compiler.provenance.source_refs[0].sha256 = '0'.repeat(64);
    compiler.native_compiler_source_bundle_sha256 = nativeCompilerSourceBundleSha256(compiler);
  });
  await assert.rejects(() => loadPackagedDesignLibrary({ packageRoot: hashTamper }), (error) => error.code === 'native_source_hash_mismatch');

  const sizeTamper = await packagedLibraryFixture(t);
  await mutateNativeCompiler(sizeTamper, (compiler) => {
    compiler.provenance.source_refs[0].size_bytes += 1;
    compiler.native_compiler_source_bundle_sha256 = nativeCompilerSourceBundleSha256(compiler);
  });
  await assert.rejects(() => loadPackagedDesignLibrary({ packageRoot: sizeTamper }), (error) => error.code === 'native_source_size_mismatch');

  const linked = await packagedLibraryFixture(t);
  const linkedTarget = path.join(linked, 'scripts', 'native-fallback.mjs');
  await unlink(linkedTarget);
  await symlink(path.join(linked, 'references', 'native-fallback-contract.md'), linkedTarget);
  await assert.rejects(() => loadPackagedDesignLibrary({ packageRoot: linked }), (error) => error.code === 'native_source_symlink');

  const ancestor = await packagedLibraryFixture(t);
  const outsideScripts = path.join(ancestor, 'external-scripts');
  await mkdir(outsideScripts);
  await copyFile(path.join(skillRoot, 'scripts', 'native-fallback.mjs'), path.join(outsideScripts, 'native-fallback.mjs'));
  await rm(path.join(ancestor, 'scripts'), { recursive: true });
  await symlink(outsideScripts, path.join(ancestor, 'scripts'));
  await assert.rejects(() => loadPackagedDesignLibrary({ packageRoot: ancestor }), (error) => error.code === 'native_source_symlink');
});

test('calibration-only template requires an explicit compatible 16:9 fullscreen selection', () => {
  const doc = document();
  const implicit = selectDirectorDesign(doc, context(doc), library, { allowDraft: true });
  assert.notEqual(implicit.base_template, 'quiet-editorial-print');

  const explicit = selectDirectorDesign(doc, context(doc, { user_template_id: 'quiet-editorial-print' }), library, { allowDraft: true });
  assert.equal(explicit.base_template, 'quiet-editorial-print');
  assert.equal(explicit.template_status, 'draft');
  assert.equal(explicit.reasons[0].code, 'USER_TEMPLATE_OVERRIDE');
  const selectedTemplate = library.templates.find((item) => item.id === explicit.base_template);
  assert.equal(explicit.base_template_sha256, fingerprintRenderValue(selectedTemplate));
  assert.equal(explicit.design_library_snapshot_sha256, designLibrarySnapshotSha256(library));
  assert.equal(explicit.native_compiler_source_bundle_sha256, nativeCompilerSourceBundleSha256(library.nativeBaseCompiler));
  assert.deepEqual(explicit.visual_grammar_compilation, { eligible: true, guard_code: 'BASE_TEMPLATE_BOUND' });
  assert.equal(explicit.selection_sha256, fingerprintValue(Object.fromEntries(Object.entries(explicit).filter(([key]) => key !== 'selection_sha256'))));

  const publicAttempt = selectDirectorDesign(doc, context(doc, { user_template_id: 'quiet-editorial-print' }), library);
  assert.equal(publicAttempt.base_template, 'hyperframes-native');
  assert.equal(publicAttempt.mode, 'native-fallback');
  assert.ok(publicAttempt.candidate_rejections.find((item) => item.template_id === 'quiet-editorial-print').reason_codes.some((reason) => reason.code === 'STATUS_INELIGIBLE'));

  const wrongAspect = selectDirectorDesign(doc, context(doc, { user_template_id: 'quiet-editorial-print', aspect_ratio: '9:16' }), library, { allowDraft: true });
  assert.equal(wrongAspect.base_template, 'hyperframes-native');
  assert.ok(wrongAspect.candidate_rejections.find((item) => item.template_id === 'quiet-editorial-print').reason_codes.some((reason) => reason.code === 'CALIBRATION_ASPECT_UNSUPPORTED'));

  const hardAlphaDoc = document({ primary: 'hard-alpha-over-source' });
  const wrongMode = selectDirectorDesign(hardAlphaDoc, context(hardAlphaDoc, { user_template_id: 'quiet-editorial-print', allow_conditional_compositing: true }), library, { allowDraft: true });
  assert.equal(wrongMode.base_template, 'hyperframes-native');
  assert.ok(wrongMode.candidate_rejections.find((item) => item.template_id === 'quiet-editorial-print').reason_codes.some((reason) => reason.code === 'COMPOSITING_PROHIBITED'));
});

test('selection replay detects template, policy, source-registry, and selection substitution', () => {
  const doc = document();
  const ctx = context(doc, { user_template_id: 'quiet-editorial-print' });
  const options = { allowDraft: true };
  const selected = selectDirectorDesign(doc, ctx, library, options);
  assert.deepEqual(replayDirectorDesignSelection(doc, ctx, library, selected, options), selected);

  const reordered = structuredClone(library);
  reordered.templates.reverse();
  assert.deepEqual(replayDirectorDesignSelection(doc, ctx, reordered, selected, options), selected);

  const changedTemplate = structuredClone(library);
  changedTemplate.templates.find((item) => item.id === selected.base_template).title = 'Tampered template title';
  assert.throws(() => replayDirectorDesignSelection(doc, ctx, changedTemplate, selected, options), (error) => error.code === 'selection_replay_mismatch');

  const changedPolicy = structuredClone(library);
  changedPolicy.policy.selection.base_template_count = 2;
  assert.throws(() => replayDirectorDesignSelection(doc, ctx, changedPolicy, selected, options), (error) => error.code === 'selection_replay_mismatch');

  const changedRegistry = structuredClone(library);
  changedRegistry.sourceRegistry.sources.find((item) => item.source_id === 'GC-ZINE-001').audited_commit = 'a'.repeat(40);
  assert.throws(() => replayDirectorDesignSelection(doc, ctx, changedRegistry, selected, options), (error) => error.code === 'selection_replay_mismatch');

  const changedBundleSelection = structuredClone(selected);
  changedBundleSelection.native_compiler_source_bundle_sha256 = 'a'.repeat(64);
  const { selection_sha256: ignoredBundleHash, ...changedBundleCore } = changedBundleSelection;
  changedBundleSelection.selection_sha256 = fingerprintValue(changedBundleCore);
  assert.throws(() => replayDirectorDesignSelection(doc, ctx, library, changedBundleSelection, options), (error) => error.code === 'selection_replay_mismatch');

  const changedSelection = structuredClone(selected);
  changedSelection.score += 1;
  assert.throws(() => replayDirectorDesignSelection(doc, ctx, library, changedSelection, options), (error) => error.code === 'selection_tampered');

  const resignedSelection = structuredClone(changedSelection);
  const { selection_sha256: ignored, ...resignedCore } = resignedSelection;
  resignedSelection.selection_sha256 = fingerprintValue(resignedCore);
  assert.throws(() => replayDirectorDesignSelection(doc, ctx, library, resignedSelection, options), (error) => error.code === 'selection_replay_mismatch');
});

test('allowDraft inside context is rejected instead of becoming a public bypass', () => {
  const doc = document(); assert.throws(() => selectDirectorDesign(doc, { ...context(doc), allowDraft: true }, library), (error) => error.code === 'invalid_context');
});

test('all protected user layers suppress a base template and preserve user design', () => {
  const doc = document(); const result = selectDirectorDesign(doc, context(doc, { user_design_defined_layers: ['visual_system', 'scene_grammar', 'motion_grammar', 'compositing'] }), library, { allowDraft: true });
  assert.equal(result.mode, 'user-design-native-supplement'); assert.equal(result.base_template, 'hyperframes-native'); assert.equal(result.protected_user_layers.length, 4);
  assert.equal(result.base_template_sha256, fingerprintRenderValue(library.nativeBaseCompiler));
  assert.equal(result.native_compiler_source_bundle_sha256, nativeCompilerSourceBundleSha256(library.nativeBaseCompiler));
  assert.deepEqual(result.visual_grammar_compilation, { eligible: true, guard_code: 'NATIVE_SUPPORT_ONLY_USER_LAYERS_PROTECTED' });
});

test('partial user design selects only a supplement and reports protected layers', () => {
  const doc = document(); const result = selectDirectorDesign(doc, context(doc, { user_design_defined_layers: ['visual_system', 'motion_grammar'] }), library, { allowDraft: true });
  assert.equal(result.mode, 'supplement-user-design'); assert.deepEqual(result.protected_user_layers, ['visual_system', 'motion_grammar']);
});

test('literal evidence cannot be routed through native or generated imagery', () => {
  const evidence = { mode: 'verified-source', source_ids: ['SOURCE-001'], claim_handling: 'literal-evidence' };
  const doc = document({ evidence, representation: 'documentary-evidence' });
  assert.throws(() => selectDirectorDesign(doc, context(doc), library), (error) => error.code === 'evidence_conflict');
});

test('literal user media evidence can enter selection', () => {
  const evidence = { mode: 'user-material', source_ids: ['SOURCE-001'], claim_handling: 'literal-evidence' };
  const doc = document({ evidence, representation: 'documentary-evidence', route: 'user-media' });
  assert.equal(selectDirectorDesign(doc, context(doc), library).fallback, 'hyperframes-native');
});

test('required compositing rejects an explicit incompatible template', () => {
  const doc = document({ primary: 'hard-alpha-over-source' });
  const result = selectDirectorDesign(doc, context(doc, { user_template_id: 'restrained-gradient-flow' }), library, { allowDraft: true });
  assert.equal(result.base_template, 'hyperframes-native');
  assert.equal(result.mode, 'native-fallback');
  assert.ok(result.candidate_rejections.find((item) => item.template_id === 'restrained-gradient-flow').reason_codes.some((reason) => reason.code === 'COMPOSITING_OPT_IN_REQUIRED'));
});

test('motif and recent-base cooldown change the policy winner', () => {
  const doc = document();
  const base = selectDirectorDesign(doc, context(doc), library, { allowDraft: true });
  const template = library.templates.find((item) => item.id === base.base_template);
  const cooled = selectDirectorDesign(doc, context(doc, { recent_base_template_ids: [base.base_template], used_signature_motif_ids: template.reuse_policy.signature_motifs.map((item) => item.motif_id) }), library, { allowDraft: true });
  assert.notEqual(cooled.base_template, base.base_template);
});

test('compatible borrow is accepted and conflicting borrow returns reason codes', () => {
  const doc = document();
  const accepted = selectDirectorDesign(doc, context(doc, { requested_borrows: [{ template_id: 'neon-cyber-overlay', pattern_id: 'status-reveal' }] }), library, { allowDraft: true });
  assert.deepEqual(accepted.borrowed_patterns, [{ template_id: 'neon-cyber-overlay', pattern_id: 'status-reveal' }]);
  const rejected = selectDirectorDesign(doc, context(doc, { requested_borrows: [{ template_id: 'deep-current-hud', pattern_id: 'data-flow-network' }] }), library, { allowDraft: true });
  assert.ok(rejected.borrow_rejections[0].reason_codes.includes('BASE_CONFLICT'));
});

test('borrow limit, malformed tokens, unknown fields, and hash mismatch are rejected', () => {
  const doc = document();
  for (const bad of [
    context(doc, { requested_borrows: [{ template_id: 'a', pattern_id: 'b' }, { template_id: 'c', pattern_id: 'd' }, { template_id: 'e', pattern_id: 'f' }] }),
    context(doc, { topic_tags: ['Not Normalized'] }),
    { ...context(doc), extra: true },
    context(doc, { briefs_sha256: 'a'.repeat(64) }),
  ]) assert.throws(() => selectDirectorDesign(doc, bad, library));
});

test('brief tampering is detected and selection output is deterministic', () => {
  const doc = document(); const ctx = context(doc);
  assert.deepEqual(selectDirectorDesign(doc, ctx, library), selectDirectorDesign(doc, ctx, library));
  const altered = structuredClone(doc); altered.briefs[0].semantic_type = 'emotion';
  assert.throws(() => selectDirectorDesign(altered, ctx, library), (error) => error.code === 'briefs_tampered');
  const { briefs_sha256, ...core } = altered; altered.briefs_sha256 = fingerprintValue(core);
  assert.throws(() => selectDirectorDesign(altered, ctx, library), (error) => error.code === 'invalid_context');
});
