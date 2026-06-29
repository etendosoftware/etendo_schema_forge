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
import ImportFromPurchaseInvoiceModal from '@generated/goods-receipt/custom/ImportFromPurchaseInvoiceModal';

const headers = { Authorization: 'Bearer tok', 'Content-Type': 'application/json' };
const base = '/api';

function jsonRes(data, ok = true) {
  return { ok, json: async () => ({ response: { data } }) };
}

beforeEach(() => {
  captured = null;
});

describe('ImportFromPurchaseInvoiceModal — static prop contract', () => {
  it('forwards incoming props and the fixed config to ImportLinesModal', () => {
    render(<ImportFromPurchaseInvoiceModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    expect(captured).toBeTruthy();
    expect(captured.invoiceId).toBe('receipt-1');
    expect(captured.bpId).toBe('bp-1');
    expect(captured.linesEndpoint).toBe('goods-receipt/goodsReceiptLine');
    expect(captured.titleKey).toBe('importFromPurchaseInvoice');
    expect(captured.searchPlaceholderKey).toBe('searchPurchaseInvoice');
    expect(captured.emptyMessageKey).toBe('noCompletedPurchaseInvoicesForThisVendor');
    expect(captured.noSearchResultsKey).toBe('noInvoicesMatchYourSearch');
    expect(captured.successMessageKey).toBe('linesImportedFromPurchaseInvoice');
    expect(captured.showPriceColumns).toBe(false);
    expect(typeof captured.fetchDocuments).toBe('function');
    expect(typeof captured.fetchLines).toBe('function');
    expect(typeof captured.getDocDisplay).toBe('function');
    expect(typeof captured.buildLineBody).toBe('function');
  });

  it('does NOT pass an afterImport callback (invoice path has no order linking)', () => {
    render(<ImportFromPurchaseInvoiceModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    expect(captured.afterImport).toBeUndefined();
  });
});

describe('ImportFromPurchaseInvoiceModal — fetchDocuments', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps only completed invoices for this vendor that still have unlinked invoiced lines', async () => {
    render(<ImportFromPurchaseInvoiceModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { fetchDocuments } = captured;

    globalThis.fetch = vi.fn((url) => {
      if (url.includes('/purchase-invoice/header')) {
        return Promise.resolve(jsonRes([
          { id: 'i1', documentStatus: 'CO', businessPartner: 'bp-1', grandTotalAmount: 100 }, // has unlinked line -> keep
          { id: 'i2', documentStatus: 'CO', businessPartner: 'bp-1', grandTotalAmount: 50 },  // all linked -> drop
          { id: 'i3', documentStatus: 'DR', businessPartner: 'bp-1', grandTotalAmount: 10 },  // not completed -> drop
          { id: 'i4', documentStatus: 'CO', businessPartner: 'bp-2', grandTotalAmount: 10 },  // other vendor -> drop
        ]));
      }
      if (url.includes('parentId=i1')) {
        return Promise.resolve(jsonRes([{ id: 'l1', invoicedQuantity: 4, goodsShipmentLine: null }]));
      }
      if (url.includes('parentId=i2')) {
        return Promise.resolve(jsonRes([{ id: 'l2', invoicedQuantity: 4, goodsShipmentLine: 'gsl-1' }]));
      }
      return Promise.resolve(jsonRes([]));
    });

    const { documents, sharedContext } = await fetchDocuments({ base, headers, bpId: 'bp-1' });
    expect(documents.map((d) => d.id)).toEqual(['i1']);
    expect(sharedContext.linesCache).toHaveProperty('i1');
  });

  it('returns empty documents with an empty linesCache when the header request fails', async () => {
    render(<ImportFromPurchaseInvoiceModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { fetchDocuments } = captured;
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) }));
    const result = await fetchDocuments({ base, headers, bpId: 'bp-1' });
    expect(result.documents).toEqual([]);
    expect(result.sharedContext.linesCache).toEqual({});
  });
});

describe('ImportFromPurchaseInvoiceModal — fetchLines', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the cached lines and enriches them (max qty 0 when already linked)', async () => {
    render(<ImportFromPurchaseInvoiceModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { fetchLines } = captured;
    globalThis.fetch = vi.fn(() => { throw new Error('should not fetch when cached'); });

    const sharedContext = {
      linesCache: {
        i1: [
          { id: 'l1', invoicedQuantity: 4, goodsShipmentLine: null, 'product$_identifier': 'Bolt' },
          { id: 'l2', invoicedQuantity: 2, goodsShipmentLine: 'gsl-1' }, // already linked -> maxQty 0
          { id: 'l3', invoicedQuantity: 0, goodsShipmentLine: null },    // filtered out
        ],
      },
    };
    const lines = await fetchLines({ base, headers, docId: 'i1', sharedContext });
    expect(lines.map((l) => l.id)).toEqual(['l1', 'l2']);
    const l1 = lines.find((l) => l.id === 'l1');
    expect(l1._maxQty).toBe(4);
    expect(l1._alreadyImported).toBe(false);
    expect(l1._productName).toBe('Bolt');
    const l2 = lines.find((l) => l.id === 'l2');
    expect(l2._maxQty).toBe(0);
    expect(l2._alreadyImported).toBe(true);
  });

  it('falls back to fetching lines when none are cached', async () => {
    render(<ImportFromPurchaseInvoiceModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { fetchLines } = captured;
    globalThis.fetch = vi.fn(() => Promise.resolve(jsonRes([
      { id: 'l9', invoicedQuantity: 7, goodsShipmentLine: null },
    ])));
    const lines = await fetchLines({ base, headers, docId: 'i5', sharedContext: { linesCache: {} } });
    expect(lines).toHaveLength(1);
    expect(lines[0]._maxQty).toBe(7);
  });

  it('returns [] when the fallback fetch fails', async () => {
    render(<ImportFromPurchaseInvoiceModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { fetchLines } = captured;
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) }));
    const lines = await fetchLines({ base, headers, docId: 'i5', sharedContext: { linesCache: {} } });
    expect(lines).toEqual([]);
  });
});

describe('ImportFromPurchaseInvoiceModal — buildLineBody', () => {
  it('maps an invoice line into a goods-receipt line body keyed by invoiceLineId', async () => {
    render(<ImportFromPurchaseInvoiceModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { buildLineBody } = captured;
    const body = await buildLineBody({
      line: { id: 'l1', product: 'p1', uOM: 'u1' },
      qty: 3,
      invoiceId: 'receipt-1',
      lineNo: 20,
    });
    expect(body).toEqual({
      parentId: 'receipt-1',
      product: 'p1',
      movementQuantity: 3,
      uOM: 'u1',
      invoiceLineId: 'l1',
      lineNo: 20,
    });
  });
});
