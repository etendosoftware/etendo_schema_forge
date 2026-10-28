// @covers tools/app-shell/src/components/related-documents/salesRelatedDocs.js
// ETP-5527 — SALES_RELATED_DOCS is the single definition behind both the form's
// "Related documents" section and the list preview card. These tests resolve each
// definition against a fake backend (the helpers are mocked by their exact arguments,
// so a source that queries the wrong spec/entity/field simply finds nothing) and
// assert the resulting chips, in order, after collectRelatedItems' dedup.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const backend = vi.hoisted(() => ({ byCriteria: {}, byId: {}, listInvoices: {} }));

vi.mock('../helpers.js', () => ({
  fetchByCriteria: vi.fn(async (spec, entity, field, value) => backend.byCriteria[`${spec}/${entity}?${field}=${value}`] ?? []),
  fetchById: vi.fn(async (spec, entity, id) => backend.byId[`${spec}/${entity}/${id}`] ?? null),
  fetchListInvoices: vi.fn(async (spec, entity, id) => backend.listInvoices[`${spec}/${entity}/${id}`] ?? []),
  // Same contract as the real fetchOriginInvoicesOf (covered in helpers.relatedFetch.vitest.js):
  // every originInvoices entry, else the legacy singular originInvoice, unreadable ones dropped.
  fetchOriginInvoicesOf: vi.fn((spec) => async ({ record }) => {
    const ids = Array.isArray(record?.originInvoices)
      ? record.originInvoices.map(o => o?.id).filter(Boolean)
      : [record?.originInvoice].filter(Boolean);
    return ids.map(id => backend.byId[`${spec}/header/${id}`]).filter(Boolean);
  }),
}));

import * as helpers from '../helpers.js';
import { SALES_RELATED_DOCS, getSalesRelatedDocs } from '../salesRelatedDocs.js';
import { collectRelatedItems } from '../useRelatedDocuments.js';

async function resolve(spec, record) {
  const definition = SALES_RELATED_DOCS[spec];
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

describe('SALES_RELATED_DOCS — resolved chips per spec', () => {
  it.each([
    {
      name: 'sales-quotation: orders created from it + its invoices through listInvoices',
      spec: 'sales-quotation',
      record: { id: 'q1' },
      backend: {
        byCriteria: { 'sales-order/header?quotation=q1': [{ id: 'o1' }] },
        listInvoices: { 'sales-quotation/quotation/q1': [{ id: 'i1' }] },
      },
      expected: ['sales-order:o1', 'sales-invoice:i1'],
    },
    {
      name: 'sales-order: source quotation read by FK, shipments, listInvoices',
      spec: 'sales-order',
      record: { id: 'o1', quotation: 'q1' },
      backend: {
        byId: { 'sales-quotation/quotation/q1': { id: 'q1', documentStatus: 'CA' } },
        byCriteria: { 'goods-shipment/goodsShipment?salesOrder=o1': [{ id: 's1' }] },
        listInvoices: { 'sales-order/header/o1': [{ id: 'i1' }] },
      },
      expected: ['sales-quotation:q1', 'shipment:s1', 'sales-invoice:i1'],
    },
    {
      name: 'sales-invoice generated from a quotation: origin chip is a sales-quotation',
      spec: 'sales-invoice',
      record: { id: 'i1', salesOrder: 'q1' },
      backend: { byCriteria: { 'sales-quotation/quotation?id=q1': [{ id: 'q1' }] } },
      expected: ['sales-quotation:q1'],
    },
    {
      name: 'sales-invoice from an order: origin chip is a sales-order',
      spec: 'sales-invoice',
      record: { id: 'i1', salesOrder: 'o1' },
      backend: { byId: { 'sales-order/header/o1': { id: 'o1' } } },
      expected: ['sales-order:o1'],
    },
    {
      // ETP-6002: a deduced `sourceInvoice` (return → shipment → invoice) is not a chip.
      name: 'sales-invoice: linkedShipments classified by isReturn (ETP-4534), no deduced sourceInvoice',
      spec: 'sales-invoice',
      record: {
        id: 'i1',
        linkedShipments: [{ id: 's1', isReturn: false }, { id: 'r1', isReturn: true }, { id: 's2' }],
        sourceInvoice: { id: 'i0' },
      },
      backend: {},
      expected: ['shipment:s1', 'return-material-receipt:r1', 'shipment:s2'],
    },
    {
      // ETP-6002 (CP-16): the other invoices of the same order are not what a rectificative
      // rectifies — only its C_Invoice_Reverse links are.
      name: 'sales-invoice RECTIFICATIVA: no "same order" invoices, only the order itself',
      spec: 'sales-invoice',
      record: { id: 'i1', salesOrder: 'o1', arInvoiceSubtype: 'RECTIFICATIVA' },
      backend: {
        byId: { 'sales-order/header/o1': { id: 'o1' } },
        byCriteria: { 'sales-invoice/header?salesOrder=o1': [{ id: 'i0' }, { id: 'i1' }] },
      },
      expected: ['sales-order:o1'],
    },
    {
      name: 'sales-invoice: every originInvoices entry (ETP-4919)',
      spec: 'sales-invoice',
      record: { id: 'i1', salesOrder: 'o1', arInvoiceSubtype: 'RECTIFICATIVA', originInvoices: [{ id: 'i0' }, { id: 'i9' }] },
      backend: {
        byId: {
          'sales-order/header/o1': { id: 'o1' },
          'sales-invoice/header/i0': { id: 'i0' },
          'sales-invoice/header/i9': { id: 'i9' },
        },
      },
      expected: ['sales-order:o1', 'sales-invoice:i0', 'sales-invoice:i9'],
    },
    {
      name: 'sales-invoice: legacy singular originInvoice (ETP-4737), unreadable one dropped',
      spec: 'sales-invoice',
      record: { id: 'i1', originInvoice: 'i0' },
      backend: { byId: { 'sales-invoice/header/i0': { id: 'i0' } } },
      expected: ['sales-invoice:i0'],
    },
    {
      // ETP-5745 CP-12 — the mirror of originInvoices: from the ORIGINAL invoice, the
      // rectificativa(s) that rectify it (SalesInvoiceHeaderHandler#enrichRectifyingInvoices).
      // A synchronous `select`, not a `fetch`: the backend already enriches the field on the
      // detail GET, so no extra round trip is needed.
      name: 'sales-invoice: rectifyingInvoices read synchronously from the enriched field',
      spec: 'sales-invoice',
      record: { id: 'i0', rectifyingInvoices: [{ id: 'i1', documentNo: 'FVR1' }, { id: 'i2', documentNo: 'FVR2' }] },
      backend: {},
      expected: ['sales-invoice:i1', 'sales-invoice:i2'],
    },
    {
      // Chain case: this invoice both rectifies another invoice (originInvoices) AND is
      // itself rectified by a different one (rectifyingInvoices) — the two mirror fields
      // are independent and must both surface chips on the same record.
      name: 'sales-invoice: rectifies one invoice (originInvoices) AND is rectified by another (rectifyingInvoices)',
      spec: 'sales-invoice',
      record: {
        id: 'i0',
        originInvoices: [{ id: 'i-origin' }],
        rectifyingInvoices: [{ id: 'i-rectifying', documentNo: 'FVR9' }],
      },
      backend: { byId: { 'sales-invoice/header/i-origin': { id: 'i-origin' } } },
      expected: ['sales-invoice:i-origin', 'sales-invoice:i-rectifying'],
    },
    {
      // ETP-6002 (IMP-3): the quotation lists the shipments whose lines point at its lines.
      name: 'sales-quotation: its shipments and returns from linkedShipments',
      spec: 'sales-quotation',
      record: { id: 'q1', linkedShipments: [{ id: 's1', isReturn: false }, { id: 'r1', isReturn: true }] },
      backend: {},
      expected: ['shipment:s1', 'return-material-receipt:r1'],
    },
    {
      // ETP-6002 (IMP-3): a quotation among the shipment's linkedOrders is a quotation chip.
      // An entry with no flag at all (the handler only sets it on quotations) stays an order.
      name: 'goods-shipment: a linked quotation renders as sales-quotation, an order (flag false or absent) as sales-order',
      spec: 'goods-shipment',
      record: { id: 's1', linkedOrders: [{ id: 'q1', isQuotation: true }, { id: 'o1', isQuotation: false }, { id: 'o2' }] },
      backend: {},
      expected: ['sales-quotation:q1', 'sales-order:o1', 'sales-order:o2'],
    },
    {
      name: 'goods-shipment: read from the detail record only',
      spec: 'goods-shipment',
      record: { id: 's1', linkedOrders: [{ id: 'o1' }], linkedInvoices: [{ id: 'i1' }], returnReceipts: [{ id: 'r1' }] },
      backend: {},
      expected: ['sales-order:o1', 'sales-invoice:i1', 'return-material-receipt:r1'],
    },
    {
      name: 'return-material-receipt: read from the record only',
      spec: 'return-material-receipt',
      record: { id: 'r1', sourceShipments: [{ id: 's1' }], returnInvoices: [{ id: 'i1' }] },
      backend: {},
      expected: ['shipment:s1', 'sales-invoice:i1'],
    },
  ])('$name', async ({ spec, record, backend: data, expected }) => {
    Object.assign(backend, data);
    expect(chips(await resolve(spec, record))).toEqual(expected);
  });

  // ETP-6002 (CP-17): the origin chip is the full origin record (amount, status), never the
  // bare {id, documentNo} a deduced `sourceInvoice` used to put first in the dedupe.
  it('sales-invoice: the origin chip carries the full originInvoices record', async () => {
    const origin = { id: 'i0', documentNo: 'FV1', grandTotalAmount: 121, documentStatus: 'CO' };
    backend.byId = { 'sales-invoice/header/i0': origin };
    const items = await resolve('sales-invoice', {
      id: 'i1', originInvoices: [{ id: 'i0', documentNo: 'FV1' }], sourceInvoice: { id: 'i0', documentNo: 'FV1' },
    });
    expect(items).toEqual([{ type: 'sales-invoice', doc: origin }]);
  });

  it('sales-order: falls back to the quotation identifier when the quotation cannot be read', async () => {
    const items = await resolve('sales-order', {
      id: 'o1', quotation: 'q1', 'quotation$_identifier': '1000373 - 07-04-2026 - 191.80',
    });
    expect(items).toEqual([{ type: 'sales-quotation', doc: { id: 'q1', documentNo: '1000373' } }]);
  });

  it.each(['goods-shipment', 'return-material-receipt'])(
    '%s is select-only: resolving it issues no request, even with an empty record',
    async (spec) => {
      expect(await resolve(spec, { id: 'x' })).toEqual([]);
      for (const fn of Object.values(helpers)) expect(fn).not.toHaveBeenCalled();
    },
  );
});

describe('SALES_RELATED_DOCS — depsKey covers every record field a fetch source reads', () => {
  it.each([
    ['sales-order', { quotation: 'q1' }, { quotation: 'q2' }],
    ['sales-invoice', { salesOrder: 'o1' }, { salesOrder: 'o2' }],
    ['sales-invoice', { originInvoices: [{ id: 'a' }] }, { originInvoices: [{ id: 'a' }, { id: 'b' }] }],
    ['sales-invoice', { originInvoice: 'a' }, { originInvoice: 'b' }],
    ['sales-invoice', { rectifyingInvoices: [{ id: 'a' }] }, { rectifyingInvoices: [{ id: 'a' }, { id: 'b' }] }],
  ])('%s: %j → %j changes the key', (spec, before, after) => {
    const { depsKey } = SALES_RELATED_DOCS[spec];
    expect(depsKey({ id: 'x', ...before })).not.toBe(depsKey({ id: 'x', ...after }));
  });

  it('sales-invoice: a field no source reads (e.g. updated) keeps the key', () => {
    const { depsKey } = SALES_RELATED_DOCS['sales-invoice'];
    expect(depsKey({ id: 'x', salesOrder: 'o1', updated: '1' })).toBe(depsKey({ id: 'x', salesOrder: 'o1', updated: '2' }));
  });
});

describe('SALES_RELATED_DOCS — sales-invoice built from several orders (ETP-5828)', () => {
  const originSource = () => SALES_RELATED_DOCS['sales-invoice'].sources.find(source => source.key === 'origin');

  it('every linkedOrders entry is a chip, with no header lookup when salesOrder is blank', async () => {
    const record = {
      id: 'i1',
      salesOrder: null,
      linkedOrders: [{ id: 'o1' }, { id: 'o2' }, { id: 'q1', isQuotation: true }],
    };
    expect(chips(await resolve('sales-invoice', record))).toEqual([
      'sales-order:o1', 'sales-order:o2', 'sales-quotation:q1',
    ]);
    expect(helpers.fetchById).not.toHaveBeenCalled();
    expect(helpers.fetchByCriteria).not.toHaveBeenCalled();
  });

  it('the header order already among linkedOrders is neither fetched nor duplicated', async () => {
    const record = { id: 'i1', salesOrder: 'o1', linkedOrders: [{ id: 'o1' }, { id: 'o2' }] };
    expect(chips(await resolve('sales-invoice', record))).toEqual(['sales-order:o1', 'sales-order:o2']);
    expect(helpers.fetchById).not.toHaveBeenCalled();
  });

  it('a header order outside linkedOrders is resolved and appended', async () => {
    backend.byId = { 'sales-order/header/o3': { id: 'o3' } };
    const record = { id: 'i1', salesOrder: 'o3', linkedOrders: [{ id: 'o1' }, { id: 'o2' }] };
    expect(chips(await resolve('sales-invoice', record))).toEqual([
      'sales-order:o1', 'sales-order:o2', 'sales-order:o3',
    ]);
    expect(helpers.fetchById).toHaveBeenCalledTimes(1);
    expect(helpers.fetchById).toHaveBeenCalledWith('sales-order', 'header', 'o3', 'tok', '/sws/neo/sales-invoice');
  });

  it.each([
    ['missing', undefined],
    ['empty', []],
  ])('linkedOrders %s: the header quotation probe still yields a sales-quotation chip', async (_label, linkedOrders) => {
    backend.byCriteria = { 'sales-quotation/quotation?id=q1': [{ id: 'q1' }] };
    const record = { id: 'i1', salesOrder: 'q1', linkedOrders };
    expect(chips(await resolve('sales-invoice', record))).toEqual(['sales-quotation:q1']);
  });

  it('linkedOrders entries without an id produce no chip', async () => {
    const record = { id: 'i1', linkedOrders: [{ documentNo: 'NO-ID' }, null, { id: 'o1' }] };
    expect(chips(await resolve('sales-invoice', record))).toEqual(['sales-order:o1']);
  });

  it.each([
    [{ id: 'x', isQuotation: true }, 'sales-quotation'],
    [{ id: 'x', _isQuotation: true }, 'sales-quotation'],
    [{ id: 'x', isQuotation: false }, 'sales-order'],
    [{ id: 'x', isQuotation: 'true' }, 'sales-order'],
    [{ id: 'x' }, 'sales-order'],
  ])('origin chip type of %j is %s', (doc, expected) => {
    expect(originSource().type(doc)).toBe(expected);
  });

  it.each([
    [{ linkedOrders: [{ id: 'a' }] }, { linkedOrders: [{ id: 'a' }, { id: 'b' }] }],
    [{ linkedOrders: [{ id: 'a' }, { id: 'b' }] }, { linkedOrders: [{ id: 'a' }, { id: 'c' }] }],
    [{}, { linkedOrders: [{ id: 'a' }] }],
  ])('depsKey: %j → %j changes the key', (before, after) => {
    const { depsKey } = SALES_RELATED_DOCS['sales-invoice'];
    expect(depsKey({ id: 'x', salesOrder: 'o1', ...before })).not.toBe(depsKey({ id: 'x', salesOrder: 'o1', ...after }));
  });
});

describe('getSalesRelatedDocs', () => {
  it.each([
    ['purchase-invoice'],
    ['purchase-order'],
    [undefined],
  ])('%s → null (not a sales spec)', (spec) => {
    expect(getSalesRelatedDocs(spec)).toBeNull();
  });
});
