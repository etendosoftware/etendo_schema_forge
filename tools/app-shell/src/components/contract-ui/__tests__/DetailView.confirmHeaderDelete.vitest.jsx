/**
 * ETP-4656 — `confirmHeaderDelete`'s navigate-only-on-success wiring.
 *
 * `hook.handleDelete()` now returns true/false instead of being swallowed
 * (see useEntity.vitest.jsx for the hook-level coverage). This file verifies
 * the DetailView side of the contract for the generic (non deleteAction)
 * delete path: navigate() must fire only when handleDelete() resolves true,
 * and a failed delete must NOT navigate away as if the record were gone.
 *
 * Harness mirrors DetailView.deleteActionFallback.vitest.jsx.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { DetailView } from '../DetailView.jsx';

const navigateMock = vi.fn();

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

function makeHook(data, { handleDelete } = {}) {
  return {
    loading: false,
    items: [],
    selected: data,
    editing: data,
    children: [],
    isDirtyHeader: false,
    loadingChildren: false,
    childrenLoading: false,
    error: null,
    handleChange: vi.fn(),
    handleSave: vi.fn().mockResolvedValue({}),
    handleCreate: vi.fn().mockResolvedValue({}),
    handleDelete: handleDelete || vi.fn().mockResolvedValue(true),
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
        entityLabel="Sales Order"
        detailLabel="Lines"
        titleField="documentNo"
        recordId="123"
        token="test-token"
        apiBaseUrl="/api/sales-order"
        breadcrumb="Sales / Orders"
        windowName="sales-order"
        {...props}
      />
    </MemoryRouter>,
  );
}

async function clickDeleteAndConfirm(user) {
  await user.click(screen.getByTestId('action-delete'));
  await user.click(screen.getByTestId('action-delete-confirm'));
}

describe('DetailView — confirmHeaderDelete navigate-only-on-success (ETP-4656)', () => {
  beforeEach(() => {
    navigateMock.mockClear();
    toast.success.mockClear();
    toast.error.mockClear();
  });

  it('navigates back to the list when handleDelete resolves true', async () => {
    currentHook = makeHook(
      { id: '123', documentNo: 'SO-001', status: 'DR', processed: false },
      { handleDelete: vi.fn().mockResolvedValue(true) },
    );
    const user = userEvent.setup();
    renderDetailView();

    await clickDeleteAndConfirm(user);

    expect(currentHook.handleDelete).toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/sales-order');
  });

  it('does NOT navigate when handleDelete resolves false (e.g. FK-blocked delete)', async () => {
    currentHook = makeHook(
      { id: '123', documentNo: 'SO-001', status: 'DR', processed: false },
      { handleDelete: vi.fn().mockResolvedValue(false) },
    );
    const user = userEvent.setup();
    renderDetailView();

    await clickDeleteAndConfirm(user);

    expect(currentHook.handleDelete).toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('does NOT navigate when handleDelete resolves undefined (regression guard against the pre-ETP-4656 always-navigate bug)', async () => {
    currentHook = makeHook(
      { id: '123', documentNo: 'SO-001', status: 'DR', processed: false },
      { handleDelete: vi.fn().mockResolvedValue(undefined) },
    );
    const user = userEvent.setup();
    renderDetailView();

    await clickDeleteAndConfirm(user);

    expect(navigateMock).not.toHaveBeenCalled();
  });
});
