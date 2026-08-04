/**
 * ETP-4656 — mixed-outcome coverage for the PRIMARY lines/detailEntity bulk
 * delete, both variants, now migrated to the shared `runBatchDelete`/
 * `toastBatchDeleteOutcome` helpers (lib/batchDelete.js):
 *   1. The non-inlineEditable toolbar button inside `detail-bulk-action-bar`
 *      (gated by `isBulkDeleteBarVisible` — testid `detail-bulk-delete-button`).
 *   2. `LinesSelectionBar`'s `onDelete` for `linesLayout==='inlineEditable'`
 *      (gated by `shouldShowInlineDeleteSelectionBar`) — mutually exclusive
 *      with #1, fires for every Sales/Purchase Order/Invoice/Goods
 *      Shipment/Receipt "Líneas" tab.
 *
 * Harness mirrors DetailView.detailProcesses.vitest.jsx (same mock
 * preamble), except `LinesSelectionBar` is stubbed with a trigger button
 * (exposing its `onDelete`/`deleting` props) instead of `() => null`, so
 * variant #2 is reachable.
 */

// --- MOCKS BEFORE IMPORTS ---

// ETP-4576 — DetailView reads the CSRF proof from the auth context, so mounting it
// requires that context. The mock is a plain mutable object rather than a vi.fn()
// with mockReturnValueOnce: React can invoke the hook more than once per render and
// a "once" override would decay to the default mid-render.
let mockAuth = { isAuthenticated: true, csrfToken: 'test-csrf' };

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => mockAuth,
}));

beforeEach(() => {
  mockAuth = { isAuthenticated: true, csrfToken: 'test-csrf' };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/sales-order/123', search: '' }),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('../ProcessParamDialog.jsx', () => ({
  ProcessParamDialog: () => null,
}));

const mockHook = {
  loading: false,
  items: [],
  selected: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
  editing: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
  children: [
    { id: 'L1', product: 'P1', 'product$_identifier': 'Widget', lineNetAmount: 100 },
  ],
  isDirtyHeader: false,
  childrenLoading: false,
  error: null,
  handleChange: vi.fn(),
  handleSave: vi.fn().mockResolvedValue({}),
  handleCreate: vi.fn().mockResolvedValue({}),
  handleDelete: vi.fn().mockResolvedValue({}),
  handleDeleteChild: vi.fn(),
  handleSelect: vi.fn(),
  handleUpdateChild: vi.fn(),
  handleProcess: vi.fn(),
  handleSaveAndProcess: vi.fn().mockResolvedValue({}),
  handleAddChild: vi.fn(),
  fetchById: vi.fn().mockResolvedValue({}),
  fetchChildren: vi.fn(),
  refresh: vi.fn(),
  isSaving: false,
  primeSaved: vi.fn(),
};

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => mockHook,
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useCatalogs: () => ({ catalogs: {}, loading: false }),
}));

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set() }),
}));

vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({
    calloutResult: null,
    calloutLoading: false,
    executeCallout: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, calculate: vi.fn() }),
  ORDER_LINE_CONFIG: {
    qtyField: 'orderedQuantity',
    priceField: 'unitPrice',
    totalField: 'lineNetAmount',
  },
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: vi.fn().mockResolvedValue({}), loading: false }),
}));

vi.mock('@/hooks/useNeoAction', () => ({
  useNeoAction: () => ({ execute: vi.fn().mockResolvedValue({ success: true }), loading: false }),
}));

vi.mock('@/i18n', () => ({
  useMenuLabel: () => (k) => k,
  useUI: () => (k, params) => (params ? `${k}:${JSON.stringify(params)}` : k),
  useLabel: () => () => '',
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: () => vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }),
}));

vi.mock('@/components/CurrentWindowContext', () => ({
  useRegisterWindowContext: () => {},
}));

vi.mock('@/components/copilot/ocr/ocrDocTypes', () => ({
  matchOcrDocType: () => null,
}));

vi.mock('@/lib/selectorContext.js', () => ({
  buildHeaderSelectorContext: () => ({}),
  buildLineSelectorContext: () => ({}),
}));

vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));

vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (v) => (v != null ? String(v) : '—'),
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, f) => data?.[f] || data?._identifier || '',
}));

vi.mock('@/lib/documentTotals', () => ({ resolveTotalDiscountPct: () => 0 }));

vi.mock('@/lib/backendErrors.js', () => ({ translateBackendError: (m) => m }));

vi.mock('@/utils/recordActions.js', () => ({
  isDeleteVisibleForRecord: () => true,
}));

vi.mock('@/lib/utils.js', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/lineFieldChange.js', () => ({
  buildCalloutFormState: vi.fn(() => ({})),
  extractAuxValues: vi.fn(() => ({})),
  normalizeCalloutQty: vi.fn(),
  normalizeCalloutResponse: vi.fn(() => ({})),
  applyQtyZeroGuard: vi.fn(),
  roundAmounts: vi.fn((v) => v),
  resolveSnapshotIdentifiers: vi.fn(() => ({})),
}));

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div>{children}</div>,
  DialogClose: ({ children }) => <>{children}</>,
}));

vi.mock('../DocumentPrintDrawer.jsx', () => ({
  default: () => null,
  printDocuments: vi.fn(),
}));

vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../BalanceFooterPanel.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({
  default: ({ status }) => <span>{status}</span>,
}));

vi.mock('@/components/attachments/AttachmentIcon', () => ({
  AttachmentIcon: () => null,
}));

// `LinesSelectionBar` — the real one is only reachable when `linesLayout`
// is `inlineEditable`. Stub it with a trigger exposing `onDelete`/`deleting`
// (mirrors MockTable's onSelectionChange/onRowClick trigger pattern below) so
// variant #2 is testable without depending on the real bar's own rendering.
vi.mock('../LinesSelectionBar.jsx', () => ({
  default: ({ onDelete, deleting, count }) => (
    <div data-testid="lines-selection-bar-stub">
      <span data-testid="lines-selection-bar-count">{count}</span>
      <button data-testid="lines-selection-bar-delete-trigger" disabled={deleting} onClick={onDelete}>
        delete selected
      </button>
    </div>
  ),
}));

// --- IMPORTS ---

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { DetailView } from '../DetailView.jsx';

// ---------------------------------------------------------------------------
// Test harness helpers
// ---------------------------------------------------------------------------

const MockTable = ({ onSelectionChange }) => (
  <div data-testid="mock-table">
    <button
      data-testid="trigger-selection"
      onClick={() => onSelectionChange([{ id: 'ok' }, { id: 'httpfail' }, { id: 'rejected' }])}
    >
      Select Rows
    </button>
  </div>
);

const MockForm = ({ data }) => (
  <div data-testid="mock-form">
    <span>{data?.documentNo}</span>
  </div>
);

const BASE_PROPS = {
  entity: 'header',
  detailEntity: 'lines',
  Form: MockForm,
  DetailTable: MockTable,
  DetailForm: null,
  summary: [],
  statusField: 'documentStatus',
  processes: [],
  // canShowAddLineArea() (gates the wrapper LinesSelectionBar lives in for the
  // inlineEditable variant) requires at least one entry field.
  addLineFields: { entry: [{ key: 'qty', column: 'Quantity', type: 'number', label: 'Qty' }], derived: [] },
  api: {},
  entityLabel: 'Sales Order',
  detailLabel: 'Lines',
  titleField: 'documentNo',
  windowName: 'sales-order',
  recordId: '123',
  token: 'test-token',
  apiBaseUrl: '/api/sales-order',
  breadcrumb: 'Sales / Orders',
};

function renderDetailView(props = {}) {
  return render(
    <MemoryRouter>
      <DetailView {...BASE_PROPS} {...props} />
    </MemoryRouter>,
  );
}

// Mixed-batch fetch: 'ok' succeeds, 'httpfail' resolves non-ok, 'rejected'
// throws — same three-way mix as DetailView.secondaryLineHandlers.vitest.js's
// "mixed batch (one ok, one http-fail, one rejected)" test.
function mockMixedFetch() {
  globalThis.fetch = vi.fn((url) => {
    if (String(url).endsWith('/ok')) return Promise.resolve({ ok: true });
    if (String(url).endsWith('/httpfail')) return Promise.resolve({ ok: false, status: 400 });
    return Promise.reject(new Error('net'));
  });
}

async function confirmDeleteDialog(user) {
  const dialog = await screen.findByTestId('dialog');
  await user.click(within(dialog).getByText('delete'));
}

describe('DetailView — primary lines bulk delete (ETP-4656)', () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
    toast.warning.mockClear();
    mockHook.handleDeleteChild.mockClear();
  });

  describe('variant 1 — non-inlineEditable toolbar button (detail-bulk-action-bar)', () => {
    it('mixed batch: removes only the succeeded row from cache and fires ONE combined warning toast', async () => {
      mockMixedFetch();
      const user = userEvent.setup();
      renderDetailView();

      await user.click(screen.getByTestId('trigger-selection'));
      await user.click(screen.getByTestId('detail-bulk-delete-button'));
      await confirmDeleteDialog(user);

      await waitFor(() => expect(toast.warning).toHaveBeenCalled());

      expect(mockHook.handleDeleteChild).toHaveBeenCalledTimes(1);
      expect(mockHook.handleDeleteChild).toHaveBeenCalledWith('ok');
      expect(mockHook.handleDeleteChild).not.toHaveBeenCalledWith('httpfail');
      expect(mockHook.handleDeleteChild).not.toHaveBeenCalledWith('rejected');

      // 1 succeeded, 3 total, 2 failed — single combined warning toast, no
      // stacked success+error pair.
      expect(toast.warning).toHaveBeenCalledWith(
        'bulkDeletePartialFailure:{"succeeded":1,"total":3,"failed":2}',
      );
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('all succeed: single success toast, no warning/error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      renderDetailView();

      await user.click(screen.getByTestId('trigger-selection'));
      await user.click(screen.getByTestId('detail-bulk-delete-button'));
      await confirmDeleteDialog(user);

      await waitFor(() => expect(toast.success).toHaveBeenCalled());

      expect(mockHook.handleDeleteChild).toHaveBeenCalledTimes(3);
      expect(toast.success).toHaveBeenCalledWith('bulkDeleteAllSucceeded:{"count":3}');
      expect(toast.warning).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('all fail: single error toast, no success/warning, no cache removal', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      const user = userEvent.setup();
      renderDetailView();

      await user.click(screen.getByTestId('trigger-selection'));
      await user.click(screen.getByTestId('detail-bulk-delete-button'));
      await confirmDeleteDialog(user);

      await waitFor(() => expect(toast.error).toHaveBeenCalled());

      expect(mockHook.handleDeleteChild).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('bulkDeleteAllFailed:{"count":3}');
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
    });
  });

  describe('variant 2 — LinesSelectionBar (linesLayout="inlineEditable")', () => {
    it('mixed batch: removes only the succeeded row from cache and fires ONE combined warning toast', async () => {
      mockMixedFetch();
      const user = userEvent.setup();
      renderDetailView({ linesLayout: 'inlineEditable' });

      await user.click(screen.getByTestId('trigger-selection'));
      await user.click(screen.getByTestId('lines-selection-bar-delete-trigger'));
      await confirmDeleteDialog(user);

      await waitFor(() => expect(toast.warning).toHaveBeenCalled());

      expect(mockHook.handleDeleteChild).toHaveBeenCalledTimes(1);
      expect(mockHook.handleDeleteChild).toHaveBeenCalledWith('ok');

      expect(toast.warning).toHaveBeenCalledWith(
        'bulkDeletePartialFailure:{"succeeded":1,"total":3,"failed":2}',
      );
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('all succeed: single success toast, no warning/error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      renderDetailView({ linesLayout: 'inlineEditable' });

      await user.click(screen.getByTestId('trigger-selection'));
      await user.click(screen.getByTestId('lines-selection-bar-delete-trigger'));
      await confirmDeleteDialog(user);

      await waitFor(() => expect(toast.success).toHaveBeenCalled());

      expect(mockHook.handleDeleteChild).toHaveBeenCalledTimes(3);
      expect(toast.success).toHaveBeenCalledWith('bulkDeleteAllSucceeded:{"count":3}');
      expect(toast.warning).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });
  });
});
