import { fingerprintArtifactValue } from './artifact-manifest.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT = /^S\d{3}$/u;
const ROUTES = new Set(['user-media', 'image-generation', 'pexels', 'hyperframes-native']);

export class MasterBindingError extends Error {
  constructor(code, message, shot_id) { super(message); this.name = 'MasterBindingError'; this.code = code; if (shot_id) this.shot_id = shot_id; }
}
const fail = (code, message, shotId) => { throw new MasterBindingError(code, message, shotId); };
const exact = (value, fields, code, shotId) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(code, 'Master binding record has an invalid shape.', shotId);
};

function validateContribution(value, shotId) {
  exact(value, ['enabled_frame_sha256', 'disabled_frame_sha256', 'region_sha256'], 'pexels_contribution_missing', shotId);
  if (![value.enabled_frame_sha256, value.disabled_frame_sha256, value.region_sha256].every((item) => SHA256.test(item ?? ''))
    || value.enabled_frame_sha256 === value.disabled_frame_sha256) fail('pexels_contribution_missing', 'Pexels needs distinct enabled/disabled contribution evidence.', shotId);
}

export function validateMasterBindings(document) {
  exact(document, ['schema_version', 'shots', 'assets', 'consumers'], 'master_bindings_invalid');
  if (document.schema_version !== 2 || !Array.isArray(document.shots) || !document.shots.length || !Array.isArray(document.assets) || !Array.isArray(document.consumers)) fail('master_bindings_invalid', 'Master binding document is invalid.');
  const assets = new Map();
  for (const asset of document.assets) {
    exact(asset, ['asset_id', 'route', 'media_kind', 'sha256'], 'master_bindings_invalid');
    if (typeof asset.asset_id !== 'string' || !asset.asset_id || assets.has(asset.asset_id) || !ROUTES.has(asset.route)
      || !['image', 'video', 'native'].includes(asset.media_kind) || !SHA256.test(asset.sha256 ?? '')) fail('master_bindings_invalid', 'Asset binding is invalid.');
    assets.set(asset.asset_id, asset);
  }
  const consumersByShot = new Map();
  const usedAssets = new Set();
  const consumerIds = new Set();
  for (const consumer of document.consumers) {
    exact(consumer, ['consumer_id', 'shot_id', 'asset_id', 'primary', 'element', 'visible', 'timed', 'width', 'height', 'source_sha256', 'composition', 'contribution'], 'master_bindings_invalid', consumer?.shot_id);
    if (typeof consumer.consumer_id !== 'string' || !consumer.consumer_id || consumerIds.has(consumer.consumer_id) || !SHOT.test(consumer.shot_id ?? '') || typeof consumer.primary !== 'boolean') fail('master_bindings_invalid', 'Consumer identity is invalid.', consumer?.shot_id);
    consumerIds.add(consumer.consumer_id);
    const asset = assets.get(consumer.asset_id);
    if (!asset || consumer.source_sha256 !== asset.sha256) fail('asset_binding_missing', 'Consumer is not bound to a frozen asset.', consumer.shot_id);
    if (consumer.visible !== true || consumer.timed !== true || !Number.isSafeInteger(consumer.width) || consumer.width < 1 || !Number.isSafeInteger(consumer.height) || consumer.height < 1) fail('asset_not_visible', 'Asset consumer is hidden, untimed, or has no visible area.', consumer.shot_id);
    const allowed = asset.media_kind === 'video' ? ['video'] : asset.media_kind === 'image' ? ['img', 'background-image'] : ['native'];
    if (!allowed.includes(consumer.element)) fail('asset_media_type_mismatch', 'Asset media type uses an invalid consumer.', consumer.shot_id);
    if (asset.route === 'pexels') {
      exact(consumer.composition, ['crop', 'focal_point', 'safe_zone', 'title_relation'], 'pexels_composition_unimplemented', consumer.shot_id);
      if (Object.values(consumer.composition).some((item) => typeof item !== 'string' || !item.trim())) fail('pexels_composition_unimplemented', 'Pexels composition decisions must be concrete.', consumer.shot_id);
      validateContribution(consumer.contribution, consumer.shot_id);
    } else if (consumer.composition !== null || consumer.contribution !== null) fail('master_bindings_invalid', 'Only Pexels consumers carry Pexels composition and contribution evidence.', consumer.shot_id);
    usedAssets.add(asset.asset_id);
    if (!consumersByShot.has(consumer.shot_id)) consumersByShot.set(consumer.shot_id, []);
    consumersByShot.get(consumer.shot_id).push(consumer);
  }
  for (const [index, shot] of document.shots.entries()) {
    exact(shot, ['shot_id', 'primary_route', 'primary_asset_id'], 'master_bindings_invalid', shot?.shot_id);
    const expected = `S${String(index + 1).padStart(3, '0')}`;
    if (shot.shot_id !== expected || !ROUTES.has(shot.primary_route)) fail('master_bindings_invalid', 'Shots must be continuous and use a supported route.', shot.shot_id);
    const consumers = consumersByShot.get(shot.shot_id) ?? [];
    const primaries = consumers.filter((item) => item.primary);
    if (primaries.length !== 1) fail('primary_consumer_invalid', 'Every shot needs exactly one primary consumer.', shot.shot_id);
    const primary = primaries[0];
    const asset = assets.get(shot.primary_asset_id);
    if (!asset || primary.asset_id !== asset.asset_id || asset.route !== shot.primary_route) fail('asset_binding_missing', 'Primary route does not bind its primary asset consumer.', shot.shot_id);
  }
  for (const assetId of assets.keys()) if (!usedAssets.has(assetId)) fail('unused_declared_asset', 'Every declared asset must have a valid visible consumer.');
  return { shot_count: document.shots.length, consumer_count: document.consumers.length, binding_sha256: fingerprintArtifactValue(document) };
}
