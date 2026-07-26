import { createHash } from 'node:crypto';
import { validateScopedBlockCreativePacket } from './validate-production-contract.mjs';

const SHA256 = /^[0-9a-f]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const BLOCK_CREATIVE_COMMISSION_MAX_BYTES = 6 * 1024;

export { BLOCK_CREATIVE_COMMISSION_MAX_BYTES };

export const BUILDER_MANDATORY_AUTHORING_PRELUDE = Object.freeze([
  'Skill(hyperframes-core)',
  'Skill(hyperframes-creative)',
  'house-style.md',
  'video-composition.md',
  'Skill(hyperframes-animation)',
  'sealed scoped block creative packet',
  'author source',
]);

const COMMISSION_SECTION_HEADINGS = Object.freeze([
  '1. Isolated assignment',
  '2. Mandatory authoring prelude',
  '3. Creative mission',
  '4. Frozen block facts',
  '5. Author freedom and prohibitions',
  '6. Private creative resolution',
  '7. Implementation and technical finish',
]);

const RAW_CONTRACT_FIELD = /(?:^|_)(?:raw_)?(?:director|assets?)_contract(?:$|_)/iu;
const FORBIDDEN_PACKET_FIELD = /(?:^|_)(?:raw_)?(?:srt|source|image|prompt|reference)(?:$|_)/iu;
const LEGACY_PACKET_FIELD = /(?:main_review|source_code_review|visual_review|contact_sheet|final_frame_review|html_preview_review)/iu;
const SELF_REPORTED_BUILDER_PRELUDE_FIELD = /(?:loaded_skills|skill_load|mandatory_prelude|creative_resolution|authoring_evidence|authoring_trace)/iu;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function fingerprint(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function assertIdentifier(value, field, code = 'claude_block_commission_invalid') {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) {
    fail(code, `${field} must be a bounded opaque identifier.`);
  }
}

function assertSha256(value, field, code = 'claude_block_commission_packet_invalid') {
  if (typeof value !== 'string' || !SHA256.test(value)) {
    fail(code, `${field} must be a SHA-256 value.`);
  }
}

/**
 * The production-contract validator proves the packet hash against actual
 * canonical artifacts, sealed predecessor and asset manifest. Dispatch never
 * treats a bare packet or a self-reported hash as sealed evidence.
 */
export function validateScopedPacketForClaudeDispatch(packet, {
  block,
  productionContract,
  artifacts,
  priorContract,
  assetManifest,
} = {}) {
  if (!isRecord(packet)) {
    fail('claude_block_commission_unsealed_packet', 'A canonical sealed scoped block creative packet is required.');
  }
  if (!isRecord(block) || !isRecord(productionContract) || !isRecord(artifacts)
    || !isRecord(priorContract) || !isRecord(assetManifest)) {
    fail('claude_block_commission_unsealed_packet', 'Commission compilation requires actual canonical binding inputs.');
  }
  const validation = validateScopedBlockCreativePacket(packet, {
    block,
    productionContract,
    artifacts,
    priorContract,
    assetManifest,
  });
  if (
    validation.block_id !== packet.block_id
    || validation.packet_sha256 !== packet.packet_sha256
    || !SHA256.test(validation.packet_sha256 ?? '')
  ) {
    fail('claude_block_commission_packet_invalid', 'Canonical packet validation returned an invalid binding.');
  }
  return validation;
}

function buildCommissionPrompt({ blockId, shotIds, packetSha256 }) {
  return [
    `# Block Creative Commission — ${blockId}`,
    '',
    '## 1. Isolated assignment',
    `Author only block ${blockId}, its declared namespace and ordered shots ${shotIds.join(', ')}. Do not alter another block, wrapper or whole-film rule.`,
    '',
    '## 2. Mandatory authoring prelude',
    `Before any source read or write, call ${BUILDER_MANDATORY_AUTHORING_PRELUDE[0]}, then ${BUILDER_MANDATORY_AUTHORING_PRELUDE[1]}; inside it read ${BUILDER_MANDATORY_AUTHORING_PRELUDE[2]} followed by ${BUILDER_MANDATORY_AUTHORING_PRELUDE[3]}; then call ${BUILDER_MANDATORY_AUTHORING_PRELUDE[4]}; then read the ${BUILDER_MANDATORY_AUTHORING_PRELUDE[5]} bound by ${packetSha256}; then ${BUILDER_MANDATORY_AUTHORING_PRELUDE[6]}.`,
    '',
    '## 3. Creative mission',
    'Realize this block’s frozen content change, attention/transition responsibility and user-design priority from the sealed packet.',
    '',
    '## 4. Frozen block facts',
    'Use only this block’s creative_directive, design, local-font, material, lifecycle, seam and time facts from the sealed packet. Do not request a whole-film director or assets contract.',
    '',
    '## 5. Author freedom and prohibitions',
    'Within the frozen facts, freely choose DOM, composition, material treatment, picture language and causal motion. Do not use F01–F09/G01–G10 as fixed templates, recreate a reference, use a generic or system font, add a remote dependency, build a centered web-page stack, repeat an adjacent shot by changing only text, or use ambient-only motion without visible causal change.',
    '',
    '## 6. Private creative resolution',
    'Before source, form one private creative_resolution per shot: primary relation, focus path, text/material relationship and visible Action→Result causality. Do not return, score or place it in a receipt.',
    '',
    '## 7. Implementation and technical finish',
    'Freeze the assigned source and run source-conformance, runtime-seek and pixel-signal in order. Return only the bounded technical receipt. A technical pass is not a creative approval.',
  ].join('\n');
}

/**
 * Compile the only allowed Builder dispatch prompt. The sealed packet itself
 * remains private; this Commission exposes just its block identity and hash.
 */
export function compileBlockCreativeCommission({
  stage = 'master-build',
  scoped_packet: scopedPacket,
  block,
  productionContract,
  artifacts,
  priorContract,
  assetManifest,
  ...extra
} = {}) {
  if (Object.keys(extra).length > 0) {
    if (Object.keys(extra).some((key) => RAW_CONTRACT_FIELD.test(key) || FORBIDDEN_PACKET_FIELD.test(key))) {
      fail('claude_block_commission_raw_contract_forbidden', 'Claude dispatch cannot compile a Commission from a raw contract.');
    }
    fail('claude_block_commission_invalid', 'Claude dispatch accepts only stage and scoped_packet.');
  }
  if (stage !== 'master-build') fail('claude_block_commission_invalid', 'Block Creative Commission is only valid for master-build.');
  const validation = validateScopedPacketForClaudeDispatch(scopedPacket, {
    block,
    productionContract,
    artifacts,
    priorContract,
    assetManifest,
  });
  const core = {
    schema_version: 1,
    artifact_kind: 'block-creative-commission',
    stage,
    block_id: validation.block_id,
    shot_ids: [...block.shot_ids],
    scoped_packet_sha256: validation.packet_sha256,
    prompt: buildCommissionPrompt({
      blockId: validation.block_id,
      shotIds: block.shot_ids,
      packetSha256: validation.packet_sha256,
    }),
  };
  const commission = { ...core, commission_sha256: fingerprint(core) };
  if (Buffer.byteLength(JSON.stringify(commission), 'utf8') > BLOCK_CREATIVE_COMMISSION_MAX_BYTES) {
    fail('claude_block_commission_oversize', 'Block Creative Commission exceeds the 6 KiB child bootstrap budget.');
  }
  return validateBlockCreativeCommission(commission);
}

export function validateBlockCreativeCommission(commission) {
  if (!isRecord(commission)) fail('claude_block_commission_invalid', 'Block Creative Commission must be an object.');
  const fields = [
    'schema_version', 'artifact_kind', 'stage', 'block_id', 'shot_ids', 'scoped_packet_sha256', 'prompt', 'commission_sha256',
  ];
  if (Object.keys(commission).length !== fields.length || fields.some((field) => !Object.hasOwn(commission, field))) {
    fail('claude_block_commission_invalid', 'Block Creative Commission shape is invalid.');
  }
  if (commission.schema_version !== 1 || commission.artifact_kind !== 'block-creative-commission' || commission.stage !== 'master-build') {
    fail('claude_block_commission_invalid', 'Block Creative Commission identity is invalid.');
  }
  assertIdentifier(commission.block_id, 'block_id');
  if (!Array.isArray(commission.shot_ids) || commission.shot_ids.length === 0 || commission.shot_ids.length > 8) {
    fail('claude_block_commission_invalid', 'Block Creative Commission shot scope is invalid.');
  }
  commission.shot_ids.forEach((shotId) => assertIdentifier(shotId, 'shot_id'));
  assertSha256(commission.scoped_packet_sha256, 'scoped_packet_sha256', 'claude_block_commission_invalid');
  if (typeof commission.prompt !== 'string') fail('claude_block_commission_invalid', 'Block Creative Commission prompt is invalid.');
  let previous = -1;
  for (const heading of COMMISSION_SECTION_HEADINGS) {
    const position = commission.prompt.indexOf(heading);
    if (position <= previous) fail('claude_block_commission_section_order_invalid', 'Block Creative Commission sections are missing or out of order.');
    previous = position;
  }
  previous = -1;
  for (const requirement of BUILDER_MANDATORY_AUTHORING_PRELUDE) {
    const position = commission.prompt.indexOf(requirement);
    if (position <= previous) fail('claude_block_commission_prelude_order_invalid', 'Builder authoring prelude is missing or out of order.');
    previous = position;
  }
  const { commission_sha256: declaredHash, ...core } = commission;
  if (!SHA256.test(declaredHash ?? '') || declaredHash !== fingerprint(core)) {
    fail('claude_block_commission_hash_mismatch', 'Block Creative Commission hash does not bind its exact content.');
  }
  if (Buffer.byteLength(JSON.stringify(commission), 'utf8') > BLOCK_CREATIVE_COMMISSION_MAX_BYTES) {
    fail('claude_block_commission_oversize', 'Block Creative Commission exceeds the 6 KiB child bootstrap budget.');
  }
  return commission;
}

export const CLAUDE_CODE_AGENT_STAGE_SKILLS = Object.freeze([
  'broll-director',
  'broll-assets',
  'broll-master-build',
  'broll-master-integrate',
  'broll-render',
  'broll-shot-export',
]);

export const CLAUDE_CODE_STAGE_TO_SKILL = Object.freeze({
  director: 'broll-director',
  assets: 'broll-assets',
  'master-build': 'broll-master-build',
  'master-integrate': 'broll-master-integrate',
  render: 'broll-render',
  'shot-export': 'broll-shot-export',
});

export class ClaudeCodeDispatchError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ClaudeCodeDispatchError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new ClaudeCodeDispatchError(code, message); };

/**
 * A Claude Code stage receipt can prove dispatch mechanics, not visual quality.
 * Non-Claude hosts keep their host-specific isolation mechanism; Claude's active
 * production stages must be a fresh Agent context with two opaque hash bindings.
 */
export function validateClaudeCodeExecutionIsolation(stage, executionIsolation) {
  if (!Object.hasOwn(CLAUDE_CODE_STAGE_TO_SKILL, stage)) return true;
  if (!executionIsolation || typeof executionIsolation !== 'object' || Array.isArray(executionIsolation)) {
    fail('claude_dispatch_evidence_missing', 'Claude Code stage dispatch evidence is required.');
  }
  if (
    stage === 'master-build'
    && Object.keys(executionIsolation).some((field) => SELF_REPORTED_BUILDER_PRELUDE_FIELD.test(field))
  ) {
    fail('claude_builder_skill_self_report_forbidden', 'Builder Skill loading is proven only by the Claude Code host trace.');
  }
  if (executionIsolation.host !== 'claude-code') return true;
  if (executionIsolation.mechanism !== 'claude-agent') {
    fail('claude_inline_dispatch_forbidden', 'Claude Code production stages must use a fresh Agent context.');
  }
  if (
    !SHA256.test(executionIsolation.dispatch_evidence_sha256 ?? '')
    || !SHA256.test(executionIsolation.stage_context_sha256 ?? '')
  ) {
    fail('claude_dispatch_evidence_missing', 'Claude Code stage dispatch evidence is incomplete.');
  }
  return true;
}
