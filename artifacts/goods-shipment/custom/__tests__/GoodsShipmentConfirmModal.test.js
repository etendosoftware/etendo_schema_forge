import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, '..', 'GoodsShipmentConfirmModal.jsx'), 'utf8');

describe('GoodsShipmentConfirmModal', () => {
  it('exports a default function component named GoodsShipmentConfirmModal', () => {
    assert.match(src, /export default function GoodsShipmentConfirmModal/);
  });

  it('imports ConfirmInOutModal from @/components/contract-ui', () => {
    assert.match(src, /import ConfirmInOutModal from '@\/components\/contract-ui\/ConfirmInOutModal'/);
  });

  it('imports useUI from @/i18n', () => {
    assert.match(src, /import\s*\{[^}]*useUI[^}]*\}\s*from\s*['"]@\/i18n['"]/);
  });

  // ── ETP-4848: invoice checkbox default ─────────────────────────────────────
  // GoodsShipmentConfirmModal is only ever mounted by GoodsShipmentActions when
  // data.invoiceStatus < 100 (see the `!isCompleted && showConfirmModal &&` branch,
  // the fully-invoiced case renders ConfirmShipmentInvoicedModal instead), so this
  // modal can hardcode defaultCreateInvoice=true unconditionally.
  describe('invoice checkbox default (ETP-4848)', () => {
    it('passes defaultCreateInvoice={true} to ConfirmInOutModal', () => {
      assert.match(src, /defaultCreateInvoice=\{true\}/);
    });

    it('does not pass defaultCreateInvoice={false} (regression guard)', () => {
      assert.doesNotMatch(src, /defaultCreateInvoice=\{false\}/);
    });

    it('passes a non-empty invoiceAction so the toggle actually renders', () => {
      assert.match(src, /invoiceAction="createDraftInvoice"/);
    });
  });

  it('passes recordId, base, headers through from props', () => {
    assert.match(src, /base=\{base\}/);
    assert.match(src, /headers=\{headers\}/);
    assert.match(src, /recordId=\{recordId\}/);
  });

  it('passes onConfirmed and onClose through from props', () => {
    assert.match(src, /onConfirmed=\{onConfirmed\}/);
    assert.match(src, /onClose=\{onClose\}/);
  });
});
