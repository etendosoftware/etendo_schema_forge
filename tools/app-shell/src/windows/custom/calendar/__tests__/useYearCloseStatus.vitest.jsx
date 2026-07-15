import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useYearCloseStatus } from '../useYearCloseStatus.js';

describe('useYearCloseStatus', () => {
  it('resolves to true when the end-year-close endpoint returns at least one row', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [{ id: 'f1' }] }) }));
    const { result } = renderHook(() => useYearCloseStatus('year1', 'tok', 'https://api.test/end-year-close'));

    expect(result.current).toBeUndefined(); // loading
    await waitFor(() => expect(result.current).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.test/end-year-close/accounting?year=year1',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) })
    );
  });

  it('resolves to false when the endpoint returns no rows', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) }));
    const { result } = renderHook(() => useYearCloseStatus('year1', 'tok', 'https://api.test/end-year-close'));

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('resolves to null on a request failure', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    const { result } = renderHook(() => useYearCloseStatus('year1', 'tok', 'https://api.test/end-year-close'));

    await waitFor(() => expect(result.current).toBe(null));
  });

  it('stays undefined and never fetches when yearId is absent', () => {
    global.fetch = vi.fn();
    const { result } = renderHook(() => useYearCloseStatus(undefined, 'tok', 'https://api.test/end-year-close'));

    expect(result.current).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('re-fetches when yearId changes', async () => {
    global.fetch = vi.fn((url) => {
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
