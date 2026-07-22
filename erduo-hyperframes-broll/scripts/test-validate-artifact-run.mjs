import test from 'node:test';
import assert from 'node:assert/strict';
import { ArtifactRunError, validateArtifactRun } from './validate-artifact-run.mjs';
const sha = (letter) => letter.repeat(64);
const stages = ['director', 'assets', 'master-build', 'render'];
function fixture(status = 'verified') {
  const brief = sha('0'); let upstream = brief;
  const bundles = ['1', '2', '3', '4']; const contexts = ['7', '8', '9', 'a'];
  const graph = stages.map((stage, index) => {
    const metrics = stage === 'assets' ? { shot_count: 10, native_primary_count: 3 } : stage === 'master-build' ? { shot_count: 10, pre_master_evidence_shot_count: 10, pre_master_evidence_sha256: sha('d'), source_gate_passed: true, pixel_gate_passed: true, official_hyperframes_skill_used: true, official_hyperframes_creation_sha256: sha('e') } : stage === 'render' ? { shot_count: 10, visual_evidence_shot_count: 10, master_sha256: sha('d'), coverage_basis_points: 10000, duration_ms: 10000, verify_passed: true } : { shot_count: 10 };
    const node = { stage, package_id: `pkg-${stage}`, manifest_sha256: sha(bundles[index]), upstream_manifest_sha256: upstream, creative_brief_sha256: brief, producer_isolation_sha256: sha(contexts[index]), metrics }; upstream = node.manifest_sha256; return node;
  });
  const mainReview = (gate, node, reviewer, packet, approval) => ({ gate, status: 'approved', subject_manifest_sha256: node.manifest_sha256, reviewer_role: 'erduo-hyperframes-broll-main-agent', reviewer_isolation_sha256: sha(reviewer), review_packet_sha256: sha(packet), approval_sha256: sha(approval) });
  return { schema_version: 5, run_status: status, creative_brief: { sha256: brief, native_route_max_bp: 3000, user_confirmation_sha256: sha('f') }, artifact_graph: graph, hard_gates: { input_preflight_sha256: sha('5'), source_gate_sha256: sha('6'), pixel_gate_sha256: sha('7'), verify_sha256: sha('8') }, main_reviews: { shot_plan: mainReview('shot_plan_review', graph[0], 'b', '1', '2'), assets: mainReview('asset_fact_review', graph[1], 'c', '3', '4'), html_preview: mainReview('html_preview_review', graph[2], 'd', '5', '6'), final_frames: mainReview('final_frame_review', graph[3], 'e', '7', '8') }, export_manifest: status === 'slices_exported' ? { manifest_sha256: sha('e'), upstream_manifest_sha256: graph[3].manifest_sha256, shot_count: 10 } : null };
}
const expect = (doc, code) => assert.throws(() => validateArtifactRun(doc), (error) => error instanceof ArtifactRunError && error.code === code);
test('binds the four-stage graph, deterministic gates and main visual reviews', () => {
  assert.equal(validateArtifactRun(fixture()).run_status, 'verified');
  const wrong = fixture(); wrong.main_reviews.html_preview.subject_manifest_sha256 = wrong.artifact_graph[3].manifest_sha256; expect(wrong, 'main_agent_review_missing');
});
test('rejects runs without main-agent review gates', () => {
  const missing = fixture(); delete missing.main_reviews; expect(missing, 'main_agent_review_missing');
  const wrong = fixture(); wrong.main_reviews.final_frames.subject_manifest_sha256 = wrong.artifact_graph[2].manifest_sha256; expect(wrong, 'main_agent_review_missing');
});
test('rejects broken graph, producer self-approval and 27/27 native against 30%', () => {
  const graph = fixture(); graph.artifact_graph[2].upstream_manifest_sha256 = sha('f'); expect(graph, 'artifact_graph_invalid');
  const self = fixture(); self.main_reviews.html_preview.reviewer_isolation_sha256 = self.artifact_graph[2].producer_isolation_sha256; expect(self, 'self_attested_review');
  const native = fixture(); native.artifact_graph[1].metrics = { shot_count: 27, native_primary_count: 27 }; native.artifact_graph[2].metrics.shot_count = 27; native.artifact_graph[2].metrics.pre_master_evidence_shot_count = 27; native.artifact_graph[3].metrics.shot_count = 27; native.artifact_graph[3].metrics.visual_evidence_shot_count = 27; expect(native, 'native_route_ratio_exceeded');
});
test('requires complete pre-master evidence, final render technical evidence, and verify/master continuity', () => {
  const preMaster = fixture(); preMaster.artifact_graph[2].metrics.pre_master_evidence_shot_count = 9; expect(preMaster, 'pre_master_visual_evidence_missing');
  const hardGate = fixture(); delete hardGate.artifact_graph[2].metrics.pixel_gate_passed; expect(hardGate, 'hard_gate_missing');
  const official = fixture(); delete official.artifact_graph[2].metrics.official_hyperframes_creation_sha256; expect(official, 'official_hyperframes_skill_missing');
  const evidence = fixture(); evidence.artifact_graph[3].metrics.visual_evidence_shot_count = 9; expect(evidence, 'visual_evidence_three_state_missing');
  const media = fixture(); media.artifact_graph[3].metrics.coverage_basis_points = 9999; expect(media, 'verification_summary_invalid');
  assert.equal(validateArtifactRun(fixture('slices_exported')).run_status, 'slices_exported');
});
