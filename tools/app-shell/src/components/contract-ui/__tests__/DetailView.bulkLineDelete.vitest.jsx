/**
 * ETP-4656 — mixed-outcome coverage for the PRIMARY lines/detailEntity bulk
 * delete, both variants, now migrated to the shared `runBatchDelete`/
 * `toastBatchDeleteOutcome` helpers (lib/batchDelete.js):
 *   1. The non-inlineEditable toolbar button inside `detail-bulk-action-bar`
 *      (gated by `isBulkDeleteBarVisible` — testid `detail-bulk-delete-button`).
 *   2. The shared `SelectionToolbar`'s inline delete button for
 *      `linesLayout==='inlineEditable'` (gated by
 *      `shouldShowInlineDeleteSelectionBar`) — mutually exclusive with #1,
 *      fires for every Sales/Purchase Order/Invoice/Goods Shipment/Receipt
 *      "Líneas" tab.
 *
 * Harness mirrors DetailView.detailProcesses.vitest.jsx (same mock
 * preamble). Unlike the old `LinesSelectionBar`, `SelectionToolbar` (ETP-4972)
 * is a dumb positioning/chrome "shell" — DetailView renders its own delete
 * button as a `children` segment, identified by `title={ui('delete')}`
 * (same pattern used by every other migrated call site, e.g.
 * AmortizationLinesTable.vitest.jsx). No mock of the bar itself is needed or
 * possible: `SelectionToolbar` no longer exposes an `onDelete`/`deleting`
 * prop contract to stub — it only knows how to portal + render children.
 */

// --- MOCKS BEFORE IMPORTS ---

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/sales-order/123', search: '' }),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('../ProcessParamDialog.jsx', () => ({
  ProcessParamDialog: () => null,
}));

const mockHook = {
  loading: false,
  items: [],
  selected: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
  editing: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
  children: [
    { id: 'L1', product: 'P1', 'product$_identifier': 'Widget', lineNetAmount: 100 },
  ],
  isDirtyHeader: false,
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
  handleAddChild: vi.fn(),
  fetchById: vi.fn().mockResolvedValue({}),
  fetchChildren: vi.fn(),
  refresh: vi.fn(),
  isSaving: false,
  primeSaved: vi.fn(),
};

// ETP-5758 — a secondary tab ('rates') gets its own hook so its bulk delete can be told apart
// from the primary lines'. Every other detail entity keeps the shared `mockHook`, as before.
const secondaryHandleDeleteChild = vi.fn();
const mockSecondaryHook = {
  ...mockHook,
  children: [{ id: 'R1' }, { id: 'R2' }],
  handleDeleteChild: secondaryHandleDeleteChild,
};

vi.mock('@/hooks/useEntity', () => ({
  useEntity: (_entity, detailEntity) => (detailEntity === 'rates' ? mockSecondaryHook : mockHook),
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useCatalogs: () => ({ catalogs: {}, loading: false }),
}));

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set() }),
}));

vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({
    calloutResult: null,
    calloutLoading: false,
    executeCallout: vi.fn(),
  }),
}));

vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, calculate: vi.fn() }),
  ORDER_LINE_CONFIG: {
    qtyField: 'orderedQuantity',
    priceField: 'unitPrice',
    totalField: 'lineNetAmount',
  },
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: vi.fn().mockResolvedValue({}), loading: false }),
}));

vi.mock('@/hooks/useNeoAction', () => ({
  useNeoAction: () => ({ execute: vi.fn().mockResolvedValue({ success: true }), loading: false }),
}));

vi.mock('@/i18n', () => ({
  useMenuLabel: () => (k) => k,
  useUI: () => (k, params) => (params ? `${k}:${JSON.stringify(params)}` : k),
  useLabel: () => () => '',
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: () => vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }),
}));

vi.mock('@/components/CurrentWindowContext', () => ({
  useRegisterWindowContext: () => {},
}));

vi.mock('@/components/copilot/ocr/ocrDocTypes', () => ({
  matchOcrDocType: () => null,
}));

vi.mock('@/lib/selectorContext.js', () => ({
  buildHeaderSelectorContext: () => ({}),
  buildLineSelectorContext: () => ({}),
}));

vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));

vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (v) => (v != null ? String(v) : '—'),
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, f) => data?.[f] || data?._identifier || '',
}));

vi.mock('@/lib/documentTotals', () => ({ resolveTotalDiscountPct: () => 0 }));

// ETP-5758 — DetailView's `extractErrorMessage` is `translateBackendErrorResponse`; this stand-in
// mirrors the real one's contract (body `message`, else `Error <status>`) so a one-row refusal's
// reason can travel to the toast.
vi.mock('@/lib/backendErrors.js', () => ({
  translateBackendError: (m) => m,
  translateBackendErrorResponse: async (res) => {
    try {
      const body = await res.json();
      if (body?.message) return body.message;
    } catch { /* no JSON body */ }
    return `Error ${res.status}`;
  },
}));

vi.mock('@/utils/recordActions.js', () => ({
  isDeleteVisibleForRecord: () => true,
}));

vi.mock('@/lib/utils.js', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
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

// ETP-5758 — `DialogClose` forwards a click to the root's `onOpenChange(false)`, as Radix's does,
// so the shared bulk dialog's Cancel (a `DialogClose asChild`) behaves as in the app.
vi.mock('@/components/ui/dialog.jsx', async () => {
  const React = await vi.importActual('react');
  const CloseCtx = React.createContext(() => {});
  return {
    Dialog: ({ children, open, onOpenChange }) =>
      open ? (
        <CloseCtx.Provider value={() => onOpenChange?.(false)}>
          <div data-testid="dialog">{children}</div>
        </CloseCtx.Provider>
      ) : null,
    DialogContent: ({ children }) => <div>{children}</div>,
    DialogHeader: ({ children }) => <div>{children}</div>,
    DialogTitle: ({ children }) => <h2>{children}</h2>,
    DialogDescription: ({ children }) => <p>{children}</p>,
    DialogFooter: ({ children }) => <div>{children}</div>,
    DialogClose: ({ children }) => {
      const close = React.useContext(CloseCtx);
      return React.cloneElement(children, {
        onClick: (e) => { children.props.onClick?.(e); if (!e.defaultPrevented) close(); },
      });
    },
  };
});

vi.mock('../DocumentPrintDrawer.jsx', () => ({
  default: () => null,
  printDocuments: vi.fn(),
}));

vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../BalanceFooterPanel.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({
  default: ({ status }) => <span>{status}</span>,
}));

vi.mock('@/components/attachments/AttachmentIcon', () => ({
  AttachmentIcon: () => null,
}));

// --- IMPORTS ---

import { render, screen, waitFor, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { DetailView } from '../DetailView.jsx';

// ---------------------------------------------------------------------------
// Test harness helpers
// ---------------------------------------------------------------------------

const DEFAULT_SELECTION = [{ id: 'ok' }, { id: 'httpfail' }, { id: 'rejected' }];
// ETP-5758 — overridable per test (reset in beforeEach) so a ONE-row selection can be exercised.
let mockSelection = DEFAULT_SELECTION;

const MockTable = ({ onSelectionChange, onDeleteRow }) => (
  <div data-testid="mock-table">
    <button
      data-testid="trigger-selection"
      onClick={() => onSelectionChange(mockSelection)}
    >
      Select Rows
    </button>
    {onDeleteRow && (
      <button data-testid="trigger-row-delete" onClick={() => onDeleteRow({ id: 'L1' })}>
        Delete one row
      </button>
    )}
  </div>
);

const MockForm = ({ data }) => (
  <div data-testid="mock-form">
    <span>{data?.documentNo}</span>
  </div>
);

const BASE_PROPS = {
  entity: 'header',
  detailEntity: 'lines',
  Form: MockForm,
  DetailTable: MockTable,
  DetailForm: null,
  summary: [],
  statusField: 'documentStatus',
  processes: [],
  // canShowAddLineArea() (gates the wrapper LinesSelectionBar lives in for the
  // inlineEditable variant) requires at least one entry field.
  addLineFields: { entry: [{ key: 'qty', column: 'Quantity', type: 'number', label: 'Qty' }], derived: [] },
  api: {},
  entityLabel: 'Sales Order',
  detailLabel: 'Lines',
  titleField: 'documentNo',
  windowName: 'sales-order',
  recordId: '123',
  token: 'test-token',
  apiBaseUrl: '/api/sales-order',
  breadcrumb: 'Sales / Orders',
  // linesLayout now defaults to 'inlineEditable' (ETP-4763) — pin 'classic'
  // as the base so variant 1 (non-inlineEditable toolbar button) keeps
  // testing that layout; variant 2 overrides it back to 'inlineEditable'.
  linesLayout: 'classic',
};

function renderDetailView(props = {}) {
  return render(
    <MemoryRouter>
      <DetailView {...BASE_PROPS} {...props} />
    </MemoryRouter>,
  );
}

// Mixed-batch fetch: 'ok' succeeds, 'httpfail' resolves non-ok, 'rejected'
// throws — same three-way mix as DetailView.secondaryLineHandlers.vitest.js's
// "mixed batch (one ok, one http-fail, one rejected)" test.
function mockMixedFetch() {
  globalThis.fetch = vi.fn((url) => {
    if (String(url).endsWith('/ok')) return Promise.resolve({ ok: true });
    if (String(url).endsWith('/httpfail')) return Promise.resolve({ ok: false, status: 400 });
    return Promise.reject(new Error('net'));
  });
}

async function confirmDeleteDialog(user) {
  const dialog = await screen.findByTestId('dialog');
  await user.click(within(dialog).getByText('delete'));
}

// The header's own record-delete action ("action-delete") also carries
// title={ui('delete')}, so a plain screen.getByTitle('delete') is ambiguous
// once SelectionToolbar's inline delete segment mounts. Disambiguate by
// scoping to `.selection-toolbar` — the class SelectionToolbar itself sets
// on its pill (see SelectionToolbar.jsx). SelectionToolbar does forward a
// `data-testid` prop (fixed in ETP-4972), but each caller in this file sets
// its own literal testid on the pill, not on this specific delete button, so
// the class scope remains the simplest disambiguator here.
function getSelectionToolbarDeleteButton() {
  const button = screen.getAllByTitle('delete').find((el) => el.closest('.selection-toolbar'));
  if (!button) throw new Error('SelectionToolbar delete button not found');
  return button;
}

describe('DetailView — primary lines bulk delete (ETP-4656)', () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
    toast.warning.mockClear();
    mockHook.handleDeleteChild.mockClear();
    mockSelection = DEFAULT_SELECTION;
  });

  describe('variant 1 — non-inlineEditable toolbar button (detail-bulk-action-bar)', () => {
    it('mixed batch: removes only the succeeded row from cache and fires ONE combined warning toast', async () => {
      mockMixedFetch();
      const user = userEvent.setup();
      renderDetailView();

      await user.click(screen.getByTestId('trigger-selection'));
      await user.click(screen.getByTestId('detail-bulk-delete-button'));
      await confirmDeleteDialog(user);

      await waitFor(() => expect(toast.warning).toHaveBeenCalled());

      expect(mockHook.handleDeleteChild).toHaveBeenCalledTimes(1);
      expect(mockHook.handleDeleteChild).toHaveBeenCalledWith('ok');
      expect(mockHook.handleDeleteChild).not.toHaveBeenCalledWith('httpfail');
      expect(mockHook.handleDeleteChild).not.toHaveBeenCalledWith('rejected');

      // 1 succeeded, 3 total, 2 failed — single combined warning toast, no
      // stacked success+error pair.
      expect(toast.warning).toHaveBeenCalledWith(
        'bulkDeletePartialFailure:{"succeeded":1,"total":3,"failed":2}',
      );
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('all succeed: single success toast, no warning/error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      renderDetailView();

      await user.click(screen.getByTestId('trigger-selection'));
      await user.click(screen.getByTestId('detail-bulk-delete-button'));
      await confirmDeleteDialog(user);

      await waitFor(() => expect(toast.success).toHaveBeenCalled());

      expect(mockHook.handleDeleteChild).toHaveBeenCalledTimes(3);
      expect(toast.success).toHaveBeenCalledWith('bulkDeleteAllSucceeded:{"count":3}');
      expect(toast.warning).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('all fail: single error toast, no success/warning, no cache removal', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      const user = userEvent.setup();
      renderDetailView();

      await user.click(screen.getByTestId('trigger-selection'));
      await user.click(screen.getByTestId('detail-bulk-delete-button'));
      await confirmDeleteDialog(user);

      await waitFor(() => expect(toast.error).toHaveBeenCalled());

      expect(mockHook.handleDeleteChild).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('bulkDeleteAllFailed:{"count":3}');
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
    });
  });

  describe('variant 2 — SelectionToolbar inline delete (linesLayout="inlineEditable")', () => {
    it('mixed batch: removes only the succeeded row from cache and fires ONE combined warning toast', async () => {
      mockMixedFetch();
      const user = userEvent.setup();
      renderDetailView({ linesLayout: 'inlineEditable' });

      await user.click(screen.getByTestId('trigger-selection'));
      // SelectionToolbar is portaled to document.body — `screen` still finds
      // it (RTL queries the whole document, not just the render container).
      // Its delete segment is identified by title={ui('delete')}, matching
      // every other migrated call site (AmortizationLinesTable, etc.).
      await waitFor(() => expect(getSelectionToolbarDeleteButton()).toBeInTheDocument());
      await user.click(getSelectionToolbarDeleteButton());
      await confirmDeleteDialog(user);

      await waitFor(() => expect(toast.warning).toHaveBeenCalled());

      expect(mockHook.handleDeleteChild).toHaveBeenCalledTimes(1);
      expect(mockHook.handleDeleteChild).toHaveBeenCalledWith('ok');

      expect(toast.warning).toHaveBeenCalledWith(
        'bulkDeletePartialFailure:{"succeeded":1,"total":3,"failed":2}',
      );
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('all succeed: single success toast, no warning/error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
      const user = userEvent.setup();
      renderDetailView({ linesLayout: 'inlineEditable' });

      await user.click(screen.getByTestId('trigger-selection'));
      await waitFor(() => expect(getSelectionToolbarDeleteButton()).toBeInTheDocument());
      await user.click(getSelectionToolbarDeleteButton());
      await confirmDeleteDialog(user);

      await waitFor(() => expect(toast.success).toHaveBeenCalled());

      expect(mockHook.handleDeleteChild).toHaveBeenCalledTimes(3);
      expect(toast.success).toHaveBeenCalledWith('bulkDeleteAllSucceeded:{"count":3}');
      expect(toast.warning).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// ETP-5758 — every lines grid of the document (primary classic, primary inlineEditable, each
// secondary tab) now deletes through ONE `useBatchDeleteDialog` instance scoped `lines-bulk-delete`:
// bulk wording, a dialog that stays open and locked while the DELETEs run, and a one-row 4xx
// refusal that toasts the backend's own reason. A single-row delete still goes through the
// separate `confirmDelete` prompt.
// ===========================================================================

/** fetch whose DELETEs stay pending until `release()` resolves them all with `{ ok: true }`. */
function mockPendingFetch() {
  const pending = [];
  globalThis.fetch = vi.fn(() => new Promise((resolve) => { pending.push(resolve); }));
  return { release: () => pending.forEach((r) => r({ ok: true })) };
}

function mockRefusalFetch(message, status = 409) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ message }),
  });
}

const deleteCalls = () => (globalThis.fetch?.mock?.calls ?? []).filter(([, init]) => init?.method === 'DELETE');

/** Opens the bulk dialog for the given grid variant (selection + trash), without confirming. */
async function openBulkDialog(user, variant) {
  if (variant === 'classic') {
    await user.click(screen.getByTestId('trigger-selection'));
    await user.click(screen.getByTestId('detail-bulk-delete-button'));
  } else {
    await user.click(screen.getByTestId('trigger-selection'));
    await waitFor(() => expect(getSelectionToolbarDeleteButton()).toBeInTheDocument());
    await user.click(getSelectionToolbarDeleteButton());
  }
  return screen.findByTestId('lines-bulk-delete-confirm');
}

describe.each([
  ['classic', 'classic', () => screen.getByTestId('detail-bulk-delete-button')],
  ['inlineEditable', 'inlineEditable', () => getSelectionToolbarDeleteButton()],
])('DetailView — primary lines bulk delete through the shared dialog (ETP-5758, %s)', (_label, linesLayout, getTrigger) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelection = DEFAULT_SELECTION;
  });

  it('opens the bulk wording (bulkDeleteConfirm*) with the lines-bulk-delete testids, and sends nothing yet', async () => {
    globalThis.fetch = vi.fn();
    const user = userEvent.setup();
    renderDetailView({ linesLayout });

    await openBulkDialog(user, linesLayout);

    const dialog = screen.getByTestId('dialog');
    expect(within(dialog).getByText('bulkDeleteConfirmTitle')).toBeInTheDocument();
    expect(within(dialog).getByText('bulkDeleteConfirmMessage:{"count":3}')).toBeInTheDocument();
    expect(within(dialog).queryByText('deleteConfirmTitle')).not.toBeInTheDocument();
    expect(within(dialog).getByTestId('lines-bulk-delete-confirm')).toBeInTheDocument();
    expect(within(dialog).getByTestId('Button__lines-bulk-delete-cancel')).toBeInTheDocument();
    expect(deleteCalls()).toHaveLength(0);
  });

  it('Cancel closes the dialog without sending any DELETE', async () => {
    globalThis.fetch = vi.fn();
    const user = userEvent.setup();
    renderDetailView({ linesLayout });

    await openBulkDialog(user, linesLayout);
    await user.click(screen.getByTestId('Button__lines-bulk-delete-cancel'));

    expect(screen.queryByTestId('lines-bulk-delete-confirm')).not.toBeInTheDocument();
    expect(deleteCalls()).toHaveLength(0);
    expect(mockHook.handleDeleteChild).not.toHaveBeenCalled();
  });

  it('stays open and locked (spinner, in-progress wording, disabled buttons and trigger) until every DELETE settles', async () => {
    const { release } = mockPendingFetch();
    const user = userEvent.setup();
    renderDetailView({ linesLayout });

    await openBulkDialog(user, linesLayout);
    await user.click(screen.getByTestId('lines-bulk-delete-confirm'));

    await waitFor(() => expect(deleteCalls()).toHaveLength(3));
    const dialog = screen.getByTestId('dialog');
    expect(within(dialog).getByTestId('lines-bulk-delete-spinner')).toBeInTheDocument();
    expect(within(dialog).getByTestId('lines-bulk-delete-confirm')).toHaveTextContent('bulkDeleteInProgress');
    expect(within(dialog).getByTestId('lines-bulk-delete-confirm')).toBeDisabled();
    expect(within(dialog).getByTestId('Button__lines-bulk-delete-cancel')).toBeDisabled();
    expect(within(dialog).getByText('bulkDeleteInProgressMessage:{"count":3}')).toBeInTheDocument();
    expect(getTrigger()).toBeDisabled();
    // Nothing reported before the batch settles.
    expect(mockHook.handleDeleteChild).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();

    // Cancel is a no-op while locked.
    await user.click(within(dialog).getByTestId('Button__lines-bulk-delete-cancel'));
    expect(screen.getByTestId('lines-bulk-delete-confirm')).toBeInTheDocument();

    await act(async () => { release(); });

    await waitFor(() => expect(screen.queryByTestId('lines-bulk-delete-confirm')).not.toBeInTheDocument());
    expect(toast.success).toHaveBeenCalledWith('bulkDeleteAllSucceeded:{"count":3}');
    expect(mockHook.handleDeleteChild).toHaveBeenCalledTimes(3);
  });

  it('a ONE-row 4xx refusal toasts the backend reason, not the counter, and keeps the line', async () => {
    mockSelection = [{ id: 'L1' }];
    mockRefusalFetch('This line is linked to a shipment and cannot be deleted.');
    const user = userEvent.setup();
    renderDetailView({ linesLayout });

    await openBulkDialog(user, linesLayout);
    expect(screen.getByText('bulkDeleteConfirmMessage:{"count":1}')).toBeInTheDocument();
    await user.click(screen.getByTestId('lines-bulk-delete-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalledWith('This line is linked to a shipment and cannot be deleted.');
    expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('bulkDeleteAllFailed'));
    expect(mockHook.handleDeleteChild).not.toHaveBeenCalled();
    expect(deleteCalls()[0][0]).toContain('/api/sales-order/lines/L1');
    await waitFor(() => expect(screen.queryByTestId('lines-bulk-delete-confirm')).not.toBeInTheDocument());
  });

  it('a 5xx on a one-row selection keeps the counter message (no reason leaked)', async () => {
    mockSelection = [{ id: 'L1' }];
    mockRefusalFetch('NullPointerException at line 42', 500);
    const user = userEvent.setup();
    renderDetailView({ linesLayout });

    await openBulkDialog(user, linesLayout);
    await user.click(screen.getByTestId('lines-bulk-delete-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('bulkDeleteAllFailed:{"count":1}'));
  });

  it('uses api.crud.<detailEntity>.detailUrl for the per-row DELETE when configured', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderDetailView({ linesLayout, api: { crud: { lines: { detailUrl: '/custom/order-lines/{id}' } } } });

    await openBulkDialog(user, linesLayout);
    await user.click(screen.getByTestId('lines-bulk-delete-confirm'));

    await waitFor(() => expect(deleteCalls()).toHaveLength(3));
    expect(deleteCalls().map(([url]) => String(url))).toEqual(expect.arrayContaining([
      expect.stringContaining('/custom/order-lines/ok'),
      expect.stringContaining('/custom/order-lines/httpfail'),
      expect.stringContaining('/custom/order-lines/rejected'),
    ]));
  });
});

describe('DetailView — single-line delete still uses confirmDelete (ETP-5758)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelection = DEFAULT_SELECTION;
  });

  it.each(['classic', 'inlineEditable'])('%s: the row trash opens the single-record prompt, not the bulk dialog', async (linesLayout) => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    renderDetailView({ linesLayout });

    await user.click(screen.getByTestId('trigger-row-delete'));

    const dialog = await screen.findByTestId('dialog');
    expect(within(dialog).getByText('deleteConfirmTitle')).toBeInTheDocument();
    expect(within(dialog).queryByText(/bulkDeleteConfirm/)).not.toBeInTheDocument();
    expect(within(dialog).queryByTestId('lines-bulk-delete-confirm')).not.toBeInTheDocument();

    await user.click(within(dialog).getByText('delete'));

    await waitFor(() => expect(mockHook.handleDeleteChild).toHaveBeenCalledWith('L1'));
    expect(deleteCalls()).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledWith('recordDeleted');
  });
});

describe('DetailView — secondary tab bulk delete through the shared dialog (ETP-5758)', () => {
  const SecondaryTable = ({ onSelectionChange }) => (
    <div data-testid="secondary-table">
      <button data-testid="trigger-secondary-selection" onClick={() => onSelectionChange?.(mockSecondarySelection)}>
        Select secondary rows
      </button>
    </div>
  );
  let mockSecondarySelection = [{ id: 'R1' }, { id: 'R2' }];

  const SECONDARY_TABS = [{
    key: 'rates',
    label: 'Rates',
    Table: SecondaryTable,
    addLineFields: { entry: [{ key: 'rate', column: 'Rate', type: 'number', label: 'Rate' }], derived: [] },
  }];

  async function openSecondaryBulkDialog(user) {
    await user.click(screen.getByTestId('tab-rates'));
    await user.click(await screen.findByTestId('trigger-secondary-selection'));
    await waitFor(() => expect(getSelectionToolbarDeleteButton()).toBeInTheDocument());
    await user.click(getSelectionToolbarDeleteButton());
    return screen.findByTestId('lines-bulk-delete-confirm');
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelection = DEFAULT_SELECTION;
    mockSecondarySelection = [{ id: 'R1' }, { id: 'R2' }];
  });

  it('opens the same bulk dialog (wording + lines-bulk-delete testids) and sends nothing until confirmed', async () => {
    globalThis.fetch = vi.fn();
    const user = userEvent.setup();
    renderDetailView({ linesLayout: 'inlineEditable', secondaryTabs: SECONDARY_TABS });

    await openSecondaryBulkDialog(user);

    const dialog = screen.getByTestId('dialog');
    expect(within(dialog).getByText('bulkDeleteConfirmTitle')).toBeInTheDocument();
    expect(within(dialog).getByText('bulkDeleteConfirmMessage:{"count":2}')).toBeInTheDocument();
    expect(within(dialog).getByTestId('Button__lines-bulk-delete-cancel')).toBeInTheDocument();
    expect(deleteCalls()).toHaveLength(0);
  });

  it('stays open and locked while the tab\'s DELETEs run, then removes them from THAT tab\'s cache', async () => {
    const { release } = mockPendingFetch();
    const user = userEvent.setup();
    renderDetailView({ linesLayout: 'inlineEditable', secondaryTabs: SECONDARY_TABS });

    await openSecondaryBulkDialog(user);
    await user.click(screen.getByTestId('lines-bulk-delete-confirm'));

    await waitFor(() => expect(deleteCalls()).toHaveLength(2));
    expect(deleteCalls().map(([url]) => String(url))).toEqual([
      expect.stringContaining('/api/sales-order/rates/R1'),
      expect.stringContaining('/api/sales-order/rates/R2'),
    ]);
    expect(screen.getByTestId('lines-bulk-delete-spinner')).toBeInTheDocument();
    expect(screen.getByTestId('lines-bulk-delete-confirm')).toBeDisabled();
    expect(screen.getByText('bulkDeleteInProgressMessage:{"count":2}')).toBeInTheDocument();
    // The tab's own trash is disabled while its batch runs.
    expect(getSelectionToolbarDeleteButton()).toBeDisabled();
    expect(secondaryHandleDeleteChild).not.toHaveBeenCalled();

    await act(async () => { release(); });

    await waitFor(() => expect(screen.queryByTestId('lines-bulk-delete-confirm')).not.toBeInTheDocument());
    expect(secondaryHandleDeleteChild).toHaveBeenCalledWith('R1');
    expect(secondaryHandleDeleteChild).toHaveBeenCalledWith('R2');
    expect(mockHook.handleDeleteChild).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('bulkDeleteAllSucceeded:{"count":2}');
  });

  it('a ONE-row 4xx refusal on the tab toasts the backend reason', async () => {
    mockSecondarySelection = [{ id: 'R1' }];
    mockRefusalFetch('This rate is used by a posted invoice.');
    const user = userEvent.setup();
    renderDetailView({ linesLayout: 'inlineEditable', secondaryTabs: SECONDARY_TABS });

    await openSecondaryBulkDialog(user);
    await user.click(screen.getByTestId('lines-bulk-delete-confirm'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('This rate is used by a posted invoice.'));
    expect(secondaryHandleDeleteChild).not.toHaveBeenCalled();
  });
});

