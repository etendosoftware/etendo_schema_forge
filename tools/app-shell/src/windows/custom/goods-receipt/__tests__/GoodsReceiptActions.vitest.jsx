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

// ETP-5265 — the fully-invoiced confirm flow now calls the canonical
// useDocumentAction hook directly (no more intermediate modal). Mock it so
// the behavioral tests below control resolution/rejection of the POST.
vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: mockExecute, loading: false, error: null, clearError: vi.fn() }),
}));

vi.mock('@/windows/custom/shared/useMainAttachment.js', () => ({
  useMainAttachment: vi.fn(() => ({
    storedFile: null,
    isBusy: false,
    storeFailed: false,
    storeFile: vi.fn(),
    storeBlob: vi.fn(),
    storeUrl: vi.fn(),
    markExisting: vi.fn(),
    deleteFile: vi.fn(),
  })),
}));

vi.mock('@generated/goods-receipt/custom/ConfirmGoodsReceiptModal', () => ({
  default: ({ onClose }) => (
    <div data-testid="confirm-goods-receipt-modal">
      <button data-testid="confirm-modal-close" onClick={onClose}>Close</button>
    </div>
  ),
}));

// ETP-5333 — the mock now exposes `onConfirm` and `loading` (forwarded by
// GoodsReceiptActions as `loading={creatingInvoice}`) so tests can drive
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

vi.mock('@generated/goods-receipt/custom/PurchaseReturnWizard', () => ({
  default: () => <div data-testid="purchase-return-wizard" />,
}));

import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';
import { useMainAttachment } from '@/windows/custom/shared/useMainAttachment.js';
import GoodsReceiptActions from '@generated/goods-receipt/custom/GoodsReceiptActions';

const defaultProps = {
  data: {
    documentStatus: 'CO',
    documentNo: 'ALB-001',
    'businessPartner$_identifier': 'Supplier A',
    businessPartner: 'bp-1',
    invoiceStatus: 0,
    'currency$_identifier': 'EUR',
  },
  recordId: 'receipt-1',
  token: 'tok',
  apiBaseUrl: '/api/goods-receipt',
};

function renderActions(overrides = {}) {
  return render(<GoodsReceiptActions {...defaultProps} {...overrides} />);
}

describe('GoodsReceiptActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
    useMainAttachment.mockReturnValue({
      storedFile: null,
      isBusy: false,
      storeFailed: false,
      storeFile: vi.fn(),
      storeBlob: vi.fn(),
      storeUrl: vi.fn(),
      deleteFile: vi.fn(),
    });
  });

  describe('Download <a> visibility', () => {
    it('does NOT render the download link when isCompleted is false (DR status)', () => {
      useMainAttachment.mockReturnValue({
        storedFile: { objectUrl: 'blob:test', fileName: 'test.pdf' },
        isBusy: false,
      });
      renderActions({
        data: { ...defaultProps.data, documentStatus: 'DR' },
      });
      expect(screen.queryByTitle('test.pdf')).not.toBeInTheDocument();
    });

    it('does NOT render the download link when storedFile is null even if completed', () => {
      useMainAttachment.mockReturnValue({
        storedFile: null,
        isBusy: false,
      });
      renderActions();
      // There should be no anchor with a download attribute pointing to a stored file
      const downloadLink = document.querySelector('a[download]');
      expect(downloadLink).toBeNull();
    });

    it('renders the download link when isCompleted is true and storedFile exists', () => {
      useMainAttachment.mockReturnValue({
        storedFile: { objectUrl: 'blob:test-url', fileName: 'receipt.pdf' },
        isBusy: false,
      });
      renderActions();
      const downloadLink = document.querySelector('a[download]');
      expect(downloadLink).toBeInTheDocument();
      expect(downloadLink).toHaveAttribute('href', 'blob:test-url');
      expect(downloadLink).toHaveAttribute('download', 'receipt.pdf');
    });
  });

  describe('Email access point is removed (out-of-scope window)', () => {
    it('does NOT render the email button when documentStatus is not CO', () => {
      renderActions({
        data: { ...defaultProps.data, documentStatus: 'DR' },
      });
      const emailBtn = screen.queryByTitle('quickAction.email');
      expect(emailBtn).not.toBeInTheDocument();
    });

    it('does NOT render the email button even when documentStatus is CO', () => {
      renderActions();
      // The envelope/send access point was removed from this out-of-scope window.
      expect(screen.queryByTitle('quickAction.email')).not.toBeInTheDocument();
    });

    it('never opens a SendDocumentModal from this component', () => {
      renderActions();
      expect(screen.queryByTestId('send-document-modal')).not.toBeInTheDocument();
    });
  });

  describe('"Create Invoice" button visibility', () => {
    it('renders when documentStatus is CO and invoiceStatus < 100', () => {
      renderActions();
      expect(screen.getByText('createInvoiceBtn')).toBeInTheDocument();
    });

    it('does NOT render when documentStatus is DR (not completed)', () => {
      renderActions({ data: { ...defaultProps.data, documentStatus: 'DR' } });
      expect(screen.queryByText('createInvoiceBtn')).not.toBeInTheDocument();
    });

    it('does NOT render when invoiceStatus is 100 (fully invoiced)', () => {
      renderActions({ data: { ...defaultProps.data, invoiceStatus: 100 } });
      expect(screen.queryByText('createInvoiceBtn')).not.toBeInTheDocument();
    });

    it('does NOT render when invoiceStatus is above 100', () => {
      renderActions({ data: { ...defaultProps.data, invoiceStatus: 110 } });
      expect(screen.queryByText('createInvoiceBtn')).not.toBeInTheDocument();
    });
  });

  describe('"Create Invoice" button opens CreateInvoiceConfirmModal', () => {
    it('opens CreateInvoiceConfirmModal when "Create Invoice" button is clicked', () => {
      renderActions();
      expect(screen.queryByTestId('create-invoice-confirm-modal')).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('createInvoiceBtn'));
      expect(screen.getByTestId('create-invoice-confirm-modal')).toBeInTheDocument();
    });

    it('closes CreateInvoiceConfirmModal when onClose is called', () => {
      renderActions();
      fireEvent.click(screen.getByText('createInvoiceBtn'));
      expect(screen.getByTestId('create-invoice-confirm-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('invoice-confirm-close'));
      expect(screen.queryByTestId('create-invoice-confirm-modal')).not.toBeInTheDocument();
    });
  });

  describe('goods-receipt:open-confirm-modal event', () => {
    it('opens ConfirmGoodsReceiptModal when event is dispatched', () => {
      renderActions();
      expect(screen.queryByTestId('confirm-goods-receipt-modal')).not.toBeInTheDocument();
      act(() => {
        window.dispatchEvent(new CustomEvent('goods-receipt:open-confirm-modal'));
      });
      expect(screen.getByTestId('confirm-goods-receipt-modal')).toBeInTheDocument();
    });

    it('closes ConfirmGoodsReceiptModal when onClose is called', () => {
      renderActions();
      act(() => {
        window.dispatchEvent(new CustomEvent('goods-receipt:open-confirm-modal'));
      });
      fireEvent.click(screen.getByTestId('confirm-modal-close'));
      expect(screen.queryByTestId('confirm-goods-receipt-modal')).not.toBeInTheDocument();
    });
  });

  // ETP-5333 — regression coverage. handleCreateInvoice used to be wired via
  // `onConfirm={(priceListId) => { setShowInvoiceConfirm(false); handleCreateInvoice(priceListId); }}`
  // — the modal closed SYNCHRONOUSLY on click, before the createPurchaseInvoice
  // request even started, with no loading feedback; a second (result) modal
  // then popped up once the request resolved. The fix moved
  // `setShowInvoiceConfirm(false)` inside handleCreateInvoice's SUCCESS branch
  // (right before setConfirmedDocs), and onConfirm is now just
  // `handleCreateInvoice` directly. These tests use a manually
  // resolvable/rejectable deferred fetch promise to observe the mid-flight
  // state, which the previous synchronous-close behavior made unobservable.
  describe('CreateInvoiceConfirmModal stays open during the async createPurchaseInvoice request (ETP-5333)', () => {
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
          json: () => Promise.resolve({ response: { data: { id: 'INV-1', documentNo: 'FC-01' } } }),
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
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveFetch({ ok: true, json: () => Promise.resolve({ response: { data: {} } }) });
      });
    });
  });
});

describe('confirming a fully-invoiced receipt (ETP-5265 — direct documentAction, no modal)', () => {
  const fullyInvoicedProps = {
    data: { ...defaultProps.data, invoiceStatus: 100 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecute.mockReset();
  });

  it('never opens ConfirmGoodsReceiptModal and calls documentAction(recordId, "CO") directly', async () => {
    mockExecute.mockResolvedValueOnce({ response: { status: 'Success' } });
    const onRefresh = vi.fn();
    renderActions({ ...fullyInvoicedProps, onRefresh });

    await act(async () => {
      window.dispatchEvent(new CustomEvent('goods-receipt:open-confirm-modal'));
    });

    expect(mockExecute).toHaveBeenCalledWith('receipt-1', 'CO');
    expect(screen.queryByTestId('confirm-goods-receipt-modal')).not.toBeInTheDocument();
  });

  // ETP-5265 QA follow-up — QA rejected the floating "processing" card: the spinner
  // must live in the Confirm button, like the invoice windows. So there is no loading
  // toast at all any more; instead the listener publishes its in-flight promise on the
  // event `detail`, which the window's onConfirm returns and the core's
  // runDraftModeConfirm awaits to drive the button's spinner + disabled state.
  it('shows NO loading toast — it hands the in-flight promise back through event detail instead', async () => {
    let resolveExecute;
    mockExecute.mockReturnValueOnce(new Promise((resolve) => { resolveExecute = resolve; }));
    renderActions({ ...fullyInvoicedProps, onRefresh: vi.fn() });

    const detail = {};
    act(() => {
      window.dispatchEvent(new CustomEvent('goods-receipt:open-confirm-modal', { detail }));
    });

    expect(toast.loading).not.toHaveBeenCalled();
    expect(toast.dismiss).not.toHaveBeenCalled();
    // The promise must still be pending here — that is what keeps the button busy.
    expect(detail.promise).toBeInstanceOf(Promise);
    let settled = false;
    detail.promise.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    await act(async () => {
      resolveExecute({ response: { status: 'Success' } });
    });

    await expect(detail.promise).resolves.toBeUndefined();
    expect(toast.loading).not.toHaveBeenCalled();
    expect(toast.dismiss).not.toHaveBeenCalled();
  });

  // A bare CustomEvent (no detail) must keep working — the listener falls back to
  // fire-and-forget rather than throwing on a missing detail object.
  it('still runs the confirm when the event carries no detail', async () => {
    mockExecute.mockResolvedValueOnce({ response: { status: 'Success' } });
    renderActions({ ...fullyInvoicedProps, onRefresh: vi.fn() });

    await act(async () => {
      window.dispatchEvent(new CustomEvent('goods-receipt:open-confirm-modal'));
    });

    expect(mockExecute).toHaveBeenCalledWith('receipt-1', 'CO');
  });

  it('on success, shows the success toast and refreshes — no result modal', async () => {
    mockExecute.mockResolvedValueOnce({ response: { status: 'Success' } });
    const onRefresh = vi.fn();
    renderActions({ ...fullyInvoicedProps, onRefresh });

    await act(async () => {
      window.dispatchEvent(new CustomEvent('goods-receipt:open-confirm-modal'));
    });

    expect(toast.success).toHaveBeenCalledWith('goodsReceipt.confirmModal.confirmedTitle');
    expect(onRefresh).toHaveBeenCalled();
    expect(screen.queryByTestId('confirm-result-modal')).not.toBeInTheDocument();
  });

  it('on failure, shows toast.error with the error message and does not refresh', async () => {
    mockExecute.mockRejectedValueOnce(new Error('Document already completed'));
    const onRefresh = vi.fn();
    renderActions({ ...fullyInvoicedProps, onRefresh });

    await act(async () => {
      window.dispatchEvent(new CustomEvent('goods-receipt:open-confirm-modal'));
    });

    expect(toast.error).toHaveBeenCalledWith('Document already completed');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('falls back to the generic network-error label when the rejection has no message', async () => {
    mockExecute.mockRejectedValueOnce(new Error());
    renderActions({ ...fullyInvoicedProps, onRefresh: vi.fn() });

    await act(async () => {
      window.dispatchEvent(new CustomEvent('goods-receipt:open-confirm-modal'));
    });

    expect(toast.error).toHaveBeenCalledWith('networkError');
  });
});
