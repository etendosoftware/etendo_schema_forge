// @covers tools/app-shell/src/components/related-documents/purchaseRelatedDocs.js
// PURCHASE_RELATED_DOCS is the single definition behind both the form's "Related documents"
// section and the list preview card of the four purchase documents. Mirrors
// salesRelatedDocs.vitest.js: each definition is resolved against a fake backend (helpers
// mocked by their exact arguments) and the resulting chips are asserted after collectRelatedItems.
// New file (not an extension of salesRelatedDocs.vitest.js): that file mocks the helpers for the
// SALES definitions and asserts getSalesRelatedDocs; this one guards a different unit.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend = vi.hoisted(() => ({ byCriteria: {}, byId: {}, listInvoices: {} }));

vi.mock('../helpers.js', () => ({
  fetchByCriteria: vi.fn(async (spec, entity, field, value) => backend.byCriteria[`${spec}/${entity}?${field}=${value}`] ?? []),
  fetchById: vi.fn(async (spec, entity, id) => backend.byId[`${spec}/${entity}/${id}`] ?? null),
  fetchListInvoices: vi.fn(async (spec, entity, id) => backend.listInvoices[`${spec}/${entity}/${id}`] ?? []),
  fetchOriginInvoicesOf: vi.fn((spec) => async ({ record }) => {
    const ids = Array.isArray(record?.originInvoices)
      ? record.originInvoices.map(o => o?.id).filter(Boolean)
      : [record?.originInvoice].filter(Boolean);
    return ids.map(id => backend.byId[`${spec}/header/${id}`]).filter(Boolean);
  }),
}));

import * as helpers from '../helpers.js';
import { PURCHASE_RELATED_DOCS, getPurchaseRelatedDocs } from '../purchaseRelatedDocs.js';
import { collectRelatedItems } from '../useRelatedDocuments.js';

async function resolve(spec, record) {
  const definition = PURCHASE_RELATED_DOCS[spec];
  const results = await Promise.all(definition.sources.map(async (source) => [
    source,
    source.select
      ? source.select(record)
      : await source.fetch({ id: record.id, record, token: 'tok', apiBaseUrl: `/sws/neo/${spec}` }),
  ]));
  return collectRelatedItems(results);
}

const chips = (items) => items.map(({ type, doc }) => `${type}:${doc.id}`);

beforeEach(() => {
  vi.clearAllMocks();
  backend.byCriteria = {};
  backend.byId = {};
  backend.listInvoices = {};
});

describe('PURCHASE_RELATED_DOCS — resolved chips per spec', () => {
  it.each([
    {
      name: 'purchase-order: receipts by the salesOrder criteria + invoices through listInvoices',
      spec: 'purchase-order',
      record: { id: 'o1' },
      backend: {
        byCriteria: { 'goods-receipt/goodsReceipt?salesOrder=o1': [{ id: 'g1' }] },
        listInvoices: { 'purchase-order/header/o1': [{ id: 'i1' }] },
      },
      expected: ['goods-receipt:g1', 'purchase-invoice:i1'],
    },
    {
      name: 'purchase-order: no payment chip and nothing else when there are no documents',
      spec: 'purchase-order',
      record: { id: 'o1', paymentDetails: [{ payment: 'p1' }] },
      backend: {},
      expected: [],
    },
    {
      name: 'purchase-invoice: origin order (chip "order"), linkedReceipts split by isReturn',
      spec: 'purchase-invoice',
      record: {
        id: 'i1',
        salesOrder: 'o1',
        linkedReceipts: [{ id: 'g1', isReturn: false }, { id: 'r1', isReturn: true }, { id: 'g2' }],
      },
      backend: { byId: { 'purchase-order/header/o1': { id: 'o1' } } },
      expected: ['order:o1', 'goods-receipt:g1', 'return-to-vendor:r1', 'goods-receipt:g2'],
    },
    {
      name: 'purchase-invoice: unreadable origin order is dropped, receipts still shown',
      spec: 'purchase-invoice',
      record: { id: 'i1', salesOrder: 'gone', linkedReceipts: [{ id: 'g1' }] },
      backend: {},
      expected: ['goods-receipt:g1'],
    },
    {
      name: 'purchase-invoice: every originInvoices entry (ETP-4919), unreadable one dropped',
      spec: 'purchase-invoice',
      record: { id: 'i1', originInvoices: [{ id: 'i0' }, { id: 'gone' }, { id: 'i9' }] },
      backend: {
        byId: {
          'purchase-invoice/header/i0': { id: 'i0' },
          'purchase-invoice/header/i9': { id: 'i9' },
        },
      },
      expected: ['purchase-invoice:i0', 'purchase-invoice:i9'],
    },
    {
      name: 'purchase-invoice: legacy singular originInvoice (ETP-4737)',
      spec: 'purchase-invoice',
      record: { id: 'i1', originInvoice: 'i0' },
      backend: { byId: { 'purchase-invoice/header/i0': { id: 'i0' } } },
      expected: ['purchase-invoice:i0'],
    },
    {
      name: 'purchase-invoice: order, receipts and origin invoices together, in that order',
      spec: 'purchase-invoice',
      record: {
        id: 'i1',
        salesOrder: 'o1',
        linkedReceipts: [{ id: 'r1', isReturn: true }],
        originInvoices: [{ id: 'i0' }],
      },
      backend: {
        byId: {
          'purchase-order/header/o1': { id: 'o1' },
          'purchase-invoice/header/i0': { id: 'i0' },
        },
      },
      expected: ['order:o1', 'return-to-vendor:r1', 'purchase-invoice:i0'],
    },
    {
      name: 'goods-receipt: read from the detail record only',
      spec: 'goods-receipt',
      record: { id: 'g1', linkedOrders: [{ id: 'o1' }], linkedInvoices: [{ id: 'i1' }], linkedReturns: [{ id: 'r1' }] },
      backend: {},
      expected: ['order:o1', 'purchase-invoice:i1', 'return-to-vendor:r1'],
    },
    {
      name: 'return-to-vendor-shipment: read from the detail record only',
      spec: 'return-to-vendor-shipment',
      record: { id: 'r1', sourceReceipts: [{ id: 'g1' }], returnInvoices: [{ id: 'i1' }] },
      backend: {},
      expected: ['goods-receipt:g1', 'purchase-invoice:i1'],
    },
  ])('$name', async ({ spec, record, backend: data, expected }) => {
    Object.assign(backend, data);
    expect(chips(await resolve(spec, record))).toEqual(expected);
  });

  it.each(['goods-receipt', 'return-to-vendor-shipment'])(
    '%s is select-only: resolving an empty record issues no request and yields no chips',
    async (spec) => {
      expect(await resolve(spec, { id: 'x' })).toEqual([]);
      for (const fn of Object.values(helpers)) expect(fn).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['goods-receipt', { linkedOrders: 'x', linkedInvoices: null, linkedReturns: {} }],
    ['return-to-vendor-shipment', { sourceReceipts: 'x', returnInvoices: null }],
    ['purchase-invoice', { linkedReceipts: 'x' }],
  ])('%s: non-array linked fields are treated as empty', async (spec, record) => {
    expect(await resolve(spec, { id: 'x', ...record })).toEqual([]);
  });
});

describe('PURCHASE_RELATED_DOCS — definition metadata', () => {
  it('no definition has a payment source (functional decision, as in ETP-5527)', () => {
    for (const def of Object.values(PURCHASE_RELATED_DOCS)) {
      for (const source of def.sources) {
        expect(source.key).not.toMatch(/payment/i);
        if (typeof source.type === 'string') expect(source.type).not.toMatch(/payment/i);
      }
    }
  });

  it.each([
    ['purchase-order', 'header', 'purchase-order:document-created'],
    ['purchase-invoice', 'header', 'purchase-invoice:document-created'],
    ['goods-receipt', 'goodsReceipt', undefined],
    ['return-to-vendor-shipment', 'returnToVendorShipment', undefined],
  ])('%s loads entity %s and refreshes on %s', (spec, entity, refreshEvent) => {
    expect(PURCHASE_RELATED_DOCS[spec]).toMatchObject({ spec, entity });
    expect(PURCHASE_RELATED_DOCS[spec].refreshEvent).toBe(refreshEvent);
  });
});

describe('PURCHASE_RELATED_DOCS — depsKey covers every record field a fetch source reads', () => {
  it.each([
    [{ salesOrder: 'o1' }, { salesOrder: 'o2' }],
    [{ originInvoices: [{ id: 'a' }] }, { originInvoices: [{ id: 'a' }, { id: 'b' }] }],
    [{ originInvoice: 'a' }, { originInvoice: 'b' }],
  ])('purchase-invoice: %j → %j changes the key', (before, after) => {
    const { depsKey } = PURCHASE_RELATED_DOCS['purchase-invoice'];
    expect(depsKey({ id: 'x', ...before })).not.toBe(depsKey({ id: 'x', ...after }));
  });

  it('purchase-invoice: a field no source reads (e.g. updated) keeps the key', () => {
    const { depsKey } = PURCHASE_RELATED_DOCS['purchase-invoice'];
    expect(depsKey({ id: 'x', salesOrder: 'o1', updated: '1' })).toBe(depsKey({ id: 'x', salesOrder: 'o1', updated: '2' }));
  });
});

describe('getPurchaseRelatedDocs', () => {
  it.each(Object.keys(PURCHASE_RELATED_DOCS))('%s → its definition', (spec) => {
    expect(getPurchaseRelatedDocs(spec)).toBe(PURCHASE_RELATED_DOCS[spec]);
  });

  it.each([['sales-order'], ['sales-invoice'], ['return-material-receipt'], [undefined]])(
    '%s → null (not a purchase spec)',
    (spec) => {
      expect(getPurchaseRelatedDocs(spec)).toBeNull();
    },
  );
});
