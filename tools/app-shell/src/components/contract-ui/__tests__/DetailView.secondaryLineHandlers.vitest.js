import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CREDENTIAL_MODES, setSessionCredentials } from '@etendosoftware/app-shell-core/auth';
import { declareCookieSession } from '@/test/sessionContract.js';

// ---------------------------------------------------------------------------
// PURPOSE
// ---------------------------------------------------------------------------
// The secondary-tab "lines" save/delete/add handler bodies (onSaveLine,
// onDelete, onAdd) are now produced by the exported factory
// `buildSecondaryLineHandlers(deps)` in DetailView.jsx. This suite imports
// that REAL production factory and drives its returned handlers directly with
// mocked dependencies (fetch / toast / hook methods / setters), asserting the
// OBSERVABLE behavior: the PATCH/DELETE request fired, the payload shape, the
// Promise.allSettled batch outcome, and the resulting local-state updates
// (handleUpdateChild / handleDeleteChild / setSelected* calls).
//
// No replica and no source-fidelity regex guard: the tests exercise the
// production code, so a behavioral change in the source is caught directly.
// ---------------------------------------------------------------------------

// DetailView.jsx pulls a heavy module graph. Mock the sibling/hook/lib modules
// the same way the other DetailView vitest files do so a named-export import
// of the pure factory does not drag in unmockable dependencies.
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useSearchParams: () => [new URLSearchParams()],
  useLocation: () => ({ pathname: '/test/123', search: '', hash: '' }),
}));
vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
  useLocale: () => ({}),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));
vi.mock('@/hooks/useEntity', () => ({ useEntity: () => ({ handleChange: vi.fn() }) }));
vi.mock('@/hooks/useCatalogs', () => ({ useCatalogs: () => ({ catalogs: {}, catalogsLoaded: true }) }));
vi.mock('@/hooks/useDisplayLogic', () => ({ useDisplayLogic: () => ({}) }));
vi.mock('@/hooks/useCallout', () => ({ useCallout: () => ({ calloutResult: null, calloutLoading: false, executeCallout: vi.fn() }) }));
vi.mock('@/hooks/useLineGrossAmount', () => ({
  useLineGrossAmount: () => ({ grossAmount: 0, computeGrossAmount: vi.fn() }),
  ORDER_LINE_CONFIG: { quantityField: 'orderedQuantity', priceField: 'unitPrice' },
}));
vi.mock('@/hooks/useDocumentAction', () => ({ useDocumentAction: () => ({ execute: vi.fn(), loading: false }) }));
vi.mock('@/components/layout/PageMetaContext', () => ({ useSetPageMeta: () => vi.fn() }));
vi.mock('@/components/layout/FavoritesContext', () => ({ useFavorites: () => ({ isFavorite: () => false, toggleFavorite: vi.fn() }) }));
vi.mock('../SummaryBar.jsx', () => ({ SummaryBar: () => null }));
vi.mock('../DocumentTotalsPanel.jsx', () => ({ default: () => null }));
vi.mock('../DocumentStatusPill.jsx', () => ({ default: () => null }));
vi.mock('../DocumentPrintDrawer.jsx', () => ({ default: () => null }));
vi.mock('@/lib/resolveIdentifier.js', () => ({ resolveIdentifier: (data, key) => data?.[key + '$_identifier'] ?? data?.[key] ?? '' }));
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
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

// ETP-4576 — these assertions describe the cookie-session contract, so the
// request builders have to be in that mode. src/test/setup.js resets the scheme
// before every test, hence a beforeEach rather than module scope.
beforeEach(() => {
  declareCookieSession();
});


// The REAL production factory under test.
import { buildSecondaryLineHandlers } from '../DetailView.jsx';
import { toast } from 'sonner';

// Build a complete deps object (all 20 keys the factory destructures) with
// vi.fn() mocks for setters/hooks and plain values for everything else.
// `secondaryInlineLinesRefs` mirrors the production ref-of-refs shape:
//   secondaryInlineLinesRefs.current[st.key].current.clearSelection()
function makeDeps(overrides = {}) {
  const stKey = overrides.st?.key ?? 'rate';
  const clearSelection = overrides.__clearSelection ?? vi.fn();
  delete overrides.__clearSelection;
  return {
    st: { key: 'rate', addLineFields: { entry: [{ key: 'qty' }, { key: 'price' }] } },
    stIdx: 0,
    api: { crud: {} },
    apiBaseUrl: '/api',
    // ETP-4576 — the credential is gone: DetailView reads the CSRF proof from
    // the auth context and threads only that down into this factory.
    csrfToken: 'test-csrf',
    secondaryHooks: [{
      children: [],
      handleAddChild: vi.fn(async () => ({ id: 'new-1' })),
      handleUpdateChild: vi.fn(),
      handleDeleteChild: vi.fn(),
    }],
    ui: (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key),
    extractErrorMessage: vi.fn(async () => 'server-error'),
    confirmDelete: vi.fn(async () => true),
    secondaryInlineLinesRefs: { current: { [stKey]: { current: { clearSelection } } } },
    selectedSecondaryLine: null,
    secondaryLineEdits: null,
    secondarySelectedRows: {},
    setAddingSecondaryLine: vi.fn(),
    setSavingSecondaryLine: vi.fn(),
    setSelectedSecondaryLine: vi.fn(),
    setSecondaryLineEdits: vi.fn(),
    setSecondaryLineEditColumns: vi.fn(),
    setSecondaryDeleting: vi.fn(),
    setSecondarySelectedRows: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// onSaveLine — PATCH a single secondary line
// ===========================================================================
describe('buildSecondaryLineHandlers.onSaveLine', () => {
  it('success: fires PATCH with numeric-coerced payload and applies server-wins local update', async () => {
    const serverRow = { id: 'r1', qty: 5, foreignAmount: 99 };
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ response: { data: [serverRow] } }) }));

    const deps = makeDeps({
      selectedSecondaryLine: { id: 'r1', _tabKey: 'rate' },
      // "5" is a numeric string -> coerced to 5; identifier is stripped.
      secondaryLineEdits: { qty: '5', 'qty$_identifier': 'five' },
    });
    const { onSaveLine } = buildSecondaryLineHandlers(deps);

    await onSaveLine();

    // PATCH to the right URL, identifier stripped, numeric string coerced.
    expect(global.fetch).toHaveBeenCalledWith('/api/rate/r1', expect.objectContaining({ method: 'PATCH' }));
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toEqual({ qty: 5 });

    // Saving flag toggled around the request.
    expect(deps.setSavingSecondaryLine).toHaveBeenNthCalledWith(1, true);
    expect(deps.setSavingSecondaryLine).toHaveBeenLastCalledWith(false);

    // Local row cache refreshed with the SERVER values (server wins).
    expect(deps.secondaryHooks[0].handleUpdateChild).toHaveBeenCalledWith('r1', serverRow);
    // Side-panel record updated with merged server-wins values.
    expect(deps.setSelectedSecondaryLine).toHaveBeenCalledWith(expect.any(Function));
    // Edits cleared, success toast.
    expect(deps.setSecondaryLineEdits).toHaveBeenCalledWith(null);
    expect(deps.setSecondaryLineEditColumns).toHaveBeenCalledWith({});
    expect(toast.success).toHaveBeenCalledWith('Record saved');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('numeric coercion: comma-locale strings are NOT coerced (Spanish "10,50" preserved)', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => null }));

    const deps = makeDeps({
      selectedSecondaryLine: { id: 'r1', _tabKey: 'rate' },
      secondaryLineEdits: { amount: '10,50', qty: '5', note: 'hello' },
    });
    const { onSaveLine } = buildSecondaryLineHandlers(deps);

    await onSaveLine();

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    // "5" -> 5 (plain numeric), "10,50" stays a string (comma -> not matched),
    // "hello" stays a string.
    expect(body).toEqual({ amount: '10,50', qty: 5, note: 'hello' });
  });

  it('ETP-4886: an _ID-backed field (e.g. attributeSetValue) is PATCHed as a string even with a "0" sentinel value', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => null }));

    const deps = makeDeps({
      st: {
        key: 'rate',
        addLineFields: {
          entry: [
            { key: 'qty' },
            { key: 'attributeSetValue', column: 'M_AttributeSetInstance_ID' },
          ],
        },
      },
      selectedSecondaryLine: { id: 'r1', _tabKey: 'rate' },
      secondaryLineEdits: { qty: '5', attributeSetValue: '0' },
    });
    const { onSaveLine } = buildSecondaryLineHandlers(deps);

    await onSaveLine();

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toEqual({ qty: 5, attributeSetValue: '0' });
    expect(typeof body.attributeSetValue).toBe('string');
  });

  it('success with null server payload: falls back to local edits for the cache update', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => null }));

    const deps = makeDeps({
      selectedSecondaryLine: { id: 'r2', _tabKey: 'rate' },
      secondaryLineEdits: { qty: 7 },
    });
    const { onSaveLine } = buildSecondaryLineHandlers(deps);

    await onSaveLine();

    // serverValues is null -> cache updated with the local edits instead.
    expect(deps.secondaryHooks[0].handleUpdateChild).toHaveBeenCalledWith('r2', { qty: 7 });
    expect(toast.success).toHaveBeenCalledWith('Record saved');
  });

  it('HTTP-error: no cache corruption, error toast from extractErrorMessage, edits NOT cleared', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, json: async () => ({}) }));

    const deps = makeDeps({
      selectedSecondaryLine: { id: 'r3', _tabKey: 'rate' },
      secondaryLineEdits: { qty: 3 },
    });
    const { onSaveLine } = buildSecondaryLineHandlers(deps);

    await onSaveLine();

    expect(deps.extractErrorMessage).toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('server-error');
    // Local state untouched on failure — no optimistic corruption.
    expect(deps.secondaryHooks[0].handleUpdateChild).not.toHaveBeenCalled();
    expect(deps.setSecondaryLineEdits).not.toHaveBeenCalledWith(null);
    expect(toast.success).not.toHaveBeenCalled();
    // Saving flag still reset in finally.
    expect(deps.setSavingSecondaryLine).toHaveBeenLastCalledWith(false);
  });

  it('network rejection: caught, error toast, saving flag reset in finally', async () => {
    global.fetch = vi.fn(async () => { throw new Error('boom-network'); });

    const deps = makeDeps({
      selectedSecondaryLine: { id: 'r4', _tabKey: 'rate' },
      secondaryLineEdits: { qty: 1 },
    });
    const { onSaveLine } = buildSecondaryLineHandlers(deps);

    await onSaveLine();

    expect(toast.error).toHaveBeenCalledWith('boom-network');
    expect(deps.secondaryHooks[0].handleUpdateChild).not.toHaveBeenCalled();
    expect(deps.setSavingSecondaryLine).toHaveBeenLastCalledWith(false);
  });
});

// ===========================================================================
// onDelete — Promise.allSettled multi-row delete batch
// ===========================================================================
describe('buildSecondaryLineHandlers.onDelete', () => {
  it('aborts entirely when confirmDelete resolves false (no fetch, no state change)', async () => {
    global.fetch = vi.fn();
    const deps = makeDeps({
      confirmDelete: vi.fn(async () => false),
      secondarySelectedRows: { rate: [{ id: 'a' }] },
    });
    const { onDelete } = buildSecondaryLineHandlers(deps);

    await onDelete();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(deps.setSecondaryDeleting).not.toHaveBeenCalled();
    expect(deps.secondaryHooks[0].handleDeleteChild).not.toHaveBeenCalled();
  });

  it('all succeed: DELETEs each row (apiBaseUrl fallback), removes each from cache, clears selection', async () => {
    global.fetch = vi.fn(async () => ({ ok: true }));
    const clearSelection = vi.fn();
    const deps = makeDeps({
      __clearSelection: clearSelection,
      secondarySelectedRows: { rate: [{ id: 'a' }, { id: 'b' }] },
    });
    const { onDelete } = buildSecondaryLineHandlers(deps);

    await onDelete();

    expect(global.fetch).toHaveBeenCalledWith('/api/rate/a', expect.objectContaining({ method: 'DELETE' }));
    expect(global.fetch).toHaveBeenCalledWith('/api/rate/b', expect.objectContaining({ method: 'DELETE' }));
    expect(deps.secondaryHooks[0].handleDeleteChild).toHaveBeenCalledWith('a');
    expect(deps.secondaryHooks[0].handleDeleteChild).toHaveBeenCalledWith('b');
    // Selection cleared via the inline-lines ref handle, then state reset.
    expect(clearSelection).toHaveBeenCalled();
    expect(deps.setSecondarySelectedRows).toHaveBeenCalledWith(expect.any(Function));
    // ETP-4656 — single combined outcome toast (bulkDeleteAllSucceeded), not the
    // old two-independent-if recordsDeleted/recordsCouldNotBeDeleted pattern.
    expect(toast.success).toHaveBeenCalledWith('bulkDeleteAllSucceeded:{"count":2}');
    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    // Deleting flag toggled on then off.
    expect(deps.setSecondaryDeleting).toHaveBeenCalledTimes(2);
  });

  it('mixed batch (one ok, one http-fail, one rejected): only successes removed, ONE combined warning toast fired', async () => {
    global.fetch = vi.fn((url) => {
      if (url === '/api/rate/ok') return Promise.resolve({ ok: true });
      if (url === '/api/rate/httpfail') return Promise.resolve({ ok: false });
      return Promise.reject(new Error('net'));
    });
    const deps = makeDeps({
      secondarySelectedRows: { rate: [{ id: 'ok' }, { id: 'httpfail' }, { id: 'rejected' }] },
    });
    const { onDelete } = buildSecondaryLineHandlers(deps);

    await onDelete();

    // Promise.allSettled means the rejected one does NOT abort the batch.
    expect(deps.secondaryHooks[0].handleDeleteChild).toHaveBeenCalledTimes(1);
    expect(deps.secondaryHooks[0].handleDeleteChild).toHaveBeenCalledWith('ok');
    expect(deps.secondaryHooks[0].handleDeleteChild).not.toHaveBeenCalledWith('httpfail');
    expect(deps.secondaryHooks[0].handleDeleteChild).not.toHaveBeenCalledWith('rejected');

    // 1 deleted, 2 failed — ETP-4656: ONE combined warning toast (bulkDeletePartialFailure),
    // not two stacked success+error toasts.
    expect(toast.warning).toHaveBeenCalledWith('bulkDeletePartialFailure:{"succeeded":1,"total":3,"failed":2}');
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('uses api.crud detailUrl template when present', async () => {
    global.fetch = vi.fn(async () => ({ ok: true }));
    const deps = makeDeps({
      api: { crud: { rate: { detailUrl: '/custom/{id}/x' } } },
      secondarySelectedRows: { rate: [{ id: 'z9' }] },
    });
    const { onDelete } = buildSecondaryLineHandlers(deps);

    await onDelete();

    expect(global.fetch).toHaveBeenCalledWith('/custom/z9/x', expect.objectContaining({ method: 'DELETE' }));
  });

  it('clears the open side panel when the deleted row is the selected line', async () => {
    global.fetch = vi.fn(async () => ({ ok: true }));
    const deps = makeDeps({
      selectedSecondaryLine: { id: 'sel', _tabKey: 'rate' },
      secondarySelectedRows: { rate: [{ id: 'sel' }] },
    });
    const { onDelete } = buildSecondaryLineHandlers(deps);

    await onDelete();

    expect(deps.setSelectedSecondaryLine).toHaveBeenCalledWith(null);
  });

  it('does NOT clear the side panel when the deleted row is a different line', async () => {
    global.fetch = vi.fn(async () => ({ ok: true }));
    const deps = makeDeps({
      selectedSecondaryLine: { id: 'other', _tabKey: 'rate' },
      secondarySelectedRows: { rate: [{ id: 'sel' }] },
    });
    const { onDelete } = buildSecondaryLineHandlers(deps);

    await onDelete();

    expect(deps.setSelectedSecondaryLine).not.toHaveBeenCalledWith(null);
  });
});

// ===========================================================================
// onAdd — inline add-row commit
// ===========================================================================
describe('buildSecondaryLineHandlers.onAdd', () => {
  it('filters to declared entry keys, calls handleAddChild, closes add-row on truthy result', async () => {
    const deps = makeDeps();
    const { onAdd } = buildSecondaryLineHandlers(deps);

    const result = await onAdd({ qty: 4, price: 10, junk: 'drop-me', another: 'nope' });

    // Only declared entry keys survive the filter.
    expect(deps.secondaryHooks[0].handleAddChild).toHaveBeenCalledWith({ qty: 4, price: 10 });
    // Truthy result closes the inline add row.
    expect(deps.setAddingSecondaryLine).toHaveBeenCalledWith(expect.any(Function));
    expect(result).toEqual({ id: 'new-1' });
  });

  it('does NOT close the add-row when handleAddChild returns falsy', async () => {
    const deps = makeDeps();
    deps.secondaryHooks[0].handleAddChild = vi.fn(async () => null);
    const { onAdd } = buildSecondaryLineHandlers(deps);

    await onAdd({ qty: 1 });

    expect(deps.secondaryHooks[0].handleAddChild).toHaveBeenCalledWith({ qty: 1 });
    expect(deps.setAddingSecondaryLine).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// ETP-4576 — session-cookie request contract
// ===========================================================================
// The session is a server-side `__Host-go_session` cookie. Both requests this
// factory issues are unsafe methods (onSaveLine PATCH, onDelete DELETE), so
// both carry `credentials: 'include'` plus a guarded `X-Go-CSRF`, and neither
// may ever carry an Authorization header.
describe('buildSecondaryLineHandlers — session-cookie contract', () => {
  const MISSING_PROOFS = [['undefined', undefined], ['null', null], ['an empty string', '']];

  function lastInit() {
    const calls = global.fetch.mock.calls;
    return calls[calls.length - 1][1];
  }

  function expectNoAuthorization(headers) {
    const keys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain('authorization');
    expect(JSON.stringify(headers)).not.toContain('Bearer');
  }

  describe('onSaveLine PATCH', () => {
    const runSave = async (overrides = {}) => {
      global.fetch = vi.fn(async () => ({ ok: true, json: async () => null }));
      const deps = makeDeps({
        selectedSecondaryLine: { id: 'r1', _tabKey: 'rate' },
        secondaryLineEdits: { qty: 5 },
        ...overrides,
      });
      const { onSaveLine } = buildSecondaryLineHandlers(deps);
      await onSaveLine();
    };

    it('sends credentials and the CSRF proof, and no Authorization header', async () => {
      await runSave();
      const init = lastInit();
      expect(init.method).toBe('PATCH');
      expect(init.credentials).toBe('include');
      expect(init.headers['X-Go-CSRF']).toBe('test-csrf');
      expect(init.headers['Content-Type']).toBe('application/json');
      expectNoAuthorization(init.headers);
    });

    it('never sends an Authorization header, even when a stray token is threaded in', async () => {
      // Hostile input: a not-yet-cleaned caller still passes the dead credential.
      await runSave({ token: 'legacy-token' });
      const init = lastInit();
      expectNoAuthorization(init.headers);
      expect(JSON.stringify(init.headers)).not.toContain('legacy-token');
    });

    for (const [label, value] of MISSING_PROOFS) {
      it(`omits X-Go-CSRF entirely when the session's proof is ${label}`, async () => {
        // Published directly rather than through declareCookieSession: that helper
        // defaults its argument, so `undefined` would silently become the real test
        // proof and this case would assert nothing. The credential no longer travels
        // through the deps bag — it is a property of the declared session.
        setSessionCredentials({ mode: CREDENTIAL_MODES.cookie, csrfToken: value });
        await runSave({});
        const init = lastInit();
        expect('X-Go-CSRF' in init.headers).toBe(false);
        expect(init.credentials).toBe('include');
        expectNoAuthorization(init.headers);
      });
    }
  });

  describe('onDelete DELETE', () => {
    const runDelete = async (overrides = {}) => {
      global.fetch = vi.fn(async () => ({ ok: true }));
      const deps = makeDeps({
        secondarySelectedRows: { rate: [{ id: 'z9' }] },
        ...overrides,
      });
      const { onDelete } = buildSecondaryLineHandlers(deps);
      await onDelete();
    };

    it('sends credentials and the CSRF proof, and no Authorization header', async () => {
      await runDelete();
      const init = lastInit();
      expect(init.method).toBe('DELETE');
      expect(init.credentials).toBe('include');
      expect(init.headers['X-Go-CSRF']).toBe('test-csrf');
      expectNoAuthorization(init.headers);
    });

    it('never sends an Authorization header, even when a stray token is threaded in', async () => {
      await runDelete({ token: 'legacy-token' });
      const init = lastInit();
      expectNoAuthorization(init.headers);
      expect(JSON.stringify(init.headers)).not.toContain('legacy-token');
    });

    for (const [label, value] of MISSING_PROOFS) {
      it(`omits X-Go-CSRF entirely when the session's proof is ${label}`, async () => {
        // Published directly rather than through declareCookieSession: that helper
        // defaults its argument, so `undefined` would silently become the real test
        // proof and this case would assert nothing. The credential no longer travels
        // through the deps bag — it is a property of the declared session.
        setSessionCredentials({ mode: CREDENTIAL_MODES.cookie, csrfToken: value });
        await runDelete({});
        const init = lastInit();
        expect('X-Go-CSRF' in init.headers).toBe(false);
        expect(init.credentials).toBe('include');
        expectNoAuthorization(init.headers);
      });
    }
  });
});
