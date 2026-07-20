import { promises as fs } from 'node:fs';
import { CacheError, withArtifactCache } from './cache.mjs';

const BAD = /(?:api[_-]?key|secret|authorization|cookie|password|(?:^|\s)(?:\/|[a-z]:\\|file:)|\bsubtitle\b|\bnarrated_claim\b)/iu;
export class ImageGenerationError extends Error { constructor(code, message) { super(message); this.name = 'ImageGenerationError'; this.code = code; } }
const fail = (c,m) => { throw new ImageGenerationError(c,m); };
export function detectImageGeneration(capability) { if (!capability || capability.available !== true || typeof capability.adapter_id !== 'string' || !/^[a-z0-9-]{2,64}$/u.test(capability.adapter_id) || !Array.isArray(capability.image_formats) || !capability.image_formats.includes('png')) return { available: false, route: 'hyperframes-native' }; return { available: true, adapter_id: capability.adapter_id, formats: [...new Set(capability.image_formats)].sort() }; }
export function buildImagePrompt(brief, design, target) {
  if (!brief?.representation?.subjects || !brief?.visible_action || !brief?.result_state || !target || !Number.isInteger(target.width) || !Number.isInteger(target.height) || target.width < 64 || target.height < 64) fail('invalid_input', 'Image generation input is invalid.');
  const protectedLayers = new Set(design?.protected_user_layers ?? []); const roles = protectedLayers.has('visual_system') ? [] : (design?.image_roles ?? []);
  const text = `Create a single editorial visual: ${brief.representation.subjects.join(', ')}. Visible action: ${brief.visible_action.verb}; final readable state: ${brief.result_state.visible_outcome}. ${roles.join(' ')}. ${target.width} by ${target.height}. No text, logos, interfaces, real people, brands, or fabricated statistics.`;
  if (text.length > 1200 || BAD.test(text) || !Array.isArray(brief.asset_needs?.prohibitions)) fail('unsafe_prompt', 'Image generation prompt is unsafe.');
  return { prompt: text, width: target.width, height: target.height, protected_user_layers: [...protectedLayers].sort(), prohibitions: [...brief.asset_needs.prohibitions] };
}
export async function generateAndFreezeImage(projectRoot, brief, design, target, capability, adapter, { probeMedia, fsImpl = fs } = {}) {
  const detected = detectImageGeneration(capability); if (!detected.available) return { route: 'hyperframes-native', reason_code: 'IMAGE_GENERATION_UNAVAILABLE' };
  if (typeof adapter !== 'function' || typeof probeMedia !== 'function') fail('adapter_unavailable', 'Image generation adapter is unavailable.');
  const request = buildImagePrompt(brief, design, target);
  let cached; try { cached = await withArtifactCache(projectRoot, 'render', { kind: 'generated-image', adapter_id: detected.adapter_id, prompt: request.prompt, width: request.width, height: request.height }, '.png', async (targetPath) => { const result = await adapter(request); if (!result || typeof result.path !== 'string') fail('generation_failed', 'Image generation did not return a local file.'); await fsImpl.copyFile(result.path, targetPath, fsImpl.constants?.COPYFILE_EXCL ?? 1); }); } catch (error) { if (error instanceof CacheError && error.code === 'cache_producer_failed') fail('generation_failed', 'Image generation did not return a verified local file.'); throw error; }
  let probe; try { probe = await probeMedia(cached.artifact_path); } catch { fail('probe_failed', 'Generated image failed verification.'); }
  if (!probe?.video?.primary || probe.duration_ms !== null || probe.audio?.count !== 0 || probe.video.primary.display_width !== target.width || probe.video.primary.display_height !== target.height) fail('probe_failed', 'Generated image does not match the requested target.');
  return { route: 'image-generation', generated: { adapter_id: detected.adapter_id, render_cache_key: cached.manifest.key, width: target.width, height: target.height, format: 'png' }, artifact_path: cached.artifact_path };
}
