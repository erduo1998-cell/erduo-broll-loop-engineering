#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { fingerprintRenderValue } from './state.mjs';
import { probeMedia } from './probe-media.mjs';

const execFile = promisify(execFileCallback);
const KINDS = new Set(['fullscreen', 'hard-alpha', 'light-pass', 'talking-head-master', 'faceless-master']);
const EXIT_INVALID = 2; const EXIT_READ = 3; const EXIT_USAGE = 64;
export class FrameVisibilityError extends Error { constructor(code, message, artifactId) { super(message); this.name = 'FrameVisibilityError'; this.code = code; if (artifactId) this.artifact_id = artifactId; } }
const fail = (code, message, id) => { throw new FrameVisibilityError(code, message, id); };
function exact(value, fields, code = 'invalid_request') { if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(code, 'Frame visibility input is invalid.'); }
function positive(value, id) { if (!Number.isSafeInteger(value) || value <= 0) fail('invalid_request', 'Frame visibility input is invalid.', id); return value; }
function artifactRef(item) { return { artifact_id: item.artifact_id, kind: item.kind }; }
function frameMs(rate) { return Math.max(1, Math.ceil(1000 * rate.denominator / rate.numerator)); }

export function sampleTimes(durationMs, frameRate) {
  positive(durationMs); exact(frameRate, ['numerator', 'denominator']); const frame = frameMs(frameRate); if (durationMs < frame * 3) fail('duration_too_short', 'Frame visibility input is invalid.');
  return [...new Set([frame, Math.floor(durationMs / 2), durationMs - frame])].sort((a, b) => a - b);
}
function verifyExpected(value, id) { exact(value, ['duration_ms', 'frame_rate']); positive(value.duration_ms, id); exact(value.frame_rate, ['numerator', 'denominator']); positive(value.frame_rate.numerator, id); positive(value.frame_rate.denominator, id); }
export function validateFrameVisibilityRequest(document) {
  exact(document, ['schema_version', 'artifacts']); if (document.schema_version !== 1 || !Array.isArray(document.artifacts) || !document.artifacts.length) fail('invalid_request', 'Frame visibility input is invalid.');
  const ids = new Set(); for (const item of document.artifacts) { exact(item, ['artifact_id', 'kind', 'expected']); if (typeof item.artifact_id !== 'string' || !/^[A-Z][A-Z0-9_-]{0,63}$/u.test(item.artifact_id) || ids.has(item.artifact_id) || !KINDS.has(item.kind)) fail('invalid_request', 'Frame visibility input is invalid.', item?.artifact_id); ids.add(item.artifact_id); verifyExpected(item.expected, item.artifact_id); sampleTimes(item.expected.duration_ms, item.expected.frame_rate); }
  return document;
}
function parseStats(text) { const min = /lavfi\.signalstats\.YMIN=([0-9.]+)/u.exec(text); const max = /lavfi\.signalstats\.YMAX=([0-9.]+)/u.exec(text); const avg = /lavfi\.signalstats\.YAVG=([0-9.]+)/u.exec(text); if (!min || !max || !avg) throw new Error('stats unavailable'); return { min: Number(min[1]), max: Number(max[1]), average: Number(avg[1]) }; }
export async function analyzeFrame(localPath, timeMs, mode, { execFileAsync = execFile, platform = process.platform } = {}) {
  const ffmpeg = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'; const filter = mode === 'hard-alpha' ? 'alphaextract,signalstats,metadata=print' : 'signalstats,metadata=print';
  const result = await execFileAsync(ffmpeg, ['-v', 'info', '-ss', String(timeMs / 1000), '-i', localPath, '-vf', filter, '-frames:v', '1', '-f', 'null', '-'], { timeout: 120_000, maxBuffer: 1024 * 1024 });
  return parseStats(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
}
async function assertFile(localPath, fsImpl, id) { if (typeof localPath !== 'string' || !localPath || /^https?:|^file:/u.test(localPath)) fail('artifact_missing', 'Rendered media is missing or unreadable.', id); try { const stat = await fsImpl.lstat(localPath); if (stat.isSymbolicLink() || !stat.isFile() || !Number.isSafeInteger(stat.size) || stat.size <= 0) fail('artifact_missing', 'Rendered media is missing or unreadable.', id); } catch (error) { if (error instanceof FrameVisibilityError) throw error; fail('artifact_missing', 'Rendered media is missing or unreadable.', id); } }
function validateProbe(item, probe) { const frame = item.expected.frame_rate; if (!probe?.decode?.ok || !probe?.video?.primary || probe.duration_ms === null || Math.abs(probe.duration_ms - item.expected.duration_ms) > frameMs(frame) || probe.video.primary.frame_rate?.numerator !== frame.numerator || probe.video.primary.frame_rate?.denominator !== frame.denominator) fail('media_metadata_mismatch', 'Rendered media does not match the frame-sampling contract.', item.artifact_id); }
function visible(kind, stats) { if (!Number.isFinite(stats?.min) || !Number.isFinite(stats?.max) || !Number.isFinite(stats?.average) || stats.min > stats.max) return false; if (kind === 'hard-alpha') return stats.max > stats.min; if (kind === 'light-pass') return stats.min <= 24 && stats.max > stats.min + 4; return stats.max > stats.min + 4 && stats.average > stats.min + 1; }
export async function verifyFrameVisibility(document, resolveArtifact, { fsImpl = fs, probe = probeMedia, analyze = analyzeFrame } = {}) {
  validateFrameVisibilityRequest(document); if (typeof resolveArtifact !== 'function' || typeof probe !== 'function' || typeof analyze !== 'function') fail('resolver_unavailable', 'Frame visibility verifier is unavailable.');
  const artifacts = [];
  for (const item of document.artifacts) {
    let localPath; try { localPath = await resolveArtifact(artifactRef(item)); } catch { fail('artifact_missing', 'Rendered media is missing or unreadable.', item.artifact_id); }
    await assertFile(localPath, fsImpl, item.artifact_id); let metadata; try { metadata = await probe(localPath); } catch { fail('media_invalid', 'Rendered media could not be probed.', item.artifact_id); } validateProbe(item, metadata);
    const samples = []; for (const time_ms of sampleTimes(item.expected.duration_ms, item.expected.frame_rate)) { let stats; try { stats = await analyze(localPath, time_ms, item.kind); } catch { fail('frame_extract_failed', 'Rendered media frame sampling failed.', item.artifact_id); } if (!visible(item.kind, stats)) fail('frame_not_visible', 'Rendered media lacks visible content at a required frame sample.', item.artifact_id); samples.push({ time_ms, min: stats.min, max: stats.max, average: stats.average }); }
    artifacts.push({ artifact_id: item.artifact_id, kind: item.kind, sample_count: samples.length, samples });
  }
  const core = { schema_version: 1, artifact_count: artifacts.length, artifacts }; return { ...core, visibility_sha256: fingerprintRenderValue(core) };
}
function parseArgs(argv) { if (argv.includes('--help') || argv.includes('-h')) return { help: true }; if (argv.length !== 2 || argv.some((item) => item.startsWith('-'))) return { error: true }; return { request: argv[0], locations: argv[1] }; }
function resolver(locations) { exact(locations, ['schema_version', 'locations'], 'invalid_locations'); if (locations.schema_version !== 1 || !Array.isArray(locations.locations)) fail('invalid_locations', 'Frame visibility locations are invalid.'); const map = new Map(); for (const item of locations.locations) { exact(item, ['artifact_id', 'kind', 'local_path'], 'invalid_locations'); if (typeof item.artifact_id !== 'string' || !KINDS.has(item.kind) || typeof item.local_path !== 'string' || map.has(`${item.artifact_id}:${item.kind}`)) fail('invalid_locations', 'Frame visibility locations are invalid.'); map.set(`${item.artifact_id}:${item.kind}`, item.local_path); } return ({ artifact_id, kind }) => map.get(`${artifact_id}:${kind}`); }
export async function runFrameVisibilityCli(argv, adapters = {}) { const stdout = adapters.stdout ?? process.stdout; const stderr = adapters.stderr ?? process.stderr; const readFile = adapters.readFile ?? fs.readFile; const args = parseArgs(argv); if (args.help) { stdout.write('Usage: node scripts/frame-visibility-gate.mjs <frame-request.json> <private-media-locations.json>\n'); return 0; } if (args.error) { stderr.write('frame-visibility-gate: invalid arguments (use --help)\n'); return EXIT_USAGE; } try { const [request, locations] = await Promise.all([readFile(args.request, 'utf8'), readFile(args.locations, 'utf8')]); stdout.write(`${JSON.stringify(await verifyFrameVisibility(JSON.parse(request), resolver(JSON.parse(locations)), adapters.options ?? {}))}\n`); return 0; } catch (error) { const safe = error instanceof FrameVisibilityError ? { code: error.code, message: error.message, ...(error.artifact_id ? { artifact_id: error.artifact_id } : {}) } : { code: 'read_failed', message: 'Frame visibility inputs could not be read.' }; stderr.write(`${JSON.stringify({ ok: false, error: safe })}\n`); return error instanceof FrameVisibilityError ? EXIT_INVALID : EXIT_READ; } }
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); if (isMain) process.exit(await runFrameVisibilityCli(process.argv.slice(2)));
