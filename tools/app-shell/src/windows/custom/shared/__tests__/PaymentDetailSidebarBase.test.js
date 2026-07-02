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

  it('accepts dir, specName, data, token, apiBaseUrl props', () => {
    assert.match(src, /\{\s*dir\s*,\s*specName\s*,\s*data\s*,\s*token\s*,\s*apiBaseUrl\s*\}/);
  });

  // ── Amount formatting ──────────────────────────────────────────────────────

  it('uses Intl.NumberFormat for amount formatting (not a regex pattern)', () => {
    assert.match(src, /new Intl\.NumberFormat/);
    assert.doesNotMatch(src, /\\B\(\?=/);
  });

  // ── localStorage helpers ───────────────────────────────────────────────────

  it('has eventStorageKey helper for localStorage keys', () => {
    assert.match(src, /function eventStorageKey/);
    assert.match(src, /etgo:payment/);
  });

  it('has readEventAt function that reads from localStorage', () => {
    assert.match(src, /function readEventAt/);
    assert.match(src, /localStorage\.getItem/);
  });

  it('has writeEventAt function that writes to localStorage', () => {
    assert.match(src, /function writeEventAt/);
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
