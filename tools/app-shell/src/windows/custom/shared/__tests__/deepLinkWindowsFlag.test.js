/**
 * ETP-5009 — source-level guard for the deep-link windows.
 *
 * A window that derives its `initial*` ListView props from URL params MUST also pass
 * `initialFiltersFromUrl`, or the session snapshot saved on a previous visit silently
 * overrides the dashboard deep-link — a bug with no error, no log and no visible
 * symptom other than the wrong rows.
 *
 * Source-reading rather than rendering: these window shells are thin, but they pull in
 * the full window registry, the router and the contract, so the structural contract
 * (prop present, wired to the URL-derived value) is what is worth pinning here.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const customRoot = join(__dirname, '..', '..');

/** Windows that read URL params and feed them to ListView as initial filters. */
const DEEP_LINK_WINDOWS = [
  'sales-invoice',
  'purchase-invoice',
  'goods-shipment',
  'goods-receipt',
];

function windowSource(name) {
  return readFileSync(join(customRoot, name, 'index.jsx'), 'utf8');
}

describe('deep-link windows pass initialFiltersFromUrl to ListView (ETP-5009)', () => {
  for (const name of DEEP_LINK_WINDOWS) {
    describe(name, () => {
      const src = windowSource(name);

      it('reads at least one filter param from the URL', () => {
        assert.match(src, /useSearchParams/,
          'must use useSearchParams — otherwise it is not a deep-link window');
        assert.match(src, /searchParams\.get\(/,
          'must read a query param from the URL');
      });

      it('passes the initialFiltersFromUrl prop', () => {
        assert.match(src, /initialFiltersFromUrl=\{/,
          'must pass initialFiltersFromUrl or the session snapshot overrides the deep-link');
      });

      it('derives the flag from the URL params, not from a hardcoded literal', () => {
        assert.doesNotMatch(src, /initialFiltersFromUrl=\{(true|false)\}/,
          'the flag must be computed from the params of THIS navigation, never hardcoded');
        assert.match(src, /initialFiltersFromUrl=\{[^}]*(docStatus|Filter|isPendingDelivery)[^}]*\}/,
          'the flag must be wired to the URL-derived filter values');
      });
    });
  }
});
