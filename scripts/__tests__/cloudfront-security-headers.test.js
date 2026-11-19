// @covers scripts/cloudfront-security-headers.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  POLICY_NAME,
  loadDesiredPolicy,
  planPolicy,
  attachPolicy,
  verifyDistribution,
  applyEnvironment,
  rollbackEnvironment,
} from '../cloudfront-security-headers.mjs';

const desired = loadDesiredPolicy();

const distConfig = (policyIds = {}) => ({
  CallerReference: 'x',
  DefaultCacheBehavior: { PathPattern: undefined, TargetOriginId: 's3', ResponseHeadersPolicyId: policyIds.default ?? '' },
  CacheBehaviors: {
    Quantity: 2,
    Items: [
      { PathPattern: '/etendo/*', TargetOriginId: 'alb', ResponseHeadersPolicyId: policyIds.a ?? '' },
      { PathPattern: '/mcp', TargetOriginId: 'alb', ResponseHeadersPolicyId: policyIds.b ?? '' },
    ],
  },
});

// In-memory fake of the aws CLI surface the script uses.
function fakeAws({ policies = [], dist = distConfig(), etag = 'E1' } = {}) {
  const state = { policies: [...policies], dist, etag, calls: [], tmp: 0 };
  const aws = (args, body) => {
    state.calls.push(args.join(' '));
    const [svc, op] = args;
    if (op === 'list-response-headers-policies') {
      return { ResponseHeadersPolicyList: { Items: state.policies.map((p) => ({ ResponseHeadersPolicy: p })) } };
    }
    if (op === 'create-response-headers-policy') {
      const p = { Id: 'POL1', ResponseHeadersPolicyConfig: body };
      state.policies.push(p);
      return { ResponseHeadersPolicy: p, ETag: 'P1' };
    }
    if (op === 'update-response-headers-policy') {
      state.policies[0].ResponseHeadersPolicyConfig = body;
      return { ETag: 'P2' };
    }
    if (op === 'get-response-headers-policy') {
      return { ResponseHeadersPolicy: state.policies[0], ETag: 'P1' };
    }
    if (op === 'get-distribution-config') {
      return { DistributionConfig: structuredClone(state.dist), ETag: state.etag };
    }
    if (op === 'update-distribution') {
      const ifMatch = args[args.indexOf('--if-match') + 1];
      if (ifMatch !== state.etag) throw new Error('PreconditionFailed');
      state.dist = body;
      state.etag = `E${Number(state.etag.slice(1)) + 1}`;
      return { ETag: state.etag };
    }
    throw new Error(`unexpected ${svc} ${op}`);
  };
  return { aws, state };
}

describe('desired policy', () => {
  it('has the versioned name and forbids CORS and CSP', () => {
    assert.equal(POLICY_NAME, 'etendo-go-security-headers-v1');
    assert.equal(desired.Name, POLICY_NAME);
    assert.equal(desired.CorsConfig, undefined);
    assert.equal(desired.SecurityHeadersConfig.ContentSecurityPolicy, undefined);
    assert.equal(desired.SecurityHeadersConfig.FrameOptions.FrameOption, 'DENY');
    assert.equal(desired.SecurityHeadersConfig.ContentTypeOptions.Override, true);
    assert.equal(desired.SecurityHeadersConfig.StrictTransportSecurity.Preload, true);
    assert.match(JSON.stringify(desired.CustomHeadersConfig ?? {}), /Permissions-Policy/);
  });
});

describe('planPolicy', () => {
  it('creates when absent, noops when equal, updates on drift', () => {
    assert.equal(planPolicy([], desired).action, 'create');
    const same = { Id: 'P', ResponseHeadersPolicyConfig: structuredClone(desired) };
    assert.deepEqual(planPolicy([same], desired), { action: 'noop', id: 'P' });
    const drift = structuredClone(desired);
    drift.SecurityHeadersConfig.FrameOptions.FrameOption = 'SAMEORIGIN';
    assert.equal(planPolicy([{ Id: 'P', ResponseHeadersPolicyConfig: drift }], desired).action, 'update');
  });
  it('refuses duplicates by name', () => {
    const p = { Id: 'P', ResponseHeadersPolicyConfig: desired };
    assert.throws(() => planPolicy([p, { ...p, Id: 'Q' }], desired), /duplicate/i);
  });
});

describe('attachPolicy / verifyDistribution', () => {
  it('attaches to default and every cache behavior, no diff when rerun', () => {
    const r = attachPolicy(distConfig(), 'POL1');
    assert.equal(r.changed, true);
    assert.deepEqual(verifyDistribution(r.config, 'POL1'), { ok: true, missing: [] });
    assert.equal(attachPolicy(r.config, 'POL1').changed, false);
  });
  it('reports every behavior without the policy', () => {
    const v = verifyDistribution(distConfig({ default: 'POL1', a: 'OTHER' }), 'POL1');
    assert.equal(v.ok, false);
    assert.deepEqual(v.missing, ['/etendo/*', '/mcp']);
  });
});

describe('applyEnvironment', () => {
  const snapDir = () => mkdtempSync(join(tmpdir(), 'cfsnap-'));

  it('creates policy, snapshots, updates, verifies; rerun changes nothing', () => {
    const { aws, state } = fakeAws();
    const dir = snapDir();
    const first = applyEnvironment({ aws, distributionId: 'D1', snapshotDir: dir, desired });
    assert.equal(first.policy.action, 'create');
    assert.equal(first.updated, true);
    assert.equal(readdirSync(dir).length, 1);
    assert.equal(state.policies.length, 1);

    const before = state.calls.filter((c) => c.includes('update-distribution')).length;
    const second = applyEnvironment({ aws, distributionId: 'D1', snapshotDir: snapDir(), desired });
    assert.equal(second.policy.action, 'noop');
    assert.equal(second.updated, false);
    assert.equal(state.calls.filter((c) => c.includes('update-distribution')).length, before);
    assert.equal(state.policies.length, 1);
  });

  it('dry-run never writes', () => {
    const { aws, state } = fakeAws();
    const r = applyEnvironment({ aws, distributionId: 'D1', snapshotDir: snapDir(), desired, dryRun: true });
    assert.equal(r.updated, false);
    assert.equal(state.policies.length, 0);
    assert.ok(!state.calls.some((c) => /create-|update-/.test(c)));
  });

  it('fails cleanly on ETag conflict without retrying', () => {
    const { aws, state } = fakeAws();
    const racing = (args, body) => {
      if (args[1] === 'update-distribution') { state.etag = 'E99'; }
      return aws(args, body);
    };
    assert.throws(() => applyEnvironment({ aws: racing, distributionId: 'D1', snapshotDir: snapDir(), desired }), /PreconditionFailed/);
    assert.equal(state.calls.filter((c) => c.includes('update-distribution')).length, 1);
  });

  it('fails when post-update verification finds a behavior without the policy', () => {
    const { aws, state } = fakeAws();
    const lossy = (args, body) => {
      if (args[1] === 'update-distribution') body.CacheBehaviors.Items[1].ResponseHeadersPolicyId = '';
      return aws(args, body);
    };
    assert.throws(() => applyEnvironment({ aws: lossy, distributionId: 'D1', snapshotDir: snapDir(), desired }), /\/mcp/);
    assert.ok(state.policies.length === 1);
  });
});

describe('rollbackEnvironment', () => {
  it('restores the pre-change snapshot using the current ETag', () => {
    const original = distConfig();
    const { aws, state } = fakeAws({ dist: original });
    const dir = mkdtempSync(join(tmpdir(), 'cfsnap-'));
    applyEnvironment({ aws, distributionId: 'D1', snapshotDir: dir, desired });
    const snap = join(dir, readdirSync(dir)[0]);
    assert.equal(JSON.parse(readFileSync(snap, 'utf8')).DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId, '');
    rollbackEnvironment({ aws, distributionId: 'D1', snapshotFile: snap });
    assert.equal(state.dist.DefaultCacheBehavior.ResponseHeadersPolicyId, '');
    assert.equal(state.dist.CacheBehaviors.Items[0].ResponseHeadersPolicyId, '');
  });
  it('refuses a snapshot of another distribution', () => {
    const { aws } = fakeAws();
    const dir = mkdtempSync(join(tmpdir(), 'cfsnap-'));
    applyEnvironment({ aws, distributionId: 'D1', snapshotDir: dir, desired });
    assert.throws(() => rollbackEnvironment({ aws, distributionId: 'D2', snapshotFile: join(dir, readdirSync(dir)[0]) }), /distribution/i);
  });
});
