// @covers tools/app-shell/src/windows/custom/shared/orderGlobalDiscountRule.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGlobalDiscountPct,
  resolveOrderGlobalDiscount,
  isCarryingGlobalDiscount,
  shouldPatchInvoiceGlobalDiscount,
} from '../orderGlobalDiscountRule.js';

const order = (docNo, pct) => ({ docNo, pct });

// One row per outcome of the decision. `patchOn` / `patchOff` = expected PATCH predicate with
// the toggle ON / OFF; `carryOn` = expected isCarryingGlobalDiscount with the toggle ON.
const CASES = [
  {
    name: 'empty selection',
    input: { selectedOrders: [], invoicePct: null, invoiceHasLines: false },
    expected: { kind: 'none' },
    carryOn: false, patchOn: false,
  },
  {
    name: 'every order at 0 % and no invoice %',
    input: { selectedOrders: [order('A', 0)], invoicePct: null, invoiceHasLines: true },
    expected: { kind: 'none' },
    carryOn: false, patchOn: false,
  },
  {
    name: 'orders with different % (10 % + 0 %)',
    input: { selectedOrders: [order('A', 10), order('B', 0)], invoicePct: 0, invoiceHasLines: false },
    expected: { kind: 'mixed', orders: [order('A', 10), order('B', 0)], invoicePct: 0 },
    carryOn: false, patchOn: false,
  },
  {
    name: 'invoice 5 % and orders at 0 %',
    input: { selectedOrders: [order('A', 0)], invoicePct: 5, invoiceHasLines: false },
    expected: { kind: 'invoiceMismatch', pct: 0, invoicePct: 5 },
    carryOn: false, patchOn: false,
  },
  {
    name: 'invoice 5 % and orders at 10 %',
    input: { selectedOrders: [order('A', 10)], invoicePct: 5, invoiceHasLines: true },
    expected: { kind: 'invoiceMismatch', pct: 10, invoicePct: 5 },
    carryOn: false, patchOn: false,
  },
  {
    name: 'invoice 0 % that already has lines',
    input: { selectedOrders: [order('A', 10)], invoicePct: 0, invoiceHasLines: true },
    expected: { kind: 'invoiceHasLines', pct: 10, invoicePct: 0 },
    carryOn: false, patchOn: false,
  },
  {
    name: 'invoice 0 % without lines',
    input: { selectedOrders: [order('A', 10), order('B', 10)], invoicePct: null, invoiceHasLines: false },
    expected: { kind: 'carry', pct: 10, invoicePct: 0, matchesInvoice: false },
    carryOn: true, patchOn: true,
  },
  {
    name: 'invoice % equal to the orders % without lines',
    input: { selectedOrders: [order('A', 10)], invoicePct: 10, invoiceHasLines: false },
    expected: { kind: 'carry', pct: 10, invoicePct: 10, matchesInvoice: true },
    carryOn: true, patchOn: false,
  },
  {
    name: 'invoice % equal to the orders % with lines',
    input: { selectedOrders: [order('A', 10)], invoicePct: 10, invoiceHasLines: true },
    expected: { kind: 'carry', pct: 10, invoicePct: 10, matchesInvoice: true },
    carryOn: true, patchOn: false,
  },
  {
    name: 'string and float-noise % compare equal to the invoice %',
    input: { selectedOrders: [order('A', '10.00'), order('B', 10.000001)], invoicePct: '10', invoiceHasLines: true },
    expected: { kind: 'carry', pct: 10, invoicePct: 10, matchesInvoice: true },
    carryOn: true, patchOn: false,
  },
];

describe('resolveOrderGlobalDiscount', () => {
  for (const { name, input, expected } of CASES) {
    it(`${name} → ${expected.kind}`, () => {
      assert.deepEqual(resolveOrderGlobalDiscount(input), expected);
    });
  }
});

describe('isCarryingGlobalDiscount / shouldPatchInvoiceGlobalDiscount', () => {
  for (const { name, input, carryOn, patchOn } of CASES) {
    it(`${name}: carrying=${carryOn}, PATCH=${patchOn} with the toggle ON, both false with it OFF`, () => {
      const decision = resolveOrderGlobalDiscount(input);
      assert.equal(isCarryingGlobalDiscount(decision, true), carryOn);
      assert.equal(shouldPatchInvoiceGlobalDiscount(decision, true), patchOn);
      assert.equal(isCarryingGlobalDiscount(decision, false), false);
      assert.equal(shouldPatchInvoiceGlobalDiscount(decision, false), false);
    });
  }
});

describe('normalizeGlobalDiscountPct', () => {
  const ROWS = [
    [null, 0], [undefined, 0], ['', 0], ['abc', 0], [-5, 0], [0, 0],
    ['10.00', 10], [10.000001, 10], [12.34567, 12.3457],
  ];
  for (const [raw, expected] of ROWS) {
    it(`${JSON.stringify(raw)} → ${expected}`, () => {
      assert.equal(normalizeGlobalDiscountPct(raw), expected);
    });
  }
});
