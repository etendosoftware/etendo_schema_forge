import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Importing DetailView.jsx pulls in the whole component tree (router, i18n,
// hooks, sub-components, lib helpers). Mirror the mocks used by the sibling
// DetailView.inlineRowUpdate.vitest.js so the module loads in isolation and we
// can import the exported factory directly.
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

// DetailView imports `toast` from 'sonner'. Mock it so we can assert toasts.
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { toast } from 'sonner';
import { buildDeleteRowHandler } from '../DetailView.jsx';

const DETAIL_ENTITY = 'orderLine';

function makeArgs(overrides = {}) {
  const base = {
    api: { crud: { [DETAIL_ENTITY]: { detailUrl: 'https://x/api/orderLine/{id}' } } },
    detailEntity: DETAIL_ENTITY,
    isDocumentReadOnly: false,
    confirmDelete: vi.fn().mockResolvedValue(true),
    apiBaseUrl: 'https://x/api',
    token: 'TKN',
    hook: { handleDeleteChild: vi.fn() },
    selectedLine: null,
    setSelectedLine: vi.fn(),
    ui: (key) => key,
    extractErrorMessage: vi.fn().mockResolvedValue('server boom'),
  };
  return { ...base, ...overrides };
}

function build(args) {
  return buildDeleteRowHandler({
    api: args.api,
    detailEntity: args.detailEntity,
    isDocumentReadOnly: args.isDocumentReadOnly,
    confirmDelete: args.confirmDelete,
    apiBaseUrl: args.apiBaseUrl,
    token: args.token,
    hook: args.hook,
    selectedLine: args.selectedLine,
    setSelectedLine: args.setSelectedLine,
    ui: args.ui,
    extractErrorMessage: args.extractErrorMessage,
  });
}

function okResponse() {
  return { ok: true };
}
function errResponse() {
  return { ok: false };
}

describe('buildDeleteRowHandler — factory gating', () => {
  it('returns undefined when isDocumentReadOnly is true', () => {
    expect(build(makeArgs({ isDocumentReadOnly: true }))).toBeUndefined();
  });

  it('returns undefined when api.crud[detailEntity].delete === false (explicit disable)', () => {
    const api = { crud: { [DETAIL_ENTITY]: { delete: false } } };
    expect(build(makeArgs({ api }))).toBeUndefined();
  });

  it('returns a function when delete is undefined (default ?? true) and not read-only', () => {
    const handler = build(makeArgs());
    expect(typeof handler).toBe('function');
  });
});

describe('buildDeleteRowHandler — DELETE behavior', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(okResponse());
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete global.fetch;
  });

  it('aborts silently when confirmDelete resolves false — no fetch, no toast', async () => {
    const confirmDelete = vi.fn().mockResolvedValue(false);
    const hook = { handleDeleteChild: vi.fn() };
    const handler = build(makeArgs({ confirmDelete, hook }));
    await handler({ id: 'L1' });

    expect(confirmDelete).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(hook.handleDeleteChild).not.toHaveBeenCalled();
  });

  it('DELETEs the configured detailUrl with {id} replaced and Bearer token header', async () => {
    const handler = build(makeArgs());
    await handler({ id: 'L1' });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://x/api/orderLine/L1');
    expect(opts.method).toBe('DELETE');
    expect(opts.headers.Authorization).toBe('Bearer TKN');
  });

  it('omits the Authorization header when token is falsy', async () => {
    const handler = build(makeArgs({ token: '' }));
    await handler({ id: 'L1' });

    const [, opts] = global.fetch.mock.calls[0];
    expect('Authorization' in opts.headers).toBe(false);
  });

  it('falls back to ${apiBaseUrl}/${detailEntity}/${row.id} when no detailUrl configured', async () => {
    const api = { crud: { [DETAIL_ENTITY]: {} } };
    const handler = build(makeArgs({ api }));
    await handler({ id: 'L9' });

    expect(global.fetch.mock.calls[0][0]).toBe('https://x/api/orderLine/L9');
  });

  it('on res.ok calls hook.handleDeleteChild(row.id) and toast.success(recordDeleted)', async () => {
    const hook = { handleDeleteChild: vi.fn() };
    const handler = build(makeArgs({ hook }));
    await handler({ id: 'L1' });

    expect(hook.handleDeleteChild).toHaveBeenCalledWith('L1');
    expect(toast.success).toHaveBeenCalledWith('recordDeleted');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('on res.ok clears the selected line when selectedLine.id === row.id', async () => {
    const setSelectedLine = vi.fn();
    const handler = build(makeArgs({ selectedLine: { id: 'L1' }, setSelectedLine }));
    await handler({ id: 'L1' });

    expect(setSelectedLine).toHaveBeenCalledWith(null);
  });

  it('on res.ok does NOT clear the selected line when ids differ', async () => {
    const setSelectedLine = vi.fn();
    const handler = build(makeArgs({ selectedLine: { id: 'OTHER' }, setSelectedLine }));
    await handler({ id: 'L1' });

    expect(setSelectedLine).not.toHaveBeenCalled();
  });

  it('on !res.ok calls extractErrorMessage and toast.error; does not delete the child', async () => {
    global.fetch = vi.fn().mockResolvedValue(errResponse());
    const extractErrorMessage = vi.fn().mockResolvedValue('server boom');
    const hook = { handleDeleteChild: vi.fn() };
    const handler = build(makeArgs({ extractErrorMessage, hook }));
    await handler({ id: 'L1' });

    expect(extractErrorMessage).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('server boom');
    expect(hook.handleDeleteChild).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('on fetch throwing an Error with a message, toasts that message', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));
    const handler = build(makeArgs());
    await handler({ id: 'L1' });

    expect(toast.error).toHaveBeenCalledWith('network down');
  });

  it('on fetch throwing without a message, falls back to ui(networkError)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error(''));
    const handler = build(makeArgs());
    await handler({ id: 'L1' });

    expect(toast.error).toHaveBeenCalledWith('networkError');
  });
});
