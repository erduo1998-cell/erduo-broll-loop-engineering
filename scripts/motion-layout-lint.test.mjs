import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeMotionLayoutTrace } from '../erduo-broll-loop-engineering/scripts/motion-layout-lint.mjs';

const hash = 'a'.repeat(64);

function sample(frame, x, y, width = 240, height = 120, opacity = 1) {
  return { frame, x, y, width, height, opacity, zIndex: 1, visible: true, clipped: false, visibleAreaRatio: 1 };
}

function baseTrace() {
  const samples = Array.from({ length: 30 }, (_, frame) => sample(frame, 180, 180));
  return {
    schemaVersion: '1.0.0',
    runtime: 'remotion',
    compositionId: 'Master',
    compositionIdentity: hash,
    capture: { mode: 'rendered-dom-geometry', source: 'project-local preview instrumentation' },
    fps: 30,
    width: 1920,
    height: 1080,
    startFrame: 0,
    endFrame: 30,
    frameStep: 1,
    safeArea: { left: 96, top: 54, right: 1824, bottom: 1026 },
    shots: [{
      shotId: 'S01',
      startFrame: 0,
      endFrame: 30,
      readableHolds: [{ startFrame: 15, endFrame: 30 }],
      elements: [{
        id: 'hero', role: 'primary', focusGroup: 'hero', layer: 2, visualWeight: 1, safeAreaPolicy: 'inside',
        motions: [], samples,
      }],
    }],
  };
}

test('motion-layout lint emits a compact pass for stable rendered geometry', () => {
  const result = analyzeMotionLayoutTrace(baseTrace());
  assert.equal(result.status, 'pass');
  assert.equal(result.findingCount, 0);
  assert.deepEqual(result.diagnosticWindows, []);
  assert.match(result.limitations[0], /cannot prove/u);
});

test('motion-layout lint locates jump, unsettled hold, and safe-area failures', () => {
  const trace = baseTrace();
  const element = trace.shots[0].elements[0];
  element.motions = [{ startFrame: 0, endFrame: 20, kind: 'transition', expectsSettle: true }];
  element.samples = Array.from({ length: 30 }, (_, frame) => {
    if (frame < 8) return sample(frame, 180 + frame * 2, 180);
    if (frame === 8) return sample(frame, 700, 180);
    if (frame < 20) return sample(frame, 700 + (frame - 8) * 8, 180);
    return sample(frame, 1800 + (frame - 20) * 3, 180);
  });
  const result = analyzeMotionLayoutTrace(trace);
  assert.equal(result.status, 'attention');
  const codes = new Set(result.findings.map((item) => item.code));
  assert.ok(codes.has('motion.jump'));
  assert.ok(codes.has('motion.not-settled'));
  assert.ok(codes.has('motion.unstable-hold'));
  assert.ok(codes.has('layout.safe-area'));
  assert.ok(result.diagnosticWindows.length > 0);
});

test('motion-layout lint detects simultaneous starts, crowding, and competing moving foci', () => {
  const trace = baseTrace();
  trace.shots[0].elements = Array.from({ length: 5 }, (_, index) => ({
    id: `item-${index}`,
    role: index === 0 ? 'primary' : 'secondary',
    focusGroup: `group-${index}`,
    layer: index,
    visualWeight: index === 0 ? 1 : 0.4,
    safeAreaPolicy: 'inside',
    motions: [{ startFrame: 0, endFrame: 12, kind: 'transition', expectsSettle: true }],
    samples: Array.from({ length: 30 }, (_, frame) => sample(
      frame,
      300 + index * 20 + Math.min(frame, 10),
      240 + index * 10,
      300,
      180,
    )),
  }));
  const result = analyzeMotionLayoutTrace(trace);
  const codes = new Set(result.findings.map((item) => item.code));
  assert.ok(codes.has('staging.synchronized-start'));
  assert.ok(codes.has('staging.too-many-moving-foci'));
  assert.ok(codes.has('layout.unplanned-overlap'));
});

test('motion-layout lint rejects estimated or sparse traces instead of claiming a pass', () => {
  const trace = baseTrace();
  trace.capture.mode = 'estimated-from-source';
  trace.frameStep = 3;
  const result = analyzeMotionLayoutTrace(trace);
  assert.equal(result.status, 'invalid');
  assert.ok(result.findings.some((item) => /capture\.mode/u.test(item.message)));
  assert.ok(result.findings.some((item) => /frameStep/u.test(item.message)));
});

test('motion-layout lint detects clipped and occluded primary hierarchy', () => {
  const trace = baseTrace();
  const hero = trace.shots[0].elements[0];
  hero.visualWeight = 0.4;
  hero.samples = hero.samples.map((item) => ({ ...item, clipped: item.frame === 10 }));
  trace.shots[0].elements.push({
    id: 'overlay', role: 'secondary', focusGroup: 'overlay', layer: 5, visualWeight: 0.8,
    safeAreaPolicy: 'inside', motions: [],
    samples: Array.from({ length: 30 }, (_, frame) => ({ ...sample(frame, 160, 160, 300, 180), zIndex: 5 })),
  });
  const result = analyzeMotionLayoutTrace(trace);
  const codes = new Set(result.findings.map((item) => item.code));
  assert.ok(codes.has('staging.weak-primary-weight'));
  assert.ok(codes.has('layout.clipped-focus'));
  assert.ok(codes.has('layout.primary-occluded'));
});

test('motion-layout lint detects excessive density and accumulating crowding', () => {
  const trace = baseTrace();
  const hero = trace.shots[0].elements[0];
  hero.samples = Array.from({ length: 30 }, (_, frame) => sample(frame, 760, 440, 400, 200));
  trace.shots[0].elements.push(...Array.from({ length: 8 }, (_, index) => ({
    id: `panel-${index}`, role: 'secondary', focusGroup: `panel-${index}`, layer: 3 + index, visualWeight: 0.3,
    safeAreaPolicy: 'may-bleed', motions: [],
    samples: Array.from({ length: 30 }, (_, frame) => {
      const progress = frame / 29;
      const width = 120 + progress * 500;
      const height = 80 + progress * 300;
      const column = index % 4;
      const row = Math.floor(index / 4);
      return { ...sample(frame, 100 + column * 420 - progress * 90, 80 + row * 500 - progress * 60, width, height), zIndex: 3 + index };
    }),
  })));
  const result = analyzeMotionLayoutTrace(trace);
  const codes = new Set(result.findings.map((item) => item.code));
  assert.ok(codes.has('layout.excessive-density'));
  assert.ok(codes.has('layout.crowding-trend'));
  assert.ok(codes.has('layout.primary-area-dominated'));
});
