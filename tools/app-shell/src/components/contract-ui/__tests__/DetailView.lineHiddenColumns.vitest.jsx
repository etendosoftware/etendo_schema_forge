import { render, screen } from '@testing-library/react';

// Regression coverage for ETP-4543: line-grid columns gated purely by the
// config-driven `@ACCT_DIMENSION_DISPLAY@` macro (e.g. Project/Cost Center in
// sales-invoice, purchase-invoice, goods-shipment, goods-receipt) either
// didn't exist as columns at all, or — once declared — always rendered
// regardless of the accounting-dimension config toggle, because DetailView
// never forwarded the lines-entity `useDisplayLogic()` visibility map down to
// the line grid (`DetailTable` / InlineLinesPanel).
//
// The fix adds a memoized `lineHiddenColumns`, derived from
// `lineDisplayLogic.visibility` (the useDisplayLogic() call scoped to
// `detailEntity`), keeping ONLY the keys explicitly `=== false`. It is passed
// to `DetailTable` as the `hiddenColumns` prop. Fail-open: an absent key or an
// explicit `true` must NOT be hidden.
//
// This test mounts the real DetailView with a DetailTable PROBE (a mock that
// records the props it receives) so the assertion only passes if the live
// visibility map computed from `lineDisplayLogic` actually reaches the
// `hiddenColumns` prop passed to the line grid.
//
// Mock setup mirrors DetailView.linesTabRender.vitest.jsx (minimal harness
// proven to mount the lines-tab branch of the component) plus a
// per-entity-aware useDisplayLogic mock (see DetailView.principalDisplayLogic.
// vitest.jsx for the header-entity precedent) so the header call and the
// lines call can be driven independently.
//
// ETP-4610 additions (below, after the ETP-4530 test): the `dimensionsPanelFieldKeys`
// prop lets a SPECIFIC window instance widen which keys `lineHiddenColumns` trusts as
// dimension macros, beyond the global `DIMENSION_MACRO_KEYS` allowlist in DetailView.jsx.
// One test proves the fix (simple-g-l-journal can now config-hide 'product'), a separate
// test proves the ETP-4530 non-regression still holds (sales-invoice-shaped instances
// never declare 'product' in that prop, so it stays protected).

// ETP-4576 — DetailView reads the CSRF proof from the auth context, so mounting it
// requires that context. The mock is a plain mutable object rather than a vi.fn()
// with mockReturnValueOnce: React can invoke the hook more than once per render and
// a "once" override would decay to the default mid-render.
let mockAuth = { isAuthenticated: true, csrfToken: 'test-csrf' };

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => mockAuth,
}));

beforeEach(() => {
  mockAuth = { isAuthenticated: true, csrfToken: 'test-csrf' };
});

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
  useLocation: () => ({ pathname: '/test/123', search: '', hash: '' }),
}));

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

const DETAIL_ENTITY = 'sales-invoice-line';

// Keyed by entity so the header call (entity='sales-invoice') and the lines
// call (entity=DETAIL_ENTITY) can be driven independently per test.
const displayLogicByEntity = vi.hoisted(() => ({
  current: {
    'sales-invoice': { readOnly: {}, visibility: {} },
    'sales-invoice-line': { readOnly: {}, visibility: {} },
  },
}));

const mockHook = {
  items: [],
  selected: null,
  editing: null,
  loading: false,
  saving: false,
  error: null,
  children: [],
  childrenLoading: false,
  fetchById: vi.fn(),
  handleSelect: vi.fn(),
  handleChange: vi.fn(),
  handleSave: vi.fn(),
  handleCreate: vi.fn(),
  handleDelete: vi.fn(),
  handleAddChild: vi.fn(),
  handleUpdateChild: vi.fn(),
  handleDeleteChild: vi.fn(),
  refresh: vi.fn(),
  setEditing: vi.fn(),
};

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => ({ ...mockHook }),
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useCatalogs: () => ({ catalogs: {}, catalogsLoaded: true }),
}));

// This is the mock under test: it stands in for the real NEO evaluate-display
// round trip, one independent answer per entity (header vs. lines).
vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: (entity) => displayLogicByEntity.current[entity] ?? { readOnly: {}, visibility: {} },
}));

vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({
    calloutResult: null,
    calloutLoading: false,
    executeCallout: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({
    grossAmount: 0,
    computeGrossAmount: vi.fn(),
  }),
  ORDER_LINE_CONFIG: { quantityField: 'orderedQuantity', priceField: 'unitPrice' },
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({
    execute: vi.fn(),
    loading: false,
  }),
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

vi.mock('../SummaryBar.jsx', () => ({
  SummaryBar: () => <div data-testid="summary-bar" />,
}));

vi.mock('../DocumentTotalsPanel.jsx', () => ({
  default: () => <div data-testid="document-totals-panel" />,
}));

vi.mock('../DocumentStatusPill.jsx', () => ({
  default: () => null,
}));

vi.mock('../DocumentPrintDrawer.jsx', () => ({
  default: () => null,
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
}));

vi.mock('@/lib/lineFieldChange.js', () => ({
  buildCalloutFormState: vi.fn(() => ({})),
  extractAuxValues: vi.fn(() => ({})),
  normalizeCalloutQty: vi.fn(),
  normalizeCalloutResponse: vi.fn(() => ({})),
  applyQtyZeroGuard: vi.fn(),
  roundAmounts: vi.fn((v) => v),
  resolveSnapshotIdentifiers: vi.fn(() => ({})),
}));

vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));

vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val) => (val != null ? String(val) : ''),
}));

vi.mock('@/lib/utils.js', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { DetailView } from '../DetailView.jsx';

// Probe DetailTable: records the `hiddenColumns` prop it received on its
// most recent render so the test can assert on it directly.
const detailTableProps = vi.hoisted(() => ({ current: null }));
function DetailTableProbe(props) {
  detailTableProps.current = props;
  return <div data-testid="detail-table-probe" />;
}

const BASE_PROPS = {
  entity: 'sales-invoice',
  detailEntity: DETAIL_ENTITY,
  Form: () => <div data-testid="mock-form">Form</div>,
  DetailTable: DetailTableProbe,
  DetailForm: null,
  summary: [],
  statusField: 'documentStatus',
  api: { window: { category: 'sales' } },
  entityLabel: 'Sales Invoice',
  detailLabel: 'Line',
  detailTabIndex: 0,
  titleField: 'documentNo',
  windowName: 'sales-invoice',
  recordId: '123',
  token: 'test-token',
  apiBaseUrl: 'http://localhost:8080/etendo/neo',
};

describe('DetailView — lineHiddenColumns forwarded to the line grid (ETP-4543)', () => {
  beforeEach(() => {
    displayLogicByEntity.current = {
      'sales-invoice': { readOnly: {}, visibility: {} },
      'sales-invoice-line': { readOnly: {}, visibility: {} },
    };
    detailTableProps.current = null;
    mockHook.selected = { id: '123', documentNo: 'INV-001', documentStatus: 'DR' };
    mockHook.editing = { id: '123', documentNo: 'INV-001', documentStatus: 'DR' };
    mockHook.loading = false;
    mockHook.childrenLoading = false;
    // Non-empty children so the lines branch renders DetailTable (not the
    // empty-state / spinner branches — see DetailView.linesTabRender.vitest.jsx).
    mockHook.children = [{ id: 'line-1', product: 'Widget', invoicedQuantity: 10 }];
  });

  it('hides costcenter when the lines-entity evaluator resolves visibility.costcenter=false', () => {
    displayLogicByEntity.current[DETAIL_ENTITY] = { readOnly: {}, visibility: { costcenter: false } };
    render(<DetailView {...BASE_PROPS} />);

    expect(screen.getByTestId('detail-table-probe')).toBeInTheDocument();
    expect(detailTableProps.current.hiddenColumns).toContain('costcenter');
  });

  it('does NOT hide costcenter when the lines-entity evaluator resolves visibility.costcenter=true', () => {
    displayLogicByEntity.current[DETAIL_ENTITY] = { readOnly: {}, visibility: { costcenter: true } };
    render(<DetailView {...BASE_PROPS} />);

    expect(detailTableProps.current.hiddenColumns).not.toContain('costcenter');
  });

  it('fail-open: does NOT hide costcenter when the key is absent from the visibility map', () => {
    displayLogicByEntity.current[DETAIL_ENTITY] = { readOnly: {}, visibility: {} };
    render(<DetailView {...BASE_PROPS} />);

    expect(detailTableProps.current.hiddenColumns).not.toContain('costcenter');
  });

  it('does not leak the header-entity visibility map into the line grid hiddenColumns', () => {
    // Header entity resolves project=false, but the LINES entity does not —
    // hiddenColumns must reflect only lineDisplayLogic (detailEntity-scoped).
    displayLogicByEntity.current['sales-invoice'] = { readOnly: {}, visibility: { project: false } };
    displayLogicByEntity.current[DETAIL_ENTITY] = { readOnly: {}, visibility: {} };
    render(<DetailView {...BASE_PROPS} />);

    expect(detailTableProps.current.hiddenColumns).not.toContain('project');
  });

  it('collects multiple explicitly-false keys into hiddenColumns', () => {
    displayLogicByEntity.current[DETAIL_ENTITY] = {
      readOnly: {},
      visibility: { project: false, costcenter: false, description: true },
    };
    render(<DetailView {...BASE_PROPS} />);

    expect(detailTableProps.current.hiddenColumns).toEqual(
      expect.arrayContaining(['project', 'costcenter']),
    );
    expect(detailTableProps.current.hiddenColumns).not.toContain('description');
  });

  // ETP-4530 regression — live manual testing on sales-invoice found product, listPrice,
  // and grossAmount vanishing from the Lines grid after ETP-4529/4543 landed. Root cause:
  // the lines-entity evaluate-display call (`lineDisplayLogic` above) is evaluated against
  // the HEADER record snapshot, which is only a valid stand-in for the
  // `@ACCT_DIMENSION_DISPLAY@` macro (config-only, record-independent). Sales Invoice's
  // real AD_Field displayLogic for Product (`@Financial_Invoice_Line@='N'`, a sibling
  // per-line field) and List Price / Line Gross Amount (`@GROSSPRICE@='N'|'Y'`, an SQL
  // auxiliary input) reference tokens the header snapshot never carries, so
  // NeoDisplayLogicHandler (com.etendoerp.go) silently resolves them to `false` — a
  // spurious "hide" signal indistinguishable, at the JSON level, from a real one. The fix
  // restricts `lineHiddenColumns` to the known dimension-macro keys
  // (project/costcenter/businessPartner) this representative-context trick was actually
  // built for, so any other field's evaluator noise can never blast-radius into hiding
  // real grid columns.
  it('does NOT hide product/listPrice/grossAmount even when the evaluator spuriously resolves them false (ETP-4530)', () => {
    displayLogicByEntity.current[DETAIL_ENTITY] = {
      readOnly: {},
      visibility: {
        product: false,
        listPrice: false,
        grossAmount: false,
        project: false,
        costcenter: false,
      },
    };
    render(<DetailView {...BASE_PROPS} />);

    expect(detailTableProps.current.hiddenColumns).not.toContain('product');
    expect(detailTableProps.current.hiddenColumns).not.toContain('listPrice');
    expect(detailTableProps.current.hiddenColumns).not.toContain('grossAmount');
    // The legitimate dimension keys must still be hidden — this is not a blanket
    // "never trust the map" regression, only a scoped allowlist.
    expect(detailTableProps.current.hiddenColumns).toEqual(
      expect.arrayContaining(['project', 'costcenter']),
    );
  });

  it('hides businessPartner when the lines-entity evaluator resolves visibility.businessPartner=false', () => {
    displayLogicByEntity.current[DETAIL_ENTITY] = { readOnly: {}, visibility: { businessPartner: false } };
    render(<DetailView {...BASE_PROPS} />);

    expect(detailTableProps.current.hiddenColumns).toContain('businessPartner');
  });

  // Some windows' extractors emit 'costCenter' (camelCase) instead of 'costcenter' —
  // DIMENSION_MACRO_KEYS must recognize both casings or this window's cost-center
  // column silently stops being hideable.
  it('hides costCenter (camelCase) when the lines-entity evaluator resolves it false', () => {
    displayLogicByEntity.current[DETAIL_ENTITY] = { readOnly: {}, visibility: { costCenter: false } };
    render(<DetailView {...BASE_PROPS} />);

    expect(detailTableProps.current.hiddenColumns).toContain('costCenter');
  });

  // FIX — ETP-4610 (originally flagged as a gap by a GitHub Copilot review on PR 975,
  // then closed within the same ticket). `simple-g-l-journal`'s generated HeaderPage now
  // forwards `dimensionsPanelFieldKeys={['businessPartner', 'product', 'project',
  // 'costCenter']}` — the same field keys its `decisions.json` flags `dimensionsPanel:
  // true` for the lines entity (see artifacts/simple-g-l-journal/decisions.json and
  // schema_forge_core's `generate-frontend.js` `dimensionsPanelFieldKeys` computation).
  // DetailView's `trustedDimensionKeys` widens the dimension-macro allowlist with this
  // prop SCOPED TO THIS WINDOW INSTANCE ONLY, so 'product' is now trusted here even
  // though it stays out of the global `DIMENSION_MACRO_KEYS` constant.
  it('closes the gap: hides product for simple-g-l-journal when dimensionsPanelFieldKeys declares it (ETP-4610 fix)', () => {
    displayLogicByEntity.current[DETAIL_ENTITY] = {
      readOnly: {},
      visibility: { product: false, project: false },
    };
    render(
      <DetailView
        {...BASE_PROPS}
        windowName="simple-g-l-journal"
        dimensionsPanelFieldKeys={['businessPartner', 'product', 'project', 'costCenter']}
      />
    );

    expect(detailTableProps.current.hiddenColumns).toContain('product');
    // Sibling dimension keys already covered by the global allowlist keep working too.
    expect(detailTableProps.current.hiddenColumns).toContain('project');
  });

  // NON-REGRESSION — ETP-4530 must stay fixed even with `dimensionsPanelFieldKeys` wired
  // in. sales-invoice/purchase-invoice never declare 'product' in that prop — it isn't a
  // dimensionsPanel field there, it's a real per-line AD field with its own genuine
  // record-dependent displayLogic (`@Financial_Invoice_Line@='N'`, see the ETP-4530 test
  // above) — so the window-scoped widening must not leak 'product' hiding into this
  // window's grid, even when the generator DOES forward the prop for its real dimension
  // fields (project/costcenter).
  it('does NOT hide product for a sales-invoice-shaped instance even when dimensionsPanelFieldKeys is passed for its real dimension fields (ETP-4530 non-regression)', () => {
    displayLogicByEntity.current[DETAIL_ENTITY] = {
      readOnly: {},
      visibility: {
        product: false,
        listPrice: false,
        grossAmount: false,
        project: false,
        costcenter: false,
      },
    };
    render(
      <DetailView
        {...BASE_PROPS}
        windowName="sales-invoice"
        dimensionsPanelFieldKeys={['project', 'costcenter']}
      />
    );

    expect(detailTableProps.current.hiddenColumns).not.toContain('product');
    expect(detailTableProps.current.hiddenColumns).not.toContain('listPrice');
    expect(detailTableProps.current.hiddenColumns).not.toContain('grossAmount');
    expect(detailTableProps.current.hiddenColumns).toEqual(
      expect.arrayContaining(['project', 'costcenter']),
    );
  });
});
