/**
 * Behavioural replacement for the source-text pin that used to live in
 * DetailView.currencyConversion.test.js.
 *
 * That test regex-matched the literal line
 *   `if (field !== 'product' || !activeCurrencyConversion) return;`
 * inside `applyProductCurrencyConversion`. It pinned syntax rather than
 * behaviour, and ETP-4708 has to change that exact line (the hardcoded
 * 'product' literal becomes a declarative `priceTriggerField`), so as written it
 * would have vetoed the refactor without protecting anything.
 *
 * What actually matters is the rule the line implements: a line's prices are
 * converted only when BOTH the triggering field is the price-trigger field AND
 * an active currency conversion exists. The three tests below assert that rule
 * through the component's real callout flow, so they survive the literal being
 * replaced by a configurable field name — and still fail if either half of the
 * guard is dropped.
 *
 * `applyProductCurrencyConversion` is module-private and stays that way. It is
 * reached the same way DetailView.lineCalloutFlow.vitest.jsx reaches the rest of
 * the chain: render in inlineEditable mode with a DetailTable mock that surfaces
 * `onFieldChange`, then drive it against a mocked callout response. That file
 * covers the other chain steps; the currency conversion branch is untested there
 * because its harness never activates a conversion.
 */
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

// Organisation base currency (returned by /session) and the document currency
// saved on the order. They must differ for a conversion to be active.
const ORG_CURRENCY = 'CUR-EUR';
const DOC_CURRENCY = 'CUR-USD';
const RATE = 1.5;
const RAW_PRICE = 50;
const CONVERTED_PRICE = 75; // RAW_PRICE * RATE

const captured = { onFieldChange: null };

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/sales-order/123', search: '' }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

/**
 * Saved header state that makes the sync effect fill activeCurrencyConversionRef:
 * a document currency, a document date, and an explicit per-order rate override
 * (which short-circuits the validate-exchange-rate fetch).
 */
function makeHeader() {
  return {
    id: '123',
    documentNo: 'SO-001',
    documentStatus: 'DR',
    processed: false,
    currency: DOC_CURRENCY,
    'currency$_identifier': 'USD',
    eTGOCurrencyRate: RATE,
    orderDate: '2026-01-15',
  };
}

const mockHook = {
  loading: false,
  items: [],
  selected: makeHeader(),
  editing: makeHeader(),
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
  useCatalogs: () => ({ catalogs: {}, loading: false, catalogsLoaded: true }),
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
    computeLineGrossAmount: (field, value, result, rowValues) => {
      const qty = parseFloat(String(result.orderedQuantity ?? rowValues?.orderedQuantity ?? 1)) || 1;
      const price = parseFloat(String(result.unitPrice ?? rowValues?.unitPrice ?? value ?? 0)) || 0;
      result.grossAmount = qty * price;
    },
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

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ executeAction: vi.fn(), loading: false }),
}));
vi.mock('@/hooks/useNeoAction', () => ({
  useNeoAction: () => ({ execute: vi.fn(), loading: false }),
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

const MockDetailTable = (props) => {
  captured.onFieldChange = props.onFieldChange ?? props.addRow?.onFieldChange ?? captured.onFieldChange;
  return <div data-testid="mock-detail-table" />;
};
const MockForm = ({ data }) => <div data-testid="mock-form">{data?.documentNo}</div>;

const ENTRY_FIELDS = [
  { key: 'product', label: 'Product', type: 'selector', column: 'M_Product_ID' },
  { key: 'uOM', label: 'UOM', type: 'selector', column: 'C_UOM_ID' },
  { key: 'orderedQuantity', label: 'Qty', type: 'number' },
  { key: 'unitPrice', label: 'Price', type: 'number' },
];

/**
 * Route fetches by URL: /session decides whether a conversion is active, the
 * line callout returns the raw (unconverted) pricelist price.
 */
function installFetch({ orgCurrencyId }) {
  globalThis.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('/session')) {
      return { ok: true, json: async () => ({ currencyId: orgCurrencyId }), text: async () => '{}' };
    }
    if (u.includes('/callout')) {
      return {
        ok: true,
        json: async () => ({ updates: { unitPrice: { value: RAW_PRICE }, orderedQuantity: { value: 2 } } }),
        text: async () => '{}',
      };
    }
    return { ok: true, json: async () => ({}), text: async () => '{}' };
  });
}

function renderInline() {
  captured.onFieldChange = null;
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
        api={{ selectors: [] }}
        entityLabel="Sales Order"
        detailLabel="Lines"
        titleField="documentNo"
        windowName="sales-order"
        recordId="123"
        token="test-token"
        apiBaseUrl="/api/sales-order"
        breadcrumb="Sales / Orders"
        linesLayout="inlineEditable"
      />
    </MemoryRouter>,
  );
}

/**
 * Render and let the currency-sync effect resolve. That effect is async (it
 * awaits /session), so a macrotask turn is needed before the ref is populated.
 */
async function renderAndSettle({ orgCurrencyId }) {
  installFetch({ orgCurrencyId });
  renderInline();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

/** Drive one line field change and return the result object handed to applyUpdates. */
async function changeLineField(field, value) {
  const apply = vi.fn();
  await act(async () => {
    await captured.onFieldChange(field, value, { orderedQuantity: 2, unitPrice: RAW_PRICE }, apply);
  });
  // Load-bearing, not a smoke check. A skipped conversion must still be a
  // completed callout, and it is how the no-active-conversion case detects a
  // dropped guard: without it, destructuring the null conversion throws inside
  // handleLineFieldChange's catch-all, so the line silently never updates.
  expect(apply).toHaveBeenCalled();
  return apply.mock.calls[0][0];
}

describe('DetailView line currency conversion — guard behaviour', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockHook.selected = makeHeader();
    mockHook.editing = makeHeader();
  });

  it('converts the line price when the price-trigger field changes and a conversion is active', async () => {
    // Positive control: proves this setup really does activate a conversion, so
    // the two negative cases below cannot pass merely because it never armed.
    await renderAndSettle({ orgCurrencyId: ORG_CURRENCY });

    const result = await changeLineField('product', 'P9');

    expect(result.unitPrice).toBe(CONVERTED_PRICE);
    expect(result.currency).toBe(DOC_CURRENCY);
    expect(result['currency$_identifier']).toBe('USD');
  });

  it('leaves the price alone when a non-trigger field changes, even with a conversion active', async () => {
    // Same armed conversion as above; only the triggering field differs.
    await renderAndSettle({ orgCurrencyId: ORG_CURRENCY });

    const result = await changeLineField('uOM', 'U1');

    expect(result.unitPrice).toBe(RAW_PRICE);
    expect(result.currency).toBeUndefined();
  });

  it('leaves the price alone when no conversion is active, even on the trigger field', async () => {
    // Document currency equals the org base currency, so the sync effect leaves
    // the conversion ref null. Only the trigger field matches this time.
    await renderAndSettle({ orgCurrencyId: DOC_CURRENCY });

    const result = await changeLineField('product', 'P9');

    expect(result.unitPrice).toBe(RAW_PRICE);
    expect(result.currency).toBeUndefined();
  });
});
