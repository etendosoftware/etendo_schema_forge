// Mocks must come before imports (Vitest hoisting)

// Capture the props that the wrapper forwards to the generic ImportLinesModal.
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

const headers = { Authorization: 'Bearer tok', 'Content-Type': 'application/json' };
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
    // incoming props forwarded
    expect(captured.invoiceId).toBe('receipt-1');
    expect(captured.bpId).toBe('bp-1');
    // static config
    expect(captured.linesEndpoint).toBe('goods-receipt/goodsReceiptLine');
    expect(captured.titleKey).toBe('importFromPurchaseOrder');
    expect(captured.searchPlaceholderKey).toBe('searchPurchaseOrder');
    expect(captured.emptyMessageKey).toBe('noCompletedPurchaseOrdersWithPendingQuantitiesForThisVendor');
    expect(captured.noSearchResultsKey).toBe('noOrdersMatchYourSearch');
    expect(captured.successMessageKey).toBe('linesImportedFromPurchaseOrder');
    expect(captured.showPriceColumns).toBe(false);
    // callbacks present
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

    globalThis.fetch = vi.fn((url) => {
      if (url.includes('/purchase-order/header')) {
        return Promise.resolve(jsonRes([
          { id: 'o1', documentStatus: 'CO', businessPartner: 'bp-1', deliveryStatusPurchase: 0 },   // keep
          { id: 'o2', documentStatus: 'CO', businessPartner: 'bp-1', deliveryStatusPurchase: 100 },  // drop (fully delivered)
          { id: 'o3', documentStatus: 'DR', businessPartner: 'bp-1', deliveryStatusPurchase: 0 },    // drop (not completed)
          { id: 'o4', documentStatus: 'CO', businessPartner: 'bp-2', deliveryStatusPurchase: 0 },    // drop (other vendor)
        ]));
      }
      // current receipt lines + other-draft receipts list
      if (url.includes('/goodsReceiptLine')) return Promise.resolve(jsonRes([]));
      if (url.includes('/goodsReceipt?')) return Promise.resolve(jsonRes([]));
      return Promise.resolve(jsonRes([]));
    });

    const { documents, sharedContext } = await fetchDocuments({ base, headers, bpId: 'bp-1', invoiceId: 'receipt-1' });
    expect(documents.map((d) => d.id)).toEqual(['o1']);
    expect(sharedContext).toHaveProperty('draftInfo');
  });
});

describe('ImportFromPurchaseOrderModal — fetchLines', () => {
  afterEach(() => vi.restoreAllMocks());

  it('computes pending = ordered - delivered - inOtherDrafts and filters out non-ordered lines', async () => {
    render(<ImportFromPurchaseOrderModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { fetchLines } = captured;

    globalThis.fetch = vi.fn(() => Promise.resolve(jsonRes([
      { id: 'l1', orderedQuantity: 10, deliveredQuantity: 2, 'product$_identifier': 'Widget' },
      { id: 'l2', orderedQuantity: 5, deliveredQuantity: 5 },   // fully delivered -> pending 0
      { id: 'l3', orderedQuantity: 0, deliveredQuantity: 0 },   // filtered out (not ordered)
    ])));

    const sharedContext = { draftInfo: { l1: { qty: 3, docNos: new Set(['GR-9']) } } };
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
    const lines = await fetchLines({ base, headers, docId: 'o1', sharedContext: { draftInfo: {} } });
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
    // orderQuantity is intentionally NOT sent: it maps to M_InOutLine.QuantityOrder
    // (secondary-UOM order qty), which the m_inoutline check constraint requires to be
    // NULL unless M_Product_UOM_ID is set. Sending it broke single-UOM products (HTTP 500).
    expect(body).not.toHaveProperty('orderQuantity');
  });
});
