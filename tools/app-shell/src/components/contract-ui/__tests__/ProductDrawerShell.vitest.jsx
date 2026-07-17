/**
 * ProductDrawerShell owns all shared chrome for the Product selector modals (overlay,
 * dialog container, search bar, loading / no-results states, footer, close behaviors,
 * and the 120ms selection commit). This suite exercises the shell in isolation, using a
 * minimal `useVariant` stub, so the contract with real variants (ProductSearchDrawer,
 * ProductStockSearchDrawer) stays verified independently of their own logic.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url) => url,
}));

import ProductDrawerShell from '../ProductDrawerShell.jsx';

const mockFetch = vi.fn();
global.fetch = mockFetch;

function setupFetchMock(items = [], opts = {}) {
  mockFetch.mockImplementation((url) => {
    if (url.includes('/image/')) return Promise.resolve({ ok: false });
    if (url.includes('product/product')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        items,
        hasMore: opts.hasMore ?? false,
        totalCount: opts.totalCount ?? items.length,
      }),
    });
  });
}

/**
 * Minimal `useVariant` stub — renders each result as a plain button and forwards the
 * shell-owned `select` callback (which the shell wraps with the 120ms commit delay and
 * the keepOpenOnSelect gate). `toolbar` and `onNavKeyDown` are configurable per test so we
 * can assert the shell wires them correctly without depending on a real variant's own logic.
 */
function makeVariant({ toolbar = null, onNavKeyDown = null } = {}) {
  return (ctx) => {
    const { results, select } = ctx;
    return {
      toolbar,
      body: (
        <ul>
          {results.map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => select(item)}>{item.label}</button>
            </li>
          ))}
        </ul>
      ),
      footerCount: results.length,
      hasResults: results.length > 0,
      onNavKeyDown,
    };
  };
}

const BASE_PROPS = {
  open: true,
  onClose: vi.fn(),
  onSelect: vi.fn(),
  selectorUrl: 'http://localhost:8080/etendo/neo/sales-order/sales-order-line/selectors/product',
  token: 'test-token',
  fetchConfig: { transform: (items) => items },
};

describe('ProductDrawerShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFetchMock([]);
  });

  it('returns null when open is false', () => {
    const { container } = render(
      <ProductDrawerShell {...BASE_PROPS} open={false} useVariant={makeVariant()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the dialog chrome: overlay, container and search bar', () => {
    render(<ProductDrawerShell {...BASE_PROPS} useVariant={makeVariant()} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('product-search-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('product-search-input')).toBeInTheDocument();
    expect(screen.getByTestId('Search__pds')).toBeInTheDocument();
  });

  it('renders the variant toolbar slot when the variant provides one', () => {
    render(
      <ProductDrawerShell
        {...BASE_PROPS}
        useVariant={makeVariant({ toolbar: <div data-testid="custom-toolbar">Toolbar</div> })}
      />
    );
    expect(screen.getByTestId('custom-toolbar')).toBeInTheDocument();
  });

  it('does not render a toolbar slot when the variant returns none', () => {
    render(<ProductDrawerShell {...BASE_PROPS} useVariant={makeVariant()} />);
    expect(screen.queryByTestId('custom-toolbar')).not.toBeInTheDocument();
  });

  it('renders the variant body when results are returned', async () => {
    setupFetchMock([{ id: '1', label: 'Widget A' }]);
    render(<ProductDrawerShell {...BASE_PROPS} useVariant={makeVariant()} />);
    await waitFor(() => expect(screen.getByText('Widget A')).toBeInTheDocument());
  });

  it('shows a loading spinner before the first fetch resolves', async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // never resolves
    render(<ProductDrawerShell {...BASE_PROPS} useVariant={makeVariant()} />);
    // Both the search-bar spinner and the body's centered spinner render while loading
    // with zero results — assert at least one is present rather than a single match.
    await waitFor(() => expect(screen.getAllByTestId('Loader2__pds').length).toBeGreaterThan(0));
  });

  it('shows the no-results message when a query yields nothing', async () => {
    setupFetchMock([]);
    render(<ProductDrawerShell {...BASE_PROPS} useVariant={makeVariant()} />);
    const input = screen.getByTestId('product-search-input');
    await userEvent.type(input, 'nonexistent');
    await waitFor(() => {
      expect(screen.getByText(/No results for/)).toBeInTheDocument();
    });
  });

  it('renders the footer with the variant-provided footerCount when hasResults is true', async () => {
    setupFetchMock([{ id: '1', label: 'A' }, { id: '2', label: 'B' }]);
    render(<ProductDrawerShell {...BASE_PROPS} useVariant={makeVariant()} />);
    await waitFor(() => expect(screen.getByText('2 products')).toBeInTheDocument());
  });

  it('does not render the footer when hasResults is false', () => {
    render(<ProductDrawerShell {...BASE_PROPS} useVariant={makeVariant()} />);
    expect(screen.queryByText(/products$/)).not.toBeInTheDocument();
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(<ProductDrawerShell {...BASE_PROPS} onClose={onClose} useVariant={makeVariant()} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on overlay click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ProductDrawerShell {...BASE_PROPS} onClose={onClose} useVariant={makeVariant()} />);
    const overlays = document.querySelectorAll('.fixed.inset-0');
    await user.click(overlays[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on the X button click', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ProductDrawerShell {...BASE_PROPS} onClose={onClose} useVariant={makeVariant()} />);
    await user.click(screen.getByTestId('X__pds'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close when clicking inside the dialog container', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    setupFetchMock([{ id: '1', label: 'Widget A' }]);
    render(<ProductDrawerShell {...BASE_PROPS} onClose={onClose} useVariant={makeVariant()} />);
    await waitFor(() => expect(screen.getByText('Widget A')).toBeInTheDocument());
    await user.click(screen.getByTestId('product-search-drawer'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('delegates non-Escape keydowns to the variant onNavKeyDown', () => {
    const onNavKeyDown = vi.fn();
    render(<ProductDrawerShell {...BASE_PROPS} useVariant={makeVariant({ onNavKeyDown })} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowDown' });
    expect(onNavKeyDown).toHaveBeenCalled();
    expect(onNavKeyDown.mock.calls[0][0].key).toBe('ArrowDown');
  });

  it('does not delegate Escape to the variant onNavKeyDown', () => {
    const onNavKeyDown = vi.fn();
    render(<ProductDrawerShell {...BASE_PROPS} useVariant={makeVariant({ onNavKeyDown })} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onNavKeyDown).not.toHaveBeenCalled();
  });

  it('select() commits after a delay, calls onSelect, and closes when keepOpenOnSelect is false', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    setupFetchMock([{ id: '1', label: 'Widget A' }]);
    render(
      <ProductDrawerShell
        {...BASE_PROPS}
        onSelect={onSelect}
        onClose={onClose}
        useVariant={makeVariant()}
      />
    );
    await waitFor(() => expect(screen.getByText('Widget A')).toBeInTheDocument());
    await user.click(screen.getByText('Widget A'));
    // Selection is deferred (120ms highlight delay) — neither callback fires synchronously.
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith({ id: '1', label: 'Widget A' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('select() calls onSelect but does NOT close when keepOpenOnSelect is true', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    setupFetchMock([{ id: '1', label: 'Widget A' }]);
    render(
      <ProductDrawerShell
        {...BASE_PROPS}
        onSelect={onSelect}
        onClose={onClose}
        keepOpenOnSelect
        useVariant={makeVariant()}
      />
    );
    await waitFor(() => expect(screen.getByText('Widget A')).toBeInTheDocument());
    await user.click(screen.getByText('Widget A'));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith({ id: '1', label: 'Widget A' }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
