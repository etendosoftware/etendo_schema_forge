/**
 * Behavioral tests for the `detailProcesses` prop in DetailView (ETP-4248).
 *
 * `detailProcesses` defines process buttons that appear in the toolbar
 * when child rows are selected or a single line is open. Each process either:
 *   - Executes directly (calls fetch) when it has no visible params, OR
 *   - Opens ProcessParamDialog to collect param values first.
 *
 * ProcessParamDialog is mocked here — its own behavior is covered in
 * ProcessParamDialog.vitest.jsx.
 *
 * Test harness mirrors DetailView.neoActionMenu.vitest.jsx.
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

// Mock ProcessParamDialog so tests focus on the DetailView integration
// (open/close handshake, onConfirm delegation) rather than dialog internals.
vi.mock('../ProcessParamDialog.jsx', () => ({
  ProcessParamDialog: ({ open, onOpenChange, onConfirm }) =>
    open ? (
      <div data-testid="process-param-dialog">
        <button
          data-testid="dialog-confirm"
          onClick={() => onConfirm({ period: 'Y' })}
        >
          Confirm
        </button>
        <button data-testid="dialog-cancel" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
      </div>
    ) : null,
}));

const mockHook = {
  loading: false,
  items: [],
  selected: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
  editing: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
  children: [{ id: 'L1', product: 'P1', 'product$_identifier': 'Widget', lineNetAmount: 100 }],
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

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => mockHook,
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
  useUI: () => (k) => k,
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

vi.mock('@/lib/backendErrors.js', () => ({ translateBackendError: (m) => m }));

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

vi.mock('@/components/ui/dialog.jsx', () => ({
  Dialog: ({ children, open }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
  DialogDescription: ({ children }) => <p>{children}</p>,
  DialogFooter: ({ children }) => <div>{children}</div>,
  DialogClose: ({ children }) => <>{children}</>,
}));

vi.mock('../DocumentPrintDrawer.jsx', () => ({
  default: () => null,
  printDocuments: vi.fn(),
}));

vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../BalanceFooterPanel.jsx', () => ({ default: () => null }));
vi.mock('../LinesSelectionBar.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({
  default: ({ status }) => <span>{status}</span>,
}));

vi.mock('@/components/attachments/AttachmentIcon', () => ({
  AttachmentIcon: () => null,
}));

// --- IMPORTS ---

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'sonner';
import { DetailView } from '../DetailView.jsx';

// ---------------------------------------------------------------------------
// Test harness helpers
// ---------------------------------------------------------------------------

/**
 * MockTable stores the onSelectionChange callback so tests can trigger
 * selectedChildRows state updates.  The "Select Row" button simulates a
 * user clicking a row in the line table, setting selectedChildRows = [L1].
 */
const MockTable = ({ onSelectionChange }) => (
  <div data-testid="mock-table">
    <button
      data-testid="trigger-selection"
      onClick={() => onSelectionChange([{ id: 'L1' }])}
    >
      Select Row
    </button>
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
  addLineFields: { entry: [], derived: [] },
  api: {},
  entityLabel: 'Sales Order',
  detailLabel: 'Lines',
  titleField: 'documentNo',
  windowName: 'sales-order',
  recordId: '123',
  token: 'test-token',
  apiBaseUrl: '/api/sales-order',
  breadcrumb: 'Sales / Orders',
};

function renderDetailView(props = {}) {
  return render(
    <MemoryRouter>
      <DetailView {...BASE_PROPS} {...props} />
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DetailView — detailProcesses (ETP-4248)', () => {
  beforeEach(() => {
    toast.success.mockClear();
    toast.error.mockClear();
    mockHook.fetchById.mockClear();
    mockHook.handleProcess.mockClear();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  // Test 1 ——————————————————————————————————————————————————————————————————
  it('renders no process buttons when detailProcesses is empty', async () => {
    const user = userEvent.setup();
    renderDetailView({ detailProcesses: [] });

    // Trigger row selection to satisfy the visibility condition
    await user.click(screen.getByTestId('trigger-selection'));

    expect(screen.queryAllByTestId('Button__detail-process')).toHaveLength(0);
  });

  it('renders no process buttons when detailProcesses is not passed', async () => {
    const user = userEvent.setup();
    renderDetailView({});

    await user.click(screen.getByTestId('trigger-selection'));

    expect(screen.queryAllByTestId('Button__detail-process')).toHaveLength(0);
  });

  // Test 2 ——————————————————————————————————————————————————————————————————
  it('calls fetch directly when process has no visible params', async () => {
    const user = userEvent.setup();
    renderDetailView({
      detailProcesses: [{ name: 'processA', label: 'Process A', params: [] }],
    });

    // Select a child row so the toolbar buttons become visible
    await user.click(screen.getByTestId('trigger-selection'));

    const btn = screen.getByTestId('Button__detail-process');
    expect(btn).toBeInTheDocument();
    await user.click(btn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/action/processA'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
    // Dialog should NOT have opened
    expect(screen.queryByTestId('process-param-dialog')).not.toBeInTheDocument();
  });

  it('does not show process buttons before any row is selected', () => {
    renderDetailView({
      detailProcesses: [{ name: 'processA', label: 'Process A' }],
    });
    // No selection triggered → buttons are hidden
    expect(screen.queryByTestId('Button__detail-process')).not.toBeInTheDocument();
  });

  // Test 3 ——————————————————————————————————————————————————————————————————
  it('opens ProcessParamDialog when process has visible params', async () => {
    const user = userEvent.setup();
    renderDetailView({
      detailProcesses: [
        {
          name: 'processB',
          label: 'Process B',
          params: [
            {
              key: 'period',
              label: 'period',
              type: 'select',
              options: [{ value: 'Y', label: 'Open' }],
              hidden: false,
            },
          ],
        },
      ],
    });

    await user.click(screen.getByTestId('trigger-selection'));
    await user.click(screen.getByTestId('Button__detail-process'));

    expect(screen.getByTestId('process-param-dialog')).toBeInTheDocument();
    // Fetch must NOT have been called yet
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // Test 4 ——————————————————————————————————————————————————————————————————
  it('calls fetch with param values when dialog Confirm is clicked', async () => {
    const user = userEvent.setup();
    renderDetailView({
      detailProcesses: [
        {
          name: 'processB',
          label: 'Process B',
          params: [
            {
              key: 'period',
              label: 'period',
              type: 'select',
              options: [{ value: 'Y', label: 'Open' }],
              hidden: false,
            },
          ],
        },
      ],
    });

    await user.click(screen.getByTestId('trigger-selection'));
    await user.click(screen.getByTestId('Button__detail-process'));
    // Dialog is open — confirm with mocked value { period: 'Y' }
    await user.click(screen.getByTestId('dialog-confirm'));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/action/processB'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"period"'),
        }),
      );
    });
    // Dialog closes after confirm
    expect(screen.queryByTestId('process-param-dialog')).not.toBeInTheDocument();
  });

  // Test 5 ——————————————————————————————————————————————————————————————————
  it('closes dialog without calling fetch when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderDetailView({
      detailProcesses: [
        {
          name: 'processB',
          label: 'Process B',
          params: [
            {
              key: 'period',
              label: 'period',
              type: 'select',
              options: [{ value: 'Y', label: 'Open' }],
              hidden: false,
            },
          ],
        },
      ],
    });

    await user.click(screen.getByTestId('trigger-selection'));
    await user.click(screen.getByTestId('Button__detail-process'));
    // Dialog is open — cancel it
    await user.click(screen.getByTestId('dialog-cancel'));

    // Dialog should be gone
    expect(screen.queryByTestId('process-param-dialog')).not.toBeInTheDocument();
    // Fetch must not have been called
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
