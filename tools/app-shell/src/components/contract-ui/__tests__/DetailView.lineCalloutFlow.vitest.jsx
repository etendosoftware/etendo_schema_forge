/**
 * Coverage top-up for DetailView's inline-editable line callout flow.
 *
 * These branches live deep inside the DetailView component body and its
 * bottom-of-file internal helpers (handleLineFieldChange, calculateNetUnitPrice,
 * applyProductCalloutPriceAdjustments, applyProductCurrencyConversion,
 * resolveTaxIdentifier, calculateLineNetAmount, populateIdentifierFields,
 * handleEntryIdentifierChange). None of them are exported, so the only way to
 * reach them is to render the component in inlineEditable mode with a DetailTable
 * mock that surfaces the onFieldChange / onUpdateRow / addRow callbacks, then
 * invoke them with a mocked callout `fetch` response.
 *
 * The real `@/lib/lineFieldChange.js` helpers run unmocked (matching
 * DetailView.render.vitest.jsx) so the callout result is normalized for real.
 */
import { render, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

// --- Shared holder captured from the DetailTable mock props ---
const captured = {
  onFieldChange: null,
  onUpdateRow: null,
  addRow: null,
};

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
  selected: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false, 'currency$_identifier': 'USD' },
  editing: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false, 'currency$_identifier': 'USD' },
  children: [
    { id: 'L1', product: 'P1', 'product$_identifier': 'Widget', lineNetAmount: 100, tax: 'TAX1', 'tax$_identifier': 'IVA 21%', grossAmount: 121, unitPrice: 10, orderedQuantity: 1 },
  ],
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

vi.mock('@/hooks/useCatalogs', () => ({
  useCatalogs: () => ({
    catalogs: {
      lines: {
        // catalog keyed by field for populateIdentifierFields / handleEntryIdentifierChange
        uOM: [{ id: 'U1', label: 'Unit' }],
        tax: [{ id: 'TAX1', label: 'IVA 21%' }],
      },
    },
    loading: false,
    catalogsLoaded: true,
  }),
}));

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set() }),
}));

vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }),
}));

vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'USD' }));

// Real-ish computeLineGrossAmount that mutates result like the production hook.
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({
    computeLineGrossAmount: (field, value, result, rowValues) => {
      const cfg = { qtyField: 'orderedQuantity', priceField: 'unitPrice' };
      const qty = parseFloat(String(result[cfg.qtyField] ?? rowValues?.[cfg.qtyField] ?? 1)) || 1;
      const price = parseFloat(String(result[cfg.priceField] ?? rowValues?.[cfg.priceField] ?? value ?? 0)) || 0;
      result.grossAmount = qty * price;
    },
    resolveTaxFactor: () => 1.21,
    prepareLineForPost: (line) => line,
  }),
  ORDER_LINE_CONFIG: {
    qtyField: 'orderedQuantity',
    priceField: 'unitPrice',
    discountField: 'discount',
    grossField: 'lineGrossAmount',
    totalField: 'lineNetAmount',
  },
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ executeAction: vi.fn(), loading: false }),
}));

vi.mock('@/hooks/useNeoAction', () => ({
  useNeoAction: () => ({ execute: vi.fn(), loading: false }),
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

// getCatalogOptions used by populateIdentifierFields / handleEntryIdentifierChange.
vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: (catalogs, entity, sel) => {
    if (sel?.field === 'uOM') return [{ id: 'U1', label: 'Unit' }];
    if (sel?.field === 'tax') return [{ id: 'TAX1', label: 'IVA 21%' }];
    return [];
  },
}));

vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (v) => (v != null ? String(v) : '—') }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, f) => data?.[f] || data?._identifier || '',
}));
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

vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null, printDocuments: vi.fn() }));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../BalanceFooterPanel.jsx', () => ({ default: () => null }));
vi.mock('../LinesSelectionBar.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: ({ status }) => <span>{status}</span> }));
vi.mock('@/components/attachments/AttachmentIcon', () => ({ AttachmentIcon: () => <span>A</span> }));

// DetailTable mock that captures the callout-related props so the test can drive
// the internal handleLineFieldChange / onUpdateRow flow directly.
const MockDetailTable = (props) => {
  captured.onFieldChange = props.onFieldChange ?? props.addRow?.onFieldChange ?? captured.onFieldChange;
  captured.onUpdateRow = props.onUpdateRow ?? captured.onUpdateRow;
  captured.addRow = props.addRow ?? captured.addRow;
  return <div data-testid="mock-detail-table" />;
};

const MockForm = ({ data }) => <div data-testid="mock-form">{data?.documentNo}</div>;

const ENTRY_FIELDS = [
  { key: 'product', label: 'Product', type: 'selector', column: 'M_Product_ID', forceCalloutFields: ['uOM'] },
  { key: 'orderedQuantity', label: 'Qty', type: 'number' },
  { key: 'unitPrice', label: 'Price', type: 'number' },
];

function renderInline(props = {}) {
  captured.onFieldChange = null;
  captured.onUpdateRow = null;
  captured.addRow = null;
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
        addLineFields={{ entry: ENTRY_FIELDS, derived: [] }}
        api={{ selectors: [{ field: 'uOM', entity: 'lines' }, { field: 'tax', entity: 'lines' }] }}
        entityLabel="Sales Order"
        detailLabel="Lines"
        titleField="documentNo"
        windowName="sales-order"
        recordId="123"
        token="test-token"
        apiBaseUrl="/api/sales-order"
        breadcrumb="Sales / Orders"
        linesLayout="inlineEditable"
        {...props}
      />
    </MemoryRouter>,
  );
}

function mockCalloutFetch(body) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe('DetailView inline line callout flow', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockHook.selected = { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false, 'currency$_identifier': 'USD' };
    mockHook.editing = { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false, 'currency$_identifier': 'USD' };
  });

  it('exposes onFieldChange from the inline add row', () => {
    renderInline();
    expect(typeof captured.onFieldChange).toBe('function');
    expect(typeof captured.onUpdateRow).toBe('function');
  });

  it('short-circuits handleLineFieldChange for empty/identifier/DB-column fields', async () => {
    globalThis.fetch = vi.fn();
    renderInline();
    // Empty value → early return, no fetch
    await act(async () => { await captured.onFieldChange('product', '', {}); });
    // $_identifier field → early return
    await act(async () => { await captured.onFieldChange('product$_identifier', 'X', {}); });
    // DB column name pattern (Foo_BAR) → early return
    await act(async () => { await captured.onFieldChange('bpartner_ID', 'X', {}); });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('computes gross client-side for qty/price fields without a callout', async () => {
    globalThis.fetch = vi.fn();
    renderInline();
    const apply = vi.fn();
    await act(async () => { await captured.onFieldChange('orderedQuantity', '3', { unitPrice: 10 }, apply); });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(apply).toHaveBeenCalled();
    const [result] = apply.mock.calls[0];
    expect(result.grossAmount).toBeGreaterThan(0);
  });

  it('runs the full product callout: price adjust, identifiers, net unit price, tax id, currency conversion', async () => {
    // Header has a currency conversion active — set the saved order to a
    // different currency than the pricelist so activeCurrencyConversionRef fills.
    mockCalloutFetch({
      updates: {
        // Callout returns standardPrice but zero listPrice → price adjust copies it.
        standardPrice: { value: 50 },
        listPrice: { value: 0 },
        // FK field without identifier → populateIdentifierFields resolves it.
        uOM: { value: 'U1' },
        // grossUnitPrice present without netUnitPrice → calculateNetUnitPrice derives it.
        grossUnitPrice: { value: 121 },
        taxRate: { value: 21 },
        tax: { value: 'TAX1' },
        unitPrice: { value: 50 },
        orderedQuantity: { value: 2 },
      },
    });
    const apply = vi.fn();
    renderInline();
    await act(async () => {
      await captured.onFieldChange('product', 'P9', { orderedQuantity: 2, unitPrice: 50 }, apply);
    });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/lines/callout'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(apply).toHaveBeenCalled();
    const [result, forceFields] = apply.mock.calls[0];
    // applyProductCalloutPriceAdjustments: listPrice copied from standardPrice
    expect(result.listPrice).toBe(50);
    // discountField zeroed for product callout
    expect(result.discount).toBe(0);
    // populateIdentifierFields resolved uOM identifier from catalog
    expect(result['uOM$_identifier']).toBe('Unit');
    // calculateNetUnitPrice derived netUnitPrice from grossUnitPrice / taxFactor
    expect(result.netUnitPrice).toBeCloseTo(121 / 1.21, 2);
    // forceCalloutFields includes uOM (declared) and discount (product+discountField)
    expect(forceFields.has('uOM')).toBe(true);
    expect(forceFields.has('discount')).toBe(true);
  });

  it('derives lineNetAmount when the callout omits it', async () => {
    mockCalloutFetch({ updates: { unitPrice: { value: 20 } } });
    const apply = vi.fn();
    renderInline();
    await act(async () => {
      await captured.onFieldChange('product', 'P9', { orderedQuantity: 4, unitPrice: 20 }, apply);
    });
    const [result] = apply.mock.calls[0];
    // calculateLineNetAmount: qty(4) × price(20) = 80
    expect(String(result.lineNetAmount)).toBe('80');
  });

  it('resolves tax$_identifier from an existing line when callout omits it', async () => {
    mockCalloutFetch({ updates: { tax: { value: 'TAX1' }, unitPrice: { value: 5 } } });
    const apply = vi.fn();
    renderInline();
    await act(async () => {
      await captured.onFieldChange('product', 'P9', { orderedQuantity: 1, unitPrice: 5 }, apply);
    });
    const [result] = apply.mock.calls[0];
    expect(result['tax$_identifier']).toBe('IVA 21%');
  });

  it('swallows a non-ok callout response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const apply = vi.fn();
    renderInline();
    await act(async () => {
      await captured.onFieldChange('product', 'P9', { orderedQuantity: 1 }, apply);
    });
    // res.ok === false → returns before applyUpdates
    expect(apply).not.toHaveBeenCalled();
  });

  it('swallows a thrown callout error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));
    const apply = vi.fn();
    renderInline();
    await act(async () => {
      await captured.onFieldChange('product', 'P9', { orderedQuantity: 1 }, apply);
    });
    expect(apply).not.toHaveBeenCalled();
  });

  it('runs onUpdateRow for an inline row (PATCH persist path)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [{ id: 'L1', unitPrice: 15 }] } }),
      text: async () => '{}',
    });
    renderInline();
    expect(typeof captured.onUpdateRow).toBe('function');
    await act(async () => {
      await captured.onUpdateRow({ id: 'L1', unitPrice: 10 }, 'unitPrice', '15');
    });
    // A PATCH request should have been issued to the line detail URL.
    const calledPatch = globalThis.fetch.mock.calls.some(
      ([, opts]) => opts?.method === 'PATCH',
    );
    expect(calledPatch).toBe(true);
  });

  // ETP-4706 — closes the gap DetailView.currencyConversion.test.js documented as
  // untestable via full render (the effect that populates activeCurrencyConversionRef
  // needs the org-currency `/session` fetch to resolve first). The eTGOCurrencyRate
  // override path (line 2739-2748) skips the extra /validate-exchange-rate round trip,
  // so only /session needs mocking here — this reaches applyProductCurrencyConversion's
  // real `rate !== 1` conversion branch (previously only source-pattern-matched).
  it('converts newly-added line prices when a saved-order currency conversion is active', async () => {
    mockHook.selected = {
      id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false,
      currency: 'ARS', 'currency$_identifier': 'ARS', orderDate: '2026-01-01', eTGOCurrencyRate: '2',
    };
    mockHook.editing = { ...mockHook.selected };

    globalThis.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/session')) {
        return Promise.resolve({ ok: true, json: async () => ({ currencyId: 'USD' }) });
      }
      if (u.includes('/lines/callout')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ updates: { unitPrice: { value: 50 }, listPrice: { value: 50 } } }),
          text: async () => '{}',
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    renderInline();

    // Let the saved-state currency-sync effect's async IIFE resolve /session and
    // populate activeCurrencyConversionRef via the eTGOCurrencyRate override branch.
    await waitFor(() => {
      expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('/session'))).toBe(true);
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const apply = vi.fn();
    await act(async () => {
      await captured.onFieldChange('product', 'P9', { orderedQuantity: 1, unitPrice: 0 }, apply);
    });

    expect(apply).toHaveBeenCalled();
    const [result] = apply.mock.calls[0];
    // rate=2: rawPrice(50) * 2 = 100.00 — the real applyProductCurrencyConversion branch.
    expect(result.unitPrice).toBe(100);
    expect(result.listPrice).toBe(100);
    // The bug-fix reset (ETP-4029): lineNetAmount cleared so computeLineGrossAmount
    // recomputes from the CONVERTED price instead of a stale unconverted one.
    expect(result.grossAmount).toBeGreaterThan(0);
  });

  // addRow.onAdd's hiddenEntryDefaults loop (fromParent / fromSibling / static value)
  // and its pre-POST gross recompute — previously unreached (ETP-4706).
  it('addRow.onAdd fills hidden entry defaults (fromParent/fromSibling/value) before handleAddChild', async () => {
    mockHook.handleAddChild = vi.fn().mockResolvedValue({ id: 'L9' });
    mockHook.children = [{ id: 'L1', someSiblingField: 'SIB_VAL' }];
    mockHook.selected = { ...mockHook.selected, warehouse: 'WH_PARENT' };
    renderInline({
      addLineFields: {
        entry: ENTRY_FIELDS,
        derived: [],
        hidden: [
          { key: 'warehouse', fromParent: 'warehouse' },
          { key: 'fromSib', fromSibling: 'someSiblingField' },
          { key: 'staticField', value: 'STATIC' },
        ],
      },
    });
    const lineData = { product: 'P1', orderedQuantity: 2, unitPrice: 10, discount: 10 };
    await act(async () => {
      await captured.addRow.onAdd(lineData);
    });
    expect(lineData.warehouse).toBe('WH_PARENT');
    expect(lineData.fromSib).toBe('SIB_VAL');
    expect(lineData.staticField).toBe('STATIC');
    expect(mockHook.handleAddChild).toHaveBeenCalledWith(lineData);
  });

  it('addRow.onAdd does not overwrite a hidden default the caller already supplied', async () => {
    mockHook.handleAddChild = vi.fn().mockResolvedValue({ id: 'L9' });
    mockHook.selected = { ...mockHook.selected, warehouse: 'WH_PARENT' };
    renderInline({
      addLineFields: {
        entry: ENTRY_FIELDS,
        derived: [],
        hidden: [{ key: 'warehouse', fromParent: 'warehouse' }],
      },
    });
    const lineData = { product: 'P1', orderedQuantity: 1, unitPrice: 5, warehouse: 'WH_ALREADY_SET' };
    await act(async () => {
      await captured.addRow.onAdd(lineData);
    });
    expect(lineData.warehouse).toBe('WH_ALREADY_SET');
  });

  describe('addRow.convertOptimisticPrice', () => {
    it('returns the raw price unchanged when no currency conversion is active', () => {
      renderInline();
      expect(captured.addRow.convertOptimisticPrice(50)).toBe(50);
    });

    it('converts the raw price using the active saved-order conversion rate', async () => {
      mockHook.selected = {
        ...mockHook.selected,
        currency: 'ARS', orderDate: '2026-01-01', eTGOCurrencyRate: '2',
      };
      globalThis.fetch = vi.fn((url) => {
        if (String(url).includes('/session')) {
          return Promise.resolve({ ok: true, json: async () => ({ currencyId: 'USD' }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      renderInline();
      await waitFor(() => {
        expect(globalThis.fetch.mock.calls.some(([u]) => String(u).includes('/session'))).toBe(true);
      });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(captured.addRow.convertOptimisticPrice(50)).toBe(100);
    });

    it('returns the raw price unchanged for a non-positive or non-numeric input', () => {
      renderInline();
      expect(captured.addRow.convertOptimisticPrice(0)).toBe(0);
      expect(captured.addRow.convertOptimisticPrice(undefined)).toBe(undefined);
    });
  });
});
