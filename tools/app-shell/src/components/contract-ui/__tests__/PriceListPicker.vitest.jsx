// Mocks BEFORE imports
// ETP-5022 — the hook's requests now come from `useApiFetch`, which reads the bearer
// token from the session instead of from the `headers` prop.
vi.mock('@etendosoftware/app-shell-core/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  useAuthOptional: () => ({ token: 'test-token' }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => {
    if (vars) return key.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
    return key;
  },
}));

// ETP-5410 follow-up: PriceListSelectField no longer wraps Radix Select — it renders the
// REAL CreatableSearchSelect (same searchable, clearable FK-picker component the generated
// "Tarifa" field already uses on the real Factura de Venta form, and the one
// NewPaymentEntryModal already uses for its own staticOptions pickers). buildUrlWithParams is
// stubbed the same way CreatableSearchSelect's own test suite stubs it — irrelevant in
// staticOptions mode (no selectorUrl fetch happens), but keeps the import resolvable.
vi.mock('@/lib/buildUrlWithParams.js', () => ({
  buildUrlWithParams: (url) => url,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  usePriceListPicker,
  PriceListSelectField,
} from '@/components/contract-ui/PriceListPicker';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makePriceList(overrides = {}) {
  return {
    id: 'pl-1',
    name: 'General Sales Price List',
    active: true,
    salesPriceList: true,
    default: false,
    ...overrides,
  };
}

function mockPriceListFetch(priceLists) {
  vi.stubGlobal('fetch', vi.fn((url) => {
    if (String(url).includes('/price-list/priceList')) {
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: priceLists } }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) });
  }));
}

const HEADERS = { Authorization: 'Bearer test-token', 'Accept-Language': 'es_ES' };
const BASE = '/sws/neo/goods-shipment';

// ── usePriceListPicker ────────────────────────────────────────────────────────

describe('usePriceListPicker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not fetch when enabled is false', async () => {
    mockPriceListFetch([makePriceList()]);
    renderHook(() => usePriceListPicker({ enabled: false, base: BASE, headers: HEADERS }));
    await act(async () => {});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when base is falsy even if enabled is true', async () => {
    mockPriceListFetch([makePriceList()]);
    renderHook(() => usePriceListPicker({ enabled: true, base: '', headers: HEADERS }));
    await act(async () => {});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('starts with loading=false when enabled is false', () => {
    mockPriceListFetch([]);
    const { result } = renderHook(() => usePriceListPicker({ enabled: false, base: BASE, headers: HEADERS }));
    expect(result.current.loading).toBe(false);
  });

  it('fetches `${base}/price-list/priceList` with pagination params and the auth header', async () => {
    mockPriceListFetch([makePriceList()]);
    renderHook(() => usePriceListPicker({ enabled: true, base: BASE, headers: HEADERS }));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `${BASE}/price-list/priceList?_startRow=0&_endRow=200`,
        { headers: HEADERS, credentials: 'include' },
      );
    });
  });

  it('filters out inactive price lists', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'active-1', active: true }),
      makePriceList({ id: 'inactive-1', active: false }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE, headers: HEADERS }));
    await waitFor(() => {
      expect(result.current.priceLists.map(p => p.id)).toEqual(['active-1']);
    });
  });

  it('filters price lists by salesPriceList matching isSOTrx (sales)', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'sales-1', salesPriceList: true }),
      makePriceList({ id: 'purchase-1', salesPriceList: false }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE, headers: HEADERS }));
    await waitFor(() => {
      expect(result.current.priceLists.map(p => p.id)).toEqual(['sales-1']);
    });
  });

  it('filters price lists by salesPriceList matching isSOTrx (purchase)', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'sales-1', salesPriceList: true }),
      makePriceList({ id: 'purchase-1', salesPriceList: false }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, isSOTrx: false, base: BASE, headers: HEADERS }));
    await waitFor(() => {
      expect(result.current.priceLists.map(p => p.id)).toEqual(['purchase-1']);
    });
  });

  it('defaults isSOTrx to true (sales) when the option is omitted entirely', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'sales-1', salesPriceList: true }),
      makePriceList({ id: 'purchase-1', salesPriceList: false }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, base: BASE, headers: HEADERS }));
    await waitFor(() => {
      expect(result.current.priceLists.map(p => p.id)).toEqual(['sales-1']);
    });
  });

  it('auto-selects the price list flagged as default', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'pl-a', default: false }),
      makePriceList({ id: 'pl-b', default: true }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE, headers: HEADERS }));
    await waitFor(() => {
      expect(result.current.priceListId).toBe('pl-b');
    });
  });

  it('falls back to the first matching price list when none is flagged default', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'pl-a', default: false }),
      makePriceList({ id: 'pl-b', default: false }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE, headers: HEADERS }));
    await waitFor(() => {
      expect(result.current.priceListId).toBe('pl-a');
    });
  });

  it('leaves priceListId empty and priceLists empty when the response has no matches', async () => {
    mockPriceListFetch([]);
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE, headers: HEADERS }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.priceLists).toEqual([]);
    expect(result.current.priceListId).toBe('');
  });

  it('sets loading=false and leaves priceLists empty when the fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network'))));
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE, headers: HEADERS }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.priceLists).toEqual([]);
  });

  it('sets loading=false and leaves priceLists empty when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })));
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE, headers: HEADERS }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.priceLists).toEqual([]);
  });

  it('exposes setPriceListId so callers can override the user selection', async () => {
    mockPriceListFetch([makePriceList({ id: 'pl-a', default: true })]);
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE, headers: HEADERS }));
    await waitFor(() => {
      expect(result.current.priceListId).toBe('pl-a');
    });
    act(() => result.current.setPriceListId('pl-manual'));
    expect(result.current.priceListId).toBe('pl-manual');
  });

  // ── ETP-5052: defaultPriceListId (server-resolved tariff) ────────────────────
  // GoodsShipmentHeaderHandler#enrichResolvedPriceList resolves the tariff from the
  // linked sales order (or the Business Partner's own) and passes it through as
  // `defaultPriceListId`, which must win over the system `default` flag.

  it('auto-selects defaultPriceListId over the system-default flag when both are present in matches', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'pl-system-default', default: true }),
      makePriceList({ id: 'pl-resolved', default: false }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({
        enabled: true, isSOTrx: true, base: BASE, headers: HEADERS,
        defaultPriceListId: 'pl-resolved',
      }));
    await waitFor(() => {
      expect(result.current.priceListId).toBe('pl-resolved');
    });
  });

  it('falls back to the system-default flag when defaultPriceListId is not among the matches', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'pl-a', default: false }),
      makePriceList({ id: 'pl-system-default', default: true }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({
        enabled: true, isSOTrx: true, base: BASE, headers: HEADERS,
        // e.g. an inactive/wrong-direction price list already filtered out of `matches`
        defaultPriceListId: 'pl-inactive-or-missing',
      }));
    await waitFor(() => {
      expect(result.current.priceListId).toBe('pl-system-default');
    });
  });

  it('falls back to the first match when defaultPriceListId is absent from matches and none is flagged default', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'pl-a', default: false }),
      makePriceList({ id: 'pl-b', default: false }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({
        enabled: true, isSOTrx: true, base: BASE, headers: HEADERS,
        defaultPriceListId: 'pl-not-in-matches',
      }));
    await waitFor(() => {
      expect(result.current.priceListId).toBe('pl-a');
    });
  });

  it('preserves previous behavior (system-default flag wins) when defaultPriceListId is omitted', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'pl-a', default: false }),
      makePriceList({ id: 'pl-b', default: true }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE, headers: HEADERS }));
    await waitFor(() => {
      expect(result.current.priceListId).toBe('pl-b');
    });
  });

  it('preserves previous behavior (first match wins) when defaultPriceListId is undefined and none is flagged default', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'pl-a', default: false }),
      makePriceList({ id: 'pl-b', default: false }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({
        enabled: true, isSOTrx: true, base: BASE, headers: HEADERS, defaultPriceListId: undefined,
      }));
    await waitFor(() => {
      expect(result.current.priceListId).toBe('pl-a');
    });
  });

  it('does not override a manual user selection made after the initial auto-select (no re-render stomp)', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'pl-resolved', default: false }),
      makePriceList({ id: 'pl-other', default: false }),
    ]);
    const { result, rerender } = renderHook(
      (props) => usePriceListPicker(props),
      { initialProps: { enabled: true, isSOTrx: true, base: BASE, headers: HEADERS, defaultPriceListId: 'pl-resolved' } },
    );
    await waitFor(() => {
      expect(result.current.priceListId).toBe('pl-resolved');
    });

    act(() => result.current.setPriceListId('pl-other'));
    expect(result.current.priceListId).toBe('pl-other');

    // Re-render with the same props (as a parent component would on an unrelated
    // state change) must not re-run the fetch effect's auto-select and stomp the
    // user's manual choice back to pl-resolved.
    rerender({ enabled: true, isSOTrx: true, base: BASE, headers: HEADERS, defaultPriceListId: 'pl-resolved' });
    await act(async () => {});
    expect(result.current.priceListId).toBe('pl-other');
  });

  // ── ETP-4942 (round 3): allowGenericFallback ─────────────────────────────────
  // ConfirmInOutModal (no linked order) and CreateInvoiceConfirmModal pass
  // allowGenericFallback: false so a truly mandatory tariff field is never
  // silently satisfied by an arbitrary price list (system `default` flag or
  // simply the first entry) — the user must choose consciously instead.

  it('allowGenericFallback=false with no defaultPriceListId match leaves priceListId empty (no generic fallback applied)', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'pl-a', default: false }),
      makePriceList({ id: 'pl-b', default: true }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({
        enabled: true, isSOTrx: true, base: BASE, headers: HEADERS,
        allowGenericFallback: false,
      }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.priceListId).toBe('');
  });

  it('allowGenericFallback=true (or omitted, the default) preserves the previous default-then-first-match behavior', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'pl-a', default: false }),
      makePriceList({ id: 'pl-b', default: true }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({
        enabled: true, isSOTrx: true, base: BASE, headers: HEADERS,
        allowGenericFallback: true,
      }));
    await waitFor(() => {
      expect(result.current.priceListId).toBe('pl-b');
    });
  });

  it('a matching defaultPriceListId always wins first, regardless of allowGenericFallback=true', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'pl-resolved', default: false }),
      makePriceList({ id: 'pl-system-default', default: true }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({
        enabled: true, isSOTrx: true, base: BASE, headers: HEADERS,
        defaultPriceListId: 'pl-resolved', allowGenericFallback: true,
      }));
    await waitFor(() => {
      expect(result.current.priceListId).toBe('pl-resolved');
    });
  });

  it('a matching defaultPriceListId always wins first, regardless of allowGenericFallback=false', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'pl-resolved', default: false }),
      makePriceList({ id: 'pl-system-default', default: true }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({
        enabled: true, isSOTrx: true, base: BASE, headers: HEADERS,
        defaultPriceListId: 'pl-resolved', allowGenericFallback: false,
      }));
    await waitFor(() => {
      expect(result.current.priceListId).toBe('pl-resolved');
    });
  });
});

// ── PriceListSelectField ───────────────────────────────────────────────────────
// ETP-5410 follow-up: renders the REAL CreatableSearchSelect (not a Radix Select mock) —
// same component the generated "Tarifa" field uses on the real Factura de Venta form. Its
// own extensive test suite (CreatableSearchSelect*.vitest.jsx) covers the picker's internal
// search/dropdown/clear behavior; these tests only verify PriceListSelectField wires it
// correctly (staticOptions, value, displayValue, onChange, the loading skeleton, the label).

describe('PriceListSelectField', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  function renderField(props = {}) {
    const onChange = vi.fn();
    const defaults = {
      priceLists: [],
      priceListId: '',
      onChange,
      loading: false,
      idPrefix: 'test-price-list',
    };
    return { onChange, ...render(<PriceListSelectField {...defaults} {...props} />) };
  }

  it('renders the salesPriceListField label', () => {
    renderField();
    expect(screen.getByText('salesPriceListField')).toBeInTheDocument();
  });

  it('shows a skeleton placeholder instead of the picker while loading', () => {
    renderField({ loading: true });
    expect(screen.getByTestId('Skeleton__test-price-list')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('renders the real CreatableSearchSelect combobox once not loading, even with an empty list', () => {
    renderField({ loading: false, priceLists: [] });
    expect(screen.queryByTestId('Skeleton__test-price-list')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('opens to show an option per price list (staticOptions, no server fetch)', () => {
    renderField({
      loading: false,
      priceLists: [makePriceList({ id: 'pl-a', name: 'PL A' }), makePriceList({ id: 'pl-b', name: 'PL B' })],
    });
    fireEvent.focus(screen.getByTestId('field-test-price-list'));
    expect(screen.getByTestId('option-test-price-list-pl-a')).toHaveTextContent('PL A');
    expect(screen.getByTestId('option-test-price-list-pl-b')).toHaveTextContent('PL B');
  });

  it('falls back to the id as the option label when name is missing', () => {
    const { name: _name, ...noName } = makePriceList({ id: 'pl-noname' });
    renderField({ priceLists: [noName] });
    fireEvent.focus(screen.getByTestId('field-test-price-list'));
    expect(screen.getByTestId('option-test-price-list-pl-noname')).toHaveTextContent('pl-noname');
  });

  it('shows the current priceListId as a clearable chip (the "x" the generated Tarifa field also has)', () => {
    renderField({
      priceLists: [makePriceList({ id: 'pl-a', name: 'PL A' }), makePriceList({ id: 'pl-b', name: 'PL B' })],
      priceListId: 'pl-b',
    });
    // SelectorChip only wires up its `testId` prop to the DOM (`data-testid` is accepted by
    // CreatableSearchSelect's own JSX but never forwarded into SelectorChip) — this is the
    // real rendered id, `field-${field.key}-chip`.
    expect(screen.getByTestId('field-test-price-list-chip')).toHaveTextContent('PL B');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows the plain search input (no chip) when priceListId is blank', () => {
    renderField({ priceLists: [makePriceList({ id: 'pl-a' })], priceListId: '' });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryByTestId('field-test-price-list-chip')).not.toBeInTheDocument();
  });

  it('calls onChange with just the picked id — CreatableSearchSelect itself also passes a label and the raw option, but PriceListSelectField narrows to the single-id contract both usePriceListPicker callers (a plain setPriceListId) expect', () => {
    const { onChange } = renderField({
      priceLists: [makePriceList({ id: 'pl-a', name: 'PL A' }), makePriceList({ id: 'pl-b', name: 'PL B' })],
      priceListId: '',
    });
    fireEvent.focus(screen.getByTestId('field-test-price-list'));
    fireEvent.mouseDown(screen.getByTestId('option-test-price-list-pl-b'));
    expect(onChange).toHaveBeenCalledWith('pl-b');
  });

  it('calls onChange with an empty id when the chip is cleared', () => {
    const { onChange } = renderField({
      priceLists: [makePriceList({ id: 'pl-a', name: 'PL A' })],
      priceListId: 'pl-a',
    });
    // The clear (X) control fires on mousedown, not click — SelectorChip#triggerClear.
    fireEvent.mouseDown(screen.getByLabelText('clear'));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
