// @covers artifacts/goods-shipment/custom/GoodsShipmentActions.jsx
// Real-render companion to artifacts/goods-shipment/custom/__tests__/GoodsShipmentActions.test.js
// (source-reading only, zero executed lines). Mirrors the sibling
// goods-receipt/__tests__/GoodsReceiptActions.vitest.jsx convention (jsdom
// render + @testing-library/react against the real component tree), scoped to
// the ETP-5333 regression: CreateInvoiceConfirmModal must stay mounted (with
// loading feedback) for the whole createDraftInvoice request instead of
// closing synchronously on click.
//
// Mocks must come before imports (Vitest hoisting)

const { mockExecute, mockNavigate } = vi.hoisted(() => ({ mockExecute: vi.fn(), mockNavigate: vi.fn() }));

// Keys echo back, except the plan-quota sentence (ETP-5051): an echoed key reads as "not
// translated", so the translator would fall back and the quota path could not be observed.
vi.mock('@/i18n', () => ({
  useUI: () => (key, params = {}) => (key === 'backendError.quotaExceeded'
    ? `Límite del plan alcanzado: ${params.resource}`
    : key),
  useMenuLabel: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    dismiss: vi.fn(),
  },
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: mockExecute, loading: false, error: null, clearError: vi.fn() }),
}));

vi.mock('@/windows/custom/goods-shipment/useShipmentPdf', () => ({
  useShipmentPdf: () => ({ pdfUrl: null, loading: false }),
}));

vi.mock('@generated/goods-shipment/custom/ReturnWizard', () => ({
  default: ({ open, onSuccess, lines, linesLoading }) => (
    <div data-testid="return-wizard" data-lines-count={lines?.length ?? 0} data-lines-loading={String(linesLoading)}>
      {open && <button type="button" data-testid="wizard-success" onClick={() => onSuccess({ id: 'rmr-1', documentNo: 'DEV-1' })} />}
      {open && <button type="button" data-testid="wizard-success-no-id" onClick={() => onSuccess({})} />}
    </div>
  ),
}));

vi.mock('@generated/goods-shipment/custom/GoodsShipmentConfirmModal', () => ({
  default: ({ onClose }) => (
    <div data-testid="goods-shipment-confirm-modal">
      <button data-testid="confirm-modal-close" onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('@/components/contract-ui/SendDocumentModal', () => ({
  default: ({ onClose }) => (
    <div data-testid="send-document-modal">
      <button data-testid="send-modal-close" onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('@/components/contract-ui', () => ({
  ConfirmResultModal: ({ docs, onClose, navigate }) => (
    <div data-testid="confirm-result-modal" data-doc-type={docs?.[0]?.type} data-doc-status={docs?.[0]?.documentStatus} data-route={docs?.[0]?.route}>
      <button data-testid="result-modal-close" onClick={onClose}>Close</button>
      <button data-testid="result-modal-view" onClick={() => navigate(docs?.[0]?.route)}>View</button>
    </div>
  ),
}));

// ETP-5333 — the mock exposes `onConfirm` and `loading` (forwarded by
// GoodsShipmentActions as `loading={creatingInvoice}`) so tests can drive
// handleCreateInvoice and assert the modal shows the processing label / a
// disabled confirm button while the request is in flight, and stays mounted
// until it resolves — matching the real CreateInvoiceConfirmModal's contract.
vi.mock('@/components/contract-ui/CreateInvoiceConfirmModal', () => ({
  default: ({ onClose, onConfirm, loading }) => (
    <div data-testid="create-invoice-confirm-modal">
      <button data-testid="invoice-confirm-close" onClick={onClose} disabled={loading}>Close</button>
      <button data-testid="invoice-confirm-confirm" onClick={() => onConfirm?.('pl-1')} disabled={loading}>
        {loading ? 'soProcessing' : 'soCreateDocsBtn'}
      </button>
    </div>
  ),
}));

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import GoodsShipmentActions from '@generated/goods-shipment/custom/GoodsShipmentActions';

const defaultProps = {
  data: {
    documentStatus: 'CO',
    documentNo: 'ALB-001',
    'businessPartner$_identifier': 'Customer A',
    businessPartner: 'bp-1',
    invoiceStatus: 0,
    'currency$_identifier': 'EUR',
  },
  recordId: 'shipment-1',
  token: 'tok',
  apiBaseUrl: '/api/goods-shipment',
};

function renderActions(overrides = {}) {
  return render(<GoodsShipmentActions {...defaultProps} {...overrides} />);
}

describe('GoodsShipmentActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
  });

  // Sales mirrors Purchases (GoodsReceiptActions): the created return is announced in
  // ConfirmResultModal and the user chooses whether to open it — no auto-navigation.
  describe('sales return result', () => {
    const returnable = { data: { ...defaultProps.data, canCreateReturn: true } };

    it('announces the return created by the wizard as a devolucionVenta linking to its window, without navigating', () => {
      renderActions(returnable);
      fireEvent.click(screen.getByText('createReturn'));
      fireEvent.click(screen.getByTestId('wizard-success'));

      const result = screen.getByTestId('confirm-result-modal');
      expect(result).toHaveAttribute('data-doc-type', 'devolucionVenta');
      // createReturn sends no documentStatus; the return is always created in draft.
      expect(result).toHaveAttribute('data-doc-status', 'DR');
      expect(result).toHaveAttribute('data-route', '/return-material-receipt/rmr-1');
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    // Bug: the shipment was refreshed only when the result modal was CLOSED, and not at all when
    // the user opened the return from it (resultNavigatedRef skip). The shared record cache then
    // kept serving the pre-return shipment (canCreateReturn: true, related documents without the
    // new return) to the next arrival, so «Crear devolución» stayed visible over a wizard with
    // nothing left to return. The refresh now runs as soon as the return exists.
    it('refreshes the shipment as soon as the return is created, however the result modal is left', () => {
      const onRefresh = vi.fn();
      renderActions({ ...returnable, onRefresh });
      fireEvent.click(screen.getByText('createReturn'));
      fireEvent.click(screen.getByTestId('wizard-success'));
      // Before any interaction with the result modal.
      expect(onRefresh).toHaveBeenCalledTimes(1);
      fireEvent.click(screen.getByTestId('result-modal-close'));
      // Closing does not refetch a second time.
      expect(onRefresh).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText('createReturn'));
      fireEvent.click(screen.getByTestId('wizard-success'));
      expect(onRefresh).toHaveBeenCalledTimes(2);
      fireEvent.click(screen.getByTestId('result-modal-view'));
      expect(mockNavigate).toHaveBeenCalledWith('/return-material-receipt/rmr-1');
      expect(onRefresh).toHaveBeenCalledTimes(2);
    });

    // The wizard used to reopen on the PREVIOUS fetch's lines until the new answer arrived (or
    // forever, when it failed): after a return those are quantities that are no longer returnable.
    it('reopening the wizard drops the previous lines and flags them as loading until the new answer', async () => {
      let resolveSecond;
      globalThis.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ response: { data: [{ id: 'l1', movementQuantity: 4 }] } }) })
        .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
      renderActions(returnable);
      fireEvent.click(screen.getByText('createReturn'));
      await waitFor(() => expect(screen.getByTestId('return-wizard')).toHaveAttribute('data-lines-count', '1'));
      expect(screen.getByTestId('return-wizard')).toHaveAttribute('data-lines-loading', 'false');
      fireEvent.click(screen.getByTestId('wizard-success'));

      fireEvent.click(screen.getByText('createReturn'));
      expect(screen.getByTestId('return-wizard')).toHaveAttribute('data-lines-count', '0');
      expect(screen.getByTestId('return-wizard')).toHaveAttribute('data-lines-loading', 'true');

      await act(async () => {
        resolveSecond({ ok: true, json: async () => ({ response: { data: [] } }) });
      });
      expect(screen.getByTestId('return-wizard')).toHaveAttribute('data-lines-count', '0');
      expect(screen.getByTestId('return-wizard')).toHaveAttribute('data-lines-loading', 'false');
    });

    it('falls back to onRefresh with no result modal when the created return has no id', () => {
      const onRefresh = vi.fn();
      renderActions({ ...returnable, onRefresh });
      fireEvent.click(screen.getByText('createReturn'));
      fireEvent.click(screen.getByTestId('wizard-success-no-id'));

      expect(onRefresh).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('confirm-result-modal')).not.toBeInTheDocument();
    });
  });

  describe('"Create Invoice" button opens CreateInvoiceConfirmModal', () => {
    it('renders when documentStatus is CO and invoiceStatus < 100', () => {
      renderActions();
      expect(screen.getByText('createInvoiceBtn')).toBeInTheDocument();
    });

    it('places "Create Return" before "Create Invoice" so the primary action is rightmost (ETP-5690)', () => {
      renderActions({ data: { ...defaultProps.data, canCreateReturn: true } });
      const ret = screen.getByText('createReturn').closest('button');
      const inv = screen.getByText('createInvoiceBtn').closest('button');
      expect(ret.compareDocumentPosition(inv) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('does NOT render when invoiceStatus is 100 (fully invoiced)', () => {
      renderActions({ data: { ...defaultProps.data, invoiceStatus: 100 } });
      expect(screen.queryByText('createInvoiceBtn')).not.toBeInTheDocument();
    });

    it('opens CreateInvoiceConfirmModal when "Create Invoice" button is clicked', () => {
      renderActions();
      expect(screen.queryByTestId('create-invoice-confirm-modal')).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('createInvoiceBtn'));
      expect(screen.getByTestId('create-invoice-confirm-modal')).toBeInTheDocument();
    });

    it('closes CreateInvoiceConfirmModal when onClose is called', () => {
      renderActions();
      fireEvent.click(screen.getByText('createInvoiceBtn'));
      fireEvent.click(screen.getByTestId('invoice-confirm-close'));
      expect(screen.queryByTestId('create-invoice-confirm-modal')).not.toBeInTheDocument();
    });
  });

  // ETP-5333 — regression coverage. handleCreateInvoice used to be wired via
  // `onConfirm={(priceListId) => { setShowInvoiceConfirm(false); handleCreateInvoice(priceListId); }}`
  // — the modal closed SYNCHRONOUSLY on click, before the createDraftInvoice
  // request even started, with no loading feedback; a second (result) modal
  // then popped up once the request resolved. The fix moved
  // `setShowInvoiceConfirm(false)` inside handleCreateInvoice's SUCCESS branch
  // (right before setInvoiceResult), and onConfirm is now just
  // `handleCreateInvoice` directly. These tests use a manually
  // resolvable/rejectable deferred fetch promise to observe the mid-flight
  // state, which the previous synchronous-close behavior made unobservable.
  describe('CreateInvoiceConfirmModal stays open during the async createDraftInvoice request (ETP-5333)', () => {
    beforeEach(() => {
      globalThis.fetch = vi.fn();
    });

    it('regression: stays mounted and shows the loading label with a disabled confirm button before the request resolves', async () => {
      let resolveFetch;
      globalThis.fetch.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));
      renderActions();
      fireEvent.click(screen.getByText('createInvoiceBtn'));

      fireEvent.click(screen.getByTestId('invoice-confirm-confirm'));

      // The bug: previously the modal unmounted here, synchronously, before
      // the request even started.
      expect(screen.getByTestId('create-invoice-confirm-modal')).toBeInTheDocument();
      await waitFor(() => expect(screen.getByTestId('invoice-confirm-confirm')).toHaveTextContent('soProcessing'));
      expect(screen.getByTestId('invoice-confirm-confirm')).toBeDisabled();

      await act(async () => {
        resolveFetch({ ok: true, json: () => Promise.resolve({ response: { data: {} } }) });
      });
    });

    it('on success: the modal disappears and the result modal appears with the invoice data', async () => {
      let resolveFetch;
      globalThis.fetch.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));
      renderActions();
      fireEvent.click(screen.getByText('createInvoiceBtn'));
      fireEvent.click(screen.getByTestId('invoice-confirm-confirm'));
      await waitFor(() => expect(screen.getByTestId('invoice-confirm-confirm')).toHaveTextContent('soProcessing'));

      await act(async () => {
        resolveFetch({
          ok: true,
          json: () => Promise.resolve({ response: { data: { id: 'INV-1', documentNo: 'FC-01', grandTotalAmount: 99 } } }),
        });
      });

      expect(screen.queryByTestId('create-invoice-confirm-modal')).not.toBeInTheDocument();
      expect(screen.getByTestId('confirm-result-modal')).toBeInTheDocument();
    });

    it('on failure: the modal stays open, returns to the idle label, and toast.error is called — no result modal', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ response: { message: 'Boom' } }),
      });
      renderActions();
      fireEvent.click(screen.getByText('createInvoiceBtn'));
      fireEvent.click(screen.getByTestId('invoice-confirm-confirm'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Boom'));
      expect(screen.getByTestId('create-invoice-confirm-modal')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-confirm-confirm')).toHaveTextContent('soCreateDocsBtn');
      expect(screen.getByTestId('invoice-confirm-confirm')).not.toBeDisabled();
      expect(screen.queryByTestId('confirm-result-modal')).not.toBeInTheDocument();
    });

    // ETP-5051 — createDraftInvoice refused by the plan quota (403 QUOTA_EXCEEDED): the toast is the
    // translated quota sentence, never "Failed (403)" nor the backend's English prose.
    it('on a 403 QUOTA_EXCEEDED: toasts the translated quota sentence and keeps the modal open', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            code: 'QUOTA_EXCEEDED', status: 403, message: 'Quota exceeded: Sales invoices (100/100)',
            quota: { resourceKey: 'GS_ACTIONS_INVOICES', resourceName: 'Sales invoices', includedQty: 100, consumed: 100, verdict: 'DENY' },
          },
        }),
      });
      renderActions();
      fireEvent.click(screen.getByText('createInvoiceBtn'));
      fireEvent.click(screen.getByTestId('invoice-confirm-confirm'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Límite del plan alcanzado: Sales invoices'));
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('create-invoice-confirm-modal')).toBeInTheDocument();
      expect(screen.queryByTestId('confirm-result-modal')).not.toBeInTheDocument();
    });

    it('on a refusal with no message: toasts "Failed (<status>)" as before', async () => {
      globalThis.fetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: { status: 403 } }) });
      renderActions();
      fireEvent.click(screen.getByText('createInvoiceBtn'));
      fireEvent.click(screen.getByTestId('invoice-confirm-confirm'));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed (403)'));
    });

    it('rapid double-click on the confirm button while a request is in flight results in exactly one POST call', async () => {
      let resolveFetch;
      globalThis.fetch.mockImplementation(() => new Promise((resolve) => { resolveFetch = resolve; }));
      renderActions();
      fireEvent.click(screen.getByText('createInvoiceBtn'));

      fireEvent.click(screen.getByTestId('invoice-confirm-confirm'));
      fireEvent.click(screen.getByTestId('invoice-confirm-confirm'));

      await waitFor(() => expect(screen.getByTestId('invoice-confirm-confirm')).toHaveTextContent('soProcessing'));
      // The quote feature (see GoodsShipmentActions' own lineDetails/pendingByLine effect)
      // issues its own GET requests once the modal opens — this assertion is scoped to POST
      // calls specifically, since that is what a double-click guard actually protects against.
      const postCalls = globalThis.fetch.mock.calls.filter(([, opts]) => opts?.method === 'POST');
      expect(postCalls).toHaveLength(1);

      await act(async () => {
        resolveFetch({ ok: true, json: () => Promise.resolve({ response: { data: {} } }) });
      });
    });
  });
});
