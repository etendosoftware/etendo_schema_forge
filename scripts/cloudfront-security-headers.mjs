#!/usr/bin/env node
// Idempotent CloudFront Response Headers Policy automation (ETP-4573, ADR-0002).
//
// Ensures the versioned policy `etendo-go-security-headers-v1` exists and
// matches infra/cloudfront-response-headers/<name>.json, then attaches it to the
// default behavior and EVERY cache behavior of a distribution using the
// get-distribution-config -> ETag -> update-distribution --if-match procedure.
//
// Usage:
//   node scripts/cloudfront-security-headers.mjs apply    --distribution <id> [--snapshot-dir dir] [--dry-run]
//   node scripts/cloudfront-security-headers.mjs verify   --distribution <id>
//   node scripts/cloudfront-security-headers.mjs rollback --distribution <id> --snapshot <file>
//
// No CORS and no CSP here: CSP belongs to ETP-4572/ETP-4574. An ETag conflict
// fails the run (re-run to re-read); it is never retried blindly.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const POLICY_NAME = 'etendo-go-security-headers-v1';
const POLICY_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', 'infra', 'cloudfront-response-headers', `${POLICY_NAME}.json`,
);

export function loadDesiredPolicy(file = POLICY_FILE) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

const canonical = (v) => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v).sort().filter((k) => v[k] !== undefined && v[k] !== null).map((k) => [k, canonical(v[k])]),
    );
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

const behaviors = (config) => [
  { label: 'default', behavior: config.DefaultCacheBehavior },
  ...(config.CacheBehaviors?.Items ?? []).map((b) => ({ label: b.PathPattern, behavior: b })),
];

export function attachPolicy(config, policyId) {
  const next = structuredClone(config);
  let changed = false;
  for (const { behavior } of behaviors(next)) {
    if (behavior.ResponseHeadersPolicyId !== policyId) {
      behavior.ResponseHeadersPolicyId = policyId;
      changed = true;
    }
  }
  return { config: next, changed };
}

export function verifyDistribution(config, policyId) {
  const missing = behaviors(config)
    .filter(({ behavior }) => behavior.ResponseHeadersPolicyId !== policyId)
    .map(({ label }) => label);
  return { ok: missing.length === 0, missing };
}

function ensurePolicy(aws, desired, dryRun) {
  const list = aws(['cloudfront', 'list-response-headers-policies', '--type', 'custom']);
  const existing = (list.ResponseHeadersPolicyList?.Items ?? []).map((i) => i.ResponseHeadersPolicy);
  const plan = planPolicy(existing, desired);
  if (plan.action === 'noop' || dryRun) return plan;
  if (plan.action === 'create') {
    const r = aws(['cloudfront', 'create-response-headers-policy'], desired);
    return { action: 'create', id: r.ResponseHeadersPolicy.Id };
  }
  const cur = aws(['cloudfront', 'get-response-headers-policy', '--id', plan.id]);
  aws(['cloudfront', 'update-response-headers-policy', '--id', plan.id, '--if-match', cur.ETag], desired);
  return plan;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

export function applyEnvironment({ aws, distributionId, snapshotDir, desired = loadDesiredPolicy(), dryRun = false }) {
  const policy = ensurePolicy(aws, desired, dryRun);
  const got = aws(['cloudfront', 'get-distribution-config', '--id', distributionId]);
  mkdirSync(snapshotDir, { recursive: true });
  const snapshotFile = join(snapshotDir, `${distributionId}-${stamp()}.json`);
  writeFileSync(snapshotFile, JSON.stringify({ DistributionId: distributionId, ETag: got.ETag, DistributionConfig: got.DistributionConfig }, null, 2));

  if (!policy.id) return { policy, updated: false, snapshotFile }; // dry-run before create
  const { config, changed } = attachPolicy(got.DistributionConfig, policy.id);
  if (!changed || dryRun) return { policy, updated: false, snapshotFile };

  aws(['cloudfront', 'update-distribution', '--id', distributionId, '--if-match', got.ETag], config);
  const check = verifyDistribution(aws(['cloudfront', 'get-distribution-config', '--id', distributionId]).DistributionConfig, policy.id);
  if (!check.ok) throw new Error(`policy missing on behaviors: ${check.missing.join(', ')}`);
  return { policy, updated: true, snapshotFile };
}

export function rollbackEnvironment({ aws, distributionId, snapshotFile }) {
  const snap = JSON.parse(readFileSync(snapshotFile, 'utf8'));
  if (snap.DistributionId !== distributionId) {
    throw new Error(`snapshot is for distribution ${snap.DistributionId}, not ${distributionId}`);
  }
  const cur = aws(['cloudfront', 'get-distribution-config', '--id', distributionId]);
  aws(['cloudfront', 'update-distribution', '--id', distributionId, '--if-match', cur.ETag], snap.DistributionConfig);
}

// Real AWS CLI runner. `body` is passed through a temp file (file://).
const BODY_FLAG = {
  'create-response-headers-policy': '--response-headers-policy-config',
  'update-response-headers-policy': '--response-headers-policy-config',
  'update-distribution': '--distribution-config',
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

function main(argv) {
  const [cmd, ...rest] = argv;
  const opt = (n) => { const i = rest.indexOf(`--${n}`); return i < 0 ? undefined : rest[i + 1]; };
  const distributionId = opt('distribution');
  if (!['apply', 'verify', 'rollback'].includes(cmd) || !distributionId) {
    console.error('usage: cloudfront-security-headers.mjs apply|verify|rollback --distribution <id> [--snapshot-dir d] [--snapshot f] [--dry-run]');
    process.exit(2);
  }
  if (cmd === 'apply') {
    const r = applyEnvironment({ aws: cliAws, distributionId, snapshotDir: resolve(opt('snapshot-dir') ?? 'cf-snapshots'), dryRun: rest.includes('--dry-run') });
    console.log(JSON.stringify(r));
  } else if (cmd === 'verify') {
    const list = cliAws(['cloudfront', 'list-response-headers-policies', '--type', 'custom']);
    const p = (list.ResponseHeadersPolicyList?.Items ?? []).map((i) => i.ResponseHeadersPolicy)
      .find((x) => x.ResponseHeadersPolicyConfig?.Name === POLICY_NAME);
    if (!p) throw new Error(`policy ${POLICY_NAME} not found`);
    const v = verifyDistribution(cliAws(['cloudfront', 'get-distribution-config', '--id', distributionId]).DistributionConfig, p.Id);
    console.log(JSON.stringify(v));
    if (!v.ok) process.exit(1);
  } else {
    const snapshotFile = opt('snapshot');
    if (!snapshotFile) { console.error('--snapshot required'); process.exit(2); }
    rollbackEnvironment({ aws: cliAws, distributionId, snapshotFile: resolve(snapshotFile) });
    console.log('rolled back');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(e.message); process.exit(1); }
}
