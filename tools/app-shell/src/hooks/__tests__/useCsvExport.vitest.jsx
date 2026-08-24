/**
 * ETP-4576 — the CSV export is a GET, so under BOTH credential schemes it must
 * carry `credentials: 'include'` (so the `__Host-go_session` cookie can travel)
 * and NO `X-Go-CSRF` proof: a safe method never proves intent.
 *
 * Which scheme is live is a backend preference, so both are reachable at runtime
 * and neither may be the one this suite happens to inherit. `src/test/setup.js`
 * resets the scheme to the bearer default before EVERY test, so a credential
 * assertion written without declaring a scheme only ever exercises that default —
 * it passes by omission. Every credential-sensitive case below therefore declares
 * its scheme and runs once per scheme.
 *
 * The auth mock is a plain mutable object rather than a vi.fn() with
 * mockReturnValueOnce: React can invoke the hook more than once per render, and
 * a "once" override would decay to the default mid-render.
 */
import { renderHook } from '@testing-library/react';
import {
  declareBearerSession,
  declareCookieSession,
  expectBearerHeader,
  expectNoAuthorizationHeader,
  expectNoCsrfHeader,
} from '@/test/sessionContract.js';

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

import { useCsvExport } from '../useCsvExport';

/**
 * The two schemes the preference switches between. `assertSafeMethodContract` is
 * everything that must hold for a GET regardless of which one is active — that
 * is the invariant part of the contract, and asserting it under both is what
 * stops someone making `credentials` or the CSRF decision conditional on the
 * scheme (which would break the switch in one direction).
 */
const SCHEMES = [
  { name: 'cookie', declare: declareCookieSession },
  { name: 'bearer', declare: declareBearerSession },
];

describe('useCsvExport', () => {
  let fetchMock;
  let clickMock;
  let lastAnchor;

  beforeEach(() => {
    fetchMock = vi.fn(() =>
      Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['csv'])) }),
    );
    global.fetch = fetchMock;
    global.URL.createObjectURL = vi.fn(() => 'blob:url');
    global.URL.revokeObjectURL = vi.fn();
    clickMock = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        el.click = clickMock;
        lastAnchor = el;
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a GET with export=csv and the given params, then downloads the blob', async () => {
    const { result } = renderHook(() => useCsvExport());

    await result.current({
      path: '/sws/neo/bank-statements',
      params: { action: 'lines', statementIds: 's1,s2', columns: 'lineNo:Line No.' },
      filename: 'lines',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/sws/neo/bank-statements?');
    expect(url).toContain('export=csv');
    expect(url).toContain('action=lines');
    expect(url).toContain('statementIds=s1%2Cs2');
    expect(lastAnchor.download).toBe('lines.csv');
    expect(clickMock).toHaveBeenCalledTimes(1);
  });

  for (const scheme of SCHEMES) {
    it(`still exports, sends credentials and no CSRF proof under the ${scheme.name} scheme`, async () => {
      scheme.declare();
      const { result } = renderHook(() => useCsvExport());

      await result.current({ path: '/sws/neo/bank-statements', filename: 'lines' });

      // The export must fire under either scheme. A `!token` gate here would
      // cancel it silently under cookie, which is how 62 Playwright specs went red.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // Unconditional by design: required under cookie, a no-op for the
      // same-origin requests this app makes under bearer.
      expect(fetchMock.mock.calls[0][1].credentials).toBe('include');
      // A GET is a safe method — the CSRF proof is never legitimate on it, so
      // neither scheme may attach one.
      expectNoCsrfHeader();
      expect(clickMock).toHaveBeenCalledTimes(1);
    });
  }

  it('sends no bearer token under the cookie scheme', async () => {
    declareCookieSession();
    const { result } = renderHook(() => useCsvExport());

    await result.current({ path: '/sws/neo/bank-statements', filename: 'lines' });

    expectNoAuthorizationHeader();
  });

  // The bearer counterpart of the test above. It was parked as a todo while the
  // hook sent NO headers at all — authenticating by accident, since the cookie
  // travels on its own but nothing identified the caller under bearer. The hook
  // now asks readCredentialHeaders() for the active credential, so both halves of
  // the contract can be asserted and neither scheme passes by omission.
  it('sends the bearer token under the bearer scheme', async () => {
    declareBearerSession();
    const { result } = renderHook(() => useCsvExport());

    await result.current({ path: '/sws/neo/bank-statements', filename: 'lines' });

    expectBearerHeader();
    expectNoCsrfHeader();
  });

  it('skips empty params and keeps a .csv filename as-is', async () => {
    const { result } = renderHook(() => useCsvExport());

    await result.current({
      path: '/sws/neo/bank-statements',
      params: { FIN_Financial_Account_ID: 'acc-1', ids: '', columns: undefined },
      filename: 'statements.csv',
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('FIN_Financial_Account_ID=acc-1');
    expect(url).not.toContain('ids=');
    expect(url).not.toContain('columns=');
    expect(lastAnchor.download).toBe('statements.csv');
  });

  it('throws on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const { result } = renderHook(() => useCsvExport());

    await expect(result.current({ path: '/x' })).rejects.toThrow('HTTP 500');
  });
});
