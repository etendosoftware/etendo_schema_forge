// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
    expect(spy).toHaveBeenCalledWith(priceListRequiredMsg, expect.any(Function));
    spy.mockRestore();
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
