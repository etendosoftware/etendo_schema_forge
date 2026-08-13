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

import { toast } from 'sonner';
import { handlePostSaveNavigation, reportUnnavigableSave } from '../DetailView.jsx';

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
