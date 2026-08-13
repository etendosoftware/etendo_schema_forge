/**
 * ETP-4404 — extraBadges `type: 'statusPill'` branch, one-sided pill semantics.
 *
 * The generator can emit a badge whose falseKey side is missing: it serializes
 * as the literal string 'undefined'. The renderer must:
 *   - value truthy ('Y'/true/'true') → DocumentStatusPill with ui(trueKey),
 *     status 'Y', tone 'success'
 *   - value falsy with falseKey missing/'undefined' → render NOTHING
 *   - value null/undefined → render NOTHING
 *   - value falsy with a REAL falseKey → pill with ui(falseKey), tone 'warning'
 *
 * These branches live inline in DetailView's toolbar render, so a full render
 * is required (harness mirrors DetailView.processesAndBadges.vitest.jsx, with
 * a DocumentStatusPill mock that surfaces label/status/tone/testid).
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
  id: '123', documentNo: 'NC-001', documentStatus: 'DR', processed: false,
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
// Surface the real props so the tests can assert label/status/tone per badge.
vi.mock('../DocumentStatusPill.jsx', () => ({
  default: ({ label, status, tone, 'data-testid': testid }) => (
    <span data-testid={testid || 'status-pill'} data-status={status} data-tone={tone}>
      {label ?? status}
    </span>
  ),
}));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>A</span> }));

const MockForm = ({ data }) => <div data-testid="mock-form">{data?.documentNo}</div>;
const MockDetailTable = () => <div data-testid="mock-detail-table" />;

function setRecordField(key, value) {
  const rec = { ...baseRecord() };
  if (value !== undefined) rec[key] = value;
  mockHook.selected = rec;
  mockHook.editing = rec;
}

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

const ONE_SIDED = { key: 'isRectificative', type: 'statusPill', trueKey: 'someKey', falseKey: 'undefined' };
const PILL_TESTID = 'DocumentStatusPill__isRectificative';

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
});

describe('extraBadges statusPill — one-sided pill', () => {
  it.each([[true], ['Y'], ['true']])('value %j → pill with ui(trueKey), data-status Y, tone success', (val) => {
    setRecordField('isRectificative', val);
    renderView({ extraBadges: [ONE_SIDED] });

    const pill = screen.getByTestId(PILL_TESTID);
    expect(pill).toHaveTextContent('someKey');       // ui() mock echoes the key
    expect(pill).toHaveAttribute('data-status', 'Y');
    expect(pill).toHaveAttribute('data-tone', 'success');
  });

  it('value false with falseKey "undefined" → NOTHING renders (one-sided badge)', () => {
    setRecordField('isRectificative', false);
    renderView({ extraBadges: [ONE_SIDED] });

    expect(screen.queryByTestId(PILL_TESTID)).not.toBeInTheDocument();
    // The literal generator artifact must never reach the screen
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
  });

  it('value false with falseKey missing entirely → nothing renders', () => {
    setRecordField('isRectificative', false);
    renderView({ extraBadges: [{ key: 'isRectificative', type: 'statusPill', trueKey: 'someKey' }] });

    expect(screen.queryByTestId(PILL_TESTID)).not.toBeInTheDocument();
  });

  it.each([[null], [undefined]])('value %j → nothing renders (unenriched record)', (val) => {
    setRecordField('isRectificative', val);
    renderView({ extraBadges: [ONE_SIDED] });

    expect(screen.queryByTestId(PILL_TESTID)).not.toBeInTheDocument();
  });

  it('value false with a REAL falseKey → pill with ui(falseKey), data-status N, tone warning', () => {
    setRecordField('isRectificative', 'N');
    renderView({
      extraBadges: [{ key: 'isRectificative', type: 'statusPill', trueKey: 'someKey', falseKey: 'otherKey' }],
    });

    const pill = screen.getByTestId(PILL_TESTID);
    expect(pill).toHaveTextContent('otherKey');
    expect(pill).toHaveAttribute('data-status', 'N');
    expect(pill).toHaveAttribute('data-tone', 'warning');
  });
});
