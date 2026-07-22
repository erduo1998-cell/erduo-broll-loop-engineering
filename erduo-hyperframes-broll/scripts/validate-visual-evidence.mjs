import { fingerprintArtifactValue } from './artifact-manifest.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT = /^S\d{3}$/u;

export class VisualEvidenceError extends Error {
  constructor(code, message, shot_id) { super(message); this.name = 'VisualEvidenceError'; this.code = code; if (shot_id) this.shot_id = shot_id; }
}
const fail = (code, message, shotId) => { throw new VisualEvidenceError(code, message, shotId); };
const exact = (value, fields, shotId) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail('visual_evidence_invalid', 'Visual evidence has an invalid shape.', shotId);
};
function validateState(value, shotId) {
  exact(value, ['timestamp_ms', 'frame_sha256'], shotId);
  if (!Number.isSafeInteger(value.timestamp_ms) || value.timestamp_ms < 0 || !SHA256.test(value.frame_sha256 ?? '')) fail('visual_evidence_three_state_missing', 'Visual state needs a non-negative timestamp and frame hash.', shotId);
  return value;
}

export function validateVisualEvidence(document) {
  exact(document, ['schema_version', 'master_sha256', 'shots']);
  if (document.schema_version !== 2 || !SHA256.test(document.master_sha256 ?? '') || !Array.isArray(document.shots) || !document.shots.length) fail('visual_evidence_invalid', 'Visual evidence document is invalid.');
  const ids = new Set();
  for (const shot of document.shots) {
    exact(shot, ['shot_id', 'master_sha256', 'window_sha256', 'entry', 'result', 'exit'], shot?.shot_id);
    if (!SHOT.test(shot.shot_id ?? '') || ids.has(shot.shot_id) || shot.master_sha256 !== document.master_sha256
      || !(shot.window_sha256 === null || SHA256.test(shot.window_sha256 ?? ''))) fail('visual_evidence_master_mismatch', 'Shot evidence is duplicate, stale, or bound to another master.', shot?.shot_id);
    ids.add(shot.shot_id);
    const entry = validateState(shot.entry, shot.shot_id);
    const result = validateState(shot.result, shot.shot_id);
    const exit = validateState(shot.exit, shot.shot_id);
    if (!(entry.timestamp_ms < result.timestamp_ms && result.timestamp_ms < exit.timestamp_ms)
      || new Set([entry.frame_sha256, result.frame_sha256, exit.frame_sha256]).size !== 3) fail('visual_evidence_three_state_missing', 'Entry, result, and exit evidence must be distinct and strictly time ordered.', shot.shot_id);
  }
  return { shot_count: document.shots.length, master_sha256: document.master_sha256, visual_evidence_sha256: fingerprintArtifactValue(document) };
}
