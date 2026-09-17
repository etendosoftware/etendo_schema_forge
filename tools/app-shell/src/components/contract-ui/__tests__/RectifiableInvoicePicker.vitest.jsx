// @vitest-environment jsdom
//
// ETP-5381 — a rectificative invoice is now created AND confirmed in one step, and the
// completion is rejected outright (ETSG_CHECK_RECTIF_INV_DOC) unless it declares which
// invoice it rectifies. This picker is what makes the user choose up front, so its two
// gates carry real weight: `isSatisfied` is the only thing standing between the user and
// a request the server will refuse, and `isEmpty` must never fire while the round-trip is
// still in flight — that would disable the confirm button and blame an empty list for a
// pending fetch.
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { useRectifiableInvoices, RectifiableInvoiceField } from '../RectifiableInvoicePicker.jsx';

const URL = '/sws/neo/return-material-receipt/header/REC-001/action/rectifiableInvoices';

const INVOICES = [
  { id: 'inv-1', documentNo: 'FAC-001', invoiceDate: '2026-08-10', grandTotalAmount: 1234.5, currency: 'EUR' },
  { id: 'inv-2', documentNo: 'FAC-002', invoiceDate: '2026-08-11', grandTotalAmount: 99.9, currency: 'EUR' },
  { id: 'inv-3', documentNo: 'FAC-003' },
];

/**
 * Routes the picker's own action POST and lets every other call (e.g. the fire-and-forget
 * currency-format config) resolve to a harmless empty payload, so the assertions below can
 * never be satisfied by the wrong request.
 */
function mockFetch({ invoices = INVOICES, suggestedInvoiceIds, ok = true, reject = false, deferred = false } = {}) {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const stub = vi.fn((url) => {
    if (!String(url).includes('rectifiableInvoices')) {
      return Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) });
    }
    if (reject) return Promise.reject(new Error('Network down'));
    const answer = {
      ok,
      json: async () => ({ response: { data: { invoices, suggestedInvoiceIds } } }),
    };
    return deferred ? gate.then(() => answer) : Promise.resolve(answer);
  });
  vi.stubGlobal('fetch', stub);
  return { stub, release: () => release() };
}

describe('useRectifiableInvoices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('disabled / no URL', () => {
    it('fetches nothing and reports a neutral state when enabled is false', async () => {
      const { stub } = mockFetch();
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: false, url: URL, token: 't' }));
      await new Promise(r => setTimeout(r, 0));
      expect(stub.mock.calls.filter(([u]) => String(u).includes('rectifiableInvoices'))).toHaveLength(0);
      expect(result.current.invoices).toEqual([]);
      expect(result.current.loading).toBe(false);
      expect(result.current.isEmpty).toBe(false);
      // Nothing to satisfy when the picker is off — the caller's confirm button must stay usable.
      expect(result.current.isSatisfied).toBe(true);
    });

    it('fetches nothing when enabled is true but no url was supplied', async () => {
      const { stub } = mockFetch();
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: undefined, token: 't' }));
      await new Promise(r => setTimeout(r, 0));
      expect(stub.mock.calls.filter(([u]) => String(u).includes('rectifiableInvoices'))).toHaveLength(0);
      expect(result.current.isEmpty).toBe(false);
    });
  });

  describe('loading the candidates', () => {
    it('POSTs to the supplied action URL verbatim (baseUrl is not prepended)', async () => {
      const { stub } = mockFetch();
      renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => {
        const call = stub.mock.calls.find(([u]) => String(u).includes('rectifiableInvoices'));
        expect(call).toBeTruthy();
        expect(String(call[0])).toBe(URL);
        expect(call[1].method).toBe('POST');
      });
    });

    it('stores the returned invoice list', async () => {
      mockFetch();
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.invoices).toHaveLength(3);
      expect(result.current.invoices[0].documentNo).toBe('FAC-001');
    });

    it('treats a non-array invoices field as an empty list instead of crashing', async () => {
      mockFetch({ invoices: null });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.invoices).toEqual([]);
      expect(result.current.isEmpty).toBe(true);
    });
  });

  describe('preselection of suggestedInvoiceIds', () => {
    it('preselects the backend suggestion when it is part of the list', async () => {
      mockFetch({ suggestedInvoiceIds: ['inv-2'] });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.selectedIds).toEqual(['inv-2']));
      // Preselected means the caller can confirm straight away and reproduce exactly the
      // link the server would have made on its own.
      expect(result.current.isSatisfied).toBe(true);
    });

    it('does NOT preselect a suggestion that is absent from the list', async () => {
      mockFetch({ suggestedInvoiceIds: ['inv-does-not-exist'] });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.selectedIds).toEqual([]);
      expect(result.current.isSatisfied).toBe(false);
    });

    it('selects nothing when the backend sends no suggestion', async () => {
      mockFetch({ suggestedInvoiceIds: undefined });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.selectedIds).toEqual([]);
    });
  });

  describe('isSatisfied — the confirm gate', () => {
    it('is false while the picker is enabled and nothing is selected', async () => {
      mockFetch({ suggestedInvoiceIds: undefined });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isSatisfied).toBe(false);
    });

    it('flips to true as soon as an invoice is selected', async () => {
      mockFetch({ suggestedInvoiceIds: undefined });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.toggle('inv-1'));
      expect(result.current.isSatisfied).toBe(true);
    });

    it('falls back to false when the last selection is removed', async () => {
      mockFetch({ suggestedInvoiceIds: ['inv-1'] });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.isSatisfied).toBe(true));
      act(() => result.current.toggle('inv-1'));
      expect(result.current.selectedIds).toEqual([]);
      expect(result.current.isSatisfied).toBe(false);
    });
  });

  describe('isEmpty — only after the answer is in', () => {
    it('is false while the request is still in flight, even though the list is empty', async () => {
      const { release } = mockFetch({ invoices: [], deferred: true });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(true));
      // The whole point of the `loaded` flag: a pending round-trip must not be reported
      // as "nothing to rectify", which would disable the caller's confirm button.
      expect(result.current.isEmpty).toBe(false);
      release();
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isEmpty).toBe(true);
    });

    it('is false once a non-empty list has loaded', async () => {
      mockFetch();
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isEmpty).toBe(false);
    });

    it('is true after a confirmed empty answer', async () => {
      mockFetch({ invoices: [] });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.isEmpty).toBe(true));
      expect(result.current.isSatisfied).toBe(false);
    });
  });

  describe('toggle — multiple selection', () => {
    it('accumulates selections in click order', async () => {
      mockFetch({ suggestedInvoiceIds: undefined });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.toggle('inv-1'));
      act(() => result.current.toggle('inv-3'));
      // C_Invoice_Reverse is a 1:N bridge: one return can legitimately correct several invoices.
      expect(result.current.selectedIds).toEqual(['inv-1', 'inv-3']);
      expect(result.current.isSatisfied).toBe(true);
    });

    it('removes only the toggled id and keeps the rest selected', async () => {
      mockFetch({ suggestedInvoiceIds: undefined });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.toggle('inv-1'));
      act(() => result.current.toggle('inv-2'));
      act(() => result.current.toggle('inv-1'));
      expect(result.current.selectedIds).toEqual(['inv-2']);
      expect(result.current.isSatisfied).toBe(true);
    });
  });

  describe('failure modes fail closed', () => {
    it('leaves the list empty when the response is not ok', async () => {
      mockFetch({ ok: false });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.invoices).toEqual([]);
      // Confirm stays blocked rather than letting the user submit a request the server
      // would reject anyway.
      expect(result.current.isSatisfied).toBe(false);
    });

    it('swallows a rejected fetch and stops loading', async () => {
      mockFetch({ reject: true });
      const { result } = renderHook(() => useRectifiableInvoices({ enabled: true, url: URL, token: 't' }));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.invoices).toEqual([]);
      expect(result.current.isEmpty).toBe(true);
    });
  });
});

describe('RectifiableInvoiceField', () => {
  const BASE = {
    invoices: INVOICES,
    selectedIds: [],
    onToggle: vi.fn(),
    loading: false,
    isEmpty: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ response: { data: [] } }) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the loading placeholder while loading', () => {
    render(<RectifiableInvoiceField {...BASE} loading={true} />);
    expect(screen.getByTestId('rectify-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-option-inv-1')).not.toBeInTheDocument();
  });

  it('renders the noInvoicesToRectify notice when the list is empty', () => {
    render(<RectifiableInvoiceField {...BASE} invoices={[]} isEmpty={true} />);
    expect(screen.getByTestId('rectify-empty')).toHaveTextContent('noInvoicesToRectify');
    expect(screen.queryByText('invoiceToRectifyLabel')).not.toBeInTheDocument();
  });

  it('renders the field label and one row per invoice', () => {
    render(<RectifiableInvoiceField {...BASE} />);
    expect(screen.getByText('invoiceToRectifyLabel')).toBeInTheDocument();
    expect(screen.getByTestId('rectify-option-inv-1')).toHaveTextContent('FAC-001');
    expect(screen.getByTestId('rectify-option-inv-2')).toHaveTextContent('FAC-002');
    expect(screen.getByTestId('rectify-option-inv-3')).toHaveTextContent('FAC-003');
  });

  it('marks only the selected rows via data-selected', () => {
    render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-2']} />);
    expect(screen.getByTestId('rectify-option-inv-1')).toHaveAttribute('data-selected', 'false');
    expect(screen.getByTestId('rectify-option-inv-2')).toHaveAttribute('data-selected', 'true');
  });

  it('calls onToggle with the clicked invoice id', () => {
    const onToggle = vi.fn();
    render(<RectifiableInvoiceField {...BASE} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('rectify-option-inv-2'));
    expect(onToggle).toHaveBeenCalledWith('inv-2');
  });

  it('formats the amount through the canonical currency formatter (grouped, symbol after)', () => {
    render(<RectifiableInvoiceField {...BASE} />);
    // Exact match — a tolerant regex would also pass with the ungrouped / raw-ISO-code output.
    expect(screen.getByTestId('rectify-option-inv-1')).toHaveTextContent('1.234,50 €');
    expect(screen.getByTestId('rectify-option-inv-1')).not.toHaveTextContent('EUR');
  });

  it('omits the amount when the invoice carries none', () => {
    render(<RectifiableInvoiceField {...BASE} />);
    expect(screen.getByTestId('rectify-option-inv-3')).toHaveTextContent('FAC-003');
    expect(screen.getByTestId('rectify-option-inv-3').textContent).not.toMatch(/\d,\d\d/);
  });

  it('honours a custom idPrefix so two pickers can coexist on one page', () => {
    render(<RectifiableInvoiceField {...BASE} idPrefix="confirm-modal-rectify" />);
    expect(screen.getByTestId('confirm-modal-rectify-option-inv-1')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-option-inv-1')).not.toBeInTheDocument();
  });

  it('handles an empty list without the isEmpty flag by rendering no rows', () => {
    render(<RectifiableInvoiceField {...BASE} invoices={[]} isEmpty={false} />);
    expect(screen.getByText('invoiceToRectifyLabel')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-empty')).not.toBeInTheDocument();
  });
});
