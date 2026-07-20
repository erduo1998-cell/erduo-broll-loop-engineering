import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPexelsQueryPlan, freezePexelsCandidate, pexelsSearchCacheKey, searchPexels } from './pexels-search.mjs';

const briefs = { briefs: [{ shot_id: 'S001', duration_ms: 3000, representation: { subjects: ['red gate', 'signal'] }, asset_needs: { query_subjects: ['red gate filtering signal'] } }] };
test('builds three concrete English query strategies and exposes missing translation', () => {
  const plan = buildPexelsQueryPlan(briefs); assert.deepEqual(plan[0].queries.map((q) => q.strategy), ['documentary', 'emotional', 'visual-metaphor']);
  assert.equal(buildPexelsQueryPlan({ briefs: [{ shot_id: 'S002', duration_ms: 1, representation: { subjects: ['红门'] }, asset_needs: { query_subjects: [] } }] })[0].reason_code, 'ENGLISH_QUERY_REQUIRED');
});
test('searches both endpoints, filters metadata, deduplicates, and does not expose credential', async () => {
  const calls = []; const fake = async (url, init) => { calls.push([String(url), init]); const video = String(url).includes('/videos/'); return { ok: true, json: async () => video ? { videos: [{ id: 7, width: 1920, height: 1080, duration: 4, url: 'https://www.pexels.com/video/7/', user: { name: 'Creator', url: 'https://www.pexels.com/@creator/' }, video_files: [{ width: 1920, height: 1080, link: 'https://videos.pexels.com/v.mp4' }] }] } : { photos: [{ id: 6, width: 1920, height: 1080, url: 'https://www.pexels.com/photo/6/', photographer: 'Creator', photographer_url: 'https://www.pexels.com/@creator/', src: { original: 'https://images.pexels.com/p.jpg' } }] } }; };
  const out = await searchPexels(buildPexelsQueryPlan(briefs), 'SECRET', { width: 1920, height: 1080 }, { fetchImpl: fake });
  assert.equal(calls.length, 6); assert.equal(calls.every(([, init]) => init.headers.Authorization === 'SECRET'), true); assert.equal(out.candidate_count, 2); assert.equal(JSON.stringify(out).includes('SECRET'), false);
});
test('rate limits, malformed entries, short video and missing credential are safe', async () => {
  await assert.rejects(() => searchPexels(buildPexelsQueryPlan(briefs), '', { width: 1, height: 1 }), (e) => e.code === 'credential_missing');
  const limited = await searchPexels(buildPexelsQueryPlan(briefs), 'k', { width: 1920, height: 1080 }, { fetchImpl: async () => ({ ok: false, status: 429 }) }); assert.equal(limited.errors.length, 6); assert.equal(limited.errors.every((e) => e.code === 'rate_limited'), true);
  const short = await searchPexels(buildPexelsQueryPlan(briefs), 'k', { width: 1920, height: 1080 }, { fetchImpl: async (url) => ({ ok: true, json: async () => String(url).includes('/videos/') ? { videos: [{ id: 1, width: 1920, height: 1080, duration: 1, url: 'https://www.pexels.com/v', user: { url: 'https://www.pexels.com/u' }, video_files: [] }] } : { photos: [{ id: 2, width: 1, height: 1 }] } }) }); assert.equal(short.candidate_count, 0);
});
test('cache keys are deterministic and credential-free', () => { assert.equal(pexelsSearchCacheKey({ query: 'red gate' }), pexelsSearchCacheKey({ query: 'red gate' })); assert.throws(() => pexelsSearchCacheKey({ api_key: 'x' })); });
test('freezes a download through artifact cache then probes it without returning a path in the record', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pexels-freeze-')); t.after(() => fs.rm(root, { recursive: true, force: true })); let calls = 0;
  const candidate = { provider: 'pexels', kind: 'video', item_id: 9, download_url: 'https://videos.pexels.com/9.mp4', page_url: 'https://www.pexels.com/video/9/', creator: 'Creator', creator_url: 'https://www.pexels.com/@creator/' };
  const options = { fetchImpl: async () => { calls += 1; return { ok: true, arrayBuffer: async () => new Uint8Array([1,2,3]).buffer }; }, probeMedia: async () => ({ duration_ms: 4000, video: { primary: { display_width: 1920, display_height: 1080 } }, audio: { count: 0 } }) };
  const first = await freezePexelsCandidate(root, candidate, options); const second = await freezePexelsCandidate(root, candidate, options);
  assert.equal(calls, 1); assert.equal(first.record.item_id, 9); assert.equal(JSON.stringify(first.record).includes(root), false); assert.equal(second.record.download_cache_key, first.record.download_cache_key);
});
