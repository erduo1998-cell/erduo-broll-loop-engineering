#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { lstat, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ADAPTER_VERSION = '1.0.0';
const SOURCE_REVISION = '41ee360d82f4c491ba9d88a24a4add7d8ff1cf8b';
const ROUNDING_POLICY = 'nearest-integer-half-up-absolute-boundaries';
const REQUIRED_PACKAGES = Object.freeze([
  'remotion',
  '@remotion/cli',
  'react',
  'react-dom',
  '@types/react',
  'typescript',
]);
const HTML_IN_CANVAS_CAPABILITY = 'effects.dom-pixel-postprocess';
const HTML_IN_CANVAS_MINIMUM = Object.freeze([4, 0, 455]);
const FILE_ROLES = new Set(['source', 'asset', 'font', 'config', 'lock']);
const CODE_EXTENSIONS = new Set(['.css', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const FONT_EXTENSIONS = new Set(['.otf', '.ttf', '.woff', '.woff2']);
const EXACT_SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const SAFE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;
const SAFE_SHOT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SAFE_COMPONENT = /^[A-Za-z][A-Za-z0-9_]*$/;
const SHA256 = /^[0-9a-f]{64}$/;
const FORBIDDEN_SOURCE = [
  ['Date.now', /\bDate\s*\.\s*now\s*\(/],
  ['new Date', /\bnew\s+Date\s*\(/],
  ['Math.random', /\bMath\s*\.\s*random\s*\(/],
  ['crypto randomness', /\b(?:crypto\s*\.\s*)?(?:getRandomValues|randomUUID)\s*\(/],
  ['timer', /\b(?:setTimeout|setInterval)\s*\(/],
  ['requestAnimationFrame', /\brequestAnimationFrame\s*\(/],
  ['ambient React state/effect', /\b(?:useState|useReducer|useEffect|useLayoutEffect)\s*\(/],
  ['render-time network request', /\b(?:fetch|XMLHttpRequest|WebSocket)\b/],
  ['CSS time animation', /(?:\b(?:animation|animationName|animationDuration|transition|transitionDuration)\s*:|@keyframes\b)/],
  ['Skill-directory production import', /\bfrom\s*['"][^'"]*references\/shotcraft\/remotion-sources\//],
];

function usage() {
  return `Usage:
  node scripts/remotion-verify.mjs --project <dir> --manifest <json> --expect <block|master> [--json]
  node scripts/remotion-verify.mjs ... --write-identity <new-json>
  node scripts/remotion-verify.mjs ... --identity <existing-json>

The verifier is read-only unless --write-identity is supplied. It never installs
dependencies, invokes Remotion, follows symlinks, or scans the project-root
node_modules directory. Keep render evidence outside project/.`;
}

function parseArgs(argv) {
  const options = { json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    const key = {
      '--project': 'project',
      '--manifest': 'manifest',
      '--expect': 'expect',
      '--identity': 'identity',
      '--write-identity': 'writeIdentity',
    }[argument];
    if (!key) throw new Error(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${argument}`);
    options[key] = value;
    index += 1;
  }
  if (options.help) return options;
  for (const required of ['project', 'manifest', 'expect']) {
    if (!options[required]) throw new Error(`Missing --${required}`);
  }
  if (!['block', 'master'].includes(options.expect)) {
    throw new Error('--expect must be block or master');
  }
  if (options.identity && options.writeIdentity) {
    throw new Error('--identity and --write-identity are mutually exclusive');
  }
  return options;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function safeRelative(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.includes('\\') &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

function mappedFrame(milliseconds, fps) {
  const numerator = milliseconds * fps + 500;
  if (!Number.isSafeInteger(numerator)) {
    throw new Error(`Unsafe frame conversion for ${milliseconds}ms at ${fps}fps`);
  }
  return Math.floor(numerator / 1000);
}

function addError(errors, condition, message) {
  if (!condition) errors.push(message);
}

function semverCore(version) {
  if (!EXACT_SEMVER.test(version ?? '')) return null;
  return version.split('-', 1)[0].split('.').map(Number);
}

function versionAtLeast(version, minimum) {
  const parsed = semverCore(version);
  if (!parsed) return false;
  for (let index = 0; index < minimum.length; index += 1) {
    if (parsed[index] > minimum[index]) return true;
    if (parsed[index] < minimum[index]) return false;
  }
  return true;
}

export function validateRemotionVersionPolicy(dependencies, manifestVersions, errors) {
  for (const [name, version] of Object.entries(dependencies)) {
    addError(errors, EXACT_SEMVER.test(version), `Dependency ${name} must use an exact semver`);
  }
  for (const name of REQUIRED_PACKAGES) {
    addError(errors, EXACT_SEMVER.test(dependencies[name] ?? ''), `Dependency ${name} must be present with an exact semver`);
  }
  addError(
    errors,
    dependencies.remotion === dependencies['@remotion/cli'],
    'remotion and @remotion/cli must use the same exact project-local version',
  );
  addError(
    errors,
    dependencies.react === dependencies['react-dom'],
    'react and react-dom must use the same exact project-local version',
  );
  if (isRecord(manifestVersions)) {
    const actualNames = Object.keys(dependencies).sort();
    const manifestNames = Object.keys(manifestVersions).sort();
    addError(errors, JSON.stringify(actualNames) === JSON.stringify(manifestNames), 'packageVersions must list exactly package.json dependencies and devDependencies');
    for (const name of actualNames) {
      addError(errors, manifestVersions[name] === dependencies[name], `packageVersions mismatch for ${name}`);
    }
  }
}

async function parseJson(filePath, label) {
  let text;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`${label} cannot be read: ${error.message}`);
  }
  try {
    return { value: JSON.parse(text), text };
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

export async function walkProject(root, current = root, found = [], errors = []) {
  const entries = await readdir(current, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join('/');
    if (current === root && entry.name === 'node_modules') continue;
    if (entry.isDirectory() && current === root && entry.name === '.git') continue;
    const stats = await lstat(absolute);
    if (stats.isSymbolicLink()) {
      errors.push(`Symlink is not allowed in project closure: ${relative}`);
      continue;
    }
    if (stats.isDirectory()) {
      await walkProject(root, absolute, found, errors);
    } else if (stats.isFile()) {
      found.push(relative);
    } else {
      errors.push(`Special file is not allowed in project closure: ${relative}`);
    }
  }
  return { found, errors };
}

function validateShape(manifest, expectedKind, errors) {
  addError(errors, isRecord(manifest), 'Manifest must be an object');
  if (!isRecord(manifest)) return;
  const allowed = new Set([
    'schemaVersion',
    'kind',
    'runtime',
    'adapterVersion',
    'composition',
    'timeline',
    'packageVersions',
    'runtimeFeatures',
    'files',
    'shots',
  ]);
  for (const key of Object.keys(manifest)) {
    addError(errors, allowed.has(key), `Unknown manifest property: ${key}`);
  }
  addError(errors, manifest.schemaVersion === '1.0.0', 'schemaVersion must be 1.0.0');
  addError(errors, manifest.kind === expectedKind, `kind must equal --expect ${expectedKind}`);
  addError(errors, manifest.runtime === 'remotion', 'runtime must be remotion');
  addError(errors, manifest.adapterVersion === ADAPTER_VERSION, `adapterVersion must be ${ADAPTER_VERSION}`);
  addError(errors, isRecord(manifest.composition), 'composition must be an object');
  addError(errors, isRecord(manifest.timeline), 'timeline must be an object');
  addError(errors, isRecord(manifest.packageVersions), 'packageVersions must be an object');
  addError(errors, manifest.runtimeFeatures === undefined || isRecord(manifest.runtimeFeatures), 'runtimeFeatures must be an object when present');
  addError(errors, Array.isArray(manifest.files), 'files must be an array');
  addError(errors, Array.isArray(manifest.shots) && manifest.shots.length > 0, 'shots must be a non-empty array');
}

function validateComposition(composition, errors) {
  if (!isRecord(composition)) return;
  const allowed = new Set(['id', 'entryPoint', 'rootFile', 'componentFile']);
  for (const key of Object.keys(composition)) {
    addError(errors, allowed.has(key), `Unknown composition property: ${key}`);
  }
  addError(errors, SAFE_ID.test(composition.id ?? ''), 'composition.id is invalid');
  for (const key of ['entryPoint', 'rootFile', 'componentFile']) {
    addError(errors, safeRelative(composition[key]), `composition.${key} must be a safe project-relative path`);
  }
}

function validateTimeline(manifest, errors) {
  const timeline = manifest.timeline;
  if (!isRecord(timeline)) return;
  const integers = ['fps', 'width', 'height', 'startMs', 'endMs', 'startFrame', 'endFrame', 'durationInFrames'];
  for (const key of integers) {
    addError(errors, Number.isInteger(timeline[key]), `timeline.${key} must be an integer`);
  }
  if (!integers.every((key) => Number.isInteger(timeline[key]))) return;
  addError(errors, timeline.fps >= 1 && timeline.fps <= 240, 'timeline.fps must be between 1 and 240');
  addError(errors, timeline.width > 0 && timeline.height > 0, 'timeline dimensions must be positive');
  addError(errors, timeline.startMs >= 0 && timeline.endMs > timeline.startMs, 'timeline millisecond window is invalid');
  addError(errors, timeline.roundingPolicy === ROUNDING_POLICY, `timeline.roundingPolicy must be ${ROUNDING_POLICY}`);
  if (timeline.fps >= 1 && timeline.fps <= 240 && timeline.startMs >= 0 && timeline.endMs > timeline.startMs) {
    const expectedStart = mappedFrame(timeline.startMs, timeline.fps);
    const expectedEnd = mappedFrame(timeline.endMs, timeline.fps);
    addError(errors, timeline.startFrame === expectedStart, `timeline.startFrame must be ${expectedStart}`);
    addError(errors, timeline.endFrame === expectedEnd, `timeline.endFrame must be ${expectedEnd}`);
    addError(errors, timeline.durationInFrames === expectedEnd - expectedStart, 'timeline.durationInFrames does not close its mapped boundaries');
  }
  if (manifest.kind === 'master') {
    addError(errors, timeline.startMs === 0 && timeline.startFrame === 0, 'master timeline must start at zero');
  }
}

function validateFiles(manifest, errors) {
  if (!Array.isArray(manifest.files)) return new Map();
  const files = new Map();
  for (const [index, item] of manifest.files.entries()) {
    if (!isRecord(item)) {
      errors.push(`files[${index}] must be an object`);
      continue;
    }
    const allowed = new Set(['path', 'sha256', 'role']);
    for (const key of Object.keys(item)) addError(errors, allowed.has(key), `Unknown files[${index}] property: ${key}`);
    addError(errors, safeRelative(item.path), `files[${index}].path is unsafe`);
    addError(errors, SHA256.test(item.sha256 ?? ''), `files[${index}].sha256 is invalid`);
    addError(errors, FILE_ROLES.has(item.role), `files[${index}].role is invalid`);
    if (safeRelative(item.path)) {
      addError(errors, !files.has(item.path), `Duplicate file path: ${item.path}`);
      files.set(item.path, item);
    }
  }
  return files;
}

function validatePattern(pattern, shotIndex, errors) {
  if (pattern === undefined) return;
  if (!isRecord(pattern)) {
    errors.push(`shots[${shotIndex}].pattern must be an object`);
    return;
  }
  const allowed = new Set(['cardId', 'styleKey', 'sourceRevision', 'implementation', 'referenceFiles', 'fallbackReason', 'attribution']);
  for (const key of Object.keys(pattern)) addError(errors, allowed.has(key), `Unknown shots[${shotIndex}].pattern property: ${key}`);
  addError(errors, /^[a-z0-9][a-z0-9._-]*$/.test(pattern.cardId ?? ''), `shots[${shotIndex}].pattern.cardId is invalid`);
  addError(errors, /^[a-z0-9][a-z0-9._-]*$/.test(pattern.styleKey ?? ''), `shots[${shotIndex}].pattern.styleKey is invalid`);
  addError(errors, pattern.sourceRevision === SOURCE_REVISION, `shots[${shotIndex}].pattern.sourceRevision must be pinned upstream commit`);
  addError(errors, ['adapted-reference', 'original-from-card', 'fallback'].includes(pattern.implementation), `shots[${shotIndex}].pattern.implementation is invalid`);
  addError(errors, Array.isArray(pattern.referenceFiles), `shots[${shotIndex}].pattern.referenceFiles must be an array`);
  if (Array.isArray(pattern.referenceFiles)) {
    const unique = new Set();
    for (const ref of pattern.referenceFiles) {
      const safe = safeRelative(ref);
      addError(errors, safe, `shots[${shotIndex}] has an unsafe pattern reference path`);
      addError(errors, safe && ref.startsWith('references/shotcraft/remotion-sources/'), `shots[${shotIndex}] pattern reference is outside the imported source set`);
      addError(errors, !unique.has(ref), `shots[${shotIndex}] repeats pattern reference ${ref}`);
      unique.add(ref);
    }
  }
  if (pattern.implementation === 'adapted-reference') {
    addError(errors, pattern.referenceFiles?.length > 0, `shots[${shotIndex}] adapted-reference requires referenceFiles`);
    addError(errors, typeof pattern.attribution === 'string' && pattern.attribution.trim().length > 0, `shots[${shotIndex}] adapted-reference requires attribution`);
  }
  if (pattern.implementation === 'fallback') {
    addError(errors, typeof pattern.fallbackReason === 'string' && pattern.fallbackReason.trim().length > 0, `shots[${shotIndex}] fallback requires fallbackReason`);
  }
}

function validateShots(manifest, files, errors) {
  if (!Array.isArray(manifest.shots) || !isRecord(manifest.timeline)) return;
  const fps = manifest.timeline.fps;
  if (!Number.isInteger(fps) || fps < 1) return;
  let previousMs = manifest.timeline.startMs;
  let previousFrame = manifest.timeline.startFrame;
  const shotIds = new Set();
  for (const [index, shot] of manifest.shots.entries()) {
    if (!isRecord(shot)) {
      errors.push(`shots[${index}] must be an object`);
      continue;
    }
    const allowed = new Set([
      'shotId', 'recipeSha256', 'startMs', 'endMs', 'startFrame', 'endFrame',
      'sequenceFrom', 'durationInFrames', 'component', 'sourceFiles', 'assetFiles',
      'requiredCapabilities', 'pattern',
    ]);
    for (const key of Object.keys(shot)) addError(errors, allowed.has(key), `Unknown shots[${index}] property: ${key}`);
    addError(errors, SAFE_SHOT_ID.test(shot.shotId ?? ''), `shots[${index}].shotId is invalid`);
    addError(errors, !shotIds.has(shot.shotId), `Duplicate shotId: ${shot.shotId}`);
    shotIds.add(shot.shotId);
    addError(errors, SHA256.test(shot.recipeSha256 ?? ''), `shots[${index}].recipeSha256 is invalid`);
    addError(errors, SAFE_COMPONENT.test(shot.component ?? ''), `shots[${index}].component is invalid`);
    for (const key of ['startMs', 'endMs', 'startFrame', 'endFrame', 'sequenceFrom', 'durationInFrames']) {
      addError(errors, Number.isInteger(shot[key]), `shots[${index}].${key} must be an integer`);
    }
    if (Number.isInteger(shot.startMs) && Number.isInteger(shot.endMs)) {
      addError(errors, shot.startMs === previousMs, `shots[${index}] millisecond coverage is not contiguous`);
      addError(errors, shot.endMs > shot.startMs, `shots[${index}] millisecond window is invalid`);
      const startFrame = mappedFrame(shot.startMs, fps);
      const endFrame = mappedFrame(shot.endMs, fps);
      addError(errors, shot.startFrame === startFrame, `shots[${index}].startFrame must be ${startFrame}`);
      addError(errors, shot.endFrame === endFrame, `shots[${index}].endFrame must be ${endFrame}`);
      addError(errors, endFrame > startFrame, `shots[${index}] maps to zero or negative frames`);
      addError(errors, shot.durationInFrames === endFrame - startFrame, `shots[${index}].durationInFrames is invalid`);
      addError(errors, shot.sequenceFrom === startFrame - manifest.timeline.startFrame, `shots[${index}].sequenceFrom is invalid`);
      addError(errors, shot.startFrame === previousFrame, `shots[${index}] frame coverage is not contiguous`);
      previousMs = shot.endMs;
      previousFrame = endFrame;
    }
    for (const key of ['sourceFiles', 'assetFiles']) {
      addError(errors, Array.isArray(shot[key]), `shots[${index}].${key} must be an array`);
      if (Array.isArray(shot[key])) {
        const unique = new Set();
        for (const file of shot[key]) {
          addError(errors, safeRelative(file), `shots[${index}].${key} contains an unsafe path`);
          addError(errors, files.has(file), `shots[${index}].${key} references an unlisted file: ${file}`);
          addError(errors, !unique.has(file), `shots[${index}].${key} repeats ${file}`);
          unique.add(file);
        }
      }
    }
    addError(errors, shot.sourceFiles?.length > 0, `shots[${index}] requires at least one source file`);
    addError(errors, Array.isArray(shot.requiredCapabilities) && shot.requiredCapabilities.length > 0, `shots[${index}] requires capabilities`);
    if (Array.isArray(shot.requiredCapabilities)) {
      const unique = new Set();
      for (const capability of shot.requiredCapabilities) {
        addError(errors, /^[a-z0-9][a-z0-9.-]*$/.test(capability), `shots[${index}] has an invalid capability`);
        addError(errors, !unique.has(capability), `shots[${index}] repeats capability ${capability}`);
        unique.add(capability);
      }
    }
    validatePattern(shot.pattern, index, errors);
  }
  addError(errors, previousMs === manifest.timeline.endMs, 'Shot millisecond coverage does not reach timeline.endMs');
  addError(errors, previousFrame === manifest.timeline.endFrame, 'Shot frame coverage does not reach timeline.endFrame');
}

async function validatePackage(project, manifest, files, errors) {
  const packagePath = path.join(project, 'package.json');
  const lockPath = path.join(project, 'package-lock.json');
  addError(errors, files.has('package.json'), 'package.json must be listed in files');
  addError(errors, files.has('package-lock.json'), 'package-lock.json must be listed in files');
  let packageJson;
  let lock;
  try {
    packageJson = (await parseJson(packagePath, 'package.json')).value;
    lock = (await parseJson(lockPath, 'package-lock.json')).value;
  } catch (error) {
    errors.push(error.message);
    return;
  }
  addError(errors, packageJson.private === true, 'package.json must set private=true');
  for (const field of [
    'optionalDependencies',
    'peerDependencies',
    'peerDependenciesMeta',
    'bundledDependencies',
    'bundleDependencies',
    'workspaces',
    'overrides',
    'resolutions',
  ]) {
    const value = packageJson[field];
    const empty = value === undefined
      || (Array.isArray(value) && value.length === 0)
      || (isRecord(value) && Object.keys(value).length === 0);
    addError(errors, empty, `package.json must not define non-empty ${field}`);
  }
  const dependencies = {
    ...(isRecord(packageJson.dependencies) ? packageJson.dependencies : {}),
    ...(isRecord(packageJson.devDependencies) ? packageJson.devDependencies : {}),
  };
  validateRemotionVersionPolicy(dependencies, manifest.packageVersions, errors);
  addError(errors, lock.lockfileVersion === 3, 'package-lock.json must use lockfileVersion 3');
  const lockRoot = lock.packages?.[''];
  addError(errors, isRecord(lockRoot), 'package-lock.json is missing its root package record');
  if (isRecord(lockRoot)) {
    const lockDependencies = {
      ...(isRecord(lockRoot.dependencies) ? lockRoot.dependencies : {}),
      ...(isRecord(lockRoot.devDependencies) ? lockRoot.devDependencies : {}),
    };
    for (const [name, version] of Object.entries(dependencies)) {
      addError(errors, lockDependencies[name] === version, `Lock root mismatch for ${name}`);
    }
  }
  if (isRecord(lock.packages)) {
    for (const [name, record] of Object.entries(lock.packages)) {
      if (name === '') continue;
      addError(errors, isRecord(record), `Invalid lock package record at ${name}`);
      if (!isRecord(record)) continue;
      addError(errors, record.link !== true, `Linked lock package is forbidden at ${name}`);
      addError(errors, typeof record.resolved === 'string' && record.resolved.startsWith('https://registry.npmjs.org/'), `Non-registry lock source at ${name}`);
      addError(errors, typeof record.integrity === 'string' && record.integrity.length > 0, `Missing integrity at ${name}`);
    }
  }
  const scripts = isRecord(packageJson.scripts) ? packageJson.scripts : {};
  for (const lifecycle of ['preinstall', 'install', 'postinstall', 'prepare']) {
    addError(errors, scripts[lifecycle] === undefined, `package.json must not define ${lifecycle}`);
  }
}

async function validateProjectClosure(project, manifestPath, files, errors) {
  const walked = await walkProject(project);
  errors.push(...walked.errors);
  const manifestRelative = path.relative(project, manifestPath).split(path.sep).join('/');
  const actual = walked.found.filter((file) => file !== manifestRelative).sort();
  const declared = [...files.keys()].sort();
  for (const file of actual) addError(errors, files.has(file), `Project file is omitted from manifest: ${file}`);
  for (const file of declared) addError(errors, actual.includes(file), `Manifest file is missing from project: ${file}`);
  const contents = new Map();
  for (const file of declared) {
    if (!actual.includes(file)) continue;
    const absolute = path.join(project, ...file.split('/'));
    const data = await readFile(absolute);
    contents.set(file, data);
    addError(errors, sha256(data) === files.get(file).sha256, `SHA-256 mismatch: ${file}`);
  }
  return contents;
}

function validateRequiredFiles(manifest, files, errors) {
  const required = [
    manifest.composition?.entryPoint,
    manifest.composition?.rootFile,
    manifest.composition?.componentFile,
    'package.json',
    'package-lock.json',
    'tsconfig.json',
  ].filter(Boolean);
  for (const file of required) addError(errors, files.has(file), `Required project file is not listed: ${file}`);
  if (files.has('package-lock.json')) addError(errors, files.get('package-lock.json').role === 'lock', 'package-lock.json role must be lock');
}

function scanSource(contents, manifest, errors) {
  const code = [];
  for (const [file, data] of contents) {
    if (!CODE_EXTENSIONS.has(path.extname(file))) continue;
    const source = data.toString('utf8');
    code.push(source);
    for (const [label, expression] of FORBIDDEN_SOURCE) {
      if (expression.test(source)) errors.push(`Forbidden ${label} in ${file}`);
    }
  }
  const joined = code.join('\n');
  addError(errors, /\bregisterRoot\s*\(/.test(joined), 'Project source must call registerRoot');
  addError(errors, /\bComposition\b/.test(joined), 'Project source must register a Composition');
  addError(errors, /\buseCurrentFrame\s*\(/.test(joined), 'Project source must derive visible motion from useCurrentFrame');
  if (manifest.kind === 'master') addError(errors, /\bSequence\b/.test(joined), 'Master source must assemble shots with Sequence');
}

export function validateHtmlInCanvasFeature(manifest, contents, files, errors) {
  const required = (manifest.shots ?? []).some(
    (shot) => shot?.requiredCapabilities?.includes(HTML_IN_CANVAS_CAPABILITY),
  );
  const runtimeFeatures = manifest.runtimeFeatures;
  if (runtimeFeatures !== undefined && isRecord(runtimeFeatures)) {
    for (const key of Object.keys(runtimeFeatures)) {
      addError(errors, key === 'htmlInCanvas', `Unknown runtimeFeatures property: ${key}`);
    }
  }
  const feature = isRecord(runtimeFeatures) ? runtimeFeatures.htmlInCanvas : undefined;
  addError(errors, feature === undefined || isRecord(feature), 'runtimeFeatures.htmlInCanvas must be an object when present');
  addError(
    errors,
    required === (feature !== undefined),
    `${HTML_IN_CANVAS_CAPABILITY} and runtimeFeatures.htmlInCanvas must be declared together`,
  );
  if (!required || !isRecord(feature)) return;

  const allowed = new Set(['paintBackends', 'nested', 'chromiumOpenGlRenderer']);
  for (const key of Object.keys(feature)) {
    addError(errors, allowed.has(key), `Unknown runtimeFeatures.htmlInCanvas property: ${key}`);
  }
  const backends = feature.paintBackends;
  addError(errors, Array.isArray(backends) && backends.length > 0, 'htmlInCanvas.paintBackends must be a non-empty array');
  if (Array.isArray(backends)) {
    const unique = new Set();
    for (const backend of backends) {
      addError(errors, ['canvas-2d', 'webgl2'].includes(backend), `Unsupported htmlInCanvas paint backend: ${backend}`);
      addError(errors, !unique.has(backend), `Duplicate htmlInCanvas paint backend: ${backend}`);
      unique.add(backend);
    }
  }
  addError(errors, feature.nested === false, 'Nested HtmlInCanvas is unsupported by this production contract');
  addError(
    errors,
    ['browser-default', 'angle', 'swangle'].includes(feature.chromiumOpenGlRenderer),
    'htmlInCanvas.chromiumOpenGlRenderer must be browser-default, angle, or swangle',
  );
  if (backends?.includes('webgl2')) {
    addError(
      errors,
      ['angle', 'swangle'].includes(feature.chromiumOpenGlRenderer),
      'WebGL2 HtmlInCanvas requires angle or swangle',
    );
  }
  addError(
    errors,
    versionAtLeast(manifest.packageVersions?.remotion, HTML_IN_CANVAS_MINIMUM)
      && !manifest.packageVersions?.remotion?.includes('-'),
    'HtmlInCanvas requires Remotion 4.0.455 or newer plus the runtime canary',
  );

  const source = [...contents.entries()]
    .filter(([file]) => CODE_EXTENSIONS.has(path.extname(file)))
    .map(([, data]) => data.toString('utf8'))
    .join('\n');
  addError(errors, /\bHtmlInCanvas\b/u.test(source) && /<HtmlInCanvas\b/u.test(source), 'HtmlInCanvas capability requires a real HtmlInCanvas component');
  if (backends?.includes('canvas-2d')) {
    addError(errors, /getContext\(\s*['"]2d['"]/u.test(source), 'canvas-2d HtmlInCanvas must acquire a 2D context');
  }
  if (backends?.includes('webgl2')) {
    addError(errors, /getContext\(\s*['"]webgl2['"]/u.test(source), 'webgl2 HtmlInCanvas must acquire a WebGL2 context');
  }
  if (['angle', 'swangle'].includes(feature.chromiumOpenGlRenderer)) {
    const config = contents.get('remotion.config.ts')?.toString('utf8') ?? '';
    addError(errors, files.get('remotion.config.ts')?.role === 'config', 'remotion.config.ts must be listed with role config for HtmlInCanvas GL rendering');
    const escaped = feature.chromiumOpenGlRenderer;
    addError(
      errors,
      new RegExp(`setChromiumOpenGlRenderer\\(\\s*['"]${escaped}['"]\\s*\\)`, 'u').test(config),
      `remotion.config.ts must freeze Chromium OpenGL renderer ${escaped}`,
    );
  }
}

export function validateFontClosure(contents, files, errors) {
  const declaredFonts = [...files.values()].filter((file) => file.role === 'font');
  for (const font of declaredFonts) {
    addError(errors, font.path.startsWith('public/'), `Font must be project-local under public/: ${font.path}`);
    addError(errors, FONT_EXTENSIONS.has(path.extname(font.path).toLowerCase()), `Font file extension is unsupported: ${font.path}`);
  }

  const source = [...contents.entries()]
    .filter(([file]) => CODE_EXTENSIONS.has(path.extname(file)))
    .map(([, data]) => data.toString('utf8'))
    .join('\n');
  const usesFontShorthand = /\bfont\s*:/u.test(source);
  const declaresFontFamily = /(?:\bfontFamily\s*:|\bfont-family\s*:)/u.test(source);
  addError(
    errors,
    !usesFontShorthand,
    'Font shorthand is forbidden; declare fontFamily or font-family explicitly',
  );
  if (!declaresFontFamily && !usesFontShorthand) return;

  addError(errors, declaredFonts.length > 0, 'Source declares a font family but manifest lists no project-local font');
  addError(
    errors,
    !/(?:\bsans-serif\b|\bserif\b|\bmonospace\b|\bsystem-ui\b|-apple-system|BlinkMacSystemFont|Segoe UI|\bArial\b|\bHelvetica\b|Times New Roman|Courier New)/iu.test(source),
    'Generic or host-system font fallback is forbidden; bind the declared project-local font explicitly',
  );
  addError(
    errors,
    /(?:@font-face\b|\bnew\s+FontFace\s*\(|\bloadFont\s*\()/u.test(source),
    'Source declares a font family but has no explicit project-local font loader',
  );
}

async function validateReferenceFiles(manifest, errors) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const skillRoot = path.resolve(scriptDir, '..');
  const skillRootReal = await realpath(skillRoot);
  const refs = new Set();
  for (const shot of manifest.shots ?? []) {
    for (const reference of shot?.pattern?.referenceFiles ?? []) refs.add(reference);
  }
  for (const reference of refs) {
    if (!safeRelative(reference)) continue;
    const absolute = path.resolve(skillRoot, ...reference.split('/'));
    let resolved;
    try {
      const stats = await lstat(absolute);
      addError(errors, stats.isFile(), `Pattern reference is not a regular file: ${reference}`);
      addError(errors, !stats.isSymbolicLink(), `Pattern reference is a symlink: ${reference}`);
      resolved = await realpath(absolute);
    } catch {
      errors.push(`Pattern reference is missing: ${reference}`);
      continue;
    }
    addError(errors, resolved.startsWith(`${skillRootReal}${path.sep}`), `Pattern reference escapes the Skill root: ${reference}`);
  }
}

function buildIdentity(manifest, manifestRelative, manifestText, contents) {
  const files = [
    { path: manifestRelative, sha256: sha256(manifestText) },
    ...[...contents.entries()].map(([file, data]) => ({ path: file, sha256: sha256(data) })),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const canonical = files.map((file) => `${file.path}\0${file.sha256}\n`).join('');
  return {
    schemaVersion: '1.0.0',
    runtime: 'remotion',
    adapterVersion: ADAPTER_VERSION,
    compositionId: manifest.composition.id,
    manifest: manifestRelative,
    aggregateSha256: sha256(canonical),
    files,
  };
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const errors = [];
  const project = path.resolve(options.project);
  const manifestPath = path.resolve(options.manifest);
  let projectReal;
  let manifestReal;
  try {
    const projectStats = await lstat(project);
    if (projectStats.isSymbolicLink() || !projectStats.isDirectory()) throw new Error('project must be a real directory, not a symlink');
    projectReal = await realpath(project);
    const manifestStats = await lstat(manifestPath);
    if (manifestStats.isSymbolicLink() || !manifestStats.isFile()) throw new Error('manifest must be a real file, not a symlink');
    manifestReal = await realpath(manifestPath);
    if (!manifestReal.startsWith(`${projectReal}${path.sep}`)) throw new Error('manifest must be inside project');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  let parsed;
  try {
    parsed = await parseJson(manifestPath, 'manifest');
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const manifest = parsed.value;
  validateShape(manifest, options.expect, errors);
  validateComposition(manifest.composition, errors);
  validateTimeline(manifest, errors);
  const files = validateFiles(manifest, errors);
  validateRequiredFiles(manifest, files, errors);
  validateShots(manifest, files, errors);

  let contents = new Map();
  if (isRecord(manifest) && Array.isArray(manifest.files)) {
    contents = await validateProjectClosure(projectReal, manifestReal, files, errors);
    await validatePackage(projectReal, manifest, files, errors);
    scanSource(contents, manifest, errors);
    validateHtmlInCanvasFeature(manifest, contents, files, errors);
    validateFontClosure(contents, files, errors);
    await validateReferenceFiles(manifest, errors);
  }

  const manifestRelative = path.relative(projectReal, manifestReal).split(path.sep).join('/');
  const identity = isRecord(manifest.composition)
    ? buildIdentity(manifest, manifestRelative, parsed.text, contents)
    : null;

  if (errors.length === 0 && options.identity) {
    try {
      const expected = (await parseJson(path.resolve(options.identity), 'identity')).value;
      if (canonicalJson(expected) !== canonicalJson(identity)) errors.push('Composition identity does not match the current project closure');
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (errors.length === 0 && options.writeIdentity) {
    const target = path.resolve(options.writeIdentity);
    try {
      const parent = path.dirname(target);
      const parentStats = await lstat(parent);
      if (!parentStats.isDirectory() || parentStats.isSymbolicLink()) throw new Error('identity parent must be a real existing directory');
      await writeFile(target, `${JSON.stringify(identity, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    } catch (error) {
      errors.push(`Identity was not written: ${error.message}`);
    }
  }

  const result = {
    ok: errors.length === 0,
    expectedKind: options.expect,
    compositionId: manifest?.composition?.id ?? null,
    shotCount: Array.isArray(manifest?.shots) ? manifest.shots.length : 0,
    durationInFrames: manifest?.timeline?.durationInFrames ?? null,
    aggregateSha256: identity?.aggregateSha256 ?? null,
    identityMatched: options.identity ? errors.length === 0 : null,
    identityWritten: options.writeIdentity && errors.length === 0 ? path.basename(options.writeIdentity) : null,
    errors,
  };
  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`Remotion ${options.expect} verified: ${result.compositionId} (${result.shotCount} shots, ${result.durationInFrames} frames)\n`);
  } else {
    process.stderr.write(`${errors.map((error) => `- ${error}`).join('\n')}\n`);
  }
  if (!result.ok) process.exitCode = 1;
}

const isEntryPoint = process.argv[1]
  && realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
if (isEntryPoint) await main();
