import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateArtifactManifest, fingerprintArtifactValue } from './artifact-manifest.mjs';
import {
  validateDirectorFactsV2Chain,
  validateDirectorV2Chain,
} from './validate-director-v2-chain.mjs';
import { validateFlatShotKitSet } from './validate-flat-shot-kit-set.mjs';
import { validateManifestMainReviewPacket } from './validate-main-review-packets.mjs';
import {
  validateAssetVisualGrammarBindings,
} from './validate-visual-authoring-chain.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT_ID = /^S[0-9]{3}$/u;
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/u;
const MAIN_REVIEW_ROLE = 'erduo-hyperframes-broll-main-agent';
const REQUIRED_ARTIFACTS = ['flat-shot-kit-set', 'asset-contact-sheet-index'];
const CURRENT_REQUIRED_ARTIFACTS = ['asset-visual-grammar-bindings'];
const CONTACT_PAGE_PREFIX = 'asset-contact-sheet-page-';

export class AssetsV2ChainError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AssetsV2ChainError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new AssetsV2ChainError(code, message); };
const exact = (value, fields, code = 'assets_chain_invalid') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, 'Assets version-2 chain has an invalid shape.');
  }
};
const isSha = (value) => typeof value === 'string' && SHA256.test(value);

async function readArtifactBytes(root, record) {
  try {
    return await readFile(path.resolve(root, record.locator_key));
  } catch {
    fail('assets_artifact_unreadable', `Assets artifact ${record.artifact_id} is not readable.`);
  }
}

function parseJson(bytes, artifactId) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('assets_artifact_unreadable', `Assets artifact ${artifactId} is not readable JSON.`);
  }
}

function assertResourceBinding(records, artifactId, expectedSha256, expectedSize, code) {
  const record = records.get(artifactId);
  if (!record || record.sha256 !== expectedSha256
    || expectedSize !== undefined && record.size_bytes !== expectedSize) {
    fail(code, `Assets artifact ${artifactId} is missing or not bound to the flat shot kit.`);
  }
  return record;
}

function assertJsonResourceBinding(records, artifactId, expectedSha256, code) {
  const record = assertResourceBinding(records, artifactId, expectedSha256, undefined, code);
  if (record.kind !== 'json' || record.media_type !== 'application/json') {
    fail(code, `Assets artifact ${artifactId} must be a manifest-bound JSON record.`);
  }
  return record;
}

function validateKitResourceBindings(kit, records) {
  const assetRecord = assertResourceBinding(
    records,
    kit.primary_asset.frozen.locator_id,
    kit.primary_asset.frozen.sha256,
    kit.primary_asset.frozen.size_bytes,
    'asset_bytes_unbound',
  );
  const expectedMediaPrefix = kit.primary_asset.media_kind === 'image' ? 'image/' : 'video/';
  if (!assetRecord.media_type.startsWith(expectedMediaPrefix)) {
    fail('asset_media_kind_unbound', 'Frozen primary bytes do not use the media kind declared by the flat shot kit.');
  }
  assertJsonResourceBinding(
    records,
    kit.primary_asset.frozen.integrity_receipt_artifact_id,
    kit.primary_asset.frozen.integrity_receipt_sha256,
    'asset_integrity_receipt_unbound',
  );
  assertJsonResourceBinding(
    records,
    kit.primary_asset.provenance.source_record_id,
    kit.primary_asset.provenance.source_record_sha256,
    'asset_provenance_unbound',
  );
  assertJsonResourceBinding(
    records,
    kit.primary_asset.rights.evidence_artifact_id,
    kit.primary_asset.rights.evidence_sha256,
    'asset_rights_unbound',
  );
  const previewRecord = assertResourceBinding(
    records,
    kit.target_preview.artifact_id,
    kit.target_preview.frame_sha256,
    undefined,
    'asset_preview_unbound',
  );
  if (!previewRecord.media_type.startsWith('image/')) {
    fail('asset_preview_unbound', 'Target-raster preview must resolve to an image artifact.');
  }
  assertJsonResourceBinding(
    records,
    kit.target_preview.capture_receipt_artifact_id,
    kit.target_preview.capture_receipt_sha256,
    'asset_preview_unbound',
  );
}

function validateCandidateFacts(candidates, kit, records) {
  if (!Array.isArray(candidates) || candidates.length < 1 || candidates.length > 16) {
    fail('assets_candidate_facts_invalid', 'Asset facts need a bounded candidate list.');
  }
  const ids = new Set();
  const rejectedCounts = new Map();
  let selected;
  for (const candidate of candidates) {
    exact(candidate, ['candidate_id', 'route', 'media_kind', 'status', 'preview_artifact_id', 'preview_sha256', 'rights_status', 'rights_evidence_artifact_id', 'rights_evidence_sha256', 'decision_code', 'decision_reason'], 'assets_candidate_facts_invalid');
    if (!OPAQUE_ID.test(candidate.candidate_id ?? '')
      || ids.has(candidate.candidate_id)
      || !OPAQUE_ID.test(candidate.preview_artifact_id ?? '')
      || !OPAQUE_ID.test(candidate.rights_evidence_artifact_id ?? '')
      || !['user-media', 'image-generation', 'pexels'].includes(candidate.route)
      || !['image', 'video'].includes(candidate.media_kind)
      || !['selected', 'rejected'].includes(candidate.status)
      || !isSha(candidate.preview_sha256) || !isSha(candidate.rights_evidence_sha256)
      || !['cleared', 'conditional'].includes(candidate.rights_status)
      || typeof candidate.decision_code !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/u.test(candidate.decision_code)
      || typeof candidate.decision_reason !== 'string' || !candidate.decision_reason.trim()
      || candidate.decision_reason.length > 400) {
      fail('assets_candidate_facts_invalid', 'Asset candidate facts are invalid or duplicated.');
    }
    ids.add(candidate.candidate_id);
    const previewRecord = assertResourceBinding(records, candidate.preview_artifact_id, candidate.preview_sha256, undefined, 'asset_candidate_preview_unbound');
    if (!previewRecord.media_type.startsWith('image/')) {
      fail('asset_candidate_preview_unbound', 'Every reviewed candidate preview must resolve to image bytes.');
    }
    assertJsonResourceBinding(
      records,
      candidate.rights_evidence_artifact_id,
      candidate.rights_evidence_sha256,
      'asset_candidate_rights_unbound',
    );
    if (candidate.status === 'selected') {
      if (selected) fail('assets_candidate_selection_invalid', 'Each shot must have exactly one selected candidate.');
      selected = candidate;
    } else {
      rejectedCounts.set(candidate.decision_code, (rejectedCounts.get(candidate.decision_code) ?? 0) + 1);
    }
  }
  if (!selected
    || selected.route !== kit.primary_asset.route
    || selected.media_kind !== kit.primary_asset.media_kind
    || selected.preview_artifact_id !== kit.target_preview.artifact_id
    || selected.preview_sha256 !== kit.target_preview.frame_sha256
    || selected.rights_status !== kit.primary_asset.rights.review_status
    || selected.rights_evidence_artifact_id !== kit.primary_asset.rights.evidence_artifact_id
    || selected.rights_evidence_sha256 !== kit.primary_asset.rights.evidence_sha256
    || selected.decision_reason !== kit.selection_record.selected_reason) {
    fail('assets_candidate_selection_invalid', 'Selected candidate facts do not equal the frozen flat-kit selection.');
  }
  const rejected = candidates.filter((candidate) => candidate.status === 'rejected');
  const expectedCounts = new Map(kit.selection_record.rejection_reasons.map((item) => [item.code, item.count]));
  if (rejected.length !== kit.selection_record.candidates_rejected
    || rejectedCounts.size !== expectedCounts.size
    || [...expectedCounts].some(([code, count]) => rejectedCounts.get(code) !== count)) {
    fail('assets_candidate_rejection_drift', 'Reviewed rejected candidates do not match the flat-kit rejection summary.');
  }
}

async function validateContactSheetPacket(packet, root, records, kitByShot, {
  directorManifestSha256,
  shotPlanSha256,
  designSliceSha256,
  kitSetSha256,
  targetRaster,
  shotCount,
  routeCounts,
}) {
  exact(packet, [
    'schema_version',
    'pipeline_contract_version',
    'director_manifest_sha256',
    'shot_plan_sha256',
    'design_slice_sha256',
    'flat_shot_kit_set_sha256',
    'target_raster',
    'shot_count',
    'route_counts',
    'native_primary_count',
    'pages',
    'packet_sha256',
  ], 'assets_packet_invalid');
  const core = {
    schema_version: packet.schema_version,
    pipeline_contract_version: packet.pipeline_contract_version,
    director_manifest_sha256: packet.director_manifest_sha256,
    shot_plan_sha256: packet.shot_plan_sha256,
    design_slice_sha256: packet.design_slice_sha256,
    flat_shot_kit_set_sha256: packet.flat_shot_kit_set_sha256,
    target_raster: packet.target_raster,
    shot_count: packet.shot_count,
    route_counts: packet.route_counts,
    native_primary_count: packet.native_primary_count,
    pages: packet.pages,
  };
  if (packet.schema_version !== 1 || packet.pipeline_contract_version !== 2
    || packet.director_manifest_sha256 !== directorManifestSha256
    || packet.shot_plan_sha256 !== shotPlanSha256
    || packet.design_slice_sha256 !== designSliceSha256
    || packet.flat_shot_kit_set_sha256 !== kitSetSha256
    || fingerprintArtifactValue(packet.target_raster) !== fingerprintArtifactValue(targetRaster)
    || fingerprintArtifactValue(packet.route_counts) !== fingerprintArtifactValue(routeCounts)
    || packet.native_primary_count !== 0
    || packet.shot_count !== shotCount
    || !Array.isArray(packet.pages) || !packet.pages.length
    || packet.pages.length > 256
    || packet.packet_sha256 !== fingerprintArtifactValue(core)) {
    fail('assets_packet_unbound', 'Asset contact-sheet packet does not bind the approved director, design slice and flat-kit set.');
  }

  let nextShot = 1;
  const inspectedVisualPageSha256s = [];
  const inspectedFactsPageSha256s = [];
  for (const page of packet.pages) {
    exact(page, ['visual', 'facts'], 'assets_packet_invalid');
    exact(page.visual, ['artifact_id', 'sha256', 'size_bytes'], 'assets_packet_invalid');
    exact(page.facts, ['artifact_id', 'sha256', 'size_bytes', 'shot_start', 'shot_end'], 'assets_packet_invalid');
    const visualRecord = records.get(page.visual.artifact_id);
    const factsRecord = records.get(page.facts.artifact_id);
    if (!visualRecord || !factsRecord
      || !page.visual.artifact_id.startsWith(`${CONTACT_PAGE_PREFIX}visual-`)
      || !page.facts.artifact_id.startsWith(`${CONTACT_PAGE_PREFIX}facts-`)
      || visualRecord.sha256 !== page.visual.sha256 || visualRecord.size_bytes !== page.visual.size_bytes
      || factsRecord.sha256 !== page.facts.sha256 || factsRecord.size_bytes !== page.facts.size_bytes
      || !visualRecord.media_type.startsWith('image/') || visualRecord.size_bytes < 1
      || factsRecord.media_type !== 'application/json'
      || page.facts.shot_start !== nextShot || !Number.isSafeInteger(page.facts.shot_end)
      || page.facts.shot_end < page.facts.shot_start || page.facts.shot_end > shotCount) {
      fail('assets_packet_incomplete', 'Asset contact-sheet pages are missing, unbound or non-contiguous.');
    }
    const facts = parseJson(await readArtifactBytes(root, factsRecord), factsRecord.artifact_id);
    if (!Array.isArray(facts) || facts.length !== page.facts.shot_end - page.facts.shot_start + 1) {
      fail('assets_packet_incomplete', 'Asset facts page does not cover its paired visual page range.');
    }
    for (const [offset, row] of facts.entries()) {
      const shotId = `S${String(page.facts.shot_start + offset).padStart(3, '0')}`;
      const kit = kitByShot.get(shotId);
      exact(row, ['shot_id', 'kit_sha256', 'route', 'media_kind', 'selected_keyframe_sha256', 'preview_artifact_id', 'subject_bbox', 'output_crop_bbox', 'text_safe_regions', 'protected_regions', 'title_relation', 'rights_status', 'rights_evidence_sha256', 'selected_reason', 'fallback_status', 'candidates'], 'assets_packet_invalid');
      if (!kit || row.shot_id !== shotId
        || row.kit_sha256 !== kit.__artifact_sha256
        || row.route !== kit.primary_asset.route
        || row.media_kind !== kit.primary_asset.media_kind
        || row.selected_keyframe_sha256 !== kit.target_preview.frame_sha256
        || row.preview_artifact_id !== kit.target_preview.artifact_id
        || JSON.stringify(row.subject_bbox) !== JSON.stringify(kit.composition_fit.subject_bbox)
        || JSON.stringify(row.output_crop_bbox) !== JSON.stringify(kit.composition_fit.output_crop_bbox)
        || JSON.stringify(row.text_safe_regions) !== JSON.stringify(kit.composition_fit.text_safe_regions)
        || JSON.stringify(row.protected_regions) !== JSON.stringify(kit.composition_fit.protected_regions)
        || JSON.stringify(row.title_relation) !== JSON.stringify(kit.composition_fit.title_relation)
        || row.rights_status !== kit.primary_asset.rights.review_status
        || row.rights_evidence_sha256 !== kit.primary_asset.rights.evidence_sha256
        || row.selected_reason !== kit.selection_record.selected_reason
        || row.fallback_status !== kit.selection_record.fallback.status) {
        fail('assets_packet_facts_mismatch', 'Asset facts page does not match the frozen flat shot kit.');
      }
      validateCandidateFacts(row.candidates, kit, records);
    }
    nextShot = page.facts.shot_end + 1;
    inspectedVisualPageSha256s.push(visualRecord.sha256);
    inspectedFactsPageSha256s.push(factsRecord.sha256);
  }
  if (nextShot !== shotCount + 1) {
    fail('assets_packet_incomplete', 'Asset contact-sheet pages do not cover every shot.');
  }
  return { inspectedVisualPageSha256s, inspectedFactsPageSha256s };
}

async function validateAssetFactReview(review, {
  manifest,
  root,
  directorManifest,
  shotPlanSha256,
  designSliceSha256,
  kitSetSha256,
  contactPacketSha256,
  inspectedVisualPageSha256s,
  inspectedFactsPageSha256s,
  currentAuthoring = null,
}) {
  const fields = [
    'approval_sha256',
    'authority_scope',
    'deterministic_result',
    'gate',
    'pipeline_contract_version',
    'producer_isolation_sha256',
    'review_packet_sha256',
    'reviewer_isolation_sha256',
    'reviewer_model_id',
    'reviewer_role',
    'status',
    'subject_manifest_sha256',
    'visual_decision',
    'director_manifest_sha256',
    'shot_plan_sha256',
    'design_slice_sha256',
    'flat_shot_kit_set_sha256',
    'inspected_packet_sha256',
    'inspected_visual_page_sha256s',
    'inspected_facts_page_sha256s',
    ...(currentAuthoring ? [
      'visual_grammar_program_sha256',
      'whole_film_rules_sha256',
      'design_selection_replay_sha256',
      'asset_visual_bindings_sha256',
    ] : []),
  ];
  exact(review, fields, 'asset_review_unbound');
  if (review.gate !== 'asset_fact_review' || review.status !== 'approved'
    || review.reviewer_role !== MAIN_REVIEW_ROLE
    || review.subject_manifest_sha256 !== manifest.manifest_sha256
    || review.director_manifest_sha256 !== directorManifest.manifest_sha256
    || review.shot_plan_sha256 !== shotPlanSha256
    || review.design_slice_sha256 !== designSliceSha256
    || review.flat_shot_kit_set_sha256 !== kitSetSha256
    || review.inspected_packet_sha256 !== contactPacketSha256
    || JSON.stringify(review.inspected_visual_page_sha256s) !== JSON.stringify(inspectedVisualPageSha256s)
    || JSON.stringify(review.inspected_facts_page_sha256s) !== JSON.stringify(inspectedFactsPageSha256s)
    || currentAuthoring && (
      review.visual_grammar_program_sha256
        !== currentAuthoring.visual_grammar_program_sha256
      || review.whole_film_rules_sha256
        !== currentAuthoring.whole_film_rules_sha256
      || review.design_selection_replay_sha256
        !== currentAuthoring.design_selection_replay_sha256
      || review.asset_visual_bindings_sha256
        !== currentAuthoring.asset_visual_bindings_sha256
    )
    || !isSha(review.reviewer_isolation_sha256)
    || !isSha(review.review_packet_sha256)
    || !isSha(review.approval_sha256)) {
    fail('asset_review_unbound', 'Parent asset-fact review does not bind the complete inspected assets chain.');
  }
  if (review.reviewer_isolation_sha256 === manifest.producer_isolation_sha256) {
    fail('self_attested_review', 'Assets producer cannot issue its own main-agent review.');
  }
  try {
    await validateManifestMainReviewPacket({ review, manifest, root });
  } catch (error) {
    fail(error?.code ?? 'asset_review_unbound', error?.message ?? 'Asset review authority is invalid.');
  }
}

export async function validateAssetsV2Chain({
  manifest,
  root,
  directorManifest,
  directorRoot,
  shotPlanReview,
  assetFactReview,
  authoringTopologyId = null,
  designSelectionReplayOptions,
  expectedDesignSelectionOptionsSha256,
}) {
  if (manifest?.pipeline_contract_version !== 2 || directorManifest?.pipeline_contract_version !== 2) {
    fail('pipeline_upgrade_required', 'Assets chain requires pipeline contract version 2.');
  }
  if (manifest.stage !== 'assets' || directorManifest.stage !== 'director') {
    fail('assets_chain_invalid', 'Assets chain requires director then assets manifests.');
  }
  const director = authoringTopologyId === 'bounded-authoring-cluster-v1'
    ? await validateDirectorFactsV2Chain({
      manifest: directorManifest,
      root: directorRoot,
      designSelectionReplayOptions,
      expectedDesignSelectionOptionsSha256,
    })
    : await validateDirectorV2Chain({
      manifest: directorManifest,
      root: directorRoot,
      shotPlanReview,
    });
  await validateArtifactManifest(manifest, {
    root,
    expectedStage: 'assets',
    expectedUpstream: directorManifest.manifest_sha256,
    expectedCreativeBriefSha256: directorManifest.creative_brief_sha256,
  });

  const records = new Map(manifest.artifacts.map((record) => [record.artifact_id, record]));
  for (const artifactId of REQUIRED_ARTIFACTS) {
    if (!records.has(artifactId)) fail('assets_artifact_missing', `Assets manifest is missing ${artifactId}.`);
  }
  if (authoringTopologyId === 'bounded-authoring-cluster-v1') {
    for (const artifactId of CURRENT_REQUIRED_ARTIFACTS) {
      if (!records.has(artifactId)) {
        fail(
          'assets_artifact_missing',
          `Current assets manifest is missing ${artifactId}.`,
        );
      }
    }
  }
  const directorRecords = new Map(directorManifest.artifacts.map((record) => [record.artifact_id, record]));
  const shotPlanRecord = directorRecords.get('shot-plan');
  const designRecord = directorRecords.get('design-slice');
  if (!shotPlanRecord || !designRecord || designRecord.sha256 !== director.design_slice_sha256) {
    fail('assets_chain_unbound', 'Assets chain cannot resolve the approved director design slice.');
  }

  const [designSliceBytes, kitSetBytes, contactPacketBytes] = await Promise.all([
    readArtifactBytes(directorRoot, designRecord),
    readArtifactBytes(root, records.get('flat-shot-kit-set')),
    readArtifactBytes(root, records.get('asset-contact-sheet-index')),
  ]);
  const kitSet = parseJson(kitSetBytes, 'flat-shot-kit-set');
  if (!Array.isArray(kitSet.kits) || !kitSet.kits.length) {
    fail('flat_shot_kit_set_invalid', 'Flat-shot-kit set does not contain any kits.');
  }
  const kitArtifacts = new Map();
  for (const item of kitSet.kits) {
    const record = records.get(item?.artifact_id);
    if (!record) fail('assets_artifact_missing', `Assets manifest is missing flat kit ${item?.artifact_id ?? 'unknown'}.`);
    kitArtifacts.set(item.artifact_id, await readArtifactBytes(root, record));
  }
  const kitSetReceipt = await validateFlatShotKitSet(kitSet, {
    directorManifest,
    designSliceBytes,
    kitArtifacts,
  });
  if (kitSetReceipt.shot_count !== director.shot_count
    || kitSetReceipt.shot_plan_sha256 !== shotPlanRecord.sha256
    || kitSetReceipt.design_slice_sha256 !== designRecord.sha256
    || kitSetReceipt.director_manifest_sha256 !== directorManifest.manifest_sha256
    || kitSetReceipt.contribution_status_counts?.pending_master_build !== director.shot_count) {
    fail('assets_chain_unbound', 'Flat-shot-kit set does not match the approved director chain or pending contribution boundary.');
  }

  const kitByShot = new Map();
  for (const item of kitSet.kits) {
    const kit = parseJson(kitArtifacts.get(item.artifact_id), item.artifact_id);
    if (!SHOT_ID.test(kit.shot_id ?? '') || kit.primary_asset?.route === 'hyperframes-native') {
      fail('ordinary_primary_required', 'Every flat kit must select one ordinary image or video primary.');
    }
    validateKitResourceBindings(kit, records);
    Object.defineProperty(kit, '__artifact_sha256', { value: records.get(item.artifact_id).sha256 });
    kitByShot.set(kit.shot_id, kit);
  }

  let currentAuthoring = null;
  if (authoringTopologyId === 'bounded-authoring-cluster-v1') {
    const directorArtifactIds = [
      'visual-grammar-program',
      'whole-film-rules',
      'frame-projection',
      'design-selection',
      'selected-template',
      'design-library-snapshot',
    ];
    const directorArtifacts = new Map();
    for (const artifactId of directorArtifactIds) {
      const record = directorRecords.get(artifactId);
      if (!record) {
        fail(
          'assets_chain_unbound',
          `Current assets chain cannot resolve director artifact ${artifactId}.`,
        );
      }
      directorArtifacts.set(
        artifactId,
        parseJson(
          await readArtifactBytes(directorRoot, record),
          artifactId,
        ),
      );
    }
    const bindingRecord = records.get('asset-visual-grammar-bindings');
    const bindingDocument = parseJson(
      await readArtifactBytes(root, bindingRecord),
      bindingRecord.artifact_id,
    );
    const bindingOptions = {
      wholeFilmRules: directorArtifacts.get('whole-film-rules'),
      visualGrammarProgram:
        directorArtifacts.get('visual-grammar-program'),
      projection: directorArtifacts.get('frame-projection'),
      designSelection: directorArtifacts.get('design-selection'),
      designLibrary:
        directorArtifacts.get('design-library-snapshot'),
      ...(directorArtifacts.get('design-selection')?.base_template
          === 'hyperframes-native'
        ? {
          nativeBaseCompiler:
            directorArtifacts.get('selected-template'),
        }
        : {
          baseTemplate: directorArtifacts.get('selected-template'),
        }),
      director_manifest_sha256: directorManifest.manifest_sha256,
      design_selection_replay_receipt:
        director.design_selection_replay_receipt,
      flat_shot_kit_set_sha256:
        kitSetReceipt.flat_shot_kit_set_sha256,
      kits: kitSet.kits.map((item) => {
        const kit = kitByShot.get(item.shot_id);
        return {
          flat_shot_kit_sha256:
            fingerprintArtifactValue(kit),
          kit,
        };
      }),
    };
    let bindingReceipt;
    try {
      bindingReceipt = validateAssetVisualGrammarBindings(
        bindingDocument,
        bindingOptions,
      );
    } catch (error) {
      fail(
        error?.code ?? 'asset_visual_binding_invalid',
        error?.message
          ?? 'Asset visual bindings are invalid or stale.',
      );
    }
    currentAuthoring = {
      visual_grammar_program_sha256:
        bindingReceipt.visual_grammar_program_sha256,
      whole_film_rules_sha256:
        bindingReceipt.whole_film_rules_sha256,
      design_selection_replay_sha256:
        bindingReceipt.design_selection_replay_sha256,
      asset_visual_bindings_sha256:
        bindingReceipt.asset_visual_bindings_sha256,
    };
  }

  const kitSetRecord = records.get('flat-shot-kit-set');
  const packetRecord = records.get('asset-contact-sheet-index');
  if (packetRecord.size_bytes > 8 * 1024) {
    fail('assets_packet_too_large', 'Asset packet index exceeds the 8 KiB parent-review limit.');
  }
  const contactPacket = parseJson(contactPacketBytes, 'asset-contact-sheet-index');
  const inspectedPages = await validateContactSheetPacket(contactPacket, root, records, kitByShot, {
    directorManifestSha256: directorManifest.manifest_sha256,
    shotPlanSha256: shotPlanRecord.sha256,
    designSliceSha256: designRecord.sha256,
    kitSetSha256: kitSetRecord.sha256,
    targetRaster: kitSetReceipt.target_raster,
    shotCount: director.shot_count,
    routeCounts: kitSetReceipt.route_counts,
  });

  const expectedMetrics = {
    shot_count: director.shot_count,
    native_primary_count: 0,
    flat_shot_kit_count: director.shot_count,
    shot_plan_sha256: shotPlanRecord.sha256,
    design_slice_sha256: designRecord.sha256,
    flat_shot_kit_set_sha256: kitSetRecord.sha256,
    contact_sheet_page_count: inspectedPages.inspectedVisualPageSha256s.length,
    ...(currentAuthoring ? {
      asset_visual_bindings_sha256:
        currentAuthoring.asset_visual_bindings_sha256,
      design_selection_replay_sha256:
        currentAuthoring.design_selection_replay_sha256,
    } : {}),
  };
  for (const [field, value] of Object.entries(expectedMetrics)) {
    if (manifest.metrics[field] !== value) {
      fail('assets_metrics_unbound', 'Assets manifest metrics do not bind the complete flat-kit/contact-sheet set.');
    }
  }

  await validateAssetFactReview(assetFactReview, {
    manifest,
    root,
    directorManifest,
    shotPlanSha256: shotPlanRecord.sha256,
    designSliceSha256: designRecord.sha256,
    kitSetSha256: kitSetRecord.sha256,
    contactPacketSha256: packetRecord.sha256,
    ...inspectedPages,
    currentAuthoring,
  });
  return {
    pipeline_contract_version: 2,
    ...(authoringTopologyId ? { authoring_topology_id: authoringTopologyId } : {}),
    resume_eligible: true,
    shot_count: director.shot_count,
    director_manifest_sha256: directorManifest.manifest_sha256,
    design_slice_sha256: designRecord.sha256,
    flat_shot_kit_set_sha256: kitSetRecord.sha256,
    contact_sheet_packet_sha256: packetRecord.sha256,
    inspected_visual_page_sha256s: inspectedPages.inspectedVisualPageSha256s,
    inspected_facts_page_sha256s: inspectedPages.inspectedFactsPageSha256s,
    route_counts: kitSetReceipt.route_counts,
    rights_counts: kitSetReceipt.rights_counts,
    contribution_status_counts: kitSetReceipt.contribution_status_counts,
    ...(currentAuthoring ?? {}),
  };
}
