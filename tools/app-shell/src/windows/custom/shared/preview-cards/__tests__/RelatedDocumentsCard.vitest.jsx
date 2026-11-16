// @covers tools/app-shell/src/windows/custom/shared/preview-cards/RelatedDocumentsCard.jsx
const navigateMock = vi.fn();

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/components/related-documents/constants.jsx', () => ({
  CHIP_ICONS: { invoice: null, shipment: null },
  CHIP_COLORS: { invoice: 'text-blue-500', shipment: 'text-green-500' },
  STATUS_KEYS: { CO: 'statusCompleted', DR: 'statusDraft' },
}));

vi.mock('@/components/related-documents/docChipTypes.jsx', () => ({
  DOCUMENT_CHIP_TYPES: {
    'sales-invoice': {
      iconKey: 'invoice',
      titleKey: 'invoiceDoc',
      titleField: 'documentNo',
      amountField: 'grandTotalAmount',
      currencyField: 'currency$_identifier',
      statusField: 'documentStatus',
      routePrefix: '/sales-invoice',
    },
  },
}));

vi.mock('@/components/ui/status-tag', () => ({
  StatusTag: ({ label }) => <span data-testid="status-tag">{label}</span>,
}));

vi.mock('@/components/related-documents/helpers.js', () => ({
  formatAmount: (amount, currency) => `${currency} ${amount}`,
}));

import { render, screen, waitFor, act } from '@testing-library/react';
import RelatedDocumentsCard from '../RelatedDocumentsCard.jsx';

const SPECS = [
  {
    key: 'sales-invoice',
    type: 'sales-invoice',
    fetch: vi.fn(),
  },
];

describe('RelatedDocumentsCard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when documentId is missing', () => {
    const { container } = render(
      <RelatedDocumentsCard documentId={null} token="t" apiBaseUrl="/api" specs={SPECS} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when specs is empty', () => {
    const { container } = render(
      <RelatedDocumentsCard documentId="id-1" token="t" apiBaseUrl="/api" specs={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders section title via i18n key', async () => {
    SPECS[0].fetch.mockResolvedValue([]);
    render(<RelatedDocumentsCard documentId="id-1" token="t" apiBaseUrl="/api" specs={SPECS} />);
    expect(screen.getByText('previewCardRelatedDocuments')).toBeInTheDocument();
  });

  it('shows empty state message after fetch returns no results', async () => {
    SPECS[0].fetch.mockResolvedValue([]);
    render(<RelatedDocumentsCard documentId="id-1" token="t" apiBaseUrl="/api" specs={SPECS} />);
    await waitFor(() => expect(screen.getByText('noRelatedDocuments')).toBeInTheDocument());
  });

  it('renders DocRow for each fetched document', async () => {
    SPECS[0].fetch.mockResolvedValue([
      { id: 'inv-1', documentNo: '10001', grandTotalAmount: 500, 'currency$_identifier': 'EUR', documentStatus: 'CO' },
    ]);
    render(<RelatedDocumentsCard documentId="id-1" token="t" apiBaseUrl="/api" specs={SPECS} />);
    await waitFor(() => expect(screen.getByTestId('status-tag')).toBeInTheDocument());
    expect(screen.getByText('statusCompleted')).toBeInTheDocument();
    // ETP-5527 — the row is single-line and the status tag is what truncates, so the full
    // status label must stay reachable as the wrapper's hover title.
    expect(screen.getByTestId('status-tag').parentElement).toHaveAttribute('title', 'statusCompleted');
  });

  it('gracefully handles fetch rejection and shows empty state', async () => {
    SPECS[0].fetch.mockRejectedValue(new Error('Network error'));
    render(<RelatedDocumentsCard documentId="id-1" token="t" apiBaseUrl="/api" specs={SPECS} />);
    await waitFor(() => expect(screen.getByText('noRelatedDocuments')).toBeInTheDocument());
  });

  it('includes fetchExtra results alongside spec results', async () => {
    SPECS[0].fetch.mockResolvedValue([]);
    const fetchExtra = vi.fn().mockResolvedValue([
      { type: 'sales-invoice', doc: { id: 'extra-1', documentNo: '20001', grandTotalAmount: 100, 'currency$_identifier': 'USD', documentStatus: 'DR' } },
    ]);
    render(
      <RelatedDocumentsCard documentId="id-1" token="t" apiBaseUrl="/api" specs={SPECS} fetchExtra={fetchExtra} />,
    );
    await waitFor(() => expect(screen.getByText('statusDraft')).toBeInTheDocument());
  });

  it('renders refresh button and triggers refetch on click', async () => {
    SPECS[0].fetch.mockResolvedValue([]);
    render(<RelatedDocumentsCard documentId="id-1" token="t" apiBaseUrl="/api" specs={SPECS} />);
    await waitFor(() => screen.getByText('noRelatedDocuments'));
    const refreshBtn = screen.getByRole('button');
    act(() => { refreshBtn.click(); });
    expect(SPECS[0].fetch).toHaveBeenCalledTimes(2);
  });

  // ETP-4779: generating a derived document (e.g. a Purchase Invoice from a
  // Sales Order/Quotation preview) must refresh this card the same way the
  // manual refresh button does — via a `docsRefreshSignal` prop threaded
  // down from DetailView. Currently `docsRefreshSignal` is not part of the
  // fetch effect's dependency array, so incrementing it does NOT trigger a
  // refetch. This test is expected to FAIL until that fix lands.
  it('refetches when docsRefreshSignal prop increments (regression, ETP-4779)', async () => {
    SPECS[0].fetch.mockResolvedValue([]);
    const { rerender } = render(
      <RelatedDocumentsCard documentId="id-1" token="t" apiBaseUrl="/api" specs={SPECS} docsRefreshSignal={0} />,
    );
    await waitFor(() => screen.getByText('noRelatedDocuments'));

    rerender(
      <RelatedDocumentsCard documentId="id-1" token="t" apiBaseUrl="/api" specs={SPECS} docsRefreshSignal={1} />,
    );

    await waitFor(() => expect(SPECS[0].fetch).toHaveBeenCalledTimes(2));
  });

  // Items mode (the customer portal): the caller already holds the related documents, so the card
  // renders them as given — no fetch, nothing to refresh — and hands a click to `onOpen` instead of
  // navigating to an app route the portal's visitor cannot reach.
  describe('with items given by the caller', () => {
    const ITEMS = [
      { type: 'sales-invoice', doc: { id: 'inv-9', documentNo: '90001', grandTotalAmount: 121, 'currency$_identifier': 'EUR', documentStatus: 'CO' } },
    ];

    it('renders the items without fetching and offers no refresh', () => {
      render(<RelatedDocumentsCard specs={SPECS} items={ITEMS} onOpen={vi.fn()} />);

      expect(screen.getByText('statusCompleted')).toBeInTheDocument();
      expect(SPECS[0].fetch).not.toHaveBeenCalled();
      // The only button is the row itself: no refresh control.
      expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('hands a click to onOpen with the type and the document, and does not navigate', () => {
      const onOpen = vi.fn();
      render(<RelatedDocumentsCard items={ITEMS} onOpen={onOpen} />);

      act(() => { screen.getByRole('button').click(); });

      expect(onOpen).toHaveBeenCalledWith('sales-invoice', ITEMS[0].doc);
      expect(navigateMock).not.toHaveBeenCalled();
    });

    it('shows the empty state for an empty list, with no document id needed', () => {
      render(<RelatedDocumentsCard items={[]} onOpen={vi.fn()} />);

      expect(screen.getByText('noRelatedDocuments')).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });
});
