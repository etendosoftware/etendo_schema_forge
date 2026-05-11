import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getInvoiceFiscalTargets } from '../fiscalTargets.js';

describe('getInvoiceFiscalTargets', () => {
  it('shows only SII for purchase invoices with sii+tbai', () => {
    assert.deepEqual(getInvoiceFiscalTargets('purchase-invoice', 'sii+tbai'), {
      showSii: true,
      showTbai: false,
      showVerifactu: false,
    });
  });

  it('shows both SII and TBAI for sales invoices with sii+tbai', () => {
    assert.deepEqual(getInvoiceFiscalTargets('sales-invoice', 'sii+tbai'), {
      showSii: true,
      showTbai: true,
      showVerifactu: false,
    });
  });

  it('shows only Verifactu for both invoice specs with verifactu', () => {
    assert.deepEqual(getInvoiceFiscalTargets('sales-invoice', 'verifactu'), {
      showSii: false,
      showTbai: false,
      showVerifactu: true,
    });
    assert.deepEqual(getInvoiceFiscalTargets('purchase-invoice', 'verifactu'), {
      showSii: false,
      showTbai: false,
      showVerifactu: true,
    });
  });
});
