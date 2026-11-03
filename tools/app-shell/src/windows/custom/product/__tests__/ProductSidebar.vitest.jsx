// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => (params ? `${key}:${params.count}` : key),
  useLocaleSwitch: () => ({ locale: 'es_ES' }),
  useLabel: () => (key) => key,
}));

vi.mock('@/lib/currencyFormatConfig', async (orig) => ({
  ...(await orig()),
  getCurrencyFormatConfig: () => ({ thousandsSeparator: '.', decimalSeparator: ',' }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/lib/dashboardNumberFormat', () => ({
  niceScale: (max) => ({ niceMax: Math.ceil(max / 10) * 10 || 10, ticks: [0, Math.ceil(max / 2), Math.ceil(max)] }),
  formatDashboardAxisTick: (v) => String(v),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }) => open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <div>{children}</div>,
}));

vi.mock('lucide-react', () => ({
  ExternalLink: (props) => <span data-testid="icon-external" {...props} />,
  Maximize2: (props) => <span data-testid="icon-maximize" {...props} />,
  Box: (props) => <span data-testid="icon-box" {...props} />,
  Calendar: (props) => <span data-testid="icon-calendar" {...props} />,
  ChevronDown: (props) => <span data-testid="icon-chevron" {...props} />,
}));

// --- Import under test ---

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProductSidebar from '../ProductSidebar.jsx';

// --- Helpers ---

const defaultProps = {
  recordId: 'prod-1',
  data: {},
  token: 'test-token',
  apiBaseUrl: '/sws/neo/product',
};

function mockFetchResponses({ stockRows = [], transactions = [] } = {}) {
  globalThis.fetch = vi.fn((url) => {
    if (url.includes('/stock')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: { data: stockRows } }),
      });
    }
    if (url.includes('/transactions')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: { data: transactions } }),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
}

// --- Tests ---

describe('ProductSidebar', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders without crashing with empty fetch responses', async () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} />);

    // Tab buttons should be visible
    expect(screen.getByText('summary')).toBeInTheDocument();
    expect(screen.getByText('warehouses')).toBeInTheDocument();
  });

  it('does not fetch when recordId is missing', () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} recordId={null} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when token is missing — inverted: the cookie carries the session', () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} token={null} />);
    // ETP-4576 — inverted on purpose: under the cookie scheme the client holds no token,
    // so the request MUST still go out. The old expectation encoded the guard that made
    // this call silently disappear for every authenticated user.
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('fetches stock and transactions on mount', async () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} />);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    const urls = globalThis.fetch.mock.calls.map(c => c[0]);
    expect(urls.some(u => u.includes('/stock'))).toBe(true);
    expect(urls.some(u => u.includes('/transactions'))).toBe(true);
  });

  it('shows the summary tab by default', () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} />);

    // The summary button should have font-weight 500 (active)
    const summaryBtn = screen.getByText('summary');
    expect(summaryBtn).toBeInTheDocument();
  });

  it('switches to warehouses tab on click', async () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} />);

    const warehousesBtn = screen.getByText('warehouses');
    fireEvent.click(warehousesBtn);

    // After click, warehouses tab content is rendered
    expect(warehousesBtn).toBeInTheDocument();
  });

  it('shows empty state when transactions load as empty', async () => {
    mockFetchResponses({ stockRows: [], transactions: [] });
    render(<ProductSidebar {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('noStockMovements')).toBeInTheDocument();
    });
  });

  it('shows empty state actions: adjustStock and replenishStock', async () => {
    mockFetchResponses({ stockRows: [], transactions: [] });
    render(<ProductSidebar {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('adjustStock')).toBeInTheDocument();
      expect(screen.getByText('replenishStock')).toBeInTheDocument();
    });
  });

  it('shows availability widget when stock and transactions exist', async () => {
    const stockRows = [
      { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-A', quantityOnHand: 50, reservedQty: 5 },
    ];
    const transactions = [
      { movementDate: '2025-01-15', movementQuantity: 10, storageBin: 'LOC1' },
    ];
    mockFetchResponses({ stockRows, transactions });
    render(<ProductSidebar {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('stockAvailableLabel')).toBeInTheDocument();
    });
  });

  it('shows stock movement chart title when transactions exist', async () => {
    const stockRows = [
      { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-A', quantityOnHand: 100, reservedQty: 0 },
    ];
    const transactions = [
      { movementDate: '2025-03-01', movementQuantity: 20, storageBin: 'LOC1' },
    ];
    mockFetchResponses({ stockRows, transactions });
    render(<ProductSidebar {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText('stockMovement')).toBeInTheDocument();
    });
  });

  it('shows warehouse data in warehouses tab', async () => {
    const stockRows = [
      { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Alpha', quantityOnHand: 30, reservedQty: 5 },
      { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-Beta', quantityOnHand: 20, reservedQty: 2 },
    ];
    mockFetchResponses({ stockRows, transactions: [] });
    render(<ProductSidebar {...defaultProps} />);

    // Wait for data load
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    // Switch to warehouses tab
    fireEvent.click(screen.getByText('warehouses'));

    await waitFor(() => {
      expect(screen.getByText('WH-Alpha')).toBeInTheDocument();
      expect(screen.getByText('WH-Beta')).toBeInTheDocument();
    });
  });

  // ETP-5908 RF-06: "N ubicaciones" is a link to the Warehouses tab.
  it('renders the locations count as a button that opens the Warehouses tab', async () => {
    const stockRows = [
      { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Alpha', quantityOnHand: 30, reservedQty: 5 },
      { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-Beta', quantityOnHand: 20, reservedQty: 2 },
    ];
    const transactions = [{ movementDate: '2025-03-01', movementQuantity: 20, storageBin: 'LOC1' }];
    mockFetchResponses({ stockRows, transactions });
    render(<ProductSidebar {...defaultProps} />);

    const link = await screen.findByRole('button', { name: 'stockLocationsCount:2' });
    expect(link.tagName).toBe('BUTTON');
    expect(link.getAttribute('type')).toBe('button');
    fireEvent.click(link);

    expect((await screen.findAllByText('WH-Alpha')).length).toBeGreaterThan(0);
    const cards = screen.getAllByTestId('WarehouseCardAvailability');
    expect(cards[0].textContent).toContain('30 u');
  });

  it('formats quantities in the expand modal with the canonical separators', async () => {
    mockFetchResponses({
      stockRows: [
        { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Alpha', quantityOnHand: 1080 },
        { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-Beta', quantityOnHand: 300 },
      ],
      transactions: [{ movementDate: '2025-03-01', movementQuantity: 20, storageBin: 'LOC1' }],
    });
    render(<ProductSidebar {...defaultProps} />);
    fireEvent.click(await screen.findByRole('button', { name: 'expand' }));
    const dialog = await screen.findByTestId('dialog');
    expect(dialog.textContent).toContain('1.080');
    expect(dialog.textContent).toContain('total: 1.380');
    expect(dialog.textContent).not.toContain('1,080');
  });

  it('keeps up to 2 decimals on fractional stock (card, summary, modal) and no decimals on integers', async () => {
    mockFetchResponses({
      stockRows: [
        { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Alpha', quantityOnHand: 12.5 },
        { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-Beta', quantityOnHand: 1080 },
      ],
      transactions: [{ movementDate: '2025-03-01', movementQuantity: 20, storageBin: 'LOC1' }],
    });
    render(<ProductSidebar {...defaultProps} />);
    expect(await screen.findByText('1.092,5')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'stockLocationsCount:2' }));
    await screen.findAllByText('WH-Alpha');
    const cards = screen.getAllByTestId('WarehouseCardAvailability');
    const cardText = cards.map(c => c.textContent).join('|');
    expect(cardText).toContain('12,5 u');
    expect(cardText).not.toContain('13 u');
    expect(cardText).toContain('1.080 u');
    expect(cardText).not.toContain('1.080,');
    fireEvent.click((await screen.findAllByRole('button', { name: 'expand' }))[0]);
    const dialog = await screen.findByTestId('dialog');
    expect(dialog.textContent).toContain('12,5');
    expect(dialog.textContent).toContain('total: 1.092,5');
  });

  it('places the locations link inline right after the "Available ·" label', async () => {
    mockFetchResponses({
      stockRows: [
        { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Alpha', quantityOnHand: 30 },
        { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-Beta', quantityOnHand: 20 },
      ],
      transactions: [{ movementDate: '2025-03-01', movementQuantity: 20, storageBin: 'LOC1' }],
    });
    render(<ProductSidebar {...defaultProps} />);
    const link = await screen.findByTestId('AvailabilityLocationsLink');
    expect(link.previousElementSibling.textContent).toBe('stockAvailableLabel ·');
    expect(link.parentElement.className).not.toContain('justify-between');
  });

  it('keeps the single-warehouse subtitle as plain text (not a link)', async () => {
    mockFetchResponses({
      stockRows: [{ storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Only', quantityOnHand: 9 }],
      transactions: [{ movementDate: '2025-03-01', movementQuantity: 9, storageBin: 'LOC1' }],
    });
    render(<ProductSidebar {...defaultProps} />);
    expect((await screen.findAllByText('WH-Only')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /stockLocationsCount/ })).toBeNull();
  });

  // ETP-5908 RF-07: icon-only expand button.
  it('renders the chart expand control as an icon-only button with tooltip and aria-label', async () => {
    mockFetchResponses({
      stockRows: [{ storageBin: 'LOC1', 'warehouse$_identifier': 'WH-A', quantityOnHand: 10 }],
      transactions: [{ movementDate: '2025-03-01', movementQuantity: 10, storageBin: 'LOC1' }],
    });
    render(<ProductSidebar {...defaultProps} />);

    const btn = await screen.findByRole('button', { name: 'expand' });
    expect(btn).toHaveAttribute('title', 'expand');
    expect(btn).toHaveAttribute('aria-label', 'expand');
    expect(btn.textContent).toBe('');
    expect(screen.queryByTestId('icon-external')).toBeNull();
    expect(btn.querySelector('[data-testid="Maximize2__59b33d"]')).not.toBeNull();

    fireEvent.click(btn);
    expect(await screen.findByTestId('dialog')).toBeInTheDocument();
  });

  // ETP-5908 RF-08 / RF-09: warehouse cards.
  it('shows no reserved data and the "Available · N u" text with a series-coloured dot per warehouse', async () => {
    mockFetchResponses({
      stockRows: [
        { storageBin: 'LOC1', 'warehouse$_identifier': 'WH-Alpha', quantityOnHand: 30, reservedQty: 5 },
        { storageBin: 'LOC2', 'warehouse$_identifier': 'WH-Beta', quantityOnHand: 20, reservedQty: 2 },
      ],
      transactions: [],
    });
    render(<ProductSidebar {...defaultProps} />);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByText('warehouses'));

    expect((await screen.findAllByText('WH-Alpha')).length).toBeGreaterThan(0);
    expect(screen.queryByText('reserved')).toBeNull();
    // available shown is the on-hand quantity (no reservation subtracted)
    const rows = screen.getAllByTestId('WarehouseCardAvailability');
    expect(rows.map(r => r.children[0].textContent)).toEqual(['stockAvailableLabel', 'stockAvailableLabel']);
    expect(rows.map(r => r.children[1].textContent)).toEqual(['30 u', '20 u']);
    expect(rows[1].children[1].className).toContain('font-semibold');
    const dots = screen.getAllByTestId('WarehouseCardDot');
    expect(dots.map(d => d.style.backgroundColor)).toEqual(['rgb(236, 72, 153)', 'rgb(245, 158, 11)']);
  });

  it('handles fetch error gracefully (stock)', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (url.includes('/stock')) return Promise.reject(new Error('network'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
    });

    // Should not throw
    render(<ProductSidebar {...defaultProps} />);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
  });

  it('renders period selector', async () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} />);

    // The period selector button should show i18n key for the period
    expect(screen.getByText('last12Months')).toBeInTheDocument();
  });
});

// ETP-4606 / ETP-5091 — Service, Expense ("Gasto") and Resource ("Recurso")
// products have no physical existence, so the stock sidebar (period selector,
// availability widget, stock movement chart) does not apply to them and must
// not render at all. Mirrors the rule that shows the stock flags
// (`Almacenable`/`Retornable`) in the main form only for Item (`decisions.json`).
describe.each([
  ['Service', 'S'],
  ['Expense', 'E'],
  ['Resource', 'R'],
])('ProductSidebar — hidden for %s-type products (ETP-4606 / ETP-5091)', (_label, productType) => {
  it(`renders nothing when productType is ${productType}`, () => {
    mockFetchResponses();
    const { container } = render(
      <ProductSidebar {...defaultProps} data={{ productType }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ProductSidebar — stays visible for stockable types', () => {
  it('renders normally for a stockable type (Article)', () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} data={{ productType: 'I' }} />);
    expect(screen.getByText('last12Months')).toBeInTheDocument();
  });
});

// ETP-5908 RF-01 / RF-05 — default period and exact range label.
describe('ProductSidebar period range', () => {
  it('shows the exact range under the period selector', async () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} />);
    const range = screen.getByTestId('SidebarPeriodRange');
    expect(range.textContent).toMatch(/^\d{2}\/\d{2}\/\d{4} – \d{2}\/\d{2}\/\d{4}$/);
  });
});
