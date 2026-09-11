import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
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

vi.mock('@/hooks/useEntity', () => ({
  useEntity: () => ({ handleChange: vi.fn() }),
}));

vi.mock('@/hooks/useCatalogs', () => ({
  useCatalogs: () => ({ catalogs: {}, catalogsLoaded: true }),
}));

vi.mock('@/hooks/useDisplayLogic', () => ({
  useDisplayLogic: () => ({}),
}));

vi.mock('@/hooks/useCallout', () => ({
  useCallout: () => ({
    calloutResult: null,
    calloutLoading: false,
    executeCallout: vi.fn(),
  }),
}));

vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, computeGrossAmount: vi.fn() }),
  ORDER_LINE_CONFIG: { quantityField: 'orderedQuantity', priceField: 'unitPrice' },
}));

vi.mock('@/hooks/useDocumentAction', () => ({
  useDocumentAction: () => ({ execute: vi.fn(), loading: false }),
}));

vi.mock('@/components/layout/PageMetaContext', () => ({
  useSetPageMeta: () => vi.fn(),
}));

vi.mock('@/components/layout/FavoritesContext', () => ({
  useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }),
}));

vi.mock('../SummaryBar.jsx', () => ({
  SummaryBar: () => null,
}));

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

vi.mock('@/lib/selectorCatalog.js', () => ({
  getCatalogOptions: () => [],
}));

vi.mock('@/lib/formatAmount.js', () => ({
  formatAmount: (val) => (val != null ? String(val) : ''),
}));

vi.mock('@/lib/utils.js', () => ({
  cn: (...args) => args.filter(Boolean).join(' '),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import { handlePostSaveNavigation, reportUnnavigableSave, renderSaveActions } from '../saveActions.jsx';

describe('handlePostSaveNavigation', () => {
  it('returns early without side effects when saved is null', async () => {
    const navigate = vi.fn();
    const onAfterCreate = vi.fn();
    await handlePostSaveNavigation(null, {
      isNew: true,
      onAfterCreate,
      onAfterSave: null,
      navigate,
      windowName: 'orders',
      token: 'tok',
      apiBaseUrl: '/api',
      hook: {},
    });
    expect(navigate).not.toHaveBeenCalled();
    expect(onAfterCreate).not.toHaveBeenCalled();
  });

  it('calls onAfterCreate with the saved record and api params when isNew', async () => {
    const navigate = vi.fn();
    const onAfterCreate = vi.fn();
    const saved = { id: 'rec-1' };
    await handlePostSaveNavigation(saved, {
      isNew: true,
      onAfterCreate,
      onAfterSave: null,
      navigate,
      windowName: 'orders',
      token: 'tok',
      apiBaseUrl: '/api',
      hook: { primeSaved: vi.fn() },
    });
    expect(onAfterCreate).toHaveBeenCalledWith(saved, { token: 'tok', apiBaseUrl: '/api' });
  });

  // ETP-4906 — onAfterExistingSave mirrors onAfterCreate's call shape, inverted to
  // `!isNew` (fired only for an already-persisted record, never on creation). See
  // windows/custom/user/index.jsx for the concrete consumer.
  it('calls onAfterExistingSave with the saved record and api params when NOT isNew', async () => {
    const navigate = vi.fn();
    const onAfterExistingSave = vi.fn();
    const saved = { id: 'rec-1' };
    await handlePostSaveNavigation(saved, {
      isNew: false,
      onAfterCreate: null,
      onAfterExistingSave,
      onAfterSave: null,
      navigate,
      windowName: 'orders',
      token: 'tok',
      apiBaseUrl: '/api',
      hook: {},
    });
    expect(onAfterExistingSave).toHaveBeenCalledWith(saved, { token: 'tok', apiBaseUrl: '/api' });
  });

  it('never calls onAfterExistingSave for a new (not-yet-persisted) record', async () => {
    const navigate = vi.fn();
    const onAfterExistingSave = vi.fn();
    const saved = { id: 'new-id' };
    await handlePostSaveNavigation(saved, {
      isNew: true,
      onAfterCreate: null,
      onAfterExistingSave,
      onAfterSave: null,
      navigate,
      windowName: 'orders',
      token: 'tok',
      apiBaseUrl: '/api',
      hook: { primeSaved: vi.fn() },
    });
    expect(onAfterExistingSave).not.toHaveBeenCalled();
  });

  it('never calls onAfterCreate for an existing record, even when onAfterExistingSave is also set', async () => {
    const navigate = vi.fn();
    const onAfterCreate = vi.fn();
    const onAfterExistingSave = vi.fn();
    const saved = { id: 'rec-1' };
    await handlePostSaveNavigation(saved, {
      isNew: false,
      onAfterCreate,
      onAfterExistingSave,
      onAfterSave: null,
      navigate,
      windowName: 'orders',
      token: 'tok',
      apiBaseUrl: '/api',
      hook: {},
    });
    expect(onAfterCreate).not.toHaveBeenCalled();
    expect(onAfterExistingSave).toHaveBeenCalledTimes(1);
  });

  it('navigates to the list route when onAfterSave is set', async () => {
    const navigate = vi.fn();
    const onAfterSave = vi.fn();
    const saved = { id: 'rec-1' };
    await handlePostSaveNavigation(saved, {
      isNew: false,
      onAfterCreate: null,
      onAfterSave,
      navigate,
      windowName: 'orders',
      token: 'tok',
      apiBaseUrl: '/api',
      hook: {},
    });
    expect(navigate).toHaveBeenCalledWith(
      '/orders',
      { replace: true, state: { savedRecord: saved, justSaved: saved } },
    );
  });

  it('calls primeSaved and navigates to the record when isNew and no onAfterSave', async () => {
    const navigate = vi.fn();
    const primeSaved = vi.fn();
    const saved = { id: 'new-id' };
    await handlePostSaveNavigation(saved, {
      isNew: true,
      onAfterCreate: null,
      onAfterSave: null,
      navigate,
      windowName: 'orders',
      token: 'tok',
      apiBaseUrl: '/api',
      hook: { primeSaved },
    });
    expect(primeSaved).toHaveBeenCalledWith(saved);
    expect(navigate).toHaveBeenCalledWith(
      '/orders/new-id',
      { replace: true, state: { justSaved: saved } },
    );
  });

  it('does not navigate when not new, no onAfterSave, and saved has no id', async () => {
    const navigate = vi.fn();
    const saved = {};
    await handlePostSaveNavigation(saved, {
      isNew: false,
      onAfterCreate: null,
      onAfterSave: null,
      navigate,
      windowName: 'orders',
      token: 'tok',
      apiBaseUrl: '/api',
      hook: {},
    });
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('ETP-4683 — save with no derivable record id', () => {
  const ui = (key) => key;
  let consoleError;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  describe('reportUnnavigableSave', () => {
    it('logs and toasts when a new record saves without a derivable id', () => {
      const saved = { $ref: undefined, orderNo: 'PO-1' };
      const reported = reportUnnavigableSave({ saved, isNew: true, windowName: 'orders', ui });
      expect(reported).toBe(true);
      expect(toast.error).toHaveBeenCalledWith('savedButCannotOpenRecord');
      expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('orders'), saved);
    });

    it('stays silent on the happy path where the id is present', () => {
      const reported = reportUnnavigableSave({ saved: { id: 'rec-1' }, isNew: true, windowName: 'orders', ui });
      expect(reported).toBe(false);
      expect(toast.error).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
    });

    it('stays silent for an existing record, where no redirect is expected', () => {
      const reported = reportUnnavigableSave({ saved: {}, isNew: false, windowName: 'orders', ui });
      expect(reported).toBe(false);
      expect(toast.error).not.toHaveBeenCalled();
    });

    it('stays silent when the save itself failed, since handleSave already reported it', () => {
      const reported = reportUnnavigableSave({ saved: null, isNew: true, windowName: 'orders', ui });
      expect(reported).toBe(false);
      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe('handlePostSaveNavigation', () => {
    const baseOptions = {
      onAfterCreate: null,
      onAfterSave: null,
      windowName: 'orders',
      token: 'tok',
      apiBaseUrl: '/api',
      ui,
    };

    it('reports instead of silently skipping the redirect for a new record without an id', async () => {
      const navigate = vi.fn();
      const saved = { orderNo: 'PO-1' };
      await handlePostSaveNavigation(saved, { ...baseOptions, isNew: true, navigate, hook: { primeSaved: vi.fn() } });
      expect(navigate).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith('savedButCannotOpenRecord');
    });

    it('navigates without an error toast when the id is present', async () => {
      const navigate = vi.fn();
      const saved = { id: 'new-id' };
      await handlePostSaveNavigation(saved, { ...baseOptions, isNew: true, navigate, hook: { primeSaved: vi.fn() } });
      expect(navigate).toHaveBeenCalledWith(
        '/orders/new-id',
        { replace: true, state: { justSaved: saved } },
      );
      expect(toast.error).not.toHaveBeenCalled();
    });
  });
});

// ETP-4839 — `onlySaveButton` on renderDraftModeSaveActions (reached only via the
// exported renderSaveActions dispatcher, since the renderer itself is module-private).
// Unit-level: renders just the returned JSX fragment, no full DetailView mount.
describe('renderSaveActions — draftMode onlySaveButton (ETP-4839)', () => {
  const ui = (key) => key;

  function baseParams(overrides = {}) {
    return {
      hook: {
        isSaving: false,
        handleSave: vi.fn(() => Promise.resolve({ id: '1' })),
        handleSaveAndProcess: vi.fn(() => Promise.resolve({ id: '1' })),
        primeSaved: vi.fn(),
        fetchById: vi.fn(),
        children: [],
        childrenLoading: false,
      },
      isDirty: true,
      flushPendingLines: vi.fn(() => Promise.resolve(true)),
      data: {},
      isNew: false,
      navigate: vi.fn(),
      windowName: 'purchase-invoice',
      ui,
      onAfterCreate: null,
      onAfterSave: null,
      token: 'tok',
      apiBaseUrl: '/api',
      saveBtnCls: '',
      draftMode: { enabled: true, draftField: 'documentStatus', draftValue: 'DR', label: 'process' },
      blockSaveForBalance: false,
      blockCompleteForBalance: false,
      setShowProcessingModal: vi.fn(),
      saveGate: {},
      ...overrides,
    };
  }

  it('onlySaveButton absent (default false): renders BOTH Save Draft and Confirm — byte-identical to pre-ETP-4839 output', () => {
    render(<>{renderSaveActions(baseParams())}</>);
    expect(screen.getByTestId('action-save-draft')).toBeInTheDocument();
    expect(screen.getByTestId('action-save')).toBeInTheDocument();
    expect(screen.getByText('process')).toBeInTheDocument();
  });

  it('onlySaveButton=false explicitly: same as absent — both buttons present', () => {
    render(<>{renderSaveActions(baseParams({ onlySaveButton: false }))}</>);
    expect(screen.getByTestId('action-save-draft')).toBeInTheDocument();
    expect(screen.getByTestId('action-save')).toBeInTheDocument();
  });

  it('onlySaveButton=true: renders ONLY action-save-draft — Confirm button and its GateTooltip wrapper are absent from the DOM', () => {
    render(<>{renderSaveActions(baseParams({ onlySaveButton: true }))}</>);
    expect(screen.getByTestId('action-save-draft')).toBeInTheDocument();
    expect(screen.queryByTestId('action-save')).toBeNull();
    // The Confirm label text must not leak in either (rules out "hidden but present").
    expect(screen.queryByText('process')).toBeNull();
  });

  it('onlySaveButton=true still applies the balance gate to the remaining Save Draft button', () => {
    // Confirm this new param does not accidentally bypass the existing
    // blockSaveForBalance gate on the one button that survives.
    render(<>{renderSaveActions(baseParams({
      onlySaveButton: true,
      blockSaveForBalance: true,
    }))}</>);
    expect(screen.getByTestId('action-save-draft')).toBeDisabled();
  });

  it('dispatches to renderNewRecordSaveActions (not draftMode) when draftMode.enabled is false — onlySaveButton is irrelevant there', () => {
    // Guards the "no draftMode at all" case from a different angle than the
    // DetailView-level test: renderSaveActions must not honour onlySaveButton
    // outside the draftMode branch, so a stray true here has zero effect.
    render(<>{renderSaveActions(baseParams({
      isNew: true,
      draftMode: { enabled: false, label: 'process' },
      onlySaveButton: true,
      isDocumentReadOnly: false,
      isProcessed: false,
    }))}</>);
    expect(screen.getByTestId('action-save')).toBeInTheDocument();
    expect(screen.queryByTestId('action-save-draft')).toBeNull();
  });
});
