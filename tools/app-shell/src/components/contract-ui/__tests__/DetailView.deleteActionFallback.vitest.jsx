/**
 * Behavioral test for the per-window `deleteAction` fallback (ETP-4479).
 *
 * `payment-in` and `payment-out` need the header delete (trash icon) button
 * to call the `eTPRRemovePayment` NEO action instead of a plain DELETE, in
 * BOTH draft and confirmed/processed status — never just hidden past draft.
 * That requirement cannot go through `decisions.json` (the generator wiring
 * for a `window.deleteAction` field is not published in `schema_forge_core`),
 * so `DetailView.jsx` hardcodes a `WINDOW_DELETE_ACTIONS` map keyed by
 * `windowName` and falls back to it only when the caller does not pass an
 * explicit `deleteAction` prop.
 *
 * Harness mirrors DetailView.neoActionMenu.vitest.jsx.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { DetailView } from '../DetailView.jsx';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/payment-in/123', search: '' }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

function makeHook(data) {
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
}

let currentHook = makeHook({ id: '123', documentNo: 'PAY-001', status: 'RPAP', processed: false });

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

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

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
        entityLabel="Payment"
        detailLabel="Lines"
        titleField="documentNo"
        recordId="123"
        token="test-token"
        apiBaseUrl="/api/payment-in"
        breadcrumb="Finance / Payments In"
        {...props}
      />
    </MemoryRouter>,
  );
}

// payment-in/out now show the rich Reactivar/Eliminar cartel (ETP-4500,
// WINDOW_DELETE_CONFIRM_MODALS) instead of the generic delete Dialog, so its
// confirm button carries a different testid (`payment-confirm-accept`, from
// PaymentLifecycleConfirmModal's `testIdPrefix="payment-confirm"`).
async function clickDeleteAndConfirm(user, confirmTestId = 'action-delete-confirm') {
  await user.click(screen.getByTestId('action-delete'));
  await user.click(screen.getByTestId(confirmTestId));
}

describe('DetailView — per-window deleteAction fallback (ETP-4479)', () => {
  beforeEach(() => {
    neoExecuteMock.mockClear();
    neoExecuteMock.mockResolvedValue({ success: true });
    toast.success.mockClear();
    toast.error.mockClear();
    navigateMock.mockClear();
  });

  it('payment-in draft: delete button calls eTPRRemovePayment, not a plain delete', async () => {
    currentHook = makeHook({ id: '123', documentNo: 'PAY-001', status: 'RPAP', processed: false });
    const user = userEvent.setup();
    renderDetailView({ windowName: 'payment-in' });

    expect(screen.getByTestId('action-delete')).toBeTruthy();
    await clickDeleteAndConfirm(user, 'payment-confirm-accept');

    expect(neoExecuteMock).toHaveBeenCalledWith('123', 'eTPRRemovePayment');
    expect(currentHook.handleDelete).not.toHaveBeenCalled();
    expect(navigateMock).toHaveBeenCalledWith('/payment-in');
    expect(toast.success).toHaveBeenCalled();
  });

  it('payment-in confirmed (processed, hideDeleteWhenComplete): button stays visible and still calls the NEO action', async () => {
    currentHook = makeHook({ id: '123', documentNo: 'PAY-001', status: 'RPPC', processed: true });
    const user = userEvent.setup();
    renderDetailView({ windowName: 'payment-in', hideDeleteWhenComplete: true });

    expect(screen.getByTestId('action-delete')).toBeTruthy();
    await clickDeleteAndConfirm(user, 'payment-confirm-accept');

    expect(neoExecuteMock).toHaveBeenCalledWith('123', 'eTPRRemovePayment');
    expect(currentHook.handleDelete).not.toHaveBeenCalled();
  });

  it('payment-out voided: delete button is hidden', () => {
    currentHook = makeHook({ id: '123', documentNo: 'PAY-002', status: 'RPVOID', processed: true });
    renderDetailView({ windowName: 'payment-out', hideDeleteWhenComplete: true });

    expect(screen.queryByTestId('action-delete')).toBeNull();
  });

  it('non-payment window (regression): unaffected — hideDeleteWhenComplete still hides delete when processed', () => {
    currentHook = makeHook({ id: '123', documentNo: 'SO-001', status: 'CO', processed: true });
    renderDetailView({ windowName: 'sales-order', hideDeleteWhenComplete: true, statusField: 'status' });

    expect(screen.queryByTestId('action-delete')).toBeNull();
  });

  it('non-payment window (regression): visible draft record still uses the plain hook.handleDelete', async () => {
    currentHook = makeHook({ id: '123', documentNo: 'SO-001', status: 'DR', processed: false });
    const user = userEvent.setup();
    renderDetailView({ windowName: 'sales-order', hideDeleteWhenComplete: true, statusField: 'status' });

    await clickDeleteAndConfirm(user);

    expect(neoExecuteMock).not.toHaveBeenCalled();
    expect(currentHook.handleDelete).toHaveBeenCalled();
  });

  it('payment-in reconciled (status: RPPC): the rich delete cartel shows all three items (RPPC is also a deposited status, so hasTransaction/posted are both true)', async () => {
    currentHook = makeHook({ id: '123', documentNo: 'PAY-001', status: 'RPPC', processed: false });
    const user = userEvent.setup();
    renderDetailView({ windowName: 'payment-in' });

    await user.click(screen.getByTestId('action-delete'));

    // RPPC is a member of DEPOSITED_STATUSES, so — unlike the pre-ETP-4500-followup
    // derivation (posted := data.posted === 'Y') — `hasTransaction`/`posted` are
    // BOTH true here too, alongside `reconciled`. All three items show.
    expect(screen.getByText('reactivarItem1Title.')).toBeInTheDocument();
    expect(screen.getByText('reactivarItem2Title.')).toBeInTheDocument();
    expect(screen.getByText('reactivarItem3Title.')).toBeInTheDocument();
  });

  it('payment-out posted (processed: true — posted=="Y" per the hook fixture): the rich delete cartel shows the Asiento item', async () => {
    currentHook = makeHook({ id: '123', documentNo: 'PAY-002', status: 'RPR', processed: true, posted: 'Y' });
    const user = userEvent.setup();
    renderDetailView({ windowName: 'payment-out' });

    await user.click(screen.getByTestId('action-delete'));

    expect(screen.getByText('reactivarItem3Title.')).toBeInTheDocument();
    expect(screen.queryByText('reactivarItem1Title.')).not.toBeInTheDocument();
  });

  it('payment-in neither reconciled nor posted (status: RPAP, posted: "N"): the rich delete cartel shows neither item', async () => {
    currentHook = makeHook({ id: '123', documentNo: 'PAY-003', status: 'RPAP', processed: false, posted: 'N' });
    const user = userEvent.setup();
    renderDetailView({ windowName: 'payment-in' });

    await user.click(screen.getByTestId('action-delete'));

    expect(screen.queryByText('reactivarItem1Title.')).not.toBeInTheDocument();
    expect(screen.queryByText('reactivarItem3Title.')).not.toBeInTheDocument();
  });
});
