// @covers artifacts/goods-receipt/custom/ImportFromPurchaseInvoiceModal.jsx
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
import ImportFromPurchaseInvoiceModal from '@generated/goods-receipt/custom/ImportFromPurchaseInvoiceModal';

const headers = { Authorization: 'Bearer tok', 'Accept-Language': 'es_ES', 'Content-Type': 'application/json' };
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
    expect(captured.eagerLoadLines).toBe(false);
    expect(captured.isDocumentCovered({ pendingLines: 0 })).toBe(true);
    expect(captured.getDocumentTotal({ id: 'i1' })).toBe(0); // invoice rows showed 0,00 before ETP-6099
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

const ACTION = `${base}/goods-receipt/goodsReceipt/receipt-1/action`;

describe('ImportFromPurchaseInvoiceModal — fetchDocuments', () => {
  afterEach(() => vi.restoreAllMocks());

  it('lists the vendor invoices from ONE availableInvoices call, covered ones included for the popup to hide', async () => {
    render(<ImportFromPurchaseInvoiceModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { fetchDocuments, isDocumentCovered } = captured;

    globalThis.fetch = vi.fn((url, opts) => {
      if (url === `${ACTION}/availableInvoices`) {
        expect(JSON.parse(opts.body)).toMatchObject({ includeCovered: true });
        return Promise.resolve(jsonRes([
          { id: 'i1', documentNo: 'FC-1', date: '2026-01-10', businessPartner: 'bp-1', pendingLines: 1 }, // has unlinked line -> shown
          { id: 'i2', documentNo: 'FC-2', date: '2026-01-09', businessPartner: 'bp-1', pendingLines: 0 }, // all linked -> hidden
        ]));
      }
      throw new Error(`unexpected request ${url}`);
    });

    const { documents, sharedContext } = await fetchDocuments({ base, headers, bpId: 'bp-1', invoiceId: 'receipt-1' });
    expect(documents.filter((d) => !isDocumentCovered(d)).map((d) => d.id)).toEqual(['i1']);
    expect(documents[0].invoiceDate).toBe('2026-01-10');
    expect(sharedContext).toEqual({ targetId: 'receipt-1' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns empty documents when the list request fails', async () => {
    render(<ImportFromPurchaseInvoiceModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { fetchDocuments } = captured;
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) }));
    const result = await fetchDocuments({ base, headers, bpId: 'bp-1', invoiceId: 'receipt-1' });
    expect(result.documents).toEqual([]);
    expect(result.excludedByCurrency).toBe(false);
  });
});

describe('ImportFromPurchaseInvoiceModal — fetchLines', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps the server pending (0 when already linked) and drops lines not invoiced in a positive quantity', async () => {
    render(<ImportFromPurchaseInvoiceModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { fetchLines } = captured;
    globalThis.fetch = vi.fn((url, opts) => {
      expect(url).toBe(`${ACTION}/availableInvoiceLines`);
      expect(JSON.parse(opts.body)).toEqual({ invoiceId: 'i1', includeCovered: true, detail: true });
      return Promise.resolve(jsonRes([
        { id: 'l1', lineNo: 10, invoicedQuantity: 4, pendingQuantity: 4, linked: false, 'product$_identifier': 'Bolt' },
        { id: 'l2', lineNo: 20, invoicedQuantity: 2, pendingQuantity: 0, linked: true, inDraftDocuments: [] }, // already linked -> maxQty 0
        { id: 'l4', lineNo: 40, invoicedQuantity: 3, pendingQuantity: 0, linked: false, inDraftDocuments: ['GR-7'] }, // held by another draft
        { id: 'l3', lineNo: 30, invoicedQuantity: 0, pendingQuantity: 0, linked: false }, // filtered out
      ]));
    });

    const lines = await fetchLines({ base, headers, docId: 'i1', sharedContext: { targetId: 'receipt-1' } });
    expect(lines.map((l) => l.id)).toEqual(['l1', 'l2', 'l4']);
    const l1 = lines.find((l) => l.id === 'l1');
    expect(l1._maxQty).toBe(4);
    expect(l1._alreadyImported).toBe(false);
    expect(l1._productName).toBe('Bolt');
    expect(l1._inDraftShipments).toBeUndefined();
    const l4 = lines.find((l) => l.id === 'l4');
    expect(l4._alreadyImported).toBe(true);
    expect(l4._inDraftShipments).toEqual(['GR-7']); // the draft note, not «ya importada»
    const l2 = lines.find((l) => l.id === 'l2');
    expect(l2._maxQty).toBe(0);
    expect(l2._alreadyImported).toBe(true);
  });

  it('returns [] when the lines request fails', async () => {
    render(<ImportFromPurchaseInvoiceModal invoiceId="receipt-1" bpId="bp-1" base={base} headers={headers} />);
    const { fetchLines } = captured;
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) }));
    const lines = await fetchLines({ base, headers, docId: 'i5', sharedContext: { targetId: 'receipt-1' } });
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
