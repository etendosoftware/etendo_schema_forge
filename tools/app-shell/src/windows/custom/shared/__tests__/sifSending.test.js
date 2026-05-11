import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPendingSifTargets, getSifBodyKey } from '../sifSending.js';

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
