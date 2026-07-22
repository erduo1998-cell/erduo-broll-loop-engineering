import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArtifactEnvelope, createArtifactManifest, validateArtifactManifest } from './artifact-manifest.mjs';
import { validateMasterBindings } from './validate-master-bindings.mjs';
import { validateFontPackage } from './validate-font-package.mjs';
import { validateRenderSource } from './validate-render-source.mjs';
import { validateVisualEvidence } from './validate-visual-evidence.mjs';
import { analyzeVisualPreflight, validateVisualPreflightEvidence } from './visual-preflight-pixels.mjs';
import { createInputManifest, createRunState, fingerprintValue, loadRunState, saveRunState, transitionStage } from './state.mjs';
import { loadAndRunE2eFixture, writeE2eFixtureProject } from './run-e2e-fixture.mjs';
import { PRODUCT_STAGES, assertFinalRenderPreflight, createStageReceipt, validateStageReceipt } from './stage-receipt.mjs';

export class OrchestrationError extends Error { constructor(code, message) { super(message); this.name = 'OrchestrationError'; this.code = code; } }
const fail = (code, message) => { throw new OrchestrationError(code, message); };
const stateStages = { director: ['preflight', 'directing'], assets: ['assets'], 'master-build': ['build'], render: ['render', 'verify'] };
const privateRoot = (root) => path.join(root, '.erduo-hyperframes-broll');
const receiptFile = (root, stage) => path.join(privateRoot(root), 'receipts', `${stage}.json`);
const artifactRoot = (root, stage) => path.join(privateRoot(root), 'artifacts', stage);
const manifestFile = (root, stage) => path.join(artifactRoot(root, stage), 'manifest.json');
const fixtureHash = (fixture) => fingerprintValue({ fixture_id: fixture.fixture_id, mode: fixture.mode, srt: fixture.srt });
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const mainReview = (gate, manifest, packet) => ({
  gate,
  status: 'approved',
  subject_manifest_sha256: manifest.manifest_sha256,
  reviewer_role: 'erduo-hyperframes-broll-main-agent',
  reviewer_isolation_sha256: fingerprintValue({ run_id: manifest.run_id, gate, reviewer: 'main-agent' }),
  review_packet_sha256: fingerprintValue(packet),
  approval_sha256: fingerprintValue({ gate, subject_manifest_sha256: manifest.manifest_sha256, packet }),
});

function complete(state, stage, input, output) {
  for (const name of stateStages[stage]) {
    if (state.stages[name].status === 'complete') continue;
    state = transitionStage(state, name, 'start', { input_fingerprint: input });
    state = transitionStage(state, name, 'complete', { output_fingerprint: output });
  }
  return state;
}

function fixtureContracts(result) {
  const shots = Array.from({ length: result.shot_count }, (_, index) => ({ shot_id: `S${String(index + 1).padStart(3, '0')}`, primary_route: 'image-generation', primary_asset_id: `generated-${index + 1}` }));
  const assets = shots.map((shot, index) => ({ asset_id: shot.primary_asset_id, route: 'image-generation', media_kind: 'image', sha256: fingerprintValue({ fixture: 'asset', index }) }));
  const consumers = shots.map((shot, index) => ({ consumer_id: `consumer-${index + 1}`, shot_id: shot.shot_id, asset_id: shot.primary_asset_id, primary: true, element: 'img', visible: true, timed: true, width: 1920, height: 1080, source_sha256: assets[index].sha256, composition: null, contribution: null }));
  const fontBytes = Buffer.from('fixture-font-bytes');
  const displayFontBytes = Buffer.from('fixture-user-provided-display-font-bytes');
  const licenseBytes = Buffer.from('fixture font license');
  const fontSha256 = hashBytes(fontBytes); const displayFontSha256 = hashBytes(displayFontBytes); const licenseSha256 = hashBytes(licenseBytes);
  const displaySelection = { schema_version: 1, primary_visual_dna: 'fixture-dna', display_font_id: 'fixture-display', display_text: '重点 2026' };
  const fontPackage = { schema_version: 2, display_selection: displaySelection, fonts: [
    { font_id: 'fixture-display', role: 'display', family: 'Fixture User Display', weight: 700, style: 'normal', file_sha256: displayFontSha256, file_kind: 'woff2', official_source: 'user-provided-display-library', source_status: 'user-provided', cjk_coverage_sha256: fingerprintValue({ fixture: 'display-glyphs' }), css: { font_face: true, src: './assets/fonts/fixture-display.woff2', used: true, fallbacks: [] } },
    { font_id: 'fixture-cjk', role: 'information', family: 'Fixture Licensed CJK', weight: 600, style: 'normal', file_sha256: fontSha256, file_kind: 'woff2', official_source: 'fixture-source', license_id: 'fixture-license', license_file_sha256: licenseSha256, commercial_scope: 'fixture-only', cjk_coverage_sha256: fingerprintValue({ fixture: 'glyphs' }), css: { font_face: true, src: './assets/fonts/fixture.woff2', used: true, fallbacks: [] } },
  ] };
  const masterSha256 = fingerprintValue({ fixture: 'master', duration_ms: result.duration_ms });
  const visualEvidence = { schema_version: 2, master_sha256: masterSha256, shots: shots.map((shot, index) => {
    const base = index * 3000;
    return { shot_id: shot.shot_id, master_sha256: masterSha256, window_sha256: fingerprintValue({ shot: index, kind: 'window' }), entry: { timestamp_ms: base + 100, frame_sha256: fingerprintValue({ shot: index, state: 'entry' }) }, result: { timestamp_ms: base + 1000, frame_sha256: fingerprintValue({ shot: index, state: 'result' }) }, exit: { timestamp_ms: base + 2000, frame_sha256: fingerprintValue({ shot: index, state: 'exit' }) } };
  }) };
  const frameBytes = new Map();
  const ppm = (red, green, blue) => Buffer.from(`P3\n8 8\n255\n${Array.from({ length: 64 }, () => `${red} ${green} ${blue}`).join(' ')}\n`, 'ascii');
  const preMasterEvidence = { schema_version: 1, evidence_kind: 'internal-pre-master-stills', shots: shots.map((shot, index) => {
    const base = index * 3000; const states = {};
    for (const [state, offset, color] of [['entry', 100, [30 + index * 35, 120, 180]], ['result', 1000, [170, 30 + index * 45, 80]], ['exit', 2000, [70, 180, 30 + index * 35]]]) {
      const artifactId = `pre-master-${shot.shot_id}-${state}`; const bytes = ppm(...color); frameBytes.set(artifactId, bytes);
      states[state] = { timestamp_ms: base + offset, frame_sha256: hashBytes(bytes), frame_artifact_id: artifactId };
    }
    return { shot_id: shot.shot_id, ...states };
  }) };
  return { shots, masterBindings: { schema_version: 2, shots, assets, consumers }, fontPackage, fontBytes, displayFontBytes, licenseBytes, displaySelection, visualEvidence, masterSha256, preMasterEvidence, frameBytes };
}

function stageData(stage, result, contracts) {
  const routeMetrics = { shot_count: contracts.shots.length, native_primary_count: 0 };
  if (stage === 'director') return { payload: { schema_version: 1, shots: contracts.shots, density_source: 'fixture-contract' }, metrics: routeMetrics, extras: [] };
  if (stage === 'assets') return { payload: { schema_version: 1, bindings: contracts.masterBindings }, metrics: { ...routeMetrics, pexels_selected_count: 0 }, extras: [] };
  if (stage === 'master-build') return { payload: { schema_version: 1, master_bindings: contracts.masterBindings, font_package: contracts.fontPackage, display_selection: contracts.displaySelection, pre_master_evidence: contracts.preMasterEvidence, official_hyperframes_creation: { skills: ['hyperframes:hyperframes', 'hyperframes:hyperframes-cli'], html_preview_contact_sheet_sha256: fingerprintValue({ fixture: 'html-preview', shots: contracts.shots.length }) } }, metrics: { ...routeMetrics, consumer_count: contracts.masterBindings.consumers.length, font_role_count: contracts.fontPackage.fonts.length, pre_master_evidence_shot_count: contracts.preMasterEvidence.shots.length, pre_master_evidence_sha256: fingerprintValue(contracts.preMasterEvidence), source_gate_passed: true, pixel_gate_passed: true, official_hyperframes_skill_used: true, official_hyperframes_creation_sha256: fingerprintValue({ fixture: 'official-hyperframes-authoring', display: contracts.displaySelection.display_font_id }), display_font_id: contracts.displaySelection.display_font_id }, extras: [{ artifact_id: 'display-font-fixture', kind: 'font', media_type: 'font/woff2', locator_key: 'assets/fonts/fixture-display.woff2', required_by: ['master-build', 'render'], bytes: contracts.displayFontBytes }, { artifact_id: 'font-fixture', kind: 'font', media_type: 'font/woff2', locator_key: 'assets/fonts/fixture.woff2', required_by: ['master-build', 'render'], bytes: contracts.fontBytes }, { artifact_id: 'license-fixture', kind: 'license', media_type: 'text/plain', locator_key: 'font-notices/fixture.txt', required_by: ['master-build'], bytes: contracts.licenseBytes }, ...Array.from(contracts.frameBytes, ([artifact_id, bytes]) => ({ artifact_id, kind: 'frame', media_type: 'image/x-portable-pixmap', locator_key: `pre-master/${artifact_id}.ppm`, required_by: ['master-build'], bytes }))] };
  if (stage === 'render') return { payload: { schema_version: 1, master_sha256: contracts.masterSha256, coverage_basis_points: result.coverage_basis_points, duration_ms: result.duration_ms, deterministic_checks: ['manifest-chain', 'media-facts', 'font-load', 'route-counts'], visual_evidence: contracts.visualEvidence }, metrics: { shot_count: contracts.shots.length, visual_evidence_shot_count: contracts.shots.length, master_sha256: contracts.masterSha256, coverage_basis_points: result.coverage_basis_points, duration_ms: result.duration_ms, verify_passed: true }, extras: [] };
  fail('unsupported_product_stage', `Unsupported fixture stage: ${stage}`);
}

async function writeStagePackage(root, stage, runId, briefSha256, producerIsolationSha256, upstreamManifestSha256, data) {
  const targetRoot = artifactRoot(root, stage); await mkdir(targetRoot, { recursive: true, mode: 0o700 });
  const payloadBytes = Buffer.from(`${JSON.stringify(data.payload, null, 2)}\n`, 'utf8');
  const records = [{ artifact_id: `${stage}-payload`, kind: 'json', sha256: hashBytes(payloadBytes), size_bytes: payloadBytes.length, media_type: 'application/json', locator_key: 'payload.json', required_by: [stage === 'render' ? 'delivery' : 'next-stage'] }];
  await writeFile(path.join(targetRoot, 'payload.json'), payloadBytes, { mode: 0o600 });
  for (const extra of data.extras) {
    const target = path.join(targetRoot, extra.locator_key); await mkdir(path.dirname(target), { recursive: true, mode: 0o700 }); await writeFile(target, extra.bytes, { mode: 0o600 });
    records.push({ artifact_id: extra.artifact_id, kind: extra.kind, sha256: hashBytes(extra.bytes), size_bytes: extra.bytes.length, media_type: extra.media_type, locator_key: extra.locator_key, required_by: extra.required_by });
  }
  const manifest = createArtifactManifest({ run_id: runId, stage, package_id: `${runId}-${stage}`, upstream_manifest_sha256: upstreamManifestSha256, creative_brief_sha256: briefSha256, producer_isolation_sha256: producerIsolationSha256, artifacts: records, metrics: data.metrics });
  await writeFile(manifestFile(root, stage), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  await validateArtifactManifest(manifest, { root: targetRoot, expectedStage: stage, expectedUpstream: upstreamManifestSha256, expectedProducerIsolationSha256: producerIsolationSha256, expectedCreativeBriefSha256: briefSha256 });
  return manifest;
}

async function runDeterministicGates(stage, manifest, payload, contracts, projectRoot) {
  if (stage === 'director' || stage === 'render') return;
  if (stage === 'assets') { validateMasterBindings(payload.bindings); return; }
  if (stage !== 'master-build') fail('unsupported_product_stage', `Unsupported deterministic gate stage: ${stage}`);
  if (fingerprintValue(payload.display_selection) !== fingerprintValue(payload.font_package.display_selection)) fail('display_selection_unbound', 'Master build did not pass the approved display selection into the font package.');
  validateMasterBindings(payload.master_bindings);
  validateFontPackage(payload.font_package, { artifactManifest: manifest });
  const source = await validateRenderSource(path.join(projectRoot, 'hyperframes-project'));
  if (source.status !== 'approved') fail('render_source_revision_required', 'Render source failed deterministic source validation before final render.');
  validateVisualPreflightEvidence(payload.pre_master_evidence);
  const preflight = await analyzeVisualPreflight(payload.pre_master_evidence, { readFrame: async (artifactId) => contracts.frameBytes.get(artifactId) });
  if (preflight.status !== 'approved') fail('pre_master_visual_revision_required', 'Pre-master visual evidence requires batch revision before final render.');
}

async function readExisting(root, stage, input, upstreamReceipt, upstreamManifest, briefSha256) {
  try {
    const receipt = validateStageReceipt(JSON.parse(await readFile(receiptFile(root, stage), 'utf8')), { expectedStage: stage, expectedInput: input, expectedUpstream: upstreamReceipt });
    const manifest = JSON.parse(await readFile(manifestFile(root, stage), 'utf8'));
    await validateArtifactManifest(manifest, { root: artifactRoot(root, stage), expectedStage: stage, expectedUpstream: upstreamManifest, expectedProducerIsolationSha256: receipt.execution_isolation.stage_context_sha256, expectedCreativeBriefSha256: briefSha256 });
    if (receipt.output.manifest_envelope.manifest_sha256 !== manifest.manifest_sha256) fail('artifact_set_unbound', 'Receipt and manifest do not match.');
    if (receipt.output.review_refs.length) fail('legacy_reviewer_receipt_forbidden', 'The short pipeline does not accept legacy reviewer receipts.');
    return { receipt, manifest };
  } catch (error) { if (error?.code === 'ENOENT') return null; if (error instanceof SyntaxError) fail('receipt_invalid_json', 'Receipt or manifest JSON is invalid.'); throw error; }
}

export async function orchestrateFixture({ fixtureId = 'faceless-basic', projectRoot, fixtureFile, tamperPreMasterEvidence = false, tamperDisplaySelection = false, omitMainPreviewReview = false, omitOfficialHyperframesSkill = false } = {}) {
  if (!projectRoot) fail('project_root_required', 'A project root is required.');
  await mkdir(projectRoot, { recursive: true, mode: 0o700 });
  const result = await loadAndRunE2eFixture(fixtureId, fixtureFile);
  const fixtureDocument = JSON.parse(await readFile(fixtureFile ?? new URL('../assets/fixtures/e2e-contract.json', import.meta.url), 'utf8'));
  const fixture = fixtureDocument.fixtures.find((entry) => entry.fixture_id === fixtureId);
  const srtSha256 = createHash('sha256').update(fixture.srt, 'utf8').digest('hex');
  const inputManifest = createInputManifest({ mode: result.mode, inputs: { srt: { sha256: srtSha256, size_bytes: Buffer.byteLength(fixture.srt) }, ...(result.mode === 'talking-head' ? { control_media: { sha256: '0'.repeat(64), size_bytes: 0 } } : {}) } });
  let state = await loadRunState(projectRoot) ?? createRunState(inputManifest, { makeId: () => 'run-staged-e2e-fixture' });
  const contracts = fixtureContracts(result);
  if (tamperPreMasterEvidence) contracts.preMasterEvidence.shots[0].result.frame_sha256 = '0'.repeat(64);
  if (tamperDisplaySelection) contracts.displaySelection = { ...contracts.displaySelection, display_font_id: 'wrong-display' };
  const report = []; const artifactGraph = [];
  const briefSha256 = fingerprintValue({ fixture_id: fixtureId, creative_brief: 'confirmed' });
  let upstreamReceipt = null; let upstreamManifest = briefSha256; let upstreamStageReceipt = null;
  for (const stage of PRODUCT_STAGES.filter((item) => item !== 'shot-export')) {
    const input = fingerprintValue({ fixture_sha256: fixtureHash(fixture), stage, upstream_manifest_sha256: upstreamManifest });
    if (stage === 'render') assertFinalRenderPreflight(upstreamStageReceipt);
    const existing = await readExisting(projectRoot, stage, input, upstreamReceipt, upstreamManifest, briefSha256);
    if (existing) {
      upstreamReceipt = existing.receipt.receipt_sha256; upstreamManifest = existing.manifest.manifest_sha256; upstreamStageReceipt = existing.receipt;
      artifactGraph.push({ stage, manifest_sha256: upstreamManifest, action: 'reused' }); report.push({ stage, action: 'reused' }); continue;
    }
    if (stateStages[stage].some((name) => state.stages[name].status === 'complete')) fail('receipt_missing_for_complete_stage', 'Completed stage is missing its artifact receipt.');
    if (stage === 'master-build') await writeE2eFixtureProject(fixtureId, path.join(projectRoot, 'hyperframes-project'), fixtureFile);
    const producerIsolationSha256 = fingerprintValue({ fixtureId, stage, kind: 'producer-context' });
    const data = stageData(stage, result, contracts);
    if (stage === 'master-build' && omitOfficialHyperframesSkill) {
      delete data.payload.official_hyperframes_creation;
      delete data.metrics.official_hyperframes_skill_used;
      delete data.metrics.official_hyperframes_creation_sha256;
    }
    if (stage === 'render') validateVisualEvidence(data.payload.visual_evidence);
    const manifest = await writeStagePackage(projectRoot, stage, state.run_id, briefSha256, producerIsolationSha256, upstreamManifest, data);
    await runDeterministicGates(stage, manifest, data.payload, contracts, projectRoot);
    const mainReviewRefs = [];
    if (stage === 'director') mainReviewRefs.push(mainReview('shot_plan_review', manifest, { shot_count: data.metrics.shot_count, density_source: data.payload.density_source }));
    if (stage === 'assets') mainReviewRefs.push(mainReview('asset_fact_review', manifest, { shot_count: data.metrics.shot_count, pexels_selected_count: data.metrics.pexels_selected_count }));
    if (stage === 'master-build' && !omitMainPreviewReview) mainReviewRefs.push(mainReview('html_preview_review', manifest, { shot_count: data.metrics.shot_count, official_hyperframes_creation_sha256: data.metrics.official_hyperframes_creation_sha256 ?? null }));
    if (stage === 'render') mainReviewRefs.push(mainReview('final_frame_review', manifest, { shot_count: data.metrics.shot_count, master_sha256: data.metrics.master_sha256 }));
    const receipt = createStageReceipt({ stage, run_id: state.run_id, input_sha256: input, upstream_receipt_sha256: upstreamReceipt, execution_isolation: { host: 'fixture-test', mechanism: 'fixture', dispatch_evidence_sha256: fingerprintValue({ fixtureId, stage, kind: 'dispatch' }), stage_context_sha256: producerIsolationSha256 }, output: { manifest_envelope: createArtifactEnvelope(manifest), review_refs: [], main_review_refs: mainReviewRefs } });
    state = complete(state, stage, input, receipt.receipt_sha256);
    await mkdir(path.dirname(receiptFile(projectRoot, stage)), { recursive: true, mode: 0o700 }); await writeFile(receiptFile(projectRoot, stage), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 }); await saveRunState(projectRoot, state);
    upstreamReceipt = receipt.receipt_sha256; upstreamManifest = manifest.manifest_sha256; upstreamStageReceipt = receipt;
    artifactGraph.push({ stage, manifest_sha256: upstreamManifest, action: 'completed' }); report.push({ stage, action: 'completed' });
  }
  return { fixture_id: fixtureId, state, stages: report, artifact_graph: artifactGraph, final_receipt_sha256: upstreamReceipt, final_manifest_sha256: upstreamManifest, duration_ms: result.duration_ms, shot_count: result.shot_count, coverage_basis_points: result.coverage_basis_points };
}

const main = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (main) { const [fixtureId, projectRoot] = process.argv.slice(2); if (!fixtureId || !projectRoot) fail('usage', 'Usage: node orchestrate-stages.mjs <fixture-id> <project-root>'); process.stdout.write(`${JSON.stringify(await orchestrateFixture({ fixtureId, projectRoot }))}\n`); }
