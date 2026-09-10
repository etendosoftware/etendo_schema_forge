/**
 * ETP-5147 — "Todos los documentos: cambio de moneda en cabecera no se
 * auto-guarda al agregar líneas".
 *
 * Root cause: handleAddLineClick / handleSecondaryAddLineToggle /
 * handleCustomModalAddClick (DetailView.jsx) only auto-save the header when
 * the record `isNew`. The `else` branch — an ALREADY-SAVED record with a
 * pending header edit (e.g. currency changed but not yet saved) — opens the
 * line-creation UI straight away, so the new line is created against stale
 * header data. The dirty-check signal already exists (`hook.isDirtyHeader`,
 * wired into `computeIsDirty`/`isDirty`) but none of the three handlers
 * consult it. Precedent: `maybeSaveBeforeProcess` / `maybeSaveBeforeConfirm`
 * in detailViewHelpers.jsx (ETP-4542 / ETP-4940) already gate other
 * "fire an action against the current record" entry points the exact same
 * way; this fix is expected to apply the same `if (!dirty) return true; const
 * saved = await handleSave({ silent: true }); return !!saved?.id;` shape to
 * these three call sites (or route them through one of the existing helpers).
 *
 * Each handler is exercised end-to-end through its REAL rendered trigger
 * (not a mocked shortcut), following the precedent in
 * DetailView.addLineImportHandlers.vitest.jsx / DetailView.secondaryAddLineHandlers.vitest.jsx:
 *   1. Primary "Añadir línea" button (handleAddLineClick, non-empty lines table)
 *   2. Secondary tab inline add button (handleSecondaryAddLineToggle, non-empty tab)
 *   3. Secondary tab custom-modal add button (handleCustomModalAddClick)
 *
 * "The line UI opens" is asserted via an observable side effect passed into
 * the (mocked) table components — `addRow.active` for 1 and 2, the modal's
 * own `open` prop for 3 — rather than relying on DOM structure the real
 * generated table would produce.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DetailView } from '../DetailView.jsx';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
    useLocation: () => ({ pathname: '/sales-order/123', search: '', state: {} }),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));

const mockHook = {
  loading: false,
  items: [],
  selected: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false, currency: 'EUR' },
  editing: { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false, currency: 'EUR' },
  children: [{ id: 'L1', product: 'P1', 'product$_identifier': 'Widget', lineNetAmount: 100 }],
  isDirtyHeader: false,
  loadingChildren: false,
  childrenLoading: false,
  error: null,
  handleChange: vi.fn(),
  handleSave: vi.fn().mockResolvedValue({ id: '123' }),
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

// Shared stand-in for every secondary useEntity() call — mutate .children
// per test to steer a given secondary tab away from its own empty state.
const mockSecondaryHook = {
  loading: false,
  children: [],
  selected: mockHook.selected,
  editing: mockHook.editing,
  handleAddChild: vi.fn(),
  handleSelect: vi.fn(),
  handleUpdateChild: vi.fn(),
  handleDeleteChild: vi.fn(),
  childDefaults: {},
};

vi.mock('@/hooks/useEntity', () => ({
  useEntity: (entity, detailEntity) => (detailEntity === 'lines' ? mockHook : mockSecondaryHook),
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
  useLineGrossAmount: () => ({ grossAmount: 0, calculate: vi.fn() }),
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

// Reflects the `addRow.active` flag it was given so a test can observe
// whether the line-creation UI actually opened, without depending on the
// real (unmocked) table's DOM structure.
const MockTable = (props) => (
  <div data-testid="mock-table" data-add-active={String(!!props.addRow?.active)}>
    {(props.data || []).map(r => <div key={r.id}>{r.id}</div>)}
  </div>
);

const StubSecondaryTable = (props) => (
  <div data-testid="stub-secondary-table" data-add-active={String(!!props.addRow?.active)} />
);

// Stub `customAddModal` component — reflects its own `open` prop directly,
// which is exactly what DetailView flips via `customModalState`.
const StubCustomModal = ({ open }) => (open ? <div data-testid="custom-modal-open" /> : null);

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

function pendingSave() {
  let resolveSave;
  const promise = new Promise((resolve) => { resolveSave = resolve; });
  return { promise, resolveSave };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHook.isDirtyHeader = false;
  mockHook.children = [{ id: 'L1', product: 'P1', 'product$_identifier': 'Widget', lineNetAmount: 100 }];
  mockHook.handleSave = vi.fn().mockResolvedValue({ id: '123' });
  mockSecondaryHook.children = [];
});

describe('ETP-5147 — handleAddLineClick auto-saves a dirty header (primary "Añadir línea")', () => {
  it('dirty header + save succeeds: handleSave({silent:true}) is awaited BEFORE the line UI opens', async () => {
    mockHook.isDirtyHeader = true;
    const { promise, resolveSave } = pendingSave();
    mockHook.handleSave = vi.fn(() => promise);
    const user = userEvent.setup();
    renderDetailView();

    await user.click(screen.getByTestId('action-add-line'));

    expect(mockHook.handleSave).toHaveBeenCalledWith({ silent: true });
    // Still pending: the line UI must NOT have opened yet.
    expect(screen.getByTestId('mock-table')).toHaveAttribute('data-add-active', 'false');

    resolveSave({ id: '123' });
    await waitFor(() =>
      expect(screen.getByTestId('mock-table')).toHaveAttribute('data-add-active', 'true'));
  });

  it('dirty header + save fails: the line UI does NOT open (aborts)', async () => {
    mockHook.isDirtyHeader = true;
    mockHook.handleSave = vi.fn().mockResolvedValue(null); // handleSave already surfaced the error
    const user = userEvent.setup();
    renderDetailView();

    await user.click(screen.getByTestId('action-add-line'));

    await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalledWith({ silent: true }));
    expect(screen.getByTestId('mock-table')).toHaveAttribute('data-add-active', 'false');
  });

  it('no pending changes: handleSave is NOT called, the line UI opens directly', async () => {
    mockHook.isDirtyHeader = false;
    const user = userEvent.setup();
    renderDetailView();

    await user.click(screen.getByTestId('action-add-line'));

    expect(mockHook.handleSave).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId('mock-table')).toHaveAttribute('data-add-active', 'true'));
  });

  it('[regression] isNew record keeps saving unconditionally and navigating (unaffected by the dirty guard)', async () => {
    mockHook.isDirtyHeader = false; // isNew path never reads isDirtyHeader — it always saves.
    // renderNewRecordSaveActions only dereferences draftMode.label for its
    // "Complete" button when children.length > 0 — no draftMode is passed
    // here, so keep children empty to stay on the plain "Save" button.
    mockHook.children = [];
    mockHook.handleSave = vi.fn().mockResolvedValue({ id: 'NEW-1', documentNo: 'SO-NEW' });
    const user = userEvent.setup();
    renderDetailView({ recordId: 'new' });

    await user.click(screen.getByTestId('action-add-line'));

    await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalledTimes(1));
    expect(mockNavigate).toHaveBeenCalledWith('/sales-order/NEW-1', {
      replace: true,
      state: { openAddLine: true, justSaved: { id: 'NEW-1', documentNo: 'SO-NEW' } },
    });
  });
});

describe('ETP-5147 — handleSecondaryAddLineToggle auto-saves a dirty header (secondary tab inline add)', () => {
  const secondaryTabs = [{
    key: 'addresses',
    label: 'Addresses',
    Table: StubSecondaryTable,
    addLineFields: { entry: [{ key: 'street', label: 'Street', type: 'text' }], derived: [] },
  }];

  beforeEach(() => {
    // Non-empty so the tab renders its normal table + add-line bar instead
    // of the empty-state illustration (whose "add" trigger is a different,
    // already-covered code path in DetailView.secondaryAddLineHandlers.vitest.jsx).
    mockSecondaryHook.children = [{ id: 'A1', street: 'Main St' }];
  });

  async function openAddressesTabAndClickAdd(user) {
    renderDetailView({ secondaryTabs });
    await user.click(screen.getByTestId('tab-addresses'));
    await screen.findByTestId('stub-secondary-table');
    await user.click(screen.getByTestId('action-add-line'));
  }

  it('dirty header + save succeeds: handleSave({silent:true}) is awaited BEFORE the line UI opens', async () => {
    mockHook.isDirtyHeader = true;
    const { promise, resolveSave } = pendingSave();
    mockHook.handleSave = vi.fn(() => promise);
    const user = userEvent.setup();

    await openAddressesTabAndClickAdd(user);

    expect(mockHook.handleSave).toHaveBeenCalledWith({ silent: true });
    expect(screen.getByTestId('stub-secondary-table')).toHaveAttribute('data-add-active', 'false');

    resolveSave({ id: '123' });
    await waitFor(() =>
      expect(screen.getByTestId('stub-secondary-table')).toHaveAttribute('data-add-active', 'true'));
  });

  it('dirty header + save fails: the line UI does NOT open (aborts)', async () => {
    mockHook.isDirtyHeader = true;
    mockHook.handleSave = vi.fn().mockResolvedValue(null);
    const user = userEvent.setup();

    await openAddressesTabAndClickAdd(user);

    await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalledWith({ silent: true }));
    expect(screen.getByTestId('stub-secondary-table')).toHaveAttribute('data-add-active', 'false');
  });

  it('no pending changes: handleSave is NOT called, the line UI opens directly', async () => {
    mockHook.isDirtyHeader = false;
    const user = userEvent.setup();

    await openAddressesTabAndClickAdd(user);

    expect(mockHook.handleSave).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId('stub-secondary-table')).toHaveAttribute('data-add-active', 'true'));
  });

  it('[regression] isNew + requireSavedRecord keeps saving unconditionally and navigating', async () => {
    mockHook.isDirtyHeader = false;
    mockHook.children = []; // renderNewRecordSaveActions dereferences draftMode.label only when children.length > 0
    // Override this describe block's own beforeEach (non-empty, to bypass the
    // tab's empty state for the other tests) — this scenario needs the empty
    // state itself, whose "add" trigger is the only one wired for isNew here.
    mockSecondaryHook.children = [];
    mockHook.handleSave = vi.fn().mockResolvedValue({ id: 'NEW-3', documentNo: 'SO-NEW-3' });
    const user = userEvent.setup();
    renderDetailView({
      recordId: 'new',
      secondaryTabs: [{ ...secondaryTabs[0], requireSavedRecord: true }],
    });
    await user.click(screen.getByTestId('tab-addresses'));
    await screen.findByTestId('secondary-tab-empty-state');
    await user.click(screen.getByRole('button', { name: /addEntity/i }));

    await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalledTimes(1));
    expect(mockNavigate).toHaveBeenCalledWith('/sales-order/NEW-3', {
      replace: true,
      state: { openSecondaryTab: 'addresses', openAddSecondaryLine: true, justSaved: { id: 'NEW-3', documentNo: 'SO-NEW-3' } },
    });
  });
});

describe('ETP-5147 — handleCustomModalAddClick auto-saves a dirty header (secondary tab custom modal add)', () => {
  const secondaryTabs = [{
    key: 'contactAddress',
    label: 'Direcciones',
    Table: StubSecondaryTable,
    customAddModal: StubCustomModal,
  }];

  async function openContactAddressTabAndClickAdd(user) {
    renderDetailView({ secondaryTabs });
    await user.click(screen.getByTestId('tab-contactAddress'));
    await screen.findByTestId('stub-secondary-table');
    await user.click(screen.getByTestId('action-add-line'));
  }

  it('dirty header + save succeeds: handleSave({silent:true}) is awaited BEFORE the modal opens', async () => {
    mockHook.isDirtyHeader = true;
    const { promise, resolveSave } = pendingSave();
    mockHook.handleSave = vi.fn(() => promise);
    const user = userEvent.setup();

    await openContactAddressTabAndClickAdd(user);

    expect(mockHook.handleSave).toHaveBeenCalledWith({ silent: true });
    expect(screen.queryByTestId('custom-modal-open')).toBeNull();

    resolveSave({ id: '123' });
    await waitFor(() => expect(screen.getByTestId('custom-modal-open')).toBeInTheDocument());
  });

  it('dirty header + save fails: the modal does NOT open (aborts)', async () => {
    mockHook.isDirtyHeader = true;
    mockHook.handleSave = vi.fn().mockResolvedValue(null);
    const user = userEvent.setup();

    await openContactAddressTabAndClickAdd(user);

    await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalledWith({ silent: true }));
    expect(screen.queryByTestId('custom-modal-open')).toBeNull();
  });

  it('no pending changes: handleSave is NOT called, the modal opens directly', async () => {
    mockHook.isDirtyHeader = false;
    const user = userEvent.setup();

    await openContactAddressTabAndClickAdd(user);

    expect(mockHook.handleSave).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('custom-modal-open')).toBeInTheDocument());
  });

  it('[regression] isNew + requireSavedRecord keeps saving unconditionally and navigating', async () => {
    mockHook.isDirtyHeader = false;
    mockHook.children = [];
    mockHook.handleSave = vi.fn().mockResolvedValue({ id: 'NEW-4', documentNo: 'SO-NEW-4' });
    const user = userEvent.setup();
    renderDetailView({
      recordId: 'new',
      secondaryTabs: [{ ...secondaryTabs[0], requireSavedRecord: true }],
    });
    await user.click(screen.getByTestId('tab-contactAddress'));
    await user.click(screen.getByTestId('action-add-line'));

    await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalledTimes(1));
    expect(mockNavigate).toHaveBeenCalledWith('/sales-order/NEW-4', {
      replace: true,
      state: { openSecondaryTab: 'contactAddress', openAddSecondaryLine: true, justSaved: { id: 'NEW-4', documentNo: 'SO-NEW-4' } },
    });
  });
});
