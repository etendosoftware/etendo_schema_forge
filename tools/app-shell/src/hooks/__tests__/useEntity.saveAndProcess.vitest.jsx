import { renderHook, act } from '@testing-library/react';
import { useEntity, RECORD_SAVE_TOAST_ID } from '../useEntity';
import { toast } from 'sonner';

/**
 * ETP-4005 — verify that confirming a document fires a single toast.
 *
 * The bug was: handleSaveAndProcess() called handleSave() (toast.success
 * 'recordCreated') AND then fired toast.success('recordProcessed'), so the
 * user saw two toasts on confirm. The fix introduces handleSave({ silent })
 * and passes silent: true from handleSaveAndProcess so only the post-process
 * toast remains.
 */

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const baseOpts = {
  token: 'test-token',
  apiBaseUrl: 'http://localhost/api',
};

describe('useEntity — handleSave silent + handleSaveAndProcess (ETP-4005)', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function renderEntity(opts = {}) {
    return renderHook(() => useEntity('header', null, { ...baseOpts, skipListFetch: true, ...opts }));
  }

  // ── handleSave({ silent }) ────────────────────────────────────────────────

  it('handleSave() (no opts) fires the recordCreated toast on a successful POST', async () => {
    const saved = { id: 'new-1', name: 'Created' };
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'POST') return { ok: true, json: async () => ({ response: { data: [saved] } }) };
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });

    const { result } = renderEntity();
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'Created'); });
    await act(async () => { await result.current.handleSave(); });

    expect(toast.success).toHaveBeenCalledWith('recordCreated', { id: RECORD_SAVE_TOAST_ID });
    expect(toast.success).toHaveBeenCalledTimes(1);
  });

  it('handleSave({ silent: true }) suppresses the success toast on POST', async () => {
    const saved = { id: 'new-1', name: 'Created' };
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'POST') return { ok: true, json: async () => ({ response: { data: [saved] } }) };
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });

    const { result } = renderEntity();
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'Created'); });

    let returned;
    await act(async () => { returned = await result.current.handleSave({ silent: true }); });

    expect(returned).toEqual(saved);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('handleSave({ silent: true }) still returns the saved record', async () => {
    const saved = { id: 'new-2', name: 'Silent' };
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'POST') return { ok: true, json: async () => ({ response: { data: [saved] } }) };
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });

    const { result } = renderEntity();
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'Silent'); });

    let returned;
    await act(async () => { returned = await result.current.handleSave({ silent: true }); });

    expect(returned?.id).toBe('new-2');
  });

  it('handleSave({ silent: true }) does NOT silence error toasts (only success)', async () => {
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'POST') {
        return {
          ok: false,
          status: 400,
          clone: () => ({ json: async () => ({ error: { message: 'Bad data' } }) }),
          json: async () => ({ error: { message: 'Bad data' } }),
        };
      }
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });

    const { result } = renderEntity();
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'Will fail'); });

    let returned;
    await act(async () => { returned = await result.current.handleSave({ silent: true }); });

    expect(returned).toBeNull();
    // Error toasts must still fire — silent only suppresses success.
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  // ── handleSaveAndProcess ──────────────────────────────────────────────────

  it('handleSaveAndProcess fires ONLY the recordProcessed toast (no recordCreated/recordSaved)', async () => {
    const saved = { id: 'doc-1', documentStatus: 'DR' };
    const processed = { id: 'doc-1', documentStatus: 'CO' };
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      // POST create
      if (opts?.method === 'POST' && !url.includes('/action/')) {
        return { ok: true, json: async () => ({ response: { data: [saved] } }) };
      }
      // POST process action
      if (opts?.method === 'POST' && url.includes('/action/')) {
        return { ok: true, json: async () => ({ response: { data: [processed] } }) };
      }
      // GET refetch after process
      if (!opts?.method) {
        return { ok: true, json: async () => ({ response: { data: [processed] } }) };
      }
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });

    const { result } = renderEntity();
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'Doc'); });

    await act(async () => {
      await result.current.handleSaveAndProcess({ processField: 'docAction', processValue: 'CO' });
    });

    // Exactly one success toast — the post-process one.
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith('recordProcessed');
    expect(toast.success).not.toHaveBeenCalledWith('recordCreated', expect.anything());
    expect(toast.success).not.toHaveBeenCalledWith('recordSaved', expect.anything());
  });

  it('handleSaveAndProcess posts to the /action/{processField} endpoint with fieldValues', async () => {
    const saved = { id: 'doc-2', documentStatus: 'DR' };
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'POST' && !url.includes('/action/')) {
        return { ok: true, json: async () => ({ response: { data: [saved] } }) };
      }
      if (opts?.method === 'POST' && url.includes('/action/')) {
        return { ok: true, json: async () => ({ response: { data: [{ ...saved, documentStatus: 'CO' }] } }) };
      }
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });

    const { result } = renderEntity();
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'Doc'); });

    await act(async () => {
      await result.current.handleSaveAndProcess({ processField: 'docAction', processValue: 'CO' });
    });

    const actionCall = globalThis.fetch.mock.calls.find(c => String(c[0]).includes('/action/docAction'));
    expect(actionCall).toBeTruthy();
    expect(actionCall[1].method).toBe('POST');
    const body = JSON.parse(actionCall[1].body);
    expect(body).toEqual({ fieldValues: { docAction: 'CO' } });
  });

  it('handleSaveAndProcess returns null and skips the process toast if the save fails', async () => {
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'POST') {
        return {
          ok: false,
          status: 400,
          clone: () => ({ json: async () => ({ error: { message: 'Save failed' } }) }),
          json: async () => ({ error: { message: 'Save failed' } }),
        };
      }
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });

    const { result } = renderEntity();
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'Will fail'); });

    let returned;
    await act(async () => {
      returned = await result.current.handleSaveAndProcess({ processField: 'docAction', processValue: 'CO' });
    });

    expect(returned).toBeNull();
    // No recordProcessed because the save short-circuited before reaching it.
    expect(toast.success).not.toHaveBeenCalledWith('recordProcessed');
    // Save failure must still surface its error toast.
    expect(toast.error).toHaveBeenCalled();
  });

  it('handleSaveAndProcess surfaces the action error toast if the /action/ POST fails', async () => {
    const saved = { id: 'doc-3', documentStatus: 'DR' };
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'POST' && !url.includes('/action/')) {
        return { ok: true, json: async () => ({ response: { data: [saved] } }) };
      }
      if (opts?.method === 'POST' && url.includes('/action/')) {
        return {
          ok: false,
          status: 500,
          clone: () => ({ json: async () => ({ error: { message: 'Process failed' } }) }),
          json: async () => ({ error: { message: 'Process failed' } }),
        };
      }
      return { ok: true, json: async () => ({ response: { data: [] } }) };
    });

    const { result } = renderEntity();
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'Doc'); });

    let returned;
    await act(async () => {
      returned = await result.current.handleSaveAndProcess({ processField: 'docAction', processValue: 'CO' });
    });

    expect(returned).toBeNull();
    // Save was silent → no success toast even though the POST returned 200.
    expect(toast.success).not.toHaveBeenCalledWith('recordCreated', expect.anything());
    expect(toast.success).not.toHaveBeenCalledWith('recordSaved', expect.anything());
    // Process failure surfaces an error toast.
    expect(toast.error).toHaveBeenCalled();
  });
});
