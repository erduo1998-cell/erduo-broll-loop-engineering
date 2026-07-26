import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  realpath,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import {
  measureStylePixelFacts,
  StylePixelFactsError,
} from './measure-style-pixel-facts.mjs';

const execFile = promisify(execFileCallback);
const sha = (value) => value.repeat(64);
const PNG_2X2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAAAAAAAAQCEeRdzAAAAEklEQVR4nGP4z8DAAMIM/4EAAB/uBfsL2WiLAAAAAElFTkSuQmCC',
  'base64',
);
const JPEG_2X2 = Buffer.from(
  '/9j//gAPTGF2YzYwLjMuMTAwAP/bAEMACAQEBAQEBQUFBQUFBgYGBgYGBgYGBgYGBgcHBwgICAcHBwYGBwcICAgICQkJCAgICAkJCgoKDAwLCw4ODhERFP/EAGYAAQEAAAAAAAAAAAAAAAAAAAQHAQEBAAAAAAAAAAAAAAAAAAAEAxAAAgICAgMBAAAAAAAAAAAAAgMFAQQHBgC1djchEQACAgIBAwUBAAAAAAAAAAADAgQBBQAGIRIRM3WxcrQ2/8AAEQgAAgACAwESAAISAAMSAP/aAAwDAQACEQMRAD8ArGt4GDydecOe+LjnNbx2EY1rMTHNjDOPQRGZkuyIiK7siu7u7/b6vWPzXhXrMF47H7TlHHsALk2bGPE4xETJz1RFhx1VVWSSqVaofiqqulVXStZyz+pz3uuR/UTRkwuHnu0uXjYEqTJazyJB4oDHOYt95ClKRGchCPds7tdszXd3fnUg9AX0T4rf/9k=',
  'base64',
);

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'style-pixel-facts-')));
  await mkdir(path.join(root, 'frames'));
  await writeFile(path.join(root, 'frames', 'fixture.png'), PNG_2X2);
  await writeFile(path.join(root, 'frames', 'fixture.jpg'), JPEG_2X2);
  const request = {
    schema_version: 1,
    pipeline_contract_version: 2,
    authoring_topology_id: 'bounded-authoring-cluster-v1',
    block_id: 'B001',
    block_manifest_sha256: sha('a'),
    source_sha256s: [sha('b'), sha('c'), sha('b')],
    projection_sha256: sha('d'),
    review_generation: 3,
    renderer: {
      tool_id: 'hyperframes-capture',
      tool_version: '1.2.3',
      receipt_sha256: sha('e'),
    },
    frames: [
      { artifact_id: 'S001-entry', shot_id: 'S001', state: 'entry', locator: 'frames/fixture.png', projected_frame: 1, timestamp_ms: 40, shot_recipe_sha256: sha('f'), declared_roi: null },
      { artifact_id: 'S001-result', shot_id: 'S001', state: 'result', locator: 'frames/fixture.jpg', projected_frame: 25, timestamp_ms: 1000, shot_recipe_sha256: sha('f'), declared_roi: { x: 0, y: 0, width: 1, height: 1 } },
      { artifact_id: 'S001-exit', shot_id: 'S001', state: 'exit', locator: 'frames/fixture.png', projected_frame: 49, timestamp_ms: 1960, shot_recipe_sha256: sha('f'), declared_roi: null },
    ],
  };
  return { root, request };
}

test('measures actual fixed PNG/JPEG pixels and optional ROI without aesthetic authority', async () => {
  const { root, request } = await fixture();
  const result = await measureStylePixelFacts(request, { root });
  assert.equal(result.authority_scope, 'objective-pixel-facts-only');
  assert.equal(result.shot_count, 1);
  assert.equal(result.frame_count, 3);
  assert.deepEqual(result.source_sha256s, [sha('b'), sha('c'), sha('b')]);
  assert.equal(result.projection_sha256, sha('d'));
  assert.equal(result.review_generation, 3);
  assert.match(result.facts_sha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(result.frames.map((frame) => frame.media_type), ['image/png', 'image/jpeg', 'image/png']);
  for (const frame of result.frames) {
    assert.equal(frame.width, 2);
    assert.equal(frame.height, 2);
    assert.equal(frame.whole_frame_facts.pixel_count, 4);
    assert.match(frame.sha256, /^[0-9a-f]{64}$/u);
    assert.match(frame.decoded_rgba_sha256, /^[0-9a-f]{64}$/u);
    assert.match(frame.capture_binding_sha256, /^[0-9a-f]{64}$/u);
    assert.equal(frame.renderer_receipt_sha256, sha('e'));
    assert.equal('quality_score' in frame, false);
    assert.equal('approved' in frame, false);
  }
  assert.deepEqual(result.frames[1].declared_roi, { x: 0, y: 0, width: 1, height: 1 });
  assert.equal(result.frames[1].roi_facts.pixel_count, 1);
  assert.equal(result.frames[0].roi_facts, null);
});

test('fails closed on incomplete three-state evidence and out-of-raster ROI', async () => {
  const incomplete = await fixture();
  incomplete.request.frames.pop();
  await assert.rejects(
    () => measureStylePixelFacts(incomplete.request, { root: incomplete.root }),
    (error) => error instanceof StylePixelFactsError && error.code === 'style_pixel_request_invalid',
  );

  const outside = await fixture();
  outside.request.frames[1].declared_roi = { x: 1, y: 1, width: 2, height: 1 };
  await assert.rejects(
    () => measureStylePixelFacts(outside.request, { root: outside.root }),
    (error) => error instanceof StylePixelFactsError && error.code === 'style_roi_outside_raster',
  );
});

test('rejects symlinked evidence even when the target is a valid PNG', async () => {
  const value = await fixture();
  await symlink(path.join(value.root, 'frames', 'fixture.png'), path.join(value.root, 'frames', 'linked.png'));
  value.request.frames[0].locator = 'frames/linked.png';
  await assert.rejects(
    () => measureStylePixelFacts(value.request, { root: value.root }),
    (error) => error instanceof StylePixelFactsError && error.code === 'style_frame_symlink_ancestor',
  );
});

test('rejects an ancestor-directory symlink that escapes the real evidence root', async () => {
  const value = await fixture();
  const outside = await realpath(await mkdtemp(path.join(os.tmpdir(), 'style-pixel-outside-')));
  await writeFile(path.join(outside, 'escape.png'), PNG_2X2);
  await symlink(outside, path.join(value.root, 'linked-dir'));
  value.request.frames[0].locator = 'linked-dir/escape.png';
  await assert.rejects(
    () => measureStylePixelFacts(value.request, { root: value.root }),
    (error) => error instanceof StylePixelFactsError && error.code === 'style_frame_symlink_ancestor',
  );
});

test('rejects a frame root reached through an ancestor symlink', async () => {
  const realParent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'style-pixel-real-root-')));
  const aliasParent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'style-pixel-alias-root-')));
  const realRoot = path.join(realParent, 'evidence');
  await mkdir(realRoot);
  await mkdir(path.join(realRoot, 'frames'));
  await writeFile(path.join(realRoot, 'frames', 'fixture.png'), PNG_2X2);
  await writeFile(path.join(realRoot, 'frames', 'fixture.jpg'), JPEG_2X2);
  await symlink(realRoot, path.join(aliasParent, 'linked-evidence'));
  const value = await fixture();
  await assert.rejects(
    () => measureStylePixelFacts(value.request, { root: path.join(aliasParent, 'linked-evidence') }),
    (error) => error instanceof StylePixelFactsError && error.code === 'style_frame_root_symlink_ancestor',
  );
});

test('CLI exposes a bounded help contract', async () => {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'measure-style-pixel-facts.mjs');
  const { stdout } = await execFile(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.match(stdout, /objective facts/u);
  assert.match(stdout, /never emits\s+an aesthetic verdict/u);
});
