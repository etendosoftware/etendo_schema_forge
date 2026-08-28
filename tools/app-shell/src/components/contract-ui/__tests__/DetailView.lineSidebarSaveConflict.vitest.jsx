/**
 * ETP-5073 / DOC-04 — the lines sidebar's half of the concurrency P0.
 *
 * The server refuses an update whose `updated` no longer matches the stored row, answering 409
 * with `error: "stale_record"`. Before this ticket that write succeeded and silently erased the
 * other person's change. The header form's handling of that answer is covered by
 * `useEntity.staleRecord.vitest.js`; what is covered HERE is the classic-layout lines sidebar,
 * whose `handleSaveLine` error branch now recognises the same answer and raises the same dialog
 * (`raiseLineSaveConflict`), plus the refresh the dialog offers
 * (`discardLineChangesAndReload`).
 *
 * The happy path of `handleSaveLine` (PATCH, refetch, refetch fallback, generic error toast) is
 * already covered by `DetailView.lineSidebarSaveFlow` / `.lineSidebarSaveDeleteFlow` and is not
 * repeated. Setup below is deliberately the same shape as those files.
 *
 * The save-conflict store and the record-version store are imported FOR REAL — mocking either
 * would assert the mock instead of the wiring these callbacks exist to perform.
 */
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import {
  subscribeSaveConflict, refreshFromSaveConflict, resetSaveConflictForTests,
} from '@/lib/saveConflict.js';
import {
  getRecordVersion, rememberRecordVersion, resetRecordVersionsForTests,
} from '@etendosoftware/app-shell-core/lib/recordVersions.js';
import { DetailView } from '../DetailView.jsx';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/sales-order/123', search: '', state: {} }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const mockHook = {
  loading: false,
  items: [],
  selected: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
  editing: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
  children: [{ id: 'L1', product: 'P1', 'product$_identifier': 'Widget', unitPrice: 10, lineNetAmount: 100 }],
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
  handleNew: vi.fn(),
  isSaving: false,
  primeSaved: vi.fn(),
};

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => mockHook,
  // The sidebar uses its own local extractErrorMessage (parseBackendErrorMessage +
  // translateBackendError), not this export.
  extractErrorMessage: async () => 'Error',
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useCatalogs: () => ({ catalogs: {}, loading: false }),
}));

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set() }),
}));

vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }),
}));

vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({
    computeLineGrossAmount: (field, value, result) => { result[field] = value; },
    resolveTaxFactor: () => 1,
    deriveLineNet: () => 0,
    prepareLineForPost: (lineData) => lineData,
  }),
  ORDER_LINE_CONFIG: {
    qtyField: 'orderedQuantity',
    priceField: 'unitPrice',
    totalField: 'lineNetAmount',
  },
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ executeAction: vi.fn(), loading: false }),
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

vi.mock('@/lib/selectorContext.js', () => ({
  buildHeaderSelectorContext: () => ({}),
  buildLineSelectorContext: () => ({}),
}));

vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => (v != null ? String(v) : '—') }));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, f) => data?.[f] || data?._identifier || '',
}));

vi.mock('@/lib/documentTotals', () => ({ resolveTotalDiscountPct: () => 0 }));

vi.mock('@/lib/backendErrors.js', async (importOriginal) => ({
  ...(await importOriginal()),
  translateBackendError: (m) => m,
}));

vi.mock('@/utils/recordActions.js', () => ({ isDeleteVisibleForRecord: () => true }));
vi.mock('@/lib/utils.js', () => ({ cn: (...args) => args.filter(Boolean).join(' ') }));

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div data-testid="dialog-footer">{children}</div>,
  DialogClose: ({ children }) => children,
}));

vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../LinesSelectionBar.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: ({ status }) => <span>{status}</span> }));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>A</span> }));

const MockForm = ({ data }) => <div data-testid="mock-form">{data?.documentNo}</div>;

const StubDetailTable = ({ data, onRowClick }) => (
  <div data-testid="stub-detail-table">
    {(data || []).map(r => (
      <button key={r.id} type="button" data-testid={`row-${r.id}`} onClick={() => onRowClick?.(r)}>
        {r.id}
      </button>
    ))}
  </div>
);

const StubDetailForm = ({ data, onChange }) => (
  <div data-testid="stub-detail-form">
    <span data-testid="stub-detail-form-data">{JSON.stringify(data)}</span>
    <button type="button" data-testid="edit-unit-price" onClick={() => onChange('unitPrice', 55, 'M_Unit_Price')}>
      Edit unit price
    </button>
  </div>
);

function renderDetailView(props = {}) {
  return render(
    <MemoryRouter>
      <DetailView
        entity="header"
        detailEntity="lines"
        Form={MockForm}
        DetailTable={StubDetailTable}
        DetailForm={StubDetailForm}
        summary={[]}
        statusField="documentStatus"
        processes={[]}
        addLineFields={{ entry: [{ key: 'product', label: 'Product', type: 'selector', column: 'M_Product_ID' }], derived: [] }}
        api={{}}
        entityLabel="Sales Order"
        detailLabel="Lines"
        titleField="documentNo"
        windowName="sales-order"
        recordId="123"
        token="test-token"
        apiBaseUrl="/api/sales-order"
        breadcrumb="Sales / Orders"
        linesLayout="classic"
        {...props}
      />
    </MemoryRouter>,
  );
}

/**
 * A stand-in for a `Response`. `clone()` is what `raiseLineSaveConflict` reads, deliberately
 * separate from `json()` so the caller's own `extractErrorMessage` can still consume the body.
 */
function jsonResponse(body, { ok = false, status = 409 } = {}) {
  return {
    ok,
    status,
    clone: () => ({ json: async () => body }),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** A response whose body is not JSON — both the conflict probe and the error parser give up. */
function nonJsonResponse(status = 500) {
  const boom = async () => { throw new SyntaxError('Unexpected token < in JSON'); };
  return { ok: false, status, clone: () => ({ json: boom }), json: boom, text: async () => '<html/>' };
}

const FRESH_LINE = { id: 'L1', unitPrice: 10, lineNetAmount: 100, updated: '2026-08-28T09:30:00Z' };

function freshLineResponse(line = FRESH_LINE) {
  return { ok: true, status: 200, json: async () => ({ response: { data: [line] } }) };
}

/** Subscribes a stand-in for SaveConflictDialog and reports every open/close it was asked for. */
function mountConflictHost() {
  const opened = [];
  subscribeSaveConflict((next) => opened.push(next));
  return opened;
}

function getSidebarSaveButton() {
  return screen.getAllByRole('button', { name: 'save' })
    .find(b => b.getAttribute('data-testid') !== 'action-save');
}

async function selectLineAndEdit(user) {
  await user.click(await screen.findByTestId('row-L1'));
  await screen.findByTestId('stub-detail-form');
  await user.click(screen.getByTestId('edit-unit-price'));
}

describe('DetailView line sidebar — save conflict (ETP-5073)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook.handleUpdateChild = vi.fn();
    resetSaveConflictForTests();
    resetRecordVersionsForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('raiseLineSaveConflict', () => {
    it('raises the shared conflict dialog when the server reports a stale record', async () => {
      const { toast } = await import('sonner');
      const opened = mountConflictHost();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
        jsonResponse({ status: 409, error: 'stale_record', message: 'OBJSON_StaleDate' }),
      ));

      const user = userEvent.setup();
      renderDetailView();
      await selectLineAndEdit(user);
      await user.click(getSidebarSaveButton());

      await waitFor(() => expect(opened).toEqual([true]));
      // The whole point of the branch: this outcome must NOT be reported as a generic backend
      // error, which is how it first surfaced (the bare string `OBJSON_StaleDate`).
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('does not raise the dialog for a 409 that is not a stale record', async () => {
      // A duplicate key is also answered with 409, and its remedy is the opposite of this
      // dialog's: change your data, not your baseline. Keying off the status alone would offer
      // the user a refresh that cannot possibly help.
      const { toast } = await import('sonner');
      const opened = mountConflictHost();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
        jsonResponse({ status: 409, error: 'conflict', message: 'Duplicate record' }),
      ));

      const user = userEvent.setup();
      renderDetailView();
      await selectLineAndEdit(user);
      await user.click(getSidebarSaveButton());

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Duplicate record'));
      expect(opened).toEqual([]);
    });

    it('falls back to the normal error toast when the error body is not JSON', async () => {
      const { toast } = await import('sonner');
      const opened = mountConflictHost();
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(nonJsonResponse(500)));

      const user = userEvent.setup();
      renderDetailView();
      await selectLineAndEdit(user);
      await user.click(getSidebarSaveButton());

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Error 500'));
      expect(opened).toEqual([]);
    });

    it('falls back to the error toast when no dialog host is mounted', async () => {
      // No host subscribed: openSaveConflict returns false and the caller must still tell the
      // user the save was refused. Silence is the one outcome this ticket removes.
      const { toast } = await import('sonner');
      vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
        jsonResponse({ error: 'stale_record', message: 'OBJSON_StaleDate' }),
      ));

      const user = userEvent.setup();
      renderDetailView();
      await selectLineAndEdit(user);
      await user.click(getSidebarSaveButton());

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('OBJSON_StaleDate'));
    });
  });

  describe('discardLineChangesAndReload', () => {
    /** Drives a save into the conflict dialog, then accepts the refresh it offers. */
    async function conflictThenRefresh(fetchMock) {
      vi.stubGlobal('fetch', fetchMock);
      const opened = mountConflictHost();
      const user = userEvent.setup();
      renderDetailView();
      await selectLineAndEdit(user);
      await user.click(getSidebarSaveButton());
      await waitFor(() => expect(opened).toEqual([true]));
      await act(async () => { refreshFromSaveConflict(); });
      return opened;
    }

    const conflict = () => jsonResponse({ error: 'stale_record', message: 'OBJSON_StaleDate' });

    it('re-reads the line, pushes it to the child list and drops the pending edits', async () => {
      const { toast } = await import('sonner');
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(conflict())
        .mockResolvedValueOnce(freshLineResponse());

      const opened = await conflictThenRefresh(fetchMock);

      await waitFor(() => expect(mockHook.handleUpdateChild).toHaveBeenCalledWith('L1', FRESH_LINE));
      expect(fetchMock.mock.calls[1][1].method).toBeUndefined();
      // The edited value is gone from the form: not a merge, deliberately — a merge would
      // overwrite the other person's value on any field both had edited.
      await waitFor(() => {
        expect(screen.getByTestId('stub-detail-form-data').textContent).not.toContain('55');
      });
      // Save/discard only render while `lineEdits` is set, so their absence is the observable
      // proof that the pending edits were cleared.
      expect(screen.queryByRole('button', { name: 'discard' })).toBeNull();
      expect(toast.info).toHaveBeenCalledWith('saveConflictReloaded');
      // The dialog is closed on the way out. Note it is asked to close TWICE — once by
      // refreshFromSaveConflict and again by the callback's own dismissSaveConflict — so the
      // assertion is on the end state, not on the call count.
      expect(opened[0]).toBe(true);
      expect(opened.at(-1)).toBe(false);
    });

    it('records the optimistic-locking token of the record it just re-read', async () => {
      // The subtle one. This read does NOT go through useEntity's normalizeRecord, and apiFetch
      // only harvests versions from writes — so without the explicit rememberRecordVersion call
      // the store would keep serving the very version the server just rejected, and the user's
      // next save would fail identically. A refresh that does not let the user save is not a
      // refresh. Seeded with a stale token so the assertion cannot pass by accident on an
      // initially empty store.
      rememberRecordVersion({ id: 'L1', updated: '2026-08-01T00:00:00Z' });
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(conflict())
        .mockResolvedValueOnce(freshLineResponse());

      await conflictThenRefresh(fetchMock);

      await waitFor(() => expect(getRecordVersion('L1')).toBe(FRESH_LINE.updated));
    });

    it('keeps the pending edits when the re-read fails', async () => {
      // Dropping the user's edits after failing to fetch the replacement would lose data with
      // nothing to show for it.
      const { toast } = await import('sonner');
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(conflict())
        .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

      await conflictThenRefresh(fetchMock);

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('saveConflictReloadFailed'));
      expect(mockHook.handleUpdateChild).not.toHaveBeenCalled();
      expect(screen.getByTestId('stub-detail-form-data').textContent).toContain('55');
      expect(screen.getByRole('button', { name: 'discard' })).toBeTruthy();
      expect(toast.info).not.toHaveBeenCalled();
    });

    it('reports the failure toast when the re-read rejects outright', async () => {
      const { toast } = await import('sonner');
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(conflict())
        .mockRejectedValueOnce(new Error('Network down'));

      await conflictThenRefresh(fetchMock);

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('saveConflictReloadFailed'));
      expect(mockHook.handleUpdateChild).not.toHaveBeenCalled();
    });
  });

  describe('buildSelectedLineUrl', () => {
    it('refreshes exactly the URL it wrote, including the api.crud override', async () => {
      // The save, the post-save refresh and the conflict refresh must resolve to the same URL:
      // a drift here would refresh a different record than the one just written.
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonResponse({ error: 'stale_record' }))
        .mockResolvedValueOnce(freshLineResponse());
      vi.stubGlobal('fetch', fetchMock);
      const opened = mountConflictHost();

      const user = userEvent.setup();
      renderDetailView({ api: { crud: { lines: { detailUrl: '/custom/lines/{id}' } } } });
      await selectLineAndEdit(user);
      await user.click(getSidebarSaveButton());
      await waitFor(() => expect(opened).toEqual([true]));
      await act(async () => { refreshFromSaveConflict(); });

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
      expect(fetchMock.mock.calls[0][0]).toBe('/custom/lines/L1');
      expect(fetchMock.mock.calls[1][0]).toBe('/custom/lines/L1');
    });

    it('offers no sidebar save button while no line is open', async () => {
      // This is what makes handleSaveLine's `if (!selectedLine?.id) return` guard defence rather
      // than an expected path: the button that calls it is not rendered. The guard itself matters
      // because buildSelectedLineUrl uses optional chaining and would otherwise PATCH
      // `.../undefined`.
      vi.stubGlobal('fetch', vi.fn());
      renderDetailView();
      await screen.findByTestId('stub-detail-table');
      expect(screen.queryByTestId('stub-detail-form')).toBeNull();
      expect(getSidebarSaveButton()).toBeUndefined();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });
});
