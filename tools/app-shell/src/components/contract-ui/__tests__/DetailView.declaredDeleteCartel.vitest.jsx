/**
 * ETP-4708 Phase A — the DECLARED delete cartel.
 *
 * `DetailView` resolves the delete cartel and the delete action from two
 * hardcoded, `windowName`-keyed tables (WINDOW_DELETE_CONFIRM_MODALS,
 * WINDOW_DELETE_ACTIONS). Phase A adds a declarative path — the window passes
 * `deleteConfirmModal`, `deleteConfirmModalProps` and `deleteAction` as props,
 * emitted by the generator from `decisions.json` — while KEEPING the tables as
 * the fallback, so windows that have not declared anything are untouched.
 *
 * Why this file exists, separately from DetailView.deleteActionFallback.vitest.jsx:
 * that suite (8 tests, deliberately unmodified) proves the FALLBACK still works.
 * It cannot prove the declared path works, because payment-in/out are in the
 * tables — the cartel would render identically whether the props are honoured or
 * silently ignored. Every test below therefore either uses a window that is in
 * NEITHER table, or declares something that DIFFERS from the table, so it can
 * only pass if the prop is genuinely doing the work.
 *
 * These are the assertions Phase B inherits: once the tables are deleted, they
 * are what still guarantees the behaviour.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/sales-order/123', search: '' }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

function makeHook(data) {
  return {
    loading: false, items: [], selected: data, editing: data, children: [],
    isDirtyHeader: false, loadingChildren: false, childrenLoading: false, error: null,
    handleChange: vi.fn(),
    handleSave: vi.fn().mockResolvedValue({}),
    handleCreate: vi.fn().mockResolvedValue({}),
    handleDelete: vi.fn().mockResolvedValue({}),
    handleDeleteChild: vi.fn(), handleSelect: vi.fn(), handleUpdateChild: vi.fn(),
    handleProcess: vi.fn(),
    handleSaveAndProcess: vi.fn().mockResolvedValue({}),
    fetchById: vi.fn().mockResolvedValue({}),
    fetchChildren: vi.fn(), refreshChildren: vi.fn(),
    isSaving: false, primeSaved: vi.fn(),
  };
}

let currentHook = makeHook({ id: '123', documentNo: 'SO-001', status: 'DR', processed: false });

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => currentHook,
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
vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: vi.fn().mockResolvedValue({}), loading: false }),
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
  Dialog: ({ children, open }) => (open ? <div data-testid="generic-delete-dialog">{children}</div> : null),
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

/**
 * Stand-in for a window's declared cartel. Echoes every prop it receives so the
 * tests can assert the payload arrived, not merely that something rendered.
 */
const StubCartel = ({ dir, action, tone, onConfirm }) => (
  <div data-testid="declared-cartel">
    <span data-testid="declared-cartel-dir">{String(dir)}</span>
    <span data-testid="declared-cartel-action">{String(action)}</span>
    <span data-testid="declared-cartel-tone">{String(tone)}</span>
    <button data-testid="declared-cartel-confirm" onClick={onConfirm}>confirm</button>
  </div>
);

function renderDetailView(props = {}) {
  return render(
    <MemoryRouter>
      <DetailView
        entity="header"
        detailEntity={null}
        Form={MockForm}
        DetailTable={null}
        DetailForm={null}
        summary={[]}
        statusField="status"
        processes={[]}
        addLineFields={{ entry: [], derived: [] }}
        api={{}}
        entityLabel="Order"
        detailLabel="Lines"
        titleField="documentNo"
        recordId="123"
        token="test-token"
        apiBaseUrl="/api/sales-order"
        breadcrumb="Sales / Orders"
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('DetailView — declared delete cartel (ETP-4708 Phase A)', () => {
  beforeEach(() => {
    currentHook = makeHook({ id: '123', documentNo: 'SO-001', status: 'DR', processed: false });
    neoExecuteMock.mockClear();
    neoExecuteMock.mockResolvedValue({ success: true });
    navigateMock.mockClear();
  });

  it('renders the declared cartel for a window in NEITHER hardcoded table', async () => {
    // sales-order has no WINDOW_DELETE_CONFIRM_MODALS entry, so the cartel can
    // only appear if the prop is honoured.
    const user = userEvent.setup();
    renderDetailView({ windowName: 'sales-order', deleteConfirmModal: StubCartel });
    await user.click(screen.getByTestId('action-delete'));

    expect(screen.getByTestId('declared-cartel')).toBeTruthy();
    expect(screen.queryByTestId('generic-delete-dialog')).toBeNull();
  });

  it('falls back to the generic dialog when nothing is declared and the window is not in the table', async () => {
    const user = userEvent.setup();
    renderDetailView({ windowName: 'sales-order' });
    await user.click(screen.getByTestId('action-delete'));

    expect(screen.getByTestId('generic-delete-dialog')).toBeTruthy();
    expect(screen.queryByTestId('declared-cartel')).toBeNull();
  });

  it('forwards deleteConfirmModalProps to the declared cartel', async () => {
    const user = userEvent.setup();
    renderDetailView({
      windowName: 'sales-order',
      deleteConfirmModal: StubCartel,
      deleteConfirmModalProps: { dir: 'out' },
    });
    await user.click(screen.getByTestId('action-delete'));

    expect(screen.getByTestId('declared-cartel-dir').textContent).toBe('out');
    // The fixed props the render site always supplies are still passed.
    expect(screen.getByTestId('declared-cartel-action').textContent).toBe('delete');
  });

  it('forwards an arbitrary key, not just dir', async () => {
    // The table only ever carried `dir`, so a payload key beyond it is the proof
    // that the whole object is forwarded rather than one hardcoded field.
    const user = userEvent.setup();
    renderDetailView({
      windowName: 'sales-order',
      deleteConfirmModal: StubCartel,
      deleteConfirmModalProps: { dir: 'in', tone: 'danger' },
    });
    await user.click(screen.getByTestId('action-delete'));

    expect(screen.getByTestId('declared-cartel-tone').textContent).toBe('danger');
  });

  it('the declared cartel WINS over the hardcoded table for a window that is in it', async () => {
    // payment-in IS in WINDOW_DELETE_CONFIRM_MODALS. If the table won, the real
    // PaymentLifecycleConfirmModal would render and this stub would not appear.
    const user = userEvent.setup();
    renderDetailView({
      windowName: 'payment-in',
      deleteConfirmModal: StubCartel,
      deleteConfirmModalProps: { dir: 'out' },
    });
    await user.click(screen.getByTestId('action-delete'));

    expect(screen.getByTestId('declared-cartel')).toBeTruthy();
    // …and the declared payload wins too, even though the table says dir: 'in'.
    expect(screen.getByTestId('declared-cartel-dir').textContent).toBe('out');
  });

  it('a declared deleteAction routes a non-table window through the NEO action', async () => {
    const user = userEvent.setup();
    renderDetailView({
      windowName: 'sales-order',
      deleteAction: 'eTPRRemoveOrder',
      deleteConfirmModal: StubCartel,
    });
    await user.click(screen.getByTestId('action-delete'));
    await user.click(screen.getByTestId('declared-cartel-confirm'));

    expect(neoExecuteMock).toHaveBeenCalled();
    expect(currentHook.handleDelete).not.toHaveBeenCalled();
  });

  it('without a declared deleteAction the same window still uses the plain delete', async () => {
    const user = userEvent.setup();
    renderDetailView({ windowName: 'sales-order', deleteConfirmModal: StubCartel });
    await user.click(screen.getByTestId('action-delete'));
    await user.click(screen.getByTestId('declared-cartel-confirm'));

    expect(neoExecuteMock).not.toHaveBeenCalled();
    expect(currentHook.handleDelete).toHaveBeenCalled();
  });
});
