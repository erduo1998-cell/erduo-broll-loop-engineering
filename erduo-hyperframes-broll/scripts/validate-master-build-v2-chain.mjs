import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fingerprintArtifactValue, validateArtifactManifest } from './artifact-manifest.mjs';
import { validateAssetsV2Chain } from './validate-assets-v2-chain.mjs';
import { validateMasterBindings } from './validate-master-bindings.mjs';
import { analyzeVisualPreflight, validateVisualPreflightEvidence } from './visual-preflight-pixels.mjs';
import { parseNormalizedPpm } from './roi-material-contribution.mjs';
import { auditDisplayFontRoleBindings, validateFontPackage, validateRuntimeFontText } from './validate-font-package.mjs';
import { validateManifestMainReviewPacket } from './validate-main-review-packets.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT_ID = /^S[0-9]{3}$/u;
const MAIN_REVIEW_ROLE = 'erduo-hyperframes-broll-main-agent';
const REQUIRED = [
  'master-bindings-v3',
  'hyperframes-source-bundle',
  'neutral-scaffold-receipt',
  'font-package',
  'official-authoring-evidence',
  'source-gate-receipt',
  'pixel-gate-receipt',
  'font-gate-receipt',
  'seek-gate-receipt',
  'delivery-profile-receipt',
  'pre-master-evidence',
  'pre-master-review-index',
];

export class MasterBuildV2ChainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MasterBuildV2ChainError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new MasterBuildV2ChainError(code, message); };
const exact = (value, fields, code = 'master_build_chain_invalid') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, 'Master-build version-2 record has an invalid shape.');
  }
};
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isSha = (value) => typeof value === 'string' && SHA256.test(value);

async function readBytes(root, record) {
  try {
    return await readFile(path.resolve(root, record.locator_key));
  } catch {
    fail('master_build_artifact_unreadable', `Master-build artifact ${record.artifact_id} is unreadable.`);
  }
}

async function readJson(root, record) {
  const bytes = await readBytes(root, record);
  try {
    return { bytes, document: JSON.parse(bytes.toString('utf8')) };
  } catch {
    fail('master_build_artifact_unreadable', `Master-build artifact ${record.artifact_id} is not valid JSON.`);
  }
}

function recordMap(manifest) {
  return new Map(manifest.artifacts.map((record) => [record.artifact_id, record]));
}

function assertArtifact(records, artifactId, expectedSha256, code = 'master_build_artifact_unbound') {
  const record = records.get(artifactId);
  if (!record || expectedSha256 && record.sha256 !== expectedSha256) {
    fail(code, `Master-build artifact ${artifactId} is missing or not hash-bound.`);
  }
  return record;
}

function receiptCore(document) {
  const { receipt_sha256: omitted, ...core } = document;
  return core;
}

function validateReceiptHash(document, code) {
  if (!isSha(document.receipt_sha256)
    || document.receipt_sha256 !== fingerprintArtifactValue(receiptCore(document))) {
    fail(code, 'Gate receipt hash does not bind its exact contents.');
  }
}

function validateNeutralScaffoldReceipt(document) {
  exact(document, ['schema_version', 'pipeline_contract_version', 'scaffold_profile', 'root_profile', 'runtime', 'file_count', 'source_sha256', 'ok'], 'neutral_scaffold_unbound');
  exact(document.root_profile, ['composition_id', 'placeholder_duration_seconds', 'width', 'height'], 'neutral_scaffold_unbound');
  exact(document.runtime, ['script_count', 'style_link_count', 'media_count', 'remote_reference_count'], 'neutral_scaffold_unbound');
  if (document.schema_version !== 1 || document.pipeline_contract_version !== 2
    || document.scaffold_profile !== 'structure-only-neutral-v1'
    || document.root_profile.composition_id !== 'main'
    || document.root_profile.placeholder_duration_seconds !== 1
    || document.runtime.script_count !== 0 || document.runtime.style_link_count !== 0
    || document.runtime.media_count !== 0 || document.runtime.remote_reference_count !== 0
    || !Number.isSafeInteger(document.file_count) || document.file_count < 1
    || !isSha(document.source_sha256) || document.ok !== true) {
    fail('neutral_scaffold_unbound', 'Master-build must begin from the validated structure-only neutral scaffold.');
  }
}

function validateOfficialEvidence(document, bindingsSha256, sourceBundleSha256, neutralReceiptSha256, neutralSourceSha256) {
  exact(document, ['schema_version', 'pipeline_contract_version', 'skills', 'master_bindings_sha256', 'source_bundle_sha256', 'neutral_scaffold_receipt_sha256', 'neutral_scaffold_source_sha256', 'receipt_sha256'], 'official_authoring_unbound');
  if (document.schema_version !== 1 || document.pipeline_contract_version !== 2
    || document.master_bindings_sha256 !== bindingsSha256
    || document.source_bundle_sha256 !== sourceBundleSha256
    || document.neutral_scaffold_receipt_sha256 !== neutralReceiptSha256
    || document.neutral_scaffold_source_sha256 !== neutralSourceSha256
    || !Array.isArray(document.skills)
    || !document.skills.includes('hyperframes:hyperframes')
    || !document.skills.includes('hyperframes:hyperframes-cli')) {
    fail('official_authoring_unbound', 'Official HyperFrames authoring evidence is absent or source-unbound.');
  }
  validateReceiptHash(document, 'official_authoring_unbound');
}

function validateSimpleGate(document, gate, bindingsSha256, sourceBundleSha256) {
  const extra = gate === 'source' ? ['verified_consumer_count']
    : gate === 'pixel' ? ['pre_master_evidence_sha256', 'inspected_shot_count']
      : [];
  exact(document, ['schema_version', 'pipeline_contract_version', 'gate', 'status', 'master_bindings_sha256', 'source_bundle_sha256', ...extra, 'receipt_sha256'], `${gate}_gate_unbound`);
  if (document.schema_version !== 1 || document.pipeline_contract_version !== 2
    || document.gate !== gate || document.status !== 'approved'
    || document.master_bindings_sha256 !== bindingsSha256
    || document.source_bundle_sha256 !== sourceBundleSha256) {
    fail(`${gate}_gate_unbound`, `${gate} gate does not approve the current bindings/source.`);
  }
  validateReceiptHash(document, `${gate}_gate_unbound`);
}

function validateFontGate(document, bindingsSha256, sourceBundleSha256, sourceFiles, records, {
  fontPackageRecord,
  fontPackage,
  manifest,
  runtimeTexts,
  designSlice,
}) {
  exact(document, ['schema_version', 'pipeline_contract_version', 'gate', 'status', 'master_bindings_sha256', 'source_bundle_sha256', 'font_package_sha256', 'display_selection_sha256', 'runtime_audit_sha256', 'required_roles', 'font_artifact_ids', 'verified_font_count', 'fallback_count', 'receipt_sha256'], 'font_gate_unbound');
  let packageReceipt;
  let runtimeAudit;
  let requiredRoles;
  try {
    packageReceipt = validateFontPackage(fontPackage, { artifactManifest: manifest });
    for (const text of runtimeTexts) validateRuntimeFontText(text);
    const runtimeText = runtimeTexts.join('\n');
    requiredRoles = [...new Set(parseElements(runtimeText)
      .filter((element) => element.attributes['data-typography-element-id'])
      .map((element) => element.attributes['data-font-role'])
      .filter(Boolean))].sort();
    runtimeAudit = auditDisplayFontRoleBindings(runtimeText, fontPackage, { requiredRoles });
  } catch {
    fail('font_gate_unbound', 'Actual font package or runtime font bindings failed deterministic validation.');
  }
  const designSelection = designSlice.display_font_selection;
  if (fingerprintArtifactValue(fontPackage.display_selection) !== designSelection.selection_sha256
    || fontPackage.display_selection.primary_visual_dna !== designSelection.primary_visual_dna
    || fontPackage.display_selection.display_font_id !== designSelection.display_font_id) {
    fail('font_gate_unbound', 'Font package display selection differs from the approved director selection.');
  }
  const runtimeText = runtimeTexts.join('\n');
  const expectedFontArtifactIds = [];
  for (const font of fontPackage.fonts) {
    const record = [...records.values()].find((item) => item.kind === 'font'
      && item.sha256 === font.file_sha256 && item.media_type === `font/${font.file_kind}`);
    if (!record || !sourceFiles.has(record.artifact_id)) {
      fail('font_gate_unbound', 'Every package font must resolve to actual source-bundle font bytes.');
    }
    const sourceFile = sourceFiles.get(record.artifact_id);
    const declaredSourcePath = font.css.src.replace(/^(?:\.\/)+/u, '');
    const actualSourcePath = sourceFile.relative_path.replace(/^(?:\.\/)+/u, '');
    if (declaredSourcePath !== actualSourcePath) {
      fail('font_gate_unbound', 'Every package font CSS source must equal its source-bundle relative path.');
    }
    expectedFontArtifactIds.push(record.artifact_id);
    const family = font.family.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const src = font.css.src.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    if (!new RegExp(`@font-face\\s*\\{[^}]*font-family:\\s*"${family}"[^}]*src:\\s*url\\("${src}"\\)`, 'u').test(runtimeText)
      || !new RegExp(`\\[data-font-id=["']${font.font_id}["']\\][^}]*font-family:\\s*"${family}"`, 'u').test(runtimeText)) {
      fail('font_gate_unbound', 'Every package font needs local @font-face and runtime typography binding.');
    }
  }
  for (const shot of designSlice.shots) {
    for (const type of shot.typography.elements) {
      const font = fontPackage.fonts.find((item) => item.font_id === type.font_id);
      if (!font || font.family !== type.font_family || font.weight !== type.weight) {
        fail('font_gate_unbound', 'Every approved typography element must resolve to a matching packaged font family and weight.');
      }
    }
  }
  if (document.schema_version !== 1 || document.pipeline_contract_version !== 2
    || document.gate !== 'font' || document.status !== 'approved'
    || document.master_bindings_sha256 !== bindingsSha256
    || document.source_bundle_sha256 !== sourceBundleSha256
    || document.font_package_sha256 !== fontPackageRecord.sha256
    || document.display_selection_sha256 !== fingerprintArtifactValue(fontPackage.display_selection)
    || document.runtime_audit_sha256 !== fingerprintArtifactValue(runtimeAudit)
    || JSON.stringify(document.required_roles) !== JSON.stringify(requiredRoles)
    || !Array.isArray(document.font_artifact_ids) || !document.font_artifact_ids.length
    || JSON.stringify([...document.font_artifact_ids].sort()) !== JSON.stringify(expectedFontArtifactIds.sort())
    || document.verified_font_count !== document.font_artifact_ids.length
    || document.fallback_count !== 0
    || new Set(document.font_artifact_ids).size !== document.font_artifact_ids.length) {
    fail('font_gate_unbound', 'Font gate does not bind verified local fonts with zero fallback.');
  }
  if (packageReceipt.role_count !== document.verified_font_count) {
    fail('font_gate_unbound', 'Font gate count differs from the validated font package.');
  }
  for (const artifactId of document.font_artifact_ids) {
    const file = sourceFiles.get(artifactId);
    const record = records.get(artifactId);
    if (!file || !record || !record.media_type.startsWith('font/')) {
      fail('font_gate_unbound', 'Every verified font must be a source-bundle artifact.');
    }
  }
  validateReceiptHash(document, 'font_gate_unbound');
}

function frameToNearestMs(frame, fps) {
  const numerator = BigInt(frame) * 1000n * BigInt(fps.denominator);
  const denominator = BigInt(fps.numerator);
  return Number((numerator * 2n + denominator) / (denominator * 2n));
}

async function validateSeekGate(document, bindings, bindingsSha256, sourceBundleSha256, root, records, preMasterEvidence, fps) {
  exact(document, ['schema_version', 'pipeline_contract_version', 'gate', 'status', 'master_bindings_sha256', 'source_bundle_sha256', 'checks', 'receipt_sha256'], 'seek_gate_unbound');
  if (document.schema_version !== 1 || document.pipeline_contract_version !== 2
    || document.gate !== 'seek' || document.status !== 'approved'
    || document.master_bindings_sha256 !== bindingsSha256
    || document.source_bundle_sha256 !== sourceBundleSha256
    || !Array.isArray(document.checks)
    || document.checks.length !== bindings.shots.length * 3) {
    fail('seek_gate_unbound', 'Seek gate does not cover every shot state.');
  }
  const stateByShot = new Map(preMasterEvidence.shots.map((shot) => [shot.shot_id, shot]));
  let cursor = 0;
  for (const shot of bindings.shots) {
    const expectedFrames = {
      entry: shot.frame_window.start_frame + shot.lifecycle.entry.start_frame,
      result: shot.frame_window.start_frame + shot.lifecycle.result.start_frame,
      exit: shot.frame_window.start_frame + shot.lifecycle.exit.start_frame,
    };
    for (const state of ['entry', 'result', 'exit']) {
      const check = document.checks[cursor++];
      exact(check, ['shot_id', 'state', 'expected_frame', 'pre_master_timestamp_ms', 'paths'], 'seek_gate_unbound');
      exact(check.paths, ['fresh_direct', 'zero_to_t', 'end_to_t', 'random_to_t'], 'seek_gate_unbound');
      if (check.shot_id !== shot.shot_id || check.state !== state
        || check.expected_frame !== expectedFrames[state]
        || check.pre_master_timestamp_ms !== frameToNearestMs(check.expected_frame, fps)
        || stateByShot.get(shot.shot_id)?.[state]?.timestamp_ms !== check.pre_master_timestamp_ms) {
        fail('seek_gate_unbound', 'Seek target/timestamp does not agree with the shared rational frame projection.');
      }
      const pathRecords = [];
      const pathFrames = [];
      for (const [seekPath, artifact] of Object.entries(check.paths)) {
        exact(artifact, ['artifact_id', 'sha256', 'size_bytes'], 'seek_gate_unbound');
        const record = assertArtifact(records, artifact.artifact_id, artifact.sha256, 'seek_gate_unbound');
        if (record.size_bytes !== artifact.size_bytes || !record.media_type.startsWith('image/')) {
          fail('seek_gate_unbound', `${seekPath} does not resolve to actual manifest-bound image bytes.`);
        }
        const bytes = await readBytes(root, record);
        if (hashBytes(bytes) !== artifact.sha256 || bytes.length !== artifact.size_bytes) {
          fail('seek_gate_unbound', `${seekPath} bytes differ from its seek receipt.`);
        }
        pathRecords.push(artifact);
        pathFrames.push(parseNormalizedPpm(bytes, `$.seek.${check.shot_id}.${state}.${seekPath}`));
      }
      const expectedState = stateByShot.get(shot.shot_id)?.[state];
      const expectedStateRecord = assertArtifact(records, expectedState?.frame_artifact_id, expectedState?.frame_sha256, 'seek_gate_unbound');
      const expectedStateFrame = parseNormalizedPpm(await readBytes(root, expectedStateRecord), `$.pre_master.${check.shot_id}.${state}`);
      const sameFrame = (left, right) => left.width === right.width && left.height === right.height && left.pixels.equals(right.pixels);
      if (new Set(pathRecords.map((item) => item.artifact_id)).size !== 4
        || pathFrames.some((frame) => !sameFrame(frame, pathFrames[0]))
        || !sameFrame(pathFrames[0], expectedStateFrame)) {
        fail('seek_path_divergence', 'Fresh, zero-origin, reverse and random-origin seeks must produce equivalent actual pixels for the target state.');
      }
    }
  }
  validateReceiptHash(document, 'seek_gate_unbound');
}

function validateProfile(document, bindings, bindingsSha256, sourceBundleSha256, fps) {
  exact(document, ['schema_version', 'pipeline_contract_version', 'gate', 'status', 'profile_id', 'profile_sha256', 'master_bindings_sha256', 'source_bundle_sha256', 'target_raster', 'fps', 'video_codec', 'audio_mode', 'receipt_sha256'], 'profile_gate_unbound');
  exact(document.target_raster, ['width', 'height'], 'profile_gate_unbound');
  exact(document.fps, ['numerator', 'denominator'], 'profile_gate_unbound');
  if (document.schema_version !== 1 || document.pipeline_contract_version !== 2
    || document.gate !== 'delivery-profile' || document.status !== 'approved'
    || document.master_bindings_sha256 !== bindingsSha256
    || document.source_bundle_sha256 !== sourceBundleSha256
    || fingerprintArtifactValue(document.target_raster) !== fingerprintArtifactValue(bindings.target_raster)
    || fingerprintArtifactValue(document.fps) !== fingerprintArtifactValue(fps)
    || document.profile_id !== `${document.target_raster.width}x${document.target_raster.height}-${document.fps.numerator}_${document.fps.denominator}-${document.video_codec}-${document.audio_mode}-v1`
    || document.profile_sha256 !== fingerprintArtifactValue({
      target_raster: document.target_raster,
      fps: document.fps,
      video_codec: document.video_codec,
      audio_mode: document.audio_mode,
    })
    || !['h264', 'hevc', 'prores'].includes(document.video_codec)
    || !['preserve-source', 'silent'].includes(document.audio_mode)) {
    fail('profile_gate_unbound', 'Delivery profile must bind exact raster, rational fps, codec and audio facts.');
  }
  validateReceiptHash(document, 'profile_gate_unbound');
}

function parseAttributes(text) {
  const attributes = {};
  for (const match of text.matchAll(/([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(["'])([^]*?)\2/gu)) {
    attributes[match[1].toLowerCase()] = match[3];
  }
  return attributes;
}

function parseElements(html) {
  const elements = [];
  for (const match of html.matchAll(/<([A-Za-z][A-Za-z0-9:-]*)\b([^>]*)>/gu)) {
    elements.push({ tag: match[1].toLowerCase(), attributes: parseAttributes(match[2]) });
  }
  return elements;
}

function validateDesignConsumption(htmlTexts, bindings, designSlice) {
  const joined = htmlTexts.join('\n');
  const elements = parseElements(joined);
  const rootElements = elements.filter((element) => element.attributes['data-composition-id'] === 'main');
  if (rootElements.length !== 1 || rootElements[0].attributes['data-style-dna-id'] !== designSlice.style_dna.dna_id) {
    fail('source_design_binding_drift', 'Authored root does not bind the approved Style DNA identity.');
  }
  for (const [index, shot] of bindings.shots.entries()) {
    const designShot = designSlice.shots[index];
    const scenes = elements.filter((element) => element.attributes['data-scene-shot-id'] === shot.shot_id);
    if (scenes.length !== 1 || !new RegExp(`<\\/${scenes[0]?.tag}>`, 'u').test(joined)) {
      fail('source_design_binding_drift', 'Each approved shot needs exactly one correctly closed authored design-binding scene node.');
    }
    const sceneAttributes = scenes[0].attributes;
    if (sceneAttributes['data-design-shot-sha256'] !== shot.design_shot_sha256
      || sceneAttributes['data-flat-shot-kit-sha256'] !== shot.flat_shot_kit_sha256
      || sceneAttributes['data-composition-family'] !== designShot.composition.family_id
      || sceneAttributes['data-motion-grammar'] !== designShot.motion.grammar_id) {
      fail('source_design_binding_drift', 'Authored scene changed the approved design/kit/family/motion identity.');
    }
    for (const phase of ['entry', 'action', 'result', 'hold', 'exit']) {
      if (Number(sceneAttributes[`data-${phase}-start-frame`]) !== designShot.motion[phase].start_frame
        || Number(sceneAttributes[`data-${phase}-end-frame`]) !== designShot.motion[phase].end_frame) {
        fail('source_design_binding_drift', 'Authored scene lifecycle differs from the approved five-phase motion grammar.');
      }
    }
    for (const type of designShot.typography.elements) {
      const typeNodes = elements.filter((element) => element.attributes['data-typography-shot-id'] === shot.shot_id
        && element.attributes['data-typography-element-id'] === type.element_id);
      const attributes = typeNodes[0]?.attributes ?? {};
      if (typeNodes.length !== 1
        || attributes['data-design-type-role'] !== type.role
        || attributes['data-font-id'] !== type.font_id
        || attributes['data-font-family'] !== type.font_family
        || Number(attributes['data-font-weight']) !== type.weight
        || attributes['data-content-lines-sha256'] !== fingerprintArtifactValue(type.content_lines)) {
        fail('source_typography_binding_drift', 'Authored typography node does not bind the approved element, role, font and explicit lines.');
      }
      const explicitLines = elements
        .filter((element) => element.attributes['data-line-shot-id'] === shot.shot_id
          && element.attributes['data-line-parent-id'] === type.element_id)
        .map((element) => ({
          index: Number(element.attributes['data-line-index']),
          sha256: element.attributes['data-line-sha256'],
        }));
      const expectedLines = type.content_lines.map((line, lineIndex) => ({
        index: lineIndex,
        sha256: fingerprintArtifactValue(line),
      }));
      if (JSON.stringify(explicitLines) !== JSON.stringify(expectedLines)) {
        fail('source_typography_binding_drift', 'Authored visible text does not preserve the approved explicit line breaks.');
      }
    }
  }
}

function validateSourceBundle(index, root, records, bindings, kits, fps, designSlice) {
  exact(index, ['schema_version', 'pipeline_contract_version', 'entry_artifact_id', 'files'], 'source_bundle_invalid');
  if (index.schema_version !== 1 || index.pipeline_contract_version !== 2
    || typeof index.entry_artifact_id !== 'string' || !index.entry_artifact_id
    || !Array.isArray(index.files) || !index.files.length) {
    fail('source_bundle_invalid', 'Source bundle index is invalid.');
  }
  const sourceFiles = new Map();
  const relativePaths = new Set();
  for (const file of index.files) {
    exact(file, ['artifact_id', 'relative_path', 'sha256', 'size_bytes', 'media_type'], 'source_bundle_invalid');
    const record = records.get(file.artifact_id);
    if (!record || sourceFiles.has(file.artifact_id) || relativePaths.has(file.relative_path)
      || record.sha256 !== file.sha256 || record.size_bytes !== file.size_bytes
      || record.media_type !== file.media_type || record.locator_key !== file.relative_path
      || path.posix.isAbsolute(file.relative_path) || path.posix.normalize(file.relative_path) !== file.relative_path
      || file.relative_path.startsWith('../')) {
      fail('source_bundle_unbound', 'Source bundle file does not match one exact local manifest artifact.');
    }
    sourceFiles.set(file.artifact_id, file);
    relativePaths.add(file.relative_path);
  }
  const htmlFiles = index.files.filter((file) => file.media_type === 'text/html');
  const executableTextFiles = index.files.filter((file) => ['text/html', 'text/css', 'application/javascript', 'text/javascript'].includes(file.media_type));
  if (!sourceFiles.has(index.entry_artifact_id) || !htmlFiles.length
    || sourceFiles.get(index.entry_artifact_id).media_type !== 'text/html') {
    fail('source_bundle_invalid', 'Source bundle needs one manifest-bound HTML entry.');
  }
  return Promise.all([
    Promise.all(htmlFiles.map(async (file) => (await readBytes(root, records.get(file.artifact_id))).toString('utf8'))),
    Promise.all(executableTextFiles.map(async (file) => (await readBytes(root, records.get(file.artifact_id))).toString('utf8'))),
  ]).then(([htmlTexts, executableTexts]) => {
      const joined = htmlTexts.join('\n');
      validateDesignConsumption(htmlTexts, bindings, designSlice);
      const executableJoined = executableTexts.join('\n');
      if (/(?:https?:|["'(]\s*\/\/[^/]|data:|blob:|file:)/iu.test(executableJoined)
        || /@import\s+(?:url\()?["']?(?:https?:|\/\/)/iu.test(executableJoined)
        || /\bfetch\s*\(\s*["'](?:https?:|\/\/)/iu.test(executableJoined)) {
        fail('remote_source_forbidden', 'All authored HTML/CSS/JS may reference only local manifest-bound dependencies.');
      }
      const legacyClasses = ['backdrop', 'media-frame', 'native-support', 'semantic-shape', 'type-lockup', 'split-field', 'evidence-stack', 'flow-line', 'turn-ring'];
      if (/\bdata-m10-composition\b/u.test(joined)
        && legacyClasses.every((className) => new RegExp(`(?:^|[^A-Za-z0-9_-])${className}(?:[^A-Za-z0-9_-]|$)`, 'u').test(joined))) {
        fail('legacy_scaffold_signature_forbidden', 'Authored source retains the complete legacy M10 template signature instead of consuming the neutral scaffold.');
      }
      const elements = htmlTexts.flatMap(parseElements);
      const roots = elements.filter((element) => element.attributes['data-composition-id'] === 'main');
      const timelineEndFrame = Math.max(...bindings.shots.map((shot) => shot.frame_window.end_frame));
      const timelineDuration = timelineEndFrame * fps.denominator / fps.numerator;
      if (roots.length !== 1
        || Number(roots[0].attributes['data-width']) !== bindings.target_raster.width
        || Number(roots[0].attributes['data-height']) !== bindings.target_raster.height
        || Number(roots[0].attributes['data-duration']) !== timelineDuration) {
        fail('source_root_contract_drift', 'Authored root composition duration/raster differs from the shared frame projection and target raster.');
      }
      const tracks = new Map();
      for (const [index, consumer] of bindings.primary_consumers.entries()) {
        const matches = elements.filter((element) => element.attributes.id === consumer.source_element_id);
        if (matches.length !== 1) fail('source_selector_mismatch', 'Each primary consumer selector must resolve to exactly one authored element.');
        const element = matches[0];
        const asset = bindings.ordinary_assets.find((item) => item.asset_id === consumer.asset_id);
        const sourceFile = sourceFiles.get(asset.locator_id);
        const kit = kits.get(consumer.shot_id);
        if (!sourceFile || !kit
          || element.attributes['data-source-artifact-id'] !== asset.locator_id
          || element.attributes['data-source-sha256'] !== asset.source_sha256
          || element.attributes['data-source-path'] !== sourceFile.relative_path) {
          fail('source_asset_mapping_unbound', 'Authored primary consumer does not map to the exact local ordinary source artifact.');
        }
        if ((consumer.element === 'img' && element.tag !== 'img')
          || (consumer.element === 'video' && element.tag !== 'video')
          || (consumer.element === 'background-image' && element.tag !== 'div')) {
          fail('source_consumer_type_mismatch', 'Authored primary consumer tag is not type-correct.');
        }
        if (consumer.element !== 'background-image' && element.attributes.src !== sourceFile.relative_path) {
          fail('source_asset_mapping_unbound', 'Image/video consumer src does not use the exact local source path.');
        }
        const shot = bindings.shots[index];
        const frameWindow = shot.frame_window;
        if (!String(element.attributes.class ?? '').split(/\s+/u).includes('clip')
          || Number(element.attributes['data-start-frame']) !== frameWindow.start_frame
          || Number(element.attributes['data-duration-frames']) !== frameWindow.duration_frames
          || Number(element.attributes['data-start']) !== frameWindow.start_frame * fps.denominator / fps.numerator
          || Number(element.attributes['data-duration']) !== frameWindow.duration_frames * fps.denominator / fps.numerator) {
          fail('source_timing_drift', 'Authored clip timing differs from the absolute shared frame projection.');
        }
        const trackIndex = Number(element.attributes['data-track-index']);
        if (!Number.isSafeInteger(trackIndex) || trackIndex < 0 || trackIndex > 1024) {
          fail('source_timing_drift', 'Authored clip track index must be a bounded safe integer.');
        }
        const trackWindows = tracks.get(trackIndex) ?? [];
        if (trackWindows.some((window) => frameWindow.start_frame < window.end_frame && window.start_frame < frameWindow.end_frame)) {
          fail('source_track_overlap', 'Clips on one track cannot overlap in the shared frame projection.');
        }
        trackWindows.push(frameWindow);
        tracks.set(trackIndex, trackWindows);
        const target = kit.consumer_plan.target_bbox;
        if (Number(element.attributes['data-target-x']) !== target.x
          || Number(element.attributes['data-target-y']) !== target.y
          || Number(element.attributes['data-target-width']) !== target.width
          || Number(element.attributes['data-target-height']) !== target.height
          || Number(element.attributes['data-opacity-bp']) !== consumer.opacity_basis_points
          || element.attributes['data-fit'] !== consumer.fit) {
          fail('source_geometry_drift', 'Authored consumer geometry/opacity binding metadata differs from its approved flat kit.');
        }
      }
      return {
        sourceFiles,
        verifiedConsumerCount: bindings.primary_consumers.length,
        runtimeTexts: executableTexts,
      };
    });
}

async function validatePacket(packet, root, records, bindings, designSlice, kits, preMasterEvidence) {
  const fields = [
    'schema_version', 'pipeline_contract_version', 'assets_manifest_sha256',
    'shot_plan_sha256', 'design_slice_sha256', 'flat_shot_kit_set_sha256',
    'master_bindings_sha256', 'source_bundle_sha256',
    'official_authoring_evidence_sha256', 'neutral_scaffold_receipt_sha256', 'source_gate_receipt_sha256',
    'pixel_gate_receipt_sha256', 'font_gate_receipt_sha256',
    'seek_gate_receipt_sha256', 'delivery_profile_receipt_sha256',
    'target_raster', 'shot_count', 'pages', 'packet_sha256',
  ];
  exact(packet, fields, 'pre_master_packet_invalid');
  const core = { ...packet };
  delete core.packet_sha256;
  if (packet.schema_version !== 1 || packet.pipeline_contract_version !== 2
    || packet.shot_count !== bindings.shots.length
    || fingerprintArtifactValue(packet.target_raster) !== fingerprintArtifactValue(bindings.target_raster)
    || packet.packet_sha256 !== fingerprintArtifactValue(core)
    || !Array.isArray(packet.pages) || !packet.pages.length || packet.pages.length > 256) {
    fail('pre_master_packet_invalid', 'Pre-master packet identity, raster or coverage is invalid.');
  }
  const evidenceByShot = new Map(preMasterEvidence.shots.map((shot) => [shot.shot_id, shot]));
  let nextShot = 1;
  const visualHashes = [];
  const factsHashes = [];
  for (const page of packet.pages) {
    exact(page, ['visual', 'facts'], 'pre_master_packet_invalid');
    exact(page.visual, ['artifact_id', 'sha256', 'size_bytes'], 'pre_master_packet_invalid');
    exact(page.facts, ['artifact_id', 'sha256', 'size_bytes', 'shot_start', 'shot_end'], 'pre_master_packet_invalid');
    const visualRecord = assertArtifact(records, page.visual.artifact_id, page.visual.sha256, 'pre_master_packet_unbound');
    const factsRecord = assertArtifact(records, page.facts.artifact_id, page.facts.sha256, 'pre_master_packet_unbound');
    if (!visualRecord.media_type.startsWith('image/') || visualRecord.size_bytes !== page.visual.size_bytes
      || factsRecord.media_type !== 'application/json' || factsRecord.size_bytes !== page.facts.size_bytes
      || page.facts.shot_start !== nextShot || !Number.isSafeInteger(page.facts.shot_end)
      || page.facts.shot_end < nextShot || page.facts.shot_end > bindings.shots.length) {
      fail('pre_master_packet_incomplete', 'Pre-master paired pages are missing, mismatched or non-contiguous.');
    }
    const facts = (await readJson(root, factsRecord)).document;
    if (!Array.isArray(facts) || facts.length !== page.facts.shot_end - page.facts.shot_start + 1) {
      fail('pre_master_packet_incomplete', 'Pre-master facts page does not cover its paired visual range.');
    }
    for (const [offset, row] of facts.entries()) {
      const shotIndex = page.facts.shot_start + offset - 1;
      const shot = bindings.shots[shotIndex];
      const designShot = designSlice.shots[shotIndex];
      const kit = kits.get(shot.shot_id);
      const evidence = evidenceByShot.get(shot.shot_id);
      exact(row, ['shot_id', 'design_slice_shot_sha256', 'flat_shot_kit_sha256', 'master_binding_shot_sha256', 'frame_window', 'entry', 'result', 'exit', 'enabled_frame', 'disabled_frame', 'roi_diff', 'result_roi', 'changed_pixel_count', 'roi_pixel_count'], 'pre_master_packet_invalid');
      for (const state of ['entry', 'result', 'exit']) exact(row[state], ['artifact_id', 'sha256', 'timestamp_ms'], 'pre_master_packet_invalid');
      for (const state of ['enabled_frame', 'disabled_frame', 'roi_diff']) exact(row[state], ['artifact_id', 'sha256'], 'pre_master_packet_invalid');
      if (!shot || !designShot || !kit || !evidence || row.shot_id !== `S${String(shotIndex + 1).padStart(3, '0')}`
        || row.design_slice_shot_sha256 !== shot.design_shot_sha256
        || row.flat_shot_kit_sha256 !== shot.flat_shot_kit_sha256
        || row.master_binding_shot_sha256 !== fingerprintArtifactValue(shot)
        || fingerprintArtifactValue(row.frame_window) !== fingerprintArtifactValue(shot.frame_window)
        || fingerprintArtifactValue(row.result_roi) !== fingerprintArtifactValue(shot.result_roi)
        || row.changed_pixel_count !== shot.contribution.changed_pixel_count
        || row.roi_pixel_count !== shot.contribution.roi_pixel_count) {
        fail('pre_master_packet_facts_mismatch', 'Pre-master facts row differs from the approved design, kit or master binding.');
      }
      for (const state of ['entry', 'result', 'exit']) {
        const record = assertArtifact(records, row[state].artifact_id, row[state].sha256, 'pre_master_frame_unbound');
        if (row[state].artifact_id !== evidence[state].frame_artifact_id
          || row[state].sha256 !== evidence[state].frame_sha256
          || row[state].timestamp_ms !== evidence[state].timestamp_ms
          || !record.media_type.startsWith('image/')) {
          fail('pre_master_frame_unbound', 'Entry/result/exit evidence is not actual manifest-bound image bytes.');
        }
      }
      const contributionPairs = [
        ['enabled_frame', shot.contribution.enabled_frame],
        ['disabled_frame', shot.contribution.disabled_frame],
        ['roi_diff', shot.contribution.roi_diff],
      ];
      for (const [name, expected] of contributionPairs) {
        const record = assertArtifact(records, row[name].artifact_id, row[name].sha256, 'pre_master_contribution_unbound');
        if (row[name].artifact_id !== expected.artifact_id || row[name].sha256 !== expected.sha256
          || !record.media_type.startsWith('image/')) {
          fail('pre_master_contribution_unbound', 'Pre-master facts do not bind the verified contribution artifacts.');
        }
      }
    }
    nextShot = page.facts.shot_end + 1;
    visualHashes.push(visualRecord.sha256);
    factsHashes.push(factsRecord.sha256);
  }
  if (nextShot !== bindings.shots.length + 1) fail('pre_master_packet_incomplete', 'Pre-master packet does not cover every shot.');
  return { visualHashes, factsHashes };
}

async function validateHtmlPreviewReview(review, {
  manifest,
  root,
  assetsManifest,
  bindings,
  bindingsRecord,
  sourceBundleRecord,
  packetRecord,
  visualHashes,
  factsHashes,
}) {
  if (!review) fail('main_agent_review_missing', 'Master-build requires independent main-agent HTML preview review.');
  const fields = [
    'approval_sha256', 'authority_scope', 'deterministic_result', 'gate',
    'pipeline_contract_version', 'producer_isolation_sha256',
    'review_packet_sha256', 'reviewer_isolation_sha256',
    'reviewer_model_id', 'reviewer_role', 'status',
    'subject_manifest_sha256', 'assets_manifest_sha256', 'shot_plan_sha256',
    'design_slice_sha256', 'flat_shot_kit_set_sha256',
    'master_bindings_sha256', 'source_bundle_sha256',
    'inspected_packet_sha256', 'inspected_visual_page_sha256s',
    'inspected_facts_page_sha256s', 'visual_decision',
  ];
  exact(review, fields, 'master_review_unbound');
  if (review.gate !== 'html_preview_review' || review.status !== 'approved'
    || review.reviewer_role !== MAIN_REVIEW_ROLE
    || review.subject_manifest_sha256 !== manifest.manifest_sha256
    || review.assets_manifest_sha256 !== assetsManifest.manifest_sha256
    || review.shot_plan_sha256 !== bindings.shot_plan_sha256
    || review.design_slice_sha256 !== bindings.design_slice_sha256
    || review.flat_shot_kit_set_sha256 !== bindings.flat_shot_kit_set_sha256
    || review.master_bindings_sha256 !== bindingsRecord.sha256
    || review.source_bundle_sha256 !== sourceBundleRecord.sha256
    || review.inspected_packet_sha256 !== packetRecord.sha256
    || JSON.stringify(review.inspected_visual_page_sha256s) !== JSON.stringify(visualHashes)
    || JSON.stringify(review.inspected_facts_page_sha256s) !== JSON.stringify(factsHashes)
    || !isSha(review.reviewer_isolation_sha256) || !isSha(review.approval_sha256)) {
    fail('master_review_unbound', 'Main HTML preview review does not bind the complete inspected master-build chain.');
  }
  if (review.reviewer_isolation_sha256 === manifest.producer_isolation_sha256) {
    fail('self_attested_review', 'Master-build producer cannot issue its own main-agent review.');
  }
  try {
    await validateManifestMainReviewPacket({ review, manifest, root });
  } catch (error) {
    fail(error?.code ?? 'master_review_unbound', error?.message ?? 'HTML preview review authority is invalid.');
  }
}

export async function validateMasterBuildV2Chain({
  manifest,
  root,
  assetsManifest,
  assetsRoot,
  directorManifest,
  directorRoot,
  shotPlanReview,
  assetFactReview,
  htmlPreviewReview,
}) {
  if (manifest?.pipeline_contract_version !== 2 || assetsManifest?.pipeline_contract_version !== 2
    || directorManifest?.pipeline_contract_version !== 2) {
    fail('pipeline_upgrade_required', 'Master-build chain requires pipeline contract version 2 and schema-3 bindings.');
  }
  if (manifest.stage !== 'master-build' || assetsManifest.stage !== 'assets' || directorManifest.stage !== 'director') {
    fail('master_build_chain_invalid', 'Master-build chain requires director, assets and master-build manifests.');
  }
  const assets = await validateAssetsV2Chain({
    manifest: assetsManifest,
    root: assetsRoot,
    directorManifest,
    directorRoot,
    shotPlanReview,
    assetFactReview,
  });
  await validateArtifactManifest(manifest, {
    root,
    expectedStage: 'master-build',
    expectedUpstream: assetsManifest.manifest_sha256,
    expectedCreativeBriefSha256: assetsManifest.creative_brief_sha256,
  });
  const records = recordMap(manifest);
  for (const artifactId of REQUIRED) {
    const code = artifactId === 'official-authoring-evidence' ? 'official_hyperframes_skill_missing' : 'master_build_artifact_missing';
    assertArtifact(records, artifactId, null, code);
  }
  const directorRecords = recordMap(directorManifest);
  const assetsRecords = recordMap(assetsManifest);
  const [designResolved, projectionResolved, kitSetResolved, bindingsResolved, sourceBundleResolved, preMasterResolved] = await Promise.all([
    readJson(directorRoot, assertArtifact(directorRecords, 'design-slice')),
    readJson(directorRoot, assertArtifact(directorRecords, 'frame-projection')),
    readJson(assetsRoot, assertArtifact(assetsRecords, 'flat-shot-kit-set')),
    readJson(root, records.get('master-bindings-v3')),
    readJson(root, records.get('hyperframes-source-bundle')),
    readJson(root, records.get('pre-master-evidence')),
  ]);
  const kitSet = kitSetResolved.document;
  const kitArtifacts = new Map();
  const kits = new Map();
  for (const item of kitSet.kits ?? []) {
    const record = assertArtifact(assetsRecords, item.artifact_id, item.sha256, 'master_build_kit_unbound');
    const bytes = await readBytes(assetsRoot, record);
    kitArtifacts.set(item.artifact_id, bytes);
    try { kits.set(item.shot_id, JSON.parse(bytes.toString('utf8'))); } catch { fail('master_build_kit_unbound', 'Resolved flat Shot Kit is not valid JSON.'); }
  }
  const sourceArtifacts = new Map();
  for (const asset of bindingsResolved.document.ordinary_assets ?? []) {
    sourceArtifacts.set(asset.locator_id, await readBytes(assetsRoot, assertArtifact(assetsRecords, asset.locator_id, asset.source_sha256, 'ordinary_source_bytes_missing')));
  }
  const contributionArtifacts = new Map();
  for (const shot of bindingsResolved.document.shots ?? []) {
    for (const evidence of [shot.contribution?.enabled_frame, shot.contribution?.disabled_frame, shot.contribution?.roi_diff]) {
      if (evidence) contributionArtifacts.set(evidence.artifact_id, await readBytes(root, assertArtifact(records, evidence.artifact_id, evidence.sha256, 'pre_master_contribution_unbound')));
    }
  }
  const bindingReceipt = validateMasterBindings(bindingsResolved.document, {
    designSliceBytes: designResolved.bytes,
    frameProjectionBytes: projectionResolved.bytes,
    flatShotKitSetBytes: kitSetResolved.bytes,
    kitArtifacts,
    sourceArtifacts,
    contributionArtifacts,
  });
  if (bindingReceipt.shot_count !== assets.shot_count
    || bindingReceipt.binding_sha256 !== fingerprintArtifactValue(bindingsResolved.document)
    || records.get('master-bindings-v3').sha256 !== hashBytes(bindingsResolved.bytes)) {
    fail('master_bindings_unbound', 'Schema-3 bindings do not cover the approved assets chain.');
  }
  const sourceBundleRecord = records.get('hyperframes-source-bundle');
  const sourceBundle = await validateSourceBundle(
    sourceBundleResolved.document,
    root,
    records,
    bindingsResolved.document,
    kits,
    projectionResolved.document.fps,
    designResolved.document,
  );
  const bindingsSha256 = records.get('master-bindings-v3').sha256;
  const sourceBundleSha256 = sourceBundleRecord.sha256;
  const official = (await readJson(root, records.get('official-authoring-evidence'))).document;
  const neutralScaffoldRecord = records.get('neutral-scaffold-receipt');
  const neutralScaffold = (await readJson(root, neutralScaffoldRecord)).document;
  const sourceGate = (await readJson(root, records.get('source-gate-receipt'))).document;
  const pixelGate = (await readJson(root, records.get('pixel-gate-receipt'))).document;
  const fontGate = (await readJson(root, records.get('font-gate-receipt'))).document;
  const fontPackageRecord = records.get('font-package');
  const fontPackage = (await readJson(root, fontPackageRecord)).document;
  const seekGate = (await readJson(root, records.get('seek-gate-receipt'))).document;
  const profile = (await readJson(root, records.get('delivery-profile-receipt'))).document;
  validateNeutralScaffoldReceipt(neutralScaffold);
  validateOfficialEvidence(
    official,
    bindingsSha256,
    sourceBundleSha256,
    neutralScaffoldRecord.sha256,
    neutralScaffold.source_sha256,
  );
  validateSimpleGate(sourceGate, 'source', bindingsSha256, sourceBundleSha256);
  if (sourceGate.verified_consumer_count !== sourceBundle.verifiedConsumerCount) fail('source_gate_unbound', 'Source gate consumer count does not equal authored source.');
  validateVisualPreflightEvidence(preMasterResolved.document);
  const pixelAnalysis = await analyzeVisualPreflight(preMasterResolved.document, {
    readFrame: async (artifactId) => readBytes(
      root,
      assertArtifact(records, artifactId, null, 'pre_master_frame_unbound'),
    ),
  });
  if (pixelAnalysis.status !== 'approved'
    || pixelAnalysis.inspected_shot_ids.length !== bindingReceipt.shot_count
    || pixelAnalysis.inspected_state_count !== bindingReceipt.shot_count * 3) {
    fail('pixel_gate_unbound', 'Actual manifest-resolved entry/result/exit pixels did not pass the complete deterministic pre-master gate.');
  }
  validateSimpleGate(pixelGate, 'pixel', bindingsSha256, sourceBundleSha256);
  if (pixelGate.pre_master_evidence_sha256 !== records.get('pre-master-evidence').sha256
    || pixelGate.inspected_shot_count !== bindingReceipt.shot_count) {
    fail('pixel_gate_unbound', 'Pixel gate does not bind complete actual pre-master evidence.');
  }
  validateFontGate(fontGate, bindingsSha256, sourceBundleSha256, sourceBundle.sourceFiles, records, {
    fontPackageRecord,
    fontPackage,
    manifest,
    runtimeTexts: sourceBundle.runtimeTexts,
    designSlice: designResolved.document,
  });
  await validateSeekGate(
    seekGate,
    bindingsResolved.document,
    bindingsSha256,
    sourceBundleSha256,
    root,
    records,
    preMasterResolved.document,
    projectionResolved.document.fps,
  );
  validateProfile(profile, bindingsResolved.document, bindingsSha256, sourceBundleSha256, projectionResolved.document.fps);

  const packetRecord = records.get('pre-master-review-index');
  if (packetRecord.size_bytes > 8 * 1024) fail('pre_master_packet_too_large', 'Pre-master packet index exceeds 8 KiB.');
  const packet = (await readJson(root, packetRecord)).document;
  const packetResult = await validatePacket(packet, root, records, bindingsResolved.document, designResolved.document, kits, preMasterResolved.document);
  const expectedPacketBindings = {
    assets_manifest_sha256: assetsManifest.manifest_sha256,
    shot_plan_sha256: bindingsResolved.document.shot_plan_sha256,
    design_slice_sha256: records.get('master-bindings-v3') ? bindingsResolved.document.design_slice_sha256 : null,
    flat_shot_kit_set_sha256: bindingsResolved.document.flat_shot_kit_set_sha256,
    master_bindings_sha256: bindingsSha256,
    source_bundle_sha256: sourceBundleSha256,
    official_authoring_evidence_sha256: records.get('official-authoring-evidence').sha256,
    neutral_scaffold_receipt_sha256: neutralScaffoldRecord.sha256,
    source_gate_receipt_sha256: records.get('source-gate-receipt').sha256,
    pixel_gate_receipt_sha256: records.get('pixel-gate-receipt').sha256,
    font_gate_receipt_sha256: records.get('font-gate-receipt').sha256,
    seek_gate_receipt_sha256: records.get('seek-gate-receipt').sha256,
    delivery_profile_receipt_sha256: records.get('delivery-profile-receipt').sha256,
  };
  for (const [field, value] of Object.entries(expectedPacketBindings)) {
    if (packet[field] !== value) fail('pre_master_packet_unbound', 'Pre-master packet does not bind the exact approved artifacts and gate receipts.');
  }
  const expectedMetrics = {
    shot_count: bindingReceipt.shot_count,
    design_slice_sha256: bindingsResolved.document.design_slice_sha256,
    flat_shot_kit_set_sha256: bindingsResolved.document.flat_shot_kit_set_sha256,
    master_bindings_sha256: bindingsSha256,
    source_bundle_sha256: sourceBundleSha256,
    pre_master_evidence_sha256: records.get('pre-master-evidence').sha256,
    pre_master_page_count: packetResult.visualHashes.length,
    source_gate_passed: true,
    pixel_gate_passed: true,
    font_gate_passed: true,
    seek_gate_passed: true,
    profile_gate_passed: true,
    contribution_verified_count: bindingReceipt.verified_contribution_count,
    official_hyperframes_skill_used: true,
    official_hyperframes_creation_sha256: records.get('official-authoring-evidence').sha256,
  };
  for (const [field, value] of Object.entries(expectedMetrics)) {
    if (manifest.metrics[field] !== value) fail('master_build_metrics_unbound', 'Master-build metrics do not bind the complete source/evidence chain.');
  }
  await validateHtmlPreviewReview(htmlPreviewReview, {
    manifest,
    root,
    assetsManifest,
    bindings: bindingsResolved.document,
    bindingsRecord: records.get('master-bindings-v3'),
    sourceBundleRecord,
    packetRecord,
    visualHashes: packetResult.visualHashes,
    factsHashes: packetResult.factsHashes,
  });
  return {
    pipeline_contract_version: 2,
    resume_eligible: true,
    shot_count: bindingReceipt.shot_count,
    assets_manifest_sha256: assetsManifest.manifest_sha256,
    design_slice_sha256: bindingsResolved.document.design_slice_sha256,
    flat_shot_kit_set_sha256: bindingsResolved.document.flat_shot_kit_set_sha256,
    master_bindings_sha256: bindingsSha256,
    source_bundle_sha256: sourceBundleSha256,
    verified_contribution_count: bindingReceipt.verified_contribution_count,
    inspected_visual_page_sha256s: packetResult.visualHashes,
    inspected_facts_page_sha256s: packetResult.factsHashes,
  };
}
