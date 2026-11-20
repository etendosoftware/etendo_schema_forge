// @covers scripts/cloudfront-security-headers.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  POLICY_NAME,
  PROTECTED_ENVIRONMENT,
  loadDesiredPolicy,
  planPolicy,
  attachPolicy,
  verifyDistribution,
  verifyEnvironment,
  policyEnvironment,
  applyEnvironment,
  rollbackEnvironment,
} from '../cloudfront-security-headers.mjs';

const desired = loadDesiredPolicy();
const PROTECTED = { GITHUB_ENVIRONMENT: PROTECTED_ENVIRONMENT };
const WRITE_POLICY = /create-response-headers-policy|update-response-headers-policy/;

const distConfig = (ids = {}, extra = {}) => ({
  CallerReference: 'x',
  DefaultCacheBehavior: { TargetOriginId: 's3', ResponseHeadersPolicyId: ids.default ?? '', ...extra.default },
  CacheBehaviors: {
    Quantity: 2,
    Items: [
      { PathPattern: '/etendo/*', TargetOriginId: 'alb', ResponseHeadersPolicyId: ids.a ?? '', ...extra.a },
      { PathPattern: '/mcp', TargetOriginId: 'alb', ResponseHeadersPolicyId: ids.b ?? '', ...extra.b },
    ],
  },
});

const storedPolicy = (config = desired, Id = 'POL1') => ({ Id, ResponseHeadersPolicyConfig: structuredClone(config) });

// In-memory fake of the aws CLI surface the script uses.
function fakeAws({ policies = [], dist = distConfig(), etag = 'E1' } = {}) {
  const state = { policies: [...policies], dist, etag, calls: [] };
  const aws = (args, body) => {
    state.calls.push(args.join(' '));
    const op = args[1];
    if (op === 'list-response-headers-policies') {
      return { ResponseHeadersPolicyList: { Items: state.policies.map((p) => ({ ResponseHeadersPolicy: p })) } };
    }
    if (op === 'create-response-headers-policy') {
      const p = storedPolicy(body, 'POL1');
      state.policies.push(p);
      return { ResponseHeadersPolicy: p, ETag: 'P1' };
    }
    if (op === 'update-response-headers-policy') {
      state.policies[0].ResponseHeadersPolicyConfig = body;
      return { ETag: 'P2' };
    }
    if (op === 'get-response-headers-policy') return { ResponseHeadersPolicy: state.policies[0], ETag: 'P1' };
    if (op === 'get-distribution-config') return { DistributionConfig: structuredClone(state.dist), ETag: state.etag };
    if (op === 'update-distribution') {
      if (args[args.indexOf('--if-match') + 1] !== state.etag) throw new Error('PreconditionFailed');
      state.dist = body;
      state.etag = `E${Number(state.etag.slice(1)) + 1}`;
      return { ETag: state.etag };
    }
    throw new Error(`unexpected ${args.join(' ')}`);
  };
  const count = (re) => state.calls.filter((c) => re.test(c)).length;
  return { aws, state, count };
}

const snapDir = () => mkdtempSync(join(tmpdir(), 'cfsnap-'));
const run = (fake, extra = {}) => applyEnvironment({ aws: fake.aws, distributionId: 'D1', snapshotDir: snapDir(), desired, ...extra });

describe('desired policy', () => {
  it('has the versioned name, keeps the live SAMEORIGIN, forbids CORS and CSP', () => {
    assert.equal(POLICY_NAME, 'etendo-go-security-headers-v1');
    assert.equal(desired.Name, POLICY_NAME);
    assert.equal(desired.CorsConfig, undefined);
    assert.equal(desired.SecurityHeadersConfig.ContentSecurityPolicy, undefined);
    assert.equal(desired.SecurityHeadersConfig.FrameOptions.FrameOption, 'SAMEORIGIN');
    assert.equal(desired.SecurityHeadersConfig.ContentTypeOptions.Override, true);
    assert.equal(desired.SecurityHeadersConfig.StrictTransportSecurity.Preload, true);
    assert.match(JSON.stringify(desired.CustomHeadersConfig ?? {}), /Permissions-Policy/);
  });
});

describe('planPolicy', () => {
  it('creates when absent, noops when equal, updates on drift', () => {
    assert.equal(planPolicy([], desired).action, 'create');
    assert.deepEqual(planPolicy([storedPolicy(desired, 'P')], desired), { action: 'noop', id: 'P' });
    const drift = structuredClone(desired);
    drift.SecurityHeadersConfig.FrameOptions.FrameOption = 'DENY';
    assert.equal(planPolicy([storedPolicy(drift)], desired).action, 'update');
  });
  it('refuses duplicates by name', () => {
    assert.throws(() => planPolicy([storedPolicy(desired, 'P'), storedPolicy(desired, 'Q')], desired), /duplicate/i);
  });
  it('ignores empty defaulted sections CloudFront may return', () => {
    const stored = structuredClone(desired);
    stored.CustomHeadersConfig.Quantity = 1;
    stored.RemoveHeadersConfig = { Quantity: 0 };
    stored.ServerTimingHeadersConfig = { Enabled: false };
    stored.CorsConfig = { Quantity: 0 };
    stored.SecurityHeadersConfig.XSSProtection = undefined;
    assert.equal(planPolicy([storedPolicy(stored)], desired).action, 'noop');
  });
});

describe('policy command (gated)', () => {
  it('refuses outside the protected environment and when the variable is unset', () => {
    for (const env of [{}, { GITHUB_ENVIRONMENT: 'experimental-cloudfront' }]) {
      const f = fakeAws();
      assert.throws(() => policyEnvironment({ aws: f.aws, desired, env }), /production-cloudfront/);
      assert.equal(f.state.calls.length, 0);
    }
  });
  it('creates, then noops, then updates on drift inside the protected environment', () => {
    const f = fakeAws();
    assert.equal(policyEnvironment({ aws: f.aws, desired, env: PROTECTED }).action, 'create');
    assert.equal(policyEnvironment({ aws: f.aws, desired, env: PROTECTED }).action, 'noop');
    assert.equal(f.state.policies.length, 1);
    f.state.policies[0].ResponseHeadersPolicyConfig.SecurityHeadersConfig.FrameOptions.FrameOption = 'DENY';
    assert.equal(policyEnvironment({ aws: f.aws, desired, env: PROTECTED }).action, 'update');
    assert.equal(f.state.policies[0].ResponseHeadersPolicyConfig.SecurityHeadersConfig.FrameOptions.FrameOption, 'SAMEORIGIN');
  });
});

describe('attachPolicy / verifyDistribution', () => {
  it('attaches to default and every cache behavior, no diff when rerun', () => {
    const r = attachPolicy(distConfig(), 'POL1');
    assert.equal(r.changed, true);
    assert.deepEqual(r.attach, ['default', '/etendo/*', '/mcp']);
    assert.deepEqual(verifyDistribution(r.config, 'POL1'), { ok: true, missing: [] });
    assert.equal(attachPolicy(r.config, 'POL1').changed, false);
  });
  it('reports every behavior without the policy', () => {
    const v = verifyDistribution(distConfig({ default: 'POL1', a: 'OTHER' }), 'POL1');
    assert.deepEqual(v, { ok: false, missing: ['/etendo/*', '/mcp'] });
  });
  it('reports a different policy id and does not replace it by default', () => {
    const r = attachPolicy(distConfig({ default: 'POL1', a: 'OTHER' }), 'POL1');
    assert.deepEqual(r.conflicts, [{ label: '/etendo/*', current: 'OTHER' }]);
    assert.equal(r.config.CacheBehaviors.Items[0].ResponseHeadersPolicyId, 'OTHER');
    const forced = attachPolicy(distConfig({ default: 'POL1', a: 'OTHER' }), 'POL1', { replaceExisting: true });
    assert.equal(forced.config.CacheBehaviors.Items[0].ResponseHeadersPolicyId, 'POL1');
  });
  it('reports viewer-response / origin-response edge associations', () => {
    const cfg = distConfig({}, {
      default: { FunctionAssociations: { Quantity: 1, Items: [{ EventType: 'viewer-response', FunctionARN: 'f' }] } },
      a: { FunctionAssociations: { Quantity: 1, Items: [{ EventType: 'viewer-request', FunctionARN: 'f' }] } },
      b: { LambdaFunctionAssociations: { Quantity: 1, Items: [{ EventType: 'origin-response', LambdaFunctionARN: 'l' }] } },
    });
    assert.deepEqual(attachPolicy(cfg, 'POL1').edgeHooks, ['default', '/mcp']);
  });
});

describe('applyEnvironment (attach-only)', () => {
  it('fails when the policy does not exist and never creates it', () => {
    const f = fakeAws();
    assert.throws(() => run(f), /policy.*(not found|missing)/i);
    assert.equal(f.count(WRITE_POLICY), 0);
  });

  it('fails on policy content drift and never updates it', () => {
    const drift = structuredClone(desired);
    drift.SecurityHeadersConfig.FrameOptions.FrameOption = 'DENY';
    const f = fakeAws({ policies: [storedPolicy(drift)] });
    assert.throws(() => run(f), /drift/i);
    assert.equal(f.count(WRITE_POLICY), 0);
    assert.equal(f.count(/update-distribution/), 0);
  });

  it('attaches, snapshots, verifies; rerun changes nothing and never writes the policy', () => {
    const f = fakeAws({ policies: [storedPolicy()] });
    const dir = snapDir();
    const first = run(f, { snapshotDir: dir });
    assert.equal(first.updated, true);
    assert.equal(readdirSync(dir).length, 1);
    const second = run(f);
    assert.equal(second.updated, false);
    assert.equal(f.count(/update-distribution/), 1);
    assert.equal(f.count(WRITE_POLICY), 0);
  });

  it('dry-run never writes and reports the attach plan, also when the policy does not exist yet', () => {
    const f = fakeAws();
    const r = run(f, { dryRun: true });
    assert.equal(r.updated, false);
    assert.equal(r.policy.action, 'missing');
    assert.deepEqual(r.plan.attach, ['default', '/etendo/*', '/mcp']);
    assert.equal(f.count(/create-|update-/), 0);
  });

  it('refuses to replace a different policy id without --replace-existing, reports it in dry-run and the snapshot', () => {
    const f = fakeAws({ policies: [storedPolicy()], dist: distConfig({ a: 'OTHER' }) });
    const dry = run(f, { dryRun: true });
    assert.deepEqual(dry.plan.conflicts, [{ label: '/etendo/*', current: 'OTHER' }]);
    const dir = snapDir();
    assert.throws(() => run(f, { snapshotDir: dir }), /OTHER/);
    assert.equal(f.count(/update-distribution/), 0);
    const snap = JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]), 'utf8'));
    assert.deepEqual(snap.Report.conflicts, [{ label: '/etendo/*', current: 'OTHER' }]);
    assert.equal(run(f, { replaceExisting: true }).updated, true);
  });

  it('reports edge response hooks in the dry-run plan and the snapshot', () => {
    const hooked = distConfig({}, {
      a: { FunctionAssociations: { Quantity: 1, Items: [{ EventType: 'viewer-response', FunctionARN: 'f' }] } },
    });
    const f = fakeAws({ policies: [storedPolicy()], dist: hooked });
    assert.deepEqual(run(f, { dryRun: true }).plan.edgeHooks, ['/etendo/*']);
    const dir = snapDir();
    run(f, { snapshotDir: dir });
    const snap = JSON.parse(readFileSync(join(dir, readdirSync(dir)[0]), 'utf8'));
    assert.deepEqual(snap.Report.edgeHooks, ['/etendo/*']);
  });

  it('fails cleanly on ETag conflict without retrying', () => {
    const f = fakeAws({ policies: [storedPolicy()] });
    const racing = (args, body) => {
      if (args[1] === 'update-distribution') f.state.etag = 'E99';
      return f.aws(args, body);
    };
    assert.throws(() => run(f, { aws: racing }), /PreconditionFailed/);
    assert.equal(f.count(/update-distribution/), 1);
  });

  it('fails when post-update verification finds a behavior without the policy', () => {
    const f = fakeAws({ policies: [storedPolicy()] });
    const lossy = (args, body) => {
      if (args[1] === 'update-distribution') body.CacheBehaviors.Items[1].ResponseHeadersPolicyId = '';
      return f.aws(args, body);
    };
    assert.throws(() => run(f, { aws: lossy }), /\/mcp/);
  });
});

describe('verifyEnvironment (read-only)', () => {
  it('lists missing path patterns and writes nothing', () => {
    const f = fakeAws({ policies: [storedPolicy()], dist: distConfig({ default: 'POL1' }) });
    assert.deepEqual(verifyEnvironment({ aws: f.aws, distributionId: 'D1' }), { ok: false, drift: false, missing: ['/etendo/*', '/mcp'], policyId: 'POL1' });
    assert.equal(f.count(/create-|update-/), 0);
  });
  it('is not ok when the stored policy drifted from the repo JSON', () => {
    const drift = structuredClone(desired);
    drift.SecurityHeadersConfig.FrameOptions.FrameOption = 'DENY';
    const f = fakeAws({ policies: [storedPolicy(drift)], dist: distConfig({ default: 'POL1', a: 'POL1', b: 'POL1' }) });
    const v = verifyEnvironment({ aws: f.aws, distributionId: 'D1' });
    assert.equal(v.ok, false);
    assert.equal(v.drift, true);
  });
  it('is ok when every behavior has the policy and fails when the policy is absent', () => {
    const ok = fakeAws({ policies: [storedPolicy()], dist: distConfig({ default: 'POL1', a: 'POL1', b: 'POL1' }) });
    assert.equal(verifyEnvironment({ aws: ok.aws, distributionId: 'D1' }).ok, true);
    assert.throws(() => verifyEnvironment({ aws: fakeAws().aws, distributionId: 'D1' }), /not found/);
  });
});

describe('rollbackEnvironment', () => {
  const applied = () => {
    const f = fakeAws({ policies: [storedPolicy()] });
    const dir = snapDir();
    run(f, { snapshotDir: dir });
    return { f, snap: join(dir, readdirSync(dir)[0]) };
  };

  it('restores only the policy ids and preserves unrelated drift', () => {
    const { f, snap } = applied();
    f.state.dist.Origins = { Quantity: 1, Items: [{ Id: 'new-origin' }] };
    f.state.dist.CacheBehaviors.Items[0].TargetOriginId = 'changed';
    rollbackEnvironment({ aws: f.aws, distributionId: 'D1', snapshotFile: snap });
    assert.equal(f.state.dist.DefaultCacheBehavior.ResponseHeadersPolicyId, '');
    assert.equal(f.state.dist.CacheBehaviors.Items[0].ResponseHeadersPolicyId, '');
    assert.equal(f.state.dist.CacheBehaviors.Items[1].ResponseHeadersPolicyId, '');
    assert.deepEqual(f.state.dist.Origins.Items, [{ Id: 'new-origin' }]);
    assert.equal(f.state.dist.CacheBehaviors.Items[0].TargetOriginId, 'changed');
  });

  it('rejects a changed behavior set without writing', () => {
    const { f, snap } = applied();
    f.state.dist.CacheBehaviors.Items.push({ PathPattern: '/new', TargetOriginId: 'alb', ResponseHeadersPolicyId: 'POL1' });
    f.state.dist.CacheBehaviors.Quantity = 3;
    const before = f.count(/update-distribution/);
    assert.throws(() => rollbackEnvironment({ aws: f.aws, distributionId: 'D1', snapshotFile: snap }), /behavior/i);
    assert.equal(f.count(/update-distribution/), before);
  });

  it('refuses a snapshot of another distribution', () => {
    const { f, snap } = applied();
    assert.throws(() => rollbackEnvironment({ aws: f.aws, distributionId: 'D2', snapshotFile: snap }), /distribution/i);
  });

  it('takes the single snapshot file from a downloaded artifact directory only', () => {
    const { f, snap } = applied();
    const dir = snapDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'D1-a.json'), readFileSync(snap));
    rollbackEnvironment({ aws: f.aws, distributionId: 'D1', snapshotDir: dir });
    assert.equal(f.state.dist.DefaultCacheBehavior.ResponseHeadersPolicyId, '');
    writeFileSync(join(dir, 'D1-b.json'), readFileSync(snap));
    assert.throws(() => rollbackEnvironment({ aws: f.aws, distributionId: 'D1', snapshotDir: dir }), /exactly one/);
  });
});
