// @covers scripts/verify-security-headers.mjs
// @covers scripts/cloudfront-security-headers.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  HOSTS,
  DEFAULT_ENVS,
  expectedHeaders,
  checkHeaders,
  verifyHost,
} from '../verify-security-headers.mjs';
import {
  applyEnvironment,
  loadPolicyByName,
  attachPolicy,
  verifyDistribution,
  rollbackEnvironment,
} from '../cloudfront-security-headers.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ENV = { CSP_CONNECT_ORIGINS: 'https://glitchtip.example.com' };
const HTML = 'etendo-go-security-headers-v2';
const ASSETS = 'etendo-go-assets-headers-v2';

const goodHtml = () => {
  const p = loadPolicyByName(HTML, ENV);
  return {
    'content-security-policy': p.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy,
    'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), geolocation=(), microphone=()',
    'cache-control': 'no-cache, no-store, must-revalidate',
    'reporting-endpoints': 'csp-endpoint="/sws/go/csp-report"',
  };
};

describe('enforced HTML policy v2', () => {
  const p = loadPolicyByName(HTML, ENV);
  const csp = p.SecurityHeadersConfig.ContentSecurityPolicy;
  it('enforces CSP (not report-only) with upgrade-insecure-requests and frame-ancestors none', () => {
    assert.equal(csp.Override, true);
    assert.match(csp.ContentSecurityPolicy, /default-src 'self'/);
    assert.match(csp.ContentSecurityPolicy, /frame-ancestors 'none'/);
    assert.match(csp.ContentSecurityPolicy, /upgrade-insecure-requests/);
    assert.match(csp.ContentSecurityPolicy, /connect-src 'self' https:\/\/dataplane\.rum\.eu-west-3\.amazonaws\.com https:\/\/glitchtip\.example\.com/);
    assert.doesNotMatch(JSON.stringify(p), /Report-Only/i);
    assert.doesNotMatch(csp.ContentSecurityPolicy, /unsafe-inline|unsafe-eval|script-src/);
  });
  it('tightens XFO to DENY and keeps the live hardening headers', () => {
    assert.equal(p.SecurityHeadersConfig.FrameOptions.FrameOption, 'DENY');
    assert.equal(p.SecurityHeadersConfig.StrictTransportSecurity.AccessControlMaxAgeSec, 31536000);
    assert.equal(p.CorsConfig, undefined);
  });
  it('fails closed without valid deployment connect origins', () => {
    assert.throws(() => loadPolicyByName(HTML, {}), /CSP_CONNECT_ORIGINS/);
    for (const bad of ['http://x.com', 'https://x.com; script-src *', "https://x.com'", '*', '']) {
      assert.throws(() => loadPolicyByName(HTML, { CSP_CONNECT_ORIGINS: bad }), /CSP_CONNECT_ORIGINS|origin/);
    }
  });
  it('never leaves a placeholder in a rendered policy', () => {
    assert.doesNotMatch(JSON.stringify(p), /\{\{/);
  });
});

describe('assets policy v2', () => {
  const p = loadPolicyByName(ASSETS, ENV);
  it('has immutable caching and no CSP', () => {
    assert.equal(p.SecurityHeadersConfig.ContentSecurityPolicy, undefined);
    const cc = p.CustomHeadersConfig.Items.find((i) => i.Header === 'Cache-Control');
    assert.equal(cc.Value, 'public, max-age=31536000, immutable');
    assert.equal(cc.Override, true);
    assert.equal(p.SecurityHeadersConfig.FrameOptions.FrameOption, 'DENY');
  });
});

describe('attaching by path pattern', () => {
  const config = {
    DefaultCacheBehavior: { TargetOriginId: 's3' },
    CacheBehaviors: { Quantity: 2, Items: [{ PathPattern: '/assets/*' }, { PathPattern: '/etendo/*' }] },
  };
  it('attaches only the listed behaviors and verifies only those', () => {
    const r = attachPolicy(config, 'A', { paths: ['/assets/*'] });
    assert.deepEqual(r.attach, ['/assets/*']);
    assert.equal(r.config.DefaultCacheBehavior.ResponseHeadersPolicyId, undefined);
    assert.equal(verifyDistribution(r.config, 'A', { paths: ['/assets/*'] }).ok, true);
    assert.equal(verifyDistribution(r.config, 'A').ok, false);
  });
  it('rejects a path that is not a behavior of the distribution', () => {
    assert.throws(() => attachPolicy(config, 'A', { paths: ['/nope/*'] }), /\/nope\/\*/);
  });
});

describe('exact header assertions', () => {
  it('passes the exact enforced HTML set', () => {
    assert.deepEqual(checkHeaders(expectedHeaders('html', ENV), goodHtml()), []);
  });
  it('flags report-only CSP, weakened or missing headers and extra CSP-Report-Only', () => {
    const h = goodHtml();
    delete h['content-security-policy'];
    h['content-security-policy-report-only'] = 'default-src *';
    h['x-frame-options'] = 'SAMEORIGIN';
    delete h['x-content-type-options'];
    h['strict-transport-security'] = 'max-age=300';
    const fails = checkHeaders(expectedHeaders('html', ENV), h).join('\n');
    assert.match(fails, /^content-security-policy: expected/m);
    assert.match(fails, /content-security-policy-report-only: must not be present/);
    for (const name of ['x-frame-options', 'x-content-type-options', 'strict-transport-security']) {
      assert.match(fails, new RegExp(`^${name}: `, 'm'));
    }
  });
  it('flags a header that arrives twice (Headers joins duplicates)', () => {
    const h = new Headers(goodHtml());
    h.append('x-frame-options', 'DENY');
    assert.match(checkHeaders(expectedHeaders('html', ENV), h).join('\n'), /^x-frame-options: expected "DENY", got "DENY, DENY"/m);
  });
  it('rejects immutable caching on a missing asset', () => {
    const e = expectedHeaders('missing-asset', ENV);
    assert.deepEqual(checkHeaders(e, { ...goodHtml(), 'cache-control': 'no-cache, no-store, must-revalidate' }), []);
    assert.match(checkHeaders(e, { ...goodHtml(), 'cache-control': 'public, max-age=31536000, immutable' }).join(), /cache-control: must not match/);
    assert.match(checkHeaders(e, { ...goodHtml(), 'cache-control': 'max-age=31536000' }).join(), /cache-control: must not match/);
  });
  it('requires immutable caching on assets and no CSP requirement', () => {
    const h = { ...goodHtml(), 'cache-control': 'public, max-age=31536000, immutable' };
    delete h['content-security-policy'];
    assert.deepEqual(checkHeaders(expectedHeaders('asset', ENV), h), []);
    h['cache-control'] = 'public, max-age=60';
    assert.match(checkHeaders(expectedHeaders('asset', ENV), h).join(), /cache-control/);
  });
});

describe('verifyHost', () => {
  const respond = (map) => async (url) => {
    const path = new URL(url).pathname;
    const r = map[path] ?? map['*'];
    return { status: r.status, headers: new Headers(r.headers) };
  };
  it('checks the document, a hashed asset, a missing asset and an SPA error response on one host', async () => {
    const seen = [];
    const html = goodHtml();
    const asset = { ...html, 'cache-control': 'public, max-age=31536000, immutable' };
    delete asset['content-security-policy'];
    const fetchFn = async (url, init) => {
      seen.push(new URL(url).pathname);
      return respond({
        '/': { status: 200, headers: html },
        '/assets/index-abc123.js': { status: 200, headers: asset },
        '*': { status: 404, headers: html },
      })(url, init);
    };
    const res = await verifyHost({ host: 'go.example.com', assetPath: '/assets/index-abc123.js', env: ENV, fetchFn });
    assert.deepEqual(res.failures, []);
    assert.equal(seen.length, 4);
    assert.ok(seen.includes('/') && seen.some((p) => p.startsWith('/assets/__etp4574-missing')));
  });
  it('reports failures prefixed by host and probe', async () => {
    const html = goodHtml();
    html['x-frame-options'] = 'SAMEORIGIN';
    const fetchFn = respond({ '*': { status: 200, headers: html } });
    const res = await verifyHost({ host: 'h.example.com', assetPath: '/assets/a.js', env: ENV, fetchFn });
    assert.ok(res.failures.some((f) => /^h\.example\.com .*html.*x-frame-options/.test(f)));
  });
  it('fails when a missing asset is served immutable (stale SPA shell pinned for a year)', async () => {
    const html = goodHtml();
    const fetchFn = async (url) => {
      const missing = new URL(url).pathname.startsWith('/assets/__etp4574-missing');
      return { status: 200, headers: new Headers(missing ? { ...html, 'cache-control': 'public, max-age=31536000, immutable' } : html) };
    };
    const res = await verifyHost({ host: 'h.example.com', assetPath: '/assets/a.js', env: ENV, fetchFn });
    assert.ok(res.failures.some((f) => /missing-asset.*immutable|missing-asset.*cache-control/.test(f)));
  });
  it('exposes the three hosts; experimental is opt-in until the HSTS inventory exists', () => {
    assert.deepEqual(Object.keys(HOSTS).sort(), ['experimental', 'production', 'staging']);
    assert.deepEqual(DEFAULT_ENVS, ['production', 'staging']);
  });
});

describe('applyEnvironment with paths', () => {
  it('is covered by the generic apply (smoke): refuses unknown paths before writing', () => {
    const calls = [];
    const aws = (args) => {
      calls.push(args[1]);
      if (args[1] === 'list-response-headers-policies') {
        return { ResponseHeadersPolicyList: { Items: [{ ResponseHeadersPolicy: { Id: 'P', ResponseHeadersPolicyConfig: loadPolicyByName(ASSETS, ENV) } }] } };
      }
      if (args[1] === 'get-distribution-config') {
        return { ETag: 'E', DistributionConfig: { DefaultCacheBehavior: {}, CacheBehaviors: { Quantity: 0 } } };
      }
      throw new Error('unexpected');
    };
    assert.throws(() => applyEnvironment({
      aws, distributionId: 'D', snapshotDir: mkdtempSync(join(tmpdir(), 's-')),
      desired: loadPolicyByName(ASSETS, ENV), paths: ['/assets/*'],
    }), /\/assets\/\*/);
    assert.ok(!calls.includes('update-distribution'));
  });
});

describe('edge CSP parity with com.etendoerp.go', () => {
  // Pinned output of CspPolicy.enforcedValue("/sws/go/csp-report", ["https://glitchtip.example.com"])
  // (com.etendoerp.go, CspPolicyTest guards that class). Change both together.
  const JAVA_ENFORCED = "default-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' blob: data:; frame-src 'self' blob:; connect-src 'self' https://dataplane.rum.eu-west-3.amazonaws.com https://glitchtip.example.com; upgrade-insecure-requests; report-uri /sws/go/csp-report; report-to csp-endpoint";
  it('renders the v2 CSP identical to the backend definition', () => {
    const p = loadPolicyByName(HTML, { CSP_CONNECT_ORIGINS: 'https://glitchtip.example.com' });
    assert.equal(p.SecurityHeadersConfig.ContentSecurityPolicy.ContentSecurityPolicy, JAVA_ENFORCED);
  });
});

describe('rollback after two applies with different policies on disjoint behaviors', () => {
  const dist = () => ({
    DefaultCacheBehavior: { TargetOriginId: 's3', ResponseHeadersPolicyId: 'V1' },
    CacheBehaviors: { Quantity: 1, Items: [{ PathPattern: '/assets/*', ResponseHeadersPolicyId: 'V1' }] },
  });
  const policies = () => [
    { Id: 'HTML2', ResponseHeadersPolicyConfig: loadPolicyByName(HTML, ENV) },
    { Id: 'ASSETS2', ResponseHeadersPolicyConfig: loadPolicyByName(ASSETS, ENV) },
  ];
  function setup() {
    const state = { dist: dist(), etag: 'E1', policies: policies() };
    const aws = (args, body) => {
      const op = args[1];
      if (op === 'list-response-headers-policies') {
        return { ResponseHeadersPolicyList: { Items: state.policies.map((p) => ({ ResponseHeadersPolicy: p })) } };
      }
      if (op === 'get-distribution-config') return { DistributionConfig: structuredClone(state.dist), ETag: state.etag };
      if (op === 'update-distribution') { state.dist = body; state.etag += '1'; return {}; }
      throw new Error(`unexpected ${op}`);
    };
    const apply = (desired, paths) => applyEnvironment({
      aws, distributionId: 'D', snapshotDir: mkdtempSync(join(tmpdir(), 'snap-')), desired, paths, replaceExisting: true,
    }).snapshotFile;
    const ids = () => [state.dist.DefaultCacheBehavior.ResponseHeadersPolicyId, state.dist.CacheBehaviors.Items[0].ResponseHeadersPolicyId];
    return { aws, apply, ids };
  }
  const twoApplies = () => {
    const t = setup();
    const snapA = t.apply(loadPolicyByName(ASSETS, ENV), ['/assets/*']);
    const snapB = t.apply(loadPolicyByName(HTML, ENV), ['default']);
    assert.deepEqual(t.ids(), ['HTML2', 'ASSETS2']);
    return { ...t, snapA, snapB };
  };
  it('oldest snapshot alone restores every behavior to its prior id', () => {
    const t = twoApplies();
    rollbackEnvironment({ aws: t.aws, distributionId: 'D', snapshotFile: t.snapA });
    assert.deepEqual(t.ids(), ['V1', 'V1']);
  });
  it('newest first, then oldest, also ends on the prior ids', () => {
    const t = twoApplies();
    rollbackEnvironment({ aws: t.aws, distributionId: 'D', snapshotFile: t.snapB });
    assert.deepEqual(t.ids(), ['V1', 'ASSETS2']);
    rollbackEnvironment({ aws: t.aws, distributionId: 'D', snapshotFile: t.snapA });
    assert.deepEqual(t.ids(), ['V1', 'V1']);
  });
  it('oldest first, then newest, leaves /assets/* on the assets policy (wrong order)', () => {
    const t = twoApplies();
    rollbackEnvironment({ aws: t.aws, distributionId: 'D', snapshotFile: t.snapA });
    rollbackEnvironment({ aws: t.aws, distributionId: 'D', snapshotFile: t.snapB });
    assert.deepEqual(t.ids(), ['V1', 'ASSETS2']);
  });
});
