import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {access, cp, mkdir, mkdtemp, realpath, rm, symlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {promisify} from 'node:util';
import {renderRemotionCompositions} from '../erduo-broll-loop-engineering/scripts/remotion-toolchain.mjs';

const execFileAsync = promisify(execFile);
const fixtureProject = path.resolve('scripts/fixtures/remotion-dom-trace');

async function mediaToolchainAvailable() {
  try {
    await Promise.all([
      execFileAsync('ffmpeg', ['-version']),
      execFileAsync('ffprobe', ['-version']),
    ]);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function ensureDependencies() {
  try {
    await Promise.all([
      access(path.join(fixtureProject, 'node_modules', '.bin', 'remotion')),
      access(path.join(fixtureProject, 'node_modules', '.bin', 'tsc')),
    ]);
  } catch {
    await execFileAsync('npm', [
      'ci', '--ignore-scripts', '--no-audit', '--no-fund',
      '--registry', 'https://registry.npmjs.org',
    ], {cwd: fixtureProject, timeout: 180_000});
  }
}

test('Remotion canary typechecks once, bundles once, and directly renders three different Composition relationships', {timeout: 180_000}, async (t) => {
  if (!(await mediaToolchainAvailable())) {
    t.skip('FFmpeg/FFprobe are not installed');
    return;
  }
  await ensureDependencies();
  const productionRoot = await mkdtemp(path.join(os.tmpdir(), 'erduo-remotion-canary-'));
  t.after(() => rm(productionRoot, {recursive: true, force: true}));
  const project = path.join(productionRoot, 'project');
  await mkdir(project);
  await Promise.all([
    ...['package.json', 'package-lock.json', 'tsconfig.json'].map((file) => (
      cp(path.join(fixtureProject, file), path.join(project, file))
    )),
    cp(path.join(fixtureProject, 'src'), path.join(project, 'src'), {recursive: true}),
  ]);
  await symlink(await realpath(path.join(fixtureProject, 'node_modules')), path.join(project, 'node_modules'));
  const ids = ['S01', 'S02', 'S03'];
  const receipt = await renderRemotionCompositions({
    productionRoot,
    project,
    entryPoint: 'src/index.tsx',
    bundleDirectory: path.join(productionRoot, 'bundle'),
    renderTargets: ids.map((id, index) => ({
      shotId: `S0${index + 1}`,
      id,
      output: path.join(productionRoot, 'shots', `${id}.mp4`),
    })),
  });
  assert.deepEqual({
    backend: receipt.backend,
    failurePolicy: receipt.backendFailurePolicy,
    typechecks: receipt.typecheckRuns,
    bundles: receipt.bundleRuns,
    renders: receipt.renderRuns,
  }, {
    backend: 'remotion',
    failurePolicy: 'return-to-selected-backend',
    typechecks: 1,
    bundles: 1,
    renders: 3,
  });

  for (const {id, output} of receipt.outputs) {
    const {stdout} = await execFileAsync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_frames',
      '-show_entries', 'format=duration', '-of', 'json', output,
    ]);
    const facts = JSON.parse(stdout);
    assert.equal(facts.streams[0].codec_name, 'h264', id);
    assert.equal(facts.streams[0].width, 320, id);
    assert.equal(facts.streams[0].height, 180, id);
    assert.equal(facts.streams[0].r_frame_rate, '30/1', id);
    assert.equal(Number(facts.streams[0].nb_frames), 30, id);
    assert.ok(Number(facts.format.duration) >= 1, id);
    await execFileAsync('ffmpeg', ['-v', 'error', '-i', output, '-f', 'null', '-'], {timeout: 60_000});
  }
});
