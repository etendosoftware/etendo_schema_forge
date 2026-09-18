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
import {
  handlePostSaveNavigation, reportUnnavigableSave, renderSaveActions,
  runAfterSaveHook, buildUnsavedChangesSaver,
} from '../saveActions.jsx';

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

// ETP-5199 — regression coverage for the "Guardar y salir" unsaved-changes-guard save
// path silently dropping onAfterCreate/onAfterExistingSave. Before this fix, the guard's
// saver was `() => hook.handleSave({ silent: true })` only — it never called
// runAfterSaveHook at all, so a window's post-save side effect (Users' role assignment,
// Warehouse's default storage bin) was lost whenever the user saved via the in-app
// navigation-guard modal instead of the toolbar Save button.
describe('runAfterSaveHook', () => {
  it('calls onAfterCreate (not onAfterExistingSave) when isNew is true', async () => {
    const onAfterCreate = vi.fn();
    const onAfterExistingSave = vi.fn();
    const saved = { id: 'rec-1' };
    await runAfterSaveHook(saved, {
      isNew: true, onAfterCreate, onAfterExistingSave, token: 'tok', apiBaseUrl: '/api',
    });
    expect(onAfterCreate).toHaveBeenCalledWith(saved, { token: 'tok', apiBaseUrl: '/api' });
    expect(onAfterExistingSave).not.toHaveBeenCalled();
  });

  it('calls onAfterExistingSave (not onAfterCreate) when isNew is false', async () => {
    const onAfterCreate = vi.fn();
    const onAfterExistingSave = vi.fn();
    const saved = { id: 'rec-1' };
    await runAfterSaveHook(saved, {
      isNew: false, onAfterCreate, onAfterExistingSave, token: 'tok', apiBaseUrl: '/api',
    });
    expect(onAfterExistingSave).toHaveBeenCalledWith(saved, { token: 'tok', apiBaseUrl: '/api' });
    expect(onAfterCreate).not.toHaveBeenCalled();
  });

  it('does not throw when the relevant hook is missing (optional chaining)', async () => {
    await expect(runAfterSaveHook({ id: 'rec-1' }, {
      isNew: true, onAfterCreate: undefined, onAfterExistingSave: undefined, token: 'tok', apiBaseUrl: '/api',
    })).resolves.toBeUndefined();
  });
});

describe('buildUnsavedChangesSaver (ETP-5199)', () => {
  function baseArgs(overrides = {}) {
    return {
      hook: { handleSave: vi.fn(() => Promise.resolve({ id: 'rec-1' })) },
      isNew: false,
      onAfterCreate: vi.fn(),
      onAfterExistingSave: vi.fn(),
      token: 'tok',
      apiBaseUrl: '/api',
      ...overrides,
    };
  }

  it('calls hook.handleSave with { silent: true } — the "Guardar y salir" prompt is the only feedback, not a per-save toast', async () => {
    const args = baseArgs();
    const saver = buildUnsavedChangesSaver(args);
    await saver();
    expect(args.hook.handleSave).toHaveBeenCalledWith({ silent: true });
  });

  it('calls onAfterExistingSave with the saved record when isNew is false — the bug this fix closes for the Users window (handleRoleAssignmentSave)', async () => {
    const args = baseArgs({ isNew: false });
    const saver = buildUnsavedChangesSaver(args);
    const result = await saver();
    expect(args.onAfterExistingSave).toHaveBeenCalledWith({ id: 'rec-1' }, { token: 'tok', apiBaseUrl: '/api' });
    expect(args.onAfterCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'rec-1' });
  });

  it('calls onAfterCreate with the saved record when isNew is true — the bug this fix closes for the Warehouse window (createDefaultStorageBin)', async () => {
    const args = baseArgs({ isNew: true });
    const saver = buildUnsavedChangesSaver(args);
    const result = await saver();
    expect(args.onAfterCreate).toHaveBeenCalledWith({ id: 'rec-1' }, { token: 'tok', apiBaseUrl: '/api' });
    expect(args.onAfterExistingSave).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'rec-1' });
  });

  it('does NOT call the after-save hook and returns the falsy result as-is when handleSave refuses (validation failure)', async () => {
    const args = baseArgs({
      hook: { handleSave: vi.fn(() => Promise.resolve(null)) },
    });
    const saver = buildUnsavedChangesSaver(args);
    const result = await saver();
    expect(result).toBeNull();
    expect(args.onAfterExistingSave).not.toHaveBeenCalled();
    expect(args.onAfterCreate).not.toHaveBeenCalled();
  });

  it('does NOT call the after-save hook when handleSave resolves undefined either', async () => {
    const args = baseArgs({
      hook: { handleSave: vi.fn(() => Promise.resolve(undefined)) },
    });
    const saver = buildUnsavedChangesSaver(args);
    const result = await saver();
    expect(result).toBeUndefined();
    expect(args.onAfterExistingSave).not.toHaveBeenCalled();
  });

  it('does not perform any navigation itself — the built saver has no navigate/windowName dependency and never touches window.location or history', async () => {
    // buildUnsavedChangesSaver deliberately does not accept navigate/windowName at all,
    // unlike handlePostSaveNavigation — this asserts the returned function's arity/behavior
    // rather than a mocked navigate, since there is nothing to inject a navigate mock into.
    expect(buildUnsavedChangesSaver.length).toBe(1);
    const args = baseArgs({ isNew: true });
    const saver = buildUnsavedChangesSaver(args);
    expect(saver.length).toBe(0);
    await saver();
    // Sanity: no accidental global navigation call sneaks in via jsdom's location.
    expect(window.location.pathname).toBe('/');
  });

  // QA adversarial pass (ETP-5199) — a THROWING onAfterCreate/onAfterExistingSave/handleSave,
  // as opposed to one that resolves falsy.
  //
  // ETP-5199 follow-up (QA MEDIUM finding, closed in this same change): a throwing
  // onAfterCreate/onAfterExistingSave used to propagate all the way up through
  // savePendingNavigation() (unsavedChanges.js) to UnsavedChangesNavigationDialog, whose
  // handleSave has no try/catch either — leaving the "Guardar y salir" modal stuck open
  // forever (spinner, every button disabled, no way out but reloading and losing the very
  // edits this guard exists to protect). buildUnsavedChangesSaver now catches ONLY the
  // runAfterSaveHook call: the record itself already saved by that point (hook.handleSave
  // already resolved truthy), so the fix reports a toast and still resolves with the saved
  // record — it does not re-throw. A rejection from hook.handleSave itself is a different
  // case (the record never saved) and is deliberately NOT caught here — see that test below.
  // runAfterSaveHook and handlePostSaveNavigation (the toolbar-Save path) are intentionally
  // NOT touched by this fix — see their own tests below, still asserting propagation.
  describe('throwing hooks (not just a falsy resolution)', () => {
    const ui = (key) => key;

    it('catches a rejection from onAfterExistingSave, toasts, and still resolves with the saved record — the Users window save already succeeded', async () => {
      const err = new Error('role assignment save failed');
      const args = baseArgs({ isNew: false, onAfterExistingSave: vi.fn(() => Promise.reject(err)), ui });
      const saver = buildUnsavedChangesSaver(args);
      const result = await saver();
      expect(result).toEqual({ id: 'rec-1' });
      expect(toast.error).toHaveBeenCalledWith('savedButFollowUpActionFailed');
    });

    it('catches a rejection from onAfterCreate, toasts, and still resolves with the saved record — the Warehouse window save already succeeded', async () => {
      const err = new Error('default storage bin failed');
      const args = baseArgs({ isNew: true, onAfterCreate: vi.fn(() => Promise.reject(err)), ui });
      const saver = buildUnsavedChangesSaver(args);
      const result = await saver();
      expect(result).toEqual({ id: 'rec-1' });
      expect(toast.error).toHaveBeenCalledWith('savedButFollowUpActionFailed');
    });

    it('falls back to the raw i18n key when no ui function is supplied, but still resolves rather than rejecting', async () => {
      const err = new Error('role assignment save failed');
      const args = baseArgs({ isNew: false, onAfterExistingSave: vi.fn(() => Promise.reject(err)) });
      const saver = buildUnsavedChangesSaver(args);
      const result = await saver();
      expect(result).toEqual({ id: 'rec-1' });
      expect(toast.error).toHaveBeenCalledWith('savedButFollowUpActionFailed');
    });

    it('propagates a rejection from hook.handleSave itself, not only a falsy resolution — the record never saved, so this must NOT be swallowed', async () => {
      const err = new Error('network error');
      const args = baseArgs({ hook: { handleSave: vi.fn(() => Promise.reject(err)) } });
      const saver = buildUnsavedChangesSaver(args);
      await expect(saver()).rejects.toThrow('network error');
    });

    it('runAfterSaveHook itself still propagates a throwing onAfterExistingSave — buildUnsavedChangesSaver is the layer that catches it, not runAfterSaveHook', async () => {
      const err = new Error('boom');
      await expect(runAfterSaveHook({ id: 'rec-1' }, {
        isNew: false, onAfterCreate: null, onAfterExistingSave: vi.fn(() => Promise.reject(err)), token: 'tok', apiBaseUrl: '/api',
      })).rejects.toThrow('boom');
    });

    it('handlePostSaveNavigation (toolbar-Save path) still propagates the same throwing onAfterCreate — this fix is scoped to the unsaved-changes-guard saver only', async () => {
      const err = new Error('boom');
      const navigate = vi.fn();
      await expect(handlePostSaveNavigation({ id: 'rec-1' }, {
        isNew: true, onAfterCreate: vi.fn(() => Promise.reject(err)), onAfterSave: null,
        navigate, windowName: 'orders', token: 'tok', apiBaseUrl: '/api', hook: { primeSaved: vi.fn() },
      })).rejects.toThrow('boom');
      expect(navigate).not.toHaveBeenCalled();
    });
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
