#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function usage() {
  return `Usage:
  node scripts/remotion-dom-trace.mjs --project <remotion-project> --url <http://127.0.0.1:port/trace.html> --output <new.json> --identity <64-hex> [--browser <chrome>] [--metadata <json>]

The loaded page must expose window.__ERDUO_REMOTION_TRACE__ with metadata and
an async seek(frame) function. Mark real rendered DOM elements with
data-erduo-trace-id, data-erduo-role, data-erduo-focus-group,
data-erduo-layer, and data-erduo-visual-weight. The runner reads actual
getBoundingClientRect() values after every requested Remotion frame settles.
Canvas/WebGL internals are not inferred by this adapter.`;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    const key = { '--project': 'project', '--url': 'url', '--output': 'output', '--identity': 'identity', '--browser': 'browser', '--metadata': 'metadata' }[argument];
    if (!key) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    options[key] = value;
    index += 1;
  }
  for (const required of ['project', 'url', 'output', 'identity']) if (!options[required]) throw new Error(`Missing --${required}`);
  if (!/^https?:\/\/127\.0\.0\.1(?::[0-9]+)?\//u.test(options.url)) throw new Error('--url must use loopback HTTP');
  if (!/^[0-9a-f]{64}$/u.test(options.identity)) throw new Error('--identity must be a SHA-256');
  return options;
}

function defaultBrowser() {
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return 'google-chrome';
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateMetadata(metadata) {
  if (!isRecord(metadata)) throw new Error('Trace page metadata must be an object');
  for (const key of ['compositionId', 'fps', 'width', 'height', 'startFrame', 'endFrame', 'safeArea', 'shots']) {
    if (metadata[key] === undefined) throw new Error(`Trace page metadata is missing ${key}`);
  }
  if (![metadata.fps, metadata.width, metadata.height, metadata.startFrame, metadata.endFrame].every(Number.isInteger)) throw new Error('Trace page frame and canvas metadata must be integers');
  if (metadata.endFrame <= metadata.startFrame) throw new Error('Trace page frame window is invalid');
}

function sourceMapGetter() {
  return null;
}

export async function captureRemotionDomTrace({ project, url, output, identity, browserExecutable = defaultBrowser(), metadataFile, rendererModule }) {
  const target = path.resolve(output);
  const stats = await lstat(path.dirname(target));
  if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('Output parent must be a real directory');
  try {
    await lstat(target);
    throw new Error('Output must not exist');
  } catch (error) {
    if (error.message === 'Output must not exist') throw error;
    if (error.code !== 'ENOENT') throw error;
  }
  const projectRoot = path.resolve(project);
  const projectStats = await lstat(projectRoot);
  if (!projectStats.isDirectory() || projectStats.isSymbolicLink()) throw new Error('Project must be a real directory');
  const renderer = rendererModule ?? createRequire(path.join(projectRoot, 'package.json'))('@remotion/renderer');
  const browser = await renderer.openBrowser('chrome', {
    browserExecutable,
    logLevel: 'error',
    chromiumOptions: { headless: true, ignoreCertificateErrors: false },
  });
  let page;
  try {
    page = await browser.newPage({
      context: sourceMapGetter, logLevel: 'error', indent: false, pageIndex: 0,
      onBrowserLog: null, onLog: () => undefined,
    });
    await page.goto({ url, timeout: 30000, options: { timeout: 30000 } });
    const pageMetadata = await page.evaluate(() => window.__ERDUO_REMOTION_TRACE__?.metadata ?? null);
    const metadata = metadataFile ? JSON.parse(await readFile(path.resolve(metadataFile), 'utf8')) : pageMetadata;
    validateMetadata(metadata);
    if (metadataFile && JSON.stringify(metadata) !== JSON.stringify(pageMetadata)) throw new Error('External metadata does not match the trace page');
    const shotByFrame = new Map();
    for (const shot of metadata.shots) for (let frame = shot.startFrame; frame < shot.endFrame; frame += 1) shotByFrame.set(frame, shot.shotId);
    const elementsByShot = new Map(metadata.shots.map((shot) => [shot.shotId, new Map()]));
    for (let frame = metadata.startFrame; frame < metadata.endFrame; frame += 1) {
      const records = await page.evaluate(async (requestedFrame) => {
        const contract = window.__ERDUO_REMOTION_TRACE__;
        if (!contract || typeof contract.seek !== 'function') throw new Error('Trace page has no seek(frame) contract');
        await contract.seek(requestedFrame);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const canvas = document.querySelector('[data-erduo-trace-canvas]');
        if (!canvas) throw new Error('Trace page has no data-erduo-trace-canvas root');
        const canvasRect = canvas.getBoundingClientRect();
        return [...canvas.querySelectorAll('[data-erduo-trace-id]')].map((element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const visibleWidth = Math.max(0, Math.min(rect.right, canvasRect.right) - Math.max(rect.left, canvasRect.left));
          const visibleHeight = Math.max(0, Math.min(rect.bottom, canvasRect.bottom) - Math.max(rect.top, canvasRect.top));
          const area = rect.width * rect.height;
          const visibleAreaRatio = area > 0 ? (visibleWidth * visibleHeight) / area : 0;
          const opacity = Number(style.opacity);
          return {
            id: element.dataset.erduoTraceId,
            role: element.dataset.erduoRole,
            focusGroup: element.dataset.erduoFocusGroup,
            layer: Number(element.dataset.erduoLayer),
            visualWeight: Number(element.dataset.erduoVisualWeight),
            safeAreaPolicy: element.dataset.erduoSafeArea ?? undefined,
            allowOverlapWith: (element.dataset.erduoAllowOverlap ?? '').split(',').map((item) => item.trim()).filter(Boolean),
            motions: JSON.parse(element.dataset.erduoMotions ?? '[]'),
            sample: {
              frame: requestedFrame, x: rect.left - canvasRect.left, y: rect.top - canvasRect.top,
              width: rect.width, height: rect.height, opacity, zIndex: Number(style.zIndex) || 0,
              visible: style.display !== 'none' && style.visibility !== 'hidden' && opacity > 0 && rect.width > 0 && rect.height > 0,
              clipped: visibleAreaRatio < 0.999, visibleAreaRatio,
            },
          };
        });
      }, frame);
      const shotId = shotByFrame.get(frame);
      if (!shotId) throw new Error(`No shot owns frame ${frame}`);
      const shotElements = elementsByShot.get(shotId);
      for (const record of records) {
        if (!record.id || !record.role || !record.focusGroup || !Number.isInteger(record.layer) || !Number.isFinite(record.visualWeight)) throw new Error(`Frame ${frame} has incomplete trace metadata`);
        const existing = shotElements.get(record.id);
        if (existing && (existing.role !== record.role || existing.focusGroup !== record.focusGroup || existing.layer !== record.layer || existing.visualWeight !== record.visualWeight)) throw new Error(`Element metadata drifts for ${record.id}`);
        const element = existing ?? { id: record.id, role: record.role, focusGroup: record.focusGroup, layer: record.layer, visualWeight: record.visualWeight, safeAreaPolicy: record.safeAreaPolicy, allowOverlapWith: record.allowOverlapWith, motions: record.motions, samples: [] };
        element.samples.push(record.sample);
        shotElements.set(record.id, element);
      }
    }
    const trace = {
      schemaVersion: '1.0.0', runtime: 'remotion', compositionId: metadata.compositionId,
      compositionIdentity: identity,
      capture: { mode: 'rendered-dom-geometry', source: 'remotion-dom-trace:getBoundingClientRect' },
      fps: metadata.fps, width: metadata.width, height: metadata.height,
      startFrame: metadata.startFrame, endFrame: metadata.endFrame, frameStep: 1,
      safeArea: metadata.safeArea,
      shots: metadata.shots.map((shot) => ({ ...shot, elements: [...elementsByShot.get(shot.shotId).values()] })),
    };
    await writeFile(target, `${JSON.stringify(trace)}\n`, { flag: 'wx', mode: 0o600 });
    return trace;
  } finally {
    if (page) await page.close().catch(() => undefined);
    await browser.close({ silent: true });
  }
}

async function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}\n`); process.exitCode = 2; return;
  }
  if (options.help) { process.stdout.write(`${usage()}\n`); return; }
  try {
    const trace = await captureRemotionDomTrace({ project: options.project, url: options.url, output: options.output, identity: options.identity, browserExecutable: options.browser, metadataFile: options.metadata });
    process.stdout.write(`${JSON.stringify({ status: 'captured', frames: trace.endFrame - trace.startFrame, shots: trace.shots.length, output: path.basename(options.output) })}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`); process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
