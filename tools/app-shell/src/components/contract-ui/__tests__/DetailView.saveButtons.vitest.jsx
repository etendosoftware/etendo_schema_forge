import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mirror DetailView.vitest.jsx mock setup so the component mounts in isolation.
// This spec drives the footer Save / Confirm buttons by CLICKING them, which is
// the only way to execute the async onClick handlers inside
// renderDraftModeSaveActions / renderNewRecordSaveActions /
// renderExistingRecordSaveAction (returning the JSX alone does not run them).
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams()],
  useLocation: () => ({ pathname: '/test/123', search: '', hash: '' }),
}));

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key) => key,
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

const mockNavigate = vi.fn();

const mockHook = {
  items: [],
  selected: null,
  editing: null,
  loading: false,
  saving: false,
  isSaving: false,
  isDirtyHeader: false,
  error: null,
  children: [],
  childrenLoading: false,
  fetchById: vi.fn(),
  primeSaved: vi.fn(),
  handleSelect: vi.fn(),
  handleChange: vi.fn(),
  handleSave: vi.fn(() => Promise.resolve({ id: '123' })),
  handleSaveAndProcess: vi.fn(() => Promise.resolve({ id: '123' })),
  // ETP-4830 — DetailView's own isNew-gated effect now calls this whenever `editing`
  // still holds a DIFFERENT persisted record's id (see DetailView.jsx). This file's
  // `resetHook()` always seeds `editing` from the "existing record" fixture (`rec`,
  // id: '123'), which the "new record" tests below render with `recordId="new"`
  // without overriding — previously harmless (the old guard never re-fired once
  // `editing` held any value), now exercised. A no-op stub is enough: these tests
  // assert on handleSave/onAfterCreate/navigate, not on handleNew's own behavior.
  handleNew: vi.fn(),
  handleCreate: vi.fn(),
  handleDelete: vi.fn(),
  handleAddChild: vi.fn(),
  handleUpdateChild: vi.fn(),
  handleDeleteChild: vi.fn(),
  refresh: vi.fn(),
  setEditing: vi.fn(),
};

vi.mock('@/hooks/useEntity', () => ({ useEntity: () => ({ ...mockHook }) }));
vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({ catalogs: {}, catalogsLoaded: true }) }));
vi.mock('@/hooks/useDisplayLogic', () => ({ useDisplayLogic: () => ({}) }));
vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }),
}));
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, computeGrossAmount: vi.fn() }),
  ORDER_LINE_CONFIG: { quantityField: 'orderedQuantity', priceField: 'unitPrice' },
}));

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({ execute: vi.fn(), loading: false }) }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }),
}));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: () => null }));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null }));
vi.mock('@/lib/resolveIdentifier.js', () => ({
  resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '',
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
vi.mock('@/lib/selectorCatalog.js', () => ({ getCatalogOptions: () => [] }));
vi.mock('@/lib/formatAmount.js', () => ({ formatAmount: (val) => (val != null ? String(val) : '') }));
vi.mock('@/lib/utils.js', () => ({ cn: (...args) => args.filter(Boolean).join(' ') }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { DetailView } from '../DetailView.jsx';

const BASE_PROPS = {
  entity: 'sales-order',
  detailEntity: 'sales-order-line',
  Form: () => <div data-testid="mock-form">Form</div>,
  DetailTable: () => <div data-testid="mock-detail-table">Table</div>,
  DetailForm: null,
  summary: [],
  statusField: 'documentStatus',
  api: { window: { category: 'sales' } },
  entityLabel: 'Sales Order',
  detailLabel: 'Line',
  detailTabIndex: 0,
  titleField: 'documentNo',
  windowName: 'sales-order',
  recordId: '123',
  token: 'test-token',
  apiBaseUrl: 'http://localhost:8080/etendo/neo',
  // additionalDirtyState=true forces computeIsDirty → true, so the otherwise
  // !isDirty-disabled Save buttons become clickable without poking the hook.
  additionalDirtyState: true,
};

function resetHook() {
  mockNavigate.mockClear();
  mockHook.isSaving = false;
  mockHook.isDirtyHeader = false;
  mockHook.children = [];
  mockHook.childrenLoading = false;
  mockHook.handleSave = vi.fn(() => Promise.resolve({ id: '123' }));
  mockHook.handleSaveAndProcess = vi.fn(() => Promise.resolve({ id: '123' }));
  mockHook.primeSaved = vi.fn();
  mockHook.fetchById = vi.fn();
  const rec = { id: '123', documentNo: 'SO-001', documentStatus: 'DR', processed: false };
  mockHook.selected = rec;
  mockHook.editing = rec;
}

describe('DetailView footer save buttons (onClick coverage)', () => {
  beforeEach(resetHook);

  it('existing record: clicking Save calls handleSave and re-fetches the saved id', async () => {
    render(<DetailView {...BASE_PROPS} />);
    const saveBtn = screen.getByTestId('action-save');
    expect(saveBtn).not.toBeDisabled();
    fireEvent.click(saveBtn);
    await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalled());
    // Not new and no onAfterSave → handlePostSaveNavigation does not navigate;
    // existing-record onClick re-fetches the saved record.
    await waitFor(() => expect(mockHook.fetchById).toHaveBeenCalledWith('123'));
  });

  it('draftMode: Save (draft) persists, Confirm runs handleSaveAndProcess', async () => {
    const draftMode = { enabled: true, draftField: 'documentStatus', draftValue: 'DR', label: 'process' };
    render(<DetailView {...BASE_PROPS} draftMode={draftMode} />);

    const saveDraft = screen.getByTestId('action-save-draft');
    expect(saveDraft).not.toBeDisabled();
    fireEvent.click(saveDraft);
    await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalled());

    const confirm = screen.getByTestId('action-save');
    fireEvent.click(confirm);
    await waitFor(() => expect(mockHook.handleSaveAndProcess).toHaveBeenCalled());
    // Existing record (recordId !== 'new'), no onAfterSave → fetchById branch.
    await waitFor(() => expect(mockHook.fetchById).toHaveBeenCalledWith('123'));
  });

  it('draftMode: Save Draft is blocked when the journal is unbalanced', () => {
    // Σ debit (100) ≠ Σ credit (0) → blockSaveForBalance. The draft Save must be
    // gated too, not just Confirm — persisting an unbalanced journal contradicts
    // the balance-footer contract.
    mockHook.children = [{ id: 'l1', debit: '100', credit: '0' }];
    const draftMode = { enabled: true, draftField: 'documentStatus', draftValue: 'DR', label: 'process' };
    render(
      <DetailView
        {...BASE_PROPS}
        draftMode={draftMode}
        balanceFooter={{ debitField: 'debit', creditField: 'credit' }}
      />,
    );
    expect(screen.getByTestId('action-save-draft')).toBeDisabled();
    // Confirm stays blocked as well (stricter gate).
    expect(screen.getByTestId('action-save')).toBeDisabled();
  });

  it('draftMode: Save Draft is enabled when debit equals credit', () => {
    mockHook.children = [{ id: 'l1', debit: '100', credit: '100' }];
    const draftMode = { enabled: true, draftField: 'documentStatus', draftValue: 'DR', label: 'process' };
    render(
      <DetailView
        {...BASE_PROPS}
        draftMode={draftMode}
        balanceFooter={{ debitField: 'debit', creditField: 'credit' }}
      />,
    );
    expect(screen.getByTestId('action-save-draft')).not.toBeDisabled();
  });

  it('draftMode with onConfirm: Confirm short-circuits to the custom handler', async () => {
    const onConfirm = vi.fn();
    const draftMode = { enabled: true, draftField: 'documentStatus', draftValue: 'DR', onConfirm };
    render(<DetailView {...BASE_PROPS} draftMode={draftMode} />);
    fireEvent.click(screen.getByTestId('action-save'));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(mockHook.handleSaveAndProcess).not.toHaveBeenCalled();
  });

  // ETP-4940 — draftMode windows whose Confirm button uses a custom `onConfirm`
  // callback (sales-order, purchase-order, sales-quotation, goods-receipt,
  // goods-shipment all dispatch a DOM event here to open their own confirm
  // modal) fully bypass `handleSaveAndProcess`, which is the only place that
  // otherwise calls `handleSave` first. Without the maybeSaveBeforeConfirm gate
  // in `renderDraftModeSaveActions`, a header edit made right before clicking
  // Confirm — without clicking Save first — was silently discarded: the
  // document confirmed with the previously-persisted value.
  describe('draftMode with onConfirm: save-before-confirm guard (ETP-4940)', () => {
    it('dirty header + click Confirm → saves silently BEFORE the custom onConfirm fires', async () => {
      const callOrder = [];
      mockHook.handleSave = vi.fn(async () => { callOrder.push('save'); return { id: '123' }; });
      const onConfirm = vi.fn(() => { callOrder.push('confirm'); });
      const draftMode = { enabled: true, draftField: 'documentStatus', draftValue: 'DR', onConfirm };
      // BASE_PROPS.additionalDirtyState=true → isDirty is true.
      render(<DetailView {...BASE_PROPS} draftMode={draftMode} />);
      fireEvent.click(screen.getByTestId('action-save'));

      await waitFor(() => expect(onConfirm).toHaveBeenCalled());
      expect(mockHook.handleSave).toHaveBeenCalledWith({ silent: true });
      expect(callOrder).toEqual(['save', 'confirm']);
    });

    it('dirty header + save fails → the custom onConfirm does NOT fire', async () => {
      // handleSave returns null on validation/required/numeric/backend
      // failure — it has already surfaced the error itself.
      mockHook.handleSave = vi.fn(() => Promise.resolve(null));
      const onConfirm = vi.fn();
      const draftMode = { enabled: true, draftField: 'documentStatus', draftValue: 'DR', onConfirm };
      render(<DetailView {...BASE_PROPS} draftMode={draftMode} />);
      fireEvent.click(screen.getByTestId('action-save'));

      await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalled());
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('no pending changes → the custom onConfirm fires without an extra save call', async () => {
      const onConfirm = vi.fn();
      const draftMode = { enabled: true, draftField: 'documentStatus', draftValue: 'DR', onConfirm };
      // Override additionalDirtyState so isDirty is false (mockHook.isDirtyHeader
      // is already false via resetHook, and there are no pending line edits).
      render(<DetailView {...BASE_PROPS} additionalDirtyState={false} draftMode={draftMode} />);
      fireEvent.click(screen.getByTestId('action-save'));

      await waitFor(() => expect(onConfirm).toHaveBeenCalled());
      expect(mockHook.handleSave).not.toHaveBeenCalled();
    });

    // The two tests above drive isDirty via additionalDirtyState (BASE_PROPS'
    // default true / the override false); neither actually sets
    // mockHook.isDirtyHeader, so neither one pins the ticket's literal scenario
    // (a HEADER field edited without clicking Save). The two tests below make
    // the two distinct dirty sources explicit and mutually exclusive, so a
    // future change that special-cases one of them (e.g. reading only
    // hook.isDirtyHeader here, mirroring the DetailMoreActionsMenu W1 gap) would
    // break one of these without the other masking it.
    it('ETP-4940 ticket scenario — header field edited (isDirtyHeader), nothing else dirty → saves BEFORE onConfirm', async () => {
      mockHook.isDirtyHeader = true;
      const callOrder = [];
      mockHook.handleSave = vi.fn(async () => { callOrder.push('save'); return { id: '123' }; });
      const onConfirm = vi.fn(() => { callOrder.push('confirm'); });
      const draftMode = { enabled: true, draftField: 'documentStatus', draftValue: 'DR', onConfirm };
      // additionalDirtyState=false isolates isDirtyHeader as the only dirty source.
      render(<DetailView {...BASE_PROPS} additionalDirtyState={false} draftMode={draftMode} />);
      fireEvent.click(screen.getByTestId('action-save'));

      await waitFor(() => expect(onConfirm).toHaveBeenCalled());
      expect(mockHook.handleSave).toHaveBeenCalledWith({ silent: true });
      expect(callOrder).toEqual(['save', 'confirm']);
    });

    it('line-edit dirty only (isDirtyHeader stays false) + click Confirm → still saves BEFORE onConfirm', async () => {
      // computeIsDirty ORs in lineEdits/addingLine/addingSecondaryLine alongside
      // isDirtyHeader (see computeIsDirty tests in DetailView.helpers.vitest.jsx).
      // additionalDirtyState stands in here for "a pending line-row edit", the
      // same OR branch a real inline line edit would set. The point: the
      // draftMode Confirm button reads the FULL `isDirty` (not hook.isDirtyHeader
      // alone), so a line edit with a clean header still gets saved first — this
      // is exactly the coverage the kebab path is MISSING (see the paired "known
      // gap W1" test in DetailMoreActionsMenu.saveBeforeConfirm.vitest.jsx).
      expect(mockHook.isDirtyHeader).toBe(false); // sanity: header is clean
      const callOrder = [];
      mockHook.handleSave = vi.fn(async () => { callOrder.push('save'); return { id: '123' }; });
      const onConfirm = vi.fn(() => { callOrder.push('confirm'); });
      const draftMode = { enabled: true, draftField: 'documentStatus', draftValue: 'DR', onConfirm };
      render(<DetailView {...BASE_PROPS} additionalDirtyState draftMode={draftMode} />);
      fireEvent.click(screen.getByTestId('action-save'));

      await waitFor(() => expect(onConfirm).toHaveBeenCalled());
      expect(mockHook.handleSave).toHaveBeenCalledWith({ silent: true });
      expect(callOrder).toEqual(['save', 'confirm']);
    });
  });

  it('new record: Save persists then navigates to the created record', async () => {
    mockHook.handleSave = vi.fn(() => Promise.resolve({ id: 'new-999' }));
    render(<DetailView {...BASE_PROPS} recordId="new" />);
    const saveBtn = screen.getByTestId('action-save');
    fireEvent.click(saveBtn);
    await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalled());
    await waitFor(() => expect(mockHook.primeSaved).toHaveBeenCalled());
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/sales-order/new-999',
        { replace: true, state: { justSaved: { id: 'new-999' } } },
      ),
    );
  });

  it('new record (no draftMode, no children): Save calls onAfterCreate before navigating', async () => {
    // Regression: header-only windows with a plain new-record Save (no draftMode,
    // no detail lines) used to skip onAfterCreate entirely — only the draftMode
    // Confirm button and the "complete" button (gated by children.length > 0)
    // invoked it. This left onAfterCreate dead code for e.g. the Warehouse window
    // (ETP-4526 default-storage-bin creation never actually ran).
    mockHook.handleSave = vi.fn(() => Promise.resolve({ id: 'new-555' }));
    const onAfterCreate = vi.fn(() => Promise.resolve());
    render(<DetailView {...BASE_PROPS} recordId="new" onAfterCreate={onAfterCreate} />);
    fireEvent.click(screen.getByTestId('action-save'));
    await waitFor(() => expect(mockHook.handleSave).toHaveBeenCalled());
    await waitFor(() =>
      expect(onAfterCreate).toHaveBeenCalledWith(
        { id: 'new-555' },
        { token: 'test-token', apiBaseUrl: 'http://localhost:8080/etendo/neo' },
      ),
    );
    await waitFor(() => expect(mockHook.primeSaved).toHaveBeenCalledWith({ id: 'new-555' }));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/sales-order/new-555',
        { replace: true, state: { justSaved: { id: 'new-555' } } },
      ),
    );
  });

  it('draftMode Confirm on a new record: onAfterCreate then navigate to the record', async () => {
    mockHook.handleSaveAndProcess = vi.fn(() => Promise.resolve({ id: 'new-777' }));
    const onAfterCreate = vi.fn(() => Promise.resolve());
    const draftMode = { enabled: true, draftField: 'documentStatus', draftValue: 'DR', label: 'process' };
    render(
      <DetailView {...BASE_PROPS} recordId="new" draftMode={draftMode} onAfterCreate={onAfterCreate} />,
    );
    fireEvent.click(screen.getByTestId('action-save'));
    await waitFor(() => expect(mockHook.handleSaveAndProcess).toHaveBeenCalled());
    await waitFor(() =>
      expect(onAfterCreate).toHaveBeenCalledWith(
        { id: 'new-777' },
        { token: 'test-token', apiBaseUrl: 'http://localhost:8080/etendo/neo' },
      ),
    );
    await waitFor(() => expect(mockHook.primeSaved).toHaveBeenCalledWith({ id: 'new-777' }));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/sales-order/new-777',
        { replace: true, state: { justSaved: { id: 'new-777' } } },
      ),
    );
  });

  it('new record with lines: Complete runs handleSaveAndProcess', async () => {
    mockHook.children = [{ id: 'l1', product: 'Widget' }];
    // draftMode present but NOT enabled → renderSaveActions still routes to the
    // new-record branch; its Complete button reads draftMode.label for its text.
    render(<DetailView {...BASE_PROPS} recordId="new" draftMode={{ enabled: false, label: 'process' }} />);
    const complete = screen.getByTestId('action-complete');
    fireEvent.click(complete);
    await waitFor(() => expect(mockHook.handleSaveAndProcess).toHaveBeenCalled());
  });
});

// Non-dismissible loading modal shown while Confirm runs a draftMode with
// `processingModal` set (e.g. sales-invoice + active Verifactu → ~8s
// synchronous GenerateRF). Covers: shows while in flight, closes on success,
// closes on failure (the `finally` regression case), stays hidden for
// draftMode configs without processingModal (SII/TBAI/no-fiscal-config,
// other draftMode windows), and cannot be dismissed via Escape.
describe('DetailView toolbar order — saveActionsFirst', () => {
  beforeEach(resetHook);

  // One process button ("Confirm") next to the Save button, which is what the payment windows
  // show on a draft record.
  const PROCESSES = [{ name: 'process', label: 'Confirm', columnName: 'aPRMProcessPayment', style: 'positive' }];

  /** Save vs the process button, in document order. */
  function orderOf() {
    const save = screen.getByTestId('action-save');
    const process = screen.getByText('Confirm').closest('button');
    // Node.DOCUMENT_POSITION_FOLLOWING === 4
    const saveComesFirst = Boolean(save.compareDocumentPosition(process) & 4);
    return saveComesFirst ? ['save', 'process'] : ['process', 'save'];
  }

  it('renders Save after the process buttons by default', () => {
    render(<DetailView {...BASE_PROPS} processes={PROCESSES} />);
    expect(orderOf()).toEqual(['process', 'save']);
  });

  it('renders Save before the process buttons when saveActionsFirst is set', () => {
    render(<DetailView {...BASE_PROPS} processes={PROCESSES} saveActionsFirst />);
    expect(orderOf()).toEqual(['save', 'process']);
  });

  it('keeps saveBeforeProcesses implying the same order, so no window regresses', () => {
    render(<DetailView {...BASE_PROPS} processes={PROCESSES} saveBeforeProcesses />);
    expect(orderOf()).toEqual(['save', 'process']);
  });

  // The order is presentational: a window can put Save first without opting into the
  // save-before-process behavior, and vice versa.
  it('lets saveActionsFirst=false override the order saveBeforeProcesses would impose', () => {
    render(<DetailView {...BASE_PROPS} processes={PROCESSES} saveBeforeProcesses saveActionsFirst={false} />);
    expect(orderOf()).toEqual(['process', 'save']);
  });
});

describe('DetailView draftMode processingModal (Verifactu-style loading modal)', () => {
  beforeEach(resetHook);

  const PROCESSING_BODY = 'Generating the billing record for submission to VERI*FACTU';
  const draftModeWithModal = () => ({
    enabled: true,
    draftField: 'documentStatus',
    draftValue: 'DR',
    label: 'process',
    processingModal: { body: PROCESSING_BODY },
  });

  it('shows the modal while handleSaveAndProcess is in flight, then closes it on success', async () => {
    let resolveSave;
    mockHook.handleSaveAndProcess = vi.fn(() => new Promise((resolve) => { resolveSave = resolve; }));
    render(<DetailView {...BASE_PROPS} draftMode={draftModeWithModal()} />);

    fireEvent.click(screen.getByTestId('action-save'));

    const modalContent = await screen.findByTestId('DialogContent__verifactu-processing');
    expect(modalContent).toHaveTextContent(PROCESSING_BODY);

    resolveSave({ id: '123' });

    await waitFor(() => expect(mockHook.fetchById).toHaveBeenCalledWith('123'));
    await waitFor(() => expect(screen.queryByTestId('DialogContent__verifactu-processing')).toBeNull());
  });

  it('closes the modal even when handleSaveAndProcess resolves null (failure) — the finally-block regression case', async () => {
    let resolveSave;
    mockHook.handleSaveAndProcess = vi.fn(() => new Promise((resolve) => { resolveSave = resolve; }));
    render(<DetailView {...BASE_PROPS} draftMode={draftModeWithModal()} />);

    // DetailView's mount effect already calls hook.fetchById(recordId) once on
    // load, so capture the baseline before triggering save to isolate the
    // post-save refetch (which must NOT happen on the failure path).
    const fetchByIdCallsBeforeSave = mockHook.fetchById.mock.calls.length;

    fireEvent.click(screen.getByTestId('action-save'));

    // Confirm the modal actually opened before resolving — otherwise a test
    // that only checks "eventually absent" would pass even if the modal never
    // showed up at all (tautology guard).
    await screen.findByTestId('DialogContent__verifactu-processing');

    resolveSave(null);

    await waitFor(() => expect(screen.queryByTestId('DialogContent__verifactu-processing')).toBeNull());
    // Failure path (saved is falsy) must not trigger the post-save refetch.
    expect(mockHook.fetchById.mock.calls.length).toBe(fetchByIdCallsBeforeSave);
  });

  it('never shows the modal when draftMode has no processingModal (e.g. non-Verifactu invoices, other draftMode windows)', async () => {
    let resolveSave;
    mockHook.handleSaveAndProcess = vi.fn(() => new Promise((resolve) => { resolveSave = resolve; }));
    const draftMode = { enabled: true, draftField: 'documentStatus', draftValue: 'DR', label: 'process' };
    render(<DetailView {...BASE_PROPS} draftMode={draftMode} />);

    fireEvent.click(screen.getByTestId('action-save'));
    await waitFor(() => expect(mockHook.handleSaveAndProcess).toHaveBeenCalled());
    expect(screen.queryByTestId('DialogContent__verifactu-processing')).toBeNull();

    resolveSave({ id: '123' });
    await waitFor(() => expect(mockHook.fetchById).toHaveBeenCalledWith('123'));
    expect(screen.queryByTestId('DialogContent__verifactu-processing')).toBeNull();
  });

  it('is non-dismissible: pressing Escape while it is open does not close it', async () => {
    let resolveSave;
    mockHook.handleSaveAndProcess = vi.fn(() => new Promise((resolve) => { resolveSave = resolve; }));
    render(<DetailView {...BASE_PROPS} draftMode={draftModeWithModal()} />);

    fireEvent.click(screen.getByTestId('action-save'));
    const modalContent = await screen.findByTestId('DialogContent__verifactu-processing');

    fireEvent.keyDown(modalContent, { key: 'Escape', code: 'Escape' });
    // Give any (unwanted) close handling a tick to take effect.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByTestId('DialogContent__verifactu-processing')).toBeInTheDocument();

    // Clean up the pending promise so it doesn't leak into other tests.
    resolveSave({ id: '123' });
    await waitFor(() => expect(screen.queryByTestId('DialogContent__verifactu-processing')).toBeNull());
  });
});
