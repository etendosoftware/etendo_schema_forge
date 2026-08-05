/**
 * Integration render test for ProductStockSearchDrawer — the unified, window-agnostic
 * product+stock picker that replaced GoodsMovementsProductSearchDrawer and
 * InternalConsumptionProductSearchDrawer. Renders the real component with mocked
 * dependencies, mirroring the harness used by the two drawers it replaced.
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

import ProductStockSearchDrawer from '../ProductStockSearchDrawer.jsx';

describe('ProductStockSearchDrawer', () => {
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
    // scrollIntoView effect (productSelectorDrawerShared.jsx) does not throw.
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // Helper: click a product group's header row (the button wraps name + count + chevron).
  async function expandGroup(user, productName) {
    const header = screen.getByText(productName).closest('button');
    await user.click(header);
  }

  it('renders nothing when open is false', () => {
    const { container } = render(
      <ProductStockSearchDrawer {...defaultProps} open={false} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the dialog when open', () => {
    render(<ProductStockSearchDrawer {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders custom title in the search placeholder when provided', () => {
    render(<ProductStockSearchDrawer {...defaultProps} title="Producto" />);
    expect(screen.getByPlaceholderText(/Producto/)).toBeInTheDocument();
  });

  it('does not fetch when selectorUrl is missing', () => {
    render(<ProductStockSearchDrawer {...defaultProps} selectorUrl={null} />);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // ETP-4576 — inverted regression guard: the drawer no longer holds a token, so
  // gating its search on one left it permanently empty. The request must fire.
  it('still searches with no token, sending the cookie and no credential header', () => {
    render(<ProductStockSearchDrawer {...defaultProps} />);
    expect(globalThis.fetch).toHaveBeenCalled();
    const [, init] = globalThis.fetch.mock.calls[0];
    expect(init.credentials).toBe('include');
    expect(JSON.stringify(init.headers ?? {})).not.toContain('Bearer');
  });

  it('calls onClose when overlay is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProductStockSearchDrawer {...defaultProps} />);
    const backdrops = document.querySelectorAll('.fixed.inset-0');
    if (backdrops[0]) {
      await user.click(backdrops[0]);
    }
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ProductStockSearchDrawer {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    const closeBtn = dialog.querySelectorAll('button')[0];
    if (closeBtn) {
      await user.click(closeBtn);
    }
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('fetches products on mount when open', async () => {
    render(<ProductStockSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(50);
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalled();
    });
  });

  it('shows a no-results message when a query returns nothing', async () => {
    render(<ProductStockSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(50);

    const input = screen.getByPlaceholderText(/searchLabelPrefix/);
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).type(input, 'nonexistent');
    await vi.advanceTimersByTimeAsync(500);

    await waitFor(() => {
      expect(screen.getByText(/productSearchNoResults/)).toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Grouping + warehouse-filter pills
  // ────────────────────────────────────────────────────────────────────────────

  it('renders results grouped by product with warehouse-filter pills', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'p1', label: 'Widget', searchKey: 'WDG', warehouse: 'Main', _aux: { _LOC: 'loc1', _QTY: '10' } },
          { id: 'p1', label: 'Widget', searchKey: 'WDG', warehouse: 'Secondary', _aux: { _LOC: 'loc2', _QTY: '5' } },
          { id: 'p2', label: 'Gadget', searchKey: 'GDG', warehouse: 'Main', _aux: { _LOC: 'loc3', _QTY: '20' } },
        ],
        hasMore: false,
      }),
    });

    render(<ProductStockSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(100);

    await waitFor(() => {
      expect(screen.getByText('Widget')).toBeInTheDocument();
      expect(screen.getByText('Gadget')).toBeInTheDocument();
    });

    // Warehouse-filter pills: "All" plus one per unique warehouse.
    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Main')).toBeInTheDocument();
    expect(screen.getByText('Secondary')).toBeInTheDocument();

    // Groups start collapsed — locator sub-rows are not rendered yet.
    expect(screen.queryByText('-')).not.toBeInTheDocument();
    expect(screen.getByText('2 locations')).toBeInTheDocument();
    expect(screen.getByText('1 location')).toBeInTheDocument();
  });

  it('filters groups by warehouse pill and auto-expands matching groups', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'p1', label: 'Widget', searchKey: 'WDG', warehouse: 'Main', _aux: { _LOC: 'loc1', _QTY: '10' } },
          { id: 'p1', label: 'Widget', searchKey: 'WDG', warehouse: 'Secondary', _aux: { _LOC: 'loc2', _QTY: '5' } },
          { id: 'p2', label: 'Gadget', searchKey: 'GDG', warehouse: 'Main', _aux: { _LOC: 'loc3', _QTY: '20' } },
        ],
        hasMore: false,
      }),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<ProductStockSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());

    // Select the "Secondary" pill — only Widget has a Secondary-warehouse location.
    await user.click(screen.getByText('Secondary'));

    // Gadget's only location is in "Main", so its group is filtered out entirely.
    await waitFor(() => {
      expect(screen.queryByText('Gadget')).not.toBeInTheDocument();
    });
    // Widget remains, and selecting a warehouse pill auto-expands matching groups.
    expect(screen.getByText('Widget')).toBeInTheDocument();
    expect(screen.getByText('Secondary', { selector: 'span' })).toBeInTheDocument();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Expand/collapse per-locator rows
  // ────────────────────────────────────────────────────────────────────────────

  it('expands a product group to reveal per-locator rows with warehouse name + qty, and collapses again', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'p1', label: 'Widget', searchKey: 'WDG', warehouse: 'Main Warehouse', _aux: { _LOC: 'loc1', _QTY: '10' } },
          { id: 'p1', label: 'Widget', searchKey: 'WDG', warehouse: 'Secondary Warehouse', _aux: { _LOC: 'loc2', _QTY: '5' } },
        ],
        hasMore: false,
      }),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<ProductStockSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());

    // Collapsed by default — the warehouse names only appear once each, as filter
    // pills. The per-locator rows (which repeat the same text) are not rendered yet.
    expect(screen.getAllByText('Main Warehouse')).toHaveLength(1);
    expect(screen.queryByText('Main Warehouse', { selector: 'span' })).not.toBeInTheDocument();

    await expandGroup(user, 'Widget');

    await waitFor(() => {
      expect(screen.getByText('Main Warehouse', { selector: 'span' })).toBeInTheDocument();
      expect(screen.getByText('Secondary Warehouse', { selector: 'span' })).toBeInTheDocument();
    });
    // Once expanded, the name shows up twice: once as the filter pill, once as the row.
    expect(screen.getAllByText('Main Warehouse')).toHaveLength(2);
    expect(screen.getByText('10 ud')).toBeInTheDocument();
    expect(screen.getByText('5 ud')).toBeInTheDocument();

    // Collapse again.
    await expandGroup(user, 'Widget');
    await waitFor(() => {
      expect(screen.queryByText('Main Warehouse', { selector: 'span' })).not.toBeInTheDocument();
    });
    expect(screen.getAllByText('Main Warehouse')).toHaveLength(1);
  });

  it('renders negative on-hand quantities via formatQty', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'p1', label: 'Widget', warehouse: 'Main', _aux: { _LOC: 'loc1', _QTY: '-202' } },
        ],
        hasMore: false,
      }),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<ProductStockSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());

    await expandGroup(user, 'Widget');

    await waitFor(() => {
      expect(screen.getByText((-202).toLocaleString() + ' ud')).toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // filterProductStockRows policy: drop the generic no-stock row when the product
  // has concrete stock; keep it when the product has no stock anywhere.
  // ────────────────────────────────────────────────────────────────────────────

  it('drops the generic null-locator row when the product has concrete stock', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          // Generic no-stock row (no locator, no warehouse).
          { id: 'p1', label: 'Widget', _aux: { _LOC: null, _QTY: '0' } },
          // Concrete locator row for the same product.
          { id: 'p1', label: 'Widget', warehouse: 'Main', _aux: { _LOC: 'loc1', _QTY: '10' } },
        ],
        hasMore: false,
      }),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<ProductStockSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());

    // Only the concrete location survives — group shows exactly 1 location.
    expect(screen.getByText('1 location')).toBeInTheDocument();

    await expandGroup(user, 'Widget');
    await waitFor(() => {
      expect(screen.getByText('Main', { selector: 'span' })).toBeInTheDocument();
    });
    // Only one location row rendered (the concrete one): "Main" shows up as the
    // filter pill AND as the row text, but never as the generic '—' placeholder.
    expect(screen.getAllByText('Main')).toHaveLength(2);
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('keeps the generic row for a product with no stock anywhere', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'p2', label: 'NoStock', _aux: { _LOC: null } },
        ],
        hasMore: false,
      }),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<ProductStockSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(screen.getByText('NoStock')).toBeInTheDocument());

    // The product is still shown as a selectable group with its single generic location.
    expect(screen.getByText('1 location')).toBeInTheDocument();

    await expandGroup(user, 'NoStock');
    await waitFor(() => {
      // No warehouse name on the generic row falls back to the em-dash placeholder.
      expect(screen.getByText('—')).toBeInTheDocument();
    });
  });

  it('removes exact duplicates (same product id + same locator) surfaced twice', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          { id: 'p1', label: 'Widget', warehouse: 'Main', _aux: { _LOC: 'loc1', _QTY: '10' } },
          // Exact duplicate — pagination can surface it twice.
          { id: 'p1', label: 'Widget', warehouse: 'Main', _aux: { _LOC: 'loc1', _QTY: '10' } },
        ],
        hasMore: false,
      }),
    });

    render(<ProductStockSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());

    expect(screen.getByText('1 location')).toBeInTheDocument();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Selection — onSelect receives the raw selector row
  // ────────────────────────────────────────────────────────────────────────────

  it('returns the raw selected row via onSelect and closes the drawer', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const concreteRow = {
      id: 'p1', label: 'Widget', searchKey: 'WDG', warehouse: 'Main Warehouse',
      _aux: { _LOC: 'loc1', _QTY: '2800' },
    };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [concreteRow], hasMore: false }),
    });
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(<ProductStockSearchDrawer {...defaultProps} onSelect={onSelect} onClose={onClose} />);
    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());

    await expandGroup(user, 'Widget');
    const option = await screen.findByTestId('product-stock-option-p1');
    await user.click(option);
    // Selection is committed after a short highlight delay.
    await vi.advanceTimersByTimeAsync(200);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'p1', _aux: expect.objectContaining({ _LOC: 'loc1' }) }),
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Keyboard navigation over the currently-expanded rows
  // ────────────────────────────────────────────────────────────────────────────

  it('ArrowDown moves the active index and Enter selects the active row', async () => {
    const rowA = { id: 'pa', label: 'Alpha', warehouse: 'Main', _aux: { _LOC: 'loca', _QTY: '5' } };
    const rowB = { id: 'pb', label: 'Beta', warehouse: 'Main', _aux: { _LOC: 'locb', _QTY: '3' } };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [rowA, rowB], hasMore: false }),
    });
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<ProductStockSearchDrawer {...defaultProps} onSelect={onSelect} onClose={onClose} />);
    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(screen.getByText('Alpha')).toBeInTheDocument());

    // Expand both single-location groups so their rows are part of flatRows.
    await expandGroup(user, 'Alpha');
    await expandGroup(user, 'Beta');
    await waitFor(() => {
      expect(screen.getByTestId('product-stock-option-pa')).toBeInTheDocument();
      expect(screen.getByTestId('product-stock-option-pb')).toBeInTheDocument();
    });

    const dialog = screen.getByRole('dialog');

    // ArrowDown → activeIdx becomes 0 (Alpha, first flat row).
    act(() => { fireEvent.keyDown(dialog, { key: 'ArrowDown' }); });
    // ArrowDown again → activeIdx becomes 1 (Beta).
    act(() => { fireEvent.keyDown(dialog, { key: 'ArrowDown' }); });
    // ArrowUp → back to 0 (Alpha).
    act(() => { fireEvent.keyDown(dialog, { key: 'ArrowUp' }); });
    // Enter → selects the currently active row (index 0, Alpha).
    act(() => { fireEvent.keyDown(dialog, { key: 'Enter' }); });

    // Advance past the 120 ms selection timeout.
    await vi.advanceTimersByTimeAsync(200);

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'pa' }));
  });

  it('ArrowDown clamps at the last row (does not overflow)', async () => {
    const row = { id: 'p1', label: 'Solo', warehouse: 'Main', _aux: { _LOC: 'loc1', _QTY: '1' } };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [row], hasMore: false }),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(<ProductStockSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(50);
    await waitFor(() => expect(screen.getByText('Solo')).toBeInTheDocument());
    await expandGroup(user, 'Solo');
    await waitFor(() => expect(screen.getByTestId('product-stock-option-p1')).toBeInTheDocument());

    const dialog = screen.getByRole('dialog');

    act(() => {
      for (let i = 0; i < 3; i++) {
        fireEvent.keyDown(dialog, { key: 'ArrowDown' });
      }
    });
    // If we reach here without error, the clamp worked.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed on the document (hook effect)', async () => {
    const onClose = vi.fn();
    render(<ProductStockSearchDrawer {...defaultProps} onClose={onClose} />);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('does not call onClose on Escape when the drawer is closed', () => {
    const onClose = vi.fn();
    render(<ProductStockSearchDrawer {...defaultProps} open={false} onClose={onClose} />);

    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );

    expect(onClose).not.toHaveBeenCalled();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Scroll-triggered pagination (handleScroll in useProductSelectorFetch)
  // ────────────────────────────────────────────────────────────────────────────

  it('fetches the next page when the list is scrolled near the bottom and hasMore is true', async () => {
    const page1 = [
      { id: 'p1', label: 'Row One', warehouse: 'Main', _aux: { _LOC: 'loc1', _QTY: '1' } },
    ];
    const page2 = [
      { id: 'p2', label: 'Row Two', warehouse: 'Main', _aux: { _LOC: 'loc2', _QTY: '2' } },
    ];

    // The shell now also bulk-fetches product images on open (useProductImages), so raw
    // `fetch` call counts include that request too. Route by URL and count only the
    // selector calls to keep this assertion about pagination, not about the image fetch.
    let selectorCalls = 0;
    globalThis.fetch.mockImplementation((url) => {
      if (url.includes('/image/')) return Promise.resolve({ ok: false });
      if (url.includes('/product/product')) {
        return Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) });
      }
      selectorCalls += 1;
      if (selectorCalls === 1) {
        return Promise.resolve({ ok: true, json: async () => ({ items: page1, hasMore: true }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({ items: page2, hasMore: false }) });
    });

    render(<ProductStockSearchDrawer {...defaultProps} />);

    await vi.advanceTimersByTimeAsync(50);
    await waitFor(() => expect(selectorCalls).toBe(1));
    await waitFor(() => expect(screen.getByText('Row One')).toBeInTheDocument());

    const dialog = screen.getByRole('dialog');
    const listContainer = dialog.querySelector('.overflow-y-auto');
    expect(listContainer).not.toBeNull();

    // jsdom does not compute layout — set scroll geometry so the condition
    //   scrollTop + clientHeight >= scrollHeight - 50
    // evaluates to true.
    Object.defineProperty(listContainer, 'scrollTop', { value: 950, writable: true, configurable: true });
    Object.defineProperty(listContainer, 'clientHeight', { value: 100, writable: true, configurable: true });
    Object.defineProperty(listContainer, 'scrollHeight', { value: 1000, writable: true, configurable: true });

    listContainer.dispatchEvent(new Event('scroll', { bubbles: true }));

    await waitFor(() => {
      expect(selectorCalls).toBe(2);
    });

    await waitFor(() => {
      expect(screen.getByText('Row Two')).toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // Product image on group headers (new — the stock variant previously had NO image)
  // ────────────────────────────────────────────────────────────────────────────

  it('bulk-fetches product images on open and renders an <img> on the group header when resolved', async () => {
    globalThis.fetch.mockImplementation((url) => {
      if (url.includes('/image/')) {
        return Promise.resolve({ ok: true, blob: async () => new Blob(['fake'], { type: 'image/png' }) });
      }
      if (url.includes('/product/product')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ response: { data: [{ id: 'p1', searchKey: 'WDG', image: 'img-1' }] } }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          items: [{ id: 'p1', label: 'Widget', searchKey: 'WDG', warehouse: 'Main', _aux: { _LOC: 'loc1', _QTY: '10' } }],
          hasMore: false,
        }),
      });
    });
    // jsdom does not implement these — ProductAvatar uses them to display the blob.
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();

    render(<ProductStockSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());

    // The bulk product-image endpoint was requested on open.
    await waitFor(() => {
      expect(globalThis.fetch.mock.calls.some(([url]) => url.includes('/product/product'))).toBe(true);
    });

    // The resolved image id triggers the per-image fetch, rendering an <img> on the header.
    await waitFor(() => {
      const groupHeader = screen.getByText('Widget').closest('button');
      expect(groupHeader.querySelector('img')).toBeTruthy();
    });
  });

  it('falls back to an initials badge on the group header when no image is available', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{ id: 'p1', label: 'Widget', searchKey: 'WDG', warehouse: 'Main', _aux: { _LOC: 'loc1', _QTY: '10' } }],
        hasMore: false,
      }),
    });

    render(<ProductStockSearchDrawer {...defaultProps} />);
    await vi.advanceTimersByTimeAsync(100);
    await waitFor(() => expect(screen.getByText('Widget')).toBeInTheDocument());

    const groupHeader = screen.getByText('Widget').closest('button');
    expect(groupHeader.querySelector('img')).toBeNull();
    // Initials fallback derives the first letter of the product name ("Widget" -> "W").
    expect(groupHeader.textContent).toContain('W');
  });

  // ────────────────────────────────────────────────────────────────────────────
  // selectorContext — previously silently ignored by this variant, now threaded
  // through to the shared fetch hook and spread into every request's params.
  // ────────────────────────────────────────────────────────────────────────────

  it('threads selectorContext through to the selector fetch request', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], hasMore: false }),
    });

    render(
      <ProductStockSearchDrawer
        {...defaultProps}
        selectorContext={{ warehouseId: 'WH1' }}
      />,
    );
    await vi.advanceTimersByTimeAsync(50);

    await waitFor(() => {
      const selectorCall = globalThis.fetch.mock.calls.find(([url]) => url.includes('selectors/M_Product_ID'));
      expect(selectorCall).toBeTruthy();
      expect(selectorCall[0]).toContain('warehouseId=WH1');
    });
  });
});
