import { renderHook, act, waitFor } from '@testing-library/react';
// From the `sessionCredentials` leaf, not the `./auth` barrel: the barrel
// re-exports AuthContext.jsx and drags JSX into every graph that reaches it.
import {
  CREDENTIAL_MODES,
  setSessionCredentials,
} from '@etendosoftware/app-shell-core/auth/sessionCredentials.js';
import { useDisplayLogic, __resetDisplayLogicCacheForTests } from '../useDisplayLogic';

const TEST_BEARER = 'test-token';
const TEST_CSRF = 'test-csrf';

/**
 * Which credential scheme is live is a backend preference, so BOTH are reachable
 * at runtime and neither may be the one the suite happens to inherit. The global
 * test setup resets to the `bearer` default before every test, so a credential
 * assertion that does not declare a scheme is only ever exercising that default —
 * it passes by omission, not by proving anything. Every scheme-sensitive case
 * below therefore runs once per scheme and states what each must send.
 */
const SCHEMES = [
  {
    name: 'bearer',
    declare: () => setSessionCredentials({
      mode: CREDENTIAL_MODES.bearer, token: TEST_BEARER, csrfToken: TEST_CSRF,
    }),
    assertCredential: (headers) => {
      expect(headers.Authorization).toBe(`Bearer ${TEST_BEARER}`);
      expect(headers['X-Go-CSRF'], 'bearer sends no CSRF proof').toBeUndefined();
    },
  },
  {
    name: 'cookie',
    declare: () => setSessionCredentials({
      mode: CREDENTIAL_MODES.cookie, token: TEST_BEARER, csrfToken: TEST_CSRF,
    }),
    assertCredential: (headers) => {
      expect(headers['X-Go-CSRF']).toBe(TEST_CSRF);
      expect(headers.Authorization, 'the cookie scheme sends no bearer').toBeUndefined();
    },
  },
];

describe('useDisplayLogic', () => {
  const opts = { token: 'test-token', apiBaseUrl: 'http://localhost/api' };

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn();
    // The dimension-visibility cache is module-level (by design — see useDisplayLogic.js)
    // so it survives across renderHook calls; reset it here so no test's cacheableKeys
    // writes leak into a later test that happens to reuse the same entity/apiBaseUrl.
    __resetDisplayLogicCacheForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns empty readOnly and visibility objects initially', () => {
    const { result } = renderHook(() =>
      useDisplayLogic('header', { id: '1' }, opts)
    );

    expect(result.current).toEqual({ readOnly: {}, visibility: {} });
  });

  it('fetches evaluate-display endpoint with field values', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ readOnly: { amount: true }, visibility: { discount: false } }),
    });

    const fieldValues = { id: '123', status: 'DR' };
    renderHook(() => useDisplayLogic('header', fieldValues, opts));

    // Advance debounce
    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runAllTimersAsync();
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost/api/header/evaluate-display',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ fieldValues }),
      }),
    );
  });

  for (const scheme of SCHEMES) {
    it(`sends the ${scheme.name} credential the active scheme yields`, async () => {
      scheme.declare();
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ readOnly: {}, visibility: {} }),
      });

      renderHook(() => useDisplayLogic('header', { id: '123' }, opts));

      await act(async () => {
        vi.advanceTimersByTime(300);
        await vi.runAllTimersAsync();
      });

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      const [, init] = globalThis.fetch.mock.calls.at(-1);
      scheme.assertCredential(init.headers);
    });

    it(`still evaluates under ${scheme.name} when the caller passes no token`, async () => {
      scheme.declare();
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ readOnly: {}, visibility: {} }),
      });

      renderHook(() =>
        useDisplayLogic('header', { id: '1' }, { token: '', apiBaseUrl: 'http://localhost' })
      );

      await act(async () => {
        vi.advanceTimersByTime(300);
        await vi.runAllTimersAsync();
      });

      // The `token` argument is no longer what authorises the call under either
      // scheme; a `!token` gate here cancelled it silently under cookie.
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });
  }

  it('returns readOnly and visibility from the response', async () => {
    vi.useRealTimers();

    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        readOnly: { amount: true, status: false },
        visibility: { discount: false },
      }),
    });

    const { result } = renderHook(() =>
      useDisplayLogic('header', { id: '123', status: 'DR' }, opts)
    );

    await waitFor(() => {
      expect(result.current.readOnly).toEqual({ amount: true, status: false });
      expect(result.current.visibility).toEqual({ discount: false });
    });

    vi.useFakeTimers();
  });

  it('skips evaluation when record has no id (new record)', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ readOnly: {}, visibility: {} }),
    });

    renderHook(() =>
      useDisplayLogic('header', { status: 'DR' }, opts)
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runAllTimersAsync();
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('skips evaluation when fieldValues is null', async () => {
    renderHook(() => useDisplayLogic('header', null, opts));

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runAllTimersAsync();
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('still skips when the entity or base url is missing', async () => {
    renderHook(() => useDisplayLogic('header', { id: '1' }, { apiBaseUrl: '' }));
    renderHook(() => useDisplayLogic('', { id: '1' }, { apiBaseUrl: 'http://localhost' }));

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runAllTimersAsync();
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('debounces rapid field value changes', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ readOnly: {}, visibility: {} }),
    });

    const { rerender } = renderHook(
      ({ values }) => useDisplayLogic('header', values, opts),
      { initialProps: { values: { id: '1', status: 'DR' } } },
    );

    // Simulate rapid changes before debounce fires
    rerender({ values: { id: '1', status: 'CO' } });
    rerender({ values: { id: '1', status: 'VO' } });

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runAllTimersAsync();
    });

    // Should only fetch once with the last value
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.fieldValues.status).toBe('VO');
  });

  it('handles fetch failure gracefully (keeps defaults)', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() =>
      useDisplayLogic('header', { id: '1' }, opts)
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runAllTimersAsync();
    });

    // Should remain with default empty objects (best-effort behavior)
    expect(result.current).toEqual({ readOnly: {}, visibility: {} });
  });

  it('handles non-ok response gracefully', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() =>
      useDisplayLogic('header', { id: '1' }, opts)
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runAllTimersAsync();
    });

    expect(result.current).toEqual({ readOnly: {}, visibility: {} });
  });

  // --- Additional branch coverage ---

  it('returns readOnly=true for specific fields and readOnly=false for others', async () => {
    vi.useRealTimers();

    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        readOnly: { amount: true, name: false },
        visibility: { discount: true, notes: false },
      }),
    });

    const { result } = renderHook(() =>
      useDisplayLogic('header', { id: '1', status: 'CO' }, opts)
    );

    await waitFor(() => {
      expect(result.current.readOnly.amount).toBe(true);
      expect(result.current.readOnly.name).toBe(false);
    });

    expect(result.current.visibility.discount).toBe(true);
    expect(result.current.visibility.notes).toBe(false);
    vi.useFakeTimers();
  });

  it('fields without logic remain in default state (empty readOnly/visibility)', async () => {
    vi.useRealTimers();

    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        readOnly: {},
        visibility: {},
      }),
    });

    const { result } = renderHook(() =>
      useDisplayLogic('header', { id: '1' }, opts)
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    // All fields remain editable and visible by default
    expect(result.current.readOnly).toEqual({});
    expect(result.current.visibility).toEqual({});
    vi.useFakeTimers();
  });

  it('skips evaluation when entity is empty', async () => {
    renderHook(() =>
      useDisplayLogic('', { id: '1' }, opts)
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runAllTimersAsync();
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('skips evaluation when apiBaseUrl is missing', async () => {
    renderHook(() =>
      useDisplayLogic('header', { id: '1' }, { token: 'tok', apiBaseUrl: '' })
    );

    await act(async () => {
      vi.advanceTimersByTime(300);
      await vi.runAllTimersAsync();
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('handles response with missing readOnly/visibility keys (defaults to empty)', async () => {
    vi.useRealTimers();

    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() =>
      useDisplayLogic('header', { id: '1' }, opts)
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    // Falls back to empty objects via ?? {}
    expect(result.current.readOnly).toEqual({});
    expect(result.current.visibility).toEqual({});
    vi.useFakeTimers();
  });

  // cacheableKeys: pre-seeds the FIRST render of a new mount from the last resolved value
  // of a previous mount for the same window/entity, avoiding the "renders visible, flips
  // to hidden a moment later" flicker while evaluate-display is still in flight — without
  // ever skipping or delaying the real per-record evaluate-display call itself.
  describe('cacheableKeys (dimension-visibility flicker fix)', () => {
    it('does not pre-seed anything on a cold cache (first mount ever for this key)', () => {
      const { result } = renderHook(() =>
        useDisplayLogic('header', { id: '1' }, { ...opts, cacheableKeys: ['project'] })
      );

      expect(result.current).toEqual({ readOnly: {}, visibility: {} });
    });

    it('pre-seeds only the declared cacheable keys from a previous mount, synchronously', async () => {
      vi.useRealTimers();
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          readOnly: { amount: true },
          visibility: { project: false, costcenter: true, otherField: false },
        }),
      });

      const first = renderHook(() =>
        useDisplayLogic('header', { id: '1' }, { ...opts, cacheableKeys: ['project', 'costcenter'] })
      );
      await waitFor(() => {
        expect(first.result.current.visibility.project).toBe(false);
      });
      first.unmount();

      // A second, independent mount for the SAME window/entity — before its own
      // evaluate-display call has resolved (fetch is about to be told to hang).
      globalThis.fetch.mockImplementation(() => new Promise(() => {})); // never resolves
      const second = renderHook(() =>
        useDisplayLogic('header', { id: '2' }, { ...opts, cacheableKeys: ['project', 'costcenter'] })
      );

      // Synchronous first render already reflects the previous mount's cacheable keys —
      // no need to wait for anything, this is the whole point of the fix.
      expect(second.result.current.visibility.project).toBe(false);
      expect(second.result.current.visibility.costcenter).toBe(true);
      // Non-cacheable keys (readOnly entirely, and any visibility key not declared
      // cacheable) must NOT carry over — those are genuinely per-record.
      expect(second.result.current.visibility.otherField).toBeUndefined();
      expect(second.result.current.readOnly.amount).toBeUndefined();

      vi.useFakeTimers();
    });

    it('still calls evaluate-display on every mount even when the cache pre-seeds a value', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ readOnly: {}, visibility: { project: false } }),
      });

      // Stable fieldValues references (not inline object literals): an inline literal
      // gets recreated on every re-render of the renderHook wrapper, so once the fetch
      // resolves and setDisplayState triggers a re-render, the effect's dependency array
      // would see a "new" fieldValues and debounce a second, unwanted evaluate-display
      // call — an artifact of the test harness, not the behavior under test.
      const first = renderHook(() =>
        useDisplayLogic('header', { id: '1' }, { ...opts, cacheableKeys: ['project'] })
      );
      await act(async () => {
        vi.advanceTimersByTime(300);
        await vi.runAllTimersAsync();
      });
      first.unmount();

      renderHook(() =>
        useDisplayLogic('header', { id: '2' }, { ...opts, cacheableKeys: ['project'] })
      );
      await act(async () => {
        vi.advanceTimersByTime(300);
        await vi.runAllTimersAsync();
      });

      // The cache pre-seeds the FIRST render only — it never replaces the real,
      // per-record evaluate-display call, which must still fire for every mount.
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    });

    it('refreshes the cache when a fresh resolution disagrees with the seeded value', async () => {
      vi.useRealTimers();
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ readOnly: {}, visibility: { project: false } }),
      });
      const first = renderHook(() =>
        useDisplayLogic('header', { id: '1' }, { ...opts, cacheableKeys: ['project'] })
      );
      await waitFor(() => expect(first.result.current.visibility.project).toBe(false));
      first.unmount();

      // GL Configuration was re-enabled in the meantime — the next record's fresh
      // resolution disagrees with what was cached.
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ readOnly: {}, visibility: { project: true } }),
      });
      const second = renderHook(() =>
        useDisplayLogic('header', { id: '2' }, { ...opts, cacheableKeys: ['project'] })
      );
      // Pre-seeded from the stale cached value first...
      expect(second.result.current.visibility.project).toBe(false);
      // ...then self-corrects once its own evaluate-display call resolves.
      await waitFor(() => expect(second.result.current.visibility.project).toBe(true));

      // A THIRD mount now sees the corrected value from the cache immediately.
      globalThis.fetch.mockImplementation(() => new Promise(() => {}));
      const third = renderHook(() =>
        useDisplayLogic('header', { id: '3' }, { ...opts, cacheableKeys: ['project'] })
      );
      expect(third.result.current.visibility.project).toBe(true);

      vi.useFakeTimers();
    });

    it('does not pre-seed a key the current caller did not declare cacheable, even when a broader previous caller cached it for the same entity/apiBaseUrl', async () => {
      vi.useRealTimers();
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          readOnly: {},
          // A broader hook instance (e.g. a different window sharing the same entity name)
          // declares BOTH keys cacheable and caches both.
          visibility: { project: false, costcenter: true },
        }),
      });

      const broad = renderHook(() =>
        useDisplayLogic('header', { id: '1' }, { ...opts, cacheableKeys: ['project', 'costcenter'] })
      );
      await waitFor(() => expect(broad.result.current.visibility.costcenter).toBe(true));
      broad.unmount();

      // A narrower hook instance only declares `project` as safe to reuse. It must NOT
      // be pre-seeded with `costcenter`, which it never declared cacheable — even though
      // both share the same `${apiBaseUrl}/${entity}` cache key.
      globalThis.fetch.mockImplementation(() => new Promise(() => {})); // never resolves
      const narrow = renderHook(() =>
        useDisplayLogic('header', { id: '2' }, { ...opts, cacheableKeys: ['project'] })
      );

      expect(narrow.result.current.visibility.project).toBe(false);
      expect(narrow.result.current.visibility.costcenter).toBeUndefined();

      vi.useFakeTimers();
    });

    it('keeps separate caches for different entities on the same window', async () => {
      vi.useRealTimers();
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ readOnly: {}, visibility: { project: false } }),
      });
      const headerMount = renderHook(() =>
        useDisplayLogic('header', { id: '1' }, { ...opts, cacheableKeys: ['project'] })
      );
      await waitFor(() => expect(headerMount.result.current.visibility.project).toBe(false));
      headerMount.unmount();

      // A DIFFERENT entity (e.g. the lines entity) on the same window must not inherit
      // the header entity's cached value — they're keyed separately.
      globalThis.fetch.mockImplementation(() => new Promise(() => {}));
      const linesMount = renderHook(() =>
        useDisplayLogic('lines', { id: '1' }, { ...opts, cacheableKeys: ['project'] })
      );
      expect(linesMount.result.current).toEqual({ readOnly: {}, visibility: {} });

      vi.useFakeTimers();
    });

    // Regression coverage for ETP-4845 bug 2: `evaluate()` used to skip the
    // evaluate-display call entirely whenever `values.id` was missing, which is correct
    // for record-dependent logic (e.g. a Posted-based readOnly flag genuinely has nothing
    // to evaluate on an unsaved record) but wrong for the `@ACCT_DIMENSION_DISPLAY@` macro:
    // its truth value depends only on GL Configuration, never on the record, so a
    // brand-new document kept showing dimension fields regardless of the toggle until the
    // very first save. The fix widens the skip guard to also check
    // `cacheRef.current.cacheKeySet` — only skip when there are no cacheable keys at all.
    it('still calls evaluate-display for a new record (no id) when cacheableKeys is declared', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ readOnly: {}, visibility: { project: false, costcenter: true } }),
      });

      const { result } = renderHook(() =>
        useDisplayLogic('header', { status: 'DR' }, { ...opts, cacheableKeys: ['project', 'costcenter'] })
      );

      await act(async () => {
        vi.advanceTimersByTime(300);
        await vi.runAllTimersAsync();
      });

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost/api/header/evaluate-display',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ fieldValues: { status: 'DR' } }),
        }),
      );
      expect(result.current.visibility).toEqual({ project: false, costcenter: true });
    });

    // Contrast case for the test above: without `cacheableKeys` declared, a new record
    // (no id) must still skip the call entirely — this is unchanged legacy behavior and is
    // already covered by the top-level 'skips evaluation when record has no id (new
    // record)' test using the plain `opts` object (no cacheableKeys).

    it('still skips evaluation for a new record when cacheableKeys is an empty array', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ readOnly: {}, visibility: {} }),
      });

      renderHook(() =>
        useDisplayLogic('header', { status: 'DR' }, { ...opts, cacheableKeys: [] })
      );

      await act(async () => {
        vi.advanceTimersByTime(300);
        await vi.runAllTimersAsync();
      });

      // An empty cacheableKeys array produces a cacheKeySet with size 0, which the guard
      // must treat the same as "no cacheableKeys at all" — still skip for a new record.
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });
});
