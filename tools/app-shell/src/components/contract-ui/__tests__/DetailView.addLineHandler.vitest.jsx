/**
 * Behavioral test for the primary lines "add row" onAdd handler
 * (DetailView.jsx ~4327-4364): it merges hidden entry defaults into the new line
 * (from the parent header, from a sibling line, or a literal value), normalizes
 * the discount-driven gross amount, and delegates the POST to handleAddChild.
 *
 * The handler is invoked through the DetailTable's `addRow.onAdd` slot, driven
 * here by a mock table button. Harness mirrors DetailView.docActionMenuRefresh.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { forwardRef } from 'react';
import { MemoryRouter } from 'react-router-dom';
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
  selected: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', organization: 'ORG-1', processed: false },
  editing: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', organization: 'ORG-1', processed: false },
  children: [{ id: 'L1', product: 'P1', 'product$_identifier': 'Widget', warehouse: 'WH-9', lineNetAmount: 100 }],
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
  handleAddChild: vi.fn().mockResolvedValue({ id: 'L2' }),
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
// Full useLineGrossAmount mock: the add handler needs prepareLineForPost and
// computeLineGrossAmount to exist. computeLineGrossAmount writes the recomputed
// gross into the result object, mirroring the real hook's contract.
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({
    computeLineGrossAmount: (_field, _value, result) => {
      result.grossAmount = 121;
      result.grossUnit = 121;
    },
    resolveTaxFactor: () => 1.21,
    deriveLineNet: (line) => line,
    prepareLineForPost: (line) => line,
  }),
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

// The add handler is exposed via addRow.onAdd; the button forwards a minimal
// line payload so we can assert how the handler enriches it.
const MockTable = forwardRef((props, _ref) => (
  <div data-testid="mock-table">
    <button
      data-testid="tbl-add-line"
      onClick={() => props.addRow?.onAdd?.({ product: 'P2', discount: '' })}
    >
      add
    </button>
  </div>
));

const LINE_CONFIG = {
  qtyField: 'orderedQuantity',
  priceField: 'unitPrice',
  totalField: 'lineNetAmount',
  discountField: 'discount',
  grossField: 'grossUnit',
};

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
        lineConfig={LINE_CONFIG}
        addLineFields={{
          entry: [],
          hidden: [
            { key: 'organizationLine', fromParent: 'organization' },
            { key: 'warehouseLine', fromSibling: 'warehouse' },
            { key: 'lineStatus', value: 'PENDING' },
          ],
        }}
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

describe('DetailView — add-line onAdd handler (hidden defaults + gross recompute)', () => {
  beforeEach(() => {
    mockHook.handleAddChild.mockClear();
  });

  it('enriches the new line with hidden defaults from parent, sibling and literal value', async () => {
    const user = userEvent.setup();
    renderDetailView();

    await user.click(screen.getByTestId('tbl-add-line'));

    expect(mockHook.handleAddChild).toHaveBeenCalledTimes(1);
    const posted = mockHook.handleAddChild.mock.calls[0][0];
    expect(posted.organizationLine).toBe('ORG-1'); // fromParent -> header value
    expect(posted.warehouseLine).toBe('WH-9');      // fromSibling -> first child value
    expect(posted.lineStatus).toBe('PENDING');       // literal value default
  });

  it('recomputes the gross amount from the (cleared) discount field before POST', async () => {
    const user = userEvent.setup();
    renderDetailView();

    await user.click(screen.getByTestId('tbl-add-line'));

    const posted = mockHook.handleAddChild.mock.calls[0][0];
    // computeLineGrossAmount wrote the normalized gross back onto the line.
    expect(posted.grossAmount).toBe(121);
    expect(posted.grossUnit).toBe(121);
  });

  it('does not override a hidden default that the caller already supplied', async () => {
    const user = userEvent.setup();
    const MockTableWithValue = forwardRef((props, _ref) => (
      <div data-testid="mock-table">
        <button
          data-testid="tbl-add-line"
          onClick={() => props.addRow?.onAdd?.({ product: 'P2', discount: '', lineStatus: 'PRESET' })}
        >
          add
        </button>
      </div>
    ));
    renderDetailView({ DetailTable: MockTableWithValue });

    await user.click(screen.getByTestId('tbl-add-line'));

    const posted = mockHook.handleAddChild.mock.calls[0][0];
    // The `key in lineData` guard must preserve the caller-provided value.
    expect(posted.lineStatus).toBe('PRESET');
  });
});
