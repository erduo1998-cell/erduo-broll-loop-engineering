import test from 'node:test';
import assert from 'node:assert/strict';
import { MasterBindingError, validateMasterBindings } from './validate-master-bindings.mjs';
const sha = (letter) => letter.repeat(64);
const fixture = () => ({ schema_version: 2, shots: [{ shot_id: 'S001', primary_route: 'pexels', primary_asset_id: 'px-1' }, { shot_id: 'S002', primary_route: 'image-generation', primary_asset_id: 'gen-1' }], assets: [{ asset_id: 'px-1', route: 'pexels', media_kind: 'video', sha256: sha('a') }, { asset_id: 'gen-1', route: 'image-generation', media_kind: 'image', sha256: sha('b') }], consumers: [{ consumer_id: 'c1', shot_id: 'S001', asset_id: 'px-1', primary: true, element: 'video', visible: true, timed: true, width: 1280, height: 720, source_sha256: sha('a'), composition: { crop: 'center crop', focal_point: 'left third', safe_zone: 'right third', title_relation: 'title in safe zone' }, contribution: { enabled_frame_sha256: sha('c'), disabled_frame_sha256: sha('d'), region_sha256: sha('e') } }, { consumer_id: 'c2', shot_id: 'S002', asset_id: 'gen-1', primary: true, element: 'img', visible: true, timed: true, width: 1080, height: 1080, source_sha256: sha('b'), composition: null, contribution: null }] });
const expect = (doc, code) => assert.throws(() => validateMasterBindings(doc), (error) => error instanceof MasterBindingError && error.code === code);
test('allows multiple consumers per shot but requires exactly one primary and uses every declared asset', () => {
  const doc = fixture(); doc.assets.push({ asset_id: 'aux', route: 'image-generation', media_kind: 'image', sha256: sha('f') }); doc.consumers.push({ ...doc.consumers[1], consumer_id: 'c3', shot_id: 'S001', asset_id: 'aux', primary: false, source_sha256: sha('f') });
  assert.equal(validateMasterBindings(doc).consumer_count, 3);
  const twoPrimary = structuredClone(doc); twoPrimary.consumers[2].primary = true; expect(twoPrimary, 'primary_consumer_invalid');
  const unused = fixture(); unused.assets.push({ asset_id: 'unused', route: 'image-generation', media_kind: 'image', sha256: sha('f') }); expect(unused, 'unused_declared_asset');
});
test('rejects hidden, media mismatch, empty primary and missing Pexels contribution evidence', () => {
  const hidden = fixture(); hidden.consumers[0].visible = false; expect(hidden, 'asset_not_visible');
  const wrong = fixture(); wrong.consumers[0].element = 'img'; expect(wrong, 'asset_media_type_mismatch');
  const empty = fixture(); empty.consumers[0].primary = false; expect(empty, 'primary_consumer_invalid');
  const contribution = fixture(); contribution.consumers[0].contribution.enabled_frame_sha256 = contribution.consumers[0].contribution.disabled_frame_sha256; expect(contribution, 'pexels_contribution_missing');
});
