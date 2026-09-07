import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPendingSifTargets, getSifBodyKey } from '../sifSending.js';

// A TBAI adoption date safely in the past relative to the fixture invoice dates
// below, so these pre-ETP-5122 cases keep passing the (new) date gate.
const TBAI_RECORD = { tbaisystemdate: '2020-01-01T00:00:00.000Z' };

describe('sifSending', () => {
  describe('getPendingSifTargets', () => {
    it('keeps only SII pending for purchase invoices with sii+tbai when nothing was sent yet', () => {
      assert.deepEqual(
        getPendingSifTargets('purchase-invoice', 'sii+tbai', {
          aeatsiiIssent: false,
          tbaiIssent: false,
          invoiceDate: '2026-01-01',
        }, TBAI_RECORD),
        { sendSii: true, sendTbai: false },
      );
    });

    it('keeps both targets pending for sales invoices with sii+tbai when nothing was sent yet', () => {
      assert.deepEqual(
        getPendingSifTargets('sales-invoice', 'sii+tbai', {
          aeatsiiIssent: false,
          tbaiIssent: false,
          invoiceDate: '2026-01-01',
        }, TBAI_RECORD),
        { sendSii: true, sendTbai: true },
      );
    });

    it('supports partial retry by keeping only the failed target pending', () => {
      assert.deepEqual(
        getPendingSifTargets('sales-invoice', 'sii+tbai', {
          aeatsiiIssent: true,
          tbaiIssent: false,
          invoiceDate: '2026-01-01',
        }, TBAI_RECORD),
        { sendSii: false, sendTbai: true },
      );
    });

    it('treats Etendo Y values as already sent', () => {
      assert.deepEqual(
        getPendingSifTargets('sales-invoice', 'tbai', {
          tbaiIssent: 'Y',
          invoiceDate: '2026-01-01',
        }, TBAI_RECORD),
        { sendSii: false, sendTbai: false },
      );
    });

    // ETP-5122 — TBAI must not be offered on an invoice dated before the org's
    // TBAI adoption date, even when every other condition (profile, status,
    // not-yet-sent) says it should be pending.
    describe('TBAI adoption-date gate (ETP-5122)', () => {
      it('keeps TBAI pending when the invoice date is after the adoption date', () => {
        assert.deepEqual(
          getPendingSifTargets('sales-invoice', 'tbai', {
            tbaiIssent: false,
            invoiceDate: '2026-06-15',
          }, { tbaisystemdate: '2026-01-01T00:00:00.000Z' }),
          { sendSii: false, sendTbai: true },
        );
      });

      it('keeps TBAI pending when the invoice date equals the adoption date (inclusive)', () => {
        assert.deepEqual(
          getPendingSifTargets('sales-invoice', 'tbai', {
            tbaiIssent: false,
            invoiceDate: '2026-01-01',
          }, { tbaisystemdate: '2026-01-01T00:00:00.000Z' }),
          { sendSii: false, sendTbai: true },
        );
      });

      it('hides TBAI when the invoice date is before the adoption date', () => {
        assert.deepEqual(
          getPendingSifTargets('sales-invoice', 'tbai', {
            tbaiIssent: false,
            invoiceDate: '2025-12-31',
          }, { tbaisystemdate: '2026-01-01T00:00:00.000Z' }),
          { sendSii: false, sendTbai: false },
        );
      });

      it('hides TBAI when no TBAI config (or adoption date) is available at all', () => {
        assert.deepEqual(
          getPendingSifTargets('sales-invoice', 'tbai', {
            tbaiIssent: false,
            invoiceDate: '2026-06-15',
          }, null),
          { sendSii: false, sendTbai: false },
        );
      });
    });
  });

  describe('getSifBodyKey', () => {
    it('uses the combined confirmation copy when both targets are pending', () => {
      assert.equal(getSifBodyKey({ sendSii: true, sendTbai: true }), 'sendToSifBodyBoth');
    });

    it('uses the TBAI confirmation copy when only TBAI is pending', () => {
      assert.equal(getSifBodyKey({ sendSii: false, sendTbai: true }), 'sendToSifBodyTbai');
    });

    it('uses the SII confirmation copy when SII is the only pending target', () => {
      assert.equal(getSifBodyKey({ sendSii: true, sendTbai: false }), 'sendToSifBodySii');
    });
  });
});
