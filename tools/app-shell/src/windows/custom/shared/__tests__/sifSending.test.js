import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getPendingSifTargets,
  getSifBodyKey,
  getSifTbaiSuccessKey,
  getSifTbaiErrorKey,
} from '../sifSending.js';

describe('sifSending', () => {
  describe('getPendingSifTargets', () => {
    it('keeps only SII pending for purchase invoices with sii+tbai when nothing was sent yet', () => {
      assert.deepEqual(
        getPendingSifTargets('purchase-invoice', 'sii+tbai', {
          aeatsiiIssent: false,
          tbaiIssent: false,
        }),
        { sendSii: true, sendTbai: false },
      );
    });

    it('keeps both targets pending for sales invoices with sii+tbai when nothing was sent yet', () => {
      assert.deepEqual(
        getPendingSifTargets('sales-invoice', 'sii+tbai', {
          aeatsiiIssent: false,
          tbaiIssent: false,
        }),
        { sendSii: true, sendTbai: true },
      );
    });

    it('supports partial retry by keeping only the failed target pending', () => {
      assert.deepEqual(
        getPendingSifTargets('sales-invoice', 'sii+tbai', {
          aeatsiiIssent: true,
          tbaiIssent: false,
        }),
        { sendSii: false, sendTbai: true },
      );
    });

    it('treats Etendo Y values as already sent', () => {
      assert.deepEqual(
        getPendingSifTargets('sales-invoice', 'tbai', { tbaiIssent: 'Y' }),
        { sendSii: false, sendTbai: false },
      );
    });

    // ETP-5087: purchase-invoice TBAI eligibility follows the active TBAI config's territory.
    it('includes TBAI for a purchase invoice when the TBAI territory is Bizkaia', () => {
      assert.deepEqual(
        getPendingSifTargets('purchase-invoice', 'sii+tbai', {
          aeatsiiIssent: false,
          tbaiIssent: false,
        }, 'BIZKAIA'),
        { sendSii: true, sendTbai: true },
      );
    });

    it('excludes TBAI for a purchase invoice when the TBAI territory is Alava', () => {
      assert.deepEqual(
        getPendingSifTargets('purchase-invoice', 'sii+tbai', {
          aeatsiiIssent: false,
          tbaiIssent: false,
        }, 'ARABA'),
        { sendSii: true, sendTbai: false },
      );
    });

    it('excludes TBAI for a purchase invoice when the TBAI territory is Gipuzkoa', () => {
      assert.deepEqual(
        getPendingSifTargets('purchase-invoice', 'sii+tbai', {
          aeatsiiIssent: false,
          tbaiIssent: false,
        }, 'GIPUZKOA'),
        { sendSii: true, sendTbai: false },
      );
    });

    it('keeps TBAI available for a sales invoice regardless of territory', () => {
      assert.deepEqual(
        getPendingSifTargets('sales-invoice', 'sii+tbai', {
          aeatsiiIssent: false,
          tbaiIssent: false,
        }, 'ARABA'),
        { sendSii: true, sendTbai: true },
      );
    });

    it('does not break and excludes TBAI for a purchase invoice when no TBAI config exists (territory null)', () => {
      assert.deepEqual(
        getPendingSifTargets('purchase-invoice', 'sii+tbai', {
          aeatsiiIssent: false,
          tbaiIssent: false,
        }, null),
        { sendSii: true, sendTbai: false },
      );
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
