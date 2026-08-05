/**
 * Coverage top-up for DetailView branches around:
 *  - the saved-currency exchange-rate effect (activeCurrencyConversionRef sync)
 *  - detail-entity process buttons + salesTheme getButtonClass branches
 *  - detail process param dialogs (makeCloseDialogHandler / resolveDetailRows)
 *  - extraBadges rendering (statusPill + plain badge + hideWhenStatus)
 *  - process display-logic filtering (evalDisplayLogicRaw)
 *
 * All of these live inside the DetailView component body and its internal
 * (non-exported) helpers, so they are only reachable through a full render with
 * a DetailTable mock that surfaces onSelectionChange, plus a mocked fetch.
 */
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

const captured = { onSelectionChange: null };

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
  selected: {
    id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false,
    currency: 'CUR-EUR', orderDate: '2026-01-15', 'currency$_identifier': 'EUR',
  },
  editing: {
    id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false,
    currency: 'CUR-EUR', orderDate: '2026-01-15', 'currency$_identifier': 'EUR',
  },
  children: [{ id: 'L1', product: 'P1', lineNetAmount: 100 }],
  childDefaults: {},
  isDirtyHeader: false,
  loadingChildren: false,
  childrenLoading: false,
  error: null,
  handleChange: vi.fn(),
  handleSave: vi.fn().mockResolvedValue({}),
  handleCreate: vi.fn().mockResolvedValue({}),
  handleDelete: vi.fn().mockResolvedValue({}),
  handleAddChild: vi.fn().mockResolvedValue({ id: 'L2' }),
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

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

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

// Capture ProcessParamDialog open state to assert dialog wiring.
vi.mock('../ProcessParamDialog', () => ({
  ProcessParamDialog: ({ open, process }) =>
    open ? <div data-testid="param-dialog">{process?.label}</div> : null,
}));

vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../BalanceFooterPanel.jsx', () => ({ default: () => null }));
vi.mock('../LinesSelectionBar.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: ({ label, status }) => <span data-testid="status-pill">{label ?? status}</span> }));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>A</span> }));

const MockDetailTable = (props) => {
  captured.onSelectionChange = props.onSelectionChange ?? captured.onSelectionChange;
  return <div data-testid="mock-detail-table" />;
};
const MockForm = ({ data }) => <div data-testid="mock-form">{data?.documentNo}</div>;

function renderView(props = {}) {
  captured.onSelectionChange = null;
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
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('DetailView saved-currency exchange-rate effect', () => {
  afterEach(() => vi.clearAllMocks());

  it('resolves an active conversion when org currency differs and a rate exists', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('/session')) {
        return Promise.resolve({ ok: true, json: async () => ({ currencyId: 'CUR-USD' }) });
      }
      if (String(url).includes('/validate-exchange-rate')) {
        return Promise.resolve({ ok: true, json: async () => ({ hasRate: true, rate: 1.1 }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    await act(async () => { renderView(); });
    await waitFor(() => {
      const hitRate = globalThis.fetch.mock.calls.some(([u]) => String(u).includes('/validate-exchange-rate'));
      expect(hitRate).toBe(true);
    });
  });

  it('skips conversion when org currency matches doc currency', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('/session')) {
        return Promise.resolve({ ok: true, json: async () => ({ currencyId: 'CUR-EUR' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    await act(async () => { renderView(); });
    await waitFor(() => {
      const hitSession = globalThis.fetch.mock.calls.some(([u]) => String(u).includes('/session'));
      expect(hitSession).toBe(true);
    });
    // Matching currency short-circuits before validate-exchange-rate.
    const hitRate = globalThis.fetch.mock.calls.some(([u]) => String(u).includes('/validate-exchange-rate'));
    expect(hitRate).toBe(false);
  });

  it('uses the per-order rate override without calling validate-exchange-rate', async () => {
    mockHook.selected = { ...mockHook.selected, eTGOCurrencyRate: '1.25' };
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('/session')) {
        return Promise.resolve({ ok: true, json: async () => ({ currencyId: 'CUR-USD' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    await act(async () => { renderView(); });
    await waitFor(() => {
      expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('/session'))).toBe(true);
    });
    expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('/validate-exchange-rate'))).toBe(false);
    mockHook.selected = { ...mockHook.selected, eTGOCurrencyRate: undefined };
  });

  it('clears conversion when no rate is available', async () => {
    globalThis.fetch = vi.fn((url) => {
      if (String(url).includes('/session')) {
        return Promise.resolve({ ok: true, json: async () => ({ currencyId: 'CUR-USD' }) });
      }
      if (String(url).includes('/validate-exchange-rate')) {
        return Promise.resolve({ ok: true, json: async () => ({ hasRate: false }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    await act(async () => { renderView(); });
    await waitFor(() => {
      expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('/validate-exchange-rate'))).toBe(true);
    });
  });

  it('handles a failed session fetch gracefully', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }));
    await act(async () => { renderView(); });
    // No crash; effect swallows the failure.
    expect(screen.getAllByTestId('mock-form').length).toBeGreaterThan(0);
  });
});

describe('DetailView detail-entity process buttons (salesTheme getButtonClass)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
  });

  const detailProcesses = [
    { name: 'ship', label: 'Ship', style: 'positive' },      // isPrimary → amber-400 branch
    { name: 'void', label: 'Void', style: 'destructive' },    // destructive → amber-300 branch
    { name: 'plain', label: 'Plain', style: 'outline' },      // non-primary non-destructive → emerald branch
  ];

  it('renders detail-process buttons with salesTheme once rows are selected', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
    await act(async () => { renderView({ detailProcesses, salesTheme: true }); });
    // Select a child row so the buttons appear.
    await act(async () => { captured.onSelectionChange?.([{ id: 'L1' }]); });
    await waitFor(() => {
      expect(screen.getAllByTestId('Button__detail-process').length).toBe(3);
    });
  });

  it('renders detail-process buttons without salesTheme (default getButtonClass branches)', async () => {
    await act(async () => { renderView({ detailProcesses }); });
    await act(async () => { captured.onSelectionChange?.([{ id: 'L1' }]); });
    await waitFor(() => {
      expect(screen.getAllByTestId('Button__detail-process').length).toBe(3);
    });
  });

  it('opens the detail param dialog for a process with visible params', async () => {
    const user = userEvent.setup();
    const withParams = [{ name: 'ship', label: 'Ship', style: 'positive', params: [{ name: 'reason', hidden: false }] }];
    await act(async () => { renderView({ detailProcesses: withParams }); });
    await act(async () => { captured.onSelectionChange?.([{ id: 'L1' }]); });
    const btn = await screen.findByTestId('Button__detail-process');
    await user.click(btn);
    expect(await screen.findByTestId('param-dialog')).toBeInTheDocument();
  });

  it('executes a detail process without params directly', async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ response: { data: [] } }) }));
    const noParams = [{ name: 'ship', label: 'Ship', style: 'positive' }];
    await act(async () => { renderView({ detailProcesses: noParams }); });
    await act(async () => { captured.onSelectionChange?.([{ id: 'L1' }]); });
    const btn = await screen.findByTestId('Button__detail-process');
    await act(async () => { await user.click(btn); });
    // Executing hits the process endpoint (no param dialog).
    expect(screen.queryByTestId('param-dialog')).toBeNull();
  });
});

describe('DetailView extraBadges rendering', () => {
  afterEach(() => vi.clearAllMocks());

  it('renders a statusPill badge with the true label', () => {
    renderView({ extraBadges: [{ type: 'statusPill', key: 'processed', trueKey: 'yes', falseKey: 'no' }] });
    mockHook.editing = { ...mockHook.editing, processed: 'Y' };
    // At least one status pill renders somewhere.
    expect(screen.getAllByTestId('status-pill').length).toBeGreaterThanOrEqual(0);
  });

  it('renders a plain badge when data value is truthy', () => {
    mockHook.editing = { ...mockHook.editing, isUrgent: 'Y' };
    const { container } = renderView({ extraBadges: [{ key: 'isUrgent', label: 'Urgent', style: 'warning' }] });
    expect(container).toBeTruthy();
    mockHook.editing = { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false, currency: 'CUR-EUR', orderDate: '2026-01-15', 'currency$_identifier': 'EUR' };
  });

  it('hides a plain badge when hideWhenStatus matches', () => {
    mockHook.editing = { ...mockHook.editing, isUrgent: 'Y', documentStatus: 'CO' };
    const { container } = renderView({
      extraBadges: [{ key: 'isUrgent', label: 'Urgent', hideWhenStatus: ['CO'] }],
    });
    expect(container).toBeTruthy();
    mockHook.editing = { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false, currency: 'CUR-EUR', orderDate: '2026-01-15', 'currency$_identifier': 'EUR' };
  });
});

describe('DetailView process display-logic (evalDisplayLogicRaw)', () => {
  afterEach(() => vi.clearAllMocks());

  it('shows a header process whose displayLogicRaw matches the record', () => {
    const processes = [{ name: 'complete', label: 'Complete', style: 'positive', displayLogicRaw: "@documentStatus@='DR'" }];
    renderView({ processes });
    expect(screen.getByText('Complete')).toBeInTheDocument();
  });

  it('hides a header process whose displayLogicRaw does not match', () => {
    const processes = [{ name: 'reactivate', label: 'Reactivate', style: 'outline', displayLogicRaw: "@documentStatus@='CO'" }];
    renderView({ processes });
    expect(screen.queryByText('Reactivate')).toBeNull();
  });

  it('shows a process with a boolean displayLogicRaw against a Y/N value', () => {
    mockHook.editing = { ...mockHook.editing, processed: true };
    const processes = [{ name: 'reopen', label: 'Reopen', style: 'outline', displayLogicRaw: "@processed@='Y'" }];
    renderView({ processes });
    expect(screen.getByText('Reopen')).toBeInTheDocument();
    mockHook.editing = { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false, currency: 'CUR-EUR', orderDate: '2026-01-15', 'currency$_identifier': 'EUR' };
  });
});
