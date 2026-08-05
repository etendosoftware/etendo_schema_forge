/**
 * ETP-4670: a checkbox/toggle field under autoSaveOnBlur autosaves immediately
 * (EntityForm fires onFieldBlur right after onChange for those field types —
 * see EntityForm.vitest.jsx). This covers the DetailView side of that fix:
 * `handleFieldBlur` must await `hook.handleSave()` and, when the backend
 * rejects the change (handleSave resolves to null — see useEntity.js), revert
 * `editing` back to the last persisted `selected` via `hook.handleSelect`.
 * Without this, a rejected optimistic checkbox flip (e.g. NEO Headless's
 * ProductCategoryDefaultHandler 400 "Only one product category can be marked
 * as default.") stayed visually checked with no revert, even though
 * handleSave already surfaced the translated error toast.
 *
 * Covers:
 *  (1) autosave succeeds → handleSelect is NOT called (no revert on success)
 *  (2) autosave fails (handleSave resolves null) → handleSelect(selected) reverts
 *  (3) no unsaved edits → handleSave is never called at all
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/product-category/123', search: '' }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const baseRecord = { id: '123', name: 'Beverages', default: false };

const mockHook = {
  loading: false,
  items: [],
  selected: { ...baseRecord },
  editing: { ...baseRecord },
  children: [],
  childDefaults: {},
  isDirtyHeader: false,
  childrenLoading: false,
  error: null,
  handleChange: vi.fn(),
  handleSave: vi.fn(),
  handleDelete: vi.fn().mockResolvedValue({}),
  handleAddChild: vi.fn().mockResolvedValue({ id: 'L2' }),
  handleDeleteChild: vi.fn(),
  handleSelect: vi.fn(),
  handleUpdateChild: vi.fn(),
  handleProcess: vi.fn(),
  handleSaveAndProcess: vi.fn().mockResolvedValue({}),
  fetchById: vi.fn().mockResolvedValue({}),
  fetchChildren: vi.fn(),
  isSaving: false,
  runningProcess: null,
  primeSaved: vi.fn(),
};

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => mockHook,
  extractErrorMessage: async () => 'Error',
}));
vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({ catalogs: {}, loading: false, catalogsLoaded: true }) }));
vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set(), visibility: {}, readOnly: {} }),
}));
vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }),
}));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ computeLineGrossAmount: vi.fn(), resolveTaxFactor: () => 1, prepareLineForPost: (l) => l }),
  ORDER_LINE_CONFIG: { qtyField: 'orderedQuantity', priceField: 'unitPrice', totalField: 'lineNetAmount' },
}));
vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({ executeAction: vi.fn(), loading: false }) }));
vi.mock('@/hooks/useNeoAction', () => ({ useNeoAction: () => ({ execute: vi.fn(), loading: false }) }));
vi.mock('@/i18n', () => ({ useMenuLabel: () => (k) => k, useUI: () => (k) => k, useLabel: () => () => '' }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }),
}));
vi.mock('@/components/CurrentWindowContext', () => ({ useRegisterWindowContext: () => {} }));
vi.mock('@/components/copilot/ocr/ocrDocTypes', () => ({ matchOcrDocType: () => null }));
vi.mock('@/lib/selectorContext.js', () => ({
  buildHeaderSelectorContext: () => ({}),
  buildLineSelectorContext: () => ({}),
}));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => (v != null ? String(v) : '—') }));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (data, f) => data?.[f] || data?._identifier || '' }));
vi.mock('@/lib/documentTotals', () => ({ resolveTotalDiscountPct: () => 0 }));
vi.mock('@/lib/backendErrors.js', () => ({ translateBackendError: (m) => m }));
vi.mock('@/utils/recordActions.js', () => ({ isDeleteVisibleForRecord: () => true }));
vi.mock('@/lib/utils.js', () => ({ cn: (...args) => args.filter(Boolean).join(' ') }));

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div>{children}</div>,
  DialogClose: ({ children }) => children,
}));
vi.mock('../ProcessParamDialog', () => ({
  ProcessParamDialog: () => null,
}));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../BalanceFooterPanel.jsx', () => ({ default: () => null }));
vi.mock('../LinesSelectionBar.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: ({ label, status }) => <span data-testid="status-pill">{label ?? status}</span> }));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>A</span> }));

const MockDetailTable = () => <div data-testid="mock-detail-table" />;

// Mirrors ProductCategoryCustomForm's checkbox: onClick calls onChange then
// immediately onFieldBlur (the EntityForm behavior this fix relies on).
const MockCheckboxForm = ({ data, onChange, onFieldBlur }) => (
  <button
    type="button"
    data-testid="default-checkbox"
    onClick={() => {
      onChange('default', !data?.default, 'IsDefault');
      onFieldBlur?.('default');
    }}
  >
    {data?.default ? 'checked' : 'unchecked'}
  </button>
);

function renderView(props = {}) {
  return render(
    <MemoryRouter>
      <DetailView
        entity="productCategory"
        detailEntity="accounting"
        Form={MockCheckboxForm}
        DetailTable={MockDetailTable}
        DetailForm={null}
        summary={[]}
        statusField={null}
        processes={[]}
        addLineFields={{ entry: [], derived: [] }}
        api={{}}
        entityLabel="Product Category"
        detailLabel="Accounting"
        windowName="product-category"
        recordId="123"
        token="test-token"
        apiBaseUrl="/sws/neo/product-category"
        breadcrumb="Inventory / Product Category"
        autoSaveOnBlur
        {...props}
      />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.clearAllMocks();
  mockHook.selected = { ...baseRecord };
  mockHook.editing = { ...baseRecord };
});

describe('DetailView autosave-on-blur revert (ETP-4670)', () => {
  it('(1) does not revert when the autosave succeeds', async () => {
    mockHook.editing = { ...baseRecord, default: true };
    mockHook.handleSave.mockResolvedValue({ ...baseRecord, default: true });

    renderView();
    fireEvent.click(screen.getAllByTestId('default-checkbox')[0]);

    await vi.waitFor(() => expect(mockHook.handleSave).toHaveBeenCalledTimes(1));
    expect(mockHook.handleSelect).not.toHaveBeenCalled();
  });

  it('(2) reverts editing to the last-persisted selected record when the autosave PATCH is rejected', async () => {
    mockHook.editing = { ...baseRecord, default: true };
    // handleSave resolves to null on any failure (400 from
    // ProductCategoryDefaultHandler, network error, etc.) — see useEntity.js.
    mockHook.handleSave.mockResolvedValue(null);

    renderView();
    fireEvent.click(screen.getAllByTestId('default-checkbox')[0]);

    await vi.waitFor(() => expect(mockHook.handleSave).toHaveBeenCalledTimes(1));
    expect(mockHook.handleSelect).toHaveBeenCalledTimes(1);
    expect(mockHook.handleSelect).toHaveBeenCalledWith(mockHook.selected);
  });

  it('(3) never calls handleSave when editing has not diverged from selected', async () => {
    // editing === selected (no pending change) — onFieldBlur fires but
    // hasUnsavedEdits() is false, so handleSave must be skipped entirely.
    mockHook.editing = { ...baseRecord };
    mockHook.selected = { ...baseRecord };

    renderView();
    fireEvent.click(screen.getAllByTestId('default-checkbox')[0]);

    await new Promise((r) => setTimeout(r, 0));
    expect(mockHook.handleSave).not.toHaveBeenCalled();
    expect(mockHook.handleSelect).not.toHaveBeenCalled();
  });
});
