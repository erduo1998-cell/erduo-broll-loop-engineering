import { cacheKey, withJsonCache } from './cache.mjs';
import { promises as fs } from 'node:fs';
import { withArtifactCache } from './cache.mjs';

const BASE = 'https://api.pexels.com/v1';
const ENGLISH = /^[a-z][a-z0-9 ,'-]{2,159}$/iu;
const HTTPS = /^https:\/\//u;
export class PexelsSearchError extends Error { constructor(code, message) { super(message); this.name = 'PexelsSearchError'; this.code = code; } }
const fail = (code, message) => { throw new PexelsSearchError(code, message); };
const unique = (v) => [...new Set(v)];
function orientation(w, h) { return w === h ? 'square' : w > h ? 'landscape' : 'portrait'; }
function crop(w, h, tw, th) { const r = Math.min((w / h) / (tw / th), (tw / th) / (w / h)); return { retention: r, usable: r >= .55 && (w / h > tw / th ? Math.floor(h * tw / th) >= tw && h >= th : w >= tw && Math.floor(w * th / tw) >= th) }; }
function phrase(brief) { const supplied = brief.asset_needs?.query_subjects?.find((x) => typeof x === 'string' && ENGLISH.test(x.trim())); const derived = (brief.representation?.subjects ?? []).filter((x) => typeof x === 'string' && ENGLISH.test(x.trim())).join(' '); return (supplied ?? derived).trim(); }
export function buildPexelsQueryPlan(briefs) {
  if (!briefs?.briefs || !Array.isArray(briefs.briefs)) fail('invalid_briefs', 'Validated briefs are required.');
  return briefs.briefs.map((brief) => { const base = phrase(brief); if (!base) return { shot_id: brief.shot_id, duration_ms: brief.duration_ms, status: 'unavailable', reason_code: 'ENGLISH_QUERY_REQUIRED' }; return { shot_id: brief.shot_id, duration_ms: brief.duration_ms, status: 'ready', queries: unique([base, `${base} cinematic natural light`, `${base} conceptual composition`]).map((query, index) => ({ query_id: `${brief.shot_id}-Q${index + 1}`, query, strategy: ['documentary', 'emotional', 'visual-metaphor'][index] })) }; });
}
function safePhoto(photo, q, target) { if (!Number.isInteger(photo?.id) || !Number.isInteger(photo.width) || !Number.isInteger(photo.height) || !HTTPS.test(photo.url ?? '') || !HTTPS.test(photo.photographer_url ?? '') || !HTTPS.test(photo.src?.original ?? '')) return null; const c = crop(photo.width, photo.height, target.width, target.height); if (!c.usable) return null; return { provider: 'pexels', kind: 'photo', item_id: photo.id, width: photo.width, height: photo.height, orientation: orientation(photo.width, photo.height), duration_ms: null, page_url: photo.url, creator: String(photo.photographer ?? '').slice(0, 160), creator_url: photo.photographer_url, download_url: photo.src.original, query_ids: [q] }; }
function safeVideo(video, q, target, minDuration) { if (!Number.isInteger(video?.id) || !Number.isInteger(video.width) || !Number.isInteger(video.height) || !HTTPS.test(video.url ?? '') || !HTTPS.test(video.user?.url ?? '')) return null; const c = crop(video.width, video.height, target.width, target.height); const seconds = Number(video.duration); if (!c.usable || !Number.isFinite(seconds) || Math.round(seconds * 1000) < minDuration) return null; const files = (video.video_files ?? []).filter((f) => HTTPS.test(f?.link ?? '') && Number.isInteger(f.width) && Number.isInteger(f.height) && f.width >= target.width && f.height >= target.height).sort((a,b) => b.width*b.height-a.width*a.height); if (!files.length) return null; return { provider: 'pexels', kind: 'video', item_id: video.id, width: video.width, height: video.height, orientation: orientation(video.width, video.height), duration_ms: Math.round(seconds * 1000), page_url: video.url, creator: String(video.user?.name ?? '').slice(0, 160), creator_url: video.user.url, download_url: files[0].link, query_ids: [q] }; }
export async function searchPexels(plan, credential, target, { fetchImpl = fetch, perPage = 8 } = {}) {
  if (!credential || typeof credential !== 'string' || !credential.trim()) fail('credential_missing', 'Pexels credential is not configured.');
  if (!target || !Number.isInteger(target.width) || !Number.isInteger(target.height) || target.width <= 0 || target.height <= 0) fail('invalid_target', 'Output target is invalid.');
  const all = new Map(); const errors = [];
  for (const shot of plan) for (const item of shot.status === 'ready' ? itemOrEmpty(shot.queries) : []) {
    for (const kind of ['photo', 'video']) {
      const endpoint = kind === 'photo' ? `${BASE}/search` : `${BASE}/videos/search`;
      const url = new URL(endpoint); url.searchParams.set('query', item.query); url.searchParams.set('orientation', orientation(target.width, target.height)); url.searchParams.set('per_page', String(perPage));
      let response; try { response = await fetchImpl(url, { headers: { Authorization: credential, Accept: 'application/json' } }); } catch { errors.push({ shot_id: shot.shot_id, query_id: item.query_id, kind, code: 'network_failed' }); continue; }
      if (!response.ok) { errors.push({ shot_id: shot.shot_id, query_id: item.query_id, kind, code: response.status === 429 ? 'rate_limited' : 'http_failed' }); continue; }
      let body; try { body = await response.json(); } catch { errors.push({ shot_id: shot.shot_id, query_id: item.query_id, kind, code: 'invalid_json' }); continue; }
      const entries = kind === 'photo' ? body?.photos : body?.videos; if (!Array.isArray(entries)) { errors.push({ shot_id: shot.shot_id, query_id: item.query_id, kind, code: 'invalid_payload' }); continue; }
      for (const raw of entries) { const candidate = kind === 'photo' ? safePhoto(raw, item.query_id, target) : safeVideo(raw, item.query_id, target, shot.duration_ms); if (!candidate) continue; const key = `${candidate.kind}:${candidate.item_id}`; const old = all.get(key); if (old) old.query_ids = unique([...old.query_ids, ...candidate.query_ids]).sort(); else all.set(key, candidate); }
    }
  }
  const candidates = [...all.values()].sort((a,b) => a.kind.localeCompare(b.kind) || a.item_id-b.item_id);
  return { schema_version: 1, candidate_count: candidates.length, candidates, errors };
}
function itemOrEmpty(value) { return Array.isArray(value) ? value : []; }
export async function searchPexelsCached(projectRoot, request, producer, options = {}) { return withJsonCache(projectRoot, { provider: 'pexels', ...request }, producer, options); }
export function pexelsSearchCacheKey(request) { return cacheKey('search', { provider: 'pexels', ...request }); }
function extensionFor(candidate) { const suffix = candidate.kind === 'video' ? '.mp4' : '.jpg'; return suffix; }
export async function freezePexelsCandidate(projectRoot, candidate, { fetchImpl = fetch, probeMedia, fsImpl = fs } = {}) {
  if (!candidate || candidate.provider !== 'pexels' || !['photo', 'video'].includes(candidate.kind) || !Number.isInteger(candidate.item_id) || !HTTPS.test(candidate.download_url ?? '') || !HTTPS.test(candidate.page_url ?? '') || !HTTPS.test(candidate.creator_url ?? '')) fail('invalid_candidate', 'Pexels candidate cannot be frozen.');
  if (typeof probeMedia !== 'function') fail('probe_unavailable', 'Downloaded media probe is unavailable.');
  const request = { provider: 'pexels', kind: candidate.kind, item_id: candidate.item_id, download_url: candidate.download_url };
  const cached = await withArtifactCache(projectRoot, 'download', request, extensionFor(candidate), async (target) => {
    let response; try { response = await fetchImpl(candidate.download_url); } catch { fail('download_failed', 'Pexels media download failed.'); }
    if (!response.ok) fail(response.status === 429 ? 'rate_limited' : 'download_failed', 'Pexels media download failed.');
    let bytes; try { bytes = Buffer.from(await response.arrayBuffer()); } catch { fail('download_failed', 'Pexels media download failed.'); }
    if (!bytes.length) fail('download_failed', 'Pexels media download failed.');
    await fsImpl.writeFile(target, bytes, { flag: 'wx', mode: 0o600 });
  });
  let probe; try { probe = await probeMedia(cached.artifact_path); } catch { fail('probe_failed', 'Downloaded Pexels media failed verification.'); }
  const actualKind = probe?.video?.primary && probe.duration_ms === null && probe.audio?.count === 0 ? 'photo' : probe?.video?.primary ? 'video' : null;
  if (actualKind !== candidate.kind) fail('probe_failed', 'Downloaded Pexels media kind does not match its candidate.');
  const record = { provider: 'pexels', kind: candidate.kind, item_id: candidate.item_id, download_cache_key: cached.manifest.key, page_url: candidate.page_url, creator: candidate.creator, creator_url: candidate.creator_url, width: probe.video.primary.display_width, height: probe.video.primary.display_height, duration_ms: probe.duration_ms };
  return { record, artifact_path: cached.artifact_path };
}
