import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
    token: 'TKN',
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
    token: args.token,
    extractErrorMessage: args.extractErrorMessage,
    ui: args.ui,
    fields: args.fields,
    raiseRowSaveConflict: args.raiseRowSaveConflict,
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

  it('PATCHes the configured detailUrl with {id} replaced, JSON content type, and Bearer token', async () => {
    const args = makeArgs();
    const handler = build(args);
    await handler({ id: 'L1' }, 'description', 'Hello', {});

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://x/api/orderLine/L1');
    expect(opts.method).toBe('PATCH');
    expect(opts.headers['Content-Type']).toBe('application/json');
    expect(opts.headers.Authorization).toBe('Bearer TKN');
  });

  it('omits the Authorization header when token is falsy', async () => {
    const args = makeArgs({ token: '' });
    const handler = build(args);
    await handler({ id: 'L1' }, 'description', 'Hello', {});

    const [, opts] = global.fetch.mock.calls[0];
    expect('Authorization' in opts.headers).toBe(false);
  });

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
// ETP-4886 — `fields` (addLineFields.entry) tells the coercer which keys are
// backed by an `_ID` column, so a numeric-looking sentinel (e.g. the
// attributeSetValue "0") is PATCHed as a string, not silently turned into a
// Number that NEO Headless rejects with 400.
// ---------------------------------------------------------------------------
describe('buildInlineRowUpdateHandler — _ID column coercion (ETP-4886)', () => {
  const ATTRIBUTE_SET_FIELDS = [
    { key: 'attributeSetValue', column: 'M_AttributeSetInstance_ID' },
    { key: 'unitPrice', column: 'PriceActual' },
  ];

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(okResponse());
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete global.fetch;
  });

  it('PATCHes the changed _ID-backed field as a string, not a Number, when fields metadata is provided', async () => {
    const args = makeArgs({ fields: ATTRIBUTE_SET_FIELDS });
    const handler = build(args);
    await handler({ id: 'L1' }, 'attributeSetValue', '0', {});

    const body = lastFetchBody();
    expect(body.attributeSetValue).toBe('0');
    expect(typeof body.attributeSetValue).toBe('string');
  });

  it('still coerces a genuinely numeric, non-_ID field to a Number alongside the untouched _ID field', async () => {
    const args = makeArgs({ fields: ATTRIBUTE_SET_FIELDS });
    const handler = build(args);
    await handler(
      { id: 'L1', attributeSetValue: '0' },
      'unitPrice',
      '12.5',
      {},
    );

    const body = lastFetchBody();
    expect(body.unitPrice).toBe(12.5);
    expect(typeof body.unitPrice).toBe('number');
    expect(body.attributeSetValue).toBe('0');
    expect(typeof body.attributeSetValue).toBe('string');
  });

  it('without fields metadata (legacy call), the same _ID-like value is coerced to a Number — the pre-fix (buggy) behavior', async () => {
    const args = makeArgs(); // no `fields` override -> undefined
    const handler = build(args);
    await handler({ id: 'L1' }, 'attributeSetValue', '0', {});

    const body = lastFetchBody();
    expect(body.attributeSetValue).toBe(0);
    expect(typeof body.attributeSetValue).toBe('number');
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

describe('buildInlineRowUpdateHandler — save-conflict handoff (ETP-5073 / DOC-04)', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(errResponse());
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete global.fetch;
  });

  it('when raiseRowSaveConflict raises the dialog (true), does NOT toast.error, but still throws with userNotified: true', async () => {
    const raiseRowSaveConflict = vi.fn().mockResolvedValue(true);
    const extractErrorMessage = vi.fn().mockResolvedValue('OBJSON_StaleDate');
    const args = makeArgs({ raiseRowSaveConflict, extractErrorMessage });
    const handler = build(args);

    let caught;
    try {
      await handler({ id: 'L1' }, 'unitPrice', '42', {});
    } catch (e) {
      caught = e;
    }

    expect(toast.error).not.toHaveBeenCalled();
    expect(caught).toBeInstanceOf(Error);
    expect(caught.userNotified).toBe(true);
  });

  it('when raiseRowSaveConflict reports false (a non-stale error, or no dialog host), toasts and still throws with userNotified: true', async () => {
    const raiseRowSaveConflict = vi.fn().mockResolvedValue(false);
    const extractErrorMessage = vi.fn().mockResolvedValue('Duplicate record');
    const args = makeArgs({ raiseRowSaveConflict, extractErrorMessage });
    const handler = build(args);

    let caught;
    try {
      await handler({ id: 'L1' }, 'unitPrice', '42', {});
    } catch (e) {
      caught = e;
    }

    expect(toast.error).toHaveBeenCalledWith('Duplicate record');
    expect(caught.userNotified).toBe(true);
  });

  it('without a raiseRowSaveConflict prop at all (optional chaining), falls back to the plain toast — preexisting contract', async () => {
    const extractErrorMessage = vi.fn().mockResolvedValue('server boom');
    const args = makeArgs({ extractErrorMessage }); // no raiseRowSaveConflict override
    const handler = build(args);

    await expect(handler({ id: 'L1' }, 'unitPrice', '42', {})).rejects.toThrow('server boom');
    expect(toast.error).toHaveBeenCalledWith('server boom');
  });

  it('calls raiseRowSaveConflict with the raw response and the row id BEFORE extractErrorMessage — the clone/consume ordering matters', async () => {
    const order = [];
    const raiseRowSaveConflict = vi.fn(async (res, rowId) => {
      order.push(['raise', res, rowId]);
      return false;
    });
    const extractErrorMessage = vi.fn(async () => {
      order.push(['extract']);
      return 'boom';
    });
    const args = makeArgs({ raiseRowSaveConflict, extractErrorMessage });
    const handler = build(args);

    await expect(handler({ id: 'L42' }, 'unitPrice', '1', {})).rejects.toThrow();

    expect(order.map(e => e[0])).toEqual(['raise', 'extract']);
    expect(order[0][2]).toBe('L42');
  });
});
