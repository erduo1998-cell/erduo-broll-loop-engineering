import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { orchestrateFixture } from './orchestrate-stages.mjs';

test('orchestrates five receipts in order and resumes without redoing verified work', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'broll-staged-e2e-')); t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'new-project-root');
  const first = await orchestrateFixture({ fixtureId: 'faceless-basic', projectRoot: root });
  assert.deepEqual(first.stages.map((entry) => entry.stage), ['preflight', 'director', 'assets', 'render', 'verify']);
  assert.deepEqual(first.stages.map((entry) => entry.action), ['completed', 'completed', 'completed', 'completed', 'completed']);
  assert.equal(first.coverage_basis_points, 10000);
  assert.match(await readFile(path.join(root, 'hyperframes-project', 'index.html'), 'utf8'), /data-duration="4"/u);
  const second = await orchestrateFixture({ fixtureId: 'faceless-basic', projectRoot: root });
  assert.deepEqual(second.stages.map((entry) => entry.action), ['reused', 'reused', 'reused', 'reused', 'reused']);
  const receipt = JSON.parse(await readFile(path.join(root, '.erduo-hyperframes-broll', 'receipts', 'director.json'), 'utf8'));
  assert.equal(receipt.output.surge_adapter.required_skill, 'video-script-builder');
  assert.equal(JSON.stringify(receipt).includes('/Users/'), false);
});
