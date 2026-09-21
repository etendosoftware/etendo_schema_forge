import { renderHook, act, waitFor } from '@testing-library/react';
import { useDocumentAction } from '../useDocumentAction';

describe('useDocumentAction', () => {
  const baseOpts = {
    apiBaseUrl: 'http://localhost/api',
    entity: 'header',
    token: 'test-token',
  };

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with loading=false and error=null', () => {
    const { result } = renderHook(() => useDocumentAction(baseOpts));

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('executes a document action with correct URL and payload', async () => {
    const responseData = { response: { status: 'Success' } };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => responseData,
    });

    const { result } = renderHook(() => useDocumentAction(baseOpts));

    let data;
    await act(async () => {
      data = await result.current.execute('record-123', 'CO');
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost/api/header/record-123/action/documentAction',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ docAction: 'CO' }),
      }),
    );
    expect(data).toEqual(responseData);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets loading=true during execution', async () => {
    let resolveFetch;
    globalThis.fetch.mockReturnValue(
      new Promise((resolve) => { resolveFetch = resolve; })
    );

    const { result } = renderHook(() => useDocumentAction(baseOpts));

    let executePromise;
    act(() => {
      executePromise = result.current.execute('rec-1', 'CO').catch(() => {});
    });

    // loading should be true while fetch is pending
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ success: true }),
      });
      await executePromise;
    });

    expect(result.current.loading).toBe(false);
  });

  it('throws and sets error when recordId is missing', async () => {
    const { result } = renderHook(() => useDocumentAction(baseOpts));

    let caughtError;
    await act(async () => {
      try {
        await result.current.execute(null, 'CO');
      } catch (e) {
        caughtError = e;
      }
    });

    expect(caughtError).toBeDefined();
    expect(caughtError.message).toBe('useDocumentAction.execute requires recordId and docAction');
    expect(result.current.error).toBe('useDocumentAction.execute requires recordId and docAction');
  });

  it('throws and sets error when docAction is missing', async () => {
    const { result } = renderHook(() => useDocumentAction(baseOpts));

    let caughtError;
    await act(async () => {
      try {
        await result.current.execute('rec-1', null);
      } catch (e) {
        caughtError = e;
      }
    });

    expect(caughtError).toBeDefined();
    expect(caughtError.message).toBe('useDocumentAction.execute requires recordId and docAction');
  });

  it('handles server error with message from response payload', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ response: { message: 'Document already completed' } }),
    });

    const { result } = renderHook(() => useDocumentAction(baseOpts));

    let caughtError;
    await act(async () => {
      try {
        await result.current.execute('rec-1', 'CO');
      } catch (e) {
        caughtError = e;
      }
    });

    expect(caughtError.message).toBe('Document already completed');
    expect(result.current.error).toBe('Document already completed');
    expect(result.current.loading).toBe(false);
  });

  it('handles server error with fallback status code', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('invalid json'); },
    });

    const { result } = renderHook(() => useDocumentAction(baseOpts));

    let caughtError;
    await act(async () => {
      try {
        await result.current.execute('rec-1', 'CO');
      } catch (e) {
        caughtError = e;
      }
    });

    expect(caughtError.message).toBe('Error 500');
    expect(result.current.error).toBe('Error 500');
  });

  it('calls onSuccess callback on success', async () => {
    const responseData = { ok: true };
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => responseData,
    });

    const onSuccess = vi.fn();
    const { result } = renderHook(() => useDocumentAction(baseOpts));

    await act(async () => {
      await result.current.execute('rec-1', 'CO', { onSuccess });
    });

    expect(onSuccess).toHaveBeenCalledWith(responseData);
  });

  it('calls onError callback on failure', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Forbidden' }),
    });

    const onError = vi.fn();
    const { result } = renderHook(() => useDocumentAction(baseOpts));

    await act(async () => {
      await result.current.execute('rec-1', 'CO', { onError }).catch(() => {});
    });

    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0].message).toBe('Forbidden');
  });

  it('clearError resets the error state', async () => {
    const { result } = renderHook(() => useDocumentAction(baseOpts));

    await act(async () => {
      await result.current.execute(null, 'CO').catch(() => {});
    });

    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  it('uses default entity "header" when not specified', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const { result } = renderHook(() =>
      useDocumentAction({ apiBaseUrl: 'http://localhost/api', token: 'tok' })
    );

    await act(async () => {
      await result.current.execute('rec-1', 'CO');
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost/api/header/rec-1/action/documentAction',
      expect.anything(),
    );
  });

  // ETP-5316 — the AD_MESSAGE search keys behind `message`, lifted onto the rejected Error so a
  // consumer can hand them to translateBackendError without re-deriving the envelope shape.
  // Without them, a core document-action failure can only be rendered as core's own sentence,
  // which cites AD line numbers (10, 20, 30…) that match no row the user can see.
  describe('messageKeys on the rejected error (ETP-5316)', () => {
    it('exposes err.messageKeys from a top-level messageKeys body', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          status: 'error',
          message: 'En la línea 10, 20, 30, la cantidad movida no debe ser cero.',
          messageKeys: ['Inline', 'ProductNotNullAndMovementQtyZero'],
        }),
      });

      const { result } = renderHook(() => useDocumentAction(baseOpts));

      let caughtError;
      await act(async () => {
        try {
          await result.current.execute('rec-1', 'CO');
        } catch (e) {
          caughtError = e;
        }
      });

      expect(caughtError.messageKeys).toEqual(['Inline', 'ProductNotNullAndMovementQtyZero']);
      // `message` is untouched — a consumer that ignores the keys behaves exactly as before.
      expect(caughtError.message).toBe('En la línea 10, 20, 30, la cantidad movida no debe ser cero.');
      expect(caughtError.status).toBe(400);
    });

    it('exposes err.messageKeys from the response.* envelope', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ response: { message: 'boom', messageKeys: ['lockedProduct'] } }),
      });

      const { result } = renderHook(() => useDocumentAction(baseOpts));

      let caughtError;
      await act(async () => {
        try {
          await result.current.execute('rec-1', 'CO');
        } catch (e) {
          caughtError = e;
        }
      });

      expect(caughtError.messageKeys).toEqual(['lockedProduct']);
    });

    // The two repos deploy separately, so "frontend ahead of backend" is the normal steady state
    // for a while: no keys on the wire must stay `undefined`, which is exactly the input
    // translateBackendError treats as "text only".
    it('leaves err.messageKeys undefined when the body carries none', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ response: { message: 'Document already completed' } }),
      });

      const { result } = renderHook(() => useDocumentAction(baseOpts));

      let caughtError;
      await act(async () => {
        try {
          await result.current.execute('rec-1', 'CO');
        } catch (e) {
          caughtError = e;
        }
      });

      expect(caughtError.messageKeys).toBeUndefined();
      expect(caughtError.message).toBe('Document already completed');
    });

    it('leaves err.messageKeys undefined when the error body is not JSON at all', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => { throw new Error('invalid json'); },
      });

      const { result } = renderHook(() => useDocumentAction(baseOpts));

      let caughtError;
      await act(async () => {
        try {
          await result.current.execute('rec-1', 'CO');
        } catch (e) {
          caughtError = e;
        }
      });

      expect(caughtError.messageKeys).toBeUndefined();
      expect(caughtError.message).toBe('Error 500');
    });

    it('hands the keys to the onError callback too (same Error instance)', async () => {
      globalThis.fetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'boom', messageKeys: ['InActiveProducts'] }),
      });

      const onError = vi.fn();
      const { result } = renderHook(() => useDocumentAction(baseOpts));

      await act(async () => {
        await result.current.execute('rec-1', 'CO', { onError }).catch(() => {});
      });

      expect(onError.mock.calls[0][0].messageKeys).toEqual(['InActiveProducts']);
    });
  });
});