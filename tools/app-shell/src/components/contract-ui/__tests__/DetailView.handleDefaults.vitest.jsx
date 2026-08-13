import { render, waitFor } from '@testing-library/react';

// Mirror DetailView.saveButtons.vitest.jsx mock setup so the component mounts in
// isolation. This spec verifies the HandleDefaults wiring: DetailView fetches the
// line /defaults for the parent record when enabled, and skips it on opt-out.
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
  saving: false,
  isSaving: false,
  isDirtyHeader: false,
  error: null,
  children: [],
  childDefaults: {},
  childrenLoading: false,
  fetchById: vi.fn(),
  fetchChildDefaults: vi.fn(() => Promise.resolve({})),
  primeSaved: vi.fn(),
  handleSelect: vi.fn(),
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
  entityLabel: 'Sales Order',
  detailLabel: 'Line',
  detailTabIndex: 0,
  titleField: 'documentNo',
  windowName: 'sales-order',
  recordId: '123',
  token: 'test-token',
  apiBaseUrl: 'http://localhost:8080/etendo/neo',
};

function resetHook() {
  mockHook.fetchChildDefaults = vi.fn(() => Promise.resolve({}));
  mockHook.childDefaults = {};
  const rec = { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false };
  mockHook.selected = rec;
  mockHook.editing = rec;
}

describe('DetailView — line HandleDefaults wiring', () => {
  beforeEach(resetHook);

  it('fetches line defaults for the parent record when enabled (default on)', async () => {
    render(<DetailView {...BASE_PROPS} api={{ window: { category: 'sales' } }} />);
    await waitFor(() => expect(mockHook.fetchChildDefaults).toHaveBeenCalledWith('123'));
  });

  it('does NOT fetch line defaults when the entity opts out (handlesDefaults: false)', async () => {
    render(
      <DetailView
        {...BASE_PROPS}
        api={{ window: { category: 'sales' }, crud: { 'sales-order-line': { handlesDefaults: false } } }}
      />,
    );
    // Give effects a tick to run.
    await new Promise((r) => setTimeout(r, 50));
    expect(mockHook.fetchChildDefaults).not.toHaveBeenCalled();
  });
});
