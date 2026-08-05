/**
 * Behavioral test for the detail-entity process execution flow
 * (executeDetailProcessImpl, DetailView.jsx ~1743-1788) and its ETP-4563 cache
 * refresh: after a batch line-process POST succeeds, the header must be re-fetched
 * with `{ force: true }` so the read cache is bypassed and the recomputed
 * server-side state (statuses/totals) is reflected.
 *
 * The flow is driven end-to-end through the UI: a mock DetailTable fires
 * onRowClick to select a line, which surfaces the per-line process button; the
 * click POSTs to `/action/<columnName>` and, on success, force-refreshes.
 *
 * Harness mirrors DetailView.docActionMenuRefresh.vitest.jsx.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forwardRef } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
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
  refresh: vi.fn(),
  refreshChildren: vi.fn(),
  isSaving: false,
  primeSaved: vi.fn(),
  childDefaults: {},
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
vi.mock('@/lib/lineFieldChange.js', () => ({
  buildCalloutFormState: vi.fn(() => ({})),
  extractAuxValues: vi.fn(() => ({})),
  normalizeCalloutQty: vi.fn(),
  normalizeCalloutResponse: vi.fn(() => ({})),
  applyQtyZeroGuard: vi.fn(),
  roundAmounts: vi.fn((v) => v),
  resolveSnapshotIdentifiers: vi.fn(() => ({})),
}));
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
const MockDetailForm = () => <div data-testid="mock-detail-form">detail</div>;

// forwardRef because DetailView attaches an inline-lines ref to DetailTable.
const MockTable = forwardRef((props, _ref) => (
  <div data-testid="mock-table">
    <button data-testid="tbl-click-row" onClick={() => props.onRowClick?.({ id: 'L1', product: 'P1' })}>row</button>
  </div>
));

function renderDetailView(props = {}) {
  return render(
    <MemoryRouter>
      <DetailView
        entity="header"
        detailEntity="lines"
        Form={MockForm}
        DetailTable={MockTable}
        DetailForm={MockDetailForm}
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

const shipProcess = { name: 'ship', label: 'Ship', columnName: 'Ship', params: [] };

describe('DetailView — detail-entity process execution (ETP-4563 force refresh)', () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
    mockHook.fetchById.mockClear();
    mockHook.refresh.mockClear();
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  });

  it('POSTs to /action/<columnName> for the selected line and force-refreshes on success', async () => {
    const user = userEvent.setup();
    renderDetailView({ detailProcesses: [shipProcess] });

    await user.click(screen.getByTestId('tbl-click-row'));
    mockHook.fetchById.mockClear();
    await user.click(await screen.findByTestId('Button__detail-process'));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sales-order/lines/L1/action/Ship',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    // ETP-4563: bypass the read cache after the process mutates the record.
    await waitFor(() => expect(mockHook.fetchById).toHaveBeenCalledWith('123', { force: true }));
    expect(mockHook.refresh).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it('reports failure and does NOT force-refresh when every row POST fails', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));
    renderDetailView({ detailProcesses: [shipProcess] });

    await user.click(screen.getByTestId('tbl-click-row'));
    mockHook.fetchById.mockClear();
    await user.click(await screen.findByTestId('Button__detail-process'));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('1 record(s) failed'));
    // No successful row → no force refresh.
    expect(mockHook.fetchById).not.toHaveBeenCalledWith('123', { force: true });
  });

  it('surfaces a network error toast when the process POST rejects', async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => { throw new Error('Network down'); });
    renderDetailView({ detailProcesses: [shipProcess] });

    await user.click(screen.getByTestId('tbl-click-row'));
    await user.click(await screen.findByTestId('Button__detail-process'));

    // Promise.allSettled swallows per-row rejections, so a thrown fetch is a
    // "failed" row rather than the outer catch — still surfaced to the user.
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(mockHook.fetchById).not.toHaveBeenCalledWith('123', { force: true });
  });

  it('opens the parameter dialog instead of executing when the process has visible params', async () => {
    const user = userEvent.setup();
    const paramProcess = { name: 'ship', label: 'Ship', columnName: 'Ship', params: [{ key: 'carrier', hidden: false }] };
    renderDetailView({ detailProcesses: [paramProcess] });

    await user.click(screen.getByTestId('tbl-click-row'));
    await user.click(await screen.findByTestId('Button__detail-process'));

    // Visible params short-circuit to the dialog; no POST fires yet.
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
