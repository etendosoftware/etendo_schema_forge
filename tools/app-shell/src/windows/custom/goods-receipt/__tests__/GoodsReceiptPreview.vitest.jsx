// Mocks must come before imports (Vitest hoisting)

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useLocaleSwitch: () => ({ locale: 'en_US' }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/lib/dateOnly', () => ({
  formatCalendarDate: (date) => date || '—',
}));

vi.mock('@/windows/custom/shared/usePreviewAttachment.js', () => ({
  usePreviewAttachment: vi.fn(() => ({
    storedFile: null,
    isBusy: false,
    storeFailed: false,
    storeFile: vi.fn(),
    storeBlob: vi.fn(),
    storeUrl: vi.fn(),
    deleteFile: vi.fn(),
  })),
}));

vi.mock('../../shared/GenericPreviewModal.jsx', () => ({
  default: vi.fn(({ title, subtitle, tabs, actionButtons, onClose, onEdit, attachmentConfig }) => {
    // Simulate ManagedLeftPanel calling onFileChange when storedFile changes
    // by exposing attachmentConfig so tests can inspect it
    return (
      <div data-testid="generic-preview-modal">
        <span data-testid="modal-title">{title}</span>
        {subtitle && <span data-testid="modal-subtitle">{subtitle}</span>}
        <div data-testid="modal-tabs">
          {tabs?.map((t) => (
            <div key={t.key} data-testid={`tab-${t.key}`}>
              {t.content}
            </div>
          ))}
        </div>
        <div data-testid="modal-actions">{actionButtons}</div>
        {onClose && (
          <button data-testid="close-btn" onClick={onClose}>
            Close
          </button>
        )}
        {onEdit && (
          <button data-testid="trigger-on-edit" onClick={onEdit}>
            TriggerEdit
          </button>
        )}
        {attachmentConfig?.onFileChange && (
          <button
            data-testid="simulate-file-change"
            onClick={() => attachmentConfig.onFileChange({ objectUrl: 'blob:test-url', fileName: 'test.pdf' })}
          >
            SimulateFileChange
          </button>
        )}
      </div>
    );
  }),
}));

vi.mock('../../shared/PreviewActionButtons.jsx', async () => {
  const { useState, useCallback } = await import('react');
  return {
    PreviewEmptyPanel: ({ icon, text }) => <div data-testid="preview-empty-panel">{icon} {text}</div>,
    usePreviewSendModal: () => {
      const [showSendModal, setShowSendModal] = useState(false);
      const [sendModalClosing, setSendModalClosing] = useState(false);
      const openEmailModal = useCallback(() => setShowSendModal(true), []);
      const closeEmailModal = useCallback(() => {
        setSendModalClosing(true);
        setTimeout(() => { setSendModalClosing(false); setShowSendModal(false); }, 280);
      }, []);
      return { showSendModal, sendModalClosing, openEmailModal, closeEmailModal };
    },
    makeStaticPreviewTabs: (ui) => [
      { key: 'messages', label: ui('invoicePreviewMessages'), content: <div data-testid="preview-empty-panel">💬 {ui('invoicePreviewNoMessagesYet')}</div> },
      { key: 'history', label: ui('invoicePreviewHistory'), content: <div data-testid="preview-empty-panel">🕐 {ui('invoicePreviewNoActivityRecorded')}</div> },
    ],
    ReceiptSendModal: ({ sendModal, pdfBlobUrl }) =>
      sendModal.showSendModal ? (
        <div data-testid="send-modal" data-pdf-url={pdfBlobUrl}>
          <button data-testid="send-modal-close" onClick={sendModal.closeEmailModal}>Close</button>
        </div>
      ) : null,
  };
});

vi.mock('@/components/contract-ui/SendDocumentModal.jsx', () => ({
  default: ({ onClose, pdfBlobUrl }) => (
    <div data-testid="send-modal" data-pdf-url={pdfBlobUrl}>
      <button data-testid="send-modal-close" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

vi.mock('@/components/ui/button.jsx', () => ({
  Button: ({ children, onClick, disabled, ...rest }) => (
    <button onClick={onClick} disabled={disabled} {...rest}>
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  Edit2: () => <span data-testid="icon-edit2" />,
  Mail: () => <span data-testid="icon-mail" />,
}));

vi.mock('../../shared/preview-cards/SummaryCard.jsx', () => ({
  InfoRow: ({ label, value, children }) => (
    <div data-testid="info-row">
      {label}: {value ?? children}
    </div>
  ),
  CardShell: ({ children }) => <div data-testid="card-shell">{children}</div>,
  PercentBar: ({ value }) => <div data-testid="percent-bar">{value}</div>,
  MovementSummaryCard: ({ title, rows, statusRowLabel, statusLabel, statusBadgeClass, children }) => (
    <div data-testid="movement-summary-card">
      <span>{title}</span>
      {(rows || []).map(({ label, value }) => (
        <div key={label} data-testid="info-row">{label}: {value}</div>
      ))}
      <div data-testid="info-row">{statusRowLabel}: <span className={statusBadgeClass}>{statusLabel}</span></div>
      {children}
    </div>
  ),
}));

vi.mock('@/components/related-documents/constants.jsx', () => ({
  STATUS_BADGE: {},
  STATUS_KEYS: {},
}));

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GoodsReceiptPreview from '../GoodsReceiptPreview.jsx';

const defaultReceipt = {
  id: 'receipt-1',
  documentNo: 'ALB-COMP-001',
  documentStatus: 'CO',
  movementDate: '2024-03-15',
  'businessPartner$_identifier': 'Supplier A',
  businessPartner: 'bp-1',
  'warehouse$_identifier': 'Main Warehouse',
  salesOrder: 'po-1',
  'salesOrder$_identifier': 'PO-001',
  invoiceStatus: 50,
};

function renderPreview(overrides = {}) {
  const defaults = {
    receipt: defaultReceipt,
    token: 'tok',
    apiBaseUrl: '/api/goods-receipt',
    windowName: 'goods-receipt',
    onClose: vi.fn(),
    onEdit: vi.fn(),
  };
  return render(<GoodsReceiptPreview {...defaults} {...overrides} />);
}

describe('GoodsReceiptPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when receipt prop is null', () => {
    const { container } = render(
      <GoodsReceiptPreview
        receipt={null}
        token="tok"
        apiBaseUrl="/api/goods-receipt"
        onClose={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders GenericPreviewModal when receipt is provided', () => {
    renderPreview();
    expect(screen.getByTestId('generic-preview-modal')).toBeInTheDocument();
  });

  it('title contains documentNo', () => {
    renderPreview();
    const title = screen.getByTestId('modal-title').textContent;
    expect(title).toContain('ALB-COMP-001');
  });

  describe('Send (email) button visibility', () => {
    it('does NOT render the send button when documentStatus is DR', () => {
      renderPreview({ receipt: { ...defaultReceipt, documentStatus: 'DR' } });
      expect(screen.queryByTestId('icon-mail')).not.toBeInTheDocument();
    });

    it('renders the send button when documentStatus is CO', () => {
      renderPreview({ receipt: { ...defaultReceipt, documentStatus: 'CO' } });
      expect(screen.getByTestId('icon-mail')).toBeInTheDocument();
    });
  });

  it('shows send modal when email button is clicked', () => {
    renderPreview();
    expect(screen.queryByTestId('send-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('icon-mail').closest('button'));
    expect(screen.getByTestId('send-modal')).toBeInTheDocument();
  });

  it('onFileChange in attachmentConfig updates pdfBlobUrl passed to SendDocumentModal', () => {
    renderPreview();

    // Open send modal first
    fireEvent.click(screen.getByTestId('icon-mail').closest('button'));
    expect(screen.getByTestId('send-modal')).toBeInTheDocument();
    expect(screen.getByTestId('send-modal').dataset.pdfUrl).toBeFalsy();

    // Close the modal so we can re-render cleanly with the file change simulation
    fireEvent.click(screen.getByTestId('send-modal-close'));
  });

  it('attachmentConfig.onFileChange callback is wired up and triggers a state update', () => {
    renderPreview();

    // Simulate the GenericPreviewModal calling attachmentConfig.onFileChange
    const simulateBtn = screen.getByTestId('simulate-file-change');
    fireEvent.click(simulateBtn);

    // Open the send modal; pdfBlobUrl should now reflect the stored file
    fireEvent.click(screen.getByTestId('icon-mail').closest('button'));
    expect(screen.getByTestId('send-modal')).toBeInTheDocument();
    expect(screen.getByTestId('send-modal').dataset.pdfUrl).toBe('blob:test-url');
  });

  it('renders 3 tabs: general, messages, history', () => {
    renderPreview();
    expect(screen.getByTestId('tab-general')).toBeInTheDocument();
    expect(screen.getByTestId('tab-messages')).toBeInTheDocument();
    expect(screen.getByTestId('tab-history')).toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    renderPreview({ onClose });
    fireEvent.click(screen.getByTestId('close-btn'));
    expect(onClose).toHaveBeenCalled();
  });
});

// ── ReceiptStatsPanel navigation ──────────────────────────────────────────────

describe('Purchase order navigation', () => {
  it('calls onClose and navigates when PO link is clicked', () => {
    const onClose = vi.fn();
    renderPreview({ onClose });
    fireEvent.click(screen.getByText('PO-001'));
    expect(onClose).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/purchase-order/po-1');
  });

  it('does not render a PO link when salesOrder$_identifier is absent', () => {
    renderPreview({
      receipt: { ...defaultReceipt, salesOrder: null, 'salesOrder$_identifier': null },
    });
    expect(screen.queryByText('PO-001')).not.toBeInTheDocument();
  });
});

// ── closeEmailModal ───────────────────────────────────────────────────────────

describe('closeEmailModal', () => {
  afterEach(() => vi.useRealTimers());

  it('hides the send modal after the 280 ms exit animation', async () => {
    vi.useFakeTimers();
    renderPreview();

    fireEvent.click(screen.getByTestId('icon-mail').closest('button'));
    expect(screen.getByTestId('send-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('send-modal-close'));
    expect(screen.getByTestId('send-modal')).toBeInTheDocument();

    await act(async () => { vi.runAllTimers(); });
    expect(screen.queryByTestId('send-modal')).not.toBeInTheDocument();
  });
});

// ── subtitle branch ───────────────────────────────────────────────────────────

describe('subtitle prop', () => {
  it('passes subtitle to GenericPreviewModal when businessPartner$_identifier is set', () => {
    renderPreview();
    expect(screen.getByTestId('modal-subtitle')).toBeInTheDocument();
  });

  it('passes no subtitle when businessPartner$_identifier is absent (shows "—")', () => {
    renderPreview({
      receipt: { ...defaultReceipt, 'businessPartner$_identifier': undefined },
    });
    expect(screen.queryByTestId('modal-subtitle')).not.toBeInTheDocument();
  });
});

// ── movementDate fallback ─────────────────────────────────────────────────────

describe('movementDate fallback', () => {
  it('shows "—" when receipt.movementDate is null', () => {
    renderPreview({ receipt: { ...defaultReceipt, movementDate: null } });
    // The value ends up inside an InfoRow — look for the fallback dash
    const infoRows = screen.getAllByTestId('info-row');
    const dateRow = infoRows.find(el => el.textContent.includes('goodsReceiptPreview.movementDate'));
    expect(dateRow).toBeTruthy();
    expect(dateRow.textContent).toContain('—');
  });

  it('shows "—" when receipt.movementDate is undefined', () => {
    const { movementDate: _omit, ...receiptWithout } = defaultReceipt;
    renderPreview({ receipt: receiptWithout });
    const infoRows = screen.getAllByTestId('info-row');
    const dateRow = infoRows.find(el => el.textContent.includes('goodsReceiptPreview.movementDate'));
    expect(dateRow.textContent).toContain('—');
  });
});

// ── onEdit callback ───────────────────────────────────────────────────────────

describe('onEdit callback', () => {
  it('calls onEdit with receipt.id when GenericPreviewModal triggers onEdit', () => {
    const onEdit = vi.fn();
    renderPreview({ onEdit });
    fireEvent.click(screen.getByTestId('trigger-on-edit'));
    expect(onEdit).toHaveBeenCalledWith(defaultReceipt.id);
  });

  it('does not throw when onEdit is not provided', () => {
    expect(() => {
      renderPreview({ onEdit: undefined });
      fireEvent.click(screen.getByTestId('trigger-on-edit'));
    }).not.toThrow();
  });
});

// ── edit button visibility ────────────────────────────────────────────────────

describe('edit button', () => {
  it('is visible when documentStatus is CO', () => {
    renderPreview({ receipt: { ...defaultReceipt, documentStatus: 'CO' } });
    expect(screen.getByTestId('icon-edit2')).toBeInTheDocument();
  });

  it('is visible when documentStatus is DR', () => {
    renderPreview({ receipt: { ...defaultReceipt, documentStatus: 'DR' } });
    expect(screen.getByTestId('icon-edit2')).toBeInTheDocument();
  });

  it('is visible when documentStatus is undefined', () => {
    renderPreview({ receipt: { ...defaultReceipt, documentStatus: undefined } });
    expect(screen.getByTestId('icon-edit2')).toBeInTheDocument();
  });
});

// ── ReceiptStatsPanel — statusLabel fallback chain ────────────────────────────

describe('ReceiptStatsPanel — statusLabel', () => {
  it('uses STATUS_KEYS translation key when STATUS_KEYS has an entry for docStatus', async () => {
    const { default: GenericPreviewModal } = await import('../../shared/GenericPreviewModal.jsx');
    const { STATUS_KEYS } = await import('@/components/related-documents/constants.jsx');
    // Override STATUS_KEYS to have a CO entry
    STATUS_KEYS['CO'] = 'statusCompleted';
    renderPreview({ receipt: { ...defaultReceipt, documentStatus: 'CO' } });
    // ui returns the key itself; so the badge shows 'statusCompleted'
    expect(screen.getByText('statusCompleted')).toBeInTheDocument();
    STATUS_KEYS['CO'] = undefined;
  });

  it('falls back to documentStatus$_identifier when STATUS_KEYS has no entry', () => {
    renderPreview({
      receipt: {
        ...defaultReceipt,
        documentStatus: 'UNKNOWN_STATUS',
        'documentStatus$_identifier': 'Unknown Label',
      },
    });
    expect(screen.getByText('Unknown Label')).toBeInTheDocument();
  });

  it('falls back to raw docStatus when identifier is also absent', () => {
    renderPreview({
      receipt: {
        ...defaultReceipt,
        documentStatus: 'XYZ',
        'documentStatus$_identifier': undefined,
      },
    });
    expect(screen.getByText('XYZ')).toBeInTheDocument();
  });
});

// ── ReceiptStatsPanel — purchaseOrderNo null ──────────────────────────────────

describe('ReceiptStatsPanel — purchaseOrderNo', () => {
  it('renders no link button when salesOrder$_identifier is null', () => {
    renderPreview({
      receipt: { ...defaultReceipt, 'salesOrder$_identifier': null },
    });
    // No clickable PO link in the origin order row
    expect(screen.queryByRole('button', { name: /PO-001/i })).not.toBeInTheDocument();
  });
});

// ── ReceiptStatsPanel — invoiceStatus PercentBar ──────────────────────────────

describe('ReceiptStatsPanel — invoiceStatus', () => {
  it('renders PercentBar with the numeric invoiceStatus value', () => {
    renderPreview({ receipt: { ...defaultReceipt, invoiceStatus: 75 } });
    expect(screen.getByTestId('percent-bar')).toBeInTheDocument();
    expect(screen.getByTestId('percent-bar').textContent).toBe('75');
  });

  it('renders PercentBar with 0 when invoiceStatus is absent', () => {
    const { invoiceStatus: _omit, ...receiptWithout } = defaultReceipt;
    renderPreview({ receipt: receiptWithout });
    expect(screen.getByTestId('percent-bar').textContent).toBe('0');
  });
});

// ── ReceiptStatsPanel — statusBadgeClass fallback ─────────────────────────────

describe('ReceiptStatsPanel — statusBadgeClass', () => {
  it('uses fallback class when STATUS_BADGE has no entry for docStatus', () => {
    // The mock has STATUS_BADGE = {} so unknown statuses get the fallback
    renderPreview({ receipt: { ...defaultReceipt, documentStatus: 'UNKNOWN' } });
    const badge = document.querySelector('.bg-gray-50.text-gray-600.border-gray-200');
    expect(badge).not.toBeNull();
  });
});
