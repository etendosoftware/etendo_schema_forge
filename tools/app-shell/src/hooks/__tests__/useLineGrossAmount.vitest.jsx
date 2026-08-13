import { renderHook } from '@testing-library/react';
import { useRef } from 'react';
import {
  resolveTaxFactor,
  deriveLineNet,
  computeLineGrossAmount,
  computeUnitPriceForPost,
  useLineGrossAmount,
  ORDER_LINE_CONFIG,
  INVOICE_LINE_CONFIG,
} from '../useLineGrossAmount.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TAX_ID = 'TAX-21';

function emptyCache() { return {}; }

// ─── resolveTaxFactor (sibling fallback — covers the qty×price predicate) ─────

describe('resolveTaxFactor — sibling fallback (source 4)', () => {
  it('derives factor from a sibling via lineNetAmount', () => {
    const siblings = [{ tax: TAX_ID, lineGrossAmount: 121, lineNetAmount: 100, discount: 0 }];
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), siblings, 'lineGrossAmount');
    expect(factor).toBeCloseTo(1.21, 5);
  });

  it('selects a sibling via qty×price when its lineNetAmount is absent (predicate branch)', () => {
    // gross > 0, lineNetAmount = 0 → predicate must fall through to qty/price
    // to decide the sibling is usable, then derive the factor from qty×price.
    const siblings = [{ tax: TAX_ID, lineGrossAmount: 121, lineNetAmount: 0, orderedQuantity: 10, unitPrice: 10, discount: 0 }];
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), siblings, 'lineGrossAmount');
    expect(factor).toBeCloseTo(1.21, 5);
  });

  it('uses invoicedQuantity in the predicate when orderedQuantity is absent', () => {
    const siblings = [{ tax: TAX_ID, lineGrossAmount: 121, lineNetAmount: 0, invoicedQuantity: 10, unitPrice: 10, discount: 0 }];
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), siblings, 'lineGrossAmount');
    expect(factor).toBeCloseTo(1.21, 5);
  });

  it('skips a sibling whose gross is zero', () => {
    const siblings = [{ tax: TAX_ID, lineGrossAmount: 0, lineNetAmount: 0, orderedQuantity: 10, unitPrice: 10 }];
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), siblings, 'lineGrossAmount');
    expect(factor).toBeNull();
  });

  it('skips a sibling with a different tax id', () => {
    const siblings = [{ tax: 'OTHER', lineGrossAmount: 121, lineNetAmount: 100 }];
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), siblings, 'lineGrossAmount');
    expect(factor).toBeNull();
  });

  it('skips a usable-looking sibling when qty or price is zero', () => {
    // gross > 0 but net <= 0 and qty/price not both positive → predicate false.
    const siblings = [{ tax: TAX_ID, lineGrossAmount: 121, lineNetAmount: 0, orderedQuantity: 10, unitPrice: 0 }];
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), siblings, 'lineGrossAmount');
    expect(factor).toBeNull();
  });

  it('adjusts for discount when deriving from sibling qty×price', () => {
    // price=100, discount=50% → base = 1*100*0.5 = 50, gross=60.5 → factor=1.21
    const siblings = [{ tax: TAX_ID, lineGrossAmount: 60.5, lineNetAmount: 0, orderedQuantity: 1, unitPrice: 100, discount: 50 }];
    const factor = resolveTaxFactor(TAX_ID, {}, {}, emptyCache(), siblings, 'lineGrossAmount', 'discount');
    expect(factor).toBeCloseTo(1.21, 3);
  });

  it('returns null when taxId is null', () => {
    expect(resolveTaxFactor(null, {}, {}, emptyCache(), [], 'lineGrossAmount')).toBeNull();
  });
});

// ─── deriveLineNet ────────────────────────────────────────────────────────────

describe('deriveLineNet', () => {
  it('qty change → qty×price×discountFactor', () => {
    const net = deriveLineNet('orderedQuantity', '2', {}, { listPrice: 100, discount: 10 }, 'orderedQuantity', 'listPrice', 'discount');
    expect(net).toBeCloseTo(180, 5);
  });

  it('price change → qty×price×discountFactor', () => {
    const net = deriveLineNet('listPrice', '50', {}, { orderedQuantity: 2, discount: 0 }, 'orderedQuantity', 'listPrice', 'discount');
    expect(net).toBeCloseTo(100, 5);
  });

  it('discount change → recomputes with new discount', () => {
    const net = deriveLineNet('discount', '25', {}, { orderedQuantity: 2, listPrice: 100 }, 'orderedQuantity', 'listPrice', 'discount');
    expect(net).toBeCloseTo(150, 5);
  });

  it('product change → trusts callout lineNetAmount when present', () => {
    const net = deriveLineNet('product', 'P1', { lineNetAmount: 99 }, { orderedQuantity: 1 }, 'orderedQuantity', 'listPrice', 'discount');
    expect(net).toBe(99);
  });

  it('tax change → basic net from row qty/price', () => {
    const net = deriveLineNet('tax', TAX_ID, {}, { orderedQuantity: 2, listPrice: 100, discount: 0 }, 'orderedQuantity', 'listPrice', 'discount');
    expect(net).toBeCloseTo(200, 5);
  });

  it('unknown field → falls back to callout/row lineNetAmount', () => {
    const net = deriveLineNet('somethingElse', 'x', {}, { lineNetAmount: 42 }, 'orderedQuantity', 'listPrice', 'discount');
    expect(net).toBe(42);
  });
});

// ─── computeLineGrossAmount ───────────────────────────────────────────────────

describe('computeLineGrossAmount', () => {
  it('writes grossAmount and the config gross field on a qty change', () => {
    const calloutResult = { taxRate: 21 };
    computeLineGrossAmount('orderedQuantity', '2', calloutResult, { listPrice: 100, discount: 0 }, {}, [], ORDER_LINE_CONFIG);
    expect(calloutResult.grossAmount).toBeCloseTo(242, 2);
    expect(calloutResult.lineGrossAmount).toBeCloseTo(242, 2);
  });

  it('trusts callout grossAmount on product change when already set', () => {
    const calloutResult = { grossAmount: 500, taxRate: 21 };
    computeLineGrossAmount('product', 'P1', calloutResult, {}, {}, [], ORDER_LINE_CONFIG);
    expect(calloutResult.grossAmount).toBe(500);
  });

  it('does nothing when net is non-positive', () => {
    const calloutResult = {};
    computeLineGrossAmount('orderedQuantity', '0', calloutResult, { listPrice: 0 }, {}, [], ORDER_LINE_CONFIG);
    expect(calloutResult.grossAmount).toBeUndefined();
  });
});

// ─── computeUnitPriceForPost ──────────────────────────────────────────────────

describe('computeUnitPriceForPost', () => {
  it('derives unitPrice from listPrice and discount', () => {
    // INVOICE_LINE_CONFIG reads its discount from etgoDiscount.
    const lineData = { listPrice: 100, etgoDiscount: 10 };
    computeUnitPriceForPost(lineData, INVOICE_LINE_CONFIG);
    expect(lineData.unitPrice).toBeCloseTo(90, 5);
  });

  it('is a no-op when priceField is already unitPrice', () => {
    const lineData = { unitPrice: 100 };
    computeUnitPriceForPost(lineData, { priceField: 'unitPrice' });
    expect(lineData.unitPrice).toBe(100);
  });
});

// ─── useLineGrossAmount hook (covers the bound useCallback wrappers) ──────────

describe('useLineGrossAmount hook', () => {
  function setup(config = ORDER_LINE_CONFIG, children = []) {
    return renderHook(() => {
      const cacheRef = useRef({});
      return useLineGrossAmount(cacheRef, children, config);
    });
  }

  it('returns the four bound functions', () => {
    const { result } = setup();
    expect(typeof result.current.computeLineGrossAmount).toBe('function');
    expect(typeof result.current.resolveTaxFactor).toBe('function');
    expect(typeof result.current.deriveLineNet).toBe('function');
    expect(typeof result.current.prepareLineForPost).toBe('function');
  });

  it('bound resolveTaxFactor uses the injected cache and children', () => {
    const { result } = setup();
    const factor = result.current.resolveTaxFactor(TAX_ID, { taxRate: 21 }, {});
    expect(factor).toBeCloseTo(1.21, 5);
  });

  it('bound deriveLineNet honors the config fields', () => {
    const { result } = setup();
    const net = result.current.deriveLineNet('orderedQuantity', '2', {}, { listPrice: 100, discount: 0 });
    expect(net).toBeCloseTo(200, 5);
  });

  it('bound computeLineGrossAmount mutates the callout result', () => {
    const { result } = setup();
    const calloutResult = { taxRate: 21 };
    result.current.computeLineGrossAmount('orderedQuantity', '1', calloutResult, { listPrice: 100, discount: 0 });
    expect(calloutResult.grossAmount).toBeCloseTo(121, 2);
  });

  it('bound prepareLineForPost derives unitPrice for invoice config', () => {
    const { result } = setup(INVOICE_LINE_CONFIG);
    const lineData = { listPrice: 100, etgoDiscount: 10 };
    result.current.prepareLineForPost(lineData);
    expect(lineData.unitPrice).toBeCloseTo(90, 5);
  });
});
