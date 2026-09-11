import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPendingSifTargets,
  getSifBodyKey,
  getSifTbaiSuccessKey,
  getSifTbaiErrorKey,
} from '../sifSending.js';

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
        }, null, TBAI_RECORD),
        { sendSii: true, sendTbai: false },
      );
    });

    it('keeps both targets pending for sales invoices with sii+tbai when nothing was sent yet', () => {
      assert.deepEqual(
        getPendingSifTargets('sales-invoice', 'sii+tbai', {
          aeatsiiIssent: false,
          tbaiIssent: false,
          invoiceDate: '2026-01-01',
        }, null, TBAI_RECORD),
        { sendSii: true, sendTbai: true },
      );
    });

    it('supports partial retry by keeping only the failed target pending', () => {
      assert.deepEqual(
        getPendingSifTargets('sales-invoice', 'sii+tbai', {
          aeatsiiIssent: true,
          tbaiIssent: false,
          invoiceDate: '2026-01-01',
        }, null, TBAI_RECORD),
        { sendSii: false, sendTbai: true },
      );
    });

    it('treats Etendo Y values as already sent', () => {
      assert.deepEqual(
        getPendingSifTargets('sales-invoice', 'tbai', {
          tbaiIssent: 'Y',
          invoiceDate: '2026-01-01',
        }, null, TBAI_RECORD),
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
          }, null, { tbaisystemdate: '2026-01-01T00:00:00.000Z' }),
          { sendSii: false, sendTbai: true },
        );
      });

      it('keeps TBAI pending when the invoice date equals the adoption date (inclusive)', () => {
        assert.deepEqual(
          getPendingSifTargets('sales-invoice', 'tbai', {
            tbaiIssent: false,
            invoiceDate: '2026-01-01',
          }, null, { tbaisystemdate: '2026-01-01T00:00:00.000Z' }),
          { sendSii: false, sendTbai: true },
        );
      });

      it('hides TBAI when the invoice date is before the adoption date', () => {
        assert.deepEqual(
          getPendingSifTargets('sales-invoice', 'tbai', {
            tbaiIssent: false,
            invoiceDate: '2025-12-31',
          }, null, { tbaisystemdate: '2026-01-01T00:00:00.000Z' }),
          { sendSii: false, sendTbai: false },
        );
      });

      it('hides TBAI when no TBAI config (or adoption date) is available at all', () => {
        assert.deepEqual(
          getPendingSifTargets('sales-invoice', 'tbai', {
            tbaiIssent: false,
            invoiceDate: '2026-06-15',
          }, null, null),
          { sendSii: false, sendTbai: false },
        );
      });
    });

    // ETP-5087: purchase-invoice TBAI eligibility follows the active TBAI config's territory.
    describe('TBAI territory gate (ETP-5087)', () => {
      it('includes TBAI for a purchase invoice when the TBAI territory is Bizkaia', () => {
        assert.deepEqual(
          getPendingSifTargets('purchase-invoice', 'sii+tbai', {
            aeatsiiIssent: false,
            tbaiIssent: false,
            invoiceDate: '2026-01-01',
          }, 'BIZKAIA', TBAI_RECORD),
          { sendSii: true, sendTbai: true },
        );
      });

      it('excludes TBAI for a purchase invoice when the TBAI territory is Alava', () => {
        assert.deepEqual(
          getPendingSifTargets('purchase-invoice', 'sii+tbai', {
            aeatsiiIssent: false,
            tbaiIssent: false,
            invoiceDate: '2026-01-01',
          }, 'ARABA', TBAI_RECORD),
          { sendSii: true, sendTbai: false },
        );
      });

      it('excludes TBAI for a purchase invoice when the TBAI territory is Gipuzkoa', () => {
        assert.deepEqual(
          getPendingSifTargets('purchase-invoice', 'sii+tbai', {
            aeatsiiIssent: false,
            tbaiIssent: false,
            invoiceDate: '2026-01-01',
          }, 'GIPUZKOA', TBAI_RECORD),
          { sendSii: true, sendTbai: false },
        );
      });

      it('keeps TBAI available for a sales invoice regardless of territory', () => {
        assert.deepEqual(
          getPendingSifTargets('sales-invoice', 'sii+tbai', {
            aeatsiiIssent: false,
            tbaiIssent: false,
            invoiceDate: '2026-01-01',
          }, 'ARABA', TBAI_RECORD),
          { sendSii: true, sendTbai: true },
        );
      });

      it('does not break and excludes TBAI for a purchase invoice when no TBAI config exists (territory null)', () => {
        assert.deepEqual(
          getPendingSifTargets('purchase-invoice', 'sii+tbai', {
            aeatsiiIssent: false,
            tbaiIssent: false,
            invoiceDate: '2026-01-01',
          }, null, TBAI_RECORD),
          { sendSii: true, sendTbai: false },
        );
      });
    });

    // ETP-5122 + ETP-5087 combined: territory and date are independent gates,
    // ANDed together — TBAI is only pending when BOTH the territory qualifies
    // (Bizkaia, for a purchase document) AND the invoice date is on/after the
    // org's adoption date.
    describe('territory + date combined gate (ETP-5122 + ETP-5087)', () => {
      const ADOPTED = { tbaisystemdate: '2026-01-01T00:00:00.000Z' };

      it('shows TBAI for a purchase invoice in Bizkaia dated after adoption', () => {
        assert.deepEqual(
          getPendingSifTargets('purchase-invoice', 'sii+tbai', {
            aeatsiiIssent: false,
            tbaiIssent: false,
            invoiceDate: '2026-06-15',
          }, 'BIZKAIA', ADOPTED),
          { sendSii: true, sendTbai: true },
        );
      });

      it('hides TBAI for a purchase invoice in Bizkaia dated before adoption', () => {
        assert.deepEqual(
          getPendingSifTargets('purchase-invoice', 'sii+tbai', {
            aeatsiiIssent: false,
            tbaiIssent: false,
            invoiceDate: '2025-12-31',
          }, 'BIZKAIA', ADOPTED),
          { sendSii: true, sendTbai: false },
        );
      });

      it('hides TBAI for a purchase invoice outside Bizkaia even when dated after adoption', () => {
        assert.deepEqual(
          getPendingSifTargets('purchase-invoice', 'sii+tbai', {
            aeatsiiIssent: false,
            tbaiIssent: false,
            invoiceDate: '2026-06-15',
          }, 'ARABA', ADOPTED),
          { sendSii: true, sendTbai: false },
        );
      });

      it('hides TBAI for a sales invoice (territory irrelevant) dated before adoption', () => {
        assert.deepEqual(
          getPendingSifTargets('sales-invoice', 'sii+tbai', {
            aeatsiiIssent: false,
            tbaiIssent: false,
            invoiceDate: '2025-12-31',
          }, null, ADOPTED),
          { sendSii: true, sendTbai: false },
        );
      });
    });
  });

  describe('getSifBodyKey', () => {
    it('uses the combined confirmation copy when both targets are pending (sales)', () => {
      assert.equal(getSifBodyKey('sales-invoice', { sendSii: true, sendTbai: true }), 'sendToSifBodyBoth');
    });

    it('uses the TBAI confirmation copy when only TBAI is pending (sales)', () => {
      assert.equal(getSifBodyKey('sales-invoice', { sendSii: false, sendTbai: true }), 'sendToSifBodyTbai');
    });

    it('uses the SII confirmation copy when SII is the only pending target', () => {
      assert.equal(getSifBodyKey('sales-invoice', { sendSii: true, sendTbai: false }), 'sendToSifBodySii');
    });

    it('uses the SII confirmation copy for purchase invoices too, when SII is the only pending target', () => {
      assert.equal(getSifBodyKey('purchase-invoice', { sendSii: true, sendTbai: false }), 'sendToSifBodySii');
    });

    // ETP-5027: purchase-invoice TBAI is always Batuz (fiscalTargets.js only ever
    // grants it under the Bizkaia territory — ETP-5087), so the confirmation copy
    // must say "Batuz", never the generic "TicketBAI" wording sales invoices use.
    it('uses the Batuz-specific copy when only TBAI is pending for a purchase invoice', () => {
      assert.equal(getSifBodyKey('purchase-invoice', { sendSii: false, sendTbai: true }), 'sendToSifBodyTbaiPurchase');
    });

    it('uses the combined SII + Batuz copy when both targets are pending for a purchase invoice', () => {
      assert.equal(getSifBodyKey('purchase-invoice', { sendSii: true, sendTbai: true }), 'sendToSifBodyBothPurchase');
    });

    it('keeps the generic TicketBAI wording for sales invoices even when both targets are pending', () => {
      assert.equal(getSifBodyKey('sales-invoice', { sendSii: true, sendTbai: true }), 'sendToSifBodyBoth');
      assert.equal(getSifBodyKey('sales-invoice', { sendSii: false, sendTbai: true }), 'sendToSifBodyTbai');
    });
  });

  // ETP-5087: the RESULT copy must follow the same purchase/sales split the
  // confirmation copy uses — the modal used to report "Enviado a TicketBAI
  // correctamente." for an invoice the user had just confirmed sending to Batuz.
  describe('getSifTbaiSuccessKey', () => {
    it('uses the Batuz-specific success copy for purchase invoices', () => {
      assert.equal(getSifTbaiSuccessKey('purchase-invoice'), 'sendToSifSuccessTbaiPurchase');
    });

    it('keeps the generic TicketBAI success copy for sales invoices', () => {
      assert.equal(getSifTbaiSuccessKey('sales-invoice'), 'sendToSifSuccessTbai');
    });

    it('falls back to the generic success copy for any other spec', () => {
      assert.equal(getSifTbaiSuccessKey('recurring-invoice'), 'sendToSifSuccessTbai');
      assert.equal(getSifTbaiSuccessKey(undefined), 'sendToSifSuccessTbai');
    });
  });

  describe('getSifTbaiErrorKey', () => {
    it('uses the Batuz-specific error copy for purchase invoices', () => {
      assert.equal(getSifTbaiErrorKey('purchase-invoice'), 'sendToSifErrorTbaiPurchase');
    });

    it('keeps the generic TicketBAI error copy for sales invoices', () => {
      assert.equal(getSifTbaiErrorKey('sales-invoice'), 'sendToSifErrorTbai');
    });

    it('falls back to the generic error copy for any other spec', () => {
      assert.equal(getSifTbaiErrorKey('recurring-invoice'), 'sendToSifErrorTbai');
      assert.equal(getSifTbaiErrorKey(undefined), 'sendToSifErrorTbai');
    });
  });
});
