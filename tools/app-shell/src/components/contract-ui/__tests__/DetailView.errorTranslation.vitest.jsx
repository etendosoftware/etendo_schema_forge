/**
 * Behavioral coverage for two ETP-4706 `translateBackendError` call sites in
 * DetailView.jsx that DetailView.neoActionMenu.vitest.jsx does not reach:
 *
 *  1. `confirmHeaderDelete` (deleteAction-backed header delete failure) — a
 *     dedicated toolbar Delete flow, separate from the "more" menu actions.
 *  2. `runDocumentAction`'s own `preUnpost` guard — used only when a menu
 *     action combines `documentAction` + `preUnpost: true`. This is a
 *     DIFFERENT code path from the `columnName` + `preUnpost` case already
 *     covered in DetailView.neoActionMenu.vitest.jsx (which never sets
 *     `action.documentAction`, so it never enters `runDocumentAction` at all).
 *
 * Harness mirrors DetailView.neoActionMenu.vitest.jsx.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { translateBackendError } from '@/lib/backendErrors.js';
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

// Controllable, unlike the fixed-resolve mock in DetailView.neoActionMenu.vitest.jsx —
// runDocumentAction's preUnpost + doc-action-throw branches need per-test control.
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
vi.mock('@/lib/backendErrors.js', () => ({ translateBackendError: vi.fn((m) => m) }));
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

beforeEach(() => {
  neoExecuteMock.mockClear();
  neoExecuteMock.mockResolvedValue({ success: true });
  docExecuteMock.mockClear();
  docExecuteMock.mockResolvedValue({});
  toast.success.mockClear();
  toast.error.mockClear();
  mockHook.fetchById.mockClear();
  mockHook.handleDelete.mockClear();
  translateBackendError.mockClear();
  translateBackendError.mockImplementation((m) => m);
  setCurrentRecord(undefined);
});

// ── confirmHeaderDelete (deleteAction-backed toolbar Delete) — ETP-4706 ──────────
describe('DetailView — deleteAction-backed header delete (ETP-4479/ETP-4706)', () => {
  it('routes the failed delete result.message through translateBackendError before the toast', async () => {
    const user = userEvent.setup();
    const raw = 'Account could not be found. (Business Partner: Acme Corp)';
    const translated = 'No se pudo encontrar la cuenta. (Contacto: Acme Corp)';
    neoExecuteMock.mockResolvedValue({ success: false, message: raw });
    translateBackendError.mockImplementation((m) => (m === raw ? translated : m));
    renderDetailView({ deleteAction: 'eTPRRemovePayment' });

    await user.click(screen.getByTestId('action-delete'));
    await user.click(screen.getByTestId('action-delete-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(translated));
    expect(neoExecuteMock).toHaveBeenCalledWith('123', 'eTPRRemovePayment');
    expect(translateBackendError).toHaveBeenCalledWith(raw, expect.any(Function));
  });

  it('does not navigate away when the deleteAction-backed delete fails', async () => {
    const user = userEvent.setup();
    neoExecuteMock.mockResolvedValue({ success: false, message: 'Cannot delete' });
    renderDetailView({ deleteAction: 'eTPRRemovePayment' });

    await user.click(screen.getByTestId('action-delete'));
    await user.click(screen.getByTestId('action-delete-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Cannot delete'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(mockHook.handleDelete).not.toHaveBeenCalled();
  });

  it('shows a success toast and skips the generic handleDelete path on a successful deleteAction', async () => {
    const user = userEvent.setup();
    neoExecuteMock.mockResolvedValue({ success: true });
    renderDetailView({ deleteAction: 'eTPRRemovePayment' });

    await user.click(screen.getByTestId('action-delete'));
    await user.click(screen.getByTestId('action-delete-confirm'));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
    expect(mockHook.handleDelete).not.toHaveBeenCalled();
  });
});

// ── runDocumentAction's own preUnpost guard — ETP-4706 ───────────────────────────
//
// Distinct from the `columnName` + `preUnpost` path in DetailView.neoActionMenu
// .vitest.jsx: this one requires `action.documentAction` to be set so the click
// handler dispatches into `runDocumentAction` (not `runNeoMenuAction`, which
// requires `action.neoAction`, nor the inline `columnName` branch).
const reactivateDocumentAction = {
  key: 'reactivate-doc',
  label: 'Reactivate',
  preUnpost: true,
  documentAction: 'RA',
};

describe('DetailView — more-menu documentAction with preUnpost (ETP-4706)', () => {
  it('translates the pre-unpost failure message and never calls the document action', async () => {
    const user = userEvent.setup();
    setCurrentRecord('Y');
    const raw = 'Account could not be found. (Business Partner: Acme Corp, BP Group: Suppliers)';
    const translated = 'No se pudo encontrar la cuenta. (Contacto: Acme Corp, Grupos de terceros: Suppliers)';
    neoExecuteMock.mockResolvedValue({ success: false, message: raw });
    translateBackendError.mockImplementation((m) => (m === raw ? translated : m));
    renderDetailView({ menuActions: [reactivateDocumentAction] });

    await user.click(screen.getByTestId('action-more'));
    await user.click(screen.getByTestId('menu-action-reactivate-doc'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(translated));
    expect(neoExecuteMock).toHaveBeenCalledWith('123', 'unpost');
    expect(docExecuteMock).not.toHaveBeenCalled();
  });

  it('unposts then dispatches the document action, showing a success toast and refreshing', async () => {
    const user = userEvent.setup();
    setCurrentRecord('Y');
    renderDetailView({ menuActions: [reactivateDocumentAction] });

    await user.click(screen.getByTestId('action-more'));
    mockHook.fetchById.mockClear();
    await user.click(screen.getByTestId('menu-action-reactivate-doc'));

    await waitFor(() => {
      expect(neoExecuteMock).toHaveBeenCalledWith('123', 'unpost');
      expect(docExecuteMock).toHaveBeenCalledWith('123', 'RA');
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(mockHook.fetchById).toHaveBeenCalledWith('123');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows the raw error message when the document action itself throws', async () => {
    const user = userEvent.setup();
    setCurrentRecord('Y');
    docExecuteMock.mockRejectedValue(new Error('Document action failed hard'));
    renderDetailView({ menuActions: [reactivateDocumentAction] });

    await user.click(screen.getByTestId('action-more'));
    await user.click(screen.getByTestId('menu-action-reactivate-doc'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Document action failed hard'));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('skips the pre-unpost step entirely when the record is not posted', async () => {
    const user = userEvent.setup();
    setCurrentRecord('N');
    renderDetailView({ menuActions: [reactivateDocumentAction] });

    await user.click(screen.getByTestId('action-more'));
    await user.click(screen.getByTestId('menu-action-reactivate-doc'));

    await waitFor(() => expect(docExecuteMock).toHaveBeenCalledWith('123', 'RA'));
    expect(neoExecuteMock).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});
