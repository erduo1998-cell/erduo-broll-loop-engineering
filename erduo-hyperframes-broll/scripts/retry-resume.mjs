import { withArtifactCache, withJsonCache } from './cache.mjs';
import { transitionStage, validateRunState } from './state.mjs';

const SHA = /^[0-9a-f]{64}$/u;
const STAGES = new Set(['preflight', 'directing', 'assets', 'build', 'render', 'verify']);
export class RetryResumeError extends Error { constructor(code, message) { super(message); this.name = 'RetryResumeError'; this.code = code; } }
const fail = (code, message) => { throw new RetryResumeError(code, message); };
function exact(value, fields) { if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) fail('invalid_job_plan', 'Retry job plan is invalid.'); }
function validatePlan(plan) {
  exact(plan, ['stage', 'input_fingerprint', 'output_fingerprint', 'max_attempts', 'jobs']);
  if (!STAGES.has(plan.stage) || !SHA.test(plan.input_fingerprint) || !SHA.test(plan.output_fingerprint) || !Number.isSafeInteger(plan.max_attempts) || plan.max_attempts < 1 || plan.max_attempts > 5 || !Array.isArray(plan.jobs) || !plan.jobs.length) fail('invalid_job_plan', 'Retry job plan is invalid.');
  const ids = new Set(); for (const job of plan.jobs) { exact(job, ['shot_id', 'namespace', 'request', 'extension']); if (typeof job.shot_id !== 'string' || !/^[A-Z][A-Z0-9_-]{0,63}$/u.test(job.shot_id) || ids.has(job.shot_id) || !['search', 'download', 'render'].includes(job.namespace) || !job.request || typeof job.request !== 'object' || Array.isArray(job.request) || (job.namespace === 'search' ? job.extension !== null : typeof job.extension !== 'string' || !/^\.[a-z0-9]{1,10}$/u.test(job.extension))) fail('invalid_job_plan', 'Retry job plan is invalid.'); ids.add(job.shot_id); }
  return plan;
}
function safeReceipt(state, plan, action, jobs = [], failure = null) { return { schema_version: 1, stage: plan.stage, action, attempt: state.stages[plan.stage].attempt, job_count: plan.jobs.length, jobs, ...(failure ? { failure } : {}) }; }
function startIfAllowed(state, plan, now) {
  const current = state.stages[plan.stage];
  if (current.status === 'complete' && current.input_fingerprint === plan.input_fingerprint && current.output_fingerprint === plan.output_fingerprint) return { state, action: 'stage_reused' };
  if (current.status === 'running') fail('stage_running', 'Retry stage is already running.');
  if (current.status === 'complete') fail('stage_input_changed', 'Completed stage requires manifest invalidation before rerun.');
  if (current.status === 'failed' && (!current.failure?.retryable || current.attempt >= plan.max_attempts)) return { state, action: 'retry_exhausted' };
  return { state: transitionStage(state, plan.stage, 'start', { input_fingerprint: plan.input_fingerprint, now }), action: current.status === 'failed' ? 'retrying' : 'starting' };
}
export async function executeRetryableStage(projectRoot, state, plan, producers, { now = () => new Date(), cacheOptions = {} } = {}) {
  validateRunState(state); validatePlan(plan); if (!producers || typeof producers !== 'object') fail('producer_unavailable', 'Retry producer is unavailable.');
  const started = startIfAllowed(state, plan, now); if (started.action === 'stage_reused' || started.action === 'retry_exhausted') return { state: started.state, receipt: safeReceipt(started.state, plan, started.action, [], started.action === 'retry_exhausted' ? { code: started.state.stages[plan.stage].failure.code, retryable: false } : null) };
  const results = [];
  try {
    for (const job of plan.jobs) {
      let result;
      if (job.namespace === 'search') { if (typeof producers.search !== 'function') fail('producer_unavailable', 'Retry producer is unavailable.'); result = await withJsonCache(projectRoot, job.request, () => producers.search(job), cacheOptions); }
      else { const producer = job.namespace === 'download' ? producers.download : producers.render; if (typeof producer !== 'function') fail('producer_unavailable', 'Retry producer is unavailable.'); result = await withArtifactCache(projectRoot, job.namespace, job.request, job.extension, (target) => producer(job, target), cacheOptions); }
      results.push({ shot_id: job.shot_id, namespace: job.namespace, cache_key: result.manifest.key, cache_hit: result.hit });
    }
  } catch (error) {
    if (error instanceof RetryResumeError) throw error;
    const next = transitionStage(started.state, plan.stage, 'fail', { code: plan.stage === 'render' ? 'render_failed' : plan.stage === 'assets' ? 'search_failed' : 'stage_failed', retryable: true, now });
    return { state: next, receipt: safeReceipt(next, plan, 'failed', results, { code: next.stages[plan.stage].failure.code, retryable: true }) };
  }
  const next = transitionStage(started.state, plan.stage, 'complete', { output_fingerprint: plan.output_fingerprint, now });
  return { state: next, receipt: safeReceipt(next, plan, started.action, results) };
}
