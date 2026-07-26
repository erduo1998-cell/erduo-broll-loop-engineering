import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { parse as parseJavaScript } from 'acorn';
import { parse as parseHtml } from 'parse5';
import postcss from 'postcss';
import { fingerprintV3Value } from './validate-production-contract.mjs';

const execFileAsync = promisify(execFile);
const SHA256 = /^[0-9a-f]{64}$/u;
const REMOTE_URL = /^(?:https?:)?\/\//iu;
const GENERIC_FONT = /\b(?:sans-serif|serif|monospace|system-ui|cursive|fantasy)\b/iu;
const HEX_COLOR = /#[0-9a-f]{3,8}\b/giu;
const INSPECTION_FIELDS = Object.freeze([
  'schema_version',
  'inspector_id',
  'block_id',
  'source_sha256',
  'source_bytes_sha256',
  'actual_dependency_set_sha256',
  'parser_evidence',
  'hyperframes_check',
  'structural_facts',
  'inspection_sha256',
]);

export class BlockSourceInspectionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BlockSourceInspectionError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new BlockSourceInspectionError(code, message);
};

const hashBytes = (value) => createHash('sha256').update(value).digest('hex');
const hash = (value) => fingerprintV3Value(value);

function exact(value, fields, code, message) {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort())
      !== JSON.stringify([...fields].sort())
  ) fail(code, message);
}

function parserRecord(library, kind, version, document, nodeCount) {
  return {
    library,
    kind,
    version,
    document_sha256: hashBytes(Buffer.from(document, 'utf8')),
    node_count: nodeCount,
  };
}

function walkHtml(node, visitor) {
  visitor(node);
  for (const child of node.childNodes ?? []) walkHtml(child, visitor);
  if (node.content) walkHtml(node.content, visitor);
}

function htmlFacts(source) {
  let root;
  try {
    root = parseHtml(source, { sourceCodeLocationInfo: true });
  } catch {
    fail('source_parser_failed', 'The HTML document could not be parsed.');
  }
  const ids = new Map();
  const elements = [];
  const failures = new Set();
  let nodeCount = 0;
  walkHtml(root, (node) => {
    nodeCount += 1;
    if (!node.tagName) return;
    const attributes = Object.fromEntries(
      (node.attrs ?? []).map((attribute) => [
        attribute.name.toLowerCase(),
        attribute.value,
      ]),
    );
    const id = attributes.id;
    if (id) {
      if (ids.has(id)) failures.add('selector_duplicate');
      ids.set(id, attributes);
    }
    for (const name of ['src', 'href']) {
      if (REMOTE_URL.test(attributes[name] ?? '')) {
        failures.add('remote_dependency');
      }
    }
    elements.push({
      tag_name: node.tagName,
      attributes,
      text: (node.childNodes ?? [])
        .filter((child) => child.nodeName === '#text')
        .map((child) => child.value)
        .join('')
        .trim(),
    });
  });
  return {
    ids,
    elements,
    failures,
    record: parserRecord('parse5', 'dom-ast', '7.3.0', source, nodeCount),
  };
}

function walkJavaScript(node, visitor, parent = null) {
  if (!node || typeof node !== 'object') return;
  visitor(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'start' || key === 'end' || key === 'loc') continue;
    if (Array.isArray(value)) {
      for (const child of value) walkJavaScript(child, visitor, node);
    } else if (value && typeof value.type === 'string') {
      walkJavaScript(value, visitor, node);
    }
  }
}

function staticProperty(member) {
  if (!member || member.type !== 'MemberExpression') return null;
  if (!member.computed && member.property?.type === 'Identifier') {
    return member.property.name;
  }
  if (
    member.computed
    && member.property?.type === 'Literal'
    && typeof member.property.value === 'string'
  ) return member.property.value;
  return null;
}

function memberPath(node) {
  if (node?.type === 'Identifier') return [node.name];
  if (node?.type !== 'MemberExpression') return [];
  return [...memberPath(node.object), staticProperty(node)].filter(Boolean);
}

function objectBooleanProperty(node, name) {
  if (!node || node.type !== 'ObjectExpression') return undefined;
  const property = node.properties.find((item) => (
    item.type === 'Property'
    && (
      item.key?.name === name
      || item.key?.value === name
    )
  ));
  return property?.value?.type === 'Literal'
    ? property.value.value
    : undefined;
}

function javascriptFacts(source) {
  let root;
  try {
    root = parseJavaScript(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowHashBang: true,
    });
  } catch {
    fail('source_parser_failed', 'The JavaScript document could not be parsed.');
  }
  const failures = new Set();
  const fetchAliases = new Set();
  const randomAliases = new Set();
  const clockAliases = new Set();
  const timelineVariables = new Set();
  const timelineCalls = [];
  const nodes = [];
  let nodeCount = 0;
  walkJavaScript(root, (node) => {
    nodeCount += 1;
    nodes.push(node);
    if (
      (node.type === 'ImportDeclaration'
        || node.type === 'ExportNamedDeclaration'
        || node.type === 'ExportAllDeclaration')
      && REMOTE_URL.test(node.source?.value ?? '')
    ) failures.add('remote_dependency');
    if (
      node.type === 'ImportExpression'
      && node.source?.type === 'Literal'
      && REMOTE_URL.test(node.source.value ?? '')
    ) failures.add('remote_dependency');
    if (node.type === 'AwaitExpression' || node.async === true) {
      failures.add('source_hyperframes_invalid');
    }
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
      const initPath = memberPath(node.init);
      if (initPath.at(-1) === 'fetch') fetchAliases.add(node.id.name);
      if (
        node.init?.type === 'CallExpression'
        && memberPath(node.init.callee).join('.') === 'HyperFrames.timeline'
      ) {
        timelineVariables.add(node.id.name);
        if (objectBooleanProperty(node.init.arguments[0], 'paused') !== true) {
          failures.add('source_hyperframes_invalid');
        }
      }
    }
    if (node.type !== 'CallExpression') return;
    const calleePath = memberPath(node.callee);
    const joined = calleePath.join('.');
    if (joined === 'Math.random') failures.add('nondeterministic_random');
    if (joined === 'Date.now') failures.add('nondeterministic_clock');
    if (
      calleePath.at(-1) === 'fetch'
      || (
        node.callee.type === 'Identifier'
        && fetchAliases.has(node.callee.name)
      )
      || ['XMLHttpRequest', 'WebSocket', 'EventSource']
        .includes(calleePath.at(-1))
    ) failures.add('remote_dependency');
    if (
      calleePath.slice(-2).join('.') === 'classList.add'
      || ['setAttribute'].includes(calleePath.at(-1))
    ) failures.add('seek_irreversible_callback');
    if (
      calleePath.at(-1) === 'fromTo'
      && node.callee.type === 'MemberExpression'
      && node.callee.object?.type === 'Identifier'
      && timelineVariables.has(node.callee.object.name)
    ) {
      timelineCalls.push({
        timeline: node.callee.object.name,
        selector: node.arguments[0]?.value ?? null,
        start: node.start,
        end: node.end,
      });
    }
  });
  const classifyAlias = (expression) => {
    const expressionPath = memberPath(expression).join('.');
    if (expressionPath === 'Math.random') return 'random';
    if (expressionPath === 'Date.now') return 'clock';
    if (expression?.type === 'Identifier') {
      if (randomAliases.has(expression.name)) return 'random';
      if (clockAliases.has(expression.name)) return 'clock';
    }
    if (
      expression?.type === 'CallExpression'
      && staticProperty(expression.callee) === 'bind'
    ) return classifyAlias(expression.callee.object);
    return null;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (
        node.type === 'VariableDeclarator'
        && node.id?.type === 'Identifier'
      ) {
        const kind = classifyAlias(node.init);
        const target = kind === 'random'
          ? randomAliases
          : kind === 'clock'
            ? clockAliases
            : null;
        if (target && !target.has(node.id.name)) {
          target.add(node.id.name);
          changed = true;
        }
      }
      if (
        node.type === 'VariableDeclarator'
        && node.id?.type === 'ObjectPattern'
        && node.init?.type === 'Identifier'
        && ['Math', 'Date'].includes(node.init.name)
      ) {
        for (const property of node.id.properties) {
          if (
            property.type !== 'Property'
            || property.value?.type !== 'Identifier'
          ) continue;
          const propertyName = property.key?.name ?? property.key?.value;
          const target = (
            node.init.name === 'Math' && propertyName === 'random'
          )
            ? randomAliases
            : (
              node.init.name === 'Date' && propertyName === 'now'
            )
              ? clockAliases
              : null;
          if (target && !target.has(property.value.name)) {
            target.add(property.value.name);
            changed = true;
          }
        }
      }
      if (
        node.type === 'AssignmentExpression'
        && node.operator === '='
        && node.left?.type === 'Identifier'
      ) {
        const kind = classifyAlias(node.right);
        const target = kind === 'random'
          ? randomAliases
          : kind === 'clock'
            ? clockAliases
            : null;
        if (target && !target.has(node.left.name)) {
          target.add(node.left.name);
          changed = true;
        }
      }
    }
  }
  for (const node of nodes) {
    if (
      node.type !== 'CallExpression'
      || node.callee?.type !== 'Identifier'
    ) continue;
    if (randomAliases.has(node.callee.name)) {
      failures.add('nondeterministic_random');
    }
    if (clockAliases.has(node.callee.name)) {
      failures.add('nondeterministic_clock');
    }
  }
  if (timelineVariables.size === 0) failures.add('source_hyperframes_invalid');
  return {
    failures,
    timelineCalls,
    record: parserRecord(
      'acorn',
      'ecmascript-ast',
      '8.15.0',
      source,
      nodeCount,
    ),
  };
}

function cssFacts(source, registeredColors) {
  let root;
  try {
    root = postcss.parse(source, { from: undefined });
  } catch {
    fail('source_parser_failed', 'The CSS document could not be parsed.');
  }
  const failures = new Set();
  const tokens = [];
  let nodeCount = 0;
  root.walk((node) => {
    nodeCount += 1;
    if (
      node.type === 'atrule'
      && node.name.toLowerCase() === 'import'
      && /(?:https?:)?\/\//iu.test(node.params)
    ) failures.add('remote_dependency');
    if (node.type !== 'decl') return;
    if (/(?:https?:)?\/\//iu.test(node.value)) {
      failures.add('remote_dependency');
    }
    if (
      node.prop.toLowerCase() === 'font-family'
      && GENERIC_FONT.test(node.value)
    ) failures.add('font_fallback_forbidden');
    if (/\blocal\s*\(/iu.test(node.value)) {
      failures.add('font_fallback_forbidden');
    }
    for (const match of node.value.matchAll(HEX_COLOR)) {
      const color = match[0].toLowerCase();
      tokens.push(color);
      if (!registeredColors.has(color)) {
        failures.add('canonical_artifact_reference_unregistered');
      }
    }
  });
  return {
    failures,
    tokens,
    record: parserRecord(
      'postcss',
      'css-ast',
      '8.5.6',
      source,
      nodeCount + 1,
    ),
  };
}

async function readDependencySet(sourceBundle) {
  const materials = [];
  for (const material of sourceBundle.materials) {
    const bytes = await readFile(material.local_path);
    materials.push({
      asset_id: material.asset_id,
      bytes_sha256: hashBytes(bytes),
    });
  }
  const fontBytes = await readFile(sourceBundle.font_package.local_path);
  return {
    materials,
    font: {
      family: sourceBundle.font_package.family,
      bytes_sha256: hashBytes(fontBytes),
    },
  };
}

function sourceBytesSet(sourceBundle) {
  return sourceBundle.files.map((file) => ({
    relative_path: file.relative_path,
    media_type: file.media_type,
    bytes_sha256: hashBytes(Buffer.from(file.content, 'utf8')),
  })).sort((left, right) => left.relative_path.localeCompare(
    right.relative_path,
  ));
}

function safeProjectRelative(relativePath) {
  const normalized = path.posix.normalize(relativePath ?? '');
  if (
    !normalized
    || normalized.startsWith('../')
    || normalized.includes('/../')
    || path.posix.isAbsolute(normalized)
  ) fail('hyperframes_check_failed', 'A source path escapes the check project.');
  return normalized;
}

function localReference(value) {
  if (
    typeof value !== 'string'
    || !value
    || REMOTE_URL.test(value)
    || value.startsWith('data:')
  ) return null;
  const withoutQuery = value.split(/[?#]/u, 1)[0];
  return safeProjectRelative(withoutQuery.replace(/^\.\//u, ''));
}

async function runHyperframesCheck(
  sourceBundle,
  html,
  cssSource,
  expectedVersion,
) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'erduo-v3-source-check-'),
  );
  const binary = fileURLToPath(
    new URL('../node_modules/.bin/hyperframes', import.meta.url),
  );
  const config = {
    $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
  };
  const packageDocument = {
    name: 'erduo-v3-source-check',
    private: true,
    type: 'module',
  };
  try {
    for (const file of sourceBundle.files) {
      const relativePath = safeProjectRelative(file.relative_path);
      const target = path.join(root, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content);
    }
    const materialById = new Map(
      sourceBundle.materials.map((material) => [
        material.asset_id,
        material,
      ]),
    );
    const copiedTargets = new Set();
    for (const element of html.elements) {
      const material = materialById.get(
        element.attributes['data-asset-id'],
      );
      const relativePath = localReference(element.attributes.src);
      if (!material || !relativePath || copiedTargets.has(relativePath)) {
        continue;
      }
      const target = path.join(root, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(material.local_path, target);
      copiedTargets.add(relativePath);
    }
    const fontUrl = [...cssSource.matchAll(
      /\bsrc\s*:\s*url\(\s*["']?([^)"']+)["']?\s*\)/giu,
    )][0]?.[1];
    const fontRelativePath = localReference(fontUrl);
    if (fontRelativePath) {
      const target = path.join(root, fontRelativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(sourceBundle.font_package.local_path, target);
    }
    await Promise.all([
      writeFile(path.join(root, 'hyperframes.json'), JSON.stringify(config)),
      writeFile(path.join(root, 'package.json'), JSON.stringify(packageDocument)),
    ]);
    const versionResult = await execFileAsync(binary, ['--version'], {
      cwd: root,
      env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
      maxBuffer: 1024 * 1024,
    });
    const version = versionResult.stdout.trim();
    if (version !== '0.7.70' || expectedVersion !== '0.7.70') {
      fail(
        'hyperframes_check_failed',
        'The pinned local HyperFrames version does not match policy.',
      );
    }
    let stdout;
    try {
      const result = await execFileAsync(binary, ['check', '--json'], {
        cwd: root,
        env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
        maxBuffer: 16 * 1024 * 1024,
      });
      stdout = result.stdout;
    } catch (error) {
      stdout = error.stdout;
    }
    const parsed = JSON.parse(stdout);
    if (parsed.ok !== true) {
      fail('hyperframes_check_failed', 'HyperFrames check did not pass.');
    }
    const projectSourceSha256 = hash({
      source_files: sourceBytesSet(sourceBundle),
      actual_dependencies_sha256: hash(
        await readDependencySet(sourceBundle),
      ),
      hyperframes_json_sha256: hash(config),
      package_json_sha256: hash(packageDocument),
      checked_source_sha256: sourceBundle.source_sha256,
    });
    const core = {
      tool: 'hyperframes',
      version,
      argv: ['check', '--json'],
      status: 'passed',
      checked_source_sha256: sourceBundle.source_sha256,
      project_source_sha256: projectSourceSha256,
      result_sha256: hash(parsed),
    };
    return {
      ...core,
      tool_binding_sha256: hash({
        tool: core.tool,
        version: core.version,
        argv: core.argv,
        checked_source_sha256: core.checked_source_sha256,
      }),
    };
  } catch (error) {
    if (error instanceof BlockSourceInspectionError) throw error;
    fail('hyperframes_check_failed', 'The pinned local HyperFrames check failed.');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function structuralFailures({
  html,
  javascript,
  css,
  blockManifest,
  sourceBundle,
  canonicalArtifacts,
}) {
  const failures = new Set([
    ...html.failures,
    ...javascript.failures,
    ...css.failures,
  ]);
  const registeredComponents = new Set(
    canonicalArtifacts.componentRegistry.components.map(
      (component) => component.component_id,
    ),
  );
  const componentValues = html.elements.map(
    (element) => element.attributes['data-component'],
  ).filter(Boolean);
  if (componentValues.some((value) => !registeredComponents.has(value))) {
    failures.add('canonical_artifact_reference_unregistered');
  }
  const requiredSelectors = blockManifest.shots.flatMap((shot) => [
    ...shot.timeline_calls.map((call) => call.selector),
    ...shot.functional_text.map((text) => text.selector),
    ...Object.values(shot.causal_lifecycle)
      .flatMap((phase) => phase.selectors),
  ]);
  if (requiredSelectors.some(
    (selector) => !selector.startsWith('#')
      || !html.ids.has(selector.slice(1)),
  )) failures.add('selector_orphan');
  for (const selector of requiredSelectors) {
    const crossBlock = selector.match(/^#(B[0-9]{3})(?:[-_.]|$)/iu);
    if (
      crossBlock
      && crossBlock[1].toUpperCase() !== blockManifest.block_id
    ) failures.add('selector_cross_block');
  }
  const consumers = html.elements.filter(
    (element) => element.attributes['data-asset-id'],
  );
  for (const material of sourceBundle.materials) {
    if (material.consumer_role === 'control-media') continue;
    const matches = consumers.filter((element) => (
      element.attributes['data-asset-id'] === material.asset_id
      && element.attributes['data-consumer-role'] === material.consumer_role
    ));
    if (
      matches.length === 0
      || (
        material.consumer_role === 'ordinary-primary'
        && !matches.some((element) => (
          (material.media_kind === 'image' && element.tag_name === 'img')
          || (material.media_kind === 'video' && element.tag_name === 'video')
        ))
      )
    ) failures.add('source_asset_unbound');
  }
  const canonicalByDataId = new Map(
    blockManifest.shots.flatMap((shot) => shot.data_points)
      .map((point) => [point.data_id, point]),
  );
  for (const element of html.elements) {
    const dataId = element.attributes['data-data-id'];
    if (!dataId) continue;
    const canonical = canonicalByDataId.get(dataId);
    const value = Number(element.attributes['data-value']);
    const operands = (element.attributes['data-formula-operands'] ?? '')
      .split(',')
      .filter(Boolean)
      .map(Number);
    if (
      !canonical
      || !Number.isFinite(value)
      || value !== canonical.value
      || element.attributes['data-unit'] !== canonical.unit
      || element.attributes['data-source-ref'] !== canonical.source_ref
      || element.attributes['data-evidence-role']
        !== canonical.evidence_role
      || operands.length !== canonical.formula.operands.length
      || operands.some(
        (operand, index) => operand !== canonical.formula.operands[index],
      )
      || !element.text.includes(String(canonical.value))
    ) failures.add('numeric_formula_conflict');
  }
  return [...failures].sort();
}

export async function inspectBlockSource(input) {
  exact(
    input,
    [
      'block_manifest',
      'source_bundle',
      'canonical_artifacts',
      'validation_policy',
    ],
    'source_inspection_invalid',
    'Source inspection requires a closed current-byte input.',
  );
  if (
    !input.block_manifest
    || !input.source_bundle
    || !input.canonical_artifacts
    || !input.validation_policy
    || !SHA256.test(input.source_bundle.source_sha256 ?? '')
  ) fail('source_inspection_invalid', 'Source inspection identity is invalid.');
  const documents = new Map(
    input.source_bundle.files.map((file) => [file.media_type, file.content]),
  );
  const htmlSource = documents.get('text/html');
  const javascriptSource = documents.get('text/javascript');
  const cssSource = documents.get('text/css');
  if (
    typeof htmlSource !== 'string'
    || typeof javascriptSource !== 'string'
    || typeof cssSource !== 'string'
  ) fail('source_inspection_invalid', 'Source inspection requires HTML, JS and CSS.');
  const registeredColors = new Set(
    input.canonical_artifacts.designSystem.palette_roles
      .map((role) => String(role.value).toLowerCase()),
  );
  const html = htmlFacts(htmlSource);
  const javascript = javascriptFacts(javascriptSource);
  const css = cssFacts(cssSource, registeredColors);
  let dependencies;
  try {
    dependencies = await readDependencySet(input.source_bundle);
  } catch {
    fail('source_inspection_invalid', 'Source dependencies could not be reread.');
  }
  const parserEvidenceCore = {
    html: html.record,
    javascript: javascript.record,
    css: css.record,
  };
  const parserEvidence = {
    ...parserEvidenceCore,
    parser_set_sha256: hash(parserEvidenceCore),
  };
  const failures = structuralFailures({
    html,
    javascript,
    css,
    blockManifest: input.block_manifest,
    sourceBundle: input.source_bundle,
    canonicalArtifacts: input.canonical_artifacts,
  });
  if (failures.length > 0) {
    fail(
      failures[0],
      'Parsed source structure violates the current contract.',
    );
  }
  const hyperframesCheck = await runHyperframesCheck(
    input.source_bundle,
    html,
    cssSource,
    input.validation_policy.tool_bindings.hyperframes_version,
  );
  const structuralFacts = {
    dom_id_set_sha256: hash([...html.ids.keys()].sort()),
    selector_binding_set_sha256: hash(
      input.block_manifest.shots.flatMap((shot) => (
        shot.timeline_calls.map((call) => call.selector)
      )),
    ),
    timeline_binding_set_sha256: hash(javascript.timelineCalls),
    material_consumption_set_sha256: hash(
      html.elements.filter(
        (element) => element.attributes['data-asset-id'],
      ).map((element) => ({
        tag_name: element.tag_name,
        asset_id: element.attributes['data-asset-id'],
        consumer_role: element.attributes['data-consumer-role'],
      })),
    ),
    visible_data_binding_set_sha256: hash(
      html.elements.filter(
        (element) => element.attributes['data-data-id'],
      ).map((element) => ({
        data_id: element.attributes['data-data-id'],
        value: element.attributes['data-value'],
        unit: element.attributes['data-unit'],
        source_ref: element.attributes['data-source-ref'],
        evidence_role: element.attributes['data-evidence-role'],
      })),
    ),
    css_token_binding_set_sha256: hash(css.tokens),
    component_binding_set_sha256: hash(
      html.elements.map(
        (element) => element.attributes['data-component'],
      ).filter(Boolean),
    ),
    hard_failure_codes: failures,
  };
  const core = {
    schema_version: 1,
    inspector_id: 'block-source-structural-v1',
    block_id: input.block_manifest.block_id,
    source_sha256: input.source_bundle.source_sha256,
    source_bytes_sha256: hash(sourceBytesSet(input.source_bundle)),
    actual_dependency_set_sha256: hash(dependencies),
    parser_evidence: parserEvidence,
    hyperframes_check: hyperframesCheck,
    structural_facts: structuralFacts,
  };
  const evidence = {
    ...core,
    inspection_sha256: hash(core),
  };
  exact(
    evidence,
    INSPECTION_FIELDS,
    'source_inspection_invalid',
    'Source inspection output drifted from its closed shape.',
  );
  return evidence;
}
