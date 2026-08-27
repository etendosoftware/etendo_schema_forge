// Mocks BEFORE imports
vi.mock('@/i18n', () => ({
  useUI: () => (key, vars) => {
    if (vars) return key.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
    return key;
  },
}));

// Radix Select cannot run in JSDOM — replace with a native <select> that
// honours value/onValueChange and renders options via SelectItem. Mirrors the
// mock in CreateInvoiceConfirmModal.vitest.jsx so PriceListSelectField renders
// identically under test.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange, disabled, 'data-testid': testId }) => (
    <div>
      <select
        value={value ?? ''}
        onChange={(e) => onValueChange?.(e.target.value)}
        disabled={disabled}
        data-testid={testId || 'select-control'}
      >
        {children}
      </select>
    </div>
  ),
  SelectTrigger: ({ children, ...props }) => <span {...props}>{children}</span>,
  SelectValue: () => null,
  SelectContent: ({ children }) => <>{children}</>,
  SelectItem: ({ children, value }) => <option value={value}>{children}</option>,
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { jsonHeaders } from '@/lib/sessionHeaders.js';
import {
  usePriceListPicker,
  PriceListSelectField,
  resolvePriceListValue,
  toPriceListSelectValue,
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

const BASE = '/sws/neo/goods-shipment';

// ── usePriceListPicker ────────────────────────────────────────────────────────

describe('usePriceListPicker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('does not fetch when enabled is false', async () => {
    mockPriceListFetch([makePriceList()]);
    renderHook(() => usePriceListPicker({ enabled: false, base: BASE }));
    await act(async () => {});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when base is falsy even if enabled is true', async () => {
    mockPriceListFetch([makePriceList()]);
    renderHook(() => usePriceListPicker({ enabled: true, base: '' }));
    await act(async () => {});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('starts with loading=false when enabled is false', () => {
    mockPriceListFetch([]);
    const { result } = renderHook(() => usePriceListPicker({ enabled: false, base: BASE }));
    expect(result.current.loading).toBe(false);
  });

  it('fetches `${base}/price-list/priceList` with pagination params and the session credential', async () => {
    mockPriceListFetch([makePriceList()]);
    renderHook(() => usePriceListPicker({ enabled: true, base: BASE }));
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        `${BASE}/price-list/priceList?_startRow=0&_endRow=200`,
        { headers: jsonHeaders(), credentials: 'include' },
      );
    });
  });

  it('filters out inactive price lists', async () => {
    mockPriceListFetch([
      makePriceList({ id: 'active-1', active: true }),
      makePriceList({ id: 'inactive-1', active: false }),
    ]);
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE }));
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
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE }));
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
      usePriceListPicker({ enabled: true, isSOTrx: false, base: BASE }));
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
      usePriceListPicker({ enabled: true, base: BASE }));
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
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE }));
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
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE }));
    await waitFor(() => {
      expect(result.current.priceListId).toBe('pl-a');
    });
  });

  it('leaves priceListId empty and priceLists empty when the response has no matches', async () => {
    mockPriceListFetch([]);
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.priceLists).toEqual([]);
    expect(result.current.priceListId).toBe('');
  });

  it('sets loading=false and leaves priceLists empty when the fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network'))));
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.priceLists).toEqual([]);
  });

  it('sets loading=false and leaves priceLists empty when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, json: async () => ({}) })));
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE }));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.priceLists).toEqual([]);
  });

  it('exposes setPriceListId so callers can override the user selection', async () => {
    mockPriceListFetch([makePriceList({ id: 'pl-a', default: true })]);
    const { result } = renderHook(() =>
      usePriceListPicker({ enabled: true, isSOTrx: true, base: BASE }));
    await waitFor(() => {
      expect(result.current.priceListId).toBe('pl-a');
    });
    act(() => result.current.setPriceListId('pl-manual'));
    expect(result.current.priceListId).toBe('pl-manual');
  });
});

// ── resolvePriceListValue / toPriceListSelectValue (sentinel helpers) ─────────

describe('price-list sentinel helpers', () => {
  it('toPriceListSelectValue maps a blank id to the empty sentinel', () => {
    expect(toPriceListSelectValue('')).toBe('__empty__');
    expect(toPriceListSelectValue(null)).toBe('__empty__');
    expect(toPriceListSelectValue(undefined)).toBe('__empty__');
  });

  it('toPriceListSelectValue passes a real id through unchanged', () => {
    expect(toPriceListSelectValue('pl-1')).toBe('pl-1');
  });

  it('resolvePriceListValue maps the empty sentinel back to an empty string', () => {
    expect(resolvePriceListValue('__empty__')).toBe('');
  });

  it('resolvePriceListValue passes a real id through unchanged', () => {
    expect(resolvePriceListValue('pl-1')).toBe('pl-1');
  });
});

// ── PriceListSelectField ───────────────────────────────────────────────────────

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

  it('shows the loading option and disables the select while loading', () => {
    renderField({ loading: true });
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.getByTestId('test-price-list-select').closest('select')
      ?? screen.getByRole('combobox')).toBeDisabled();
  });

  it('shows noPriceListsAvailable and disables the select when the list is empty and not loading', () => {
    renderField({ loading: false, priceLists: [] });
    expect(screen.getByText('noPriceListsAvailable')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('renders an option per price list and enables the select when not empty', () => {
    renderField({
      loading: false,
      priceLists: [makePriceList({ id: 'pl-a', name: 'PL A' }), makePriceList({ id: 'pl-b', name: 'PL B' })],
    });
    expect(screen.getByText('PL A')).toBeInTheDocument();
    expect(screen.getByText('PL B')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).not.toBeDisabled();
  });

  it('falls back to the id as the option label when name is missing', () => {
    const { name: _name, ...noName } = makePriceList({ id: 'pl-noname' });
    renderField({ priceLists: [noName] });
    expect(screen.getByText('pl-noname')).toBeInTheDocument();
  });

  it('shows the current priceListId as the select value', () => {
    renderField({
      priceLists: [makePriceList({ id: 'pl-a' }), makePriceList({ id: 'pl-b' })],
      priceListId: 'pl-b',
    });
    expect(screen.getByRole('combobox').value).toBe('pl-b');
  });

  it('shows the empty sentinel as the select value when priceListId is blank and no price lists loaded', () => {
    // With an empty priceLists array the component itself renders the
    // `__empty__` SelectItem (the "noPriceListsAvailable" option), so the
    // native <select> mock has a matching option to select — unlike a blank
    // priceListId with a non-empty priceLists array, where no rendered
    // <option> matches the sentinel and the browser/jsdom falls back to the
    // first real option instead (not a case this component's callers hit,
    // since usePriceListPicker always auto-selects once priceLists is non-empty).
    renderField({ priceLists: [], priceListId: '' });
    expect(screen.getByRole('combobox').value).toBe('__empty__');
  });

  it('calls onChange with the resolved (non-sentinel) id when the user picks an option', () => {
    const { onChange } = renderField({
      priceLists: [makePriceList({ id: 'pl-a' }), makePriceList({ id: 'pl-b' })],
      priceListId: 'pl-a',
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'pl-b' } });
    expect(onChange).toHaveBeenCalledWith('pl-b');
  });
});
