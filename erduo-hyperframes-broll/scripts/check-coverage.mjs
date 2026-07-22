#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprintValue } from './state.mjs';

const MODES = new Set(['talking-head', 'faceless']);
const COMPOSITING = new Set(['fullscreen', 'hard-alpha-over-source', 'native-base-with-overlay']);
const ROUTES = new Set(['user-media', 'image-generation', 'pexels', 'hyperframes-native', 'mixed']);
const SHA256 = /^[0-9a-f]{64}$/u;

export class CoverageError extends Error {
  constructor(code, message, shotId) {
    super(message);
    this.name = 'CoverageError';
    this.code = code;
    if (shotId) this.shot_id = shotId;
  }
}

function fail(code, message, shotId) {
  throw new CoverageError(code, message, shotId);
}

function exact(value, fields, code, message, shotId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, message, shotId);
  }
}

function safeMs(value, code, message, shotId, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || value < 0 || (positive && value === 0)) fail(code, message, shotId);
  return value;
}

function verifyPlan(plan) {
  exact(plan, ['schema_version', 'srt_sha256', 'timeline', 'shot_count', 'chapter_count', 'shots', 'chapters', 'warnings', 'plan_sha256'], 'invalid_plan', 'Normalized shot plan shape is invalid.');
  if (plan.schema_version !== 1 || !SHA256.test(plan.srt_sha256) || !SHA256.test(plan.plan_sha256)
    || !Array.isArray(plan.shots) || plan.shots.length === 0 || plan.shot_count !== plan.shots.length
    || !Array.isArray(plan.chapters) || plan.chapter_count !== plan.chapters.length || !Array.isArray(plan.warnings)) {
    fail('invalid_plan', 'Normalized shot plan metadata is invalid.');
  }
  const { plan_sha256: claimedHash, ...core } = plan;
  if (fingerprintValue(core) !== claimedHash) fail('plan_tampered', 'Normalized shot plan fingerprint is invalid.');

  exact(plan.timeline, ['start_ms', 'end_ms', 'duration_ms'], 'invalid_timeline', 'Plan timeline shape is invalid.');
  const timelineStart = safeMs(plan.timeline.start_ms, 'invalid_timeline', 'Plan timeline start is invalid.');
  const timelineEnd = safeMs(plan.timeline.end_ms, 'invalid_timeline', 'Plan timeline end is invalid.', undefined, { positive: true });
  const timelineDuration = safeMs(plan.timeline.duration_ms, 'invalid_timeline', 'Plan timeline duration is invalid.', undefined, { positive: true });
  if (timelineEnd <= timelineStart || timelineEnd - timelineStart !== timelineDuration) fail('invalid_timeline', 'Plan timeline duration is inconsistent.');

  let cursor = timelineStart;
  for (let index = 0; index < plan.shots.length; index += 1) {
    const shot = plan.shots[index];
    const expectedId = `S${String(index + 1).padStart(3, '0')}`;
    exact(shot, ['shot_id', 'cue_start', 'cue_end', 'narrated_claim', 'transition_reason', 'start_ms', 'end_ms', 'duration_ms'], 'invalid_shot', 'Normalized shot shape is invalid.', expectedId);
    if (shot.shot_id !== expectedId) fail('invalid_shot', 'Shot order is invalid.', expectedId);
    const start = safeMs(shot.start_ms, 'invalid_window', 'Shot start is invalid.', expectedId);
    const end = safeMs(shot.end_ms, 'invalid_window', 'Shot end is invalid.', expectedId, { positive: true });
    const duration = safeMs(shot.duration_ms, 'invalid_window', 'Shot duration is invalid.', expectedId, { positive: true });
    if (start !== cursor || end <= start || end - start !== duration) fail('coverage_gap', 'Shot windows are not contiguous.', expectedId);
    cursor = end;
  }
  if (cursor !== timelineEnd) fail('coverage_gap', 'Shot windows do not reach the timeline end.');
}

function verifyBriefs(plan, document) {
  exact(document, ['schema_version', 'plan_sha256', 'brief_count', 'briefs', 'briefs_sha256'], 'invalid_briefs', 'Validated brief document shape is invalid.');
  if (document.schema_version !== 1 || document.plan_sha256 !== plan.plan_sha256
    || !SHA256.test(document.briefs_sha256) || !Array.isArray(document.briefs)
    || document.brief_count !== plan.shot_count || document.briefs.length !== plan.shot_count) {
    fail('invalid_briefs', 'Validated briefs do not match the shot plan.');
  }
  const { briefs_sha256: claimedHash, ...core } = document;
  if (fingerprintValue(core) !== claimedHash) fail('briefs_tampered', 'Validated brief fingerprint is invalid.');
}

export function checkCandidateCoverage(plan, directorBriefs, mode) {
  if (!MODES.has(mode)) fail('invalid_mode', 'Coverage mode is invalid.');
  verifyPlan(plan);
  verifyBriefs(plan, directorBriefs);

  const windows = plan.shots.map((shot, index) => {
    const brief = directorBriefs.briefs[index];
    exact(brief, ['shot_id', 'duration_ms', 'comprehension_purpose', 'semantic_type', 'representation', 'visible_action', 'result_state', 'evidence', 'silent_test', 'asset_needs', 'anti_collision'], 'invalid_brief', 'Validated brief shape is invalid.', shot.shot_id);
    if (!brief || brief.shot_id !== shot.shot_id) fail('brief_missing', 'Shot does not have one matching director brief.', shot.shot_id);
    if (brief.duration_ms !== shot.duration_ms) fail('duration_mismatch', 'Brief duration does not match the authoritative shot window.', shot.shot_id);
    exact(brief.silent_test, ['expected_guess', 'visible_clues', 'ambiguity_risk', 'verdict', 'review_note'], 'invalid_brief', 'Validated silent review shape is invalid.', shot.shot_id);
    if (!brief.silent_test || brief.silent_test.verdict !== 'pass') fail('silent_test_failed', 'Shot has no passing silent review.', shot.shot_id);
    exact(brief.asset_needs, ['preferred_route', 'primary_compositing', 'query_subjects', 'prohibitions'], 'invalid_brief', 'Validated asset needs shape is invalid.', shot.shot_id);
    if (!ROUTES.has(brief.asset_needs.preferred_route)) fail('invalid_brief', 'Validated asset route is invalid.', shot.shot_id);
    const primary = brief.asset_needs?.primary_compositing;
    if (!COMPOSITING.has(primary)) fail('invalid_compositing', 'Shot primary coverage composition is invalid.', shot.shot_id);
    if (mode === 'faceless' && primary === 'hard-alpha-over-source') fail('mode_conflict', 'Faceless coverage cannot depend on a talking-head source layer.', shot.shot_id);
    return {
      shot_id: shot.shot_id,
      start_ms: shot.start_ms,
      end_ms: shot.end_ms,
      duration_ms: shot.duration_ms,
      preferred_route: brief.asset_needs.preferred_route,
      primary_compositing: primary,
    };
  });

  const totalMs = plan.timeline.duration_ms;
  const coveredMs = windows.reduce((sum, window) => sum + window.duration_ms, 0);
  if (coveredMs !== totalMs) fail('coverage_gap', 'Covered duration does not equal the authoritative timeline.');
  const core = {
    schema_version: 1,
    mode,
    plan_sha256: plan.plan_sha256,
    briefs_sha256: directorBriefs.briefs_sha256,
    timeline: { ...plan.timeline },
    shot_count: windows.length,
    coverage: {
      covered_ms: coveredMs,
      total_ms: totalMs,
      uncovered_ms: 0,
      coverage_basis_points: 10000,
      complete: true,
    },
    windows,
  };
  return { ...core, report_sha256: fingerprintValue(core) };
}

export function parseCoverageArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const prettyCount = argv.filter((arg) => arg === '--pretty').length;
  const unknown = argv.filter((arg) => arg.startsWith('-') && arg !== '--pretty');
  const positional = argv.filter((arg) => !arg.startsWith('-'));
  if (unknown.length || prettyCount > 1 || positional.length !== 3 || argv.length !== positional.length + prettyCount) return { error: true };
  return { mode: positional[0], plan: positional[1], briefs: positional[2], pretty: prettyCount === 1 };
}

export async function runCoverageCli(argv, adapters = {}) {
  const stdout = adapters.stdout ?? process.stdout;
  const stderr = adapters.stderr ?? process.stderr;
  const readFile = adapters.readFile ?? fs.readFile;
  const args = parseCoverageArgs(argv);
  if (args.help) {
    stdout.write('Usage: node scripts/check-coverage.mjs <talking-head|faceless> <normalized-plan.json> <validated-briefs.json> [--pretty]\n');
    return 0;
  }
  if (args.error) {
    stderr.write('check-coverage: invalid arguments (use --help)\n');
    return 64;
  }
  try {
    const [planText, briefText] = await Promise.all([readFile(args.plan, 'utf8'), readFile(args.briefs, 'utf8')]);
    const result = checkCandidateCoverage(JSON.parse(planText), JSON.parse(briefText), args.mode);
    stdout.write(`${JSON.stringify(result, null, args.pretty ? 2 : 0)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof CoverageError) {
      stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code, message: error.message, ...(error.shot_id ? { shot_id: error.shot_id } : {}) } })}\n`);
      return 2;
    }
    stderr.write(`${JSON.stringify({ ok: false, error: { code: 'read_failed', message: 'Coverage inputs could not be read.' } })}\n`);
    return 3;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exit(await runCoverageCli(process.argv.slice(2)));
