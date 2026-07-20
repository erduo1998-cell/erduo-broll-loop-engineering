import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSrt } from './parse-srt.mjs';
import { validateAndNormalizeShotPlan } from './validate-shot-plan.mjs';
import { validateDirectorBriefs } from './validate-director-brief.mjs';
import { checkCandidateCoverage } from './check-coverage.mjs';
import { buildNativeScenes } from './native-fallback.mjs';
import { buildHyperframesTimeline } from './build-hyperframes-timeline.mjs';
import { buildFullscreenComposition, writeFullscreenProject } from './build-fullscreen-composition.mjs';

export class E2eFixtureError extends Error { constructor(code, message) { super(message); this.name = 'E2eFixtureError'; this.code = code; } }
function fixtureFail(code, message) { throw new E2eFixtureError(code, message); }
function brief(shot, index) { return { shot_id: shot.shot_id, comprehension_purpose: 'Show a visible process.', semantic_type: 'process', representation: { mode: 'process-system', subjects: index ? ['flow', 'settled state'] : ['gate', 'signal'], relationship: 'A visible system changes state.', grounding: 'Objects and motion make the process visible.' }, visible_action: { verb: index ? 'transform' : 'filter', from_state: 'Signal enters.', to_state: 'Visible result remains.' }, result_state: { visible_outcome: 'A readable final state remains.', hold_intent: 'normal' }, evidence: { mode: 'abstract-relationship', source_ids: [], claim_handling: 'non-literal' }, silent_test: { expected_guess: 'A process changes state.', visible_clues: ['objects', 'motion'], ambiguity_risk: 'Keep result visible.', verdict: 'pass', review_note: 'Native objects show the change.' }, asset_needs: { preferred_route: 'hyperframes-native', primary_compositing: 'fullscreen', query_subjects: [], prohibitions: ['subtitle card'] }, anti_collision: { motif_id: `M-FIXTURE-${shot.shot_id}`, varied_dimensions: index ? ['layout', 'primary-action'] : ['layout', 'entrance'], complete_metaphor_reuse: false } }; }
export function runE2eFixture(fixture) {
  if (!fixture || !['talking-head', 'faceless'].includes(fixture.mode) || typeof fixture.srt !== 'string' || !fixture.expected) fixtureFail('invalid_fixture', 'E2E fixture is invalid.');
  const srt = parseSrt(fixture.srt); const shots = srt.cues.map((cue, index) => ({ shot_id: `S${String(index + 1).padStart(3, '0')}`, cue_start: cue.ordinal, cue_end: cue.ordinal, narrated_claim: `Fixture process ${index + 1}.`, transition_reason: index ? 'continuation' : 'opening' }));
  const plan = validateAndNormalizeShotPlan(srt, { schema_version: 1, srt_sha256: srt.content_sha256, shots, chapters: [{ chapter_id: 'C001', shot_start: 'S001', shot_end: shots.at(-1).shot_id, title: 'Fixture', purpose: 'Verify portable native delivery.' }] });
  const briefs = validateDirectorBriefs(plan, { schema_version: 1, plan_sha256: plan.plan_sha256, briefs: plan.shots.map(brief) });
  const coverage = checkCandidateCoverage(plan, briefs, fixture.mode); const timeline = buildHyperframesTimeline(coverage); const scenes = buildNativeScenes(briefs); const composition = buildFullscreenComposition(timeline, scenes);
  if (fixture.expected.duration_ms !== coverage.timeline.duration_ms || fixture.expected.coverage_basis_points !== coverage.coverage.coverage_basis_points || fixture.expected.shot_count !== plan.shot_count) fixtureFail('fixture_contract_mismatch', 'E2E fixture contract does not match generated output.');
  return { schema_version: 1, fixture_id: fixture.fixture_id, mode: fixture.mode, duration_ms: coverage.timeline.duration_ms, shot_count: plan.shot_count, coverage_basis_points: coverage.coverage.coverage_basis_points, master_audio: fixture.expected.master_audio, route: 'hyperframes-native', timeline, scenes, composition };
}
export async function writeE2eFixtureProject(fixtureId, outputDir, fixtureFile) { const result = await loadAndRunE2eFixture(fixtureId, fixtureFile); await writeFullscreenProject(outputDir, result.composition); return { fixture_id: result.fixture_id, output_dir: outputDir, duration_ms: result.duration_ms, shot_count: result.shot_count, coverage_basis_points: result.coverage_basis_points, route: result.route }; }
export async function loadAndRunE2eFixture(fixtureId, fixtureFile = new URL('../assets/fixtures/e2e-contract.json', import.meta.url)) { const document = JSON.parse(await readFile(fixtureFile, 'utf8')); const fixture = document.fixtures?.find((entry) => entry.fixture_id === fixtureId); if (!fixture) fixtureFail('fixture_not_found', 'E2E fixture was not found.'); return runE2eFixture(fixture); }
const main = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); if (main) { const result = await loadAndRunE2eFixture(process.argv[2]); process.stdout.write(`${JSON.stringify({ fixture_id: result.fixture_id, mode: result.mode, duration_ms: result.duration_ms, shot_count: result.shot_count, coverage_basis_points: result.coverage_basis_points, route: result.route })}\n`); }
