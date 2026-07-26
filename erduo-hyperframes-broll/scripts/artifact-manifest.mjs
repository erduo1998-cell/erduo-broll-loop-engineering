import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  SCRIPT_ONLY_CONTEXT_POLICY,
  validateContextBudget,
} from './validate-context-budget.mjs';
import {
  AUTHORING_TOPOLOGY_ID,
  PIPELINE_CONTRACT_VERSION,
  VALIDATION_POLICY_ID,
  inspectV3Compatibility,
} from './validate-production-contract.mjs';

export { AUTHORING_TOPOLOGY_ID, PIPELINE_CONTRACT_VERSION, VALIDATION_POLICY_ID };

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const STAGES = new Set([
  'preflight',
  'director',
  'assets',
  'master-build',
  'master-integrate',
  'render',
  'verify',
  'shot-export',
]);
const MANIFEST_MAX_BYTES = 16 * 1024;
const JSON_MAX_BYTES = 8 * 1024 * 1024;
const SOURCE_BUNDLE_MAX_BYTES = 64 * 1024 * 1024;
const PARENT_PRODUCT_FORBIDDEN = /(?:^|[-_.\/])(?:contact[-_.]?sheet|review[-_.]?page|main[-_.]?review|pre[-_.]?master|final[-_.]?frame[-_.]?page|inspected[-_.]?(?:image|visual)[-_.]?page)(?:$|[-_.\/])/iu;

export class ArtifactManifestError extends Error {
  constructor(code, message, artifact_id) {
    super(message);
    this.name = 'ArtifactManifestError';
    this.code = code;
    if (artifact_id) this.artifact_id = artifact_id;
  }
}

const fail = (code, message, artifactId) => {
  throw new ArtifactManifestError(code, message, artifactId);
};

const exact = (value, fields, code = 'artifact_manifest_invalid') => {
  if (
    !value
    || typeof value !== 'object'
    || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())
  ) fail(code, 'Artifact manifest has an invalid shape.');
};

function canonical(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      fail('artifact_manifest_invalid', 'Artifact numbers must be safe integers.');
    }
    return value;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) {
    fail('artifact_manifest_invalid', 'Artifact value is unsupported or cyclic.');
  }
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((item) => canonical(item, seen))
    : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], seen)]));
  seen.delete(value);
  return result;
}

export const fingerprintArtifactValue = (value) => createHash('sha256')
  .update(JSON.stringify(canonical(value)), 'utf8')
  .digest('hex');

const byteLength = (value) => Buffer.byteLength(JSON.stringify(canonical(value)), 'utf8');
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

function validateLocator(value, artifactId) {
  if (
    typeof value !== 'string'
    || !value
    || value.includes('\\')
    || path.posix.isAbsolute(value)
  ) fail('artifact_path_escape', 'Artifact locator must be a portable private-store key.', artifactId);
  const normalized = path.posix.normalize(value);
  if (
    normalized !== value
    || normalized === '.'
    || normalized.startsWith('../')
    || normalized.includes('/../')
  ) fail('artifact_path_escape', 'Artifact locator escapes its package.', artifactId);
}

export function validateBoundedMetrics(metrics) {
  if (
    !metrics
    || typeof metrics !== 'object'
    || Array.isArray(metrics)
    || Object.keys(metrics).length > 16
  ) fail('artifact_metrics_invalid', 'Artifact metrics must be a bounded object.');
  for (const [key, value] of Object.entries(metrics)) {
    if (
      !SAFE_ID.test(key)
      || !(
        value === null
        || typeof value === 'boolean'
        || typeof value === 'string'
        || Number.isSafeInteger(value)
      )
    ) fail('artifact_metrics_invalid', 'Artifact metric is invalid.');
    if (typeof value === 'string' && Buffer.byteLength(value, 'utf8') > 120) {
      fail('artifact_metrics_invalid', 'Artifact metric text is too large.');
    }
  }
  if (byteLength(metrics) > 2048) {
    fail('artifact_metrics_invalid', 'Artifact metrics exceed 2048 bytes.');
  }
  return metrics;
}

function validateArtifact(value) {
  exact(value, [
    'artifact_id',
    'kind',
    'sha256',
    'size_bytes',
    'media_type',
    'locator_key',
    'required_by',
  ]);
  if (
    !SAFE_ID.test(value.artifact_id ?? '')
    || !SAFE_ID.test(value.kind ?? '')
    || !SHA256.test(value.sha256 ?? '')
    || !Number.isSafeInteger(value.size_bytes)
    || value.size_bytes < 0
    || typeof value.media_type !== 'string'
    || !value.media_type
    || Buffer.byteLength(value.media_type, 'utf8') > 120
    || !Array.isArray(value.required_by)
    || !value.required_by.length
    || value.required_by.length > 8
    || value.required_by.some((item) => !SAFE_ID.test(item ?? ''))
  ) fail('artifact_manifest_invalid', 'Artifact record is invalid.', value?.artifact_id);
  validateLocator(value.locator_key, value.artifact_id);
  if (value.kind === 'json' && value.size_bytes > JSON_MAX_BYTES) {
    fail('artifact_size_exceeded', 'Structured JSON artifact exceeds 8 MiB.', value.artifact_id);
  }
  if (value.kind === 'source-bundle' && value.size_bytes > SOURCE_BUNDLE_MAX_BYTES) {
    fail('artifact_size_exceeded', 'Source bundle exceeds 64 MiB.', value.artifact_id);
  }
}

function manifestCore({
  run_id,
  stage,
  package_id,
  upstream_manifest_sha256,
  creative_brief_sha256,
  producer_isolation_sha256,
  artifacts,
  metrics,
}) {
  return {
    schema_version: 4,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    run_id,
    stage,
    package_id,
    upstream_manifest_sha256,
    creative_brief_sha256,
    producer_isolation_sha256,
    artifacts,
    metrics,
  };
}

export function createArtifactManifest({
  run_id,
  stage,
  package_id,
  upstream_manifest_sha256,
  creative_brief_sha256,
  producer_isolation_sha256,
  artifacts,
  metrics,
}) {
  if (
    !SAFE_ID.test(run_id ?? '')
    || !STAGES.has(stage)
    || !SAFE_ID.test(package_id ?? '')
    || !SHA256.test(upstream_manifest_sha256 ?? '')
    || !SHA256.test(creative_brief_sha256 ?? '')
    || !SHA256.test(producer_isolation_sha256 ?? '')
    || !Array.isArray(artifacts)
    || !artifacts.length
    || artifacts.length > 256
  ) fail('artifact_manifest_invalid', 'Artifact manifest identity is invalid.');
  validateBoundedMetrics(metrics);
  artifacts.forEach(validateArtifact);
  const ids = new Set();
  const locators = new Set();
  for (const artifact of artifacts) {
    if (ids.has(artifact.artifact_id) || locators.has(artifact.locator_key)) {
      fail(
        'artifact_manifest_invalid',
        'Artifact IDs and locators must be unique.',
        artifact.artifact_id,
      );
    }
    ids.add(artifact.artifact_id);
    locators.add(artifact.locator_key);
  }
  const core = manifestCore({
    run_id,
    stage,
    package_id,
    upstream_manifest_sha256,
    creative_brief_sha256,
    producer_isolation_sha256,
    artifacts,
    metrics,
  });
  const manifest = { ...core, manifest_sha256: fingerprintArtifactValue(core) };
  if (byteLength(manifest) > MANIFEST_MAX_BYTES) {
    fail('artifact_manifest_too_large', 'Canonical artifact manifest exceeds 16 KiB.');
  }
  return manifest;
}

function assertParentSafe(manifest) {
  for (const artifact of manifest.artifacts) {
    const labels = [
      artifact.artifact_id,
      artifact.kind,
      artifact.locator_key,
      ...artifact.required_by,
    ];
    if (labels.some((label) => PARENT_PRODUCT_FORBIDDEN.test(label))) {
      fail(
        'artifact_parent_payload_forbidden',
        'Parent envelopes cannot expose inspection-page products.',
        artifact.artifact_id,
      );
    }
  }
  for (const value of Object.values(manifest.metrics)) {
    if (
      typeof value === 'string'
      && !SHA256.test(value)
      && (
        /[\\/]/u.test(value)
        || /(?:^|[-_.])(?:artifact|evidence|frame|proof|source)[-_.].+\.[a-z0-9]{1,12}$/iu
          .test(value)
      )
    ) {
      fail(
        'artifact_parent_payload_forbidden',
        'Parent metric locator and proof-reference values must be opaque SHA-256 bindings.',
      );
    }
  }
}

export function createArtifactEnvelope(manifest) {
  const compatibility = inspectV3Compatibility(manifest);
  if (compatibility.code === 'pipeline_upgrade_required') {
    fail('pipeline_upgrade_required', 'Legacy artifact manifests are inspection-only.');
  }
  if (compatibility.code === 'legacy_field_forbidden') {
    fail('legacy_field_forbidden', 'Legacy fields cannot be re-signed into an active envelope.');
  }
  exact(manifest, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'validation_policy_id',
    'run_id',
    'stage',
    'package_id',
    'upstream_manifest_sha256',
    'creative_brief_sha256',
    'producer_isolation_sha256',
    'artifacts',
    'metrics',
    'manifest_sha256',
  ]);
  const rebuilt = createArtifactManifest(manifest);
  if (
    manifest.schema_version !== 4
    || manifest.manifest_sha256 !== rebuilt.manifest_sha256
  ) fail('artifact_hash_mismatch', 'Artifact manifest hash does not bind its parent envelope.');
  assertParentSafe(manifest);
  const artifact_counts = Object.fromEntries(
    [...new Set(manifest.artifacts.map((item) => item.kind))]
      .sort()
      .map((kind) => [
        kind,
        manifest.artifacts.filter((item) => item.kind === kind).length,
      ]),
  );
  const envelope = {
    schema_version: 1,
    pipeline_contract_version: PIPELINE_CONTRACT_VERSION,
    authoring_topology_id: AUTHORING_TOPOLOGY_ID,
    validation_policy_id: VALIDATION_POLICY_ID,
    stage: manifest.stage,
    package_id: manifest.package_id,
    manifest_sha256: manifest.manifest_sha256,
    upstream_manifest_sha256: manifest.upstream_manifest_sha256,
    artifact_counts,
    metrics: manifest.metrics,
    producer_isolation_sha256: manifest.producer_isolation_sha256,
  };
  try {
    validateContextBudget(envelope, {
      kind: 'stage-envelope',
      policy: SCRIPT_ONLY_CONTEXT_POLICY,
    });
  } catch (error) {
    if (error?.code) {
      fail(
        'artifact_parent_payload_forbidden',
        'Parent artifact envelope contains forbidden or oversized payload data.',
      );
    }
    throw error;
  }
  return envelope;
}

export async function validateArtifactManifest(manifest, {
  root,
  expectedStage,
  expectedUpstream,
  expectedProducerIsolationSha256,
  expectedCreativeBriefSha256,
} = {}) {
  const compatibility = inspectV3Compatibility(manifest);
  if (compatibility.code === 'pipeline_upgrade_required') {
    fail('pipeline_upgrade_required', 'Legacy artifact manifests are inspection-only.');
  }
  if (compatibility.code === 'legacy_field_forbidden') {
    fail('legacy_field_forbidden', 'Legacy fields cannot enter an active artifact manifest.');
  }
  exact(manifest, [
    'schema_version',
    'pipeline_contract_version',
    'authoring_topology_id',
    'validation_policy_id',
    'run_id',
    'stage',
    'package_id',
    'upstream_manifest_sha256',
    'creative_brief_sha256',
    'producer_isolation_sha256',
    'artifacts',
    'metrics',
    'manifest_sha256',
  ]);
  const rebuilt = createArtifactManifest(manifest);
  if (
    manifest.schema_version !== 4
    || manifest.manifest_sha256 !== rebuilt.manifest_sha256
  ) fail('artifact_hash_mismatch', 'Artifact manifest hash does not match its content.');
  if (expectedStage && manifest.stage !== expectedStage) {
    fail('artifact_set_unbound', 'Artifact package belongs to another stage.');
  }
  if (expectedUpstream && manifest.upstream_manifest_sha256 !== expectedUpstream) {
    fail('artifact_set_unbound', 'Artifact package does not bind expected upstream.');
  }
  if (
    expectedProducerIsolationSha256
    && manifest.producer_isolation_sha256 !== expectedProducerIsolationSha256
  ) fail('artifact_set_unbound', 'Artifact package does not bind expected producer.');
  if (
    expectedCreativeBriefSha256
    && manifest.creative_brief_sha256 !== expectedCreativeBriefSha256
  ) fail('artifact_set_unbound', 'Artifact package does not bind expected creative brief.');
  if (root) {
    const resolvedRoot = path.resolve(root);
    for (const artifact of manifest.artifacts) {
      const target = path.resolve(resolvedRoot, artifact.locator_key);
      if (!target.startsWith(`${resolvedRoot}${path.sep}`)) {
        fail('artifact_path_escape', 'Artifact locator escapes its package.', artifact.artifact_id);
      }
      let stat;
      try {
        stat = await lstat(target);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          fail('artifact_missing', 'Artifact file is missing.', artifact.artifact_id);
        }
        throw error;
      }
      if (stat.isSymbolicLink()) {
        fail('artifact_symlink', 'Artifact files must not be symbolic links.', artifact.artifact_id);
      }
      if (!stat.isFile()) {
        fail('artifact_manifest_invalid', 'Artifact must be a regular file.', artifact.artifact_id);
      }
      const bytes = await readFile(target);
      if (bytes.length !== artifact.size_bytes || hashBytes(bytes) !== artifact.sha256) {
        fail(
          'artifact_hash_mismatch',
          'Artifact file does not match its manifest.',
          artifact.artifact_id,
        );
      }
    }
  }
  return manifest;
}

export async function inspectArtifactManifest(manifest) {
  const compatibility = inspectV3Compatibility(manifest);
  if (compatibility.code !== 'canonical_artifact_validation_required') {
    return {
      resume_eligible: false,
      resign_eligible: false,
      code: compatibility.code,
      schema_version: Number.isSafeInteger(manifest?.schema_version)
        ? manifest.schema_version
        : null,
      pipeline_contract_version: compatibility.pipeline_contract_version,
      stage: typeof manifest?.stage === 'string' ? manifest.stage : null,
      manifest_sha256: SHA256.test(manifest?.manifest_sha256 ?? '')
        ? manifest.manifest_sha256
        : null,
    };
  }
  try {
    await validateArtifactManifest(manifest);
  } catch (error) {
    return {
      resume_eligible: false,
      resign_eligible: false,
      code: error?.code ?? 'artifact_manifest_invalid',
      schema_version: Number.isSafeInteger(manifest?.schema_version)
        ? manifest.schema_version
        : null,
      pipeline_contract_version: compatibility.pipeline_contract_version,
      stage: typeof manifest?.stage === 'string' ? manifest.stage : null,
      manifest_sha256: SHA256.test(manifest?.manifest_sha256 ?? '')
        ? manifest.manifest_sha256
        : null,
    };
  }
  return {
    resume_eligible: true,
    resign_eligible: false,
    code: null,
    schema_version: manifest.schema_version,
    pipeline_contract_version: manifest.pipeline_contract_version,
    stage: manifest.stage,
    manifest_sha256: manifest.manifest_sha256,
  };
}
