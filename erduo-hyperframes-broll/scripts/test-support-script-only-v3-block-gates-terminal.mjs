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
import {
  createRuntimeProbe,
  rehashBlock,
} from './test-support-script-only-v3-block-gates.mjs';
import {
  fingerprintV3Value,
} from './validate-production-contract.mjs';

const execFileAsync = promisify(execFile);
const hash = (value) => fingerprintV3Value(value);
const hashBytes = (value) => createHash('sha256').update(value).digest('hex');

export const INSPECTION_EVIDENCE_FIELDS = Object.freeze([
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

export const PARSER_EVIDENCE_FIELDS = Object.freeze([
  'html',
  'javascript',
  'css',
  'parser_set_sha256',
]);

export const PARSER_RECORD_FIELDS = Object.freeze([
  'library',
  'kind',
  'version',
  'document_sha256',
  'node_count',
]);

export const HYPERFRAMES_CHECK_FIELDS = Object.freeze([
  'tool',
  'version',
  'argv',
  'status',
  'checked_source_sha256',
  'project_source_sha256',
  'result_sha256',
  'tool_binding_sha256',
]);

export const STRUCTURAL_FACT_FIELDS = Object.freeze([
  'dom_id_set_sha256',
  'selector_binding_set_sha256',
  'timeline_binding_set_sha256',
  'material_consumption_set_sha256',
  'visible_data_binding_set_sha256',
  'css_token_binding_set_sha256',
  'component_binding_set_sha256',
  'hard_failure_codes',
]);

export const TERMINAL_SOURCE_FAILURE_CASES = Object.freeze([
  [
    'CSS side-effect remote import',
    'css_remote_import',
    'remote_dependency',
  ],
  [
    'JavaScript side-effect remote import',
    'javascript_remote_import',
    'remote_dependency',
  ],
  [
    'computed Math random member call',
    'computed_math_random',
    'nondeterministic_random',
  ],
  [
    'computed runtime fetch member call',
    'computed_fetch',
    'remote_dependency',
  ],
  [
    'computed irreversible classList callback',
    'computed_irreversible_callback',
    'seek_irreversible_callback',
  ],
  [
    'unquoted duplicate DOM id',
    'unquoted_duplicate_id',
    'selector_duplicate',
  ],
  [
    'unregistered literal CSS palette value',
    'unregistered_css_token',
    'canonical_artifact_reference_unregistered',
  ],
  [
    'missing native auxiliary DOM consumer',
    'missing_auxiliary_consumer',
    'source_asset_unbound',
  ],
  [
    'missing ordinary image/video DOM consumers',
    'missing_primary_consumers',
    'source_asset_unbound',
  ],
  [
    'unquoted unregistered component attribute',
    'unquoted_component',
    'canonical_artifact_reference_unregistered',
  ],
  [
    'visible data value and formula mismatch',
    'visible_data_value',
    'numeric_formula_conflict',
  ],
]);

export const ALIAS_SOURCE_FAILURE_CASES = Object.freeze([
  [
    'direct Math.random alias',
    'math_random_alias',
    'nondeterministic_random',
  ],
  [
    'chained Math.random alias',
    'math_random_alias_chain',
    'nondeterministic_random',
  ],
  [
    'direct Date.now alias',
    'date_now_alias',
    'nondeterministic_clock',
  ],
  [
    'chained Date.now alias',
    'date_now_alias_chain',
    'nondeterministic_clock',
  ],
]);

export const TERMINAL_RUNTIME_FAILURE_CASES = Object.freeze([
  [
    'consistent wrong actual font family',
    'wrong_font_family',
    'font_runtime_mismatch',
  ],
  [
    'consistent unsupported actual font weight',
    'wrong_font_weight',
    'font_runtime_mismatch',
  ],
  [
    'consistent wrong primary material consumer',
    'wrong_primary_material',
    'runtime_primary_material_mismatch',
  ],
  [
    'missing Result throughout Result and Hold',
    'missing_result',
    'runtime_result_missing',
  ],
  [
    'invalid computed display and visibility enums',
    'invalid_display_visibility',
    'runtime_display_state_invalid',
  ],
]);

function sourceBytesSet(block) {
  return block.source_bundle.files
    .map((file) => ({
      relative_path: file.relative_path,
      media_type: file.media_type,
      bytes_sha256: hashBytes(Buffer.from(file.content, 'utf8')),
    }))
    .sort((left, right) => left.relative_path.localeCompare(
      right.relative_path,
    ));
}

function declaredDependencySet(block) {
  return {
    materials: block.source_bundle.materials.map((material) => ({
      asset_id: material.asset_id,
      bytes_sha256: material.bytes_sha256,
    })),
    font: {
      family: block.source_bundle.font_package.family,
      bytes_sha256: block.source_bundle.font_package.bytes_sha256,
    },
  };
}

export function terminalSourceStateFingerprint(fixture, block) {
  return hash({
    inspection_schema: 'block-source-structural-v1',
    parser_kinds: ['parse5', 'acorn', 'postcss'],
    hyperframes_version:
      fixture.validationPolicy.tool_bindings.hyperframes_version,
    declared_dependency_set_sha256: hash(declaredDependencySet(block)),
  });
}

export function terminalPixelStateFingerprint(block) {
  return hash({
    pixel_frame_plan_sha256:
      block.block_manifest.pixel_frame_plan_sha256,
    pixel_facts_sha256: hash(block.pixel_facts),
  });
}

async function actualDependencySet(block) {
  const materials = [];
  for (const material of block.source_bundle.materials) {
    materials.push({
      asset_id: material.asset_id,
      bytes_sha256: hashBytes(await readFile(material.local_path)),
    });
  }
  return {
    materials,
    font: {
      family: block.source_bundle.font_package.family,
      bytes_sha256: hashBytes(
        await readFile(block.source_bundle.font_package.local_path),
      ),
    },
  };
}

const PARSER_VERSIONS = Object.freeze({
  parse5: '7.3.0',
  acorn: '8.15.0',
  postcss: '8.5.6',
});

function parserRecord(library, kind, document) {
  return {
    library,
    kind,
    version: PARSER_VERSIONS[library],
    document_sha256: hashBytes(Buffer.from(document.content, 'utf8')),
    node_count: Math.max(1, document.content.split(/[;<>{}]/u).length),
  };
}

export async function createSourceInspectionEvidence(
  fixture,
  block,
  {
    hyperframesResult = null,
    structuralFailureCodes = [],
  } = {},
) {
  const byType = new Map(
    block.source_bundle.files.map((file) => [file.media_type, file]),
  );
  const sourceBytesSha256 = hash(sourceBytesSet(block));
  const actualDependencySetSha256 = hash(
    await actualDependencySet(block),
  );
  const parserEvidenceCore = {
    html: parserRecord(
      'parse5',
      'dom-ast',
      byType.get('text/html'),
    ),
    javascript: parserRecord(
      'acorn',
      'ecmascript-ast',
      byType.get('text/javascript'),
    ),
    css: parserRecord(
      'postcss',
      'css-ast',
      byType.get('text/css'),
    ),
  };
  const parserEvidence = {
    ...parserEvidenceCore,
    parser_set_sha256: hash(parserEvidenceCore),
  };
  const hyperframesCore = {
    tool: 'hyperframes',
    version: '0.7.70',
    argv: ['check', '--json'],
    status: 'passed',
    checked_source_sha256: block.source_bundle.source_sha256,
    project_source_sha256:
      hyperframesResult?.project_source_sha256
      ?? hash({
        source_sha256: block.source_bundle.source_sha256,
        fixture: 'hyperframes-check-project-v1',
      }),
    result_sha256:
      hyperframesResult?.result_sha256
      ?? hash({
        ok: true,
        version: '0.7.70',
        source_sha256: block.source_bundle.source_sha256,
      }),
  };
  const hyperframesCheck = {
    ...hyperframesCore,
    tool_binding_sha256: hash({
      tool: hyperframesCore.tool,
      version: hyperframesCore.version,
      argv: hyperframesCore.argv,
      checked_source_sha256:
        hyperframesCore.checked_source_sha256,
    }),
  };
  const structuralFacts = {
    dom_id_set_sha256: hash(
      block.block_manifest.shots.flatMap((shot) => (
        shot.functional_text.map((text) => text.element_id)
      )),
    ),
    selector_binding_set_sha256: hash(
      block.block_manifest.shots.flatMap((shot) => (
        shot.timeline_calls.map((call) => call.selector)
      )),
    ),
    timeline_binding_set_sha256: hash(
      block.block_manifest.shots.flatMap(
        (shot) => shot.timeline_calls,
      ),
    ),
    material_consumption_set_sha256: hash(
      block.block_manifest.shots.map((shot) => ({
        shot_id: shot.shot_id,
        primary: shot.primary_material_asset_id,
        auxiliary: shot.native_auxiliary_asset_ids,
      })),
    ),
    visible_data_binding_set_sha256: hash(
      block.block_manifest.shots.flatMap((shot) => shot.data_points),
    ),
    css_token_binding_set_sha256: hash(
      fixture.canonicalArtifacts.designSystem.palette_roles,
    ),
    component_binding_set_sha256: hash(
      block.block_manifest.shots.map((shot) => shot.component_id),
    ),
    hard_failure_codes: [...structuralFailureCodes],
  };
  const core = {
    schema_version: 1,
    inspector_id: 'block-source-structural-v1',
    block_id: block.block_manifest.block_id,
    source_sha256: block.source_bundle.source_sha256,
    source_bytes_sha256: sourceBytesSha256,
    actual_dependency_set_sha256: actualDependencySetSha256,
    parser_evidence: parserEvidence,
    hyperframes_check: hyperframesCheck,
    structural_facts: structuralFacts,
  };
  return {
    ...core,
    inspection_sha256: hash(core),
  };
}

function appendSource(block, relativePath, text) {
  const next = structuredClone(block);
  next.source_bundle.files.find(
    (file) => file.relative_path === relativePath,
  ).content += `\n${text}`;
  return rehashBlock(next);
}

export function mutateTerminalSourceBlock(block, scenario) {
  const next = structuredClone(block);
  const html = next.source_bundle.files.find(
    (file) => file.relative_path === 'index.html',
  );
  if (scenario === 'css_remote_import') {
    return appendSource(
      next,
      'styles.css',
      '@import "https://cdn.invalid/theme.css";',
    );
  }
  if (scenario === 'javascript_remote_import') {
    return appendSource(
      next,
      'block.js',
      'import "https://cdn.invalid/runtime.js";',
    );
  }
  if (scenario === 'computed_math_random') {
    return appendSource(
      next,
      'block.js',
      'const escapedRandom = Math["random"]();',
    );
  }
  if (scenario === 'computed_fetch') {
    return appendSource(
      next,
      'block.js',
      'const escapedFetch = globalThis["fetch"]; escapedFetch("https://cdn.invalid/data.json");',
    );
  }
  if (scenario === 'computed_irreversible_callback') {
    return appendSource(
      next,
      'block.js',
      'timeline.call(() => document.querySelector("#s001-result")["classList"]["add"]("done"));',
    );
  }
  if (scenario === 'math_random_alias') {
    return appendSource(
      next,
      'block.js',
      'const randomAlias = Math.random; randomAlias();',
    );
  }
  if (scenario === 'math_random_alias_chain') {
    return appendSource(
      next,
      'block.js',
      'const firstRandomAlias = Math.random; const secondRandomAlias = firstRandomAlias; secondRandomAlias();',
    );
  }
  if (scenario === 'date_now_alias') {
    return appendSource(
      next,
      'block.js',
      'const clockAlias = Date.now; clockAlias();',
    );
  }
  if (scenario === 'date_now_alias_chain') {
    return appendSource(
      next,
      'block.js',
      'const firstClockAlias = Date.now; const secondClockAlias = firstClockAlias; secondClockAlias();',
    );
  }
  if (scenario === 'unquoted_duplicate_id') {
    return appendSource(next, 'index.html', '<div id=s001-result></div>');
  }
  if (scenario === 'unregistered_css_token') {
    return appendSource(next, 'styles.css', '.rogue{color:#ff00ff}');
  }
  if (scenario === 'missing_auxiliary_consumer') {
    html.content = html.content.replace(
      /<svg data-native-auxiliary="native-relationship-line"[\s\S]*?<\/svg>/u,
      '',
    );
  } else if (scenario === 'missing_primary_consumers') {
    html.content = html.content.replace(
      /<(?:img|video)\b[\s\S]*?(?:\/>|<\/video>)/gu,
      '',
    );
  } else if (scenario === 'unquoted_component') {
    html.content = html.content.replace(
      /data-component="[^"]+"/u,
      'data-component=unregistered-component',
    );
  } else if (scenario === 'visible_data_value') {
    html.content = html.content
      .replace('data-value="80"', 'data-value="81"')
      .replace('>80 percent</div>', '>81 percent</div>');
  } else {
    throw new TypeError(`Unknown terminal source mutation: ${scenario}`);
  }
  return rehashBlock(next);
}

export function createTerminalRuntimeProbe(block, scenario = 'passed') {
  const base = createRuntimeProbe(block);
  const probeRuntime = async (request) => {
    const state = await base.probeRuntime(request);
    if (scenario === 'wrong_font_family') {
      state.loaded_font_family = 'system-ui';
    } else if (scenario === 'wrong_font_weight') {
      state.loaded_font_weight = 900;
    } else if (scenario === 'wrong_primary_material') {
      state.primary_material_consumer.asset_id =
        'ordinary-image-S999';
    } else if (scenario === 'missing_result') {
      state.result_visible = false;
    } else if (scenario === 'invalid_display_visibility') {
      state.display = 'banana';
      state.visibility = 'maybe';
    } else if (scenario !== 'passed') {
      throw new TypeError(`Unknown terminal runtime scenario: ${scenario}`);
    }
    return state;
  };
  return {
    calls: base.calls,
    probeRuntime,
  };
}

export function recomputePixelGeometrySignature(sample) {
  return hash({
    subject_bbox: sample.subject_bbox,
    focal_point: sample.focal_point,
    density_facts: sample.density_facts,
  });
}

export async function runLocalHyperframesFixtureCheck({
  sourceSha256,
} = {}) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'erduo-v3-hyperframes-check-'),
  );
  const binary = fileURLToPath(
    new URL('../node_modules/.bin/hyperframes', import.meta.url),
  );
  const html = [
    '<!doctype html><html lang="und"><head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=64, height=36">',
    '<style>html,body{width:64px;height:36px;margin:0;overflow:hidden}</style>',
    '</head><body>',
    '<div id="root" data-composition-id="main" data-no-timeline ',
    'data-start="0" data-duration="1" data-width="64" data-height="36" ',
    `data-checked-source-sha256="${sourceSha256 ?? '0'.repeat(64)}"></div>`,
    '</body></html>',
  ].join('');
  const hyperframesConfig = {
    $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
  };
  const packageDocument = {
    name: 'erduo-v3-p4-hyperframes-check-fixture',
    private: true,
    type: 'module',
  };
  try {
    await Promise.all([
      writeFile(path.join(root, 'index.html'), html),
      writeFile(
        path.join(root, 'hyperframes.json'),
        JSON.stringify(hyperframesConfig),
      ),
      writeFile(
        path.join(root, 'package.json'),
        JSON.stringify(packageDocument),
      ),
    ]);
    const versionResult = await execFileAsync(binary, ['--version'], {
      cwd: root,
      env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    });
    const checkResult = await execFileAsync(
      binary,
      ['check', '--json'],
      {
        cwd: root,
        env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
        maxBuffer: 16 * 1024 * 1024,
      },
    );
    const parsed = JSON.parse(checkResult.stdout);
    const projectSourceSha256 = hash({
      html: hashBytes(Buffer.from(html, 'utf8')),
      hyperframes_json: hash(hyperframesConfig),
      package_json: hash(packageDocument),
      checked_source_sha256: sourceSha256 ?? '0'.repeat(64),
    });
    return {
      ok: parsed.ok === true,
      version: versionResult.stdout.trim(),
      argv: ['check', '--json'],
      json: parsed,
      project_source_sha256: projectSourceSha256,
      result_sha256: hash(parsed),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

export async function runActualBlockHyperframesCheck(block) {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'erduo-v3-actual-block-check-'),
  );
  const materialRoot = path.join(root, 'materials');
  const binary = fileURLToPath(
    new URL('../node_modules/.bin/hyperframes', import.meta.url),
  );
  const config = {
    $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
  };
  const packageDocument = {
    name: 'erduo-v3-actual-block-check',
    private: true,
    type: 'module',
  };
  const image = block.source_bundle.materials.find(
    (material) => material.media_kind === 'image',
  );
  const video = block.source_bundle.materials.find(
    (material) => material.media_kind === 'video',
  );
  try {
    await mkdir(materialRoot, { recursive: true });
    for (const file of block.source_bundle.files) {
      const target = path.join(root, file.relative_path);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content);
    }
    await Promise.all([
      image
        ? copyFile(
          image.local_path,
          path.join(materialRoot, 'ordinary-primary.ppm'),
        )
        : Promise.resolve(),
      video
        ? copyFile(
          video.local_path,
          path.join(materialRoot, 'ordinary-primary.mp4'),
        )
        : Promise.resolve(),
      copyFile(
        block.source_bundle.font_package.local_path,
        path.join(materialRoot, 'fixture-sans.woff2'),
      ),
      writeFile(
        path.join(root, 'hyperframes.json'),
        JSON.stringify(config),
      ),
      writeFile(
        path.join(root, 'package.json'),
        JSON.stringify(packageDocument),
      ),
    ]);
    const versionResult = await execFileAsync(binary, ['--version'], {
      cwd: root,
      env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    });
    const argv = [
      'check',
      '--json',
      '--samples=1',
      '--no-contrast',
    ];
    let stdout;
    let stderr = '';
    let exitCode = 0;
    try {
      const result = await execFileAsync(binary, argv, {
        cwd: root,
        env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
        maxBuffer: 16 * 1024 * 1024,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error) {
      stdout = error.stdout;
      stderr = error.stderr;
      exitCode = Number.isSafeInteger(error.code) ? error.code : 1;
    }
    const parsed = JSON.parse(stdout);
    return {
      ok: parsed.ok === true,
      exit_code: exitCode,
      version: versionResult.stdout.trim(),
      argv,
      json: parsed,
      stderr_sha256: hashBytes(Buffer.from(stderr ?? '', 'utf8')),
      checked_source_sha256: block.source_bundle.source_sha256,
      result_sha256: hash(parsed),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
