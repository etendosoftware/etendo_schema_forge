// Mocks must come before imports (Vitest hoisting)

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US' }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const mockFetchByCriteria = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockFetchChild = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockFetchById = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock('@/components/related-documents', () => ({
  DocChip: ({ type }) => <div data-testid={`chip-${type}`}>{type}</div>,
  RelatedDocumentsShell: ({ children, loading, onRefresh }) => (
    <div data-testid="shell" data-loading={String(loading)}>
      {onRefresh && (
        <button data-testid="refresh-btn" onClick={onRefresh}>
          Refresh
        </button>
      )}
      {children}
    </div>
  ),
  docChipProps: ({ type }) => ({ type }),
  fetchByCriteria: mockFetchByCriteria,
  fetchChild: mockFetchChild,
  fetchById: mockFetchById,
}));

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RelatedDocuments from '../RelatedDocuments.jsx';

const DEFAULT_PROPS = {
  recordId: 'inv-1',
  data: {},
  token: 'tok',
  apiBaseUrl: '/api',
};

describe('RelatedDocuments (purchase-invoice)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchByCriteria.mockResolvedValue([]);
    mockFetchChild.mockResolvedValue([]);
    mockFetchById.mockResolvedValue(null);
  });

  it('renders RelatedDocumentsShell (initially loading=true, then false)', async () => {
    render(<RelatedDocuments {...DEFAULT_PROPS} />);
    // Initially loading
    expect(screen.getByTestId('shell').dataset.loading).toBe('true');
    // After promises resolve
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
  });

  it('does not fetch when recordId is absent', () => {
    render(<RelatedDocuments {...DEFAULT_PROPS} recordId={undefined} />);
    expect(mockFetchChild).not.toHaveBeenCalled();
    expect(mockFetchById).not.toHaveBeenCalled();
    expect(mockFetchByCriteria).not.toHaveBeenCalled();
  });

  it('uses linkedReceipts from data directly without calling fetchByCriteria for receipts', async () => {
    const linkedReceipts = [{ id: 'rcpt-1', documentNo: 'ALB-001' }];
    render(
      <RelatedDocuments
        {...DEFAULT_PROPS}
        data={{ salesOrder: null, linkedReceipts }}
      />
    );
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    // fetchByCriteria must NOT have been called for receipts
    const criteriaCallsForReceipts = mockFetchByCriteria.mock.calls.filter(
      ([, entity]) => entity === 'goodsReceipt'
    );
    expect(criteriaCallsForReceipts).toHaveLength(0);
    // receipt chip should be rendered
    expect(screen.getAllByTestId('chip-receipt')).toHaveLength(1);
  });

  it('calls fetchByCriteria for receipts when linkedReceipts is not provided and salesOrder exists', async () => {
    mockFetchByCriteria.mockResolvedValue([{ id: 'rcpt-1' }]);
    render(
      <RelatedDocuments
        {...DEFAULT_PROPS}
        data={{ salesOrder: 'so-1' }}
      />
    );
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(mockFetchByCriteria).toHaveBeenCalledWith(
      'goods-receipt',
      'goodsReceipt',
      'salesOrder',
      'so-1',
      'tok',
      '/api'
    );
  });

  it('renders payment chips when fetchChild returns payment plan entries', async () => {
    // fetchChild called twice: once for paymentPlan, once for paymentDetails
    mockFetchChild
      .mockResolvedValueOnce([{ id: 'plan-1' }])           // paymentPlan
      .mockResolvedValueOnce([{ payment: 'pay-1' }]);       // paymentDetails
    mockFetchById.mockResolvedValueOnce({ id: 'pay-1', documentNo: 'PAY-001' });

    render(<RelatedDocuments {...DEFAULT_PROPS} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.getByTestId('chip-payment')).toBeInTheDocument();
  });

  it('renders no payment chips when fetchChild returns empty paymentPlan', async () => {
    mockFetchChild.mockResolvedValue([]);

    render(<RelatedDocuments {...DEFAULT_PROPS} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.queryByTestId('chip-payment')).not.toBeInTheDocument();
  });

  it('renders no payment chips when paymentDetails has no payment field', async () => {
    mockFetchChild
      .mockResolvedValueOnce([{ id: 'plan-1' }])    // paymentPlan
      .mockResolvedValueOnce([{ payment: null }]);   // paymentDetails with null payment
    // fetchById not called since no valid paymentId

    render(<RelatedDocuments {...DEFAULT_PROPS} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.queryByTestId('chip-payment')).not.toBeInTheDocument();
  });

  it('renders one payment chip per plan when each plan has a distinct payment', async () => {
    mockFetchChild
      .mockResolvedValueOnce([{ id: 'plan-1' }, { id: 'plan-2' }])  // paymentPlan
      .mockResolvedValueOnce([{ payment: 'pay-1' }])                  // details plan-1
      .mockResolvedValueOnce([{ payment: 'pay-2' }]);                 // details plan-2 — distinct id
    mockFetchById
      .mockResolvedValueOnce({ id: 'pay-1', documentNo: 'PAY-001' })
      .mockResolvedValueOnce({ id: 'pay-2', documentNo: 'PAY-002' });

    render(<RelatedDocuments {...DEFAULT_PROPS} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(mockFetchById).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTestId('chip-payment')).toHaveLength(2);
  });

  it('onRefresh button triggers re-fetch (fetchChild called again)', async () => {
    mockFetchChild
      .mockResolvedValueOnce([])    // initial paymentPlan
      .mockResolvedValueOnce([]);   // after refresh

    render(<RelatedDocuments {...DEFAULT_PROPS} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );

    const callCountBefore = mockFetchChild.mock.calls.length;

    fireEvent.click(screen.getByTestId('refresh-btn'));

    await waitFor(() =>
      expect(mockFetchChild.mock.calls.length).toBeGreaterThan(callCountBefore)
    );
  });

  it('renders purchase order chip when salesOrder resolves from fetchById', async () => {
    mockFetchById.mockResolvedValueOnce({ id: 'po-1', documentNo: 'PO-001' });

    render(
      <RelatedDocuments
        {...DEFAULT_PROPS}
        data={{ salesOrder: 'po-1' }}
      />
    );
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.getByTestId('chip-order')).toBeInTheDocument();
  });
});

describe('RelatedDocuments — Return Invoice (Factura de Devolución)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchByCriteria.mockResolvedValue([]);
    mockFetchChild.mockResolvedValue([]);
    mockFetchById.mockResolvedValue(null);
  });

  const RETURN_DATA = { 'transactionDocument$_identifier': 'Return Material Purchase Invoice' };

  it('renders return-to-vendor chip when invoice lines reference a return delivery', async () => {
    mockFetchChild.mockResolvedValueOnce([{ id: 'line-1', goodsShipmentLine: 'sl-1' }]); // lines
    mockFetchChild.mockResolvedValueOnce([]); // paymentPlan
    mockFetchById.mockResolvedValueOnce({ id: 'sl-1', parentId: 'ret-ship-1' });
    mockFetchById.mockResolvedValueOnce({ id: 'ret-ship-1', documentNo: 'RET-001' });

    render(<RelatedDocuments {...DEFAULT_PROPS} data={RETURN_DATA} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.getByTestId('chip-return-to-vendor')).toBeInTheDocument();
  });

  it('does not render purchase order or receipt chips for Return Invoice', async () => {
    mockFetchChild.mockResolvedValueOnce([]); // lines (empty)
    mockFetchChild.mockResolvedValueOnce([]); // paymentPlan

    render(<RelatedDocuments {...DEFAULT_PROPS} data={RETURN_DATA} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.queryByTestId('chip-order')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-receipt')).not.toBeInTheDocument();
  });

  it('renders no return-to-vendor chip when lines have no goodsShipmentLine', async () => {
    mockFetchChild.mockResolvedValueOnce([{ id: 'line-1', goodsShipmentLine: null }]);
    mockFetchChild.mockResolvedValueOnce([]);

    render(<RelatedDocuments {...DEFAULT_PROPS} data={RETURN_DATA} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.queryByTestId('chip-return-to-vendor')).not.toBeInTheDocument();
  });

  it('deduplicates return deliveries when multiple lines share the same shipment', async () => {
    mockFetchChild.mockResolvedValueOnce([
      { id: 'line-1', goodsShipmentLine: 'sl-1' },
      { id: 'line-2', goodsShipmentLine: 'sl-2' },
    ]);
    mockFetchChild.mockResolvedValueOnce([]);
    mockFetchById.mockResolvedValueOnce({ id: 'sl-1', parentId: 'ret-ship-1' });
    mockFetchById.mockResolvedValueOnce({ id: 'sl-2', parentId: 'ret-ship-1' });
    mockFetchById.mockResolvedValueOnce({ id: 'ret-ship-1', documentNo: 'RET-001' });

    render(<RelatedDocuments {...DEFAULT_PROPS} data={RETURN_DATA} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.getAllByTestId('chip-return-to-vendor')).toHaveLength(1);
  });

  it('also triggers for Spanish identifier "Factura de Devolución" (after transformRecord)', async () => {
    mockFetchChild.mockResolvedValueOnce([{ id: 'line-1', goodsShipmentLine: 'sl-1' }]);
    mockFetchChild.mockResolvedValueOnce([]);
    mockFetchById.mockResolvedValueOnce({ id: 'sl-1', parentId: 'ret-ship-1' });
    mockFetchById.mockResolvedValueOnce({ id: 'ret-ship-1', documentNo: 'RET-001' });

    render(<RelatedDocuments {...DEFAULT_PROPS} data={{ 'transactionDocument$_identifier': 'Factura de Devolución' }} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.getByTestId('chip-return-to-vendor')).toBeInTheDocument();
  });

  // ETP-4737: RETURN_INVOICE_TYPES (an exact-name Set) never matched this new doc
  // type, so linked return deliveries never got fetched for a rectificativa
  // invoice. Fixed by resolving the subtype via getApSubtype instead.
  it('also triggers for the new "Factura Rectificativa (compras)" doc type', async () => {
    mockFetchChild.mockResolvedValueOnce([{ id: 'line-1', goodsShipmentLine: 'sl-1' }]);
    mockFetchChild.mockResolvedValueOnce([]);
    mockFetchById.mockResolvedValueOnce({ id: 'sl-1', parentId: 'ret-ship-1' });
    mockFetchById.mockResolvedValueOnce({ id: 'ret-ship-1', documentNo: 'RET-001' });

    render(<RelatedDocuments {...DEFAULT_PROPS} data={{ 'transactionDocument$_identifier': 'Factura Rectificativa (compras)' }} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.getByTestId('chip-return-to-vendor')).toBeInTheDocument();
  });

  it('prefers the server-injected apInvoiceSubtype over the identifier string', async () => {
    mockFetchChild.mockResolvedValueOnce([{ id: 'line-1', goodsShipmentLine: 'sl-1' }]);
    mockFetchChild.mockResolvedValueOnce([]);
    mockFetchById.mockResolvedValueOnce({ id: 'sl-1', parentId: 'ret-ship-1' });
    mockFetchById.mockResolvedValueOnce({ id: 'ret-ship-1', documentNo: 'RET-001' });

    render(<RelatedDocuments {...DEFAULT_PROPS} data={{ apInvoiceSubtype: 'RECTIFICATIVA', 'transactionDocument$_identifier': 'Factura Rectificativa (compras)' }} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.getByTestId('chip-return-to-vendor')).toBeInTheDocument();
  });
});

// ETP-4737 — data.originInvoice: set when this rectificativa was created via the
// "Import from Source Invoice" popup (manual correction). Independent from
// sourceInvoice/sourceReturnDeliveries above, which cover the auto-generated-
// from-return case.
describe('RelatedDocuments (purchase-invoice) — originInvoice chip (ETP-4737)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchByCriteria.mockResolvedValue([]);
    mockFetchChild.mockResolvedValue([]);
    mockFetchById.mockResolvedValue(null);
  });

  it('fetches and renders an invoice chip when data.originInvoice is present', async () => {
    mockFetchById.mockResolvedValueOnce({ id: 'origin-1', documentNo: 'FC-100' });

    render(<RelatedDocuments {...DEFAULT_PROPS} data={{ originInvoice: 'origin-1' }} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(mockFetchById).toHaveBeenCalledWith('purchase-invoice', 'header', 'origin-1', 'tok', '/api');
    expect(screen.getByTestId('chip-invoice')).toBeInTheDocument();
  });

  it('does not render an invoice chip when data.originInvoice is absent', async () => {
    render(<RelatedDocuments {...DEFAULT_PROPS} data={{}} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.queryByTestId('chip-invoice')).not.toBeInTheDocument();
  });

  it('does not render an invoice chip when the fetch fails (caught, resolves null)', async () => {
    mockFetchById.mockRejectedValueOnce(new Error('not found'));

    render(<RelatedDocuments {...DEFAULT_PROPS} data={{ originInvoice: 'origin-1' }} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.queryByTestId('chip-invoice')).not.toBeInTheDocument();
  });

  it('is additive: renders alongside pre-existing return-to-vendor chips, without hiding them', async () => {
    const RETURN_DATA = { apInvoiceSubtype: 'RECTIFICATIVA', originInvoice: 'origin-1' };
    mockFetchChild
      .mockResolvedValueOnce([{ id: 'line-1', goodsShipmentLine: 'sl-1' }]) // lines
      .mockResolvedValueOnce([]); // paymentPlan
    // Call order matters: the originInvoice fetchById is invoked synchronously in the
    // effect body right after the isReturn Promise.all is kicked off, which resolves
    // BEFORE the async continuation inside fetchLinkedReturnDeliveries (itself gated
    // behind an earlier `await fetchChild(...)`) reaches its own fetchById calls.
    mockFetchById
      .mockResolvedValueOnce({ id: 'origin-1', documentNo: 'FC-100' }) // origin invoice
      .mockResolvedValueOnce({ id: 'sl-1', parentId: 'ret-ship-1' }) // shipment line lookup
      .mockResolvedValueOnce({ id: 'ret-ship-1', documentNo: 'RET-001' }); // shipment

    render(<RelatedDocuments {...DEFAULT_PROPS} data={RETURN_DATA} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.getByTestId('chip-return-to-vendor')).toBeInTheDocument();
    expect(screen.getByTestId('chip-invoice')).toBeInTheDocument();
  });
});
