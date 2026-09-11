import { renderHook, act, waitFor } from '@testing-library/react';

// ETP-5034 — a detail route pointing at a record that cannot be loaded.
//
// NEO answers GET /{entity}/{id} with HTTP 200 and `{"response":{"data":[],"status":0}}` for a
// non-existent id, an id the current role/organization cannot see, AND a malformed id — there is
// no 403 and no 404 in NeoCrudHandler's read path to tell them apart. fetchById used to do
// `data?.response?.data?.[0] ?? data`, so the whole ENVELOPE fell through the `??` and was
// normalized as if it were the record: `editing` became an id-less object and the detail route
// rendered a blank form indistinguishable from the creation form.
//
// These tests pin the fix: `extractSingleRow` never returns the envelope, and `fetchById`
// publishes the outcome through a new `recordError` state ('notFound' | 'error' | null).

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

import { useEntity, extractSingleRow } from '../useEntity';

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body };
}

// The exact body a live NEO instance returns for an unknown / invisible / malformed id.
const EMPTY_ENVELOPE = { response: { data: [], status: 0 } };

describe('extractSingleRow (ETP-5034)', () => {
  it('returns null for the empty NEO envelope instead of the envelope itself', () => {
    expect(
      extractSingleRow(EMPTY_ENVELOPE),
      'the empty envelope must never be handed on as if it were the record'
    ).toBeNull();
  });

  it('returns the first row of a populated envelope', () => {
    const row = { id: 'rec-1', documentNo: 'DOC-1' };
    expect(extractSingleRow({ response: { data: [row], status: 0 } })).toBe(row);
  });

  it('returns the payload itself when there is no response envelope (unwrapped handler)', () => {
    const record = { id: 'rec-1', documentNo: 'DOC-1' };
    expect(extractSingleRow(record)).toBe(record);
  });

  it('falls back to the payload when response.data is not an array', () => {
    // Only an ARRAY `response.data` is treated as the row list; anything else means this
    // is not a NEO envelope, so the unwrapped-handler fallback applies. Such a payload has
    // no `id`, so fetchById's id-less guard still turns it into 'notFound' (asserted below).
    const payload = { response: { data: null, status: 0 } };
    expect(extractSingleRow(payload)).toBe(payload);
  });

  it('returns null for null / undefined payloads', () => {
    expect(extractSingleRow(null)).toBeNull();
    expect(extractSingleRow(undefined)).toBeNull();
  });

  it('returns null for a bare array payload', () => {
    expect(extractSingleRow([{ id: 'rec-1' }])).toBeNull();
  });

  it('returns null for primitive payloads', () => {
    expect(extractSingleRow('rec-1')).toBeNull();
    expect(extractSingleRow(42)).toBeNull();
    expect(extractSingleRow(false)).toBeNull();
  });
});

describe('useEntity — recordError (ETP-5034)', () => {
  const defaultOpts = {
    token: 'test-token',
    apiBaseUrl: 'http://localhost/api',
    skipListFetch: true,
  };

  function renderEntity(entity = 'header', childEntity = null, opts = {}) {
    return renderHook(() => useEntity(entity, childEntity, { ...defaultOpts, ...opts }));
  }

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with recordError null', () => {
    const { result } = renderEntity();
    expect(result.current.recordError).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // THE bug: 200 + empty envelope
  // ---------------------------------------------------------------------------

  it('flags notFound on HTTP 200 with an empty envelope (unknown / invisible / malformed id)', async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse(EMPTY_ENVELOPE));

    const { result } = renderEntity();
    act(() => { result.current.fetchById('does-not-exist'); });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recordError).toBe('notFound');
    expect(
      result.current.selected,
      'the empty envelope must not become a pseudo-record'
    ).toBeNull();
    expect(
      result.current.editing,
      'a blank editing object is what made the dead link look like the creation form'
    ).toBeNull();
  });

  it('flags notFound when the returned row carries no id', async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ response: { data: [{ documentNo: 'DOC-1' }], status: 0 } })
    );

    const { result } = renderEntity();
    act(() => { result.current.fetchById('rec-1'); });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recordError).toBe('notFound');
    expect(result.current.selected).toBeNull();
    expect(result.current.editing).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Success path stays intact
  // ---------------------------------------------------------------------------

  it('leaves recordError null and loads the record on a populated envelope', async () => {
    globalThis.fetch.mockResolvedValue(
      jsonResponse({ response: { data: [{ id: 'rec-1', documentNo: 'DOC-1' }], status: 0 } })
    );

    const { result } = renderEntity();
    act(() => { result.current.fetchById('rec-1'); });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.recordError).toBeNull();
    expect(result.current.selected?.id).toBe('rec-1');
    expect(result.current.editing?.id).toBe('rec-1');
  });

  it('clears a previous notFound once a real record loads', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(EMPTY_ENVELOPE));
    const { result } = renderEntity();

    act(() => { result.current.fetchById('ghost'); });
    await waitFor(() => expect(result.current.recordError).toBe('notFound'));

    globalThis.fetch.mockResolvedValueOnce(
      jsonResponse({ response: { data: [{ id: 'rec-1' }], status: 0 } })
    );
    act(() => { result.current.fetchById('rec-1'); });

    await waitFor(() => expect(result.current.recordError).toBeNull());
    expect(result.current.selected?.id).toBe('rec-1');
  });

  // ---------------------------------------------------------------------------
  // Transport / HTTP failures
  // ---------------------------------------------------------------------------

  it("flags 'error' when the request rejects", async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network down'));

    const { result } = renderEntity();
    act(() => { result.current.fetchById('rec-1'); });

    await waitFor(() => expect(result.current.recordError).toBe('error'));
    expect(result.current.selected).toBeNull();
    expect(result.current.editing).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("flags 'error' on a non-ok HTTP status (500)", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({}, { ok: false, status: 500 }));

    const { result } = renderEntity();
    act(() => { result.current.fetchById('rec-1'); });

    await waitFor(() => expect(result.current.recordError).toBe('error'));
    expect(result.current.selected).toBeNull();
    expect(result.current.editing).toBeNull();
  });

  it("maps a 404 to 'notFound' rather than 'error'", async () => {
    globalThis.fetch.mockResolvedValue(jsonResponse({}, { ok: false, status: 404 }));

    const { result } = renderEntity();
    act(() => { result.current.fetchById('rec-1'); });

    await waitFor(() => expect(result.current.recordError).toBe('notFound'));
  });

  // ---------------------------------------------------------------------------
  // Resets — the legitimate creation / selection routes must never inherit the state
  // ---------------------------------------------------------------------------

  it('resets recordError to null on handleNew (creation route must not break)', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(EMPTY_ENVELOPE));
    const { result } = renderEntity();

    act(() => { result.current.fetchById('ghost'); });
    await waitFor(() => expect(result.current.recordError).toBe('notFound'));

    // handleNew fetches GET /{entity}/defaults.
    globalThis.fetch.mockResolvedValue(jsonResponse({ defaults: {} }));
    await act(async () => { await result.current.handleNew(); });

    expect(result.current.recordError).toBeNull();
    expect(result.current.editing).toEqual({});
  });

  it('resets recordError to null on handleSelect (list row click)', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(EMPTY_ENVELOPE));
    const { result } = renderEntity();

    act(() => { result.current.fetchById('ghost'); });
    await waitFor(() => expect(result.current.recordError).toBe('notFound'));

    act(() => { result.current.handleSelect({ id: 'rec-1', documentNo: 'DOC-1' }); });

    expect(result.current.recordError).toBeNull();
    expect(result.current.selected?.id).toBe('rec-1');
  });

  it('is null again while a new fetchById is in flight', async () => {
    globalThis.fetch.mockResolvedValueOnce(jsonResponse(EMPTY_ENVELOPE));
    const { result } = renderEntity();

    act(() => { result.current.fetchById('ghost'); });
    await waitFor(() => expect(result.current.recordError).toBe('notFound'));

    let resolveFetch;
    globalThis.fetch.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFetch = resolve; })
    );
    act(() => { result.current.fetchById('rec-1'); });

    expect(result.current.recordError).toBeNull();
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch(jsonResponse({ response: { data: [{ id: 'rec-1' }], status: 0 } }));
    });
  });

  it('does nothing when called without an id', () => {
    const { result } = renderEntity();
    act(() => { result.current.fetchById(undefined); });

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.current.recordError).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ETP-5034 (review cycle) — request sequencing: the A → B navigation race
// ---------------------------------------------------------------------------
//
// Navigating A → B faster than A resolves used to be harmless, because a late A only turned
// the spinner off. Once fetchById started publishing `recordError`, the late A also called
// setRecordError('notFound') — and by then isLoadingRecordForRoute() is already false, so
// DetailView painted "record not available" over a record (B) that was loading perfectly well.
//
// `fetchByIdSeqRef` fixes it: every call takes a sequence number and drops its OWN response —
// in the `.then` AND in the `.catch` — once a newer call has been issued. handleSelect and
// handleNew bump the same counter, because both hand the hook a record directly and an
// in-flight fetchById must not land on top of it.

describe('useEntity — fetchById sequencing (ETP-5034)', () => {
  const defaultOpts = {
    token: 'test-token',
    apiBaseUrl: 'http://localhost/api',
    skipListFetch: true,
  };

  function renderEntity(opts = {}) {
    return renderHook(() => useEntity('header', null, { ...defaultOpts, ...opts }));
  }

  /** A fetch mock whose responses are settled by the test, one deferred per call. */
  function deferredFetch(count) {
    const deferreds = [];
    globalThis.fetch = vi.fn();
    for (let i = 0; i < count; i += 1) {
      const d = {};
      d.promise = new Promise((resolve, reject) => {
        d.resolve = resolve;
        d.reject = reject;
      });
      deferreds.push(d);
      globalThis.fetch.mockImplementationOnce(() => d.promise);
    }
    return deferreds;
  }

  /** Let the hook's promise chain (fetch → res.json → state writes) run to completion. */
  async function flush() {
    await act(async () => {
      await new Promise((resolve) => { setTimeout(resolve, 0); });
    });
  }

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ignores a superseded response that resolves to the empty envelope', async () => {
    const [a, b] = deferredFetch(2);
    const { result } = renderEntity();

    act(() => { result.current.fetchById('A'); });
    act(() => { result.current.fetchById('B'); });

    // A — the abandoned route — lands last and answers "no such record".
    a.resolve(jsonResponse(EMPTY_ENVELOPE));
    await flush();

    expect(
      result.current.recordError,
      'a stale A must not paint "record not available" over the B that is still loading'
    ).toBeNull();
    expect(result.current.loading, 'B is still in flight').toBe(true);

    // B decides the outcome, exactly as if A had never been issued.
    b.resolve(jsonResponse({ response: { data: [{ id: 'B', documentNo: 'DOC-B' }], status: 0 } }));
    await flush();

    expect(result.current.recordError).toBeNull();
    expect(result.current.selected?.id).toBe('B');
    expect(result.current.editing?.id).toBe('B');
    expect(result.current.loading).toBe(false);
  });

  it('ignores a superseded response that REJECTS (late transport failure)', async () => {
    const [a, b] = deferredFetch(2);
    const { result } = renderEntity();

    act(() => { result.current.fetchById('A'); });
    act(() => { result.current.fetchById('B'); });

    a.reject(new Error('Network down'));
    await flush();

    expect(
      result.current.recordError,
      "the catch path is gated on the sequence too — a dead A must not flag 'error'"
    ).toBeNull();
    expect(result.current.loading).toBe(true);

    b.resolve(jsonResponse({ response: { data: [{ id: 'B' }], status: 0 } }));
    await flush();

    expect(result.current.recordError).toBeNull();
    expect(result.current.selected?.id).toBe('B');
  });

  it('lets a superseded 404 through neither as notFound nor as error', async () => {
    const [a, b] = deferredFetch(2);
    const { result } = renderEntity();

    act(() => { result.current.fetchById('A'); });
    act(() => { result.current.fetchById('B'); });

    a.resolve(jsonResponse({}, { ok: false, status: 404 }));
    await flush();

    expect(result.current.recordError).toBeNull();

    b.resolve(jsonResponse({ response: { data: [{ id: 'B' }], status: 0 } }));
    await flush();

    expect(result.current.selected?.id).toBe('B');
  });

  it('keeps the creation form intact when a superseded fetchById resolves after handleNew', async () => {
    const [a, defaults] = deferredFetch(2);
    const { result } = renderEntity();

    act(() => { result.current.fetchById('A'); });

    let newDone;
    act(() => { newDone = result.current.handleNew(); });
    defaults.resolve(jsonResponse({ defaults: {} }));
    await act(async () => { await newDone; });

    const editingAfterNew = result.current.editing;
    expect(editingAfterNew, 'handleNew opens the empty creation form').not.toBeNull();

    a.resolve(jsonResponse(EMPTY_ENVELOPE));
    await flush();

    expect(
      result.current.recordError,
      'the creation route must never inherit a dead route\'s not-found state'
    ).toBeNull();
    expect(result.current.selected).toBeNull();
    expect(
      result.current.editing,
      'the late A must not blank the form the user is already typing into'
    ).toBe(editingAfterNew);
  });

  it('keeps the selected row when a superseded fetchById resolves after handleSelect', async () => {
    const [a] = deferredFetch(1);
    const { result } = renderEntity();

    act(() => { result.current.fetchById('A'); });
    act(() => { result.current.handleSelect({ id: 'row-9', documentNo: 'DOC-9' }); });

    a.resolve(jsonResponse({ response: { data: [{ id: 'A', documentNo: 'DOC-A' }], status: 0 } }));
    await flush();

    expect(
      result.current.selected?.id,
      'the row the user clicked wins over the request they navigated away from'
    ).toBe('row-9');
    expect(result.current.editing?.id).toBe('row-9');
    expect(result.current.recordError).toBeNull();
  });

  it('keeps a handleSelect row even when the superseded fetchById fails', async () => {
    const [a] = deferredFetch(1);
    const { result } = renderEntity();

    act(() => { result.current.fetchById('A'); });
    act(() => { result.current.handleSelect({ id: 'row-9' }); });

    a.reject(new Error('Network down'));
    await flush();

    expect(result.current.recordError).toBeNull();
    expect(result.current.selected?.id).toBe('row-9');
  });

  it('applies the response of the newest call when it is the one that resolves last', async () => {
    const [a, b] = deferredFetch(2);
    const { result } = renderEntity();

    act(() => { result.current.fetchById('A'); });
    act(() => { result.current.fetchById('B'); });

    // No race at all: A first, then B — the ordinary case must keep working.
    a.resolve(jsonResponse({ response: { data: [{ id: 'A' }], status: 0 } }));
    await flush();
    b.resolve(jsonResponse(EMPTY_ENVELOPE));
    await flush();

    expect(
      result.current.recordError,
      "the newest call's answer is authoritative, including when it is 'not found'"
    ).toBe('notFound');
    expect(result.current.selected).toBeNull();
    expect(result.current.editing).toBeNull();
  });
});
