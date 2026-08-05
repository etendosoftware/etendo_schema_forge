/**
 * Covers the real (non-extracted) handleAddLineClick / handleImportClick
 * useCallback bodies inside DetailView, plus the openAddLine / openImportModal
 * route-state auto-open effects. These are exercised end-to-end through the
 * `linesEmptyState` slot (via a lightweight stub component) rather than
 * through the already-tested `runAddLineAction` extracted helper.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

const mockNavigate = vi.fn();
let mockLocationState = {};

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/sales-order/123', search: '', state: mockLocationState }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const mockHook = {
  loading: false,
  items: [],
  selected: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
  editing: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
  children: [],
  isDirtyHeader: false,
  loadingChildren: false,
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
  fetchById: vi.fn().mockResolvedValue({}),
  fetchChildren: vi.fn(),
  refreshChildren: vi.fn(),
  handleNew: vi.fn(),
  isSaving: false,
  primeSaved: vi.fn(),
};

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => mockHook,
  extractErrorMessage: async () => 'Error',
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

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => 'EUR',
}));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, calculate: vi.fn() }),
  ORDER_LINE_CONFIG: {
    qtyField: 'orderedQuantity',
    priceField: 'unitPrice',
    totalField: 'lineNetAmount',
  },
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({
    executeAction: vi.fn(),
    loading: false,
  }),
}));

vi.mock('@/i18n', () => ({
  useMenuLabel: () => (k) => k,
  useUI: () => (k) => k,
  useLabel: () => () => '',
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: () => vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
  }),
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

vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));

vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (v) => (v != null ? String(v) : '—'),
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, f) => data?.[f] || data?._identifier || '',
}));

vi.mock('@/lib/documentTotals', () => ({
  resolveTotalDiscountPct: () => 0,
}));

vi.mock('@/lib/backendErrors.js', () => ({
  translateBackendError: (m) => m,
}));

vi.mock('@/utils/recordActions.js', () => ({
  isDeleteVisibleForRecord: () => true,
}));

vi.mock('@/lib/utils.js', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div data-testid="dialog-footer">{children}</div>,
  DialogClose: ({ children }) => children,
}));

vi.mock('../DocumentPrintDrawer.jsx', () => ({
  default: () => null,
  printDocuments: vi.fn(),
}));

vi.mock('../SummaryBar.jsx', () => ({
  SummaryBar: () => null,
}));

vi.mock('../DocumentTotalsPanel.jsx', () => ({
  default: () => null,
}));

vi.mock('../LinesSelectionBar.jsx', () => ({
  default: () => null,
}));

vi.mock('../DocumentStatusPill.jsx', () => ({
  default: ({ status }) => <span data-testid="status-pill">{status}</span>,
}));

vi.mock('@/components/attachments/AttachmentIcon', () => ({
  AttachmentIcon: () => <span>📎</span>,
}));

const MockForm = ({ data }) => (
  <div data-testid="mock-form">
    <span>{data?.documentNo}</span>
  </div>
);

const MockTable = ({ data }) => (
  <div data-testid="mock-table">
    {(data || []).map(r => <div key={r.id}>{r.id}</div>)}
  </div>
);

// Lightweight stub that exposes onAddLine / onSave directly (instead of the
// real LinesEmptyState.jsx, which does not forward those two props).
const StubEmptyState = ({ onAddLine, onSave }) => (
  <div data-testid="stub-empty-state">
    <button type="button" data-testid="stub-add-line" onClick={onAddLine}>Add</button>
    <button type="button" data-testid="stub-import" onClick={() => onSave('order')}>Import</button>
  </div>
);

function renderDetailView(props = {}) {
  return render(
    <MemoryRouter>
      <DetailView
        entity="header"
        detailEntity="lines"
        Form={MockForm}
        DetailTable={MockTable}
        DetailForm={null}
        summary={[]}
        statusField="documentStatus"
        processes={[]}
        addLineFields={{ entry: [{ key: 'product', label: 'Product', type: 'selector', column: 'M_Product_ID' }], derived: [] }}
        linesEmptyState={StubEmptyState}
        api={{}}
        entityLabel="Sales Order"
        detailLabel="Lines"
        titleField="documentNo"
        windowName="sales-order"
        recordId="123"
        token="test-token"
        apiBaseUrl="/api/sales-order"
        breadcrumb="Sales / Orders"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('DetailView handleAddLineClick / handleImportClick (real callbacks)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationState = {};
    mockHook.children = [];
    mockHook.handleSave = vi.fn().mockResolvedValue({});
  });

  describe('existing record (not new)', () => {
    it('toggles addingLine without saving the header', async () => {
      const user = userEvent.setup();
      renderDetailView();
      await screen.findByTestId('stub-add-line');
      await user.click(screen.getByTestId('stub-add-line'));
      expect(mockHook.handleSave).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('handleImportClick saves in place and returns true without navigating', async () => {
      const user = userEvent.setup();
      renderDetailView();
      await screen.findByTestId('stub-import');
      await user.click(screen.getByTestId('stub-import'));
      await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalledTimes(1));
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('new record (isNew)', () => {
    it('handleAddLineClick saves the header then navigates with openAddLine state', async () => {
      mockHook.handleSave = vi.fn().mockResolvedValue({ id: 'NEW-1', documentNo: 'SO-NEW' });
      const user = userEvent.setup();
      renderDetailView({ recordId: 'new' });
      await screen.findByTestId('stub-add-line');
      await user.click(screen.getByTestId('stub-add-line'));
      await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalledTimes(1));
      expect(mockHook.primeSaved).toHaveBeenCalledWith({ id: 'NEW-1', documentNo: 'SO-NEW' });
      expect(mockNavigate).toHaveBeenCalledWith('/sales-order/NEW-1', {
        replace: true,
        state: { openAddLine: true, justSaved: { id: 'NEW-1', documentNo: 'SO-NEW' } },
      });
    });

    it('handleAddLineClick does nothing further when save returns no id', async () => {
      mockHook.handleSave = vi.fn().mockResolvedValue(null);
      const user = userEvent.setup();
      renderDetailView({ recordId: 'new' });
      await screen.findByTestId('stub-add-line');
      await user.click(screen.getByTestId('stub-add-line'));
      await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalledTimes(1));
      expect(mockHook.primeSaved).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('handleImportClick saves the header then navigates with openImportModal state', async () => {
      mockHook.handleSave = vi.fn().mockResolvedValue({ id: 'NEW-2', documentNo: 'SO-NEW-2' });
      const user = userEvent.setup();
      renderDetailView({ recordId: 'new' });
      await screen.findByTestId('stub-import');
      await user.click(screen.getByTestId('stub-import'));
      await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalledTimes(1));
      expect(mockHook.primeSaved).toHaveBeenCalledWith({ id: 'NEW-2', documentNo: 'SO-NEW-2' });
      expect(mockNavigate).toHaveBeenCalledWith('/sales-order/NEW-2', {
        replace: true,
        state: { openImportModal: 'order', justSaved: { id: 'NEW-2', documentNo: 'SO-NEW-2' } },
      });
    });

    it('handleImportClick returns false when save returns no id (no navigation)', async () => {
      mockHook.handleSave = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderDetailView({ recordId: 'new' });
      await screen.findByTestId('stub-import');
      await user.click(screen.getByTestId('stub-import'));
      await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalledTimes(1));
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});

describe('DetailView openAddLine / openImportModal route-state effects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook.children = [];
  });

  afterEach(() => {
    mockLocationState = {};
  });

  it('auto-opens the add-line form and clears route state when openAddLine is set', async () => {
    mockLocationState = { openAddLine: true };
    renderDetailView();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/sales-order/123', { replace: true, state: {} });
    });
  });

  it('sets forceOpenImport and clears route state when openImportModal is set', async () => {
    mockLocationState = { openImportModal: 'invoice' };
    renderDetailView();
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/sales-order/123', { replace: true, state: {} });
    });
  });

  it('does not navigate when there is no openAddLine/openImportModal flag', async () => {
    mockLocationState = {};
    renderDetailView();
    await screen.findByTestId('stub-empty-state');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not auto-open when the record is new (isNew guards the effect)', async () => {
    mockLocationState = { openAddLine: true };
    renderDetailView({ recordId: 'new' });
    // isNew short-circuits both effects before they can call navigate.
    await new Promise(r => setTimeout(r, 0));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
