import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'useConversionRate.js'), 'utf8');

// Structural contract for the ETP-4504 conversion-rate hook. The runtime
// behavior (fetch, same-currency short-circuit, error handling) is exercised in
// useConversionRate.vitest.jsx; this node:test file pins the source contract and
// satisfies the co-located .test.js convention for the new source file.

describe('useConversionRate (ETP-4504)', () => {
  it('exports the useConversionRate hook', () => {
    assert.match(src, /export function useConversionRate\(\{ fromCode, toCode, date, apiBaseUrl, token \}\)/);
  });

  it('reuses the shared fetchOptionalJson helper', () => {
    assert.match(src, /import \{ fetchOptionalJson \} from '\.\/pdfUtils\.js'/);
  });

  it('short-circuits (no fetch) when currencies match or a required input is missing', () => {
    // ETP-4576 — the `!token` conjunct is gone: under the cookie scheme the client holds
    // no token, so it was permanently true and skipped the lookup for every user.
    assert.match(src, /if \(!fromCode \|\| !toCode \|\| fromCode === toCode \|\| !apiBaseUrl\)/);
    assert.match(src, /if \(!date\)/);
  });

  it('strips the last apiBaseUrl segment and calls validate-exchange-rate', () => {
    assert.match(src, /const base = apiBaseUrl\.replace\(\/\\\/\[\^\/\]\+\$\/, ''\);/);
    assert.match(src, /\/validate-exchange-rate\?fromCurrency=/);
    assert.match(src, /toCurrency=/);
    assert.match(src, /date=/);
  });

  it('reports hasRate from whether a rate was returned', () => {
    assert.match(src, /const rate = rateData\?\.rate \?\? null;/);
    assert.match(src, /hasRate: rate != null/);
  });

  it('degrades to safe defaults on error and guards against stale setState after unmount', () => {
    assert.match(src, /catch \{/);
    assert.match(src, /let cancelled = false;/);
    assert.match(src, /return \(\) => \{ cancelled = true; \};/);
  });
});
