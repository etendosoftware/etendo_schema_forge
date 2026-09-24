// @vitest-environment jsdom
//
// ETP-5429 — mirrors ImportFromShipmentModal.spec.jsx (return-material-receipt),
// with the return-to-vendor-shipment-specific detail: fetchLines scopes the
// request to the current business partner (a receipt can be shared across
// vendors), sending `businessPartner` alongside `receiptId`.
import { render } from '@testing-library/react';

let capturedProps = null;

vi.mock('@/components/contract-ui/ImportLinesModal', () => ({
  default: (props) => {
    capturedProps = props;
    return null;
  },
}));

import ImportFromReceiptModal from '../ImportFromReceiptModal.jsx';

const BASE_PROPS = {
  targetId: 'RTV-001',
  bpId: 'BP-VENDOR-1',
  base: '/sws/neo',
  headers: { Authorization: 'Bearer tok' },
  onClose: vi.fn(),
  onSuccess: vi.fn(),
};

describe('ImportFromReceiptModal', () => {
  beforeEach(() => {
    capturedProps = null;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [] } }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders ImportLinesModal and forwards the base props, mapping targetId to invoiceId', () => {
    render(<ImportFromReceiptModal {...BASE_PROPS} />);
    expect(capturedProps).not.toBeNull();
    expect(capturedProps.invoiceId).toBe('RTV-001');
    expect(capturedProps.bpId).toBe('BP-VENDOR-1');
    expect(capturedProps.base).toBe('/sws/neo');
    expect(capturedProps.headers).toBe(BASE_PROPS.headers);
    expect(capturedProps.onClose).toBe(BASE_PROPS.onClose);
    expect(capturedProps.onSuccess).toBe(BASE_PROPS.onSuccess);
  });

  it('passes the expected static i18n keys', () => {
    render(<ImportFromReceiptModal {...BASE_PROPS} />);
    expect(capturedProps.titleKey).toBe('importFromReceipt');
    expect(capturedProps.searchPlaceholderKey).toBe('searchReceipt');
    expect(capturedProps.emptyMessageKey).toBe('noCompletedReceiptsForThisVendor');
    expect(capturedProps.noSearchResultsKey).toBe('noReceiptsMatchYourSearch');
    expect(capturedProps.successMessageKey).toBe('linesImportedFromReceipt');
  });

  it('opts the return-lines UI into the ETP-5429 unified props', () => {
    render(<ImportFromReceiptModal {...BASE_PROPS} />);
    expect(capturedProps.showPriceColumns).toBe(false);
    expect(capturedProps.filterZeroQty).toBe(true);
    expect(capturedProps.autoSelectOnExpand).toBe(true);
    expect(capturedProps.eagerLoadLines).toBe(false);
    expect(capturedProps.showAvailableQtyColumn).toBe(true);
    expect(capturedProps.qtyColumnLabelKey).toBe('returnQty');
  });

  it('passes fetchDocuments, fetchLines, getDocDisplay and submitImport as functions, with no linesEndpoint', () => {
    render(<ImportFromReceiptModal {...BASE_PROPS} />);
    expect(typeof capturedProps.fetchDocuments).toBe('function');
    expect(typeof capturedProps.fetchLines).toBe('function');
    expect(typeof capturedProps.getDocDisplay).toBe('function');
    expect(typeof capturedProps.submitImport).toBe('function');
    expect(capturedProps.linesEndpoint).toBeUndefined();
  });

  describe('getDocDisplay', () => {
    it('maps documentNo/movementDate, falling back to id when documentNo is absent', () => {
      render(<ImportFromReceiptModal {...BASE_PROPS} />);
      const { getDocDisplay } = capturedProps;
      expect(getDocDisplay({ id: 'RCPT-1', documentNo: 'RCPT-001', movementDate: '2025-03-05' }))
        .toEqual({ docNo: 'RCPT-001', date: '2025-03-05' });
      expect(getDocDisplay({ id: 'RCPT-2', movementDate: '2025-04-01' }))
        .toEqual({ docNo: 'RCPT-2', date: '2025-04-01' });
    });
  });

  describe('fetchDocuments', () => {
    it('POSTs to availableReceipts with { businessPartner: bpId } and returns { documents }', async () => {
      render(<ImportFromReceiptModal {...BASE_PROPS} />);
      const { fetchDocuments } = capturedProps;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [{ id: 'RCPT-1' }] } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchDocuments({ base: '/sws/neo', bpId: 'BP-VENDOR-42' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('/sws/neo/return-to-vendor-shipment/returnToVendorShipment/_/action/availableReceipts');
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({ businessPartner: 'BP-VENDOR-42' });
      expect(result).toEqual({ documents: [{ id: 'RCPT-1' }], sharedContext: {} });
    });

    it('returns an empty documents array when the response is not ok', async () => {
      render(<ImportFromReceiptModal {...BASE_PROPS} />);
      const { fetchDocuments } = capturedProps;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      const result = await fetchDocuments({ base: '/sws/neo', bpId: 'BP-1' });
      expect(result).toEqual({ documents: [], sharedContext: {} });
    });
  });

  describe('fetchLines — vendor-scoped (businessPartner sent alongside receiptId)', () => {
    it('POSTs to availableReceiptLines with { receiptId: docId, businessPartner: bpId } and enriches each line', async () => {
      render(<ImportFromReceiptModal {...BASE_PROPS} />);
      const { fetchLines } = capturedProps;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: {
            data: [{ id: 'LINE-1', movementQuantity: '2.25', 'product$_identifier': 'Widget V' }],
          },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      // The wrapper closes over the `bpId` prop (BP-VENDOR-1) — callers only pass
      // { base, docId } through ImportLinesModal, matching its fetchLines contract.
      const result = await fetchLines({ base: '/sws/neo', docId: 'RCPT-99' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('/sws/neo/return-to-vendor-shipment/returnToVendorShipment/_/action/availableReceiptLines');
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({ receiptId: 'RCPT-99', businessPartner: 'BP-VENDOR-1' });
      expect(result).toEqual([{
        id: 'LINE-1',
        movementQuantity: '2.25',
        'product$_identifier': 'Widget V',
        _maxQty: 2.25,
        _productName: 'Widget V',
      }]);
    });

    it('scopes fetchLines to whatever bpId prop the wrapper was rendered with', async () => {
      render(<ImportFromReceiptModal {...BASE_PROPS} bpId="BP-VENDOR-OTHER" />);
      const { fetchLines } = capturedProps;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [] } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await fetchLines({ base: '/sws/neo', docId: 'RCPT-1' });

      const [, opts] = mockFetch.mock.calls[0];
      expect(JSON.parse(opts.body)).toEqual({ receiptId: 'RCPT-1', businessPartner: 'BP-VENDOR-OTHER' });
    });

    it('clamps a negative or non-numeric movementQuantity to _maxQty 0', async () => {
      render(<ImportFromReceiptModal {...BASE_PROPS} />);
      const { fetchLines } = capturedProps;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [{ id: 'LINE-1', movementQuantity: '-2' }, { id: 'LINE-2', movementQuantity: 'nope' }] } }),
      }));

      const result = await fetchLines({ base: '/sws/neo', docId: 'RCPT-1' });
      expect(result[0]._maxQty).toBe(0);
      expect(result[1]._maxQty).toBe(0);
    });

    it('falls back to line.id as _productName when product$_identifier is absent', async () => {
      render(<ImportFromReceiptModal {...BASE_PROPS} />);
      const { fetchLines } = capturedProps;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [{ id: 'LINE-9', movementQuantity: '1' }] } }),
      }));

      const result = await fetchLines({ base: '/sws/neo', docId: 'RCPT-1' });
      expect(result[0]._productName).toBe('LINE-9');
    });

    it('returns [] when the response is not ok', async () => {
      render(<ImportFromReceiptModal {...BASE_PROPS} />);
      const { fetchLines } = capturedProps;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      const result = await fetchLines({ base: '/sws/neo', docId: 'RCPT-1' });
      expect(result).toEqual([]);
    });
  });

  describe('submitImport', () => {
    it('POSTs to importReceiptLines with the mapped lines payload and returns { ok: true, count }', async () => {
      render(<ImportFromReceiptModal {...BASE_PROPS} />);
      const { submitImport } = capturedProps;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: { importedCount: 3 } } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const lines = [
        { line: { id: 'LINE-1' }, qty: 2 },
        { line: { id: 'LINE-2' }, qty: 4 },
      ];
      const result = await submitImport({ lines, base: '/sws/neo', invoiceId: 'RTV-123' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('/sws/neo/return-to-vendor-shipment/returnToVendorShipment/RTV-123/action/importReceiptLines');
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({
        lines: [
          { sourceLineId: 'LINE-1', returnQuantity: 2 },
          { sourceLineId: 'LINE-2', returnQuantity: 4 },
        ],
      });
      expect(result).toEqual({ ok: true, count: 3 });
    });

    it('falls back to lines.length as count when the response carries no importedCount', async () => {
      render(<ImportFromReceiptModal {...BASE_PROPS} />);
      const { submitImport } = capturedProps;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: {} } }),
      }));

      const lines = [{ line: { id: 'LINE-1' }, qty: 1 }];
      const result = await submitImport({ lines, base: '/sws/neo', invoiceId: 'RTV-1' });
      expect(result).toEqual({ ok: true, count: 1 });
    });

    it('returns { ok: false } when the POST fails', async () => {
      render(<ImportFromReceiptModal {...BASE_PROPS} />);
      const { submitImport } = capturedProps;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      const lines = [{ line: { id: 'LINE-1' }, qty: 999 }];
      const result = await submitImport({ lines, base: '/sws/neo', invoiceId: 'RTV-1' });
      expect(result).toEqual({ ok: false });
    });
  });
});
