#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_UPSTREAM_COMMIT = '41ee360d82f4c491ba9d88a24a4add7d8ff1cf8b';
const UPSTREAM_REPOSITORY = 'https://github.com/Vincentwei1021/video-shotcraft';
const EXPECTED_CARD_COUNT = 152;
const ALLOWED_SOURCE = /^(?:demos\/.+\.tsx|demos\/_textures\/live-layout\.json|template\/src\/.+\.(?:ts|tsx|json))$/u;
const DIRECT_TEMPLATE_REFERENCE = /template\/src\/[A-Za-z0-9_./-]+\.(?:tsx|ts|json)/gu;

function fail(message) {
  process.stderr.write(`sync-video-shotcraft-remotion: ${message}\n`);
  process.exit(1);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (!['--source', '--destination'].includes(option)) fail(`unknown argument: ${option}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`${option} requires a path`);
    result[option.slice(2)] = value;
    index += 1;
  }
  if (!result.source) fail('--source <video-shotcraft checkout> is required');
  return result;
}

function portable(...parts) {
  return parts.join('/');
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`cannot parse ${file}: ${error.message}`);
  }
}

function strictlyWithin(parent, child) {
  const pathFromParent = relative(parent, child);
  return pathFromParent !== ''
    && !isAbsolute(pathFromParent)
    && pathFromParent !== '..'
    && !pathFromParent.startsWith(`..${sep}`);
}

function requireRealDirectory(directory, parent, label) {
  let info;
  let canonical;
  try {
    info = lstatSync(directory);
    canonical = realpathSync(directory);
  } catch (error) {
    fail(`${label} is missing or cannot be inspected: ${error.message}`);
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    fail(`${label} must be a real directory`);
  }
  if (!strictlyWithin(parent, canonical)) fail(`${label} resolves outside its parent`);
  return canonical;
}

function listFiles(root, prefix) {
  const base = join(root, prefix);
  return readdirSync(base, { recursive: true })
    .map(String)
    .filter((entry) => lstatSync(join(base, entry)).isFile())
    .map((entry) => portable(prefix, entry.split(sep).join('/')))
    .sort();
}

function assertRegularSource(sourceRoot, sourceRelative) {
  const sourcePath = resolve(sourceRoot, ...sourceRelative.split('/'));
  const expectedPrefix = `${realpathSync(sourceRoot)}${sep}`;
  let info;
  let canonical;
  try {
    info = lstatSync(sourcePath);
    canonical = realpathSync(sourcePath);
  } catch (error) {
    fail(`cannot inspect ${sourceRelative}: ${error.message}`);
  }
  if (info.isSymbolicLink() || !info.isFile() || !canonical.startsWith(expectedPrefix)) {
    fail(`source must be a regular file inside checkout: ${sourceRelative}`);
  }
  return sourcePath;
}

const args = parseArgs(process.argv.slice(2));
const sourceRoot = resolve(args.source);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destinationRoot = resolve(args.destination ?? repoRoot);
const skillRoot = join(destinationRoot, 'erduo-broll-loop-engineering');
const shotcraftRoot = join(skillRoot, 'references', 'shotcraft');
const outputRoot = join(shotcraftRoot, 'remotion-sources');

if (!existsSync(join(sourceRoot, '.git'))) fail('--source must be a Git checkout');
if (!existsSync(join(skillRoot, 'SKILL.md'))) fail('destination Skill is missing');
const canonicalDestination = realpathSync(destinationRoot);
const canonicalSkill = requireRealDirectory(skillRoot, canonicalDestination, 'destination Skill');
requireRealDirectory(join(skillRoot, 'references'), canonicalSkill, 'destination references');
requireRealDirectory(shotcraftRoot, canonicalSkill, 'destination Shotcraft root');
if (existsSync(outputRoot)) requireRealDirectory(outputRoot, canonicalSkill, 'destination Remotion source root');

let commit;
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim();
} catch (error) {
  fail(`cannot inspect source commit: ${error.message}`);
}
if (commit !== EXPECTED_UPSTREAM_COMMIT) fail(`source commit ${commit} does not match pinned ${EXPECTED_UPSTREAM_COMMIT}`);
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
  cwd: sourceRoot,
  encoding: 'utf8',
}).trim();
if (dirty) fail('source checkout has tracked changes');

const catalog = readJson(join(shotcraftRoot, 'catalog.json'));
if (catalog.upstream?.commit !== commit || catalog.cards?.length !== EXPECTED_CARD_COUNT) {
  fail('destination card catalog does not match the pinned source');
}

const allUpstreamFiles = [
  ...listFiles(sourceRoot, 'demos'),
  ...listFiles(sourceRoot, 'template/src'),
];
const sourceFiles = allUpstreamFiles.filter((name) => ALLOWED_SOURCE.test(name));
const allCode = allUpstreamFiles.filter((name) => /\.(?:ts|tsx)$/u.test(name));
const omittedCode = allCode.filter((name) => !sourceFiles.includes(name));
if (omittedCode.length) fail(`unrecognized upstream source files: ${omittedCode.join(', ')}`);
if (!sourceFiles.includes('demos/_fixtures/Fixtures.tsx')
  || !sourceFiles.includes('demos/_fixtures/Motion.tsx')) {
  fail('required shared demo fixtures are missing');
}

const sourceSet = new Set(sourceFiles);
const cardMappings = catalog.cards.map((card) => {
  const demoPrefix = `demos/${card.category}/${card.name}/`;
  let directSources = sourceFiles.filter((name) => name.startsWith(demoPrefix));
  if (directSources.length === 0) {
    const cardPath = join(shotcraftRoot, ...card.localSource.split('/'));
    const markdown = readFileSync(cardPath, 'utf8');
    directSources = [...new Set(markdown.match(DIRECT_TEMPLATE_REFERENCE) ?? [])].sort();
  }
  if (directSources.length === 0) fail(`card has no Remotion reference source: ${card.name}`);
  for (const source of directSources) {
    if (!sourceSet.has(source)) fail(`card ${card.name} references unavailable source ${source}`);
  }
  return {
    name: card.name,
    category: card.category,
    sources: directSources.map((source) => portable('remotion-sources', source)),
  };
});

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

const records = sourceFiles.map((source) => {
  const sourcePath = assertRegularSource(sourceRoot, source);
  const targetPath = join(outputRoot, ...source.split('/'));
  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);
  const data = readFileSync(targetPath);
  return {
    source,
    upstreamUrl: `${UPSTREAM_REPOSITORY}/blob/${commit}/${source}`,
    target: portable('erduo-broll-loop-engineering', 'references', 'shotcraft', 'remotion-sources', source),
    bytes: statSync(targetPath).size,
    sha256: sha256(data),
  };
});

const index = {
  schemaVersion: 1,
  upstream: { repository: UPSTREAM_REPOSITORY, commit, license: 'Apache-2.0' },
  scope: 'Pinned Remotion TS/TSX reference implementations and non-media layout JSON. These are adaptation inputs, not preinstalled target-project components.',
  stats: { cards: cardMappings.length, sourceFiles: records.length },
  sharedSources: [
    'remotion-sources/demos/_fixtures/Fixtures.tsx',
    'remotion-sources/demos/_fixtures/Motion.tsx',
  ],
  cards: cardMappings,
};
const indexText = `${JSON.stringify(index, null, 2)}\n`;
writeFileSync(join(outputRoot, 'index.json'), indexText);

const sourceText = `# Pinned Remotion reference source\n\n`
  + `Source: \`${UPSTREAM_REPOSITORY}@${commit}\`\n\n`
  + `License: Apache-2.0. The complete license is shipped at \`third_party/licenses/video-shotcraft-APACHE-2.0.txt\`.\n\n`
  + `This directory contains byte-identical TS/TSX reference implementations, shared fixtures, and non-media layout JSON from the pinned source. It intentionally excludes screenshots, textures, audio, fonts, preview videos, and other media. A Remotion Builder may inspect only the selected card's indexed source and its recursively required local imports, then adapt it to frozen production assets. These files are reference source, not automatically registered project components or render witnesses.\n`;
writeFileSync(join(outputRoot, 'SOURCE.md'), sourceText);

const manifest = {
  schemaVersion: 1,
  upstream: { repository: UPSTREAM_REPOSITORY, commit, license: 'Apache-2.0' },
  stats: { cards: cardMappings.length, sourceFiles: records.length },
  index: {
    target: portable('erduo-broll-loop-engineering', 'references', 'shotcraft', 'remotion-sources', 'index.json'),
    bytes: Buffer.byteLength(indexText),
    sha256: sha256(indexText),
  },
  sourceDescription: {
    target: portable('erduo-broll-loop-engineering', 'references', 'shotcraft', 'remotion-sources', 'SOURCE.md'),
    bytes: Buffer.byteLength(sourceText),
    sha256: sha256(sourceText),
  },
  files: records,
};
writeFileSync(join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

process.stdout.write(`${JSON.stringify({
  status: 'synced',
  cards: cardMappings.length,
  sourceFiles: records.length,
  commit,
})}\n`);
