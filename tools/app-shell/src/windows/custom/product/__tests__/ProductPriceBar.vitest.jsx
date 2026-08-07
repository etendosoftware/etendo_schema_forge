import { render, screen, waitFor, act, within } from '@testing-library/react';
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

// The render tree pulls in the shared Dialog (via InlineCreateModal) which imports
// the `X` icon, plus ChevronDown/Loader2 (via CreatableSearchSelect). Return a stub
// for ANY icon name so every icon in the tree resolves. A few well-known icons keep
// the stable test-ids the existing assertions rely on.
vi.mock('lucide-react', () => {
  const named = {
    Loader2: (props) => <span {...props} data-testid="loader" />,
    Minus: (props) => <span {...props} data-testid="minus-icon" />,
    Plus: (props) => <span {...props} data-testid="plus-icon" />,
    Trash2: (props) => <span {...props} data-testid="trash-icon" />,
  };
  const isReserved = (prop) =>
    typeof prop !== 'string' || prop === 'then' || prop === '__esModule';
  return new Proxy(named, {
    // Vitest's mocker throws on `prop in module` for unknown exports, so claim
    // every (non-reserved) icon name exists and synthesize a stub in `get`.
    has(target, prop) {
      if (Reflect.has(target, prop)) return true;
      return !isReserved(prop);
    },
    get(target, prop) {
      if (Reflect.has(target, prop)) return Reflect.get(target, prop);
      // Guard interop/thenable probes so the mocked module is not treated as a promise.
      if (isReserved(prop)) return undefined;
      return (props) => <span {...props} data-testid={`icon-${prop}`} />;
    },
  });
});

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
 * NOTE: keys are evaluated in insertion order — register more specific
 * patterns (e.g. 'POST /price-list/priceList') BEFORE looser ones
 * (e.g. 'POST /price') so the specific route wins.
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

/**
 * The add action reuses the shared AddLineButton, whose own data-testid
 * (`action-add-line`) is not unique in this window, so the component is wrapped in a
 * `price-add-tariff` span. Clicks must land on the real <button> inside it.
 */
function addTariffButton() {
  return within(screen.getByTestId('price-add-tariff')).getByRole('button');
}

/**
 * Reveal the CreatableSearchSelect and open its dropdown.
 * Clicking the "+ add tariff" link sets adding=true (renders the selector);
 * focusing the text input opens the dropdown (options + create action).
 */
async function openTariffSelect(user) {
  await waitFor(() => expect(screen.getByTestId('price-add-tariff')).toBeInTheDocument());
  await user.click(addTariffButton());
  const input = await screen.findByTestId('field-priceListVersion');
  await user.click(input);
  return input;
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

    await waitFor(() => {
      expect(screen.getByTestId('price-tab-sales')).toBeInTheDocument();
    });
    expect(screen.getByTestId('price-tab-purchase')).toBeInTheDocument();

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('priceSalesListsTitle');
  });

  // -----------------------------------------------------------------------
  // 2. Save-first message when no id
  // -----------------------------------------------------------------------
  it('shows save-first message when data has no id', () => {
    renderBar({ data: {} });
    expect(screen.getByText('saveProductFirstPricing')).toBeInTheDocument();
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
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders price stepper inputs for a sales row', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [salesRow()] } },
    });

    renderBar();

    await screen.findByDisplayValue('Sales List v1');
    const spinbuttons = screen.getAllByRole('spinbutton');
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
    await user.click(spinbuttons[0]);
    await user.tab();

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

    await waitFor(() => {
      const gets = calls.filter((c) => c.method === 'GET' && c.url.includes('/price?parentId='));
      expect(gets.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('delete button has correct data-testid per row id', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [salesRow({ id: 'my-price-row' })] } },
    });

    renderBar();

    await screen.findByTestId('price-delete-my-price-row');
    expect(screen.getByTestId('price-delete-my-price-row')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // 7. Add tariff — CreatableSearchSelect filtered to the active section
  // -----------------------------------------------------------------------
  it('"Add new tariff" reveals selector with only sales options when in sales section', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [] } },
    });

    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await openTariffSelect(user);

    await screen.findByTestId(`option-priceListVersion-${SALES_PLV_ID}`);
    expect(
      screen.queryByTestId(`option-priceListVersion-${PURCHASE_PLV_ID}`),
    ).not.toBeInTheDocument();
  });

  it('"Add new tariff" in purchase section shows only purchase options', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [] } },
    });

    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await waitFor(() => expect(screen.getByTestId('price-tab-purchase')).toBeInTheDocument());
    await user.click(screen.getByTestId('price-tab-purchase'));

    await openTariffSelect(user);

    await screen.findByTestId(`option-priceListVersion-${PURCHASE_PLV_ID}`);
    expect(
      screen.queryByTestId(`option-priceListVersion-${SALES_PLV_ID}`),
    ).not.toBeInTheDocument();
  });

  it('selecting an existing option fires POST /price with correct priceListVersion', async () => {
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

    await openTariffSelect(user);

    const option = await screen.findByTestId(`option-priceListVersion-${SALES_PLV_ID}`);
    await user.click(option);

    await waitFor(() => {
      const posts = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/price'));
      expect(posts).toHaveLength(1);
    });

    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/price'));
    const body = JSON.parse(post.body);
    expect(body.priceListVersion).toBe(SALES_PLV_ID);
    expect(body.standardPrice).toBe('0');
    expect(body.listPrice).toBe('0');
    expect(body.priceLimit).toBe('0');
  });

  // -----------------------------------------------------------------------
  // 8. Inline create-tariff flow
  // -----------------------------------------------------------------------
  it('clicking the create action opens the inline-create modal', async () => {
    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await openTariffSelect(user);

    const createAction = await screen.findByTestId('action-create-priceListVersion');
    await user.click(createAction);

    await screen.findByTestId('inline-create-modal');
    expect(screen.getByTestId('inline-create-name')).toBeInTheDocument();
  });

  it('creating a tariff in the sales section POSTs a sales price list then links it via POST /price', async () => {
    const calls = [];
    global.fetch = buildFetch(
      {
        'GET /price?parentId=': { response: { data: [] } },
        'POST /price-list/priceList': {
          response: { data: [{ id: 'PL1', priceListVersion: 'PLV1' }] },
        },
        'POST /price': { response: { data: [] } },
      },
      calls,
    );

    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await openTariffSelect(user);

    await user.click(await screen.findByTestId('action-create-priceListVersion'));
    await screen.findByTestId('inline-create-modal');

    await user.type(screen.getByTestId('inline-create-name'), 'My Tariff');
    await user.click(screen.getByTestId('inline-create-submit'));

    // 1. Price-list create POST with the correct spec-swapped URL + body.
    await waitFor(() => {
      const creates = calls.filter(
        (c) => c.method === 'POST' && c.url.includes('/price-list/priceList'),
      );
      expect(creates).toHaveLength(1);
    });

    const create = calls.find(
      (c) => c.method === 'POST' && c.url.includes('/price-list/priceList'),
    );
    // apiBaseUrl '/api/product' → spec segment swapped to '/api/price-list/priceList'.
    expect(create.url).toBe('/api/price-list/priceList');
    const createBody = JSON.parse(create.body);
    expect(createBody.name).toBe('My Tariff');
    expect(createBody.salesPriceList).toBe(true);
    expect(createBody.costBasedPriceList).toBe(false);
    expect(createBody.priceIncludesTax).toBe(false);
    expect(createBody.default).toBe(false);
    // Currency is injected by the backend from the org — never sent.
    expect(createBody).not.toHaveProperty('currency');

    // 2. Follow-up POST /price links the auto-created version to the product.
    await waitFor(() => {
      const adds = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/price'));
      expect(adds.length).toBeGreaterThanOrEqual(1);
    });
    const add = calls.find((c) => c.method === 'POST' && c.url.endsWith('/price'));
    const addBody = JSON.parse(add.body);
    expect(addBody.priceListVersion).toBe('PLV1');

    // 3. refreshPrices re-fetches the list (initial + post-add).
    await waitFor(() => {
      const gets = calls.filter((c) => c.method === 'GET' && c.url.includes('/price?parentId='));
      expect(gets.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('creating a tariff in the purchase section POSTs a purchase price list (salesPriceList=false)', async () => {
    const calls = [];
    global.fetch = buildFetch(
      {
        'GET /price?parentId=': { response: { data: [] } },
        'POST /price-list/priceList': {
          response: { data: [{ id: 'PL2', priceListVersion: 'PLV2' }] },
        },
        'POST /price': { response: { data: [] } },
      },
      calls,
    );

    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await waitFor(() => expect(screen.getByTestId('price-tab-purchase')).toBeInTheDocument());
    await user.click(screen.getByTestId('price-tab-purchase'));

    await openTariffSelect(user);

    await user.click(await screen.findByTestId('action-create-priceListVersion'));
    await screen.findByTestId('inline-create-modal');

    await user.type(screen.getByTestId('inline-create-name'), 'Compra 2026');
    await user.click(screen.getByTestId('inline-create-submit'));

    await waitFor(() => {
      const creates = calls.filter(
        (c) => c.method === 'POST' && c.url.includes('/price-list/priceList'),
      );
      expect(creates).toHaveLength(1);
    });

    const create = calls.find(
      (c) => c.method === 'POST' && c.url.includes('/price-list/priceList'),
    );
    const createBody = JSON.parse(create.body);
    expect(createBody.salesPriceList).toBe(false);
    expect(createBody).not.toHaveProperty('currency');

    const add = calls.find((c) => c.method === 'POST' && c.url.endsWith('/price'));
    expect(JSON.parse(add.body).priceListVersion).toBe('PLV2');
  });

  it('a failed price-list create surfaces an error and keeps the modal open without POSTing /price', async () => {
    const calls = [];
    global.fetch = buildFetch(
      {
        'GET /price?parentId=': { response: { data: [] } },
        'POST /price-list/priceList': {
          ok: false,
          status: 400,
          body: { error: { message: 'Nombre duplicado' } },
        },
        'POST /price': { response: { data: [] } },
      },
      calls,
    );

    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await openTariffSelect(user);

    await user.click(await screen.findByTestId('action-create-priceListVersion'));
    await screen.findByTestId('inline-create-modal');

    await user.type(screen.getByTestId('inline-create-name'), 'Dup');
    await user.click(screen.getByTestId('inline-create-submit'));

    // Error surfaces inside the still-open modal.
    await screen.findByText('Nombre duplicado');
    expect(screen.getByTestId('inline-create-modal')).toBeInTheDocument();

    // The create failed → no product price row was added.
    await new Promise((r) => setTimeout(r, 50));
    const adds = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/price'));
    expect(adds).toHaveLength(0);
  });

  // -----------------------------------------------------------------------
  // 9. onCountChange called with row count
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
    await user.click(addTariffButton());

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
    await user.click(addTariffButton());

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
    expect(screen.getByText('1')).toBeInTheDocument();

    await user.click(screen.getByTestId('price-tab-purchase'));
    await screen.findByDisplayValue('Purchase List v1');
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Add-tariff row — full row (selector + unit/list steppers + cancel)
  // -----------------------------------------------------------------------
  it('the add-tariff row renders the two price steppers, the selector and a cancel button', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [] } },
    });

    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await waitFor(() => expect(screen.getByTestId('price-add-tariff')).toBeInTheDocument());
    await user.click(addTariffButton());

    const row = await screen.findByTestId('price-add-tariff-row');
    // Name selector + unit-price stepper + list-price stepper + cancel button.
    expect(within(row).getByTestId('field-priceListVersion')).toBeInTheDocument();
    expect(within(row).getAllByRole('spinbutton')).toHaveLength(2);
    expect(within(row).getByTestId('price-add-cancel')).toBeInTheDocument();
  });

  it('clicking the cancel button exits add mode and fires no POST /price', async () => {
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
    await user.click(addTariffButton());

    await screen.findByTestId('price-add-tariff-row');
    await user.click(screen.getByTestId('price-add-cancel'));

    // The add row is gone and the "+ add tariff" link is back.
    await waitFor(() => {
      expect(screen.queryByTestId('price-add-tariff-row')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('price-add-tariff')).toBeInTheDocument();

    // Cancelling never persists anything.
    const posts = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/price'));
    expect(posts).toHaveLength(0);
  });

  it('prices entered in the add row are sent on selecting an existing option', async () => {
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
    await user.click(addTariffButton());

    // No saved rows in this section, so the only steppers are the add-row drafts:
    // [0] = unit price, [1] = list price. Each commits on blur.
    const spinbuttons = screen.getAllByRole('spinbutton');
    await user.clear(spinbuttons[0]);
    await user.type(spinbuttons[0], '15');
    await user.tab();
    await user.clear(spinbuttons[1]);
    await user.type(spinbuttons[1], '20');
    await user.tab();

    // Re-open the dropdown and pick an existing tariff.
    await user.click(screen.getByTestId('field-priceListVersion'));
    const option = await screen.findByTestId(`option-priceListVersion-${SALES_PLV_ID}`);
    await user.click(option);

    await waitFor(() => {
      const posts = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/price'));
      expect(posts).toHaveLength(1);
    });

    const post = calls.find((c) => c.method === 'POST' && c.url.endsWith('/price'));
    const body = JSON.parse(post.body);
    expect(body.priceListVersion).toBe(SALES_PLV_ID);
    expect(body.standardPrice).toBe('15');
    expect(body.listPrice).toBe('20');
    // priceLimit = list || unit → the entered list price.
    expect(body.priceLimit).toBe('20');
  });

  it('prices entered in the add row are sent on creating a new tariff', async () => {
    const calls = [];
    global.fetch = buildFetch(
      {
        'GET /price?parentId=': { response: { data: [] } },
        'POST /price-list/priceList': {
          response: { data: [{ id: 'PL1', priceListVersion: 'PLV1' }] },
        },
        'POST /price': { response: { data: [] } },
      },
      calls,
    );

    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await waitFor(() => expect(screen.getByTestId('price-add-tariff')).toBeInTheDocument());
    await user.click(addTariffButton());

    const spinbuttons = screen.getAllByRole('spinbutton');
    await user.clear(spinbuttons[0]);
    await user.type(spinbuttons[0], '15');
    await user.tab();
    await user.clear(spinbuttons[1]);
    await user.type(spinbuttons[1], '20');
    await user.tab();

    // Re-open the dropdown and create a tariff via the inline modal.
    await user.click(screen.getByTestId('field-priceListVersion'));
    await user.click(await screen.findByTestId('action-create-priceListVersion'));
    await screen.findByTestId('inline-create-modal');

    await user.type(screen.getByTestId('inline-create-name'), 'My Tariff');
    await user.click(screen.getByTestId('inline-create-submit'));

    await waitFor(() => {
      const adds = calls.filter((c) => c.method === 'POST' && c.url.endsWith('/price'));
      expect(adds).toHaveLength(1);
    });

    const add = calls.find((c) => c.method === 'POST' && c.url.endsWith('/price'));
    const body = JSON.parse(add.body);
    expect(body.priceListVersion).toBe('PLV1');
    expect(body.standardPrice).toBe('15');
    expect(body.listPrice).toBe('20');
    expect(body.priceLimit).toBe('20');
  });

  // -----------------------------------------------------------------------
  // Tariff name vs. version name (the user picks a TARIFF, so the price list
  // name wins over the version name — they differ for the onboarding-created
  // lists: "Lista de venta (sin impuestos)" vs "Version Lista de venta (...)").
  // -----------------------------------------------------------------------
  it('a row shows the tariff name, not the version name', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': {
        response: {
          data: [salesRow({
            'priceListVersion$_identifier': 'Version Lista de venta (sin impuestos)',
            'priceList$_identifier': 'Lista de venta (sin impuestos)',
          })],
        },
      },
    });

    renderBar();

    await screen.findByDisplayValue('Lista de venta (sin impuestos)');
    expect(
      screen.queryByDisplayValue('Version Lista de venta (sin impuestos)'),
    ).not.toBeInTheDocument();
  });

  it('falls back to the version name when the row carries no tariff name', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [salesRow()] } },
    });

    renderBar();

    await screen.findByDisplayValue('Sales List v1');
  });

  it('selector options show the tariff name, not the version name', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [] } },
      'GET /price/selectors/M_PriceList_Version_ID': {
        items: [{
          id: SALES_PLV_ID,
          label: 'Version Lista de venta (sin impuestos)',
          name: 'Version Lista de venta (sin impuestos)',
          'priceList$_identifier': 'Lista de venta (sin impuestos)',
          salesPriceList: true,
        }],
      },
    });

    const user = userEvent.setup();
    renderBar({ api: apiWithPriceSelector() });

    await openTariffSelect(user);

    const option = await screen.findByTestId(`option-priceListVersion-${SALES_PLV_ID}`);
    expect(option).toHaveTextContent('Lista de venta (sin impuestos)');
    expect(option).not.toHaveTextContent('Version Lista de venta');
  });

  // -----------------------------------------------------------------------
  // Already-priced tariffs are excluded from the selector
  // -----------------------------------------------------------------------
  it('excludes a tariff that already has a price for this product', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [salesRow()] } },
    });

    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await screen.findByDisplayValue('Sales List v1');
    await openTariffSelect(user);

    // SALES_PLV_ID is already priced (salesRow), so it must not be offered.
    expect(
      screen.queryByTestId(`option-priceListVersion-${SALES_PLV_ID}`),
    ).not.toBeInTheDocument();
  });

  it('shows the "all tariffs already priced" hint when no option is left', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [salesRow()] } },
    });

    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await screen.findByDisplayValue('Sales List v1');
    await openTariffSelect(user);

    const hint = await screen.findByTestId('price-no-available-tariffs');
    expect(hint).toHaveTextContent('priceAllSalesTariffsAssigned');
  });

  it('does NOT show the hint while options are still available', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [] } },
    });

    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await openTariffSelect(user);

    await screen.findByTestId(`option-priceListVersion-${SALES_PLV_ID}`);
    expect(screen.queryByTestId('price-no-available-tariffs')).not.toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // Option list freshness — a fetch-once cache left tariffs created during the
  // session permanently out of the selector (so deleting their price could
  // never bring them back).
  // -----------------------------------------------------------------------
  it('re-fetches the selector options every time the add row is opened', async () => {
    const calls = [];
    global.fetch = buildFetch(
      {
        'GET /price?parentId=': { response: { data: [] } },
        'GET /price/selectors/M_PriceList_Version_ID': {
          items: [{ id: SALES_PLV_ID, label: 'Sales PLV', salesPriceList: true }],
        },
      },
      calls,
    );

    const user = userEvent.setup();
    renderBar({ api: apiWithPriceSelector() });

    await openTariffSelect(user);
    await waitFor(() => {
      expect(calls.filter((c) => c.url.includes('/price/selectors/'))).toHaveLength(1);
    });

    await user.click(screen.getByTestId('price-add-cancel'));
    await screen.findByTestId('price-add-tariff');
    await user.click(addTariffButton());

    await waitFor(() => {
      expect(calls.filter((c) => c.url.includes('/price/selectors/')).length).toBeGreaterThanOrEqual(2);
    });
  });

  it('offers a tariff that appeared after the first add-row session', async () => {
    let selectorItems = [];
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [] } },
      'GET /price/selectors/M_PriceList_Version_ID': () => ({ items: selectorItems }),
    });

    const user = userEvent.setup();
    renderBar({ api: apiWithPriceSelector() });

    await openTariffSelect(user);
    await screen.findByTestId('price-no-available-tariffs');

    // A tariff shows up between sessions (created via "+ Create tariff", or in
    // another tab, or freed up by deleting its price).
    selectorItems = [{
      id: SALES_PLV_ID,
      label: 'Sales PLV',
      'priceList$_identifier': 'Sales PLV',
      salesPriceList: true,
    }];

    await user.click(screen.getByTestId('price-add-cancel'));
    await screen.findByTestId('price-add-tariff');
    await user.click(addTariffButton());
    await user.click(await screen.findByTestId('field-priceListVersion'));

    await screen.findByTestId(`option-priceListVersion-${SALES_PLV_ID}`);
  });

  it('asks the server for more than its default page of options', async () => {
    const calls = [];
    global.fetch = buildFetch(
      {
        'GET /price?parentId=': { response: { data: [] } },
        'GET /price/selectors/M_PriceList_Version_ID': { items: [] },
      },
      calls,
    );

    const user = userEvent.setup();
    renderBar({ api: apiWithPriceSelector() });

    await waitFor(() => expect(screen.getByTestId('price-add-tariff')).toBeInTheDocument());
    await user.click(addTariffButton());

    await waitFor(() => {
      const selectorCall = calls.find((c) => c.url.includes('/price/selectors/'));
      expect(selectorCall?.url).toContain('limit=');
    });
  });

  // -----------------------------------------------------------------------
  // Layout — the add action lives in the section header and the add row opens
  // at the TOP of the list, so both stay put however many tariffs exist. The
  // section itself never scrolls: the detail content column does.
  // -----------------------------------------------------------------------
  it('renders every row without an inner scroll container', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': {
        response: { data: [salesRow(), salesRow({ id: 'price-s2', priceListVersion: 'plv-sales-2' })] },
      },
    });

    const { container } = renderBar();

    await screen.findByTestId('price-delete-price-s1');
    expect(screen.getAllByTestId(/^price-delete-/)).toHaveLength(2);
    expect(container.querySelector('[class*="overflow-y-auto"]')).toBeNull();
    expect(container.querySelector('[class*="max-h-"]')).toBeNull();
  });

  it('puts the add action in the section header, aligned over the list-price column', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [salesRow()] } },
    });

    renderBar();

    const header = await screen.findByTestId('price-section-header');
    expect(within(header).getByRole('heading', { level: 3 })).toBeInTheDocument();
    const wrapper = within(header).getByTestId('price-add-tariff');
    // Same column grid as the rows: title box, then the unit-price slot, then the
    // list-price slot which holds the action, right-aligned so its right edge matches
    // the right edge of the list-price steppers below.
    expect(wrapper.parentElement.className).toContain('w-[201px]');
    expect(wrapper.parentElement.className).toContain('justify-end');
    expect(header.children).toHaveLength(3);
  });

  it('opens the add row above the existing rows', async () => {
    global.fetch = buildFetch({
      'GET /price?parentId=': { response: { data: [salesRow()] } },
    });

    const user = userEvent.setup();
    renderBar({ catalogs: catalogsWithPlv(), api: apiWithPriceSelector() });

    await screen.findByTestId('price-delete-price-s1');
    await user.click(addTariffButton());

    const addRow = await screen.findByTestId('price-add-tariff-row');
    const firstRow = screen.getByTestId('price-delete-price-s1');
    // Node.DOCUMENT_POSITION_FOLLOWING (4) => addRow comes before firstRow.
    expect(addRow.compareDocumentPosition(firstRow) & 4).toBeTruthy();
  });
});
