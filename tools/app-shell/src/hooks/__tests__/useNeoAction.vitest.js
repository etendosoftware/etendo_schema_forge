/**
 * ETP-4576 — the session is a server-side `__Host-go_session` cookie, so this
 * hook holds no bearer token: its request must carry `credentials: 'include'`
 * and NO Authorization header, ever.
 *
 * The `token` OPTION is gone from the signature — the hook reads the CSRF proof
 * from `useAuth().csrfToken` itself. That is why `baseOpts` below no longer
 * carries a token: the whole suite is the proof that the hook is self-sufficient.
 * One dedicated test still hands it a stray `token` as a hostile input, so a
 * rename-only refactor (option kept, header still built) cannot pass.
 *
 * The only request this hook issues is a POST, i.e. an unsafe method, so the
 * `X-Go-CSRF` proof header is legitimate on it — but it must be omitted
 * entirely, not sent empty, when no proof is available.
 *
 * The auth mock is a plain mutable object rather than a vi.fn() with
 * mockReturnValueOnce: React can invoke the hook more than once per render, and
 * a "once" override would decay to the default mid-render.
 *
 * Endpoint convention (unchanged by this migration): `apiBaseUrl` already
 * includes the spec name (e.g. /sws/neo/sales-order), so the hook does NOT
 * prepend specName. URL = `${apiBaseUrl}/${entityName}/${recordId}/action/${actionName}`.
 */
import { readFileSync } from 'node:fs';
import { setAuthMock } from '@/test/authContextMock.js';
import { declareCookieSession, expectNoAuthorizationHeader } from '@/test/sessionContract.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

import { useNeoAction } from '../useNeoAction';

const CSRF_HEADER = 'X-Go-CSRF';

/** Falsy proofs that must all collapse to "no CSRF header at all". */
const MISSING_PROOFS = [
  ['undefined', undefined],
  ['null', null],
  ['an empty string', ''],
];

/** The init object of the single fetch call the hook is expected to have made. */
function lastInit() {
  const calls = globalThis.fetch.mock.calls;
  return calls[calls.length - 1][1];
}

describe('useNeoAction', () => {
  const baseOpts = {
    specName: 'sales-order',
    entityName: 'header',
    apiBaseUrl: '/sws/neo/sales-order',
  };

  beforeEach(() => {
    // ETP-4576 — declare the scheme this suite asserts on. The builders read the
    // active scheme, and src/test/setup.js resets it to the bearer default before
    // every test, so a suite expecting the CSRF proof has to say so.
    declareCookieSession();
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
        credentials: 'include',
        headers: expect.objectContaining({
          [CSRF_HEADER]: 'test-csrf',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expectNoAuthorizationHeader();
    expect(res).toEqual({ success: true, message: 'Document posted' });
    expect(result.current.loading).toBe(false);
  });

  it("passes credentials: 'include' so the __Host-go_session cookie travels", async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useNeoAction(baseOpts));
    await act(async () => { await result.current.execute('rec-1', 'post'); });
    expect(lastInit().credentials).toBe('include');
  });

  it('never sends an Authorization header', async () => {
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useNeoAction(baseOpts));
    await act(async () => { await result.current.execute('rec-1', 'post'); });
    expectNoAuthorizationHeader();
  });

  it('works without being handed a token — the option no longer exists', async () => {
    // baseOpts deliberately carries no `token`. If the hook still depended on
    // one, the request would go out with a `Bearer undefined` header.
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    const { result } = renderHook(() => useNeoAction(baseOpts));
    let res;
    await act(async () => { res = await result.current.execute('rec-1', 'post'); });
    expect(res.success).toBe(true);
    expectNoAuthorizationHeader();
  });

  it('ignores a stray token option — a leftover credential reaches no wire', async () => {
    // Hostile input: a caller that was not cleaned up yet keeps threading the
    // now-dead prop. It must not resurrect an Authorization header.
    globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { result } = renderHook(() => useNeoAction({ ...baseOpts, token: 'legacy-token' }));
    await act(async () => { await result.current.execute('rec-1', 'post'); });
    expectNoAuthorizationHeader();
    expect(JSON.stringify(lastInit().headers)).not.toContain('legacy-token');
  });

  for (const [label, value] of MISSING_PROOFS) {
    it(`omits ${CSRF_HEADER} entirely when csrfToken is ${label}`, async () => {
      // A session can be authenticated before the CSRF proof lands. The header
      // must be absent, never present with an empty/undefined value.
      setAuthMock({ isAuthenticated: true, csrfToken: value });
      globalThis.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });
      const { result } = renderHook(() => useNeoAction(baseOpts));
      await act(async () => { await result.current.execute('rec-1', 'post'); });
      const init = lastInit();
      expect(CSRF_HEADER in init.headers).toBe(false);
      expect(init.credentials).toBe('include');
      expectNoAuthorizationHeader();
    });
  }

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
});

/**
 * Source-level guard. The behavioral suite above can only see the code path it
 * exercises; these assertions cover the whole module, so a second, unexercised
 * branch cannot keep building a bearer header.
 *
 * Comments are stripped before matching. The pre-migration JSDoc documented
 * `@param {string} opts.token - bearer token`, and the post-migration header
 * comment will almost certainly mention "Authorization" while explaining that
 * none is sent — neither may decide the outcome of these tests.
 */
const MODULE_SRC = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'useNeoAction.js'),
  'utf8',
);
const codeOnly = MODULE_SRC
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('useNeoAction — source contract', () => {
  it('builds no Authorization header anywhere in the module', () => {
    expect(codeOnly).not.toMatch(/Authorization/);
    expect(codeOnly).not.toMatch(/Bearer/);
  });

  it('sends credentials with the request', () => {
    expect(codeOnly).toMatch(/credentials:\s*['"]include['"]/);
  });

  it('reads no credential at all — the shared builders own that decision', () => {
    // Inverted in ETP-4576. The hook used to read `useAuth().csrfToken` and paste
    // it into a header, which pinned it to the cookie scheme: with the preference
    // off it would have sent a meaningless CSRF header and no bearer token. Now it
    // asks writeHeaders() for headers and never learns what authenticates them.
    expect(codeOnly).not.toMatch(/useAuth/);
    expect(codeOnly).not.toMatch(/csrfToken/);
    expect(codeOnly).toMatch(/writeHeaders\(\s*\)/);
  });

  it('no longer names a bare `token` identifier — the option is gone', () => {
    // \b does not break inside `csrfToken`, so the CSRF proof is unaffected;
    // only a standalone `token` option/variable trips this.
    expect(codeOnly).not.toMatch(/\btoken\b/);
  });
});
