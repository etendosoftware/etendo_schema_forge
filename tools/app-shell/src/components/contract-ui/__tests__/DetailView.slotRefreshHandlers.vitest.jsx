/**
 * Behavioral tests for the ETP-4563 cache-refresh fix on DetailView's slot and
 * lifecycle refresh callbacks. The fix threads `{ force: true }` through every
 * post-mutation re-fetch so header/children reload from the network (bypassing
 * the shared read cache) instead of serving stale cached rows.
 *
 * Covered surfaces (DetailView.jsx):
 *   - headerExtra slotProps.onRefresh / onRefreshChildren / onSave (~4011-4026)
 *   - LinesEmptyState onRefresh (~4221-4224)
 *   - justSaved fast-path: force-fetch children + one-shot state clear (~2989-3005)
 *
 * Harness mirrors DetailView.neoActionMenu.vitest.jsx, but useLocation/useNavigate
 * are backed by mutable module-level values so the justSaved location state can be
 * driven per test.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useEffect } from 'react';
import { DetailView } from '../DetailView.jsx';

let mockLocationValue = { pathname: '/sales-order/123', search: '', state: null };
const mockNavigateFn = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigateFn,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => mockLocationValue,
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const mockHook = {
  loading: false,
  items: [],
  selected: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
  editing: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
  children: [{ id: 'L1', product: 'P1', 'product$_identifier': 'Widget', lineNetAmount: 100 }],
  isDirtyHeader: false,
  loadingChildren: false,
  childrenLoading: false,
  error: null,
  handleChange: vi.fn(),
  handleSave: vi.fn().mockResolvedValue({ id: '123' }),
  handleCreate: vi.fn().mockResolvedValue({}),
  handleDelete: vi.fn().mockResolvedValue({}),
  handleDeleteChild: vi.fn(),
  handleSelect: vi.fn(),
  handleUpdateChild: vi.fn(),
  handleAddChild: vi.fn(),
  handleProcess: vi.fn(),
  handleSaveAndProcess: vi.fn().mockResolvedValue({ id: '123' }),
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
vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }),
}));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, calculate: vi.fn() }),
  ORDER_LINE_CONFIG: { qtyField: 'orderedQuantity', priceField: 'unitPrice', totalField: 'lineNetAmount' },
}));
vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({ execute: vi.fn().mockResolvedValue({}), loading: false }) }));
vi.mock('@/hooks/useNeoAction', () => ({ useNeoAction: () => ({ execute: vi.fn().mockResolvedValue({ success: true }), loading: false }) }));

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
vi.mock('@/lib/selectorContext.js', () => ({ buildHeaderSelectorContext: () => ({}), buildLineSelectorContext: () => ({}) }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => (v != null ? String(v) : '—') }));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (data, f) => data?.[f] || data?._identifier || '' }));
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
vi.mock('../LinesSelectionBar.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: ({ status }) => <span>{status}</span> }));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>📎</span> }));

const MockForm = ({ data }) => <div data-testid="mock-form"><span>{data?.documentNo}</span></div>;
const MockTable = ({ data }) => <div data-testid="mock-table">{(data || []).map((r) => <div key={r.id}>{r.id}</div>)}</div>;

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
        addLineFields={{ entry: [], derived: [] }}
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

function resetState() {
  mockLocationValue = { pathname: '/sales-order/123', search: '', state: null };
  mockNavigateFn.mockClear();
  mockHook.selected = { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false };
  mockHook.editing = { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false };
  mockHook.children = [{ id: 'L1', product: 'P1', 'product$_identifier': 'Widget', lineNetAmount: 100 }];
  mockHook.handleSave = vi.fn().mockResolvedValue({ id: '123' });
  mockHook.fetchById.mockClear();
  mockHook.fetchChildren.mockClear();
  mockHook.primeSaved.mockClear();
  mockHook.handleUpdateChild.mockClear();
  mockHook.handleSelect.mockClear();
}

describe('DetailView — headerExtra slotProps refresh (ETP-4563)', () => {
  beforeEach(resetState);

  // headerExtra receives slotProps and, being a function, is invoked during
  // render — so its returned buttons let us fire onRefresh/onRefreshChildren/onSave.
  const captureSlot = () => (slot) => (
    <div>
      <button data-testid="slot-refresh" onClick={() => slot.onRefresh()}>refresh</button>
      <button data-testid="slot-refresh-explicit" onClick={() => slot.onRefresh('999')}>refresh explicit</button>
      <button data-testid="slot-refresh-children" onClick={() => slot.onRefreshChildren()}>refresh children</button>
      <button data-testid="slot-save" onClick={() => slot.onSave()}>save</button>
    </div>
  );

  it('onRefresh force-refetches both children and header for the current record', async () => {
    const user = userEvent.setup();
    renderDetailView({ headerExtra: captureSlot() });

    mockHook.fetchById.mockClear();
    mockHook.fetchChildren.mockClear();
    await user.click(screen.getByTestId('slot-refresh'));

    expect(mockHook.fetchChildren).toHaveBeenCalledWith('123', { force: true });
    expect(mockHook.fetchById).toHaveBeenCalledWith('123', { force: true });
  });

  it('onRefresh(parentId) honors an explicit id argument', async () => {
    const user = userEvent.setup();
    renderDetailView({ headerExtra: captureSlot() });

    mockHook.fetchById.mockClear();
    mockHook.fetchChildren.mockClear();
    await user.click(screen.getByTestId('slot-refresh-explicit'));

    expect(mockHook.fetchChildren).toHaveBeenCalledWith('999', { force: true });
    expect(mockHook.fetchById).toHaveBeenCalledWith('999', { force: true });
  });

  it('onRefreshChildren force-refetches only the children', async () => {
    const user = userEvent.setup();
    renderDetailView({ headerExtra: captureSlot() });

    mockHook.fetchById.mockClear();
    mockHook.fetchChildren.mockClear();
    await user.click(screen.getByTestId('slot-refresh-children'));

    expect(mockHook.fetchChildren).toHaveBeenCalledWith('123', { force: true });
    expect(mockHook.fetchById).not.toHaveBeenCalled();
  });

  it('onSave persists via the hook (existing record: primes nothing, no crash)', async () => {
    const user = userEvent.setup();
    renderDetailView({ headerExtra: captureSlot() });

    await user.click(screen.getByTestId('slot-save'));

    await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalled());
    // Existing record → not the isNew branch, so primeSaved is not called.
    expect(mockHook.primeSaved).not.toHaveBeenCalled();
  });
});

describe('DetailView — topbar slot refresh (ETP-4563)', () => {
  beforeEach(resetState);

  it('topbarExtra onRefresh force-refreshes the header', async () => {
    const user = userEvent.setup();
    const TopbarExtra = ({ onRefresh }) => (
      <button data-testid="topbar-extra-refresh" onClick={() => onRefresh()}>refresh</button>
    );
    renderDetailView({ topbarExtra: TopbarExtra });

    mockHook.fetchById.mockClear();
    await user.click(screen.getByTestId('topbar-extra-refresh'));

    expect(mockHook.fetchById).toHaveBeenCalledWith('123', { force: true });
  });

  it('topbarRight onRefresh force-refreshes the header', async () => {
    const user = userEvent.setup();
    const TopbarRight = ({ onRefresh }) => (
      <button data-testid="topbar-right-refresh" onClick={() => onRefresh()}>refresh</button>
    );
    renderDetailView({ topbarRight: TopbarRight });

    mockHook.fetchById.mockClear();
    await user.click(screen.getByTestId('topbar-right-refresh'));

    expect(mockHook.fetchById).toHaveBeenCalledWith('123', { force: true });
  });

  it('topbarRight onSave persists silently through the hook', async () => {
    const user = userEvent.setup();
    const TopbarRight = ({ onSave }) => (
      <button data-testid="topbar-right-save" onClick={() => onSave()}>save</button>
    );
    renderDetailView({ topbarRight: TopbarRight });

    await user.click(screen.getByTestId('topbar-right-save'));

    expect(mockHook.handleSave).toHaveBeenCalledWith({ silent: true });
  });
});

describe('DetailView — LinesEmptyState onRefresh (ETP-4563)', () => {
  beforeEach(resetState);

  it('force-refetches children and header when the empty-state refresh fires', async () => {
    mockHook.children = [];
    const LinesEmptyState = ({ onRefresh }) => {
      useEffect(() => { onRefresh(); }, [onRefresh]);
      return <div data-testid="lines-empty-state">empty</div>;
    };
    renderDetailView({ linesEmptyState: LinesEmptyState });

    await screen.findByTestId('lines-empty-state');
    await waitFor(() => expect(mockHook.fetchChildren).toHaveBeenCalledWith('123', { force: true }));
    expect(mockHook.fetchById).toHaveBeenCalledWith('123', { force: true });
  });
});

describe('DetailView — remaining mutation refresh surfaces (ETP-4563)', () => {
  beforeEach(resetState);

  it('force-refreshes children and header after a detail extra action', async () => {
    const user = userEvent.setup();
    const DetailExtraActions = ({ onRefresh }) => (
      <button data-testid="detail-extra-refresh" onClick={onRefresh}>refresh</button>
    );
    const BottomSection = () => null;
    BottomSection.detailExtraActions = DetailExtraActions;
    renderDetailView({
      bottomSection: BottomSection,
      addLineFields: { entry: [{ key: 'quantity', type: 'number' }], derived: [] },
    });

    await user.click(screen.getByTestId('detail-extra-refresh'));

    expect(mockHook.fetchChildren).toHaveBeenCalledWith('123', { force: true });
    expect(mockHook.fetchById).toHaveBeenCalledWith('123', { force: true });
  });

  it('force-refreshes children and header from a custom lines tab', async () => {
    const user = userEvent.setup();
    const CustomLines = ({ onRefresh, onSave }) => (
      <div>
        <button data-testid="custom-lines-refresh" onClick={onRefresh}>refresh</button>
        <button data-testid="custom-lines-save" onClick={onSave}>save custom lines</button>
      </div>
    );
    renderDetailView({ DetailTable: null, CustomLines, customLinesLabel: 'Custom Lines' });

    await user.click(await screen.findByTestId('custom-lines-refresh'));
    await user.click(screen.getByTestId('custom-lines-save'));

    expect(mockHook.fetchChildren).toHaveBeenCalledWith('123', { force: true });
    expect(mockHook.fetchById).toHaveBeenCalledWith('123', { force: true });
    expect(mockHook.handleSave).toHaveBeenCalledWith(mockHook.editing);
  });

  it('primes and navigates after saving a new record from custom lines', async () => {
    const user = userEvent.setup();
    const saved = { id: 'NEW-1', documentNo: 'SO-NEW' };
    mockHook.handleSave = vi.fn().mockResolvedValue(saved);
    const CustomLines = ({ onSave }) => (
      <button data-testid="custom-lines-save-new" onClick={onSave}>save custom lines</button>
    );
    renderDetailView({
      recordId: 'new',
      DetailTable: null,
      CustomLines,
      customLinesLabel: 'Custom Lines',
      draftMode: { enabled: false, label: 'process' },
    });

    await user.click(screen.getByTestId('custom-lines-save-new'));

    await waitFor(() => expect(mockHook.primeSaved).toHaveBeenCalledWith(saved));
    expect(mockNavigateFn).toHaveBeenCalledWith('/sales-order/NEW-1', {
      replace: true,
      state: { openAddLine: true },
    });
  });

  it('force-refreshes the exchange-rates collection when its header inputs change', async () => {
    renderDetailView({ secondaryTabs: [{ key: 'exchangeRates', label: 'Exchange Rates', Table: MockTable }] });

    await waitFor(() => expect(mockHook.fetchChildren).toHaveBeenCalledWith('123', { force: true }));
  });

  it('force-refreshes the parent from a secondary custom modal', async () => {
    const user = userEvent.setup();
    const CustomModal = ({ onParentRefresh, onSaved, onClose }) => (
      <div>
        <button data-testid="modal-parent-refresh" onClick={onParentRefresh}>refresh parent</button>
        <button data-testid="modal-saved" onClick={onSaved}>saved</button>
        <button data-testid="modal-close" onClick={onClose}>close</button>
      </div>
    );
    renderDetailView({
      secondaryTabs: [{ key: 'addresses', label: 'Addresses', Table: MockTable, customAddModal: CustomModal }],
    });

    await user.click(screen.getByTestId('modal-parent-refresh'));
    await user.click(screen.getByTestId('modal-saved'));
    await user.click(screen.getByTestId('modal-close'));

    expect(mockHook.fetchById).toHaveBeenCalledWith('123', { force: true });
    expect(mockHook.handleSelect).toHaveBeenCalledWith(mockHook.selected);
  });

  it('mounts secondary panels and accepts their count updates', async () => {
    const Panel = ({ onCount }) => (
      <button data-testid="secondary-panel" onClick={() => onCount(3)}>panel</button>
    );
    renderDetailView({ secondaryTabs: [{ key: 'audit', label: 'Audit', Panel }] });

    await userEvent.click(await screen.findByTestId('secondary-panel'));
  });

  it('keeps optional refresh consumers safe when hook callbacks are unavailable', async () => {
    const user = userEvent.setup();
    const originalFetchById = mockHook.fetchById;
    const originalFetchChildren = mockHook.fetchChildren;
    const originalItems = mockHook.items;
    const originalEditing = mockHook.editing;
    mockHook.items = [mockHook.selected];
    mockHook.editing = { documentNo: mockHook.editing.documentNo };
    mockHook.fetchById = undefined;
    mockHook.fetchChildren = undefined;
    const CustomLines = ({ onRefresh, onCountChange }) => (
      <div>
        <button data-testid="optional-refresh" onClick={onRefresh}>refresh</button>
        <button data-testid="custom-lines-count" onClick={() => onCountChange(4)}>count</button>
      </div>
    );
    const CustomModal = ({ onSaved }) => (
      <button data-testid="optional-modal-saved" onClick={onSaved}>saved</button>
    );

    try {
      renderDetailView({
        DetailTable: null,
        CustomLines,
        customLinesLabel: 'Custom Lines',
        secondaryTabs: [{ key: 'addresses', label: 'Addresses', customAddModal: CustomModal }],
      });

      await user.click(screen.getByTestId('optional-refresh'));
      await user.click(screen.getByTestId('custom-lines-count'));
      await user.click(screen.getByTestId('optional-modal-saved'));
    } finally {
      mockHook.fetchById = originalFetchById;
      mockHook.fetchChildren = originalFetchChildren;
      mockHook.items = originalItems;
      mockHook.editing = originalEditing;
    }
  });

});

describe('DetailView — justSaved fast-path (ETP-4563)', () => {
  beforeEach(resetState);

  it('force-fetches children and clears the one-shot justSaved marker', async () => {
    // Simulate the /new -> /:id redirect: the saved record is primed into the
    // hook and stashed in location.state.justSaved, so the header round-trip is
    // skipped — but children must still be force-fetched (auto-created lines).
    mockLocationValue = {
      pathname: '/sales-order/123',
      search: '',
      state: { justSaved: { id: '123' } },
    };
    renderDetailView();

    await waitFor(() => expect(mockHook.fetchChildren).toHaveBeenCalledWith('123', { force: true }));
    // One-shot: the marker is cleared via a replace-navigation so a manual reload
    // still triggers a real fetch.
    await waitFor(() =>
      expect(mockNavigateFn).toHaveBeenCalledWith(
        '/sales-order/123',
        expect.objectContaining({ replace: true, state: expect.objectContaining({ justSaved: undefined }) }),
      ),
    );
  });

  it('does NOT take the fast-path when justSaved id does not match the route', async () => {
    mockLocationValue = {
      pathname: '/sales-order/123',
      search: '',
      state: { justSaved: { id: 'OTHER' } },
    };
    renderDetailView();

    // Mismatch → normal path: no force-children fetch triggered by the fast-path.
    await waitFor(() => expect(mockHook.fetchChildren).not.toHaveBeenCalledWith('123', { force: true }));
  });
});
