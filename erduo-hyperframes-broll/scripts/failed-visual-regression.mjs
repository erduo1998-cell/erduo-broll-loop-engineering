#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultExecFileAsync } from './doctor.mjs';
import { probeMedia } from './probe-media.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const FAILURE_CLASS = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const AVAILABILITY = new Set(['archived-metadata-only', 'private-capture-required']);
const HISTORICAL_OUTCOME = new Set(['user-rejected']);
const REVIEW_AUTHORITY = 'qualified-main-agent';
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MIN_CAPTURE_COUNT = 12;
const MAX_CAPTURE_COUNT = 48;
const JSON_MAX_BYTES = 2 * 1024 * 1024;

export class FailedVisualRegressionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'FailedVisualRegressionError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new FailedVisualRegressionError(code, message); };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const exact = (value, fields, code = 'regression_schema_invalid') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, 'Failed visual regression data has an invalid shape.');
  }
};
const safeLocator = (value) => typeof value === 'string' && value.length > 0
  && !value.includes('\\') && !path.posix.isAbsolute(value)
  && path.posix.normalize(value) === value && value !== '.'
  && !value.startsWith('../') && !value.includes('/../');
const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

function assertNoPrivateLocation(value) {
  if (typeof value === 'string') {
    if (value.includes('/') || value.includes('\\') || /^[A-Za-z]:/u.test(value) || /^file:/iu.test(value)) {
      fail('registry_private_location', 'The public failed-sample registry cannot contain filesystem locations.');
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertNoPrivateLocation);
    return;
  }
  if (value && typeof value === 'object') Object.values(value).forEach(assertNoPrivateLocation);
}

export function validateFailedVisualRegressionRegistry(registry) {
  exact(registry, ['schema_version', 'registry_id', 'samples'], 'registry_invalid');
  if (registry.schema_version !== 1 || !SAFE_ID.test(registry.registry_id ?? '')
    || !Array.isArray(registry.samples) || registry.samples.length < 4 || registry.samples.length > 64) {
    fail('registry_invalid', 'The failed visual regression registry is invalid.');
  }
  assertNoPrivateLocation(registry);
  const sampleIds = new Set();
  for (const sample of registry.samples) {
    exact(sample, [
      'sample_id',
      'evidence_availability',
      'historical_outcome',
      'failure_classes',
      'required_review_authority',
    ], 'registry_sample_invalid');
    if (!SAFE_ID.test(sample.sample_id ?? '') || sampleIds.has(sample.sample_id)
      || !AVAILABILITY.has(sample.evidence_availability)
      || !HISTORICAL_OUTCOME.has(sample.historical_outcome)
      || sample.required_review_authority !== REVIEW_AUTHORITY
      || !Array.isArray(sample.failure_classes) || sample.failure_classes.length === 0
      || sample.failure_classes.length > 32
      || sample.failure_classes.some((item) => !FAILURE_CLASS.test(item ?? ''))
      || new Set(sample.failure_classes).size !== sample.failure_classes.length) {
      fail('registry_sample_invalid', 'A failed visual regression sample is invalid.');
    }
    sampleIds.add(sample.sample_id);
  }
  for (const required of ['ART-086', 'ART-096', 'ART-098', 'latest-4k']) {
    if (!sampleIds.has(required)) fail('registry_sample_missing', 'A required failed visual regression sample is missing.');
  }
  for (const archived of ['ART-086', 'ART-096', 'ART-098']) {
    if (registry.samples.find((item) => item.sample_id === archived)?.evidence_availability !== 'archived-metadata-only') {
      fail('registry_archive_status_invalid', 'Historical samples without readable media must remain archived metadata only.');
    }
  }
  return { registry_id: registry.registry_id, sample_count: registry.samples.length };
}

export function representativeTimestamps(durationMs, count = 16) {
  if (!Number.isSafeInteger(durationMs) || durationMs < 1000
    || !Number.isSafeInteger(count) || count < MIN_CAPTURE_COUNT || count > MAX_CAPTURE_COUNT) {
    fail('capture_timestamps_invalid', 'Representative frame timing is invalid.');
  }
  const timestamps = [];
  for (let index = 0; index < count; index += 1) {
    const timestamp = Math.floor(((2 * index + 1) * durationMs) / (2 * count));
    timestamps.push(Math.min(durationMs - 1, Math.max(0, timestamp)));
  }
  if (new Set(timestamps).size !== timestamps.length) fail('capture_timestamps_invalid', 'Representative frame timing is not unique.');
  return timestamps;
}

function validateTimestamps(timestamps, durationMs) {
  if (!Array.isArray(timestamps) || timestamps.length < MIN_CAPTURE_COUNT || timestamps.length > MAX_CAPTURE_COUNT
    || timestamps.some((value) => !Number.isSafeInteger(value) || value < 0 || value >= durationMs)
    || new Set(timestamps).size !== timestamps.length
    || timestamps.some((value, index) => index > 0 && value <= timestamps[index - 1])) {
    fail('capture_timestamps_invalid', 'Capture timestamps must be unique, ordered and inside the media duration.');
  }
  return timestamps;
}

export function parsePngDimensions(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 24
    || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
    || bytes.readUInt32BE(8) !== 13
    || bytes.subarray(12, 16).toString('ascii') !== 'IHDR') {
    fail('png_invalid', 'A captured frame is not a PNG with an IHDR header.');
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    fail('png_invalid', 'A captured PNG raster is invalid.');
  }
  return { width, height };
}

function normalizedMediaFacts(probe) {
  const video = probe?.video?.primary;
  if (!video || !Number.isSafeInteger(probe.duration_ms) || probe.duration_ms < 1) {
    fail('media_facts_invalid', 'The regression sample must contain a timed video stream.');
  }
  const frameRate = video.frame_rate;
  if (!frameRate || !Number.isSafeInteger(frameRate.numerator) || !Number.isSafeInteger(frameRate.denominator)) {
    fail('media_facts_invalid', 'The regression sample frame rate is invalid.');
  }
  const audio = probe.audio?.primary;
  return {
    duration_ms: probe.duration_ms,
    width: video.display_width,
    height: video.display_height,
    frame_rate: {
      numerator: frameRate.numerator,
      denominator: frameRate.denominator,
    },
    video_codec: video.codec,
    pixel_format: video.pixel_format,
    audio: audio ? {
      stream_count: probe.audio.count,
      codec: audio.codec,
      sample_rate: audio.sample_rate,
      channels: audio.channels,
    } : {
      stream_count: 0,
      codec: null,
      sample_rate: null,
      channels: null,
    },
    decode_smoke_ok: probe.decode?.ok === true,
  };
}

function validateMediaFacts(value) {
  exact(value, [
    'duration_ms', 'width', 'height', 'frame_rate', 'video_codec',
    'pixel_format', 'audio', 'decode_smoke_ok',
  ], 'media_facts_invalid');
  exact(value.frame_rate, ['numerator', 'denominator'], 'media_facts_invalid');
  exact(value.audio, ['stream_count', 'codec', 'sample_rate', 'channels'], 'media_facts_invalid');
  if (!Number.isSafeInteger(value.duration_ms) || value.duration_ms < 1
    || !Number.isSafeInteger(value.width) || value.width < 1
    || !Number.isSafeInteger(value.height) || value.height < 1
    || !Number.isSafeInteger(value.frame_rate.numerator) || value.frame_rate.numerator < 1
    || !Number.isSafeInteger(value.frame_rate.denominator) || value.frame_rate.denominator < 1
    || typeof value.video_codec !== 'string' || !value.video_codec
    || typeof value.pixel_format !== 'string' || !value.pixel_format
    || !Number.isSafeInteger(value.audio.stream_count) || value.audio.stream_count < 0
    || typeof value.decode_smoke_ok !== 'boolean') {
    fail('media_facts_invalid', 'Normalized regression media facts are invalid.');
  }
  if (value.audio.stream_count === 0) {
    if (value.audio.codec !== null || value.audio.sample_rate !== null || value.audio.channels !== null) {
      fail('media_facts_invalid', 'Silent media has invalid audio facts.');
    }
  } else if (typeof value.audio.codec !== 'string' || !value.audio.codec
    || !Number.isSafeInteger(value.audio.sample_rate) || value.audio.sample_rate < 1
    || !Number.isSafeInteger(value.audio.channels) || value.audio.channels < 1) {
    fail('media_facts_invalid', 'Audio facts are invalid.');
  }
}

function validateArtifact(value, expectedKind) {
  exact(value, ['artifact_id', 'kind', 'timestamp_ms', 'sha256', 'size_bytes', 'width', 'height', 'locator_key'], 'regression_artifact_invalid');
  if (!SAFE_ID.test(value.artifact_id ?? '') || value.kind !== expectedKind
    || (expectedKind === 'full-raster-frame' && (!Number.isSafeInteger(value.timestamp_ms) || value.timestamp_ms < 0))
    || (expectedKind === 'contact-sheet' && value.timestamp_ms !== null)
    || !SHA256.test(value.sha256 ?? '') || !Number.isSafeInteger(value.size_bytes) || value.size_bytes < 24
    || !Number.isSafeInteger(value.width) || value.width < 1
    || !Number.isSafeInteger(value.height) || value.height < 1
    || !safeLocator(value.locator_key)) {
    fail('regression_artifact_invalid', 'A regression evidence artifact is invalid.');
  }
}

function validateEvidenceDocument(document) {
  exact(document, [
    'schema_version', 'evidence_kind', 'sample_id', 'registry_sha256',
    'source_media', 'media_facts', 'frames', 'contact_sheet', 'capture_status',
  ], 'regression_evidence_invalid');
  exact(document.source_media, ['sha256', 'size_bytes', 'media_type'], 'regression_evidence_invalid');
  if (document.schema_version !== 1 || document.evidence_kind !== 'failed-visual-regression-capture'
    || !SAFE_ID.test(document.sample_id ?? '') || !SHA256.test(document.registry_sha256 ?? '')
    || !SHA256.test(document.source_media.sha256 ?? '')
    || !Number.isSafeInteger(document.source_media.size_bytes) || document.source_media.size_bytes < 1
    || document.source_media.media_type !== 'video/mp4'
    || document.capture_status !== 'actual-bytes-verified'
    || !Array.isArray(document.frames) || document.frames.length < MIN_CAPTURE_COUNT || document.frames.length > MAX_CAPTURE_COUNT) {
    fail('regression_evidence_invalid', 'Failed visual regression evidence is invalid.');
  }
  validateMediaFacts(document.media_facts);
  const ids = new Set(); const locators = new Set(); const timestamps = [];
  for (const frame of document.frames) {
    validateArtifact(frame, 'full-raster-frame');
    if (ids.has(frame.artifact_id) || locators.has(frame.locator_key)) fail('regression_evidence_invalid', 'Regression artifact identities must be unique.');
    if (frame.width !== document.media_facts.width || frame.height !== document.media_facts.height) {
      fail('frame_raster_mismatch', 'A regression frame is not the source display raster.');
    }
    ids.add(frame.artifact_id); locators.add(frame.locator_key); timestamps.push(frame.timestamp_ms);
  }
  validateTimestamps(timestamps, document.media_facts.duration_ms);
  validateArtifact(document.contact_sheet, 'contact-sheet');
  if (ids.has(document.contact_sheet.artifact_id) || locators.has(document.contact_sheet.locator_key)) {
    fail('regression_evidence_invalid', 'Regression artifact identities must be unique.');
  }
  return { frame_count: document.frames.length };
}

function createReviewRequest(document, evidenceSha256, registrySample) {
  return {
    schema_version: 1,
    request_kind: 'qualified-main-agent-visual-regression-review',
    sample_id: document.sample_id,
    registry_sha256: document.registry_sha256,
    evidence_sha256: evidenceSha256,
    source_media_sha256: document.source_media.sha256,
    contact_sheet: {
      artifact_id: document.contact_sheet.artifact_id,
      sha256: document.contact_sheet.sha256,
      locator_key: document.contact_sheet.locator_key,
    },
    full_raster_frame_count: document.frames.length,
    historical_failure_classes: registrySample.failure_classes,
    required_review_authority: REVIEW_AUTHORITY,
    deterministic_scope: 'byte-integrity-and-media-facts-only',
    visual_decision_status: 'pending',
    required_visual_checks: [
      'composition-and-dead-zone',
      'typographic-hierarchy-and-font-character',
      'material-as-compositional-subject',
      'template-repetition-and-generic-ai-signature',
      'actual-pixels-over-technical-pass',
    ],
  };
}

function validateReviewRequest(request, document, evidenceSha256, registrySample) {
  exact(request, [
    'schema_version', 'request_kind', 'sample_id', 'registry_sha256',
    'evidence_sha256', 'source_media_sha256', 'contact_sheet',
    'full_raster_frame_count', 'historical_failure_classes',
    'required_review_authority', 'deterministic_scope',
    'visual_decision_status', 'required_visual_checks',
  ], 'review_request_invalid');
  exact(request.contact_sheet, ['artifact_id', 'sha256', 'locator_key'], 'review_request_invalid');
  if (request.schema_version !== 1
    || request.request_kind !== 'qualified-main-agent-visual-regression-review'
    || request.sample_id !== document.sample_id
    || request.registry_sha256 !== document.registry_sha256
    || request.evidence_sha256 !== evidenceSha256
    || request.source_media_sha256 !== document.source_media.sha256
    || request.contact_sheet.artifact_id !== document.contact_sheet.artifact_id
    || request.contact_sheet.sha256 !== document.contact_sheet.sha256
    || request.contact_sheet.locator_key !== document.contact_sheet.locator_key
    || request.full_raster_frame_count !== document.frames.length
    || JSON.stringify(request.historical_failure_classes) !== JSON.stringify(registrySample.failure_classes)
    || request.required_review_authority !== REVIEW_AUTHORITY
    || request.deterministic_scope !== 'byte-integrity-and-media-facts-only'
    || request.visual_decision_status !== 'pending'
    || !Array.isArray(request.required_visual_checks) || request.required_visual_checks.length < 5) {
    fail('review_request_invalid', 'The main-agent regression review request is not bound to frozen evidence.');
  }
}

function validateReviewRecord(record, { document, requestBytes }) {
  exact(record, [
    'schema_version',
    'record_kind',
    'sample_id',
    'review_request_sha256',
    'source_media_sha256',
    'inspected_contact_sheet_sha256',
    'inspected_full_raster_frame_ids',
    'reviewer_role',
    'decision_basis',
    'visual_decision',
    'finding_codes',
  ], 'main_review_record_invalid');
  const validFrameIds = new Set(document.frames.map((item) => item.artifact_id));
  if (record.schema_version !== 1
    || record.record_kind !== 'qualified-main-agent-failed-sample-review'
    || record.sample_id !== document.sample_id
    || record.review_request_sha256 !== sha256(requestBytes)
    || record.source_media_sha256 !== document.source_media.sha256
    || record.inspected_contact_sheet_sha256 !== document.contact_sheet.sha256
    || record.reviewer_role !== REVIEW_AUTHORITY
    || record.visual_decision !== 'revision_required'
    || !['contact-sheet', 'contact-sheet-and-full-raster-frames'].includes(record.decision_basis)
    || !Array.isArray(record.inspected_full_raster_frame_ids)
    || record.inspected_full_raster_frame_ids.some((item) => !validFrameIds.has(item))
    || new Set(record.inspected_full_raster_frame_ids).size !== record.inspected_full_raster_frame_ids.length
    || (record.decision_basis === 'contact-sheet' && record.inspected_full_raster_frame_ids.length !== 0)
    || (record.decision_basis === 'contact-sheet-and-full-raster-frames' && record.inspected_full_raster_frame_ids.length === 0)
    || !Array.isArray(record.finding_codes) || record.finding_codes.length === 0
    || record.finding_codes.length > 32
    || record.finding_codes.some((item) => !FAILURE_CLASS.test(item ?? ''))
    || new Set(record.finding_codes).size !== record.finding_codes.length) {
    fail('main_review_record_invalid', 'The private main review record is not bound to inspected actual pixels.');
  }
}

async function readJsonBounded(target) {
  const bytes = await fs.readFile(target);
  if (bytes.length === 0 || bytes.length > JSON_MAX_BYTES) fail('json_size_invalid', 'A regression JSON artifact has an invalid size.');
  try {
    return { bytes, value: JSON.parse(bytes.toString('utf8')) };
  } catch {
    fail('json_invalid', 'A regression JSON artifact is invalid.');
  }
}

async function readRegularFile(target, code = 'artifact_unreadable') {
  let stat;
  try { stat = await fs.lstat(target); } catch { fail(code, 'A regression evidence artifact cannot be read.'); }
  if (!stat.isFile() || stat.isSymbolicLink() || !Number.isSafeInteger(stat.size) || stat.size < 1) {
    fail(code, 'A regression evidence artifact must be a non-empty regular file.');
  }
  return { stat, bytes: await fs.readFile(target) };
}

async function validateArtifactBytes(root, artifact) {
  const target = path.resolve(root, artifact.locator_key);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) fail('artifact_path_escape', 'A regression evidence locator escapes its package.');
  const { stat, bytes } = await readRegularFile(target);
  const dimensions = parsePngDimensions(bytes);
  if (stat.size !== artifact.size_bytes || sha256(bytes) !== artifact.sha256
    || dimensions.width !== artifact.width || dimensions.height !== artifact.height) {
    fail('artifact_hash_mismatch', 'A regression evidence artifact does not match its frozen facts.');
  }
}

export async function validateFailedVisualRegressionPackage({ registryPath, packageRoot }) {
  const registryRead = await readJsonBounded(registryPath);
  validateFailedVisualRegressionRegistry(registryRead.value);
  const registrySha256 = sha256(registryRead.bytes);
  const evidenceRead = await readJsonBounded(path.join(packageRoot, 'media-facts.json'));
  const evidence = evidenceRead.value;
  validateEvidenceDocument(evidence);
  if (evidence.registry_sha256 !== registrySha256) fail('registry_hash_mismatch', 'Regression evidence binds another public registry.');
  const registrySample = registryRead.value.samples.find((item) => item.sample_id === evidence.sample_id);
  if (!registrySample || registrySample.evidence_availability !== 'private-capture-required') {
    fail('sample_not_capturable', 'The selected regression sample is not registered for private capture.');
  }
  for (const frame of evidence.frames) await validateArtifactBytes(packageRoot, frame);
  await validateArtifactBytes(packageRoot, evidence.contact_sheet);
  const requestRead = await readJsonBounded(path.join(packageRoot, 'review-request.json'));
  validateReviewRequest(requestRead.value, evidence, sha256(evidenceRead.bytes), registrySample);
  let recordRead = null;
  try {
    recordRead = await readJsonBounded(path.join(packageRoot, 'main-review-record.json'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (recordRead) validateReviewRecord(recordRead.value, { document: evidence, requestBytes: requestRead.bytes });
  return {
    schema_version: 1,
    sample_id: evidence.sample_id,
    source_media_sha256: evidence.source_media.sha256,
    frame_count: evidence.frames.length,
    contact_sheet_sha256: evidence.contact_sheet.sha256,
    deterministic_status: 'evidence-integrity-verified',
    visual_decision_status: recordRead ? 'revision_required' : 'pending',
  };
}

function ffmpegSeconds(timestampMs) {
  return `${Math.floor(timestampMs / 1000)}.${String(timestampMs % 1000).padStart(3, '0')}`;
}

function contactSheetFilter(inputCount, columns, cellWidth, cellHeight) {
  const rows = Math.ceil(inputCount / columns);
  const filters = [];
  const labels = [];
  const layout = [];
  for (let index = 0; index < inputCount; index += 1) {
    filters.push(`[${index}:v]scale=${cellWidth}:${cellHeight}:force_original_aspect_ratio=decrease,pad=${cellWidth}:${cellHeight}:(ow-iw)/2:(oh-ih)/2:color=black[v${index}]`);
    labels.push(`[v${index}]`);
    layout.push(`${(index % columns) * cellWidth}_${Math.floor(index / columns) * cellHeight}`);
  }
  filters.push(`${labels.join('')}xstack=inputs=${inputCount}:layout=${layout.join('|')}:fill=black[sheet]`);
  return { filter: filters.join(';'), width: columns * cellWidth, height: rows * cellHeight };
}

async function writeExclusiveJson(target, value) {
  await fs.writeFile(target, jsonBytes(value), { flag: 'wx' });
}

export async function captureFailedVisualRegression({
  registryPath,
  sampleId,
  inputPath,
  outputRoot,
  timestampsMs,
  execFileAsync = defaultExecFileAsync,
  probeMediaFn = probeMedia,
}) {
  const registryRead = await readJsonBounded(registryPath);
  validateFailedVisualRegressionRegistry(registryRead.value);
  const registrySample = registryRead.value.samples.find((item) => item.sample_id === sampleId);
  if (!registrySample || registrySample.evidence_availability !== 'private-capture-required') {
    fail('sample_not_capturable', 'The selected regression sample is not registered for private capture.');
  }
  const input = await readRegularFile(inputPath, 'media_unreadable');
  let existing;
  try { existing = await fs.lstat(outputRoot); } catch (error) { if (error?.code !== 'ENOENT') fail('output_unusable', 'The private regression output cannot be inspected.'); }
  if (existing) fail('output_exists', 'The private regression output must be a new directory.');
  await fs.mkdir(path.dirname(outputRoot), { recursive: true });
  await fs.mkdir(outputRoot);
  await fs.mkdir(path.join(outputRoot, 'frames'));

  const probe = await probeMediaFn(inputPath);
  const mediaFacts = normalizedMediaFacts(probe);
  const captureTimes = validateTimestamps(
    timestampsMs ?? representativeTimestamps(mediaFacts.duration_ms),
    mediaFacts.duration_ms,
  );
  const frames = [];
  for (let index = 0; index < captureTimes.length; index += 1) {
    const artifactId = `frame-${String(index + 1).padStart(3, '0')}`;
    const locatorKey = `frames/${artifactId}.png`;
    const target = path.join(outputRoot, locatorKey);
    try {
      await execFileAsync('ffmpeg', [
        '-v', 'error', '-ss', ffmpegSeconds(captureTimes[index]), '-i', inputPath,
        '-map', '0:v:0', '-frames:v', '1', '-c:v', 'png', target,
      ], { timeout: 180_000, maxBuffer: 1024 * 1024 });
    } catch {
      fail('frame_capture_failed', 'ffmpeg could not capture a full-raster regression frame.');
    }
    const frame = await readRegularFile(target);
    const dimensions = parsePngDimensions(frame.bytes);
    if (dimensions.width !== mediaFacts.width || dimensions.height !== mediaFacts.height) {
      fail('frame_raster_mismatch', 'ffmpeg did not preserve the source display raster.');
    }
    frames.push({
      artifact_id: artifactId,
      kind: 'full-raster-frame',
      timestamp_ms: captureTimes[index],
      sha256: sha256(frame.bytes),
      size_bytes: frame.stat.size,
      width: dimensions.width,
      height: dimensions.height,
      locator_key: locatorKey,
    });
  }

  const columns = frames.length >= 15 ? 5 : 4;
  const cellWidth = Math.floor(mediaFacts.width / columns);
  const cellHeight = Math.round(cellWidth * mediaFacts.height / mediaFacts.width);
  const sheet = contactSheetFilter(frames.length, columns, cellWidth, cellHeight);
  const sheetTarget = path.join(outputRoot, 'contact-sheet.png');
  const sheetArgs = frames.flatMap((frame) => ['-i', path.join(outputRoot, frame.locator_key)]);
  try {
    await execFileAsync('ffmpeg', [
      '-v', 'error', ...sheetArgs, '-filter_complex', sheet.filter,
      '-map', '[sheet]', '-frames:v', '1', '-c:v', 'png', sheetTarget,
    ], { timeout: 240_000, maxBuffer: 1024 * 1024 });
  } catch {
    fail('contact_sheet_failed', 'ffmpeg could not create the regression contact sheet.');
  }
  const sheetFile = await readRegularFile(sheetTarget);
  const sheetDimensions = parsePngDimensions(sheetFile.bytes);
  if (sheetDimensions.width !== sheet.width || sheetDimensions.height !== sheet.height) {
    fail('contact_sheet_raster_mismatch', 'The regression contact sheet raster is invalid.');
  }
  const contactSheet = {
    artifact_id: 'contact-sheet',
    kind: 'contact-sheet',
    timestamp_ms: null,
    sha256: sha256(sheetFile.bytes),
    size_bytes: sheetFile.stat.size,
    width: sheetDimensions.width,
    height: sheetDimensions.height,
    locator_key: 'contact-sheet.png',
  };
  const evidence = {
    schema_version: 1,
    evidence_kind: 'failed-visual-regression-capture',
    sample_id: sampleId,
    registry_sha256: sha256(registryRead.bytes),
    source_media: {
      sha256: sha256(input.bytes),
      size_bytes: input.stat.size,
      media_type: 'video/mp4',
    },
    media_facts: mediaFacts,
    frames,
    contact_sheet: contactSheet,
    capture_status: 'actual-bytes-verified',
  };
  validateEvidenceDocument(evidence);
  const evidenceBytes = jsonBytes(evidence);
  await fs.writeFile(path.join(outputRoot, 'media-facts.json'), evidenceBytes, { flag: 'wx' });
  const request = createReviewRequest(evidence, sha256(evidenceBytes), registrySample);
  validateReviewRequest(request, evidence, sha256(evidenceBytes), registrySample);
  await writeExclusiveJson(path.join(outputRoot, 'review-request.json'), request);

  return validateFailedVisualRegressionPackage({ registryPath, packageRoot: outputRoot });
}

function validateDecisionInput(decision) {
  exact(decision, [
    'visual_decision',
    'finding_codes',
    'inspection_scope',
    'inspected_full_raster_frame_ids',
  ], 'main_review_input_invalid');
  if (decision.visual_decision !== 'revision_required'
    || !Array.isArray(decision.finding_codes) || decision.finding_codes.length === 0
    || decision.finding_codes.length > 32
    || decision.finding_codes.some((item) => !FAILURE_CLASS.test(item ?? ''))
    || new Set(decision.finding_codes).size !== decision.finding_codes.length
    || !['contact-sheet', 'contact-sheet-and-full-raster-frames'].includes(decision.inspection_scope)
    || !Array.isArray(decision.inspected_full_raster_frame_ids)
    || decision.inspected_full_raster_frame_ids.some((item) => !/^frame-\d{3}$/u.test(item ?? ''))
    || new Set(decision.inspected_full_raster_frame_ids).size !== decision.inspected_full_raster_frame_ids.length
    || (decision.inspection_scope === 'contact-sheet' && decision.inspected_full_raster_frame_ids.length !== 0)
    || (decision.inspection_scope === 'contact-sheet-and-full-raster-frames' && decision.inspected_full_raster_frame_ids.length === 0)) {
    fail('main_review_input_invalid', 'A known failed sample requires an explicit main-agent revision decision and finding codes.');
  }
}

export async function recordFailedVisualRegressionReview({ registryPath, packageRoot, decision }) {
  validateDecisionInput(decision);
  const validation = await validateFailedVisualRegressionPackage({ registryPath, packageRoot });
  const evidenceRead = await readJsonBounded(path.join(packageRoot, 'media-facts.json'));
  const validFrameIds = new Set(evidenceRead.value.frames.map((item) => item.artifact_id));
  if (decision.inspected_full_raster_frame_ids.some((item) => !validFrameIds.has(item))) {
    fail('main_review_input_invalid', 'The main review references an unknown full-raster frame.');
  }
  const requestRead = await readJsonBounded(path.join(packageRoot, 'review-request.json'));
  const target = path.join(packageRoot, 'main-review-record.json');
  let exists = false;
  try { await fs.lstat(target); exists = true; } catch (error) { if (error?.code !== 'ENOENT') fail('review_record_unusable', 'The main review record cannot be inspected.'); }
  if (exists) fail('review_record_exists', 'The frozen main review record already exists.');
  const record = {
    schema_version: 1,
    record_kind: 'qualified-main-agent-failed-sample-review',
    sample_id: validation.sample_id,
    review_request_sha256: sha256(requestRead.bytes),
    source_media_sha256: validation.source_media_sha256,
    inspected_contact_sheet_sha256: validation.contact_sheet_sha256,
    inspected_full_raster_frame_ids: decision.inspected_full_raster_frame_ids,
    reviewer_role: REVIEW_AUTHORITY,
    decision_basis: decision.inspection_scope,
    visual_decision: decision.visual_decision,
    finding_codes: decision.finding_codes,
  };
  await writeExclusiveJson(target, record);
  return record;
}

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || value === undefined || value.startsWith('--')) fail('usage', 'Invalid failed visual regression arguments.');
    if (Object.hasOwn(options, key)) fail('usage', 'Duplicate failed visual regression argument.');
    options[key] = value;
  }
  return options;
}

function requiredOption(options, key) {
  if (typeof options[key] !== 'string' || !options[key]) fail('usage', 'A required failed visual regression argument is missing.');
  return options[key];
}

async function main(argv) {
  const [command, ...rest] = argv;
  const options = parseOptions(rest);
  if (command === 'validate-registry') {
    const registryRead = await readJsonBounded(requiredOption(options, '--registry'));
    process.stdout.write(`${JSON.stringify(validateFailedVisualRegressionRegistry(registryRead.value))}\n`);
    return;
  }
  if (command === 'capture') {
    const timestamps = options['--timestamps-ms']
      ? options['--timestamps-ms'].split(',').map((value) => Number(value))
      : undefined;
    const result = await captureFailedVisualRegression({
      registryPath: requiredOption(options, '--registry'),
      sampleId: requiredOption(options, '--sample'),
      inputPath: requiredOption(options, '--input'),
      outputRoot: requiredOption(options, '--output'),
      timestampsMs: timestamps,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === 'validate') {
    const result = await validateFailedVisualRegressionPackage({
      registryPath: requiredOption(options, '--registry'),
      packageRoot: requiredOption(options, '--package'),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === 'record-review') {
    const result = await recordFailedVisualRegressionReview({
      registryPath: requiredOption(options, '--registry'),
      packageRoot: requiredOption(options, '--package'),
      decision: {
        visual_decision: requiredOption(options, '--decision'),
        finding_codes: requiredOption(options, '--findings').split(','),
        inspection_scope: requiredOption(options, '--inspection-scope'),
        inspected_full_raster_frame_ids: options['--frame-ids']
          ? options['--frame-ids'].split(',')
          : [],
      },
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  fail('usage', 'Usage: failed-visual-regression.mjs validate-registry|capture|validate|record-review [options]');
}

const mainModule = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (mainModule) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    const code = error instanceof FailedVisualRegressionError ? error.code : 'internal_error';
    const message = error instanceof FailedVisualRegressionError ? error.message : 'Failed visual regression command failed.';
    process.stderr.write(`${JSON.stringify({ ok: false, error: { code, message } })}\n`);
    process.exitCode = code === 'usage' ? 64 : 2;
  }
}
