/**
 * Covers the classic-layout right sidebar's line save/delete PATCH/DELETE
 * flow (selected via row click, editing via DetailForm.onChange, then Save/
 * Discard/Delete). This is the `linesLayout='classic'` counterpart to
 * InlineLinesPanel's inline editing — reached via `shouldShowDetailFormSidebar`
 * and `shouldShowLineActionButtons`, neither of which is exercised elsewhere.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
  // Not used by the sidebar save/delete flow under test — it has its own
  // local extractErrorMessage (parseBackendErrorMessage + translateBackendError).
  extractErrorMessage: async () => 'Error',
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

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => 'EUR',
}));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({
    // handleLineFieldChange (fired by the sidebar's batched onChange, via a
    // setTimeout(0)) calls this for CLIENT_SIDE_FIELDS like 'unitPrice' —
    // must be a real function, not the leftover {grossAmount,calculate} shape.
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
  useDocumentAction: () => ({
    executeAction: vi.fn(),
    loading: false,
  }),
}));

vi.mock('@/i18n', () => ({
  useMenuLabel: () => (k) => k,
  useUI: () => (k) => k,
  useLabel: () => () => '',
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: () => vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({
    isFavorite: () => false,
    toggleFavorite: vi.fn(),
  }),
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

vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));

vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (v) => (v != null ? String(v) : '—'),
}));

vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, f) => data?.[f] || data?._identifier || '',
}));

vi.mock('@/lib/documentTotals', () => ({
  resolveTotalDiscountPct: () => 0,
}));

vi.mock('@/lib/backendErrors.js', async (importOriginal) => ({
  ...(await importOriginal()),
  translateBackendError: (m) => m,
}));

vi.mock('@/utils/recordActions.js', () => ({
  isDeleteVisibleForRecord: () => true,
}));

vi.mock('@/lib/utils.js', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

// Real Dialog behavior: only render children while `open`, so the delete
// confirm dialog's Cancel/Delete buttons are queryable by role/name.
vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogContent: ({ children }) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div data-testid="dialog-footer">{children}</div>,
  DialogClose: ({ children }) => children,
}));

vi.mock('../DocumentPrintDrawer.jsx', () => ({
  default: () => null,
  printDocuments: vi.fn(),
}));

vi.mock('../SummaryBar.jsx', () => ({
  SummaryBar: () => null,
}));

vi.mock('../DocumentTotalsPanel.jsx', () => ({
  default: () => null,
}));

vi.mock('../LinesSelectionBar.jsx', () => ({
  default: () => null,
}));

vi.mock('../DocumentStatusPill.jsx', () => ({
  default: ({ status }) => <span data-testid="status-pill">{status}</span>,
}));

vi.mock('@/components/attachments/AttachmentIcon', () => ({
  AttachmentIcon: () => <span>📎</span>,
}));

const MockForm = ({ data }) => (
  <div data-testid="mock-form">
    <span>{data?.documentNo}</span>
  </div>
);

// Real row click handler (buildLineRowClickHandler) is only wired when
// DetailForm is truthy and linesLayout !== 'inlineEditable' (the default,
// 'classic'). This stub exposes onRowClick directly so we don't depend on
// any particular table markup.
const StubDetailTable = ({ data, onRowClick }) => (
  <div data-testid="stub-detail-table">
    {(data || []).map(r => (
      <button key={r.id} type="button" data-testid={`row-${r.id}`} onClick={() => onRowClick?.(r)}>
        {r.id}
      </button>
    ))}
  </div>
);

// Sidebar DetailForm stub — exposes onChange directly to drive lineEdits.
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

async function selectLine(user) {
  await user.click(await screen.findByTestId('row-L1'));
  await screen.findByTestId('stub-detail-form');
}

describe('DetailView line sidebar save/delete flow (classic layout)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHook.handleUpdateChild = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clicking a row opens the sidebar with the selected line', async () => {
    const user = userEvent.setup();
    renderDetailView();
    await selectLine(user);
    expect(screen.getByTestId('stub-detail-form-data').textContent).toContain('L1');
  });

  function getSidebarSaveButton() {
    return screen.getAllByRole('button', { name: 'save' })
      .find(b => b.getAttribute('data-testid') !== 'action-save');
  }

  it('saves the edited line via PATCH then refetches and updates the child', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true }) // PATCH
      .mockResolvedValueOnce({ // GET fresh
        ok: true,
        json: async () => ({ response: { data: [{ id: 'L1', unitPrice: 55, lineNetAmount: 55 }] } }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderDetailView();
    await selectLine(user);
    await user.click(screen.getByTestId('edit-unit-price'));
    await user.click(getSidebarSaveButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    expect(fetchMock.mock.calls[1][1]).toEqual({ headers: { Authorization: 'Bearer test-token', 'Accept-Language': 'es_ES' } });
    await waitFor(() => expect(mockHook.handleUpdateChild).toHaveBeenCalledWith('L1', { id: 'L1', unitPrice: 55, lineNetAmount: 55 }));
  });

  it('falls back to PATCH fieldValues when the refetch GET fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true }) // PATCH
      .mockResolvedValueOnce({ ok: false }); // GET fails
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderDetailView();
    await selectLine(user);
    await user.click(screen.getByTestId('edit-unit-price'));
    await user.click(getSidebarSaveButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockHook.handleUpdateChild).toHaveBeenCalledWith('L1', expect.objectContaining({ unitPrice: 55 })));
  });

  it('shows an error toast when the PATCH fails', async () => {
    // The sidebar's own extractErrorMessage is a local useCallback (parseBackendErrorMessage
    // + translateBackendError), not the @/hooks/useEntity export — a non-JSON error body
    // falls through to the `Error ${res.status}` fallback.
    const { toast } = await import('sonner');
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderDetailView();
    await selectLine(user);
    await user.click(screen.getByTestId('edit-unit-price'));
    await user.click(getSidebarSaveButton());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Error 500'));
    expect(mockHook.handleUpdateChild).not.toHaveBeenCalled();
  });

  it('discard clears lineEdits without any fetch call', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const user = userEvent.setup();
    renderDetailView();
    await selectLine(user);
    await user.click(screen.getByTestId('edit-unit-price'));
    await user.click(screen.getByRole('button', { name: 'discard' }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // The header toolbar has its own "action-delete" button — scope to the
  // sidebar's unlabeled delete button by excluding that testid.
  function getSidebarDeleteButton() {
    return screen.getAllByRole('button', { name: 'delete' })
      .find(b => b.getAttribute('data-testid') !== 'action-delete');
  }

  it('deletes the selected line after confirming, and closes the sidebar', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderDetailView();
    await selectLine(user);
    await user.click(getSidebarDeleteButton());
    // Confirm dialog appears — click its own "delete" button (the last match) to resolve(true).
    const dialogDeleteButtons = await screen.findAllByRole('button', { name: 'delete' });
    await user.click(dialogDeleteButtons[dialogDeleteButtons.length - 1]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('L1'),
      expect.objectContaining({ method: 'DELETE' }),
    ));
    await waitFor(() => expect(mockHook.handleDeleteChild).toHaveBeenCalledWith('L1'));
  });

  it('cancelling the delete confirm dialog does not call DELETE', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderDetailView();
    await selectLine(user);
    await user.click(getSidebarDeleteButton());
    const dialogCancelButtons = await screen.findAllByRole('button', { name: 'cancel' });
    await user.click(dialogCancelButtons[dialogCancelButtons.length - 1]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockHook.handleDeleteChild).not.toHaveBeenCalled();
  });
});
