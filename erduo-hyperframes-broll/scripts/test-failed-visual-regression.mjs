import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  FailedVisualRegressionError,
  parsePngDimensions,
  recordFailedVisualRegressionReview,
  representativeTimestamps,
  validateFailedVisualRegressionPackage,
  validateFailedVisualRegressionRegistry,
} from './failed-visual-regression.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytesFor = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const registry = () => ({
  schema_version: 1,
  registry_id: 'm20-failed-visual-regressions-v1',
  samples: [
    {
      sample_id: 'ART-086',
      evidence_availability: 'archived-metadata-only',
      historical_outcome: 'user-rejected',
      failure_classes: ['large-unowned-dead-zone'],
      required_review_authority: 'qualified-main-agent',
    },
    {
      sample_id: 'ART-096',
      evidence_availability: 'archived-metadata-only',
      historical_outcome: 'user-rejected',
      failure_classes: ['black-segment'],
      required_review_authority: 'qualified-main-agent',
    },
    {
      sample_id: 'ART-098',
      evidence_availability: 'archived-metadata-only',
      historical_outcome: 'user-rejected',
      failure_classes: ['false-visual-approval'],
      required_review_authority: 'qualified-main-agent',
    },
    {
      sample_id: 'latest-4k',
      evidence_availability: 'private-capture-required',
      historical_outcome: 'user-rejected',
      failure_classes: ['generic-ai-template-hierarchy', 'weak-composition-system'],
      required_review_authority: 'qualified-main-agent',
    },
  ],
});

function fakePng(width, height, marker = 0) {
  const bytes = Buffer.alloc(32, marker);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'failed-visual-regression-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const registryPath = path.join(root, 'registry.json');
  const packageRoot = path.join(root, 'private-package');
  await mkdir(path.join(packageRoot, 'frames'), { recursive: true });
  const registryValue = registry();
  const registryBytes = bytesFor(registryValue);
  await writeFile(registryPath, registryBytes);
  const timestamps = representativeTimestamps(225_000, 12);
  const frames = [];
  for (let index = 0; index < timestamps.length; index += 1) {
    const id = `frame-${String(index + 1).padStart(3, '0')}`;
    const locator = `frames/${id}.png`;
    const png = fakePng(3840, 2160, index);
    await writeFile(path.join(packageRoot, locator), png);
    frames.push({
      artifact_id: id,
      kind: 'full-raster-frame',
      timestamp_ms: timestamps[index],
      sha256: digest(png),
      size_bytes: png.length,
      width: 3840,
      height: 2160,
      locator_key: locator,
    });
  }
  const sheet = fakePng(3840, 1620, 99);
  await writeFile(path.join(packageRoot, 'contact-sheet.png'), sheet);
  const evidence = {
    schema_version: 1,
    evidence_kind: 'failed-visual-regression-capture',
    sample_id: 'latest-4k',
    registry_sha256: digest(registryBytes),
    source_media: { sha256: 'a'.repeat(64), size_bytes: 123456, media_type: 'video/mp4' },
    media_facts: {
      duration_ms: 225_000,
      width: 3840,
      height: 2160,
      frame_rate: { numerator: 30, denominator: 1 },
      video_codec: 'h264',
      pixel_format: 'yuv420p',
      audio: { stream_count: 1, codec: 'aac', sample_rate: 44100, channels: 2 },
      decode_smoke_ok: true,
    },
    frames,
    contact_sheet: {
      artifact_id: 'contact-sheet',
      kind: 'contact-sheet',
      timestamp_ms: null,
      sha256: digest(sheet),
      size_bytes: sheet.length,
      width: 3840,
      height: 1620,
      locator_key: 'contact-sheet.png',
    },
    capture_status: 'actual-bytes-verified',
  };
  const evidenceBytes = bytesFor(evidence);
  await writeFile(path.join(packageRoot, 'media-facts.json'), evidenceBytes);
  const sample = registryValue.samples.at(-1);
  const request = {
    schema_version: 1,
    request_kind: 'qualified-main-agent-visual-regression-review',
    sample_id: 'latest-4k',
    registry_sha256: digest(registryBytes),
    evidence_sha256: digest(evidenceBytes),
    source_media_sha256: evidence.source_media.sha256,
    contact_sheet: {
      artifact_id: 'contact-sheet',
      sha256: evidence.contact_sheet.sha256,
      locator_key: 'contact-sheet.png',
    },
    full_raster_frame_count: frames.length,
    historical_failure_classes: sample.failure_classes,
    required_review_authority: 'qualified-main-agent',
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
  await writeFile(path.join(packageRoot, 'review-request.json'), bytesFor(request));
  return { root, registryPath, packageRoot, evidence, request };
}

test('accepts the four path-free registered failures and preserves archived status', () => {
  assert.deepEqual(validateFailedVisualRegressionRegistry(registry()), {
    registry_id: 'm20-failed-visual-regressions-v1',
    sample_count: 4,
  });
});

test('rejects private locations and pretending archived media has actual bytes', () => {
  const privateRegistry = registry();
  privateRegistry.samples[0].failure_classes = ['local/private'];
  assert.throws(
    () => validateFailedVisualRegressionRegistry(privateRegistry),
    (error) => error instanceof FailedVisualRegressionError && error.code === 'registry_private_location',
  );
  const falseAvailability = registry();
  falseAvailability.samples[1].evidence_availability = 'private-capture-required';
  assert.throws(
    () => validateFailedVisualRegressionRegistry(falseAvailability),
    (error) => error instanceof FailedVisualRegressionError && error.code === 'registry_archive_status_invalid',
  );
});

test('selects at least twelve ordered unique timestamps inside the media', () => {
  const timestamps = representativeTimestamps(225_000, 16);
  assert.equal(timestamps.length, 16);
  assert.equal(new Set(timestamps).size, 16);
  assert.equal(timestamps.every((value, index) => value >= 0 && value < 225_000 && (index === 0 || value > timestamps[index - 1])), true);
  assert.throws(() => representativeTimestamps(225_000, 11), (error) => error.code === 'capture_timestamps_invalid');
});

test('reads PNG raster from actual IHDR bytes and rejects invented image metadata', () => {
  assert.deepEqual(parsePngDimensions(fakePng(3840, 2160)), { width: 3840, height: 2160 });
  assert.throws(() => parsePngDimensions(Buffer.from('not-png')), (error) => error.code === 'png_invalid');
});

test('validates the actual frame/contact bytes while leaving visual decision pending', async (t) => {
  const { registryPath, packageRoot } = await fixture(t);
  const result = await validateFailedVisualRegressionPackage({ registryPath, packageRoot });
  assert.deepEqual(result, {
    schema_version: 1,
    sample_id: 'latest-4k',
    source_media_sha256: 'a'.repeat(64),
    frame_count: 12,
    contact_sheet_sha256: digest(fakePng(3840, 1620, 99)),
    deterministic_status: 'evidence-integrity-verified',
    visual_decision_status: 'pending',
  });
});

test('rejects frame tamper, wrong full raster and a forged visual approval packet', async (t) => {
  const first = await fixture(t);
  await writeFile(path.join(first.packageRoot, first.evidence.frames[0].locator_key), fakePng(3840, 2160, 44));
  await assert.rejects(
    () => validateFailedVisualRegressionPackage(first),
    (error) => error.code === 'artifact_hash_mismatch',
  );

  const second = await fixture(t);
  const factsPath = path.join(second.packageRoot, 'media-facts.json');
  const facts = JSON.parse(await readFile(factsPath, 'utf8'));
  facts.frames[0].width = 1920;
  await writeFile(factsPath, bytesFor(facts));
  await assert.rejects(
    () => validateFailedVisualRegressionPackage(second),
    (error) => error.code === 'frame_raster_mismatch',
  );

  const third = await fixture(t);
  const requestPath = path.join(third.packageRoot, 'review-request.json');
  const request = JSON.parse(await readFile(requestPath, 'utf8'));
  request.visual_decision_status = 'approved';
  await writeFile(requestPath, bytesFor(request));
  await assert.rejects(
    () => validateFailedVisualRegressionPackage(third),
    (error) => error.code === 'review_request_invalid',
  );
});

test('writes a frozen record only after an explicit qualified-main revision decision', async (t) => {
  const current = await fixture(t);
  await assert.rejects(
    () => recordFailedVisualRegressionReview({
      registryPath: current.registryPath,
      packageRoot: current.packageRoot,
      decision: {
        visual_decision: 'approved',
        finding_codes: [],
        inspection_scope: 'contact-sheet',
        inspected_full_raster_frame_ids: [],
      },
    }),
    (error) => error.code === 'main_review_input_invalid',
  );
  const record = await recordFailedVisualRegressionReview({
    registryPath: current.registryPath,
    packageRoot: current.packageRoot,
    decision: {
      visual_decision: 'revision_required',
      finding_codes: ['generic-ai-template-hierarchy', 'weak-composition-system'],
      inspection_scope: 'contact-sheet',
      inspected_full_raster_frame_ids: [],
    },
  });
  assert.equal(record.visual_decision, 'revision_required');
  assert.equal(record.reviewer_role, 'qualified-main-agent');
  assert.equal(record.inspected_contact_sheet_sha256, current.evidence.contact_sheet.sha256);
  assert.deepEqual(record.inspected_full_raster_frame_ids, []);
  assert.equal((await validateFailedVisualRegressionPackage({
    registryPath: current.registryPath,
    packageRoot: current.packageRoot,
  })).visual_decision_status, 'revision_required');
  await assert.rejects(
    () => recordFailedVisualRegressionReview({
      registryPath: current.registryPath,
      packageRoot: current.packageRoot,
      decision: {
        visual_decision: 'revision_required',
        finding_codes: ['weak-composition-system'],
        inspection_scope: 'contact-sheet',
        inspected_full_raster_frame_ids: [],
      },
    }),
    (error) => error.code === 'review_record_exists',
  );
});
