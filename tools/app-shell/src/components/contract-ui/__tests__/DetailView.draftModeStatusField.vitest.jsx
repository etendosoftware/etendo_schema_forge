import { render, screen } from '@testing-library/react';

// Behavioral regression coverage for ETP-4268: `getDraftModeCompleted` (and its
// helper `normalizeStatusValue`) are module-private in DetailView.jsx, so the
// only way to prove the *behavior* is fixed — not just that the source text
// looks right — is to render the real component and assert whether the
// footer Save/Confirm block (data-testid="action-save[-draft]") is present.
// A regex-only test would have passed on the OLD buggy code too, since the
// old line also matched a similarly-shaped pattern; it was just wrong at
// runtime for windows whose statusField isn't "documentStatus".
//
// Mirrors the mock setup in DetailView.saveButtons.vitest.jsx so the
// component mounts in isolation.
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
  childrenLoading: false,
  fetchById: vi.fn(),
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

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

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
  entity: 'goods-movements',
  detailEntity: 'goods-movements-line',
  Form: () => <div data-testid="mock-form">Form</div>,
  DetailTable: () => <div data-testid="mock-detail-table">Table</div>,
  DetailForm: null,
  summary: [],
  api: { window: { category: 'inventory' } },
  entityLabel: 'Goods Movements',
  detailLabel: 'Line',
  detailTabIndex: 0,
  titleField: 'documentNo',
  windowName: 'goods-movements',
  recordId: '123',
  token: 'test-token',
  apiBaseUrl: 'http://localhost:8080/etendo/neo',
};

function resetHook() {
  mockNavigate.mockClear();
  mockHook.isSaving = false;
  mockHook.isDirtyHeader = false;
  mockHook.children = [];
  mockHook.childrenLoading = false;
  mockHook.handleSave = vi.fn(() => Promise.resolve({ id: '123' }));
  mockHook.handleSaveAndProcess = vi.fn(() => Promise.resolve({ id: '123' }));
  mockHook.primeSaved = vi.fn();
  mockHook.fetchById = vi.fn();
}

function setRecord(fields) {
  const rec = { id: '123', documentNo: 'GM-001', ...fields };
  mockHook.selected = rec;
  mockHook.editing = rec;
}

describe('DetailView draftMode completion — statusField resolution (ETP-4268 regression)', () => {
  beforeEach(resetHook);

  describe('statusField unset — falls back to documentStatus (sales-quotation style)', () => {
    const draftMode = {
      enabled: true,
      draftField: 'documentStatus',
      draftValue: 'DR',
      label: 'process',
      completedStatuses: ['CA', 'ETGO_CI', 'CL', 'VO', 'CJ'],
    };

    it('hides Save/Confirm when documentStatus is a terminal status in the list', () => {
      setRecord({ documentStatus: 'CA', processed: true });
      render(<DetailView {...BASE_PROPS} draftMode={draftMode} />);
      expect(screen.queryByTestId('action-save')).not.toBeInTheDocument();
      expect(screen.queryByTestId('action-save-draft')).not.toBeInTheDocument();
    });

    it('keeps Save/Confirm visible when documentStatus is Under Evaluation (not in the list)', () => {
      setRecord({ documentStatus: 'UE', processed: true });
      render(<DetailView {...BASE_PROPS} draftMode={draftMode} />);
      expect(screen.queryByTestId('action-save')).toBeInTheDocument();
      expect(screen.queryByTestId('action-save-draft')).toBeInTheDocument();
    });
  });

  describe('statusField="processed" (goods-movements) — boolean-ish values normalized', () => {
    const draftMode = {
      enabled: true,
      draftField: 'processed',
      draftValue: false,
      label: 'process',
      completedStatuses: ['true'],
    };

    it('hides Save/Confirm when processed is boolean true', () => {
      setRecord({ processed: true });
      render(<DetailView {...BASE_PROPS} draftMode={draftMode} statusField="processed" />);
      expect(screen.queryByTestId('action-save')).not.toBeInTheDocument();
      expect(screen.queryByTestId('action-save-draft')).not.toBeInTheDocument();
    });

    it('hides Save/Confirm when processed is the AD boolean string "Y"', () => {
      setRecord({ processed: 'Y' });
      render(<DetailView {...BASE_PROPS} draftMode={draftMode} statusField="processed" />);
      expect(screen.queryByTestId('action-save')).not.toBeInTheDocument();
      expect(screen.queryByTestId('action-save-draft')).not.toBeInTheDocument();
    });

    it('keeps Save/Confirm visible when processed is boolean false', () => {
      setRecord({ processed: false });
      render(<DetailView {...BASE_PROPS} draftMode={draftMode} statusField="processed" />);
      expect(screen.queryByTestId('action-save')).toBeInTheDocument();
      expect(screen.queryByTestId('action-save-draft')).toBeInTheDocument();
    });

    it('keeps Save/Confirm visible when processed is the AD boolean string "N"', () => {
      setRecord({ processed: 'N' });
      render(<DetailView {...BASE_PROPS} draftMode={draftMode} statusField="processed" />);
      expect(screen.queryByTestId('action-save')).toBeInTheDocument();
      expect(screen.queryByTestId('action-save-draft')).toBeInTheDocument();
    });
  });

  describe('draftMode.enabled=false — never hides Save/Confirm regardless of status', () => {
    it('keeps Save visible even when the status matches completedStatuses', () => {
      setRecord({ processed: true, documentStatus: 'CA' });
      render(
        <DetailView
          {...BASE_PROPS}
          statusField="processed"
          draftMode={{ enabled: false, label: 'process', completedStatuses: ['true'] }}
        />,
      );
      // Not a draft-mode window while disabled: existing-record footer renders
      // the plain "action-save" button instead of the draft-mode pair.
      expect(screen.queryByTestId('action-save')).toBeInTheDocument();
    });
  });
});
