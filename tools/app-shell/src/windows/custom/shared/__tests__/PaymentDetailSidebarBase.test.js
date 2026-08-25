import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'PaymentDetailSidebarBase.jsx'), 'utf8');

describe('PaymentDetailSidebarBase', () => {

  // ── Exports ────────────────────────────────────────────────────────────────

  it('exports PaymentDetailSidebarBase as the default export', () => {
    assert.match(src, /export default function PaymentDetailSidebarBase/);
  });

  // ── Props contract ─────────────────────────────────────────────────────────

  // ETP-4576 — `token` is gone from the destructure: the panel's read takes the
  // session credential from the shared builder instead of a threaded prop.
  it('accepts dir, specName, data, apiBaseUrl props', () => {
    assert.match(src, /\{\s*dir\s*,\s*specName\s*,\s*data\s*,\s*apiBaseUrl\s*\}/);
  });

  // ── Amount formatting ──────────────────────────────────────────────────────

  it('delegates amount formatting to the shared formatCurrency() (not a regex pattern, not a hand-rolled Intl.NumberFormat)', () => {
    assert.match(src, /import\s*\{\s*formatCurrency\s*\}\s*from\s*['"]@\/lib\/formatCurrency\.js['"]/);
    assert.match(src, /formatCurrency\(/);
    assert.doesNotMatch(src, /new Intl\.NumberFormat/);
    assert.doesNotMatch(src, /\\B\(\?=/);
  });

  // ── localStorage helpers ───────────────────────────────────────────────────

  it('has a localStorage key helper for payment events', () => {
    assert.match(src, /function \w+StorageKey|function \w+Key/);
    assert.match(src, /etgo:payment/);
  });

  it('has a function that reads from localStorage', () => {
    assert.match(src, /localStorage\.getItem/);
  });

  it('has a function that writes to localStorage', () => {
    assert.match(src, /localStorage\.setItem/);
  });

  // ── Event listener ─────────────────────────────────────────────────────────

  it('listens for neo:processSuccess events', () => {
    assert.match(src, /neo:processSuccess/);
    assert.match(src, /window\.addEventListener/);
    assert.match(src, /window\.removeEventListener/);
  });

  it('detects etprReactivatePayment process columnName', () => {
    assert.match(src, /etprReactivatePayment/);
    assert.match(src, /columnName/);
  });

  // ── Activity items ─────────────────────────────────────────────────────────

  it('renders cobroCreado/pagoCreado activity item', () => {
    assert.match(src, /cobroCreado/);
    assert.match(src, /pagoCreado/);
  });

  it('renders cobroConfirmado/pagoConfirmado activity item', () => {
    assert.match(src, /cobroConfirmado/);
    assert.match(src, /pagoConfirmado/);
  });

  it('renders cobroReactivado/pagoReactivado activity item', () => {
    assert.match(src, /cobroReactivado/);
    assert.match(src, /pagoReactivado/);
  });

  // ── i18n ───────────────────────────────────────────────────────────────────

  it('uses useUI hook from @/i18n', () => {
    assert.match(src, /import.*useUI.*from '@\/i18n'/);
    assert.match(src, /useUI\(\)/);
  });

  // ── Entity fetch ───────────────────────────────────────────────────────────

  it('fetches finPaymentScheduleDetail entity for isIn direction', () => {
    assert.match(src, /finPaymentScheduleDetail/);
    assert.match(src, /isIn/);
  });

});
