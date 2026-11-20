#!/usr/bin/env node
// Idempotent CloudFront Response Headers Policy automation (ETP-4573, ADR-0002).
//
// A Response Headers Policy is account-global: changing its contents changes every
// distribution that uses it at once. So the lifecycle is split in two:
//   policy   creates/updates etendo-go-security-headers-v1 from
//            infra/cloudfront-response-headers/<name>.json. Refuses to run unless
//            GITHUB_ENVIRONMENT=production-cloudfront (reviewed environment).
//   apply    attach-only, per distribution: sets the policy id on the default behavior
//            and EVERY cache behavior (get-distribution-config -> ETag ->
//            update-distribution --if-match). Never writes the policy; fails on drift.
//   verify   read-only; exits non-zero listing behaviors without the policy.
//   rollback restores only ResponseHeadersPolicyId per behavior from a snapshot.
//
// Usage:
//   node scripts/cloudfront-security-headers.mjs policy   [--dry-run]
//   node scripts/cloudfront-security-headers.mjs apply    --distribution <id> [--policy name] [--paths default,/assets/*] [--snapshot-dir dir] [--dry-run] [--replace-existing]
//   node scripts/cloudfront-security-headers.mjs verify   --distribution <id>
//   node scripts/cloudfront-security-headers.mjs rollback --distribution <id> (--snapshot <file> | --snapshot-dir <dir>)
//
// --policy picks another policy file (default v1); --paths limits apply/verify to those behaviors
// ('default' or path patterns). v2 policies (ETP-4574) enforce CSP; the connect-src origins come
// from CSP_CONNECT_ORIGINS and fail closed. No CORS. An ETag conflict fails the
// run (re-run to re-read); it is never retried blindly.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const POLICY_NAME = 'etendo-go-security-headers-v1';
export const PROTECTED_ENVIRONMENT = 'production-cloudfront';
const POLICY_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', 'infra', 'cloudfront-response-headers', `${POLICY_NAME}.json`,
);
const UPDATE_DISTRIBUTION = 'update-distribution';
const PLACEHOLDER_ID = '<policy-id-after-policy-step>';
const EDGE_RESPONSE_EVENTS = new Set(['viewer-response', 'origin-response']);

// One place for the service name and the operations used, so call sites stay readable.
const cf = (aws, op, args = [], body) => aws(['cloudfront', op, ...args], body);
const listPolicies = (aws) =>
  (cf(aws, 'list-response-headers-policies', ['--type', 'custom']).ResponseHeadersPolicyList?.Items ?? [])
    .map((i) => i.ResponseHeadersPolicy);
const IF_MATCH = '--if-match';
const getDistributionConfig = (aws, id) => cf(aws, 'get-distribution-config', ['--id', id]);
const updateDistribution = (aws, id, etag, config) =>
  cf(aws, UPDATE_DISTRIBUTION, ['--id', id, IF_MATCH, etag], config);

export function loadDesiredPolicy(file = POLICY_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

const POLICY_DIR = dirname(POLICY_FILE);
const POLICY_NAME_RE = /^[a-z0-9-]+$/;
const CSP_PLACEHOLDER = '{{CSP_CONNECT_ORIGINS}}';
const HTTPS_ORIGIN = /^https:\/\/[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:\d{1,5})?$/;

// Deployment-specific connect-src origins (e.g. the Sentry/GlitchTip host). Fails closed: a
// missing or non-https-origin value throws instead of producing a looser or broken CSP.
export function connectOrigins(env = process.env) {
  const origins = (env.CSP_CONNECT_ORIGINS ?? '').split(/[\s,]+/).filter(Boolean);
  const bad = origins.find((o) => !HTTPS_ORIGIN.test(o));
  if (origins.length === 0 || bad) {
    throw new Error(`CSP_CONNECT_ORIGINS must list https origins${bad ? ` (invalid origin: ${bad})` : ''}`);
  }
  return origins;
}

// Loads infra/cloudfront-response-headers/<name>.json, rendering the CSP placeholder if present.
export function loadPolicyByName(name, env = process.env) {
  if (!POLICY_NAME_RE.test(name)) throw new Error(`invalid policy name: ${name}`);
  let text = readFileSync(join(POLICY_DIR, `${name}.json`), 'utf8');
  if (text.includes(CSP_PLACEHOLDER)) text = text.replaceAll(CSP_PLACEHOLDER, connectOrigins(env).join(' '));
  return JSON.parse(text);
}

// Sorted keys; drops undefined/null and empty or defaulted sections (e.g. `{ Quantity: 0 }`,
// `{ Enabled: false }`) that CloudFront returns, so an unchanged policy never looks drifted.
const isEmpty = (v) =>
  v === undefined || v === null || v === false ||
  (Array.isArray(v) && v.length === 0) ||
  (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0);
const canonical = (v) => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      const c = canonical(v[k]);
      if (!isEmpty(c) && !(c && typeof c === 'object' && Object.keys(c).every((x) => x === 'Quantity') && c.Quantity === 0)) {
        out[k] = c;
      }
    }
    return out;
  }
  return v;
};
const sameConfig = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

export function planPolicy(existing, desired) {
  const matches = existing.filter((p) => p.ResponseHeadersPolicyConfig?.Name === desired.Name);
  if (matches.length > 1) throw new Error(`duplicate policies named ${desired.Name}: ${matches.map((m) => m.Id).join(', ')}`);
  if (matches.length === 0) return { action: 'create' };
  const [m] = matches;
  return sameConfig(m.ResponseHeadersPolicyConfig, desired)
    ? { action: 'noop', id: m.Id }
    : { action: 'update', id: m.Id };
}

export function policyEnvironment({ aws, desired = loadDesiredPolicy(), dryRun = false, env = process.env }) {
  if (env.GITHUB_ENVIRONMENT !== PROTECTED_ENVIRONMENT) {
    throw new Error(`policy changes are account-global and only run in the ${PROTECTED_ENVIRONMENT} environment`);
  }
  const plan = planPolicy(listPolicies(aws), desired);
  if (plan.action === 'noop' || dryRun) return plan;
  if (plan.action === 'create') {
    return { action: 'create', id: cf(aws, 'create-response-headers-policy', [], desired).ResponseHeadersPolicy.Id };
  }
  const { ETag } = cf(aws, 'get-response-headers-policy', ['--id', plan.id]);
  cf(aws, 'update-response-headers-policy', ['--id', plan.id, IF_MATCH, ETag], desired);
  return plan;
}

const behaviors = (config) => [
  { label: 'default', behavior: config.DefaultCacheBehavior },
  ...(config.CacheBehaviors?.Items ?? []).map((b) => ({ label: b.PathPattern, behavior: b })),
];

const hasEdgeResponseHook = (b) =>
  [...(b.FunctionAssociations?.Items ?? []), ...(b.LambdaFunctionAssociations?.Items ?? [])]
    .some((a) => EDGE_RESPONSE_EVENTS.has(a.EventType));

// `paths` limits the operation to those behaviors ('default' or a path pattern); unknown ones throw.
const selectBehaviors = (config, paths) => {
  const all = behaviors(config);
  if (!paths?.length) return all;
  const unknown = paths.filter((p) => !all.some(({ label }) => label === p));
  if (unknown.length > 0) throw new Error(`not behaviors of this distribution: ${unknown.join(', ')}`);
  return all.filter(({ label }) => paths.includes(label));
};

export function attachPolicy(config, policyId, { replaceExisting = false, paths } = {}) {
  const next = structuredClone(config);
  const attach = [];
  const conflicts = [];
  const edgeHooks = [];
  for (const { label, behavior } of selectBehaviors(next, paths)) {
    const current = behavior.ResponseHeadersPolicyId;
    if (hasEdgeResponseHook(behavior)) edgeHooks.push(label);
    if (current === policyId) continue;
    if (current && !replaceExisting) {
      conflicts.push({ label, current });
      continue;
    }
    behavior.ResponseHeadersPolicyId = policyId;
    attach.push(label);
  }
  return { config: next, changed: attach.length > 0, attach, conflicts, edgeHooks };
}

export function verifyDistribution(config, policyId, { paths } = {}) {
  const missing = selectBehaviors(config, paths)
    .filter(({ behavior }) => behavior.ResponseHeadersPolicyId !== policyId)
    .map(({ label }) => label);
  return { ok: missing.length === 0, missing };
}

function findPolicy(aws, desired) {
  const existing = listPolicies(aws);
  const plan = planPolicy(existing, desired);
  return { plan, found: plan.action !== 'create' };
}

export function verifyEnvironment({ aws, distributionId, desired = loadDesiredPolicy(), paths }) {
  const { plan, found } = findPolicy(aws, desired);
  if (!found) throw new Error(`policy ${desired.Name} not found`);
  const v = verifyDistribution(getDistributionConfig(aws, distributionId).DistributionConfig, plan.id, { paths });
  const drift = plan.action === 'update';
  return { ...v, ok: v.ok && !drift, drift, policyId: plan.id };
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export function applyEnvironment({
  aws, distributionId, snapshotDir, desired = loadDesiredPolicy(), dryRun = false, replaceExisting = false, paths,
}) {
  const { plan: found, found: exists } = findPolicy(aws, desired);
  if (!exists && !dryRun) throw new Error(`policy ${desired.Name} not found: run the policy step first`);
  if (found.action === 'update') {
    throw new Error(`policy ${desired.Name} drift: stored content differs from the repo JSON; run the policy step first`);
  }
  const policy = exists ? { action: 'noop', id: found.id } : { action: 'missing' };

  const got = getDistributionConfig(aws, distributionId);
  const { config, changed, attach, conflicts, edgeHooks } =
    attachPolicy(got.DistributionConfig, policy.id ?? PLACEHOLDER_ID, { replaceExisting, paths });
  const report = { attach, conflicts, edgeHooks };

  mkdirSync(snapshotDir, { recursive: true });
  const snapshotFile = join(snapshotDir, `${distributionId}-${stamp()}.json`);
  writeFileSync(snapshotFile, JSON.stringify({
    DistributionId: distributionId, ETag: got.ETag, Report: report, DistributionConfig: got.DistributionConfig,
  }, null, 2));

  const result = { policy, plan: report, updated: false, snapshotFile };
  if (dryRun || !changed && conflicts.length === 0) return result;
  if (conflicts.length > 0) {
    throw new Error(`behaviors already use another policy (pass --replace-existing): ${conflicts.map((c) => `${c.label}=${c.current}`).join(', ')}`);
  }

  updateDistribution(aws, distributionId, got.ETag, config);
  const check = verifyDistribution(getDistributionConfig(aws, distributionId).DistributionConfig, policy.id, { paths });
  if (!check.ok) throw new Error(`policy missing on behaviors: ${check.missing.join(', ')}`);
  return { ...result, updated: true };
}

function resolveSnapshot({ snapshotFile, snapshotDir, distributionId }) {
  if (snapshotFile) return snapshotFile;
  const files = existsSync(snapshotDir ?? '')
    ? readdirSync(snapshotDir).filter((f) => f.startsWith(`${distributionId}-`) && f.endsWith('.json'))
    : [];
  if (files.length !== 1) throw new Error(`expected exactly one snapshot for ${distributionId} in ${snapshotDir}, found ${files.length}`);
  return join(snapshotDir, files[0]);
}

// Restores only ResponseHeadersPolicyId per behavior; anything else changed since the snapshot stays.
export function rollbackEnvironment({ aws, distributionId, snapshotFile, snapshotDir }) {
  const snap = JSON.parse(readFileSync(resolveSnapshot({ snapshotFile, snapshotDir, distributionId }), 'utf8'));
  if (snap.DistributionId !== distributionId) {
    throw new Error(`snapshot is for distribution ${snap.DistributionId}, not ${distributionId}`);
  }
  const cur = getDistributionConfig(aws, distributionId);
  const saved = new Map(behaviors(snap.DistributionConfig).map(({ label, behavior }) => [label, behavior]));
  const live = behaviors(cur.DistributionConfig);
  const same = saved.size === live.length && live.every(({ label }) => saved.has(label));
  if (!same) {
    throw new Error(`behavior set changed since the snapshot (snapshot: ${[...saved.keys()].join(', ')}; now: ${live.map((l) => l.label).join(', ')})`);
  }
  let changed = false;
  for (const { label, behavior } of live) {
    const before = saved.get(label).ResponseHeadersPolicyId;
    if (behavior.ResponseHeadersPolicyId === before) continue;
    if (before === undefined) delete behavior.ResponseHeadersPolicyId;
    else behavior.ResponseHeadersPolicyId = before;
    changed = true;
  }
  if (changed) updateDistribution(aws, distributionId, cur.ETag, cur.DistributionConfig);
  return { restored: changed };
}

// Real AWS CLI runner. `body` is passed through a temp file (file://).
const BODY_FLAG = {
  'create-response-headers-policy': '--response-headers-policy-config',
  'update-response-headers-policy': '--response-headers-policy-config',
  [UPDATE_DISTRIBUTION]: '--distribution-config',
};
export function cliAws(args, body) {
  const dir = mkdtempSync(join(tmpdir(), 'cf-'));
  try {
    const full = [...args];
    if (body !== undefined) {
      const f = join(dir, 'body.json');
      writeFileSync(f, JSON.stringify(body));
      full.push(BODY_FLAG[args[1]], `file://${f}`);
    }
    const out = execFileSync('aws', [...full, '--output', 'json'], { encoding: 'utf8' });
    return out.trim() ? JSON.parse(out) : {};
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const USAGE = 'usage: cloudfront-security-headers.mjs policy|apply|verify|rollback [--distribution <id>] [--policy name] [--paths a,b] [--snapshot-dir d] [--snapshot f] [--dry-run] [--replace-existing]';

function main(argv) {
  const [cmd, ...rest] = argv;
  const opt = (n) => { const i = rest.indexOf(`--${n}`); return i < 0 ? undefined : rest[i + 1]; };
  const distributionId = opt('distribution');
  const dryRun = rest.includes('--dry-run');
  const policyName = opt('policy');
  const desired = policyName ? loadPolicyByName(policyName) : loadDesiredPolicy();
  const paths = opt('paths')?.split(',').filter(Boolean);
  if (!['policy', 'apply', 'verify', 'rollback'].includes(cmd) || (cmd !== 'policy' && !distributionId)) {
    console.error(USAGE);
    process.exit(2);
  }
  if (cmd === 'policy') {
    console.log(JSON.stringify(policyEnvironment({ aws: cliAws, desired, dryRun })));
  } else if (cmd === 'apply') {
    const snapshotDir = resolve(opt('snapshot-dir') ?? 'cf-snapshots');
    console.log(JSON.stringify(applyEnvironment({ aws: cliAws, distributionId, snapshotDir, desired, paths, dryRun, replaceExisting: rest.includes('--replace-existing') })));
  } else if (cmd === 'verify') {
    const v = verifyEnvironment({ aws: cliAws, distributionId, desired, paths });
    console.log(JSON.stringify(v));
    if (!v.ok) process.exit(1);
  } else {
    const file = opt('snapshot');
    const dir = opt('snapshot-dir');
    if (!file && !dir) { console.error('--snapshot or --snapshot-dir required'); process.exit(2); }
    console.log(JSON.stringify(rollbackEnvironment({
      aws: cliAws, distributionId, snapshotFile: file && resolve(file), snapshotDir: dir && resolve(dir),
    })));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
}
