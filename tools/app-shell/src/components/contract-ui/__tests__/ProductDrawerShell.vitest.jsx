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
      noProductsFound: 'No products found',
      createProduct: 'Create product',
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

// ETP-5254 — RecordCreateModal has its own suite (RecordCreateModal.vitest.jsx). Here it is
// stubbed down to the contract the shell depends on: it renders only while the shell asks it
// to, echoes the query it was handed, and exposes the two exits (`onCancel`, `onCreated`).
const createModal = vi.hoisted(() => ({ props: null, created: { id: 'new-1' } }));
vi.mock('../RecordCreateModal.jsx', () => ({
  default: (props) => {
    createModal.props = props;
    return (
      <div data-testid="record-create-modal">
        <span data-testid="record-create-initial-query">{props.initialQuery}</span>
        <button type="button" data-testid="stub-create-cancel" onClick={() => props.onCancel()}>
          cancel
        </button>
        <button type="button" data-testid="stub-create-save" onClick={() => props.onCreated(createModal.created)}>
          save
        </button>
      </div>
    );
  },
}));

import ProductDrawerShell, { synthesizeCreatedItem } from '../ProductDrawerShell.jsx';

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

// ────────────────────────────────────────────────────────────────────────────
// ETP-5254 — empty-state regression
// ────────────────────────────────────────────────────────────────────────────

describe('ProductDrawerShell — empty state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFetchMock([]);
  });

  it('shows the generic empty message when an EMPTY query returns nothing', async () => {
    // Regression: the no-results block used to be gated on `query.trim()`, so an empty
    // search that legitimately returned nothing rendered a completely blank body.
    render(<ProductDrawerShell {...BASE_PROPS} useVariant={makeVariant()} />);
    await waitFor(() => expect(screen.getByText('No products found')).toBeInTheDocument());
    expect(screen.queryByText(/No results for/)).not.toBeInTheDocument();
  });

  it('still shows the query-specific message when a NON-empty query returns nothing', async () => {
    render(<ProductDrawerShell {...BASE_PROPS} useVariant={makeVariant()} />);
    await userEvent.type(screen.getByTestId('product-search-input'), 'zzz');
    await waitFor(() => expect(screen.getByText(/No results for "zzz"/)).toBeInTheDocument());
    expect(screen.queryByText('No products found')).not.toBeInTheDocument();
  });

  it('does not show an empty message once there are results', async () => {
    setupFetchMock([{ id: '1', label: 'Widget A' }]);
    render(<ProductDrawerShell {...BASE_PROPS} useVariant={makeVariant()} />);
    await waitFor(() => expect(screen.getByText('Widget A')).toBeInTheDocument());
    expect(screen.queryByText('No products found')).not.toBeInTheDocument();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// ETP-5254 — inline record creation
// ────────────────────────────────────────────────────────────────────────────

const ALLOWLISTED_URL = BASE_PROPS.selectorUrl; // .../sales-order/.../selectors/product
const DENIED_URL = 'http://localhost:8080/etendo/neo/requisition/lines/selectors/product';

describe('ProductDrawerShell — create affordance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFetchMock([]);
    createModal.props = null;
    createModal.created = { id: 'new-1' };
  });

  it('does not render the create row when createEnabled is not passed', async () => {
    render(<ProductDrawerShell {...BASE_PROPS} useVariant={makeVariant()} />);
    await waitFor(() => expect(screen.getByTestId('product-search-drawer')).toBeInTheDocument());
    expect(screen.queryByTestId('product-search-create')).not.toBeInTheDocument();
    expect(screen.queryByTestId('record-create-modal')).not.toBeInTheDocument();
  });

  it('renders the create row for an allowlisted spec when createEnabled is true', async () => {
    render(<ProductDrawerShell {...BASE_PROPS} createEnabled useVariant={makeVariant()} />);
    const cta = await screen.findByTestId('product-search-create');
    expect(cta).toHaveTextContent('Create product');
    // Pinned at the top of the results scroll container, above the empty state.
    expect(screen.getByTestId('product-search-create')).toBeInTheDocument();
  });

  it('does not render the create row for a non-allowlisted spec', async () => {
    render(
      <ProductDrawerShell
        {...BASE_PROPS}
        selectorUrl={DENIED_URL}
        createEnabled
        useVariant={makeVariant()}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('product-search-drawer')).toBeInTheDocument());
    expect(screen.queryByTestId('product-search-create')).not.toBeInTheDocument();
  });

  it('shows the create row alongside results, not only on an empty list', async () => {
    setupFetchMock([{ id: '1', label: 'Widget A' }]);
    render(<ProductDrawerShell {...BASE_PROPS} createEnabled useVariant={makeVariant()} />);
    await waitFor(() => expect(screen.getByText('Widget A')).toBeInTheDocument());
    expect(screen.getByTestId('product-search-create')).toBeInTheDocument();
  });

  it('opening the create modal hides the drawer and forwards the typed query', async () => {
    const user = userEvent.setup();
    render(<ProductDrawerShell {...BASE_PROPS} createEnabled useVariant={makeVariant()} />);
    await user.type(screen.getByTestId('product-search-input'), 'Agua');
    await user.click(await screen.findByTestId('product-search-create'));

    expect(screen.getByTestId('record-create-modal')).toBeInTheDocument();
    expect(screen.queryByTestId('product-search-drawer')).not.toBeInTheDocument();
    expect(screen.getByTestId('record-create-initial-query')).toHaveTextContent('Agua');
    expect(createModal.props.target.entity).toBe('product');
    expect(createModal.props.token).toBe('test-token');
  });

  it('cancelling restores the drawer with the previously typed query intact', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ProductDrawerShell {...BASE_PROPS} onClose={onClose} createEnabled useVariant={makeVariant()} />,
    );
    await user.type(screen.getByTestId('product-search-input'), 'Agua');
    await user.click(await screen.findByTestId('product-search-create'));
    await user.click(screen.getByTestId('stub-create-cancel'));

    // The shell stays MOUNTED while hidden, so the search survives the round trip.
    expect(await screen.findByTestId('product-search-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('product-search-input')).toHaveValue('Agua');
    expect(screen.queryByTestId('record-create-modal')).not.toBeInTheDocument();
    // Cancelling must not tear the drawer down either.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('swallows the document-level Escape while the create modal is open', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <ProductDrawerShell {...BASE_PROPS} onClose={onClose} createEnabled useVariant={makeVariant()} />,
    );

    // Control: with the modal closed, the hook's document-level handler closes the drawer.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    onClose.mockClear();

    await user.click(await screen.findByTestId('product-search-create'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    // The hook binds Escape on `document`, so a portalled sibling cannot stopPropagation it —
    // the shell swaps in a no-op instead, keeping the user's search alive.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('record-create-modal')).toBeInTheDocument();
  });
});

describe('ProductDrawerShell — handleCreated', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupFetchMock([]);
    createModal.props = null;
    createModal.created = { id: 'new-1', name: 'Agua', searchKey: 'AGUA', uOM: 'uom-1' };
  });

  async function openCreateModal(user, props = {}) {
    render(
      <ProductDrawerShell {...BASE_PROPS} createEnabled useVariant={makeVariant()} {...props} />,
    );
    await user.click(await screen.findByTestId('product-search-create'));
  }

  it('re-queries the selector and selects the real row it returns', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    await openCreateModal(user, { onSelect });

    // The re-query hits the very selector this drawer is bound to, so swap the payload now.
    const selectorRow = {
      id: 'new-1',
      label: 'Agua',
      searchKey: 'AGUA',
      _aux: { _UOM: 'EA', _PSTD: '12.50', _PLIM: '15.00' },
    };
    setupFetchMock([selectorRow]);

    await user.click(screen.getByTestId('stub-create-save'));

    // The selector shape is what the line's pricing callout needs — forwarded byte for byte.
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(selectorRow));
    expect(screen.queryByTestId('record-create-modal')).not.toBeInTheDocument();
  });

  it('ignores a re-query row belonging to a different product', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    await openCreateModal(user, { onSelect });

    setupFetchMock([{ id: 'someone-else', label: 'Other', _aux: { _PSTD: '99' } }]);
    await user.click(screen.getByTestId('stub-create-save'));

    await waitFor(() => expect(onSelect).toHaveBeenCalled());
    expect(onSelect.mock.calls[0][0].id).toBe('new-1');
    expect(onSelect.mock.calls[0][0]._aux._PSTD).toBe('0');
  });

  it('synthesizes a selector-shaped row when the re-query returns nothing', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    await openCreateModal(user, { onSelect });

    setupFetchMock([]);
    await user.click(screen.getByTestId('stub-create-save'));

    // A product seeded only on the tenant's default tariffs may not come back from a
    // selector called with THIS document's price list — the line must stay usable.
    await waitFor(() => expect(onSelect).toHaveBeenCalled());
    expect(onSelect.mock.calls[0][0]).toMatchObject({
      id: 'new-1',
      name: 'Agua',
      standardPrice: 0,
      _aux: { _PSTD: '0', _PLIM: '0' },
    });
  });

  it('synthesizes a row when the re-query itself fails', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    await openCreateModal(user, { onSelect });

    mockFetch.mockImplementation(() => Promise.reject(new Error('network down')));
    await user.click(screen.getByTestId('stub-create-save'));

    await waitFor(() => expect(onSelect).toHaveBeenCalled());
    expect(onSelect.mock.calls[0][0]._aux._PSTD).toBe('0');
  });

  it('closes the drawer after the created product is selected', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    await openCreateModal(user, { onClose });

    setupFetchMock([]);
    await user.click(screen.getByTestId('stub-create-save'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe('synthesizeCreatedItem', () => {
  it('builds a selector-shaped row with zeroed prices', () => {
    expect(synthesizeCreatedItem({ id: 'p1', name: 'Agua', searchKey: 'AGUA', uOM: 'uom-1' })).toEqual({
      id: 'p1',
      name: 'Agua',
      label: 'Agua',
      _identifier: 'Agua',
      searchKey: 'AGUA',
      uOM: 'uom-1',
      standardPrice: 0,
      _aux: { _UOM: 'uom-1', _PSTD: '0', _PLIM: '0' },
    });
  });

  it('prefers the uOM identifier over the raw FK id for _aux._UOM', () => {
    const item = synthesizeCreatedItem({ id: 'p1', name: 'Agua', uOM: 'uom-1', 'uOM$_identifier': 'EA' });
    // `_aux._UOM` is an identifier in every selector fixture we have ('EA', 'kg')…
    expect(item._aux._UOM).toBe('EA');
    // …while the id is kept top-level so the callout resolves either way.
    expect(item.uOM).toBe('uom-1');
  });

  it('falls back through name, _identifier and searchKey for the display label', () => {
    expect(synthesizeCreatedItem({ id: 'p1', _identifier: 'From identifier' }).label)
      .toBe('From identifier');
    expect(synthesizeCreatedItem({ id: 'p1', searchKey: 'SK-1' }).label).toBe('SK-1');
    expect(synthesizeCreatedItem({ id: 'p1' }).label).toBe('');
  });

  it('tolerates a null record without throwing', () => {
    expect(synthesizeCreatedItem(null)).toMatchObject({
      id: undefined,
      name: '',
      standardPrice: 0,
      _aux: { _UOM: null, _PSTD: '0', _PLIM: '0' },
    });
  });
});
