// @covers tools/app-shell/src/hooks/useCallout.js
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
          'Accept-Language': 'es_ES',
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
      // ETP-5024: calloutResult now also carries `meta` (passthrough, undefined
      // here since executeCallout was called without one) and `blockingCondition`
      // (null — this response's messages array is empty, so no BP-blocking
      // condition was detected). See lib/blockingBpConditions.js.
      expect(result.current.calloutResult).toEqual({
        updates: { priceList: 150 },
        combos: {},
        triggerField: 'businessPartner',
        meta: undefined,
        blockingCondition: null,
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

  it('still calls fetch when no token is held', () => {
    const { result } = renderHook(() =>
      useCallout('header', { token: '', apiBaseUrl: 'http://localhost' })
    );

    act(() => {
      result.current.executeCallout('field1', 'val', {});
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // ETP-4576 — inverted on purpose: under the cookie scheme the client holds no token,
    // so the request MUST still go out. The old expectation encoded the guard that made
    // this call silently disappear for every authenticated user.
    expect(globalThis.fetch).toHaveBeenCalled();
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
      // ETP-5024: see the analogous comment above — meta/blockingCondition are
      // now always present on calloutResult.
      expect(result.current.calloutResult).toEqual({
        updates: {},
        combos: { paymentTerm: [{ id: 'PT1', name: '30 days' }] },
        triggerField: 'bp',
        meta: undefined,
        blockingCondition: null,
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

  // ── Blocking BP conditions (ETP-5024) ──────────────────────────────────────
  //
  // A callout message matching one of the two known BP-blocking conditions
  // (credit limit exceeded / on hold — see lib/blockingBpConditions.js) must be
  // routed into calloutResult.blockingCondition instead of being toasted, so
  // DetailView can render it as a persistent inline banner. Every other
  // message on the same response keeps toasting exactly as before.
  describe('blocking BP conditions (ETP-5024)', () => {
    let toastMock;

    beforeAll(async () => {
      const sonner = await import('sonner');
      toastMock = sonner.toast;
    });

    beforeEach(() => {
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

    async function triggerAndWait(result, assertFn) {
      act(() => {
        result.current.executeCallout('businessPartner', 'BP001', { id: '1' });
      });
      await waitFor(assertFn, { timeout: 2000 });
    }

    it('routes a credit-limit message into calloutResult.blockingCondition instead of toasting', async () => {
      mockCalloutResponse([{ type: 'WARNING', text: 'Business Partner credit limit exceeded' }]);
      const { result } = renderHook(() => useCallout('header', opts));

      await triggerAndWait(result, () => {
        expect(result.current.calloutResult?.blockingCondition).toEqual({
          kind: 'creditLimit',
          text: 'Business Partner credit limit exceeded',
          amount: null,
        });
      });

      expect(toastMock.warning).not.toHaveBeenCalled();
      expect(toastMock.error).not.toHaveBeenCalled();
      expect(toastMock.info).not.toHaveBeenCalled();
    });

    it('routes an on-hold message into calloutResult.blockingCondition instead of toasting', async () => {
      // Real production wording (AD_MESSAGE `SelectedBPartnerBlocked`) — the
      // detector's ON_HOLD_PATTERN is anchored on this exact sentence shape, not a
      // bare "on hold" keyword (ETP-5024 REVIEW: the old bare keyword false-
      // positived on unrelated messages like `lockedProduct`).
      mockCalloutResponse([{ type: 'ERROR', text: 'The selected Business Partner is on hold for this document, therefore it is not possible to complete it.' }]);
      const { result } = renderHook(() => useCallout('header', opts));

      await triggerAndWait(result, () => {
        expect(result.current.calloutResult?.blockingCondition).toEqual({
          kind: 'onHold',
          text: 'The selected Business Partner is on hold for this document, therefore it is not possible to complete it.',
        });
      });

      expect(toastMock.error).not.toHaveBeenCalled();
    });

    it('matches a localized Spanish blocking message the same way', async () => {
      // Real production wording (AD_MESSAGE `SelectedBPartnerBlocked`, es_ES).
      mockCalloutResponse([{ type: 'ERROR', text: 'El tercero seleccionado está bloqueado para este documento, no se puede completar.' }]);
      const { result } = renderHook(() => useCallout('header', opts));

      await triggerAndWait(result, () => {
        expect(result.current.calloutResult?.blockingCondition?.kind).toBe('onHold');
      });

      expect(toastMock.error).not.toHaveBeenCalled();
    });

    it('still toasts other, non-matching messages in the same response (no regression)', async () => {
      mockCalloutResponse([
        { type: 'INFO', text: 'Unrelated informational message' },
        { type: 'WARNING', text: 'Business Partner credit limit exceeded' },
      ]);
      const { result } = renderHook(() => useCallout('header', opts));

      await triggerAndWait(result, () => {
        expect(result.current.calloutResult?.blockingCondition).toBeTruthy();
      });

      expect(toastMock.info).toHaveBeenCalledWith('Unrelated informational message');
      expect(toastMock.warning).not.toHaveBeenCalled();
    });

    it('sets blockingCondition to null when no message matches either condition', async () => {
      mockCalloutResponse([{ type: 'INFO', text: 'Record updated' }]);
      const { result } = renderHook(() => useCallout('header', opts));

      await triggerAndWait(result, () => {
        expect(result.current.calloutResult).not.toBeNull();
      });

      expect(result.current.calloutResult.blockingCondition).toBeNull();
      expect(toastMock.info).toHaveBeenCalledWith('Record updated');
    });
  });
});

// ETP-4742 — executeCallout returns a settlement promise. The new-record gate
// uses it to keep the form closed until every initial callout has been accounted
// for: `true` means a result was handed to the consumer through `calloutResult`
// (the consumer applies it and, when it gates the form, releases on its own apply
// effect — see useDefaultCallouts), `false` means there is nothing to apply
// (non-OK response, network error or abort), so the caller can release at once.
describe('useCallout — executeCallout settlement promise (ETP-4742)', () => {
  const opts = { token: 'test-token', apiBaseUrl: 'http://localhost/api' };

  beforeEach(() => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function advanceDebounce() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
  }

  it('resolves true after handing a callout result to the consumer', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ updates: { a: { value: 1 } }, combos: {}, messages: [] }),
    });
    const { result } = renderHook(() => useCallout('header', opts));

    let settled;
    act(() => {
      settled = result.current.executeCallout('businessPartner', 'BP001', { id: '1' });
    });
    expect(settled).toBeInstanceOf(Promise);

    await advanceDebounce();

    await expect(settled).resolves.toBe(true);
    expect(result.current.calloutResult).toEqual(
      expect.objectContaining({ triggerField: 'businessPartner' }),
    );
  });

  it('resolves false when the endpoint answers non-OK', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { result } = renderHook(() => useCallout('header', opts));

    let settled;
    act(() => {
      settled = result.current.executeCallout('businessPartner', 'BP001', { id: '1' });
    });
    await advanceDebounce();

    await expect(settled).resolves.toBe(false);
    expect(result.current.calloutResult).toBeNull();
  });

  it('resolves false when the request fails with a network error', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useCallout('header', opts));

    let settled;
    act(() => {
      settled = result.current.executeCallout('businessPartner', 'BP001', { id: '1' });
    });
    await advanceDebounce();

    await expect(settled).resolves.toBe(false);
  });

  it('resolves false when a newer dispatch for the same field aborts the request', async () => {
    let firstSignal;
    globalThis.fetch.mockImplementationOnce((_url, init) => {
      firstSignal = init?.signal;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
          { once: true },
        );
      });
    });
    const { result } = renderHook(() => useCallout('header', opts));

    let first;
    act(() => {
      first = result.current.executeCallout('businessPartner', 'BP001', { id: '1' });
    });
    await advanceDebounce();
    expect(firstSignal.aborted).toBe(false);

    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ updates: {}, combos: {}, messages: [] }),
    });
    let second;
    act(() => {
      second = result.current.executeCallout('businessPartner', 'BP002', { id: '1' });
    });
    await advanceDebounce();

    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
  });

  it('resolves false without fetching when field or entity is missing', async () => {
    const { result } = renderHook(() => useCallout('header', opts));

    await expect(result.current.executeCallout('', 'v', {})).resolves.toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  // ETP-4742 review finding 1: a second dispatch for the same field cancels the first
  // debounce. The cancelled call must SETTLE (false), not leave its promise pending —
  // otherwise a caller gating on it (the initial-callout chain) hangs until the budget.
  it('resolves the superseded debounce with false when the same field is dispatched again', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ updates: {}, combos: {}, messages: [] }),
    });
    const { result } = renderHook(() => useCallout('header', opts));

    let first;
    let second;
    act(() => {
      first = result.current.executeCallout('businessPartner', 'BP001', { id: '1' });
    });
    act(() => {
      second = result.current.executeCallout('businessPartner', 'BP002', { id: '1' });
    });

    await expect(first).resolves.toBe(false);

    await advanceDebounce();
    await expect(second).resolves.toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  // ETP-4742 review finding 1: unmount must not leave a debounce promise pending.
  it('settles a pending debounce with false when the hook unmounts', async () => {
    const { result, unmount } = renderHook(() => useCallout('header', opts));

    let settled;
    act(() => {
      settled = result.current.executeCallout('businessPartner', 'BP001', { id: '1' });
    });

    unmount();

    await expect(settled).resolves.toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
