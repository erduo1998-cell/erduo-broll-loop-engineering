#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMITS = Object.freeze({
  'block-receipt': 16 * 1024,
  'stage-envelope': 32 * 1024,
  'final-summary': 64 * 1024,
  'block-creative-commission': 6 * 1024,
  'scoped-block-creative-packet': 24 * 1024,
});
const CHILD_BOOTSTRAP_KINDS = new Set([
  'block-creative-commission',
  'scoped-block-creative-packet',
]);
const BLOCK_ID = /^B[0-9]{3}$/u;
const SHOT_ID = /^S[0-9]{3}$/u;
export const SCRIPT_ONLY_CONTEXT_POLICY = Object.freeze({
  block_receipt_max_bytes: LIMITS['block-receipt'],
  stage_envelope_max_bytes: LIMITS['stage-envelope'],
  final_summary_max_bytes: LIMITS['final-summary'],
  inline_source_allowed: false,
  inline_image_allowed: false,
  inline_log_allowed: false,
  contact_sheet_allowed: false,
  subjective_quality_fields_allowed: false,
});
const POLICY_FIELDS = [
  'block_receipt_max_bytes',
  'stage_envelope_max_bytes',
  'final_summary_max_bytes',
  'inline_source_allowed',
  'inline_image_allowed',
  'inline_log_allowed',
  'contact_sheet_allowed',
  'subjective_quality_fields_allowed',
];
const POLICY_LIMIT_FIELD = Object.freeze({
  'block-receipt': 'block_receipt_max_bytes',
  'stage-envelope': 'stage_envelope_max_bytes',
  'final-summary': 'final_summary_max_bytes',
});
const INLINE_SOURCE_KEYS = new Set([
  'css',
  'css_source',
  'html',
  'html_source',
  'inline_source',
  'javascript',
  'javascript_source',
  'js_source',
  'source_bytes',
  'source_code',
]);
const INLINE_SOURCE_CONTENT_KEYS = /(?:^|_)(?:css|html|javascript|js|source)(?:$|_(?:bytes|code|content|payload|text)(?:_|$))/u;
const INLINE_IMAGE_KEYS = /(?:^|_)(?:contact_frame|frame_image|frame_png|image_data|image_url|screenshot|thumbnail)(?:_|$)/u;
const CONTACT_SHEET_KEYS = /(?:^|_)contact_sheet(?:_|$)/u;
const INLINE_LOG_KEYS = /(?:^|_)(?:full_log|log|logs|stderr|stdout|stack_trace|trace)(?:_|$)/u;
const SUBJECTIVE_KEYS = /(?:^|_)(?:aesthetic|beautiful|composition_quality|premium|style_approved|subjective_quality|visual_quality|visual_score|visual_verdict)(?:_|$)/u;
const CONCLUSION_KEYS = /(?:^|_)(?:(?:gold|golden|calibration)(?:$|_(?:approval|approved|conclusion|decision|grade|label|quality|result|score|status|verdict)(?:_|$))|visual_(?:approval|approved|conclusion|decision|grade|label|result|status|verdict)(?:_|$)|reference_path(?:$|_(?:approval|approved|conclusion|decision|result|status|verdict)(?:_|$)))/u;
const PRIVATE_EVIDENCE_KEYS = /(?:^|_)(?:prompt|private_(?:evidence|artifact|reference|calibration)(?:_payload)?|(?:evidence|artifact|reference|calibration)_payload)(?:_|$)/u;
const INLINE_SOURCE_VALUE = /<(?:html|script|style|svg)\b|(?:^|\n)\s*(?:export|import)\s+(?:const|function|\{)/iu;
const INLINE_IMAGE_VALUE = /^data:image\//iu;
const REMOTE_MEDIA_URL_VALUE = /\bhttps?:\/\/[^\s<>"']+\.(?:aac|apng|avi|avif|bmp|flac|gif|ico|jpe?g|m4a|m4v|mkv|mov|mp3|mp4|ogg|png|svg|wav|webm|webp)(?:[?#][^\s<>"']*)?(?=$|[\s)\]},;])/iu;
const LOCAL_FILE_URL_VALUE = /\bfile:\/\//iu;
const POSIX_PRIVATE_PATH_VALUE = /(?:^|[\s("'`=:;,{\[])\/(?:(?:Users|home)\/[^/\s]+|private|var\/folders|tmp)(?:\/|$)/iu;
const WINDOWS_USER_PATH_VALUE = /(?:^|[\s("'`=])[a-z]:[\\/]+Users[\\/]+[^\\/\s]+(?:[\\/]|$)/iu;
const UNC_PATH_VALUE = /(?:^|[\s("'`=])\\\\[^\\\s]+\\[^\\\s]+/u;
const INLINE_LOG_VALUE = /(?:^|\n)\s*(?:stderr|stdout|stack(?:\s+trace)?|traceback(?:\s+\(most recent call last\))?)\s*:|(?:^|\n)\s+at\s+(?:async\s+)?[A-Za-z_$][A-Za-z0-9_$]*(?:\s+\([^)\n]+:\d+:\d+\)|\s+file:\/\/[^\n]+)/iu;
const PROMPT_VALUE = /\bprompt\b/iu;
const PRIVATE_EVIDENCE_VALUE = /\b(?:private\s+(?:evidence|artifact|reference|calibration)(?:\s+payload)?|(?:evidence|artifact|reference|calibration)\s+private\s+payload|private\s+payload)\b|私有(?:证据|制品|素材|参考|校准|载荷|内容)/iu;
const REACHSURGE_VALUE = /\breachsurge\b/iu;
const GOLD_OR_CALIBRATION_VALUE = /\b(?:gold(?:en)?|calibration)\b|金样|黄金样本|校准/iu;
const SUBJECTIVE_VERDICT_VALUE = /\b(?:(?:subjective|visual|aesthetic|composition|style)\s+(?:quality\s+)?(?:approval|approved|conclusion|decision|grade|result|score|status|verdict)|(?:premium|beautiful)\s+(?:quality|result|verdict|visuals?)|(?:approval|approved|passed|verdict)\s+(?:premium|beautiful))\b|(?:主观|视觉|画面|构图|风格|审美|美学).{0,24}(?:结论|判断|评分|评级|批准|通过|高级|漂亮|精致|美观)|(?:高级|漂亮|精致|美观).{0,24}(?:结论|判断|批准|通过)/iu;
const TECHNICAL_LABEL_VALUE = /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/u;
const NEGATIVE_CODE_VALUE = /(?:^|[-_])(?:error|exceeded|failed|failure|forbidden|invalid|mismatch|missing|not_found|not_loaded|out_of_bounds|skipped|unavailable|unsupported|unverified|violation|warning)(?:[-_]|$)/u;
const TECHNICAL_CODE_KEYS = /(?:^|_)(?:error|failure|limitation|warning)_codes?$/u;
const OPAQUE_ID_KEYS = /(?:^|_)(?:id|ids)$/u;
const CHILD_BOOTSTRAP_FORBIDDEN_KEYS = /(?:^|_)(?:raw|director(?:_contract|_artifact)|assets?(?:_contract|_artifact)|parsed_srt|srt(?:_bytes|_text|_content)?|source(?:_bytes|_code|_content|_html|_css|_js)?|html(?:_source|_bytes)?|css(?:_source|_bytes)?|javascript(?:_source|_bytes)?|js(?:_source|_bytes)?|image(?:_bytes|_url|_data)?|screenshot|prompt|reference)(?:_|$)/u;
const CHILD_BOOTSTRAP_CROSS_BLOCK_KEYS = /(?:^|_)(?:other|all|cross|full_film|film_wide)(?:_)?blocks?(?:_|$)|(?:^|_)other_shots?(?:_|$)/u;

export class ContextBudgetError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ContextBudgetError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new ContextBudgetError(code, message);
};

function canonical(value, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('context_value_invalid', 'Context packet contains a non-finite number.');
    return Number.isSafeInteger(value) ? value : Number(value.toFixed(6));
  }
  if (!value || typeof value !== 'object' || seen.has(value)) {
    fail('context_value_invalid', 'Context packet contains an unsupported or cyclic value.');
  }
  seen.add(value);
  const result = Array.isArray(value)
    ? value.map((item) => canonical(item, seen))
    : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key], seen)]));
  seen.delete(value);
  return result;
}

function validatePolicy(policy) {
  if (
    !policy
    || typeof policy !== 'object'
    || Array.isArray(policy)
    || JSON.stringify(Object.keys(policy).sort()) !== JSON.stringify([...POLICY_FIELDS].sort())
    || policy.block_receipt_max_bytes !== LIMITS['block-receipt']
    || policy.stage_envelope_max_bytes !== LIMITS['stage-envelope']
    || policy.final_summary_max_bytes !== LIMITS['final-summary']
    || policy.inline_source_allowed !== false
    || policy.inline_image_allowed !== false
    || policy.inline_log_allowed !== false
    || policy.contact_sheet_allowed !== false
    || policy.subjective_quality_fields_allowed !== false
  ) {
    fail('context_budget_policy_invalid', 'Context policy must match the frozen script-only v3 limits.');
  }
}

function permitsSensitiveTechnicalLabel(value, key) {
  if (/^[0-9a-f]{64}$/u.test(value)) return true;
  if (!TECHNICAL_LABEL_VALUE.test(value)) return false;
  if (OPAQUE_ID_KEYS.test(key)) return true;
  return TECHNICAL_CODE_KEYS.test(key) && NEGATIVE_CODE_VALUE.test(value);
}

function permitsPrivateTechnicalCode(value, key) {
  return /^[0-9a-f]{64}$/u.test(value)
    || (
      TECHNICAL_LABEL_VALUE.test(value)
      && TECHNICAL_CODE_KEYS.test(key)
      && NEGATIVE_CODE_VALUE.test(value)
    );
}

function inspectForbiddenEvidence(value, seen = new Set(), parentKey = '', {
  allowCreativeDirective = false,
} = {}) {
  if (typeof value === 'string') {
    const semanticValue = value.replace(/[-_]+/gu, ' ');
    const creativeDirectiveValue = allowCreativeDirective && parentKey === 'primary_visual_decision';
    if (INLINE_IMAGE_VALUE.test(value)) fail('inline_image_forbidden', 'Inline image data is forbidden.');
    if (REMOTE_MEDIA_URL_VALUE.test(value)) {
      fail('inline_media_forbidden', 'Remote image and media URLs cannot enter a parent packet.');
    }
    if (
      LOCAL_FILE_URL_VALUE.test(value)
      || POSIX_PRIVATE_PATH_VALUE.test(value)
      || WINDOWS_USER_PATH_VALUE.test(value)
      || UNC_PATH_VALUE.test(value)
    ) fail('private_path_forbidden', 'Private absolute paths cannot enter a parent packet.');
    if (INLINE_SOURCE_VALUE.test(value)) {
      fail('inline_source_forbidden', 'Inline source cannot enter a parent packet.');
    }
    if (INLINE_LOG_VALUE.test(value)) fail('inline_log_forbidden', 'Inline logs cannot enter a parent packet.');
    if (
      (PROMPT_VALUE.test(semanticValue) || PRIVATE_EVIDENCE_VALUE.test(semanticValue))
      && !permitsPrivateTechnicalCode(value, parentKey)
    ) {
      fail('private_evidence_forbidden', 'Prompt and private evidence payloads cannot enter a parent packet.');
    }
    if (!creativeDirectiveValue && (
      REACHSURGE_VALUE.test(semanticValue)
      || SUBJECTIVE_VERDICT_VALUE.test(semanticValue)
      || (
        GOLD_OR_CALIBRATION_VALUE.test(semanticValue)
        && !permitsSensitiveTechnicalLabel(value, parentKey)
      )
    )) {
      fail('subjective_quality_field_forbidden', 'Subjective calibration conclusions are forbidden.');
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) fail('context_value_invalid', 'Context packet contains a cycle.');
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) inspectForbiddenEvidence(item, seen, parentKey, { allowCreativeDirective });
    seen.delete(value);
    return;
  }
  for (const [rawKey, item] of Object.entries(value)) {
    const key = rawKey
      .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
      .replace(/[^A-Za-z0-9]+/gu, '_')
      .replace(/^_+|_+$/gu, '')
      .toLowerCase();
    const hashBinding = key.endsWith('_sha256')
      && typeof item === 'string'
      && /^[0-9a-f]{64}$/u.test(item);
    if (PRIVATE_EVIDENCE_KEYS.test(key)) {
      fail('private_evidence_forbidden', 'Prompt and private evidence payload fields are forbidden.');
    }
    if (!hashBinding && CONTACT_SHEET_KEYS.test(key)) {
      fail('contact_sheet_forbidden', 'Contact sheets cannot enter a parent packet.');
    }
    if (!hashBinding && (INLINE_SOURCE_KEYS.has(key) || INLINE_SOURCE_CONTENT_KEYS.test(key))) {
      fail('inline_source_forbidden', 'Inline source cannot enter a parent packet.');
    }
    if (!hashBinding && INLINE_IMAGE_KEYS.test(key)) {
      fail('inline_image_forbidden', 'Inline images cannot enter a parent packet.');
    }
    if (!hashBinding && INLINE_LOG_KEYS.test(key)) {
      fail('inline_log_forbidden', 'Inline logs cannot enter a parent packet.');
    }
    if ((SUBJECTIVE_KEYS.test(key) || CONCLUSION_KEYS.test(key))
      && !(allowCreativeDirective && key === 'primary_visual_decision')) {
      fail('subjective_quality_field_forbidden', 'Subjective quality fields are forbidden.');
    }
    inspectForbiddenEvidence(item, seen, key, { allowCreativeDirective });
  }
  seen.delete(value);
}

function normalizedKey(rawKey) {
  return rawKey
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replace(/[^A-Za-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
    .toLowerCase();
}

function assertScopedShotIds(value, rootShotIds) {
  if (!Array.isArray(value) || value.length < 1) {
    fail('child_bootstrap_cross_block_fact', 'Scoped block facts must be an ordered non-empty shot list.');
  }
  const seen = new Set();
  const rootShotIdList = [...rootShotIds];
  for (const [index, fact] of value.entries()) {
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)
      || !SHOT_ID.test(fact.shot_id ?? '')
      || !rootShotIds.has(fact.shot_id)
      || seen.has(fact.shot_id)
      || fact.shot_id !== rootShotIdList[index]) {
      fail('child_bootstrap_cross_block_fact', 'Scoped block facts can only contain this block’s ordered shots.');
    }
    seen.add(fact.shot_id);
  }
}

function inspectChildBootstrapBoundaries(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !BLOCK_ID.test(value.block_id ?? '')
    || !Array.isArray(value.shot_ids)
    || value.shot_ids.length < 1
    || value.shot_ids.length > 8
    || value.shot_ids.some((shotId) => !SHOT_ID.test(shotId))) {
    fail('child_bootstrap_binding_invalid', 'Child bootstrap packet needs one bounded block and ordered shot IDs.');
  }
  const rootShotIds = new Set(value.shot_ids);
  if (rootShotIds.size !== value.shot_ids.length) {
    fail('child_bootstrap_binding_invalid', 'Child bootstrap shot IDs must be unique.');
  }
  const inspect = (item, seen = new Set(), parentKey = '', nested = false) => {
    if (item === null || typeof item !== 'object') return;
    if (seen.has(item)) fail('context_value_invalid', 'Context packet contains a cycle.');
    seen.add(item);
    if (Array.isArray(item)) {
      for (const child of item) inspect(child, seen, parentKey, true);
      seen.delete(item);
      return;
    }
    for (const [rawKey, child] of Object.entries(item)) {
      const key = normalizedKey(rawKey);
      if (CHILD_BOOTSTRAP_FORBIDDEN_KEYS.test(key)) {
        fail('child_bootstrap_forbidden_content', `Child bootstrap packet cannot contain ${rawKey}.`);
      }
      if (CHILD_BOOTSTRAP_CROSS_BLOCK_KEYS.test(key)) {
        fail('child_bootstrap_cross_block_fact', `Child bootstrap packet cannot re-enter ${rawKey}.`);
      }
      if (nested && key === 'block_id' && child !== value.block_id) {
        fail('child_bootstrap_cross_block_fact', 'Nested block facts must bind the dispatched block.');
      }
      if (nested && key === 'shot_id' && (!SHOT_ID.test(child ?? '') || !rootShotIds.has(child))) {
        fail('child_bootstrap_cross_block_fact', 'Nested shot facts must bind a dispatched shot.');
      }
      if (nested && key === 'shot_ids') {
        if (!Array.isArray(child) || child.some((shotId) => !rootShotIds.has(shotId))) {
          fail('child_bootstrap_cross_block_fact', 'Nested shot lists must not contain another block’s facts.');
        }
      }
      if (key === 'scoped_shots') assertScopedShotIds(child, rootShotIds);
      inspect(child, seen, key, true);
    }
    seen.delete(item);
  };
  inspect(value);
}

export function validateContextBudget(value, { kind, policy } = {}) {
  if (!Object.hasOwn(LIMITS, kind)) {
    fail('context_budget_kind_invalid', 'Context packet kind is invalid.');
  }
  validatePolicy(policy);
  inspectForbiddenEvidence(value, new Set(), '', {
    allowCreativeDirective: CHILD_BOOTSTRAP_KINDS.has(kind),
  });
  if (CHILD_BOOTSTRAP_KINDS.has(kind)) inspectChildBootstrapBoundaries(value);
  const sizeBytes = Buffer.byteLength(JSON.stringify(canonical(value)), 'utf8');
  const maxBytes = POLICY_LIMIT_FIELD[kind]
    ? policy[POLICY_LIMIT_FIELD[kind]] : LIMITS[kind];
  if (sizeBytes > maxBytes) {
    fail('context_budget_exceeded', `Context packet exceeds ${maxBytes} bytes.`);
  }
  return {
    status: 'passed',
    kind,
    size_bytes: sizeBytes,
    max_bytes: maxBytes,
  };
}

function usage() {
  return 'Usage: node validate-context-budget.mjs <packet.json> --kind <block-receipt|stage-envelope|final-summary|block-creative-commission|scoped-block-creative-packet> --policy <validation-policy.json>';
}

async function main(argv) {
  if (argv.includes('--help')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const [packetPath, kindFlag, kind, policyFlag, policyPath] = argv;
  if (!packetPath || kindFlag !== '--kind' || !kind || policyFlag !== '--policy' || !policyPath || argv.length !== 5) {
    fail('usage', usage());
  }
  const [packet, policyDocument] = await Promise.all([
    readFile(path.resolve(packetPath), 'utf8').then(JSON.parse),
    readFile(path.resolve(policyPath), 'utf8').then(JSON.parse),
  ]);
  process.stdout.write(`${JSON.stringify(validateContextBudget(packet, {
    kind,
    policy: policyDocument.context_budget,
  }))}\n`);
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(path.resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isMain) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    const known = error instanceof ContextBudgetError;
    process.stderr.write(`${JSON.stringify({
      status: 'failed',
      code: known ? error.code : 'context_budget_failed',
      message: known ? error.message : 'Context budget validation failed.',
    })}\n`);
    process.exitCode = known && error.code === 'usage' ? 64 : 2;
  }
}
