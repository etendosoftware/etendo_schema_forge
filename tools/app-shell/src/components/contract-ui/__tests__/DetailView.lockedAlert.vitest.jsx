/**
 * Render tests for DetailView's declarative `lockedAlert` banner.
 *
 * The banner renders inside the principal form card (above <Form section="principal">)
 * ONLY when `lockedAlert` is set AND the document is processed
 * (_headerData.processed === true || === 'Y'). Mirrors the mock harness used by
 * DetailView.render.vitest.jsx, with a stable navigate mock so the action button's
 * onClick can be asserted.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// Stable navigate spy shared across renders so we can assert the action button click.
const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/sales-order/123', search: '' }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const mockHook = {
  loading: false,
  items: [],
  selected: { id: '123', documentNo: 'SO-001', documentStatus: 'CO', processed: true },
  editing: { id: '123', documentNo: 'SO-001', documentStatus: 'CO', processed: true },
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
  isSaving: false,
  primeSaved: vi.fn(),
};

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => mockHook,
  extractErrorMessage: async () => 'Error',
}));

vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({ catalogs: {}, loading: false }) }));
vi.mock('@/hooks/useDisplayLogic', () => ({ useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set() }) }));
vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }),
}));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, calculate: vi.fn() }),
  ORDER_LINE_CONFIG: { qtyField: 'orderedQuantity', priceField: 'unitPrice', totalField: 'lineNetAmount' },
}));
vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ executeAction: vi.fn(), loading: false }),
}));

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
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
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
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div data-testid="dialog-footer">{children}</div>,
  DialogClose: ({ children }) => children,
}));

vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../LinesSelectionBar.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: ({ status }) => <span data-testid="status-pill">{status}</span> }));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>📎</span> }));

import { DetailView } from '../DetailView.jsx';

const MockForm = ({ data }) => (
  <div data-testid="mock-form"><span>{data?.documentNo}</span></div>
);
const MockTable = ({ data }) => (
  <div data-testid="mock-table">{(data || []).map((r) => <div key={r.id}>{r.id}</div>)}</div>
);

const FULL_ALERT = {
  title: 'lockedAlertTitle',
  message: 'lockedAlertMessage',
  actionLabel: 'lockedAlertAction',
  navigateTo: '/physical-inventory/new',
};

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

const PROCESSED = { id: '123', documentNo: 'SO-001', documentStatus: 'CO', processed: true };
const NOT_PROCESSED = { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false };

describe('DetailView lockedAlert banner', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    mockHook.selected = { ...PROCESSED };
    mockHook.editing = { ...PROCESSED };
  });

  it('renders the banner with title, message, and action button when set and processed', () => {
    renderDetailView({ lockedAlert: FULL_ALERT });

    const banner = screen.getByTestId('locked-alert');
    expect(banner).toBeInTheDocument();
    // ui() returns the key as-is in the mock, so the resolved text equals the key.
    expect(banner).toHaveTextContent('lockedAlertTitle');
    expect(banner).toHaveTextContent('lockedAlertMessage');
    expect(screen.getByTestId('locked-alert-action')).toBeInTheDocument();
    expect(screen.getByTestId('locked-alert-action')).toHaveTextContent('lockedAlertAction');
  });

  it('navigates to navigateTo when the action button is clicked', async () => {
    const user = userEvent.setup();
    renderDetailView({ lockedAlert: FULL_ALERT });

    await user.click(screen.getByTestId('locked-alert-action'));
    expect(navigateMock).toHaveBeenCalledWith('/physical-inventory/new');
  });

  it('does NOT render the banner when lockedAlert is set but the record is not processed', () => {
    mockHook.selected = { ...NOT_PROCESSED };
    mockHook.editing = { ...NOT_PROCESSED };
    renderDetailView({ lockedAlert: FULL_ALERT });

    expect(screen.queryByTestId('locked-alert')).toBeNull();
  });

  it('does NOT render the banner when lockedAlert is null even if processed', () => {
    renderDetailView({ lockedAlert: null });
    expect(screen.queryByTestId('locked-alert')).toBeNull();
  });

  it('does NOT render the banner when lockedAlert prop is absent (default null)', () => {
    renderDetailView();
    expect(screen.queryByTestId('locked-alert')).toBeNull();
  });

  it('renders the banner WITHOUT the action button when actionLabel/navigateTo are missing', () => {
    renderDetailView({
      lockedAlert: { title: 'lockedAlertTitle', message: 'lockedAlertMessage' },
    });

    const banner = screen.getByTestId('locked-alert');
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent('lockedAlertTitle');
    expect(banner).toHaveTextContent('lockedAlertMessage');
    // No action button when actionLabel + navigateTo are not both provided.
    expect(screen.queryByTestId('locked-alert-action')).toBeNull();
  });

  it('renders the banner WITHOUT the action button when only navigateTo is provided (no actionLabel)', () => {
    renderDetailView({
      lockedAlert: { title: 'lockedAlertTitle', message: 'lockedAlertMessage', navigateTo: '/physical-inventory/new' },
    });

    expect(screen.getByTestId('locked-alert')).toBeInTheDocument();
    expect(screen.queryByTestId('locked-alert-action')).toBeNull();
  });

  it('treats processed === "Y" as processed and renders the banner', () => {
    mockHook.selected = { id: '123', documentNo: 'SO-001', documentStatus: 'CO', processed: 'Y' };
    mockHook.editing = { id: '123', documentNo: 'SO-001', documentStatus: 'CO', processed: 'Y' };
    renderDetailView({ lockedAlert: FULL_ALERT });

    expect(screen.getByTestId('locked-alert')).toBeInTheDocument();
  });
});
