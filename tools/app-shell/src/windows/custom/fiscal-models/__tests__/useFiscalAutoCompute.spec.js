// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useFiscalAutoCompute from '../useFiscalAutoCompute.js';

const DECL_A  = { id: '303-2026-T2', model: '303', year: 2026, period: 'T2' };
const BOXES   = { 7: 100, 9: 21 };
const SUMMARY = { accrued: 21, deductible: 200, result: -179 };

// Stable array references — inline arrays recreate on every render and reset the polling effect.
const DECL_A_LIST = [DECL_A];

afterEach(() => vi.restoreAllMocks());

describe('useFiscalAutoCompute — retry on error', () => {
  it('does not advance computedAtRef on compute error so the next poll retries', async () => {
    const computeFn      = vi.fn().mockRejectedValue(new Error('server down'));
    const checkModifiedFn = vi.fn().mockResolvedValue(true);

    const { result } = renderHook(() =>
      useFiscalAutoCompute(DECL_A_LIST, {
        computeFn, checkModifiedFn,
        token: 'tok', apiBaseUrl: 'http://host/neo',
        enabled: true, pollIntervalMs: 50,
      })
    );

    await waitFor(() =>
      expect(result.current.computedMap[DECL_A.id]).toMatchObject({ error: 'Error: server down' })
    );

    // Poll fires; checkModifiedFn receives sinceMs=0 because computedAtRef was not updated on failure.
    await waitFor(() => expect(checkModifiedFn).toHaveBeenCalled(), { timeout: 500 });
    expect(checkModifiedFn.mock.calls[0][1]).toBe(0);
  });

  it('advances computedAtRef on successful compute so the next poll uses a later sinceMs', async () => {
    const before         = Date.now();
    const computeFn      = vi.fn().mockResolvedValue({ boxes: BOXES, summary: SUMMARY });
    const checkModifiedFn = vi.fn().mockResolvedValue(false);

    renderHook(() =>
      useFiscalAutoCompute(DECL_A_LIST, {
        computeFn, checkModifiedFn,
        token: 'tok', apiBaseUrl: 'http://host/neo',
        enabled: true, pollIntervalMs: 50,
      })
    );

    await waitFor(() => expect(computeFn).toHaveBeenCalled());
    await waitFor(() => expect(checkModifiedFn).toHaveBeenCalled(), { timeout: 500 });

    expect(checkModifiedFn.mock.calls[0][1]).toBeGreaterThanOrEqual(before);
  });
});

describe('useFiscalAutoCompute — error isolation', () => {
  it('silences checkModifiedFn errors so the interval keeps running', async () => {
    const computeFn      = vi.fn().mockResolvedValue({ boxes: BOXES, summary: SUMMARY });
    const checkModifiedFn = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(false);

    const { result } = renderHook(() =>
      useFiscalAutoCompute(DECL_A_LIST, {
        computeFn, checkModifiedFn,
        token: 'tok', apiBaseUrl: 'http://host/neo',
        enabled: true, pollIntervalMs: 50,
      })
    );

    await waitFor(() => expect(computeFn).toHaveBeenCalled());

    // First poll throws, second must still fire — interval must survive the error.
    await waitFor(
      () => expect(checkModifiedFn.mock.calls.length).toBeGreaterThanOrEqual(2),
      { timeout: 500 }
    );

    expect(result.current.computedMap[DECL_A.id].error).toBeNull();
  });
});

describe('useFiscalAutoCompute — cancellation', () => {
  it('does not update computedMap after unmount', async () => {
    let resolveCompute;
    const computeFn = vi.fn().mockReturnValue(
      new Promise(res => { resolveCompute = res; })
    );

    const { result, unmount } = renderHook(() =>
      useFiscalAutoCompute(DECL_A_LIST, {
        computeFn, checkModifiedFn: vi.fn(),
        token: 'tok', apiBaseUrl: 'http://host/neo',
        enabled: true, pollIntervalMs: 100_000,
      })
    );

    unmount();

    await act(async () => {
      resolveCompute({ boxes: BOXES, summary: SUMMARY });
      await new Promise(r => setTimeout(r, 50));
    });

    // computedMap must remain empty — cancelled flag prevented the state update.
    expect(result.current.computedMap[DECL_A.id]).toBeUndefined();
  });
});
