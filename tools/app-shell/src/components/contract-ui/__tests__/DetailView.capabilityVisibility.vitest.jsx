/**
 * ETP-4520 — extraBadges `type: 'statusPill'` gated by `visibleWhenCapability`.
 *
 * A status pill whose backing field carries `visibleWhenCapability` (e.g.
 * `posted` on sales-invoice/purchase-invoice, restricted to
 * "showAccountingFields") must be omitted entirely when the current role's
 * capability map doesn't resolve it `true` — before the trueKey/falseKey
 * value logic even runs. Pills without the prop are unaffected.
 *
 * Harness mirrors DetailView.statusPillBadge.vitest.jsx. `@/hooks/useCapabilitiesSafe.js`
 * is mocked to control the capability map directly, while the real
 * `isCapabilityVisible` (`@/lib/capabilityVisibility.js`) is used so the
 * actual gating logic runs.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/sales-invoice/123', search: '' }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const baseRecord = () => ({
  id: '123', documentNo: 'NC-001', documentStatus: 'DR', processed: false, posted: true,
});

const mockHook = {
  loading: false,
  items: [],
  selected: baseRecord(),
  editing: baseRecord(),
  children: [],
  childDefaults: {},
  isDirtyHeader: false,
  loadingChildren: false,
  childrenLoading: false,
  error: null,
  handleChange: vi.fn(),
  handleSave: vi.fn().mockResolvedValue({}),
  handleCreate: vi.fn().mockResolvedValue({}),
  handleDelete: vi.fn().mockResolvedValue({}),
  handleAddChild: vi.fn().mockResolvedValue({}),
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

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

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
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../BalanceFooterPanel.jsx', () => ({ default: () => null }));
vi.mock('../LinesSelectionBar.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({
  default: ({ label, status, tone, 'data-testid': testid }) => (
    <span data-testid={testid || 'status-pill'} data-status={status} data-tone={tone}>
      {label ?? status}
    </span>
  ),
}));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>A</span> }));

const mockUseCapabilitiesSafe = vi.fn();
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({
  useCapabilitiesSafe: () => mockUseCapabilitiesSafe(),
}));

const MockForm = ({ data }) => <div data-testid="mock-form">{data?.documentNo}</div>;
const MockDetailTable = () => <div data-testid="mock-detail-table" />;

function renderView(props = {}) {
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
        addLineFields={{ entry: [], derived: [] }}
        api={{}}
        entityLabel="Sales Invoice"
        detailLabel="Lines"
        titleField="documentNo"
        windowName="sales-invoice"
        recordId="123"
        token="test-token"
        apiBaseUrl="/api/sales-invoice"
        {...props}
      />
    </MemoryRouter>,
  );
}

const GATED_PILL = {
  key: 'posted', type: 'statusPill', trueKey: 'postedYes', falseKey: 'postedNo',
  visibleWhenCapability: 'showAccountingFields',
};
const PILL_TESTID = 'DocumentStatusPill__posted';

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
});

describe('extraBadges statusPill — visibleWhenCapability gating', () => {
  it('omits the pill when the capability map has not loaded (fail closed)', () => {
    mockUseCapabilitiesSafe.mockReturnValue({});
    renderView({ extraBadges: [GATED_PILL] });
    expect(screen.queryByTestId(PILL_TESTID)).not.toBeInTheDocument();
  });

  it('omits the pill when the capability resolves false', () => {
    mockUseCapabilitiesSafe.mockReturnValue({ showAccountingFields: false });
    renderView({ extraBadges: [GATED_PILL] });
    expect(screen.queryByTestId(PILL_TESTID)).not.toBeInTheDocument();
  });

  it('renders the pill when the capability resolves true', () => {
    mockUseCapabilitiesSafe.mockReturnValue({ showAccountingFields: true });
    renderView({ extraBadges: [GATED_PILL] });
    expect(screen.getByTestId(PILL_TESTID)).toBeInTheDocument();
  });

  it('never gates a pill without visibleWhenCapability, regardless of the map', () => {
    mockUseCapabilitiesSafe.mockReturnValue({});
    renderView({
      extraBadges: [{ key: 'posted', type: 'statusPill', trueKey: 'postedYes', falseKey: 'postedNo' }],
    });
    expect(screen.getByTestId(PILL_TESTID)).toBeInTheDocument();
  });
});
