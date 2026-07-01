import { renderHook, act, waitFor } from '@testing-library/react';
import { useDisplayLogic } from '../useDisplayLogic';

describe('useDisplayLogic', () => {
  const opts = { token: 'test-token', apiBaseUrl: 'http://localhost/api' };

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn();
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
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
        body: JSON.stringify({ fieldValues }),
      }),
    );
  });

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

  it('skips evaluation when token is missing', async () => {
    renderHook(() =>
      useDisplayLogic('header', { id: '1' }, { token: '', apiBaseUrl: 'http://localhost' })
    );

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
});
