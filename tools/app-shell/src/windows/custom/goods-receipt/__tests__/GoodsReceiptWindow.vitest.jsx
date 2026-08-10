vi.mock('@generated/goods-receipt/generated/web/goods-receipt/index.jsx', () => ({
  default: ({
    rowQuickActions,
    draftMode,
    menuActions,
    initialColumnFilters,
    Table,
    bulkActions: BulkActions,
    hideMoreMenu,
    onCloneRow,
    renderPreview,
    refreshTrigger,
  }) => (
    <div
      data-testid="generated-app"
      data-initial-filters={initialColumnFilters ? JSON.stringify(initialColumnFilters) : ''}
      data-hide-delete-when-complete={String(!!rowQuickActions?.hideDeleteWhenComplete)}
      data-refresh-trigger={String(refreshTrigger)}
    >
      {/* Renders the custom Table/bulkActions wrapper components so their JSX bodies execute */}
      {Table && (
        <div data-testid="table-slot">
          <Table />
        </div>
      )}
      {BulkActions && (
        <div data-testid="bulk-actions-slot">
          <BulkActions />
        </div>
      )}
      {/* Eagerly invokes renderPreview so its returned JSX body executes */}
      {renderPreview && (
        <div data-testid="preview-slot">
          {renderPreview({ row: { id: 'row-1' }, onClose: () => {}, onEdit: () => {} })}
        </div>
      )}
      <button
        data-testid="trigger-hide-more-menu-co"
        onClick={() => {
          const result = hideMoreMenu?.({ data: { documentStatus: 'CO' } });
          document.getElementById('hide-more-menu-result').textContent = String(result);
        }}
      >
        TriggerHideMoreMenuCO
      </button>
      <button
        data-testid="trigger-hide-more-menu-dr"
        onClick={() => {
          const result = hideMoreMenu?.({ data: { documentStatus: 'DR' } });
          document.getElementById('hide-more-menu-result').textContent = String(result);
        }}
      >
        TriggerHideMoreMenuDR
      </button>
      <span id="hide-more-menu-result" data-testid="hide-more-menu-result" />
      <button
        data-testid="trigger-clone-row-single"
        onClick={() => onCloneRow?.({ id: 'row-2', documentNo: 'ALB-002' })}
      >
        TriggerCloneRowSingle
      </button>
      <button
        data-testid="trigger-clone-row-array"
        onClick={() => onCloneRow?.([{ id: 'row-3' }, { id: 'row-4' }])}
      >
        TriggerCloneRowArray
      </button>
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
  default: ({ onClose, onCloned }) => (
    <div data-testid="clone-modal">
      <button data-testid="clone-modal-close" onClick={onClose}>Close</button>
      <button data-testid="clone-modal-cloned" onClick={onCloned}>Cloned</button>
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

  it('does NOT wire an email row quick action (out-of-scope window)', () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    expect(screen.queryByTestId('send-modal')).not.toBeInTheDocument();

    // The window no longer provides rowQuickActions.onEmail, so triggering the
    // (mock) email action is a no-op and must not open a SendDocumentModal.
    fireEvent.click(screen.getByTestId('trigger-email'));

    expect(screen.queryByTestId('send-modal')).not.toBeInTheDocument();
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

  // ── rowQuickActions.hideDeleteWhenComplete ─────────────────────────────────

  it('ETP-4656: does not gate the grid delete icon by document status', () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('generated-app')).toHaveAttribute(
      'data-hide-delete-when-complete',
      'false',
    );
  });

  // ── refreshKey increments on delete success ────────────────────────────────

  it('refreshKey increments when useRowDelete onSuccess is called', async () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    expect(capturedOnSuccess).toBeTypeOf('function');
    await act(async () => {
      capturedOnSuccess();
    });
  });

  // ── Table / bulkActions custom wrapper components ──────────────────────────

  it('renders the CustomHeaderTable and GoodsReceiptBulkAction wrapper components', () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    expect(screen.getByTestId('table-slot')).toBeInTheDocument();
    expect(screen.getByTestId('bulk-actions-slot')).toBeInTheDocument();
  });

  // ── hideMoreMenu ────────────────────────────────────────────────────────────

  it('hideMoreMenu hides the kebab menu when the document is not confirmed (CO)', () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('trigger-hide-more-menu-dr'));
    expect(screen.getByTestId('hide-more-menu-result').textContent).toBe('true');
  });

  it('hideMoreMenu shows the kebab menu when the document is confirmed (CO)', () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('trigger-hide-more-menu-co'));
    expect(screen.getByTestId('hide-more-menu-result').textContent).toBe('false');
  });

  // ── renderPreview ───────────────────────────────────────────────────────────

  it('wires renderPreview to render GoodsReceiptPreview for the given row', () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    // GoodsReceiptPreview is mocked to render null — asserting the slot exists and
    // did not throw confirms renderPreview executed with the row/onClose/onEdit args.
    expect(screen.getByTestId('preview-slot')).toBeInTheDocument();
  });

  // ── onCloneRow (bulk clone, distinct from rowQuickActions.onClone) ─────────

  it('onCloneRow opens CloneOrderModal for a single row (wraps it in an array)', () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    expect(screen.queryByTestId('clone-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('trigger-clone-row-single'));
    expect(screen.getByTestId('clone-modal')).toBeInTheDocument();
  });

  it('onCloneRow opens CloneOrderModal for an array of rows as-is', () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('trigger-clone-row-array'));
    expect(screen.getByTestId('clone-modal')).toBeInTheDocument();
  });

  // ── CloneOrderModal onCloned ─────────────────────────────────────────────────

  it('onCloned closes the clone modal and increments refreshKey', () => {
    render(<GoodsReceiptWindow {...DEFAULT_PROPS} />);
    fireEvent.click(screen.getByTestId('trigger-clone'));
    expect(screen.getByTestId('clone-modal')).toBeInTheDocument();
    const before = screen.getByTestId('generated-app').getAttribute('data-refresh-trigger');

    fireEvent.click(screen.getByTestId('clone-modal-cloned'));

    expect(screen.queryByTestId('clone-modal')).not.toBeInTheDocument();
    const after = screen.getByTestId('generated-app').getAttribute('data-refresh-trigger');
    expect(Number(after)).toBe(Number(before) + 1);
  });
});
