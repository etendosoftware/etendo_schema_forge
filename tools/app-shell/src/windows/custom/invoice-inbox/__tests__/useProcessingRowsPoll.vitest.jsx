// @covers tools/app-shell/src/windows/custom/invoice-inbox/useProcessingRowsPoll.js
import { renderHook, act } from '@testing-library/react';
import { useProcessingRowsPoll, nextPollDelay, POLL_DELAYS_MS, POLL_GIVE_UP_MS } from '../useProcessingRowsPoll.js';

function setHidden(hidden) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
  document.dispatchEvent(new Event('visibilitychange'));
}

const flush = async (ms) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };

beforeEach(() => { vi.useFakeTimers(); setHidden(false); });
afterEach(() => { vi.useRealTimers(); setHidden(false); });

describe('nextPollDelay', () => {
  it('follows 3/5/8/13/20/30 s and repeats the last one', () => {
    expect(POLL_DELAYS_MS).toEqual([3000, 5000, 8000, 13000, 20000, 30000]);
    expect([0, 1, 2, 3, 4, 5, 6, 99].map(nextPollDelay)).toEqual([3000, 5000, 8000, 13000, 20000, 30000, 30000, 30000]);
  });
});

describe('useProcessingRowsPoll', () => {
  const setup = (props = {}) => {
    const poll = vi.fn().mockResolvedValue(false);
    const hook = renderHook((p) => useProcessingRowsPoll(p), { initialProps: { ids: ['a', 'b'], poll, resetKey: 0, ...props } });
    return { poll, ...hook };
  };

  it('does nothing when there are no PROCESSING ids', async () => {
    const { poll } = setup({ ids: [] });
    await flush(60_000);
    expect(poll).not.toHaveBeenCalled();
  });

  it('polls with the ids after 3 s, then backs off 5, 8, 13, 20, 30 s', async () => {
    const { poll } = setup();
    await flush(2999);
    expect(poll).not.toHaveBeenCalled();
    await flush(1);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(poll).toHaveBeenLastCalledWith(['a', 'b']);
    let calls = 1;
    for (const delay of [5000, 8000, 13000, 20000, 30000, 30000]) {
      await flush(delay - 1);
      expect(poll).toHaveBeenCalledTimes(calls);
      await flush(1);
      calls += 1;
      expect(poll).toHaveBeenCalledTimes(calls);
    }
  });

  it('resets the backoff to 3 s when a poll reports a change', async () => {
    const poll = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValue(false);
    renderHook(() => useProcessingRowsPoll({ ids: ['a'], poll, resetKey: 0 }));
    await flush(3000); // poll 1 (no change)
    await flush(5000); // poll 2 (change)
    expect(poll).toHaveBeenCalledTimes(2);
    await flush(2999);
    expect(poll).toHaveBeenCalledTimes(2);
    await flush(1);
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it('keeps going after a failed poll', async () => {
    const poll = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(false);
    renderHook(() => useProcessingRowsPoll({ ids: ['a'], poll, resetKey: 0 }));
    await flush(3000);
    await flush(5000);
    expect(poll).toHaveBeenCalledTimes(2);
  });

  it('restarts the backoff when resetKey changes (refresh or accepted upload)', async () => {
    const { poll, rerender } = setup();
    await flush(3000);
    await flush(5000);
    expect(poll).toHaveBeenCalledTimes(2);
    rerender({ ids: ['a', 'b'], poll, resetKey: 1 });
    await flush(2999);
    expect(poll).toHaveBeenCalledTimes(2);
    await flush(1);
    expect(poll).toHaveBeenCalledTimes(3);
  });

  it('gives up after 15 minutes without a change; a resetKey bump resumes it', async () => {
    const { poll, rerender } = setup();
    await flush(POLL_GIVE_UP_MS + 60_000);
    const callsAtGiveUp = poll.mock.calls.length;
    expect(callsAtGiveUp).toBeGreaterThan(0);
    await flush(120_000);
    expect(poll).toHaveBeenCalledTimes(callsAtGiveUp);
    rerender({ ids: ['a', 'b'], poll, resetKey: 1 });
    await flush(3000);
    expect(poll).toHaveBeenCalledTimes(callsAtGiveUp + 1);
  });

  it('pauses while the tab is hidden and resumes when it is visible again', async () => {
    const { poll } = setup();
    act(() => setHidden(true));
    await flush(60_000);
    expect(poll).not.toHaveBeenCalled();
    act(() => setHidden(false));
    await flush(3000);
    expect(poll).toHaveBeenCalledTimes(1);
  });

  it('cleans up on unmount: no poll fires afterwards', async () => {
    const { poll, unmount } = setup();
    await flush(1000);
    unmount();
    await flush(60_000);
    expect(poll).not.toHaveBeenCalled();
  });
});
