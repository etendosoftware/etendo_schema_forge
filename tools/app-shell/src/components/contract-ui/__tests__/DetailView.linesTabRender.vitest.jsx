import { render, screen } from '@testing-library/react';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
  useLocation: () => ({ pathname: '/test/123', search: '', hash: '' }),
}));

// Mock i18n hooks (return the key as-is)
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Mock hooks — state controlled by mutating this module-level object
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

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({}),
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

// Mock sub-components
vi.mock('../SummaryBar.jsx', () => ({
  SummaryBar: ({ items }) => (
    <div data-testid="summary-bar">
      {items?.map((i, idx) => <span key={idx}>{i.label}</span>)}
    </div>
  ),
}));

vi.mock('../DocumentTotalsPanel.jsx', () => ({
  default: () => <div data-testid="document-totals-panel" />,
}));

vi.mock('../DocumentStatusPill.jsx', () => ({
  default: ({ status }) => <span data-testid="status-pill">{status}</span>,
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

// A mock empty-state component so branch 2 (shouldShowLinesEmptyState) is
// reachable — MINIMAL_PROPS in the base harness does NOT pass linesEmptyState.
const MockLinesEmptyState = () => <div data-testid="mock-lines-empty" />;

const MINIMAL_PROPS = {
  entity: 'sales-order',
  detailEntity: 'sales-order-line',
  Form: () => <div data-testid="mock-form">Form</div>,
  DetailTable: () => <div data-testid="mock-detail-table">Table</div>,
  DetailForm: null,
  summary: [],
  statusField: 'documentStatus',
  api: { window: { category: 'sales' } },
  entityLabel: 'Sales Order',
  detailLabel: 'Line',
  detailTabIndex: 0,
  titleField: 'documentNo',
  windowName: 'sales-order',
  recordId: '123',
  token: 'test-token',
  apiBaseUrl: 'http://localhost:8080/etendo/neo',
  linesEmptyState: MockLinesEmptyState,
};

// The lines tab spinner is the dedicated branch-1 element:
//   <div ... border-t-primary rounded-full animate-spin /> wrapped in py-10.
// It is distinct from the header save spinners (h-3.5 w-3.5 animate-spin)
// which only render when hook.isSaving is true. With loading:false and
// isSaving unset, the ONLY .animate-spin on the page is the lines spinner.
function linesSpinner() {
  return document.querySelector('.animate-spin');
}

describe('DetailView — lines tab render branches (characterization)', () => {
  beforeEach(() => {
    mockHook.selected = null;
    mockHook.editing = null;
    mockHook.loading = false;
    mockHook.saving = false;
    mockHook.children = [];
    mockHook.childrenLoading = false;
    mockHook.error = null;
  });

  // Branch 1: isInitialChildrenLoading(hook) === true
  it('branch 1 — initial children loading: shows spinner, no table, no empty state', () => {
    mockHook.selected = { id: '123', documentNo: 'SO-001', documentStatus: 'DR' };
    mockHook.editing = { id: '123', documentNo: 'SO-001', documentStatus: 'DR' };
    mockHook.childrenLoading = true;
    mockHook.children = [];

    render(<DetailView {...MINIMAL_PROPS} />);

    expect(screen.queryByTestId('mock-detail-table')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-lines-empty')).not.toBeInTheDocument();
    // The lines branch renders exactly one spinner (header save spinners are
    // gated on isSaving, which is unset here).
    expect(linesSpinner()).toBeTruthy();
  });

  // Branch 2: shouldShowLinesEmptyState(...) === true
  it('branch 2 — empty editable document: shows empty state, no table, no spinner', () => {
    mockHook.selected = { id: '123', documentNo: 'SO-001', documentStatus: 'DR' };
    mockHook.editing = { id: '123', documentNo: 'SO-001', documentStatus: 'DR' };
    mockHook.childrenLoading = false;
    mockHook.children = [];

    render(<DetailView {...MINIMAL_PROPS} />);

    expect(screen.getByTestId('mock-lines-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-detail-table')).not.toBeInTheDocument();
    expect(linesSpinner()).toBeNull();
  });

  // Branch 3: neither helper matches → table
  it('branch 3 — children present: shows table, no empty state, no spinner', () => {
    mockHook.selected = { id: '123', documentNo: 'SO-001', documentStatus: 'DR' };
    mockHook.editing = { id: '123', documentNo: 'SO-001', documentStatus: 'DR' };
    mockHook.childrenLoading = false;
    mockHook.children = [{ id: 'line-1', product: 'Widget', orderedQuantity: 10 }];

    render(<DetailView {...MINIMAL_PROPS} />);

    const tables = screen.getAllByTestId('mock-detail-table');
    expect(tables.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('mock-lines-empty')).not.toBeInTheDocument();
    expect(linesSpinner()).toBeNull();
  });

  // Branch 3 again: refetch with children already present keeps the table
  // mounted (isInitialChildrenLoading is false because children.length > 0).
  it('branch 3 — refetch with children kept: table stays, no lines spinner', () => {
    mockHook.selected = { id: '123', documentNo: 'SO-001', documentStatus: 'DR' };
    mockHook.editing = { id: '123', documentNo: 'SO-001', documentStatus: 'DR' };
    mockHook.childrenLoading = true; // refetch in flight
    mockHook.children = [{ id: 'line-1', product: 'Widget', orderedQuantity: 10 }];

    render(<DetailView {...MINIMAL_PROPS} />);

    const tables = screen.getAllByTestId('mock-detail-table');
    expect(tables.length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('mock-lines-empty')).not.toBeInTheDocument();
    expect(linesSpinner()).toBeNull();
  });
});
