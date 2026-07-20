import { fingerprintRenderValue } from './state.mjs';

export class HyperframesTimelineError extends Error {
  constructor(code, message) { super(message); this.name = 'HyperframesTimelineError'; this.code = code; }
}

const fail = (code, message) => { throw new HyperframesTimelineError(code, message); };

export function buildHyperframesTimeline(coverage) {
  if (!coverage || coverage.schema_version !== 1 || coverage.coverage?.complete !== true
    || coverage.coverage?.coverage_basis_points !== 10000 || !coverage.timeline
    || !Array.isArray(coverage.windows) || coverage.shot_count !== coverage.windows.length) {
    fail('invalid_coverage', 'Complete coverage report is required.');
  }
  if (!Number.isSafeInteger(coverage.timeline.start_ms) || !Number.isSafeInteger(coverage.timeline.end_ms)
    || !Number.isSafeInteger(coverage.timeline.duration_ms) || coverage.timeline.start_ms < 0
    || coverage.timeline.end_ms <= coverage.timeline.start_ms
    || coverage.timeline.end_ms - coverage.timeline.start_ms !== coverage.timeline.duration_ms) {
    fail('invalid_timeline', 'Coverage timeline is invalid.');
  }
  let cursor = coverage.timeline.start_ms;
  const clips = coverage.windows.map((window, index) => {
    if (window.shot_id !== `S${String(index + 1).padStart(3, '0')}`
      || !Number.isSafeInteger(window.start_ms) || !Number.isSafeInteger(window.end_ms)
      || !Number.isSafeInteger(window.duration_ms) || window.start_ms !== cursor
      || window.end_ms - window.start_ms !== window.duration_ms || window.duration_ms <= 0) {
      fail('invalid_window', 'Coverage window is invalid.');
    }
    cursor = window.end_ms;
    return {
      shot_id: window.shot_id,
      master_start_sec: window.start_ms / 1000,
      master_duration_sec: window.duration_ms / 1000,
      local_start_sec: 0,
      local_duration_sec: window.duration_ms / 1000,
      primary_compositing: window.primary_compositing,
    };
  });
  if (cursor !== coverage.timeline.end_ms) fail('timeline_gap', 'Coverage windows do not equal master timeline.');

  // Root duration is SRT-global. A subtitle timeline may start after 00:00:00;
  // its first clip must still be placed at its global offset rather than be
  // shifted left or allowed to run past the composition root.
  const core = {
    schema_version: 1,
    plan_sha256: coverage.plan_sha256,
    briefs_sha256: coverage.briefs_sha256,
    master: {
      start_sec: 0,
      visual_start_sec: coverage.timeline.start_ms / 1000,
      duration_sec: coverage.timeline.end_ms / 1000,
    },
    clip_count: clips.length,
    clips,
  };
  return { ...core, timeline_sha256: fingerprintRenderValue(core) };
}
