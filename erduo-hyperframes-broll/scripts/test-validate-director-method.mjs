import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectorMethodError, validateDirectorMethod } from './validate-director-method.mjs';

function validDirectorDocument(overrides = {}) {
  const shot = {
    shot_id: 'S001',
    srt_start_ms: 0,
    srt_end_ms: 2600,
    scene_goal: 'Set the hook with visual contrast and stable framing.',
    scene_goal_kind: 'hook',
    components: ['caption-kicker', 'flowchart'],
    asset_plan: {
      preferred_route: 'user-media',
      roles: [
        { role: 'hero', route: 'user-media', note: 'Use real user clip as opening anchor.' },
        { role: 'support', route: 'pexels', note: 'Fallback cutaway only if needed.' },
      ],
    },
    taste_reason: 'High-contrast visual entry separates this claim from adjacent exposition.',
    quality_notes: ['intent-card alignment', 'motif reused at midpoint', 'not subtitle-only'],
    ...overrides.shot,
  };

  return {
    schema_version: 1,
    method_id: 'erduo-director-method-v1',
    time_source: 'srt',
    timing_method: 'srt',
    disallowed_outputs: ['video-spec-hf.md', 'word-estimated-timing', 'asset-route-override'],
    intent_card: {
      visual_personality: ['minimal', 'high contrast', 'technical clarity'],
      emotion_visual_map: ['hook | pull-ahead', 'climax | settle-and-assert'],
      ...overrides.intent_card,
    },
    visual_motif: {
      motif_name: 'Progress arc',
      occurrence_notes: ['S001: arc starts as a narrow gauge', 'S004: arc widens into full sweep'],
      ...overrides.visual_motif,
    },
    shot_table: [shot],
    quality_audit_summary: {
      verdict: 'pass',
      checks: [
        { name: 'intent_card', status: 'pass', note: 'intent card exists and is source driven.' },
        { name: 'visual_motif', status: 'pass', note: 'visual motif appears at hook and close.' },
        { name: 'shot_table', status: 'pass', note: 'shot table carries component/material/taste fields.' },
        { name: 'components_assets_taste', status: 'pass', note: 'each shot has component, material role, and taste reason.' },
        { name: 'srt_timing', status: 'pass', note: 'all shots keyed by SRT ms windows.' },
        { name: 'disallowed_outputs', status: 'pass', note: 'video-spec-hf.md blocked, timing override blocked.' },
      ],
      ...overrides.quality_audit_summary,
    },
    asset_route_policy: {
      route_priority: ['user-media', 'image-generation', 'pexels', 'hyperframes-native'],
      forbidden_outputs: ['video-spec-hf.md', 'word-estimated-timing', 'asset-route-override'],
      ...overrides.asset_route_policy,
    },
    final_output: 'per-shot-candidates.json',
    ...overrides,
  };
}

test('self-contained director contract passes without an enhancer', () => {
  const output = validateDirectorMethod(validDirectorDocument());
  assert.equal(output.schema_version, 1);
  assert.equal(output.method_id, 'erduo-director-method-v1');
  assert.equal(output.time_source, 'srt');
  assert.deepEqual(output.optional_enhancer, { used: false });
  assert.equal(output.shot_count, 1);
  assert.equal(output.contract_sha256.length, 64);
});

test('validates optional enhancer metadata only when used', () => {
  const used = validateDirectorMethod(validDirectorDocument({
    optional_enhancer: {
      used: true,
      name: 'licensed-director',
      version: '1.2.3',
      license_id: 'MIT',
      output_sha256: 'a'.repeat(64),
      absorbed_sections: ['intent-card', 'visual-motif'],
    },
  }));
  assert.equal(used.optional_enhancer.used, true);
  assert.throws(
    () => validateDirectorMethod(validDirectorDocument({ optional_enhancer: { used: true, name: 'licensed-director' } })),
    (error) => error instanceof DirectorMethodError && error.code === 'invalid_optional_enhancer',
  );
});

test('rejects missing intent-card, motif, and shot-table sections', () => {
  const missingIntent = validDirectorDocument();
  delete missingIntent.intent_card;
  assert.throws(() => validateDirectorMethod(missingIntent), (error) => error instanceof DirectorMethodError && error.code === 'invalid_document');

  const missingMotif = validDirectorDocument();
  delete missingMotif.visual_motif;
  assert.throws(() => validateDirectorMethod(missingMotif), (error) => error instanceof DirectorMethodError && error.code === 'invalid_document');

  const missingShots = validDirectorDocument();
  delete missingShots.shot_table;
  assert.throws(() => validateDirectorMethod(missingShots), (error) => error instanceof DirectorMethodError && error.code === 'invalid_document');
});

test('rejects word-based timing fallback and video-spec-hf as final output', () => {
  const timing = validDirectorDocument({ timing_method: 'word-estimated-timing' });
  assert.throws(() => validateDirectorMethod(timing), (error) => error instanceof DirectorMethodError && error.code === 'invalid_timing_method');

  const finalOut = validDirectorDocument({ final_output: 'video-spec-hf.md' });
  assert.throws(() => validateDirectorMethod(finalOut), (error) => error instanceof DirectorMethodError && error.code === 'invalid_final_output');
});

test('rejects legacy call-proof fields from the public contract', () => {
  const legacy = validDirectorDocument({ invocation_evidence: { status: 'verified' } });
  assert.throws(() => validateDirectorMethod(legacy), (error) => error instanceof DirectorMethodError && error.code === 'invalid_document');
});

test('rejects incomplete quality summary', () => {
  const badChecks = validDirectorDocument();
  badChecks.quality_audit_summary.checks = [{ name: 'intent_card', status: 'pass', note: 'partial only' }];
  assert.throws(() => validateDirectorMethod(badChecks), (error) => error instanceof DirectorMethodError && error.code === 'invalid_quality_summary');
});
