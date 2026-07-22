import { createHash } from 'node:crypto';
import { validateBoundedMetrics } from './artifact-manifest.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const STAGES = ['director', 'assets', 'master-build', 'render'];
const RUN_STATUSES = new Set(['verified', 'slices_exported']);
const MAIN_REVIEW_ROLE = 'erduo-hyperframes-broll-main-agent';
export class ArtifactRunError extends Error { constructor(code, message) { super(message); this.name = 'ArtifactRunError'; this.code = code; } }
const fail = (code, message) => { throw new ArtifactRunError(code, message); };
const exact = (value, fields, code = 'artifact_run_invalid') => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail(code, 'Artifact-graph run has an invalid shape.');
};
const sha = (value, code = 'artifact_run_invalid') => { if (!SHA256.test(value ?? '')) fail(code, 'Artifact-graph hash is invalid.'); return value; };
function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isSafeInteger(value)) fail('artifact_run_invalid', 'Run number must be safe integer.'); return value; }
  if (!value || typeof value !== 'object') fail('artifact_run_invalid', 'Run value is invalid.');
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}
export const fingerprintArtifactRunValue = (value) => createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex');

function validateNode(node, stage, upstream, briefSha256) {
  exact(node, ['stage', 'package_id', 'manifest_sha256', 'upstream_manifest_sha256', 'creative_brief_sha256', 'producer_isolation_sha256', 'metrics'], 'artifact_graph_invalid');
  if (node.stage !== stage || node.upstream_manifest_sha256 !== upstream || node.creative_brief_sha256 !== briefSha256 || typeof node.package_id !== 'string' || !node.package_id) fail('artifact_graph_invalid', 'Artifact graph is out of order or not brief-bound.');
  sha(node.manifest_sha256, 'artifact_graph_invalid'); sha(node.producer_isolation_sha256, 'artifact_graph_invalid'); validateBoundedMetrics(node.metrics);
  return node.manifest_sha256;
}
function validateMainReview(review, gate, subject) {
  exact(review, ['approval_sha256', 'gate', 'review_packet_sha256', 'reviewer_isolation_sha256', 'reviewer_role', 'status', 'subject_manifest_sha256'], 'main_agent_review_missing');
  if (review.gate !== gate || review.reviewer_role !== MAIN_REVIEW_ROLE || review.status !== 'approved' || review.subject_manifest_sha256 !== subject.manifest_sha256) fail('main_agent_review_missing', 'Main-agent review does not bind expected subject.');
  sha(review.reviewer_isolation_sha256, 'main_agent_review_missing'); sha(review.review_packet_sha256, 'main_agent_review_missing'); sha(review.approval_sha256, 'main_agent_review_missing');
  if (review.reviewer_isolation_sha256 === subject.producer_isolation_sha256) fail('self_attested_review', 'Producer cannot stand in for main-agent review.');
}

export function validateArtifactRun(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) fail('artifact_run_invalid', 'Run version or status is invalid.');
  if (!('main_reviews' in run)) fail('main_agent_review_missing', 'Verified delivery requires main-agent review gates.');
  exact(run, ['schema_version', 'run_status', 'creative_brief', 'artifact_graph', 'hard_gates', 'main_reviews', 'export_manifest']);
  if (run.schema_version !== 5 || !RUN_STATUSES.has(run.run_status)) fail('artifact_run_invalid', 'Run version or status is invalid.');
  exact(run.creative_brief, ['sha256', 'native_route_max_bp', 'user_confirmation_sha256']);
  const briefSha256 = sha(run.creative_brief.sha256); sha(run.creative_brief.user_confirmation_sha256);
  if (!Number.isSafeInteger(run.creative_brief.native_route_max_bp) || run.creative_brief.native_route_max_bp < 0 || run.creative_brief.native_route_max_bp > 10000) fail('artifact_run_invalid', 'Native route ceiling is invalid.');
  if (!Array.isArray(run.artifact_graph) || run.artifact_graph.length !== STAGES.length) fail('artifact_graph_invalid', 'Complete four-stage artifact graph is required.');
  let upstream = briefSha256;
  for (const [index, stage] of STAGES.entries()) upstream = validateNode(run.artifact_graph[index], stage, upstream, briefSha256);
  const nodes = Object.fromEntries(run.artifact_graph.map((node) => [node.stage, node]));
  exact(run.hard_gates, ['input_preflight_sha256', 'pixel_gate_sha256', 'source_gate_sha256', 'verify_sha256'], 'hard_gate_missing');
  for (const value of Object.values(run.hard_gates)) sha(value, 'hard_gate_missing');
  exact(run.main_reviews, ['assets', 'final_frames', 'html_preview', 'shot_plan'], 'main_agent_review_missing');
  validateMainReview(run.main_reviews.shot_plan, 'shot_plan_review', nodes.director);
  validateMainReview(run.main_reviews.assets, 'asset_fact_review', nodes.assets);
  validateMainReview(run.main_reviews.html_preview, 'html_preview_review', nodes['master-build']);
  validateMainReview(run.main_reviews.final_frames, 'final_frame_review', nodes.render);
  const shotCount = nodes.assets.metrics.shot_count;
  const nativeCount = nodes.assets.metrics.native_primary_count;
  if (!Number.isSafeInteger(shotCount) || shotCount < 1 || !Number.isSafeInteger(nativeCount) || nativeCount < 0 || nativeCount > shotCount) fail('route_summary_invalid', 'Asset metrics lack valid route counts.');
  const nativeBp = Math.floor((nativeCount * 10000) / shotCount);
  if (nativeBp > run.creative_brief.native_route_max_bp) fail('native_route_ratio_exceeded', 'Native primary-route ratio exceeds confirmed brief.');
  if (nodes['master-build'].metrics.shot_count !== shotCount || nodes['master-build'].metrics.pre_master_evidence_shot_count !== shotCount || !SHA256.test(nodes['master-build'].metrics.pre_master_evidence_sha256 ?? '')) fail('pre_master_visual_evidence_missing', 'Master build lacks complete source-bound pre-master evidence metrics.');
  if (nodes['master-build'].metrics.source_gate_passed !== true || nodes['master-build'].metrics.pixel_gate_passed !== true) fail('hard_gate_missing', 'Master build lacks passing source/pixel hard-gate metrics.');
  if (nodes['master-build'].metrics.official_hyperframes_skill_used !== true || !SHA256.test(nodes['master-build'].metrics.official_hyperframes_creation_sha256 ?? '')) fail('official_hyperframes_skill_missing', 'Master build lacks official HyperFrames authoring evidence.');
  if (nodes.render.metrics.shot_count !== shotCount || nodes.render.metrics.visual_evidence_shot_count !== shotCount || !SHA256.test(nodes.render.metrics.master_sha256 ?? '')) fail('visual_evidence_three_state_missing', 'Render manifest lacks complete final-master technical evidence metrics.');
  if (nodes.render.metrics.verify_passed !== true || nodes.render.metrics.coverage_basis_points !== 10000 || !Number.isSafeInteger(nodes.render.metrics.duration_ms)
    || nodes.render.metrics.duration_ms < 1) fail('verification_summary_invalid', 'Render/verify metrics are incomplete or do not bind the current master.');
  if (run.run_status === 'verified' && run.export_manifest !== null) fail('slice_not_requested', 'Verified run cannot contain export manifest.');
  if (run.run_status === 'slices_exported') {
    exact(run.export_manifest, ['manifest_sha256', 'upstream_manifest_sha256', 'shot_count']);
    sha(run.export_manifest.manifest_sha256, 'slice_not_from_verified_master');
    if (run.export_manifest.upstream_manifest_sha256 !== nodes.render.manifest_sha256 || run.export_manifest.shot_count !== shotCount) fail('slice_not_from_verified_master', 'Export does not derive from verified render manifest.');
  }
  return { run_status: run.run_status, shot_count: shotCount, native_route_basis_points: nativeBp, run_sha256: fingerprintArtifactRunValue(run) };
}
