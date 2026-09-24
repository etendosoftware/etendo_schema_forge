/**
 * Behavioral test for the DetailView "more" menu `documentAction` branch and its
 * post-action cache refresh (ETP-4563).
 *
 * The neoAction branch already has coverage (DetailView.neoActionMenu). This spec
 * targets the SIBLING `runDocumentAction` path (DetailView.jsx ~3694-3710), which
 * the ETP-4563 cache fix also touched: after a successful document action the
 * record must be re-fetched with `{ force: true }` so the read cache is bypassed
 * and the UI reflects the server-side state change. It also drives the
 * `preUnpost` guard (unpost-before-action) and the failure/throw branches, and
 * the `customMenuContent` onRefresh callback.
 *
 * Harness mirrors DetailView.neoActionMenu.vitest.jsx; the only additions are a
 * controllable `@/hooks/useDocumentAction` mock (execute + loading).
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { DetailView } from '../DetailView.jsx';

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
  handleSave: vi.fn().mockResolvedValue({}),
  handleCreate: vi.fn().mockResolvedValue({}),
  handleDelete: vi.fn().mockResolvedValue({}),
  handleDeleteChild: vi.fn(),
  handleSelect: vi.fn(),
  handleUpdateChild: vi.fn(),
  handleProcess: vi.fn(),
  handleSaveAndProcess: vi.fn().mockResolvedValue({}),
  fetchById: vi.fn().mockResolvedValue({}),
  fetchChildren: vi.fn(),
  invalidateEntityCache: vi.fn(),
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

// The hook under test — controllable execute + loading.
const docExecuteMock = vi.fn().mockResolvedValue({});
vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: docExecuteMock, loading: false }),
}));

const neoExecuteMock = vi.fn().mockResolvedValue({ success: true });
vi.mock('@/hooks/useNeoAction', () => ({
  useNeoAction: () => ({ execute: neoExecuteMock, loading: false }),
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

function setCurrentRecord(posted) {
  const record = { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false };
  if (posted !== undefined) record.posted = posted;
  mockHook.selected = record;
  mockHook.editing = record;
}

describe('DetailView — documentAction menu branch cache refresh (ETP-4563)', () => {
  beforeEach(() => {
    docExecuteMock.mockClear();
    docExecuteMock.mockResolvedValue({});
    neoExecuteMock.mockClear();
    neoExecuteMock.mockResolvedValue({ success: true });
    toast.success.mockClear();
    toast.error.mockClear();
    mockHook.fetchById.mockClear();
    setCurrentRecord(undefined);
  });

  it('runs docAction.execute(id, action) and force-refreshes on success', async () => {
    const user = userEvent.setup();
    renderDetailView({ menuActions: [{ key: 'complete', label: 'Complete', documentAction: 'CO' }] });

    await user.click(screen.getByTestId('action-more'));
    // Isolate the post-action refresh from any mount-driven fetchById.
    mockHook.fetchById.mockClear();
    await user.click(screen.getByTestId('menu-action-complete'));

    expect(docExecuteMock).toHaveBeenCalledWith('123', 'CO');
    // ETP-4563: the read cache must be bypassed after the action mutates the record.
    expect(mockHook.fetchById).toHaveBeenCalledWith('123', { force: true });
    expect(toast.success).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('surfaces the successKey label as a success toast', async () => {
    const user = userEvent.setup();
    renderDetailView({
      menuActions: [{ key: 'complete', label: 'Complete', documentAction: 'CO', successKey: 'documentCompleted' }],
    });

    await user.click(screen.getByTestId('action-more'));
    await user.click(screen.getByTestId('menu-action-complete'));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('documentCompleted'));
  });

  it('shows toast.error and does NOT refresh when docAction.execute throws', async () => {
    const user = userEvent.setup();
    docExecuteMock.mockRejectedValueOnce(new Error('Document is locked'));
    renderDetailView({ menuActions: [{ key: 'complete', label: 'Complete', documentAction: 'CO' }] });

    await user.click(screen.getByTestId('action-more'));
    mockHook.fetchById.mockClear();
    await user.click(screen.getByTestId('menu-action-complete'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Document is locked'));
    expect(mockHook.fetchById).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('unposts first, then runs the documentAction and force-refreshes when the record is posted', async () => {
    const user = userEvent.setup();
    setCurrentRecord('Y');
    renderDetailView({
      menuActions: [{ key: 'reopen', label: 'Reopen', documentAction: 'RE', preUnpost: true }],
    });

    await user.click(screen.getByTestId('action-more'));
    mockHook.fetchById.mockClear();
    await user.click(screen.getByTestId('menu-action-reopen'));

    await waitFor(() => expect(docExecuteMock).toHaveBeenCalledWith('123', 'RE'));
    expect(neoExecuteMock).toHaveBeenCalledWith('123', 'unpost');
    // Unpost must precede the document action.
    expect(neoExecuteMock.mock.invocationCallOrder[0]).toBeLessThan(
      docExecuteMock.mock.invocationCallOrder[0],
    );
    expect(mockHook.fetchById).toHaveBeenCalledWith('123', { force: true });
  });

  it('aborts the documentAction (no execute, no refresh) when the pre-unpost step fails', async () => {
    const user = userEvent.setup();
    setCurrentRecord('Y');
    neoExecuteMock.mockResolvedValue({ success: false, message: 'Cannot unpost' });
    renderDetailView({
      menuActions: [{ key: 'reopen', label: 'Reopen', documentAction: 'RE', preUnpost: true }],
    });

    await user.click(screen.getByTestId('action-more'));
    mockHook.fetchById.mockClear();
    await user.click(screen.getByTestId('menu-action-reopen'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cannot unpost'));
    expect(docExecuteMock).not.toHaveBeenCalled();
    expect(mockHook.fetchById).not.toHaveBeenCalled();
  });

  it('customMenuContent onRefresh force-refreshes the record', async () => {
    // customMenuContent is rendered twice: once in a hidden probe (onRefresh is a
    // no-op there) and once in the open menu (onRefresh -> force fetchById). Only
    // the open-menu instance wires the real refresh, so we assert the force call
    // rather than the DOM node (which would be duplicated by the probe).
    const user = userEvent.setup();
    const CustomMenuContent = ({ onRefresh }) => {
      useEffect(() => { onRefresh(); }, [onRefresh]);
      return <div>custom</div>;
    };
    renderDetailView({ customMenuContent: CustomMenuContent });

    await user.click(screen.getByTestId('action-more'));

    await waitFor(() => expect(mockHook.fetchById).toHaveBeenCalledWith('123', { force: true }));
  });
});

/**
 * ETP-5378 — the LIST half of the kebab's post-action refresh.
 *
 * The reported case: a Completed-but-unposted Sales Invoice is posted from the
 * form's "⋮" menu and the user leaves with Cancelar. Cancelar only runs
 * `navigate('/'+windowName)`, so the grid re-mounted onto the cached list page,
 * which still held the pre-action row — "Sin contabilizar" until a manual
 * refresh. ETP-4563 had fixed the RECORD read (the form was right); nobody had
 * dropped the cached LIST. `useEntity.handleProcessSuccess` always ran the full
 * trio (invalidateEntityCache → fetchById → refresh); the three kebab paths now
 * do too.
 *
 * Order matters: invalidating AFTER the refetch has been issued lets the stale
 * response repopulate the cache that was just cleared, so each test pins the
 * sequence, not just the presence of the call.
 */
describe('DetailView — stale grid rows after a kebab action (ETP-5378)', () => {
  beforeEach(() => {
    docExecuteMock.mockClear();
    docExecuteMock.mockResolvedValue({});
    neoExecuteMock.mockClear();
    neoExecuteMock.mockResolvedValue({ success: true });
    toast.success.mockClear();
    toast.error.mockClear();
    mockHook.fetchById.mockClear();
    mockHook.invalidateEntityCache.mockClear();
    setCurrentRecord(undefined);
  });

  // Compared on the LAST invocation of each spy so an unrelated mount-driven
  // refetch cannot flip a first-vs-first comparison; the property under test —
  // "invalidate the list, THEN re-read the record" — holds on the last pair.
  const lastCall = (mockFn) => mockFn.mock.invocationCallOrder.at(-1);

  function expectInvalidatedBeforeRefetch() {
    expect(mockHook.invalidateEntityCache).toHaveBeenCalled();
    expect(mockHook.fetchById).toHaveBeenCalledWith('123', { force: true });
    expect(lastCall(mockHook.invalidateEntityCache)).toBeLessThan(lastCall(mockHook.fetchById));
  }

  it('a completed document must not leave a stale row in the grid', async () => {
    const user = userEvent.setup();
    renderDetailView({ menuActions: [{ key: 'complete', label: 'Complete', documentAction: 'CO' }] });

    await user.click(screen.getByTestId('action-more'));
    mockHook.fetchById.mockClear();
    mockHook.invalidateEntityCache.mockClear();
    await user.click(screen.getByTestId('menu-action-complete'));

    await waitFor(() => expect(mockHook.invalidateEntityCache).toHaveBeenCalled());
    expectInvalidatedBeforeRefetch();
  });

  it('a posted document must not leave a stale row in the grid', async () => {
    // The reported flow: `post` is a neoAction (POST /action/post), not a
    // documentAction — a different branch from the one above, with the same bug.
    const user = userEvent.setup();
    renderDetailView({ menuActions: [{ key: 'post', label: 'Post', neoAction: 'post' }] });

    await user.click(screen.getByTestId('action-more'));
    mockHook.fetchById.mockClear();
    mockHook.invalidateEntityCache.mockClear();
    await user.click(screen.getByTestId('menu-action-post'));

    await waitFor(() => expect(neoExecuteMock).toHaveBeenCalledWith('123', 'post'));
    expectInvalidatedBeforeRefetch();
  });

  it('a custom kebab action must not leave a stale row in the grid', async () => {
    // customMenuContent is rendered twice — a hidden probe (its onRefresh is a
    // no-op) and the open-menu instance that wires the real handler — so this
    // asserts on the hook calls rather than on a DOM node.
    const user = userEvent.setup();
    const CustomMenuContent = ({ onRefresh }) => {
      useEffect(() => { onRefresh(); }, [onRefresh]);
      return <div>custom</div>;
    };
    renderDetailView({ customMenuContent: CustomMenuContent });

    mockHook.fetchById.mockClear();
    mockHook.invalidateEntityCache.mockClear();
    await user.click(screen.getByTestId('action-more'));

    await waitFor(() => expect(mockHook.invalidateEntityCache).toHaveBeenCalled());
    expectInvalidatedBeforeRefetch();
  });

  it('keeps the cached grid page when the document action fails', async () => {
    // Nothing changed on the server, so dropping the list cache would only buy a
    // pointless refetch — and it would mask a failed action as a refreshed one.
    const user = userEvent.setup();
    docExecuteMock.mockRejectedValueOnce(new Error('Document is locked'));
    renderDetailView({ menuActions: [{ key: 'complete', label: 'Complete', documentAction: 'CO' }] });

    await user.click(screen.getByTestId('action-more'));
    mockHook.invalidateEntityCache.mockClear();
    await user.click(screen.getByTestId('menu-action-complete'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Document is locked'));
    expect(mockHook.invalidateEntityCache).not.toHaveBeenCalled();
  });

  it('keeps the cached grid page when the neo action is refused', async () => {
    const user = userEvent.setup();
    neoExecuteMock.mockResolvedValue({ success: false, message: 'Period closed' });
    renderDetailView({ menuActions: [{ key: 'post', label: 'Post', neoAction: 'post' }] });

    await user.click(screen.getByTestId('action-more'));
    mockHook.invalidateEntityCache.mockClear();
    await user.click(screen.getByTestId('menu-action-post'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Period closed'));
    expect(mockHook.invalidateEntityCache).not.toHaveBeenCalled();
  });
});
