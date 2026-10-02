import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findBannedProviderImports,
  BANNED_PROVIDER_PREFIXES,
} from '@etendosoftware/app-shell-core/observability/providerImportGuard';

/**
 * ETP-4578 guardrail — provider SDKs have exactly one home in the host.
 *
 * Every telemetry payload must cross the core's sanitizing gateway, whose provider
 * adapters receive their SDK by injection. A component that imports `@sentry/react`,
 * `mixpanel-browser` or `aws-rum-web` itself can reach the provider without passing
 * through any of it. The only file allowed to import a provider SDK is the one that
 * hands them to the adapters; the scanner (and its list of banned packages and scopes)
 * is the core's, so the host and the core enforce the same rule.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');

// Each entry names WHY: this list is the only place the exception is recorded.
const ALLOWED_FILES = new Map([
  [
    join('lib', 'observability', 'sdk.js'),
    'the single place the host imports provider SDKs, to inject them into the core adapters',
  ],
]);

function collectSourceFiles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      collectSourceFiles(full, acc);
      continue;
    }
    if (!/\.jsx?$/.test(entry)) continue;
    if (/\.(test|vitest)\.jsx?$/.test(entry)) continue;
    acc.push(full);
  }
  return acc;
}

describe('provider SDK import policy (ETP-4578)', () => {
  it('no source file imports a provider SDK outside the single injection point', () => {
    const offenders = [];
    for (const file of collectSourceFiles(SRC)) {
      const rel = relative(SRC, file);
      if (ALLOWED_FILES.has(rel)) continue;
      for (const specifier of findBannedProviderImports(readFileSync(file, 'utf8'))) {
        offenders.push(`${rel.split(sep).join('/')}: ${specifier}`);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      'These files import a provider SDK directly, bypassing the sanitizing gateway:\n'
      + offenders.map((o) => `  - ${o}`).join('\n')
      + '\n\nImport it in src/lib/observability/sdk.js and hand it to the core adapter instead.\n'
      + `Banned package prefixes: ${BANNED_PROVIDER_PREFIXES.join(', ')}\n`,
    );
  });

  it('every allowed exception still exists and still needs the exception', () => {
    // A stale entry silently re-opens the hole for whatever later occupies that path.
    for (const [file, reason] of ALLOWED_FILES) {
      const full = join(SRC, file);
      assert.doesNotThrow(() => statSync(full), `${file} is listed as an exception but no longer exists`);
      assert.ok(
        findBannedProviderImports(readFileSync(full, 'utf8')).length > 0,
        `${file} no longer imports a provider SDK; drop the exception`,
      );
      assert.ok(reason.length > 10, `${file} needs a real reason, got "${reason}"`);
    }
  });
});

describe('aws-rum-web version pin (ETP-4578)', () => {
  it('is an exact version, so any bump is deliberate', () => {
    // The RUM adapter intercepts the SDK through its private `defaultClientBuilder`; a caret
    // range would let an install pick up a version that renames it. The adapter fails closed,
    // and the real-SDK test (H4c) goes red, but a bump should never be a surprise.
    const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
    assert.match(manifest.dependencies['aws-rum-web'], /^\d+\.\d+\.\d+$/);
  });
});
