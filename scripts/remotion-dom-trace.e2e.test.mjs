import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { captureRemotionDomTrace } from '../erduo-broll-loop-engineering/scripts/remotion-dom-trace.mjs';
import { analyzeMotionLayoutTrace } from '../erduo-broll-loop-engineering/scripts/motion-layout-lint.mjs';

const fixtureProject = path.resolve('scripts/fixtures/remotion-dom-trace');
const project = process.env.REMOTION_TRACE_E2E_PROJECT || fixtureProject;
const execFileAsync = promisify(execFile);

test('real Remotion Player samples Recipe boundaries and escalates only a bounded window', async (t) => {
  try {
    await access(path.join(project, 'node_modules', '@remotion', 'renderer', 'package.json'));
  } catch {
    if (project !== fixtureProject) throw new Error('REMOTION_TRACE_E2E_PROJECT has no installed Remotion renderer');
    await execFileAsync('npm', [
      'ci', '--ignore-scripts', '--no-audit', '--no-fund',
      '--registry', 'https://registry.npmjs.org',
    ], { cwd: fixtureProject, timeout: 180000 });
  }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'erduo-remotion-trace-e2e-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const entry = path.join(directory, 'entry.jsx');
  const bundle = path.join(directory, 'bundle.js');
  const html = path.join(directory, 'index.html');
  const output = path.join(directory, 'trace.json');
  const escalatedOutput = path.join(directory, 'trace-escalated.json');
  const recipeDirectory = path.join(directory, 'recipes');
  await mkdir(recipeDirectory);
  await writeFile(path.join(recipeDirectory, 'S01.json'), `${JSON.stringify({
    schemaVersion: '3.0.0', shotId: 'S01', window: { startMs: 0, endMs: 1000 },
    microBeats: [
      { beatId: 'b1', startMs: 0, endMs: 500, change: 'relationship' },
      { beatId: 'b2', startMs: 500, endMs: 1000, change: 'deliberate-stillness' },
    ],
  })}\n`);
  await writeFile(entry, `
import React, {forwardRef, useImperativeHandle, useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {Player} from '@remotion/player';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';

const Scene = () => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, 2, 10, 14], [96, 98, 298, 300], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return <AbsoluteFill data-erduo-trace-canvas style={{background: '#111'}}>
    <div data-erduo-trace-id="hero" data-erduo-role="primary" data-erduo-focus-group="hero"
      data-erduo-layer="2" data-erduo-visual-weight="1" data-erduo-safe-area="inside"
      data-erduo-motions='[{"startFrame":0,"endFrame":15,"kind":"transition","expectsSettle":true}]'
      style={{position:'absolute',left:x,top:100,width:180,height:90,opacity:1,zIndex:2,background:'#fff'}} />
  </AbsoluteFill>;
};

const App = () => {
  const player = useRef(null);
  window.__ERDUO_REMOTION_TRACE__ = {
    metadata: {compositionId:'TraceFixture',fps:30,width:640,height:360,startFrame:0,endFrame:30,
      safeArea:{left:32,top:18,right:608,bottom:342},
      shots:[{shotId:'S01',startFrame:0,endFrame:30,readableHolds:[{startFrame:15,endFrame:30}]}]},
    seek: async (frame) => {player.current.seekTo(frame); await new Promise((resolve)=>setTimeout(resolve,20));},
  };
  return <Player ref={player} component={Scene} compositionWidth={640} compositionHeight={360}
    durationInFrames={30} fps={30} style={{width:640,height:360}} controls={false} />;
};
createRoot(document.getElementById('root')).render(<App/>);
`, 'utf8');
  await writeFile(html, '<!doctype html><html><body style="margin:0"><div id="root"></div><script src="/bundle.js"></script></body></html>\n');
  const require = createRequire(path.join(path.resolve(project), 'package.json'));
  const esbuild = require('esbuild');
  await esbuild.build({ entryPoints: [entry], bundle: true, outfile: bundle, platform: 'browser', format: 'iife', jsx: 'automatic', absWorkingDir: path.resolve(project), nodePaths: [path.join(path.resolve(project), 'node_modules')] });
  const server = createServer(async (request, response) => {
    const file = request.url === '/bundle.js' ? bundle : html;
    response.setHeader('content-type', request.url === '/bundle.js' ? 'text/javascript' : 'text/html');
    response.end(await readFile(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  const trace = await captureRemotionDomTrace({ project, url: `http://127.0.0.1:${address.port}/`, output, identity: 'b'.repeat(64), recipeDirectory });
  assert.equal(trace.sampling.mode, 'sampled');
  assert.deepEqual(trace.sampling.frames, [0, 7, 14, 15, 22, 29]);
  assert.equal(trace.shots[0].elements[0].samples.length, 6);
  assert.equal(trace.shots[0].elements[0].samples[0].frame, 0);
  assert.equal(trace.shots[0].elements[0].samples.at(-1).frame, 29);
  assert.ok(trace.shots[0].elements[0].samples.find(({ frame }) => frame === 14).x > trace.shots[0].elements[0].samples[0].x);
  const result = analyzeMotionLayoutTrace(trace);
  assert.equal(result.status, 'pass', JSON.stringify(result.findings));
  assert.equal((await readdir(directory)).some((name) => name.endsWith('.png')), false);

  const escalated = await captureRemotionDomTrace({
    project, url: `http://127.0.0.1:${address.port}/`, output: escalatedOutput,
    identity: 'b'.repeat(64), recipeDirectory,
    denseWindows: [{ startFrame: 7, endFrame: 11 }],
  });
  assert.equal(escalated.sampling.mode, 'escalated');
  assert.deepEqual(escalated.sampling.denseWindows, [{ startFrame: 7, endFrame: 11 }]);
  assert.ok([7, 8, 9, 10].every((frame) => escalated.sampling.frames.includes(frame)));
  assert.equal(escalated.sampling.frames.length < 30, true);
});
