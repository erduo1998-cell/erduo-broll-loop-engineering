#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprintRenderValue, fingerprintValue } from './state.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT_ID = /^S\d{3,}$/u;
const FULLSCREEN = new Set(['fullscreen', 'native-base-with-overlay']);
const PRIMARY_COMPOSITING = new Set([...FULLSCREEN, 'hard-alpha-over-source']);
const ACTION_CLASS = new Set(['route', 'filter', 'transform', 'accumulate', 'compare', 'reveal', 'connect', 'sort', 'switch', 'scan', 'grow', 'separate', 'compress', 'assemble', 'observe', 'hold']);

export class FullscreenCompositionError extends Error {
  constructor(code, message) { super(message); this.name = 'FullscreenCompositionError'; this.code = code; }
}

const fail = (code, message) => { throw new FullscreenCompositionError(code, message); };
const exact = (value, fields, code, message) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(code, message);
};
const positive = (value, code, message) => {
  if (!Number.isSafeInteger(value) || value <= 0) fail(code, message);
  return value;
};

function verifyTimeline(timeline) {
  exact(timeline, ['schema_version', 'plan_sha256', 'briefs_sha256', 'master', 'clip_count', 'clips', 'timeline_sha256'], 'invalid_timeline', 'HyperFrames timeline is invalid.');
  if (timeline.schema_version !== 1 || !SHA256.test(timeline.plan_sha256) || !SHA256.test(timeline.briefs_sha256)
    || !Array.isArray(timeline.clips) || timeline.clip_count !== timeline.clips.length || !timeline.clips.length) {
    fail('invalid_timeline', 'HyperFrames timeline is invalid.');
  }
  const { timeline_sha256, ...core } = timeline;
  if (fingerprintRenderValue(core) !== timeline_sha256) fail('timeline_tampered', 'HyperFrames timeline fingerprint is invalid.');
  exact(timeline.master, ['start_sec', 'visual_start_sec', 'duration_sec'], 'invalid_timeline', 'Master timeline is invalid.');
  if (timeline.master.start_sec !== 0 || !Number.isFinite(timeline.master.visual_start_sec) || timeline.master.visual_start_sec < 0
    || !Number.isFinite(timeline.master.duration_sec) || timeline.master.duration_sec <= timeline.master.visual_start_sec) {
    fail('invalid_timeline', 'Master timeline is invalid.');
  }
  let cursor = timeline.master.visual_start_sec;
  timeline.clips.forEach((clip, index) => {
    exact(clip, ['shot_id', 'master_start_sec', 'master_duration_sec', 'local_start_sec', 'local_duration_sec', 'primary_compositing'], 'invalid_clip', 'Timeline clip is invalid.');
    if (!SHOT_ID.test(clip.shot_id) || clip.shot_id !== `S${String(index + 1).padStart(3, '0')}`
      || !Number.isFinite(clip.master_start_sec) || !Number.isFinite(clip.master_duration_sec) || clip.master_duration_sec <= 0
      || clip.master_start_sec !== cursor || clip.local_start_sec !== 0 || clip.local_duration_sec !== clip.master_duration_sec) {
      fail('invalid_clip', 'Timeline clip is invalid.');
    }
    cursor = clip.master_start_sec + clip.master_duration_sec;
  });
  if (cursor !== timeline.master.duration_sec) fail('timeline_gap', 'Timeline clips do not reach the master duration.');
}

function verifyScenes(document) {
  exact(document, ['schema_version', 'briefs_sha256', 'scene_count', 'scenes', 'scenes_sha256'], 'invalid_scenes', 'Native scenes are invalid.');
  if (document.schema_version !== 1 || !SHA256.test(document.briefs_sha256) || !Array.isArray(document.scenes)
    || document.scene_count !== document.scenes.length || !document.scenes.length) fail('invalid_scenes', 'Native scenes are invalid.');
  const { scenes_sha256, ...core } = document;
  if (fingerprintValue(core) !== scenes_sha256) fail('scenes_tampered', 'Native scenes fingerprint is invalid.');
  const ids = new Set();
  document.scenes.forEach((scene, index) => {
    exact(scene, ['schema_version', 'shot_id', 'duration_ms', 'route', 'primary_compositing', 'scene_grammar', 'semantic_type', 'nodes', 'relationship', 'action', 'final_state', 'prohibitions', 'scene_sha256'], 'invalid_scene', 'Native scene is invalid.');
    const { scene_sha256, ...sceneCore } = scene;
    if (scene.schema_version !== 1 || !SHOT_ID.test(scene.shot_id) || ids.has(scene.shot_id) || scene.shot_id !== `S${String(index + 1).padStart(3, '0')}`
      || positive(scene.duration_ms, 'invalid_scene', 'Native scene duration is invalid.') <= 0
      || scene.route !== 'hyperframes-native' || !PRIMARY_COMPOSITING.has(scene.primary_compositing)
      || !Array.isArray(scene.nodes) || !scene.nodes.length || scene.nodes.length > 8
      || typeof scene.scene_grammar !== 'string' || typeof scene.semantic_type !== 'string' || typeof scene.relationship !== 'string'
      || !scene.action || !ACTION_CLASS.has(scene.action.verb) || !scene.final_state || !Array.isArray(scene.prohibitions) || !SHA256.test(scene_sha256)
      || fingerprintValue(sceneCore) !== scene_sha256) fail('invalid_scene', 'Native scene is invalid.');
    ids.add(scene.shot_id);
  });
}

function canvas(value = {}) {
  exact(value, ['width', 'height', 'fps'], 'invalid_canvas', 'Canvas configuration is invalid.');
  const width = positive(value.width, 'invalid_canvas', 'Canvas width is invalid.');
  const height = positive(value.height, 'invalid_canvas', 'Canvas height is invalid.');
  if (!([24, 30, 60].includes(value.fps))) fail('invalid_canvas', 'Canvas frame rate is invalid.');
  return { width, height, fps: value.fps };
}

function sceneHue(scene) { return Number.parseInt(scene.scene_sha256.slice(0, 6), 16) % 360; }

export function buildFullscreenComposition(timeline, nativeScenes, target = { width: 1920, height: 1080, fps: 30 }) {
  verifyTimeline(timeline);
  verifyScenes(nativeScenes);
  if (timeline.briefs_sha256 !== nativeScenes.briefs_sha256 || timeline.clip_count !== nativeScenes.scene_count) {
    fail('input_mismatch', 'Timeline and native scenes do not share one brief set.');
  }
  const frame = canvas(target);
  const byShot = new Map(nativeScenes.scenes.map((scene) => [scene.shot_id, scene]));
  const clips = timeline.clips.map((clip) => {
    if (!FULLSCREEN.has(clip.primary_compositing)) fail('not_fullscreen', 'Fullscreen composition cannot consume an Alpha-only shot.');
    const scene = byShot.get(clip.shot_id);
    if (!scene || scene.duration_ms / 1000 !== clip.master_duration_sec || scene.primary_compositing !== clip.primary_compositing) {
      fail('scene_mismatch', 'Native scene does not match its authoritative timeline window.');
    }
    return {
      shot_id: clip.shot_id,
      start_sec: clip.master_start_sec,
      duration_sec: clip.master_duration_sec,
      scene_sha256: scene.scene_sha256,
      action: scene.action.verb,
      node_count: scene.nodes.length,
      hue: sceneHue(scene),
    };
  });
  const core = {
    schema_version: 1,
    render_mode: 'fullscreen-mp4',
    timeline_sha256: timeline.timeline_sha256,
    scenes_sha256: nativeScenes.scenes_sha256,
    canvas: frame,
    master_duration_sec: timeline.master.duration_sec,
    visual_start_sec: timeline.master.visual_start_sec,
    clip_count: clips.length,
    clips,
  };
  return { ...core, composition_sha256: fingerprintRenderValue(core) };
}

const number = (value) => Number(value.toFixed(3));
function actionMarkup(action, shotId) {
  const gate = ['filter', 'sort', 'separate'].includes(action) ? `<div class="gate" aria-hidden="true"></div>` : '';
  const beam = ['route', 'filter', 'connect', 'scan', 'switch', 'observe'].includes(action) ? `<div class="beam" aria-hidden="true"><i></i></div>` : '';
  return `${gate}${beam}<div id="${shotId}-result" class="result" aria-hidden="true"></div>`;
}

export function renderFullscreenHtml(composition) {
  const { canvas: frame } = composition;
  const clips = composition.clips.map((clip) => {
    const nodes = Array.from({ length: clip.node_count }, (_, index) => `<i id="${clip.shot_id}-node-${index + 1}" class="node node-${index + 1}" aria-hidden="true"></i>`).join('');
    return `<section id="${clip.shot_id}" class="clip scene action-${clip.action}" data-start="${number(clip.start_sec)}" data-duration="${number(clip.duration_sec)}" data-track-index="1" style="--hue:${clip.hue};--nodes:${clip.node_count};--shot-duration:${number(clip.duration_sec)}s">\n        <div class="field" data-layout-ignore aria-hidden="true"></div><div class="grid" data-layout-ignore aria-hidden="true"></div><div class="network" aria-hidden="true">${nodes}${actionMarkup(clip.action, clip.shot_id)}</div>\n      </section>`;
  }).join('\n      ');
  const timelineClips = JSON.stringify(composition.clips.map((clip) => ({ id: clip.shot_id, start: clip.start_sec, duration: clip.duration_sec, action: clip.action })));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${frame.width}, height=${frame.height}" />
    <title>Fullscreen native B-roll</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; width: ${frame.width}px; height: ${frame.height}px; overflow: hidden; background: #04070d; }
      #root { position: relative; width: ${frame.width}px; height: ${frame.height}px; overflow: hidden; background: #04070d; }
      .scene { position: absolute; inset: 0; overflow: hidden; background: hsl(var(--hue) 34% 7%); }
      .field { position: absolute; inset: -15%; background: radial-gradient(circle at 50% 48%, hsl(var(--hue) 88% 58% / .34), transparent 33%), radial-gradient(circle at 16% 84%, hsl(calc(var(--hue) + 56) 84% 42% / .20), transparent 35%), hsl(var(--hue) 34% 7%); }
      .grid { position: absolute; inset: 0; opacity: .24; background-image: linear-gradient(hsl(var(--hue) 90% 76% / .26) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--hue) 90% 76% / .26) 1px, transparent 1px); background-size: 96px 96px; mask-image: radial-gradient(circle at center, black, transparent 74%); }
      .network { position: absolute; inset: 14% 15%; display: grid; grid-template-columns: repeat(var(--nodes), minmax(70px, 1fr)); align-items: center; justify-items: center; gap: 36px; }
      .node { position: relative; z-index: 2; display: block; width: 132px; height: 132px; border: 3px solid hsl(var(--hue) 94% 84% / .9); border-radius: 999px; background: radial-gradient(circle at 35% 30%, #fff, hsl(var(--hue) 96% 72%) 16%, hsl(var(--hue) 86% 42% / .9) 55%, transparent 72%); box-shadow: 0 0 42px hsl(var(--hue) 95% 66% / .72), inset 0 0 26px hsl(var(--hue) 98% 88% / .78); }
      .beam { position: absolute; inset: 48% 4% auto; height: 8px; border-radius: 999px; background: hsl(var(--hue) 78% 78% / .16); overflow: hidden; }
      .beam i { display: block; width: 22%; height: 100%; border-radius: inherit; background: hsl(var(--hue) 100% 91%); box-shadow: 0 0 28px hsl(var(--hue) 100% 88%); }
      .gate { position: absolute; z-index: 3; left: 48%; top: 22%; width: 4%; height: 56%; border-left: 6px solid hsl(var(--hue) 100% 89% / .9); border-right: 6px solid hsl(var(--hue) 100% 89% / .9); box-shadow: 0 0 26px hsl(var(--hue) 100% 78%); }
      .result { position: absolute; z-index: 4; right: 6%; bottom: 8%; width: 104px; height: 104px; border: 4px solid hsl(var(--hue) 100% 90%); border-radius: 50%; box-shadow: 0 0 0 0 hsl(var(--hue) 98% 78% / .55), 0 0 30px hsl(var(--hue) 98% 78%); }
      .action-compare .node:nth-of-type(even), .action-separate .node:nth-of-type(even) { transform: translateY(108px); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="${frame.width}" data-height="${frame.height}" data-duration="${number(composition.master_duration_sec)}" data-fps="${frame.fps}">
      ${clips}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const shots = ${timelineClips};
      shots.forEach((shot) => {
        const scene = document.getElementById(shot.id);
        const enter = Math.min(0.72, shot.duration * 0.28);
        const resolveAt = shot.start + Math.max(enter, shot.duration * 0.55);
        tl.fromTo(scene.querySelector('.field'), { scale: 1.04, rotation: -3 }, { scale: 1.1, rotation: 1, duration: shot.duration, ease: 'sine.inOut' }, shot.start);
        tl.fromTo(scene.querySelector('.grid'), { x: -48, y: -48 }, { x: 48, y: 48, duration: shot.duration, ease: 'none' }, shot.start);
        scene.querySelectorAll('.node').forEach((node, index) => {
          const compression = ['compress', 'assemble'].includes(shot.action);
          const growth = ['grow', 'accumulate'].includes(shot.action);
          const y = ['compare', 'separate'].includes(shot.action) && index % 2 ? 108 : 0;
          tl.fromTo(node, { opacity: 0.16, y: 88 + y, scale: compression ? 1.4 : growth ? 0.35 : 0.48 }, { opacity: 1, y, scale: compression ? 0.95 : 1, duration: enter, ease: 'power3.out' }, shot.start + index * 0.07);
          tl.to(node, { y: y - 12, duration: Math.max(0.3, shot.duration - enter), ease: 'sine.inOut' }, shot.start + enter + index * 0.04);
        });
        const signal = scene.querySelector('.beam i');
        if (signal) tl.fromTo(signal, { xPercent: -110, opacity: 0 }, { xPercent: 350, opacity: 0.92, duration: Math.max(0.5, shot.duration * 0.78), ease: 'power2.inOut' }, shot.start + enter * 0.2);
        const gate = scene.querySelector('.gate');
        if (gate) tl.fromTo(gate, { opacity: 0.12, scaleY: 0.2 }, { opacity: 0.78, scaleY: 0.92, duration: Math.max(0.35, shot.duration * 0.55), ease: 'power2.out' }, shot.start + enter * 0.2);
        tl.fromTo(scene.querySelector('.result'), { opacity: 0, scale: 0.16, rotation: -65 }, { opacity: 1, scale: 1, rotation: 0, duration: Math.max(0.3, shot.duration * 0.3), ease: 'back.out(1.5)' }, resolveAt);
      });
      window.__timelines.main = tl;
    </script>
  </body>
</html>
`;
}

export function motionContract(composition) {
  return {
    duration: composition.master_duration_sec,
    assertions: [
      { kind: 'keepsMoving', withinSelector: '#root', maxStaticSec: 2 },
      ...composition.clips.map((clip) => ({ kind: 'staysInFrame', selector: `#${clip.shot_id}` })),
    ],
  };
}

async function assertEmptyOrMissing(outputDir) {
  try {
    const entries = await fs.readdir(outputDir);
    if (entries.length) fail('output_not_empty', 'Output directory must be empty.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

export async function writeFullscreenProject(outputDir, composition) {
  if (typeof outputDir !== 'string' || !outputDir) fail('invalid_output', 'Output directory is invalid.');
  const { composition_sha256, ...core } = composition ?? {};
  const expected = fingerprintRenderValue(core);
  if (!SHA256.test(composition?.composition_sha256) || expected !== composition.composition_sha256) fail('composition_tampered', 'Fullscreen composition fingerprint is invalid.');
  await assertEmptyOrMissing(outputDir);
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, 'index.html'), renderFullscreenHtml(composition), 'utf8'),
    fs.writeFile(path.join(outputDir, 'index.motion.json'), `${JSON.stringify(motionContract(composition), null, 2)}\n`, 'utf8'),
    fs.writeFile(path.join(outputDir, 'meta.json'), `${JSON.stringify({ name: 'erduo-hyperframes-broll-fullscreen', composition_sha256: composition.composition_sha256 }, null, 2)}\n`, 'utf8'),
    fs.writeFile(path.join(outputDir, 'hyperframes.json'), `${JSON.stringify({ $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json', paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' }, media: { autoProxy: true } }, null, 2)}\n`, 'utf8'),
    fs.writeFile(path.join(outputDir, 'package.json'), `${JSON.stringify({ name: 'erduo-hyperframes-broll-fullscreen', private: true, type: 'module', scripts: { check: 'npx --yes hyperframes@0.7.64 check', render: 'npx --yes hyperframes@0.7.64 render' } }, null, 2)}\n`, 'utf8'),
  ]);
  return composition;
}

export function parseFullscreenArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  if (argv.length !== 3 || argv.some((arg) => arg.startsWith('-'))) return { error: true };
  return { timeline: argv[0], scenes: argv[1], outputDir: argv[2] };
}

export async function runFullscreenCli(argv, adapters = {}) {
  const stdout = adapters.stdout ?? process.stdout;
  const stderr = adapters.stderr ?? process.stderr;
  const readFile = adapters.readFile ?? fs.readFile;
  const writeProject = adapters.writeProject ?? writeFullscreenProject;
  const args = parseFullscreenArgs(argv);
  if (args.help) { stdout.write('Usage: node scripts/build-fullscreen-composition.mjs <timeline.json> <native-scenes.json> <empty-output-dir>\n'); return 0; }
  if (args.error) { stderr.write('build-fullscreen-composition: invalid arguments (use --help)\n'); return 64; }
  try {
    const [timelineText, scenesText] = await Promise.all([readFile(args.timeline, 'utf8'), readFile(args.scenes, 'utf8')]);
    const composition = buildFullscreenComposition(JSON.parse(timelineText), JSON.parse(scenesText));
    await writeProject(args.outputDir, composition);
    stdout.write(`${JSON.stringify(composition)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof FullscreenCompositionError) {
      stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code, message: error.message } })}\n`);
      return 2;
    }
    stderr.write(`${JSON.stringify({ ok: false, error: { code: 'build_failed', message: 'Fullscreen composition could not be built.' } })}\n`);
    return 3;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exit(await runFullscreenCli(process.argv.slice(2)));
