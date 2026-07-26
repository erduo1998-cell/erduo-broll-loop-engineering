import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { parseSrt } from './parse-srt.mjs';
import { validateAndNormalizeShotPlan } from './validate-shot-plan.mjs';
import { planM10AssetRoutes } from './plan-m10-asset-routes.mjs';
import { validateDirectorSummary, validateFrameFusionAnalysis, validateM10VisualContract } from './validate-m10-visual-contract.mjs';
import { buildM10Composition, M10CompositionError, motionContract, parseM10Args, renderM10Html, runM10Cli, writeM10Project } from './build-m10-composition.mjs';

const sha = (letter) => letter.repeat(64);
const fontBytes = Buffer.from('prepared-noto-font-fixture');
const fontSha256 = createHash('sha256').update(fontBytes).digest('hex');
const fontPackage = () => ({ schema_version: 2, display_selection: { schema_version: 1, primary_visual_dna: 'deep-current-hud', display_font_id: 'fixture-display', display_text: '约束出现 下一步 001 002' }, fonts: [
  { font_id: 'noto-fixture', role: 'information', family: 'Noto Fixture Runtime Information', weight: '100 900', style: 'normal', file_sha256: fontSha256, file_kind: 'ttf', css: { font_face: true, src: './assets/fonts/noto-fixture.ttf', used: true, fallbacks: [] } },
  { font_id: 'fixture-display', role: 'display', family: 'Fixture Display Runtime', weight: '400 900', style: 'normal', file_sha256: fontSha256, file_kind: 'ttf', official_source: 'user-provided-local', source_status: 'user-provided-local', license_id: 'Fixture-License', license_file_sha256: sha('e'), commercial_scope: 'user-confirmed-licensed', cjk_coverage_sha256: sha('d'), css: { font_face: true, src: './assets/fonts/noto-fixture.ttf', used: true, fallbacks: [] } },
] });
async function prepareProjectFont(output) { await fs.mkdir(path.join(output, 'assets/fonts'), { recursive: true }); await fs.writeFile(path.join(output, 'assets/fonts/noto-fixture.ttf'), fontBytes); }

function fixture() {
  const srt = parseSrt(`1
00:00:00,000 --> 00:00:02,000
A founder makes the first hard choice.

2
00:00:02,000 --> 00:00:04,000
The system shows the hidden constraint.

3
00:00:04,000 --> 00:00:06,000
Now the next action is obvious.`);
  const plan = validateAndNormalizeShotPlan(srt, {
    schema_version: 1,
    srt_sha256: srt.content_sha256,
    shots: [
      { shot_id: 'S001', cue_start: 1, cue_end: 2, narrated_claim: 'A founder makes a hard choice and reveals the hidden constraint.', transition_reason: 'opening' },
      { shot_id: 'S002', cue_start: 3, cue_end: 3, narrated_claim: 'The next action becomes obvious.', transition_reason: 'conclusion' },
    ],
    chapters: [{ chapter_id: 'C001', shot_start: 'S001', shot_end: 'S002', title: 'Choice and action', purpose: 'Show decision, constraint, and next step.' }],
  });
  const frameFusion = validateFrameFusionAnalysis({
    schema_version: 1,
    srt_sha256: srt.content_sha256,
    frames: [{
      frame_id: 'FRAME-M10-001',
      image_sha256: sha('a'),
      width: 1920,
      height: 1080,
      speaker_presence: 'single-speaker',
      speaker_box: { x: 0.08, y: 0.12, width: 0.34, height: 0.78 },
      safe_zones: ['right third clean space'],
      lighting: { brightness: 'medium', contrast: 'soft', direction: 'left key', risk: 'avoid bright edges' },
      palette: { dominant_hex: ['#101820', '#f2c94c'], avoid_hex: ['#00ffff'], notes: 'Still frame constrains return and overlay only.' },
      background: { complexity: 'moderate', description: 'desk wall texture', risk: 'small text can become noisy' },
      overlay_capability: { rating: 'limited', usable_zones: ['right third'], reason: 'speaker occupies left side' },
      fullscreen_cutaway: { feasibility: 'yes', return_rule: 'return with warm rim continuity' },
      hard_alpha: { feasibility: 'conditional', edge_risk: 'hair edge needs hard matte' },
    }],
    global_constraints: {
      design_priority: 'user-reference-over-internal-reference-over-still-frame',
      user_reference_policy: 'Internal atoms are advisory and must yield to user-provided references.',
      notes: 'Still frames do not become a fixed style template.',
    },
  });
  const director = validateDirectorSummary({
    method_id: 'erduo-director-method-v1',
    absorbed_sections: ['intent-card', 'visual-motif', 'scene-table', 'component-material-plan', 'taste-rationale', 'quality-self-check'],
    adapter_boundaries: { time_source: 'srt', asset_policy_owner: 'erduo-hyperframes-broll', final_delivery_owner: 'erduo-hyperframes-broll', director_method_role: 'bundled-directing-authority' },
    optional_enhancer: { used: false },
  });
  const visualContract = validateM10VisualContract(plan, frameFusion, director, {
    schema_version: 1,
    plan_sha256: plan.plan_sha256,
    frame_fusion_sha256: frameFusion.frame_fusion_sha256,
    director_summary_sha256: director.director_summary_sha256,
    shots: [
      shot('S001', 'process', 'fullscreen-broll', 'explanatory-media', ['image-generation', 'pexels', 'hyperframes-native'], '约束出现'),
      shot('S002', 'action-close', 'speaker-context-return', 'text-quote', ['user-media', 'image-generation', 'hyperframes-native'], '下一步'),
    ],
  });
  const routePlan = planM10AssetRoutes(visualContract, { user_media: true, pexels: true, image_generation: true, hyperframes_native: true });
  return { visualContract, routePlan };
}

function shot(id, family, mode, role, routeOrder, screenText) {
  return {
    shot_id: id,
    information_intent: { narrated_claim: id === 'S001' ? 'A founder makes a hard choice and reveals the hidden constraint.' : 'The next action becomes obvious.', viewer_should_understand: 'The visual makes the relationship legible.', readable_outcome: id === 'S001' ? 'A visible constraint changes the path.' : 'One clear next action remains.' },
    visual_grammar: { family, agent_choice_reason: 'The agent picks this grammar for the semantic job, not because a template is mandatory.', screen_text: screenText },
    compositing: { mode, reason: 'The shot uses still-frame fusion constraints without letting the still dictate the whole style.' },
    material_roles: [
      { role, route_order: routeOrder, purpose: 'Primary material explains the claim.', fallback_limit: 'Native graphics may only provide local support, not a whole-film default.' },
      { role: 'native-support', route_order: ['hyperframes-native'], purpose: 'Small relation markers support the primary material.', fallback_limit: 'Auxiliary only.' },
    ],
    component_intent: { needed: true, description: 'Use local components only where they clarify the relation.', native_scope: 'shot-local-support-only' },
    motion: { key_action: 'State changes and holds.', transition_intent: 'Cut or return with palette continuity.', result_hold: 'Hold result long enough to read.' },
    frame_fusion: { mode: 'cutaway-return', frame_ids: ['FRAME-M10-001'], constraints_used: ['right third clean space'], decision_reason: 'The still guides safe return and overlay risk.' },
    reference_use: { user_reference_alignment: 'No user reference in fixture; internal atoms remain optional vocabulary.', internal_atom_candidates: ['scene-logic/process-shift'], selection_policy: 'Use candidates as inspiration; discard them when user references or content point elsewhere.' },
    quality_notes: { not_subtitle_burn: true, not_native_default: true, not_media_only_pass: true, judgment_note: 'Semantic quality is checked before media-only delivery gates.' },
  };
}

function capture() {
  let text = '';
  return { stream: new Writable({ write(chunk, encoding, done) { text += chunk.toString(); done(); } }), text: () => text };
}

test('builds a contract-driven M10 composition from visual contract and route plan', () => {
  const { visualContract, routePlan } = fixture();
  const composition = buildM10Composition(visualContract, routePlan);
  assert.equal(composition.render_mode, 'm10-contract-composition');
  assert.equal(composition.clip_count, 2);
  assert.deepEqual(composition.clips.map((clip) => [clip.shot_id, clip.visual_grammar_family, clip.primary_route, clip.compositing_mode]), [
    ['S001', 'process', 'image-generation', 'fullscreen-broll'],
    ['S002', 'action-close', 'user-media', 'speaker-context-return'],
  ]);
  assert.equal(composition.limitations.includes('asset-route-plan-only-no-frozen-media'), true);
  assert.throws(() => renderM10Html(composition), (error) => error instanceof M10CompositionError && error.code === 'display_font_selection_required');
  const html = renderM10Html(composition, fontPackage());
  assert.match(html, /data-m10-composition="[0-9a-f]{64}"/u);
  assert.match(html, /class="clip shot grammar-process route-image-generation comp-fullscreen-broll"/u);
  assert.match(html, /class="clip shot grammar-action-close route-user-media comp-speaker-context-return"/u);
  assert.match(html, /@font-face/u);
  assert.match(html, /Noto Fixture Runtime Information/u);
  assert.match(html, /data-font-role="key-quote" data-display-font-id="fixture-display"/u);
  assert.match(html, /data-font-role="chapter-focus" data-display-font-id="fixture-display"/u);
  assert.match(html, /data-font-role="core-number" data-display-font-id="fixture-display"/u);
  assert.match(html, /data-font-role="emphasis" data-display-font-id="fixture-display"/u);
  assert.match(html, /\[data-font-role\] \{ font-family: "Fixture Display Runtime"; \}/u);
  assert.equal(/(?:PingFang|Hiragino|Microsoft YaHei|微软雅黑|SF Mono|Menlo|Consolas|system-ui|ui-sans-serif|-apple-system|Arial|Helvetica|Inter)/u.test(html), false);
  assert.equal(html.includes('/private/'), false);
});

test('rejects a display package that is missing a selected face or changes its selected id', () => {
  const { visualContract, routePlan } = fixture();
  const composition = buildM10Composition(visualContract, routePlan);
  const missing = fontPackage(); delete missing.display_selection;
  assert.throws(() => renderM10Html(composition, missing), (error) => error.code === 'display_font_selection_required');
  const mismatch = fontPackage(); mismatch.display_selection.display_font_id = 'other-display';
  assert.throws(() => renderM10Html(composition, mismatch), (error) => error.code === 'display_font_selection_mismatch');
});

test('rejects route-plan mismatch and whole-film native primary routes', () => {
  const { visualContract, routePlan } = fixture();
  const mismatch = structuredClone(routePlan);
  mismatch.visual_contract_sha256 = sha('d');
  assert.throws(() => buildM10Composition(visualContract, mismatch), (error) => error instanceof M10CompositionError && error.code === 'invalid_route_plan');
  const nativeOnly = structuredClone(routePlan);
  for (const route of nativeOnly.routes) route.primary_route = 'hyperframes-native';
  assert.throws(() => buildM10Composition(visualContract, nativeOnly), (error) => error.code === 'native_default');
});

test('writes a HyperFrames project with motion metadata into an empty target', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'broll-m10-project-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const output = path.join(root, 'project');
  const { visualContract, routePlan } = fixture();
  const composition = buildM10Composition(visualContract, routePlan);
  await prepareProjectFont(output);
  await writeM10Project(output, composition, { fontPackage: fontPackage() });
  const [html, motion, meta] = await Promise.all([
    fs.readFile(path.join(output, 'index.html'), 'utf8'),
    fs.readFile(path.join(output, 'index.motion.json'), 'utf8'),
    fs.readFile(path.join(output, 'meta.json'), 'utf8'),
  ]);
  assert.match(html, /data-composition-id="main"/u);
  assert.equal(JSON.parse(motion).duration, 6);
  assert.equal(JSON.parse(meta).name, 'erduo-hyperframes-broll-m10');
  assert.deepEqual(motionContract(composition).assertions.map((item) => item.kind), ['keepsMoving', 'staysInFrame', 'staysInFrame']);
  await assert.rejects(() => writeM10Project(output, composition, { fontPackage: fontPackage() }), (error) => error.code === 'output_not_empty');
  const missingOutput = path.join(root, 'missing-font-project');
  await assert.rejects(() => writeM10Project(missingOutput, composition, { fontPackage: fontPackage() }), (error) => error.code === 'font_asset_missing');
});

test('CLI keeps output metadata and path-free errors', async () => {
  const { visualContract, routePlan } = fixture();
  assert.deepEqual(parseM10Args(['--help']), { help: true });
  assert.equal(parseM10Args(['one']).error, true);
  const stdout = capture();
  let written = null;
  assert.equal(await runM10Cli(['/private/visual.json', '/private/routes.json', '/private/fonts.json', '/private/output'], {
    stdout: stdout.stream,
    readFile: async (file) => file.includes('visual') ? JSON.stringify(visualContract) : file.includes('fonts') ? JSON.stringify(fontPackage()) : JSON.stringify(routePlan),
    writeProject: async (dir, value, options) => { written = { dir, value, options }; },
  }), 0);
  assert.equal(stdout.text().includes('/private/'), false);
  assert.equal(written.value.composition_sha256.length, 64);
  assert.equal(written.options.fontPackage.fonts.length, 2);
  const stderr = capture();
  assert.equal(await runM10Cli(['/private/visual.json', '/private/routes.json', '/private/fonts.json', '/private/output'], {
    stderr: stderr.stream,
    readFile: async () => '{',
    writeProject: async () => assert.fail(),
  }), 3);
  assert.equal(stderr.text().includes('/private/'), false);
});
