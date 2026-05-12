import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getInvoiceFiscalTargets } from '../fiscalTargets.js';

describe('getInvoiceFiscalTargets — sii+tbai profile', () => {
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
});

// Guards: Verifactu is restricted to sales invoices only.
// Risk: Verifactu was briefly isSales || isPurchase before this was corrected.
describe('getInvoiceFiscalTargets — verifactu profile (sales-only)', () => {
  it('shows Verifactu for sales invoice', () => {
    assert.deepEqual(getInvoiceFiscalTargets('sales-invoice', 'verifactu'), {
      showSii: false,
      showTbai: false,
      showVerifactu: true,
    });
  });

  it('does NOT show Verifactu for purchase invoice', () => {
    assert.deepEqual(getInvoiceFiscalTargets('purchase-invoice', 'verifactu'), {
      showSii: false,
      showTbai: false,
      showVerifactu: false,
    });
  });
});

// Guards: TBAI is restricted to sales invoices only.
// Risk: TBAI was briefly isSales || isPurchase before this was corrected.
describe('getInvoiceFiscalTargets — tbai profile (sales-only)', () => {
  it('shows TBAI for sales invoice', () => {
    assert.deepEqual(getInvoiceFiscalTargets('sales-invoice', 'tbai'), {
      showSii: false,
      showTbai: true,
      showVerifactu: false,
    });
  });

  it('does NOT show TBAI for purchase invoice', () => {
    assert.deepEqual(getInvoiceFiscalTargets('purchase-invoice', 'tbai'), {
      showSii: false,
      showTbai: false,
      showVerifactu: false,
    });
  });
});

// Guards: SII still works for both invoice types (regression)
describe('getInvoiceFiscalTargets — sii profile', () => {
  it('shows SII for sales invoice', () => {
    assert.deepEqual(getInvoiceFiscalTargets('sales-invoice', 'sii'), {
      showSii: true,
      showTbai: false,
      showVerifactu: false,
    });
  });

  it('shows SII for purchase invoice', () => {
    assert.deepEqual(getInvoiceFiscalTargets('purchase-invoice', 'sii'), {
      showSii: true,
      showTbai: false,
      showVerifactu: false,
    });
  });

  it('shows SII for purchase invoice with sii-navarra', () => {
    assert.deepEqual(getInvoiceFiscalTargets('purchase-invoice', 'sii-navarra'), {
      showSii: true,
      showTbai: false,
      showVerifactu: false,
    });
  });
});

// Guards: unknown profile returns all false
describe('getInvoiceFiscalTargets — unknown profile', () => {
  it('returns all false for an unknown profile', () => {
    assert.deepEqual(getInvoiceFiscalTargets('sales-invoice', 'unknown'), {
      showSii: false,
      showTbai: false,
      showVerifactu: false,
    });
  });
});
