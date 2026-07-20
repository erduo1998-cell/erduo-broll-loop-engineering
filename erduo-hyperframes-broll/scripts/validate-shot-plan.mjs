#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { fingerprintValue } from './state.mjs';

const REASONS = new Set(['opening', 'continuation', 'question', 'claim', 'contrast', 'example', 'data', 'list-item', 'emotional-turn', 'conclusion']);
const SHA256 = /^[0-9a-f]{64}$/u;
const EXIT_INVALID = 2;
const EXIT_READ = 3;
const EXIT_USAGE = 64;

export class ShotPlanError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ShotPlanError';
    this.code = code;
    if (details.shot !== undefined) this.shot = details.shot;
    if (details.chapter !== undefined) this.chapter = details.chapter;
  }
}

function planFail(code, message, details) {
  throw new ShotPlanError(code, message, details);
}

function exactFields(value, fields, code, message, details) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) planFail(code, message, details);
}

function safeText(value, code, message, details, max = 500) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(value)) planFail(code, message, details);
  return value.trim();
}

function validateSrt(srt) {
  if (!srt || srt.schema_version !== 1 || !SHA256.test(srt.content_sha256) || !Number.isSafeInteger(srt.cue_count) || srt.cue_count < 1 || !Array.isArray(srt.cues) || srt.cues.length !== srt.cue_count) planFail('invalid_srt_model', 'Parsed SRT model is invalid.');
  for (let index = 0; index < srt.cues.length; index += 1) {
    const cue = srt.cues[index];
    if (cue.ordinal !== index + 1 || !Number.isSafeInteger(cue.start_ms) || !Number.isSafeInteger(cue.end_ms) || cue.end_ms <= cue.start_ms) planFail('invalid_srt_model', 'Parsed SRT cue timing is invalid.');
  }
}

export function validateAndNormalizeShotPlan(srt, plan) {
  validateSrt(srt);
  exactFields(plan, ['schema_version', 'srt_sha256', 'shots', 'chapters'], 'invalid_plan', 'Shot plan shape is invalid.');
  if (plan.schema_version !== 1 || plan.srt_sha256 !== srt.content_sha256 || !Array.isArray(plan.shots) || !plan.shots.length || !Array.isArray(plan.chapters) || !plan.chapters.length) planFail('invalid_plan', 'Shot plan metadata or SRT fingerprint is invalid.');

  let expectedCue = 1;
  const shots = plan.shots.map((shot, index) => {
    const number = index + 1;
    const details = { shot: number };
    exactFields(shot, ['shot_id', 'cue_start', 'cue_end', 'narrated_claim', 'transition_reason'], 'invalid_shot', 'Shot shape is invalid.', details);
    const expectedId = `S${String(number).padStart(3, '0')}`;
    if (shot.shot_id !== expectedId) planFail('invalid_shot_id', 'Shot IDs must be stable and sequential.', details);
    if (!Number.isSafeInteger(shot.cue_start) || !Number.isSafeInteger(shot.cue_end) || shot.cue_start !== expectedCue || shot.cue_end < shot.cue_start || shot.cue_end > srt.cue_count) planFail('invalid_cue_coverage', 'Shots must cover consecutive cue ordinals exactly once.', details);
    if (!REASONS.has(shot.transition_reason) || (index === 0 && shot.transition_reason !== 'opening') || (index > 0 && shot.transition_reason === 'opening')) planFail('invalid_transition_reason', 'Shot transition reason is invalid.', details);
    const normalized = {
      shot_id: expectedId,
      cue_start: shot.cue_start,
      cue_end: shot.cue_end,
      narrated_claim: safeText(shot.narrated_claim, 'invalid_claim', 'Shot narrated claim is invalid.', details),
      transition_reason: shot.transition_reason,
    };
    expectedCue = shot.cue_end + 1;
    return normalized;
  });
  if (expectedCue !== srt.cue_count + 1) planFail('invalid_cue_coverage', 'Shot plan does not cover every SRT cue.');

  for (let index = 0; index < shots.length; index += 1) {
    const startCue = srt.cues[shots[index].cue_start - 1];
    const endMs = index + 1 < shots.length
      ? srt.cues[shots[index + 1].cue_start - 1].start_ms
      : srt.cues[shots[index].cue_end - 1].end_ms;
    Object.assign(shots[index], {
      start_ms: startCue.start_ms,
      end_ms: endMs,
      duration_ms: endMs - startCue.start_ms,
    });
    if (shots[index].duration_ms <= 0) planFail('invalid_visual_window', 'Derived visual shot window is invalid.', { shot: index + 1 });
  }

  let expectedShot = 1;
  const chapters = plan.chapters.map((chapter, index) => {
    const number = index + 1;
    const details = { chapter: number };
    exactFields(chapter, ['chapter_id', 'shot_start', 'shot_end', 'title', 'purpose'], 'invalid_chapter', 'Chapter shape is invalid.', details);
    const expectedId = `C${String(number).padStart(3, '0')}`;
    if (chapter.chapter_id !== expectedId || !/^S\d{3}$/u.test(chapter.shot_start) || !/^S\d{3}$/u.test(chapter.shot_end)) planFail('invalid_chapter_id', 'Chapter IDs and shot references are invalid.', details);
    const start = Number(chapter.shot_start.slice(1));
    const end = Number(chapter.shot_end.slice(1));
    if (start !== expectedShot || end < start || end > shots.length) planFail('invalid_chapter_coverage', 'Chapters must cover consecutive shots exactly once.', details);
    expectedShot = end + 1;
    return {
      chapter_id: expectedId,
      shot_start: chapter.shot_start,
      shot_end: chapter.shot_end,
      start_ms: shots[start - 1].start_ms,
      end_ms: shots[end - 1].end_ms,
      title: safeText(chapter.title, 'invalid_chapter_text', 'Chapter title is invalid.', details, 120),
      purpose: safeText(chapter.purpose, 'invalid_chapter_text', 'Chapter purpose is invalid.', details, 300),
    };
  });
  if (expectedShot !== shots.length + 1) planFail('invalid_chapter_coverage', 'Chapters do not cover every shot.');

  const warnings = [];
  const mechanicallySplit = srt.cue_count >= 5 && shots.length / srt.cue_count >= 0.8;
  if (mechanicallySplit) warnings.push({ code: 'mechanical_split', message: 'Most cues became individual shots; review semantic merging.' });
  if (srt.cue_count >= 10 && shots.length === 1) warnings.push({ code: 'under_segmented', message: 'A multi-part SRT became one shot; review argument changes.' });
  for (const shot of shots) {
    if (shot.duration_ms < 2000) warnings.push({ code: 'short_shot', shot_id: shot.shot_id, message: 'Shot is shorter than two seconds; confirm the cut is intentional.' });
    if (shot.duration_ms > 15000) warnings.push({ code: 'overlong_shot', shot_id: shot.shot_id, message: 'Shot is longer than fifteen seconds; confirm one visual thought can sustain it.' });
  }

  const core = {
    schema_version: 1,
    srt_sha256: srt.content_sha256,
    timeline: {
      start_ms: shots[0].start_ms,
      end_ms: shots.at(-1).end_ms,
      duration_ms: shots.at(-1).end_ms - shots[0].start_ms,
    },
    shot_count: shots.length,
    chapter_count: chapters.length,
    shots,
    chapters,
    warnings,
  };
  return { ...core, plan_sha256: fingerprintValue(core) };
}

export function parseShotPlanArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const prettyCount = argv.filter((value) => value === '--pretty').length;
  const unknown = argv.filter((value) => value.startsWith('-') && value !== '--pretty');
  const positional = argv.filter((value) => !value.startsWith('-'));
  if (unknown.length || prettyCount > 1 || positional.length !== 2 || argv.length !== positional.length + prettyCount) return { error: true };
  return { srt: positional[0], plan: positional[1], pretty: prettyCount === 1 };
}

export async function runShotPlanCli(argv, adapters = {}) {
  const stdout = adapters.stdout ?? process.stdout;
  const stderr = adapters.stderr ?? process.stderr;
  const readFile = adapters.readFile ?? fs.readFile;
  const args = parseShotPlanArgs(argv);
  if (args.help) {
    stdout.write('Usage: node scripts/validate-shot-plan.mjs <parsed-srt.json> <shot-plan.json> [--pretty]\n');
    return 0;
  }
  if (args.error) {
    stderr.write('validate-shot-plan: invalid arguments (use --help)\n');
    return EXIT_USAGE;
  }
  let srt;
  let plan;
  try {
    srt = JSON.parse(await readFile(args.srt, 'utf8'));
    plan = JSON.parse(await readFile(args.plan, 'utf8'));
  } catch {
    stderr.write(`${JSON.stringify({ ok: false, error: { code: 'read_failed', message: 'SRT model or shot plan could not be read.' } })}\n`);
    return EXIT_READ;
  }
  try {
    const result = validateAndNormalizeShotPlan(srt, plan);
    stdout.write(`${JSON.stringify(result, null, args.pretty ? 2 : 0)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof ShotPlanError) {
      stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code, message: error.message, ...(error.shot ? { shot: error.shot } : {}), ...(error.chapter ? { chapter: error.chapter } : {}) } })}\n`);
      return EXIT_INVALID;
    }
    stderr.write(`${JSON.stringify({ ok: false, error: { code: 'internal_error', message: 'Unexpected shot plan validation failure.' } })}\n`);
    return 70;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exit(await runShotPlanCli(process.argv.slice(2)));
