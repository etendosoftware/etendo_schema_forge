/**
 * ETP-5424 — save, delete, add-line and handleProcess surface a transport failure through `err.message`.
 * Once apiFetch turns the browser's `TypeError('Failed to fetch')` into a NetworkError, that
 * message is already the localized networkErrorRetry text, and an error with no message at all
 * must fall back to the same translated label — never a hardcoded English 'Network error',
 * never the browser prose.
 *
 * fetch is mocked BELOW the real apiFetch, so these cases exercise the real TypeError →
 * NetworkError translation, exactly as a dropped connection does in the browser.
 */
import { renderHook, act } from '@testing-library/react';
import {
  registerErrorTranslator, resetErrorTranslatorForTests,
} from '@etendosoftware/app-shell-core/auth';
import { useEntity } from '../useEntity';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key, params) => {
    if (params) {
      let text = key;
      Object.keys(params).forEach(p => { text = text.replace(`{${p}}`, params[p]); });
      return text;
    }
    return key;
  },
}));

import { toast } from 'sonner';

const TRANSLATED = 'No se pudo completar la acción. Intenta nuevamente.';

describe('useEntity — network failures (ETP-5424)', () => {
  const defaultOpts = { token: 'test-token', apiBaseUrl: 'http://localhost/api' };

  beforeEach(() => {
    globalThis.fetch = vi.fn();
    vi.mocked(toast.error).mockClear();
    registerErrorTranslator((key) => (key === 'networkErrorRetry' ? TRANSLATED : key));
  });

  afterEach(() => {
    resetErrorTranslatorForTests();
    vi.restoreAllMocks();
  });

  function renderEntity(entity = 'header', childEntity = 'lines', opts = {}) {
    return renderHook(() => useEntity(entity, childEntity, { ...defaultOpts, ...opts }));
  }

  function mockFetchOk(data = []) {
    return { ok: true, status: 200, json: async () => ({ response: { data } }) };
  }

  function expectNoBrowserProse() {
    for (const [msg] of vi.mocked(toast.error).mock.calls) {
      expect(String(msg)).not.toMatch(/Failed to fetch/);
      expect(msg).not.toBe('Network error');
    }
  }

  async function newDirtyHeader(result) {
    await act(async () => { await result.current.handleNew(); });
    act(() => { result.current.handleChange('name', 'X'); });
  }

  describe('handleSave', () => {
    it('shows the translated NetworkError message when fetch drops the connection', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (url.includes('/defaults')) return { ok: true, json: async () => ({ defaults: {} }) };
        if (opts?.method === 'POST') throw new TypeError('Failed to fetch');
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      await newDirtyHeader(result);

      let saved;
      await act(async () => { saved = await result.current.handleSave(); });

      expect(saved).toBeNull();
      expect(result.current.saveError).toBe(TRANSLATED);
      expect(toast.error).toHaveBeenCalledWith(TRANSLATED);
      expectNoBrowserProse();
    });
  });

  describe('handleDelete', () => {
    it('shows the translated NetworkError message when fetch drops the connection', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'DELETE') throw new TypeError('Failed to fetch');
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'd1' }); });

      let deleted;
      await act(async () => { deleted = await result.current.handleDelete(); });

      expect(deleted).toBe(false);
      expect(toast.error).toHaveBeenCalledWith(TRANSLATED);
      expectNoBrowserProse();
    });
  });

  describe('handleProcess', () => {
    it('shows the translated NetworkError message when fetch drops the connection', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') throw new TypeError('Failed to fetch');
        return mockFetchOk([{ id: 'h1' }]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'h1' }); });

      await act(async () => { await result.current.handleProcess({ name: 'Complete', params: [] }); });

      expect(toast.error).toHaveBeenCalledWith(TRANSLATED);
      expectNoBrowserProse();
    });

    it('falls back to ui(\'networkErrorRetry\'), not \'Network error\', when the error has no message', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') throw new Error();
        return mockFetchOk([{ id: 'h1' }]);
      });

      const { result } = renderEntity('header', null, { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'h1' }); });

      await act(async () => { await result.current.handleProcess({ name: 'Complete', params: [] }); });

      // The i18n mock echoes the key, so the translated fallback reads as the key itself.
      expect(toast.error).toHaveBeenCalledWith('networkErrorRetry');
      expectNoBrowserProse();
    });
  });

  describe('handleAddChild (add line)', () => {
    it('shows the translated NetworkError message when fetch drops the connection', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') throw new TypeError('Failed to fetch');
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'p1' }); });

      let added;
      await act(async () => { added = await result.current.handleAddChild({ product: 'X' }); });

      expect(added).toBeNull();
      expect(result.current.saveError).toBe(TRANSLATED);
      expect(toast.error).toHaveBeenCalledWith(TRANSLATED);
      expectNoBrowserProse();
    });

    it('falls back to ui(\'networkErrorRetry\'), not \'Network error\', when the error has no message', async () => {
      globalThis.fetch.mockImplementation(async (url, opts) => {
        if (opts?.method === 'POST') throw new Error();
        return mockFetchOk([]);
      });

      const { result } = renderEntity('header', 'lines', { skipListFetch: true });
      act(() => { result.current.handleSelect({ id: 'p1' }); });

      await act(async () => { await result.current.handleAddChild({ product: 'X' }); });

      // The i18n mock echoes the key, so the translated fallback reads as the key itself.
      expect(result.current.saveError).toBe('networkErrorRetry');
      expect(toast.error).toHaveBeenCalledWith('networkErrorRetry');
      expectNoBrowserProse();
    });
  });
});
