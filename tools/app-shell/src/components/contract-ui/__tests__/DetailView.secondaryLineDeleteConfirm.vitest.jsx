/**
 * Covers the secondaryDeleteConfirm dialog's real DELETE flow — reached by
 * selecting a secondary-tab row (openSecondaryLine, via st.Table's
 * onRowClick) then clicking "delete" in its sidebar (secondaryDetailSidebar's
 * onDeleteLine), which is otherwise never exercised elsewhere.
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
  handleNew: vi.fn(),
  isSaving: false,
  primeSaved: vi.fn(),
};

const SECONDARY_ROWS = [{ id: 'ADDR-1', street: 'Main St' }];
const secondaryHandleDeleteChild = vi.fn();

vi.mock('@/hooks/useEntity', () => ({
  useEntity: (entity, detailEntity) => {
    if (detailEntity === 'lines') return mockHook;
    if (detailEntity === 'addresses') {
      return { ...mockHook, children: SECONDARY_ROWS, handleDeleteChild: secondaryHandleDeleteChild };
    }
    return { ...mockHook, children: [] };
  },
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

vi.mock('@/lib/backendErrors.js', () => ({
  translateBackendError: (m) => m,
}));

vi.mock('@/utils/recordActions.js', () => ({
  isDeleteVisibleForRecord: () => true,
}));

vi.mock('@/lib/utils.js', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

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

const MockTable = ({ data }) => (
  <div data-testid="mock-table">
    {(data || []).map(r => <div key={r.id}>{r.id}</div>)}
  </div>
);

// Secondary tab's own Table — exposes onRowClick (= openSecondaryLine, since
// st.Form is set and linesLayout stays the default 'classic').
const StubSecondaryTable = ({ data, onRowClick }) => (
  <div data-testid="stub-secondary-table">
    {(data || []).map(r => (
      <button key={r.id} type="button" data-testid={`secondary-row-${r.id}`} onClick={() => onRowClick?.(r)}>
        {r.id}
      </button>
    ))}
  </div>
);

const StubSecondaryForm = ({ data }) => (
  <div data-testid="stub-secondary-form">{data?.id}</div>
);

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
        apiBaseUrl="/api/sales-order"
        breadcrumb="Sales / Orders"
        secondaryTabs={[{ key: 'addresses', label: 'Addresses', Table: StubSecondaryTable, Form: StubSecondaryForm }]}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('DetailView secondaryDeleteConfirm dialog (real onDeleteLine flow)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects a secondary row, opens the sidebar, and deletes it after confirming', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderDetailView();

    await user.click(screen.getByTestId('tab-addresses'));
    await user.click(await screen.findByTestId('secondary-row-ADDR-1'));
    await screen.findByTestId('stub-secondary-form');

    const sidebarDeleteButtons = screen.getAllByRole('button', { name: 'delete' })
      .filter(b => b.getAttribute('data-testid') !== 'action-delete');
    await user.click(sidebarDeleteButtons[sidebarDeleteButtons.length - 1]);
    const dialogDeleteButtons = await screen.findAllByRole('button', { name: 'delete' });
    await user.click(dialogDeleteButtons[dialogDeleteButtons.length - 1]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/addresses/ADDR-1'),
      expect.objectContaining({ method: 'DELETE' }),
    ));
    await waitFor(() => expect(secondaryHandleDeleteChild).toHaveBeenCalledWith('ADDR-1'));

    const { toast } = await import('sonner');
    expect(toast.success).toHaveBeenCalledWith('Record deleted');

    vi.unstubAllGlobals();
  });

  it('shows an error toast and keeps the row when the DELETE fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    renderDetailView();

    await user.click(screen.getByTestId('tab-addresses'));
    await user.click(await screen.findByTestId('secondary-row-ADDR-1'));
    await screen.findByTestId('stub-secondary-form');

    const sidebarDeleteButtons = screen.getAllByRole('button', { name: 'delete' })
      .filter(b => b.getAttribute('data-testid') !== 'action-delete');
    await user.click(sidebarDeleteButtons[sidebarDeleteButtons.length - 1]);
    const dialogDeleteButtons = await screen.findAllByRole('button', { name: 'delete' });
    await user.click(dialogDeleteButtons[dialogDeleteButtons.length - 1]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(secondaryHandleDeleteChild).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
