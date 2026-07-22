import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateRenderSource } from './validate-render-source.mjs';

async function project(t, html) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'broll-source-gate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'compositions'));
  await writeFile(path.join(root, 'compositions', 'S001.html'), html);
  return root;
}

test('accepts rendered Unicode, readable type and bound visible animation targets', async (t) => {
  const root = await project(t, `<div data-height="1080"><style>.hero{font-size:24px}</style><div id="hero">真相</div><script>const x="\\u771f"; tl.fromTo("#hero",{scale:0},{scale:1});</script></div>`);
  const report = await validateRenderSource(root);
  assert.equal(report.status, 'approved');
  assert.deepEqual(report.findings, []);
});

test('aggregates visible escapes, tiny type, duplicate/orphan ids and invisible terminal states', async (t) => {
  const root = await project(t, `<div data-height="2160"><style>.tiny{font-size:14px}</style><div id="hero">\\u771F\\u76F8</div><div id="hero">x</div><script>tl.to("#missing",{opacity:1});tl.fromTo("#hero",{scale:0},{scale:0,opacity:1});</script></div>`);
  const report = await validateRenderSource(root);
  assert.equal(report.status, 'revision_required');
  assert.deepEqual(new Set(report.findings.map((finding) => finding.code)), new Set(['visible_unicode_escape', 'duplicate_dom_id', 'orphan_animation_target', 'invisible_fromto_result', 'below_minimum_type']));
});
