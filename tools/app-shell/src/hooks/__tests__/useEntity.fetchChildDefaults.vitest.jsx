import { renderHook, waitFor } from '@testing-library/react';
import { useEntity } from '../useEntity';

// Mirror the mock setup of useEntity.vitest.jsx so the hook mounts in isolation.
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));
vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
}));

describe('useEntity.fetchChildDefaults', () => {
  const opts = { token: 'test-token', apiBaseUrl: 'http://localhost/api' };

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function render(childEntity = 'journalLine') {
    return renderHook(() => useEntity('journal', childEntity, opts));
  }

  it('fetches line defaults, normalizes them, and caches in childDefaults', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        defaults: { description: 'Header desc', accountingDate: '22-06-2026', id: 'ignored' },
      }),
    });
    const { result } = render();

    const returned = await result.current.fetchChildDefaults('PARENT-1');

    // URL carries the parentId
    const call = globalThis.fetch.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/journalLine/defaults?parentId=PARENT-1'),
    );
    expect(call).toBeTruthy();
    // Normalized: dd-MM-yyyy -> yyyy-MM-dd; id dropped
    expect(returned).toEqual({ description: 'Header desc', accountingDate: '2026-06-22' });
    await waitFor(() =>
      expect(result.current.childDefaults).toEqual({ description: 'Header desc', accountingDate: '2026-06-22' }),
    );
  });

  it('returns {} and does not fetch when parentId is missing', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ defaults: {} }) });
    const { result } = render();
    globalThis.fetch.mockClear();

    const returned = await result.current.fetchChildDefaults('');

    expect(returned).toEqual({});
    const defaultsCall = globalThis.fetch.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/defaults'),
    );
    expect(defaultsCall).toBeFalsy();
  });

  it('returns {} when there is no childEntity', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ defaults: {} }) });
    const { result } = render(null);
    const returned = await result.current.fetchChildDefaults('PARENT-1');
    expect(returned).toEqual({});
  });

  it('returns {} on a fetch error (best-effort)', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });
    const { result } = render();
    const returned = await result.current.fetchChildDefaults('PARENT-1');
    expect(returned).toEqual({});
  });
});
