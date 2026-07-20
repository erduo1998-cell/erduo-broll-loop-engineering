import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInputManifest, createRunState, fingerprintRenderValue, fingerprintValue, loadRunState, saveRunState, transitionStage } from './state.mjs';
import { loadAndRunE2eFixture, writeE2eFixtureProject } from './run-e2e-fixture.mjs';
import { PRODUCT_STAGES, createStageReceipt, validateStageReceipt } from './stage-receipt.mjs';

export class OrchestrationError extends Error { constructor(code, message) { super(message); this.name = 'OrchestrationError'; this.code = code; } }
const fail = (code, message) => { throw new OrchestrationError(code, message); };
const stateStages = { preflight: ['preflight'], director: ['directing'], assets: ['assets'], render: ['build', 'render'], verify: ['verify'] };
const receiptDir = (root) => path.join(root, '.erduo-hyperframes-broll', 'receipts');
const receiptFile = (root, stage) => path.join(receiptDir(root), `${stage}.json`);
const fixtureHash = (fixture) => fingerprintValue({ fixture_id: fixture.fixture_id, mode: fixture.mode, srt: fixture.srt });

async function readReceipt(root, stage, input, upstream) {
  try {
    return validateStageReceipt(JSON.parse(await readFile(receiptFile(root, stage), 'utf8')), { expectedStage: stage, expectedInput: input, expectedUpstream: upstream });
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) fail('receipt_invalid_json', 'Stage receipt is not valid JSON.');
    throw error;
  }
}
async function saveReceipt(root, receipt) { await mkdir(receiptDir(root), { recursive: true, mode: 0o700 }); await writeFile(receiptFile(root, receipt.stage), `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 }); }
function complete(state, stage, input, output) {
  for (const name of stateStages[stage]) {
    const current = state.stages[name];
    if (current.status === 'complete') continue;
    state = transitionStage(state, name, 'start', { input_fingerprint: input });
    state = transitionStage(state, name, 'complete', { output_fingerprint: output });
  }
  return state;
}
function requiredOutput(stage, result, srtSha256, surgeEvidence) {
  if (stage === 'preflight') return { mode: result.mode, srt_sha256: srtSha256, time_source: 'srt', capabilities: ['local-files', 'shell', 'hyperframes'] };
  if (stage === 'director') return { plan_sha256: result.timeline.plan_sha256, briefs_sha256: result.scenes.briefs_sha256, surge_adapter: { required_skill: 'video-script-builder', time_source: 'srt', disallowed_outputs: ['video-spec-hf.md', 'word-estimated-timing', 'asset-route-override'], invocation_evidence: surgeEvidence } };
  if (stage === 'assets') return { route: result.route, scene_count: result.shot_count };
  if (stage === 'render') return { composition_sha256: fingerprintRenderValue(result.composition), project_files: ['hyperframes.json', 'index.html', 'meta.json'] };
  return { coverage_basis_points: result.coverage_basis_points, duration_ms: result.duration_ms, shot_count: result.shot_count, verification: ['srt-coverage', 'shared-time-model', 'stage-receipt-chain'] };
}

export async function orchestrateFixture({ fixtureId = 'faceless-basic', projectRoot, fixtureFile, surgeEvidence = { host: 'fixture-test', mechanism: 'fixture', args_sha256: 'f'.repeat(64), transcript_sha256: 'e'.repeat(64), status: 'verified' } } = {}) {
  if (!projectRoot) fail('project_root_required', 'A project root is required.');
  await mkdir(projectRoot, { recursive: true, mode: 0o700 });
  const result = await loadAndRunE2eFixture(fixtureId, fixtureFile);
  const fixtureDocument = JSON.parse(await readFile(fixtureFile ?? new URL('../assets/fixtures/e2e-contract.json', import.meta.url), 'utf8'));
  const fixture = fixtureDocument.fixtures.find((entry) => entry.fixture_id === fixtureId);
  const srtSha256 = createHash('sha256').update(fixture.srt, 'utf8').digest('hex');
  const manifest = createInputManifest({ mode: result.mode, inputs: { srt: { sha256: srtSha256, size_bytes: Buffer.byteLength(fixture.srt) }, ...(result.mode === 'talking-head' ? { control_media: { sha256: '0'.repeat(64), size_bytes: 0 } } : {}) } });
  let state = await loadRunState(projectRoot) ?? createRunState(manifest, { makeId: () => 'run-staged-e2e-fixture' });
  const report = [];
  let upstream = null;
  for (const stage of PRODUCT_STAGES) {
    const input = fingerprintValue({ fixture_sha256: fixtureHash(fixture), stage, upstream_receipt_sha256: upstream });
    const existing = await readReceipt(projectRoot, stage, input, upstream);
    if (existing) { upstream = existing.receipt_sha256; report.push({ stage, action: 'reused' }); continue; }
    if (stateStages[stage].some((name) => state.stages[name].status === 'complete')) fail('receipt_missing_for_complete_stage', 'A completed stage is missing its matching receipt.');
    if (stage === 'render') await writeE2eFixtureProject(fixtureId, path.join(projectRoot, 'hyperframes-project'), fixtureFile);
    const output = requiredOutput(stage, result, srtSha256, surgeEvidence);
    const receipt = createStageReceipt({ stage, run_id: state.run_id, input_sha256: input, upstream_receipt_sha256: upstream, output });
    state = complete(state, stage, input, receipt.receipt_sha256);
    await saveReceipt(projectRoot, receipt); await saveRunState(projectRoot, state);
    upstream = receipt.receipt_sha256; report.push({ stage, action: 'completed' });
  }
  return { fixture_id: fixtureId, state, stages: report, final_receipt_sha256: upstream, duration_ms: result.duration_ms, shot_count: result.shot_count, coverage_basis_points: result.coverage_basis_points };
}

const main = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (main) {
  const [fixtureId, projectRoot, surgeEvidenceFile] = process.argv.slice(2);
  if (!fixtureId || !projectRoot) fail('usage', 'Usage: node orchestrate-stages.mjs <fixture-id> <project-root>');
  const surgeEvidence = surgeEvidenceFile ? JSON.parse(await readFile(surgeEvidenceFile, 'utf8')) : undefined;
  process.stdout.write(`${JSON.stringify(await orchestrateFixture({ fixtureId, projectRoot, surgeEvidence }))}\n`);
}
