import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useYearCloseStatus } from '../useYearCloseStatus.js';
// ETP-4576 — the component asks the shared builder for its credential, so what a
// test may assert is "the active scheme's header", never a literal it also chose.
// The scheme is declared per test rather than inherited: src/test/setup.js resets
// to the bearer default, and an assertion that relies on that default passes by
// omission.
import { declareBearerSession, expectBearerHeader } from '@/test/sessionContract.js';

describe('useYearCloseStatus', () => {
  it('resolves to true when the end-year-close endpoint returns at least one row', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ id: 'f1' }] }) }));
    declareBearerSession('tok');
    const { result } = renderHook(() => useYearCloseStatus('year1', 'tok', 'https://api.test/end-year-close'));

    expect(result.current).toBeUndefined(); // loading
    await waitFor(() => expect(result.current).toBe(true));
    expect(global.fetch.mock.calls.at(-1)[0]).toBe('https://api.test/end-year-close/accounting?year=year1');
    expectBearerHeader('tok', global.fetch);
  });

  it('resolves to false when the endpoint returns no rows', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) }));
    declareBearerSession('tok');
    const { result } = renderHook(() => useYearCloseStatus('year1', 'tok', 'https://api.test/end-year-close'));

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('resolves to null on a request failure', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    declareBearerSession('tok');
    const { result } = renderHook(() => useYearCloseStatus('year1', 'tok', 'https://api.test/end-year-close'));

    await waitFor(() => expect(result.current).toBe(null));
  });

  it('stays undefined and never fetches when yearId is absent', () => {
    global.fetch = vi.fn();
    declareBearerSession('tok');
    const { result } = renderHook(() => useYearCloseStatus(undefined, 'tok', 'https://api.test/end-year-close'));

    expect(result.current).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('re-fetches when yearId changes', async () => {
    global.fetch = vi.fn((url) => {
    declareBearerSession('tok');
      const closed = url.includes('year=year2');
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: closed ? [{ id: 'f1' }] : [] }) });
    });
    const { result, rerender } = renderHook(
      ({ yearId }) => useYearCloseStatus(yearId, 'tok', 'https://api.test/end-year-close'),
      { initialProps: { yearId: 'year1' } }
    );
    await waitFor(() => expect(result.current).toBe(false));

    rerender({ yearId: 'year2' });
    await waitFor(() => expect(result.current).toBe(true));
  });
});
