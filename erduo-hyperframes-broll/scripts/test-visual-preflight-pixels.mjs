import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { analyzeVisualPreflight, VisualPreflightError } from './visual-preflight-pixels.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
function ppm(width, height, paint) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const [r, g, b] = paint(x, y); const offset = (y * width + x) * 3;
    rgb[offset] = r; rgb[offset + 1] = g; rgb[offset + 2] = b;
  }
  return Buffer.concat([Buffer.from(`P6\n${width} ${height}\n255\n`, 'ascii'), rgb]);
}
function darkText(shift = 0) { return ppm(96, 64, (x, y) => (x >= 4 + shift && x < 15 + shift && y >= 4 && y < 8 ? [245, 245, 245] : [0, 0, 0])); }
function brightTinyText(shift = 0) { return ppm(96, 64, (x, y) => (x >= 4 + shift && x < 15 + shift && y >= 4 && y < 8 ? [145, 45, 35] : [249, 245, 239])); }
function scene(color, mode = 0) {
  return ppm(96, 64, (x, y) => {
    const diagonal = mode === 0 ? x > y : x + y > 80;
    if (diagonal) return color;
    return mode === 0 ? [18, 34, 70] : [84, 32, 18];
  });
}
function evidenceFor(shots) {
  const frames = new Map();
  const record = (frame, id, timestamp) => {
    frames.set(id, frame);
    return { timestamp_ms: timestamp, frame_sha256: digest(frame), frame_artifact_id: id };
  };
  return {
    frames,
    evidence: {
      schema_version: 1,
      evidence_kind: 'internal-pre-master-stills',
      shots: shots.map((states, index) => ({
        shot_id: `S${String(index + 1).padStart(3, '0')}`,
        entry: record(states[0], `s${index + 1}-entry`, index * 3000 + 100),
        result: record(states[1], `s${index + 1}-result`, index * 3000 + 1000),
        exit: record(states[2], `s${index + 1}-exit`, index * 3000 + 2000),
      })),
    },
  };
}
const reader = (frames) => async (id) => frames.get(id);

test('passes materially distinct full-frame visual scenes using actual PPM pixels', async () => {
  const { evidence, frames } = evidenceFor([
    [scene([32, 96, 210], 0), scene([32, 96, 210], 1), scene([48, 128, 235], 0)],
    [scene([224, 100, 28], 1), scene([224, 100, 28], 0), scene([246, 156, 42], 1)],
  ]);
  const report = await analyzeVisualPreflight(evidence, { readFrame: reader(frames) });
  assert.equal(report.status, 'approved');
  assert.equal(report.inspected_state_count, 6);
  assert.deepEqual(report.findings, []);
});

test('does not reject a dark but materially occupied frame on brightness alone', async () => {
  const occupied = (color, flip = false) => ppm(96, 64, (x, y) => {
    const active = flip ? x + y > 45 : x > 20;
    return active ? color : [0, 0, 0];
  });
  const { evidence, frames } = evidenceFor([
    [occupied([40, 90, 180]), occupied([60, 110, 200], true), occupied([80, 130, 220])],
    [occupied([180, 70, 30], true), occupied([210, 90, 30]), occupied([230, 120, 40], true)],
  ]);
  const report = await analyzeVisualPreflight(evidence, { readFrame: reader(frames) });
  assert.equal(report.status, 'approved');
});

test('aggregates black-small-text and adjacent-repetition failures instead of stopping at one', async () => {
  const { evidence, frames } = evidenceFor([
    [darkText(0), darkText(1), darkText(2)],
    [darkText(3), darkText(4), darkText(5)],
  ]);
  const report = await analyzeVisualPreflight(evidence, { readFrame: reader(frames) });
  assert.equal(report.status, 'revision_required');
  assert.deepEqual(report.findings.map((finding) => finding.code), ['sparse_near_black_result', 'sparse_near_black_result', 'adjacent_visual_repetition']);
  assert.deepEqual(report.findings[2].shot_ids, ['S001', 'S002']);
});

test('rejects bright flat frames with only tiny marks while retaining complete findings', async () => {
  const { evidence, frames } = evidenceFor([
    [brightTinyText(0), brightTinyText(1), brightTinyText(2)],
    [brightTinyText(3), brightTinyText(4), brightTinyText(5)],
  ]);
  const report = await analyzeVisualPreflight(evidence, { readFrame: reader(frames) });
  assert.equal(report.status, 'revision_required');
  assert.deepEqual(report.findings.map((finding) => finding.code), ['sparse_bright_flat_result', 'sparse_bright_flat_result', 'adjacent_visual_repetition']);
});

test('affected-shot re-review retains its neighbour comparison but does not rescan unrelated shots', async () => {
  const { evidence, frames } = evidenceFor([
    [scene([32, 96, 210], 0), scene([32, 96, 210], 1), scene([48, 128, 235], 0)],
    [darkText(0), darkText(1), darkText(2)],
    [darkText(3), darkText(4), darkText(5)],
  ]);
  const report = await analyzeVisualPreflight(evidence, { readFrame: reader(frames), shotIds: ['S002'] });
  assert.equal(report.scope, 'affected_shots_plus_adjacent_comparisons');
  assert.deepEqual(report.inspected_shot_ids, ['S002']);
  assert.equal(report.findings.some((finding) => finding.code === 'adjacent_visual_repetition' && finding.shot_ids.includes('S003')), true);
});

test('rejects a hash claim when frozen frame bytes do not match it', async () => {
  const { evidence, frames } = evidenceFor([[scene([32, 96, 210], 0), scene([32, 96, 210], 1), scene([48, 128, 235], 0)]]);
  frames.set('s1-result', scene([1, 1, 1], 0));
  await assert.rejects(() => analyzeVisualPreflight(evidence, { readFrame: reader(frames) }), (error) => error instanceof VisualPreflightError && error.code === 'visual_preflight_frame_mismatch');
});
