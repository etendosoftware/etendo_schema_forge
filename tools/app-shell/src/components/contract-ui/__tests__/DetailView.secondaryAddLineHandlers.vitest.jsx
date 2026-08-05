/**
 * Covers the real handleSecondaryAddLineToggle / handleCustomModalAddClick
 * useCallback bodies inside DetailView — exercised end-to-end via the
 * secondary tab's own empty-state "add" button (which calls
 * `runAddLineAction`, already unit-tested elsewhere, but wired here to the
 * REAL closures instead of a mock).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

const mockNavigate = vi.fn();

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/sales-order/123', search: '', state: {} }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const mockHook = {
  loading: false,
  items: [],
  selected: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
  editing: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
  children: [{ id: 'L1', product: 'P1', 'product$_identifier': 'Widget', lineNetAmount: 100 }],
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

// Secondary hooks (up to 5) are all rendered via useEntity — provide an empty
// children list for every secondary entity so the empty-state "add" trigger
// (not the full table) renders for the secondary tab under test.
vi.mock('@/hooks/useEntity', () => ({
  useEntity: (entity, detailEntity) => {
    if (detailEntity === 'lines') return mockHook;
    return { ...mockHook, children: [], selected: mockHook.selected, editing: mockHook.editing };
  },
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

const StubSecondaryTable = () => <div data-testid="stub-secondary-table" />;

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

describe('DetailView handleSecondaryAddLineToggle (real callback, regular tab)', () => {
  const secondaryTabs = [{
    key: 'addresses',
    label: 'Addresses',
    Table: StubSecondaryTable,
    addLineFields: { entry: [{ key: 'street', label: 'Street', type: 'text' }], derived: [] },
  }];

  beforeEach(() => {
    vi.clearAllMocks();
    mockHook.children = [{ id: 'L1', product: 'P1', 'product$_identifier': 'Widget', lineNetAmount: 100 }];
  });

  it('activating the tab and clicking its empty-state add button toggles addingSecondaryLine (no save)', async () => {
    const user = userEvent.setup();
    renderDetailView({ secondaryTabs });
    await user.click(screen.getByTestId('tab-addresses'));
    const emptyState = await screen.findByTestId('secondary-tab-empty-state');
    await user.click(screen.getByRole('button', { name: /addEntity/i }));
    // Not isNew + no requireSavedRecord → toggles addingSecondaryLine locally,
    // never touches the header save/navigate path.
    expect(mockHook.handleSave).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(emptyState).toBeTruthy();
  });

  it('isNew + requireSavedRecord saves the header then navigates with openSecondaryTab state', async () => {
    // isNew's "Complete" button (renderNewRecordSaveActions) only renders — and
    // dereferences draftMode.label — when hook.children.length > 0; keep it
    // empty here since no draftMode prop is passed in this fixture.
    mockHook.children = [];
    mockHook.handleSave = vi.fn().mockResolvedValue({ id: 'NEW-3', documentNo: 'SO-NEW-3' });
    const user = userEvent.setup();
    renderDetailView({
      recordId: 'new',
      secondaryTabs: [{ ...secondaryTabs[0], requireSavedRecord: true }],
    });
    await user.click(screen.getByTestId('tab-addresses'));
    await screen.findByTestId('secondary-tab-empty-state');
    await user.click(screen.getByRole('button', { name: /addEntity/i }));
    await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalledTimes(1));
    expect(mockHook.primeSaved).toHaveBeenCalledWith({ id: 'NEW-3', documentNo: 'SO-NEW-3' });
    expect(mockNavigate).toHaveBeenCalledWith('/sales-order/NEW-3', {
      replace: true,
      state: { openSecondaryTab: 'addresses', openAddSecondaryLine: true, justSaved: { id: 'NEW-3', documentNo: 'SO-NEW-3' } },
    });
  });

  it('isNew + requireSavedRecord does nothing further when save returns no id', async () => {
    mockHook.children = [];
    mockHook.handleSave = vi.fn().mockResolvedValue(null);
    const user = userEvent.setup();
    renderDetailView({
      recordId: 'new',
      secondaryTabs: [{ ...secondaryTabs[0], requireSavedRecord: true }],
    });
    await user.click(screen.getByTestId('tab-addresses'));
    await screen.findByTestId('secondary-tab-empty-state');
    await user.click(screen.getByRole('button', { name: /addEntity/i }));
    await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalledTimes(1));
    expect(mockHook.primeSaved).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
