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

  // ── Checkbox state ─────────────────────────────────────────────────────────

  it('starts with checkbox checked', () => {
    const { container } = renderModal();
    // The checkmark SVG polyline is rendered only when checked
    expect(container.querySelector('polyline')).toBeInTheDocument();
  });

  it('toggles checkbox when the row is clicked', () => {
    const { container } = renderModal();
    // Find the clickable checkbox row by its title text's parent
    const checkboxRow = screen.getByText('soCreateInvoiceTitle').closest('div[style]');
    fireEvent.click(checkboxRow);
    // After toggle: unchecked → no polyline
    expect(container.querySelector('polyline')).not.toBeInTheDocument();
  });

  it('confirm button is enabled when checkbox is checked and not loading', () => {
    renderModal();
    const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
    expect(confirmBtn).not.toBeDisabled();
  });

  it('confirm button is disabled when checkbox is unchecked', () => {
    renderModal();
    const checkboxRow = screen.getByText('soCreateInvoiceTitle').closest('div[style]');
    fireEvent.click(checkboxRow); // uncheck
    const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
    expect(confirmBtn).toBeDisabled();
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

  it('calls onConfirm when confirm button is clicked and checkbox is checked (showPriceListPicker=false)', () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByText('soCreateDocsBtn'));
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    // ETP-4028: onConfirm is always called with the priceListId arg (unset here, since
    // the picker is not shown) — old call sites that ignore the arg keep working.
    expect(props.onConfirm).toHaveBeenCalledWith('');
  });

  it('does not call onConfirm when checkbox is unchecked', () => {
    const { props } = renderModal();
    const checkboxRow = screen.getByText('soCreateInvoiceTitle').closest('div[style]');
    fireEvent.click(checkboxRow); // uncheck
    // Confirm button is disabled — verify attribute before asserting
    const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
    expect(confirmBtn).toBeDisabled();
    expect(props.onConfirm).not.toHaveBeenCalled();
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

  it('shows soGenerateDocs section label', () => {
    renderModal();
    expect(screen.getByText('soGenerateDocs')).toBeInTheDocument();
  });

  it('shows soCreateInvoiceTitle inside the checkbox row', () => {
    renderModal();
    expect(screen.getByText('soCreateInvoiceTitle')).toBeInTheDocument();
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

    it('auto-selects the price list flagged as default', async () => {
      mockPriceListFetch([
        makePriceList({ id: 'pl-a', name: 'PL A', default: false }),
        makePriceList({ id: 'pl-b', name: 'PL B', default: true }),
      ]);
      renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl });
      await waitFor(() => {
        const select = screen.getByTestId('select-control');
        expect(select.value).toBe('pl-b');
      });
    });

    it('falls back to the first matching price list when none is flagged default', async () => {
      mockPriceListFetch([
        makePriceList({ id: 'pl-a', name: 'PL A', default: false }),
        makePriceList({ id: 'pl-b', name: 'PL B', default: false }),
      ]);
      renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl });
      await waitFor(() => {
        const select = screen.getByTestId('select-control');
        expect(select.value).toBe('pl-a');
      });
    });

    it('confirm button is disabled until a price list is auto-selected/chosen, even with the checkbox checked', async () => {
      // Never-resolving fetch — loadingPriceLists stays true, priceListId stays ''
      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
      renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl });
      const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
      expect(confirmBtn).toBeDisabled();
    });

    it('confirm button becomes enabled once a default price list is auto-selected', async () => {
      mockPriceListFetch([makePriceList({ id: 'pl-only', default: true })]);
      renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl });
      await waitFor(() => {
        const confirmBtn = screen.getByText('soCreateDocsBtn').closest('button');
        expect(confirmBtn).not.toBeDisabled();
      });
    });

    it('calls onConfirm with the selected priceListId when confirmed', async () => {
      mockPriceListFetch([makePriceList({ id: 'pl-selected', default: true })]);
      const onConfirm = vi.fn();
      renderModal({ showPriceListPicker: true, isSOTrx: true, apiBaseUrl, onConfirm });
      await waitFor(() => {
        expect(screen.getByText('soCreateDocsBtn').closest('button')).not.toBeDisabled();
      });
      fireEvent.click(screen.getByText('soCreateDocsBtn'));
      expect(onConfirm).toHaveBeenCalledWith('pl-selected');
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
      expect(onConfirm).toHaveBeenCalledWith('pl-b');
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
  });
});
