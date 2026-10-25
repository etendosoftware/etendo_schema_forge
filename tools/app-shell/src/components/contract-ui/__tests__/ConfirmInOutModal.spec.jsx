// @vitest-environment jsdom
// @covers tools/app-shell/src/components/contract-ui/ConfirmInOutModal.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ETP-5316 — the modal's only use of `useUI()` is `translateBackendError(err.message, ui, …)`,
// and this spec renders without a LocaleProvider, so the real hook echoes every key back and no
// mapping could ever be observed. A PARTIAL mock keeps the rest of `@/i18n` real (PriceListPicker
// uses it too) while supplying just the entries the AD_MESSAGE-key route needs. Everything not
// listed still echoes its key, which is exactly the "translation missing" input the pre-existing
// error tests below rely on.
const CONFIRM_UI_DICT = {
  'backendError.docLinesWithoutQuantity': 'Hay líneas sin cantidad.',
  'backendError.docLinesLockedProduct': 'Hay líneas con productos bloqueados que no pueden entregarse.',
  'backendError.quotaExceeded': 'Has alcanzado el límite de tu plan.',
  'backendError.quotaCheckFailed': 'No se pudo comprobar la cuota del plan; no se ha guardado nada.',
};
vi.mock('@/i18n', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useUI: () => (key) => CONFIRM_UI_DICT[key] ?? key };
});

// Radix Select cannot run in JSDOM — replace with a native <select> that
// honours value/onValueChange and renders options via SelectItem. Only
// exercised by the showPriceListPicker=true suite below; every other test in
// this file never mounts a Select at all. Mirrors the mock in
// CreateInvoiceConfirmModal.vitest.jsx / PriceListPicker.vitest.jsx.
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

import ConfirmInOutModal from '../ConfirmInOutModal.jsx';
import * as backendErrorsModule from '@/lib/backendErrors.js';
import { setPeriodRecovery } from '@/lib/periodNotAvailable.js';
import { inlineFontFamiliesUpToBody } from './fontInheritance.js';

const BASE_PROPS = {
  base: '/sws/neo',
  headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
  recordId: 'REC-001',
  specName: 'goods-shipment',
  entityName: 'goodsShipment',
  invoiceAction: 'createInvoice',
  defaultCreateInvoice: false,
  title: 'Confirm Shipment',
  docInfo: { documentNo: 'SHIP-001', bpName: 'Acme Corp' },
  infoRowPre: 'You are about to confirm',
  infoRowBold: 'SHIP-001',
  infoRowPost: 'from Acme Corp',
  cardTitle: 'Create Invoice',
  cardDesc: 'Also create an invoice for this shipment',
  confirmLabel: 'Confirm',
  confirmWithInvoiceLabel: 'Confirm + Invoice',
  processingLabel: 'Processing...',
  cancelLabel: 'Cancel',
  onConfirmed: vi.fn(),
  onClose: vi.fn(),
};

describe('ConfirmInOutModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      // ETP-5381: the invoice action now returns documentStatus, and it comes back confirmed.
      json: async () => ({ response: { data: { id: 'INV-001', documentNo: 'FAC-001', grandTotalAmount: 500, documentStatus: 'CO' } } }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the modal title', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} />);
    expect(screen.getByText('Confirm Shipment')).toBeInTheDocument();
  });

  it('renders subtitle parts: documentNo and bpName', () => {
    // Use a docInfo with a unique documentNo that does not appear in infoRowBold
    render(<ConfirmInOutModal {...BASE_PROPS} docInfo={{ documentNo: 'SHIP-999', bpName: 'Acme Corp' }} />);
    expect(screen.getByText('SHIP-999')).toBeInTheDocument();
    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
  });

  it('renders subtitle with amount when total is provided, grouped with the real currency symbol (never the raw ISO code)', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} docInfo={{ documentNo: 'SHIP-002', bpName: 'Corp', total: 1234.5, currency: 'EUR' }} />);
    // Exact match — a tolerant regex would pass even with the missing-useGrouping /
    // raw-currency-code bug whenever the substring happens to appear.
    expect(screen.getByText(/1\.234,50\s€/)).toBeInTheDocument();
    expect(screen.queryByText(/EUR/)).toBeNull();
  });

  it('omits subtitle rows that are null/undefined', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} docInfo={{}} />);
    // No subtitle section → no dots separator rendered
    expect(screen.queryByText('·')).not.toBeInTheDocument();
  });

  it('renders the cancel button', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} />);
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(BASE_PROPS.onClose).toHaveBeenCalled();
  });

  it('calls onClose when × close button is clicked', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} />);
    fireEvent.click(screen.getByText('×'));
    expect(BASE_PROPS.onClose).toHaveBeenCalled();
  });

  it('shows confirm label when createInvoice is off (defaultCreateInvoice=false)', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={false} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('shows confirmWithInvoiceLabel when defaultCreateInvoice is true', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={true} />);
    expect(screen.getByText('Confirm + Invoice')).toBeInTheDocument();
  });

  it('toggle switch changes confirm label between Confirm and Confirm + Invoice', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={false} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();

    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    expect(screen.getByText('Confirm + Invoice')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  it('info row and toggle are hidden when skipDocumentAction=true', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} skipDocumentAction={true} />);
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('You are about to confirm')).not.toBeInTheDocument();
  });

  it('calls onConfirmed after successful confirm (no invoice toggle)', async () => {
    const onConfirmed = vi.fn();
    render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={false} onConfirmed={onConfirmed} />);
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith({ invoice: null }));
  });

  it('calls onConfirmed with invoice data when createInvoice toggle is on', async () => {
    const onConfirmed = vi.fn();
    render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={true} onConfirmed={onConfirmed} />);
    fireEvent.click(screen.getByText('Confirm + Invoice'));
    // ETP-5381: documentStatus travels with the invoice so ConfirmResultModal can badge it
    // as Confirmada — without it the result modal falls back to the Borrador badge.
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith({
      invoice: { id: 'INV-001', documentNo: 'FAC-001', amount: 500, documentStatus: 'CO' },
    }));
  });

  it('shows error message when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ response: { message: 'Server error' } }),
    }));
    render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={false} />);
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument());
  });

  // ETP-5577 — a period refusal offers its way out inside the modal: the action closes the modal
  // and opens the calendar on the fiscal year of the document's date.
  it('offers the calendar on a period refusal, dated from periodDate', async () => {
    const go = vi.fn();
    setPeriodRecovery({ labelKey: 'periodNotAvailableOpenCalendar', go });
    try {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: 'El Periodo no existe o no está abierto', messageKeys: ['PeriodNotAvailable'] }),
      }));
      const onClose = vi.fn();
      render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={false} periodDate="2027-01-15" onClose={onClose} />);
      fireEvent.click(screen.getByText('Confirm'));
      const link = await screen.findByTestId('PeriodRecoveryLink');
      expect(link).toHaveTextContent('periodNotAvailableOpenCalendar');
      fireEvent.click(link);
      expect(onClose).toHaveBeenCalled();
      expect(go).toHaveBeenCalledWith('2027-01-15');
    } finally {
      setPeriodRecovery(null);
    }
  });

  // ── ETP-4848: invoiceAction gating + default-checked toggle ────────────────

  it('does not render the invoice toggle or info row when invoiceAction is omitted', () => {
    const { invoiceAction, ...propsWithoutInvoiceAction } = BASE_PROPS;
    render(<ConfirmInOutModal {...propsWithoutInvoiceAction} />);
    expect(screen.queryByTestId('confirm-modal-invoice-toggle')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('You are about to confirm')).not.toBeInTheDocument();
  });

  it('does not render the invoice toggle when invoiceAction is undefined explicitly', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} invoiceAction={undefined} />);
    expect(screen.queryByTestId('confirm-modal-invoice-toggle')).not.toBeInTheDocument();
  });

  it('confirm button still works and calls only documentAction (no invoice call) when invoiceAction is omitted', async () => {
    const onConfirmed = vi.fn();
    const { invoiceAction, ...propsWithoutInvoiceAction } = BASE_PROPS;
    render(<ConfirmInOutModal {...propsWithoutInvoiceAction} onConfirmed={onConfirmed} />);
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith({ invoice: null }));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch.mock.calls[0][0]).toContain('/action/documentAction');
  });

  it('toggle renders checked (aria-checked="true") by default when invoiceAction is provided and defaultCreateInvoice=true', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} invoiceAction="createInvoice" defaultCreateInvoice={true} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('toggle renders unchecked (aria-checked="false") by default when invoiceAction is provided and defaultCreateInvoice=false', () => {
    render(<ConfirmInOutModal {...BASE_PROPS} invoiceAction="createInvoice" defaultCreateInvoice={false} />);
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  // ── ETP-4942 — showPriceListPicker ─────────────────────────────────────────

  function mockFetchRouter({ priceLists = [], invoiceOk = true, invoiceErrorMessage } = {}) {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url);
      if (u.includes('/price-list/priceList')) {
        return Promise.resolve({ ok: true, json: async () => ({ response: { data: priceLists } }) });
      }
      if (u.includes('/action/documentAction')) {
        return Promise.resolve({ ok: true, json: async () => ({ response: { data: {} } }) });
      }
      if (!invoiceOk) {
        return Promise.resolve({
          ok: false,
          json: async () => ({ response: { message: invoiceErrorMessage || 'Error' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        // ETP-5381: the invoice action now returns documentStatus, and it comes back confirmed.
      json: async () => ({ response: { data: { id: 'INV-001', documentNo: 'FAC-001', grandTotalAmount: 500, documentStatus: 'CO' } } }),
      });
    }));
  }

  const PRICE_LIST_PROPS = {
    ...BASE_PROPS,
    invoiceAction: 'createDraftInvoice',
    defaultCreateInvoice: true,
    showPriceListPicker: true,
    isSOTrx: true,
  };

  it('does not render the price-list select when showPriceListPicker is false, even with the invoice toggle on', async () => {
    mockFetchRouter({ priceLists: [{ id: 'pl-1', name: 'PL', active: true, salesPriceList: true, default: true }] });
    render(<ConfirmInOutModal {...BASE_PROPS} invoiceAction="createDraftInvoice" defaultCreateInvoice={true}
      showPriceListPicker={false} />);
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByTestId('confirm-modal-price-list-select')).not.toBeInTheDocument();
  });

  it('does not render the price-list select when the invoice toggle is off, even with showPriceListPicker true', async () => {
    mockFetchRouter({ priceLists: [{ id: 'pl-1', name: 'PL', active: true, salesPriceList: true, default: true }] });
    render(<ConfirmInOutModal {...PRICE_LIST_PROPS} defaultCreateInvoice={false} hasLinkedOrder={true} />);
    await new Promise(r => setTimeout(r, 0));
    expect(screen.queryByTestId('confirm-modal-price-list-select')).not.toBeInTheDocument();
  });

  it('renders the price-list select once the invoice toggle is switched on', async () => {
    mockFetchRouter({ priceLists: [{ id: 'pl-1', name: 'PL', active: true, salesPriceList: true, default: true }] });
    render(<ConfirmInOutModal {...PRICE_LIST_PROPS} defaultCreateInvoice={false} hasLinkedOrder={true} />);
    expect(screen.queryByTestId('confirm-modal-price-list-select')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-modal-price-list-select')).toBeInTheDocument();
    });
  });

  it('renders the price-list select when showPriceListPicker=true and the toggle is on by default', async () => {
    mockFetchRouter({ priceLists: [{ id: 'pl-1', name: 'PL', active: true, salesPriceList: true, default: true }] });
    render(<ConfirmInOutModal {...PRICE_LIST_PROPS} hasLinkedOrder={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-modal-price-list-select')).toBeInTheDocument();
    });
  });

  it('blocks the confirm button when hasLinkedOrder=false and no price list has been chosen', async () => {
    mockFetchRouter({ priceLists: [] }); // no match → priceListId stays ''
    render(<ConfirmInOutModal {...PRICE_LIST_PROPS} hasLinkedOrder={false} />);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-modal-price-list-select')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-modal-confirm-btn')).toBeDisabled();
  });

  it('does not block the confirm button when hasLinkedOrder=true, even with no price list chosen', async () => {
    mockFetchRouter({ priceLists: [] }); // no match → priceListId stays ''
    render(<ConfirmInOutModal {...PRICE_LIST_PROPS} hasLinkedOrder={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-modal-price-list-select')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-modal-confirm-btn')).not.toBeDisabled();
  });

  it('does NOT auto-select any price list when hasLinkedOrder=false and no real defaultPriceListId is provided, even if one is flagged system-default (mandatory field must not autofill)', async () => {
    mockFetchRouter({ priceLists: [{ id: 'pl-default', name: 'Default PL', active: true, salesPriceList: true, default: true }] });
    render(<ConfirmInOutModal {...PRICE_LIST_PROPS} hasLinkedOrder={false} />);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-modal-price-list-select')).toBeInTheDocument();
    });
    // allowGenericFallback is disabled whenever the field is mandatory (no linked
    // order) — the system `default` flag must never silently satisfy it.
    expect(screen.getByTestId('confirm-modal-confirm-btn')).toBeDisabled();
  });

  it('auto-selects and enables the confirm button when a real defaultPriceListId (e.g. the BP tariff) is provided, even with hasLinkedOrder=false', async () => {
    mockFetchRouter({ priceLists: [{ id: 'pl-bp-default', name: 'BP Tariff', active: true, salesPriceList: true, default: false }] });
    render(<ConfirmInOutModal {...PRICE_LIST_PROPS} hasLinkedOrder={false} defaultPriceListId="pl-bp-default" />);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-modal-confirm-btn')).not.toBeDisabled();
    });
  });

  it('sends the selected priceListId in the invoice action request body', async () => {
    mockFetchRouter({ priceLists: [{ id: 'pl-selected', name: 'Selected PL', active: true, salesPriceList: true, default: true }] });
    // With no linked order the field is mandatory (allowGenericFallback=false), so a
    // real defaultPriceListId (simulating the BP's own tariff) is required to reach
    // an enabled confirm state before we can assert on what travels in the request body.
    render(<ConfirmInOutModal {...PRICE_LIST_PROPS} hasLinkedOrder={false} defaultPriceListId="pl-selected" />);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-modal-confirm-btn')).not.toBeDisabled();
    });
    fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));
    await waitFor(() => {
      const invoiceCall = globalThis.fetch.mock.calls.find(([url]) => String(url).includes('/createDraftInvoice'));
      expect(invoiceCall).toBeTruthy();
      expect(invoiceCall[1].body).toBe(JSON.stringify({ priceListId: 'pl-selected' }));
    });
  });

  it('sends the manually-selected priceListId in the invoice action request body when the user picks one by hand (no defaultPriceListId)', async () => {
    mockFetchRouter({
      priceLists: [
        { id: 'pl-a', name: 'PL A', active: true, salesPriceList: true, default: false },
        { id: 'pl-b', name: 'PL B', active: true, salesPriceList: true, default: true },
      ],
    });
    render(<ConfirmInOutModal {...PRICE_LIST_PROPS} hasLinkedOrder={false} />);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-modal-price-list-select')).toBeInTheDocument();
    });
    expect(screen.getByTestId('confirm-modal-confirm-btn')).toBeDisabled();

    // ETP-5410 follow-up: the tariff picker is now the real CreatableSearchSelect (focus to
    // open, mousedown an option), not the mocked native <select> this used to drive.
    fireEvent.focus(screen.getByTestId('field-confirm-modal-price-list'));
    fireEvent.mouseDown(screen.getByTestId('option-confirm-modal-price-list-pl-a'));
    await waitFor(() => {
      expect(screen.getByTestId('confirm-modal-confirm-btn')).not.toBeDisabled();
    });

    fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));
    await waitFor(() => {
      const invoiceCall = globalThis.fetch.mock.calls.find(([url]) => String(url).includes('/createDraftInvoice'));
      expect(invoiceCall).toBeTruthy();
      expect(invoiceCall[1].body).toBe(JSON.stringify({ priceListId: 'pl-a' }));
    });
  });

  it('does not include priceListId in the invoice action body when the picker is not active', async () => {
    mockFetchRouter({});
    render(<ConfirmInOutModal {...BASE_PROPS} invoiceAction="createDraftInvoice" defaultCreateInvoice={true}
      showPriceListPicker={false} />);
    fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));
    await waitFor(() => {
      const invoiceCall = globalThis.fetch.mock.calls.find(([url]) => String(url).includes('/createDraftInvoice'));
      expect(invoiceCall).toBeTruthy();
      expect(invoiceCall[1].body).toBe(JSON.stringify({}));
    });
  });

  it('translates the backend error via translateBackendError for the price-list-required error banner', async () => {
    const priceListRequiredMsg = 'No Price List could be resolved for this invoice: select a tariff or '
      + 'configure a default Price List for the Business Partner';
    const spy = vi.spyOn(backendErrorsModule, 'translateBackendError');
    mockFetchRouter({ priceLists: [], invoiceOk: false, invoiceErrorMessage: priceListRequiredMsg });
    // hasLinkedOrder=true so the confirm button stays enabled without a manual selection —
    // exercising the backend's own fail-fast guard (ETP-4942) rather than the frontend gate.
    render(<ConfirmInOutModal {...PRICE_LIST_PROPS} hasLinkedOrder={true} />);
    await waitFor(() => {
      expect(screen.getByTestId('confirm-modal-confirm-btn')).not.toBeDisabled();
    });
    fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));
    await waitFor(() => {
      expect(screen.getByText(priceListRequiredMsg)).toBeInTheDocument();
    });
    // ETP-5316 added a third argument: the AD_MESSAGE keys the backend sent, `undefined` here
    // because this error body carries none.
    expect(spy).toHaveBeenCalledWith(
      priceListRequiredMsg, expect.any(Function), { messageKeys: undefined },
    );
    spy.mockRestore();
  });

  // ETP-5316 — confirming a shipment/return whose lines are broken used to render core's own
  // sentence, which cites AD line numbers (10, 20, 30 — numbered in tens, unrelated to the row
  // positions in the grid): unlocatable for the user and unmatchable for us, since the numbers
  // differ per document. The modal now hands the AD_MESSAGE keys the backend extracted BEFORE
  // translating to translateBackendError, which resolves the failure by identity.
  describe('AD_MESSAGE key mapping on the inline error (ETP-5316)', () => {
    const CORE_SENTENCE = 'En la línea 10, 20, 30, 40, Cuando el producto no esta vacío entonces '
      + 'la cantidad movida no debe ser cero.';

    function mockDocumentActionFailure(body) {
      vi.stubGlobal('fetch', vi.fn((url) => {
        if (String(url).includes('/action/documentAction')) {
          return Promise.resolve({ ok: false, status: 400, json: async () => body });
        }
        return Promise.resolve({ ok: true, json: async () => ({ response: { data: {} } }) });
      }));
    }

    it('renders the key-mapped wording instead of the core sentence', async () => {
      mockDocumentActionFailure({
        status: 'error',
        message: CORE_SENTENCE,
        messageKeys: ['Inline', 'ProductNotNullAndMovementQtyZero'],
      });
      render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={false} />);
      fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));

      await waitFor(() => expect(screen.getByText('Hay líneas sin cantidad.')).toBeInTheDocument());
      // The AD line numbers are gone from what the user reads.
      expect(screen.queryByText(CORE_SENTENCE)).toBeNull();
    });

    it('reads the keys out of the response.* envelope too', async () => {
      mockDocumentActionFailure({
        response: { message: CORE_SENTENCE, messageKeys: ['lockedProduct'] },
      });
      render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={false} />);
      fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));

      await waitFor(() => expect(
        screen.getByText('Hay líneas con productos bloqueados que no pueden entregarse.'),
      ).toBeInTheDocument());
    });

    // Against a backend that does not send keys (the two repos deploy separately), the modal
    // must show exactly what it showed before — core's own phrase.
    it('shows the core sentence unchanged when the backend sends no keys', async () => {
      mockDocumentActionFailure({ status: 'error', message: CORE_SENTENCE });
      render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={false} />);
      fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));

      await waitFor(() => expect(screen.getByText(CORE_SENTENCE)).toBeInTheDocument());
    });

    it('shows the core sentence when the keys are not ones we map', async () => {
      mockDocumentActionFailure({
        status: 'error', message: CORE_SENTENCE, messageKeys: ['Inline', 'SomeUnknownToken'],
      });
      render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={false} />);
      fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));

      await waitFor(() => expect(screen.getByText(CORE_SENTENCE)).toBeInTheDocument());
    });

    // buildBackendError is used for BOTH POSTs; the invoice leg must not be the one path that
    // loses the keys.
    it('maps a failure raised by the invoice action, not just by documentAction', async () => {
      vi.stubGlobal('fetch', vi.fn((url) => {
        const u = String(url);
        if (u.includes('/action/documentAction')) {
          return Promise.resolve({ ok: true, json: async () => ({ response: { data: {} } }) });
        }
        if (u.includes('/createInvoice')) {
          return Promise.resolve({
            ok: false,
            status: 400,
            json: async () => ({ message: CORE_SENTENCE, messageKeys: ['ProductNotNullAndMovementQtyZero'] }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) });
      }));
      render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={true} />);
      fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));

      await waitFor(() => expect(screen.getByText('Hay líneas sin cantidad.')).toBeInTheDocument());
    });
  });

  // ETP-5051 — the NEO actions that create documents refuse with 403
  // `{ error: { code: 'QUOTA_EXCEEDED', message, quota } }`. buildBackendError read only
  // `response.message` / `message`, so the user read "Error (403)" and the quota banner was never
  // told. The refusal must render as the translated quota sentence and be announced.
  describe('plan-quota refusal of a document-creating action (ETP-5051)', () => {
    it('shows the translated quota message and announces the refusal', async () => {
      const announced = vi.fn();
      window.addEventListener('etendo:quota-refused', announced);
      vi.stubGlobal('fetch', vi.fn((url) => {
        const u = String(url);
        if (u.includes('/action/documentAction')) {
          return Promise.resolve({ ok: true, json: async () => ({ response: { data: {} } }) });
        }
        if (u.includes('/createInvoice')) {
          return Promise.resolve({
            ok: false,
            status: 403,
            json: async () => ({
              error: {
                code: 'QUOTA_EXCEEDED',
                message: 'Quota exceeded: Posted sales invoices (100/100 Inv)',
                quota: {
                  resourceKey: 'CONFIRM_INOUT_INVOICES', resourceName: 'Posted sales invoices',
                  unitLabel: 'Inv', includedQty: 100, consumed: 100, verdict: 'DENY',
                },
              },
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) });
      }));
      try {
        render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={true} />);
        fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));

        await waitFor(() => expect(screen.getByText('Has alcanzado el límite de tu plan.')).toBeInTheDocument());
        expect(screen.queryByText('Error (403)')).toBeNull();
        expect(announced).toHaveBeenCalledTimes(1);
      } finally {
        window.removeEventListener('etendo:quota-refused', announced);
      }
    });

    /** documentAction answers `docBody`/`docStatus`; the invoice action answers `invBody`/`invStatus`. */
    function routeLegs({ docStatus = 200, docBody = { response: { data: {} } }, invStatus = 200, invBody = { response: { data: { id: 'INV-1' } } } }) {
      vi.stubGlobal('fetch', vi.fn((url) => {
        const u = String(url);
        if (u.includes('/action/documentAction')) {
          return Promise.resolve({ ok: docStatus < 400, status: docStatus, json: async () => docBody });
        }
        if (u.includes('/createInvoice')) {
          return Promise.resolve({ ok: invStatus < 400, status: invStatus, json: async () => invBody });
        }
        return Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) });
      }));
    }
    const calledAction = (name) => globalThis.fetch.mock.calls.some(([url]) => String(url).includes(`/action/${name}`));

    it('shows the check-failed sentence for a 500 QUOTA_CHECK_FAILED on the invoice leg', async () => {
      routeLegs({
        invStatus: 500,
        invBody: { error: { code: 'QUOTA_CHECK_FAILED', status: 500, message: 'The quota check failed; nothing was saved. Try again.' } },
      });
      render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={true} />);
      fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));

      await waitFor(() => expect(screen.getByText('No se pudo comprobar la cuota del plan; no se ha guardado nada.')).toBeInTheDocument());
      expect(screen.queryByText('Error (500)')).toBeNull();
    });

    // Completing the document itself can be what the plan refuses: the invoice leg never runs.
    it('shows the quota sentence when documentAction is refused, and creates no invoice', async () => {
      const announced = vi.fn();
      window.addEventListener('etendo:quota-refused', announced);
      routeLegs({
        docStatus: 403,
        docBody: {
          error: {
            code: 'QUOTA_EXCEEDED', status: 403, message: 'Quota exceeded: Goods shipments (50/50)',
            quota: { resourceKey: 'CONFIRM_INOUT_SHIPMENTS', resourceName: 'Goods shipments', includedQty: 50, consumed: 50, verdict: 'DENY' },
          },
        },
      });
      const onConfirmed = vi.fn();
      try {
        render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={true} onConfirmed={onConfirmed} />);
        fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));

        await waitFor(() => expect(screen.getByText('Has alcanzado el límite de tu plan.')).toBeInTheDocument());
        expect(screen.queryByText('Error (403)')).toBeNull();
        expect(calledAction('createInvoice')).toBe(false);
        expect(onConfirmed).not.toHaveBeenCalled();
        expect(announced).toHaveBeenCalledTimes(1);
      } finally {
        window.removeEventListener('etendo:quota-refused', announced);
      }
    });

    // Any other 403 reads exactly as before this change, and is not announced as a quota refusal.
    it('keeps "Error (403)" for a 403 that is not a quota refusal', async () => {
      const announced = vi.fn();
      window.addEventListener('etendo:quota-refused', announced);
      routeLegs({ invStatus: 403, invBody: { error: { status: 403, message: 'Access denied' } } });
      try {
        render(<ConfirmInOutModal {...BASE_PROPS} defaultCreateInvoice={true} />);
        fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));

        await waitFor(() => expect(screen.getByText('Error (403)')).toBeInTheDocument());
        expect(announced).not.toHaveBeenCalled();
      } finally {
        window.removeEventListener('etendo:quota-refused', announced);
      }
    });
  });

  // ── ETP-5381 — rectifiable-invoice picker ──────────────────────────────────
  // The invoice this modal creates is now confirmed in the same request, and the
  // completion is rejected unless it declares which invoice it rectifies. So the
  // picker is not decoration: it is a hard gate on the confirm button, and its
  // selection has to reach the invoice action's request body.

  const RECTIFY_URL = '/sws/neo/return-material-receipt/returnReceipt/REC-001/action/rectifiableInvoices';

  const RECTIFIABLE = [
    { id: 'inv-1', documentNo: 'FAC-001', invoiceDate: '2026-08-10', grandTotalAmount: 300, currency: 'EUR' },
    { id: 'inv-2', documentNo: 'FAC-002', invoiceDate: '2026-08-11', grandTotalAmount: 200, currency: 'EUR' },
  ];

  function mockRectifyRouter({ invoices = RECTIFIABLE, suggestedInvoiceIds } = {}) {
    vi.stubGlobal('fetch', vi.fn((url) => {
      const u = String(url);
      if (u.includes('/action/rectifiableInvoices')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ response: { data: { invoices, suggestedInvoiceIds } } }),
        });
      }
      if (u.includes('/action/documentAction')) {
        return Promise.resolve({ ok: true, json: async () => ({ response: { data: {} } }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ response: { data: { id: 'INV-001', documentNo: 'FAC-NEW', grandTotalAmount: 500 } } }),
      });
    }));
  }

  const RECTIFY_PROPS = {
    ...BASE_PROPS,
    specName: 'return-material-receipt',
    entityName: 'returnReceipt',
    invoiceAction: 'createReturnInvoice',
    defaultCreateInvoice: true,
    rectifiableInvoicesUrl: RECTIFY_URL,
    token: 'test-token',
  };

  const invoiceCall = () =>
    globalThis.fetch.mock.calls.find(([url]) => String(url).includes('/action/createReturnInvoice'));

  describe('rectifiable-invoice picker (ETP-5381)', () => {
    const openPicker = () => fireEvent.click(screen.getByTestId('confirm-modal-rectify-open'));
    const pick = (id) => fireEvent.click(screen.getByTestId(`confirm-modal-rectify-option-${id}`));
    const apply = () => fireEvent.click(screen.getByTestId('confirm-modal-rectify-apply'));
    // The picker dialog doubles as its own backdrop: clicking it is the cancel path that needs no
    // translated label, which matters here because this suite runs against the real i18n bundle.
    const dismissPicker = () => fireEvent.click(screen.getByTestId('confirm-modal-rectify-picker-modal'));

    it('renders the compact field — the catalogue stays behind the trigger', async () => {
      mockRectifyRouter();
      render(<ConfirmInOutModal {...RECTIFY_PROPS} />);
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal-rectify-open')).toBeInTheDocument();
      });
      // The host modal already carries the summary card and the generate-documents block; an
      // inline list of every invoice in the system pushed those actions below the fold.
      expect(screen.queryByTestId('confirm-modal-rectify-option-inv-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('confirm-modal-rectify-picker-modal')).not.toBeInTheDocument();
    });

    it('lists the candidates in a picker that sits on top of the host modal without breaking it', async () => {
      mockRectifyRouter();
      render(<ConfirmInOutModal {...RECTIFY_PROPS} />);
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal-rectify-open')).toBeInTheDocument();
      });
      openPicker();

      expect(screen.getByTestId('confirm-modal-rectify-option-inv-1')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-modal-rectify-option-inv-2')).toBeInTheDocument();
      // Portalled above the host modal (tier 50), which must survive underneath.
      expect(screen.getByTestId('confirm-modal-rectify-picker-modal')).toHaveStyle({ zIndex: '60' });
      expect(screen.getByTestId('confirm-inout-modal')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-modal-confirm-btn')).toBeInTheDocument();
    });

    it('blocks the confirm button until a picked invoice is applied', async () => {
      mockRectifyRouter();
      render(<ConfirmInOutModal {...RECTIFY_PROPS} />);
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal-rectify-open')).toBeInTheDocument();
      });
      expect(screen.getByTestId('confirm-modal-confirm-btn')).toBeDisabled();

      openPicker();
      pick('inv-1');
      // A draft click is not a decision: the gate only opens on Apply.
      expect(screen.getByTestId('confirm-modal-confirm-btn')).toBeDisabled();

      apply();
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal-confirm-btn')).not.toBeDisabled();
      });
      expect(screen.getByTestId('confirm-modal-rectify-selected-inv-1')).toBeInTheDocument();
    });

    it('sends the picked invoice as originInvoices in the invoice action body', async () => {
      mockRectifyRouter();
      render(<ConfirmInOutModal {...RECTIFY_PROPS} />);
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal-rectify-open')).toBeInTheDocument();
      });
      openPicker();
      pick('inv-1');
      apply();
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal-confirm-btn')).not.toBeDisabled();
      });
      fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));
      await waitFor(() => {
        expect(invoiceCall()).toBeTruthy();
        expect(invoiceCall()[1].body).toBe(JSON.stringify({ originInvoices: ['inv-1'] }));
      });
    });

    it('sends every picked invoice — C_Invoice_Reverse is a 1:N bridge', async () => {
      mockRectifyRouter();
      render(<ConfirmInOutModal {...RECTIFY_PROPS} />);
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal-rectify-open')).toBeInTheDocument();
      });
      openPicker();
      pick('inv-1');
      pick('inv-2');
      apply();
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal-rectify-selected-inv-2')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));
      await waitFor(() => {
        expect(invoiceCall()).toBeTruthy();
        expect(invoiceCall()[1].body).toBe(JSON.stringify({ originInvoices: ['inv-1', 'inv-2'] }));
      });
    });

    it('accepts the backend suggestion as a preselection, so confirming without opening the picker still links an invoice', async () => {
      mockRectifyRouter({ suggestedInvoiceIds: ['inv-2'] });
      render(<ConfirmInOutModal {...RECTIFY_PROPS} />);
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal-rectify-selected-inv-2')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('confirm-modal-rectify-selected-inv-1')).not.toBeInTheDocument();
      expect(screen.getByTestId('confirm-modal-confirm-btn')).not.toBeDisabled();

      fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));
      await waitFor(() => {
        expect(invoiceCall()).toBeTruthy();
        expect(invoiceCall()[1].body).toBe(JSON.stringify({ originInvoices: ['inv-2'] }));
      });
    });

    it('re-blocks the confirm button when the last selected invoice is removed from the field', async () => {
      mockRectifyRouter({ suggestedInvoiceIds: ['inv-2'] });
      render(<ConfirmInOutModal {...RECTIFY_PROPS} />);
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal-confirm-btn')).not.toBeDisabled();
      });
      fireEvent.click(screen.getByTestId('confirm-modal-rectify-remove-inv-2'));
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal-confirm-btn')).toBeDisabled();
      });
      expect(screen.queryByTestId('confirm-modal-rectify-selected-inv-2')).not.toBeInTheDocument();
      expect(screen.getByTestId('confirm-modal-rectify-open')).toBeInTheDocument();
    });

    it('discards the picker draft on cancel — the preselection survives untouched', async () => {
      mockRectifyRouter({ suggestedInvoiceIds: ['inv-2'] });
      render(<ConfirmInOutModal {...RECTIFY_PROPS} />);
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal-rectify-selected-inv-2')).toBeInTheDocument();
      });

      openPicker();
      pick('inv-1');   // add another one...
      pick('inv-2');   // ...and drop the preselected one
      dismissPicker(); // walk away without applying

      expect(screen.queryByTestId('confirm-modal-rectify-picker-modal')).not.toBeInTheDocument();
      expect(screen.getByTestId('confirm-modal-rectify-selected-inv-2')).toBeInTheDocument();
      expect(screen.queryByTestId('confirm-modal-rectify-selected-inv-1')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));
      await waitFor(() => {
        expect(invoiceCall()).toBeTruthy();
        expect(invoiceCall()[1].body).toBe(JSON.stringify({ originInvoices: ['inv-2'] }));
      });
    });

    it('keeps the confirm button blocked when there is genuinely nothing to rectify', async () => {
      mockRectifyRouter({ invoices: [] });
      render(<ConfirmInOutModal {...RECTIFY_PROPS} />);
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal-rectify-empty')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('confirm-modal-rectify-open')).not.toBeInTheDocument();
      expect(screen.getByTestId('confirm-modal-confirm-btn')).toBeDisabled();
    });

    it('does not render the picker or block anything when the invoice toggle is OFF', async () => {
      mockRectifyRouter();
      render(<ConfirmInOutModal {...RECTIFY_PROPS} defaultCreateInvoice={false} />);
      await new Promise(r => setTimeout(r, 0));
      expect(screen.queryByTestId('confirm-modal-rectify-open')).not.toBeInTheDocument();
      expect(screen.queryByTestId('confirm-modal-rectify-empty')).not.toBeInTheDocument();
      expect(screen.getByTestId('confirm-modal-confirm-btn')).not.toBeDisabled();
    });

    it('confirming with the toggle OFF calls only documentAction — no invoice request, no originInvoices', async () => {
      mockRectifyRouter();
      const onConfirmed = vi.fn();
      render(<ConfirmInOutModal {...RECTIFY_PROPS} defaultCreateInvoice={false} onConfirmed={onConfirmed} />);
      fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));
      await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith({ invoice: null }));
      expect(invoiceCall()).toBeFalsy();
      expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('rectifiableInvoices'))).toBe(false);
    });

    it('activates the picker only after the user switches the invoice toggle on', async () => {
      mockRectifyRouter();
      render(<ConfirmInOutModal {...RECTIFY_PROPS} defaultCreateInvoice={false} />);
      expect(screen.queryByTestId('confirm-modal-rectify-open')).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('switch'));
      await waitFor(() => {
        expect(screen.getByTestId('confirm-modal-rectify-open')).toBeInTheDocument();
      });
      expect(screen.getByTestId('confirm-modal-confirm-btn')).toBeDisabled();
    });

    it('does not render the picker when no rectifiableInvoicesUrl is supplied, even with the invoice toggle on', async () => {
      mockRectifyRouter();
      render(<ConfirmInOutModal {...RECTIFY_PROPS} rectifiableInvoicesUrl={undefined} />);
      await new Promise(r => setTimeout(r, 0));
      expect(screen.queryByTestId('confirm-modal-rectify-open')).not.toBeInTheDocument();
      expect(screen.getByTestId('confirm-modal-confirm-btn')).not.toBeDisabled();
    });

    it('does not render the picker when there is no invoiceAction to gate', async () => {
      mockRectifyRouter();
      const { invoiceAction, ...noInvoiceAction } = RECTIFY_PROPS;
      render(<ConfirmInOutModal {...noInvoiceAction} />);
      await new Promise(r => setTimeout(r, 0));
      expect(screen.queryByTestId('confirm-modal-rectify-open')).not.toBeInTheDocument();
      expect(screen.getByTestId('confirm-modal-confirm-btn')).not.toBeDisabled();
    });

    it('omits originInvoices from the body when the picker is inactive', async () => {
      mockRectifyRouter();
      render(<ConfirmInOutModal {...RECTIFY_PROPS} rectifiableInvoicesUrl={undefined} />);
      fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));
      await waitFor(() => {
        expect(invoiceCall()).toBeTruthy();
        expect(invoiceCall()[1].body).toBe(JSON.stringify({}));
      });
    });
  });

  // ── ETP-5108: one typeface across the whole modal ───────────────────────────
  // Same defect as ConfirmResultModal, which this modal hands off to: the shell
  // declared a system-font stack, so the two steps of one flow disagreed.
  describe('typography inheritance (ETP-5108)', () => {
    it('neither the dialog nor the modal shell declares a font-family', () => {
      render(<ConfirmInOutModal {...BASE_PROPS} />);
      const dialog = screen.getByTestId('confirm-inout-modal');
      expect(dialog.style.fontFamily).toBe('');
      // The shell is the dialog's only element child; JSX comments emit no nodes.
      expect(dialog.firstElementChild.style.fontFamily).toBe('');
    });

    it('the title and the toggle card inherit the design system typeface', () => {
      render(<ConfirmInOutModal {...BASE_PROPS} />);
      expect(inlineFontFamiliesUpToBody(screen.getByText(BASE_PROPS.title))).toEqual([]);
      expect(inlineFontFamiliesUpToBody(screen.getByText(BASE_PROPS.cardTitle))).toEqual([]);
    });
  });

  describe('footer button hover', () => {
    const CANCEL_REST = 'hsl(var(--card))';
    const CONFIRM_REST = 'var(--status-info-fg)';
    const CONFIRM_DISABLED = 'var(--status-info-border)';

    it('Cancel rests on the white card token, not transparent', () => {
      render(<ConfirmInOutModal {...BASE_PROPS} />);
      expect(screen.getByTestId('confirm-modal-cancel-btn').style.background).toBe(CANCEL_REST);
    });

    it('Cancel hover changes the background (not the footer gray) and mouseLeave restores white', () => {
      render(<ConfirmInOutModal {...BASE_PROPS} />);
      const btn = screen.getByTestId('confirm-modal-cancel-btn');
      fireEvent.mouseEnter(btn);
      expect(btn.style.background).not.toBe(CANCEL_REST);
      expect(btn.style.background).not.toBe('hsl(var(--muted))');
      expect(btn.style.background).not.toBe('transparent');
      fireEvent.mouseLeave(btn);
      expect(btn.style.background).toBe(CANCEL_REST);
    });

    it('Confirm hover switches to --primary-hover and mouseLeave restores the rest colour', () => {
      render(<ConfirmInOutModal {...BASE_PROPS} />);
      const btn = screen.getByTestId('confirm-modal-confirm-btn');
      expect(btn.style.background).toBe(CONFIRM_REST);
      fireEvent.mouseEnter(btn);
      expect(btn.style.background).toBe('var(--primary-hover)');
      fireEvent.mouseLeave(btn);
      expect(btn.style.background).toBe(CONFIRM_REST);
    });

    it('Confirm has no hover effect while disabled (price list required but not chosen)', async () => {
      mockFetchRouter({ priceLists: [] });
      render(<ConfirmInOutModal {...PRICE_LIST_PROPS} hasLinkedOrder={false} />);
      await waitFor(() => expect(screen.getByTestId('confirm-modal-price-list-select')).toBeInTheDocument());
      const btn = screen.getByTestId('confirm-modal-confirm-btn');
      expect(btn).toBeDisabled();
      expect(btn.style.background).toBe(CONFIRM_DISABLED);
      fireEvent.mouseEnter(btn);
      expect(btn.style.background).toBe(CONFIRM_DISABLED);
      fireEvent.mouseLeave(btn);
      expect(btn.style.background).toBe(CONFIRM_DISABLED);
    });

    it('neither button reacts to hover while loading', async () => {
      let resolveFetch;
      vi.stubGlobal('fetch', vi.fn(() => new Promise(r => { resolveFetch = r; })));
      render(<ConfirmInOutModal {...BASE_PROPS} />);
      fireEvent.click(screen.getByTestId('confirm-modal-confirm-btn'));
      const cancel = screen.getByTestId('confirm-modal-cancel-btn');
      const confirm = screen.getByTestId('confirm-modal-confirm-btn');
      await waitFor(() => expect(cancel).toBeDisabled());
      fireEvent.mouseEnter(cancel);
      expect(cancel.style.background).toBe(CANCEL_REST);
      fireEvent.mouseEnter(confirm);
      expect(confirm.style.background).toBe(CONFIRM_DISABLED);
      resolveFetch?.({ ok: true, json: async () => ({ response: { data: {} } }) });
    });
  });
});
