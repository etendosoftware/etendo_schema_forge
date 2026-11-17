// @covers artifacts/goods-receipt/custom/ImportFromPurchaseOrderModal.jsx
// @covers tools/app-shell/src/windows/custom/shared/inOutImport.js
// @covers tools/app-shell/src/windows/custom/shared/importActionClient.js
// @covers tools/app-shell/src/windows/custom/shared/useImportLoadFailureToast.js
let captured = null;
vi.mock('@/components/contract-ui/ImportLinesModal', () => ({
  default: (props) => {
    captured = props;
    return <div data-testid="import-lines-modal" />;
  },
}));

import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ImportFromPurchaseOrderModal from '@generated/goods-receipt/custom/ImportFromPurchaseOrderModal';

const headers = { Authorization: 'Bearer tok', 'Accept-Language': 'es_ES', 'Content-Type': 'application/json' };
const base = '/api';

function jsonRes(data, ok = true) {
  return { ok, json: async () => ({ response: { data } }) };
}

beforeEach(() => {
  captured = null;
});

describe('ImportFromPurchaseOrderModal — static prop contract', () => {
  it('forwards incoming props and the fixed config to ImportLinesModal', () => {
    render(<ImportFromPurchaseOrderModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    expect(captured).toBeTruthy();
    expect(captured.invoiceId).toBe('receipt-1');
    expect(captured.bpId).toBe('bp-1');
    expect(captured.linesEndpoint).toBe('goods-receipt/goodsReceiptLine');
    expect(captured.titleKey).toBe('importFromPurchaseOrder');
    expect(captured.searchPlaceholderKey).toBe('searchPurchaseOrder');
    expect(captured.emptyMessageKey).toBe('noCompletedPurchaseOrdersWithPendingQuantitiesForThisVendor');
    expect(captured.noSearchResultsKey).toBe('noOrdersMatchYourSearch');
    expect(captured.successMessageKey).toBe('linesImportedFromPurchaseOrder');
    expect(captured.showPriceColumns).toBe(false);
    expect(captured.eagerLoadLines).toBe(false);
    expect(captured.isDocumentCovered({ pendingLines: 0 })).toBe(true);
    expect(captured.getDocumentTotal({ amount: 3 })).toBe(3);
    expect(typeof captured.fetchDocuments).toBe('function');
    expect(typeof captured.fetchLines).toBe('function');
    expect(typeof captured.afterImport).toBe('function');
    expect(typeof captured.getDocDisplay).toBe('function');
    expect(typeof captured.buildLineBody).toBe('function');
  });
});

describe('ImportFromPurchaseOrderModal — fetchDocuments', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps only completed orders for this vendor with delivery status < 100', async () => {
    render(<ImportFromPurchaseOrderModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { fetchDocuments } = captured;

    globalThis.fetch = vi.fn((url, opts) => {
      if (url.endsWith('/goods-receipt/goodsReceipt/receipt-1/action/availableOrders')) {
        expect(JSON.parse(opts.body)).toMatchObject({ includeCovered: true });
        return Promise.resolve(jsonRes([
          { id: 'o1', documentNo: 'PO-1', date: '2026-02-01', businessPartner: 'bp-1', pendingLines: 2 },
        ]));
      }
      throw new Error(`unexpected request ${url}`);
    });

    const { documents, sharedContext } = await fetchDocuments({ base, headers, bpId: 'bp-1', invoiceId: 'receipt-1' });
    expect(documents.map((d) => d.id)).toEqual(['o1']);
    expect(documents[0].orderDate).toBe('2026-02-01');
    expect(sharedContext).toEqual({ targetId: 'receipt-1' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('ImportFromPurchaseOrderModal — list order', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists the orders newest CREATED first, as before, whatever order the action returns', async () => {
    render(<ImportFromPurchaseOrderModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { fetchDocuments } = captured;
    globalThis.fetch = vi.fn(() => Promise.resolve(jsonRes([
      { id: 'o-old', date: '2026-03-01', creationDate: '2026-01-01T10:00:00Z', pendingLines: 1 },
      { id: 'o-new', date: '2026-02-01', creationDate: '2026-02-15T10:00:00Z', pendingLines: 1 },
      { id: 'o-mid', date: '2026-01-01', creationDate: '2026-02-01T10:00:00Z', pendingLines: 1 },
    ])));
    const { documents } = await fetchDocuments({ base, headers, bpId: 'bp-1', invoiceId: 'receipt-1' });
    expect(documents.map((d) => d.id)).toEqual(['o-new', 'o-mid', 'o-old']);
  });
});

describe('ImportFromPurchaseOrderModal — fetchLines', () => {
  afterEach(() => vi.restoreAllMocks());

  it('computes pending = ordered - delivered - inOtherDrafts and filters out non-ordered lines', async () => {
    render(<ImportFromPurchaseOrderModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { fetchLines } = captured;

    globalThis.fetch = vi.fn((url, opts) => {
      expect(url).toBe(`${base}/goods-receipt/goodsReceipt/receipt-1/action/availableOrderLines`);
      expect(JSON.parse(opts.body)).toEqual({ orderId: 'o1', includeCovered: true, detail: true });
      return Promise.resolve(jsonRes([
        { id: 'l1', lineNo: 10, orderedQuantity: 10, deliveredQuantity: 2, pendingQuantity: 5, inDraftDocuments: ['GR-9'], 'product$_identifier': 'Widget' },
        { id: 'l2', lineNo: 20, orderedQuantity: 5, deliveredQuantity: 5, pendingQuantity: 0, inDraftDocuments: [] },   // fully delivered -> pending 0
        { id: 'l3', lineNo: 30, orderedQuantity: 0, deliveredQuantity: 0, pendingQuantity: 0, inDraftDocuments: [] },   // filtered out (not ordered)
      ]));
    });

    const sharedContext = { targetId: 'receipt-1' };
    const lines = await fetchLines({ base, headers, docId: 'o1', sharedContext });

    expect(lines.map((l) => l.id)).toEqual(['l1', 'l2']); // l3 filtered
    const l1 = lines.find((l) => l.id === 'l1');
    expect(l1._maxQty).toBe(5);           // 10 - 2 - 3
    expect(l1._orderedQty).toBe(10);
    expect(l1._alreadyImported).toBe(false);
    expect(l1._productName).toBe('Widget');
    expect(l1._inDraftShipments).toEqual(['GR-9']);

    const l2 = lines.find((l) => l.id === 'l2');
    expect(l2._maxQty).toBe(0);
    expect(l2._alreadyImported).toBe(true);
  });

  it('returns [] when the lines request fails', async () => {
    render(<ImportFromPurchaseOrderModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { fetchLines } = captured;
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) }));
    const lines = await fetchLines({ base, headers, docId: 'o1', sharedContext: { targetId: 'receipt-1' } });
    expect(lines).toEqual([]);
  });
});

describe('ImportFromPurchaseOrderModal — afterImport', () => {
  afterEach(() => vi.restoreAllMocks());

  it('PATCHes the receipt with salesOrder when exactly one order was imported', async () => {
    render(<ImportFromPurchaseOrderModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { afterImport } = captured;
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true }));
    globalThis.fetch = fetchSpy;

    await afterImport({ importedDocIds: new Set(['o1']), base, headers, invoiceId: 'receipt-1' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe(`${base}/goods-receipt/goodsReceipt/receipt-1`);
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ salesOrder: 'o1' });
  });

  it('does nothing when more than one order was imported', async () => {
    render(<ImportFromPurchaseOrderModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { afterImport } = captured;
    const fetchSpy = vi.fn(() => Promise.resolve({ ok: true }));
    globalThis.fetch = fetchSpy;
    await afterImport({ importedDocIds: new Set(['o1', 'o2']), base, headers, invoiceId: 'receipt-1' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('ImportFromPurchaseOrderModal — buildLineBody', () => {
  it('maps an order line into a goods-receipt line body keyed by salesOrderLine', async () => {
    render(<ImportFromPurchaseOrderModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { buildLineBody } = captured;
    const body = await buildLineBody({
      line: { id: 'l1', product: 'p1', orderedQuantity: 10, uOM: 'u1' },
      qty: 4,
      invoiceId: 'receipt-1',
      lineNo: 10,
    });
    expect(body).toEqual({
      parentId: 'receipt-1',
      product: 'p1',
      movementQuantity: 4,
      uOM: 'u1',
      salesOrderLine: 'l1',
      lineNo: 10,
    });
    expect(body).not.toHaveProperty('orderQuantity');
  });
});
