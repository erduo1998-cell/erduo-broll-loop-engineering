import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateSourceCodeReview } from './validate-authoring-topology.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const MAX_PACKET_BYTES = 4096;
const MAX_PAGE_COUNT = 256;
const MAX_FACTS_PAGE_BYTES = 1024 * 1024;
const MAX_VISUAL_PAGE_BYTES = 32 * 1024 * 1024;
const MAX_SOURCE_FILE_BYTES = 64 * 1024 * 1024;
const MAIN_REVIEW_ROLE = 'erduo-hyperframes-broll-main-agent';
const DISQUALIFIED_VISUAL_MODELS = new Set(['deepseek-v4-pro']);
const GATES = {
  shot_plan_review: { stage: 'director', authority: 'fact-review', paired: false, metric: null },
  asset_fact_review: { stage: 'assets', authority: 'fact-review', paired: true, metric: 'contact_sheet_page_count' },
  html_preview_review: { stage: 'master-build', authority: 'visual-review', paired: true, metric: 'pre_master_page_count' },
  final_frame_review: { stage: 'render', authority: 'visual-review', paired: true, metric: 'final_frame_page_count' },
  source_code_review: { stage: 'master-build', authority: 'source-review', paired: false, source: true, metric: 'source_file_count' },
};
const FORBIDDEN_DETERMINISTIC_KEY = /(?:aesthetic|visual[_-]?decision|visual[_-]?verdict|quality[_-]?score|subjective|delivery[_-]?ready|approve(?:d|s|r|al)?)/iu;

export class MainReviewPacketError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MainReviewPacketError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new MainReviewPacketError(code, message); };
const exact = (value, fields, code = 'main_review_packet_invalid') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, 'Main-review value has an invalid shape.');
  }
};
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isSha = (value) => typeof value === 'string' && SHA256.test(value);
const asBuffer = (value, code = 'main_review_page_unresolved') => {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) fail(code, 'Main-review bytes are unresolved.');
  return Buffer.from(value);
};

function assertNoAuthorityKeys(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_DETERMINISTIC_KEY.test(key)) {
      fail('deterministic_authority_overreach', 'Deterministic evidence cannot approve or score visual quality.');
    }
    assertNoAuthorityKeys(child);
  }
}

export function validateDeterministicReviewResult(value) {
  assertNoAuthorityKeys(value);
  exact(value, ['status', 'facts_sha256', 'failure_codes'], 'deterministic_result_invalid');
  if (!['passed', 'failed'].includes(value.status) || !isSha(value.facts_sha256)
    || !Array.isArray(value.failure_codes) || value.failure_codes.length > 64
    || value.failure_codes.some((item) => typeof item !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,95}$/u.test(item))
    || new Set(value.failure_codes).size !== value.failure_codes.length
    || (value.status === 'passed' && value.failure_codes.length !== 0)
    || (value.status === 'failed' && value.failure_codes.length === 0)) {
    fail('deterministic_result_invalid', 'Deterministic evidence must contain only bound facts and coherent failure codes.');
  }
  return { status: value.status, fact_count_sha256: value.facts_sha256, failure_count: value.failure_codes.length };
}

function readPageBytes(pageBytes, artifactId) {
  if (!(pageBytes instanceof Map)) fail('main_review_page_unresolved', 'Page bytes must be supplied by opaque artifact ID.');
  return asBuffer(pageBytes.get(artifactId));
}

function validateArtifactRef(ref, kind, pageBytes, artifactRecords) {
  const fields = kind === 'facts'
    ? ['artifact_id', 'sha256', 'size_bytes', 'media_type', 'shot_start', 'shot_end']
    : ['artifact_id', 'sha256', 'size_bytes', 'media_type'];
  exact(ref, fields, 'main_review_page_invalid');
  const limit = kind === 'facts' ? MAX_FACTS_PAGE_BYTES
    : kind === 'source' ? MAX_SOURCE_FILE_BYTES : MAX_VISUAL_PAGE_BYTES;
  const sourceMedia = typeof ref.media_type === 'string'
    && (ref.media_type.startsWith('text/')
      || ['application/javascript', 'text/javascript', 'application/json', 'image/svg+xml'].includes(ref.media_type));
  if (typeof ref.artifact_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u.test(ref.artifact_id)
    || !isSha(ref.sha256) || !Number.isSafeInteger(ref.size_bytes) || ref.size_bytes < 1 || ref.size_bytes > limit
    || (kind === 'facts' ? ref.media_type !== 'application/json'
      : kind === 'source' ? !sourceMedia : !ref.media_type.startsWith('image/'))) {
    fail(ref.size_bytes > limit ? 'main_review_page_oversized' : 'main_review_page_invalid', 'Main-review page metadata is invalid.');
  }
  const bytes = readPageBytes(pageBytes, ref.artifact_id);
  const record = artifactRecords.get(ref.artifact_id);
  if (!record || record.sha256 !== ref.sha256 || record.size_bytes !== ref.size_bytes
    || record.media_type !== ref.media_type) {
    fail('main_review_page_unbound', 'Main-review page does not resolve from the subject manifest.');
  }
  if (bytes.length !== ref.size_bytes || hashBytes(bytes) !== ref.sha256) {
    fail('main_review_page_unbound', 'Main-review page bytes do not match the packet.');
  }
  if (kind === 'facts'
    && (!Number.isSafeInteger(ref.shot_start) || !Number.isSafeInteger(ref.shot_end)
      || ref.shot_start < 1 || ref.shot_end < ref.shot_start)) {
    fail('main_review_page_invalid', 'Facts-page shot range is invalid.');
  }
  return ref.sha256;
}

function parsePacket(packetBytes) {
  const bytes = asBuffer(packetBytes, 'main_review_packet_unresolved');
  if (bytes.length < 1) fail('main_review_packet_unresolved', 'Main-review packet is empty.');
  if (bytes.length > MAX_PACKET_BYTES) fail('main_review_packet_oversized', 'Main-review packet exceeds 4096 bytes.');
  let packet;
  try { packet = JSON.parse(bytes.toString('utf8')); } catch { fail('main_review_packet_invalid', 'Main-review packet is not valid JSON.'); }
  if (Array.isArray(packet?.pages) && packet.pages.length > MAX_PAGE_COUNT) {
    fail('main_review_page_limit_exceeded', 'Main-review packet declares more than 256 pages.');
  }
  if (Array.isArray(packet?.sources) && packet.sources.length > MAX_PAGE_COUNT) {
    fail('main_review_page_limit_exceeded', 'Source-review packet declares more than 256 source files.');
  }
  return { bytes, packet };
}

function validatePacketPages(packet, config, pageBytes, artifactRecords, shotCount) {
  if (config.source) {
    if (!Array.isArray(packet.sources) || packet.sources.length < 1 || packet.sources.length > MAX_PAGE_COUNT) {
      fail(packet.sources?.length > MAX_PAGE_COUNT ? 'main_review_page_limit_exceeded' : 'main_review_packet_incomplete', 'Source-review source count is invalid.');
    }
    const sources = packet.sources.map((source) => validateArtifactRef(source, 'source', pageBytes, artifactRecords));
    return { visual: [], facts: [], sources };
  }
  if (!Array.isArray(packet.pages) || packet.pages.length < 1 || packet.pages.length > MAX_PAGE_COUNT) {
    fail(packet.pages?.length > MAX_PAGE_COUNT ? 'main_review_page_limit_exceeded' : 'main_review_packet_incomplete', 'Main-review packet page count is invalid.');
  }
  let nextShot = 1;
  const visual = [];
  const facts = [];
  for (const page of packet.pages) {
    if (config.paired) {
      exact(page, ['visual', 'facts'], 'main_review_page_invalid');
      visual.push(validateArtifactRef(page.visual, 'visual', pageBytes, artifactRecords));
      facts.push(validateArtifactRef(page.facts, 'facts', pageBytes, artifactRecords));
      if (page.facts.shot_start !== nextShot) fail('main_review_packet_incomplete', 'Main-review page ranges are not contiguous.');
      nextShot = page.facts.shot_end + 1;
    } else {
      facts.push(validateArtifactRef(page, 'facts', pageBytes, artifactRecords));
      if (page.shot_start !== nextShot) fail('main_review_packet_incomplete', 'Main-review page ranges are not contiguous.');
      nextShot = page.shot_end + 1;
    }
  }
  if (nextShot !== shotCount + 1) fail('main_review_packet_incomplete', 'Main-review pages do not cover every shot.');
  return { visual, facts, sources: [] };
}

function validateReviewAuthority(review, config, producerIsolationSha256) {
  if (review.pipeline_contract_version !== 2) fail('pipeline_upgrade_required', 'Legacy main reviews are inspection-only.');
  if (review.reviewer_role !== MAIN_REVIEW_ROLE || !MODEL_ID.test(review.reviewer_model_id ?? '')
    || !isSha(review.reviewer_isolation_sha256) || review.reviewer_isolation_sha256 === producerIsolationSha256
    || review.producer_isolation_sha256 !== producerIsolationSha256) {
    fail(review.reviewer_isolation_sha256 === producerIsolationSha256 ? 'self_attested_review' : 'main_agent_identity_invalid', 'Main review is not isolated from its producer or lacks a qualified main identity.');
  }
  if (review.authority_scope !== config.authority) fail('main_review_authority_invalid', 'Main-review authority does not match the gate.');
  if (config.authority === 'fact-review' || config.authority === 'source-review') {
    if (review.visual_decision !== null) fail('main_review_authority_overreach', 'Fact/source review cannot carry a visual verdict.');
  } else {
    if (DISQUALIFIED_VISUAL_MODELS.has(review.reviewer_model_id)) fail('visual_reviewer_model_disqualified', 'This model is disqualified from visual approval.');
    exact(review.visual_decision, ['outcome', 'viewed_all_pages', 'decision_sha256', 'finding_count'], 'visual_decision_invalid');
    if (!['approved', 'rejected'].includes(review.visual_decision.outcome)
      || review.visual_decision.viewed_all_pages !== true || !isSha(review.visual_decision.decision_sha256)
      || !Number.isSafeInteger(review.visual_decision.finding_count) || review.visual_decision.finding_count < 0
      || (review.visual_decision.outcome === 'approved' && review.visual_decision.finding_count !== 0)
      || (review.visual_decision.outcome === 'rejected' && review.visual_decision.finding_count < 1)) {
      fail('visual_decision_invalid', 'Visual decision is incomplete or incoherent.');
    }
  }
}

export function validateMainReviewAuthoritySummary(review, { gate, producerIsolationSha256 }) {
  const config = GATES[gate];
  if (!config || review?.gate !== gate) fail('main_review_gate_invalid', 'Unknown or mismatched main-review gate.');
  validateReviewAuthority(review, config, producerIsolationSha256);
  validateDeterministicReviewResult(review.deterministic_result);
  if (review.deterministic_result.status !== 'passed') {
    fail('deterministic_failure_not_waivable', 'A main review cannot waive deterministic failures.');
  }
  if (gate === 'source_code_review') {
    const checkFields = ['positions', 'z_order', 'shot_order', 'timing', 'lifecycle', 'selectors', 'cross_chunk_seams', 'errors'];
    exact(review.source_checks, checkFields, 'source_code_review_invalid');
    if (checkFields.some((field) => review.source_checks[field] !== true)) {
      fail('source_code_review_invalid', 'Every source semantic check must pass before render.');
    }
    exact(review.still_evidence, ['uses', 'animation_approval', 'evidence_sha256'], 'still_evidence_scope_invalid');
    if (!Array.isArray(review.still_evidence.uses)
      || review.still_evidence.uses.some((item) => !['font', 'crop', 'material-visibility'].includes(item))
      || new Set(review.still_evidence.uses).size !== review.still_evidence.uses.length
      || review.still_evidence.animation_approval !== false
      || !isSha(review.still_evidence.evidence_sha256)) {
      fail('still_evidence_scope_invalid', 'Still evidence cannot approve animation or exceed its allowed scopes.');
    }
    const decisionFields = [
      'outcome', 'read_all_source_pages', 'position_z_order_checked',
      'shot_order_checked', 'duration_checked',
      'five_phase_lifecycle_checked', 'selectors_checked',
      'cross_block_seams_checked', 'source_errors_checked',
      'static_checks_limited_to_font_crop_material_visibility',
      'animation_approved_from_stills', 'finding_count', 'decision_sha256',
    ];
    exact(review.source_decision, decisionFields, 'source_code_review_invalid');
    if (review.source_decision.outcome !== 'approved'
      || review.source_decision.read_all_source_pages !== true
      || review.source_decision.position_z_order_checked !== true
      || review.source_decision.shot_order_checked !== true
      || review.source_decision.duration_checked !== true
      || review.source_decision.five_phase_lifecycle_checked !== true
      || review.source_decision.selectors_checked !== true
      || review.source_decision.cross_block_seams_checked !== true
      || review.source_decision.source_errors_checked !== true
      || review.source_decision.static_checks_limited_to_font_crop_material_visibility !== true
      || review.source_decision.animation_approved_from_stills !== false
      || review.source_decision.finding_count !== 0
      || !isSha(review.source_decision.decision_sha256)) {
      fail('source_code_review_invalid',
        'Source review decision is incomplete or claims still-derived animation approval.');
    }
  }
  return { gate, authority_scope: config.authority, reviewer_model_id: review.reviewer_model_id };
}

/**
 * Resolve and validate one complete producer packet before accepting its main
 * review. `pageBytes` is keyed by opaque artifact ID; paths never enter the
 * public review.
 */
export function validateMainReviewPacket({
  review,
  manifestEnvelope,
  producerPacketBytes,
  pageBytes,
  artifactRecords,
  integrationManifest,
  plan,
  chunks,
  chunkSourceBytes,
  sourceBytes,
}) {
  const config = GATES[review?.gate];
  if (!config) fail('main_review_gate_invalid', 'Unknown main-review gate.');
  if (config.source) {
    if (!integrationManifest || !(sourceBytes instanceof Map)) {
      fail('main_review_packet_unresolved',
        'Source review requires the complete integration, packet pages and raw source bytes.');
    }
    if (manifestEnvelope?.manifest_sha256 !== integrationManifest.manifest_sha256
      || manifestEnvelope?.producer_isolation_sha256
        !== integrationManifest.integrator_isolation_sha256) {
      fail('main_review_packet_unbound',
        'Source-review subject envelope differs from the integrated manifest.');
    }
    try {
      const receipt = validateSourceCodeReview(review, {
        integrationManifest,
        plan,
        chunks,
        chunkSourceBytes,
        sourceBytes,
      });
      return {
        gate: review.gate,
        authority_scope: 'source-review',
        subject_manifest_sha256: integrationManifest.manifest_sha256,
        packet_sha256: review.review_packet_sha256,
        page_count: receipt.declared_page_count,
        visual_page_count:
          review.inspected_supplemental_visual_page_sha256s.length,
        facts_page_count:
          review.inspected_facts_page_sha256s.length
            + review.inspected_supplemental_facts_page_sha256s.length,
        source_file_count: receipt.source_file_count,
      };
    } catch (error) {
      fail(error?.code ?? 'main_review_packet_invalid',
        error?.message ?? 'Complete source-review packet validation failed.');
    }
  }
  const subjectCountValid = config.source
    ? Number.isSafeInteger(manifestEnvelope?.metrics?.source_file_count) && manifestEnvelope.metrics.source_file_count > 0
    : Number.isSafeInteger(manifestEnvelope?.metrics?.shot_count) && manifestEnvelope.metrics.shot_count > 0;
  if (!manifestEnvelope || manifestEnvelope.pipeline_contract_version !== 2
    || manifestEnvelope.stage !== config.stage || !isSha(manifestEnvelope.manifest_sha256)
    || !isSha(manifestEnvelope.producer_isolation_sha256)
    || !subjectCountValid) {
    fail('main_review_subject_invalid', 'Main-review subject manifest is invalid.');
  }
  const { bytes, packet } = parsePacket(producerPacketBytes);
  if (!Array.isArray(artifactRecords)) fail('main_review_subject_invalid', 'Subject manifest artifact records are required.');
  const records = new Map(artifactRecords.map((record) => [record.artifact_id, record]));
  if (records.size !== artifactRecords.length
    || ![...records.values()].some((record) => record.sha256 === hashBytes(bytes)
      && record.size_bytes === bytes.length && record.media_type === 'application/json')) {
    fail('main_review_packet_unbound', 'Main-review packet does not resolve from the subject manifest.');
  }
  if (review.subject_manifest_sha256 !== manifestEnvelope.manifest_sha256
    || !isSha(review.review_packet_sha256) || review.review_packet_sha256 !== hashBytes(bytes)) {
    fail('main_review_packet_unbound', 'Main review does not bind the exact subject manifest and packet bytes.');
  }
  exact(packet, config.source
    ? ['schema_version', 'pipeline_contract_version', 'gate', 'source_count', 'sources']
    : ['schema_version', 'pipeline_contract_version', 'gate', 'shot_count', 'pages'], 'main_review_packet_invalid');
  const declaredCountMatches = config.source
    ? packet.source_count === manifestEnvelope.metrics.source_file_count
    : packet.shot_count === manifestEnvelope.metrics.shot_count;
  if (packet.schema_version !== 1 || packet.pipeline_contract_version !== 2 || packet.gate !== review.gate
    || !declaredCountMatches) {
    fail('main_review_packet_unbound', 'Producer packet identity does not match the review gate and shot count.');
  }
  const inspected = validatePacketPages(packet, config, pageBytes, records, packet.shot_count);
  const declaredItems = config.source ? packet.sources : packet.pages;
  if (config.metric && manifestEnvelope.metrics[config.metric] !== declaredItems.length) {
    fail('main_review_packet_incomplete', 'Producer packet page count differs from the subject manifest.');
  }
  validateMainReviewAuthoritySummary(review, { gate: review.gate, producerIsolationSha256: manifestEnvelope.producer_isolation_sha256 });
  const actualVisual = review.inspected_visual_page_sha256s ?? [];
  const actualFacts = review.inspected_facts_page_sha256s ?? review.inspected_page_sha256s ?? [];
  const actualSources = review.inspected_source_sha256s ?? [];
  if (JSON.stringify(actualVisual) !== JSON.stringify(inspected.visual)
    || JSON.stringify(actualFacts) !== JSON.stringify(inspected.facts)
    || JSON.stringify(actualSources) !== JSON.stringify(inspected.sources)) {
    fail('main_review_pages_unbound', 'Main review does not bind every inspected page in packet order.');
  }
  return {
    gate: review.gate,
    authority_scope: config.authority,
    subject_manifest_sha256: manifestEnvelope.manifest_sha256,
    packet_sha256: hashBytes(bytes),
    page_count: config.source ? 0 : packet.pages.length,
    visual_page_count: inspected.visual.length,
    facts_page_count: inspected.facts.length,
    source_file_count: inspected.sources.length,
  };
}

async function readManifestArtifactBytes(root, record) {
  if (typeof root !== 'string' || !root || !record) {
    fail('main_review_subject_invalid', 'Main-review subject root or artifact record is missing.');
  }
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, record.locator_key);
  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) {
    fail('main_review_packet_unbound', 'Main-review artifact locator escapes the subject package.');
  }
  let stat;
  try {
    stat = await lstat(target);
  } catch {
    fail('main_review_packet_unresolved', 'Main-review artifact cannot be resolved from the subject package.');
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    fail('main_review_packet_unbound', 'Main-review artifact must be a regular non-symlink file.');
  }
  const bytes = await readFile(target);
  if (bytes.length !== record.size_bytes || hashBytes(bytes) !== record.sha256) {
    fail('main_review_packet_unbound', 'Main-review artifact bytes do not match the subject manifest.');
  }
  return bytes;
}

/**
 * Re-resolve a review packet and every declared page from the current subject
 * manifest. Stage-chain and resume validators must call this function instead
 * of accepting an authority summary or hash-shaped fields.
 */
export async function validateManifestMainReviewPacket({
  review,
  manifest,
  root,
  integrationManifest,
  plan,
  chunks,
  chunkSourceBytes,
}) {
  const config = GATES[review?.gate];
  if (!config || manifest?.stage !== config.stage || !Array.isArray(manifest?.artifacts)) {
    fail('main_review_subject_invalid', 'Main-review gate and subject manifest do not match.');
  }
  const records = new Map(manifest.artifacts.map((record) => [record.artifact_id, record]));
  if (records.size !== manifest.artifacts.length) {
    fail('main_review_subject_invalid', 'Subject manifest contains duplicate artifact IDs.');
  }
  const packetRecord = config.source
    ? records.get(integrationManifest?.source_review_packet?.root?.artifact_id)
    : records.get(`main-review-packet-${review.gate}`)
      ?? records.get(`main-review-packet-${manifest.stage}`);
  if (!packetRecord || packetRecord.kind !== 'json' || packetRecord.media_type !== 'application/json'
    || !packetRecord.required_by?.includes('main-review')) {
    fail('main_review_packet_unresolved', 'Subject manifest does not contain its canonical main-review packet.');
  }
  const producerPacketBytes = await readManifestArtifactBytes(root, packetRecord);
  if (config.source) {
    if (!integrationManifest) {
      fail('main_review_packet_unresolved',
        'Manifest source review requires its complete integration manifest.');
    }
    const requiredRefs = [
      ...integrationManifest.source_files,
      ...integrationManifest.generated_files,
      integrationManifest.source_review_packet.root,
      ...integrationManifest.source_review_packet.page_tables,
      ...integrationManifest.source_review_packet.pages,
    ];
    const sourceBytes = new Map();
    for (const ref of requiredRefs) {
      const record = records.get(ref.artifact_id);
      if (!record) {
        fail('main_review_page_unresolved',
          'Integrated raw source or source-review packet page is absent from the subject manifest.');
      }
      sourceBytes.set(ref.artifact_id,
        await readManifestArtifactBytes(root, record));
    }
    return validateMainReviewPacket({
      review,
      manifestEnvelope: {
        ...manifest,
        manifest_sha256: integrationManifest.manifest_sha256,
        producer_isolation_sha256:
          integrationManifest.integrator_isolation_sha256,
      },
      producerPacketBytes,
      pageBytes: sourceBytes,
      artifactRecords: manifest.artifacts,
      integrationManifest,
      plan,
      chunks,
      chunkSourceBytes,
      sourceBytes,
    });
  }
  const { packet } = parsePacket(producerPacketBytes);
  const pageIds = [];
  if (!config.source && !Array.isArray(packet?.pages)) {
    fail('main_review_packet_invalid', 'Main-review packet pages are invalid.');
  }
  if (config.source) {
    if (!Array.isArray(packet?.sources)) fail('main_review_packet_invalid', 'Source-review packet sources are invalid.');
    for (const source of packet.sources) if (source?.artifact_id) pageIds.push(source.artifact_id);
  } else {
    for (const page of packet.pages) {
      if (config.paired) {
        if (page?.visual?.artifact_id) pageIds.push(page.visual.artifact_id);
        if (page?.facts?.artifact_id) pageIds.push(page.facts.artifact_id);
      } else if (page?.artifact_id) {
        pageIds.push(page.artifact_id);
      }
    }
  }
  const pageBytes = new Map();
  for (const artifactId of new Set(pageIds)) {
    const record = records.get(artifactId);
    if (!record) fail('main_review_page_unresolved', 'Main-review page is absent from the subject manifest.');
    pageBytes.set(artifactId, await readManifestArtifactBytes(root, record));
  }
  return validateMainReviewPacket({
    review,
    manifestEnvelope: manifest,
    producerPacketBytes,
    pageBytes,
    artifactRecords: manifest.artifacts,
  });
}

export function inspectMainReviewPacket(review) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    return { resume_eligible: false, code: 'main_review_packet_invalid', pipeline_contract_version: null, gate: null };
  }
  if (review.pipeline_contract_version !== 2) {
    return {
      resume_eligible: false,
      code: 'pipeline_upgrade_required',
      pipeline_contract_version: Number.isSafeInteger(review.pipeline_contract_version) ? review.pipeline_contract_version : null,
      gate: typeof review.gate === 'string' ? review.gate : null,
    };
  }
  return { resume_eligible: false, code: 'validation_required', pipeline_contract_version: 2, gate: typeof review.gate === 'string' ? review.gate : null };
}
