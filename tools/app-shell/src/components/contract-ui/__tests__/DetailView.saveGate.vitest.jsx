import { render, screen } from '@testing-library/react';

// ETP-4933 — required-field Save gate: wiring of `saveGate` (built from
// hook.isValid / hook.missingRequiredFields via buildSaveGate) onto the footer
// Save/Confirm buttons, PLUS the loading -> loaded transition regression test.
//
// Mirrors the mock scaffolding in DetailView.saveButtons.vitest.jsx exactly, so
// the component mounts in isolation the same way.
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
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

const mockNavigate = vi.fn();

const mockHook = {
  items: [],
  selected: null,
  editing: null,
  loading: false,
  defaultsLoading: false,
  saving: false,
  isSaving: false,
  isDirtyHeader: false,
  error: null,
  children: [],
  childrenLoading: false,
  isValid: true,
  missingRequiredFields: [],
  fetchById: vi.fn(),
  primeSaved: vi.fn(),
  handleSelect: vi.fn(),
  handleNew: vi.fn(),
  handleChange: vi.fn(),
  handleSave: vi.fn(() => Promise.resolve({ id: '123' })),
  handleSaveAndProcess: vi.fn(() => Promise.resolve({ id: '123' })),
  handleCreate: vi.fn(),
  handleDelete: vi.fn(),
  handleAddChild: vi.fn(),
  handleUpdateChild: vi.fn(),
  handleDeleteChild: vi.fn(),
  refresh: vi.fn(),
  setEditing: vi.fn(),
};

vi.mock('@/hooks/useEntity', () => ({ useEntity: () => ({ ...mockHook }) }));
vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({ catalogs: {}, catalogsLoaded: true }) }));
vi.mock('@/hooks/useDisplayLogic', () => ({ useDisplayLogic: () => ({}) }));
vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }),
}));
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, computeGrossAmount: vi.fn() }),
  ORDER_LINE_CONFIG: { quantityField: 'orderedQuantity', priceField: 'unitPrice' },
}));
vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({ execute: vi.fn(), loading: false }) }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }),
}));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: () => null }));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null }));
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
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (val) => (val != null ? String(val) : '') }));
vi.mock('@/lib/utils.js', () => ({ cn: (...args) => args.filter(Boolean).join(' ') }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { DetailView } from '../DetailView.jsx';

const BASE_PROPS = {
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
  // additionalDirtyState=true forces computeIsDirty → true, so the otherwise
  // !isDirty-disabled Save button doesn't mask the saveGate assertions below.
  additionalDirtyState: true,
};

function resetHook() {
  mockNavigate.mockClear();
  mockHook.loading = false;
  mockHook.defaultsLoading = false;
  mockHook.isSaving = false;
  mockHook.isDirtyHeader = false;
  mockHook.children = [];
  mockHook.childrenLoading = false;
  mockHook.isValid = true;
  mockHook.missingRequiredFields = [];
  mockHook.handleSave = vi.fn(() => Promise.resolve({ id: '123' }));
  mockHook.handleSaveAndProcess = vi.fn(() => Promise.resolve({ id: '123' }));
  mockHook.primeSaved = vi.fn();
  mockHook.fetchById = vi.fn();
  mockHook.handleNew = vi.fn();
  const rec = { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false };
  mockHook.selected = rec;
  mockHook.editing = rec;
}

describe('DetailView saveGate wiring (ETP-4933)', () => {
  beforeEach(resetHook);

  it('existing record: blocks Save and exposes data-missing-required + title when hook.isValid is false', () => {
    mockHook.isValid = false;
    mockHook.missingRequiredFields = [{ key: 'businessPartner', column: 'businessPartner', label: 'Business Partner' }];
    render(<DetailView {...BASE_PROPS} />);
    const saveBtn = screen.getByTestId('action-save');
    expect(saveBtn).toBeDisabled();
    expect(saveBtn).toHaveAttribute('data-missing-required', 'businessPartner');
    // The i18n mock is the identity function on the key, so the interpolated
    // params are dropped here — the key itself is what matters for this assertion.
    expect(saveBtn).toHaveAttribute('title', 'saveMissingRequired');
  });

  it('existing record: does not block Save when hook.isValid is true', () => {
    render(<DetailView {...BASE_PROPS} />);
    const saveBtn = screen.getByTestId('action-save');
    expect(saveBtn).not.toBeDisabled();
    expect(saveBtn).not.toHaveAttribute('data-missing-required');
  });

  it('new record: blocks Save with the same gate', () => {
    mockHook.isValid = false;
    mockHook.missingRequiredFields = [{ key: 'orderDate', column: 'orderDate' }];
    render(<DetailView {...BASE_PROPS} recordId="new" />);
    const saveBtn = screen.getByTestId('action-save');
    expect(saveBtn).toBeDisabled();
    expect(saveBtn).toHaveAttribute('data-missing-required', 'orderDate');
  });

  it('draftMode: blocks BOTH Save (draft) and Confirm when hook.isValid is false', () => {
    mockHook.isValid = false;
    mockHook.missingRequiredFields = [{ key: 'currency', column: 'currency' }];
    const draftMode = { enabled: true, draftField: 'documentStatus', draftValue: 'DR', label: 'process' };
    render(<DetailView {...BASE_PROPS} draftMode={draftMode} />);
    expect(screen.getByTestId('action-save-draft')).toBeDisabled();
    expect(screen.getByTestId('action-save')).toBeDisabled();
    expect(screen.getByTestId('action-save-draft')).toHaveAttribute('data-missing-required', 'currency');
    expect(screen.getByTestId('action-save')).toHaveAttribute('data-missing-required', 'currency');
  });

  it('draftMode: does not block either button when hook.isValid is true', () => {
    const draftMode = { enabled: true, draftField: 'documentStatus', draftValue: 'DR', label: 'process' };
    render(<DetailView {...BASE_PROPS} draftMode={draftMode} />);
    expect(screen.getByTestId('action-save-draft')).not.toBeDisabled();
    expect(screen.getByTestId('action-save')).not.toBeDisabled();
  });
});

// Regression for the "Rendered fewer hooks than expected" crash that hit
// /sales-order/new: DetailView has an early `return` for the record-loading
// state (isLoadingRecordForRoute), and the saveGate useMemo used to be declared
// BELOW it — so it ran on some renders (loaded) and not others (loading),
// violating React's rules of hooks. It is now declared alongside the other
// hooks, ABOVE the early return. This test drives the actual loading -> loaded
// transition through a real mount and asserts it does not throw.
describe('DetailView loading -> loaded transition (regression)', () => {
  beforeEach(resetHook);

  it('mounts through the record-loading state into the loaded form without throwing', () => {
    // Loading: hook.loading is true and there is no record matching the route yet.
    mockHook.loading = true;
    mockHook.selected = null;
    mockHook.editing = null;

    const { rerender } = render(<DetailView {...BASE_PROPS} />);
    expect(screen.getByText('loading')).toBeInTheDocument();
    expect(screen.queryByTestId('action-save')).toBeNull();

    // Loaded: the record for this route has arrived.
    mockHook.loading = false;
    const rec = { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false };
    mockHook.selected = rec;
    mockHook.editing = rec;

    expect(() => rerender(<DetailView {...BASE_PROPS} />)).not.toThrow();
    expect(screen.getByTestId('action-save')).toBeInTheDocument();
  });

  it('mounts a brand-new record through defaultsLoading -> loaded without throwing', () => {
    mockHook.defaultsLoading = true;
    mockHook.selected = null;
    mockHook.editing = null;

    const { rerender } = render(<DetailView {...BASE_PROPS} recordId="new" />);
    expect(screen.getByText('loading')).toBeInTheDocument();

    mockHook.defaultsLoading = false;
    mockHook.editing = { documentStatus: 'DR' };

    expect(() => rerender(<DetailView {...BASE_PROPS} recordId="new" />)).not.toThrow();
    expect(screen.getByTestId('action-save')).toBeInTheDocument();
  });
});
