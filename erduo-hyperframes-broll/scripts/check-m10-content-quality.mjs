import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDirectorSummary, validateFrameFusionAnalysis, validateM10VisualContract } from './validate-m10-visual-contract.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT_ID = /^S\d{3}$/u;
const ROUTES = new Set(['user-media', 'image-generation', 'pexels', 'hyperframes-native']);
const GATE_SET = new Set([
  'input-time',
  'shot-design',
  'asset-integrity',
  'delivery-media',
  'frame-visibility',
  'visual-contract',
  'm10-content-quality',
  'content-quality',
  'director-density-review',
  'pexels-composition-fit',
  'taste-preflight',
]);
const REASON_HINTS = /\u8bed\u4e49|\u610f\u56fe|\u8d28\u91cf|\u903b\u8f91|\u539f\u56e0|\b(why|semantic|because|logic|meaning|claim|sequence)\b/i;
const RELEASE_WITHDRAW = /withdraw|withdrawn|\u64a4\u9500|\u4f4e\u7ea7|\u5df2\u5f03\u754c/iu;

const EXIT_INVALID = 2;
const EXIT_READ = 3;
const EXIT_USAGE = 64;

export class M10ContentQualityError extends Error {
  constructor(code, message, shot) {
    super(message);
    this.name = 'M10ContentQualityError';
    this.code = code;
    if (shot !== undefined) this.shot = shot;
  }
}

function fail(code, message, shot) {
  throw new M10ContentQualityError(code, message, shot);
}

function exact(value, fields, code, message, shot) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, message, shot);
  }
}

function text(value, code, message, shot, max = 280) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(value)) {
    fail(code, message, shot);
  }
  return value.trim();
}

function fingerprintValue(value) {
  const visit = (item) => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item)) fail('invalid_hash_value', 'Quality fingerprint only accepts safe integers.');
      return item;
    }
    if (!item || typeof item !== 'object') fail('invalid_hash_value', 'Quality fingerprint value is unsupported.');
    if (Array.isArray(item)) return item.map(visit);
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, visit(item[key])]));
  };

  return createHash('sha256').update(JSON.stringify(visit(value)), 'utf8').digest('hex');
}

function normalizeStringArray(values, code, message, shot, maxItems = 12) {
  if (!Array.isArray(values) || values.length > maxItems) fail(code, message, shot);
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const item = text(value, code, message, shot, 120);
    if (seen.has(item)) fail(code, message, shot);
    seen.add(item);
    out.push(item);
  }
  return out;
}

function assertReleaseWithdrawn(statement, shot) {
  if (!statement || typeof statement !== 'object') fail('release_not_withdrawn', 'Release statement is missing.', shot);
  const declared = Object.entries(statement).find(([key]) => key === 'status' || key === 'state' || key === 'release_status');
  const status = declared ? String(declared[1]) : '';
  if (statement.withdrawn === true || RELEASE_WITHDRAW.test(status)) return;
  fail('release_not_withdrawn', 'Release statement must be explicitly withdrawn before this gate.', shot);
}

function validateRoutePlan(routePlan, shotCount, shotIds) {
  exact(routePlan, ['schema_version', 'visual_contract_sha256', 'shot_count', 'plan_sha256', 'route_policy', 'capability_profile', 'routes', 'route_plan_sha256'], 'invalid_route_plan', 'Route plan shape is invalid.');
  if (routePlan.schema_version !== 1 || !SHA256.test(routePlan.visual_contract_sha256) || !Number.isSafeInteger(routePlan.shot_count)
    || routePlan.shot_count < 1 || routePlan.shot_count !== shotCount || !Array.isArray(routePlan.routes) || routePlan.routes.length !== routePlan.shot_count) {
    fail('invalid_route_plan', 'Route plan content is invalid.');
  }

  const ids = new Set();
  for (const [index, shot] of routePlan.routes.entries()) {
    const shotId = `S${String(index + 1).padStart(3, '0')}`;
    exact(shot, ['shot_id', 'duration_ms', 'primary_route', 'primary_role', 'route_plan', 'route_plan_sha256', 'visual_grammar_family', 'compositing_mode'], 'invalid_route_plan', 'Route plan shot shape is invalid.', shotId);
    if (shot.shot_id !== shotId || shot.shot_id !== shotIds[index] || !SHOT_ID.test(shot.shot_id)) fail('invalid_route_plan', 'Route shot id is invalid.', shotId);
    if (ids.has(shot.shot_id)) fail('invalid_route_plan', 'Route shot id must be unique.', shotId);
    ids.add(shot.shot_id);
    if (!Number.isSafeInteger(shot.duration_ms) || shot.duration_ms <= 0) fail('invalid_route_plan', 'Route shot duration is invalid.', shotId);
    if (!ROUTES.has(shot.primary_route) || typeof shot.primary_role !== 'string' || !shot.primary_role.trim()) fail('invalid_route_plan', 'Route primary fields are invalid.', shotId);
    if (!Array.isArray(shot.route_plan) || shot.route_plan.length === 0) fail('invalid_route_plan', 'Route decisions are missing.', shotId);
    for (const role of shot.route_plan) {
      exact(role, ['role', 'route_order', 'selected_route', 'route_order_skipped', 'reason'], 'invalid_route_plan', 'Route role shape is invalid.', shotId);
      text(role.role, 'invalid_route_plan', 'Route role name is invalid.', shotId);
      normalizeStringArray(role.route_order, 'invalid_route_plan', 'Route order is invalid.', shotId, 8);
      normalizeStringArray(role.route_order_skipped, 'invalid_route_plan', 'Route skip history is invalid.', shotId, 8);
      if (!ROUTES.has(role.selected_route)) fail('invalid_route_plan', 'Selected route is invalid.', shotId);
      text(role.reason, 'invalid_route_plan', 'Route reason is invalid.', shotId, 120);
      if (typeof role.route_order[0] === 'undefined') fail('invalid_route_plan', 'Route order is invalid.', shotId);
      const firstUnavailable = role.route_order.indexOf(role.selected_route);
      if (firstUnavailable > role.route_order_skipped.length) fail('invalid_route_plan', 'Route skip history does not match route order.', shotId);
      for (let i = 0; i < firstUnavailable; i += 1) {
        if (!role.route_order_skipped.includes(role.route_order[i])) fail('invalid_route_plan', 'Route skip history does not match route order.', shotId);
      }
    }
    const recomputed = fingerprintValue({ shot_id: shot.shot_id, decisions: shot.route_plan });
    if (shot.route_plan_sha256 !== recomputed) fail('invalid_route_plan', 'Route shot hash is unstable.', shotId);
  }
}

function hasSemanticReason(shot) {
  return REASON_HINTS.test(`${shot.information_intent?.viewer_should_understand || ''} ${shot.visual_grammar?.agent_choice_reason || ''} ${shot.quality_notes?.judgment_note || ''}`);
}

function validateQualitySignals(visualContract, routePlan) {
  for (const [index, route] of routePlan.routes.entries()) {
    const shot = visualContract.shots[index];
    const previous = visualContract.shots[index - 1];
    if (!previous) continue;
    if (shot.visual_grammar.family === previous.visual_grammar.family
      && shot.compositing.mode === previous.compositing.mode
      && route.primary_route === routePlan.routes[index - 1].primary_route
      && !hasSemanticReason(shot)
      && !hasSemanticReason(previous)) {
      fail('adjacent_repetition', 'Adjacent shots reuse grammar/compositing/primary route without semantic justification.', shot.shot_id);
    }
  }
}

function pexelsShotIds(routePlan) {
  return routePlan.routes
    .filter((shot) => shot.primary_route === 'pexels' || shot.route_plan.some((role) => role.selected_route === 'pexels'))
    .map((shot) => shot.shot_id);
}

function assertPassStatus(value, code, message) {
  if (value !== 'pass') fail(code, message);
}

function validateDirectorReview(review) {
  exact(review, [
    'status',
    'reviewer',
    'director_density_retained',
    'shot_count_verdict',
    'density_range_gap',
    'dense_shot_ratio_bp',
    'all_medium_density',
    'notes',
  ], 'invalid_director_review', 'Director density review shape is invalid.');
  assertPassStatus(review.status, 'invalid_director_review', 'Director density review must pass before assets.');
  text(review.reviewer, 'invalid_director_review', 'Director reviewer is invalid.', undefined, 120);
  if (review.director_density_retained !== true) fail('director_density_not_retained', 'Director density was not retained.');
  if (typeof review.shot_count_verdict !== 'string' || !/\b(sufficient|pass|retained|adequate)\b/i.test(review.shot_count_verdict)) {
    fail('director_density_too_sparse', 'Shot count verdict must explicitly be sufficient.');
  }
  if (!Number.isSafeInteger(review.density_range_gap) || review.density_range_gap < 2) {
    fail('director_density_too_flat', 'Density range gap must be at least 2 levels.');
  }
  if (!Number.isSafeInteger(review.dense_shot_ratio_bp) || review.dense_shot_ratio_bp < 0 || review.dense_shot_ratio_bp > 2500) {
    fail('director_density_too_dense', 'Dense shot ratio must be at most 25%.');
  }
  if (review.all_medium_density !== false) fail('director_density_too_flat', 'All shots cannot sit at medium density.');
  text(review.notes, 'invalid_director_review', 'Director review notes are invalid.', undefined, 280);
  return review;
}

function validateMediaCompositionReview(review, pexelsIds) {
  exact(review, ['status', 'pexels_integrated', 'checked_shots', 'failures', 'notes'], 'invalid_media_composition_review', 'Media composition review shape is invalid.');
  assertPassStatus(review.status, 'invalid_media_composition_review', 'Media composition review must pass.');
  const checked = normalizeStringArray(review.checked_shots, 'invalid_media_composition_review', 'Media composition checked shots are invalid.', undefined, 100);
  const failures = normalizeStringArray(review.failures, 'pexels_composition_failed', 'Media composition failures are invalid.', undefined, 100);
  if (failures.length) fail('pexels_composition_failed', 'Pexels composition review contains failures.');
  if (pexelsIds.length) {
    if (review.pexels_integrated !== true) fail('pexels_not_integrated', 'Pexels selected routes must be integrated into the visual composition.');
    const checkedSet = new Set(checked);
    for (const shotId of pexelsIds) {
      if (!checkedSet.has(shotId)) fail('pexels_not_integrated', 'Pexels shot is missing from composition review.', shotId);
    }
  } else if (review.pexels_integrated !== 'not-applicable') {
    fail('invalid_media_composition_review', 'Pexels composition review must be not-applicable when no Pexels route is selected.');
  }
  text(review.notes, 'invalid_media_composition_review', 'Media composition review notes are invalid.', undefined, 280);
  return review;
}

function validateTasteReview(review) {
  exact(review, ['status', 'design_read', 'variance', 'motion', 'density', 'typography_plan', 'ai_tell_sweep', 'notes'], 'invalid_taste_review', 'Taste review shape is invalid.');
  assertPassStatus(review.status, 'invalid_taste_review', 'Taste preflight must pass before render.');
  text(review.design_read, 'invalid_taste_review', 'Taste design read is invalid.', undefined, 280);
  text(review.typography_plan, 'invalid_taste_review', 'Taste typography plan is invalid.', undefined, 280);
  for (const key of ['variance', 'motion', 'density']) {
    if (!Number.isSafeInteger(review[key]) || review[key] < 1 || review[key] > 10) fail('invalid_taste_review', `Taste ${key} dial is invalid.`);
  }
  const sweep = normalizeStringArray(review.ai_tell_sweep, 'invalid_taste_review', 'Taste AI-tell sweep is invalid.', undefined, 12);
  if (!sweep.length) fail('invalid_taste_review', 'Taste AI-tell sweep is required.');
  text(review.notes, 'invalid_taste_review', 'Taste review notes are invalid.', undefined, 280);
  return review;
}

function parseGates(values, shot) {
  if (!Array.isArray(values) || !values.length) fail('missing_quality_gate', 'No previous gate status is present.', shot);
  const gates = normalizeStringArray(values, 'invalid_gate_list', 'Passed gate list contains invalid values.', shot, 20);
  for (const gate of gates) {
    if (!GATE_SET.has(gate)) fail('invalid_gate_list', 'Unsupported gate name received.', shot);
  }
  const gateSet = new Set(gates);
  const hasQualityOnly = [...gateSet].every((item) => item === 'delivery-media' || item === 'frame-visibility');
  if (hasQualityOnly) fail('missing_quality_gate', 'A quality pass cannot rely only on delivery-media/frame-visibility checks.');
  return gateSet;
}

export function checkM10ContentQuality(document) {
  exact(document, [
    'schema_version',
    'frame_plan',
    'visual_contract',
    'frame_fusion',
    'director_summary',
    'route_plan',
    'director_review',
    'media_composition_review',
    'taste_review',
    'passed_gates',
    'release_statement',
  ], 'invalid_quality_request', 'Quality request is malformed.');
  if (document.schema_version !== 1) fail('invalid_quality_request', 'Quality request schema is invalid.');

  const gates = parseGates(document.passed_gates);
  if (!gates.has('visual-contract') || !gates.has('m10-content-quality')) fail('missing_quality_gate', 'M10 visual and content quality gates are required.');
  assertReleaseWithdrawn(document.release_statement);

  const frameFusion = document.frame_fusion?.frame_fusion_sha256 ? document.frame_fusion : validateFrameFusionAnalysis(document.frame_fusion);
  const directorSummary = document.director_summary?.director_summary_sha256 ? document.director_summary : validateDirectorSummary(document.director_summary);
  const validatedContract = document.visual_contract?.visual_contract_sha256
    ? document.visual_contract
    : validateM10VisualContract(
      document.frame_plan,
      frameFusion,
      directorSummary,
      document.visual_contract,
    );

  if (validatedContract.visual_contract_sha256 !== document.visual_contract.visual_contract_sha256) fail('invalid_visual_contract', 'Visual contract hash mismatch.');
  if (document.visual_contract.frame_fusion_sha256 !== frameFusion.frame_fusion_sha256) fail('invalid_visual_contract', 'Frame fusion hash mismatch.');
  if (document.visual_contract.director_summary_sha256 !== directorSummary.director_summary_sha256) fail('invalid_visual_contract', 'Director summary hash mismatch.');

  validateRoutePlan(document.route_plan, validatedContract.shot_count, validatedContract.shots.map((shot) => shot.shot_id));
  if (document.route_plan.visual_contract_sha256 !== validatedContract.visual_contract_sha256) fail('invalid_route_plan', 'Route plan is not aligned with this visual contract.');

  const selectedPexelsShotIds = pexelsShotIds(document.route_plan);
  if (!gates.has('director-density-review')) fail('missing_quality_gate', 'Director density review gate is required.');
  if (!gates.has('taste-preflight')) fail('missing_quality_gate', 'Taste preflight gate is required.');
  if (selectedPexelsShotIds.length && !gates.has('pexels-composition-fit')) fail('missing_quality_gate', 'Pexels composition fit gate is required when Pexels is selected.');
  const directorReview = validateDirectorReview(document.director_review);
  const mediaCompositionReview = validateMediaCompositionReview(document.media_composition_review, selectedPexelsShotIds);
  const tasteReview = validateTasteReview(document.taste_review);

  validateQualitySignals(validatedContract, document.route_plan);
  const core = {
    schema_version: 1,
    shot_count: validatedContract.shot_count,
    visual_contract_sha256: validatedContract.visual_contract_sha256,
    route_plan_sha256: document.route_plan.route_plan_sha256,
    director_review_sha256: fingerprintValue(directorReview),
    media_composition_review_sha256: fingerprintValue(mediaCompositionReview),
    taste_review_sha256: fingerprintValue(tasteReview),
    passed_gates: [...gates].sort(),
    release_statement: {
      withdrawn: true,
      source: 'release-status-update',
    },
  };
  return { ...core, quality_signature: fingerprintValue(core) };
}

export function parseQualityArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const prettyCount = argv.filter((item) => item === '--pretty').length;
  const unknown = argv.filter((item) => item.startsWith('-') && item !== '--pretty');
  const positional = argv.filter((item) => !item.startsWith('-'));
  if (unknown.length || prettyCount > 1 || positional.length !== 1 || argv.length !== positional.length + prettyCount) return { error: true };
  return { request: positional[0], pretty: prettyCount === 1 };
}

export async function runContentQualityCli(argv, adapters = {}) {
  const stdout = adapters.stdout ?? process.stdout;
  const stderr = adapters.stderr ?? process.stderr;
  const readFile = adapters.readFile ?? fs.readFile;
  const args = parseQualityArgs(argv);

  if (args.help) {
    stdout.write('Usage: node scripts/check-m10-content-quality.mjs <m10-content-quality-request.json> [--pretty]\n');
    return 0;
  }
  if (args.error) {
    stderr.write('check-m10-content-quality: invalid arguments (use --help)\n');
    return EXIT_USAGE;
  }

  try {
    const requestText = await readFile(args.request, 'utf8');
    const request = JSON.parse(requestText);
    stdout.write(`${JSON.stringify(checkM10ContentQuality(request), null, args.pretty ? 2 : 0)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof M10ContentQualityError) {
      stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code, message: error.message, ...(error.shot ? { shot_id: error.shot } : {}) } })}\n`);
      return EXIT_INVALID;
    }
    if (error?.name === 'M10VisualContractError') {
      stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code, message: error.message } })}\n`);
      return EXIT_INVALID;
    }
    stderr.write(`${JSON.stringify({ ok: false, error: { code: 'read_failed', message: 'Content-quality inputs could not be read.' } })}\n`);
    return EXIT_READ;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  process.exit(await runContentQualityCli(process.argv.slice(2)));
}
