/**
 * ETP-4404 — custom tab (placement 'tab') save-header-first wiring.
 *
 * renderCustomTabPanels must pass isNew / onSaveHeader / onGoToSavedRecord /
 * autoOpenAdd / restoreDraft to the custom tab Component:
 *   - onSaveHeader({navigateAfter:false}) persists via hook.handleSave +
 *     primeSaved WITHOUT navigating and returns the saved record
 *   - onSaveHeader() (default) navigates to the saved record with
 *     openSecondaryTab + openCustomTabAdd state (mirrors handleAddLineClick)
 *   - onGoToSavedRecord(saved, {reopenAdd, draft, error}) navigates carrying
 *     customTabRestore so the tab can restore the in-progress draft
 *   - the openSecondaryTab effect captures location.state.openCustomTabAdd +
 *     customTabRestore into pendingCustomTabAdd/pendingCustomTabRestore, which
 *     surface as autoOpenAdd/restoreDraft on the tab component
 *
 * Verified through a stub tab Component that records its props (harness
 * mirrors DetailView.processesAndBadges.vitest.jsx).
 */
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

const mockNavigate = vi.fn();
// Mutable so each test can inject router state before rendering.
let mockLocation = { pathname: '/sales-invoice/123', search: '' };

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => mockLocation,
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
  handleSave: vi.fn().mockResolvedValue({ id: 'S1' }),
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
  setEditing: vi.fn(),
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
vi.mock('../DocumentStatusPill.jsx', () => ({ default: () => null }));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>A</span> }));

const MockForm = ({ data }) => <div data-testid="mock-form">{data?.documentNo}</div>;
const MockDetailTable = () => <div data-testid="mock-detail-table" />;

// Stub custom tab: records every props snapshot it receives.
let stubProps = null;
const StubTab = (props) => {
  stubProps = props;
  return <div data-testid="stub-custom-tab" />;
};

const CUSTOM_TAB = { key: 'reversedInvoices', label: 'Rectificaciones', placement: 'tab', Component: StubTab };
const TAB_KEY = 'custom:reversedInvoices';

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
        customTabs={[CUSTOM_TAB]}
        {...props}
      />
    </MemoryRouter>,
  );
}

function setNewRecordHook() {
  mockHook.selected = null;
  mockHook.editing = { documentStatus: 'DR' }; // unsaved header — no id yet
}

function setExistingRecordHook() {
  mockHook.selected = baseRecord();
  mockHook.editing = baseRecord();
}

beforeEach(() => {
  vi.clearAllMocks();
  stubProps = null;
  mockLocation = { pathname: '/sales-invoice/123', search: '' };
  mockHook.handleSave = vi.fn().mockResolvedValue({ id: 'S1' });
  mockHook.primeSaved = vi.fn();
  setExistingRecordHook();
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
});

describe('renderCustomTabPanels — save-header-first props', () => {
  it('new record: passes isNew=true plus onSaveHeader/onGoToSavedRecord functions', async () => {
    setNewRecordHook();
    await act(async () => {
      renderView({ recordId: 'new' });
    });

    expect(screen.getByTestId('stub-custom-tab')).toBeInTheDocument();
    expect(stubProps.isNew).toBe(true);
    expect(typeof stubProps.onSaveHeader).toBe('function');
    expect(typeof stubProps.onGoToSavedRecord).toBe('function');
    expect(stubProps.autoOpenAdd).toBe(false);
    expect(stubProps.restoreDraft).toBeNull();
  });

  it('existing record: onSaveHeader/onGoToSavedRecord are NOT passed (undefined)', async () => {
    await act(async () => {
      renderView();
    });

    expect(stubProps.isNew).toBe(false);
    expect(stubProps.onSaveHeader).toBeUndefined();
    expect(stubProps.onGoToSavedRecord).toBeUndefined();
  });

  it('onSaveHeader({navigateAfter:false}) saves + primes WITHOUT navigating and returns the record', async () => {
    setNewRecordHook();
    await act(async () => {
      renderView({ recordId: 'new' });
    });

    let saved;
    await act(async () => {
      saved = await stubProps.onSaveHeader({ navigateAfter: false });
    });

    expect(mockHook.handleSave).toHaveBeenCalledTimes(1);
    expect(mockHook.primeSaved).toHaveBeenCalledWith({ id: 'S1' });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(saved).toEqual({ id: 'S1' });
  });

  it('onSaveHeader() default navigates to the saved record with the reopen-add state', async () => {
    setNewRecordHook();
    await act(async () => {
      renderView({ recordId: 'new' });
    });

    await act(async () => {
      await stubProps.onSaveHeader();
    });

    expect(mockNavigate).toHaveBeenCalledWith('/sales-invoice/S1', {
      replace: true,
      state: {
        openSecondaryTab: TAB_KEY,
        openCustomTabAdd: 'reversedInvoices',
        justSaved: { id: 'S1' },
      },
    });
  });

  it('onSaveHeader returns null (and does not prime/navigate) when handleSave yields no id', async () => {
    setNewRecordHook();
    mockHook.handleSave = vi.fn().mockResolvedValue(null);
    await act(async () => {
      renderView({ recordId: 'new' });
    });

    let saved;
    await act(async () => {
      saved = await stubProps.onSaveHeader({ navigateAfter: false });
    });

    expect(saved).toBeNull();
    expect(mockHook.primeSaved).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('onGoToSavedRecord(saved, {reopenAdd, draft, error}) navigates carrying customTabRestore', async () => {
    setNewRecordHook();
    await act(async () => {
      renderView({ recordId: 'new' });
    });

    const saved = { id: 'S1' };
    const draft = { reversedInvoice: 'x' };
    await act(async () => {
      stubProps.onGoToSavedRecord(saved, { reopenAdd: true, draft, error: 'boom' });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/sales-invoice/S1', {
      replace: true,
      state: {
        openSecondaryTab: TAB_KEY,
        openCustomTabAdd: 'reversedInvoices',
        customTabRestore: { draft, error: 'boom' },
        justSaved: saved,
      },
    });
  });

  it('onGoToSavedRecord(saved) without reopenAdd omits openCustomTabAdd/customTabRestore', async () => {
    setNewRecordHook();
    await act(async () => {
      renderView({ recordId: 'new' });
    });

    await act(async () => {
      stubProps.onGoToSavedRecord({ id: 'S1' });
    });

    expect(mockNavigate).toHaveBeenCalledWith('/sales-invoice/S1', {
      replace: true,
      state: { openSecondaryTab: TAB_KEY, justSaved: { id: 'S1' } },
    });
  });

  it('onGoToSavedRecord with no saved id is a no-op', async () => {
    setNewRecordHook();
    await act(async () => {
      renderView({ recordId: 'new' });
    });

    await act(async () => {
      stubProps.onGoToSavedRecord(null, { reopenAdd: true });
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('openSecondaryTab effect — captures openCustomTabAdd + customTabRestore', () => {
  it('surfaces location.state as autoOpenAdd=true + restoreDraft, then clears the router state', async () => {
    const restore = { draft: { reversedInvoice: 'x' }, error: 'boom' };
    mockLocation = {
      pathname: '/sales-invoice/123',
      search: '',
      state: {
        openSecondaryTab: TAB_KEY,
        openCustomTabAdd: 'reversedInvoices',
        customTabRestore: restore,
      },
    };

    await act(async () => {
      renderView();
    });

    expect(stubProps.autoOpenAdd).toBe(true);
    expect(stubProps.restoreDraft).toEqual(restore);
    // The effect consumes the one-shot state so refresh/back does not replay it
    expect(mockNavigate).toHaveBeenCalledWith('/sales-invoice/123', { replace: true, state: {} });
  });

  it('openCustomTabAdd without customTabRestore yields autoOpenAdd=true and restoreDraft=null', async () => {
    mockLocation = {
      pathname: '/sales-invoice/123',
      search: '',
      state: { openSecondaryTab: TAB_KEY, openCustomTabAdd: 'reversedInvoices' },
    };

    await act(async () => {
      renderView();
    });

    expect(stubProps.autoOpenAdd).toBe(true);
    expect(stubProps.restoreDraft).toBeNull();
  });

  it('no router state → autoOpenAdd stays false', async () => {
    await act(async () => {
      renderView();
    });

    expect(stubProps.autoOpenAdd).toBe(false);
    expect(stubProps.restoreDraft).toBeNull();
  });
});
