import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CREDENTIAL_MODES, setSessionCredentials } from '@etendosoftware/app-shell-core/auth';
import { declareCookieSession } from '@/test/sessionContract.js';

// Importing DetailView.jsx pulls in the whole component tree (router, i18n,
// hooks, sub-components, lib helpers). Mirror the mocks used by the sibling
// DetailView.calloutHelpers.vitest.js so the module loads in isolation and we
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

// DetailView imports `toast` from 'sonner'. Mock it so we can assert error toasts.
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

// ETP-4576 — these assertions describe the cookie-session contract, so the
// request builders have to be in that mode. src/test/setup.js resets the scheme
// before every test, hence a beforeEach rather than module scope.
beforeEach(() => {
  declareCookieSession();
});


import { toast } from 'sonner';
import { buildInlineRowUpdateHandler } from '../DetailView.jsx';

const DETAIL_ENTITY = 'orderLine';

function makeArgs(overrides = {}) {
  const base = {
    linesLayout: 'inlineEditable',
    isDocumentReadOnly: false,
    api: { crud: { [DETAIL_ENTITY]: { detailUrl: 'https://x/api/orderLine/{id}' } } },
    detailEntity: DETAIL_ENTITY,
    apiBaseUrl: 'https://x/api',
    hook: { editing: {}, selected: null, handleUpdateChild: vi.fn() },
    handleLineFieldChange: vi.fn().mockResolvedValue(undefined),
    prepareLineForPost: vi.fn(),
    // ETP-4576 — the credential is gone: DetailView reads the CSRF proof from
    // the auth context and threads only that down into this factory.
    csrfToken: 'test-csrf',
    extractErrorMessage: vi.fn().mockResolvedValue('boom error'),
    ui: (key) => key,
  };
  return { ...base, ...overrides };
}

function build(args) {
  return buildInlineRowUpdateHandler({
    linesLayout: args.linesLayout,
    isDocumentReadOnly: args.isDocumentReadOnly,
    api: args.api,
    detailEntity: args.detailEntity,
    apiBaseUrl: args.apiBaseUrl,
    hook: args.hook,
    handleLineFieldChange: args.handleLineFieldChange,
    prepareLineForPost: args.prepareLineForPost,
    csrfToken: args.csrfToken,
    // Hostile input: a caller that still threads the dead credential. Passed
    // through verbatim so a leftover `token` can never reach the wire.
    token: args.token,
    extractErrorMessage: args.extractErrorMessage,
    ui: args.ui,
  });
}

function okResponse() {
  return { ok: true, json: async () => null };
}
function errResponse() {
  return { ok: false, json: async () => null };
}

function lastFetchBody() {
  const call = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
  return JSON.parse(call[1].body);
}

describe('buildInlineRowUpdateHandler — factory gating', () => {
  it('returns undefined when linesLayout !== inlineEditable', () => {
    expect(build(makeArgs({ linesLayout: 'readonly' }))).toBeUndefined();
  });

  it('returns undefined when isDocumentReadOnly is true (even if inlineEditable)', () => {
    expect(build(makeArgs({ isDocumentReadOnly: true }))).toBeUndefined();
  });

  it('returns an async function when inlineEditable && !isDocumentReadOnly', () => {
    const handler = build(makeArgs());
    expect(typeof handler).toBe('function');
    expect(handler.constructor.name).toBe('AsyncFunction');
  });
});

describe('buildInlineRowUpdateHandler — PATCH behavior', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(okResponse());
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete global.fetch;
  });

  // ETP-4576 — the session is a `__Host-go_session` cookie: this PATCH carries
  // `credentials: 'include'` and a guarded `X-Go-CSRF`, and never an
  // Authorization header.
  it('PATCHes the configured detailUrl with {id} replaced, JSON content type, and the CSRF proof', async () => {
    const args = makeArgs();
    const handler = build(args);
    await handler({ id: 'L1' }, 'description', 'Hello', {});

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://x/api/orderLine/L1');
    expect(opts.method).toBe('PATCH');
    expect(opts.credentials).toBe('include');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers['X-Go-CSRF']).toBe('test-csrf');
  });

  it('never sends an Authorization header, even when a stray token is threaded in', async () => {
    // Hostile input: a not-yet-cleaned caller still passes the dead credential.
    const args = makeArgs({ token: 'legacy-token' });
    const handler = build(args);
    await handler({ id: 'L1' }, 'description', 'Hello', {});

    const [, opts] = global.fetch.mock.calls[0];
    const keys = Object.keys(opts.headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain('authorization');
    expect(JSON.stringify(opts.headers)).not.toContain('Bearer');
    expect(JSON.stringify(opts.headers)).not.toContain('legacy-token');
  });

  for (const [label, value] of [['undefined', undefined], ['null', null], ['an empty string', '']]) {
    it(`omits X-Go-CSRF entirely when the session's proof is ${label}`, async () => {
      // A session can be authenticated before the CSRF proof lands. The header
      // must be absent, never present with an empty/undefined value.
      // Published directly rather than through declareCookieSession: that helper
      // defaults its argument, so `undefined` would silently become the real test
      // proof and this case would assert nothing. The credential no longer travels
      // through the deps bag — it is a property of the declared session.
      setSessionCredentials({ mode: CREDENTIAL_MODES.cookie, csrfToken: value });
      const handler = build(makeArgs());
      await handler({ id: 'L1' }, 'description', 'Hello', {});

      const [, opts] = global.fetch.mock.calls[0];
      expect('X-Go-CSRF' in opts.headers).toBe(false);
      expect(opts.credentials).toBe('include');
      expect('Authorization' in opts.headers).toBe(false);
    });
  }

  it('falls back to ${apiBaseUrl}/${detailEntity}/${row.id} when no detailUrl configured', async () => {
    const args = makeArgs({ api: { crud: {} } });
    const handler = build(args);
    await handler({ id: 'L9' }, 'description', 'Hi', {});

    expect(global.fetch.mock.calls[0][0]).toBe('https://x/api/orderLine/L9');
  });

  it('coerces numeric-string values to numbers and keeps non-numeric strings', async () => {
    const args = makeArgs();
    const handler = build(args);
    await handler({ id: 'L1' }, 'price', '12.5', {});
    let body = lastFetchBody();
    expect(body.price).toBe(12.5);
    expect(typeof body.price).toBe('number');

    await handler({ id: 'L1' }, 'description', 'not-a-number', {});
    body = lastFetchBody();
    expect(body.description).toBe('not-a-number');
  });

  it('calls handleLineFieldChange, folds derivedUpdates into the body, skips $_identifier keys, user field wins last-write', async () => {
    const handleLineFieldChange = vi.fn(async (fieldKey, value, snapshot, applyUpdates) => {
      applyUpdates({
        tax: 'TAX1',
        'tax$_identifier': 'VAT 21%',
        price: 999, // should be overwritten by the user-changed field below
      });
    });
    const args = makeArgs({ handleLineFieldChange });
    const handler = build(args);
    await handler({ id: 'L1' }, 'price', '50', {});

    expect(handleLineFieldChange).toHaveBeenCalledTimes(1);
    const body = lastFetchBody();
    expect(body.tax).toBe('TAX1');
    expect(body['tax$_identifier']).toBeUndefined(); // $_identifier skipped
    expect(body.price).toBe(50); // user-changed field wins last
  });

  it('calls prepareLineForPost(fieldValues) before fetch with the field-values object', async () => {
    const order = [];
    const prepareLineForPost = vi.fn(() => order.push('prepare'));
    global.fetch = vi.fn(() => { order.push('fetch'); return Promise.resolve(okResponse()); });
    const args = makeArgs({ prepareLineForPost });
    const handler = build(args);
    await handler({ id: 'L1' }, 'description', 'Hi', {});

    expect(prepareLineForPost).toHaveBeenCalledTimes(1);
    // The object handed to prepareLineForPost is the same one serialized into the body.
    expect(prepareLineForPost.mock.calls[0][0]).toMatchObject({ description: 'Hi' });
    expect(order).toEqual(['prepare', 'fetch']);
  });

  it('swallows a throwing callout (best-effort) and still PATCHes with the user value', async () => {
    const handleLineFieldChange = vi.fn().mockRejectedValue(new Error('callout exploded'));
    const args = makeArgs({ handleLineFieldChange });
    const handler = build(args);
    await expect(handler({ id: 'L1' }, 'qty', '3', {})).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const body = lastFetchBody();
    expect(body.qty).toBe(3);
  });

  it('on res.ok applies the local child row update via hook.handleUpdateChild and does not toast.error', async () => {
    const handleUpdateChild = vi.fn();
    const args = makeArgs({ hook: { editing: {}, selected: null, handleUpdateChild } });
    const handler = build(args);
    await handler({ id: 'L1' }, 'description', 'Hello', { identifier: 'IDENT' });

    expect(handleUpdateChild).toHaveBeenCalledTimes(1);
    const [rowId, localUpdate] = handleUpdateChild.mock.calls[0];
    expect(rowId).toBe('L1');
    expect(localUpdate.description).toBe('Hello');
    expect(localUpdate['description$_identifier']).toBe('IDENT');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('on !res.ok reads extractErrorMessage, calls toast.error and rejects', async () => {
    global.fetch = vi.fn().mockResolvedValue(errResponse());
    const extractErrorMessage = vi.fn().mockResolvedValue('server boom');
    const handleUpdateChild = vi.fn();
    const args = makeArgs({
      extractErrorMessage,
      hook: { editing: {}, selected: null, handleUpdateChild },
    });
    const handler = build(args);

    await expect(handler({ id: 'L1' }, 'description', 'Hello', {})).rejects.toThrow('server boom');
    expect(extractErrorMessage).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('server boom');
    expect(handleUpdateChild).not.toHaveBeenCalled();
  });

  it('prunes a row key that is empty AND present in the header snapshot so it is absent from the body', async () => {
    // `notes` is empty on the row and present in hook.editing -> should be stripped.
    // `kept` is empty on the row but NOT in the snapshot -> should remain.
    const args = makeArgs({
      hook: { editing: { notes: 'header-notes' }, selected: null, handleUpdateChild: vi.fn() },
    });
    const handler = build(args);
    await handler(
      { id: 'L1', notes: '', kept: '', description: 'Hi' },
      'description',
      'Hi',
      {},
    );

    const body = lastFetchBody();
    expect('notes' in body).toBe(false);
    expect('kept' in body).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ETP-4528 regression: after a successful PATCH, server/DB-trigger-computed
// fields (e.g. etgoQtydiff on physical-inventory lines) must be applied to
// the row from the PATCH response, not just the optimistic local edit.
// Pre-fix, the handler never called res.json(), so this second
// "server wins" handleUpdateChild call never happened and the computed
// field stayed stale until a full reload.
// ---------------------------------------------------------------------------
describe('buildInlineRowUpdateHandler — server-wins update from PATCH response', () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete global.fetch;
  });

  it('applies server-computed field (etgoQtydiff) via handleUpdateChild after a successful PATCH — regression guard', async () => {
    const handleUpdateChild = vi.fn();
    const serverRow = { id: 'L1', quantityCount: 42, etgoQtydiff: 100 };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [serverRow] } }),
    });
    const args = makeArgs({ hook: { editing: {}, selected: null, handleUpdateChild } });
    const handler = build(args);
    await handler({ id: 'L1', quantityCount: 10 }, 'quantityCount', '42', {});

    // Two calls: (1) optimistic local update, (2) server-wins update carrying
    // the trigger-computed field. This second call is the fix under test —
    // it would never fire against the pre-fix handler.
    expect(handleUpdateChild).toHaveBeenCalledTimes(2);
    const [rowId, serverUpdate] = handleUpdateChild.mock.calls[1];
    expect(rowId).toBe('L1');
    expect(serverUpdate.etgoQtydiff).toBe(100);
    expect(serverUpdate.quantityCount).toBe(42);
  });

  it('still applies the optimistic local update as the first handleUpdateChild call', async () => {
    const handleUpdateChild = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [{ id: 'L1', quantityCount: 42, etgoQtydiff: 100 }] } }),
    });
    const args = makeArgs({ hook: { editing: {}, selected: null, handleUpdateChild } });
    const handler = build(args);
    await handler({ id: 'L1', quantityCount: 10 }, 'quantityCount', '42', { identifier: 'IDENT' });

    expect(handleUpdateChild.mock.calls.length).toBeGreaterThanOrEqual(1);
    const [rowId, optimisticUpdate] = handleUpdateChild.mock.calls[0];
    expect(rowId).toBe('L1');
    expect(optimisticUpdate.quantityCount).toBe(42);
    expect(optimisticUpdate['quantityCount$_identifier']).toBe('IDENT');
  });

  it('on !res.ok does not apply a server row; toast.error + reject behavior is preserved', async () => {
    global.fetch = vi.fn().mockResolvedValue(errResponse());
    const handleUpdateChild = vi.fn();
    const extractErrorMessage = vi.fn().mockResolvedValue('server boom');
    const args = makeArgs({
      extractErrorMessage,
      hook: { editing: {}, selected: null, handleUpdateChild },
    });
    const handler = build(args);

    await expect(handler({ id: 'L1' }, 'quantityCount', '42', {})).rejects.toThrow('server boom');
    expect(handleUpdateChild).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('server boom');
  });

  it('a res.json() rejection is swallowed: no throw, optimistic update stands, no bad server call', async () => {
    const handleUpdateChild = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error('invalid json');
      },
    });
    const args = makeArgs({ hook: { editing: {}, selected: null, handleUpdateChild } });
    const handler = build(args);

    await expect(
      handler({ id: 'L1', quantityCount: 10 }, 'quantityCount', '42', {}),
    ).resolves.toBeUndefined();

    // Only the optimistic call happened — malformed JSON must not crash the
    // handler nor produce a bogus second handleUpdateChild call.
    expect(handleUpdateChild).toHaveBeenCalledTimes(1);
    const [, optimisticUpdate] = handleUpdateChild.mock.calls[0];
    expect(optimisticUpdate.quantityCount).toBe(42);
  });

  it('an empty/no-data response body ({} or null) does not trigger a second handleUpdateChild call', async () => {
    const handleUpdateChild = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    const args = makeArgs({ hook: { editing: {}, selected: null, handleUpdateChild } });
    const handler = build(args);
    await handler({ id: 'L1', quantityCount: 10 }, 'quantityCount', '42', {});

    expect(handleUpdateChild).toHaveBeenCalledTimes(1);

    handleUpdateChild.mockClear();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => null });
    const handler2 = build(args);
    await handler2({ id: 'L1', quantityCount: 10 }, 'quantityCount', '42', {});
    expect(handleUpdateChild).toHaveBeenCalledTimes(1);
  });
});
