import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useYearHasPeriods } from '../useYearHasPeriods.js';

function expectedUrl(base, yearId) {
  const criteria = encodeURIComponent(
    JSON.stringify([{ fieldName: 'year', operator: 'equals', value: yearId }])
  );
  return `${base}/periodControl?criteria=${criteria}`;
}

describe('useYearHasPeriods', () => {
  it('resolves to true when the periodControl endpoint returns at least one row', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [{ id: 'p1' }] } }) })
    );
    const { result } = renderHook(() =>
      useYearHasPeriods('year1', 'tok', 'https://api.test/open-close-period-control')
    );

    expect(result.current).toBeUndefined(); // loading
    await waitFor(() => expect(result.current).toBe(true));
    expect(global.fetch).toHaveBeenCalledWith(
      expectedUrl('https://api.test/open-close-period-control', 'year1'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) })
    );
  });

  it('resolves to false when the endpoint returns no rows', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) })
    );
    const { result } = renderHook(() =>
      useYearHasPeriods('year1', 'tok', 'https://api.test/open-close-period-control')
    );

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('resolves to null on a request failure', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
    const { result } = renderHook(() =>
      useYearHasPeriods('year1', 'tok', 'https://api.test/open-close-period-control')
    );

    await waitFor(() => expect(result.current).toBe(null));
  });

  it('stays undefined and never fetches when yearId is absent', () => {
    global.fetch = vi.fn();
    const { result } = renderHook(() =>
      useYearHasPeriods(undefined, 'tok', 'https://api.test/open-close-period-control')
    );

    expect(result.current).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('re-fetches when yearId changes', async () => {
    global.fetch = vi.fn((url) => {
      const hasRows = url.includes('year2');
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ response: { data: hasRows ? [{ id: 'p1' }] : [] } }),
      });
    });
    const { result, rerender } = renderHook(
      ({ yearId }) => useYearHasPeriods(yearId, 'tok', 'https://api.test/open-close-period-control'),
      { initialProps: { yearId: 'year1' } }
    );
    await waitFor(() => expect(result.current).toBe(false));

    rerender({ yearId: 'year2' });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('re-fetches and updates its value when a matching neo:processSuccess event fires', async () => {
    let callCount = 0;
    global.fetch = vi.fn(() => {
      callCount += 1;
      const data = callCount === 1 ? [] : [{ id: 'p1' }];
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data } }) });
    });
    const { result } = renderHook(() =>
      useYearHasPeriods('year1', 'tok', 'https://api.test/open-close-period-control')
    );

    await waitFor(() => expect(result.current).toBe(false));

    act(() => {
      window.dispatchEvent(new CustomEvent('neo:processSuccess', { detail: { recordId: 'year1' } }));
    });

    await waitFor(() => expect(result.current).toBe(true));
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('does not re-fetch when a neo:processSuccess event has a non-matching recordId', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ response: { data: [] } }) })
    );
    const { result } = renderHook(() =>
      useYearHasPeriods('year1', 'tok', 'https://api.test/open-close-period-control')
    );

    await waitFor(() => expect(result.current).toBe(false));
    expect(global.fetch).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new CustomEvent('neo:processSuccess', { detail: { recordId: 'someOtherYear' } }));
    });

    // Give any (unwanted) async work a chance to run before asserting nothing changed.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(false);
  });
});
