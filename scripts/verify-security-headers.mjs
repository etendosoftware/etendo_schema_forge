#!/usr/bin/env node
// Exact-value header assertions on the three Etendo Go distributions (ETP-4574, ADR-0002).
// Probes an HTML document, a content-hashed asset and an SPA error response per host and compares
// each header with the repo policies (single source of truth), not with a header score.
//
// Usage: CSP_CONNECT_ORIGINS=<https origins> node scripts/verify-security-headers.mjs \
//          [--env production,staging,experimental] --asset /assets/index-<hash>.js
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPolicyByName } from './cloudfront-security-headers.mjs';

export const HOSTS = {
  production: 'go.etendo.cloud',
  staging: 'go.staging.etendo.cloud',
  experimental: 'go.experimental.etendo.cloud',
};
const HTML_POLICY = 'etendo-go-security-headers-v2';
const ASSET_POLICY = 'etendo-go-assets-headers-v2';
const ERROR_PATH = '/__etp4574-missing-route__';

// Lower-cased header name -> exact expected value, derived from a policy file.
function fromPolicy(policy) {
  const s = policy.SecurityHeadersConfig;
  const hsts = s.StrictTransportSecurity;
  const out = {
    'strict-transport-security': `max-age=${hsts.AccessControlMaxAgeSec}${hsts.IncludeSubdomains ? '; includeSubDomains' : ''}${hsts.Preload ? '; preload' : ''}`,
    'x-content-type-options': 'nosniff',
    'x-frame-options': s.FrameOptions.FrameOption,
    'referrer-policy': s.ReferrerPolicy.ReferrerPolicy,
  };
  if (s.ContentSecurityPolicy) out['content-security-policy'] = s.ContentSecurityPolicy.ContentSecurityPolicy;
  for (const { Header, Value } of policy.CustomHeadersConfig?.Items ?? []) out[Header.toLowerCase()] = Value;
  return out;
}

export function expectedHeaders(kind, env = process.env) {
  const expected = fromPolicy(loadPolicyByName(kind === 'asset' ? ASSET_POLICY : HTML_POLICY, env));
  return { expected, forbidden: ['content-security-policy-report-only'] };
}

export function checkHeaders({ expected, forbidden }, headers) {
  const get = (n) => (headers instanceof Headers ? headers.get(n) : headers[n]);
  const failures = Object.entries(expected)
    .filter(([name, value]) => get(name) !== value)
    .map(([name, value]) => `${name}: expected "${value}", got ${JSON.stringify(get(name) ?? null)}`);
  for (const name of forbidden) if (get(name) != null) failures.push(`${name}: must not be present`);
  return failures;
}

export async function verifyHost({ host, assetPath, env = process.env, fetchFn = fetch }) {
  const probes = [
    ['html', '/', 'html', [200]],
    ['asset', assetPath, 'asset', [200]],
    ['error', ERROR_PATH, 'html', [200, 404]],
  ];
  const failures = [];
  for (const [label, path, kind, statuses] of probes) {
    const res = await fetchFn(`https://${host}${path}`, { redirect: 'manual' });
    if (!statuses.includes(res.status)) failures.push(`${host} ${label} ${path}: unexpected status ${res.status}`);
    for (const f of checkHeaders(expectedHeaders(kind, env), res.headers)) failures.push(`${host} ${label} ${path}: ${f}`);
  }
  return { host, failures };
}

async function main(argv) {
  const opt = (n) => { const i = argv.indexOf(`--${n}`); return i < 0 ? undefined : argv[i + 1]; };
  const names = (opt('env') ?? Object.keys(HOSTS).join(',')).split(',');
  const assetPath = opt('asset');
  const unknown = names.filter((n) => !HOSTS[n]);
  if (!assetPath || unknown.length > 0) {
    console.error(`usage: verify-security-headers.mjs --asset /assets/<hashed file> [--env ${Object.keys(HOSTS).join(',')}]`);
    process.exit(2);
  }
  const results = await Promise.all(names.map((n) => verifyHost({ host: HOSTS[n], assetPath })));
  for (const r of results) console.log(JSON.stringify(r));
  if (results.some((r) => r.failures.length > 0)) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
