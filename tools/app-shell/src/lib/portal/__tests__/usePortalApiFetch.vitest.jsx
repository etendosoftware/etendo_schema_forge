// @covers tools/app-shell/src/lib/portal/usePortalApiFetch.js

// The unit IS the request client, so the double sits one layer below it: `globalThis.fetch`.
// Mocking `useApiFetch`/`apiFetch` here would replace the very thing under test.
import { renderHook } from '@testing-library/react';
import { registerApiSession, resetApiSessionForTests } from '@etendosoftware/app-shell-core/auth';
import { usePortalApiFetch } from '../usePortalApiFetch.js';

const realFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** The header the request actually left with, read from the stubbed `fetch`'s call. */
function sentHeader(name) {
  const [, init] = globalThis.fetch.mock.calls[0];
  return new Headers(init.headers).get(name);
}

afterEach(() => {
  globalThis.fetch = realFetch;
  resetApiSessionForTests();
});

describe('usePortalApiFetch — outside the app session', () => {
  it.each([
    ['X-Portal-Token', 'portal-0123456789abcdef'],
    ['X-Portal-Decision-Token', 'dec-0123456789abcdef'],
  ])('sends %s, no seller bearer, and keeps the answer when the app identity changes mid-flight',
    async (header, value) => {
      // A seller session is registered ambiently and its identity is replaced while the portal
      // request is in flight; a session-bound client would discard the answer as superseded.
      let identityReplaced = false;
      registerApiSession({
        getToken: () => 'seller-jwt',
        onUnauthorized: vi.fn(),
        scope: {
          capture: () => ({}),
          isSameIdentity: () => !identityReplaced,
          isCurrent: () => !identityReplaced,
        },
      });
      globalThis.fetch = vi.fn(async () => {
        identityReplaced = true;
        return jsonResponse({ state: 'confirmed' });
      });
      const { result } = renderHook(() => usePortalApiFetch('/sws'));

      const res = await result.current('/portal/decisions/confirm', {
        method: 'POST', headers: { [header]: value }, on401: 'ignore',
      });

      expect(res.status).toBe(200);
      await expect(res.json()).resolves.toEqual({ state: 'confirmed' });
      expect(sentHeader(header)).toBe(value);
      expect(sentHeader('Authorization')).toBeNull();
    });

  it.each([401, 403])('a portal %i never calls the registered session logout', async (status) => {
    const onUnauthorized = vi.fn();
    registerApiSession({ getToken: () => 'seller-jwt', onUnauthorized });
    globalThis.fetch = vi.fn(async () => jsonResponse({}, status));
    const { result } = renderHook(() => usePortalApiFetch('/sws'));

    // No `on401: 'ignore'` here on purpose: the guarantee must hold from the hook itself
    // (no logout handler, no ambient scope), not only from what each caller remembers to send.
    const [outcome] = await Promise.allSettled([
      result.current('/portal/documents', { headers: { 'X-Portal-Token': 'portal-token' } }),
    ]);

    expect(globalThis.fetch).toHaveBeenCalled();
    if (status === 403) expect(outcome.value.status).toBe(403);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});

describe('usePortalApiFetch — identity of the returned client', () => {
  it('is the same function across re-renders with the same baseUrl, and a new one when it changes', () => {
    const { result, rerender } = renderHook(({ base }) => usePortalApiFetch(base), {
      initialProps: { base: '/sws' },
    });
    const first = result.current;

    rerender({ base: '/sws' });
    expect(result.current).toBe(first);

    rerender({ base: '/other' });
    expect(result.current).not.toBe(first);
    expect(typeof result.current).toBe('function');
  });
});
