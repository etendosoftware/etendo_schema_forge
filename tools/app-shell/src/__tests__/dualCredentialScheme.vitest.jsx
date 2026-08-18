/**
 * ETP-4576 — the preference promise: ONE switch, TWO working schemes.
 *
 * Every other suite in this repo pins a single scheme. That is not enough. The
 * whole point of routing credentials through a preference is that the SAME call
 * site works under both — bearer today, cookie session once the preference is on,
 * and back again without a redeploy if anything goes wrong. A suite that only
 * ever asserts one mode cannot see the failure that actually costs us: a call
 * site that hardcodes one scheme's header and silently sends nothing under the
 * other. That is exactly how 62 Playwright specs went red.
 *
 * So each test here drives a REAL production call site twice, once per scheme,
 * and asserts the full contract both times — the header that must be present AND
 * the one that must be absent. `useBankConnectionActions` is the primary subject
 * because its `call(method, …)` takes the method as a PARAMETER and branches on
 * its safety, so it exercises three properties at once: the scheme, the
 * method-awareness, and the interaction between them.
 *
 * An implementation that always sends the proof, one that never sends it, one
 * that ignores the active mode, and one that sends both credentials at once all
 * have to fail at least one assertion below.
 */
import { renderHook, act } from '@testing-library/react';
import {
  TEST_BEARER_TOKEN,
  TEST_CSRF_TOKEN,
  declareBearerSession,
  declareCookieSession,
  expectBearerHeader,
  expectNoAuthorizationHeader,
  expectNoCsrfHeader,
} from '@/test/sessionContract.js';

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

vi.mock('@/hooks/useNeoResource', () => ({ getApiBase: () => '' }));
vi.mock('../hooks/useNeoResource', () => ({ getApiBase: () => '' }));

import { useBankConnectionActions } from '@/hooks/useBankConnectionActions.js';
import { useStatementActions } from '@/hooks/useStatementActions.js';
import { jsonHeaders, writeHeaders } from '@/lib/sessionHeaders.js';

function okResponse(payload = {}) {
  return { ok: true, json: async () => ({ response: { data: payload } }) };
}

/** Headers of the Nth recorded fetch call, lowercased keys for case-safe lookup. */
function recordedHeaders(index = 0) {
  const init = globalThis.fetch.mock.calls[index]?.[1] ?? {};
  const entries = Object.entries(init.headers ?? {});
  return Object.fromEntries(entries.map(([k, v]) => [k.toLowerCase(), v]));
}

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue(okResponse());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the builders themselves resolve per scheme, not per import', () => {
  // The builders are read at request time, not captured at module load. A
  // implementation that snapshotted the scheme on import would pass every
  // single-mode suite and fail here — and in production it would freeze whichever
  // scheme happened to be active when the bundle first evaluated.
  it('returns bearer headers after declareBearerSession', () => {
    declareBearerSession();
    expect(jsonHeaders()).toMatchObject({ Authorization: `Bearer ${TEST_BEARER_TOKEN}` });
    expect(writeHeaders()).not.toHaveProperty('X-Go-CSRF');
  });

  it('returns cookie headers after declareCookieSession, in the same test file', () => {
    declareCookieSession();
    expect(jsonHeaders()).not.toHaveProperty('Authorization');
    expect(writeHeaders()).toMatchObject({ 'X-Go-CSRF': TEST_CSRF_TOKEN });
  });

  it('never carries both credentials at once, in either mode', () => {
    declareBearerSession();
    const bearer = writeHeaders();
    declareCookieSession();
    const cookie = writeHeaders();

    expect('X-Go-CSRF' in bearer).toBe(false);
    expect('Authorization' in cookie).toBe(false);
  });

  it('drops a stale bearer token when switching to the cookie scheme', () => {
    declareBearerSession();
    declareCookieSession();
    expect(jsonHeaders()).not.toHaveProperty('Authorization');
  });
});

describe('useBankConnectionActions — the same call site under both schemes', () => {
  // `sync` issues a POST; `fetchStatus` issues a GET. Driving one of each per
  // scheme covers the whole 2x2: scheme x method safety.
  async function runSync() {
    const { result } = renderHook(() => useBankConnectionActions());
    await act(async () => { await result.current.sync('acct-1'); });
  }

  async function runFetchStatus() {
    const { result } = renderHook(() => useBankConnectionActions());
    await act(async () => { await result.current.fetchStatus('acct-1'); });
  }

  it('cookie scheme: the POST carries the CSRF proof and no bearer token', async () => {
    declareCookieSession();
    await runSync();

    expect(recordedHeaders()['x-go-csrf']).toBe(TEST_CSRF_TOKEN);
    expectNoAuthorizationHeader();
  });

  it('cookie scheme: the GET carries neither credential header', async () => {
    declareCookieSession();
    await runFetchStatus();

    expectNoCsrfHeader();
    expectNoAuthorizationHeader();
  });

  it('bearer scheme: the POST carries the bearer token and NOT the CSRF proof', async () => {
    declareBearerSession();
    await runSync();

    expectBearerHeader();
    expectNoCsrfHeader();
  });

  it('bearer scheme: the GET carries the bearer token too', async () => {
    // Reads need the credential just as much as writes. The bug this catches is
    // real and shipped: `buildHeaders()` was left credential-less while only the
    // cookie scheme existed, which silently unauthenticated every read the moment
    // the bearer scheme came back.
    declareBearerSession();
    await runFetchStatus();

    expectBearerHeader();
    expectNoCsrfHeader();
  });

  it('sends credentials: include in both schemes, so the cookie can travel', async () => {
    // Required for the cookie scheme and harmless for bearer, so it is
    // unconditional — and asserting it in both modes stops someone from making it
    // conditional on the scheme, which would break the switch in one direction.
    for (const declare of [declareCookieSession, declareBearerSession]) {
      globalThis.fetch = vi.fn().mockResolvedValue(okResponse());
      declare();
      await runSync();
      expect(globalThis.fetch.mock.calls[0][1].credentials).toBe('include');
    }
  });
});

describe('useStatementActions — a plain POST-only call site under both schemes', () => {
  async function runProcess() {
    const { result } = renderHook(() => useStatementActions());
    await act(async () => { await result.current.processStatement('stmt-1'); });
  }

  it('cookie scheme: carries the CSRF proof, no bearer token', async () => {
    declareCookieSession();
    await runProcess();

    expect(recordedHeaders()['x-go-csrf']).toBe(TEST_CSRF_TOKEN);
    expectNoAuthorizationHeader();
  });

  it('bearer scheme: carries the bearer token, no CSRF proof', async () => {
    declareBearerSession();
    await runProcess();

    expectBearerHeader();
    expectNoCsrfHeader();
  });
});
