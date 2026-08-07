/**
 * ETP-4702 — regression test for the duplicate kebab-menu bug.
 *
 * DetailView.customMenuProbe.vitest.jsx (ETP-4269) already proves the generic
 * customMenuContent-inside-popover MECHANISM works, but with `processes: []`/
 * no `menuActions` — it never exercises the actual shape ETP-4702 broke:
 * a window (goods-shipment) that has BOTH real `menuActions` (Post/Unpost)
 * AND a real `customMenuContent` component. Before the fix, GoodsShipmentActions
 * rendered its OWN private "⋮" popover for `customMenuContent`'s content,
 * producing two separate kebab buttons instead of one merged dropdown.
 *
 * This test mounts the real DetailView with goods-shipment's actual
 * `menuActions` function (copied verbatim from
 * artifacts/goods-shipment/generated/web/goods-shipment/GoodsShipmentPage.jsx)
 * and the REAL (unmocked) GoodsShipmentMoreMenu as `customMenuContent`, then
 * clicks the single "action-more" kebab and asserts the Unpost menuActions
 * item and GoodsShipmentMoreMenu's "Download PDF" button both appear together
 * in the SAME popover.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';
import GoodsShipmentMoreMenu from '@generated/goods-shipment/custom/GoodsShipmentMoreMenu.jsx';

// --- Mock every hook/dep DetailView imports (mirrors DetailView.customMenuProbe.vitest.jsx) ---

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/goods-shipment/123', search: '' }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

// goods-shipment CO + posted + processed -> menuActions resolves to Unpost
// only (Post requires !posted), and GoodsShipmentMoreMenu requires documentStatus === 'CO'.
const mockHook = {
  loading: false,
  items: [],
  selected: { id: '123', documentNo: 'SHP-001', documentStatus: 'CO', posted: true, processed: true },
  editing: { id: '123', documentNo: 'SHP-001', documentStatus: 'CO', posted: true, processed: true },
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

vi.mock('@/hooks/useCatalogs', () => ({
  useCatalogs: () => ({ catalogs: {}, loading: false }),
}));

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set() }),
}));

vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }),
}));

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => 'EUR',
}));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, calculate: vi.fn() }),
  ORDER_LINE_CONFIG: { qtyField: 'orderedQuantity', priceField: 'unitPrice', totalField: 'lineNetAmount' },
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ executeAction: vi.fn(), loading: false }),
}));

// Real i18n identity convention: useUI returns the raw key, so assertions below
// check for the literal i18n keys ('unpost', 'invoicePreviewDownloadPdf').
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

vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../LinesSelectionBar.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: ({ status }) => <span data-testid="status-pill">{status}</span> }));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>📎</span> }));

// GoodsShipmentMoreMenu (real, unmocked) itself imports the PDF-generation
// helper — stub only that leaf so mounting it doesn't need a real network
// call. The click/download flow itself already has dedicated coverage in
// artifacts/goods-shipment/custom/__tests__/GoodsShipmentMoreMenu.vitest.jsx;
// this test only cares that the button renders alongside the menuActions item.
vi.mock('@/windows/custom/goods-shipment/useShipmentPdf', () => ({
  generateShipmentPdf: vi.fn(),
  getShipmentPdfLabels: vi.fn(() => ({})),
}));

const MockForm = ({ data }) => (
  <div data-testid="mock-form"><span>{data?.documentNo}</span></div>
);
const MockTable = ({ data }) => (
  <div data-testid="mock-table">{(data || []).map((r) => <div key={r.id}>{r.id}</div>)}</div>
);

// Copied verbatim (shape) from goods-shipment's generated menuActions —
// artifacts/goods-shipment/generated/web/goods-shipment/GoodsShipmentPage.jsx.
const goodsShipmentMenuActions = ({ data }) => [
  {
    key: 'post', label: 'Post', labelKey: 'post', successKey: 'documentPosted', neoAction: 'post',
    visible: !(data?.posted === 'Y' || data?.posted === true) && (data?.processed === 'Y' || data?.processed === true),
  },
  {
    key: 'unpost', label: 'Unpost', destructive: true, labelKey: 'unpost', successKey: 'documentUnposted', neoAction: 'unpost',
    visible: (data?.posted === 'Y' || data?.posted === true),
  },
];

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
        addLineFields={{ entry: [], derived: [] }}
        api={{}}
        entityLabel="Goods Shipment"
        detailLabel="Lines"
        titleField="documentNo"
        windowName="goods-shipment"
        recordId="123"
        token="test-token"
        apiBaseUrl="/api/goods-shipment"
        breadcrumb="Sales / Goods Shipments"
        menuActions={goodsShipmentMenuActions}
        customMenuContent={GoodsShipmentMoreMenu}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe('DetailView — goods-shipment kebab menu merges menuActions + customMenuContent (ETP-4702)', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('the popover is closed before clicking the kebab', () => {
    renderDetailView();
    expect(screen.queryByTestId('menu-action-unpost')).toBeNull();
    // The hidden aria-hidden probe (used to detect whether customMenuContent
    // renders anything) always mounts GoodsShipmentMoreMenu once, even before
    // the popover opens — so exactly one (hidden) match is expected here, and
    // a second, VISIBLE one should appear only after clicking the kebab below.
    expect(screen.getAllByText('invoicePreviewDownloadPdf')).toHaveLength(1);
  });

  it('clicking the "more options" kebab shows BOTH the Unpost menuActions item and the GoodsShipmentMoreMenu download button in the same popover', async () => {
    const user = userEvent.setup();
    renderDetailView();

    const moreBtn = screen.getByTestId('action-more');
    await user.click(moreBtn);

    await waitFor(() => {
      expect(screen.getByTestId('menu-action-unpost')).toBeInTheDocument();
    });
    expect(screen.getByTestId('menu-action-unpost')).toHaveTextContent('unpost');

    // GoodsShipmentMoreMenu renders a plain button with no data-testid; assert
    // on its raw i18n key text (useUI mock returns the key as-is). Two matches
    // now: the hidden probe (still mounted) + the visible popover instance.
    const downloadButtons = screen.getAllByText('invoicePreviewDownloadPdf');
    expect(downloadButtons.length).toBeGreaterThanOrEqual(2);
    expect(downloadButtons.some((el) => el.closest('button') && el.closest('div[aria-hidden]') === null)).toBe(true);

    // Post is NOT shown (posted is true), proving the gating in the real
    // menuActions function is honored, not just "something visible".
    expect(screen.queryByTestId('menu-action-post')).toBeNull();
  });
});
