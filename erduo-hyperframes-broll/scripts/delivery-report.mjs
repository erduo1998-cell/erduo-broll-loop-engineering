import { fingerprintValue } from './state.mjs';

const ROUTES = new Set(['user-media', 'image-generation', 'pexels', 'hyperframes-native']);
const GATES = new Set(['input-time', 'shot-design', 'asset-integrity', 'code-contract', 'hyperframes-official-authoring', 'hyperframes-check', 'delivery-media', 'srt-coverage', 'typography-hierarchy', 'ambient-background', 'pexels-capability', 'main-agent-shot-review', 'main-agent-asset-review', 'main-agent-preview-review', 'main-agent-final-review']);
const LIMITATIONS = new Set(['pexels-api-unverified', 'windows-unverified', 'jianying-desktop-unverified']);
export class DeliveryReportError extends Error { constructor(code, message) { super(message); this.name = 'DeliveryReportError'; this.code = code; } }
const fail = (code, message) => { throw new DeliveryReportError(code, message); };
function exact(value, fields) { if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail('invalid_delivery', 'Delivery summary is invalid.'); }
function publicPath(value) { return typeof value === 'string' && /^(?!.*(?:^|[\\/])\.\.(?:[\\/]|$))(?!.*(?:api[_-]?key|token|secret|cookie|password))/iu.test(value) && value.length > 0 && value.length <= 512; }
export function validateDeliverySummary(value) {
  exact(value, ['schema_version', 'master', 'shots', 'routes', 'passed_gates', 'limitations']);
  exact(value.master, ['path', 'duration_ms']);
  if (value.schema_version !== 2 || !publicPath(value.master.path) || !Number.isSafeInteger(value.master.duration_ms) || value.master.duration_ms <= 0 || (value.shots !== null && (!value.shots || typeof value.shots !== 'object' || !publicPath(value.shots.directory) || !Number.isSafeInteger(value.shots.count) || value.shots.count < 1)) || !Array.isArray(value.routes) || !value.routes.length || !Array.isArray(value.passed_gates) || !Array.isArray(value.limitations)) fail('invalid_delivery', 'Delivery summary is invalid.');
  for (const values of [value.routes, value.passed_gates, value.limitations]) if (new Set(values).size !== values.length || values.some((item) => typeof item !== 'string')) fail('invalid_delivery', 'Delivery summary is invalid.');
  if (value.routes.some((item) => !ROUTES.has(item)) || value.passed_gates.some((item) => !GATES.has(item)) || value.limitations.some((item) => !LIMITATIONS.has(item))) fail('invalid_delivery', 'Delivery summary is invalid.');
  if (!GATES.size || value.passed_gates.length !== GATES.size || [...GATES].some((item) => !value.passed_gates.includes(item))) fail('verification_incomplete', 'Delivery verification is incomplete.');
  return value;
}
function durationText(ms) { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
const routeText = { 'user-media': '用户素材', 'image-generation': '生图', pexels: 'Pexels', 'hyperframes-native': 'HyperFrames 原生图形' };
const limitationText = { 'pexels-api-unverified': 'Pexels 真实 API 未在本次环境配置 Key 验证。', 'windows-unverified': 'Windows 尚未实机验证。', 'jianying-desktop-unverified': '剪映专业版桌面端尚未实机导入验证。' };
export function buildDeliveryReport(summary) {
  validateDeliverySummary(summary); const routes = [...summary.routes].sort(); const gates = [...summary.passed_gates].sort(); const limitations = [...summary.limitations].sort();
  const core = { schema_version: 2, master_path: summary.master.path, shots_directory: summary.shots?.directory ?? null, shot_count: summary.shots?.count ?? null, duration_ms: summary.master.duration_ms, routes, passed_gates: gates, limitations };
  const shotsLine = summary.shots ? `逐镜素材：${core.shots_directory}（${core.shot_count} 镜）` : '逐镜素材：尚未导出；如需可从已验证 master 按分镜切分。';
  const text = [`已完成候选 B-roll 交付。`, `Master：${core.master_path}`, shotsLine, `总时长：${durationText(core.duration_ms)}`, `素材路线：${routes.map((item) => routeText[item]).join('、')}`, `已通过：${gates.join('、')}`, ...(limitations.length ? [`真实限制：${limitations.map((item) => limitationText[item]).join(' ')}`] : [])].join('\n');
  return { ...core, report_sha256: fingerprintValue(core), text };
}
