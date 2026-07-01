import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// --- Mocks ----------------------------------------------------------------

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: (catalogs, entityName, field = {}) => {
    const keys = [];
    if (entityName && field.column) keys.push(`${entityName}:${field.column}`);
    if (entityName && field.key) keys.push(`${entityName}:${field.key}`);
    if (entityName && field.field) keys.push(`${entityName}:${field.field}`);
    if (field.reference) keys.push(field.reference);
    for (const key of keys) {
      const options = catalogs?.[key];
      if (Array.isArray(options)) return options;
    }
    return [];
  },
}));

vi.mock('lucide-react', () => ({
  Loader2: (props) => <span {...props} data-testid="loader" />,
  Minus: (props) => <span {...props} data-testid="minus-icon" />,
  Plus: (props) => <span {...props} data-testid="plus-icon" />,
  Trash2: (props) => <span {...props} data-testid="trash-icon" />,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// --- Import under test ----------------------------------------------------

import ProductPriceBar from '../ProductPriceBar.jsx';

// --- Constants ------------------------------------------------------------

const SALES_PLV_ID = 'plv-sales-1';
const PURCHASE_PLV_ID = 'plv-purchase-1';

// --- Helpers --------------------------------------------------------------

/**
 * Build a fetch dispatcher that routes calls by URL + method.
 * Keys in `routes` are 'METHOD <url-substring>'. URL match is includes().
 */
function buildFetch(routes, callLog = []) {
  return vi.fn((url, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    callLog.push({ url, method, body: init.body });
    for (const key of Object.keys(routes)) {
      const [m, ...rest] = key.split(' ');
      const pattern = rest.join(' ');
      if (m === method && url.includes(pattern)) {
        const result = routes[key];
        const payload = typeof result === 'function' ? result({ url, init }) : result;
        if (payload && typeof payload.then === 'function') {
          return payload.then((p) => ({
            ok: p?.ok !== false,
            status: p?.status ?? 200,
            json: () => Promise.resolve(p?.body ?? p),
          }));
        }
        return Promise.resolve({
          ok: payload?.ok !== false,
          status: payload?.status ?? 200,
          json: () => Promise.resolve(payload?.body ?? payload),
        });
      }
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
  });
}

function catalogOptions() {
  return [
    { id: SALES_PLV_ID, name: 'Sales PLV', salesPriceList: true },
    { id: PURCHASE_PLV_ID, name: 'Purchase PLV', salesPriceList: false },
  ];
}

function catalogsWithPlv() {
  return { 'price:M_PriceList_Version_ID': catalogOptions() };
}

function apiWithPriceSelector(column = 'M_PriceList_Version_ID') {
  return { selectors: [{ entity: 'price', field: 'priceListVersion', column }] };
}

/** A sales row (salesPriceList = true). */
function salesRow(overrides = {}) {
  return {
    id: 'price-s1',
    standardPrice: 23,
    listPrice: 25,
    priceListVersion: SALES_PLV_ID,
    'priceListVersion$_identifier': 'Sales List v1',
    'priceListVersion$salesPriceList': true,
    ...overrides,
  };
}

/** A purchase row (salesPriceList = false). */
function purchaseRow(overrides = {}) {
  return {
    id: 'price-p1',
    standardPrice: 11,
    listPrice: 13,
    priceListVersion: PURCHASE_PLV_ID,
    'priceListVersion$_identifier': 'Purchase List v1',
    'priceListVersion$salesPriceList': false,
    ...overrides,
  };
}

function renderBar(overrides = {}) {
  const defaults = {
    data: { id: 'prod-1' },
    token: 'tok',
    apiBaseUrl: '/api/product',
    catalogs: {},
    api: { selectors: [] },
    onCountChange: vi.fn(),
  };
  return render(<ProductPriceBar {...defaults} {...overrides} />);
}

// --- Tests ----------------------------------------------------------------

describe('ProductPriceBar', () => {
  beforeEach(() => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [] } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // 1. Default section + toggle visible
  // -----------------------------------------------------------------------
  it('renders sales section title and toggle buttons by default', async () => {
    renderBar();

    // Toggle buttons for both sections should always be visible.
    await waitFor(() => {
      expect(screen.getByTestId('price-tab-sales')).toBeInTheDocument();
    });
    expect(screen.getByTestId('price-tab-purchase')).toBeInTheDocument();

    // The active section heading must say the sales key.
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('priceSalesListsTitle');
  });

  // -----------------------------------------------------------------------
  // 2. Save-first message when no id
  // -----------------------------------------------------------------------
  it('shows save-first message when data has no id', () => {
    renderBar({ data: {} });
    expect(screen.getByText('saveProductFirstPricing')).toBeInTheDocument();
    // Toggle must NOT be rendered.
    expect(screen.queryByTestId('price-tab-sales')).not.toBeInTheDocument();
  });

  it('shows save-first message when data is null', () => {
    renderBar({ data: null });
    expect(screen.getByText('saveProductFirstPricing')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 3. Clicking Purchase toggle switches to purchase section
  // -----------------------------------------------------------------------
  it('clicking the Purchase toggle switches to purchase title', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [purchaseRow()] } },
    });

    const user = userEvent.setup();
    renderBar();

    await waitFor(() => {
      expect(screen.getByTestId('price-tab-purchase')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('price-tab-purchase'));

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'pricePurchaseListsTitle',
    );
  });

  it('switching back to Sales shows the sales title', async () => {
    const user = userEvent.setup();
    renderBar();

    await waitFor(() => expect(screen.getByTestId('price-tab-sales')).toBeInTheDocument());

    // Go to purchase then back.
    await user.click(screen.getByTestId('price-tab-purchase'));
    await user.click(screen.getByTestId('price-tab-sales'));

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('priceSalesListsTitle');
  });

  // -----------------------------------------------------------------------
  // 4. Rows render name + prices
  // -----------------------------------------------------------------------
  it('renders the name and count badge for a sales row', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [salesRow()] } },
    });

    renderBar();

    await screen.findByDisplayValue('Sales List v1');
    // Count badge shows 1.
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders price stepper inputs for a sales row', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [salesRow()] } },
    });

    renderBar();

    // Wait for a row to appear then check spinbutton values.
    await screen.findByDisplayValue('Sales List v1');
    const spinbuttons = screen.getAllByRole('spinbutton');
    // First is standardPrice (23), second is listPrice (25).
    expect(spinbuttons[0]).toHaveValue(23);
    expect(spinbuttons[1]).toHaveValue(25);
  });

  it('renders purchase row in purchase section', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [purchaseRow()] } },
    });

    const user = userEvent.setup();
    renderBar();

    await waitFor(() => expect(screen.getByTestId('price-tab-purchase')).toBeInTheDocument());
    await user.click(screen.getByTestId('price-tab-purchase'));

    await screen.findByDisplayValue('Purchase List v1');
    expect(screen.getByDisplayValue('Purchase List v1')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 5. Editing a stepper and blurring fires PATCH with changed field only
  // -----------------------------------------------------------------------
  it('blurring a changed unit-price input fires PATCH with standardPrice', async () => {
    const calls = [];
    global.fetch = buildFetch(
      {
        'GET /price?parentId=': { response: { data: [salesRow({ standardPrice: 10 })] } },
        'PATCH /price/price-s1': { response: { data: [] } },
      },
      calls,
    );

    const user = userEvent.setup();
    renderBar();

    await screen.findByDisplayValue('Sales List v1');

    const spinbuttons = screen.getAllByRole('spinbutton');
    // Clear existing value and type a new one.
    await user.clear(spinbuttons[0]);
    await user.type(spinbuttons[0], '99');
    await user.tab(); // blur

    await waitFor(() => {
      const patches = calls.filter((c) => c.method === 'PATCH' && c.url.includes('/price/price-s1'));
      expect(patches).toHaveLength(1);
    });

    const patch = calls.find((c) => c.method === 'PATCH');
    const body = JSON.parse(patch.body);
    expect(body).toHaveProperty('standardPrice');
    expect(body).not.toHaveProperty('listPrice');
  });

  it('blurring a changed list-price input fires PATCH with listPrice', async () => {
    const calls = [];
    global.fetch = buildFetch(
      {
        'GET /price?parentId=': { response: { data: [salesRow({ listPrice: 20 })] } },
        'PATCH /price/price-s1': { response: { data: [] } },
      },
      calls,
    );

    const user = userEvent.setup();
    renderBar();

    await screen.findByDisplayValue('Sales List v1');

    const spinbuttons = screen.getAllByRole('spinbutton');
    await user.clear(spinbuttons[1]);
    await user.type(spinbuttons[1], '50');
    await user.tab();

    await waitFor(() => {
      const patches = calls.filter((c) => c.method === 'PATCH' && c.url.includes('/price/price-s1'));
      expect(patches).toHaveLength(1);
    });

    const patch = calls.find((c) => c.method === 'PATCH');
    const body = JSON.parse(patch.body);
    expect(body).toHaveProperty('listPrice');
    expect(body).not.toHaveProperty('standardPrice');
  });

  it('does NOT fire PATCH when the value is unchanged after blur', async () => {
    const calls = [];
    global.fetch = buildFetch(
      {
        'GET /price?parentId=': { response: { data: [salesRow({ standardPrice: 10 })] } },
        'PATCH /price/price-s1': {},
      },
      calls,
    );

    const user = userEvent.setup();
    renderBar();

    await screen.findByDisplayValue('Sales List v1');
    const spinbuttons = screen.getAllByRole('spinbutton');
    // Focus and blur without changing the value.
    await user.click(spinbuttons[0]);
    await user.tab();

    // Give any potential async a beat.
    await new Promise((r) => setTimeout(r, 50));

    const patches = calls.filter((c) => c.method === 'PATCH');
    expect(patches).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 6. Delete button fires DELETE then re-fetches
  // -----------------------------------------------------------------------
  it('clicking delete fires DELETE then re-fetches prices', async () => {
    const calls = [];
    global.fetch = buildFetch(
      {
        'GET /price?parentId=': { response: { data: [salesRow()] } },
        'DELETE /price/price-s1': { ok: true },
      },
      calls,
    );

    const user = userEvent.setup();
    renderBar();

    await screen.findByTestId('price-delete-price-s1');
    await user.click(screen.getByTestId('price-delete-price-s1'));

    await waitFor(() => {
      const deletes = calls.filter((c) => c.method === 'DELETE' && c.url.includes('/price/price-s1'));
      expect(deletes).toHaveLength(1);
    });

    // After DELETE, a re-fetch (GET) should have fired.
    await waitFor(() => {
      const gets = calls.filter((c) => c.method === 'GET' && c.url.includes('/price?parentId='));
      // Initial fetch + post-delete re-fetch = 2.
      expect(gets.length).toBeGreaterThanOrEqual(2);
    });
  });

  // -----------------------------------------------------------------------
  // 7. Add new tariff — combobox filtered to active section, selecting fires POST
  // -----------------------------------------------------------------------
  it('"Add new tariff" reveals combobox with only sales options when in sales section', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [] } },
    });

    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await waitFor(() => expect(screen.getByTestId('price-add-tariff')).toBeInTheDocument());
    await user.click(screen.getByTestId('price-add-tariff'));

    const select = await screen.findByRole('combobox');
    const optionValues = Array.from(select.querySelectorAll('option'))
      .map((o) => o.value)
      .filter(Boolean); // skip placeholder

    expect(optionValues).toContain(SALES_PLV_ID);
    expect(optionValues).not.toContain(PURCHASE_PLV_ID);
  });

  it('"Add new tariff" in purchase section shows only purchase options', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [] } },
    });

    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await waitFor(() => expect(screen.getByTestId('price-tab-purchase')).toBeInTheDocument());
    await user.click(screen.getByTestId('price-tab-purchase'));

    await waitFor(() => expect(screen.getByTestId('price-add-tariff')).toBeInTheDocument());
    await user.click(screen.getByTestId('price-add-tariff'));

    const select = await screen.findByRole('combobox');
    const optionValues = Array.from(select.querySelectorAll('option'))
      .map((o) => o.value)
      .filter(Boolean);

    expect(optionValues).toContain(PURCHASE_PLV_ID);
    expect(optionValues).not.toContain(SALES_PLV_ID);
  });

  it('selecting an option from the combobox fires POST with correct priceListVersion', async () => {
    const calls = [];
    global.fetch = buildFetch(
      {
        'GET /price?parentId=': { response: { data: [] } },
        'POST /price': { response: { data: [] } },
      },
      calls,
    );

    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await waitFor(() => expect(screen.getByTestId('price-add-tariff')).toBeInTheDocument());
    await user.click(screen.getByTestId('price-add-tariff'));

    const select = await screen.findByRole('combobox');
    await user.selectOptions(select, SALES_PLV_ID);

    await waitFor(() => {
      const posts = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/price'));
      expect(posts).toHaveLength(1);
    });

    const post = calls.find((c) => c.method === 'POST');
    const body = JSON.parse(post.body);
    expect(body.priceListVersion).toBe(SALES_PLV_ID);
    expect(body.standardPrice).toBe('0');
    expect(body.listPrice).toBe('0');
  });

  // -----------------------------------------------------------------------
  // 8. onCountChange called with row count
  // -----------------------------------------------------------------------
  it('calls onCountChange with the total row count after fetch', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': {
        response: { data: [salesRow(), purchaseRow()] },
      },
    });

    const onCountChange = vi.fn();
    renderBar({ onCountChange });

    await waitFor(() => {
      expect(onCountChange).toHaveBeenCalledWith(2);
    });
  });

  it('calls onCountChange with 0 when no rows are returned', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [] } },
    });

    const onCountChange = vi.fn();
    renderBar({ onCountChange });

    await waitFor(() => {
      expect(onCountChange).toHaveBeenCalledWith(0);
    });
  });

  // -----------------------------------------------------------------------
  // Lazy selector fetch
  // -----------------------------------------------------------------------
  it('lazily fetches /price/selectors/<col> when no eager options exist', async () => {
    const calls = [];
    global.fetch = buildFetch(
      {
        'GET /price?parentId=': { response: { data: [] } },
        'GET /price/selectors/M_PriceList_Version_ID': {
          items: [
            { id: SALES_PLV_ID, label: 'Sales PLV', salesPriceList: true },
          ],
        },
      },
      calls,
    );

    const user = userEvent.setup();
    renderBar({ api: apiWithPriceSelector() });

    await waitFor(() => expect(screen.getByTestId('price-add-tariff')).toBeInTheDocument());
    await user.click(screen.getByTestId('price-add-tariff'));

    await waitFor(() => {
      const selectorCalls = calls.filter((c) =>
        c.url.includes('/price/selectors/M_PriceList_Version_ID'),
      );
      expect(selectorCalls.length).toBeGreaterThan(0);
    });
  });

  it('skips lazy fetch when eager options are already present', async () => {
    const calls = [];
    global.fetch = buildFetch(
      {
        'GET /price?parentId=': { response: { data: [] } },
        'GET /price/selectors/': {},
      },
      calls,
    );

    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await waitFor(() => expect(screen.getByTestId('price-add-tariff')).toBeInTheDocument());
    await user.click(screen.getByTestId('price-add-tariff'));

    // Wait a tick for any potential lazy fetch.
    await new Promise((r) => setTimeout(r, 30));

    const selectorCalls = calls.filter((c) => c.url.includes('/price/selectors/'));
    expect(selectorCalls).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // Loading / spinner state
  // -----------------------------------------------------------------------
  it('shows loading spinner while fetching prices', async () => {
    let resolveFetch;
    const pendingFetch = new Promise((resolve) => { resolveFetch = resolve; });

    global.fetch = vi.fn(() =>
      pendingFetch.then(() => ({
        ok: true,
        json: () => Promise.resolve({ response: { data: [] } }),
      })),
    );

    renderBar();

    // Loader should be visible while fetch is pending.
    expect(screen.getByTestId('loader')).toBeInTheDocument();

    await act(async () => { resolveFetch(); await pendingFetch; });

    await waitFor(() => {
      expect(screen.queryByTestId('loader')).not.toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Count badge
  // -----------------------------------------------------------------------
  it('count badge shows the number of rows in the active section', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': {
        response: { data: [salesRow(), purchaseRow()] },
      },
    });

    const user = userEvent.setup();
    renderBar();

    await screen.findByDisplayValue('Sales List v1');
    // Sales section has 1 row.
    expect(screen.getByText('1')).toBeInTheDocument();

    // Switch to purchase — it also has 1 row.
    await user.click(screen.getByTestId('price-tab-purchase'));
    await screen.findByDisplayValue('Purchase List v1');
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Delete button test-id format
  // -----------------------------------------------------------------------
  it('delete button has correct data-testid per row id', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [salesRow({ id: 'my-price-row' })] } },
    });

    renderBar();

    await screen.findByTestId('price-delete-my-price-row');
    expect(screen.getByTestId('price-delete-my-price-row')).toBeInTheDocument();
  });
});
