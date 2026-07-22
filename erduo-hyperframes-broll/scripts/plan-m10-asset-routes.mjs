import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA256 = /^[0-9a-f]{64}$/u;
const SHOT_ID = /^S\d{3}$/u;
const ROUTE_POLICY = ['user-media', 'image-generation', 'pexels', 'hyperframes-native'];
const ROUTES = new Set(ROUTE_POLICY);
const ROUTE_PRIORITY = new Map(ROUTE_POLICY.map((route, index) => [route, index]));
const MATERIAL_ROLES = new Set([
  'background-hero',
  'explanatory-media',
  'generated-illustration',
  'local-component',
  'text-quote',
  'chart-diagram',
  'native-support',
  'speaker-still',
]);
const EXIT_INVALID = 2;
const EXIT_READ = 3;
const EXIT_USAGE = 64;

export class M10AssetRouteError extends Error {
  constructor(code, message, shot, role) {
    super(message);
    this.name = 'M10AssetRouteError';
    this.code = code;
    if (shot !== undefined) this.shot = shot;
    if (role !== undefined) this.role = role;
  }
}

function fail(code, message, shot, role) {
  throw new M10AssetRouteError(code, message, shot, role);
}

function exact(value, fields, code, message, shot, role) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...fields].sort())) {
    fail(code, message, shot, role);
  }
}

function required(value, fields, code, message, shot, role) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code, message, shot, role);
  for (const field of fields) if (!(field in value)) fail(code, message, shot, role);
}

function nonEmptyText(value, code, message, shot, role, max = 260) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(value)) fail(code, message, shot, role);
  return value.trim();
}

function routePriority(route) {
  return ROUTE_PRIORITY.get(route) ?? Number.MAX_SAFE_INTEGER;
}

function fingerprintValue(value) {
  const visit = (item) => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return item;
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item)) fail('invalid_hash_value', 'Hash input contains an unsupported numeric value.');
      return item;
    }
    if (!item || typeof item !== 'object') fail('invalid_hash_value', 'Hash input contains unsupported value.');
    if (Array.isArray(item)) return item.map(visit);
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, visit(item[key])]));
  };
  return createHash('sha256').update(JSON.stringify(visit(value)), 'utf8').digest('hex');
}

function normalizeCapability(value, shot, role) {
  if (typeof value === 'boolean') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) return value.available === true;
  fail('invalid_capabilities', 'Asset capability profile contains invalid values.', shot, role);
}

function validateCapabilities(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) fail('invalid_capabilities', 'Asset capability input is invalid.');
  const keys = ['user_media', 'pexels', 'image_generation', 'hyperframes_native'];
  for (const key of keys) {
    if (!(key in document)) fail('invalid_capabilities', `Capability key "${key}" is missing.`);
  }
  return {
    user_media: normalizeCapability(document.user_media),
    pexels: normalizeCapability(document.pexels),
    image_generation: normalizeCapability(document.image_generation),
    hyperframes_native: normalizeCapability(document.hyperframes_native),
  };
}

function validateVisualContract(document) {
  required(document, ['schema_version', 'plan_sha256', 'frame_fusion_sha256', 'director_summary_sha256', 'shot_count', 'shots', 'visual_contract_sha256'], 'invalid_visual_contract', 'Visual contract shape is invalid.');
  if (document.schema_version !== 1 || !SHA256.test(document.plan_sha256) || !SHA256.test(document.visual_contract_sha256)
    || !SHA256.test(document.frame_fusion_sha256) || !SHA256.test(document.director_summary_sha256)
    || !Number.isSafeInteger(document.shot_count) || document.shot_count < 1
    || !Array.isArray(document.shots) || document.shot_count !== document.shots.length) {
    fail('invalid_visual_contract', 'Validated visual contract is invalid.');
  }

  const shotIds = new Set();
  for (let index = 0; index < document.shots.length; index += 1) {
    const shotId = `S${String(index + 1).padStart(3, '0')}`;
    const shot = document.shots[index];
    required(shot, ['shot_id', 'material_roles', 'duration_ms', 'visual_grammar', 'compositing'], 'invalid_shot_contract', 'Visual-contract shot shape is invalid.', shotId);
    if (shot.shot_id !== shotId || !SHOT_ID.test(shot.shot_id) || shotIds.has(shot.shot_id)) fail('invalid_shot_contract', 'Visual-contract shot IDs are invalid.', shotId);
    shotIds.add(shot.shot_id);
    if (!Number.isSafeInteger(shot.duration_ms) || shot.duration_ms <= 0) fail('invalid_shot_contract', 'Shot duration is invalid.', shotId);
    required(shot.visual_grammar, ['family'], 'invalid_shot_contract', 'Shot visual grammar is invalid.', shotId);
    required(shot.compositing, ['mode'], 'invalid_shot_contract', 'Shot compositing is invalid.', shotId);
    if (!Array.isArray(shot.material_roles) || !shot.material_roles.length) fail('missing_material_roles', 'Shot has no material roles.', shotId);

    const seenRoles = new Set();
    for (const role of shot.material_roles) {
      exact(role, ['role', 'route_order', 'purpose', 'fallback_limit'], 'invalid_material_role', 'Material role shape is invalid.', shotId);
      const roleName = nonEmptyText(role.role, 'invalid_material_role', 'Material role is invalid.', shotId);
      if (!MATERIAL_ROLES.has(roleName) || seenRoles.has(roleName)) fail('invalid_material_role', 'Material role is invalid.', shotId);
      seenRoles.add(roleName);
      role.route_order = validateRouteOrder(role.route_order, shotId, roleName);
      nonEmptyText(role.purpose, 'invalid_material_role', 'Material purpose is invalid.', shotId);
      nonEmptyText(role.fallback_limit, 'invalid_material_role', 'Material fallback limit is invalid.', shotId);
    }
  }
}

function validateRouteOrder(routeOrder, shotId, roleName) {
  if (!Array.isArray(routeOrder) || !routeOrder.length || routeOrder.length > ROUTE_POLICY.length) fail('invalid_route_order', 'Material route order is invalid.', shotId, roleName);
  let previousPriority = -1;
  const seen = new Set();
  const normalized = [];
  for (const route of routeOrder) {
    if (typeof route !== 'string' || !ROUTES.has(route)) fail('invalid_route_order', 'Material route order contains unsupported route.', shotId, roleName);
    const priority = routePriority(route);
    if (priority < previousPriority || seen.has(route)) fail('invalid_route_order', 'Material route order must be strictly ordered and unique.', shotId, roleName);
    seen.add(route);
    previousPriority = priority;
    normalized.push(route);
  }
  return normalized;
}

function routeIsAvailable(route, capabilities) {
  if (route === 'user-media') return capabilities.user_media;
  if (route === 'pexels') return capabilities.pexels;
  if (route === 'image-generation') return capabilities.image_generation;
  return capabilities.hyperframes_native;
}

function pickRoleRoute(shotId, roleName, role, capabilities) {
  const skipped = [];
  let selected = null;
  for (const route of role.route_order) {
    if (routeIsAvailable(route, capabilities)) {
      selected = route;
      break;
    }
    skipped.push(route);
  }

  if (!selected) fail('route_capability_gap', 'No available route can satisfy this material role.', shotId, roleName);

  return {
    role: roleName,
    route_order: role.route_order,
    selected_route: selected,
    route_order_skipped: skipped,
    reason: selected === role.route_order[0] ? 'preferred-route' : 'fallback-route',
  };
}

function pickShotPrimaryRoute(shotsByRole) {
  if (!shotsByRole.length) fail('missing_material_roles', 'Shot has no material roles.');
  return shotsByRole.slice().sort((left, right) => routePriority(left.selected_route) - routePriority(right.selected_route))[0];
}

export function planM10AssetRoutes(visualContract, options = {}) {
  validateVisualContract(visualContract);
  const capabilities = validateCapabilities(options.capabilities ?? options);

  const routes = visualContract.shots.map((shot, index) => {
    const shotId = `S${String(index + 1).padStart(3, '0')}`;
    if (shot.shot_id !== shotId) fail('invalid_shot_contract', 'Shot ID mismatch.');

    const decisions = shot.material_roles.map((role) => pickRoleRoute(shotId, role.role, role, capabilities));
    const primary = pickShotPrimaryRoute(decisions);

    return {
      shot_id: shotId,
      duration_ms: shot.duration_ms,
      primary_route: primary.selected_route,
      primary_role: primary.role,
      visual_grammar_family: shot.visual_grammar.family,
      compositing_mode: shot.compositing.mode,
      route_plan: decisions,
      route_plan_sha256: fingerprintValue({ shot_id: shotId, decisions }),
    };
  });

  if (!routes.length) fail('empty_plan', 'No shots were planned.');
  if (routes.every((shot) => shot.primary_route === 'hyperframes-native')) fail('native_default', 'A whole film cannot use hyperframes-native as every primary route.');

  for (const [index, shot] of routes.entries()) {
    if (shot.shot_id !== `S${String(index + 1).padStart(3, '0')}`) fail('invalid_shot_plan', 'Shot plan is not ordered.');
    if (!Number.isSafeInteger(shot.duration_ms) || shot.duration_ms <= 0) fail('invalid_shot_plan', 'Shot duration is invalid.', shot.shot_id);
    if (!ROUTES.has(shot.primary_route) || typeof shot.primary_role !== 'string' || !shot.primary_role.trim()) fail('invalid_shot_plan', 'Shot primary route is invalid.', shot.shot_id);
  }

  const core = {
    schema_version: 1,
    visual_contract_sha256: visualContract.visual_contract_sha256,
    shot_count: routes.length,
    plan_sha256: visualContract.plan_sha256,
    route_policy: ROUTE_POLICY,
    capability_profile: {
      user_media_available: capabilities.user_media,
      pexels_available: capabilities.pexels,
      image_generation_available: capabilities.image_generation,
      hyperframes_native_available: capabilities.hyperframes_native,
    },
    routes,
  };
  return { ...core, route_plan_sha256: fingerprintValue(core) };
}

export function parseRouteArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const prettyCount = argv.filter((value) => value === '--pretty').length;
  const unknown = argv.filter((value) => value.startsWith('-') && value !== '--pretty');
  const positional = argv.filter((value) => !value.startsWith('-'));
  if (unknown.length || prettyCount > 1 || positional.length !== 2 || argv.length !== positional.length + prettyCount) return { error: true };
  return { visualContract: positional[0], capabilities: positional[1], pretty: prettyCount === 1 };
}

export async function runRoutePlannerCli(argv, adapters = {}) {
  const stdout = adapters.stdout ?? process.stdout;
  const stderr = adapters.stderr ?? process.stderr;
  const readFile = adapters.readFile ?? fs.readFile;
  const args = parseRouteArgs(argv);

  if (args.help) {
    stdout.write('Usage: node scripts/plan-m10-asset-routes.mjs <validated-visual-contract.json> <asset-capabilities.json> [--pretty]\n');
    return 0;
  }
  if (args.error) {
    stderr.write('plan-m10-asset-routes: invalid arguments (use --help)\n');
    return EXIT_USAGE;
  }

  try {
    const [contractText, capabilityText] = await Promise.all([
      readFile(args.visualContract, 'utf8'),
      readFile(args.capabilities, 'utf8'),
    ]);
    const visualContract = JSON.parse(contractText);
    const capabilities = JSON.parse(capabilityText);
    stdout.write(`${JSON.stringify(planM10AssetRoutes(visualContract, { capabilities }), null, args.pretty ? 2 : 0)}\n`);
    return 0;
  } catch (error) {
    if (error instanceof M10AssetRouteError) {
      stderr.write(`${JSON.stringify({ ok: false, error: { code: error.code, message: error.message, ...(error.shot ? { shot_id: error.shot } : {}), ...(error.role ? { role: error.role } : {}) } })}\n`);
      return EXIT_INVALID;
    }
    stderr.write(`${JSON.stringify({ ok: false, error: { code: 'read_failed', message: 'Route planning inputs could not be read.' } })}\n`);
    return EXIT_READ;
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  process.exit(await runRoutePlannerCli(process.argv.slice(2)));
}
