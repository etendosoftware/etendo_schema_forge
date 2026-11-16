// @covers artifacts/goods-shipment/custom/ImportFromSalesOrderModal.jsx
//
// Characterization of what the "Add from sales order" popup SHOWS and SENDS:
// the orders listed (partner / status / delivery / currency), the lines with
// their pending quantity and "in draft shipment" note, and the line body posted
// on import. Assertions are on handler OUTPUT only. Every endpoint is confined
// to `backend()` so the data source can be swapped by rewriting that helper.
//
// Lives here (not in artifacts/**/__tests__) because the module has an
// `export const fetchLines`, which the node-side loadCustomModule cannot
// evaluate; the handlers are captured from the props the wrapper forwards to
// ImportLinesModal, the same approach as goods-receipt's
// ImportFromPurchaseOrderModal.vitest.jsx.

let captured = null;
vi.mock('@/components/contract-ui/ImportLinesModal', () => ({
  default: (props) => {
    captured = props;
    return <div data-testid="import-lines-modal" />;
  },
}));

const mockApiFetch = vi.fn();
vi.mock('@/auth/api.js', () => ({ apiFetch: (...args) => mockApiFetch(...args) }));
vi.mock('@/auth/useApiFetch.js', () => ({ useApiFetch: () => mockApiFetch }));

import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ImportFromSalesOrderModal from '@generated/goods-shipment/custom/ImportFromSalesOrderModal';

const BASE = '/api';
const BP = 'bp-1';
const SHIPMENT = 'shp-1';

function res(ok, data, extra = {}) {
  return { ok, json: async () => ({ response: { data, ...extra } }) };
}

const bodyOf = (opts) => (opts?.body ? JSON.parse(opts.body) : {});

/**
 * The ONLY place that knows the endpoints. Fixture keys describe data; `backend()` answers as
 * the server's actions do (ETP-6099): `availableOrders` lists the customer's completed orders
 * still pending delivery in the shipment currency (`pendingLines` > 0), `availableOrderLines`
 * gives each line its pending (ordered − delivered − drafts) and the other drafts holding it.
 * The order list and the shipment header are read only to tell a currency exclusion.
 * `null` makes that request fail.
 *
 * @param {object} f
 * @param {Array|null} [f.orders]            sales orders of the company
 * @param {object|null} [f.shipmentHeader]   the current shipment header
 * @param {Record<string, {qty:number, docNos:string[]}>} [f.drafts] per order line: quantity in
 *        draft shipments (this one included) and the OTHER drafts' document numbers
 * @param {Array|null} [f.orderLines]        lines of the expanded order
 */
function backend(f = {}) {
  mockApiFetch.mockImplementation(async (url, opts) => {
    const pick = (v) => (v === null ? res(false, []) : res(true, v ?? []));
    const currency = f.shipmentHeader?.etgoCurrency;
    if (url.endsWith(`/goods-shipment/goodsShipment/${SHIPMENT}/action/availableOrders`)) {
      if (f.orders === null) return res(false, []);
      const listed = (f.orders || [])
        .filter(o => o.documentStatus === 'CO' && o.businessPartner === BP && Number(o.deliveryStatus ?? 100) < 100)
        .filter(o => !currency || o.currency === currency)
        .map(({ orderDate, ...o }) => ({ ...o, date: orderDate, pendingLines: 1 }));
      return res(true, listed, { hasMore: false, nextOffset: null });
    }
    if (url.endsWith(`/goods-shipment/goodsShipment/${SHIPMENT}/action/availableOrderLines`)) {
      if (f.orderLines === null) return res(false, []);
      expect(bodyOf(opts)).toMatchObject({ orderId: 'o1', includeCovered: true, detail: true });
      return res(true, (f.orderLines || []).map(l => {
        const d = f.drafts?.[l.id];
        const pending = Math.max(0, (Number(l.orderedQuantity) || 0) - (Number(l.deliveredQuantity) || 0) - (d?.qty || 0));
        return { ...l, pendingQuantity: pending, inDraftDocuments: d?.docNos || [] };
      }));
    }
    if (url.includes('/sales-order/header')) return pick(f.orders);
    if (url.includes(`/goods-shipment/goodsShipment/${SHIPMENT}`)) {
      if (f.shipmentHeader === null) return res(false, []);
      return res(true, f.shipmentHeader ? [f.shipmentHeader] : []);
    }
    throw new Error(`unexpected request ${url}`);
  });
}

function handlers() {
  render(<ImportFromSalesOrderModal invoiceId={SHIPMENT} bpId={BP} base={BASE} />);
  return captured;
}

const order = (id, over) => ({ id, documentStatus: 'CO', businessPartner: BP, deliveryStatus: 0, currency: 'EUR', ...over });

beforeEach(() => {
  captured = null;
  mockApiFetch.mockReset();
});

describe('ImportFromSalesOrderModal — wiring', () => {
  it('forwards the parent props and the sales-order notice keys to ImportLinesModal', () => {
    const p = handlers();
    expect(p.invoiceId).toBe(SHIPMENT);
    expect(p.bpId).toBe(BP);
    expect(p.linesEndpoint).toBe('goods-shipment/goodsShipmentLine');
    expect(p.titleKey).toBe('addFromSalesOrder');
    expect(p.emptyMessageKey).toBe('noCompletedSalesOrdersForThisCustomer');
    expect(p.noSearchResultsKey).toBe('noOrdersMatchYourSearch');
    expect(p.noCurrencyMatchMessageKey).toBe('noSalesOrdersMatchShipmentCurrency');
    expect(p.successMessageKey).toBe('linesImportedFromSalesOrder');
    expect(p.showPriceColumns).toBe(false);
    // ETP-6099: lines load on expand; covered orders hide from their own row.
    expect(p.eagerLoadLines).toBe(false);
    expect(p.isDocumentCovered({ pendingLines: 0 })).toBe(true);
    expect(p.isDocumentCovered({ pendingLines: 2 })).toBe(false);
    expect(p.getDocumentTotal({ amount: 12.5 })).toBe(12.5);
    expect(p.getDocumentTotal({})).toBeNull();
  });

  it('opens with ONE request when the shipment has orders to import', async () => {
    backend({ orders: [order('o1')], shipmentHeader: { id: SHIPMENT } });
    await handlers().fetchDocuments({ base: BASE, bpId: BP, invoiceId: SHIPMENT });
    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});

describe('ImportFromSalesOrderModal — orders listed', () => {
  it.each([
    ['completed, same customer, pending delivery', order('o'), true],
    ['partially delivered (99)', order('o', { deliveryStatus: 99 }), true],
    ['fully delivered (100)', order('o', { deliveryStatus: 100 }), false],
    ['with no delivery status (treated as delivered)', order('o', { deliveryStatus: undefined }), false],
    ['draft', order('o', { documentStatus: 'DR' }), false],
    ['another customer', order('o', { businessPartner: 'bp-2' }), false],
  ])('an order that is %s is listed: %s', async (_name, doc, listed) => {
    backend({ orders: [doc], shipmentHeader: { id: SHIPMENT } });
    const { documents } = await handlers().fetchDocuments({ base: BASE, bpId: BP, invoiceId: SHIPMENT });
    expect(documents.map(d => d.id)).toEqual(listed ? ['o'] : []);
  });

  it.each([
    {
      name: 'keeps only orders in the shipment currency',
      currency: 'EUR',
      orders: [order('o1'), order('o2', { currency: 'USD' })],
      ids: ['o1'], excluded: false,
    },
    {
      name: 'flags a currency exclusion when currency removed every candidate',
      currency: 'GBP',
      orders: [order('o1'), order('o2', { currency: 'USD' })],
      ids: [], excluded: true,
    },
    {
      name: 'does not flag a currency exclusion when there was no candidate at all',
      currency: 'GBP',
      orders: [order('o1', { documentStatus: 'DR' })],
      ids: [], excluded: false,
    },
    {
      name: 'does not filter by currency when the shipment has none',
      currency: undefined,
      orders: [order('o1'), order('o2', { currency: 'USD' })],
      ids: ['o1', 'o2'], excluded: false,
    },
  ])('$name', async ({ currency, orders, ids, excluded }) => {
    backend({ orders, shipmentHeader: { id: SHIPMENT, etgoCurrency: currency } });
    const out = await handlers().fetchDocuments({ base: BASE, bpId: BP, invoiceId: SHIPMENT });
    expect(out.documents.map(d => d.id)).toEqual(ids);
    expect(out.excludedByCurrency).toBe(excluded);
  });

  it('does not filter by currency when the shipment header fails', async () => {
    backend({ orders: [order('o1', { currency: 'USD' })], shipmentHeader: null });
    const out = await handlers().fetchDocuments({ base: BASE, bpId: BP, invoiceId: SHIPMENT });
    expect(out.documents.map(d => d.id)).toEqual(['o1']);
    expect(out.excludedByCurrency).toBe(false);
  });

  it('lists nothing when the orders request fails', async () => {
    backend({ orders: null, shipmentHeader: { id: SHIPMENT, etgoCurrency: 'EUR' } });
    const out = await handlers().fetchDocuments({ base: BASE, bpId: BP, invoiceId: SHIPMENT });
    expect(out.documents).toEqual([]);
    expect(out.excludedByCurrency).toBe(false);
  });

  it('shows the order number (or id) and the order date', () => {
    const { getDocDisplay } = handlers();
    expect(getDocDisplay({ id: 'o1', documentNo: 'SO-1', orderDate: '2026-03-04' })).toEqual({ docNo: 'SO-1', date: '2026-03-04' });
    expect(getDocDisplay({ id: 'o1', orderDate: '2026-03-04' })).toEqual({ docNo: 'o1', date: '2026-03-04' });
  });
});

describe('ImportFromSalesOrderModal — lines shown on expand', () => {
  // ol-1: 3 units in drafts, named SH-D1 / SH-D2; ol-2: 2 units in the CURRENT shipment only.
  const drafts = {
    'ol-1': { qty: 3, docNos: ['SH-D1', 'SH-D2'] },
    'ol-2': { qty: 2, docNos: [] },
  };
  const sharedContext = { targetId: SHIPMENT };

  it.each([
    {
      name: 'pending = ordered - delivered - in drafts, with the drafts named',
      line: { id: 'ol-1', orderedQuantity: 10, deliveredQuantity: 4, unitPrice: 2.5, 'product$_identifier': 'Widget' },
      expect: { _maxQty: 3, _unitPrice: 2.5, _lineNetAmount: 7.5, _alreadyImported: false, _productName: 'Widget', _inDraftShipments: ['SH-D1', 'SH-D2'] },
    },
    {
      name: 'quantity only in the current shipment reduces pending but names no draft',
      line: { id: 'ol-2', orderedQuantity: 5, deliveredQuantity: 0, unitPrice: 1 },
      expect: { _maxQty: 3, _lineNetAmount: 3, _alreadyImported: false, _inDraftShipments: undefined, _productName: 'ol-2' },
    },
    {
      name: 'a line with nothing pending is blocked and never goes negative',
      line: { id: 'ol-1', orderedQuantity: 4, deliveredQuantity: 2, unitPrice: 5 },
      expect: { _maxQty: 0, _lineNetAmount: 0, _alreadyImported: true },
    },
    {
      name: 'a fully delivered line with no drafts is blocked',
      line: { id: 'ol-9', orderedQuantity: 4, deliveredQuantity: 4 },
      expect: { _maxQty: 0, _unitPrice: 0, _alreadyImported: true, _inDraftShipments: undefined },
    },
    {
      name: 'missing quantities and price count as zero',
      line: { id: 'ol-9' },
      expect: { _maxQty: 0, _unitPrice: 0, _lineNetAmount: 0, _alreadyImported: true },
    },
  ])('$name', async ({ line, expect: exp }) => {
    backend({ orderLines: [line], drafts });
    const [out] = await handlers().fetchLines({ base: BASE, docId: 'o1', sharedContext });
    expect(out.id).toBe(line.id);
    for (const [k, v] of Object.entries(exp)) expect(out[k], k).toEqual(v);
  });

  it('shows no lines when the lines request fails', async () => {
    backend({ orderLines: null });
    expect(await handlers().fetchLines({ base: BASE, docId: 'o1', sharedContext })).toEqual([]);
  });
});

describe('ImportFromSalesOrderModal — line body sent on import', () => {
  it.each([
    [{ id: 'ol-1', product: 'p1', uOM: 'u1' }, { uOM: 'u1' }],
    [{ id: 'ol-1', product: 'p1' }, { uOM: null }],
  ])('posts a positive movement quantity linked to the order line (%#)', async (line, exp) => {
    const body = await handlers().buildLineBody({ line, qty: 4, invoiceId: SHIPMENT, lineNo: 30 });
    expect(body).toEqual({
      parentId: SHIPMENT,
      product: 'p1',
      movementQuantity: 4,
      uOM: exp.uOM,
      salesOrderLine: 'ol-1',
      lineNo: 30,
    });
  });
});
