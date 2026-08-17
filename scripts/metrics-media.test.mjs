import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  createProductionProfile,
} from '../erduo-broll-loop-engineering/scripts/create-production-profile.mjs';
import {
  mezzanineVideoArgs,
  validateMezzaninePolicy,
} from '../erduo-broll-loop-engineering/scripts/frozen-media-policy.mjs';
import {
  recordProductionEvent,
} from '../erduo-broll-loop-engineering/scripts/record-production-event.mjs';
import {
  collectProductionMetrics,
} from '../erduo-broll-loop-engineering/scripts/collect-production-metrics.mjs';
import {
  verifyLightweightCodec,
} from '../erduo-broll-loop-engineering/scripts/verify-lightweight-codec.mjs';

async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'erduo-v1-metrics-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('v1 profile defaults to lightweight high-quality H.264 and lossless requires a reason', () => {
  const profile = createProductionProfile();
  assert.deepEqual({
    container: profile.mezzanine.container,
    codec: profile.mezzanine.codec,
    encoder: profile.mezzanine.encoder,
    preset: profile.mezzanine.preset,
    crf: profile.mezzanine.crf,
    gopFrames: profile.mezzanine.gopFrames,
    pixelFormat: profile.mezzanine.pixelFormat,
    class: profile.mezzanine.class,
  }, {
    container: 'mp4', codec: 'h264', encoder: 'libx264', preset: 'medium',
    crf: 12, gopFrames: 60, pixelFormat: 'yuv420p', class: 'visually-lossless',
  });
  assert.deepEqual(validateMezzaninePolicy(profile.mezzanine), []);
  assert.match(mezzanineVideoArgs(profile).join(' '), /-g 60 -keyint_min 60 -sc_threshold 0/u);
  assert.throws(
    () => createProductionProfile({ mezzanineFormat: 'ffv1-mkv' }),
    /reason is required/u,
  );
  const lossless = createProductionProfile({
    mezzanineFormat: 'ffv1-mkv', mezzanineReason: 'hybrid-cross-backend-exchange',
  });
  assert.equal(lossless.mezzanine.codec, 'ffv1');
  assert.equal(lossless.mezzanine.class, 'lossless');
  assert.equal(lossless.mezzanine.upgradeReason, 'hybrid-cross-backend-exchange');
  assert.deepEqual(validateMezzaninePolicy(lossless.mezzanine), []);
});

test('production metrics use one public-safe scan and preserve unknown host token facts', async (t) => {
  const root = await temporary(t);
  const eventsFile = path.join(root, 'production-events.ndjson');
  await mkdir(path.join(root, '03-build', 'U001', 'source'), { recursive: true });
  await writeFile(path.join(root, '03-build', 'U001', 'source', 'index.js'), 'export default 1;\n');
  await writeFile(path.join(root, '03-build', 'U001', 'unit.mp4'), Buffer.alloc(64));
  await writeFile(path.join(root, '03-build', 'U001', 'diagnostic.png'), Buffer.alloc(16));
  const identity = createHash('sha256').update('plan').digest('hex');
  await mkdir(path.join(root, '01-runtime-plan'), { recursive: true });
  await writeFile(path.join(root, '01-runtime-plan', 'runtime-plan.json'), JSON.stringify({
    identity, status: 'planned', authoringUnits: [{
      unitId: 'U001', runtime: 'hyperframes', shotIds: ['S01', 'S02'],
      window: { startMs: 0, endMs: 12_000 },
    }],
  }));
  const base = {
    eventsFile, occurredAt: '2026-08-17T00:00:00.000Z',
  };
  await recordProductionEvent({ ...base, eventId: 'e1', type: 'stage-start', stage: 'builder', spanId: 'builder-U001', unitId: 'U001' });
  await recordProductionEvent({ ...base, eventId: 'e2', occurredAt: '2026-08-17T00:00:12.000Z', type: 'agent-call', agentRole: 'builder', contextMode: 'minimal', unitId: 'U001' });
  await recordProductionEvent({ ...base, eventId: 'e3', occurredAt: '2026-08-17T00:00:13.000Z', type: 'operation', operation: 'render', bytesProcessed: 64, unitId: 'U001' });
  await recordProductionEvent({ ...base, eventId: 'e4', occurredAt: '2026-08-17T00:00:15.000Z', type: 'operation', operation: 'full-decode', bytesProcessed: 64, unitId: 'U001' });
  await recordProductionEvent({ ...base, eventId: 'e5', occurredAt: '2026-08-17T00:00:20.000Z', type: 'stage-end', stage: 'builder', spanId: 'builder-U001', unitId: 'U001', status: 'passed' });
  const output = path.join(root, 'production-metrics.json');
  const result = await collectProductionMetrics({
    productionRoot: root, outputFile: output,
    now: () => new Date('2026-08-17T00:01:00.000Z'),
  });
  assert.equal(result.metrics.stages[0].wallClockMs, 20_000);
  assert.deepEqual(result.metrics.agentCalls, {
    total: 1, director: 0, assets: 0, builder: 1, revision: 0, other: 0, fullHistory: 0,
  });
  assert.deepEqual(result.metrics.operations.render, { count: 1, bytesProcessed: 64 });
  assert.deepEqual(result.metrics.operations['full-decode'], { count: 1, bytesProcessed: 64 });
  assert.equal(result.metrics.plan.units[0].shotCount, 2);
  assert.equal(result.metrics.plan.units[0].durationMs, 12_000);
  assert.equal(result.metrics.files.scanPasses, 1);
  assert.equal(result.metrics.files.byKind.video.count, 1);
  assert.equal(result.metrics.files.byKind.png.count, 1);
  assert.equal(result.metrics.tokens.status, 'unknown');
  assert.equal(result.metrics.privacy.privateSessionPathsRead, false);
  assert.equal((await readFile(output, 'utf8')).includes(root), false);
  await assert.rejects(
    collectProductionMetrics({ productionRoot: root, outputFile: output }),
    /already exists/u,
  );
});

test('real FFmpeg fixture proves H.264 and FFV1 decode plus continuous concat', async (t) => {
  try {
    const result = await verifyLightweightCodec({ comparePresets: false });
    assert.equal(result.status, 'passed');
    assert.equal(result.unit.codec, 'h264');
    assert.equal(result.losslessControl.codec, 'ffv1');
    assert.equal(result.streamCopy.frameCount, 60);
    assert.equal(result.finalSingleReencode.frameCount, 60);
    assert.ok(result.fixtureBytes.units < result.fixtureBytes.losslessControl);
  } catch (error) {
    if (error?.code === 'ENOENT') t.skip('FFmpeg is not installed');
    else throw error;
  }
});
