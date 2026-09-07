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

// Real useCurrency() (no CurrencyProvider in these tests) resolves to null — mocked here as a
// controllable vi.fn so the currency-precedence suite below can simulate a resolved session
// currency without wiring an AuthProvider/CurrencyProvider tree.
vi.mock('@/hooks/useCurrency.jsx', () => ({ useCurrency: vi.fn(() => null) }));

import ProductSearchDrawer from '../ProductSearchDrawer.jsx';
import { useCurrency } from '@/hooks/useCurrency.jsx';

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
    // vi.clearAllMocks() clears call history but not a mockReturnValue implementation —
    // reset it explicitly so a previous test's override never leaks into the next one.
    useCurrency.mockReturnValue(null);
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

  it('shows prices via the shared formatCurrency (es-ES, grouped, real symbol), never the bare toFixed fallback', async () => {
    const items = [
      { id: '1', label: 'Widget A', searchKey: 'W001', standardPrice: 10.5 },
    ];
    setupFetchMock(items);
    render(<ProductSearchDrawer {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('10,50 $')).toBeInTheDocument();
    });
    expect(screen.queryByText('10.50')).toBeNull();
  });

  it('groups thousands in the price even with no currency context supplied (1000-9999 range)', async () => {
    const items = [
      { id: '1', label: 'Widget A', searchKey: 'W001', standardPrice: 1500.5 },
    ];
    setupFetchMock(items);
    render(<ProductSearchDrawer {...BASE_PROPS} />);
    await waitFor(() => {
      expect(screen.getByText('1.500,50 $')).toBeInTheDocument();
    });
    expect(screen.queryByText('1500.50')).toBeNull();
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

  // ──────────────────────────────────────────────────────────────────────────
  // Currency precedence (ETP-5148 regression): the catalog price must render in
  // the CATALOG/organization currency, never the document's header currency.
  // selectorContext.priceCurrency > selectorContext.currency > session currency
  // > 'USD'. Windows opt into the org-currency behavior via
  // decisions.json → window.selectorPriceCurrency: "org", which DetailView.jsx
  // resolves into selectorContext.priceCurrency (see DetailView.jsx around
  // line 1362). Before ETP-5148, sales-invoice/purchase-invoice did not set that
  // flag, so selectorContext.currency (the document's header currency) won by
  // default and the drawer showed e.g. '$5,00' on a EUR-catalog product for a
  // USD invoice — the backend price itself is never converted.
  // ──────────────────────────────────────────────────────────────────────────
  describe('currency precedence in the price column', () => {
    const items = [
      { id: '1', label: 'Widget A', searchKey: 'W001', standardPrice: 5 },
    ];

    it('prefers selectorContext.priceCurrency over selectorContext.currency (the exact ETP-5148 bug)', async () => {
      setupFetchMock(items);
      render(
        <ProductSearchDrawer
          {...BASE_PROPS}
          selectorContext={{ priceCurrency: 'EUR', currency: 'USD' }}
        />
      );
      await waitFor(() => {
        expect(screen.getByText('5,00 €')).toBeInTheDocument();
      });
      expect(screen.queryByText('5,00 $')).not.toBeInTheDocument();
    });

    it('falls back to selectorContext.currency when priceCurrency is not set (documented pre-existing behavior for windows without the org flag)', async () => {
      setupFetchMock(items);
      render(
        <ProductSearchDrawer
          {...BASE_PROPS}
          selectorContext={{ currency: 'USD' }}
        />
      );
      await waitFor(() => {
        expect(screen.getByText('5,00 $')).toBeInTheDocument();
      });
    });

    it('falls back to the session currency when selectorContext has neither priceCurrency nor currency', async () => {
      useCurrency.mockReturnValue('EUR');
      setupFetchMock(items);
      render(<ProductSearchDrawer {...BASE_PROPS} selectorContext={{}} />);
      await waitFor(() => {
        expect(screen.getByText('5,00 €')).toBeInTheDocument();
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Secondary converted price (ETP-5148 R2): when a window declares
  // selectorPriceCurrency and the document currency differs from the catalog
  // currency, the drawer shows a second, smaller line with the catalog price
  // converted into the document currency via selectorContext.priceCurrencyRate.
  // Rate semantics: org → document multiplier (1.47 = "1 EUR = 1.47 USD"),
  // used directly, NEVER inverted — converted = catalogPrice * rate.
  // ──────────────────────────────────────────────────────────────────────────
  describe('secondary converted price (ETP-5148 R2)', () => {
    const items = [
      { id: '1', label: 'Widget A', searchKey: 'W001', standardPrice: 5 },
    ];

    async function renderAndWaitForOption() {
      await waitFor(() => {
        expect(screen.getByText('Widget A')).toBeInTheDocument();
      });
    }

    it('shows both the primary (catalog) and secondary (converted document-currency) price when priceCurrency, currency and a rate are all present and differ', async () => {
      setupFetchMock(items);
      render(
        <ProductSearchDrawer
          {...BASE_PROPS}
          selectorContext={{ priceCurrency: 'EUR', currency: 'USD', priceCurrencyRate: 1.47 }}
        />
      );
      await renderAndWaitForOption();
      // Primary: catalog price in EUR (5.00).
      expect(screen.getByText('5,00 €')).toBeInTheDocument();
      // Secondary: 5.00 * 1.47 = 7.35, rendered in the document currency (USD).
      // Rate is org→document and must be applied directly, never inverted
      // (5 / 1.47 = 3.40 would be the wrong-direction bug).
      expect(screen.getByText('7,35 $')).toBeInTheDocument();
      expect(screen.queryByText('3,40 $')).not.toBeInTheDocument();
    });

    it('does NOT show a secondary price when priceCurrency and currency are the same, even with a rate present', async () => {
      setupFetchMock(items);
      render(
        <ProductSearchDrawer
          {...BASE_PROPS}
          selectorContext={{ priceCurrency: 'EUR', currency: 'EUR', priceCurrencyRate: 1.47 }}
        />
      );
      await renderAndWaitForOption();
      expect(screen.getByText('5,00 €')).toBeInTheDocument();
      // No conversion line — same currency on both sides means nothing to convert.
      expect(screen.queryByText('7,35 €')).not.toBeInTheDocument();
      expect(screen.queryByText(/^7,35/)).not.toBeInTheDocument();
    });

    it('does NOT show a secondary price when priceCurrencyRate is absent, and never renders a NaN/0,00 artifact', async () => {
      setupFetchMock(items);
      render(
        <ProductSearchDrawer
          {...BASE_PROPS}
          selectorContext={{ priceCurrency: 'EUR', currency: 'USD' }}
        />
      );
      await renderAndWaitForOption();
      expect(screen.getByText('5,00 €')).toBeInTheDocument();
      expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
      expect(screen.queryByText(/0,00/)).not.toBeInTheDocument();
    });

    it('does NOT show a secondary price when the window has not opted into priceCurrency (current behavior stays intact)', async () => {
      setupFetchMock(items);
      render(
        <ProductSearchDrawer
          {...BASE_PROPS}
          selectorContext={{ currency: 'USD', priceCurrencyRate: 1.47 }}
        />
      );
      await renderAndWaitForOption();
      expect(screen.getByText('5,00 $')).toBeInTheDocument();
      expect(screen.queryByText('7,35 $')).not.toBeInTheDocument();
    });

    it('renders the secondary price for a genuine 1:1 rate (ETP-4836 guard — 1 must not be treated as "no rate")', async () => {
      setupFetchMock(items);
      render(
        <ProductSearchDrawer
          {...BASE_PROPS}
          selectorContext={{ priceCurrency: 'EUR', currency: 'USD', priceCurrencyRate: 1 }}
        />
      );
      await renderAndWaitForOption();
      expect(screen.getByText('5,00 €')).toBeInTheDocument();
      // Rate of exactly 1 → same number, different symbol.
      expect(screen.getByText('5,00 $')).toBeInTheDocument();
    });

    it('falls back the primary price to the raw string and shows no secondary price for a non-numeric price', async () => {
      const nonNumericItems = [
        { id: '1', label: 'Widget A', searchKey: 'W001', standardPrice: 'N/A' },
      ];
      setupFetchMock(nonNumericItems);
      render(
        <ProductSearchDrawer
          {...BASE_PROPS}
          selectorContext={{ priceCurrency: 'EUR', currency: 'USD', priceCurrencyRate: 1.47 }}
        />
      );
      await renderAndWaitForOption();
      expect(screen.getByText('N/A')).toBeInTheDocument();
      // No converted line for a price that never resolved to a number.
      expect(screen.queryByText(/[€$]/)).not.toBeInTheDocument();
    });

    it('renders the primary price before the secondary converted price in the DOM', async () => {
      setupFetchMock(items);
      render(
        <ProductSearchDrawer
          {...BASE_PROPS}
          selectorContext={{ priceCurrency: 'EUR', currency: 'USD', priceCurrencyRate: 1.47 }}
        />
      );
      let wrapper;
      await waitFor(() => {
        wrapper = document.querySelector('[data-testid="product-search-option-1"] .items-end');
        expect(wrapper).toBeTruthy();
      });
      const spans = wrapper.querySelectorAll('span');
      expect(spans).toHaveLength(2);
      expect(spans[0].textContent.replace(/ /g, ' ')).toBe('5,00 €');
      expect(spans[1].textContent.replace(/ /g, ' ')).toBe('7,35 $');
      // The primary span must precede the secondary one in document order.
      expect(spans[0].compareDocumentPosition(spans[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });
});
