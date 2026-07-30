/**
 * Tests for useWindowFilterPresets: refresh (load), savePreset (PUT),
 * deletePreset (DELETE), guard early-returns, and error handling.
 * Auth + api helpers are mocked.
 *
 * ETP-4576 — the session is a server-side `__Host-` cookie, so the hook gates on
 * `isAuthenticated` (never a client-held `token`) and sends no Authorization
 * header. Its two mutations (PUT, DELETE) are unsafe methods, so they must carry
 * the session-bound `X-Go-CSRF` proof or the backend answers 403.
 *
 * The auth mock is a plain mutable object rather than a vi.fn() with
 * mockReturnValueOnce: React can invoke the hook more than once per render, and
 * a "once" override would decay to the default mid-render.
 */

let mockAuth = { isAuthenticated: true, csrfToken: 'csrf-abc' };

vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => mockAuth,
}));

// Mirrors the post-ETP-4576 core signature: buildHeaders() takes no argument and
// never emits an Authorization header.
vi.mock('@/auth/api.js', () => ({
  buildHeaders: () => ({ 'Content-Type': 'application/json' }),
  detectBaseUrl: () => 'https://base',
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useWindowFilterPresets } from '../useWindowFilterPresets.js';

/** Asserts no request carried a bearer token — the point of ETP-4576. */
function expectNoAuthorizationHeader() {
  for (const [, init] of globalThis.fetch.mock.calls) {
    const headers = init?.headers ?? {};
    const keys = Object.keys(headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain('authorization');
    expect(JSON.stringify(headers)).not.toContain('Bearer');
  }
}

function callByMethod(method) {
  return globalThis.fetch.mock.calls.find((c) => c[1]?.method === method);
}

beforeEach(() => {
  mockAuth = { isAuthenticated: true, csrfToken: 'csrf-abc' };
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useWindowFilterPresets', () => {
  it('loads presets on mount and exposes them', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ A: { x: 1 } }) });
    const { result } = renderHook(() => useWindowFilterPresets('sales-order'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.presets).toEqual({ A: { x: 1 } });
    const url = globalThis.fetch.mock.calls[0][0];
    expect(url).toBe('https://base/sws/neo/filters/sales-order');
  });

  it('does not fetch when windowName is missing', async () => {
    const { result } = renderHook(() => useWindowFilterPresets(''));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not fetch when the user is not authenticated', async () => {
    mockAuth = { isAuthenticated: false, csrfToken: null };
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('loads presets when authenticated even though the client holds no token', async () => {
    // The cookie-session shape: authenticated, no client-held token.
    mockAuth = { isAuthenticated: true, csrfToken: 'csrf-abc', token: null };
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ A: { x: 1 } }) });

    const { result } = renderHook(() => useWindowFilterPresets('w'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.presets).toEqual({ A: { x: 1 } });
    expectNoAuthorizationHeader();
  });

  it('neither mutation nor load sends an Authorization header', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.savePreset('mine', { a: 1 });
    });
    await act(async () => {
      await result.current.deletePreset('mine');
    });

    expect(globalThis.fetch).toHaveBeenCalled();
    expectNoAuthorizationHeader();
  });

  it('savePreset sends the X-Go-CSRF proof on the PUT', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.savePreset('mine', { a: 1 });
    });

    expect(callByMethod('PUT')[1].headers['X-Go-CSRF']).toBe('csrf-abc');
  });

  it('deletePreset sends the X-Go-CSRF proof on the DELETE', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deletePreset('drop');
    });

    expect(callByMethod('DELETE')[1].headers['X-Go-CSRF']).toBe('csrf-abc');
  });

  it('omits X-Go-CSRF (without throwing) when no CSRF proof is available', async () => {
    // A session can be authenticated before the CSRF proof lands; the header must
    // be added defensively, never read off a null.
    mockAuth = { isAuthenticated: true, csrfToken: null };
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.savePreset('mine', { a: 1 });
    });

    const putCall = callByMethod('PUT');
    expect(putCall).toBeTruthy();
    expect(Object.keys(putCall[1].headers)).not.toContain('X-Go-CSRF');
    expect(result.current.presets).toEqual({ mine: { a: 1 } });
  });

  it('falls back to {} when the response is not ok', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, json: async () => ({ ignored: true }) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.presets).toEqual({});
  });

  it('coerces a non-object body to {}', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => null });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.presets).toEqual({});
  });

  it('sets presets to {} when the fetch rejects', async () => {
    globalThis.fetch.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.presets).toEqual({});
  });

  it('savePreset issues a PUT and updates local state', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.savePreset('mine', { columnFilters: [1] });
    });

    const putCall = globalThis.fetch.mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(putCall[0]).toBe('https://base/sws/neo/filters/w/mine');
    expect(JSON.parse(putCall[1].body)).toEqual({ columnFilters: [1] });
    expect(result.current.presets).toEqual({ mine: { columnFilters: [1] } });
  });

  it('savePreset defaults payload to {} when not provided', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.savePreset('mine');
    });

    expect(result.current.presets).toEqual({ mine: {} });
  });

  it('savePreset is a no-op when presetName is falsy', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    globalThis.fetch.mockClear();

    await act(async () => {
      await result.current.savePreset('');
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('deletePreset issues a DELETE and removes the entry', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ keep: {}, drop: {} }) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deletePreset('drop');
    });

    const delCall = globalThis.fetch.mock.calls.find((c) => c[1]?.method === 'DELETE');
    expect(delCall[0]).toBe('https://base/sws/neo/filters/w/drop');
    expect(result.current.presets).toEqual({ keep: {} });
  });

  it('deletePreset is a no-op when presetName is falsy', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    globalThis.fetch.mockClear();

    await act(async () => {
      await result.current.deletePreset('');
    });

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('refresh re-fetches on demand', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useWindowFilterPresets('w'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = globalThis.fetch.mock.calls.length;

    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(globalThis.fetch.mock.calls.length).toBeGreaterThan(before));
  });
});
