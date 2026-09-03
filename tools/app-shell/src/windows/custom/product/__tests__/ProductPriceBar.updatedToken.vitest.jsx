// ETP-5112 regression (bug 1) — ProductPriceBar's inline price edit must send the row's
// `updated` optimistic-locking token.
//
// ETP-5073 made the backend require the token of the record AS IT WAS READ; only
// `useEntity` remembered one, so every panel that reads with `apiFetch` directly — this one
// — patched without it and the server answered 400 `missing_updated`. The fix is central,
// in `@etendosoftware/app-shell-core` (`auth/api.js` harvests the token from every GET,
// keyed by entity AND id, and injects it into the PUT/PATCH that follows), so NOTHING in
// this screen changed. What this test pins is the screen's half of that contract: it reads
// its rows through `apiFetch` at a path whose (entity, id) matches the write, which is the
// only reason the injection has anything to inject.
//
// The real `createApiFetch` is deliberately NOT stubbed here — see `@/test/realApiFetch.js`
// for why a `useApiFetch` double would make this test vacuous.

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  neoResponse, bodyOf, writeCalls, resetRecordVersionsForTests,
} from '@/test/realApiFetch.js';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));

// Stub every icon the tree pulls in (shared Dialog, CreatableSearchSelect, the steppers).
vi.mock('lucide-react', () => {
  const isReserved = (prop) => typeof prop !== 'string' || prop === 'then' || prop === '__esModule';
  return new Proxy({}, {
    has: (_t, prop) => !isReserved(prop),
    get: (_t, prop) => (isReserved(prop) ? undefined : (props) => <span {...props} />),
  });
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import ProductPriceBar from '../ProductPriceBar.jsx';

const ROW_ID = 'price-s1';
// Deliberately not date-shaped: the client must forward whatever opaque string the read
// returned, and a crossed or invented token has to be obvious in the failure output.
const ROW_TOKEN = 'PRICE-ROW-TOKEN-0001';

function salesRow(overrides = {}) {
  return {
    id: ROW_ID,
    standardPrice: 23,
    listPrice: 25,
    priceListVersion: 'plv-sales-1',
    'priceListVersion$_identifier': 'Sales List v1',
    'priceListVersion$salesPriceList': true,
    updated: ROW_TOKEN,
    ...overrides,
  };
}

function installFetch(rows) {
  globalThis.fetch = vi.fn((url, init = {}) => {
    const method = String(init.method || 'GET').toUpperCase();
    if (method === 'GET' && url.includes('/price?parentId=')) return Promise.resolve(neoResponse(rows));
    if (method === 'PATCH' && url.includes(`/price/${ROW_ID}`)) return Promise.resolve(neoResponse([]));
    return Promise.resolve(neoResponse([]));
  });
  return globalThis.fetch;
}

function renderBar(overrides = {}) {
  return render(
    <ProductPriceBar
      data={{ id: 'prod-1' }}
      token="tok"
      apiBaseUrl="/api/product"
      catalogs={{}}
      api={{ selectors: [] }}
      onCountChange={vi.fn()}
      {...overrides} />,
  );
}

beforeEach(() => {
  // The version cache is module-global in the core helper; without this a token remembered
  // by one test could make the next one pass for the wrong reason.
  resetRecordVersionsForTests();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProductPriceBar — updated token (ETP-5112)', () => {
  it('sends the row updated token it read, on the inline price PATCH', async () => {
    const fetchMock = installFetch([salesRow({ standardPrice: 10 })]);
    const user = userEvent.setup();
    renderBar();

    await screen.findByDisplayValue('Sales List v1');

    const spinbuttons = screen.getAllByRole('spinbutton');
    await user.clear(spinbuttons[0]);
    await user.type(spinbuttons[0], '99');
    await user.tab();

    await waitFor(() => expect(writeCalls(fetchMock)).toHaveLength(1));

    const body = bodyOf(writeCalls(fetchMock)[0]);
    expect(body.updated).toBe(ROW_TOKEN);
    // The field being edited still goes out — the injection adds to the body, never replaces it.
    expect(body).toHaveProperty('standardPrice');
  });

  it('picks the token of the row actually edited, not of the first row in the list', async () => {
    const otherRow = salesRow({
      id: 'price-s0',
      updated: 'OTHER-ROW-TOKEN',
      'priceListVersion$_identifier': 'Sales List v0',
      priceListVersion: 'plv-sales-0',
    });
    const fetchMock = installFetch([otherRow, salesRow({ standardPrice: 10 })]);
    const user = userEvent.setup();
    renderBar();

    await screen.findByDisplayValue('Sales List v1');

    // Rows render in list order, and each row contributes two spinbuttons (unit, list
    // price) — index 2 is the SECOND row's unit price.
    const spinbuttons = screen.getAllByRole('spinbutton');
    await user.clear(spinbuttons[2]);
    await user.type(spinbuttons[2], '77');
    await user.tab();

    await waitFor(() => expect(writeCalls(fetchMock)).toHaveLength(1));

    const [call] = writeCalls(fetchMock);
    expect(call[0]).toContain(`/price/${ROW_ID}`);
    expect(bodyOf(call).updated).toBe(ROW_TOKEN);
  });
});
