/**
 * ETP-5116 — secondaryTabs.visibleWhenCapability integration coverage.
 *
 * Mirrors DetailView.render.vitest.jsx's mount setup (same mock list — DetailView
 * pulls in a large dependency surface) but adds a mockable useCapabilitiesSafe()
 * so each test controls whether the gated tab's capability is granted.
 *
 * Covers what the pure buildInitialTabs unit tests (DetailView.secondaryTabsVisibleWhenCapability.vitest.jsx)
 * cannot exercise: the real tab-strip button visibility, AND the two content-render
 * edge cases —
 *   1. a Panel-type secondaryTab, which DetailView otherwise mounts eagerly
 *      regardless of which tab is active (so its onCount can fire without a click)
 *      — this must NOT bypass a capability gate.
 *   2. the openSecondaryTab deep-link (location.state), which must not be able to
 *      activate a capability-hidden tab.
 */
// @covers tools/app-shell/src/components/contract-ui/DetailView.jsx
// @covers tools/app-shell/src/components/contract-ui/detailViewHelpers.jsx
// @covers tools/app-shell/src/components/contract-ui/useSecondaryTabVisibility.js
// @covers tools/app-shell/src/components/contract-ui/evalTabVisible.js
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

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

// Entity-layer spy. Every useEntity(entity, childEntity, ...) call is logged, and each hook gets a
// fetchChildren wrapper tagged with the child entity it was built for (null = the tab is
// hidden/ungated-less, so the real useEntity would early-return). Wrappers are cached per child
// entity so hook identity stays stable across renders, like the previous static mock.
const entitySpy = vi.hoisted(() => ({ calls: [], fetches: [], wrappers: new Map() }));
vi.mock('@/hooks/useEntity', () => ({
  useEntity: (_entity, childEntity) => {
    entitySpy.calls.push(childEntity);
    if (childEntity === undefined) return mockHook;
    if (!entitySpy.wrappers.has(childEntity)) {
      // Own enumerable live getters (DetailView spreads these hooks, so a prototype link would be lost,
      // and a plain spread would go stale when tests mutate mockHook.selected/editing).
      const wrapper = {};
      Object.keys(mockHook).forEach((k) => Object.defineProperty(wrapper, k, { enumerable: true, configurable: true, get: () => mockHook[k] }));
      Object.defineProperty(wrapper, 'fetchChildren', { enumerable: true, value: (...args) => {
        entitySpy.fetches.push({ childEntity, args });
        return mockHook.fetchChildren(...args);
      } });
      entitySpy.wrappers.set(childEntity, wrapper);
    }
    return entitySpy.wrappers.get(childEntity);
  },
  extractErrorMessage: async () => 'Error',
}));
vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({ catalogs: {}, loading: false }) }));
vi.mock('@/hooks/useDisplayLogic', () => ({ useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set() }) }));
vi.mock('@/hooks/useCallout', () => ({ useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }) }));
vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }));
// useCurrencyId lives in its own module so mocking useCurrency (above) keeps working; null = still loading.
const orgCurrencyIdRef = vi.hoisted(() => ({ current: null }));
vi.mock('@/hooks/useCurrencyId', () => ({ useCurrencyId: () => orgCurrencyIdRef.current }));
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
        apiBaseUrl="/api/sales-order"
        breadcrumb="Sales / Orders"
        {...props}
      />
    </MemoryRouter>,
  );
}

const gatedPanelTab = { key: 'accounting', label: 'Accounting', Panel: MockPanel, visibleWhenCapability: 'showAccountingFields' };

describe('DetailView — secondaryTabs.visibleWhenCapability (ETP-5116)', () => {
  beforeEach(() => {
    capabilitiesRef.current = {};
    locationStateRef.current = undefined;
    MockPanel.mockClear();
  });

  it('hides the tab-strip button and never mounts the Panel when the capability is not granted', () => {
    capabilitiesRef.current = { showAccountingFields: false };
    renderDetailView({ secondaryTabs: [gatedPanelTab] });

    expect(screen.queryByTestId('tab-accounting')).not.toBeInTheDocument();
    // Panel tabs are normally mounted eagerly regardless of active tab (so their
    // onCount can fire without a click) — confirming it does NOT mount here is
    // the actual regression guard: a naive isActiveTab-only check would have
    // let it through.
    expect(screen.queryByTestId('accounting-panel')).not.toBeInTheDocument();
    expect(MockPanel).not.toHaveBeenCalled();
  });

  it('shows the tab-strip button and mounts the Panel when the capability IS granted', () => {
    capabilitiesRef.current = { showAccountingFields: true };
    renderDetailView({ secondaryTabs: [gatedPanelTab] });

    expect(screen.getByTestId('tab-accounting')).toBeInTheDocument();
    expect(screen.getByTestId('accounting-panel')).toBeInTheDocument();
  });

  it('a stale openSecondaryTab deep-link targeting the hidden tab does not activate or render it', () => {
    capabilitiesRef.current = { showAccountingFields: false };
    locationStateRef.current = { openSecondaryTab: 'accounting' };
    renderDetailView({ secondaryTabs: [gatedPanelTab] });

    expect(screen.queryByTestId('tab-accounting')).not.toBeInTheDocument();
    expect(screen.queryByTestId('accounting-panel')).not.toBeInTheDocument();
  });

  it('a secondaryTab with no visibleWhenCapability declared is unaffected (no regression)', () => {
    capabilitiesRef.current = {};
    renderDetailView({ secondaryTabs: [{ key: 'notes', label: 'Notes', Table: MockTable }] });

    expect(screen.getByTestId('tab-notes')).toBeInTheDocument();
  });
});

// secondaryTabs.visibleWhen (record gate) — the foreign-currency exchange-rates tab shape.
describe('DetailView — secondaryTabs.visibleWhen (record-gated tab)', () => {
  const foreign = (record, ctx) =>
    ctx['OrgCurrencyId'] != null &&
    ((record['currency'] != null && record['currency'] !== '') && record['currency'] !== ctx['OrgCurrencyId']);
  // Not the real 'exchangeRates' key on purpose: DetailView has a separate, unconditional
  // exchange-rates force-fetch effect keyed on that name that would pollute the fetch-on-reveal counts.
  const ratesTab = { key: 'fxRates', label: 'Rates', Table: MockTable, visibleWhen: foreign, tabOrder: 50 };
  // The strip button of the active tab carries `text-foreground` (inactive: `text-muted-foreground`).
  const isActive = (key) => screen.getByTestId(`tab-${key}`).classList.contains('text-foreground');
  const saved = (currency) => ({ id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false, currency });

  const tree = (props = {}) => (
    <MemoryRouter>
      <DetailView
        entity="header" detailEntity="lines" Form={MockForm} DetailTable={MockTable} DetailForm={null}
        summary={[]} statusField="documentStatus" processes={[]}
        addLineFields={{ entry: [{ key: 'product', label: 'Product', type: 'selector', column: 'M_Product_ID' }], derived: [] }}
        api={{}} entityLabel="Sales Order" detailLabel="Lines" titleField="documentNo" windowName="sales-order"
        recordId="123" token="test-token" apiBaseUrl="/api/sales-order" breadcrumb="Sales / Orders"
        secondaryTabs={[ratesTab]} {...props}
      />
    </MemoryRouter>
  );
  const setRecord = (currency, { savedToo = true } = {}) => {
    mockHook.editing = saved(currency);
    mockHook.selected = savedToo ? saved(currency) : undefined;
  };
  const forceFetches = () => mockHook.fetchChildren.mock.calls.filter(c => c[1]?.force === true && c[0] === '123');

  beforeEach(() => {
    capabilitiesRef.current = {};
    locationStateRef.current = undefined;
    orgCurrencyIdRef.current = 'EUR';
    mockHook.fetchChildren.mockClear();
    setRecord('EUR');
  });
  afterEach(() => {
    mockHook.editing = saved(undefined);
    mockHook.selected = saved(undefined);
    delete mockHook.editing.currency;
    delete mockHook.selected.currency;
  });

  it('hides the tab when the record currency equals the org currency', () => {
    render(tree());
    expect(screen.queryByTestId('tab-fxRates')).not.toBeInTheDocument();
  });

  it('shows the tab when the record currency differs from the org currency', () => {
    setRecord('USD');
    render(tree());
    expect(screen.getByTestId('tab-fxRates')).toBeInTheDocument();
  });

  it('keeps the tab hidden while the org currency is still loading', () => {
    orgCurrencyIdRef.current = null;
    setRecord('USD');
    render(tree());
    expect(screen.queryByTestId('tab-fxRates')).not.toBeInTheDocument();
  });

  it('keeps the tab hidden for an empty or null record currency', () => {
    setRecord('');
    const { unmount } = render(tree());
    expect(screen.queryByTestId('tab-fxRates')).not.toBeInTheDocument();
    unmount();
    setRecord(null);
    render(tree());
    expect(screen.queryByTestId('tab-fxRates')).not.toBeInTheDocument();
  });

  it('an unsaved invoice (editing only, no selected) shows/hides live as currency changes', () => {
    setRecord('EUR', { savedToo: false });
    const { rerender } = render(tree());
    expect(screen.queryByTestId('tab-fxRates')).not.toBeInTheDocument();
    setRecord('USD', { savedToo: false });
    rerender(tree());
    expect(screen.getByTestId('tab-fxRates')).toBeInTheDocument();
    setRecord('EUR', { savedToo: false });
    rerender(tree());
    expect(screen.queryByTestId('tab-fxRates')).not.toBeInTheDocument();
  });

  it('composes with visibleWhenCapability as AND', () => {
    setRecord('USD');
    const tab = { ...ratesTab, visibleWhenCapability: 'showFx' };
    capabilitiesRef.current = { showFx: false };
    const { unmount } = render(tree({ secondaryTabs: [tab] }));
    expect(screen.queryByTestId('tab-fxRates')).not.toBeInTheDocument();
    unmount();
    capabilitiesRef.current = { showFx: true };
    render(tree({ secondaryTabs: [tab] }));
    expect(screen.getByTestId('tab-fxRates')).toBeInTheDocument();
  });

  it('a sibling tab without visibleWhen is unaffected and the secondaryTabs array is not mutated', () => {
    const notes = { key: 'notes', label: 'Notes', Table: MockTable };
    const tabs = [notes, ratesTab];
    render(tree({ secondaryTabs: tabs }));
    expect(screen.getByTestId('tab-notes')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-fxRates')).not.toBeInTheDocument();
    expect(tabs).toEqual([notes, ratesTab]);
    expect(tabs).toHaveLength(2);
  });

  it('a deep link to a hidden tab is a no-op', () => {
    locationStateRef.current = { openSecondaryTab: 'fxRates' };
    render(tree());
    expect(screen.queryByTestId('tab-fxRates')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tab-fxRates')).not.toBeInTheDocument();
  });

  it('a throwing predicate hides the tab without crashing the render', () => {
    const bad = { ...ratesTab, visibleWhen: () => { throw new Error('boom'); } };
    render(tree({ secondaryTabs: [bad] }));
    expect(screen.queryByTestId('tab-fxRates')).not.toBeInTheDocument();
    expect(screen.getByTestId('tab-others')).toBeInTheDocument();
  });

  describe('exchangeRates tab (real key): no request while hidden', () => {
    const rates = { key: 'exchangeRates', label: 'Rates', Table: MockTable, visibleWhen: foreign, tabOrder: 50 };
    const withRates = () => tree({ secondaryTabs: [rates] });
    // fetches issued on a hook actually bound to the exchangeRates child entity (null-bound hooks no-op in the real useEntity)
    const ratesFetches = () => entitySpy.fetches.filter(f => f.childEntity === 'exchangeRates');
    const ratesBindings = () => entitySpy.calls.filter(c => c === 'exchangeRates');
    beforeEach(() => { entitySpy.calls.length = 0; entitySpy.fetches.length = 0; });

    it('currency == org currency: never binds a hook to exchangeRates nor fetches it, even after currency/total changes', () => {
      const { rerender } = render(withRates());
      expect(ratesBindings()).toHaveLength(0);
      mockHook.selected = { ...saved('EUR'), grandTotalAmount: 50 };
      mockHook.editing = { ...mockHook.selected };
      rerender(withRates());
      mockHook.selected = { ...saved('EUR'), grandTotalAmount: 75, eTGOCurrencyRate: 2 };
      rerender(withRates());
      expect(ratesBindings()).toHaveLength(0);
      expect(ratesFetches()).toHaveLength(0);
    });

    it('org currency still loading: no exchangeRates request even for a foreign-currency invoice', () => {
      orgCurrencyIdRef.current = null;
      setRecord('USD');
      const { rerender } = render(withRates());
      mockHook.selected = { ...saved('USD'), grandTotalAmount: 10 };
      rerender(withRates());
      expect(ratesBindings()).toHaveLength(0);
      expect(ratesFetches()).toHaveLength(0);
    });

    it('positive control: a foreign-currency saved invoice does bind and fetch exchangeRates', () => {
      setRecord('USD');
      render(withRates());
      expect(ratesBindings().length).toBeGreaterThan(0);
      expect(ratesFetches().some(f => f.args[0] === '123' && f.args[1]?.force === true)).toBe(true);
    });
  });

  describe('fetch-on-reveal', () => {
    it('does not fetch on first render of an already-visible tab', () => {
      setRecord('USD');
      render(tree());
      expect(forceFetches()).toHaveLength(0);
    });

    it('force-fetches once when the org currency resolves for a saved foreign-currency invoice', () => {
      orgCurrencyIdRef.current = null;
      setRecord('USD');
      const { rerender } = render(tree());
      expect(screen.queryByTestId('tab-fxRates')).not.toBeInTheDocument();
      orgCurrencyIdRef.current = 'EUR';
      rerender(tree());
      expect(screen.getByTestId('tab-fxRates')).toBeInTheDocument();
      expect(forceFetches()).toHaveLength(1);
    });

    it('does not fetch when the tab is revealed on an unsaved invoice (no selected id)', () => {
      setRecord('EUR', { savedToo: false });
      const { rerender } = render(tree());
      setRecord('USD', { savedToo: false });
      rerender(tree());
      expect(screen.getByTestId('tab-fxRates')).toBeInTheDocument();
      expect(forceFetches()).toHaveLength(0);
    });
  });

  describe('active tab follows its key', () => {
    it('keeps "others" active when the rates tab appears before it, then when it hides again', () => {
      const { rerender } = render(tree());
      fireEvent.click(screen.getByTestId('tab-others'));
      expect(isActive('others')).toBe(true);
      setRecord('USD');
      rerender(tree());
      expect(screen.getByTestId('tab-fxRates')).toBeInTheDocument();
      // the index would have landed on the rates tab without the resolver
      expect(isActive('others')).toBe(true);
      expect(isActive('fxRates')).toBe(false);
      setRecord('EUR');
      rerender(tree());
      expect(screen.queryByTestId('tab-fxRates')).not.toBeInTheDocument();
      expect(isActive('others')).toBe(true);
    });

    it('falls back to the first tab when the active tab is the one that hides', () => {
      setRecord('USD');
      const { rerender } = render(tree());
      fireEvent.click(screen.getByTestId('tab-fxRates'));
      expect(isActive('fxRates')).toBe(true);
      setRecord('EUR');
      rerender(tree());
      expect(screen.queryByTestId('tab-fxRates')).not.toBeInTheDocument();
      const tabKeys = screen.getAllByTestId(/^tab-/).map(b => b.getAttribute('data-testid'));
      expect(isActive(tabKeys[0].replace('tab-', ''))).toBe(true);
    });

    it('a plain user click on the tab is not reverted', () => {
      setRecord('USD');
      const { rerender } = render(tree());
      fireEvent.click(screen.getByTestId('tab-fxRates'));
      rerender(tree());
      expect(isActive('fxRates')).toBe(true);
    });
  });
});
