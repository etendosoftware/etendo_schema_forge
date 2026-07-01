/**
 * Integration render test for InternalConsumptionProductSearchDrawer.
 * Renders the real component with mocked dependencies.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url, params) => {
    const search = new URLSearchParams(params).toString();
    return search ? `${url}?${search}` : url;
  },
}));

import InternalConsumptionProductSearchDrawer from '../InternalConsumptionProductSearchDrawer.jsx';

describe('InternalConsumptionProductSearchDrawer', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSelect: vi.fn(),
    selectorUrl: 'http://localhost/sws/neo/internal-consumption/lines/selectors/M_Product_ID',
    token: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], hasMore: false }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <InternalConsumptionProductSearchDrawer {...defaultProps} open={false} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the dialog when open', () => {
    render(<InternalConsumptionProductSearchDrawer {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders search input with placeholder', () => {
    render(<InternalConsumptionProductSearchDrawer {...defaultProps} />);
    const input = screen.getByPlaceholderText(/searchLabelPrefix/);
    expect(input).toBeInTheDocument();
  });

  it('renders custom title when provided', () => {
    render(
      <InternalConsumptionProductSearchDrawer {...defaultProps} title="Custom Title" />,
    );
    expect(screen.getByPlaceholderText(/Custom Title/)).toBeInTheDocument();
  });

  it('calls onClose when overlay is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<InternalConsumptionProductSearchDrawer {...defaultProps} />);
    // Click the backdrop (first overlay element)
    const backdrops = document.querySelectorAll('.fixed.inset-0');
    if (backdrops[0]) {
      await user.click(backdrops[0]);
    }
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<InternalConsumptionProductSearchDrawer {...defaultProps} />);
    // The X close button is inside the search bar area
    const dialog = screen.getByRole('dialog');
    const closeButtons = dialog.querySelectorAll('button');
    // Last button in the search bar row is the close button
    const closeBtn = closeButtons[0];
    if (closeBtn) {
      await user.click(closeBtn);
    }
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('fetches products on mount when open', async () => {
    render(<InternalConsumptionProductSearchDrawer {...defaultProps} />);
    // The fetch happens via setTimeout(fn, 0) for initial load
    await vi.advanceTimersByTimeAsync(50);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
  });

  it('renders products grouped by product', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'p1', label: 'Widget', searchKey: 'WDG', _aux: { _LOC: 'loc1', _QTY: '10' }, warehouse: 'Main' },
          { id: 'p1', label: 'Widget', searchKey: 'WDG', _aux: { _LOC: 'loc2', _QTY: '5' }, warehouse: 'Secondary' },
          { id: 'p2', label: 'Gadget', searchKey: 'GDG', _aux: { _LOC: 'loc3', _QTY: '20' }, warehouse: 'Main' },
        ],
        hasMore: false,
      }),
    });

    render(<InternalConsumptionProductSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(100);

    await waitFor(() => {
      expect(screen.getByText('Widget')).toBeInTheDocument();
      expect(screen.getByText('Gadget')).toBeInTheDocument();
    });
  });

  it('shows no results message when search returns empty', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], hasMore: false }),
    });

    render(<InternalConsumptionProductSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(50);

    // Type a query to trigger no-results
    const input = screen.getByPlaceholderText(/searchLabelPrefix/);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(input, 'nonexistent');
    await vi.advanceTimersByTimeAsync(500);

    await waitFor(() => {
      expect(screen.getByText(/productSearchNoResults/)).toBeInTheDocument();
    });
  });

  it('does not fetch when selectorUrl is missing', () => {
    render(
      <InternalConsumptionProductSearchDrawer
        {...defaultProps}
        selectorUrl={null}
      />,
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when token is missing', () => {
    render(
      <InternalConsumptionProductSearchDrawer
        {...defaultProps}
        token={null}
      />,
    );
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('renders warehouse filter pills when products have warehouses', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'p1', label: 'Widget', _aux: { _LOC: 'loc1' }, warehouse: 'Main Warehouse' },
        ],
        hasMore: false,
      }),
    });

    render(<InternalConsumptionProductSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(100);

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse')).toBeInTheDocument();
      expect(screen.getByText('All')).toBeInTheDocument();
    });
  });
});
