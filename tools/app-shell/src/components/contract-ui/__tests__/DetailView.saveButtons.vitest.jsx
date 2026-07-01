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
