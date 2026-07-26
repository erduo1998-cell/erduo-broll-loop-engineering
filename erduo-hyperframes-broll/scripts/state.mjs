import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import {
  AUTHORING_TOPOLOGY_ID,
  PIPELINE_CONTRACT_VERSION,
  VALIDATION_POLICY_ID,
  inspectV3Compatibility,
} from './validate-production-contract.mjs';

export {
  AUTHORING_TOPOLOGY_ID,
  PIPELINE_CONTRACT_VERSION,
  VALIDATION_POLICY_ID,
};
export const STAGES = [
  'preflight',
  'directing',
  'assets',
  'authoring',
  'integration',
  'render',
  'verify',
];
const INPUT_SLOTS = new Set(['srt', 'control_media', 'narration_media', 'design', 'user_assets']);
const SETTING_KEYS = new Set([
  'aspect_ratio',
  'frame_rate',
  'template_policy_sha256',
  'production_library_sha256',
  'design_selection_options_sha256',
]);
const SHA256 = /^[0-9a-f]{64}$/u;
const CREDENTIAL_KEY = /(?:api[_-]?key|token|secret|cookie|password|authorization|credential)/iu;
const ABSOLUTE_VALUE = /^(?:\/|[A-Za-z]:[\\/]|\\\\|file:)/u;
const FAILURE_MESSAGES = {
  input_invalid: 'Input validation failed.',
  credential_missing: 'A required credential is not configured.',
  search_failed: 'Asset search failed.',
  build_failed: 'Composition build failed.',
  render_failed: 'Media render failed.',
  verify_failed: 'Delivery verification failed.',
  internal_error: 'The stage failed unexpectedly.',
  stage_failed: 'The stage failed.',
};

export class StateError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'StateError';
    this.code = code;
  }
}

function stateFail(code, message) {
  throw new StateError(code, message);
}

export function canonicalize(value) {
  const seen = new Set();
  function visit(current) {
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return current;
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || !Number.isSafeInteger(current)) stateFail('invalid_canonical_value', 'Canonical state numbers must be safe integers.');
      return current;
    }
    if (typeof current !== 'object') stateFail('invalid_canonical_value', 'Canonical state contains an unsupported value.');
    if (seen.has(current)) stateFail('invalid_canonical_value', 'Canonical state must not contain cycles.');
    seen.add(current);
    let result;
    if (Array.isArray(current)) {
      result = current.map(visit);
    } else {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) stateFail('invalid_canonical_value', 'Canonical state must use plain objects.');
      result = {};
      for (const key of Object.keys(current).sort()) result[key] = visit(current[key]);
    }
    seen.delete(current);
    return result;
  }
  return JSON.stringify(visit(value));
}

export function fingerprintValue(value) {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

// Render plans use seconds for HyperFrames but retain milliseconds as their
// authoritative source. They therefore need finite fractional numbers, while
// persistent state deliberately remains integer-only above.
export function fingerprintRenderValue(value) {
  const seen = new Set();
  function visit(current) {
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return current;
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) stateFail('invalid_render_value', 'Render fingerprint contains a non-finite number.');
      return current;
    }
    if (typeof current !== 'object' || seen.has(current)) stateFail('invalid_render_value', 'Render fingerprint contains an unsupported value.');
    seen.add(current);
    const result = Array.isArray(current) ? current.map(visit) : Object.fromEntries(Object.keys(current).sort().map((key) => [key, visit(current[key])]));
    seen.delete(current);
    return result;
  }
  return createHash('sha256').update(JSON.stringify(visit(value)), 'utf8').digest('hex');
}

export async function fingerprintFile(file, {
  fsImpl = fs,
  streamFactory = createReadStream,
} = {}) {
  let before;
  try {
    before = await fsImpl.lstat(file);
  } catch (error) {
    if (error?.code === 'ENOENT') stateFail('input_not_found', 'Fingerprint input was not found.');
    stateFail('input_unreadable', 'Fingerprint input cannot be inspected.');
  }
  if (before.isSymbolicLink() || !before.isFile()) stateFail('input_unsafe', 'Fingerprint input must be a regular file.');
  const hash = createHash('sha256');
  let bytes = 0;
  try {
    for await (const chunk of streamFactory(file)) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      hash.update(buffer);
    }
  } catch {
    stateFail('input_read_failed', 'Fingerprint input could not be read.');
  }
  let after;
  try {
    after = await fsImpl.lstat(file);
  } catch {
    stateFail('input_changed', 'Fingerprint input changed while it was read.');
  }
  if (before.size !== bytes || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
    stateFail('input_changed', 'Fingerprint input changed while it was read.');
  }
  return { sha256: hash.digest('hex'), size_bytes: bytes };
}

function validateFingerprint(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) stateFail('invalid_manifest', 'Input fingerprint is invalid.');
  if (!SHA256.test(value.sha256)) stateFail('invalid_manifest', 'Input fingerprint hash is invalid.');
  if ('size_bytes' in value && (!Number.isSafeInteger(value.size_bytes) || value.size_bytes < 0)) stateFail('invalid_manifest', 'Input fingerprint size is invalid.');
  const allowed = new Set(['sha256', 'size_bytes']);
  if (Object.keys(value).some((key) => !allowed.has(key))) stateFail('invalid_manifest', 'Input fingerprint contains an unknown field.');
  return { sha256: value.sha256, ...('size_bytes' in value ? { size_bytes: value.size_bytes } : {}) };
}

function normalizeSettings(settings = {}) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) stateFail('invalid_manifest', 'Manifest settings are invalid.');
  if (Object.keys(settings).some((key) => !SETTING_KEYS.has(key))) stateFail('invalid_manifest', 'Manifest settings contain an unknown field.');
  const result = {};
  if ('aspect_ratio' in settings) {
    if (!/^\d+:\d+$/u.test(settings.aspect_ratio)) stateFail('invalid_manifest', 'Aspect ratio is invalid.');
    result.aspect_ratio = settings.aspect_ratio;
  }
  if ('frame_rate' in settings) {
    const value = settings.frame_rate;
    if (!value || !Number.isSafeInteger(value.numerator) || !Number.isSafeInteger(value.denominator) || value.numerator <= 0 || value.denominator <= 0 || Object.keys(value).some((key) => !['numerator', 'denominator'].includes(key))) {
      stateFail('invalid_manifest', 'Frame rate is invalid.');
    }
    result.frame_rate = { numerator: value.numerator, denominator: value.denominator };
  }
  for (const key of [
    'template_policy_sha256',
    'production_library_sha256',
    'design_selection_options_sha256',
  ]) {
    if (key in settings) {
      if (!SHA256.test(settings[key])) stateFail('invalid_manifest', `${key} is invalid.`);
      result[key] = settings[key];
    }
  }
  return result;
}

export function createInputManifest({ mode, inputs, settings = {} }) {
  if (!['talking-head', 'faceless'].includes(mode)) stateFail('invalid_manifest', 'Mode is invalid.');
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) stateFail('invalid_manifest', 'Manifest inputs are invalid.');
  if (Object.keys(inputs).some((key) => !INPUT_SLOTS.has(key))) stateFail('invalid_manifest', 'Manifest inputs contain an unknown slot.');
  if (!inputs.srt || (mode === 'talking-head' && !inputs.control_media)) stateFail('invalid_manifest', 'Required input slots are missing.');
  const normalizedInputs = {};
  for (const key of Object.keys(inputs).sort()) normalizedInputs[key] = validateFingerprint(inputs[key]);
  const core = { schema_version: 1, mode, inputs: normalizedInputs, settings: normalizeSettings(settings) };
  return { ...core, manifest_sha256: fingerprintValue(core) };
}

function emptyStage() {
  return {
    status: 'pending',
    attempt: 0,
    input_fingerprint: null,
    output_fingerprint: null,
    failure: null,
    started_at: null,
    finished_at: null,
  };
}

function isoNow(now) {
  const value = typeof now === 'function' ? now() : now;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) stateFail('invalid_time', 'State timestamp is invalid.');
  return date.toISOString();
}

export function createRunState(manifest, {
  now = () => new Date(),
  makeId = randomUUID,
} = {}) {
  validateManifest(manifest);
  const timestamp = isoNow(now);
  return {
    schema_version: 3,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    run_id: makeId(),
    created_at: timestamp,
    updated_at: timestamp,
    manifest,
    changes: [],
    stages: Object.fromEntries(STAGES.map((stage) => [stage, emptyStage()])),
  };
}

export function validateManifest(manifest) {
  const rebuilt = createInputManifest({ mode: manifest?.mode, inputs: manifest?.inputs, settings: manifest?.settings });
  if (manifest?.schema_version !== 1 || manifest.manifest_sha256 !== rebuilt.manifest_sha256) stateFail('manifest_tampered', 'Input manifest hash does not match its content.');
  if (canonicalize(manifest) !== canonicalize(rebuilt)) stateFail('invalid_manifest', 'Input manifest shape is invalid.');
  return manifest;
}

function invalidationStage(field) {
  if (field === 'design'
    || field === 'template_policy_sha256'
    || field === 'production_library_sha256'
    || field === 'design_selection_options_sha256') return 'directing';
  if (field === 'user_assets') return 'assets';
  if (field === 'aspect_ratio' || field === 'frame_rate') return 'authoring';
  return 'preflight';
}

export function diffManifests(previous, next) {
  validateManifest(previous);
  validateManifest(next);
  const changed = [];
  if (previous.mode !== next.mode) changed.push('mode');
  for (const key of [...INPUT_SLOTS].sort()) {
    if (canonicalize(previous.inputs[key] ?? null) !== canonicalize(next.inputs[key] ?? null)) changed.push(key);
  }
  for (const key of [...SETTING_KEYS].sort()) {
    if (canonicalize(previous.settings[key] ?? null) !== canonicalize(next.settings[key] ?? null)) changed.push(key);
  }
  const stageIndexes = changed.map((field) => STAGES.indexOf(invalidationStage(field)));
  return {
    changed,
    invalidated_from: changed.length ? STAGES[Math.min(...stageIndexes)] : null,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function applyInputManifest(state, manifest, { now = () => new Date() } = {}) {
  validateRunState(state);
  validateManifest(manifest);
  const result = clone(state);
  const diff = diffManifests(result.manifest, manifest);
  if (!diff.changed.length) return { state: result, ...diff };
  const start = STAGES.indexOf(diff.invalidated_from);
  for (let index = start; index < STAGES.length; index += 1) result.stages[STAGES[index]] = emptyStage();
  result.manifest = manifest;
  result.changes.push({ at: isoNow(now), fields: diff.changed, invalidated_from: diff.invalidated_from });
  result.updated_at = isoNow(now);
  assertStatePrivacy(result);
  return { state: result, ...diff };
}

function upstreamComplete(stages, stage) {
  const index = STAGES.indexOf(stage);
  return STAGES.slice(0, index).every((name) => stages[name].status === 'complete');
}

export function transitionStage(state, stage, action, options = {}) {
  validateRunState(state);
  if (!STAGES.includes(stage)) stateFail('unknown_stage', 'Stage is unknown.');
  const result = clone(state);
  const current = result.stages[stage];
  const timestamp = isoNow(options.now ?? (() => new Date()));
  if (action === 'start') {
    if (!['pending', 'failed'].includes(current.status)) stateFail('invalid_transition', 'Stage cannot be started from its current state.');
    if (!upstreamComplete(result.stages, stage)) stateFail('upstream_incomplete', 'Upstream stages must complete first.');
    if (!SHA256.test(options.input_fingerprint ?? '')) stateFail('invalid_fingerprint', 'Stage input fingerprint is required.');
    Object.assign(current, { status: 'running', attempt: current.attempt + 1, input_fingerprint: options.input_fingerprint, output_fingerprint: null, failure: null, started_at: timestamp, finished_at: null });
  } else if (action === 'complete') {
    if (current.status !== 'running') stateFail('invalid_transition', 'Only a running stage can complete.');
    if (!SHA256.test(options.output_fingerprint ?? '')) stateFail('invalid_fingerprint', 'Stage output fingerprint is required.');
    Object.assign(current, { status: 'complete', output_fingerprint: options.output_fingerprint, failure: null, finished_at: timestamp });
  } else if (action === 'fail') {
    if (current.status !== 'running') stateFail('invalid_transition', 'Only a running stage can fail.');
    const code = Object.hasOwn(FAILURE_MESSAGES, options.code) ? options.code : 'stage_failed';
    Object.assign(current, { status: 'failed', output_fingerprint: null, failure: { code, message: FAILURE_MESSAGES[code], retryable: Boolean(options.retryable) }, finished_at: timestamp });
  } else {
    stateFail('invalid_transition', 'Stage action is invalid.');
  }
  result.updated_at = timestamp;
  assertStatePrivacy(result);
  return result;
}

export function assertStatePrivacy(value) {
  const seen = new Set();
  function visit(current) {
    if (current === null || typeof current === 'number' || typeof current === 'boolean') return;
    if (typeof current === 'string') {
      if (ABSOLUTE_VALUE.test(current)) stateFail('privacy_violation', 'State contains a private path-like value.');
      return;
    }
    if (typeof current !== 'object' || seen.has(current)) return;
    seen.add(current);
    for (const [key, item] of Object.entries(current)) {
      if (CREDENTIAL_KEY.test(key)) stateFail('privacy_violation', 'State contains a credential-like field.');
      visit(item);
    }
    seen.delete(current);
  }
  visit(value);
  return true;
}

export function validateRunState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) stateFail('unsupported_state', 'Run state schema is missing or unsupported.');
  const compatibility = inspectV3Compatibility(state);
  if (compatibility.code === 'pipeline_upgrade_required') {
    stateFail('pipeline_upgrade_required', 'Legacy run state is inspection-only and cannot resume.');
  }
  if (compatibility.code === 'legacy_field_forbidden') {
    stateFail('legacy_field_forbidden', 'Legacy authorization fields cannot be re-signed into v3 state.');
  }
  if (state.schema_version !== 3) {
    stateFail('legacy_state_resign_forbidden', 'A legacy state shape cannot be re-signed as v3.');
  }
  if (state.authoring_topology_id !== AUTHORING_TOPOLOGY_ID
    || state.validation_policy_id !== VALIDATION_POLICY_ID) {
    stateFail('invalid_state', 'Run state identity is invalid.');
  }
  const allowed = new Set([
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'validation_policy_id',
    'run_id',
    'created_at',
    'updated_at',
    'manifest',
    'changes',
    'stages',
  ]);
  if (Object.keys(state).some((key) => !allowed.has(key))) stateFail('invalid_state', 'Run state contains an unknown field.');
  if (typeof state.run_id !== 'string' || !/^(?:run-[a-z0-9-]+|[0-9a-f]{8}-[0-9a-f-]{27,})$/iu.test(state.run_id)) stateFail('invalid_state', 'Run ID is invalid.');
  for (const timestamp of [state.created_at, state.updated_at]) {
    if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) stateFail('invalid_state', 'Run state timestamp is invalid.');
  }
  validateManifest(state.manifest);
  if (!state.stages || canonicalize(Object.keys(state.stages).sort()) !== canonicalize([...STAGES].sort())) stateFail('invalid_state', 'Run stages are invalid.');
  for (const stage of STAGES) {
    const value = state.stages[stage];
    const keys = ['status', 'attempt', 'input_fingerprint', 'output_fingerprint', 'failure', 'started_at', 'finished_at'];
    if (!value || canonicalize(Object.keys(value).sort()) !== canonicalize([...keys].sort()) || !['pending', 'running', 'complete', 'failed'].includes(value.status) || !Number.isSafeInteger(value.attempt) || value.attempt < 0) stateFail('invalid_state', 'Run stage state is invalid.');
    if (value.input_fingerprint !== null && !SHA256.test(value.input_fingerprint)) stateFail('invalid_state', 'Run stage input fingerprint is invalid.');
    if (value.output_fingerprint !== null && !SHA256.test(value.output_fingerprint)) stateFail('invalid_state', 'Run stage output fingerprint is invalid.');
    if (value.status === 'pending' && (value.attempt !== 0 || value.input_fingerprint || value.output_fingerprint || value.failure || value.started_at || value.finished_at)) stateFail('invalid_state', 'Pending stage contains stale execution data.');
    if (value.status === 'running' && (!value.input_fingerprint || value.output_fingerprint || value.failure || !value.started_at || value.finished_at)) stateFail('invalid_state', 'Running stage state is inconsistent.');
    if (value.status === 'complete' && (!value.input_fingerprint || !value.output_fingerprint || value.failure || !value.started_at || !value.finished_at)) stateFail('invalid_state', 'Completed stage state is inconsistent.');
    if (value.status === 'failed') {
      const failureKeys = value.failure && Object.keys(value.failure);
      if (!value.input_fingerprint || value.output_fingerprint || !value.started_at || !value.finished_at || !value.failure || canonicalize(failureKeys.sort()) !== canonicalize(['code', 'message', 'retryable'].sort()) || !Object.hasOwn(FAILURE_MESSAGES, value.failure.code) || typeof value.failure.retryable !== 'boolean' || value.failure.message !== FAILURE_MESSAGES[value.failure.code]) stateFail('invalid_state', 'Failed stage lacks a safe fixed failure.');
    }
    for (const timestamp of [value.started_at, value.finished_at]) {
      if (timestamp !== null && (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp)))) stateFail('invalid_state', 'Run stage timestamp is invalid.');
    }
    if (value.status !== 'pending' && !upstreamComplete(state.stages, stage)) stateFail('invalid_state', 'Run stage has incomplete upstream state.');
  }
  if (!Array.isArray(state.changes)) stateFail('invalid_state', 'Run state changes are invalid.');
  const allowedChangeFields = new Set(['mode', ...INPUT_SLOTS, ...SETTING_KEYS]);
  for (const change of state.changes) {
    if (!change || canonicalize(Object.keys(change).sort()) !== canonicalize(['at', 'fields', 'invalidated_from'].sort()) || typeof change.at !== 'string' || Number.isNaN(Date.parse(change.at)) || !Array.isArray(change.fields) || change.fields.length === 0 || change.fields.some((field) => !allowedChangeFields.has(field)) || new Set(change.fields).size !== change.fields.length || !STAGES.includes(change.invalidated_from)) stateFail('invalid_state', 'Run state change record is invalid.');
    const expected = STAGES[Math.min(...change.fields.map((field) => STAGES.indexOf(invalidationStage(field))))];
    if (change.invalidated_from !== expected) stateFail('invalid_state', 'Run state change invalidation is inconsistent.');
  }
  assertStatePrivacy(state);
  return state;
}

export function inspectRunState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return {
      resume_eligible: false,
      resign_eligible: false,
      code: 'unsupported_state',
      schema_version: null,
      pipeline_contract_version: null,
      run_id: null,
      stages: null,
    };
  }
  const compatibility = inspectV3Compatibility(state);
  if (compatibility.code !== 'canonical_artifact_validation_required') {
    return {
      resume_eligible: false,
      resign_eligible: false,
      code: compatibility.code,
      schema_version: Number.isSafeInteger(state.schema_version) ? state.schema_version : null,
      pipeline_contract_version: compatibility.pipeline_contract_version,
      run_id: typeof state.run_id === 'string' ? state.run_id : null,
      stages: state.stages && typeof state.stages === 'object'
        ? Object.fromEntries(STAGES.map((stage) => [stage, state.stages[stage]?.status ?? null]))
        : null,
    };
  }
  if (state.schema_version !== 3) {
    return {
      resume_eligible: false,
      resign_eligible: false,
      code: 'legacy_state_resign_forbidden',
      schema_version: Number.isSafeInteger(state.schema_version) ? state.schema_version : null,
      pipeline_contract_version: compatibility.pipeline_contract_version,
      run_id: typeof state.run_id === 'string' ? state.run_id : null,
      stages: state.stages && typeof state.stages === 'object'
        ? Object.fromEntries(STAGES.map((stage) => [stage, state.stages[stage]?.status ?? null]))
        : null,
    };
  }
  validateRunState(state);
  return {
    resume_eligible: true,
    resign_eligible: false,
    code: null,
    schema_version: state.schema_version,
    pipeline_contract_version: state.pipeline_contract_version,
    run_id: state.run_id,
    stages: Object.fromEntries(STAGES.map((stage) => [stage, state.stages[stage].status])),
  };
}

async function statePaths(projectRoot, pathImpl = path) {
  const root = pathImpl.resolve(projectRoot);
  return { root, dir: pathImpl.join(root, '.erduo-hyperframes-broll'), file: pathImpl.join(root, '.erduo-hyperframes-broll', 'run.json') };
}

async function rejectSymlink(target, fsImpl, { allowMissing = false, requireDirectory = false } = {}) {
  try {
    const stat = await fsImpl.lstat(target);
    if (stat.isSymbolicLink() || (requireDirectory && !stat.isDirectory())) stateFail('unsafe_state_path', 'Run state path is unsafe.');
    return stat;
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') return null;
    if (error instanceof StateError) throw error;
    stateFail('state_path_failed', 'Run state path cannot be inspected.');
  }
}

export async function loadRunState(projectRoot, { fsImpl = fs, pathImpl = path } = {}) {
  const paths = await statePaths(projectRoot, pathImpl);
  await rejectSymlink(paths.root, fsImpl, { requireDirectory: true });
  const dir = await rejectSymlink(paths.dir, fsImpl, { allowMissing: true, requireDirectory: true });
  if (!dir) return null;
  const file = await rejectSymlink(paths.file, fsImpl, { allowMissing: true });
  if (!file) return null;
  if (!file.isFile()) stateFail('unsafe_state_path', 'Run state path is unsafe.');
  let text;
  try { text = await fsImpl.readFile(paths.file, 'utf8'); } catch { stateFail('state_read_failed', 'Run state could not be read.'); }
  let state;
  try { state = JSON.parse(text); } catch { stateFail('state_invalid_json', 'Run state is not valid JSON.'); }
  return validateRunState(state);
}

export async function inspectStoredRunState(projectRoot, { fsImpl = fs, pathImpl = path } = {}) {
  const paths = await statePaths(projectRoot, pathImpl);
  await rejectSymlink(paths.root, fsImpl, { requireDirectory: true });
  const dir = await rejectSymlink(paths.dir, fsImpl, { allowMissing: true, requireDirectory: true });
  if (!dir) return null;
  const file = await rejectSymlink(paths.file, fsImpl, { allowMissing: true });
  if (!file) return null;
  if (!file.isFile()) stateFail('unsafe_state_path', 'Run state path is unsafe.');
  let text;
  try { text = await fsImpl.readFile(paths.file, 'utf8'); } catch { stateFail('state_read_failed', 'Run state could not be read.'); }
  let state;
  try { state = JSON.parse(text); } catch { stateFail('state_invalid_json', 'Run state is not valid JSON.'); }
  return inspectRunState(state);
}

export async function saveRunState(projectRoot, state, {
  fsImpl = fs,
  pathImpl = path,
  makeId = randomUUID,
  platform = process.platform,
} = {}) {
  validateRunState(state);
  const paths = await statePaths(projectRoot, pathImpl);
  await rejectSymlink(paths.root, fsImpl, { requireDirectory: true });
  await rejectSymlink(paths.dir, fsImpl, { allowMissing: true, requireDirectory: true });
  await rejectSymlink(paths.file, fsImpl, { allowMissing: true });
  const temp = pathImpl.join(paths.dir, `.run.json.${process.pid}.${makeId()}.tmp`);
  let created = false;
  try {
    await fsImpl.mkdir(paths.dir, { recursive: true, mode: 0o700 });
    if (platform !== 'win32') await fsImpl.chmod(paths.dir, 0o700);
    await fsImpl.writeFile(temp, `${JSON.stringify(state, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    created = true;
    if (platform !== 'win32') await fsImpl.chmod(temp, 0o600);
    await fsImpl.rename(temp, paths.file);
    created = false;
    if (platform !== 'win32') await fsImpl.chmod(paths.file, 0o600);
  } catch (error) {
    if (error instanceof StateError) throw error;
    stateFail('state_write_failed', 'Run state could not be saved.');
  } finally {
    if (created) {
      try { await fsImpl.unlink(temp); } catch (error) {
        if (error?.code !== 'ENOENT') stateFail('state_cleanup_failed', 'Temporary run state could not be removed.');
      }
    }
  }
  return { saved: true };
}
