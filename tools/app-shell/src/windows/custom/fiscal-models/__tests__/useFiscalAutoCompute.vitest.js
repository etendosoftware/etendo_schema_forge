import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import useFiscalAutoCompute from '../useFiscalAutoCompute.js';

const DECL_A = { id: '303-2026-T2', model: '303', year: 2026, period: 'T2' };
const DECL_B = { id: '303-2026-T1', model: '303', year: 2026, period: 'T1' };
const BOXES  = { 7: 100, 9: 21 };
const SUMMARY = { accrued: 21, deductible: 200, result: -179 };

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
    expect(result.current.computedMap[DECL_A.id]).toMatchObject({ summary: SUMMARY });
    expect(result.current.computedMap[DECL_B.id]).toMatchObject({ summary: SUMMARY });
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
