import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useFiscalAutoCompute from '../useFiscalAutoCompute.js';

const DECL_A = { id: '303-2026-T2', model: '303', year: 2026, period: 'T2' };
const DECL_B = { id: '303-2026-T1', model: '303', year: 2026, period: 'T1' };
const BOXES  = { 7: 100, 9: 21 };
const SUMMARY = { accrued: 21, deductible: 200, result: -179 };

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('useFiscalAutoCompute — initial compute', () => {
  it('calls computeFn for every decl on mount', async () => {
    const computeFn = vi.fn().mockResolvedValue({ boxes: BOXES, summary: SUMMARY });
    const { result } = renderHook(() =>
      useFiscalAutoCompute([DECL_A, DECL_B], {
        computeFn,
        checkModifiedFn: vi.fn(),
        token: 'tok',
        apiBaseUrl: 'http://host/neo/fiscal-models',
        enabled: true,
        pollIntervalMs: 100_000,
      })
    );
    await waitFor(() => expect(computeFn).toHaveBeenCalledTimes(2));
    // Wait for the async state commit, not just the call count: computeFn resolves
    // before computedMap is set, so assert on the map itself to avoid a load-dependent
    // race that reads the map before React flushes the update.
    await waitFor(() => {
      expect(result.current.computedMap[DECL_A.id]).toMatchObject({ summary: SUMMARY });
      expect(result.current.computedMap[DECL_B.id]).toMatchObject({ summary: SUMMARY });
    });
  });

  it('sets error entry when computeFn rejects', async () => {
    const computeFn = vi.fn().mockRejectedValue(new Error('compute failed'));
    const { result } = renderHook(() =>
      useFiscalAutoCompute([DECL_A], {
        computeFn,
        checkModifiedFn: vi.fn(),
        token: 'tok',
        apiBaseUrl: 'http://host/neo/fiscal-models',
        enabled: true,
        pollIntervalMs: 100_000,
      })
    );
    await waitFor(() =>
      expect(result.current.computedMap[DECL_A.id]).toMatchObject({ error: 'Error: compute failed' })
    );
  });

  it('does not call computeFn when enabled is false', async () => {
    const computeFn = vi.fn();
    renderHook(() =>
      useFiscalAutoCompute([DECL_A], {
        computeFn,
        checkModifiedFn: vi.fn(),
        token: 'tok',
        apiBaseUrl: 'http://host/neo/fiscal-models',
        enabled: false,
        pollIntervalMs: 100_000,
      })
    );
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(computeFn).not.toHaveBeenCalled();
  });

  it('writes a compute_failed error entry when computeFn returns null', async () => {
    const computeFn = vi.fn().mockResolvedValue(null);
    const { result } = renderHook(() =>
      useFiscalAutoCompute([DECL_A], {
        computeFn,
        checkModifiedFn: vi.fn(),
        token: 'tok',
        apiBaseUrl: 'http://host/neo/fiscal-models',
        enabled: true,
        pollIntervalMs: 100_000,
      })
    );
    await waitFor(() =>
      expect(result.current.computedMap[DECL_A.id]).toMatchObject({ boxes: null, summary: null, error: 'compute_failed' })
    );
  });

  it('does not call computeFn when decls is empty', async () => {
    const computeFn = vi.fn();
    renderHook(() =>
      useFiscalAutoCompute([], {
        computeFn,
        checkModifiedFn: vi.fn(),
        token: 'tok',
        apiBaseUrl: 'http://host/neo/fiscal-models',
        enabled: true,
        pollIntervalMs: 100_000,
      })
    );
    await act(async () => { await new Promise(r => setTimeout(r, 50)); });
    expect(computeFn).not.toHaveBeenCalled();
  });
});

describe('useFiscalAutoCompute — sessionStorage cache', () => {
  const CACHED_RESULT = { boxes: BOXES, summary: SUMMARY };
  const CACHE_KEY = `fiscal_ac_v1_${DECL_A.id}`;
  const CACHED_AT = Date.now() - 60_000; // 1 minute ago

  // Stable array refs: prevent effect re-runs caused by a new array reference on
  // every render (which would create an infinite loop when checkModifiedFn always
  // returns truthy and computeFn triggers a state update → re-render → new effect).
  const DECL_A_LIST  = [DECL_A];
  const DECL_AB_LIST = [DECL_A, DECL_B];

  function makeOpts(overrides) {
    return {
      token: 'tok',
      apiBaseUrl: 'http://host/neo/fiscal-models',
      enabled: true,
      pollIntervalMs: 100_000,
      ...overrides,
    };
  }

  it('uses cached result and skips computeFn when data is unchanged', async () => {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ result: CACHED_RESULT, computedAt: CACHED_AT }));
    const computeFn       = vi.fn();
    const checkModifiedFn = vi.fn().mockResolvedValue(false); // not modified

    const { result } = renderHook(() =>
      useFiscalAutoCompute(DECL_A_LIST, makeOpts({ computeFn, checkModifiedFn }))
    );

    await waitFor(() =>
      expect(result.current.computedMap[DECL_A.id]).toMatchObject({ summary: SUMMARY })
    );
    expect(computeFn).not.toHaveBeenCalled();
    expect(checkModifiedFn).toHaveBeenCalledWith(DECL_A, CACHED_AT, expect.any(Object));
  });

  it('recomputes when checkModifiedFn returns true despite cache', async () => {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ result: CACHED_RESULT, computedAt: CACHED_AT }));
    const freshBoxes = { 7: 999 };
    const computeFn       = vi.fn().mockResolvedValue({ boxes: freshBoxes, summary: SUMMARY });
    const checkModifiedFn = vi.fn().mockResolvedValue(true); // data changed

    const { result } = renderHook(() =>
      useFiscalAutoCompute(DECL_A_LIST, makeOpts({ computeFn, checkModifiedFn }))
    );

    await waitFor(() => expect(computeFn).toHaveBeenCalled());
    await waitFor(() =>
      expect(result.current.computedMap[DECL_A.id]).toMatchObject({ boxes: freshBoxes })
    );
  });

  it('falls through to computeFn when cache exists but checkModifiedFn throws', async () => {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ result: CACHED_RESULT, computedAt: CACHED_AT }));
    const computeFn       = vi.fn().mockResolvedValue({ boxes: BOXES, summary: SUMMARY });
    const checkModifiedFn = vi.fn().mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() =>
      useFiscalAutoCompute(DECL_A_LIST, makeOpts({ computeFn, checkModifiedFn }))
    );

    await waitFor(() => expect(computeFn).toHaveBeenCalled());
    await waitFor(() =>
      expect(result.current.computedMap[DECL_A.id]).toMatchObject({ summary: SUMMARY })
    );
  });

  it('computes directly when no checkModifiedFn provided (cache not consulted)', async () => {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ result: CACHED_RESULT, computedAt: CACHED_AT }));
    const computeFn = vi.fn().mockResolvedValue({ boxes: BOXES, summary: SUMMARY });

    renderHook(() =>
      useFiscalAutoCompute(DECL_A_LIST, makeOpts({ computeFn }))
    );

    await waitFor(() => expect(computeFn).toHaveBeenCalled());
  });

  it('writes result to sessionStorage after a successful compute', async () => {
    const computeFn = vi.fn().mockResolvedValue(CACHED_RESULT);

    renderHook(() =>
      useFiscalAutoCompute(DECL_A_LIST, makeOpts({ computeFn, checkModifiedFn: vi.fn() }))
    );

    await waitFor(() => expect(computeFn).toHaveBeenCalled());
    const stored = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? 'null');
    expect(stored).not.toBeNull();
    expect(stored.result).toMatchObject(CACHED_RESULT);
    expect(typeof stored.computedAt).toBe('number');
  });
});

// Stable reference: a new array on every render resets the polling effect
const DECL_A_LIST = [DECL_A];

describe('useFiscalAutoCompute — polling', () => {
  it('calls checkModifiedFn after interval and recomputes if modified', async () => {
    const computeFn      = vi.fn().mockResolvedValue({ boxes: BOXES, summary: SUMMARY });
    const checkModifiedFn = vi.fn().mockResolvedValue(true);

    renderHook(() =>
      useFiscalAutoCompute(DECL_A_LIST, {
        computeFn,
        checkModifiedFn,
        token: 'tok',
        apiBaseUrl: 'http://host/neo/fiscal-models',
        enabled: true,
        pollIntervalMs: 50, // short interval so the poll fires within the waitFor window
      })
    );

    // wait for initial compute
    await waitFor(() => expect(computeFn).toHaveBeenCalled());
    const initialCalls = computeFn.mock.calls.length;

    // wait for the poll to fire and trigger a recompute
    await waitFor(() => {
      expect(checkModifiedFn).toHaveBeenCalled();
      expect(computeFn.mock.calls.length).toBeGreaterThan(initialCalls);
    }, { timeout: 500 });
  });
});
