// ETP-5255 class C — ProductPriceBar renders TWO PriceStepper instances per price row
// (standardPrice and listPrice), both writing PATCH /price/{row.id}. Before the fix, each
// stepper only deduplicated against its OWN last committed value, so it could not see its
// sibling: stepping (or blurring) one and then the other sent two PATCHes carrying the SAME
// optimistic-locking `updated` token, and the server refused the second as a false 409. This
// test holds the first PATCH open with a controllable deferred (not a timer) to make the
// overlap deterministic, then asserts the write queue serializes it per ROW.

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

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
    has(target, prop) {
      if (Reflect.has(target, prop)) return true;
      return !isReserved(prop);
    },
    get(target, prop) {
      if (Reflect.has(target, prop)) return Reflect.get(target, prop);
      if (isReserved(prop)) return undefined;
      return (props) => <span {...props} data-testid={`icon-${prop}`} />;
    },
  });
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import ProductPriceBar from '../ProductPriceBar.jsx';

const ROW = {
  id: 'price-1',
  standardPrice: 100,
  listPrice: 120,
  priceListVersion: 'plv-1',
  'priceListVersion$_identifier': 'Tariff A',
  'priceListVersion$salesPriceList': true,
};

const ROW_2 = {
  id: 'price-2',
  standardPrice: 200,
  listPrice: 220,
  priceListVersion: 'plv-2',
  'priceListVersion$_identifier': 'Tariff B',
  'priceListVersion$salesPriceList': true,
};

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

/** GET /price resolves immediately with `rows`; PATCH /price/{id} is held open until released. */
function installControllablePatchFetch(rows) {
  const patches = [];
  const fetchMock = vi.fn((url, opts = {}) => {
    if ((opts.method || 'GET').toUpperCase() === 'PATCH') {
      const d = deferred();
      patches.push(d);
      return d.promise;
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ response: { data: rows } }) });
  });
  global.fetch = fetchMock;
  return { fetchMock, patches };
}

function patchCallCount(fetchMock) {
  return fetchMock.mock.calls.filter(([, opts]) => (opts?.method || '').toUpperCase() === 'PATCH').length;
}

function renderBar() {
  return render(
    <ProductPriceBar
      data={{ id: 'prod-1' }}
      token="tok"
      apiBaseUrl="/api/product"
      catalogs={{}}
      api={{ selectors: [] }}
      onCountChange={vi.fn()}
    />,
  );
}

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProductPriceBar — single-flight write queue per price row (ETP-5255)', () => {
  it('committing standardPrice then listPrice on the same row never sends two overlapping PATCHes', async () => {
    const { fetchMock, patches } = installControllablePatchFetch([ROW]);
    renderBar();
    // The tariff name renders as a read-only input value, not a text node.
    await waitFor(() => expect(screen.getByDisplayValue('Tariff A')).toBeInTheDocument());

    // ETP-5283 (merge block): ETP-5107 replaced the stepper's native
    // `<input type="number">` with a bare MaskedAmountInput (type="text", role
    // textbox), so the `spinbutton` role this test was written against no
    // longer exists. Queried by the same stable data-testid the ETP-5107 suite
    // uses. What is under test here is unchanged — the per-ROW write queue, not
    // the input widget.
    const priceInputs = screen.getAllByTestId('PriceStepperInput__d76b90');
    expect(priceInputs).toHaveLength(2); // standardPrice, then listPrice
    const [standardPriceInput, listPriceInput] = priceInputs;

    // Commit standardPrice via blur — synchronous, no debounce involved.
    fireEvent.change(standardPriceInput, { target: { value: '150' } });
    fireEvent.blur(standardPriceInput);
    await waitFor(() => expect(patchCallCount(fetchMock)).toBe(1));

    // Commit listPrice on the SAME row while the first PATCH is still open.
    fireEvent.change(listPriceInput, { target: { value: '180' } });
    fireEvent.blur(listPriceInput);

    // Must be queued, not a second concurrent PATCH — both fields share the row's single token.
    expect(patchCallCount(fetchMock)).toBe(1);
    expect(patches).toHaveLength(1);

    patches[0].resolve({ ok: true });
    await waitFor(() => expect(patchCallCount(fetchMock)).toBe(2));

    const secondPatchBody = JSON.parse(
      fetchMock.mock.calls.filter(([, o]) => (o?.method || '').toUpperCase() === 'PATCH')[1][1].body,
    );
    expect(secondPatchBody).toEqual({ listPrice: '180' });

    patches[1].resolve({ ok: true });
    await waitFor(() => expect(patchCallCount(fetchMock)).toBe(2)); // nothing left queued
  });
});
