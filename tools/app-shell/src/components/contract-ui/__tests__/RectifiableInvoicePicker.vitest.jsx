// @vitest-environment jsdom
//
// ETP-5381 — a rectificative invoice is now created AND confirmed in one step, and the
// completion is rejected outright (ETSG_CHECK_RECTIF_INV_DOC) unless it declares which
// invoice it rectifies. This picker is what makes the user choose up front, so its two
// gates carry real weight: `isSatisfied` is the only thing standing between the user and
// a request the server will refuse, and `isEmpty` must never fire while the round-trip is
// still in flight — that would disable the confirm button and blame an empty list for a
// pending fetch.
import { render, screen, fireEvent, waitFor, within, renderHook, act } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import {
  useRectifiableInvoices,
  RectifiableInvoiceField,
  RectifiableInvoicePickerModal,
} from '../RectifiableInvoicePicker.jsx';

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
    onApply: vi.fn(),
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
    expect(screen.queryByTestId('rectify-open')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rectify-option-inv-1')).not.toBeInTheDocument();
  });

  it('renders the noInvoicesToRectify notice when the list is empty', () => {
    render(<RectifiableInvoiceField {...BASE} invoices={[]} isEmpty={true} />);
    expect(screen.getByTestId('rectify-empty')).toHaveTextContent('noInvoicesToRectify');
    expect(screen.queryByText('invoiceToRectifyLabel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rectify-open')).not.toBeInTheDocument();
  });

  it('renders the field label and, with nothing selected, only the trigger — never an inline row', () => {
    render(<RectifiableInvoiceField {...BASE} />);
    expect(screen.getByText('invoiceToRectifyLabel')).toBeInTheDocument();
    expect(screen.getByTestId('rectify-open')).toHaveTextContent('rectifySelectInvoices');
    // The host modal already carries a summary card and the generate-documents block: the
    // catalogue must stay behind the trigger, or those actions get pushed below the fold.
    for (const inv of INVOICES) {
      expect(screen.queryByTestId(`rectify-selected-${inv.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`rectify-option-${inv.id}`)).not.toBeInTheDocument();
      expect(screen.queryByText(inv.documentNo)).not.toBeInTheDocument();
    }
    expect(screen.queryByTestId('rectify-selected-count')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rectify-picker-modal')).not.toBeInTheDocument();
  });

  it('shows ONLY the selected invoices, not the whole catalogue', () => {
    render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-2']} />);
    expect(screen.getByTestId('rectify-selected-inv-2')).toHaveTextContent('FAC-002');
    expect(screen.queryByTestId('rectify-selected-inv-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rectify-selected-inv-3')).not.toBeInTheDocument();
    expect(screen.queryByText('FAC-001')).not.toBeInTheDocument();
    expect(screen.queryByText('FAC-003')).not.toBeInTheDocument();
    expect(screen.getByTestId('rectify-selected-count')).toBeInTheDocument();
    // With a selection the trigger changes its offer from "pick" to "change".
    expect(screen.getByTestId('rectify-open')).toHaveTextContent('rectifyChangeSelection');
  });

  it('lists every selected invoice — C_Invoice_Reverse is a 1:N bridge', () => {
    render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-1', 'inv-3']} />);
    expect(screen.getByTestId('rectify-selected-inv-1')).toBeInTheDocument();
    expect(screen.getByTestId('rectify-selected-inv-3')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-selected-inv-2')).not.toBeInTheDocument();
  });

  it('deselects an invoice through the row remove button', () => {
    const onToggle = vi.fn();
    render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-1', 'inv-2']} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId('rectify-remove-inv-2'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('inv-2');
  });

  it('formats the selected row amount through the canonical currency formatter (grouped, symbol after)', () => {
    render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-1']} />);
    // Exact match — a tolerant regex would also pass with the ungrouped / raw-ISO-code output.
    expect(screen.getByTestId('rectify-selected-inv-1')).toHaveTextContent('1.234,50 €');
    expect(screen.getByTestId('rectify-selected-inv-1')).not.toHaveTextContent('EUR');
  });

  it('omits the amount when the selected invoice carries none', () => {
    render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-3']} />);
    expect(screen.getByTestId('rectify-selected-inv-3')).toHaveTextContent('FAC-003');
    expect(screen.getByTestId('rectify-selected-inv-3').textContent).not.toMatch(/\d,\d\d/);
  });

  it('honours a custom idPrefix so two pickers can coexist on one page', () => {
    render(<RectifiableInvoiceField {...BASE} idPrefix="confirm-modal-rectify" />);
    expect(screen.getByTestId('confirm-modal-rectify-open')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-open')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirm-modal-rectify-open'));
    expect(screen.getByTestId('confirm-modal-rectify-picker-modal')).toBeInTheDocument();
    expect(screen.getByTestId('confirm-modal-rectify-option-inv-1')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-option-inv-1')).not.toBeInTheDocument();
  });

  it('handles an empty list without the isEmpty flag by rendering no rows', () => {
    render(<RectifiableInvoiceField {...BASE} invoices={[]} isEmpty={false} />);
    expect(screen.getByText('invoiceToRectifyLabel')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rectify-selected-inv-1')).not.toBeInTheDocument();
  });

  describe('opening the picker', () => {
    it('mounts the picker modal with one row per invoice', () => {
      render(<RectifiableInvoiceField {...BASE} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      expect(screen.getByTestId('rectify-picker-modal')).toBeInTheDocument();
      expect(screen.getByTestId('rectify-option-inv-1')).toHaveTextContent('FAC-001');
      expect(screen.getByTestId('rectify-option-inv-2')).toHaveTextContent('FAC-002');
      expect(screen.getByTestId('rectify-option-inv-3')).toHaveTextContent('FAC-003');
    });

    it('offers the multi-select affordances — the shared picker is opened in `multiple` mode', () => {
      render(<RectifiableInvoiceField {...BASE} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      expect(screen.getByTestId('rectify-apply')).toBeInTheDocument();
      expect(screen.getByTestId('rectify-option-inv-1')).toHaveAttribute('data-selected', 'false');
    });

    it('marks only the already-selected rows via data-selected', () => {
      render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-2']} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      expect(screen.getByTestId('rectify-option-inv-1')).toHaveAttribute('data-selected', 'false');
      expect(screen.getByTestId('rectify-option-inv-2')).toHaveAttribute('data-selected', 'true');
      expect(screen.getByTestId('rectify-option-inv-3')).toHaveAttribute('data-selected', 'false');
    });

    it('does not commit a click straight to the parent — only Apply does', () => {
      const onToggle = vi.fn();
      const onApply = vi.fn();
      render(<RectifiableInvoiceField {...BASE} onToggle={onToggle} onApply={onApply} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      fireEvent.click(screen.getByTestId('rectify-option-inv-2'));
      // Visible in the draft...
      expect(screen.getByTestId('rectify-option-inv-2')).toHaveAttribute('data-selected', 'true');
      // ...but the parent has not heard about it yet.
      expect(onToggle).not.toHaveBeenCalled();
      expect(onApply).not.toHaveBeenCalled();
    });

    it('propagates the draft to the parent on Apply and closes the picker', () => {
      const onApply = vi.fn();
      render(<RectifiableInvoiceField {...BASE} onApply={onApply} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      fireEvent.click(screen.getByTestId('rectify-option-inv-1'));
      fireEvent.click(screen.getByTestId('rectify-option-inv-3'));
      fireEvent.click(screen.getByTestId('rectify-apply'));
      expect(onApply).toHaveBeenCalledTimes(1);
      expect(onApply).toHaveBeenCalledWith(['inv-1', 'inv-3']);
      expect(screen.queryByTestId('rectify-picker-modal')).not.toBeInTheDocument();
    });

    it('discards the draft when the user cancels — Cancel must not be a lie', () => {
      const onToggle = vi.fn();
      const onApply = vi.fn();
      render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-1']} onToggle={onToggle} onApply={onApply} />);
      fireEvent.click(screen.getByTestId('rectify-open'));

      // Pick a different invoice, drop the original one, then walk away.
      fireEvent.click(screen.getByTestId('rectify-option-inv-3'));
      fireEvent.click(screen.getByTestId('rectify-option-inv-1'));
      fireEvent.click(screen.getByText('cancel'));

      expect(onApply).not.toHaveBeenCalled();
      expect(onToggle).not.toHaveBeenCalled();
      expect(screen.queryByTestId('rectify-picker-modal')).not.toBeInTheDocument();
      // The field still shows exactly what the parent holds.
      expect(screen.getByTestId('rectify-selected-inv-1')).toBeInTheDocument();
      expect(screen.queryByTestId('rectify-selected-inv-3')).not.toBeInTheDocument();
    });

    it('reopens with a clean draft after a cancel', () => {
      render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-1']} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      fireEvent.click(screen.getByTestId('rectify-option-inv-3'));
      fireEvent.click(screen.getByText('cancel'));

      fireEvent.click(screen.getByTestId('rectify-open'));
      expect(screen.getByTestId('rectify-option-inv-1')).toHaveAttribute('data-selected', 'true');
      expect(screen.getByTestId('rectify-option-inv-3')).toHaveAttribute('data-selected', 'false');
    });

    it('closes without applying when the × of the picker is used', () => {
      const onApply = vi.fn();
      render(<RectifiableInvoiceField {...BASE} onApply={onApply} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      fireEvent.click(screen.getByTestId('rectify-option-inv-2'));
      fireEvent.click(within(screen.getByTestId('rectify-picker-modal')).getByLabelText('cancel'));
      expect(onApply).not.toHaveBeenCalled();
      expect(screen.queryByTestId('rectify-picker-modal')).not.toBeInTheDocument();
    });

    it('can clear the whole selection by applying an empty draft', () => {
      const onApply = vi.fn();
      render(<RectifiableInvoiceField {...BASE} selectedIds={['inv-1']} onApply={onApply} />);
      fireEvent.click(screen.getByTestId('rectify-open'));
      fireEvent.click(screen.getByTestId('rectify-option-inv-1'));
      fireEvent.click(screen.getByTestId('rectify-apply'));
      expect(onApply).toHaveBeenCalledWith([]);
    });
  });
});

describe('RectifiableInvoicePickerModal', () => {
  const SEARCHABLE = [
    { id: 'inv-1', documentNo: 'FAC-001', businessPartner: 'Acme Corp', invoiceDate: '2026-08-10', grandTotalAmount: 1234.5, currency: 'EUR' },
    { id: 'inv-2', documentNo: 'FAC-002', businessPartner: 'Globex SA' },
    { id: 'inv-3', documentNo: 'ALB-777', businessPartner: 'Acme Corp', suggested: true },
  ];

  const BASE = {
    invoices: SEARCHABLE,
    selectedIds: [],
    onApply: vi.fn(),
    onClose: vi.fn(),
  };

  const optionIds = () => [...document.body.querySelectorAll('[data-testid^="rectify-option-"]')]
    .map(node => node.getAttribute('data-testid'));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ response: { data: [] } }) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders through a portal on document.body, not inside the caller subtree', () => {
    const { container } = render(<RectifiableInvoicePickerModal {...BASE} />);
    // Portalled: the host modal's own layout is left untouched, which is what lets the picker
    // sit above it instead of stretching it.
    expect(container).toBeEmptyDOMElement();
    expect(document.body).toContainElement(screen.getByTestId('rectify-picker-modal'));
  });

  it('stacks above the host modal tier (zIndex 60 > 50, and below the 70 walkthrough overlay)', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    expect(screen.getByTestId('rectify-picker-modal')).toHaveStyle({ zIndex: '60' });
  });

  it('is an accessible dialog', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    const dialog = screen.getByTestId('rectify-picker-modal');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('opens the shared picker in multiple mode (checkboxes + apply, no select-and-close)', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    expect(screen.getByTestId('rectify-apply')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('rectify-option-inv-1'));
    expect(screen.getByTestId('rectify-option-inv-1')).toHaveAttribute('data-selected', 'true');
    expect(BASE.onClose).not.toHaveBeenCalled();
  });

  it('leads with the backend-detected invoices when there is no search', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    expect(optionIds()).toEqual(['rectify-option-inv-3', 'rectify-option-inv-1', 'rectify-option-inv-2']);
    expect(screen.getByTestId('rectify-suggested-inv-3')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-suggested-inv-1')).not.toBeInTheDocument();
  });

  it('filters by document number', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    fireEvent.change(screen.getByTestId('rectify-search'), { target: { value: 'FAC-002' } });
    expect(optionIds()).toEqual(['rectify-option-inv-2']);
  });

  it('filters by business partner, case-insensitively', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    fireEvent.change(screen.getByTestId('rectify-search'), { target: { value: 'globex' } });
    expect(optionIds()).toEqual(['rectify-option-inv-2']);
  });

  it('keeps the incoming list order while searching (suggested-first is a no-query nicety)', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    fireEvent.change(screen.getByTestId('rectify-search'), { target: { value: 'acme' } });
    expect(optionIds()).toEqual(['rectify-option-inv-1', 'rectify-option-inv-3']);
  });

  it('ignores surrounding whitespace in the query', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    fireEvent.change(screen.getByTestId('rectify-search'), { target: { value: '  ALB  ' } });
    expect(optionIds()).toEqual(['rectify-option-inv-3']);
  });

  it('reports no matches instead of an empty void', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    fireEvent.change(screen.getByTestId('rectify-search'), { target: { value: 'nothing-like-this' } });
    expect(screen.getByTestId('rectify-no-matches')).toBeInTheDocument();
    expect(optionIds()).toEqual([]);
  });

  it('survives invoices with no documentNo or business partner while searching', () => {
    render(<RectifiableInvoicePickerModal {...BASE} invoices={[{ id: 'inv-x' }]} />);
    fireEvent.change(screen.getByTestId('rectify-search'), { target: { value: 'FAC' } });
    expect(screen.getByTestId('rectify-no-matches')).toBeInTheDocument();
  });

  it('preselects the ids handed in by the parent', () => {
    render(<RectifiableInvoicePickerModal {...BASE} selectedIds={['inv-2']} />);
    expect(screen.getByTestId('rectify-option-inv-2')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('rectify-option-inv-1')).toHaveAttribute('data-selected', 'false');
  });

  it('toggles a row with the keyboard', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    const row = screen.getByTestId('rectify-option-inv-1');
    expect(row).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(row).toHaveAttribute('data-selected', 'true');
    fireEvent.keyDown(row, { key: ' ' });
    expect(row).toHaveAttribute('data-selected', 'false');
  });

  it('applies the draft in click order', () => {
    const onApply = vi.fn();
    render(<RectifiableInvoicePickerModal {...BASE} onApply={onApply} />);
    fireEvent.click(screen.getByTestId('rectify-option-inv-2'));
    fireEvent.click(screen.getByTestId('rectify-option-inv-1'));
    fireEvent.click(screen.getByTestId('rectify-apply'));
    expect(onApply).toHaveBeenCalledWith(['inv-2', 'inv-1']);
  });

  it('never applies on Cancel', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(<RectifiableInvoicePickerModal {...BASE} onApply={onApply} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('rectify-option-inv-1'));
    fireEvent.click(screen.getByText('cancel'));
    expect(onApply).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on a backdrop click but not on a click inside the panel', () => {
    const onClose = vi.fn();
    render(<RectifiableInvoicePickerModal {...BASE} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('rectify-search'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('rectify-picker-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the shared page size instead of overriding it, and announces the remainder', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: `inv-${i}`, documentNo: `FAC-${i}` }));
    render(<RectifiableInvoicePickerModal {...BASE} invoices={many} />);
    // Same 5-row page the Rectificaciones tab shows: a bigger page here made this read as a
    // second, unrelated dialog and silently suppressed the +N hint.
    expect(optionIds()).toHaveLength(5);
    expect(screen.getByText(/rectMoreInvoicesHint/)).toHaveTextContent('4');
  });

  it('keeps the shared title too — the only visible difference is the checkbox', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    expect(screen.getByText('rectPickerTitle')).toBeInTheDocument();
  });

  it('says nothing about hidden rows when everything fits', () => {
    render(<RectifiableInvoicePickerModal {...BASE} />);
    expect(screen.queryByText(/rectMoreInvoicesHint/)).not.toBeInTheDocument();
  });

  it('honours a custom idPrefix on every hook the callers query', () => {
    render(<RectifiableInvoicePickerModal {...BASE} idPrefix="invoice-confirm-rectify" />);
    expect(screen.getByTestId('invoice-confirm-rectify-picker-modal')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-confirm-rectify-search')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-confirm-rectify-apply')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-confirm-rectify-option-inv-1')).toBeInTheDocument();
    expect(screen.queryByTestId('rectify-picker-modal')).not.toBeInTheDocument();
  });
});
