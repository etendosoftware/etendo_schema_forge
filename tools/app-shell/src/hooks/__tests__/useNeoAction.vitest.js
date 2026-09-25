import { renderHook, act } from '@testing-library/react';
import { useNeoAction } from '../useNeoAction';

// ETP-4298 — generic NEO action endpoint hook.
// Endpoint convention (confirmed from useDocumentAction): `apiBaseUrl` already
// includes the spec name (e.g. /sws/neo/sales-order), so the hook does NOT
// prepend specName. URL = `${apiBaseUrl}/${entityName}/${recordId}/action/${actionName}`.
describe('useNeoAction', () => {
  const baseOpts = {
    specName: 'sales-order',
    entityName: 'header',
    apiBaseUrl: '/sws/neo/sales-order',
    token: 'test-token',
  };

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with loading=false', () => {
    const { result } = renderHook(() => useNeoAction(baseOpts));
    expect(result.current.loading).toBe(false);
  });

  it('POSTs to the correct action URL and returns the parsed body', async () => {
    const body = { success: true, message: 'Document posted' };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => body,
    });

    const { result } = renderHook(() => useNeoAction(baseOpts));

    let res;
    await act(async () => {
      res = await result.current.execute('rec-1', 'post');
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/neo/sales-order/header/rec-1/action/post',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        // ETP-5022 — the request now goes through useApiFetch, which reads the bearer
        // token from AuthContext/the ambient session rather than the `token` prop, so
        // there is no Authorization header to assert here without mounting a provider.
        headers: expect.objectContaining({
          'Accept-Language': 'es_ES',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(res).toEqual({ success: true, message: 'Document posted' });
    expect(result.current.loading).toBe(false);
  });

  it('returns success:true by default when body omits success', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ message: 'ok' }),
    });
    const { result } = renderHook(() => useNeoAction(baseOpts));
    let res;
    await act(async () => {
      res = await result.current.execute('rec-2', 'unpost');
    });
    expect(res).toEqual({ success: true, message: 'ok' });
  });

  it('returns success:false with body.message on non-ok response', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      statusText: 'Bad Request',
      json: async () => ({ message: 'Already posted' }),
    });
    const { result } = renderHook(() => useNeoAction(baseOpts));
    let res;
    await act(async () => {
      res = await result.current.execute('rec-3', 'post');
    });
    expect(res).toEqual({ success: false, message: 'Already posted' });
  });

  it('falls back to statusText when error body has no message', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      statusText: 'Internal Server Error',
      json: async () => { throw new Error('not json'); },
    });
    const { result } = renderHook(() => useNeoAction(baseOpts));
    let res;
    await act(async () => {
      res = await result.current.execute('rec-4', 'post');
    });
    expect(res).toEqual({ success: false, message: 'Internal Server Error' });
  });

  it('toggles loading during the request', async () => {
    let resolveFetch;
    globalThis.fetch.mockReturnValue(new Promise((r) => { resolveFetch = r; }));
    const { result } = renderHook(() => useNeoAction(baseOpts));

    let p;
    act(() => { p = result.current.execute('rec-5', 'post'); });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch({ ok: true, json: async () => ({ success: true }) });
      await p;
    });
    expect(result.current.loading).toBe(false);
  });

  it('returns failure when apiBaseUrl is missing', async () => {
    const { result } = renderHook(() => useNeoAction({ ...baseOpts, apiBaseUrl: undefined }));
    let res;
    await act(async () => { res = await result.current.execute('rec-1', 'post'); });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/Missing required params/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns failure when recordId is missing', async () => {
    const { result } = renderHook(() => useNeoAction(baseOpts));
    let res;
    await act(async () => { res = await result.current.execute(undefined, 'post'); });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/Missing required params/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('returns failure when actionName is missing', async () => {
    const { result } = renderHook(() => useNeoAction(baseOpts));
    let res;
    await act(async () => { res = await result.current.execute('rec-1', undefined); });
    expect(res.success).toBe(false);
    expect(res.message).toMatch(/Missing required params/);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('extracts message from nested response.data[0]', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [{ success: true, message: 'Posted OK' }] } }),
    });
    const { result } = renderHook(() => useNeoAction(baseOpts));
    let res;
    await act(async () => { res = await result.current.execute('rec-6', 'post'); });
    expect(res).toEqual({ success: true, message: 'Posted OK' });
  });

  it('extracts success:false from nested response.data[0]', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { data: [{ success: false, message: 'Already posted' }] } }),
    });
    const { result } = renderHook(() => useNeoAction(baseOpts));
    let res;
    await act(async () => { res = await result.current.execute('rec-7', 'post'); });
    expect(res).toEqual({ success: false, message: 'Already posted' });
  });

  it('extracts message from response.message when no data array', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ response: { message: 'Action completed' } }),
    });
    const { result } = renderHook(() => useNeoAction(baseOpts));
    let res;
    await act(async () => { res = await result.current.execute('rec-8', 'post'); });
    expect(res).toEqual({ success: true, message: 'Action completed' });
  });

  // ETP-4706: NeoResponse.error(int, String) — the standard error envelope used by most NEO
  // action handlers across the backend — wraps the message as {"error":{"message","status"}},
  // not a top-level `message` field. Before this fix, that shape fell through every branch of
  // the extraction chain and the hook returned `res.statusText` (e.g. "Unprocessable Entity" for
  // a 422) instead of the real backend message, discarding the actual accounting/business-rule
  // detail for every window that hits this common envelope.
  it('extracts message from the nested error.message envelope on non-ok response', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      statusText: 'Unprocessable Entity',
      json: async () => ({ error: { message: 'Account could not be found.', status: 422 } }),
    });
    const { result } = renderHook(() => useNeoAction(baseOpts));
    let res;
    await act(async () => { res = await result.current.execute('rec-12', 'post'); });
    expect(res).toEqual({ success: false, message: 'Account could not be found.' });
  });

  it('extracts error message from nested data on non-ok response', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      statusText: 'Server Error',
      json: async () => ({ response: { data: [{ message: 'Internal error' }] } }),
    });
    const { result } = renderHook(() => useNeoAction(baseOpts));
    let res;
    await act(async () => { res = await result.current.execute('rec-9', 'post'); });
    expect(res).toEqual({ success: false, message: 'Internal error' });
  });

  it('returns failure with err.message on network error', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Connection refused'));
    const { result } = renderHook(() => useNeoAction(baseOpts));
    let res;
    await act(async () => { res = await result.current.execute('rec-10', 'post'); });
    expect(res).toEqual({ success: false, message: 'Connection refused' });
  });

  it('returns failure with generic message when error has no message', async () => {
    globalThis.fetch.mockRejectedValue({});
    const { result } = renderHook(() => useNeoAction(baseOpts));
    let res;
    await act(async () => { res = await result.current.execute('rec-11', 'post'); });
    expect(res).toEqual({ success: false, message: 'Network error' });
  });

  it('URL-encodes special characters in recordId', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useNeoAction(baseOpts));
    await act(async () => { await result.current.execute('rec/1 2', 'post'); });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/neo/sales-order/header/rec%2F1%202/action/post',
      expect.anything(),
    );
  });

  it('URL-encodes special characters in actionName', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useNeoAction(baseOpts));
    await act(async () => { await result.current.execute('rec-1', 'my action'); });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/neo/sales-order/header/rec-1/action/my%20action',
      expect.anything(),
    );
  });

  // ETP-5316 — unlike useDocumentAction (which throws), this hook RESOLVES a structured failure,
  // so the keys have to ride in the result object. BulkDocumentAction's neoAction adapter reads
  // them off this shape and re-attaches them to the Error it throws.
  describe('messageKeys on the failure result (ETP-5316)', () => {
    it('returns messageKeys alongside message on a non-ok response', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({
          status: 'error',
          message: 'En la línea 10, 20, 30, la cantidad movida no debe ser cero.',
          messageKeys: ['Inline', 'ProductNotNullAndMovementQtyZero'],
        }),
      });
      const { result } = renderHook(() => useNeoAction(baseOpts));
      let res;
      await act(async () => { res = await result.current.execute('rec-k1', 'post'); });

      expect(res).toEqual({
        success: false,
        message: 'En la línea 10, 20, 30, la cantidad movida no debe ser cero.',
        messageKeys: ['Inline', 'ProductNotNullAndMovementQtyZero'],
      });
    });

    it('reads the keys out of the nested error.* envelope', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        statusText: 'Unprocessable Entity',
        json: async () => ({
          error: { message: 'boom', status: 422, messageKeys: ['lockedProduct'] },
        }),
      });
      const { result } = renderHook(() => useNeoAction(baseOpts));
      let res;
      await act(async () => { res = await result.current.execute('rec-k2', 'post'); });

      expect(res.messageKeys).toEqual(['lockedProduct']);
      expect(res.message).toBe('boom');
    });

    it('leaves messageKeys undefined against a backend that does not send them', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        statusText: 'Bad Request',
        json: async () => ({ message: 'Already posted' }),
      });
      const { result } = renderHook(() => useNeoAction(baseOpts));
      let res;
      await act(async () => { res = await result.current.execute('rec-k3', 'post'); });

      expect(res.success).toBe(false);
      expect(res.messageKeys).toBeUndefined();
    });

    // The success path is deliberately untouched by ETP-5316 — a key set there would let a
    // consumer render a failure wording for an action that worked.
    it('never attaches messageKeys to a successful result', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, message: 'ok', messageKeys: ['lockedProduct'] }),
      });
      const { result } = renderHook(() => useNeoAction(baseOpts));
      let res;
      await act(async () => { res = await result.current.execute('rec-k4', 'post'); });

      expect(res).toEqual({ success: true, message: 'ok' });
      expect('messageKeys' in res).toBe(false);
    });
  });
});

// ETP-5445 — optional third argument `requestBody`: JSON-stringified when given, the
// literal '{}' when omitted (every pre-existing caller).
describe('useNeoAction — requestBody (ETP-5445)', () => {
  const baseOpts = { entityName: 'internalConsumption', apiBaseUrl: '/sws/neo/internal-consumption' };

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends JSON.stringify(requestBody) when a body is given', async () => {
    const requestBody = { fieldValues: { processNow: 'CO' }, action: 'CO' };
    const { result } = renderHook(() => useNeoAction(baseOpts));
    await act(async () => {
      await result.current.execute('ic-1', 'processNow', requestBody);
    });

    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/sws/neo/internal-consumption/internalConsumption/ic-1/action/processNow');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(requestBody));
    expect(JSON.parse(init.body)).toEqual(requestBody);
  });

  it("sends '{}' when requestBody is omitted", async () => {
    const { result } = renderHook(() => useNeoAction(baseOpts));
    await act(async () => {
      await result.current.execute('ic-1', 'post');
    });
    expect(globalThis.fetch.mock.calls[0][1].body).toBe('{}');
  });

  it("sends '{}' when requestBody is explicitly undefined", async () => {
    const { result } = renderHook(() => useNeoAction(baseOpts));
    await act(async () => {
      await result.current.execute('ic-1', 'post', undefined);
    });
    expect(globalThis.fetch.mock.calls[0][1].body).toBe('{}');
  });

  it('stringifies an empty object body as {}', async () => {
    const { result } = renderHook(() => useNeoAction(baseOpts));
    await act(async () => {
      await result.current.execute('ic-1', 'post', {});
    });
    expect(globalThis.fetch.mock.calls[0][1].body).toBe('{}');
  });

  it('does not call fetch when required params are missing, even with a body', async () => {
    const { result } = renderHook(() => useNeoAction({ ...baseOpts, apiBaseUrl: undefined }));
    let res;
    await act(async () => {
      res = await result.current.execute('ic-1', 'processNow', { action: 'CO' });
    });
    expect(res.success).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
