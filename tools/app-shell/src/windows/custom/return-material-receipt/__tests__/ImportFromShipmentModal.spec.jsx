// @vitest-environment jsdom
//
// ETP-5429 — this wrapper was rewritten to render the shared ImportLinesModal
// directly (fetchDocuments/fetchLines/getDocDisplay/submitImport passed as
// plain functions), replacing the old ImportReturnLinesModal + positional
// `config` object contract. This spec was rewritten from scratch to match.
import { render } from '@testing-library/react';

let capturedProps = null;

vi.mock('@/components/contract-ui/ImportLinesModal', () => ({
  default: (props) => {
    capturedProps = props;
    return null;
  },
}));

import ImportFromShipmentModal from '../ImportFromShipmentModal.jsx';

const BASE_PROPS = {
  targetId: 'REC-001',
  bpId: 'BP-001',
  base: '/sws/neo',
  headers: { Authorization: 'Bearer tok' },
  onClose: vi.fn(),
  onSuccess: vi.fn(),
};

describe('ImportFromShipmentModal', () => {
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
    render(<ImportFromShipmentModal {...BASE_PROPS} />);
    expect(capturedProps).not.toBeNull();
    expect(capturedProps.invoiceId).toBe('REC-001');
    expect(capturedProps.bpId).toBe('BP-001');
    expect(capturedProps.base).toBe('/sws/neo');
    expect(capturedProps.headers).toBe(BASE_PROPS.headers);
    expect(capturedProps.onClose).toBe(BASE_PROPS.onClose);
    expect(capturedProps.onSuccess).toBe(BASE_PROPS.onSuccess);
  });

  it('passes the expected static i18n keys', () => {
    render(<ImportFromShipmentModal {...BASE_PROPS} />);
    expect(capturedProps.titleKey).toBe('importFromShipment');
    expect(capturedProps.searchPlaceholderKey).toBe('searchShipment');
    expect(capturedProps.emptyMessageKey).toBe('noCompletedShipmentsForThisCustomer');
    expect(capturedProps.noSearchResultsKey).toBe('noShipmentsMatchYourSearch');
    expect(capturedProps.successMessageKey).toBe('linesImportedFromShipment');
  });

  it('opts the return-lines UI into the ETP-5429 unified props', () => {
    render(<ImportFromShipmentModal {...BASE_PROPS} />);
    expect(capturedProps.showPriceColumns).toBe(false);
    expect(capturedProps.filterZeroQty).toBe(true);
    expect(capturedProps.autoSelectOnExpand).toBe(true);
    expect(capturedProps.eagerLoadLines).toBe(false);
    expect(capturedProps.showAvailableQtyColumn).toBe(true);
    expect(capturedProps.qtyColumnLabelKey).toBe('returnQty');
  });

  it('passes fetchDocuments, fetchLines, getDocDisplay and submitImport as functions', () => {
    render(<ImportFromShipmentModal {...BASE_PROPS} />);
    expect(typeof capturedProps.fetchDocuments).toBe('function');
    expect(typeof capturedProps.fetchLines).toBe('function');
    expect(typeof capturedProps.getDocDisplay).toBe('function');
    expect(typeof capturedProps.submitImport).toBe('function');
    // No linesEndpoint — submitImport fully replaces the per-line POST loop.
    expect(capturedProps.linesEndpoint).toBeUndefined();
  });

  describe('getDocDisplay', () => {
    it('maps documentNo/movementDate, falling back to id when documentNo is absent', () => {
      render(<ImportFromShipmentModal {...BASE_PROPS} />);
      const { getDocDisplay } = capturedProps;
      expect(getDocDisplay({ id: 'SHIP-1', documentNo: 'SHIP-001', movementDate: '2025-01-10' }))
        .toEqual({ docNo: 'SHIP-001', date: '2025-01-10' });
      expect(getDocDisplay({ id: 'SHIP-2', movementDate: '2025-02-01' }))
        .toEqual({ docNo: 'SHIP-2', date: '2025-02-01' });
    });
  });

  describe('fetchDocuments', () => {
    it('POSTs to availableShipments with { businessPartner: bpId } and returns { documents }', async () => {
      render(<ImportFromShipmentModal {...BASE_PROPS} />);
      const { fetchDocuments } = capturedProps;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [{ id: 'SHIP-1' }] } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchDocuments({ base: '/sws/neo', bpId: 'BP-42' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('/sws/neo/return-material-receipt/returnMaterialReceipt/_/action/availableShipments');
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({ businessPartner: 'BP-42' });
      expect(result).toEqual({ documents: [{ id: 'SHIP-1' }], sharedContext: {} });
    });

    it('returns an empty documents array when the response is not ok', async () => {
      render(<ImportFromShipmentModal {...BASE_PROPS} />);
      const { fetchDocuments } = capturedProps;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      const result = await fetchDocuments({ base: '/sws/neo', bpId: 'BP-1' });
      expect(result).toEqual({ documents: [], sharedContext: {} });
    });
  });

  describe('fetchLines', () => {
    it('POSTs to availableShipmentLines with { shipmentId: docId } and enriches each line', async () => {
      render(<ImportFromShipmentModal {...BASE_PROPS} />);
      const { fetchLines } = capturedProps;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          response: {
            data: [{ id: 'LINE-1', movementQuantity: '3.5', 'product$_identifier': 'Widget A' }],
          },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await fetchLines({ base: '/sws/neo', docId: 'SHIP-99' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('/sws/neo/return-material-receipt/returnMaterialReceipt/_/action/availableShipmentLines');
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({ shipmentId: 'SHIP-99' });
      expect(result).toEqual([{
        id: 'LINE-1',
        movementQuantity: '3.5',
        'product$_identifier': 'Widget A',
        _maxQty: 3.5,
        _productName: 'Widget A',
      }]);
    });

    it('clamps a negative or non-numeric movementQuantity to _maxQty 0', async () => {
      render(<ImportFromShipmentModal {...BASE_PROPS} />);
      const { fetchLines } = capturedProps;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [{ id: 'LINE-1', movementQuantity: '-5' }, { id: 'LINE-2', movementQuantity: 'abc' }] } }),
      }));

      const result = await fetchLines({ base: '/sws/neo', docId: 'SHIP-1' });
      expect(result[0]._maxQty).toBe(0);
      expect(result[1]._maxQty).toBe(0);
    });

    it('falls back to line.id as _productName when product$_identifier is absent', async () => {
      render(<ImportFromShipmentModal {...BASE_PROPS} />);
      const { fetchLines } = capturedProps;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: [{ id: 'LINE-7', movementQuantity: '1' }] } }),
      }));

      const result = await fetchLines({ base: '/sws/neo', docId: 'SHIP-1' });
      expect(result[0]._productName).toBe('LINE-7');
    });

    it('returns [] when the response is not ok', async () => {
      render(<ImportFromShipmentModal {...BASE_PROPS} />);
      const { fetchLines } = capturedProps;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      const result = await fetchLines({ base: '/sws/neo', docId: 'SHIP-1' });
      expect(result).toEqual([]);
    });
  });

  describe('submitImport', () => {
    it('POSTs to importShipmentLines with the mapped lines payload and returns { ok: true, count }', async () => {
      render(<ImportFromShipmentModal {...BASE_PROPS} />);
      const { submitImport } = capturedProps;

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: { importedCount: 2 } } }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const lines = [
        { line: { id: 'LINE-1' }, qty: 3 },
        { line: { id: 'LINE-2' }, qty: 1 },
      ];
      const result = await submitImport({ lines, base: '/sws/neo', invoiceId: 'REC-123' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('/sws/neo/return-material-receipt/returnMaterialReceipt/REC-123/action/importShipmentLines');
      expect(opts.method).toBe('POST');
      expect(JSON.parse(opts.body)).toEqual({
        lines: [
          { sourceLineId: 'LINE-1', returnQuantity: 3 },
          { sourceLineId: 'LINE-2', returnQuantity: 1 },
        ],
      });
      expect(result).toEqual({ ok: true, count: 2 });
    });

    it('falls back to lines.length as count when the response carries no importedCount', async () => {
      render(<ImportFromShipmentModal {...BASE_PROPS} />);
      const { submitImport } = capturedProps;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ response: { data: {} } }),
      }));

      const lines = [{ line: { id: 'LINE-1' }, qty: 1 }];
      const result = await submitImport({ lines, base: '/sws/neo', invoiceId: 'REC-1' });
      expect(result).toEqual({ ok: true, count: 1 });
    });

    it('returns { ok: false } when the POST fails (e.g. quantity exceeds available stock, rejected server-side)', async () => {
      render(<ImportFromShipmentModal {...BASE_PROPS} />);
      const { submitImport } = capturedProps;

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

      const lines = [{ line: { id: 'LINE-1' }, qty: 999 }];
      const result = await submitImport({ lines, base: '/sws/neo', invoiceId: 'REC-1' });
      expect(result).toEqual({ ok: false });
    });
  });
});
