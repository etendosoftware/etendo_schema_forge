import { renderHook, act, waitFor } from '@testing-library/react';
import { useCallout } from '../useCallout';

// Mock sonner toast so it does not throw
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('useCallout', () => {
  const opts = { token: 'test-token', apiBaseUrl: 'http://localhost/api' };

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts with calloutResult=null and calloutLoading=false', () => {
    const { result } = renderHook(() => useCallout('header', opts));

    expect(result.current.calloutResult).toBeNull();
    expect(result.current.calloutLoading).toBe(false);
  });

  it('does not call fetch until debounce period elapses (300ms)', () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ updates: {}, combos: {}, messages: [] }),
    });

    const { result } = renderHook(() => useCallout('header', opts));

    act(() => {
      result.current.executeCallout('businessPartner', 'BP001', { id: '1' });
    });

    // Before debounce
    expect(globalThis.fetch).not.toHaveBeenCalled();

    // After debounce
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('fetches the correct callout endpoint', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ updates: {}, combos: {}, messages: [] }),
    });

    const { result } = renderHook(() => useCallout('header', opts));

    act(() => {
      result.current.executeCallout('businessPartner', 'BP001', { id: '1' });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost/api/header/callout',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    );
  });

  it('sends field, value, and formState in the request body', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ updates: {}, combos: {}, messages: [] }),
    });

    const formState = { id: '1', businessPartner: 'BP001', amount: 100 };
    const { result } = renderHook(() => useCallout('header', opts));

    act(() => {
      result.current.executeCallout('businessPartner', 'BP001', formState);
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.field).toBe('businessPartner');
    expect(body.value).toBe('BP001');
    expect(body.formState).toEqual(formState);
  });

  it('extracts auxiliary values from formState', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ updates: {}, combos: {}, messages: [] }),
    });

    const formState = { id: '1', businessPartner_LOC: 'ES', warehouse_WH: 'WH1' };
    const { result } = renderHook(() => useCallout('header', opts));

    act(() => {
      result.current.executeCallout('field1', 'val', formState);
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.auxiliaryValues).toEqual({
      businessPartner_LOC: 'ES',
      warehouse_WH: 'WH1',
    });
  });

  it('sets calloutResult when updates are returned', async () => {
    vi.useRealTimers();

    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        updates: { priceList: 150 },
        combos: {},
        messages: [],
      }),
    });

    const { result } = renderHook(() => useCallout('header', opts));

    act(() => {
      result.current.executeCallout('businessPartner', 'BP001', { id: '1' });
    });

    await waitFor(() => {
      expect(result.current.calloutResult).toEqual({
        updates: { priceList: 150 },
        combos: {},
        triggerField: 'businessPartner',
      });
    });

    vi.useFakeTimers();
  });

  it('sets calloutResult to null when no updates or combos', async () => {
    vi.useRealTimers();

    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ updates: {}, combos: {}, messages: [] }),
    });

    const { result } = renderHook(() => useCallout('header', opts));

    act(() => {
      result.current.executeCallout('field1', 'val', { id: '1' });
    });

    await waitFor(() => {
      expect(result.current.calloutLoading).toBe(false);
    });

    expect(result.current.calloutResult).toBeNull();
    vi.useFakeTimers();
  });

  it('debounces multiple rapid calls for the same field', () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ updates: {}, combos: {}, messages: [] }),
    });

    const { result } = renderHook(() => useCallout('header', opts));

    act(() => {
      result.current.executeCallout('field1', 'a', { id: '1' });
      result.current.executeCallout('field1', 'ab', { id: '1' });
      result.current.executeCallout('field1', 'abc', { id: '1' });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Only one fetch for the last value
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.value).toBe('abc');
  });

  it('does not call fetch when field is empty', () => {
    const { result } = renderHook(() => useCallout('header', opts));

    act(() => {
      result.current.executeCallout('', 'value', {});
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not call fetch when token is missing', () => {
    const { result } = renderHook(() =>
      useCallout('header', { token: '', apiBaseUrl: 'http://localhost' })
    );

    act(() => {
      result.current.executeCallout('field1', 'val', {});
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('handles non-ok response without crashing', async () => {
    vi.useRealTimers();

    globalThis.fetch.mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useCallout('header', opts));

    act(() => {
      result.current.executeCallout('field1', 'val', { id: '1' });
    });

    await waitFor(() => {
      expect(result.current.calloutLoading).toBe(false);
    });

    // Should not crash, result stays null
    expect(result.current.calloutResult).toBeNull();
    vi.useFakeTimers();
  });

  it('executeCallout with empty field value does not trigger fetch', () => {
    const { result } = renderHook(() => useCallout('header', opts));

    act(() => {
      result.current.executeCallout('field1', '', {});
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Field name is present but value is empty — callout still fires
    // because useCallout only guards on empty field, not empty value
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('executeCallout with null value still fires (value can be null)', () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ updates: {}, combos: {}, messages: [] }),
    });

    const { result } = renderHook(() => useCallout('header', opts));

    act(() => {
      result.current.executeCallout('field1', null, { id: '1' });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.value).toBeNull();
  });

  it('handles fetch network error (AbortError is silently ignored)', async () => {
    vi.useRealTimers();

    const abortError = new DOMException('Aborted', 'AbortError');
    globalThis.fetch.mockRejectedValue(abortError);

    const { result } = renderHook(() => useCallout('header', opts));

    act(() => {
      result.current.executeCallout('field1', 'val', { id: '1' });
    });

    await waitFor(() => {
      expect(result.current.calloutLoading).toBe(false);
    });

    // AbortError is silently caught, no crash
    expect(result.current.calloutResult).toBeNull();
    vi.useFakeTimers();
  });

  it('handles generic fetch error without crashing', async () => {
    vi.useRealTimers();

    globalThis.fetch.mockRejectedValue(new Error('Network timeout'));

    const { result } = renderHook(() => useCallout('header', opts));

    act(() => {
      result.current.executeCallout('field1', 'val', { id: '1' });
    });

    await waitFor(() => {
      expect(result.current.calloutLoading).toBe(false);
    });

    expect(result.current.calloutResult).toBeNull();
    vi.useFakeTimers();
  });

  it('does not call fetch when entity is missing', () => {
    const { result } = renderHook(() =>
      useCallout('', { token: 'tok', apiBaseUrl: 'http://localhost' })
    );

    act(() => {
      result.current.executeCallout('field1', 'val', {});
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not call fetch when apiBaseUrl is missing', () => {
    const { result } = renderHook(() =>
      useCallout('header', { token: 'tok', apiBaseUrl: '' })
    );

    act(() => {
      result.current.executeCallout('field1', 'val', {});
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('sets calloutResult when combos are returned (but no updates)', async () => {
    vi.useRealTimers();

    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        updates: {},
        combos: { paymentTerm: [{ id: 'PT1', name: '30 days' }] },
        messages: [],
      }),
    });

    const { result } = renderHook(() => useCallout('header', opts));

    act(() => {
      result.current.executeCallout('bp', 'BP001', { id: '1' });
    });

    await waitFor(() => {
      expect(result.current.calloutResult).toEqual({
        updates: {},
        combos: { paymentTerm: [{ id: 'PT1', name: '30 days' }] },
        triggerField: 'bp',
      });
    });

    vi.useFakeTimers();
  });

  // ── Message sanitization (ETP-4005) ────────────────────────────────────────
  //
  // sanitizeCalloutMessage is internal to useCallout.js but its behaviour is
  // fully observable through the toast calls that executeCallout fires after a
  // successful callout response.
  //
  // Each test switches to real timers to await the async fetch and then switches
  // back, because the outer beforeEach enables fake timers. The toast mock is
  // imported at module level via vi.mock('sonner') so we reference it through
  // the module import — clearAllMocks() resets call counts between tests.

  describe('message sanitization', () => {
    // Import the mocked toast module so we can assert on its methods.
    let toastMock;

    beforeAll(async () => {
      const sonner = await import('sonner');
      toastMock = sonner.toast;
    });

    beforeEach(() => {
      // Switch to real timers so we can await the async fetch chain.
      vi.useRealTimers();
      globalThis.fetch = vi.fn();
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.useFakeTimers();
    });

    function mockCalloutResponse(messages) {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ updates: {}, combos: {}, messages }),
      });
    }

    // Triggers the callout and waits for the debounce + fetch to complete.
    // With real timers, waitFor polls until the assertion passes (up to 1s),
    // which is enough time for the 300ms debounce to fire.
    async function triggerAndWait(result, assertFn) {
      act(() => {
        result.current.executeCallout('businessPartner', 'BP001', { id: '1' });
      });
      await waitFor(assertFn, { timeout: 2000 });
    }

    it('strips <br/> tags from the message text before calling toast', async () => {
      mockCalloutResponse([{ type: 'INFO', text: 'Line one<br/>Line two' }]);
      const { result } = renderHook(() => useCallout('header', opts));
      await triggerAndWait(result, () => {
        expect(toastMock.info).toHaveBeenCalledWith('Line one Line two');
      });
    });

    it('strips other HTML tags from the message text', async () => {
      mockCalloutResponse([{ type: 'INFO', text: '<b>Bold text</b> normal text' }]);
      const { result } = renderHook(() => useCallout('header', opts));
      await triggerAndWait(result, () => {
        expect(toastMock.info).toHaveBeenCalledWith('Bold text normal text');
      });
    });

    it('removes the "Note: " prefix before calling toast', async () => {
      mockCalloutResponse([{ type: 'INFO', text: 'Note: This is a note' }]);
      const { result } = renderHook(() => useCallout('header', opts));
      await triggerAndWait(result, () => {
        expect(toastMock.info).toHaveBeenCalledWith('This is a note');
      });
    });

    it('removes the "Warning: " prefix and calls toast.warning', async () => {
      mockCalloutResponse([{ type: 'WARNING', text: 'Warning: Check this field' }]);
      const { result } = renderHook(() => useCallout('header', opts));
      await triggerAndWait(result, () => {
        expect(toastMock.warning).toHaveBeenCalledWith('Check this field');
      });
    });

    it('removes the "Error: " prefix and calls toast.error', async () => {
      mockCalloutResponse([{ type: 'ERROR', text: 'Error: Something went wrong' }]);
      const { result } = renderHook(() => useCallout('header', opts));
      await triggerAndWait(result, () => {
        expect(toastMock.error).toHaveBeenCalledWith('Something went wrong');
      });
    });

    it('skips the toast entirely when the message is empty after stripping', async () => {
      // A message composed only of HTML → empty string after sanitize → no toast.
      // Wait for fetch to be called (proves debounce fired + async chain ran),
      // then assert no toast was emitted.
      mockCalloutResponse([{ type: 'INFO', text: '<br/><br/>' }]);
      const { result } = renderHook(() => useCallout('header', opts));
      act(() => {
        result.current.executeCallout('businessPartner', 'BP001', { id: '1' });
      });
      // Poll until the fetch mock has been called (debounce has fired).
      await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1), { timeout: 2000 });
      // Let the microtask queue drain so the async chain inside the timeout fires.
      await new Promise(r => setTimeout(r, 0));
      expect(toastMock.info).not.toHaveBeenCalled();
      expect(toastMock.warning).not.toHaveBeenCalled();
      expect(toastMock.error).not.toHaveBeenCalled();
    });

    it('fires one toast per message when the backend returns multiple messages', async () => {
      mockCalloutResponse([
        { type: 'INFO', text: 'First message' },
        { type: 'WARNING', text: 'Second message' },
        { type: 'ERROR', text: 'Third message' },
      ]);
      const { result } = renderHook(() => useCallout('header', opts));
      await triggerAndWait(result, () => {
        expect(toastMock.error).toHaveBeenCalledWith('Third message');
      });
      expect(toastMock.info).toHaveBeenCalledWith('First message');
      expect(toastMock.warning).toHaveBeenCalledWith('Second message');
    });
  });
});
