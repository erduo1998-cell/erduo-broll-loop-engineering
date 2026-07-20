#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprintRenderValue, fingerprintValue } from './state.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT = /^S\d{3,}$/u;
const KINDS = new Set(['hard-card', 'cutout-frame', 'callout-geometry']);
export class HardAlphaError extends Error { constructor(code, message) { super(message); this.name = 'HardAlphaError'; this.code = code; } }
const fail = (code, message) => { throw new HardAlphaError(code, message); };
const exact = (value, fields, code) => { if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(code, 'Alpha composition input is invalid.'); };
const positive = (value, code) => { if (!Number.isSafeInteger(value) || value <= 0) fail(code, 'Alpha composition input is invalid.'); return value; };

function verifyTimeline(timeline) {
  exact(timeline, ['schema_version', 'plan_sha256', 'briefs_sha256', 'master', 'clip_count', 'clips', 'timeline_sha256'], 'invalid_timeline');
  const { timeline_sha256, ...core } = timeline;
  if (timeline.schema_version !== 1 || !SHA256.test(timeline.plan_sha256) || !SHA256.test(timeline.briefs_sha256) || !Array.isArray(timeline.clips) || !timeline.clips.length || timeline.clip_count !== timeline.clips.length || fingerprintRenderValue(core) !== timeline_sha256) fail('invalid_timeline', 'Alpha composition input is invalid.');
  exact(timeline.master, ['start_sec', 'visual_start_sec', 'duration_sec'], 'invalid_timeline');
  if (timeline.master.start_sec !== 0 || !Number.isFinite(timeline.master.visual_start_sec) || !Number.isFinite(timeline.master.duration_sec) || timeline.master.duration_sec <= timeline.master.visual_start_sec) fail('invalid_timeline', 'Alpha composition input is invalid.');
  let cursor = timeline.master.visual_start_sec;
  for (let index = 0; index < timeline.clips.length; index += 1) {
    const clip = timeline.clips[index];
    exact(clip, ['shot_id', 'master_start_sec', 'master_duration_sec', 'local_start_sec', 'local_duration_sec', 'primary_compositing'], 'invalid_timeline');
    if (clip.shot_id !== `S${String(index + 1).padStart(3, '0')}` || clip.master_start_sec !== cursor || !Number.isFinite(clip.master_duration_sec) || clip.master_duration_sec <= 0 || clip.local_start_sec !== 0 || clip.local_duration_sec !== clip.master_duration_sec) fail('invalid_timeline', 'Alpha composition input is invalid.');
    cursor += clip.master_duration_sec;
  }
  if (cursor !== timeline.master.duration_sec) fail('timeline_gap', 'Timeline clips do not reach master duration.');
}

function verifyOverlays(overlays) {
  exact(overlays, ['schema_version', 'briefs_sha256', 'overlay_count', 'overlays', 'overlays_sha256'], 'invalid_overlays');
  const { overlays_sha256, ...core } = overlays;
  if (overlays.schema_version !== 1 || !SHA256.test(overlays.briefs_sha256) || !Array.isArray(overlays.overlays) || overlays.overlay_count !== overlays.overlays.length || !overlays.overlays.length || fingerprintValue(core) !== overlays_sha256) fail('invalid_overlays', 'Alpha overlay input is invalid.');
  const ids = new Set();
  overlays.overlays.forEach((overlay, index) => {
    exact(overlay, ['shot_id', 'duration_ms', 'kind', 'accent_hue'], 'invalid_overlay');
    if (!SHOT.test(overlay.shot_id) || overlay.shot_id !== `S${String(index + 1).padStart(3, '0')}` || ids.has(overlay.shot_id) || positive(overlay.duration_ms, 'invalid_overlay') <= 0 || !KINDS.has(overlay.kind) || !Number.isSafeInteger(overlay.accent_hue) || overlay.accent_hue < 0 || overlay.accent_hue > 359) fail('invalid_overlay', 'Alpha overlay input is invalid.');
    ids.add(overlay.shot_id);
  });
}

export function buildHardAlphaComposition(timeline, overlays, canvas = { width: 1920, height: 1080, fps: 30 }) {
  verifyTimeline(timeline); verifyOverlays(overlays);
  if (timeline.briefs_sha256 !== overlays.briefs_sha256 || timeline.clip_count !== overlays.overlay_count) fail('input_mismatch', 'Timeline and alpha overlays do not share one brief set.');
  exact(canvas, ['width', 'height', 'fps'], 'invalid_canvas');
  if (positive(canvas.width, 'invalid_canvas') < 64 || positive(canvas.height, 'invalid_canvas') < 64 || ![24, 30, 60].includes(canvas.fps)) fail('invalid_canvas', 'Alpha canvas is invalid.');
  const byShot = new Map(overlays.overlays.map((overlay) => [overlay.shot_id, overlay]));
  const clips = timeline.clips.map((clip) => {
    if (clip.primary_compositing !== 'hard-alpha-over-source') fail('not_hard_alpha', 'Alpha composition accepts only hard-alpha-over-source windows.');
    const overlay = byShot.get(clip.shot_id);
    if (!overlay || overlay.duration_ms / 1000 !== clip.master_duration_sec) fail('overlay_mismatch', 'Alpha overlay duration does not match timeline.');
    return { shot_id: clip.shot_id, start_sec: clip.master_start_sec, duration_sec: clip.master_duration_sec, kind: overlay.kind, accent_hue: overlay.accent_hue };
  });
  const core = { schema_version: 1, render_mode: 'hard-alpha-prores4444-mov', timeline_sha256: timeline.timeline_sha256, overlays_sha256: overlays.overlays_sha256, canvas, master_duration_sec: timeline.master.duration_sec, clip_count: clips.length, clips };
  return { ...core, composition_sha256: fingerprintRenderValue(core) };
}

const n = (value) => Number(value.toFixed(3));
export function renderHardAlphaHtml(composition) {
  const { canvas } = composition;
  const sections = composition.clips.map((clip) => `<section id="${clip.shot_id}" class="clip overlay ${clip.kind}" data-start="${n(clip.start_sec)}" data-duration="${n(clip.duration_sec)}" data-track-index="1" style="--hue:${clip.accent_hue}"><div class="frame"><i class="corner c1"></i><i class="corner c2"></i><i class="corner c3"></i><i class="corner c4"></i><div class="rail"><i></i></div><div class="marker"></div></div></section>`).join('\n      ');
  const specs = JSON.stringify(composition.clips.map((clip) => ({ id: clip.shot_id, start: clip.start_sec, duration: clip.duration_sec, kind: clip.kind })));
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=${canvas.width}, height=${canvas.height}"/><script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script><style>*{box-sizing:border-box}html,body,#root{margin:0;width:${canvas.width}px;height:${canvas.height}px;overflow:hidden;background:transparent}.overlay{position:absolute;inset:0;background:transparent}.frame{position:absolute;inset:15% 14%;border:5px solid hsl(var(--hue) 100% 92%);background:transparent}.corner{position:absolute;width:120px;height:120px;border:16px solid hsl(var(--hue) 100% 92%)}.c1{left:-5px;top:-5px;border-right:0;border-bottom:0}.c2{right:-5px;top:-5px;border-left:0;border-bottom:0}.c3{left:-5px;bottom:-5px;border-right:0;border-top:0}.c4{right:-5px;bottom:-5px;border-left:0;border-top:0}.rail{position:absolute;left:12%;right:12%;top:50%;height:12px;background:hsl(var(--hue) 100% 92%)}.rail i{display:block;width:18%;height:100%;background:hsl(var(--hue) 100% 64%)}.marker{position:absolute;width:96px;height:96px;border:12px solid hsl(var(--hue) 100% 92%);border-radius:50%;right:12%;bottom:14%;background:transparent}.cutout-frame .frame{clip-path:polygon(0 0,100% 0,100% 100%,0 100%,0 74%,18% 74%,18% 26%,0 26%)}.callout-geometry .frame{border-radius:0 160px 0 160px}.callout-geometry .marker{border-radius:0}</style></head><body><div id="root" data-composition-id="main" data-start="0" data-width="${canvas.width}" data-height="${canvas.height}" data-duration="${n(composition.master_duration_sec)}" data-fps="${canvas.fps}">${sections}</div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});const shots=${specs};shots.forEach((shot)=>{const scene=document.getElementById(shot.id);const frame=scene.querySelector('.frame');const enter=Math.min(.7,shot.duration*.3);tl.fromTo(frame,{opacity:.08,scale:.78},{opacity:1,scale:1,duration:enter,ease:'power3.out'},shot.start);tl.to(frame,{rotation:shot.kind==='callout-geometry'?8:0,duration:Math.max(.4,shot.duration-enter),ease:'sine.inOut'},shot.start+enter);tl.fromTo(scene.querySelector('.rail i'),{xPercent:-100},{xPercent:450,duration:Math.max(.5,shot.duration*.72),ease:'power2.inOut'},shot.start+enter*.25);tl.fromTo(scene.querySelector('.marker'),{opacity:0,scale:.15,rotation:-45},{opacity:1,scale:1,rotation:0,duration:Math.max(.3,shot.duration*.3),ease:'back.out(1.4)'},shot.start+shot.duration*.55)});window.__timelines.main=tl;</script></body></html>`;
}

export function alphaMotionContract(composition) { return { duration: composition.master_duration_sec, assertions: [{ kind: 'keepsMoving', withinSelector: '#root', maxStaticSec: 2 }, ...composition.clips.map((clip) => ({ kind: 'staysInFrame', selector: `#${clip.shot_id}` }))] }; }

export async function writeHardAlphaProject(outputDir, composition) {
  const { composition_sha256, ...core } = composition ?? {};
  if (typeof outputDir !== 'string' || !outputDir || !SHA256.test(composition_sha256) || fingerprintRenderValue(core) !== composition_sha256) fail('composition_tampered', 'Alpha composition is invalid.');
  try { if ((await fs.readdir(outputDir)).length) fail('output_not_empty', 'Output directory must be empty.'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([fs.writeFile(path.join(outputDir, 'index.html'), renderHardAlphaHtml(composition)), fs.writeFile(path.join(outputDir, 'index.motion.json'), `${JSON.stringify(alphaMotionContract(composition), null, 2)}\n`), fs.writeFile(path.join(outputDir, 'hyperframes.json'), `${JSON.stringify({ $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json' }, null, 2)}\n`), fs.writeFile(path.join(outputDir, 'package.json'), `${JSON.stringify({ name: 'erduo-hyperframes-broll-alpha', private: true, type: 'module', scripts: { check: 'npx --yes hyperframes@0.7.64 check', render: 'npx --yes hyperframes@0.7.64 render --format mov' } }, null, 2)}\n`)]);
  return composition;
}

const main = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (main) process.stderr.write('This builder is imported by the pipeline; use its exported contract functions.\n');
