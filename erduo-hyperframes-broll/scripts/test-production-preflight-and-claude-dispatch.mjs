import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BUILDER_MANDATORY_AUTHORING_PRELUDE,
  CLAUDE_CODE_AGENT_STAGE_SKILLS,
  ClaudeCodeDispatchError,
  compileBlockCreativeCommission,
  validateBlockCreativeCommission,
  validateClaudeCodeExecutionIsolation,
  validateScopedPacketForClaudeDispatch,
} from './claude-code-dispatch.mjs';
import {
  PREFLIGHT_RECEIPT_MAX_BYTES,
  ProductionPreflightError,
  fingerprintPreflightValue,
  hashFileSha256,
  runProductionPreflight,
  validatePreflightReceipt,
} from './production-preflight.mjs';
import { validateExecutionIsolation } from './stage-receipt.mjs';

const H = (character) => character.repeat(64);

function scopedBlockCreativePacket() {
  return {
    schema_version: 1,
    artifact_kind: 'scoped-block-creative-packet',
    pipeline_contract_version: 3,
    authoring_topology_id: 'script-only-authoring-cluster-v1',
    block_id: 'B001',
    shot_ids: ['S001', 'S002'],
    production_contract_sha256: H('a'),
    shot_plan_sha256: H('b'),
    design_system_sha256: H('c'),
    font_package_sha256: H('d'),
    asset_manifest_sha256: H('e'),
    block_time_window: { start_ms: 0, end_ms: 2000 },
    adjacent_seams: { previous_shot_id: null, next_shot_id: 'S003' },
    scoped_shots: [
      { shot_id: 'S001', creative_directive: {} },
      { shot_id: 'S002', creative_directive: {} },
    ],
    packet_sha256: H('f'),
  };
}

function canonicalInputsForPacketRejection() {
  return {
    block: { block_id: 'B001', shot_ids: ['S001', 'S002'] },
    productionContract: {},
    artifacts: {},
    priorContract: {},
    assetManifest: {},
  };
}

async function fixture(t, { mode = 'faceless' } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'broll-production-preflight-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const briefPath = path.join(root, 'brief.json');
  const srtPath = path.join(root, 'input.srt');
  const mediaPath = path.join(root, 'talking-head.mp4');
  await writeFile(briefPath, '{"confirmed":true}\n');
  await writeFile(srtPath, '1\n00:00:00,000 --> 00:00:01,000\n测试。\n');
  await writeFile(mediaPath, 'fixture-media');
  const inputs = [{ role: 'srt', path: srtPath, sha256: await hashFileSha256(srtPath) }];
  if (mode === 'talking-head') {
    inputs.push({ role: 'talking-head-media', path: mediaPath, sha256: await hashFileSha256(mediaPath) });
  }
  return {
    root,
    paths: { briefPath, srtPath, mediaPath },
    manifest: {
      schema_version: 1,
      run_id: 'claude-fixture',
      host: 'claude-code',
      mode,
      confirmed_brief: {
        status: 'confirmed',
        artifact: { path: briefPath, sha256: await hashFileSha256(briefPath) },
        user_confirmation_sha256: H('c'),
      },
      input_artifacts: inputs,
      pexels_required: false,
      isolated_stage_contexts: true,
    },
  };
}

function adapters(overrides = {}) {
  return {
    skillRoot: '/private/source-skill',
    hostSkillRoot: '/private/active-host-skills',
    runtimeProbe: async () => ({ shell: true, hyperframes: true }),
    pexelsStatus: async () => ({ configured: true, source: 'environment' }),
    hostSkillValidator: async () => ({ status: 'approved', mismatches: [] }),
    skillTreeFingerprint: async () => H('f'),
    ...overrides,
  };
}

test('production preflight verifies private artifacts but returns one small hash-only receipt', async (t) => {
  const value = await fixture(t, { mode: 'talking-head' });
  const receipt = await runProductionPreflight({ manifest: value.manifest, ...adapters() });
  assert.equal(receipt.status, 'passed');
  assert.equal(receipt.confirmed_brief_sha256, value.manifest.confirmed_brief.artifact.sha256);
  assert.equal(receipt.skill_tree_sha256, H('f'));
  assert.deepEqual(receipt.input_hashes.map((item) => item.role), ['srt', 'talking-head-media']);
  assert.ok(Buffer.byteLength(JSON.stringify(receipt), 'utf8') <= PREFLIGHT_RECEIPT_MAX_BYTES);
  assert.doesNotMatch(JSON.stringify(receipt), new RegExp(value.root.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  assert.equal(validatePreflightReceipt(receipt), receipt);
});

test('production preflight returns short blocker codes for missing inputs, stale bytes and mixed Skill sources', async (t) => {
  const value = await fixture(t);
  const missingSrt = { ...value.manifest, input_artifacts: [] };
  const missingResult = await runProductionPreflight({ manifest: missingSrt, ...adapters() });
  assert.equal(missingResult.status, 'blocked');
  assert.deepEqual(missingResult.blocker_codes, ['srt_required']);

  const stale = structuredClone(value.manifest);
  stale.input_artifacts[0].sha256 = H('0');
  const staleResult = await runProductionPreflight({ manifest: stale, ...adapters() });
  assert.equal(staleResult.status, 'blocked');
  assert.deepEqual(staleResult.blocker_codes, ['input_artifact_unavailable']);

  const mixedSource = await runProductionPreflight({
    manifest: value.manifest,
    ...adapters({ hostSkillValidator: async () => ({ status: 'revision_required', mismatches: ['broll-render'] }) }),
  });
  assert.equal(mixedSource.status, 'blocked');
  assert.deepEqual(mixedSource.blocker_codes, ['source_skill_mismatch']);
});

test('production preflight blocks missing talking-head media, runtime/Pexels capability and sensitive manifest payloads without leaking them', async (t) => {
  const value = await fixture(t, { mode: 'talking-head' });
  const noMedia = { ...value.manifest, input_artifacts: value.manifest.input_artifacts.filter((item) => item.role !== 'talking-head-media') };
  const noMediaResult = await runProductionPreflight({ manifest: noMedia, ...adapters() });
  assert.equal(noMediaResult.status, 'blocked');
  assert.deepEqual(noMediaResult.blocker_codes, ['talking_head_media_required']);

  const capabilityResult = await runProductionPreflight({
    manifest: { ...value.manifest, pexels_required: true, isolated_stage_contexts: false },
    ...adapters({
      runtimeProbe: async () => ({ shell: true, hyperframes: false }),
      pexelsStatus: async () => ({ configured: false, source: 'none' }),
    }),
  });
  assert.equal(capabilityResult.status, 'blocked');
  assert.deepEqual(capabilityResult.blocker_codes, [
    'isolated_stage_context_required',
    'pexels_configuration_required',
    'runtime_capability_unavailable',
  ]);

  const sensitive = { ...value.manifest, api_key: 'never-return-this-value' };
  const sensitiveResult = await runProductionPreflight({ manifest: sensitive, ...adapters() });
  assert.equal(sensitiveResult.status, 'blocked');
  assert.deepEqual(sensitiveResult.blocker_codes, ['preflight_manifest_invalid']);
  assert.doesNotMatch(JSON.stringify(sensitiveResult), /never-return-this-value/u);
});

test('preflight receipt validator rejects oversize, path and private-field attempts before parent delivery', async (t) => {
  const value = await fixture(t);
  const receipt = await runProductionPreflight({ manifest: value.manifest, ...adapters() });
  const makeReceipt = (core) => ({ ...core, receipt_sha256: fingerprintPreflightValue(core) });

  const oversized = makeReceipt({ ...receipt, blocker_codes: ['safe'.repeat(PREFLIGHT_RECEIPT_MAX_BYTES)] });
  assert.throws(
    () => validatePreflightReceipt(oversized),
    (error) => error instanceof ProductionPreflightError && error.code === 'preflight_receipt_oversize',
  );
  const pathLeak = makeReceipt({ ...receipt, blocker_codes: ['/private/run/raw.srt'] });
  assert.throws(
    () => validatePreflightReceipt(pathLeak),
    (error) => error instanceof ProductionPreflightError && error.code === 'preflight_receipt_unsafe',
  );
  const secretField = { ...receipt, api_key: 'not-allowed' };
  assert.throws(
    () => validatePreflightReceipt(secretField),
    (error) => error instanceof ProductionPreflightError && error.code === 'preflight_receipt_invalid',
  );
});

test('Claude Code production stages require fresh Agent evidence and reject inline or incomplete execution isolation', () => {
  assert.deepEqual(CLAUDE_CODE_AGENT_STAGE_SKILLS, [
    'broll-director',
    'broll-assets',
    'broll-master-build',
    'broll-master-integrate',
    'broll-render',
    'broll-shot-export',
  ]);
  const valid = {
    host: 'claude-code',
    mechanism: 'claude-agent',
    dispatch_evidence_sha256: H('a'),
    stage_context_sha256: H('b'),
  };
  assert.doesNotThrow(() => validateClaudeCodeExecutionIsolation('director', valid));
  assert.doesNotThrow(() => validateExecutionIsolation(valid, 'director'));
  assert.throws(
    () => validateClaudeCodeExecutionIsolation('assets', { ...valid, mechanism: 'inline-skill' }),
    (error) => error instanceof ClaudeCodeDispatchError && error.code === 'claude_inline_dispatch_forbidden',
  );
  assert.throws(
    () => validateExecutionIsolation({ ...valid, mechanism: 'inline-skill' }, 'master-build'),
    (error) => error?.code === 'claude_inline_dispatch_forbidden',
  );
  assert.throws(
    () => validateClaudeCodeExecutionIsolation('render', { ...valid, dispatch_evidence_sha256: 'missing' }),
    (error) => error instanceof ClaudeCodeDispatchError && error.code === 'claude_dispatch_evidence_missing',
  );
  assert.throws(
    () => validateClaudeCodeExecutionIsolation('master-build', { ...valid, loaded_skills: ['hyperframes-core'] }),
    (error) => error instanceof ClaudeCodeDispatchError && error.code === 'claude_builder_skill_self_report_forbidden',
  );
});

test('Claude dispatch rejects a bare scoped packet before it can become a Block Creative Commission', () => {
  const packet = scopedBlockCreativePacket();
  assert.throws(
    () => compileBlockCreativeCommission({ scoped_packet: packet }),
    (error) => error instanceof ClaudeCodeDispatchError && error.code === 'claude_block_commission_unsealed_packet',
  );
});

test('Claude dispatch runs canonical packet validation before any Commission compilation', () => {
  const missingPacketHash = scopedBlockCreativePacket();
  delete missingPacketHash.packet_sha256;
  assert.throws(
    () => validateScopedPacketForClaudeDispatch(missingPacketHash, canonicalInputsForPacketRejection()),
    (error) => error?.code === 'scoped_block_packet_invalid',
  );

  const tamperedHash = scopedBlockCreativePacket();
  tamperedHash.packet_sha256 = H('0');
  assert.throws(
    () => validateScopedPacketForClaudeDispatch(tamperedHash, canonicalInputsForPacketRejection()),
    (error) => error?.code === 'scoped_block_packet_hash_mismatch',
  );
});

test('Claude dispatch rejects prelude order tampering, raw-contract replay and legacy review fields', () => {
  const commission = {
    schema_version: 1,
    artifact_kind: 'block-creative-commission',
    stage: 'master-build',
    block_id: 'B001',
    shot_ids: ['S001'],
    scoped_packet_sha256: H('f'),
    prompt: '## 1. Isolated assignment\n## 2. Mandatory authoring prelude\nSkill(hyperframes-core) Skill(hyperframes-creative) video-composition.md house-style.md Skill(hyperframes-animation) sealed scoped block creative packet author source\n## 3. Creative mission\n## 4. Frozen block facts\n## 5. Author freedom and prohibitions\n## 6. Private creative resolution\n## 7. Implementation and technical finish',
    commission_sha256: H('0'),
  };
  assert.throws(
    () => validateBlockCreativeCommission(commission),
    (error) => error instanceof ClaudeCodeDispatchError && error.code === 'claude_block_commission_prelude_order_invalid',
  );

  assert.throws(
    () => compileBlockCreativeCommission({
      scoped_packet: scopedBlockCreativePacket(),
      raw_director_contract: { giant: 'never replay a whole contract' },
    }),
    (error) => error instanceof ClaudeCodeDispatchError && error.code === 'claude_block_commission_raw_contract_forbidden',
  );

  const rawPacket = scopedBlockCreativePacket();
  rawPacket.raw_assets_contract = { giant: 'never replay a whole contract' };
  assert.throws(
    () => validateScopedPacketForClaudeDispatch(rawPacket, canonicalInputsForPacketRejection()),
    (error) => error?.code === 'scoped_block_packet_forbidden_content',
  );

  const legacyPacket = scopedBlockCreativePacket();
  legacyPacket.main_review_refs = ['legacy-is-not-production-input'];
  assert.throws(
    () => validateScopedPacketForClaudeDispatch(legacyPacket, canonicalInputsForPacketRejection()),
    (error) => error?.code === 'legacy_field_forbidden',
  );
});

test('all Claude-facing contracts name every fresh Agent stage and contain no legacy production review rule', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const [skill, workflow, orchestration, dispatch] = await Promise.all([
    readFile(path.join(root, 'SKILL.md'), 'utf8'),
    readFile(path.join(root, 'references', 'workflow.md'), 'utf8'),
    readFile(path.join(root, 'references', 'stage-orchestration.md'), 'utf8'),
    readFile(path.join(root, 'references', 'claude-code-dispatch-contract.md'), 'utf8'),
  ]);
  for (const source of [skill, workflow, orchestration, dispatch]) {
    assert.match(source, /Agent\(subagent_type: "general-purpose"\)/u);
    for (const stage of CLAUDE_CODE_AGENT_STAGE_SKILLS) assert.match(source, new RegExp(stage, 'u'));
  }
  assert.match(dispatch, /execution_isolation/u);
  assert.match(dispatch, /claude-agent/u);
  assert.doesNotMatch(dispatch, /source_code_review|main_review|contact[ _-]?sheet|visual[ _-]?review/iu);

  const stageSources = await Promise.all(CLAUDE_CODE_AGENT_STAGE_SKILLS.map(async (skillName) => {
    const contents = await readFile(path.join(root, 'stages', skillName, 'SKILL.md'), 'utf8');
    let metadata = '';
    try {
      metadata = await readFile(path.join(root, 'stages', skillName, 'agents', 'openai.yaml'), 'utf8');
    } catch {
      // Layout validation owns whether a stage needs metadata; this test scans it when present.
    }
    return `${contents}\n${metadata}`;
  }));
  const templateAgentRules = await readFile(path.join(root, 'assets', 'hyperframes-template', 'AGENTS.md'), 'utf8');
  for (const source of [...stageSources, templateAgentRules]) {
    assert.doesNotMatch(source, /source_code_review|main_review|contact[ _-]?sheet|visual[ _-]?review/iu);
  }
});

test('Builder dispatch text makes the creative prelude mandatory without introducing a style verdict', async () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const [dispatch, builder, metadata] = await Promise.all([
    readFile(path.join(root, 'references', 'claude-code-dispatch-contract.md'), 'utf8'),
    readFile(path.join(root, 'stages', 'broll-master-build', 'SKILL.md'), 'utf8'),
    readFile(path.join(root, 'stages', 'broll-master-build', 'agents', 'openai.yaml'), 'utf8'),
  ]);
  for (const source of [dispatch, builder, metadata]) {
    let previous = -1;
    for (const requirement of BUILDER_MANDATORY_AUTHORING_PRELUDE.slice(0, 5)) {
      const position = source.indexOf(requirement);
      assert.ok(position > previous, `${requirement} must be ordered in Builder dispatch text`);
      previous = position;
    }
    assert.doesNotMatch(source, /if relevant|按需|自行选择/iu);
    assert.doesNotMatch(source, /visual[ _-]?review|main_review|contact[ _-]?sheet/iu);
  }
  assert.match(dispatch, /host tool trace is the only evidence/iu);
  assert.match(builder, /never\s+claim Skill loading in a receipt/iu);
});
