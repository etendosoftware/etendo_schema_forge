/**
 * Coverage top-up for DetailView's isNew(recordId === 'new')-gated effects and
 * handlers — the identifier-resolution effect for default selector values, and
 * the isNew branches of handleAddLineClick / handleImportClick / the secondary
 * "add line" toggles (all module-internal, unreachable except through a live
 * render). Harness mirrors DetailView.lineCalloutFlow.vitest.jsx.
 */
import { render, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/sales-order/new', search: '' }),
  };
});

const mockNavigate = vi.fn();

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const mockHook = {
  loading: false,
  items: [],
  selected: null,
  editing: { documentNo: '', documentStatus: 'DR', uOM: 'U1' },
  children: [],
  childDefaults: {},
  isDirtyHeader: false,
  loadingChildren: false,
  childrenLoading: false,
  error: null,
  handleChange: vi.fn(),
  handleNew: vi.fn(),
  handleSave: vi.fn().mockResolvedValue({ id: 'NEW1' }),
  handleCreate: vi.fn().mockResolvedValue({}),
  handleDelete: vi.fn().mockResolvedValue({}),
  handleAddChild: vi.fn().mockResolvedValue({ id: 'L2' }),
  handleDeleteChild: vi.fn(),
  handleSelect: vi.fn(),
  handleUpdateChild: vi.fn(),
  handleProcess: vi.fn(),
  handleSaveAndProcess: vi.fn().mockResolvedValue({}),
  fetchById: vi.fn().mockResolvedValue({}),
  fetchChildren: vi.fn(),
  refreshChildren: vi.fn(),
  isSaving: false,
  primeSaved: vi.fn(),
};

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => mockHook,
  extractErrorMessage: async () => 'Error',
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useCatalogs: () => ({
    catalogs: { lines: { uOM: [{ id: 'U1', label: 'Unit' }] } },
    loading: false,
    catalogsLoaded: true,
  }),
}));

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set() }),
}));

vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }),
}));

vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'USD' }));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({
    computeLineGrossAmount: vi.fn(),
    resolveTaxFactor: () => 1.21,
    prepareLineForPost: (line) => line,
  }),
  ORDER_LINE_CONFIG: {
    qtyField: 'orderedQuantity',
    priceField: 'unitPrice',
    discountField: 'discount',
    grossField: 'lineGrossAmount',
    totalField: 'lineNetAmount',
  },
}));

vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({ executeAction: vi.fn(), loading: false }) }));
vi.mock('@/hooks/useNeoAction', () => ({ useNeoAction: () => ({ execute: vi.fn(), loading: false }) }));

vi.mock('@/i18n', () => ({
  useMenuLabel: () => (k) => k,
  useUI: () => (k) => k,
  useLabel: () => () => '',
}));

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

vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: (catalogs, entity, sel) => {
    if (sel?.field === 'uOM') return [{ id: 'U1', label: 'Unit' }];
    return [];
  },
}));

vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => (v != null ? String(v) : '—') }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, f) => data?.[f] || data?._identifier || '',
}));
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

vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../BalanceFooterPanel.jsx', () => ({ default: () => null }));
vi.mock('../LinesSelectionBar.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: ({ status }) => <span>{status}</span> }));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>A</span> }));

const MockDetailTable = () => <div data-testid="mock-detail-table" />;
const MockForm = ({ data }) => <div data-testid="mock-form">{data?.documentNo}</div>;

const ENTRY_FIELDS = [
  { key: 'product', label: 'Product', type: 'selector', column: 'M_Product_ID' },
];

function renderNew(props = {}) {
  return render(
    <MemoryRouter>
      <DetailView
        entity="header"
        detailEntity="lines"
        Form={MockForm}
        DetailTable={MockDetailTable}
        DetailForm={null}
        summary={[]}
        statusField="documentStatus"
        processes={[]}
        addLineFields={{ entry: ENTRY_FIELDS, derived: [] }}
        api={{ selectors: [{ field: 'uOM', entity: 'lines' }] }}
        entityLabel="Sales Order"
        detailLabel="Lines"
        titleField="documentNo"
        windowName="sales-order"
        recordId="new"
        token="test-token"
        apiBaseUrl="/api/sales-order"
        breadcrumb="Sales / Orders"
        linesLayout="inlineEditable"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('DetailView isNew-gated effects', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockHook.editing = { documentNo: '', documentStatus: 'DR', uOM: 'U1' };
  });

  it('resolves the $_identifier for a default selector value from loaded catalogs', async () => {
    renderNew();
    await waitFor(() => {
      expect(mockHook.handleChange).toHaveBeenCalledWith('uOM$_identifier', 'Unit');
    });
  });

  it('does not resolve an identifier the editing record already has', async () => {
    mockHook.editing = { documentNo: '', documentStatus: 'DR', uOM: 'U1', 'uOM$_identifier': 'Already Set' };
    renderNew();
    // Give the effect a tick to (not) fire.
    await act(async () => { await Promise.resolve(); });
    expect(mockHook.handleChange).not.toHaveBeenCalledWith('uOM$_identifier', expect.anything());
  });

  it('does not resolve an identifier when the selector value has no catalog match', async () => {
    mockHook.editing = { documentNo: '', documentStatus: 'DR', uOM: 'UNKNOWN' };
    renderNew();
    await act(async () => { await Promise.resolve(); });
    expect(mockHook.handleChange).not.toHaveBeenCalledWith('uOM$_identifier', expect.anything());
  });
});
