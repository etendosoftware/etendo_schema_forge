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

// ---------------------------------------------------------------------------
// ETP-5027 — full document-direction matrix.
//
// The gate was extended from the two invoice specs to the two ORDER specs, and
// TBAI on a PURCHASE document was deliberately LOOSENED: it had been suppressed
// outright, but Batuz/LROE does send purchases under BIZKAIA. These tests pin the
// whole matrix so neither half of that change can silently regress:
//
//   Document                          SII | TBAI                  | VERI*FACTU
//   sales-invoice / sales-order       yes | yes (any territory)   | yes
//   purchase-invoice / purchase-order yes | only if BIZKAIA       | never
// ---------------------------------------------------------------------------

const SALES_SPECS = ['sales-invoice', 'sales-order'];
const PURCHASE_SPECS = ['purchase-invoice', 'purchase-order'];
const TERRITORIES = [undefined, null, 'ARABA', 'BIZKAIA', 'GIPUZKOA'];

describe('getInvoiceFiscalTargets — ETP-5027 order specs are gated like their invoice', () => {
  for (const profile of ['sii', 'sii-navarra', 'tbai', 'sii+tbai', 'verifactu', 'unconfigured']) {
    for (const territory of TERRITORIES) {
      it(`sales-order matches sales-invoice for profile ${profile} / territory ${territory}`, () => {
        assert.deepEqual(
          getInvoiceFiscalTargets('sales-order', profile, territory),
          getInvoiceFiscalTargets('sales-invoice', profile, territory),
        );
      });

      it(`purchase-order matches purchase-invoice for profile ${profile} / territory ${territory}`, () => {
        assert.deepEqual(
          getInvoiceFiscalTargets('purchase-order', profile, territory),
          getInvoiceFiscalTargets('purchase-invoice', profile, territory),
        );
      });
    }
  }
});

describe('getInvoiceFiscalTargets — VERI*FACTU is sales-only across all four specs', () => {
  for (const territory of TERRITORIES) {
    for (const spec of SALES_SPECS) {
      it(`${spec} keeps VERI*FACTU with territory ${territory}`, () => {
        // Territory is a TBAI concept and must never influence the VERI*FACTU flag.
        assert.deepEqual(getInvoiceFiscalTargets(spec, 'verifactu', territory), {
          showSii: false,
          showTbai: false,
          showVerifactu: true,
        });
      });
    }

    for (const spec of PURCHASE_SPECS) {
      it(`${spec} never gets VERI*FACTU, not even with territory ${territory}`, () => {
        assert.deepEqual(getInvoiceFiscalTargets(spec, 'verifactu', territory), {
          showSii: false,
          showTbai: false,
          showVerifactu: false,
        });
      });
    }
  }
});

describe('getInvoiceFiscalTargets — TBAI reaches purchases ONLY under BIZKAIA', () => {
  for (const profile of ['tbai', 'sii+tbai']) {
    for (const spec of PURCHASE_SPECS) {
      // The deliberate loosening: this used to be false and was wrong (Batuz/LROE).
      it(`${spec} SHOWS TBAI under BIZKAIA with profile ${profile}`, () => {
        assert.equal(getInvoiceFiscalTargets(spec, profile, 'BIZKAIA').showTbai, true);
      });

      for (const territory of [undefined, null, 'ARABA', 'GIPUZKOA', 'bizkaia', '']) {
        it(`${spec} hides TBAI for territory ${territory} with profile ${profile}`, () => {
          assert.equal(getInvoiceFiscalTargets(spec, profile, territory).showTbai, false);
        });
      }
    }

    for (const spec of SALES_SPECS) {
      for (const territory of TERRITORIES) {
        it(`${spec} shows TBAI for any territory ${territory} with profile ${profile}`, () => {
          assert.equal(getInvoiceFiscalTargets(spec, profile, territory).showTbai, true);
        });
      }
    }
  }
});

describe('getInvoiceFiscalTargets — SII is direction-agnostic but spec-aware', () => {
  for (const profile of ['sii', 'sii-navarra', 'sii+tbai']) {
    for (const spec of [...SALES_SPECS, ...PURCHASE_SPECS]) {
      it(`${spec} shows SII with profile ${profile}`, () => {
        assert.equal(getInvoiceFiscalTargets(spec, profile, 'BIZKAIA').showSii, true);
      });
    }
  }

  it('an unrecognised spec gets nothing even on an SII profile', () => {
    assert.deepEqual(getInvoiceFiscalTargets('payment-in', 'sii'), {
      showSii: false,
      showTbai: false,
      showVerifactu: false,
    });
  });

  for (const spec of [null, undefined, '']) {
    it(`a ${spec} spec gets nothing on any profile`, () => {
      for (const profile of ['sii', 'tbai', 'sii+tbai', 'verifactu']) {
        assert.deepEqual(getInvoiceFiscalTargets(spec, profile, 'BIZKAIA'), {
          showSii: false,
          showTbai: false,
          showVerifactu: false,
        });
      }
    });
  }
});
