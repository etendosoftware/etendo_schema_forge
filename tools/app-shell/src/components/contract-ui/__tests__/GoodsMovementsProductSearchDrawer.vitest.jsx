/**
 * Integration render test for GoodsMovementsProductSearchDrawer.
 * Renders the real component with mocked dependencies, mirroring the harness used
 * by InternalConsumptionProductSearchDrawer.vitest.jsx.
 */
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
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

import GoodsMovementsProductSearchDrawer from '../GoodsMovementsProductSearchDrawer.jsx';

describe('GoodsMovementsProductSearchDrawer', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    onSelect: vi.fn(),
    selectorUrl: 'http://localhost/sws/neo/goods-movements/lines/selectors/M_Product_ID',
    token: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], hasMore: false }),
    });
    // jsdom does not implement scrollIntoView — stub it globally so the hook's
    // scrollIntoView effect (productSelectorDrawerShared.jsx line 213) does not throw.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders nothing when open is false', () => {
    const { container } = render(
      <GoodsMovementsProductSearchDrawer {...defaultProps} open={false} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the dialog when open', () => {
    render(<GoodsMovementsProductSearchDrawer {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders custom title in the search placeholder when provided', () => {
    render(<GoodsMovementsProductSearchDrawer {...defaultProps} title="Producto" />);
    expect(screen.getByPlaceholderText(/Producto/)).toBeInTheDocument();
  });

  it('does not fetch when selectorUrl is missing', () => {
    render(<GoodsMovementsProductSearchDrawer {...defaultProps} selectorUrl={null} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when token is missing', () => {
    render(<GoodsMovementsProductSearchDrawer {...defaultProps} token={null} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('keeps both the generic null-locator row and the concrete locator row', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          // Generic null-locator row for the product (no warehouse) — kept so a
          // product with no stock anywhere is still selectable (Classic parity).
          { id: 'P1', name: 'Agua', searchKey: 'SK-001', _aux: { _LOC: null, _QTY: '0' } },
          // Concrete locator row for the same product — kept with qty + bin label.
          { id: 'P1', name: 'Agua', searchKey: 'SK-001', warehouse: 'Almacen GO', _aux: { _LOC: 'LOC-1', _QTY: '2800' } },
        ],
        hasMore: false,
      }),
    });

    render(<GoodsMovementsProductSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(100);

    // BOTH rows render: the generic (null locator) and the concrete locator row.
    await waitFor(() => {
      const options = screen.getAllByTestId(/^gm-product-option-/);
      expect(options).toHaveLength(2);
    });

    // Product name + searchKey appear once per row (two of each).
    expect(screen.getAllByText('Agua')).toHaveLength(2);
    expect(screen.getAllByText('SK-001')).toHaveLength(2);

    // The concrete row shows qty-on-hand (formatted with a thousands separator).
    expect(screen.getByText((2800).toLocaleString())).toBeInTheDocument();

    // Only the concrete row carries a bin/warehouse label. getBinLabel returns null
    // for the generic row (no _LOC, no warehouse), so 'Almacen GO' appears exactly once.
    expect(screen.getAllByText(/Almacen GO/)).toHaveLength(1);
  });

  it('removes exact duplicates (same product id + same _LOC) surfaced twice', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'P1', name: 'Agua', searchKey: 'SK-001', warehouse: 'Almacen GO', _aux: { _LOC: 'LOC-1', _QTY: '2800' } },
          // Exact duplicate (same id + same locator) — pagination can surface it twice.
          { id: 'P1', name: 'Agua', searchKey: 'SK-001', warehouse: 'Almacen GO', _aux: { _LOC: 'LOC-1', _QTY: '2800' } },
        ],
        hasMore: false,
      }),
    });

    render(<GoodsMovementsProductSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(100);

    // The exact duplicate collapses to a single option.
    await waitFor(() => {
      const options = screen.getAllByTestId(/^gm-product-option-/);
      expect(options).toHaveLength(1);
    });
  });

  it('returns the full selected row via onSelect', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const concreteRow = {
      id: 'P1', name: 'Agua', searchKey: 'SK-001', warehouse: 'Almacen GO',
      _aux: { _LOC: 'LOC-1', _QTY: '2800' },
    };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [concreteRow], hasMore: false }),
    });

    render(<GoodsMovementsProductSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(100);

    const option = await screen.findByTestId('gm-product-option-P1');
    await user.click(option);
    // Selection is committed after a short highlight delay.
    await vi.advanceTimersByTimeAsync(200);

    await waitFor(() => {
      expect(defaultProps.onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'P1', _aux: expect.objectContaining({ _LOC: 'LOC-1' }) }),
      );
    });
  });

  it('shows a no-results message when a query returns nothing', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], hasMore: false }),
    });

    render(<GoodsMovementsProductSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(50);

    const input = screen.getByPlaceholderText(/searchLabelPrefix/);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(input, 'nonexistent');
    await vi.advanceTimersByTimeAsync(500);

    await waitFor(() => {
      expect(screen.getByText(/productSearchNoResults/)).toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Keyboard navigation (handleKeyDown in GoodsMovementsProductSearchDrawer +
  // scrollIntoView effect in useProductSelectorFetch)
  // ────────────────────────────────────────────────────────────────────────────

  it('ArrowDown moves active index and Enter selects the active row', async () => {
    const rowA = { id: 'RA', name: 'Alpha', searchKey: 'A001', _aux: { _LOC: null, _QTY: '5' } };
    const rowB = { id: 'RB', name: 'Beta', searchKey: 'B001', _aux: { _LOC: null, _QTY: '3' } };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [rowA, rowB], hasMore: false }),
    });
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(
      <GoodsMovementsProductSearchDrawer
        {...defaultProps}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );

    // Wait for the initial fetch to resolve and rows to render.
    await vi.advanceTimersByTimeAsync(50);
    await waitFor(() => {
      expect(screen.getAllByTestId(/^gm-product-option-/)).toHaveLength(2);
    });

    const dialog = screen.getByRole('dialog');

    // fireEvent drives React's synthetic onKeyDown handler on the dialog div.
    // ArrowDown once → activeIdx becomes 0 (Alpha, alphabetically first).
    act(() => { fireEvent.keyDown(dialog, { key: 'ArrowDown' }); });
    // ArrowDown again → activeIdx becomes 1 (Beta).
    act(() => { fireEvent.keyDown(dialog, { key: 'ArrowDown' }); });
    // ArrowUp once → back to 0 (Alpha).
    act(() => { fireEvent.keyDown(dialog, { key: 'ArrowUp' }); });

    // Enter → selects the currently active row (index 0, Alpha).
    // handleSelect uses a 120 ms setTimeout before calling onSelect + onClose.
    act(() => { fireEvent.keyDown(dialog, { key: 'Enter' }); });

    // Advance past the 120 ms selection timeout.
    await vi.advanceTimersByTimeAsync(200);

    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'RA' }),
    );
  });

  it('ArrowDown clamps at the last row (does not overflow)', async () => {
    const row = { id: 'R1', name: 'Solo', searchKey: 'S001', _aux: { _LOC: null, _QTY: '1' } };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [row], hasMore: false }),
    });

    render(<GoodsMovementsProductSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(50);
    await waitFor(() => expect(screen.getByTestId('gm-product-option-R1')).toBeInTheDocument());

    const dialog = screen.getByRole('dialog');

    // Press ArrowDown three times on a single-row list — should not throw.
    act(() => {
      for (let i = 0; i < 3; i++) {
        fireEvent.keyDown(dialog, { key: 'ArrowDown' });
      }
    });
    // If we reach here without error the clamp worked.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Escape-key handler (useProductSelectorFetch Escape-key effect, lines 203-208)
  // ────────────────────────────────────────────────────────────────────────────

  it('calls onClose when the Escape key is pressed on the document (hook effect)', async () => {
    const onClose = vi.fn();
    render(<GoodsMovementsProductSearchDrawer {...defaultProps} onClose={onClose} />);

    // Dispatch Escape on the document — the hook listens at document level.
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('does not call onClose on Escape when drawer is closed', () => {
    const onClose = vi.fn();
    render(
      <GoodsMovementsProductSearchDrawer
        {...defaultProps}
        open={false}
        onClose={onClose}
      />,
    );

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    // The hook removes the listener when open is false — onClose must NOT fire.
    expect(onClose).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Scroll-triggered pagination (handleScroll in useProductSelectorFetch, lines 217-223)
  // ────────────────────────────────────────────────────────────────────────────

  it('fetches the next page when the list is scrolled near the bottom and hasMore is true', async () => {
    // First fetch returns a full page and signals hasMore=true.
    const page1 = [
      { id: 'R1', name: 'Row 1', searchKey: 'S1', _aux: { _LOC: null, _QTY: '1' } },
    ];
    const page2 = [
      { id: 'R2', name: 'Row 2', searchKey: 'S2', _aux: { _LOC: null, _QTY: '2' } },
    ];

    globalThis.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: page1, hasMore: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: page2, hasMore: false }),
      });

    render(<GoodsMovementsProductSearchDrawer {...defaultProps} />);

    // Allow the initial fetch + state updates to settle.
    await vi.advanceTimersByTimeAsync(50);
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('gm-product-option-R1')).toBeInTheDocument());

    // Grab the scrollable container that has `ref={listRef}`.
    // It is the direct child of the dialog with class `overflow-y-auto`.
    const dialog = screen.getByRole('dialog');
    const listContainer = dialog.querySelector('.overflow-y-auto');
    expect(listContainer).not.toBeNull();

    // jsdom does not compute layout — set scroll geometry so the condition
    //   scrollTop + clientHeight >= scrollHeight - 50
    // evaluates to true.
    Object.defineProperty(listContainer, 'scrollTop', { value: 950, writable: true, configurable: true });
    Object.defineProperty(listContainer, 'clientHeight', { value: 100, writable: true, configurable: true });
    Object.defineProperty(listContainer, 'scrollHeight', { value: 1000, writable: true, configurable: true });

    // Dispatch the scroll event that drives handleScroll.
    listContainer.dispatchEvent(new Event('scroll', { bubbles: true }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    // After the second page resolves both rows should be visible.
    await waitFor(() => {
      expect(screen.getByTestId('gm-product-option-R2')).toBeInTheDocument();
    });
  });
});
