/**
 * Coverage top-up for DetailView's isNew(recordId === 'new')-gated effects and
 * handlers — the identifier-resolution effect for default selector values, and
 * the isNew branches of handleAddLineClick / handleImportClick / the secondary
 * "add line" toggles (all module-internal, unreachable except through a live
 * render). Harness mirrors DetailView.lineCalloutFlow.vitest.jsx.
 */
import { render, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/sales-order/new', search: '' }),
  };
});

const mockNavigate = vi.fn();

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const mockHook = {
  loading: false,
  items: [],
  selected: null,
  editing: { documentNo: '', documentStatus: 'DR', uOM: 'U1' },
  children: [],
  childDefaults: {},
  isDirtyHeader: false,
  loadingChildren: false,
  childrenLoading: false,
  error: null,
  handleChange: vi.fn(),
  handleNew: vi.fn(),
  handleSave: vi.fn().mockResolvedValue({ id: 'NEW1' }),
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
    catalogs: { lines: { uOM: [{ id: 'U1', label: 'Unit' }] } },
    loading: false,
    catalogsLoaded: true,
  }),
}));

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({ visibleFields: [], hiddenFields: new Set() }),
}));

// Shared spy so the ETP-4744 suite can observe the initial-callout chain from the
// outside (`vi.hoisted` because `vi.mock` factories run before module-level consts).
const { executeCalloutMock } = vi.hoisted(() => ({ executeCalloutMock: vi.fn() }));

vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: executeCalloutMock }),
}));

vi.mock('@/hooks/useCurrency', () => ({ useCurrency: () => 'USD' }));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({
    computeLineGrossAmount: vi.fn(),
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

vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({ executeAction: vi.fn(), loading: false }) }));
vi.mock('@/hooks/useNeoAction', () => ({ useNeoAction: () => ({ execute: vi.fn(), loading: false }) }));

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

vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: (catalogs, entity, sel) => {
    if (sel?.field === 'uOM') return [{ id: 'U1', label: 'Unit' }];
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

const addLineCaptured = { onClick: null };
vi.mock('@/components/ui/add-line-button.jsx', () => ({
  AddLineButton: (props) => { addLineCaptured.onClick = props.onClick; return null; },
}));

const MockDetailTable = () => <div data-testid="mock-detail-table" />;
const MockForm = ({ data }) => <div data-testid="mock-form">{data?.documentNo}</div>;

const ENTRY_FIELDS = [
  { key: 'product', label: 'Product', type: 'selector', column: 'M_Product_ID' },
];

function detailElement(props = {}) {
  return (
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
        api={{ selectors: [{ field: 'uOM', entity: 'lines' }] }}
        entityLabel="Sales Order"
        detailLabel="Lines"
        titleField="documentNo"
        windowName="sales-order"
        recordId="new"
        token="test-token"
        apiBaseUrl="/api/sales-order"
        breadcrumb="Sales / Orders"
        linesLayout="inlineEditable"
        {...props}
      />
    </MemoryRouter>
  );
}

function renderNew(props = {}) {
  return render(detailElement(props));
}

describe('DetailView isNew-gated effects', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockHook.editing = { documentNo: '', documentStatus: 'DR', uOM: 'U1' };
  });

  it('resolves the $_identifier for a default selector value from loaded catalogs', async () => {
    renderNew();
    await waitFor(() => {
      expect(mockHook.handleChange).toHaveBeenCalledWith('uOM$_identifier', 'Unit');
    });
  });

  it('does not resolve an identifier the editing record already has', async () => {
    mockHook.editing = { documentNo: '', documentStatus: 'DR', uOM: 'U1', 'uOM$_identifier': 'Already Set' };
    renderNew();
    // Give the effect a tick to (not) fire.
    await act(async () => { await Promise.resolve(); });
    expect(mockHook.handleChange).not.toHaveBeenCalledWith('uOM$_identifier', expect.anything());
  });

  it('does not resolve an identifier when the selector value has no catalog match', async () => {
    mockHook.editing = { documentNo: '', documentStatus: 'DR', uOM: 'UNKNOWN' };
    renderNew();
    await act(async () => { await Promise.resolve(); });
    expect(mockHook.handleChange).not.toHaveBeenCalledWith('uOM$_identifier', expect.anything());
  });
});

/**
 * ETP-4830 regression — the gap `aadffb0b6` (windows/custom/user/index.jsx's own
 * `selectedRoleIds` reset) did NOT cover: `useEntity()` is called directly inside
 * `DetailView` (see `DetailView.jsx`'s own `hook = useEntity(...)`), so its `editing`/
 * `selected` state is NOT guaranteed to reset just because `recordId` changes — only a
 * component-TYPE swap (e.g. the generated `UserPage`'s `if (recordId) DetailView else
 * ListView`, which only triggers via the list route) actually remounts it. Navigating
 * directly from an EXISTING record to `'new'` (no stop at the list) keeps this exact
 * `DetailView` instance, and therefore its stale `hook.editing`, alive.
 *
 * The original guard — `if (isNew && !hook.editing) hook.handleNew()` — only fires on a
 * genuinely fresh mount, where `editing` starts at `null`. Once `editing` holds ANY
 * value (including a fully-populated OTHER record, left over from before the
 * navigation), the guard never fires again, so `data` (`hook.editing || currentItem ||
 * {}`) keeps reporting the OLD record's real `id` on what the route considers a blank
 * `'new'` page — exactly what let `AssignTemplateRolesControl` (`data?.id` truthy) skip
 * its save-first placeholder and render its real, interactive role-chip editor for a
 * user that was never actually saved (confirmed manually, roles chips included).
 *
 * Unlike `windows/custom/user/index.vitest.jsx`'s own `aadffb0b6` regression tests
 * (which `rerender()` a `UserWindow` whose OWN `selectedRoleIds` state has no such
 * "already set once" guard), this test targets `DetailView` itself — the shared
 * component every window's generated page renders — and specifically exercises the
 * guard's `!hook.editing` condition, which only a `rerender()` from a non-'new' recordId
 * with a populated `hook.editing` can reach (a single `renderNew()` mount never does,
 * since `editing` starts `null` and the effect never sees the "already set" case).
 */
describe('DetailView isNew-gated editing reset — existing record to new (no remount)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockHook.editing = { documentNo: '', documentStatus: 'DR', uOM: 'U1' };
    mockHook.selected = null;
  });

  it('calls handleNew when editing still holds a DIFFERENT persisted record (stale-state bug)', async () => {
    // Simulates the state DetailView would already be in after viewing an existing
    // record: `editing`/`selected` hold that record's real id and fields.
    mockHook.editing = { id: 'existing-1', documentNo: 'SO-001', documentStatus: 'CO', uOM: 'U1' };
    mockHook.selected = { id: 'existing-1', documentNo: 'SO-001' };
    const { rerender } = renderNew({ recordId: 'existing-1' });
    expect(mockHook.handleNew).not.toHaveBeenCalled();

    rerender(
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
          api={{ selectors: [{ field: 'uOM', entity: 'lines' }] }}
          entityLabel="Sales Order"
          detailLabel="Lines"
          titleField="documentNo"
          windowName="sales-order"
          recordId="new"
          token="test-token"
          apiBaseUrl="/api/sales-order"
          breadcrumb="Sales / Orders"
          linesLayout="inlineEditable"
        />
      </MemoryRouter>,
    );

    await waitFor(() => expect(mockHook.handleNew).toHaveBeenCalledTimes(1));
  });

  it('does not re-call handleNew once editing is already a blank/id-less new-record state', async () => {
    mockHook.editing = {};
    renderNew();
    await act(async () => { await Promise.resolve(); });
    expect(mockHook.handleNew).not.toHaveBeenCalled();
  });

  /**
   * ETP-5002 regression — the counterpart the ETP-4830 predicate got wrong.
   *
   * `handleSave` writes the persisted record (id included) into `editing` and only THEN
   * navigates to /{window}/{id}. On the render in between, the route is still 'new', so a
   * guard keyed on `isNew && editing.id` fires MID-SAVE: handleNew() wipes `editing`, opens
   * a fresh creation session, and the caller's remaining work persists a SECOND record.
   * Live cost: sales-order-happy-path created two orders, confirmed the first
   * (documentAction 200) and left the UI on the second, whose pill still read "Borrador".
   *
   * Staying on 'new' while `editing` gains an id must therefore be a no-op. The distinction
   * that matters is whether the recordId CHANGED, not whether an id is present.
   */
  it('does NOT call handleNew when our own save puts an id in editing while still on new', async () => {
    mockHook.editing = {};
    const { rerender } = renderNew();
    await act(async () => { await Promise.resolve(); });
    expect(mockHook.handleNew).not.toHaveBeenCalled();

    // The save landed: same 'new' route, editing now carries the persisted record.
    mockHook.editing = { id: 'NEW1', documentNo: 'SO-002', documentStatus: 'DR', uOM: 'U1' };
    rerender(
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
          api={{ selectors: [{ field: 'uOM', entity: 'lines' }] }}
          entityLabel="Sales Order"
          detailLabel="Lines"
          titleField="documentNo"
          windowName="sales-order"
          recordId="new"
          token="test-token"
          apiBaseUrl="/api/sales-order"
          breadcrumb="Sales / Orders"
          linesLayout="inlineEditable"
        />
      </MemoryRouter>,
    );
    await act(async () => { await Promise.resolve(); });

    expect(
      mockHook.handleNew,
      'resetting here wipes the just-saved record and causes a duplicate create',
    ).not.toHaveBeenCalled();
  });
});

describe('handleAddLineClick — isNew branch', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockHook.editing = { documentNo: '', documentStatus: 'DR', uOM: 'U1' };
    mockHook.handleSave = vi.fn().mockResolvedValue({ id: 'NEW1' });
  });

  it('saves the new header first, then navigates with openAddLine state', async () => {
    renderNew();
    await waitFor(() => expect(typeof addLineCaptured.onClick).toBe('function'));
    await act(async () => { await addLineCaptured.onClick(); });
    expect(mockHook.handleSave).toHaveBeenCalled();
    expect(mockHook.primeSaved).toHaveBeenCalledWith({ id: 'NEW1' });
    expect(mockNavigate).toHaveBeenCalledWith(
      '/sales-order/NEW1',
      expect.objectContaining({
        replace: true,
        state: expect.objectContaining({ openAddLine: true }),
      }),
    );
  });

  it('does not navigate when the header save yields no derivable id', async () => {
    mockHook.handleSave = vi.fn().mockResolvedValue({});
    renderNew();
    await waitFor(() => expect(typeof addLineCaptured.onClick).toBe('function'));
    await act(async () => { await addLineCaptured.onClick(); });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('handleImportClick — isNew branch (DetailExtraActions.onSave)', () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockHook.editing = { documentNo: '', documentStatus: 'DR', uOM: 'U1' };
    mockHook.handleSave = vi.fn().mockResolvedValue({ id: 'NEW1' });
  });

  const importCaptured = { onSave: null };
  const MockDetailExtraActions = (props) => { importCaptured.onSave = props.onSave; return null; };
  // `bottomSection` is rendered directly as a component when set — DetailExtraActions
  // is read off it as a static property (`bottomSection?.detailExtraActions`), so the
  // stub itself must be a valid (no-op) component, not a plain options object.
  const bottomSectionStub = () => null;
  bottomSectionStub.detailExtraActions = MockDetailExtraActions;

  it('saves the new header first, then navigates with openImportModal state', async () => {
    renderNew({ bottomSection: bottomSectionStub });
    await waitFor(() => expect(typeof importCaptured.onSave).toBe('function'));
    await act(async () => { await importCaptured.onSave('invoice'); });
    expect(mockHook.handleSave).toHaveBeenCalled();
    expect(mockHook.primeSaved).toHaveBeenCalledWith({ id: 'NEW1' });
    expect(mockNavigate).toHaveBeenCalledWith(
      '/sales-order/NEW1',
      expect.objectContaining({
        replace: true,
        state: expect.objectContaining({ openImportModal: 'invoice' }),
      }),
    );
  });

  it('returns false and does not navigate when the header save yields no id', async () => {
    mockHook.handleSave = vi.fn().mockResolvedValue({});
    renderNew({ bottomSection: bottomSectionStub });
    await waitFor(() => expect(typeof importCaptured.onSave).toBe('function'));
    let outcome;
    await act(async () => { outcome = await importCaptured.onSave(); });
    expect(outcome).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

/**
 * ETP-4744 — the initial-callout chain must be armed by the arrival of the defaults
 * SESSION, not by `editing` becoming non-empty for any reason.
 *
 * `useEntity` opens a new record's form empty and fetches `GET /{entity}/defaults`
 * asynchronously, exposing `defaultsPending: true` while the request is in flight
 * (ETP-5002's request window). `DetailView`'s effect used to arm its one-shot latch
 * (`defaultCalloutsTriggeredRef`) as soon as `editing` held ANY value; a user typing
 * into a plain, non-selector field during that window consumed the latch with an empty
 * trigger list, so the chain never ran once the defaults merged (docs/feedback.md,
 * [2026-07-31] ETP-4741). The latch reset only on `!isNew`, so it stayed broken for the
 * whole creation session.
 *
 * These tests mount the real DetailView and drive a mutable fake hook through the exact
 * sequence. `executeCallout` fires after a 400 ms stagger, hence the bounded `waitFor`.
 */
describe('initial callout chain is armed by the defaults session (ETP-4744)', () => {
  const HEADER_SELECTORS = [
    { field: 'businessPartner', entity: 'header', inputMode: 'search' },
    { field: 'partnerAddress', entity: 'header', inputMode: 'dependent' },
    { field: 'priceList', entity: 'header', inputMode: 'selector' },
  ];
  const api = { selectors: HEADER_SELECTORS };

  afterEach(() => {
    vi.clearAllMocks();
    mockHook.editing = { documentNo: '', documentStatus: 'DR', uOM: 'U1' };
    mockHook.defaultsPending = false;
  });

  it('still fires for a default selector when the user typed first while defaults were in flight', async () => {
    mockHook.editing = {};
    mockHook.defaultsPending = true;
    const { rerender } = renderNew({ api });
    await act(async () => { await Promise.resolve(); });
    expect(executeCalloutMock).not.toHaveBeenCalled();

    // The user types into a plain, non-selector field before the defaults land.
    mockHook.editing = { documentNo: 'PO-TYPED' };
    rerender(detailElement({ api }));
    await act(async () => { await Promise.resolve(); });
    expect(
      executeCalloutMock,
      'a keystroke before the defaults land must not consume the one-shot chain',
    ).not.toHaveBeenCalled();

    // The defaults merge (the keystroke survives) and the session settles.
    mockHook.editing = { documentNo: 'PO-TYPED', businessPartner: 'BP1' };
    mockHook.defaultsPending = false;
    rerender(detailElement({ api }));
    await waitFor(
      () => expect(executeCalloutMock).toHaveBeenCalledWith(
        'businessPartner', 'BP1', expect.any(Object), expect.any(Object),
      ),
      { timeout: 3000 },
    );
  });

  it('fires for a default selector when the defaults settle with no user typing', async () => {
    mockHook.editing = {};
    mockHook.defaultsPending = true;
    const { rerender } = renderNew({ api });

    mockHook.editing = { businessPartner: 'BP1' };
    mockHook.defaultsPending = false;
    rerender(detailElement({ api }));
    await waitFor(
      () => expect(executeCalloutMock).toHaveBeenCalledWith(
        'businessPartner', 'BP1', expect.any(Object), expect.any(Object),
      ),
      { timeout: 3000 },
    );
    // The `dependent` selector (partnerAddress) must never be part of the chain.
    expect(executeCalloutMock.mock.calls.map(([field]) => field)).not.toContain('partnerAddress');
  });

  it('does not fire while the defaults request is still pending, even with a selector value', async () => {
    mockHook.editing = { businessPartner: 'BP1' };
    mockHook.defaultsPending = true;
    renderNew({ api });
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    expect(
      executeCalloutMock,
      'the chain is armed by the defaults session settling, not by a selector already holding a value',
    ).not.toHaveBeenCalled();
  });

  it('does not fire the chain for a non-new record', async () => {
    mockHook.editing = { id: 'SO-1', businessPartner: 'BP1' };
    mockHook.defaultsPending = false;
    renderNew({ api, recordId: 'SO-1' });
    await act(async () => { await new Promise((r) => setTimeout(r, 700)); });
    expect(executeCalloutMock).not.toHaveBeenCalled();
  });
});
