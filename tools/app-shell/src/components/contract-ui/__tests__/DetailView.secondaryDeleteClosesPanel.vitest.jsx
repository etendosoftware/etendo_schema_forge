/**
 * ETP-5245 — deleting a secondary line from the row's hover trash must not flash the
 * side detail panel. This is the gesture that actually reproduces the bug the user
 * reported on Producto > Costo: hover a row, click the trash, confirm "Eliminar
 * registro" — and a 768px "Detalle de Costo" panel slides in on the right with EMPTY
 * fields, squeezing the grid.
 *
 * Mechanism: the confirm handler calls `closeSecondaryLine()` unconditionally
 * (DetailView.jsx, secondary delete dialog). That helper exists to ANIMATE AN OPEN
 * panel out — it raises the window-global `isClosingSecondaryLine` for 250ms. The
 * hover-trash path never opened a panel, but the old render guard was
 * `st.Form && !st.Panel && (selected?._tabKey === st.key || closingSecondaryLine)`,
 * and that last term alone is enough. It is window-global, not scoped to the tab, so
 * EVERY secondary tab carrying a `Form` painted the panel for those 250ms, fed
 * `secondaryLineEdits ?? selectedSecondaryLine` — both null, hence the empty fields —
 * and wearing `sidebar-slide-out`, which is the "animation flying off to the right"
 * the user described.
 *
 * The fix guards the render site (`shouldShowSecondaryDetailSidebar`), so an
 * inline-editable tab cannot paint the panel however the flag is set. This suite
 * pins the real flow end to end; DetailView.secondaryDetailSidebar.vitest.jsx pins
 * the guard's own truth table.
 *
 * Harness mirrors DetailView.secondaryTabCapabilityGate.vitest.jsx (a full DetailView
 * mount), plus a mocked apiFetch so the DELETE resolves.
 */
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

// No module mock for the request layer: `@/auth/api.js` is a one-line barrel over the
// core package, so mocking it does not rebind what DetailView imported. Stub the
// transport instead and give the view an absolute base URL, so the REAL apiFetch runs
// end to end and the DELETE is observable.
const fetchMock = vi.hoisted(() => vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));

// Mutable ref so each test can flip the granted capability without re-mocking.
const capabilitiesRef = vi.hoisted(() => ({ current: {} }));
vi.mock('@/hooks/useCapabilitiesSafe.js', () => ({
  useCapabilitiesSafe: () => capabilitiesRef.current,
}));

// Mutable ref so a test can simulate a stale/direct deep-link via location.state.
const locationStateRef = vi.hoisted(() => ({ current: undefined }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/sales-order/123', search: '', state: locationStateRef.current }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const mockHook = {
  loading: false,
  items: [],
  selected: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
  editing: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false },
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

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => mockHook,
  extractErrorMessage: async () => 'Error',
}));
vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({ catalogs: {}, loading: false }) }));
vi.mock('@/hooks/useDisplayLogic', () => ({ useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set() }) }));
vi.mock('@/hooks/useCallout', () => ({ useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }) }));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, calculate: vi.fn() }),
  ORDER_LINE_CONFIG: { qtyField: 'orderedQuantity', priceField: 'unitPrice', totalField: 'lineNetAmount' },
}));
vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({ executeAction: vi.fn(), loading: false }) }));
vi.mock('@/i18n', () => ({ useMenuLabel: () => (k) => k, useUI: () => (k) => k, useLabel: () => () => '' }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({ useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }) }));
vi.mock('@/components/CurrentWindowContext', () => ({ useRegisterWindowContext: () => {} }));
vi.mock('@/components/copilot/ocr/ocrDocTypes', () => ({ matchOcrDocType: () => null }));
vi.mock('@/lib/selectorContext.js', () => ({ buildHeaderSelectorContext: () => ({}), buildLineSelectorContext: () => ({}) }));
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => (v != null ? String(v) : '—') }));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (data, f) => data?.[f] || data?._identifier || '' }));
vi.mock('@/lib/documentTotals', () => ({ resolveTotalDiscountPct: () => 0 }));
vi.mock('@/lib/backendErrors.js', async (importOriginal) => ({ ...(await importOriginal()), translateBackendError: (m) => m }));
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
vi.mock('../DocumentStatusPill.jsx', () => ({ default: ({ status }) => <span data-testid="status-pill">{status}</span> }));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>📎</span> }));

const MockForm = ({ data }) => <div data-testid="mock-form"><span>{data?.documentNo}</span></div>;
const MockTable = ({ data }) => <div data-testid="mock-table">{(data || []).map((r) => <div key={r.id}>{r.id}</div>)}</div>;
const MockPanel = vi.fn(() => <div data-testid="accounting-panel">Accounting Panel</div>);

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
        addLineFields={{ entry: [{ key: 'product', label: 'Product', type: 'selector', column: 'M_Product_ID' }], derived: [] }}
        api={{}}
        entityLabel="Sales Order"
        detailLabel="Lines"
        titleField="documentNo"
        windowName="sales-order"
        recordId="123"
        token="test-token"
        apiBaseUrl="http://localhost/api/sales-order"
        breadcrumb="Sales / Orders"
        {...props}
      />
    </MemoryRouter>,
  );
}

// The real Producto > Costo tab shape: a child table plus its generated CostingForm.
const CostingForm = () => <div data-testid="costing-form" />;

// Stands in for CostingTable/InlineLinesPanel: exposes the row's hover trash as a
// button, which is exactly what InlineLinesPanel wires to `onDeleteRow`.
const CostingTable = ({ data, onDeleteRow }) => (
  <div data-testid="costing-table">
    {(data || []).map((row) => (
      <button key={row.id} data-testid={`trash-${row.id}`} onClick={() => onDeleteRow?.(row)}>trash</button>
    ))}
  </div>
);

const costingTab = {
  key: 'costing',
  label: 'Costing',
  Table: CostingTable,
  Form: CostingForm,
  addLineFields: { entry: [{ key: 'cost', label: 'Cost', type: 'amount', column: 'Cost' }] },
};

const panelIsShowing = () => screen.queryByTestId('costing-form') !== null;

async function deleteTheOnlyLineFromTheHoverTrash(user) {
  mockHook.children = [{ id: 'C1', cost: 10 }];
  renderDetailView({ secondaryTabs: [costingTab], linesLayout: 'inlineEditable' });
  await user.click(screen.getByTestId('tab-costing'));
  // Hover trash on the row → opens the "Eliminar registro" confirm dialog.
  await user.click(screen.getByTestId('trash-C1'));
  await screen.findByTestId('dialog');
  expect(panelIsShowing()).toBe(false);
  // Confirm. The handler DELETEs, drops the row, then calls closeSecondaryLine().
  // Re-query at click time: React replaces these nodes on every re-render, and a
  // click on a detached node never reaches the handler.
  const confirmButton = [...screen.getByTestId('dialog').querySelectorAll('button')]
    .find((b) => b.textContent === 'delete');
  await act(async () => { fireEvent.click(confirmButton); });
}

describe('DetailView — hover-trash delete on an inlineEditable secondary tab (ETP-5245)', () => {
  beforeEach(() => {
    capabilitiesRef.current = {};
    locationStateRef.current = undefined;
    fetchMock.mockClear();
    globalThis.fetch = fetchMock;
    mockHook.children = [];
    mockHook.handleDeleteChild = vi.fn();
  });

  it('never paints the detail panel while the close flag is up after the delete', async () => {
    const user = userEvent.setup();
    await deleteTheOnlyLineFromTheHoverTrash(user);

    // This is the exact 250ms window the user screenshotted: the DELETE resolved,
    // closeSecondaryLine() raised the window-global closing flag, and no panel was
    // ever open to close.
    const deleteCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'DELETE');
    expect(String(deleteCall?.[0])).toContain('/costing/C1');
    expect(panelIsShowing()).toBe(false);
    expect(document.querySelector('.w-\\[48rem\\]')).toBeNull();
  });

  it('still paints nothing once the close flag has cleared', async () => {
    const user = userEvent.setup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await deleteTheOnlyLineFromTheHoverTrash(user);
      await act(async () => { vi.advanceTimersByTime(400); });
      expect(panelIsShowing()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the tab table as the only content after the delete', async () => {
    const user = userEvent.setup();
    await deleteTheOnlyLineFromTheHoverTrash(user);
    // The grid squeeze the user saw is the panel occupying 768px NEXT TO the table:
    // the table is still there, just crushed. Assert the table survives AND that
    // nothing shares the row with it.
    expect(screen.getByTestId('costing-table')).toBeTruthy();
    expect(panelIsShowing()).toBe(false);
    expect(document.querySelector('.w-\\[48rem\\]')).toBeNull();
  });
});
