/**
 * ETP-5116 — secondaryTabs.visibleWhenCapability integration coverage.
 *
 * Mirrors DetailView.render.vitest.jsx's mount setup (same mock list — DetailView
 * pulls in a large dependency surface) but adds a mockable useCapabilitiesSafe()
 * so each test controls whether the gated tab's capability is granted.
 *
 * Covers what the pure buildInitialTabs unit tests (DetailView.secondaryTabsVisibleWhenCapability.vitest.jsx)
 * cannot exercise: the real tab-strip button visibility, AND the two content-render
 * edge cases —
 *   1. a Panel-type secondaryTab, which DetailView otherwise mounts eagerly
 *      regardless of which tab is active (so its onCount can fire without a click)
 *      — this must NOT bypass a capability gate.
 *   2. the openSecondaryTab deep-link (location.state), which must not be able to
 *      activate a capability-hidden tab.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

// Mutable ref so each test can flip the granted capability without re-mocking.
const capabilitiesRef = vi.hoisted(() => ({ current: {} }));
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({
  useCapabilitiesSafe: () => capabilitiesRef.current,
}));

// Mutable ref so a test can simulate a stale/direct deep-link via location.state.
const locationStateRef = vi.hoisted(() => ({ current: undefined }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/sales-order/123', search: '', state: locationStateRef.current }),
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
  isSaving: false,
  primeSaved: vi.fn(),
};

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => mockHook,
  extractErrorMessage: async () => 'Error',
}));
vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({ catalogs: {}, loading: false }) }));
vi.mock('@/hooks/useDisplayLogic', () => ({ useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set() }) }));
vi.mock('@/hooks/useCallout', () => ({ useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }) }));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, calculate: vi.fn() }),
  ORDER_LINE_CONFIG: { qtyField: 'orderedQuantity', priceField: 'unitPrice', totalField: 'lineNetAmount' },
}));
vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({ executeAction: vi.fn(), loading: false }) }));
vi.mock('@/i18n', () => ({ useMenuLabel: () => (k) => k, useUI: () => (k) => k, useLabel: () => () => '' }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({ useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }) }));
vi.mock('@/components/CurrentWindowContext', () => ({ useRegisterWindowContext: () => {} }));
vi.mock('@/components/copilot/ocr/ocrDocTypes', () => ({ matchOcrDocType: () => null }));
vi.mock('@/lib/selectorContext.js', () => ({ buildHeaderSelectorContext: () => ({}), buildLineSelectorContext: () => ({}) }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => (v != null ? String(v) : '—') }));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (data, f) => data?.[f] || data?._identifier || '' }));
vi.mock('@/lib/documentTotals', () => ({ resolveTotalDiscountPct: () => 0 }));
vi.mock('@/lib/backendErrors.js', async (importOriginal) => ({ ...(await importOriginal()), translateBackendError: (m) => m }));
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

const MockForm = ({ data }) => <div data-testid="mock-form"><span>{data?.documentNo}</span></div>;
const MockTable = ({ data }) => <div data-testid="mock-table">{(data || []).map((r) => <div key={r.id}>{r.id}</div>)}</div>;
const MockPanel = vi.fn(() => <div data-testid="accounting-panel">Accounting Panel</div>);

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

const gatedPanelTab = { key: 'accounting', label: 'Accounting', Panel: MockPanel, visibleWhenCapability: 'showAccountingFields' };

describe('DetailView — secondaryTabs.visibleWhenCapability (ETP-5116)', () => {
  beforeEach(() => {
    capabilitiesRef.current = {};
    locationStateRef.current = undefined;
    MockPanel.mockClear();
  });

  it('hides the tab-strip button and never mounts the Panel when the capability is not granted', () => {
    capabilitiesRef.current = { showAccountingFields: false };
    renderDetailView({ secondaryTabs: [gatedPanelTab] });

    expect(screen.queryByTestId('tab-accounting')).not.toBeInTheDocument();
    // Panel tabs are normally mounted eagerly regardless of active tab (so their
    // onCount can fire without a click) — confirming it does NOT mount here is
    // the actual regression guard: a naive isActiveTab-only check would have
    // let it through.
    expect(screen.queryByTestId('accounting-panel')).not.toBeInTheDocument();
    expect(MockPanel).not.toHaveBeenCalled();
  });

  it('shows the tab-strip button and mounts the Panel when the capability IS granted', () => {
    capabilitiesRef.current = { showAccountingFields: true };
    renderDetailView({ secondaryTabs: [gatedPanelTab] });

    expect(screen.getByTestId('tab-accounting')).toBeInTheDocument();
    expect(screen.getByTestId('accounting-panel')).toBeInTheDocument();
  });

  it('a stale openSecondaryTab deep-link targeting the hidden tab does not activate or render it', () => {
    capabilitiesRef.current = { showAccountingFields: false };
    locationStateRef.current = { openSecondaryTab: 'accounting' };
    renderDetailView({ secondaryTabs: [gatedPanelTab] });

    expect(screen.queryByTestId('tab-accounting')).not.toBeInTheDocument();
    expect(screen.queryByTestId('accounting-panel')).not.toBeInTheDocument();
  });

  it('a secondaryTab with no visibleWhenCapability declared is unaffected (no regression)', () => {
    capabilitiesRef.current = {};
    renderDetailView({ secondaryTabs: [{ key: 'notes', label: 'Notes', Table: MockTable }] });

    expect(screen.getByTestId('tab-notes')).toBeInTheDocument();
  });
});
