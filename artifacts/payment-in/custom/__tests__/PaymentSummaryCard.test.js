import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PaymentSummaryCard.jsx'), 'utf8');

describe('PaymentSummaryCard', () => {
  it('exports PaymentSummaryCard as the default export', () => {
    assert.match(src, /export default function PaymentSummaryCard/);
  });

  // ETP-4314: fmtAmount() used to build its own `Intl.NumberFormat(undefined, {
  // style: 'currency', currency: currencyId || 'EUR', ... })` with no
  // `useGrouping`, so amounts >= 1000 lost the thousands separator. It must now
  // delegate entirely to the shared formatCurrency() instead of hand-rolling Intl.
  it('delegates fmtAmount entirely to the shared formatCurrency() (no hand-rolled Intl.NumberFormat)', () => {
    assert.match(src, /import \{ formatCurrency \} from '@\/lib\/formatCurrency\.js';/);
    assert.match(
      src,
      /function fmtAmount\(amount, currencyId\) \{\s*\n\s*const n = [^\n]+;\s*\n\s*return formatCurrency\(currencyId, n\);\s*\n\s*\}/,
    );
    assert.doesNotMatch(src, /new Intl\.NumberFormat/);
  });

  // Behavior change (ETP-4314): fmtAmount itself no longer defaults a falsy
  // currencyId to 'EUR' — that silent guess is gone. The component's own
  // `currency` variable (passed into every fmtAmount call) still defaults to
  // 'EUR' when the record has no resolved currency identifier, which is a
  // separate, intentional display default and NOT the bug that was fixed.
  it('no longer hardcodes a EUR fallback inside fmtAmount for a missing currencyId', () => {
    assert.doesNotMatch(src, /currencyId \|\| 'EUR'/);
    assert.doesNotMatch(src, /currency: currencyId/);
  });

  it("still defaults the component-level `currency` var to 'EUR' when the record has none (unrelated display default)", () => {
    assert.match(src, /const currency = data\['currency\$_identifier'\] \|\| 'EUR';/);
  });

  it('calls fmtAmount for totalAmount, applied, and remaining', () => {
    assert.match(src, /\{fmtAmount\(totalAmount, currency\)\}/);
    assert.match(src, /\{fmtAmount\(applied, currency\)\}/);
    assert.match(src, /\{fmtAmount\(remaining, currency\)\}/);
  });

  it('returns null when there is no data (guard clause before any hooks-derived rendering)', () => {
    assert.match(src, /if \(!data\) return null;/);
  });
});
