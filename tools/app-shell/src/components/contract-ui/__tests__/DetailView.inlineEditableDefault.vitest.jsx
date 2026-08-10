/**
 * ETP-4763 — guards the new default `linesLayout='inlineEditable'` for
 * DetailView's primary lines table.
 *
 * Before this change the default was 'classic', so clicking a line row
 * opened the right-hand DetailForm sidebar (buildLineRowClickHandler,
 * detailViewHelpers.jsx). The default flip means a row click now does
 * NOT open that sidebar unless a window explicitly opts back into
 * `linesLayout="classic"`. This is intentionally a single, obvious place
 * to catch a future accidental default change in either direction.
 *
 * Harness mirrors DetailView.lineSidebarSaveDeleteFlow.vitest.jsx.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
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
  children: [{ id: 'L1', product: 'P1', 'product$_identifier': 'Widget', unitPrice: 10, lineNetAmount: 100 }],
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
  useLineGrossAmount: () => ({
    computeLineGrossAmount: (field, value, result) => { result[field] = value; },
    resolveTaxFactor: () => 1,
    deriveLineNet: () => 0,
    prepareLineForPost: (lineData) => lineData,
  }),
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

// Same stub shape as DetailView.lineSidebarSaveDeleteFlow.vitest.jsx — exposes
// onRowClick directly so the test doesn't depend on any particular table markup.
const StubDetailTable = ({ data, onRowClick }) => (
  <div data-testid="stub-detail-table">
    {(data || []).map(r => (
      <button key={r.id} type="button" data-testid={`row-${r.id}`} onClick={() => onRowClick?.(r)}>
        {r.id}
      </button>
    ))}
  </div>
);

const StubDetailForm = ({ data }) => (
  <div data-testid="stub-detail-form">
    <span data-testid="stub-detail-form-data">{JSON.stringify(data)}</span>
  </div>
);

function renderDetailView(props = {}) {
  return render(
    <MemoryRouter>
      <DetailView
        entity="header"
        detailEntity="lines"
        Form={MockForm}
        DetailTable={StubDetailTable}
        DetailForm={StubDetailForm}
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

describe('DetailView linesLayout default (ETP-4763)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('without a linesLayout prop, clicking a line row does not open the DetailForm sidebar', async () => {
    const user = userEvent.setup();
    renderDetailView();

    await user.click(screen.getByTestId('row-L1'));

    expect(screen.queryByTestId('stub-detail-form')).not.toBeInTheDocument();
  });

  it('with linesLayout="classic", clicking a line row still opens the DetailForm sidebar', async () => {
    const user = userEvent.setup();
    renderDetailView({ linesLayout: 'classic' });

    await user.click(screen.getByTestId('row-L1'));

    expect(await screen.findByTestId('stub-detail-form')).toBeInTheDocument();
    expect(screen.getByTestId('stub-detail-form-data').textContent).toContain('L1');
  });
});
