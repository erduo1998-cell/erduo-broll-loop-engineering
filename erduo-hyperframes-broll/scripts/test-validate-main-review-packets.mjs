import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  inspectMainReviewPacket,
  MainReviewPacketError,
  validateDeterministicReviewResult,
  validateManifestMainReviewPacket,
  validateMainReviewPacket,
} from './validate-main-review-packets.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sha = (value) => hash(Buffer.from(value));
const json = (value) => Buffer.from(JSON.stringify(value));

function fixture(gate = 'html_preview_review', pageCount = 1) {
  const config = {
    shot_plan_review: ['director', 'fact-review', false, null],
    asset_fact_review: ['assets', 'fact-review', true, 'contact_sheet_page_count'],
    html_preview_review: ['master-build', 'visual-review', true, 'pre_master_page_count'],
    final_frame_review: ['render', 'visual-review', true, 'final_frame_page_count'],
  }[gate];
  const [stage, authority, paired, metric] = config;
  const pageBytes = new Map();
  const pages = [];
  for (let index = 0; index < pageCount; index += 1) {
    const shotStart = index + 1;
    const factsBytes = json([{ shot_id: `S${String(shotStart).padStart(3, '0')}` }]);
    const facts = { artifact_id: `facts-${index}`, sha256: hash(factsBytes), size_bytes: factsBytes.length, media_type: 'application/json', shot_start: shotStart, shot_end: shotStart };
    pageBytes.set(facts.artifact_id, factsBytes);
    if (paired) {
      const visualBytes = Buffer.from(`P6\n1 1\n255\n${String.fromCharCode(10 + index, 20, 30)}`, 'binary');
      const visual = { artifact_id: `visual-${index}`, sha256: hash(visualBytes), size_bytes: visualBytes.length, media_type: 'image/x-portable-pixmap' };
      pageBytes.set(visual.artifact_id, visualBytes);
      pages.push({ visual, facts });
    } else pages.push(facts);
  }
  const packetBytes = json({ schema_version: 1, pipeline_contract_version: 2, gate, shot_count: pageCount, pages });
  const artifactRecords = [
    ...pages.flatMap((page) => paired ? [page.visual, page.facts] : [page]),
    { artifact_id: `packet-${stage}`, sha256: hash(packetBytes), size_bytes: packetBytes.length, media_type: 'application/json' },
  ];
  const producerIsolation = sha(`producer:${stage}`);
  const metrics = { shot_count: pageCount };
  if (metric) metrics[metric] = pageCount;
  const manifestEnvelope = { pipeline_contract_version: 2, stage, manifest_sha256: sha(`manifest:${stage}`), producer_isolation_sha256: producerIsolation, metrics };
  const review = {
    pipeline_contract_version: 2,
    gate,
    status: 'approved',
    subject_manifest_sha256: manifestEnvelope.manifest_sha256,
    producer_isolation_sha256: producerIsolation,
    reviewer_role: 'erduo-hyperframes-broll-main-agent',
    reviewer_model_id: 'qualified-main-vision-v1',
    reviewer_isolation_sha256: sha(`main:${gate}`),
    authority_scope: authority,
    review_packet_sha256: hash(packetBytes),
    deterministic_result: { status: 'passed', facts_sha256: sha(`facts:${gate}`), failure_codes: [] },
    visual_decision: authority === 'visual-review'
      ? { outcome: 'approved', viewed_all_pages: true, decision_sha256: sha(`decision:${gate}`), finding_count: 0 }
      : null,
    ...(paired
      ? { inspected_visual_page_sha256s: pages.map((page) => page.visual.sha256), inspected_facts_page_sha256s: pages.map((page) => page.facts.sha256) }
      : { inspected_page_sha256s: pages.map((page) => page.sha256) }),
  };
  return { review, manifestEnvelope, producerPacketBytes: packetBytes, pageBytes, artifactRecords };
}

const expect = (value, code) => assert.throws(
  () => validateMainReviewPacket(value),
  (error) => error instanceof MainReviewPacketError && error.code === code,
);

test('accepts all four complete bounded main-review packet kinds', () => {
  for (const gate of ['shot_plan_review', 'asset_fact_review', 'html_preview_review', 'final_frame_review']) {
    const result = validateMainReviewPacket(fixture(gate));
    assert.equal(result.gate, gate);
    assert.equal(result.page_count, 1);
  }
});

test('enforces the independent 4KiB packet and 256-page boundaries', () => {
  expect(fixture('final_frame_review', 256), 'main_review_packet_oversized');
  const overflow = fixture('final_frame_review');
  overflow.producerPacketBytes = json({
    schema_version: 1,
    pipeline_contract_version: 2,
    gate: 'final_frame_review',
    shot_count: 1,
    pages: Array.from({ length: 257 }, () => ({})),
  });
  overflow.review.review_packet_sha256 = hash(overflow.producerPacketBytes);
  overflow.artifactRecords.at(-1).sha256 = hash(overflow.producerPacketBytes);
  overflow.artifactRecords.at(-1).size_bytes = overflow.producerPacketBytes.length;
  expect(overflow, 'main_review_page_limit_exceeded');
});

test('rejects producer self-review, missing pages and reordered inspection arrays', () => {
  const self = fixture(); self.review.reviewer_isolation_sha256 = self.manifestEnvelope.producer_isolation_sha256;
  expect(self, 'self_attested_review');
  const missing = fixture(); missing.pageBytes.delete('facts-0');
  expect(missing, 'main_review_page_unresolved');
  const foreign = fixture(); foreign.artifactRecords = foreign.artifactRecords.filter((record) => record.artifact_id !== 'visual-0');
  expect(foreign, 'main_review_page_unbound');
  const reordered = fixture('html_preview_review', 2); reordered.review.inspected_visual_page_sha256s.reverse();
  expect(reordered, 'main_review_pages_unbound');
});

test('rejects visual authority on fact gates and fact authority on visual gates', () => {
  const fact = fixture('asset_fact_review'); fact.review.visual_decision = { outcome: 'approved', viewed_all_pages: true, decision_sha256: sha('x'), finding_count: 0 };
  expect(fact, 'main_review_authority_overreach');
  const visual = fixture('html_preview_review'); visual.review.authority_scope = 'fact-review';
  expect(visual, 'main_review_authority_invalid');
});

test('rejects disqualified visual model and accepts it only for fact review', () => {
  const bad = fixture('final_frame_review'); bad.review.reviewer_model_id = 'deepseek-v4-pro';
  expect(bad, 'visual_reviewer_model_disqualified');
  const facts = fixture('shot_plan_review'); facts.review.reviewer_model_id = 'deepseek-v4-pro';
  assert.equal(validateMainReviewPacket(facts).authority_scope, 'fact-review');
});

test('rejects oversized packet/page, unbound hashes and incomplete coverage', () => {
  const packet = fixture(); packet.producerPacketBytes = json({ padding: 'x'.repeat(4097) });
  packet.artifactRecords.at(-1).sha256 = hash(packet.producerPacketBytes);
  packet.artifactRecords.at(-1).size_bytes = packet.producerPacketBytes.length;
  expect(packet, 'main_review_packet_oversized');
  const page = fixture(); page.review.inspected_facts_page_sha256s[0] = sha('other');
  expect(page, 'main_review_pages_unbound');
  const coverage = fixture('asset_fact_review', 2);
  const parsed = JSON.parse(coverage.producerPacketBytes); parsed.pages[1].facts.shot_start = 3; parsed.pages[1].facts.shot_end = 3;
  coverage.producerPacketBytes = json(parsed); coverage.review.review_packet_sha256 = hash(coverage.producerPacketBytes);
  coverage.artifactRecords.at(-1).sha256 = hash(coverage.producerPacketBytes);
  coverage.artifactRecords.at(-1).size_bytes = coverage.producerPacketBytes.length;
  expect(coverage, 'main_review_packet_incomplete');
});

test('deterministic results cannot approve aesthetics or waive failures', () => {
  assert.deepEqual(validateDeterministicReviewResult({ status: 'passed', facts_sha256: sha('facts'), failure_codes: [] }).failure_count, 0);
  assert.throws(
    () => validateDeterministicReviewResult({ status: 'passed', facts_sha256: sha('facts'), failure_codes: [], aesthetic_approved: true }),
    (error) => error.code === 'deterministic_authority_overreach',
  );
  const failed = fixture(); failed.review.deterministic_result = { status: 'failed', facts_sha256: sha('facts'), failure_codes: ['pixel_blank'] };
  expect(failed, 'deterministic_failure_not_waivable');
});

test('legacy review is inspection-only and requires resolved validation for v2', () => {
  assert.deepEqual(inspectMainReviewPacket({ gate: 'html_preview_review' }), {
    resume_eligible: false, code: 'pipeline_upgrade_required', pipeline_contract_version: null, gate: 'html_preview_review',
  });
  assert.deepEqual(inspectMainReviewPacket({ pipeline_contract_version: 2, gate: 'html_preview_review' }), {
    resume_eligible: false, code: 'validation_required', pipeline_contract_version: 2, gate: 'html_preview_review',
  });
});

async function onDiskFixture(t, gate = 'html_preview_review') {
  const value = fixture(gate);
  const root = await mkdtemp(path.join(os.tmpdir(), 'main-review-manifest-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const records = [];
  const packetId = `main-review-packet-${value.manifestEnvelope.stage}`;
  for (const record of value.artifactRecords) {
    const isPacket = record === value.artifactRecords.at(-1);
    const artifactId = isPacket ? packetId : record.artifact_id;
    const bytes = isPacket ? value.producerPacketBytes : value.pageBytes.get(record.artifact_id);
    const locatorKey = `${artifactId}.${record.media_type.startsWith('image/') ? 'ppm' : 'json'}`;
    await mkdir(path.dirname(path.join(root, locatorKey)), { recursive: true });
    await writeFile(path.join(root, locatorKey), bytes);
    records.push({
      ...record,
      artifact_id: artifactId,
      kind: record.media_type.startsWith('image/') ? 'contact-sheet' : 'json',
      locator_key: locatorKey,
      required_by: ['main-review'],
    });
  }
  const manifest = { ...value.manifestEnvelope, artifacts: records };
  return { ...value, root, manifest, packetRecord: records.at(-1) };
}

test('manifest-bound validation rejects packet re-signing and cross-manifest replacement', async (t) => {
  const valid = await onDiskFixture(t, 'html_preview_review');
  assert.equal((await validateManifestMainReviewPacket({
    review: valid.review,
    manifest: valid.manifest,
    root: valid.root,
  })).gate, 'html_preview_review');

  const foreignManifest = {
    ...valid.manifest,
    manifest_sha256: sha('foreign-manifest'),
  };
  await assert.rejects(
    () => validateManifestMainReviewPacket({ review: valid.review, manifest: foreignManifest, root: valid.root }),
    (error) => error.code === 'main_review_packet_unbound',
  );

  const resignedBytes = Buffer.concat([valid.producerPacketBytes, Buffer.from('\n')]);
  await writeFile(path.join(valid.root, valid.packetRecord.locator_key), resignedBytes);
  const resignedManifest = {
    ...valid.manifest,
    manifest_sha256: sha('resigned-manifest'),
    artifacts: valid.manifest.artifacts.map((record) => record.artifact_id === valid.packetRecord.artifact_id
      ? { ...record, sha256: hash(resignedBytes), size_bytes: resignedBytes.length }
      : record),
  };
  const reboundReview = { ...valid.review, subject_manifest_sha256: resignedManifest.manifest_sha256 };
  await assert.rejects(
    () => validateManifestMainReviewPacket({ review: reboundReview, manifest: resignedManifest, root: valid.root }),
    (error) => error.code === 'main_review_packet_unbound',
  );
});
