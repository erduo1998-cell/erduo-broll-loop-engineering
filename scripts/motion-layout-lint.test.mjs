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

function sampledTrace(frames = [0, 7, 14, 15, 22, 29]) {
  const trace = baseTrace();
  trace.schemaVersion = '1.2.0';
  trace.frameStep = 0;
  trace.sampling = { mode: 'sampled', frames, denseWindows: [] };
  trace.shots[0].elements[0].samples = frames.map((frame) => sample(frame, 180, 180));
  return trace;
}

test('motion-layout lint emits a compact pass for stable rendered geometry', () => {
  const result = analyzeMotionLayoutTrace(baseTrace());
  assert.equal(result.status, 'pass');
  assert.equal(result.findingCount, 0);
  assert.deepEqual(result.diagnosticWindows, []);
  assert.match(result.limitations.join(' '), /cannot prove/u);
  assert.match(result.limitations[0], /No Recipes were supplied/u);
});

test('sample-first trace passes stable Recipe, hold, and cut evidence without all-frame capture', () => {
  const trace = sampledTrace();
  const result = analyzeMotionLayoutTrace(trace);
  assert.equal(result.status, 'pass');
  assert.equal(trace.sampling.frames.length < trace.endFrame - trace.startFrame, true);
  assert.deepEqual(result.diagnosticWindows, []);
  assert.match(result.limitations.join(' '), /normal trace is sampled/u);
});

test('sample-first trace escalates only a suspicious transition interval', () => {
  const trace = sampledTrace([0, 7, 10, 14, 15, 22, 29]);
  const hero = trace.shots[0].elements[0];
  hero.motions = [{ startFrame: 0, endFrame: 15, kind: 'transition', expectsSettle: true }];
  hero.samples = trace.sampling.frames.map((frame) => sample(frame, frame < 10 ? 180 : 700, 180));
  const result = analyzeMotionLayoutTrace(trace);
  const finding = result.findings.find(({ code }) => code === 'evidence.dense-motion-required');
  assert.ok(finding);
  assert.deepEqual(finding.frames, [7, 10]);
  assert.equal(result.diagnosticWindows.length, 1);
  assert.ok(result.diagnosticWindows[0].endFrame - result.diagnosticWindows[0].startFrame < trace.endFrame);
});

test('bounded dense escalation resolves suspicion and locates the original jump', () => {
  const frames = [0, 7, 8, 9, 10, 14, 15, 22, 29];
  const trace = sampledTrace(frames);
  trace.sampling = {
    mode: 'escalated', frames,
    denseWindows: [{ startFrame: 7, endFrame: 11 }],
  };
  const hero = trace.shots[0].elements[0];
  hero.motions = [{ startFrame: 0, endFrame: 15, kind: 'transition', expectsSettle: true }];
  hero.samples = frames.map((frame) => sample(frame, frame < 8 ? 180 : 700, 180));
  const result = analyzeMotionLayoutTrace(trace);
  assert.ok(result.findings.some(({ code }) => code === 'motion.jump'));
  assert.equal(result.findings.some(({ code }) => code === 'evidence.dense-motion-required'), false);
});

function beatRecipes(change = 'relationship', schemaVersion = '2.0.0') {
  return new Map([['S01', {
    schemaVersion, shotId: 'S01', window: { startMs: 0, endMs: 1000 },
    microBeats: [
      { beatId: 'b1', startMs: 0, endMs: 500, change },
      { beatId: 'b2', startMs: 500, endMs: 1000, change: 'deliberate-stillness' },
    ],
  }]]);
}

function diagramRecipes() {
  return new Map([['S01', {
    schemaVersion: '2.0.0', shotId: 'S01', window: { startMs: 0, endMs: 1000 },
    craft: { primary: { entryId: 'diagram-system-map', semanticReason: 'Show the verified route.' } },
    microBeats: [{
      beatId: 'diagram-hold', startMs: 0, endMs: 1000,
      change: 'deliberate-stillness', development: 'Hold the complete route for reading.',
    }],
  }]]);
}

function cleanDiagramFrame() {
  return {
    frame: 20,
    nodes: [
      { id: 'source', x: 200, y: 200, width: 200, height: 100 },
      { id: 'service', x: 700, y: 200, width: 200, height: 100 },
      { id: 'result', x: 1200, y: 200, width: 200, height: 100 },
    ],
    connectors: [
      { id: 'request', fromNodeId: 'source', toNodeId: 'service', points: [{ x: 400, y: 250 }, { x: 700, y: 250 }] },
      { id: 'response', fromNodeId: 'service', toNodeId: 'result', points: [{ x: 900, y: 250 }, { x: 1200, y: 250 }] },
    ],
    labels: [
      { id: 'request-label', connectorId: 'request', x: 490, y: 200, width: 120, height: 30 },
      { id: 'response-label', connectorId: 'response', x: 990, y: 200, width: 120, height: 30 },
    ],
  };
}

test('diagram craft passes only with clean runtime-captured readable-hold topology', () => {
  const trace = baseTrace();
  trace.schemaVersion = '1.1.0';
  trace.shots[0].diagramFrames = [cleanDiagramFrame()];
  const result = analyzeMotionLayoutTrace(trace, diagramRecipes());
  assert.equal(result.status, 'pass');
  assert.equal(result.findings.some(({ code }) => code.startsWith('diagram.')), false);
});

test('diagram craft rejects missing runtime geometry at its readable hold', () => {
  const trace = baseTrace();
  const result = analyzeMotionLayoutTrace(trace, diagramRecipes());
  assert.ok(result.findings.some(({ code }) => code === 'diagram.runtime-geometry-missing'));
});

test('diagram topology rejects connector, label, and shared-path collisions from rendered geometry', () => {
  const trace = baseTrace();
  trace.schemaVersion = '1.1.0';
  const diagramFrame = cleanDiagramFrame();
  diagramFrame.connectors.push({
    id: 'bypass', fromNodeId: 'source', toNodeId: 'result',
    points: [{ x: 400, y: 250 }, { x: 1200, y: 250 }],
  });
  diagramFrame.labels[0] = {
    id: 'request-label', connectorId: 'request', x: 360, y: 240, width: 120, height: 30,
  };
  trace.shots[0].diagramFrames = [diagramFrame];
  const result = analyzeMotionLayoutTrace(trace, diagramRecipes());
  const codes = new Set(result.findings.map(({ code }) => code));
  assert.ok(codes.has('diagram.connector-crosses-node'));
  assert.ok(codes.has('diagram.label-touches-connector'));
  assert.ok(codes.has('diagram.label-touches-node'));
  assert.ok(codes.has('diagram.connector-path-overlap'));
});

function longBeatTrace() {
  const trace = baseTrace();
  trace.endFrame = 900;
  trace.shots[0].endFrame = 900;
  trace.shots[0].readableHolds = [{ startFrame: 870, endFrame: 900 }];
  trace.shots[0].elements[0].samples = Array.from({ length: 900 }, (_, frame) => sample(frame, 180, 180));
  return trace;
}

function longBeatRecipes(change = 'relationship') {
  return new Map([['S01', {
    schemaVersion: '2.0.0', shotId: 'S01', window: { startMs: 0, endMs: 30000 },
    microBeats: [{ beatId: 'long-beat', startMs: 0, endMs: 30000, change }],
  }]]);
}

test('motion-layout lint proves a planned beat only from beat-bound rendered subject development', () => {
  const trace = baseTrace();
  const hero = trace.shots[0].elements[0];
  hero.motions = [{ startFrame: 0, endFrame: 15, kind: 'transition', expectsSettle: true, beatIds: ['b1'] }];
  hero.samples = Array.from({ length: 30 }, (_, frame) => {
    const progress = Math.min(1, frame / 12);
    const eased = progress * progress * (3 - 2 * progress);
    return sample(frame, 180 + eased * 180, 180);
  });
  const result = analyzeMotionLayoutTrace(trace, beatRecipes());
  assert.equal(result.findings.some(({ code }) => code.startsWith('rhythm.')), false);
  assert.match(result.limitations[0], /Beat delivery checks prove/u);
  const v3Result = analyzeMotionLayoutTrace(trace, beatRecipes('relationship', '3.0.0'));
  assert.equal(v3Result.findings.some(({ code }) => code.startsWith('rhythm.')), false);
});

test('motion-layout lint rejects decorative or continuous loops as planned beat delivery', () => {
  const trace = baseTrace();
  trace.shots[0].elements.push({
    id: 'ambient-line', role: 'decorative', focusGroup: 'ambient', layer: 1, visualWeight: 0.1,
    motions: [{ startFrame: 0, endFrame: 30, kind: 'continuous', expectsSettle: false }],
    samples: Array.from({ length: 30 }, (_, frame) => sample(frame, 60 + frame * 5, 80, 120, 4)),
  });
  const result = analyzeMotionLayoutTrace(trace, beatRecipes());
  assert.ok(result.findings.some(({ code }) => code === 'rhythm.beat-unbound'));
  assert.equal(result.status, 'attention');
});

test('motion-layout lint rejects a declared beat whose rendered subject stays unchanged', () => {
  const trace = baseTrace();
  trace.shots[0].elements[0].motions = [{
    startFrame: 0, endFrame: 15, kind: 'transition', expectsSettle: true, beatIds: ['b1'],
  }];
  const result = analyzeMotionLayoutTrace(trace, beatRecipes());
  assert.ok(result.findings.some(({ code }) => code === 'rhythm.beat-no-development'));
  assert.equal(result.status, 'attention');
});

test('sample-first beat with unchanged checkpoints requests only bounded dense evidence', () => {
  const trace = sampledTrace();
  trace.shots[0].elements[0].motions = [{
    startFrame: 0, endFrame: 15, kind: 'transition', expectsSettle: true, beatIds: ['b1'],
  }];
  const result = analyzeMotionLayoutTrace(trace, beatRecipes());
  assert.ok(result.findings.some(({ code }) => code === 'evidence.dense-development-required'));
  assert.equal(result.findings.some(({ code }) => code === 'rhythm.beat-no-development'), false);
  assert.ok(result.diagnosticWindows.every(({ startFrame, endFrame }) => endFrame - startFrame < 30));
});

test('motion-layout lint accepts beat-bound progressive continuous subject development', () => {
  const trace = baseTrace();
  const hero = trace.shots[0].elements[0];
  hero.motions = [{ startFrame: 0, endFrame: 15, kind: 'continuous', expectsSettle: false, beatIds: ['b1'] }];
  hero.samples = Array.from({ length: 30 }, (_, frame) => sample(frame, 180 + Math.min(frame, 14) * 12, 180));
  const result = analyzeMotionLayoutTrace(trace, beatRecipes());
  assert.equal(result.findings.some(({ code }) => code.startsWith('rhythm.')), false);
});

test('motion-layout lint rejects a 30-second beat that moves only for the first 0.6 seconds', () => {
  const trace = longBeatTrace();
  const hero = trace.shots[0].elements[0];
  hero.motions = [{ startFrame: 0, endFrame: 18, kind: 'transition', expectsSettle: true, beatIds: ['long-beat'] }];
  hero.samples = Array.from({ length: 900 }, (_, frame) => sample(frame, 180 + Math.min(frame, 18) * 10, 180));
  const result = analyzeMotionLayoutTrace(trace, longBeatRecipes());
  assert.ok(result.findings.some(({ code }) => code === 'rhythm.beat-development-gap'));
});

test('motion-layout lint rejects early movement that returns to the original state before a long still tail', () => {
  const trace = longBeatTrace();
  const hero = trace.shots[0].elements[0];
  hero.motions = [{ startFrame: 0, endFrame: 36, kind: 'transition', expectsSettle: true, beatIds: ['long-beat'] }];
  hero.samples = Array.from({ length: 900 }, (_, frame) => {
    const offset = frame <= 18 ? frame * 10 : Math.max(0, 360 - frame * 10);
    return sample(frame, 180 + offset, 180);
  });
  const result = analyzeMotionLayoutTrace(trace, longBeatRecipes());
  assert.ok(result.findings.some(({ code }) => code === 'rhythm.beat-development-gap'));
});

test('motion-layout lint rejects a 30-second beat that is static for 15 seconds, moves briefly, then stays static', () => {
  const trace = longBeatTrace();
  const hero = trace.shots[0].elements[0];
  hero.motions = [{ startFrame: 450, endFrame: 469, kind: 'transition', expectsSettle: true, beatIds: ['long-beat'] }];
  hero.samples = Array.from({ length: 900 }, (_, frame) => {
    const progress = Math.max(0, Math.min(18, frame - 450));
    return sample(frame, 180 + progress * 10, 180);
  });
  const result = analyzeMotionLayoutTrace(trace, longBeatRecipes());
  const finding = result.findings.find(({ code }) => code === 'rhythm.beat-development-gap');
  assert.ok(finding);
  assert.ok(finding.frames[1] - finding.frames[0] + 1 >= 225);
});

test('motion-layout lint rejects a 22.5-23.1 second burst after a long undeclared leading wait', () => {
  const trace = longBeatTrace();
  const hero = trace.shots[0].elements[0];
  hero.motions = [{ startFrame: 675, endFrame: 694, kind: 'transition', expectsSettle: true, beatIds: ['long-beat'] }];
  hero.samples = Array.from({ length: 900 }, (_, frame) => {
    const progress = Math.max(0, Math.min(18, frame - 675));
    return sample(frame, 180 + progress * 10, 180);
  });
  const result = analyzeMotionLayoutTrace(trace, longBeatRecipes());
  assert.ok(result.findings.some(({ code }) => code === 'rhythm.beat-development-gap'));
});

test('motion-layout lint rejects two brief developments separated by a long undeclared internal wait', () => {
  const trace = longBeatTrace();
  const hero = trace.shots[0].elements[0];
  hero.motions = [
    { startFrame: 0, endFrame: 19, kind: 'transition', expectsSettle: true, beatIds: ['long-beat'] },
    { startFrame: 675, endFrame: 694, kind: 'transition', expectsSettle: true, beatIds: ['long-beat'] },
  ];
  hero.samples = Array.from({ length: 900 }, (_, frame) => {
    const first = Math.min(18, frame) * 10;
    const second = Math.max(0, Math.min(18, frame - 675)) * 10;
    return sample(frame, 180 + first + second, 180);
  });
  const result = analyzeMotionLayoutTrace(trace, longBeatRecipes());
  const finding = result.findings.find(({ code }) => code === 'rhythm.beat-development-gap');
  assert.ok(finding);
  assert.ok(finding.frames[0] > 0 && finding.frames[1] < 899);
});

test('motion-layout lint permits a long developing beat with a bounded final settle', () => {
  const trace = longBeatTrace();
  const hero = trace.shots[0].elements[0];
  hero.motions = [{ startFrame: 0, endFrame: 721, kind: 'continuous', expectsSettle: false, beatIds: ['long-beat'] }];
  hero.samples = Array.from({ length: 900 }, (_, frame) => sample(frame, 180 + Math.min(frame, 720) * 0.5, 180));
  const result = analyzeMotionLayoutTrace(trace, longBeatRecipes());
  assert.equal(result.findings.some(({ code }) => code.startsWith('rhythm.')), false);
});

test('motion-layout lint accepts a long beat whose subject keeps forming new states across the beat', () => {
  const trace = longBeatTrace();
  const hero = trace.shots[0].elements[0];
  hero.motions = [{ startFrame: 0, endFrame: 870, kind: 'continuous', expectsSettle: false, beatIds: ['long-beat'] }];
  hero.samples = Array.from({ length: 900 }, (_, frame) => sample(frame, 180 + Math.min(frame, 869) * 0.5, 180));
  const result = analyzeMotionLayoutTrace(trace, longBeatRecipes());
  assert.equal(result.findings.some(({ code }) => code.startsWith('rhythm.')), false);
});

test('motion-layout lint accepts an explicitly deliberate 30-second stillness beat', () => {
  const result = analyzeMotionLayoutTrace(longBeatTrace(), longBeatRecipes('deliberate-stillness'));
  assert.equal(result.findings.some(({ code }) => code.startsWith('rhythm.')), false);
  assert.equal(result.status, 'pass');
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
