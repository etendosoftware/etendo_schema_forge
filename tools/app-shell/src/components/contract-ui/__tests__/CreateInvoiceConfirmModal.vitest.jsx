// Mocks BEFORE imports
// ETP-5022 — the component's requests now come from `useApiFetch`, which reads the bearer
// token from the session instead of from the `token` prop.
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

vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createPortal: (node) => node };
});

// ConfirmDocumentModal exports shared primitives — mock it to avoid portal issues there
vi.mock('@/components/contract-ui/ConfirmDocumentModal', async (importOriginal) => {
  const actual = await importOriginal();
  return actual;
});

// Radix Select cannot run in JSDOM — replace with a native <select> that
// honours value/onValueChange and renders options via SelectItem.
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }) => (
    <div>
      <select
        value={value ?? ''}
        onChange={(e) => onValueChange?.(e.target.value)}
        data-testid="select-control"
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

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import CreateInvoiceConfirmModal from '@/components/contract-ui/CreateInvoiceConfirmModal';
import * as formatCurrencyModule from '@/lib/formatCurrency.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeData(overrides = {}) {
  return {
    documentNo: 'SO-001',
    'businessPartner$_identifier': 'Acme Corp',
    grandTotalAmount: 1500,
    'currency$_identifier': 'USD',
    ...overrides,
  };
}

function renderModal(props = {}) {
  const defaults = {
    data: makeData(),
    loading: false,
    onConfirm: vi.fn(),
    onClose: vi.fn(),
  };
  const merged = { ...defaults, ...props };
  return { ...render(<CreateInvoiceConfirmModal {...merged} />), props: merged };
}

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CreateInvoiceConfirmModal', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) }),
    ));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders the modal title key', () => {
    renderModal();
    expect(screen.getByText('soManageDocsTitle')).toBeInTheDocument();
  });

  it('renders bpName when provided', () => {
    renderModal({ data: makeData({ 'businessPartner$_identifier': 'My Supplier' }) });
    expect(screen.getByText('My Supplier')).toBeInTheDocument();
  });

  it('does not render bpName when absent', () => {
    renderModal({ data: makeData({ 'businessPartner$_identifier': '' }) });
    expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
  });

  it('shows the formatted grandTotal with the real currency symbol (es-ES, grouped), never the raw ISO code', () => {
    renderModal({ data: makeData({ grandTotalAmount: 1234.56, 'currency$_identifier': 'EUR' }) });
    expect(screen.getByText(/1\.234,56\s€/)).toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).toBeNull();
  });

  it('shows documentNo when grandTotal is 0', () => {
    renderModal({ data: makeData({ grandTotalAmount: 0, documentNo: 'SO-ZERO' }) });
    expect(screen.getByText('SO-ZERO')).toBeInTheDocument();
  });

  it('shows documentNo when grandTotal is missing', () => {
    const { documentNo: _dn, grandTotalAmount: _gt, ...rest } = makeData();
    renderModal({ data: { ...rest, documentNo: 'SO-NULL' } });
    expect(screen.getByText('SO-NULL')).toBeInTheDocument();
  });

  // ETP-4567 (QA finding — bug A): `displayAmount = grandTotal > 0 ? formattedTotal
  // : documentNo` falls back to the document number for a NEGATIVE grand total too
  // (a return/credit scenario), even though `formattedTotal` is a perfectly valid
  // signed amount. The fix drops the `> 0` gate entirely so the real (possibly
  // negative) total is always shown — mirroring how the working subtotal line
  // elsewhere in the app already renders signed totals unconditionally.
  it('shows the real formatted NEGATIVE grandTotal, not documentNo and not a zeroed amount (ETP-4567)', () => {
    renderModal({ data: makeData({ grandTotalAmount: -450.75, documentNo: 'SO-NEG', 'currency$_identifier': 'EUR' }) });
    expect(screen.getByText(/-450,75\s€/)).toBeInTheDocument();
    expect(screen.queryByText('SO-NEG')).not.toBeInTheDocument();
    expect(screen.queryByText(/^0([.,]00)?$/)).not.toBeInTheDocument();
  });

  it('uses linkedOrders grandTotal, falling back to linkedOrder currency when the document has none of its own', () => {
    const data = {
      documentNo: 'SO-002',
      'businessPartner$_identifier': 'Partner',
      grandTotalAmount: 0,
      linkedOrders: [
        { grandTotalAmount: 9999, 'currency$_identifier': 'GBP' },
      ],
    };
    renderModal({ data });
    expect(screen.getByText(/9\.999,00\s£/)).toBeInTheDocument();
    expect(screen.queryByText(/GBP/)).toBeNull();
  });

  it('prefers the document\'s own etgoCurrency over the linked order\'s currency (ETP-4028: currency is editable in draft and can diverge from the originating order)', () => {
    const data = {
      documentNo: 'SO-003',
      'businessPartner$_identifier': 'Partner',
      grandTotalAmount: 9999,
      'etgoCurrency$_identifier': 'EUR',
      linkedOrders: [
        { grandTotalAmount: 9999, 'currency$_identifier': 'USD' },
      ],
    };
    renderModal({ data });
    expect(screen.getByText(/9\.999,00\s€/)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).toBeNull();
  });

  // ── No create-invoice checkbox (ETP-5381) ──────────────────────────────────
  // Every button that opens this modal already says "Crear factura", so the checkbox asked the
  // user to confirm a confirmation — and unticking it left a dialog whose only action did nothing.
  // The toggle in ConfirmInOutModal is a different case and stays: there the button says
  // "Confirmar" and the invoice is genuinely optional.

  it('does not render a create-invoice checkbox', () => {
    renderModal();
    expect(screen.queryByText('soCreateInvoiceTitle')).not.toBeInTheDocument();
    expect(screen.queryByText('soGenerateDocs')).not.toBeInTheDocument();
  });

  it('confirm button is enabled straight away, with nothing left to tick', () => {
    renderModal();
    const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
    expect(confirmBtn).not.toBeDisabled();
  });

  it('confirms without any prior interaction', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByText('soCreateDocsBtn'));
    expect(props.onConfirm).toHaveBeenCalledWith('', []);
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows Spinner and soProcessing label when loading=true', () => {
    renderModal({ loading: true });
    expect(screen.getByText('soProcessing')).toBeInTheDocument();
    // Spinner renders an SVG — verify it exists
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('disables confirm button when loading=true', () => {
    renderModal({ loading: true });
    const confirmBtn = screen.getByText('soProcessing').closest('button');
    expect(confirmBtn).toBeDisabled();
  });

  it('disables cancel button when loading=true', () => {
    renderModal({ loading: true });
    const cancelBtn = screen.getByText('cancel').closest('button');
    expect(cancelBtn).toBeDisabled();
  });

  // ── Interactions ───────────────────────────────────────────────────────────

  it('calls onClose when cancel button is clicked', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByText('cancel'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when × (close) button is clicked', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByText('×'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  // ETP-5333 — the overlay's own onClick={dismiss} was never previously exercised
  // here (only the explicit cancel/× buttons were). While a request is in flight,
  // a backdrop click must not be able to reproduce the "closes with no feedback"
  // symptom the loading state exists to prevent.
  it('calls onClose when the backdrop overlay is clicked and loading is false', () => {
    const { props } = renderModal({ loading: false });
    fireEvent.click(screen.getByTestId('create-invoice-confirm-modal'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when the backdrop overlay is clicked while loading is true (ETP-5333)', () => {
    const { props } = renderModal({ loading: true });
    fireEvent.click(screen.getByTestId('create-invoice-confirm-modal'));
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('does NOT call onClose when × is clicked while loading is true (ETP-5333)', () => {
    const { props } = renderModal({ loading: true });
    fireEvent.click(screen.getByText('×'));
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('calls onConfirm when confirm button is clicked and checkbox is checked (showPriceListPicker=false)', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByText('soCreateDocsBtn'));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    // ETP-4028: onConfirm is always called with the priceListId arg (unset here, since
    // the picker is not shown) — old call sites that ignore the arg keep working.
    // ETP-5381: the second argument is the list of invoices this document rectifies —
    // empty here because no rectifiable-invoice picker is wired into this render.
    expect(props.onConfirm).toHaveBeenCalledWith('', []);
  });

  // ── pendingQtyUrl — subtitle behavior ─────────────────────────────────────

  it('shows generic subtitle when pendingQtyUrl is not provided', () => {
    renderModal();
    expect(screen.getByText('soCreateInvoiceCheckDesc')).toBeInTheDocument();
  });

  it('fetches pendingQtyUrl and shows formatted pending qty subtitle', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          response: { data: [{ pendingQty: 5 }, { pendingQty: 3 }] },
        }),
      }),
    ));

    renderModal({ pendingQtyUrl: '/api/pending', token: 'test-token' });

    await waitFor(() => {
      // soAmountPendingInvoice with substituted {pending}
      expect(screen.getByText(/soAmountPendingInvoice/)).toBeInTheDocument();
    });

    expect(fetch).toHaveBeenCalledWith('/api/pending', {
      credentials: 'include',
      headers: { Authorization: 'Bearer test-token', 'Accept-Language': 'es_ES' },
    });
  });

  it('falls back to generic subtitle when pendingQtyUrl fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network'))));

    renderModal({ pendingQtyUrl: '/api/pending' });

    // Give time for the effect to resolve/reject
    await act(async () => {});
    expect(screen.getByText('soCreateInvoiceCheckDesc')).toBeInTheDocument();
  });

  it('falls back to generic subtitle when pendingQtyUrl response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: false, json: async () => ({}) }),
    ));

    renderModal({ pendingQtyUrl: '/api/pending' });

    await act(async () => {});
    expect(screen.getByText('soCreateInvoiceCheckDesc')).toBeInTheDocument();
  });

  // ── pendingQtyTotal — bulk callers skip the single-document fetch ──────────

  it('shows the pending subtitle from pendingQtyTotal without fetching pendingQtyUrl', () => {
    renderModal({ pendingQtyUrl: '/api/pending', pendingQtyTotal: 8 });

    expect(screen.getByText(/soAmountPendingInvoice/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('treats pendingQtyTotal of 0 as a real value, not "no data"', () => {
    renderModal({ pendingQtyTotal: 0 });
    expect(screen.getByText(/soAmountPendingInvoice/)).toBeInTheDocument();
    expect(screen.queryByText('soCreateInvoiceCheckDesc')).not.toBeInTheDocument();
  });

  // ── formatCurrency usage (ETP-4314 policy: no hand-rolled currency formatting) ──

  it('uses the shared formatCurrency utility to format the grand total (not a hand-rolled formatter)', () => {
    const spy = vi.spyOn(formatCurrencyModule, 'formatCurrency');
    renderModal({ data: makeData({ grandTotalAmount: 1234.56, 'currency$_identifier': 'USD' }) });
    expect(spy).toHaveBeenCalledWith('USD', 1234.56);
    spy.mockRestore();
  });

  // ── ETP-4028 — showPriceListPicker ────────────────────────────────────────

  describe('showPriceListPicker = false (default) — unchanged legacy behavior', () => {
    it('does not render the price-list select', () => {
      renderModal();
      expect(screen.queryByTestId('invoice-confirm-price-list-select')).not.toBeInTheDocument();
    });

    it('does not fetch the price-list endpoint', async () => {
      renderModal({ apiBaseUrl: '/sws/neo/goods-shipment/goodsShipment' });
      await act(async () => {});
      const calledPriceList = fetch.mock.calls.some(([url]) => String(url).includes('/price-list/'));
      expect(calledPriceList).toBe(false);
    });

    it('confirm is enabled purely by the checkbox (no picker requirement)', () => {
      renderModal();
      const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
      expect(confirmBtn).not.toBeDisabled();
    });
  });

  describe('showPriceListPicker = true', () => {
    const apiBaseUrl = '/sws/neo/goods-shipment/goodsShipment';

    function mockPriceListFetch(priceLists) {
      vi.stubGlobal('fetch', vi.fn((url) => {
        if (String(url).includes('/price-list/priceList')) {
          return Promise.resolve({ ok: true, json: async () => ({ response: { data: priceLists } }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) });
      }));
    }

    it('renders the price-list select', async () => {
      mockPriceListFetch([makePriceList()]);
      renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl });
      await waitFor(() => {
        expect(screen.getByTestId('invoice-confirm-price-list-select')).toBeInTheDocument();
      });
    });

    it('fetches price lists from `${base}/price-list/priceList` with pagination params and the auth header', async () => {
      mockPriceListFetch([makePriceList()]);
      renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl, token: 'test-token' });
      await waitFor(() => {
        // ETP-5022 — the request goes through the shared apiFetch: same URL and same
        // headers, plus the `credentials: 'include'` every call site used to have to
        // remember on its own. The token comes from the session (mocked above) rather
        // than from the `token` prop.
        expect(fetch).toHaveBeenCalledWith(
          '/sws/neo/goods-shipment/price-list/priceList?_startRow=0&_endRow=200',
          {
            credentials: 'include',
            headers: { Authorization: 'Bearer test-token', 'Accept-Language': 'es_ES' },
          },
        );
      });
    });

    it('filters out inactive price lists', async () => {
      mockPriceListFetch([
        makePriceList({ id: 'active-1', name: 'Active PL', active: true }),
        makePriceList({ id: 'inactive-1', name: 'Inactive PL', active: false }),
      ]);
      renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl });
      await waitFor(() => {
        expect(screen.getByText('Active PL')).toBeInTheDocument();
      });
      expect(screen.queryByText('Inactive PL')).not.toBeInTheDocument();
    });

    it('filters price lists by salesPriceList matching isSOTrx (sales)', async () => {
      mockPriceListFetch([
        makePriceList({ id: 'sales-1', name: 'Sales PL', salesPriceList: true }),
        makePriceList({ id: 'purchase-1', name: 'Purchase PL', salesPriceList: false }),
      ]);
      renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl });
      await waitFor(() => {
        expect(screen.getByText('Sales PL')).toBeInTheDocument();
      });
      expect(screen.queryByText('Purchase PL')).not.toBeInTheDocument();
    });

    it('defaults isSOTrx to true (sales price lists) when the prop is omitted entirely', async () => {
      mockPriceListFetch([
        makePriceList({ id: 'sales-1', name: 'Sales PL', salesPriceList: true }),
        makePriceList({ id: 'purchase-1', name: 'Purchase PL', salesPriceList: false }),
      ]);
      // isSOTrx intentionally omitted — must fall back to its default (true), matching
      // the sales price list and excluding the purchase one.
      renderModal({ showPriceListPicker: true, apiBaseUrl });
      await waitFor(() => {
        expect(screen.getByText('Sales PL')).toBeInTheDocument();
      });
      expect(screen.queryByText('Purchase PL')).not.toBeInTheDocument();
    });

    it('filters price lists by salesPriceList matching isSOTrx (purchase)', async () => {
      mockPriceListFetch([
        makePriceList({ id: 'sales-1', name: 'Sales PL', salesPriceList: true }),
        makePriceList({ id: 'purchase-1', name: 'Purchase PL', salesPriceList: false }),
      ]);
      renderModal({ showPriceListPicker: true, isSOTrx: false, apiBaseUrl });
      await waitFor(() => {
        expect(screen.getByText('Purchase PL')).toBeInTheDocument();
      });
      expect(screen.queryByText('Sales PL')).not.toBeInTheDocument();
    });

    // ETP-4942 (round 3): this modal always passes allowGenericFallback: false —
    // it has no "optional" variant, so the system `default` flag / first-match
    // fallback must never silently satisfy the field. Only a real
    // `data.resolvedPriceListId` (server-resolved from the linked order or the
    // BP's own tariff) may auto-select.

    it('does NOT auto-select a price list flagged as system-default when no resolvedPriceListId is provided (mandatory field must not autofill)', async () => {
      mockPriceListFetch([
        makePriceList({ id: 'pl-a', name: 'PL A', default: false }),
        makePriceList({ id: 'pl-b', name: 'PL B', default: true }),
      ]);
      renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl });
      await waitFor(() => {
        expect(screen.getByTestId('invoice-confirm-price-list-select')).toBeInTheDocument();
      });
      const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
      expect(confirmBtn).toBeDisabled();
    });

    it('leaves the price list unselected (confirm disabled) instead of falling back to the first match when none is flagged default and none is resolved', async () => {
      // Regression guard for a real false-positive found in review: asserting
      // `select.value` here is NOT a valid check — the native <select> mock falls
      // back to rendering its first <option> whenever `value` matches no option
      // (the `__empty__` sentinel option is not rendered once the list is
      // non-empty), so `select.value === 'pl-a'` would pass even if the component
      // never actually selected anything. Assert the real state instead: the
      // confirm button, which is driven directly by `priceListId` truthiness.
      mockPriceListFetch([
        makePriceList({ id: 'pl-a', name: 'PL A', default: false }),
        makePriceList({ id: 'pl-b', name: 'PL B', default: false }),
      ]);
      renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl });
      await waitFor(() => {
        expect(screen.getByTestId('invoice-confirm-price-list-select')).toBeInTheDocument();
      });
      const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
      expect(confirmBtn).toBeDisabled();
    });

    it('confirm button is disabled until a price list is auto-selected/chosen, even with the checkbox checked', async () => {
      // Never-resolving fetch — loadingPriceLists stays true, priceListId stays ''
      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl });
      const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
      expect(confirmBtn).toBeDisabled();
    });

    it('auto-selects the price list resolved server-side (data.resolvedPriceListId) and enables the confirm button', async () => {
      mockPriceListFetch([
        makePriceList({ id: 'pl-a', name: 'PL A', default: false }),
        makePriceList({ id: 'pl-only', name: 'Resolved PL', default: false }),
      ]);
      renderModal({
        data: makeData({ resolvedPriceListId: 'pl-only' }),
        showPriceListPicker: true, isSOTrx: true, apiBaseUrl,
      });
      await waitFor(() => {
        const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
        expect(confirmBtn).not.toBeDisabled();
      });
    });

    it('purchase variant (isSOTrx=false): does not auto-select any price list without a resolved default, even one flagged system-default', async () => {
      mockPriceListFetch([
        makePriceList({ id: 'pl-a', name: 'Purchase PL A', salesPriceList: false, default: true }),
      ]);
      renderModal({ showPriceListPicker: true, isSOTrx: false, apiBaseUrl });
      await waitFor(() => {
        expect(screen.getByTestId('invoice-confirm-price-list-select')).toBeInTheDocument();
      });
      const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
      expect(confirmBtn).toBeDisabled();
    });

    it('calls onConfirm with the resolved priceListId when confirmed', async () => {
      mockPriceListFetch([makePriceList({ id: 'pl-selected', default: true })]);
      const onConfirm = vi.fn();
      renderModal({
        data: makeData({ resolvedPriceListId: 'pl-selected' }),
        showPriceListPicker: true, isSOTrx: true, apiBaseUrl, onConfirm,
      });
      await waitFor(() => {
        expect(screen.getByText('soCreateDocsBtn').closest('button')).not.toBeDisabled();
      });
      fireEvent.click(screen.getByText('soCreateDocsBtn'));
      expect(onConfirm).toHaveBeenCalledWith('pl-selected', []);
    });

    it('calls onConfirm with the user-selected priceListId after changing the select', async () => {
      mockPriceListFetch([
        makePriceList({ id: 'pl-a', name: 'PL A', default: true }),
        makePriceList({ id: 'pl-b', name: 'PL B', default: false }),
      ]);
      const onConfirm = vi.fn();
      renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl, onConfirm });
      await waitFor(() => {
        expect(screen.getByTestId('invoice-confirm-price-list-select')).toBeInTheDocument();
      });
      fireEvent.change(screen.getByTestId('select-control'), { target: { value: 'pl-b' } });
      fireEvent.click(screen.getByText('soCreateDocsBtn'));
      expect(onConfirm).toHaveBeenCalledWith('pl-b', []);
    });

    it('shows noPriceListsAvailable option when no price lists match', async () => {
      mockPriceListFetch([]);
      renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl });
      await waitFor(() => {
        expect(screen.getByText('noPriceListsAvailable')).toBeInTheDocument();
      });
      const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
      expect(confirmBtn).toBeDisabled();
    });

    // A bulk caller (e.g. BulkInvoiceFromShipment) has no other way to observe the picker's
    // internal selection — it needs it to compute a per-line quote reactively.
    describe('onPriceListChange — notifies the caller of the picker\'s internal selection', () => {
      it('fires with the initial resolved/preselected priceListId', async () => {
        mockPriceListFetch([makePriceList({ id: 'pl-a' }), makePriceList({ id: 'pl-b' })]);
        const onPriceListChange = vi.fn();
        renderModal({
          showPriceListPicker: true, isSOTrx: true, apiBaseUrl,
          data: makeData({ resolvedPriceListId: 'pl-b' }), onPriceListChange,
        });
        await waitFor(() => {
          expect(onPriceListChange).toHaveBeenCalledWith('pl-b');
        });
      });

      it('fires again when the user changes the selection', async () => {
        mockPriceListFetch([makePriceList({ id: 'pl-a' }), makePriceList({ id: 'pl-b' })]);
        const onPriceListChange = vi.fn();
        renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl, onPriceListChange });
        await waitFor(() => {
          expect(screen.getByTestId('invoice-confirm-price-list-select')).toBeInTheDocument();
        });
        onPriceListChange.mockClear();
        fireEvent.change(screen.getByTestId('select-control'), { target: { value: 'pl-b' } });
        expect(onPriceListChange).toHaveBeenCalledWith('pl-b');
      });

      it('is a no-op when omitted — the picker still works with no callback supplied', async () => {
        mockPriceListFetch([makePriceList({ id: 'pl-a' })]);
        expect(() => renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl })).not.toThrow();
        await waitFor(() => {
          expect(screen.getByTestId('invoice-confirm-price-list-select')).toBeInTheDocument();
        });
      });
    });
  });

  // ── rectifiable-invoice picker (ETP-5381) ─────────────────────────────────
  //
  // Second entry point of the same flow: the "Crear factura" button on an already-confirmed
  // return document. The rectificative invoice is created AND confirmed in one step, and
  // ETSG_CHECK_RECTIF_INV_DOC rejects it unless it declares which invoice it corrects — so the
  // picker gates this modal's primary button exactly as it gates the pre-completion one.
  describe('rectifiable-invoice picker (ETP-5381)', () => {
    const RECTIFY_URL = '/sws/neo/return-material-receipt/returnReceipt/REC-001/action/rectifiableInvoices';

    const RECTIFIABLE = [
      { id: 'inv-1', documentNo: 'FAC-001', businessPartner: 'Acme Corp', invoiceDate: '2026-08-10', grandTotalAmount: 300, currency: 'EUR' },
      { id: 'inv-2', documentNo: 'FAC-002', businessPartner: 'Globex SA', invoiceDate: '2026-08-11', grandTotalAmount: 200, currency: 'EUR' },
    ];

    function mockRectifyFetch({ invoices = RECTIFIABLE, suggestedInvoiceIds } = {}) {
      vi.stubGlobal('fetch', vi.fn((url) => {
        if (String(url).includes('rectifiableInvoices')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ response: { data: { invoices, suggestedInvoiceIds } } }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) });
      }));
    }

    const confirmBtn = () => screen.getByText('soCreateDocsBtn').closest('button');
    const openPicker = () => fireEvent.click(screen.getByTestId('invoice-confirm-rectify-open'));
    const pick = (id) => fireEvent.click(screen.getByTestId(`invoice-confirm-rectify-option-${id}`));
    const apply = () => fireEvent.click(screen.getByTestId('invoice-confirm-rectify-apply'));
    // The dialog doubles as its own backdrop, so this is the cancel path that needs no label.
    const dismissPicker = () => fireEvent.click(screen.getByTestId('invoice-confirm-rectify-picker-modal'));

    it('is not rendered at all when no rectifiableInvoicesUrl is supplied', async () => {
      mockRectifyFetch();
      renderModal();
      await act(async () => {});
      expect(screen.queryByTestId('invoice-confirm-rectify-open')).not.toBeInTheDocument();
      expect(confirmBtn()).not.toBeDisabled();
      expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('rectifiableInvoices'))).toBe(false);
    });

    it('shows the compact field, keeping the catalogue behind the trigger', async () => {
      mockRectifyFetch();
      renderModal({ rectifiableInvoicesUrl: RECTIFY_URL });
      await waitFor(() => {
        expect(screen.getByTestId('invoice-confirm-rectify-open')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('invoice-confirm-rectify-option-inv-1')).not.toBeInTheDocument();
    });

    it('blocks the primary button until a picked invoice is applied', async () => {
      mockRectifyFetch();
      renderModal({ rectifiableInvoicesUrl: RECTIFY_URL });
      await waitFor(() => {
        expect(screen.getByTestId('invoice-confirm-rectify-open')).toBeInTheDocument();
      });
      expect(confirmBtn()).toBeDisabled();

      openPicker();
      pick('inv-1');
      // A draft click is not a decision.
      expect(confirmBtn()).toBeDisabled();

      apply();
      await waitFor(() => expect(confirmBtn()).not.toBeDisabled());
    });

    it('hands every applied invoice to onConfirm as the second argument', async () => {
      mockRectifyFetch();
      const { props } = renderModal({ rectifiableInvoicesUrl: RECTIFY_URL });
      await waitFor(() => {
        expect(screen.getByTestId('invoice-confirm-rectify-open')).toBeInTheDocument();
      });
      openPicker();
      pick('inv-1');
      pick('inv-2');
      apply();
      await waitFor(() => expect(confirmBtn()).not.toBeDisabled());

      fireEvent.click(confirmBtn());
      // C_Invoice_Reverse is a 1:N bridge — one return can correct several invoices.
      expect(props.onConfirm).toHaveBeenCalledWith('', ['inv-1', 'inv-2']);
    });

    it('accepts the backend suggestion as a preselection', async () => {
      mockRectifyFetch({ suggestedInvoiceIds: ['inv-2'] });
      const { props } = renderModal({ rectifiableInvoicesUrl: RECTIFY_URL });
      await waitFor(() => {
        expect(screen.getByTestId('invoice-confirm-rectify-selected-inv-2')).toBeInTheDocument();
      });
      expect(confirmBtn()).not.toBeDisabled();
      fireEvent.click(confirmBtn());
      expect(props.onConfirm).toHaveBeenCalledWith('', ['inv-2']);
    });

    it('re-blocks the primary button when the last selected invoice is removed', async () => {
      mockRectifyFetch({ suggestedInvoiceIds: ['inv-2'] });
      renderModal({ rectifiableInvoicesUrl: RECTIFY_URL });
      await waitFor(() => expect(confirmBtn()).not.toBeDisabled());
      fireEvent.click(screen.getByTestId('invoice-confirm-rectify-remove-inv-2'));
      await waitFor(() => expect(confirmBtn()).toBeDisabled());
    });

    it('discards the picker draft on cancel — the preselection survives untouched', async () => {
      mockRectifyFetch({ suggestedInvoiceIds: ['inv-2'] });
      const { props } = renderModal({ rectifiableInvoicesUrl: RECTIFY_URL });
      await waitFor(() => {
        expect(screen.getByTestId('invoice-confirm-rectify-selected-inv-2')).toBeInTheDocument();
      });

      openPicker();
      pick('inv-1');   // add another one...
      pick('inv-2');   // ...and drop the preselected one
      dismissPicker(); // walk away without applying

      expect(screen.queryByTestId('invoice-confirm-rectify-picker-modal')).not.toBeInTheDocument();
      expect(screen.getByTestId('invoice-confirm-rectify-selected-inv-2')).toBeInTheDocument();
      expect(screen.queryByTestId('invoice-confirm-rectify-selected-inv-1')).not.toBeInTheDocument();

      fireEvent.click(confirmBtn());
      expect(props.onConfirm).toHaveBeenCalledWith('', ['inv-2']);
    });

    it('keeps the primary button blocked when there is genuinely nothing to rectify', async () => {
      mockRectifyFetch({ invoices: [] });
      renderModal({ rectifiableInvoicesUrl: RECTIFY_URL });
      await waitFor(() => {
        expect(screen.getByTestId('invoice-confirm-rectify-empty')).toBeInTheDocument();
      });
      expect(confirmBtn()).toBeDisabled();
    });
  });

  // ── cardAmountLabel — bulk callers with no single trustworthy total ────────
  // A bulk toolbar action (N selected documents) has no linkedOrders total and no
  // documentNo that means anything, so it passes a label instead of a `data` total.

  describe('cardAmountLabel', () => {
    it('overrides the computed total when provided', () => {
      renderModal({ data: makeData({ grandTotalAmount: 1234.56 }), cardAmountLabel: '3 albaranes' });
      expect(screen.getByText('3 albaranes')).toBeInTheDocument();
      expect(screen.queryByText(/1\.234,56/)).not.toBeInTheDocument();
    });

    it('overrides the documentNo fallback when the total is 0', () => {
      renderModal({ data: makeData({ grandTotalAmount: 0, documentNo: 'SO-999' }), cardAmountLabel: '3 albaranes' });
      expect(screen.getByText('3 albaranes')).toBeInTheDocument();
      expect(screen.queryByText('SO-999')).not.toBeInTheDocument();
    });

    it('leaves the computed total untouched when omitted (single-record behavior unchanged)', () => {
      renderModal({ data: makeData({ grandTotalAmount: 1234.56, 'currency$_identifier': 'EUR' }) });
      expect(screen.getByText(/1\.234,56\s€/)).toBeInTheDocument();
    });
  });
});
