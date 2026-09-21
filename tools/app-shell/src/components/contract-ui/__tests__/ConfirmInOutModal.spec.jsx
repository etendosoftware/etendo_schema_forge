// @vitest-environment jsdom
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
      json: async () => ({ response: { data: { id: 'INV-001', documentNo: 'FAC-001', grandTotalAmount: 500 } } }),
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
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith({
      invoice: { id: 'INV-001', documentNo: 'FAC-001', amount: 500 },
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
        json: async () => ({ response: { data: { id: 'INV-001', documentNo: 'FAC-001', grandTotalAmount: 500 } } }),
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

    fireEvent.change(screen.getByTestId('select-control'), { target: { value: 'pl-a' } });
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
});
