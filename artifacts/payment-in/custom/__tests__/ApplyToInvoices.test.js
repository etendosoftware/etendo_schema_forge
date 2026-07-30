import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'ApplyToInvoices.jsx'), 'utf8');

describe('ApplyToInvoices', () => {
  it('exports ApplyToInvoices as the default export', () => {
    assert.match(src, /export default function ApplyToInvoices/);
  });

  // ETP-4314: formatAmount() used to hardcode a CURRENCY_SYMBOLS map and place
  // the symbol BEFORE the amount ("€ 1,234.56") — the only symbol-before spot
  // in the whole app, and with no thousands grouping guarantee either. It must
  // now delegate entirely to the shared formatCurrency(), which places the
  // symbol after the amount (es-ES convention) with real Intl symbol lookup.
  it('delegates formatAmount entirely to the shared formatCurrency() (symbol after amount, no hardcoded map)', () => {
    assert.match(src, /import \{ formatCurrency \} from '@\/lib\/formatCurrency\.js';/);
    assert.match(
      src,
      /function formatAmount\(value, currency\) \{\s*\n\s*const num = [^\n]+;\s*\n\s*return formatCurrency\(currency, num\);\s*\n\s*\}/,
    );
  });

  it('no longer defines a hardcoded CURRENCY_SYMBOLS map or a symbol-before template', () => {
    assert.doesNotMatch(src, /CURRENCY_SYMBOLS/);
    // The old bug rendered the symbol first via a template like `${symbol} ${amount}`
    // ahead of the formatted number — no such symbol-then-number template remains.
    assert.doesNotMatch(src, /new Intl\.NumberFormat/);
  });

  it('uses formatAmount for every rendered money cell (read-only rows, editable-view rows, and the footer totals)', () => {
    assert.match(src, /\{formatAmount\(inv\.totalAmount, currency\)\}/);
    assert.match(src, /\{formatAmount\(inv\.outstandingAmount, currency\)\}/);
    assert.match(src, /\{formatAmount\(outstanding, currency\)\}/);
    assert.match(src, /\{formatAmount\(totalApplied, currency\)\}/);
    assert.match(src, /\{formatAmount\(paymentNum, currency\)\}/);
  });

  it("derives currency from the first pending invoice's own currency field", () => {
    assert.match(src, /const currency = invoices\[0\]\?\.currency \|\| '';/);
  });
});
