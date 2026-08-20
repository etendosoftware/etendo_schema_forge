// Mocks must come before imports (Vitest hoisting)
//
// NOTE on location (ETP-4737 coverage investigation): the component under test
// lives at artifacts/sales-invoice/custom/RelatedDocuments.jsx, NOT inside this
// package's own src/ tree. Vitest's `include` glob in vitest.config.js only
// discovers `src/**/*.vitest.{js,jsx}`, so this test file must live under src/
// (mirroring the sibling purchase-invoice RelatedDocuments.vitest.jsx
// convention) and reach the artifacts/ source via a relative import — the `@`
// alias resolves fine for the component's OWN internal imports (@/i18n,
// @/components/related-documents) regardless of where the importing test file
// sits, since Vite aliases are resolved against the configured root, not the
// importer's directory. Confirmed empirically: this file renders the real
// artifacts/ component and its effects execute for real (not a regex/string
// assertion against source text like artifacts/sales-invoice/custom/__tests__/
// RelatedDocuments.test.js).

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US' }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

const mockFetchByCriteria = vi.hoisted(() => vi.fn().mockResolvedValue([]));
const mockFetchById = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock('@/components/related-documents', () => ({
  // Chips built via the explicit-props path (order/quotation, originalInvoices
  // loop) never pass `type` — only icon/title/amount/etc — so they're keyed by
  // icon instead. Chips built via docChipProps (shipments, sourceInvoice,
  // originInvoice) pass `type`, and we thread the doc id through as `docId` so
  // tests can tell two same-`type` chips (sourceInvoice vs originInvoice, both
  // `type: 'sales-invoice'`) apart.
  DocChip: ({ type, docId, icon, title }) => (
    <div data-testid={type ? `chip-${type}` : `chip-explicit-${icon}`} data-doc-id={docId}>
      {title || type}
    </div>
  ),
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
  STATUS_KEYS: {},
  CHIP_ICONS: { quotation: 'quotation-icon', order: 'order-icon', invoice: 'invoice-icon' },
  CHIP_COLORS: { quotation: 'blue', order: 'blue', invoice: 'green' },
  docChipProps: ({ type, doc }) => ({ type, docId: doc?.id }),
  fetchByCriteria: mockFetchByCriteria,
  fetchById: mockFetchById,
}));

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RelatedDocuments from '../../../../../../../artifacts/sales-invoice/custom/RelatedDocuments.jsx';

const DEFAULT_PROPS = {
  recordId: 'inv-1',
  data: {},
  token: 'tok',
  apiBaseUrl: '/api',
};

describe('RelatedDocuments (sales-invoice, from artifacts/)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchByCriteria.mockResolvedValue([]);
    mockFetchById.mockResolvedValue(null);
  });

  it('renders RelatedDocumentsShell and resolves loading to false once effects settle', async () => {
    // A salesOrder forces at least one pending promise so loading is
    // observably true right after the initial render (with no promises at
    // all, the effect resolves loading synchronously within the same commit).
    mockFetchByCriteria.mockResolvedValueOnce([]); // sales-quotation lookup
    mockFetchById.mockResolvedValueOnce(null); // sales-order lookup
    render(<RelatedDocuments {...DEFAULT_PROPS} data={{ salesOrder: 'so-1' }} />);
    expect(screen.getByTestId('shell').dataset.loading).toBe('true');
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
  });

  it('does not fetch anything when recordId is absent', () => {
    render(<RelatedDocuments {...DEFAULT_PROPS} recordId={undefined} />);
    expect(mockFetchByCriteria).not.toHaveBeenCalled();
    expect(mockFetchById).not.toHaveBeenCalled();
  });

  it('renders an order chip when the quotation lookup is empty and fetchById resolves an order', async () => {
    mockFetchByCriteria.mockResolvedValueOnce([]); // no quotation
    mockFetchById.mockResolvedValueOnce({ id: 'so-1', documentNo: 'ORD-001', documentStatus: 'CO' });
    render(<RelatedDocuments {...DEFAULT_PROPS} data={{ salesOrder: 'so-1' }} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.getByTestId('chip-explicit-order-icon')).toBeInTheDocument();
  });

  it('renders a quotation chip (not an order chip) when fetchByCriteria resolves a quotation', async () => {
    mockFetchByCriteria.mockResolvedValueOnce([{ id: 'q-1', documentNo: 'QUO-001', documentStatus: 'CO' }]);
    render(<RelatedDocuments {...DEFAULT_PROPS} data={{ salesOrder: 'q-1' }} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.getByTestId('chip-explicit-quotation-icon')).toBeInTheDocument();
    expect(mockFetchById).not.toHaveBeenCalledWith('sales-order', 'header', 'q-1', '/api');
  });

  it('reads data.linkedShipments directly (no fetch) and classifies via the server-provided isReturn flag', async () => {
    const linkedShipments = [
      { id: 'ship-1', isReturn: false },
      { id: 'ship-2', isReturn: true },
    ];
    render(<RelatedDocuments {...DEFAULT_PROPS} data={{ linkedShipments }} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.getByTestId('chip-shipment')).toBeInTheDocument();
    expect(screen.getByTestId('chip-return-material-receipt')).toBeInTheDocument();
    // Purely synchronous/local classification — no network round-trip.
    expect(mockFetchByCriteria).not.toHaveBeenCalled();
    expect(mockFetchById).not.toHaveBeenCalled();
  });

  it('renders no shipment chips when data.linkedShipments is absent', async () => {
    render(<RelatedDocuments {...DEFAULT_PROPS} data={{}} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.queryByTestId('chip-shipment')).not.toBeInTheDocument();
    expect(screen.queryByTestId('chip-return-material-receipt')).not.toBeInTheDocument();
  });

  describe('originalInvoices (rectificativa via arInvoiceSubtype)', () => {
    it('fetches sibling invoices from the same order when arInvoiceSubtype is RECTIFICATIVA', async () => {
      mockFetchByCriteria
        .mockResolvedValueOnce([]) // sales-quotation lookup
        .mockResolvedValueOnce([
          { id: 'inv-2', documentNo: 'FR-002', documentStatus: 'CO' },
          { id: 'inv-1', documentNo: 'FR-001', documentStatus: 'CO' }, // self, must be filtered out
        ]);
      mockFetchById.mockResolvedValueOnce({ id: 'so-1', documentNo: 'ORD-001' });

      render(
        <RelatedDocuments
          {...DEFAULT_PROPS}
          data={{ salesOrder: 'so-1', arInvoiceSubtype: 'RECTIFICATIVA' }}
        />
      );
      await waitFor(() =>
        expect(screen.getByTestId('shell').dataset.loading).toBe('false')
      );
      expect(mockFetchByCriteria).toHaveBeenCalledWith(
        'sales-invoice', 'header', 'salesOrder', 'so-1', '/api'
      );
      // inv-1 (== recordId) must be filtered out, only inv-2 remains
      expect(screen.getAllByTestId('chip-explicit-invoice-icon')).toHaveLength(1);
    });

    it('does not fetch originalInvoices when the invoice is a plain FAC', async () => {
      mockFetchByCriteria.mockResolvedValueOnce([]); // quotation lookup only
      mockFetchById.mockResolvedValueOnce({ id: 'so-1', documentNo: 'ORD-001' });

      render(<RelatedDocuments {...DEFAULT_PROPS} data={{ salesOrder: 'so-1' }} />);
      await waitFor(() =>
        expect(screen.getByTestId('shell').dataset.loading).toBe('false')
      );
      expect(mockFetchByCriteria).toHaveBeenCalledTimes(1); // quotation lookup only, no sibling-invoices call
      expect(screen.queryByTestId('chip-explicit-invoice-icon')).not.toBeInTheDocument();
    });
  });

  it('renders a sourceInvoice chip from data.sourceInvoice (server-injected, no fetch)', async () => {
    render(
      <RelatedDocuments
        {...DEFAULT_PROPS}
        data={{ sourceInvoice: { id: 'src-1', documentNo: 'FAC-100' } }}
      />
    );
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    const chip = screen.getByTestId('chip-sales-invoice');
    expect(chip.dataset.docId).toBe('src-1');
  });

  it('onRefresh button triggers a re-fetch cycle', async () => {
    mockFetchByCriteria.mockResolvedValue([]);
    mockFetchById.mockResolvedValue(null);

    render(<RelatedDocuments {...DEFAULT_PROPS} data={{ salesOrder: 'so-1' }} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );

    const callCountBefore = mockFetchById.mock.calls.length;
    fireEvent.click(screen.getByTestId('refresh-btn'));

    await waitFor(() =>
      expect(mockFetchById.mock.calls.length).toBeGreaterThan(callCountBefore)
    );
  });
});

// ETP-4737 — data.originInvoice: set when this rectificativa was created via
// the "Import from Source Invoice" popup (manual correction). Independent from
// data.sourceInvoice above (auto-generated-from-return case) — this is the
// logic that had zero executing coverage before this file existed.
describe('RelatedDocuments (sales-invoice) — originInvoice chip (ETP-4737)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchByCriteria.mockResolvedValue([]);
    mockFetchById.mockResolvedValue(null);
  });

  it('fetches and renders an invoice chip when data.originInvoice is present', async () => {
    mockFetchById.mockResolvedValueOnce({ id: 'origin-1', documentNo: 'FC-100' });

    render(<RelatedDocuments {...DEFAULT_PROPS} data={{ originInvoice: 'origin-1' }} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(mockFetchById).toHaveBeenCalledWith('sales-invoice', 'header', 'origin-1', '/api');
    const chip = screen.getByTestId('chip-sales-invoice');
    expect(chip.dataset.docId).toBe('origin-1');
  });

  it('does not render an invoice chip when data.originInvoice is absent', async () => {
    render(<RelatedDocuments {...DEFAULT_PROPS} data={{}} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.queryByTestId('chip-sales-invoice')).not.toBeInTheDocument();
  });

  it('is additive: renders alongside a pre-existing sourceInvoice chip, without hiding it', async () => {
    mockFetchById.mockResolvedValueOnce({ id: 'origin-1', documentNo: 'FC-100' });

    render(
      <RelatedDocuments
        {...DEFAULT_PROPS}
        data={{
          sourceInvoice: { id: 'src-1', documentNo: 'FAC-050' },
          originInvoice: 'origin-1',
        }}
      />
    );
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    const chips = screen.getAllByTestId('chip-sales-invoice');
    expect(chips).toHaveLength(2);
    const docIds = chips.map((c) => c.dataset.docId).sort();
    expect(docIds).toEqual(['origin-1', 'src-1']);
  });

  it('clears the previously-resolved originInvoice when a subsequent record has none (re-render/refreshKey path)', async () => {
    mockFetchById.mockResolvedValueOnce({ id: 'origin-1', documentNo: 'FC-100' });
    const { rerender } = render(
      <RelatedDocuments {...DEFAULT_PROPS} data={{ originInvoice: 'origin-1' }} />
    );
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.getByTestId('chip-sales-invoice')).toBeInTheDocument();

    rerender(<RelatedDocuments {...DEFAULT_PROPS} recordId="inv-2" data={{}} />);
    await waitFor(() =>
      expect(screen.getByTestId('shell').dataset.loading).toBe('false')
    );
    expect(screen.queryByTestId('chip-sales-invoice')).not.toBeInTheDocument();
  });
});
