import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_FINDINGS = 512;
const VISIBLE_UNICODE_ESCAPE = /\\u[0-9a-fA-F]{4}/u;

export class RenderSourceError extends Error {
  constructor(code, message) { super(message); this.name = 'RenderSourceError'; this.code = code; }
}

const fail = (code, message) => { throw new RenderSourceError(code, message); };

async function htmlFiles(root, current = root, output = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const target = path.join(current, entry.name);
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) fail('source_symlink_forbidden', 'Render source must not contain symlinked HTML.');
    if (entry.isDirectory()) await htmlFiles(root, target, output);
    else if (entry.isFile() && entry.name.endsWith('.html')) output.push(target);
  }
  return output;
}

function withoutCodeAndStyles(html) {
  return html
    .replace(/<!--[^]*?-->/gu, '')
    .replace(/<script\b[^>]*>[^]*?<\/script>/giu, '')
    .replace(/<style\b[^>]*>[^]*?<\/style>/giu, '');
}

function visibleTextHasEscape(html) {
  const visible = withoutCodeAndStyles(html);
  for (const match of visible.matchAll(/>([^<]+)</gu)) if (VISIBLE_UNICODE_ESCAPE.test(match[1])) return true;
  return false;
}

function idsAndTargets(html) {
  const ids = [];
  for (const match of html.matchAll(/(?:^|[\s<])id\s*=\s*["']([^"']+)["']/giu)) ids.push(match[1]);
  const targets = [];
  const selector = /(?:\bgsap|\b[A-Za-z_$][\w$]*)\.(?:to|fromTo|set)\(\s*(["'])([^"']+)\1/gu;
  for (const match of html.matchAll(selector)) for (const id of match[2].matchAll(/#([A-Za-z_][\w:-]*)/gu)) targets.push(id[1]);
  return { ids, targets };
}

function terminalScaleZero(html) {
  const matches = [];
  const fromTo = /\.fromTo\(\s*["']#([^"']+)["']\s*,\s*\{[^}]*\}\s*,\s*\{([^}]*)\}/gu;
  for (const match of html.matchAll(fromTo)) {
    if (/(?:^|,)\s*scale\s*:\s*0(?:\.0+)?\s*(?:,|$)/u.test(match[2])) matches.push(match[1]);
  }
  return matches;
}

function tooSmallType(html) {
  const height = Number(html.match(/\bdata-height\s*=\s*["'](\d+)["']/u)?.[1] ?? 1080);
  const minimum = Math.max(18, height / 60);
  const sizes = [...html.matchAll(/font-size\s*:\s*([0-9]+(?:\.[0-9]+)?)px/giu)].map((match) => Number(match[1]));
  return { height, minimum, sizes: [...new Set(sizes.filter((size) => size < minimum))].sort((a, b) => a - b) };
}

export async function validateRenderSource(projectRoot) {
  if (typeof projectRoot !== 'string' || !projectRoot.trim()) fail('project_root_required', 'A render project root is required.');
  const root = path.resolve(projectRoot);
  const files = (await htmlFiles(root)).sort();
  if (!files.length) fail('html_source_missing', 'Render project contains no HTML source.');
  const findings = [];
  const add = (finding) => { if (findings.length < MAX_FINDINGS) findings.push(finding); };

  for (const file of files) {
    const relative_file = path.relative(root, file).split(path.sep).join('/');
    const html = await readFile(file, 'utf8');
    if (visibleTextHasEscape(html)) add({ code: 'visible_unicode_escape', severity: 'error', relative_file, message: 'Visible HTML contains a literal Unicode escape instead of rendered text.' });

    const { ids, targets } = idsAndTargets(html);
    const seen = new Set();
    for (const id of ids) {
      if (seen.has(id)) add({ code: 'duplicate_dom_id', severity: 'error', relative_file, element_id: id, message: 'HTML contains a duplicate DOM id.' });
      seen.add(id);
    }
    for (const target of new Set(targets)) if (!seen.has(target)) add({ code: 'orphan_animation_target', severity: 'error', relative_file, element_id: target, message: 'Animation targets a missing DOM id.' });
    for (const target of terminalScaleZero(html)) add({ code: 'invisible_fromto_result', severity: 'error', relative_file, element_id: target, message: 'fromTo ends at scale zero, so the result remains invisible.' });

    const type = tooSmallType(html);
    if (type.sizes.length) add({ code: 'below_minimum_type', severity: 'error', relative_file, minimum_px: Number(type.minimum.toFixed(1)), found_px: type.sizes, message: 'Visible type is too small for the target raster.' });
  }

  return {
    schema_version: 1,
    criteria_version: 'render-source-gate.v1',
    status: findings.length ? 'revision_required' : 'approved',
    html_file_count: files.length,
    findings,
  };
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index]?.startsWith('--') || !argv[index + 1]) return null;
    values.set(argv[index], argv[index + 1]);
  }
  if (!values.has('--project')) return null;
  return { project: values.get('--project'), output: values.get('--output') };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options) { process.stderr.write('Usage: node validate-render-source.mjs --project <project> [--output report.json]\n'); process.exitCode = 2; return; }
  const report = await validateRenderSource(options.project);
  const text = `${JSON.stringify(report, null, 2)}\n`;
  if (options.output) await writeFile(options.output, text); else process.stdout.write(text);
  if (report.status !== 'approved') process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => { process.stderr.write(`${error.code ?? 'render_source_failed'}: ${error.message}\n`); process.exitCode = 1; });
}
