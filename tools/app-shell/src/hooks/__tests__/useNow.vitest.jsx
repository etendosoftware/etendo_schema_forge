// @covers tools/app-shell/src/hooks/useNow.js
import { renderHook, act } from '@testing-library/react';
import { useNow, refreshNow } from '../useNow.js';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T12:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('returns the current time and advances it every interval', () => {
    const { result } = renderHook(() => useNow(1000));
    const start = result.current;
    expect(start).toBe(Date.parse('2026-10-06T12:00:00Z'));

    act(() => { vi.advanceTimersByTime(1000); });

    expect(result.current).toBe(start + 1000);
  });

  it('defaults to a 30 s tick', () => {
    const { result } = renderHook(() => useNow());
    const start = result.current;
    act(() => { vi.advanceTimersByTime(29000); });
    expect(result.current).toBe(start);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(result.current).toBe(start + 30000);
  });

  it('shares one interval across subscribers and clears it on the last unmount', () => {
    const a = renderHook(() => useNow(5000));
    const b = renderHook(() => useNow(5000));
    expect(vi.getTimerCount()).toBe(1);

    a.unmount();
    expect(vi.getTimerCount()).toBe(1);

    b.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps separate intervals for distinct periods', () => {
    const a = renderHook(() => useNow(1000));
    const b = renderHook(() => useNow(2000));
    expect(vi.getTimerCount()).toBe(2);
    a.unmount();
    b.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refreshNow updates every subscribed channel immediately without advancing timers', () => {
    const a = renderHook(() => useNow(1000));
    const b = renderHook(() => useNow(30000));
    const start = a.result.current;

    act(() => {
      vi.setSystemTime(start + 7000);
      refreshNow();
    });

    expect(a.result.current).toBe(start + 7000);
    expect(b.result.current).toBe(start + 7000);
  });

  it('refreshNow is a no-op when there are no subscribers', () => {
    expect(() => refreshNow()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});
