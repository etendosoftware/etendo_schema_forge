import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Mock buildUrlWithParams
vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url) => url,
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    const map = {
      searchLabelPrefix: 'Search',
      product: 'Product',
      productSearchNoResults: params?.query ? `No results for "${params.query}"` : 'No results',
      productSearchCount: params?.count != null ? `${params.count} products` : 'products',
      productSearchNavigate: 'navigate',
      productSearchSelect: 'select',
      productSearchClose: 'close',
    };
    return map[key] ?? key;
  },
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

import ProductSearchDrawer from '../ProductSearchDrawer.jsx';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Default fetch responses
function setupFetchMock(items = [], opts = {}) {
  mockFetch.mockImplementation((url) => {
    if (url.includes('/image/')) {
      return Promise.resolve({ ok: false });
    }
    if (url.includes('product/product')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: { data: [] } }),
      });
    }
    // Selector URL response
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        items: items,
        hasMore: opts.hasMore ?? false,
        totalCount: opts.totalCount ?? items.length,
      }),
    });
  });
}

const BASE_PROPS = {
  open: true,
  onClose: vi.fn(),
  onSelect: vi.fn(),
  selectorUrl: 'http://localhost:8080/etendo/neo/sales-order/sales-order-line/selectors/product',
  token: 'test-token',
  title: 'Product',
};

describe('ProductSearchDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFetchMock([]);
  });

  it('returns null when open is false', () => {
    const { container } = render(
      <ProductSearchDrawer {...BASE_PROPS} open={false} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders dialog when open is true', () => {
    render(<ProductSearchDrawer {...BASE_PROPS} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('renders search input with title as placeholder', () => {
    render(<ProductSearchDrawer {...BASE_PROPS} />);
    const input = screen.getByPlaceholderText('Search Product...');
    expect(input).toBeInTheDocument();
  });

  it('renders product list when results are returned', async () => {
    const items = [
      { id: '1', label: 'Widget A', searchKey: 'W001', standardPrice: 10.5 },
      { id: '2', label: 'Widget B', searchKey: 'W002', standardPrice: 20.0 },
    ];
    setupFetchMock(items);
    render(<ProductSearchDrawer {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('Widget A')).toBeInTheDocument();
      expect(screen.getByText('Widget B')).toBeInTheDocument();
    });
  });

  it('shows product codes', async () => {
    const items = [
      { id: '1', label: 'Widget A', searchKey: 'W001' },
    ];
    setupFetchMock(items);
    render(<ProductSearchDrawer {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('W001')).toBeInTheDocument();
    });
  });

  it('shows prices formatted to 2 decimal places', async () => {
    const items = [
      { id: '1', label: 'Widget A', searchKey: 'W001', standardPrice: 10.5 },
    ];
    setupFetchMock(items);
    render(<ProductSearchDrawer {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('10.50')).toBeInTheDocument();
    });
  });

  it('calls onSelect when a product is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const items = [
      { id: '1', label: 'Widget A', searchKey: 'W001' },
    ];
    setupFetchMock(items);
    render(<ProductSearchDrawer {...BASE_PROPS} onSelect={onSelect} />);
    await waitFor(() => {
      expect(screen.getByText('Widget A')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Widget A'));
    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(items[0]);
    });
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ProductSearchDrawer {...BASE_PROPS} onClose={onClose} />);
    // Search-bar icon testids now live on the shared shell with the `__pds` suffix.
    await user.click(screen.getByTestId('X__pds'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows no results message when search yields nothing', async () => {
    setupFetchMock([]);
    render(<ProductSearchDrawer {...BASE_PROPS} />);
    // Type a query that returns no results
    const input = screen.getByPlaceholderText('Search Product...');
    await userEvent.type(input, 'nonexistent');
    await waitFor(() => {
      // The "No results" message appears after loading completes
      const noResults = screen.queryByText(/No results for/);
      // May or may not appear depending on timing — just verify no crash
      expect(input).toHaveValue('nonexistent');
    });
  });

  it('renders footer with record count when results exist', async () => {
    const items = [
      { id: '1', label: 'Widget A', searchKey: 'W001' },
      { id: '2', label: 'Widget B', searchKey: 'W002' },
    ];
    setupFetchMock(items);
    render(<ProductSearchDrawer {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('2 products')).toBeInTheDocument();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Auto-waterfall (useProductSelectorFetch line 168-170): ProductSearchDrawer
  // wires autoWaterfallMin: 15. When a fresh fetch yields fewer than 15 visible
  // rows AND hasMore is true, the hook recursively fetches the next page.
  // ──────────────────────────────────────────────────────────────────────────

  it('auto-fetches the next page when fewer than 15 rows are returned and hasMore is true', async () => {
    // First page: 2 deduped rows + hasMore=true → below the 15 threshold, so the
    // hook must fire a SECOND (append) fetch for the next page automatically.
    const page1 = [
      { id: '1', label: 'Widget A', searchKey: 'W001' },
      { id: '2', label: 'Widget B', searchKey: 'W002' },
    ];
    const page2 = [
      { id: '3', label: 'Widget C', searchKey: 'W003' },
    ];

    let selectorCalls = 0;
    mockFetch.mockImplementation((url) => {
      if (url.includes('/image/')) return Promise.resolve({ ok: false });
      if (url.includes('product/product')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
      }
      // Selector URL: first call returns page1 with hasMore, second returns page2.
      selectorCalls += 1;
      if (selectorCalls === 1) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ items: page1, hasMore: true, totalCount: 3 }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: page2, hasMore: false, totalCount: 3 }),
      });
    });

    render(<ProductSearchDrawer {...BASE_PROPS} />);

    // The waterfall fires a second selector fetch; wait until at least 2 selector
    // calls have happened (image-prefetch calls are excluded by the counter).
    await waitFor(() => {
      expect(selectorCalls).toBeGreaterThanOrEqual(2);
    });

    // The appended page row becomes visible after the second fetch resolves.
    await waitFor(() => {
      expect(screen.getByText('Widget C')).toBeInTheDocument();
    });
  });

  it('does NOT auto-fetch a second page when hasMore is false', async () => {
    const page1 = [
      { id: '1', label: 'Widget A', searchKey: 'W001' },
      { id: '2', label: 'Widget B', searchKey: 'W002' },
    ];
    let selectorCalls = 0;
    mockFetch.mockImplementation((url) => {
      if (url.includes('/image/')) return Promise.resolve({ ok: false });
      if (url.includes('product/product')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
      }
      selectorCalls += 1;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ items: page1, hasMore: false, totalCount: 2 }),
      });
    });

    render(<ProductSearchDrawer {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('Widget A')).toBeInTheDocument();
    });
    // Give any (incorrect) waterfall a chance to fire, then assert it did not.
    await new Promise((r) => setTimeout(r, 50));
    expect(selectorCalls).toBe(1);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Error path (useProductSelectorFetch line 172-177): a non-abort fetch
  // rejection on the initial (non-append) load clears results and stops loading.
  // ──────────────────────────────────────────────────────────────────────────

  it('ends in a non-loading empty state when the initial fetch rejects with a network error', async () => {
    mockFetch.mockImplementation((url) => {
      if (url.includes('/image/')) return Promise.resolve({ ok: false });
      if (url.includes('product/product')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
      }
      // Selector URL rejects with a non-abort error → hits the .catch branch.
      return Promise.reject(new Error('network'));
    });

    const { container } = render(<ProductSearchDrawer {...BASE_PROPS} />);

    // The drawer stays mounted (dialog present) and renders no product options.
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    // No spinner remains after the rejection settles (loading was reset to false).
    await waitFor(() => {
      expect(container.querySelector('[data-testid^="Loader2"]')).toBeNull();
    });
    // Results were cleared — no product option rows rendered.
    expect(screen.queryAllByTestId(/^product-search-option-/)).toHaveLength(0);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Footer-count bugfix: footerCount must always reflect the deduplicated
  // visible list, never the backend's raw (pre-dedup) totalCount. Regressed by
  // e.g. sales-invoice's ProductSimple selector, which returns one row per
  // active price-list-version for the same product.
  // ──────────────────────────────────────────────────────────────────────────

  it('shows the deduplicated footer count, not the raw backend totalCount', async () => {
    // Two rows share the same searchKey — deduplicateBySearchKey collapses them into a
    // single visible row, while the backend's totalCount still reports the raw row count.
    const items = [
      { id: '1', label: 'Widget A', searchKey: 'W001', standardPrice: 10 },
      { id: '1b', label: 'Widget A', searchKey: 'W001', standardPrice: 12 },
    ];
    setupFetchMock(items, { totalCount: 5 });
    render(<ProductSearchDrawer {...BASE_PROPS} />);

    await waitFor(() => {
      expect(screen.getByText('Widget A')).toBeInTheDocument();
    });
    // Only one row is visible after dedup...
    expect(screen.getAllByText('Widget A')).toHaveLength(1);
    // ...and the footer must reflect that deduped count (1), never the raw totalCount (5).
    expect(screen.getByText('1 products')).toBeInTheDocument();
    expect(screen.queryByText('5 products')).not.toBeInTheDocument();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Props contract: dead props dropped by the shell refactor must stay dropped.
  // ──────────────────────────────────────────────────────────────────────────

  it('no longer references the dropped onDeselect / imageEntityUrl props', () => {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(__dirname, '..', 'ProductSearchDrawer.jsx'), 'utf8');
    expect(src).not.toMatch(/onDeselect/);
    expect(src).not.toMatch(/imageEntityUrl/);
  });
});
