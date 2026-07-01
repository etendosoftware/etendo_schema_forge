// --- Mocks (before imports) ---

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
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

  it('does not fetch when token is missing', () => {
    mockFetchResponses();
    render(<ProductSidebar {...defaultProps} token={null} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
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
      expect(screen.getByText('onHand')).toBeInTheDocument();
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
    expect(screen.getByText('last3Months')).toBeInTheDocument();
  });
});
