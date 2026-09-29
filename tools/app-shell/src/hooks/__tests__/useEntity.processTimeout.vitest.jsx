/**
 * ETP-5424 — a document process (Complete, Post, Reactivate...) runs synchronously on the
 * server and can outlive apiFetch's default timeout. Cutting it off client-side while the
 * server still commits would show an error for a document that was in fact processed and
 * invite a double submit, so both process paths opt out with `timeout: 0`:
 *   - handleSaveAndProcess (draft-mode "save + complete")
 *   - handleProcess (a process button on a saved record)
 * The plain save before the process keeps the default timeout.
 *
 * The real client performs every request; only its options are recorded
 * (see `@/test/recordApiFetch.js`).
 */
import { renderHook, act } from '@testing-library/react';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

const { stableUi } = vi.hoisted(() => ({ stableUi: (key) => key }));
vi.mock('@/i18n', () => ({ useUI: () => stableUi }));

vi.mock('@/auth/useApiFetch.js', async (importOriginal) => {
  const { wrapUseApiFetchModule } = await import('@/test/recordApiFetch.js');
  return wrapUseApiFetchModule(await importOriginal());
});

import { apiFetchCallsTo, resetApiFetchCalls } from '@/test/recordApiFetch.js';
import { useEntity } from '../useEntity';

const okRows = (data = []) => ({ ok: true, status: 200, json: async () => ({ response: { data } }) });

describe('useEntity — process timeout opt-out (ETP-5424)', () => {
  const defaultOpts = { token: 'test-token', apiBaseUrl: 'http://localhost/api', skipListFetch: true };

  beforeEach(() => {
    resetApiFetchCalls();
    globalThis.fetch = vi.fn(async (url, opts) => {
      if (String(url).includes('/defaults')) return { ok: true, status: 200, json: async () => ({ defaults: {} }) };
      if (String(url).includes('/action/')) return okRows([{ id: 'h1' }]);
      if (opts?.method === 'POST') return okRows([{ id: 'h1', name: 'X' }]);
      return okRows([{ id: 'h1', name: 'X' }]);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('handleSaveAndProcess passes timeout: 0 on the process action', async () => {
    const { result } = renderHook(() => useEntity('header', null, defaultOpts));
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'X'); });

    await act(async () => {
      await result.current.handleSaveAndProcess({ processField: 'docAction', processValue: 'CO' });
    });

    const actions = apiFetchCallsTo('/action/docAction');
    expect(actions).toHaveLength(1);
    expect(actions[0].options.method).toBe('POST');
    expect(actions[0].options.timeout).toBe(0);
  });

  it('the save that precedes the process keeps the default timeout', async () => {
    const { result } = renderHook(() => useEntity('header', null, defaultOpts));
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'X'); });

    await act(async () => {
      await result.current.handleSaveAndProcess({ processField: 'docAction', processValue: 'CO' });
    });

    const saves = apiFetchCallsTo('/header').filter(({ path, options }) => (
      options?.method === 'POST' && !String(path).includes('/action/')
    ));
    expect(saves.length).toBeGreaterThanOrEqual(1);
    expect(saves[0].options.timeout).toBeUndefined();
  });

  it('handleProcess passes timeout: 0 on the process action', async () => {
    const { result } = renderHook(() => useEntity('header', null, defaultOpts));
    act(() => { result.current.handleSelect({ id: 'h1' }); });

    await act(async () => {
      await result.current.handleProcess({ name: 'Complete', columnName: 'docAction', params: [] });
    });

    const actions = apiFetchCallsTo('/action/docAction');
    expect(actions).toHaveLength(1);
    expect(actions[0].options.timeout).toBe(0);
  });
});
