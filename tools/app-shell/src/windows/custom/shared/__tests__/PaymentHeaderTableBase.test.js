import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PaymentHeaderTableBase.jsx'), 'utf8');

describe('PaymentHeaderTableBase', () => {

  // ── Exports ────────────────────────────────────────────────────────────────

  it('exports PaymentHeaderTableBase as the default export', () => {
    assert.match(src, /export default function PaymentHeaderTableBase/);
  });

  // ── Props contract ─────────────────────────────────────────────────────────

  it('accepts dir and data props', () => {
    assert.match(src, /\bdir\b/);
    assert.match(src, /\bdata\b/);
  });

  // ── Amount formatting ──────────────────────────────────────────────────────

  it('uses Intl.NumberFormat for amount formatting', () => {
    assert.match(src, /new Intl\.NumberFormat/);
  });

  it('has currencySymbol helper function', () => {
    assert.match(src, /function currencySymbol/);
  });

  it('renders sign and amount for in/out direction', () => {
    assert.match(src, /sign/);
    assert.match(src, /fmtAmt/);
  });

  // ── Summary amount and currency ────────────────────────────────────────────

  it('has a hero amount display with tabular-nums class', () => {
    assert.match(src, /tabular-nums/);
    assert.match(src, /heroSign/);
  });

  it('passes currency to fmtAmt for summary rendering', () => {
    assert.match(src, /fmtAmt\(thisMonth,\s*currency\)/);
  });

  // ── i18n ───────────────────────────────────────────────────────────────────

  it('uses useUI hook from @/i18n', () => {
    assert.match(src, /import.*useUI.*from '@\/i18n'/);
    assert.match(src, /useUI\(\)/);
  });

  // ── Reactivar integration ──────────────────────────────────────────────────

  it('imports and renders ReactivarModal', () => {
    assert.match(src, /import ReactivarModal from/);
    assert.match(src, /<ReactivarModal/);
  });

  it('dispatches neo:processSuccess after reactivation', () => {
    assert.match(src, /neo:processSuccess/);
    assert.match(src, /dispatchEvent/);
  });

  // ── DataTable integration ──────────────────────────────────────────────────

  it('renders DataTable with hideDeleteWhenComplete', () => {
    assert.match(src, /hideDeleteWhenComplete:\s*true/);
  });

});
