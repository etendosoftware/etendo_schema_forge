import { renderHook, act } from '@testing-library/react';
import { useEntity } from '../useEntity';
import { toast } from 'sonner';

/**
 * ETP-5024 — a "credit limit exceeded" / "Business Partner on hold" failure from
 * handleProcess or handleSaveAndProcess (the draft-mode Complete flow) must set
 * `blockingCondition` instead of toasting, so DetailView can render a persistent
 * inline banner (BlockingBpBanner.jsx) instead of an auto-dismissing toast.
 * `completionSignal` must bump on every successful completion (source-agnostic
 * "cleared" signal — see BlockingBpBanner.jsx), and both must reset on
 * handleSelect/handleNew (switching records).
 */

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

const baseOpts = {
  token: 'test-token',
  apiBaseUrl: 'http://localhost/api',
};

describe('useEntity — blocking BP condition (ETP-5024)', () => {
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

  // Any call this suite doesn't care about (fetchChildren, refreshRecordVersion's
  // GET, the post-process refetch) falls through to this safe default.
  function defaultFallback() {
    return { ok: true, json: async () => ({ response: { data: [] } }) };
  }

  // ── handleProcess ─────────────────────────────────────────────────────────

  it('handleProcess: an on-hold refusal sets blockingCondition instead of toasting', async () => {
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/action/')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'The selected Business Partner is on hold for this document, therefore it is not possible to complete it.' } }),
        };
      }
      return defaultFallback();
    });

    const { result } = renderEntity();
    act(() => { result.current.handleSelect({ id: 'doc-1', documentStatus: 'DR' }); });

    await act(async () => {
      await result.current.handleProcess({ columnName: 'docAction', name: 'Complete' }, { docAction: 'CO' });
    });

    expect(result.current.blockingCondition).toEqual({
      kind: 'onHold',
      text: 'The selected Business Partner is on hold for this document, therefore it is not possible to complete it.',
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('handleProcess: a credit-limit refusal sets blockingCondition instead of toasting', async () => {
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/action/')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Business Partner credit limit exceeded' } }),
        };
      }
      return defaultFallback();
    });

    const { result } = renderEntity();
    act(() => { result.current.handleSelect({ id: 'doc-1', documentStatus: 'DR' }); });

    await act(async () => {
      await result.current.handleProcess({ columnName: 'docAction', name: 'Complete' });
    });

    expect(result.current.blockingCondition?.kind).toBe('creditLimit');
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('handleProcess: a non-blocking failure still toasts as before (no regression)', async () => {
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/action/')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Some other unrelated validation error' } }),
        };
      }
      return defaultFallback();
    });

    const { result } = renderEntity();
    act(() => { result.current.handleSelect({ id: 'doc-1', documentStatus: 'DR' }); });

    await act(async () => {
      await result.current.handleProcess({ columnName: 'docAction', name: 'Complete' });
    });

    expect(result.current.blockingCondition).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Some other unrelated validation error');
  });

  it('handleProcess: a successful completion process bumps completionSignal and clears blockingCondition', async () => {
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/action/')) {
        return { ok: true, json: async () => ({ response: { data: [{ id: 'doc-1', documentStatus: 'CO' }] } }) };
      }
      return defaultFallback();
    });

    const { result } = renderEntity();
    act(() => { result.current.handleSelect({ id: 'doc-1', documentStatus: 'DR' }); });
    const initialSignal = result.current.completionSignal;

    await act(async () => {
      await result.current.handleProcess({ columnName: 'docAction', name: 'Complete' });
    });

    expect(result.current.completionSignal).toBe(initialSignal + 1);
    expect(result.current.blockingCondition).toBeNull();
  });

  it('handleProcess: a successful NON-completion process does NOT bump completionSignal', async () => {
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/action/')) {
        return { ok: true, json: async () => ({ response: { data: [{ id: 'doc-1' }] } }) };
      }
      return defaultFallback();
    });

    const { result } = renderEntity();
    act(() => { result.current.handleSelect({ id: 'doc-1', documentStatus: 'DR' }); });
    const initialSignal = result.current.completionSignal;

    await act(async () => {
      await result.current.handleProcess({ columnName: 'someOtherAction', name: 'Recalculate' });
    });

    expect(result.current.completionSignal).toBe(initialSignal);
  });

  // ── handleSaveAndProcess (draft-mode Complete flow) ──────────────────────

  it('handleSaveAndProcess: an on-hold refusal of the /action/ POST sets blockingCondition instead of toasting', async () => {
    const saved = { id: 'doc-2', documentStatus: 'DR' };
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (String(url).includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'POST' && !String(url).includes('/action/')) {
        return { ok: true, json: async () => ({ response: { data: [saved] } }) };
      }
      if (opts?.method === 'POST' && String(url).includes('/action/')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'The selected Business Partner is on hold for this document, therefore it is not possible to complete it.' } }),
        };
      }
      return defaultFallback();
    });

    const { result } = renderEntity();
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'Doc'); });

    await act(async () => {
      await result.current.handleSaveAndProcess({ processField: 'docAction', processValue: 'CO' });
    });

    expect(result.current.blockingCondition).toEqual({
      kind: 'onHold',
      text: 'The selected Business Partner is on hold for this document, therefore it is not possible to complete it.',
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('handleSaveAndProcess: a non-blocking /action/ failure still toasts as before (no regression)', async () => {
    const saved = { id: 'doc-3', documentStatus: 'DR' };
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (String(url).includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'POST' && !String(url).includes('/action/')) {
        return { ok: true, json: async () => ({ response: { data: [saved] } }) };
      }
      if (opts?.method === 'POST' && String(url).includes('/action/')) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: { message: 'Process failed for another reason' } }),
        };
      }
      return defaultFallback();
    });

    const { result } = renderEntity();
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'Doc'); });

    await act(async () => {
      await result.current.handleSaveAndProcess({ processField: 'docAction', processValue: 'CO' });
    });

    expect(result.current.blockingCondition).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Process failed for another reason');
  });

  it('handleSaveAndProcess: a successful completion bumps completionSignal and clears blockingCondition', async () => {
    const saved = { id: 'doc-4', documentStatus: 'DR' };
    const processed = { id: 'doc-4', documentStatus: 'CO' };
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (String(url).includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'POST' && !String(url).includes('/action/')) {
        return { ok: true, json: async () => ({ response: { data: [saved] } }) };
      }
      if (opts?.method === 'POST' && String(url).includes('/action/')) {
        return { ok: true, json: async () => ({ response: { data: [processed] } }) };
      }
      if (!opts?.method) {
        return { ok: true, json: async () => ({ response: { data: [processed] } }) };
      }
      return defaultFallback();
    });

    const { result } = renderEntity();
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'Doc'); });
    const initialSignal = result.current.completionSignal;

    await act(async () => {
      await result.current.handleSaveAndProcess({ processField: 'docAction', processValue: 'CO' });
    });

    expect(result.current.completionSignal).toBe(initialSignal + 1);
    expect(result.current.blockingCondition).toBeNull();
  });

  // ── Reset on record change ───────────────────────────────────────────────

  it('handleSelect resets a blockingCondition raised on the previously selected record', async () => {
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (opts?.method === 'POST' && String(url).includes('/action/')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'The selected Business Partner is on hold for this document, therefore it is not possible to complete it.' } }),
        };
      }
      return defaultFallback();
    });

    const { result } = renderEntity();
    act(() => { result.current.handleSelect({ id: 'doc-1', documentStatus: 'DR' }); });

    await act(async () => {
      await result.current.handleProcess({ columnName: 'docAction', name: 'Complete' });
    });
    expect(result.current.blockingCondition).not.toBeNull();

    // Switching to a different record must drop the stale banner state.
    act(() => { result.current.handleSelect({ id: 'doc-2', documentStatus: 'DR' }); });
    expect(result.current.blockingCondition).toBeNull();
  });

  it('handleNew resets a blockingCondition raised on the previously selected record', async () => {
    globalThis.fetch.mockImplementation(async (url, opts) => {
      if (String(url).includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
      if (opts?.method === 'POST' && String(url).includes('/action/')) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'The selected Business Partner is on hold for this document, therefore it is not possible to complete it.' } }),
        };
      }
      return defaultFallback();
    });

    const { result } = renderEntity();
    act(() => { result.current.handleSelect({ id: 'doc-1', documentStatus: 'DR' }); });

    await act(async () => {
      await result.current.handleProcess({ columnName: 'docAction', name: 'Complete' });
    });
    expect(result.current.blockingCondition).not.toBeNull();

    await act(async () => { await result.current.handleNew(); });
    expect(result.current.blockingCondition).toBeNull();
  });

  // ── Baseline ──────────────────────────────────────────────────────────────

  it('starts with blockingCondition=null and completionSignal=0', () => {
    const { result } = renderEntity();
    expect(result.current.blockingCondition).toBeNull();
    expect(result.current.completionSignal).toBe(0);
  });
});
