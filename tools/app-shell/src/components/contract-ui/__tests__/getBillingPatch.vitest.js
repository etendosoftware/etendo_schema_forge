import { describe, it, expect } from 'vitest';
import { getBillingPatch } from '../CreateContactModal.jsx';

/**
 * Behavioral unit tests for the pure `getBillingPatch(opts, form)` helper
 * extracted from CreateContactModal. These tests import and CALL the function,
 * asserting the exact shape of the produced patch object.
 *
 * Key behaviors under test:
 * - Form values take precedence over `first()` fallback (opts[key].options[0].id).
 * - Customer keys only appear when `form.isCustomer` is truthy.
 * - Vendor keys only appear when `form.isVendor` is truthy.
 * - `customerBlocking` / `vendorBlocking` are emitted UNCONDITIONALLY whenever
 *   the respective flag is true, regardless of the block value (even undefined).
 */

// Helper to build an opts entry shaped like { options: [{ id }, ...] }.
const optWith = (id) => ({ options: [{ id }] });

describe('getBillingPatch', () => {
  it('maps explicit customer form values (customer-only)', () => {
    const opts = {};
    const form = {
      isCustomer: true,
      isVendor: false,
      salesPriceList: 'PL_SALE',
      paymentMethod: 'PM_SALE',
      paymentTerm: 'PT_SALE',
      financialAccount: 'FA_SALE',
      customerBlock: false,
    };

    const patch = getBillingPatch(opts, form);

    expect(patch).toEqual({
      priceList: 'PL_SALE',
      paymentMethod: 'PM_SALE',
      paymentTerms: 'PT_SALE',
      account: 'FA_SALE',
      customerBlocking: false,
    });
    // No vendor keys present.
    expect(patch).not.toHaveProperty('purchasePricelist');
    expect(patch).not.toHaveProperty('pOPaymentMethod');
    expect(patch).not.toHaveProperty('pOPaymentTerms');
    expect(patch).not.toHaveProperty('pOFinancialAccount');
    expect(patch).not.toHaveProperty('vendorBlocking');
  });

  it('maps explicit vendor form values (vendor-only)', () => {
    const opts = {};
    const form = {
      isCustomer: false,
      isVendor: true,
      purchasePriceList: 'PL_PO',
      paymentMethodPO: 'PM_PO',
      paymentTermPO: 'PT_PO',
      financialAccountPO: 'FA_PO',
      paymentBlock: true,
    };

    const patch = getBillingPatch(opts, form);

    expect(patch).toEqual({
      purchasePricelist: 'PL_PO',
      pOPaymentMethod: 'PM_PO',
      pOPaymentTerms: 'PT_PO',
      pOFinancialAccount: 'FA_PO',
      vendorBlocking: true,
    });
    // No customer keys present.
    expect(patch).not.toHaveProperty('priceList');
    expect(patch).not.toHaveProperty('paymentMethod');
    expect(patch).not.toHaveProperty('paymentTerms');
    expect(patch).not.toHaveProperty('account');
    expect(patch).not.toHaveProperty('customerBlocking');
  });

  it('emits all keys when both customer and vendor are true', () => {
    const opts = {};
    const form = {
      isCustomer: true,
      isVendor: true,
      salesPriceList: 'PL_SALE',
      paymentMethod: 'PM_SALE',
      paymentTerm: 'PT_SALE',
      financialAccount: 'FA_SALE',
      customerBlock: true,
      purchasePriceList: 'PL_PO',
      paymentMethodPO: 'PM_PO',
      paymentTermPO: 'PT_PO',
      financialAccountPO: 'FA_PO',
      paymentBlock: false,
    };

    const patch = getBillingPatch(opts, form);

    expect(patch).toEqual({
      priceList: 'PL_SALE',
      paymentMethod: 'PM_SALE',
      paymentTerms: 'PT_SALE',
      account: 'FA_SALE',
      customerBlocking: true,
      purchasePricelist: 'PL_PO',
      pOPaymentMethod: 'PM_PO',
      pOPaymentTerms: 'PT_PO',
      pOFinancialAccount: 'FA_PO',
      vendorBlocking: false,
    });
  });

  it('falls back to opts[key].options[0].id when a customer form value is falsy', () => {
    const opts = {
      salesPriceLists: optWith('PL1'),
      paymentMethods: optWith('PM1'),
      paymentTerms: optWith('PT1'),
      financialAccounts: optWith('FA1'),
    };
    const form = {
      isCustomer: true,
      isVendor: false,
      // All customer values empty -> fall back to first() of opts.
      salesPriceList: '',
      paymentMethod: undefined,
      paymentTerm: null,
      financialAccount: '',
      customerBlock: true,
    };

    const patch = getBillingPatch(opts, form);

    expect(patch).toEqual({
      priceList: 'PL1',
      paymentMethod: 'PM1',
      paymentTerms: 'PT1',
      account: 'FA1',
      customerBlocking: true,
    });
  });

  it('falls back to shared paymentMethods/paymentTerms/financialAccounts options for vendor PO fields', () => {
    // The vendor PO fields reuse the SAME opts keys as the customer fields:
    // paymentMethods, paymentTerms, financialAccounts. Only the price list differs
    // (purchasePriceLists). This test pins that shared-fallback behavior.
    const opts = {
      purchasePriceLists: optWith('PPL1'),
      paymentMethods: optWith('PM_SHARED'),
      paymentTerms: optWith('PT_SHARED'),
      financialAccounts: optWith('FA_SHARED'),
    };
    const form = {
      isCustomer: false,
      isVendor: true,
      purchasePriceList: '',
      paymentMethodPO: '',
      paymentTermPO: '',
      financialAccountPO: '',
      paymentBlock: false,
    };

    const patch = getBillingPatch(opts, form);

    expect(patch).toEqual({
      purchasePricelist: 'PPL1',
      pOPaymentMethod: 'PM_SHARED',
      pOPaymentTerms: 'PT_SHARED',
      pOFinancialAccount: 'FA_SHARED',
      vendorBlocking: false,
    });
  });

  it('drops optional keys with empty opts and empty form, but still emits *Blocking keys (customer)', () => {
    const opts = {}; // no options -> first() returns undefined
    const form = {
      isCustomer: true,
      isVendor: false,
      // All value fields falsy and no fallback available.
      customerBlock: undefined, // block value is undefined...
    };

    const patch = getBillingPatch(opts, form);

    // The value-bearing keys are dropped (conditional spread short-circuits),
    // but customerBlocking is emitted unconditionally with the undefined value.
    expect(patch).toEqual({ customerBlocking: undefined });
    expect(Object.keys(patch)).toEqual(['customerBlocking']);
    expect(patch).not.toHaveProperty('priceList');
    expect(patch).not.toHaveProperty('paymentMethod');
    expect(patch).not.toHaveProperty('paymentTerms');
    expect(patch).not.toHaveProperty('account');
  });

  it('drops optional keys with empty opts and empty form, but still emits *Blocking keys (vendor)', () => {
    const opts = {};
    const form = {
      isCustomer: false,
      isVendor: true,
      paymentBlock: undefined,
    };

    const patch = getBillingPatch(opts, form);

    expect(patch).toEqual({ vendorBlocking: undefined });
    expect(Object.keys(patch)).toEqual(['vendorBlocking']);
  });

  it('returns an empty object when neither flag is set', () => {
    const opts = {
      salesPriceLists: optWith('PL1'),
      paymentMethods: optWith('PM1'),
    };
    const form = { isCustomer: false, isVendor: false };

    const patch = getBillingPatch(opts, form);

    expect(patch).toEqual({});
    expect(Object.keys(patch)).toHaveLength(0);
  });
});
