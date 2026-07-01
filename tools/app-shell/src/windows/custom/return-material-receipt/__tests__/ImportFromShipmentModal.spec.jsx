// @vitest-environment jsdom
import { render } from '@testing-library/react';

let capturedProps = null;

vi.mock('@/components/import-return-lines/ImportReturnLinesModal', () => ({
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

  it('renders without crashing and forwards all base props', () => {
    render(<ImportFromShipmentModal {...BASE_PROPS} />);
    expect(capturedProps).not.toBeNull();
    expect(capturedProps.targetId).toBe('REC-001');
    expect(capturedProps.bpId).toBe('BP-001');
    expect(capturedProps.base).toBe('/sws/neo');
    expect(capturedProps.onClose).toBe(BASE_PROPS.onClose);
    expect(capturedProps.onSuccess).toBe(BASE_PROPS.onSuccess);
  });

  it('passes a config object as the config prop', () => {
    render(<ImportFromShipmentModal {...BASE_PROPS} />);
    expect(capturedProps.config).toBeDefined();
    expect(typeof capturedProps.config).toBe('object');
  });

  it('config has expected static shape (titleKey, searchPlaceholderKey, dateField, showAmount, qtyStep)', () => {
    render(<ImportFromShipmentModal {...BASE_PROPS} />);
    const { config } = capturedProps;
    expect(config.titleKey).toBe('importFromShipment');
    expect(config.searchPlaceholderKey).toBe('searchShipment');
    expect(config.dateField).toBe('movementDate');
    expect(config.showAmount).toBe(false);
    expect(config.qtyStep).toBe(1);
  });

  it('config.importActionUrl returns the correct URL', () => {
    render(<ImportFromShipmentModal {...BASE_PROPS} />);
    const url = capturedProps.config.importActionUrl('/sws/neo', 'REC-123');
    expect(url).toBe(
      '/sws/neo/return-material-receipt/returnMaterialReceipt/REC-123/action/importShipmentLines',
    );
  });

  it('config.fetchSourceDocs POSTs to availableShipments with businessPartner body', async () => {
    render(<ImportFromShipmentModal {...BASE_PROPS} />);
    const { config } = capturedProps;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [{ id: 'SHIP-1' }] } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await config.fetchSourceDocs('/sws/neo', 'BP-42', { Authorization: 'Bearer x' });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('availableShipments');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ businessPartner: 'BP-42' });
    expect(result).toEqual([{ id: 'SHIP-1' }]);
  });

  it('config.fetchSourceDocs returns [] when response is not ok', async () => {
    render(<ImportFromShipmentModal {...BASE_PROPS} />);
    const { config } = capturedProps;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const result = await config.fetchSourceDocs('/sws/neo', 'BP-1', {});
    expect(result).toEqual([]);
  });

  it('config.fetchSourceLines POSTs to availableShipmentLines with shipmentId body', async () => {
    render(<ImportFromShipmentModal {...BASE_PROPS} />);
    const { config } = capturedProps;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [{ id: 'LINE-1' }] } }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await config.fetchSourceLines('/sws/neo', 'SHIP-99', { Authorization: 'Bearer x' });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain('availableShipmentLines');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ shipmentId: 'SHIP-99' });
    expect(result).toEqual([{ id: 'LINE-1' }]);
  });

  it('config.fetchSourceLines returns [] when response is not ok', async () => {
    render(<ImportFromShipmentModal {...BASE_PROPS} />);
    const { config } = capturedProps;

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const result = await config.fetchSourceLines('/sws/neo', 'SHIP-1', {});
    expect(result).toEqual([]);
  });
});
