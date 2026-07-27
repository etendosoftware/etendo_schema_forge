/**
 * ETP-4542 (Block 2, Bug 6): header process button loading state.
 *
 * Opt-in per window via `showProcessLoadingState`. While the header process a user
 * clicked is running (`hook.runningProcess === (p.columnName ?? p.name)`), the button
 * shows a spinner + the "generating" label and is disabled to block duplicate runs.
 * Windows that don't pass the flag keep the current behavior (normal label, enabled).
 *
 * Covers:
 *  (1) flag on + process running  → disabled + "generating" + spinner
 *  (2) process finished (running cleared, success OR error path) → normal label, enabled
 *  (3) flag off → never shows the loading state even while running
 *  (4) double-click blocked → the running button is disabled so onClick can't refire
 *  (5) per-button granularity → a different running process leaves this button normal
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/assets/123', search: '' }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const baseRecord = { id: '123', documentNo: 'A-001', documentStatus: 'DR', processed: false };

const mockHook = {
  loading: false,
  items: [],
  selected: { ...baseRecord },
  editing: { ...baseRecord },
  children: [{ id: 'L1', product: 'P1' }],
  childDefaults: {},
  isDirtyHeader: false,
  childrenLoading: false,
  error: null,
  handleChange: vi.fn(),
  handleSave: vi.fn().mockResolvedValue({}),
  handleDelete: vi.fn().mockResolvedValue({}),
  handleAddChild: vi.fn().mockResolvedValue({ id: 'L2' }),
  handleDeleteChild: vi.fn(),
  handleSelect: vi.fn(),
  handleUpdateChild: vi.fn(),
  handleProcess: vi.fn(),
  handleSaveAndProcess: vi.fn().mockResolvedValue({}),
  fetchById: vi.fn().mockResolvedValue({}),
  fetchChildren: vi.fn(),
  isSaving: false,
  runningProcess: null,
  primeSaved: vi.fn(),
};

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => mockHook,
  extractErrorMessage: async () => 'Error',
}));
vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({ catalogs: {}, loading: false, catalogsLoaded: true }) }));
vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set(), visibility: {}, readOnly: {} }),
}));
vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }),
}));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ computeLineGrossAmount: vi.fn(), resolveTaxFactor: () => 1, prepareLineForPost: (l) => l }),
  ORDER_LINE_CONFIG: { qtyField: 'orderedQuantity', priceField: 'unitPrice', totalField: 'lineNetAmount' },
}));
vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({ executeAction: vi.fn(), loading: false }) }));
vi.mock('@/hooks/useNeoAction', () => ({ useNeoAction: () => ({ execute: vi.fn(), loading: false }) }));
vi.mock('@/i18n', () => ({ useMenuLabel: () => (k) => k, useUI: () => (k) => k, useLabel: () => () => '' }));
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
vi.mock('../ProcessParamDialog', () => ({
  ProcessParamDialog: ({ open, process }) => (open ? <div data-testid="param-dialog">{process?.label}</div> : null),
}));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../BalanceFooterPanel.jsx', () => ({ default: () => null }));
vi.mock('../LinesSelectionBar.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: ({ label, status }) => <span data-testid="status-pill">{label ?? status}</span> }));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>A</span> }));

const MockDetailTable = () => <div data-testid="mock-detail-table" />;
const MockForm = ({ data }) => <div data-testid="mock-form">{data?.documentNo}</div>;

// "Create Amortization" mirrors the real Assets header process: columnName is the
// action id sent to the backend and the id the running-process match keys on.
const amortizationProcess = {
  name: 'createAmortization',
  columnName: 'CreateAmortization',
  label: 'Create Amortization',
  style: 'positive',
};

function renderView(props = {}) {
  return render(
    <MemoryRouter>
      <DetailView
        entity="header"
        detailEntity="lines"
        Form={MockForm}
        DetailTable={MockDetailTable}
        DetailForm={null}
        summary={[]}
        statusField="documentStatus"
        processes={[amortizationProcess]}
        addLineFields={{ entry: [], derived: [] }}
        api={{}}
        entityLabel="Asset"
        detailLabel="Lines"
        titleField="documentNo"
        windowName="assets"
        recordId="123"
        token="test-token"
        apiBaseUrl="/api/assets"
        breadcrumb="Finance / Assets"
        {...props}
      />
    </MemoryRouter>,
  );
}

function processButton() {
  // Header process button: locate it via its (only) label, whatever the current label is.
  const label = screen.queryByText('Create Amortization') || screen.getByText('generating');
  return label.closest('button');
}

afterEach(() => {
  vi.clearAllMocks();
  mockHook.runningProcess = null;
});

describe('DetailView header process loading state (ETP-4542)', () => {
  it('(1) shows spinner + "generating" and disables the button while its process runs (flag on)', () => {
    mockHook.runningProcess = 'CreateAmortization';
    renderView({ showProcessLoadingState: true });
    expect(screen.getByText('generating')).toBeInTheDocument();
    expect(screen.queryByText('Create Amortization')).toBeNull();
    expect(screen.getByTestId('Loader2__process-running')).toBeInTheDocument();
    expect(processButton()).toBeDisabled();
  });

  it('(2) restores the normal label and enables the button once the process finishes (success or error)', () => {
    // handleProcess clears runningProcess in a finally, so both the success and the
    // error paths land on runningProcess === null — the button returns to normal.
    mockHook.runningProcess = null;
    renderView({ showProcessLoadingState: true });
    expect(screen.getByText('Create Amortization')).toBeInTheDocument();
    expect(screen.queryByText('generating')).toBeNull();
    expect(screen.queryByTestId('Loader2__process-running')).toBeNull();
    expect(processButton()).not.toBeDisabled();
  });

  it('(3) never shows the loading state when the window did not opt in', () => {
    mockHook.runningProcess = 'CreateAmortization';
    renderView({ showProcessLoadingState: false });
    expect(screen.getByText('Create Amortization')).toBeInTheDocument();
    expect(screen.queryByText('generating')).toBeNull();
    expect(screen.queryByTestId('Loader2__process-running')).toBeNull();
    expect(processButton()).not.toBeDisabled();
  });

  it('(4) blocks a double-click: the running button is disabled and cannot re-dispatch', async () => {
    const user = userEvent.setup();
    mockHook.runningProcess = 'CreateAmortization';
    renderView({ showProcessLoadingState: true });
    const btn = processButton();
    expect(btn).toBeDisabled();
    await user.click(btn); // disabled → no-op
    expect(mockHook.handleProcess).not.toHaveBeenCalled();
  });

  it('(5) leaves the button normal when a DIFFERENT process is the one running', () => {
    mockHook.runningProcess = 'SomeOtherProcess';
    renderView({ showProcessLoadingState: true });
    expect(screen.getByText('Create Amortization')).toBeInTheDocument();
    expect(screen.queryByText('generating')).toBeNull();
    expect(processButton()).not.toBeDisabled();
  });
});
