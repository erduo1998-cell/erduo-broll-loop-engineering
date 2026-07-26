#!/usr/bin/env node

// Legacy M10 regression-fixture builder only. Version-2 production
// master-builds start from the neutral scaffold and use official HyperFrames
// authoring; they must not use this opinionated generator as a compiler.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprintRenderValue } from './state.mjs';
import { auditDisplayFontRoleBindings, scanRuntimeFontText } from './validate-font-package.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT_ID = /^S\d{3}$/u;
const ROUTES = new Set(['user-media', 'image-generation', 'pexels', 'hyperframes-native']);
const GRAMMAR = new Set(['quote', 'data-relationship', 'contrast', 'case', 'process', 'emotion-turn', 'action-close', 'evidence', 'custom']);
const COMPOSITING = new Set(['fullscreen-broll', 'speaker-hard-alpha-overlay', 'speaker-split-screen', 'local-component', 'light-pass-support', 'speaker-context-return']);
const CANVAS_FPS = new Set([24, 30, 60]);

export class M10CompositionError extends Error {
  constructor(code, message, shot) {
    super(message);
    this.name = 'M10CompositionError';
    this.code = code;
    if (shot !== undefined) this.shot = shot;
  }
}

function fail(code, message, shot) {
  throw new M10CompositionError(code, message, shot);
}

function required(value, fields, code, message, shot) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, shot);
  for (const field of fields) if (!(field in value)) fail(code, message, shot);
}

function text(value, code, message, shot, max = 420) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(value)) fail(code, message, shot);
  return value.trim();
}

function canvas(value = {}) {
  required(value, ['width', 'height', 'fps'], 'invalid_canvas', 'Canvas configuration is invalid.');
  if (!Number.isSafeInteger(value.width) || value.width < 320 || !Number.isSafeInteger(value.height) || value.height < 320 || !CANVAS_FPS.has(value.fps)) {
    fail('invalid_canvas', 'Canvas configuration is invalid.');
  }
  return { width: value.width, height: value.height, fps: value.fps };
}

function validateVisualContract(document) {
  required(document, ['schema_version', 'plan_sha256', 'frame_fusion_sha256', 'director_summary_sha256', 'shot_count', 'shots', 'visual_contract_sha256'], 'invalid_visual_contract', 'Validated M10 visual contract is required.');
  if (document.schema_version !== 1 || !SHA256.test(document.plan_sha256) || !SHA256.test(document.frame_fusion_sha256)
    || !SHA256.test(document.director_summary_sha256) || !SHA256.test(document.visual_contract_sha256)
    || !Number.isSafeInteger(document.shot_count) || document.shot_count < 1 || !Array.isArray(document.shots)
    || document.shot_count !== document.shots.length) fail('invalid_visual_contract', 'Validated M10 visual contract is invalid.');
  const ids = new Set();
  return {
    ...document,
    shots: document.shots.map((shot, index) => {
      const shotId = `S${String(index + 1).padStart(3, '0')}`;
      required(shot, ['shot_id', 'duration_ms', 'information_intent', 'visual_grammar', 'compositing', 'material_roles', 'component_intent', 'motion', 'frame_fusion', 'reference_use', 'quality_notes'], 'invalid_shot_contract', 'Shot visual contract is invalid.', shotId);
      if (shot.shot_id !== shotId || !SHOT_ID.test(shot.shot_id) || ids.has(shot.shot_id) || !Number.isSafeInteger(shot.duration_ms) || shot.duration_ms <= 0) fail('invalid_shot_contract', 'Shot identity or duration is invalid.', shotId);
      ids.add(shot.shot_id);
      required(shot.information_intent, ['narrated_claim', 'viewer_should_understand', 'readable_outcome'], 'invalid_shot_contract', 'Shot information intent is invalid.', shotId);
      required(shot.visual_grammar, ['family', 'agent_choice_reason', 'screen_text'], 'invalid_shot_contract', 'Shot visual grammar is invalid.', shotId);
      if (!GRAMMAR.has(shot.visual_grammar.family)) fail('invalid_shot_contract', 'Shot grammar family is invalid.', shotId);
      required(shot.compositing, ['mode', 'reason'], 'invalid_shot_contract', 'Shot compositing is invalid.', shotId);
      if (!COMPOSITING.has(shot.compositing.mode)) fail('invalid_shot_contract', 'Shot compositing mode is invalid.', shotId);
      if (!Array.isArray(shot.material_roles) || !shot.material_roles.length) fail('missing_material_roles', 'Shot material roles are required.', shotId);
      if (shot.quality_notes?.not_subtitle_burn !== true || shot.quality_notes?.not_native_default !== true || shot.quality_notes?.not_media_only_pass !== true) fail('invalid_quality_notes', 'Shot must reject known M10 failure modes.', shotId);
      return shot;
    }),
  };
}

function validateRoutePlan(document, visualContract) {
  required(document, ['schema_version', 'visual_contract_sha256', 'shot_count', 'plan_sha256', 'route_policy', 'capability_profile', 'routes', 'route_plan_sha256'], 'invalid_route_plan', 'M10 route plan is required.');
  if (document.schema_version !== 1 || document.visual_contract_sha256 !== visualContract.visual_contract_sha256
    || document.plan_sha256 !== visualContract.plan_sha256 || !SHA256.test(document.route_plan_sha256)
    || document.shot_count !== visualContract.shot_count || !Array.isArray(document.routes)
    || document.routes.length !== visualContract.shot_count) fail('invalid_route_plan', 'M10 route plan does not match the visual contract.');

  const routes = document.routes.map((route, index) => {
    const shot = visualContract.shots[index];
    const shotId = shot.shot_id;
    required(route, ['shot_id', 'duration_ms', 'primary_route', 'primary_role', 'visual_grammar_family', 'compositing_mode', 'route_plan', 'route_plan_sha256'], 'invalid_route_plan', 'M10 shot route is invalid.', shotId);
    if (route.shot_id !== shotId || route.duration_ms !== shot.duration_ms || route.visual_grammar_family !== shot.visual_grammar.family
      || route.compositing_mode !== shot.compositing.mode || !ROUTES.has(route.primary_route) || !SHA256.test(route.route_plan_sha256)
      || !Array.isArray(route.route_plan) || !route.route_plan.length) fail('invalid_route_plan', 'M10 shot route does not match its visual contract.', shotId);
    return route;
  });
  if (routes.every((route) => route.primary_route === 'hyperframes-native')) fail('native_default', 'M10 composition cannot be built from whole-film native-only primary routes.');
  return { ...document, routes };
}

function grammarPalette(family, route) {
  const base = {
    quote: ['#101820', '#f2c94c', '#f8f4e8'],
    'data-relationship': ['#071a22', '#56ccf2', '#c8f7ff'],
    contrast: ['#18120f', '#eb5757', '#f2f2f2'],
    case: ['#101512', '#6fcf97', '#eef8f0'],
    process: ['#0d1117', '#2f80ed', '#eef4ff'],
    'emotion-turn': ['#17151f', '#bb6bd9', '#fff3d8'],
    'action-close': ['#11140f', '#f2994a', '#f4ffee'],
    evidence: ['#111316', '#bdbdbd', '#ffffff'],
    custom: ['#111827', '#7dd3fc', '#f8fafc'],
  }[family] ?? ['#111827', '#7dd3fc', '#f8fafc'];
  if (route === 'user-media') return [base[0], '#27ae60', base[2]];
  if (route === 'pexels') return [base[0], '#2d9cdb', base[2]];
  if (route === 'image-generation') return [base[0], '#f2c94c', base[2]];
  return base;
}

function shotShape(family) {
  if (family === 'quote' || family === 'action-close') return 'typographic';
  if (family === 'contrast') return 'split';
  if (family === 'data-relationship' || family === 'evidence') return 'evidence';
  if (family === 'process') return 'flow';
  if (family === 'emotion-turn') return 'turn';
  return 'scene';
}

function clipFrom(shot, route, startSec) {
  const palette = grammarPalette(shot.visual_grammar.family, route.primary_route);
  return {
    shot_id: shot.shot_id,
    start_sec: startSec,
    duration_sec: shot.duration_ms / 1000,
    primary_route: route.primary_route,
    primary_role: route.primary_role,
    visual_grammar_family: shot.visual_grammar.family,
    compositing_mode: shot.compositing.mode,
    shape: shotShape(shot.visual_grammar.family),
    palette,
    material_roles: shot.material_roles.map((role) => role.role),
    fusion_mode: shot.frame_fusion.mode,
    reference_policy: shot.reference_use.selection_policy,
    screen_text: shot.visual_grammar.screen_text,
    agent_choice_reason: shot.visual_grammar.agent_choice_reason,
    motion_key_action: shot.motion.key_action,
    readable_outcome: shot.information_intent.readable_outcome,
  };
}

export function buildM10Composition(visualContractInput, routePlanInput, target = { width: 1920, height: 1080, fps: 30 }) {
  const visualContract = validateVisualContract(visualContractInput);
  const routePlan = validateRoutePlan(routePlanInput, visualContract);
  const frame = canvas(target);
  let cursor = 0;
  const clips = visualContract.shots.map((shot, index) => {
    const clip = clipFrom(shot, routePlan.routes[index], cursor);
    cursor += clip.duration_sec;
    return clip;
  });
  const core = {
    schema_version: 1,
    render_mode: 'm10-contract-composition',
    visual_contract_sha256: visualContract.visual_contract_sha256,
    route_plan_sha256: routePlan.route_plan_sha256,
    canvas: frame,
    master_duration_sec: cursor,
    clip_count: clips.length,
    clips,
    limitations: ['asset-route-plan-only-no-frozen-media'],
  };
  return { ...core, composition_sha256: fingerprintRenderValue(core) };
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function runtimeFontPackage(document) {
  if (!document || document.schema_version !== 2 || !document.display_selection || !Array.isArray(document.fonts) || !document.fonts.length) fail('display_font_selection_required', 'A prepared package with one selected user-provided display font is required.');
  required(document.display_selection, ['schema_version', 'primary_visual_dna', 'display_font_id', 'display_text'], 'font_package_invalid', 'Prepared display font selection is invalid.');
  if (document.display_selection.schema_version !== 1 || typeof document.display_selection.display_font_id !== 'string' || !document.display_selection.display_font_id || typeof document.display_selection.display_text !== 'string' || !document.display_selection.display_text.trim()) fail('font_package_invalid', 'Prepared display font selection is invalid.');
  const roles = new Set();
  const fonts = document.fonts.map((font) => {
    required(font, ['font_id', 'role', 'family', 'weight', 'style', 'file_sha256', 'file_kind', 'css'], 'font_package_invalid', 'Prepared font package is invalid.');
    if (typeof font.role !== 'string' || !font.role || roles.has(font.role) || typeof font.family !== 'string' || !/^[\p{L}\p{N} ._-]+$/u.test(font.family)
      || scanRuntimeFontText(`font-family:${font.family};`) || !SHA256.test(font.file_sha256 ?? '') || !['ttf', 'otf', 'woff2'].includes(font.file_kind)
      || font.style !== 'normal' || !(Number.isSafeInteger(font.weight) || (typeof font.weight === 'string' && /^\d{3}(?: \d{3})?$/u.test(font.weight)))) fail('font_package_invalid', 'Prepared font package is invalid.');
    required(font.css, ['font_face', 'src', 'used', 'fallbacks'], 'font_package_invalid', 'Prepared font CSS binding is invalid.');
    if (font.css.font_face !== true || font.css.used !== true || !Array.isArray(font.css.fallbacks) || font.css.fallbacks.length
      || typeof font.css.src !== 'string' || !font.css.src.startsWith('./assets/fonts/') || font.css.src.includes('\\') || font.css.src.split('/').includes('..')
      || path.posix.normalize(font.css.src) !== font.css.src.slice(2)) fail('font_package_invalid', 'Prepared font CSS binding is invalid.');
    roles.add(font.role);
    return font;
  });
  const information = fonts.find((font) => font.role === 'information') ?? fonts[0];
  const display = fonts.find((font) => font.role === 'display');
  if (!display || display.font_id !== document.display_selection.display_font_id || fonts.filter((font) => font.role === 'display').length !== 1) fail('display_font_selection_mismatch', 'Display role must match exactly one selected user-provided display font.');
  return { fonts, information, display };
}

function fontFaceCss(fonts) {
  const format = { ttf: 'truetype', otf: 'opentype', woff2: 'woff2' };
  return fonts.map((font) => `@font-face { font-family: "${font.family}"; src: url("${font.css.src}") format("${format[font.file_kind]}"); font-style: ${font.style}; font-weight: ${font.weight}; font-display: block; }`).join('\n      ');
}

function number(value) {
  return Number(value.toFixed(3));
}

function routeLayer(clip) {
  if (clip.primary_route === 'user-media') return '<div class="media-frame user" data-route-layer="user-media"></div>';
  if (clip.primary_route === 'pexels') return '<div class="media-frame pexels" data-route-layer="pexels"></div>';
  if (clip.primary_route === 'image-generation') return '<div class="media-frame generated" data-route-layer="image-generation"></div>';
  return '<div class="native-support" data-route-layer="native-support"></div>';
}

function shapeMarkup(clip) {
  if (clip.shape === 'typographic') return '<div class="type-lockup"><b></b><i></i><span></span></div>';
  if (clip.shape === 'split') return '<div class="split-field"><b></b><i></i></div>';
  if (clip.shape === 'evidence') return '<div class="evidence-stack"><b></b><i></i><em></em></div>';
  if (clip.shape === 'flow') return '<div class="flow-line"><b></b><i></i><em></em><strong></strong></div>';
  if (clip.shape === 'turn') return '<div class="turn-ring"><b></b><i></i></div>';
  return '<div class="scene-field"><b></b><i></i><em></em></div>';
}

export function renderM10Html(composition, fontPackage) {
  const { canvas: frame } = composition;
  const runtimeFonts = runtimeFontPackage(fontPackage);
  const clips = composition.clips.map((clip) => {
    const [bg, accent, ink] = clip.palette;
    const displayId = escapeHtml(runtimeFonts.display.font_id);
    const label = clip.screen_text ? `<p class="screen-text" data-font-role="emphasis" data-display-font-id="${displayId}">${escapeHtml(clip.screen_text)}</p>` : `<p class="screen-text" data-font-role="emphasis" data-display-font-id="${displayId}">重点</p>`;
    const meta = `${escapeHtml(clip.visual_grammar_family)} / ${escapeHtml(clip.primary_route)} / ${escapeHtml(clip.compositing_mode)}`;
    return `<section id="${clip.shot_id}" class="clip shot grammar-${clip.visual_grammar_family} route-${clip.primary_route} comp-${clip.compositing_mode}" data-start="${number(clip.start_sec)}" data-duration="${number(clip.duration_sec)}" style="--bg:${bg};--accent:${accent};--ink:${ink};--shot-duration:${number(clip.duration_sec)}s">
        <div class="backdrop" data-layout-ignore></div>
        ${routeLayer(clip)}
        <div class="semantic-shape" aria-hidden="true">${shapeMarkup(clip)}</div>
        <div class="outcome"><small data-font-role="chapter-focus" data-display-font-id="${displayId}">${meta}</small><span class="shot-index" data-font-role="core-number" data-display-font-id="${displayId}">${escapeHtml(clip.shot_id.slice(1))}</span>${label}<h2 data-font-role="key-quote" data-display-font-id="${displayId}">${escapeHtml(clip.readable_outcome)}</h2></div>
      </section>`;
  }).join('\n      ');
  const timelineClips = JSON.stringify(composition.clips.map((clip) => ({
    id: clip.shot_id,
    start: number(clip.start_sec),
    duration: number(clip.duration_sec),
    shape: clip.shape,
  })));

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${frame.width}, height=${frame.height}" />
    <title>M10 contract-driven B-roll</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      ${fontFaceCss(runtimeFonts.fonts)}
      * { box-sizing: border-box; }
      html, body { margin: 0; width: ${frame.width}px; height: ${frame.height}px; overflow: hidden; background: #05070a; font-family: "${runtimeFonts.information.family}"; }
      #root { position: relative; width: ${frame.width}px; height: ${frame.height}px; overflow: hidden; background: #05070a; color: white; }
      .clip { visibility: hidden; }
      .shot { position: absolute; inset: 0; overflow: hidden; opacity: 0; background: var(--bg); color: var(--ink); }
      .backdrop { position: absolute; inset: -8%; background: linear-gradient(125deg, color-mix(in srgb, var(--bg) 86%, #000), var(--bg) 50%, color-mix(in srgb, var(--accent) 24%, #05070a)); }
      .media-frame { position: absolute; inset: 8% 8% 11% 8%; border: 2px solid color-mix(in srgb, var(--accent) 68%, white); background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 16%, #111), transparent 62%), repeating-linear-gradient(90deg, transparent 0 42px, color-mix(in srgb, var(--accent) 18%, transparent) 42px 44px); box-shadow: 0 28px 90px rgba(0,0,0,.38); }
      .media-frame.user { clip-path: polygon(0 0, 84% 0, 100% 18%, 100% 100%, 0 100%); }
      .media-frame.pexels { border-radius: 2px; filter: saturate(1.08); }
      .media-frame.generated { border-radius: 40px 4px 40px 4px; }
      .native-support { position: absolute; inset: 13% 15%; border: 2px dashed color-mix(in srgb, var(--accent) 72%, white); background: radial-gradient(circle at 30% 42%, color-mix(in srgb, var(--accent) 32%, transparent), transparent 34%); }
      .semantic-shape { position: absolute; inset: 15% 16% 20%; display: grid; place-items: center; }
      .type-lockup { width: 52%; height: 44%; display: grid; gap: 24px; }
      .type-lockup b, .type-lockup i, .type-lockup span { display: block; height: 34%; background: var(--accent); box-shadow: 0 0 36px color-mix(in srgb, var(--accent) 55%, transparent); }
      .type-lockup i { width: 74%; background: color-mix(in srgb, var(--ink) 84%, var(--accent)); }
      .type-lockup span { width: 42%; }
      .split-field { width: 70%; height: 58%; display: grid; grid-template-columns: 1fr 1fr; gap: 42px; }
      .split-field b, .split-field i { display: block; border: 4px solid var(--accent); background: color-mix(in srgb, var(--accent) 20%, transparent); }
      .evidence-stack { width: 56%; height: 60%; display: grid; gap: 20px; }
      .evidence-stack b, .evidence-stack i, .evidence-stack em { display: block; border: 2px solid color-mix(in srgb, var(--accent) 68%, white); background: rgba(255,255,255,.08); }
      .flow-line { width: 74%; height: 18%; display: grid; grid-template-columns: repeat(4, 1fr); align-items: center; gap: 34px; }
      .flow-line b, .flow-line i, .flow-line em, .flow-line strong { display: block; aspect-ratio: 1; border-radius: 50%; background: var(--accent); box-shadow: 0 0 42px color-mix(in srgb, var(--accent) 52%, transparent); }
      .turn-ring { width: 38%; aspect-ratio: 1; border: 12px solid color-mix(in srgb, var(--accent) 74%, white); border-radius: 50%; display: grid; place-items: center; }
      .turn-ring b { display: block; width: 48%; aspect-ratio: 1; border-radius: 50%; background: var(--accent); }
      .scene-field b, .scene-field i, .scene-field em { display: block; position: absolute; width: 180px; height: 180px; background: var(--accent); }
      .scene-field i { transform: translate(210px, 96px) scale(.72); opacity: .76; }
      .scene-field em { transform: translate(-220px, 110px) scale(.52); opacity: .54; }
      .outcome { position: absolute; left: 8%; right: 8%; bottom: 7%; display: grid; gap: 12px; max-width: 72%; }
      [data-font-role] { font-family: "${runtimeFonts.display.family}"; }
      .outcome small { font-size: 24px; line-height: 1.2; color: color-mix(in srgb, var(--ink) 72%, var(--accent)); }
      .shot-index { position: absolute; right: 0; bottom: 0; font-size: 30px; letter-spacing: .08em; color: color-mix(in srgb, var(--ink) 68%, var(--accent)); }
      .screen-text { margin: 0; width: fit-content; max-width: 800px; padding: 9px 14px; font-size: 34px; line-height: 1.1; color: #05070a; background: var(--accent); }
      .outcome h2 { margin: 0; max-width: 1040px; font-family: "${runtimeFonts.display.family}"; font-size: 48px; line-height: 1.06; font-weight: 760; letter-spacing: 0; }
      .comp-speaker-context-return .outcome, .comp-speaker-hard-alpha-overlay .outcome, .comp-speaker-split-screen .outcome { left: 44%; max-width: 48%; }
      .comp-speaker-split-screen .media-frame, .comp-speaker-context-return .media-frame { left: 5%; right: 54%; }
      .comp-local-component .semantic-shape { inset: 10% 8% 24% 48%; }
      .comp-light-pass-support .backdrop { mix-blend-mode: screen; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-width="${frame.width}" data-height="${frame.height}" data-duration="${number(composition.master_duration_sec)}" data-fps="${frame.fps}" data-m10-composition="${composition.composition_sha256}">
      ${clips}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      const tl = gsap.timeline({ paused: true });
      const clips = ${timelineClips};
      clips.forEach((clip, index) => {
        const shot = document.getElementById(clip.id);
        const enter = Math.min(.62, clip.duration * .24);
        tl.set(shot, { opacity: 0 }, Math.max(0, clip.start - .001));
        tl.to(shot, { opacity: 1, duration: .12, ease: 'none' }, clip.start);
        tl.fromTo(shot.querySelector('.backdrop'), { scale: 1.05, x: -24 }, { scale: 1.12, x: 24, duration: clip.duration, ease: 'sine.inOut' }, clip.start);
        tl.fromTo(shot.querySelector('.media-frame, .native-support'), { opacity: .42, y: 54, scale: .96 }, { opacity: 1, y: 0, scale: 1, duration: enter, ease: 'power3.out' }, clip.start + .05);
        shot.querySelectorAll('.semantic-shape b, .semantic-shape i, .semantic-shape em, .semantic-shape strong, .semantic-shape span').forEach((node, nodeIndex) => {
          tl.fromTo(node, { opacity: .12, y: 52, scale: .72 }, { opacity: 1, y: 0, scale: 1, duration: Math.max(.24, enter), ease: 'power3.out' }, clip.start + .12 + nodeIndex * .08);
          tl.to(node, { y: -10 - nodeIndex * 2, duration: Math.max(.3, clip.duration - enter), ease: 'sine.inOut' }, clip.start + enter);
        });
        const outcomeAt = clip.start + Math.min(Math.max(enter, clip.duration * .32), clip.duration * .42);
        tl.fromTo(shot.querySelector('.outcome'), { opacity: 0, y: 28 }, { opacity: 1, y: 0, duration: Math.min(.42, clip.duration * .2), ease: 'power2.out' }, outcomeAt);
        tl.to(shot, { opacity: 0, duration: .1, ease: 'none' }, clip.start + clip.duration - .1);
      });
      window.__timelines.main = tl;
    </script>
  </body>
</html>
`;
  try { auditDisplayFontRoleBindings(html, fontPackage); } catch (error) { fail(error?.code ?? 'display_font_runtime_invalid', 'Rendered display font bindings are invalid.'); }
  return html;
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

async function verifyPreparedFonts(outputDir, fontPackage) {
  const runtime = runtimeFontPackage(fontPackage);
  for (const font of runtime.fonts) {
    const relative = font.css.src.slice(2);
    const absolute = path.resolve(outputDir, ...relative.split('/'));
    if (!absolute.startsWith(`${path.resolve(outputDir)}${path.sep}`)) fail('font_asset_missing', 'Prepared font path escapes the generated project.');
    let stat;
    try { stat = await fs.lstat(absolute); } catch { fail('font_asset_missing', 'Prepared font bytes are missing from the generated project.'); }
    if (!stat.isFile() || stat.isSymbolicLink()) fail('font_asset_missing', 'Prepared font must be a regular project-local file.');
    const bytes = await fs.readFile(absolute);
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== font.file_sha256) fail('font_asset_mismatch', 'Prepared font bytes do not match the font package.');
  }
  return runtime;
}

export async function writeM10Project(outputDir, composition, { fontPackage } = {}) {
  if (typeof outputDir !== 'string' || !outputDir) fail('invalid_output', 'Output directory is invalid.');
  const { composition_sha256, ...core } = composition ?? {};
  if (!SHA256.test(composition?.composition_sha256) || fingerprintRenderValue(core) !== composition.composition_sha256) fail('composition_tampered', 'M10 composition fingerprint is invalid.');
  try {
    const entries = await fs.readdir(outputDir);
    if (entries.some((entry) => entry !== 'assets')) fail('output_not_empty', 'Output directory contains files outside the prepared font assets.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await fs.mkdir(outputDir, { recursive: true });
  await verifyPreparedFonts(outputDir, fontPackage);
  await Promise.all([
    fs.writeFile(path.join(outputDir, 'index.html'), renderM10Html(composition, fontPackage), 'utf8'),
    fs.writeFile(path.join(outputDir, 'index.motion.json'), `${JSON.stringify(motionContract(composition), null, 2)}\n`, 'utf8'),
    fs.writeFile(path.join(outputDir, 'meta.json'), `${JSON.stringify({ name: 'erduo-hyperframes-broll-m10', composition_sha256: composition.composition_sha256, limitations: composition.limitations }, null, 2)}\n`, 'utf8'),
    fs.writeFile(path.join(outputDir, 'hyperframes.json'), `${JSON.stringify({ $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json', paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' }, media: { autoProxy: true } }, null, 2)}\n`, 'utf8'),
    fs.writeFile(path.join(outputDir, 'package.json'), `${JSON.stringify({ name: 'erduo-hyperframes-broll-m10', private: true, type: 'module', scripts: { check: 'npx --yes hyperframes@0.7.64 check', render: 'npx --yes hyperframes@0.7.64 render' } }, null, 2)}\n`, 'utf8'),
  ]);
  return composition;
}

export function parseM10Args(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  if (argv.length !== 4 || argv.some((arg) => arg.startsWith('-'))) return { error: true };
  return { visualContract: argv[0], routePlan: argv[1], fontPackage: argv[2], outputDir: argv[3] };
}

export async function runM10Cli(argv, adapters = {}) {
  const stdout = adapters.stdout ?? process.stdout;
  const stderr = adapters.stderr ?? process.stderr;
  const readFile = adapters.readFile ?? fs.readFile;
  const writeProject = adapters.writeProject ?? writeM10Project;
  const args = parseM10Args(argv);
  if (args.help) {
    stdout.write('Usage: node scripts/build-m10-composition.mjs <validated-visual-contract.json> <m10-route-plan.json> <font-package.json> <prepared-output-dir>\n');
    return 0;
  }
  if (args.error) {
    stderr.write('build-m10-composition: invalid arguments (use --help)\n');
    return 64;
  }
  try {
    const [visualContractText, routePlanText, fontPackageText] = await Promise.all([readFile(args.visualContract, 'utf8'), readFile(args.routePlan, 'utf8'), readFile(args.fontPackage, 'utf8')]);
    const composition = buildM10Composition(JSON.parse(visualContractText), JSON.parse(routePlanText));
    await writeProject(args.outputDir, composition, { fontPackage: JSON.parse(fontPackageText) });
    stdout.write(`${JSON.stringify(composition)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof M10CompositionError) {
      stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code, message: error.message } })}\n`);
      return 2;
    }
    stderr.write(`${JSON.stringify({ ok: false, error: { code: 'build_failed', message: 'M10 composition could not be built.' } })}\n`);
    return 3;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) process.exitCode = await runM10Cli(process.argv.slice(2));
