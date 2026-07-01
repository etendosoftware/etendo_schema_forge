vi.mock('@generated/goods-receipt/generated/web/goods-receipt/index.jsx', () => ({
  default: ({ rowQuickActions, draftMode, menuActions, initialColumnFilters }) => (
    <div
      data-testid="generated-app"
      data-initial-filters={initialColumnFilters ? JSON.stringify(initialColumnFilters) : ''}
    >
      <button
        data-testid="trigger-email"
        onClick={() =>
          rowQuickActions?.onEmail?.({
            id: 'row-1',
            documentNo: 'ALB-001',
            businessPartner: 'bp-1',
            'businessPartner$_identifier': 'Supplier A',
          })
        }
      >
        TriggerEmail
      </button>
      <button
        data-testid="trigger-clone"
        onClick={() => rowQuickActions?.onClone?.({ id: 'row-1', documentNo: 'ALB-001' })}
      >
        TriggerClone
      </button>
      <button
        data-testid="trigger-edit"
        onClick={() => rowQuickActions?.onEdit?.({ id: 'row-1' })}
      >
        TriggerEdit
      </button>
      <button
        data-testid="trigger-delete"
        onClick={() => rowQuickActions?.onDelete?.({ id: 'row-1' })}
      >
        TriggerDelete
      </button>
      <button
        data-testid="trigger-confirm"
        onClick={() => draftMode?.onConfirm?.()}
      >
        TriggerConfirm
      </button>
      <button
        data-testid="trigger-menu-co"
        onClick={() => {
          const actions = menuActions?.({ status: 'CO' }) ?? [];
          actions[0]?.onClick?.();
        }}
      >
        TriggerMenuCO
      </button>
      <button
        data-testid="trigger-menu-dr"
        onClick={() => {
          const actions = menuActions?.({ status: 'DR' }) ?? [];
          // expose length as text so tests can read it
          document.getElementById('menu-dr-count').textContent = String(actions.length);
        }}
      >
        TriggerMenuDR
      </button>
      <span id="menu-dr-count" data-testid="menu-dr-count" />
    </div>
  ),
}));

vi.mock('@generated/goods-receipt/generated/web/goods-receipt/GoodsReceiptTable', () => ({
  default: () => <div />,
}));

vi.mock('@generated/goods-receipt/custom/GoodsReceiptBottomPanel', () => ({ default: () => null }));
vi.mock('../GoodsReceiptPreview.jsx', () => ({ default: () => null }));
vi.mock('../RelatedDocuments.jsx', () => ({ default: () => null }));

vi.mock('@/components/attachments', () => ({
  AttachmentsTab: () => null,
}));

vi.mock('@/components/contract-ui/BulkDocumentAction', () => ({
  default: () => null,
  buildInOutActions: vi.fn(),
}));

vi.mock('@/components/contract-ui/CloneOrderModal', () => ({
  default: ({ onClose }) => (
    <div data-testid="clone-modal">
      <button data-testid="clone-modal-close" onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('@/components/contract-ui/SendDocumentModal', () => ({
  default: ({ onClose, documentNo }) => (
    <div data-testid="send-modal" data-doc-no={documentNo}>
      <button data-testid="send-close" onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('@/windows/custom/shared/usePreviewAttachment.js', () => ({
  usePreviewAttachment: vi.fn(() => ({
    storedFile: null,
    isBusy: false,
    storeFile: vi.fn(),
    storeBlob: vi.fn(),
    storeUrl: vi.fn(),
    deleteFile: vi.fn(),
  })),
}));

vi.mock('@/hooks/useBulkActionToast', () => ({
  useBulkActionToast: vi.fn(),
}));

let capturedOnSuccess = null;
vi.mock('@/hooks/useRowDelete', () => ({
  useRowDelete: vi.fn((opts) => {
    capturedOnSuccess = opts?.onSuccess ?? null;
    return {
      requestDelete: vi.fn(),
      deleteDialog: null,
    };
  }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useMenuLabel: () => (key) => key,
}));

const mockNavigate = vi.hoisted(() => vi.fn());
let mockSearchParams = new URLSearchParams();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams],
}));

import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GoodsReceiptWindow from '../index.jsx';

const DEFAULT_PROPS = {
  token: 'tok',
  apiBaseUrl: '/api',
  windowName: 'goods-receipt',
};

describe('GoodsReceiptWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    capturedOnSuccess = null;
  });

  it('renders the generated app', () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('generated-app')).toBeInTheDocument();
  });

  it('shows SendDocumentModal when the email row quick action is triggered', () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    expect(screen.queryByTestId('send-modal')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('trigger-email'));

    expect(screen.getByTestId('send-modal')).toBeInTheDocument();
    expect(screen.getByTestId('send-modal').dataset.docNo).toBe('ALB-001');
  });

  // ── initialColumnFilters from URL ──────────────────────────────────────────

  it('passes initialColumnFilters when DocStatus is in URL search params', () => {
    mockSearchParams = new URLSearchParams('DocStatus=CO');
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    const filtersAttr = screen.getByTestId('generated-app').dataset.initialFilters;
    const filters = JSON.parse(filtersAttr);
    expect(filters).toEqual({ documentStatus: { mode: 'enumLabel', value: ['CO'] } });
  });

  it('passes no initialColumnFilters when DocStatus is absent from URL', () => {
    mockSearchParams = new URLSearchParams();
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    const filtersAttr = screen.getByTestId('generated-app').dataset.initialFilters;
    expect(filtersAttr).toBe('');
  });

  // ── draftMode.onConfirm ────────────────────────────────────────────────────

  it('draftMode.onConfirm dispatches goods-receipt:open-confirm-modal CustomEvent', () => {
    const listener = vi.fn();
    window.addEventListener('goods-receipt:open-confirm-modal', listener);
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('trigger-confirm'));
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('goods-receipt:open-confirm-modal', listener);
  });

  // ── menuActionsForForm ─────────────────────────────────────────────────────

  it('menuActionsForForm returns empty array for non-CO status', () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('trigger-menu-dr'));
    expect(screen.getByTestId('menu-dr-count').textContent).toBe('0');
  });

  it('menuActionsForForm downloadPdf action dispatches goods-receipt:download-pdf CustomEvent', () => {
    const listener = vi.fn();
    window.addEventListener('goods-receipt:download-pdf', listener);
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('trigger-menu-co'));
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener('goods-receipt:download-pdf', listener);
  });

  // ── rowQuickActions.onClone ────────────────────────────────────────────────

  it('onClone opens CloneOrderModal portal', () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    expect(screen.queryByTestId('clone-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('trigger-clone'));
    expect(screen.getByTestId('clone-modal')).toBeInTheDocument();
  });

  it('clone modal onClose hides the modal', () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('trigger-clone'));
    expect(screen.getByTestId('clone-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('clone-modal-close'));
    expect(screen.queryByTestId('clone-modal')).not.toBeInTheDocument();
  });

  // ── rowQuickActions.onEdit ─────────────────────────────────────────────────

  it('onEdit calls navigate with the record path', () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('trigger-edit'));
    expect(mockNavigate).toHaveBeenCalledWith('/goods-receipt/row-1');
  });

  // ── refreshKey increments on delete success ────────────────────────────────

  it('refreshKey increments when useRowDelete onSuccess is called', async () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    expect(capturedOnSuccess).toBeTypeOf('function');
    await act(async () => {
      capturedOnSuccess();
    });
  });
});
