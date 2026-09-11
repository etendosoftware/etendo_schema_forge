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

vi.mock('@/components/contract-ui/CreateInvoiceConfirmModal', () => ({
  default: ({ onClose }) => (
    <div data-testid="create-invoice-confirm-modal">
      <button data-testid="invoice-confirm-close" onClick={onClose}>Close</button>
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

import { render, screen, fireEvent, act, within } from '@testing-library/react';
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

  describe('goods-receipt:download-pdf event', () => {
    it('programmatically clicks the download link when the event is dispatched', () => {
      useMainAttachment.mockReturnValue({
        storedFile: { objectUrl: 'blob:test-url', fileName: 'receipt.pdf' },
        isBusy: false,
      });
      renderActions();

      const downloadLink = document.querySelector('a[download]');
      expect(downloadLink).toBeInTheDocument();

      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');

      act(() => {
        window.dispatchEvent(new CustomEvent('goods-receipt:download-pdf'));
      });

      expect(clickSpy).toHaveBeenCalledTimes(1);
      clickSpy.mockRestore();
    });

    it('does not throw when event is dispatched but no download link is rendered', () => {
      useMainAttachment.mockReturnValue({
        storedFile: null,
        isBusy: false,
      });
      renderActions({
        data: { ...defaultProps.data, documentStatus: 'DR' },
      });

      expect(() => {
        act(() => {
          window.dispatchEvent(new CustomEvent('goods-receipt:download-pdf'));
        });
      }).not.toThrow();
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

  it('shows a loading toast while the request is in flight, then dismisses it', async () => {
    let resolveExecute;
    mockExecute.mockReturnValueOnce(new Promise((resolve) => { resolveExecute = resolve; }));
    renderActions({ ...fullyInvoicedProps, onRefresh: vi.fn() });

    act(() => {
      window.dispatchEvent(new CustomEvent('goods-receipt:open-confirm-modal'));
    });

    expect(toast.loading).toHaveBeenCalledWith('processing');
    expect(toast.dismiss).not.toHaveBeenCalled();

    await act(async () => {
      resolveExecute({ response: { status: 'Success' } });
    });

    expect(toast.dismiss).toHaveBeenCalledWith('toast-id');
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
