import { createHash } from 'node:crypto';
import path from 'node:path';

export const PIPELINE_CONTRACT_VERSION = 2;
export const AUTHORING_TOPOLOGY_ID = 'bounded-authoring-cluster-v1';

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const SHOT_ID = /^S[0-9]{3}$/u;
const CHUNK_ID = /^C[0-9]{3}$/u;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const GATE_NAMES = ['source', 'font', 'asset', 'hyperframes', 'seek', 'profile', 'pixel'];
const SOURCE_CHECKS = [
  'positions',
  'z_order',
  'shot_order',
  'timing',
  'lifecycle',
  'selectors',
  'cross_chunk_seams',
  'errors',
];
const STILL_USES = new Set(['font', 'crop', 'material-visibility']);
const DEFAULT_MAX_SHOTS = 8;
const DEFAULT_MAX_DURATION_MS = 45_000;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_SOURCE_REVIEW_ROOT_BYTES = 4096;
const MAX_SOURCE_REVIEW_PAGE_TABLE_BYTES = 1024 * 1024;
const MAX_SOURCE_REVIEW_PAGE_BYTES = 1024 * 1024;
const MAX_SOURCE_REVIEW_SUPPLEMENTAL_BYTES = 32 * 1024 * 1024;
const MAX_SOURCE_REVIEW_PAGE_TABLES = 256;
const MAX_SOURCE_REVIEW_DECLARED_PAGES = 1024;
const DEFAULT_SOURCE_REVIEW_TABLE_ENTRIES = 64;
const SOURCE_REVIEW_MEDIA_TYPES = new Set([
  'text/html',
  'text/css',
  'text/javascript',
  'application/javascript',
]);
const SOURCE_DECISION_FIELDS = [
  'outcome',
  'read_all_source_pages',
  'position_z_order_checked',
  'shot_order_checked',
  'duration_checked',
  'five_phase_lifecycle_checked',
  'selectors_checked',
  'cross_block_seams_checked',
  'source_errors_checked',
  'static_checks_limited_to_font_crop_material_visibility',
  'animation_approved_from_stills',
  'finding_count',
  'decision_sha256',
];

export class AuthoringTopologyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AuthoringTopologyError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new AuthoringTopologyError(code, message); };
const exact = (value, fields, code = 'authoring_topology_invalid') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, 'Authoring topology value has an invalid shape.');
  }
};
const isSha = (value) => typeof value === 'string' && SHA256.test(value);

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('authoring_topology_invalid', 'Authoring topology numbers must be safe integers.');
    return value;
  }
  if (!value || typeof value !== 'object' || value instanceof Map) {
    fail('authoring_topology_invalid', 'Authoring topology values must be plain JSON values.');
  }
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

const canonicalBytes = (value) => Buffer.from(JSON.stringify(canonical(value)), 'utf8');
const fingerprint = (value) => createHash('sha256').update(canonicalBytes(value)).digest('hex');
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const asBytes = (value, code = 'source_bytes_unresolved') => {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) fail(code, 'Actual source bytes are required.');
  const bytes = Buffer.from(value);
  if (!bytes.length || bytes.length > MAX_SOURCE_BYTES) fail('source_bytes_invalid', 'Source bytes are empty or exceed the bounded source limit.');
  return bytes;
};

function attach(document, key, value) {
  Object.defineProperty(document, key, {
    configurable: false,
    enumerable: false,
    writable: false,
    value,
  });
  return document;
}

function normalizeRelativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || path.posix.isAbsolute(value)) {
    fail('source_path_invalid', 'Source paths must be portable package-relative paths.');
  }
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
    fail('source_path_invalid', 'Source path escapes its package.');
  }
  return value;
}

function mediaTypeFor(relativePath) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (extension === '.html') return 'text/html';
  if (extension === '.css') return 'text/css';
  if (extension === '.js' || extension === '.mjs') return 'application/javascript';
  if (extension === '.json') return 'application/json';
  if (extension === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function normalizeSourceBytes(sourceBytes, { idPrefix = 'source' } = {}) {
  if (!(sourceBytes instanceof Map) || !sourceBytes.size) fail('source_bytes_unresolved', 'Source bytes must be a non-empty Map.');
  const normalized = [];
  let index = 0;
  for (const [key, raw] of sourceBytes.entries()) {
    const descriptor = Buffer.isBuffer(raw) || raw instanceof Uint8Array ? { bytes: raw } : raw;
    if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
      fail('source_bytes_unresolved', 'Source byte Map values must be bytes or byte descriptors.');
    }
    const relativePath = normalizeRelativePath(descriptor.relative_path ?? String(key));
    const artifactId = descriptor.artifact_id ?? `${idPrefix}-${String(index + 1).padStart(3, '0')}`;
    if (!SAFE_ID.test(artifactId)) fail('source_artifact_invalid', 'Source artifact ID is invalid.');
    const bytes = asBytes(descriptor.bytes);
    normalized.push({
      artifact_id: artifactId,
      relative_path: relativePath,
      sha256: hashBytes(bytes),
      size_bytes: bytes.length,
      media_type: descriptor.media_type ?? mediaTypeFor(relativePath),
      bytes,
    });
    index += 1;
  }
  normalized.sort((left, right) => left.relative_path.localeCompare(right.relative_path));
  if (new Set(normalized.map((item) => item.artifact_id)).size !== normalized.length
    || new Set(normalized.map((item) => item.relative_path)).size !== normalized.length) {
    fail('source_artifact_invalid', 'Source artifact IDs and paths must be unique.');
  }
  return normalized;
}

function sourceRecords(normalized) {
  return normalized.map(({ bytes: ignored, ...record }) => record);
}

function normalizeShot(raw, index) {
  const window = raw?.srt_window_ms ?? raw?.window_ms ?? raw;
  const shotId = raw?.shot_id;
  const startMs = window?.start_ms;
  const endMs = window?.end_ms;
  if (shotId !== `S${String(index + 1).padStart(3, '0')}` || !SHOT_ID.test(shotId)
    || !Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs)
    || startMs < 0 || endMs <= startMs) {
    fail('authoring_shot_invalid', 'Authoring shots must be ordered positive millisecond windows with canonical shot IDs.');
  }
  return { shot_id: shotId, start_ms: startMs, end_ms: endMs, duration_ms: endMs - startMs };
}

function chunkCore(chunkId, shots) {
  const core = {
    chunk_id: chunkId,
    shot_start: shots[0].shot_id,
    shot_end: shots.at(-1).shot_id,
    shot_count: shots.length,
    start_ms: shots[0].start_ms,
    end_ms: shots.at(-1).end_ms,
    duration_ms: shots.at(-1).end_ms - shots[0].start_ms,
    shots,
  };
  return { ...core, chunk_spec_sha256: fingerprint(core) };
}

function planInput(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) fail('authoring_plan_invalid', 'Authoring plan options are required.');
  return {
    global_rules_sha256: options.global_rules_sha256,
    parsed_srt_sha256: options.parsed_srt_sha256,
    plan_sha256: options.plan_sha256,
    projection_sha256: options.projection_sha256,
    design_slice_sha256: options.design_slice_sha256,
    kit_set_sha256: options.kit_set_sha256 ?? options.flat_shot_kit_set_sha256,
  };
}

export function createAuthoringPlan(options = {}) {
  const hashes = planInput(options);
  if (Object.values(hashes).some((value) => !isSha(value))) fail('authoring_plan_unbound', 'Authoring plan must bind every required upstream hash.');
  const fps = options.fps;
  exact(fps, ['numerator', 'denominator'], 'authoring_fps_invalid');
  if (!Number.isSafeInteger(fps.numerator) || !Number.isSafeInteger(fps.denominator)
    || fps.numerator < 1 || fps.denominator < 1) fail('authoring_fps_invalid', 'Authoring FPS must be a positive rational.');
  const maxShots = options.max_shots_per_chunk ?? options.chunk_policy?.max_shots ?? DEFAULT_MAX_SHOTS;
  const maxDurationMs = options.max_chunk_duration_ms ?? options.chunk_policy?.max_duration_ms ?? DEFAULT_MAX_DURATION_MS;
  if (!Number.isSafeInteger(maxShots) || maxShots < 1 || maxShots > 999
    || !Number.isSafeInteger(maxDurationMs) || maxDurationMs < 1) {
    fail('authoring_chunk_policy_invalid', 'Authoring chunk policy is invalid.');
  }
  if (!Array.isArray(options.shots) || !options.shots.length || options.shots.length > 999) {
    fail('authoring_shot_invalid', 'Authoring plan needs one to 999 shots.');
  }
  const shots = options.shots.map(normalizeShot);
  for (let index = 1; index < shots.length; index += 1) {
    if (shots[index].start_ms !== shots[index - 1].end_ms) {
      fail('authoring_shot_coverage_invalid', 'Authoring shots must be contiguous without gaps or overlaps.');
    }
  }
  const groups = [];
  let current = [];
  for (const shot of shots) {
    const candidate = [...current, shot];
    const candidateDuration = candidate.at(-1).end_ms - candidate[0].start_ms;
    if (current.length && (candidate.length > maxShots || candidateDuration > maxDurationMs)) {
      groups.push(current);
      current = [shot];
    } else {
      current = candidate;
    }
  }
  groups.push(current);
  const chunks = groups.map((group, index) => chunkCore(`C${String(index + 1).padStart(3, '0')}`, group));
  const core = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    ...hashes,
    fps: { numerator: fps.numerator, denominator: fps.denominator },
    chunk_policy: { max_shots: maxShots, max_duration_ms: maxDurationMs, oversize_singleton: true },
    shot_count: shots.length,
    shots,
    chunks,
  };
  return { ...core, authoring_plan_sha256: fingerprint(core) };
}

export function validateAuthoringPlan(document) {
  exact(document, [
    'schema_version', 'pipeline_contract_version', 'authoring_topology_id',
    'global_rules_sha256', 'parsed_srt_sha256', 'plan_sha256', 'projection_sha256',
    'design_slice_sha256', 'kit_set_sha256', 'fps', 'chunk_policy',
    'shot_count', 'shots', 'chunks', 'authoring_plan_sha256',
  ], 'authoring_plan_invalid');
  if (document.schema_version !== 1 || document.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || document.authoring_topology_id !== AUTHORING_TOPOLOGY_ID) {
    fail('authoring_topology_mismatch', 'Authoring plan does not use the bounded authoring cluster contract.');
  }
  exact(document.chunk_policy, ['max_shots', 'max_duration_ms', 'oversize_singleton'], 'authoring_chunk_policy_invalid');
  if (document.chunk_policy.oversize_singleton !== true) fail('authoring_chunk_policy_invalid', 'Oversize shots must remain singleton chunks.');
  const rebuilt = createAuthoringPlan({
    ...planInput(document),
    fps: document.fps,
    shots: document.shots,
    max_shots_per_chunk: document.chunk_policy.max_shots,
    max_chunk_duration_ms: document.chunk_policy.max_duration_ms,
  });
  if (document.authoring_plan_sha256 !== rebuilt.authoring_plan_sha256
    || fingerprint(document) !== fingerprint(rebuilt)
    || document.shot_count !== document.shots.length) {
    fail('authoring_plan_tampered', 'Authoring plan differs from its deterministic reconstruction.');
  }
  return {
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    authoring_plan_sha256: document.authoring_plan_sha256,
    shot_count: document.shot_count,
    chunk_count: document.chunks.length,
  };
}

function gateReceipts(input, chunkId, sourceBundleSha256) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('authoring_chunk_gate_missing', 'Every chunk needs all seven deterministic gates.');
  const result = {};
  for (const gate of GATE_NAMES) {
    const raw = input[gate];
    if (raw === 'passed' || raw === true) {
      result[gate] = {
        status: 'passed',
        receipt_sha256: fingerprint({ gate, status: 'passed', chunk_id: chunkId, source_bundle_sha256: sourceBundleSha256 }),
      };
    } else {
      exact(raw, ['status', 'receipt_sha256'], 'authoring_chunk_gate_invalid');
      if (raw.status !== 'passed' || !isSha(raw.receipt_sha256)) fail('authoring_chunk_gate_failed', `Authoring chunk ${gate} gate did not pass.`);
      result[gate] = { status: 'passed', receipt_sha256: raw.receipt_sha256 };
    }
  }
  if (Object.keys(input).some((key) => !GATE_NAMES.includes(key))) fail('authoring_chunk_gate_invalid', 'Authoring chunk contains an unknown gate.');
  return result;
}

function chunkOptions(options) {
  const plan = options.plan ?? options.authoringPlan ?? options.authoring_plan;
  const chunkId = options.chunk_id ?? options.chunkId ?? options.chunk?.chunk_id;
  const sourceBytes = options.sourceBytes ?? options.source_bytes ?? options.source_files ?? options.sources;
  const gates = options.validation_gates ?? options.gates;
  return { plan, chunkId, sourceBytes, gates };
}

export function createAuthoringChunkManifest(options = {}) {
  const { plan, chunkId, sourceBytes, gates } = chunkOptions(options);
  validateAuthoringPlan(plan);
  const chunk = plan.chunks.find((item) => item.chunk_id === chunkId);
  if (!chunk) fail('authoring_chunk_unknown', 'Authoring chunk is not declared by the plan.');
  const attempt = options.attempt;
  const producerIsolationSha256 = options.producer_isolation_sha256;
  if (![1, 2].includes(attempt)) fail('authoring_chunk_attempt_invalid', 'Authoring chunks allow attempt 1 or one replacement attempt 2.');
  if (!isSha(producerIsolationSha256)) fail('authoring_chunk_isolation_invalid', 'Authoring chunk producer isolation is invalid.');
  const normalized = normalizeSourceBytes(sourceBytes, { idPrefix: `${chunkId.toLowerCase()}-source` });
  const files = sourceRecords(normalized);
  const sourceBundleSha256 = fingerprint(files);
  const validationGates = gateReceipts(gates, chunkId, sourceBundleSha256);
  const core = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    stage: 'master-build',
    kind: 'authoring-chunk',
    authoring_plan_sha256: plan.authoring_plan_sha256,
    global_rules_sha256: plan.global_rules_sha256,
    chunk_id: chunkId,
    chunk_spec_sha256: chunk.chunk_spec_sha256,
    attempt,
    producer_isolation_sha256: producerIsolationSha256,
    shot_start: chunk.shot_start,
    shot_end: chunk.shot_end,
    shot_count: chunk.shot_count,
    source_files: files,
    source_bundle_sha256: sourceBundleSha256,
    validation_gates: validationGates,
  };
  const document = { ...core, manifest_sha256: fingerprint(core) };
  attach(document, 'source_bytes', new Map(normalized.map((item) => [item.artifact_id, item.bytes])));
  attach(document, 'authoring_plan', plan);
  return document;
}

function bytesForRecord(sourceBytes, record) {
  if (!(sourceBytes instanceof Map)) fail('source_bytes_unresolved', 'Actual source bytes Map is required.');
  let raw = sourceBytes.get(record.artifact_id);
  if (raw === undefined) raw = sourceBytes.get(record.relative_path);
  if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw) && !(raw instanceof Uint8Array)) raw = raw.bytes;
  const bytes = asBytes(raw);
  if (bytes.length !== record.size_bytes || hashBytes(bytes) !== record.sha256) {
    fail('source_bytes_mismatch', 'Actual source bytes do not match the authoring manifest.');
  }
  return bytes;
}

export function validateAuthoringChunkManifest(document, options = {}) {
  if (options instanceof Map) options = { sourceBytes: options };
  exact(document, [
    'schema_version', 'pipeline_contract_version', 'authoring_topology_id', 'stage', 'kind',
    'authoring_plan_sha256', 'global_rules_sha256', 'chunk_id', 'chunk_spec_sha256',
    'attempt', 'producer_isolation_sha256', 'shot_start', 'shot_end', 'shot_count',
    'source_files', 'source_bundle_sha256', 'validation_gates', 'manifest_sha256',
  ], 'authoring_chunk_invalid');
  if (document.schema_version !== 1 || document.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || document.authoring_topology_id !== AUTHORING_TOPOLOGY_ID || document.stage !== 'master-build'
    || document.kind !== 'authoring-chunk' || !CHUNK_ID.test(document.chunk_id)
    || ![1, 2].includes(document.attempt) || !isSha(document.producer_isolation_sha256)) {
    fail('authoring_chunk_invalid', 'Authoring chunk identity is invalid.');
  }
  const plan = options.plan ?? options.authoringPlan ?? options.authoring_plan ?? document.authoring_plan;
  validateAuthoringPlan(plan);
  const chunk = plan.chunks.find((item) => item.chunk_id === document.chunk_id);
  if (!chunk || document.authoring_plan_sha256 !== plan.authoring_plan_sha256
    || document.global_rules_sha256 !== plan.global_rules_sha256
    || document.chunk_spec_sha256 !== chunk.chunk_spec_sha256
    || document.shot_start !== chunk.shot_start || document.shot_end !== chunk.shot_end
    || document.shot_count !== chunk.shot_count) {
    fail('authoring_chunk_plan_drift', 'Authoring chunk differs from its frozen plan range.');
  }
  if (!Array.isArray(document.source_files) || !document.source_files.length) fail('source_bytes_unresolved', 'Authoring chunk has no source files.');
  const ids = new Set();
  const paths = new Set();
  for (const record of document.source_files) {
    exact(record, ['artifact_id', 'relative_path', 'sha256', 'size_bytes', 'media_type'], 'source_artifact_invalid');
    if (!SAFE_ID.test(record.artifact_id) || ids.has(record.artifact_id) || paths.has(record.relative_path)
      || !isSha(record.sha256) || !Number.isSafeInteger(record.size_bytes) || record.size_bytes < 1
      || typeof record.media_type !== 'string' || !record.media_type) fail('source_artifact_invalid', 'Authoring source record is invalid.');
    normalizeRelativePath(record.relative_path);
    ids.add(record.artifact_id);
    paths.add(record.relative_path);
  }
  if (document.source_bundle_sha256 !== fingerprint(document.source_files)) fail('authoring_chunk_source_unbound', 'Chunk source bundle hash is invalid.');
  const sourceBytes = options.sourceBytes ?? options.source_bytes ?? options.source_files ?? document.source_bytes;
  for (const record of document.source_files) bytesForRecord(sourceBytes, record);
  gateReceipts(document.validation_gates, document.chunk_id, document.source_bundle_sha256);
  const { manifest_sha256: ignored, ...core } = document;
  if (document.manifest_sha256 !== fingerprint(core)) fail('authoring_chunk_tampered', 'Authoring chunk manifest hash does not match its content.');
  return {
    chunk_id: document.chunk_id,
    attempt: document.attempt,
    manifest_sha256: document.manifest_sha256,
    source_bundle_sha256: document.source_bundle_sha256,
    shot_count: document.shot_count,
    status: 'passed',
  };
}

function chunkByteMap(source, chunk, integrationSources = null, flatSourceBytes = null) {
  if (source instanceof Map) return source;
  if (!integrationSources || !(flatSourceBytes instanceof Map)) return chunk.source_bytes;
  const result = new Map();
  for (const file of chunk.source_files) {
    const integrated = integrationSources.find((item) => item.chunk_id === chunk.chunk_id
      && item.chunk_artifact_id === file.artifact_id);
    if (integrated) result.set(file.artifact_id, flatSourceBytes.get(integrated.artifact_id));
  }
  return result;
}

function byteMapsForChunks(value, chunks) {
  if (value instanceof Map) return value;
  const result = new Map();
  for (const chunk of chunks) if (chunk.source_bytes) result.set(chunk.chunk_id, chunk.source_bytes);
  return result;
}

function orderedChunks(plan, chunks) {
  if (!Array.isArray(chunks) || chunks.length !== plan.chunks.length) fail('authoring_chunk_set_incomplete', 'Integration requires every planned authoring chunk.');
  const byId = new Map(chunks.map((chunk) => [chunk.chunk_id, chunk]));
  if (byId.size !== chunks.length) fail('authoring_chunk_set_invalid', 'Integration contains duplicate chunk IDs.');
  return plan.chunks.map((chunk) => {
    const document = byId.get(chunk.chunk_id);
    if (!document) fail('authoring_chunk_set_incomplete', 'Integration is missing a planned authoring chunk.');
    return document;
  });
}

function integrationDocuments(plan, chunkRecords, sourceFiles) {
  const mapDocument = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    authoring_plan_sha256: plan.authoring_plan_sha256,
    chunks: chunkRecords.map((chunk) => ({
      chunk_id: chunk.chunk_id,
      shot_start: chunk.shot_start,
      shot_end: chunk.shot_end,
      manifest_sha256: chunk.manifest_sha256,
      source_bundle_sha256: chunk.source_bundle_sha256,
    })),
    sources: sourceFiles.map((file) => ({
      artifact_id: file.artifact_id,
      integrated_path: file.integrated_path,
      chunk_id: file.chunk_id,
      chunk_artifact_id: file.chunk_artifact_id,
      sha256: file.sha256,
      size_bytes: file.size_bytes,
      media_type: file.media_type,
    })),
  };
  const wrapperDocument = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    authoring_plan_sha256: plan.authoring_plan_sha256,
    chunk_order: chunkRecords.map((chunk) => chunk.chunk_id),
    integration_map_sha256: hashBytes(canonicalBytes(mapDocument)),
  };
  return {
    mapBytes: canonicalBytes(mapDocument),
    wrapperBytes: canonicalBytes(wrapperDocument),
  };
}

function integrationOptions(options) {
  return {
    plan: options.plan ?? options.authoringPlan ?? options.authoring_plan,
    chunks: options.chunks ?? options.chunkManifests ?? options.chunk_manifests,
    chunkSourceBytes: options.chunkSourceBytes ?? options.sourceBytesByChunk ?? options.chunk_source_bytes,
    integratorIsolationSha256: options.integrator_isolation_sha256 ?? options.integratorIsolationSha256,
    styleIntegrationAuthorizationSha256:
      options.style_integration_authorization_sha256
      ?? options.styleIntegrationAuthorizationSha256,
    styleSourceLedgerSha256:
      options.style_source_ledger_sha256
      ?? options.styleSourceLedgerSha256,
    styleValidatorReceiptSha256:
      options.style_validator_receipt_sha256
      ?? options.styleValidatorReceiptSha256,
    supplementalEvidence:
      options.source_review_supplemental
      ?? options.sourceReviewSupplemental
      ?? options.supplementalEvidence
      ?? [],
    sourcePageMaxBytes:
      options.source_review_page_max_bytes
      ?? options.sourceReviewPageMaxBytes
      ?? MAX_SOURCE_REVIEW_PAGE_BYTES,
    pageTableMaxEntries:
      options.source_review_page_table_max_entries
      ?? options.sourceReviewPageTableMaxEntries
      ?? DEFAULT_SOURCE_REVIEW_TABLE_ENTRIES,
  };
}

export function createAuthoringIntegrationManifest(options = {}) {
  const {
    plan,
    chunks,
    chunkSourceBytes,
    integratorIsolationSha256,
    styleIntegrationAuthorizationSha256,
    styleSourceLedgerSha256,
    styleValidatorReceiptSha256,
    supplementalEvidence,
    sourcePageMaxBytes,
    pageTableMaxEntries,
  } = integrationOptions(options);
  validateAuthoringPlan(plan);
  if (!isSha(integratorIsolationSha256)) fail('authoring_integrator_isolation_invalid', 'Integrator isolation is invalid.');
  if (!isSha(styleIntegrationAuthorizationSha256)) {
    fail(
      'style_integration_authorization_required',
      'Integration requires an independently revalidated style authorization.',
    );
  }
  if (!isSha(styleSourceLedgerSha256)
    || !isSha(styleValidatorReceiptSha256)) {
    fail(
      'style_integration_lineage_required',
      'Integration requires the exact style source ledger and trusted validator receipt.',
    );
  }
  const ordered = orderedChunks(plan, chunks);
  const byteMaps = byteMapsForChunks(chunkSourceBytes, ordered);
  const authorIsolations = new Set();
  const chunkRecords = [];
  const integratedSources = [];
  const fullSourceBytes = new Map();
  let sourceIndex = 0;
  for (const chunk of ordered) {
    const bytes = chunkByteMap(byteMaps.get(chunk.chunk_id), chunk);
    validateAuthoringChunkManifest(chunk, { plan, sourceBytes: bytes });
    if (authorIsolations.has(chunk.producer_isolation_sha256)) fail('authoring_chunk_isolation_reused', 'Every authoring chunk needs a unique producer isolation.');
    if (chunk.producer_isolation_sha256 === integratorIsolationSha256) fail('integrator_not_isolated', 'Integrator isolation must differ from every chunk author.');
    authorIsolations.add(chunk.producer_isolation_sha256);
    chunkRecords.push({
      chunk_id: chunk.chunk_id,
      shot_start: chunk.shot_start,
      shot_end: chunk.shot_end,
      shot_count: chunk.shot_count,
      manifest_sha256: chunk.manifest_sha256,
      source_bundle_sha256: chunk.source_bundle_sha256,
      producer_isolation_sha256: chunk.producer_isolation_sha256,
      attempt: chunk.attempt,
    });
    for (const file of chunk.source_files) {
      const actual = bytesForRecord(bytes, file);
      sourceIndex += 1;
      const record = {
        artifact_id: `integrated-source-${String(sourceIndex).padStart(3, '0')}`,
        integrated_path: `chunks/${chunk.chunk_id}/${file.relative_path}`,
        chunk_id: chunk.chunk_id,
        chunk_artifact_id: file.artifact_id,
        sha256: file.sha256,
        size_bytes: file.size_bytes,
        media_type: file.media_type,
      };
      integratedSources.push(record);
      fullSourceBytes.set(record.artifact_id, actual);
    }
  }
  const generated = integrationDocuments(plan, chunkRecords, integratedSources);
  const generatedFiles = [
    {
      artifact_id: 'integration-wrapper',
      relative_path: 'integration/wrapper.json',
      sha256: hashBytes(generated.wrapperBytes),
      size_bytes: generated.wrapperBytes.length,
      media_type: 'application/json',
    },
    {
      artifact_id: 'integration-map',
      relative_path: 'integration/map.json',
      sha256: hashBytes(generated.mapBytes),
      size_bytes: generated.mapBytes.length,
      media_type: 'application/json',
    },
  ];
  fullSourceBytes.set('integration-wrapper', generated.wrapperBytes);
  fullSourceBytes.set('integration-map', generated.mapBytes);
  const chunkSetSha256 = fingerprint(chunkRecords);
  const sourceBundleSha256 = fingerprint([
    ...integratedSources.map(({ chunk_id: ignoredChunk, chunk_artifact_id: ignoredArtifact, integrated_path: relative_path, ...record }) => ({ ...record, relative_path })),
    ...generatedFiles,
  ]);
  const noRewriteCore = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    status: 'passed',
    mode: 'byte-identical-chunk-source',
    authoring_plan_sha256: plan.authoring_plan_sha256,
    style_source_ledger_sha256: styleSourceLedgerSha256,
    style_validator_receipt_sha256: styleValidatorReceiptSha256,
    chunk_set_sha256: chunkSetSha256,
    chunk_count: chunkRecords.length,
    source_file_count: integratedSources.length,
    source_bundle_sha256: sourceBundleSha256,
    wrapper_sha256: generatedFiles[0].sha256,
    integration_map_sha256: generatedFiles[1].sha256,
  };
  const noRewriteReceipt = { ...noRewriteCore, receipt_sha256: fingerprint(noRewriteCore) };
  const sourceReviewPacket = createSourceReviewPacket({
    sourceFiles: integratedSources,
    sourceBytes: fullSourceBytes,
    supplementalEvidence,
    sourcePageMaxBytes,
    pageTableMaxEntries,
    bindings: {
      whole_film_rules_sha256: plan.global_rules_sha256,
      chunk_plan_sha256: plan.authoring_plan_sha256,
      wrapper_sha256: generatedFiles[0].sha256,
      ordered_block_map_sha256: generatedFiles[1].sha256,
      block_hash_ledger_sha256: chunkSetSha256,
      integration_gate_sha256: noRewriteReceipt.receipt_sha256,
      style_integration_authorization_sha256:
        styleIntegrationAuthorizationSha256,
      style_source_ledger_sha256: styleSourceLedgerSha256,
      style_validator_receipt_sha256: styleValidatorReceiptSha256,
    },
  });
  for (const [artifactId, bytes] of sourceReviewPacket.bytes) {
    fullSourceBytes.set(artifactId, bytes);
  }
  const core = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    stage: 'master-build',
    kind: 'authoring-integration',
    authoring_plan_sha256: plan.authoring_plan_sha256,
    global_rules_sha256: plan.global_rules_sha256,
    integrator_isolation_sha256: integratorIsolationSha256,
    style_integration_authorization_sha256:
      styleIntegrationAuthorizationSha256,
    style_source_ledger_sha256: styleSourceLedgerSha256,
    style_validator_receipt_sha256: styleValidatorReceiptSha256,
    chunk_set_sha256: chunkSetSha256,
    chunks: chunkRecords,
    source_files: integratedSources,
    generated_files: generatedFiles,
    source_bundle_sha256: sourceBundleSha256,
    no_rewrite_receipt: noRewriteReceipt,
    source_review_packet: sourceReviewPacket.descriptor,
  };
  const document = { ...core, manifest_sha256: fingerprint(core) };
  attach(document, 'source_bytes', fullSourceBytes);
  attach(document, 'chunk_source_bytes', byteMaps);
  attach(document, 'chunk_manifests', ordered);
  attach(document, 'authoring_plan', plan);
  return document;
}

function validateGeneratedFiles(document, plan, sourceBytes) {
  const generated = integrationDocuments(plan, document.chunks, document.source_files);
  const expected = new Map([
    ['integration-wrapper', generated.wrapperBytes],
    ['integration-map', generated.mapBytes],
  ]);
  for (const record of document.generated_files) {
    const actual = bytesForRecord(sourceBytes, record);
    const deterministic = expected.get(record.artifact_id);
    if (!deterministic || actual.length !== deterministic.length || !actual.equals(deterministic)) {
      fail('integrator_wrapper_nondeterministic', 'Integrator wrapper/map differs from deterministic output.');
    }
  }
}

export function validateAuthoringIntegrationManifest(document, options = {}) {
  exact(document, [
    'schema_version', 'pipeline_contract_version', 'authoring_topology_id', 'stage', 'kind',
    'authoring_plan_sha256', 'global_rules_sha256', 'integrator_isolation_sha256',
    'style_integration_authorization_sha256',
    'style_source_ledger_sha256', 'style_validator_receipt_sha256',
    'chunk_set_sha256', 'chunks', 'source_files', 'generated_files',
    'source_bundle_sha256', 'no_rewrite_receipt', 'source_review_packet',
    'manifest_sha256',
  ], 'authoring_integration_invalid');
  if (document.schema_version !== 1 || document.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || document.authoring_topology_id !== AUTHORING_TOPOLOGY_ID || document.stage !== 'master-build'
    || document.kind !== 'authoring-integration'
    || !isSha(document.integrator_isolation_sha256)
    || !isSha(document.style_integration_authorization_sha256)
    || !isSha(document.style_source_ledger_sha256)
    || !isSha(document.style_validator_receipt_sha256)) {
    fail('authoring_integration_invalid', 'Authoring integration identity is invalid.');
  }
  const expectedStyleAuthorizationSha256 =
    options.styleIntegrationAuthorizationSha256
    ?? options.style_integration_authorization_sha256;
  if (expectedStyleAuthorizationSha256 !== undefined
    && document.style_integration_authorization_sha256
      !== expectedStyleAuthorizationSha256) {
    fail(
      'style_integration_authorization_unbound',
      'Integration is bound to another style authorization.',
    );
  }
  const expectedStyleSourceLedgerSha256 =
    options.styleSourceLedgerSha256
    ?? options.style_source_ledger_sha256;
  const expectedStyleValidatorReceiptSha256 =
    options.styleValidatorReceiptSha256
    ?? options.style_validator_receipt_sha256;
  if ((expectedStyleSourceLedgerSha256 !== undefined
      && document.style_source_ledger_sha256
        !== expectedStyleSourceLedgerSha256)
    || (expectedStyleValidatorReceiptSha256 !== undefined
      && document.style_validator_receipt_sha256
        !== expectedStyleValidatorReceiptSha256)) {
    fail(
      'style_integration_lineage_unbound',
      'Integration is bound to another style source ledger or validator receipt.',
    );
  }
  const plan = options.plan ?? options.authoringPlan ?? options.authoring_plan ?? document.authoring_plan;
  const chunks = options.chunks ?? options.chunkManifests ?? options.chunk_manifests ?? document.chunk_manifests;
  validateAuthoringPlan(plan);
  if (document.authoring_plan_sha256 !== plan.authoring_plan_sha256
    || document.global_rules_sha256 !== plan.global_rules_sha256) {
    fail('authoring_integration_plan_drift', 'Integration differs from its global authoring plan.');
  }
  const ordered = orderedChunks(plan, chunks);
  if (document.chunks.length !== ordered.length) fail('authoring_chunk_set_incomplete', 'Integration chunk coverage is incomplete.');
  const flatSourceBytes = options.sourceBytes ?? options.integrated_source_bytes ?? document.source_bytes;
  const byteMaps = byteMapsForChunks(options.chunkSourceBytes ?? options.sourceBytesByChunk ?? options.chunk_source_bytes ?? document.chunk_source_bytes, ordered);
  const authorIsolations = new Set();
  for (const [index, chunk] of ordered.entries()) {
    const declared = document.chunks[index];
    exact(declared, [
      'chunk_id', 'shot_start', 'shot_end', 'shot_count', 'manifest_sha256',
      'source_bundle_sha256', 'producer_isolation_sha256', 'attempt',
    ], 'authoring_chunk_set_invalid');
    const bytes = chunkByteMap(byteMaps.get(chunk.chunk_id), chunk, document.source_files, flatSourceBytes);
    validateAuthoringChunkManifest(chunk, { plan, sourceBytes: bytes });
    if (declared.chunk_id !== chunk.chunk_id || declared.shot_start !== chunk.shot_start
      || declared.shot_end !== chunk.shot_end || declared.shot_count !== chunk.shot_count
      || declared.manifest_sha256 !== chunk.manifest_sha256
      || declared.source_bundle_sha256 !== chunk.source_bundle_sha256
      || declared.producer_isolation_sha256 !== chunk.producer_isolation_sha256
      || declared.attempt !== chunk.attempt) {
      fail('authoring_chunk_set_invalid', 'Integration chunk record differs from its validated chunk manifest.');
    }
    if (authorIsolations.has(chunk.producer_isolation_sha256)) fail('authoring_chunk_isolation_reused', 'Every authoring chunk needs a unique producer isolation.');
    if (chunk.producer_isolation_sha256 === document.integrator_isolation_sha256) fail('integrator_not_isolated', 'Integrator isolation must differ from every chunk author.');
    authorIsolations.add(chunk.producer_isolation_sha256);
  }
  if (document.chunk_set_sha256 !== fingerprint(document.chunks)) fail('authoring_chunk_set_tampered', 'Integration chunk-set hash is invalid.');
  const expectedSources = [];
  let sourceIndex = 0;
  for (const chunk of ordered) {
    for (const file of chunk.source_files) {
      sourceIndex += 1;
      expectedSources.push({
        artifact_id: `integrated-source-${String(sourceIndex).padStart(3, '0')}`,
        integrated_path: `chunks/${chunk.chunk_id}/${file.relative_path}`,
        chunk_id: chunk.chunk_id,
        chunk_artifact_id: file.artifact_id,
        sha256: file.sha256,
        size_bytes: file.size_bytes,
        media_type: file.media_type,
      });
    }
  }
  if (JSON.stringify(document.source_files) !== JSON.stringify(expectedSources)) {
    fail('integrator_rewrite_forbidden', 'Integrator changed, omitted, duplicated, or reordered chunk source records.');
  }
  if (!Array.isArray(document.generated_files) || document.generated_files.length !== 2
    || document.generated_files[0].artifact_id !== 'integration-wrapper'
    || document.generated_files[1].artifact_id !== 'integration-map') {
    fail('integrator_wrapper_invalid', 'Integrator may add only the deterministic wrapper and map.');
  }
  for (const record of document.generated_files) {
    exact(record, ['artifact_id', 'relative_path', 'sha256', 'size_bytes', 'media_type'], 'integrator_wrapper_invalid');
    if (!SAFE_ID.test(record.artifact_id) || !isSha(record.sha256)
      || !Number.isSafeInteger(record.size_bytes) || record.size_bytes < 1
      || record.media_type !== 'application/json') {
      fail('integrator_wrapper_invalid', 'Deterministic wrapper/map record is invalid.');
    }
    normalizeRelativePath(record.relative_path);
  }
  for (const record of [...document.source_files, ...document.generated_files]) bytesForRecord(flatSourceBytes, record);
  validateGeneratedFiles(document, plan, flatSourceBytes);
  const expectedBundleSha = fingerprint([
    ...document.source_files.map(({ chunk_id: ignoredChunk, chunk_artifact_id: ignoredArtifact, integrated_path: relative_path, ...record }) => ({ ...record, relative_path })),
    ...document.generated_files,
  ]);
  if (document.source_bundle_sha256 !== expectedBundleSha) fail('authoring_integration_source_unbound', 'Integrated source bundle hash is invalid.');
  exact(document.no_rewrite_receipt, [
    'schema_version', 'pipeline_contract_version', 'status', 'mode',
    'authoring_plan_sha256', 'style_source_ledger_sha256',
    'style_validator_receipt_sha256', 'chunk_set_sha256', 'chunk_count',
    'source_file_count', 'source_bundle_sha256', 'wrapper_sha256',
    'integration_map_sha256', 'receipt_sha256',
  ], 'no_rewrite_receipt_invalid');
  const { receipt_sha256: ignoredReceipt, ...receiptCore } = document.no_rewrite_receipt;
  if (document.no_rewrite_receipt.status !== 'passed'
    || document.no_rewrite_receipt.mode !== 'byte-identical-chunk-source'
    || document.no_rewrite_receipt.authoring_plan_sha256 !== plan.authoring_plan_sha256
    || document.no_rewrite_receipt.style_source_ledger_sha256
      !== document.style_source_ledger_sha256
    || document.no_rewrite_receipt.style_validator_receipt_sha256
      !== document.style_validator_receipt_sha256
    || document.no_rewrite_receipt.chunk_set_sha256 !== document.chunk_set_sha256
    || document.no_rewrite_receipt.chunk_count !== document.chunks.length
    || document.no_rewrite_receipt.source_file_count !== document.source_files.length
    || document.no_rewrite_receipt.source_bundle_sha256 !== document.source_bundle_sha256
    || document.no_rewrite_receipt.wrapper_sha256 !== document.generated_files[0].sha256
    || document.no_rewrite_receipt.integration_map_sha256 !== document.generated_files[1].sha256
    || document.no_rewrite_receipt.receipt_sha256 !== fingerprint(receiptCore)) {
    fail('no_rewrite_receipt_invalid', 'No-rewrite receipt does not bind the exact integrated bytes.');
  }
  validateSourceReviewPacket(document.source_review_packet, {
    sourceFiles: document.source_files,
    sourceBytes: flatSourceBytes,
    bindings: sourceReviewBindings(document),
  });
  const { manifest_sha256: ignoredManifest, ...core } = document;
  if (document.manifest_sha256 !== fingerprint(core)) fail('authoring_integration_tampered', 'Integration manifest hash does not match its content.');
  return {
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    manifest_sha256: document.manifest_sha256,
    authoring_plan_sha256: document.authoring_plan_sha256,
    chunk_count: document.chunks.length,
    source_file_count: document.source_files.length + document.generated_files.length,
    source_bundle_sha256: document.source_bundle_sha256,
    no_rewrite_receipt_sha256: document.no_rewrite_receipt.receipt_sha256,
    style_integration_authorization_sha256:
      document.style_integration_authorization_sha256,
    style_source_ledger_sha256:
      document.style_source_ledger_sha256,
    style_validator_receipt_sha256:
      document.style_validator_receipt_sha256,
    status: 'passed',
  };
}

function normalizeChecks(checks) {
  exact(checks, SOURCE_CHECKS, 'source_code_review_checks_invalid');
  if (SOURCE_CHECKS.some((key) => checks[key] !== true)) {
    fail('source_code_review_rejected', 'Every source semantic check must explicitly pass before render.');
  }
  return Object.fromEntries(SOURCE_CHECKS.map((key) => [key, true]));
}

function normalizeStillEvidence(value = {}) {
  let uses;
  let animationApproval;
  let evidenceSha256;
  if (Array.isArray(value.uses)) {
    uses = value.uses;
    animationApproval = value.animation_approval;
    evidenceSha256 = value.evidence_sha256;
  } else {
    const allowedKeys = new Set(['font', 'crop', 'material_visibility', 'animation_approval', 'evidence_sha256']);
    if (Object.keys(value).some((key) => !allowedKeys.has(key))) fail('still_evidence_scope_invalid', 'Still evidence contains an unsupported scope.');
    uses = [
      ...(value.font === true ? ['font'] : []),
      ...(value.crop === true ? ['crop'] : []),
      ...(value.material_visibility === true ? ['material-visibility'] : []),
    ];
    animationApproval = value.animation_approval;
    evidenceSha256 = value.evidence_sha256;
  }
  if (!Array.isArray(uses) || uses.some((item) => !STILL_USES.has(item))
    || new Set(uses).size !== uses.length || animationApproval !== false) {
    fail('still_evidence_scope_invalid', 'Still evidence is limited to font, crop and material visibility and cannot approve animation.');
  }
  const normalizedUses = [...uses].sort();
  const hash = evidenceSha256 ?? fingerprint({ uses: normalizedUses, animation_approval: false });
  if (!isSha(hash)) fail('still_evidence_scope_invalid', 'Still evidence hash is invalid.');
  return { uses: normalizedUses, animation_approval: false, evidence_sha256: hash };
}

const packetRef = (artifactId, bytes, mediaType) => ({
  artifact_id: artifactId,
  sha256: hashBytes(bytes),
  size_bytes: bytes.length,
  media_type: mediaType,
});

function sourceReviewBindings(integration) {
  return {
    whole_film_rules_sha256: integration.global_rules_sha256,
    chunk_plan_sha256: integration.authoring_plan_sha256,
    wrapper_sha256: integration.generated_files[0].sha256,
    ordered_block_map_sha256: integration.generated_files[1].sha256,
    block_hash_ledger_sha256: integration.chunk_set_sha256,
    integration_gate_sha256: integration.no_rewrite_receipt.receipt_sha256,
    style_integration_authorization_sha256:
      integration.style_integration_authorization_sha256,
    style_source_ledger_sha256: integration.style_source_ledger_sha256,
    style_validator_receipt_sha256:
      integration.style_validator_receipt_sha256,
  };
}

function validatePacketRef(ref, { mediaTypes, maxBytes, code = 'source_review_page_invalid' } = {}) {
  exact(ref, ['artifact_id', 'sha256', 'size_bytes', 'media_type'], code);
  if (!SAFE_ID.test(ref.artifact_id) || !isSha(ref.sha256)
    || !Number.isSafeInteger(ref.size_bytes) || ref.size_bytes < 1
    || ref.size_bytes > maxBytes
    || !mediaTypes.has(ref.media_type)) {
    fail(ref.size_bytes > maxBytes ? 'source_review_page_oversized' : code,
      'Source-review packet artifact reference is invalid.');
  }
}

function packetBytesFor(sourceBytes, ref) {
  if (!(sourceBytes instanceof Map)) {
    fail('source_review_packet_unresolved', 'Complete source-review packet bytes are required.');
  }
  let raw = sourceBytes.get(ref.artifact_id);
  if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)
    && !(raw instanceof Uint8Array)) raw = raw.bytes;
  if (!Buffer.isBuffer(raw) && !(raw instanceof Uint8Array)) {
    fail('source_review_packet_unresolved', 'A declared source-review packet artifact is unresolved.');
  }
  const bytes = Buffer.from(raw);
  if (bytes.length !== ref.size_bytes || hashBytes(bytes) !== ref.sha256) {
    fail('source_review_packet_unbound', 'Source-review packet artifact bytes do not match their reference.');
  }
  return bytes;
}

function parseCanonicalJson(bytes, code, message) {
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(code, message);
  }
  if (!canonicalBytes(value).equals(bytes)) fail(code, message);
  return value;
}

function sourceLines(bytes) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('source_review_source_invalid', 'Source-review pages require exact valid UTF-8 source.');
  }
  const matches = text.match(/[^\r\n]*(?:\r\n|\n|\r|$)/gu) ?? [];
  if (matches.at(-1) === '') matches.pop();
  const lines = matches.map((line) => Buffer.from(line, 'utf8'));
  if (!lines.length || !Buffer.concat(lines).equals(bytes)) {
    fail('source_review_source_invalid', 'Source-review line reconstruction does not equal the raw source bytes.');
  }
  return lines;
}

function paginateSourceLines(lines, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1
    || maxBytes > MAX_SOURCE_REVIEW_PAGE_BYTES) {
    fail('source_review_page_limit_invalid', 'Source-review page byte limit is invalid.');
  }
  const pages = [];
  let page = [];
  let size = 0;
  for (const line of lines) {
    if (line.length > maxBytes) {
      fail('source_review_source_line_oversized',
        'One source line exceeds the bounded source-page limit.');
    }
    if (page.length && size + line.length > maxBytes) {
      pages.push(page);
      page = [];
      size = 0;
    }
    page.push(line);
    size += line.length;
  }
  if (page.length) pages.push(page);
  return pages;
}

function normalizeSupplementalEvidence(values) {
  if (!Array.isArray(values) || values.length > MAX_SOURCE_REVIEW_DECLARED_PAGES / 2) {
    fail('source_review_supplemental_invalid', 'Supplemental source-review evidence is invalid.');
  }
  return values.map((value) => {
    exact(value, ['bytes', 'facts', 'media_type', 'uses'], 'source_review_supplemental_invalid');
    const bytes = asBytes(value.bytes, 'source_review_supplemental_unresolved');
    if (bytes.length > MAX_SOURCE_REVIEW_SUPPLEMENTAL_BYTES
      || typeof value.media_type !== 'string'
      || !value.media_type.startsWith('image/')) {
      fail(bytes.length > MAX_SOURCE_REVIEW_SUPPLEMENTAL_BYTES
        ? 'source_review_page_oversized' : 'source_review_supplemental_invalid',
      'Supplemental source-review evidence must be a bounded image.');
    }
    if (!Array.isArray(value.uses) || !value.uses.length
      || value.uses.some((item) => !STILL_USES.has(item))
      || new Set(value.uses).size !== value.uses.length
      || !value.facts || typeof value.facts !== 'object'
      || Array.isArray(value.facts)) {
      fail('source_review_supplemental_invalid',
        'Supplemental evidence is limited to font, crop and material visibility facts.');
    }
    canonical(value.facts);
    return {
      bytes,
      media_type: value.media_type,
      uses: [...value.uses].sort(),
      facts: value.facts,
    };
  });
}

function createSourceReviewPacket({
  sourceFiles,
  sourceBytes,
  bindings,
  supplementalEvidence = [],
  sourcePageMaxBytes = MAX_SOURCE_REVIEW_PAGE_BYTES,
  pageTableMaxEntries = DEFAULT_SOURCE_REVIEW_TABLE_ENTRIES,
}) {
  if (!Array.isArray(sourceFiles) || !sourceFiles.length
    || !Number.isSafeInteger(pageTableMaxEntries)
    || pageTableMaxEntries < 1 || pageTableMaxEntries > 256
    || Object.values(bindings).some((value) => !isSha(value))) {
    fail('source_review_packet_invalid', 'Source-review packet inputs are invalid.');
  }
  const bytes = new Map();
  const entries = [];
  const pageRefs = [];
  let sourcePageOrdinal = 0;
  for (const file of sourceFiles) {
    if (!SOURCE_REVIEW_MEDIA_TYPES.has(file.media_type)) {
      fail('source_review_source_media_invalid',
        'Every integrated source must use an allowed HTML, CSS or JavaScript media type.');
    }
    const actual = bytesForRecord(sourceBytes, file);
    const lines = sourceLines(actual);
    const pages = paginateSourceLines(lines, sourcePageMaxBytes);
    let lineStart = 1;
    for (const [pageIndex, pageLines] of pages.entries()) {
      sourcePageOrdinal += 1;
      const pageBytes = Buffer.concat(pageLines);
      const sourceRef = packetRef(
        `source-review-source-${String(sourcePageOrdinal).padStart(4, '0')}`,
        pageBytes,
        file.media_type,
      );
      const lineEnd = lineStart + pageLines.length - 1;
      const factsCore = {
        schema_version: 1,
        pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
        gate: 'source_code_review',
        kind: 'source-facts',
        file_artifact_id: file.artifact_id,
        file_path: file.integrated_path,
        file_sha256: file.sha256,
        file_size_bytes: file.size_bytes,
        file_media_type: file.media_type,
        page_index: pageIndex + 1,
        page_count: pages.length,
        line_start: lineStart,
        line_end: lineEnd,
        source_page_sha256: sourceRef.sha256,
      };
      const factsBytes = canonicalBytes(factsCore);
      if (factsBytes.length > MAX_SOURCE_REVIEW_PAGE_BYTES) {
        fail('source_review_page_oversized', 'Source-facts page exceeds 1 MiB.');
      }
      const factsRef = packetRef(
        `source-review-facts-${String(sourcePageOrdinal).padStart(4, '0')}`,
        factsBytes,
        'application/json',
      );
      const entry = {
        kind: 'source',
        file_artifact_id: file.artifact_id,
        file_path: file.integrated_path,
        file_sha256: file.sha256,
        file_size_bytes: file.size_bytes,
        file_media_type: file.media_type,
        page_index: pageIndex + 1,
        page_count: pages.length,
        line_start: lineStart,
        line_end: lineEnd,
        source: sourceRef,
        facts: factsRef,
      };
      entries.push(entry);
      pageRefs.push(sourceRef, factsRef);
      bytes.set(sourceRef.artifact_id, pageBytes);
      bytes.set(factsRef.artifact_id, factsBytes);
      lineStart = lineEnd + 1;
    }
  }
  const supplemental = normalizeSupplementalEvidence(supplementalEvidence);
  for (const [index, item] of supplemental.entries()) {
    const visualRef = packetRef(
      `source-review-supplemental-visual-${String(index + 1).padStart(4, '0')}`,
      item.bytes,
      item.media_type,
    );
    const factsBytes = canonicalBytes({
      schema_version: 1,
      pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
      gate: 'source_code_review',
      kind: 'supplemental-facts',
      supplemental_index: index + 1,
      visual_sha256: visualRef.sha256,
      uses: item.uses,
      facts: item.facts,
    });
    if (factsBytes.length > MAX_SOURCE_REVIEW_PAGE_BYTES) {
      fail('source_review_page_oversized', 'Supplemental facts page exceeds 1 MiB.');
    }
    const factsRef = packetRef(
      `source-review-supplemental-facts-${String(index + 1).padStart(4, '0')}`,
      factsBytes,
      'application/json',
    );
    entries.push({
      kind: 'supplemental',
      supplemental_index: index + 1,
      uses: item.uses,
      visual: visualRef,
      facts: factsRef,
    });
    pageRefs.push(visualRef, factsRef);
    bytes.set(visualRef.artifact_id, item.bytes);
    bytes.set(factsRef.artifact_id, factsBytes);
  }
  if (pageRefs.length > MAX_SOURCE_REVIEW_DECLARED_PAGES) {
    fail('source_review_page_limit_exceeded',
      'Source-review packet declares more than 1024 source/facts/supplemental pages.');
  }
  const entryGroups = [];
  for (let index = 0; index < entries.length; index += pageTableMaxEntries) {
    entryGroups.push(entries.slice(index, index + pageTableMaxEntries));
  }
  if (!entryGroups.length || entryGroups.length > MAX_SOURCE_REVIEW_PAGE_TABLES) {
    fail('source_review_page_table_limit_exceeded',
      'Source-review packet page-table count is invalid.');
  }
  const pageTableRefs = Array(entryGroups.length);
  let nextPageTable = null;
  for (let index = entryGroups.length - 1; index >= 0; index -= 1) {
    const tableBytes = canonicalBytes({
      schema_version: 1,
      pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
      authoring_topology_id: AUTHORING_TOPOLOGY_ID,
      gate: 'source_code_review',
      page_table_index: index + 1,
      page_table_count: entryGroups.length,
      entry_count: entryGroups[index].length,
      entries: entryGroups[index],
      next_page_table: nextPageTable,
    });
    if (tableBytes.length > MAX_SOURCE_REVIEW_PAGE_TABLE_BYTES) {
      fail('source_review_page_table_oversized',
        'Source-review page table exceeds 1 MiB.');
    }
    const ref = packetRef(
      `source-review-page-table-${String(index + 1).padStart(4, '0')}`,
      tableBytes,
      'application/json',
    );
    pageTableRefs[index] = ref;
    bytes.set(ref.artifact_id, tableBytes);
    nextPageTable = ref;
  }
  const rootBytes = canonicalBytes({
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    gate: 'source_code_review',
    source_file_count: sourceFiles.length,
    page_table_count: pageTableRefs.length,
    total_declared_page_count: pageRefs.length,
    first_page_table: pageTableRefs[0],
    page_table_chain_sha256: fingerprint(pageTableRefs),
    bindings,
  });
  if (rootBytes.length > MAX_SOURCE_REVIEW_ROOT_BYTES) {
    fail('source_review_packet_oversized', 'Source-review root packet exceeds 4096 bytes.');
  }
  const root = packetRef('source-review-packet-root', rootBytes, 'application/json');
  bytes.set(root.artifact_id, rootBytes);
  const descriptorCore = {
    root,
    page_tables: pageTableRefs,
    pages: pageRefs,
  };
  return {
    descriptor: {
      ...descriptorCore,
      artifact_set_sha256: fingerprint([
        descriptorCore.root,
        ...descriptorCore.page_tables,
        ...descriptorCore.pages,
      ]),
    },
    bytes,
  };
}

function validateSourceReviewPacket(descriptor, { sourceFiles, sourceBytes, bindings }) {
  exact(descriptor, ['root', 'page_tables', 'pages', 'artifact_set_sha256'],
    'source_review_packet_invalid');
  validatePacketRef(descriptor.root, {
    mediaTypes: new Set(['application/json']),
    maxBytes: MAX_SOURCE_REVIEW_ROOT_BYTES,
    code: 'source_review_packet_invalid',
  });
  if (!Array.isArray(descriptor.page_tables) || !descriptor.page_tables.length
    || descriptor.page_tables.length > MAX_SOURCE_REVIEW_PAGE_TABLES
    || !Array.isArray(descriptor.pages) || !descriptor.pages.length
    || descriptor.pages.length > MAX_SOURCE_REVIEW_DECLARED_PAGES) {
    fail('source_review_packet_invalid', 'Source-review packet descriptor is incomplete or oversized.');
  }
  const allRefs = [descriptor.root, ...descriptor.page_tables, ...descriptor.pages];
  if (new Set(allRefs.map((ref) => ref.artifact_id)).size !== allRefs.length) {
    fail('source_review_packet_unbound', 'Source-review packet artifact IDs are duplicated.');
  }
  if (descriptor.artifact_set_sha256 !== fingerprint(allRefs)) {
    fail('source_review_packet_unbound', 'Source-review packet artifact-set hash is stale.');
  }
  const rootBytes = packetBytesFor(sourceBytes, descriptor.root);
  const root = parseCanonicalJson(
    rootBytes,
    'source_review_packet_invalid',
    'Source-review root packet is not canonical JSON.',
  );
  exact(root, [
    'schema_version', 'pipeline_contract_version', 'authoring_topology_id',
    'gate', 'source_file_count', 'page_table_count',
    'total_declared_page_count', 'first_page_table',
    'page_table_chain_sha256', 'bindings',
  ], 'source_review_packet_invalid');
  if (root.schema_version !== 1
    || root.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || root.authoring_topology_id !== AUTHORING_TOPOLOGY_ID
    || root.gate !== 'source_code_review'
    || root.source_file_count !== sourceFiles.length
    || root.page_table_count !== descriptor.page_tables.length
    || root.total_declared_page_count !== descriptor.pages.length
    || fingerprint(root.first_page_table) !== fingerprint(descriptor.page_tables[0])
    || root.page_table_chain_sha256 !== fingerprint(descriptor.page_tables)
    || fingerprint(root.bindings) !== fingerprint(bindings)) {
    fail('source_review_packet_unbound',
      'Source-review root packet is stale, substituted or bound to another integration.');
  }
  const entries = [];
  for (const [index, ref] of descriptor.page_tables.entries()) {
    validatePacketRef(ref, {
      mediaTypes: new Set(['application/json']),
      maxBytes: MAX_SOURCE_REVIEW_PAGE_TABLE_BYTES,
      code: 'source_review_page_table_invalid',
    });
    const table = parseCanonicalJson(
      packetBytesFor(sourceBytes, ref),
      'source_review_page_table_invalid',
      'Source-review page table is not canonical JSON.',
    );
    exact(table, [
      'schema_version', 'pipeline_contract_version', 'authoring_topology_id',
      'gate', 'page_table_index', 'page_table_count', 'entry_count',
      'entries', 'next_page_table',
    ], 'source_review_page_table_invalid');
    const expectedNext = descriptor.page_tables[index + 1] ?? null;
    if (table.schema_version !== 1
      || table.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
      || table.authoring_topology_id !== AUTHORING_TOPOLOGY_ID
      || table.gate !== 'source_code_review'
      || table.page_table_index !== index + 1
      || table.page_table_count !== descriptor.page_tables.length
      || !Array.isArray(table.entries) || !table.entries.length
      || table.entry_count !== table.entries.length
      || fingerprint(table.next_page_table) !== fingerprint(expectedNext)) {
      fail('source_review_page_table_unbound',
        'Source-review page-table chain has an omission, reorder, duplication or substitution.');
    }
    entries.push(...table.entries);
  }
  const flattenedRefs = [];
  const sourceEntries = [];
  const supplementalEntries = [];
  for (const entry of entries) {
    if (entry?.kind === 'source') {
      exact(entry, [
        'kind', 'file_artifact_id', 'file_path', 'file_sha256',
        'file_size_bytes', 'file_media_type', 'page_index', 'page_count',
        'line_start', 'line_end', 'source', 'facts',
      ], 'source_review_page_invalid');
      validatePacketRef(entry.source, {
        mediaTypes: SOURCE_REVIEW_MEDIA_TYPES,
        maxBytes: MAX_SOURCE_REVIEW_PAGE_BYTES,
      });
      validatePacketRef(entry.facts, {
        mediaTypes: new Set(['application/json']),
        maxBytes: MAX_SOURCE_REVIEW_PAGE_BYTES,
      });
      flattenedRefs.push(entry.source, entry.facts);
      sourceEntries.push(entry);
    } else if (entry?.kind === 'supplemental') {
      exact(entry, ['kind', 'supplemental_index', 'uses', 'visual', 'facts'],
        'source_review_supplemental_invalid');
      validatePacketRef(entry.visual, {
        mediaTypes: new Set([entry.visual?.media_type].filter((item) =>
          typeof item === 'string' && item.startsWith('image/'))),
        maxBytes: MAX_SOURCE_REVIEW_SUPPLEMENTAL_BYTES,
      });
      validatePacketRef(entry.facts, {
        mediaTypes: new Set(['application/json']),
        maxBytes: MAX_SOURCE_REVIEW_PAGE_BYTES,
      });
      flattenedRefs.push(entry.visual, entry.facts);
      supplementalEntries.push(entry);
    } else {
      fail('source_review_page_invalid', 'Source-review page-table entry kind is invalid.');
    }
  }
  if (fingerprint(flattenedRefs) !== fingerprint(descriptor.pages)) {
    fail('source_review_pages_unbound',
      'Source-review page list has an omission, reorder, duplication or substitution.');
  }
  const sourcePageSha256s = [];
  const factsPageSha256s = [];
  let entryOffset = 0;
  for (const file of sourceFiles) {
    if (!SOURCE_REVIEW_MEDIA_TYPES.has(file.media_type)) {
      fail('source_review_source_media_invalid',
        'Integrated source media type is outside the source-review contract.');
    }
    const actual = bytesForRecord(sourceBytes, file);
    const lines = sourceLines(actual);
    let nextLine = 1;
    let pageCount = null;
    const reconstructed = [];
    while (entryOffset < sourceEntries.length
      && sourceEntries[entryOffset].file_artifact_id === file.artifact_id) {
      const entry = sourceEntries[entryOffset];
      pageCount ??= entry.page_count;
      if (entry.file_path !== file.integrated_path
        || entry.file_sha256 !== file.sha256
        || entry.file_size_bytes !== file.size_bytes
        || entry.file_media_type !== file.media_type
        || entry.source.media_type !== file.media_type
        || !Number.isSafeInteger(entry.page_index)
        || entry.page_index !== reconstructed.length + 1
        || entry.page_count !== pageCount
        || entry.line_start !== nextLine
        || !Number.isSafeInteger(entry.line_end)
        || entry.line_end < entry.line_start
        || entry.line_end > lines.length) {
        fail('source_review_source_coverage_invalid',
          'Source-review pages do not cover one source file contiguously in exact order.');
      }
      const expectedPageBytes = Buffer.concat(
        lines.slice(entry.line_start - 1, entry.line_end),
      );
      const actualPageBytes = packetBytesFor(sourceBytes, entry.source);
      if (!actualPageBytes.equals(expectedPageBytes)) {
        fail('source_review_source_bytes_mismatch',
          'Source-review page bytes differ from reopened raw integrated source bytes.');
      }
      const facts = parseCanonicalJson(
        packetBytesFor(sourceBytes, entry.facts),
        'source_review_facts_invalid',
        'Source-review facts page is not canonical JSON.',
      );
      const expectedFacts = {
        schema_version: 1,
        pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
        gate: 'source_code_review',
        kind: 'source-facts',
        file_artifact_id: file.artifact_id,
        file_path: file.integrated_path,
        file_sha256: file.sha256,
        file_size_bytes: file.size_bytes,
        file_media_type: file.media_type,
        page_index: entry.page_index,
        page_count: entry.page_count,
        line_start: entry.line_start,
        line_end: entry.line_end,
        source_page_sha256: entry.source.sha256,
      };
      if (fingerprint(facts) !== fingerprint(expectedFacts)) {
        fail('source_review_facts_unbound',
          'Source-review facts page is stale or bound to another source page.');
      }
      reconstructed.push(actualPageBytes);
      sourcePageSha256s.push(entry.source.sha256);
      factsPageSha256s.push(entry.facts.sha256);
      nextLine = entry.line_end + 1;
      entryOffset += 1;
    }
    if (!pageCount || reconstructed.length !== pageCount
      || nextLine !== lines.length + 1
      || !Buffer.concat(reconstructed).equals(actual)) {
      fail('source_review_source_coverage_invalid',
        'Source-review pages omit, duplicate, reorder or regenerate integrated source.');
    }
  }
  if (entryOffset !== sourceEntries.length) {
    fail('source_review_source_coverage_invalid',
      'Source-review packet contains a foreign or reordered source file.');
  }
  const supplementalVisualSha256s = [];
  const supplementalFactsSha256s = [];
  for (const [index, entry] of supplementalEntries.entries()) {
    if (entry.supplemental_index !== index + 1
      || !Array.isArray(entry.uses) || !entry.uses.length
      || entry.uses.some((item) => !STILL_USES.has(item))
      || new Set(entry.uses).size !== entry.uses.length) {
      fail('source_review_supplemental_invalid',
        'Supplemental source-review page order or scope is invalid.');
    }
    packetBytesFor(sourceBytes, entry.visual);
    const facts = parseCanonicalJson(
      packetBytesFor(sourceBytes, entry.facts),
      'source_review_supplemental_invalid',
      'Supplemental source-review facts are not canonical JSON.',
    );
    exact(facts, [
      'schema_version', 'pipeline_contract_version', 'gate', 'kind',
      'supplemental_index', 'visual_sha256', 'uses', 'facts',
    ], 'source_review_supplemental_invalid');
    if (facts.schema_version !== 1
      || facts.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
      || facts.gate !== 'source_code_review'
      || facts.kind !== 'supplemental-facts'
      || facts.supplemental_index !== entry.supplemental_index
      || facts.visual_sha256 !== entry.visual.sha256
      || fingerprint(facts.uses) !== fingerprint(entry.uses)
      || !facts.facts || typeof facts.facts !== 'object'
      || Array.isArray(facts.facts)) {
      fail('source_review_supplemental_unbound',
        'Supplemental source-review facts do not bind their visual page.');
    }
    supplementalVisualSha256s.push(entry.visual.sha256);
    supplementalFactsSha256s.push(entry.facts.sha256);
  }
  return {
    review_packet_sha256: descriptor.root.sha256,
    inspected_page_table_sha256s: descriptor.page_tables.map((ref) => ref.sha256),
    inspected_source_page_sha256s: sourcePageSha256s,
    inspected_facts_page_sha256s: factsPageSha256s,
    inspected_supplemental_visual_page_sha256s: supplementalVisualSha256s,
    inspected_supplemental_facts_page_sha256s: supplementalFactsSha256s,
    source_file_count: sourceFiles.length,
    declared_page_count: descriptor.pages.length,
  };
}

function sourceDecision(checks) {
  const core = {
    outcome: 'approved',
    read_all_source_pages: true,
    position_z_order_checked: checks.positions && checks.z_order,
    shot_order_checked: checks.shot_order,
    duration_checked: checks.timing,
    five_phase_lifecycle_checked: checks.lifecycle,
    selectors_checked: checks.selectors,
    cross_block_seams_checked: checks.cross_chunk_seams,
    source_errors_checked: checks.errors,
    static_checks_limited_to_font_crop_material_visibility: true,
    animation_approved_from_stills: false,
    finding_count: 0,
  };
  return { ...core, decision_sha256: fingerprint(core) };
}

function validateSourceDecision(decision) {
  exact(decision, SOURCE_DECISION_FIELDS, 'source_code_review_invalid');
  const { decision_sha256: ignored, ...core } = decision;
  if (decision.outcome !== 'approved'
    || decision.read_all_source_pages !== true
    || decision.position_z_order_checked !== true
    || decision.shot_order_checked !== true
    || decision.duration_checked !== true
    || decision.five_phase_lifecycle_checked !== true
    || decision.selectors_checked !== true
    || decision.cross_block_seams_checked !== true
    || decision.source_errors_checked !== true
    || decision.static_checks_limited_to_font_crop_material_visibility !== true
    || decision.animation_approved_from_stills !== false
    || decision.finding_count !== 0
    || decision.decision_sha256 !== fingerprint(core)) {
    fail('source_code_review_invalid',
      'Source-code review decision is incomplete, overbroad or tampered.');
  }
}

export function createSourceCodeReview(options = {}) {
  const integration = options.integrationManifest ?? options.integration_manifest ?? options.integration;
  const sourceBytes = options.sourceBytes ?? integration?.source_bytes;
  validateAuthoringIntegrationManifest(integration, {
    plan: options.plan,
    chunks: options.chunks,
    chunkSourceBytes: options.chunkSourceBytes,
    sourceBytes,
  });
  const reviewerIsolationSha256 = options.reviewer_isolation_sha256;
  const reviewerModelId = options.reviewer_model_id;
  if (!isSha(reviewerIsolationSha256) || reviewerIsolationSha256 === integration.integrator_isolation_sha256
    || integration.chunks.some((chunk) => chunk.producer_isolation_sha256 === reviewerIsolationSha256)) {
    fail('source_reviewer_not_isolated', 'Source reviewer isolation must differ from integrator and every chunk author.');
  }
  if (!MODEL_ID.test(reviewerModelId ?? '')) fail('source_reviewer_identity_invalid', 'Source reviewer model ID is invalid.');
  const checks = normalizeChecks(options.checks);
  const stillEvidence = normalizeStillEvidence(options.still_evidence);
  const packet = validateSourceReviewPacket(integration.source_review_packet, {
    sourceFiles: integration.source_files,
    sourceBytes,
    bindings: sourceReviewBindings(integration),
  });
  const bindings = sourceReviewBindings(integration);
  const core = {
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    gate: 'source_code_review',
    phase: 'pre-render',
    status: 'approved',
    subject_manifest_sha256: integration.manifest_sha256,
    producer_isolation_sha256: integration.integrator_isolation_sha256,
    reviewer_role: 'erduo-hyperframes-broll-main-agent',
    reviewer_model_id: reviewerModelId,
    reviewer_isolation_sha256: reviewerIsolationSha256,
    authority_scope: 'source-review',
    review_packet_sha256: packet.review_packet_sha256,
    deterministic_result: {
      status: 'passed',
      facts_sha256: integration.no_rewrite_receipt.receipt_sha256,
      failure_codes: [],
    },
    visual_decision: null,
    authoring_plan_sha256: integration.authoring_plan_sha256,
    integration_manifest_sha256: integration.manifest_sha256,
    source_bundle_sha256: integration.source_bundle_sha256,
    no_rewrite_receipt_sha256: integration.no_rewrite_receipt.receipt_sha256,
    ...bindings,
    inspected_page_table_sha256s: packet.inspected_page_table_sha256s,
    inspected_source_page_sha256s: packet.inspected_source_page_sha256s,
    inspected_facts_page_sha256s: packet.inspected_facts_page_sha256s,
    inspected_supplemental_visual_page_sha256s:
      packet.inspected_supplemental_visual_page_sha256s,
    inspected_supplemental_facts_page_sha256s:
      packet.inspected_supplemental_facts_page_sha256s,
    source_decision: sourceDecision(checks),
    source_checks: checks,
    still_evidence: stillEvidence,
  };
  const review = { ...core, approval_sha256: fingerprint(core) };
  attach(review, 'source_bytes', sourceBytes);
  attach(review, 'integration_manifest', integration);
  return review;
}

export function validateSourceCodeReview(review, options = {}) {
  const integration = options.integrationManifest ?? options.integration_manifest ?? options.integration ?? review?.integration_manifest;
  const sourceBytes = options.sourceBytes ?? options.source_bytes ?? review?.source_bytes ?? integration?.source_bytes;
  validateAuthoringIntegrationManifest(integration, {
    plan: options.plan ?? options.authoring_plan,
    chunks: options.chunks ?? options.chunk_manifests,
    chunkSourceBytes: options.chunkSourceBytes ?? options.chunk_source_bytes,
    sourceBytes,
  });
  exact(review, [
    'pipeline_contract_version', 'authoring_topology_id', 'gate', 'phase', 'status',
    'subject_manifest_sha256', 'producer_isolation_sha256', 'reviewer_role',
    'reviewer_model_id', 'reviewer_isolation_sha256', 'authority_scope',
    'review_packet_sha256', 'deterministic_result', 'visual_decision',
    'authoring_plan_sha256', 'integration_manifest_sha256',
    'source_bundle_sha256', 'no_rewrite_receipt_sha256',
    'whole_film_rules_sha256', 'chunk_plan_sha256', 'wrapper_sha256',
    'ordered_block_map_sha256', 'block_hash_ledger_sha256',
    'integration_gate_sha256',
    'style_integration_authorization_sha256',
    'style_source_ledger_sha256',
    'style_validator_receipt_sha256',
    'inspected_page_table_sha256s', 'inspected_source_page_sha256s',
    'inspected_facts_page_sha256s',
    'inspected_supplemental_visual_page_sha256s',
    'inspected_supplemental_facts_page_sha256s',
    'source_decision', 'source_checks', 'still_evidence', 'approval_sha256',
  ], 'source_code_review_invalid');
  if (review.pipeline_contract_version !== PIPELINE_CONTRACT_VERSION
    || review.authoring_topology_id !== AUTHORING_TOPOLOGY_ID
    || review.gate !== 'source_code_review' || review.phase !== 'pre-render'
    || review.status !== 'approved' || review.reviewer_role !== 'erduo-hyperframes-broll-main-agent'
    || review.authority_scope !== 'source-review' || review.visual_decision !== null
    || !MODEL_ID.test(review.reviewer_model_id ?? '') || !isSha(review.reviewer_isolation_sha256)
    || review.reviewer_isolation_sha256 === integration.integrator_isolation_sha256
    || integration.chunks.some((chunk) => chunk.producer_isolation_sha256 === review.reviewer_isolation_sha256)) {
    fail('source_code_review_invalid', 'Source-code review identity, authority or isolation is invalid.');
  }
  exact(review.deterministic_result, ['status', 'facts_sha256', 'failure_codes'], 'source_code_review_invalid');
  if (review.deterministic_result.status !== 'passed'
    || review.deterministic_result.facts_sha256 !== integration.no_rewrite_receipt.receipt_sha256
    || !Array.isArray(review.deterministic_result.failure_codes)
    || review.deterministic_result.failure_codes.length) {
    fail('source_code_review_invalid', 'Source-code review cannot waive deterministic integration failures.');
  }
  if (review.subject_manifest_sha256 !== integration.manifest_sha256
    || review.producer_isolation_sha256 !== integration.integrator_isolation_sha256
    || review.authoring_plan_sha256 !== integration.authoring_plan_sha256
    || review.integration_manifest_sha256 !== integration.manifest_sha256
    || review.source_bundle_sha256 !== integration.source_bundle_sha256
    || review.no_rewrite_receipt_sha256
      !== integration.no_rewrite_receipt.receipt_sha256
    || Object.entries(sourceReviewBindings(integration)).some(
      ([field, value]) => review[field] !== value,
    )) {
    fail('source_code_review_unbound', 'Source-code review does not bind the exact integration and no-rewrite proof.');
  }
  validateSourceDecision(review.source_decision);
  normalizeChecks(review.source_checks);
  normalizeStillEvidence(review.still_evidence);
  const packet = validateSourceReviewPacket(integration.source_review_packet, {
    sourceFiles: integration.source_files,
    sourceBytes,
    bindings: sourceReviewBindings(integration),
  });
  for (const field of [
    'review_packet_sha256',
    'inspected_page_table_sha256s',
    'inspected_source_page_sha256s',
    'inspected_facts_page_sha256s',
    'inspected_supplemental_visual_page_sha256s',
    'inspected_supplemental_facts_page_sha256s',
  ]) {
    if (JSON.stringify(review[field]) !== JSON.stringify(packet[field])) {
      fail('source_code_review_unbound',
        'Source-code review omits, reorders, duplicates or substitutes a required packet page.');
    }
  }
  const { approval_sha256: ignored, ...core } = review;
  if (review.approval_sha256 !== fingerprint(core)) fail('source_code_review_tampered', 'Source-code review hash does not match its content.');
  return {
    gate: 'source_code_review',
    phase: 'pre-render',
    authority_scope: 'source-review',
    subject_manifest_sha256: integration.manifest_sha256,
    source_bundle_sha256: integration.source_bundle_sha256,
    source_file_count: packet.source_file_count,
    declared_page_count: packet.declared_page_count,
    status: 'approved',
  };
}

export function assertSourceReviewBeforeRender(subject, review, options = {}) {
  let integration = subject;
  if (subject && typeof subject === 'object'
    && ('integrationManifest' in subject || 'integration_manifest' in subject)) {
    options = subject;
    integration = subject.integrationManifest ?? subject.integration_manifest;
    review = subject.sourceCodeReview ?? subject.source_code_review ?? subject.review;
  }
  const integrationReceipt = validateAuthoringIntegrationManifest(integration, {
    plan: options.plan,
    chunks: options.chunks,
    chunkSourceBytes: options.chunkSourceBytes,
    sourceBytes: options.sourceBytes ?? integration?.source_bytes,
  });
  const reviewReceipt = validateSourceCodeReview(review, {
    integrationManifest: integration,
    plan: options.plan,
    chunks: options.chunks,
    chunkSourceBytes: options.chunkSourceBytes,
    sourceBytes: options.sourceBytes ?? integration?.source_bytes,
  });
  return {
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    authoring_plan_sha256: integrationReceipt.authoring_plan_sha256,
    integration_manifest_sha256: integrationReceipt.manifest_sha256,
    source_bundle_sha256: integrationReceipt.source_bundle_sha256,
    no_rewrite_receipt_sha256: integrationReceipt.no_rewrite_receipt_sha256,
    style_integration_authorization_sha256:
      integrationReceipt.style_integration_authorization_sha256,
    style_source_ledger_sha256:
      integrationReceipt.style_source_ledger_sha256,
    style_validator_receipt_sha256:
      integrationReceipt.style_validator_receipt_sha256,
    source_review_approval_sha256: review.approval_sha256,
    pre_render: reviewReceipt.phase === 'pre-render',
  };
}
