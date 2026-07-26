import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { orchestrateFixture } from './orchestrate-stages.mjs';
import { validateAssetsV2Chain } from './validate-assets-v2-chain.mjs';
import { createArtifactManifest, fingerprintArtifactValue } from './artifact-manifest.mjs';

const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const jsonBytes = (value) => Buffer.from(JSON.stringify(canonical(value)), 'utf8');

async function fixture(t) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'assets-v2-chain-'));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const projectRoot = path.join(temporary, 'project');
  await orchestrateFixture({ fixtureId: 'faceless-basic', projectRoot, testOnlyLegacyInspection: true });
  const privateRoot = path.join(projectRoot, '.erduo-hyperframes-broll');
  const directorRoot = path.join(privateRoot, 'artifacts', 'director');
  const assetsRoot = path.join(privateRoot, 'artifacts', 'assets');
  const [directorManifest, assetsManifest, directorReceipt, assetsReceipt] = await Promise.all([
    readFile(path.join(directorRoot, 'manifest.json'), 'utf8').then(JSON.parse),
    readFile(path.join(assetsRoot, 'manifest.json'), 'utf8').then(JSON.parse),
    readFile(path.join(privateRoot, 'receipts', 'director.json'), 'utf8').then(JSON.parse),
    readFile(path.join(privateRoot, 'receipts', 'assets.json'), 'utf8').then(JSON.parse),
  ]);
  return {
    projectRoot,
    manifest: assetsManifest,
    root: assetsRoot,
    directorManifest,
    directorRoot,
    shotPlanReview: directorReceipt.output.main_review_refs[0],
    assetFactReview: assetsReceipt.output.main_review_refs[0],
  };
}

async function resignContact(input, mutate) {
  const manifest = structuredClone(input.manifest);
  const records = new Map(manifest.artifacts.map((record) => [record.artifact_id, record]));
  const packetRecord = records.get('asset-contact-sheet-index');
  const visualRecord = records.get('asset-contact-sheet-page-visual-001');
  const factsRecord = records.get('asset-contact-sheet-page-facts-001');
  const packet = JSON.parse(await readFile(path.join(input.root, packetRecord.locator_key), 'utf8'));
  const facts = JSON.parse(await readFile(path.join(input.root, factsRecord.locator_key), 'utf8'));
  mutate({ packet, facts });
  const factsBytes = jsonBytes(facts);
  await writeFile(path.join(input.root, factsRecord.locator_key), factsBytes);
  Object.assign(factsRecord, { sha256: hashBytes(factsBytes), size_bytes: factsBytes.length });
  Object.assign(packet.pages[0].facts, { sha256: factsRecord.sha256, size_bytes: factsRecord.size_bytes });
  const { packet_sha256: ignored, ...packetCore } = packet;
  packet.packet_sha256 = fingerprintArtifactValue(packetCore);
  const packetBytes = jsonBytes(packet);
  await writeFile(path.join(input.root, packetRecord.locator_key), packetBytes);
  Object.assign(packetRecord, { sha256: hashBytes(packetBytes), size_bytes: packetBytes.length });
  const resigned = createArtifactManifest(manifest);
  return {
    ...input,
    manifest: resigned,
    assetFactReview: {
      ...input.assetFactReview,
      subject_manifest_sha256: resigned.manifest_sha256,
      inspected_packet_sha256: packetRecord.sha256,
      inspected_visual_page_sha256s: [visualRecord.sha256],
      inspected_facts_page_sha256s: [factsRecord.sha256],
    },
  };
}

async function resignFirstKit(input, mutate) {
  const manifest = structuredClone(input.manifest);
  const records = new Map(manifest.artifacts.map((record) => [record.artifact_id, record]));
  const kitRecord = records.get('flat-shot-kit-S001');
  const setRecord = records.get('flat-shot-kit-set');
  const packetRecord = records.get('asset-contact-sheet-index');
  const factsRecord = records.get('asset-contact-sheet-page-facts-001');
  const kit = JSON.parse(await readFile(path.join(input.root, kitRecord.locator_key), 'utf8'));
  const kitSet = JSON.parse(await readFile(path.join(input.root, setRecord.locator_key), 'utf8'));
  const packet = JSON.parse(await readFile(path.join(input.root, packetRecord.locator_key), 'utf8'));
  const facts = JSON.parse(await readFile(path.join(input.root, factsRecord.locator_key), 'utf8'));
  mutate(kit);
  const kitBytes = jsonBytes(kit);
  await writeFile(path.join(input.root, kitRecord.locator_key), kitBytes);
  Object.assign(kitRecord, { sha256: hashBytes(kitBytes), size_bytes: kitBytes.length });
  Object.assign(kitSet.kits[0], {
    sha256: kitRecord.sha256,
    size_bytes: kitRecord.size_bytes,
  });
  const kitSetBytes = jsonBytes(kitSet);
  await writeFile(path.join(input.root, setRecord.locator_key), kitSetBytes);
  Object.assign(setRecord, { sha256: hashBytes(kitSetBytes), size_bytes: kitSetBytes.length });
  Object.assign(facts[0], {
    kit_sha256: kitRecord.sha256,
    route: kit.primary_asset.route,
    media_kind: kit.primary_asset.media_kind,
  });
  const factsBytes = jsonBytes(facts);
  await writeFile(path.join(input.root, factsRecord.locator_key), factsBytes);
  Object.assign(factsRecord, { sha256: hashBytes(factsBytes), size_bytes: factsBytes.length });
  packet.flat_shot_kit_set_sha256 = setRecord.sha256;
  Object.assign(packet.pages[0].facts, { sha256: factsRecord.sha256, size_bytes: factsRecord.size_bytes });
  const { packet_sha256: ignored, ...packetCore } = packet;
  packet.packet_sha256 = fingerprintArtifactValue(packetCore);
  const packetBytes = jsonBytes(packet);
  await writeFile(path.join(input.root, packetRecord.locator_key), packetBytes);
  Object.assign(packetRecord, { sha256: hashBytes(packetBytes), size_bytes: packetBytes.length });
  manifest.metrics.flat_shot_kit_set_sha256 = setRecord.sha256;
  const resigned = createArtifactManifest(manifest);
  return {
    ...input,
    manifest: resigned,
    assetFactReview: {
      ...input.assetFactReview,
      subject_manifest_sha256: resigned.manifest_sha256,
      flat_shot_kit_set_sha256: setRecord.sha256,
      inspected_packet_sha256: packetRecord.sha256,
      inspected_facts_page_sha256s: [factsRecord.sha256],
    },
  };
}

test('accepts a complete ordinary-primary set and paired visual/facts review pages', async (t) => {
  const input = await fixture(t);
  const result = await validateAssetsV2Chain(input);
  assert.equal(result.shot_count, 2);
  assert.deepEqual(result.route_counts, { user_media: 0, image_generation: 2, pexels: 0 });
  assert.equal(result.contribution_status_counts.pending_master_build, 2);
  assert.equal(result.inspected_visual_page_sha256s.length, 1);
  assert.equal(result.inspected_facts_page_sha256s.length, 1);
});

test('hash-checks every declared byte before parsing and rejects symlink/containment escapes', async (t) => {
  const tampered = await fixture(t);
  await writeFile(path.join(tampered.root, 'flat-shot-kit-S001.json'), '{}');
  await assert.rejects(() => validateAssetsV2Chain(tampered), (error) => error.code === 'artifact_hash_mismatch');

  const visualTamper = await fixture(t);
  await writeFile(path.join(visualTamper.root, 'asset-contact-sheet-page-visual-001.ppm'), 'P3\\n1 1\\n255\\n0 0 0\\n');
  await assert.rejects(() => validateAssetsV2Chain(visualTamper), (error) => error.code === 'artifact_hash_mismatch');

  const factsTamper = await fixture(t);
  await writeFile(path.join(factsTamper.root, 'asset-contact-sheet-page-facts-001.json'), '[]');
  await assert.rejects(() => validateAssetsV2Chain(factsTamper), (error) => error.code === 'artifact_hash_mismatch');

  const linked = await fixture(t);
  const facts = path.join(linked.root, 'asset-contact-sheet-page-facts-001.json');
  await unlink(facts);
  await symlink(path.join(linked.root, 'flat-shot-kit-S001.json'), facts);
  await assert.rejects(() => validateAssetsV2Chain(linked), (error) => error.code === 'artifact_symlink');

  const escaped = await fixture(t);
  escaped.manifest.artifacts.find((record) => record.artifact_id === 'flat-shot-kit-set').locator_key = '../flat-shot-kit-set.json';
  await assert.rejects(() => validateAssetsV2Chain(escaped), (error) => error.code === 'artifact_path_escape');
});

test('rejects facts/kit disagreement and non-contiguous page coverage after valid re-signing', async (t) => {
  const mismatch = await fixture(t);
  const resignedMismatch = await resignContact(mismatch, ({ facts }) => { facts[0].subject_bbox.x += 1; });
  await assert.rejects(() => validateAssetsV2Chain(resignedMismatch), (error) => error.code === 'assets_packet_facts_mismatch');

  const gap = await fixture(t);
  const resignedGap = await resignContact(gap, ({ packet }) => { packet.pages[0].facts.shot_start = 2; });
  await assert.rejects(() => validateAssetsV2Chain(resignedGap), (error) => error.code === 'assets_packet_incomplete');
});

test('requires every reviewed candidate, one selected result and exact rejection aggregation', async (t) => {
  const missing = await fixture(t);
  const resignedMissing = await resignContact(missing, ({ facts }) => { facts[0].candidates = []; });
  await assert.rejects(() => validateAssetsV2Chain(resignedMissing), (error) => error.code === 'assets_candidate_facts_invalid');

  const duplicateSelected = await fixture(t);
  const resignedDuplicate = await resignContact(duplicateSelected, ({ facts }) => { facts[0].candidates[1].status = 'selected'; });
  await assert.rejects(() => validateAssetsV2Chain(resignedDuplicate), (error) => error.code === 'assets_candidate_selection_invalid');

  const drift = await fixture(t);
  const resignedDrift = await resignContact(drift, ({ facts }) => { facts[0].candidates[1].decision_code = 'different-rejection'; });
  await assert.rejects(() => validateAssetsV2Chain(resignedDrift), (error) => error.code === 'assets_candidate_rejection_drift');

  const previewTamper = await fixture(t);
  await writeFile(path.join(previewTamper.root, 'candidate-preview-rejected-S001.png'), 'changed candidate preview');
  await assert.rejects(() => validateAssetsV2Chain(previewTamper), (error) => error.code === 'artifact_hash_mismatch');

  const wrongEvidenceId = await fixture(t);
  const resignedWrongEvidenceId = await resignContact(wrongEvidenceId, ({ facts }) => {
    facts[0].candidates[0].rights_evidence_artifact_id = 'rights-evidence-S002';
  });
  await assert.rejects(() => validateAssetsV2Chain(resignedWrongEvidenceId), (error) => error.code === 'asset_candidate_rights_unbound');

  const pathCandidateId = await fixture(t);
  const resignedPathCandidateId = await resignContact(pathCandidateId, ({ facts }) => {
    facts[0].candidates[0].candidate_id = '../selected-S001';
  });
  await assert.rejects(() => validateAssetsV2Chain(resignedPathCandidateId), (error) => error.code === 'assets_candidate_facts_invalid');

  const overlongCandidateId = await fixture(t);
  const resignedOverlongCandidateId = await resignContact(overlongCandidateId, ({ facts }) => {
    facts[0].candidates[0].candidate_id = `candidate-${'x'.repeat(96)}`;
  });
  await assert.rejects(() => validateAssetsV2Chain(resignedOverlongCandidateId), (error) => error.code === 'assets_candidate_facts_invalid');
});

test('rejects producer self-attestation and incomplete paired-page inspection', async (t) => {
  const self = await fixture(t);
  self.assetFactReview = { ...self.assetFactReview, reviewer_isolation_sha256: self.manifest.producer_isolation_sha256 };
  await assert.rejects(() => validateAssetsV2Chain(self), (error) => error.code === 'self_attested_review');

  const missingFacts = await fixture(t);
  missingFacts.assetFactReview = { ...missingFacts.assetFactReview, inspected_facts_page_sha256s: [] };
  await assert.rejects(() => validateAssetsV2Chain(missingFacts), (error) => error.code === 'asset_review_unbound');

  const wrongSet = await fixture(t);
  wrongSet.assetFactReview = { ...wrongSet.assetFactReview, flat_shot_kit_set_sha256: 'f'.repeat(64) };
  await assert.rejects(() => validateAssetsV2Chain(wrongSet), (error) => error.code === 'asset_review_unbound');
});

test('resume revalidates the full assets bytes instead of trusting an old receipt', async (t) => {
  const input = await fixture(t);
  await writeFile(path.join(input.root, 'integrity-receipt-S001.json'), '{}');
  await assert.rejects(
    () => orchestrateFixture({ fixtureId: 'faceless-basic', projectRoot: input.projectRoot, testOnlyLegacyInspection: true }),
    (error) => error.code === 'artifact_hash_mismatch',
  );
});

test('rejects resource-receipt replacement, upstream director tamper, native primary and contribution overclaim', async (t) => {
  const replaced = await fixture(t);
  const otherReceipt = await readFile(path.join(replaced.root, 'integrity-receipt-S002.json'));
  await writeFile(path.join(replaced.root, 'integrity-receipt-S001.json'), otherReceipt);
  await assert.rejects(() => validateAssetsV2Chain(replaced), (error) => error.code === 'artifact_hash_mismatch');

  const upstream = await fixture(t);
  await writeFile(path.join(upstream.directorRoot, 'design-slice.json'), '{}');
  await assert.rejects(() => validateAssetsV2Chain(upstream), (error) => error.code === 'artifact_hash_mismatch');

  const native = await fixture(t);
  const resignedNative = await resignFirstKit(native, (kit) => { kit.primary_asset.route = 'hyperframes-native'; });
  await assert.rejects(() => validateAssetsV2Chain(resignedNative), (error) => error.code === 'invalid_primary_route');

  const contribution = await fixture(t);
  const resignedContribution = await resignFirstKit(contribution, (kit) => { kit.contribution_evidence.status = 'verified'; });
  await assert.rejects(() => validateAssetsV2Chain(resignedContribution), (error) => error.code === 'unverified_contribution_claim');
});
