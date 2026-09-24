// Real-render companion to artifacts/goods-shipment/custom/__tests__/GoodsShipmentActions.test.js
// (source-reading only, zero executed lines). Mirrors the sibling
// goods-receipt/__tests__/GoodsReceiptActions.vitest.jsx convention (jsdom
// render + @testing-library/react against the real component tree), scoped to
// the ETP-5333 regression: CreateInvoiceConfirmModal must stay mounted (with
// loading feedback) for the whole createDraftInvoice request instead of
// closing synchronously on click.
//
// Mocks must come before imports (Vitest hoisting)

const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
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
  default: () => <div data-testid="return-wizard" />,
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
  ConfirmResultModal: ({ onClose }) => (
    <div data-testid="confirm-result-modal">
      <button data-testid="result-modal-close" onClick={onClose}>Close</button>
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

  describe('"Create Invoice" button opens CreateInvoiceConfirmModal', () => {
    it('renders when documentStatus is CO and invoiceStatus < 100', () => {
      renderActions();
      expect(screen.getByText('createInvoiceBtn')).toBeInTheDocument();
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
