// @covers tools/app-shell/src/lib/supportSession.js
// @covers tools/app-shell/src/lib/observability.js
import { declareCookieSession } from '@/test/sessionContract.js';
import { registerApiSession, resetApiSessionForTests } from '@etendosoftware/app-shell-core/auth/api';
import { isAnalyticsSuppressed } from '../observability.js';
import {
  ACCOUNT_ENDPOINT,
  PROVISIONAL_MARKER_TTL_MS,
  SUPPORT_HANDOFF_ENDPOINT,
  SUPPORT_HANDOFF_FAILURES,
  SUPPORT_SESSION_STORAGE_KEY,
  applySupportSessionFromServer,
  bootSupportSession,
  buildAppHref,
  completeSupportHandoff,
  consumeSupportTicket,
  fetchSupportSession,
  formatSupportExpiry,
  getSupportSessionState,
  hideSupportRestrictedMenuItems,
  isSupportAccessPath,
  isSupportModeActive,
  isSupportRestrictedRoute,
  normalizeSupportSession,
  parseSupportTicket,
  redeemPendingSupportTicket,
  redeemSupportTicket,
  resetSupportSessionForTests,
  takeSupportTicket,
  withSupportModeCapabilities,
} from '../supportSession.js';

/**
 * The support-access handoff (Classic → `<app>/support-access#t=<ticket>`) and the support-mode
 * state it opens. The handoff request is driven through the REAL `apiFetch` over a stubbed
 * `fetch`, so what is asserted is what would reach the network, not what the module meant to send.
 */

const NOW = Date.parse('2026-10-05T10:00:00Z');
const SUPPORT_SESSION = {
  clientId: 'CLIENT-ACME',
  clientName: 'Acme Corp',
  expiresAt: '2026-10-05T11:00:00Z',
};

function jsonResponse(body, { status = 200 } = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function fakeLocation(pathname, hash = '', search = '') {
  return { pathname, hash, search };
}

function fakeHistory() {
  return { state: { idx: 0 }, replaceState: vi.fn() };
}

beforeEach(() => {
  localStorage.clear();
  resetSupportSessionForTests();
  declareCookieSession();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('reading the ticket', () => {
  it('takes the ticket from the t parameter of the fragment', () => {
    expect(parseSupportTicket('#t=abc123')).toBe('abc123');
    expect(parseSupportTicket('t=abc123')).toBe('abc123');
  });

  it('answers null for a fragment with no ticket', () => {
    expect(parseSupportTicket('')).toBeNull();
    expect(parseSupportTicket('#')).toBeNull();
    expect(parseSupportTicket('#t=')).toBeNull();
    expect(parseSupportTicket('#other=1')).toBeNull();
    expect(parseSupportTicket(undefined)).toBeNull();
  });

  it('recognizes the handoff route at the domain root and under a Tomcat router base', () => {
    expect(isSupportAccessPath('/support-access', '/')).toBe(true);
    expect(isSupportAccessPath('/support-access/', '/')).toBe(true);
    expect(isSupportAccessPath('/go/web/com.etendoerp.go/support-access', '/go/web/com.etendoerp.go')).toBe(true);
  });

  it('does not take another route, nor a support-access segment deeper in one, for the handoff', () => {
    expect(isSupportAccessPath('/dashboard', '/')).toBe(false);
    // `/go/support-access` against a root deployment is `:windowName/:recordId`, not this route.
    expect(isSupportAccessPath('/go/support-access', '/')).toBe(false);
    expect(isSupportAccessPath('/support-access', '/go/web/com.etendoerp.go')).toBe(false);
  });
});

describe('cleaning the ticket out of the URL', () => {
  it('returns the ticket and replaces the history entry without the fragment', () => {
    const history = fakeHistory();
    const ticket = consumeSupportTicket({
      location: fakeLocation('/support-access', '#t=abc123', '?lang=es'),
      history,
      routerBase: '/',
    });

    expect(ticket).toBe('abc123');
    expect(history.replaceState).toHaveBeenCalledTimes(1);
    expect(history.replaceState).toHaveBeenCalledWith({ idx: 0 }, '', '/support-access?lang=es');
  });

  it('strips a fragment that carries no usable ticket too', () => {
    const history = fakeHistory();
    expect(consumeSupportTicket({ location: fakeLocation('/support-access', '#x=1'), history })).toBeNull();
    expect(history.replaceState).toHaveBeenCalledWith({ idx: 0 }, '', '/support-access');
  });

  it('leaves any other route alone', () => {
    const history = fakeHistory();
    expect(consumeSupportTicket({ location: fakeLocation('/dashboard', '#t=abc123'), history })).toBeNull();
    expect(history.replaceState).not.toHaveBeenCalled();
  });

  it('hands the ticket read at boot over once', () => {
    bootSupportSession({
      location: fakeLocation('/support-access', '#t=abc123'),
      history: fakeHistory(),
      storage: localStorage,
      now: NOW,
    });

    expect(takeSupportTicket()).toBe('abc123');
    expect(takeSupportTicket()).toBeNull();
  });
});

describe('the mode a load starts in', () => {
  it('starts in support mode on the handoff page, before any session exists', () => {
    bootSupportSession({ location: fakeLocation('/support-access', '#t=abc123'), history: fakeHistory(), storage: localStorage, now: NOW });
    expect(isSupportModeActive()).toBe(true);
  });

  it('starts in support mode anywhere when a live marker is stored', () => {
    localStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify(SUPPORT_SESSION));
    bootSupportSession({ location: fakeLocation('/dashboard'), history: fakeHistory(), storage: localStorage, now: NOW });

    expect(getSupportSessionState()).toEqual({ status: 'support', session: SUPPORT_SESSION });
  });

  it('ignores and removes a marker whose session already expired', () => {
    localStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify({ ...SUPPORT_SESSION, expiresAt: '2026-10-05T09:59:00Z' }));
    bootSupportSession({ location: fakeLocation('/dashboard'), history: fakeHistory(), storage: localStorage, now: NOW });

    expect(isSupportModeActive()).toBe(false);
    expect(localStorage.getItem(SUPPORT_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('honours a provisional marker only within its window', () => {
    const provisional = { clientId: 'CLIENT-ACME', expiresAt: null, provisionalUntil: NOW + 1000 };
    localStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify(provisional));
    bootSupportSession({ location: fakeLocation('/dashboard'), history: fakeHistory(), storage: localStorage, now: NOW });
    expect(isSupportModeActive()).toBe(true);

    resetSupportSessionForTests();
    localStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify(provisional));
    bootSupportSession({ location: fakeLocation('/dashboard'), history: fakeHistory(), storage: localStorage, now: NOW + 1001 });
    expect(isSupportModeActive()).toBe(false);
  });

  it('stays out of support mode on an ordinary load', () => {
    bootSupportSession({ location: fakeLocation('/dashboard'), history: fakeHistory(), storage: localStorage, now: NOW });
    expect(getSupportSessionState().status).toBe('unknown');
  });
});

describe('redeeming the ticket', () => {
  it('POSTs the ticket to the handoff endpoint and resolves ok on 200', async () => {
    const answer = { status: 'success', environment: { clientId: 'CLIENT-ACME' }, roleList: [], csrfToken: 'x' };
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(answer));

    const result = await redeemSupportTicket('abc123');

    expect(result).toEqual({ ok: true, data: answer });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toMatch(new RegExp(`${SUPPORT_HANDOFF_ENDPOINT}$`));
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ ticket: 'abc123' });
    expect(init.credentials).toBe('include');
  });

  it.each([
    ['support_ticket_invalid', { error: 'support_ticket_invalid' }],
    ['support_ticket_expired', { error: 'support_ticket_expired' }],
    ['support_ticket_used', { error: { code: 'support_ticket_used' } }],
  ])('reports a 401 (%s) as rejected, with its code, and does not log anyone out', async (code, body) => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(body, { status: 401 }));

    const result = await redeemSupportTicket('abc123');

    expect(result).toEqual({ ok: false, reason: SUPPORT_HANDOFF_FAILURES.rejected, code });
  });

  it('is not abandoned when the session restore replaces the identity while the POST is in flight', async () => {
    // The handoff page loads with AuthProvider restoring the session (GET /session → 401 →
    // logout()) in parallel. That replaces the session identity under the ambient scope; the
    // handoff, which belongs to no session, must still deliver the answer the backend gave.
    const scope = { capture: () => ({}), isSameIdentity: () => false, isCurrent: () => false };
    registerApiSession({ getToken: () => null, onUnauthorized: () => {}, scope });
    try {
      const answer = { status: 'success', environment: { clientId: 'CLIENT-ACME' } };
      globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(answer));

      expect(await redeemSupportTicket('abc123')).toEqual({ ok: true, data: answer });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    } finally {
      resetApiSessionForTests();
    }
  });

  it('reports a missing ticket without calling the backend', async () => {
    globalThis.fetch = vi.fn();
    expect(await redeemSupportTicket(null)).toEqual({ ok: false, reason: SUPPORT_HANDOFF_FAILURES.missing });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['a 500', () => Promise.resolve(jsonResponse({}, { status: 500 }))],
    ['a 200 whose status is not success', () => Promise.resolve(jsonResponse({ status: 'error' }))],
    ['no answer at all', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('reports %s as failed', async (_label, answer) => {
    globalThis.fetch = vi.fn().mockImplementation(answer);
    expect(await redeemSupportTicket('abc123')).toEqual({ ok: false, reason: SUPPORT_HANDOFF_FAILURES.failed });
  });

  it('redeems the boot ticket once even when asked twice (StrictMode, remounts)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ status: 'success' }));
    bootSupportSession({ location: fakeLocation('/support-access', '#t=abc123'), history: fakeHistory(), storage: localStorage, now: NOW });

    const [first, second] = await Promise.all([redeemPendingSupportTicket(), redeemPendingSupportTicket()]);

    expect(first).toBe(second);
    expect(first.ok).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('entering the app after a successful handoff', () => {
  function fakeWindow() {
    return {
      caches: { keys: vi.fn().mockResolvedValue(['a', 'b']), delete: vi.fn().mockResolvedValue(true) },
      dispatchEvent: vi.fn(),
      location: { replace: vi.fn() },
    };
  }

  it('drops the SW caches, announces the navigation and replaces the page with the home', async () => {
    const win = fakeWindow();
    await completeSupportHandoff({ environment: { clientId: 'CLIENT-ACME' } }, {
      win, storage: localStorage, routerBase: '/go/web/com.etendoerp.go', now: NOW,
    });

    expect(win.caches.delete).toHaveBeenCalledTimes(2);
    expect(win.dispatchEvent.mock.calls[0][0].type).toBe('etendo-go:navigating');
    expect(win.location.replace).toHaveBeenCalledWith('/go/web/com.etendoerp.go/dashboard');
  });

  it('leaves a provisional marker so the next load already starts in support mode', async () => {
    await completeSupportHandoff({ environment: { clientId: 'CLIENT-ACME' } }, {
      win: fakeWindow(), storage: localStorage, routerBase: '/', now: NOW,
    });

    expect(JSON.parse(localStorage.getItem(SUPPORT_SESSION_STORAGE_KEY))).toEqual({
      clientId: 'CLIENT-ACME',
      clientName: null,
      expiresAt: null,
      provisionalUntil: NOW + PROVISIONAL_MARKER_TTL_MS,
    });
  });

  it('does not record the tenant as the last environment the operator used', async () => {
    await completeSupportHandoff({ environment: { clientId: 'CLIENT-ACME' } }, {
      win: fakeWindow(), storage: localStorage, routerBase: '/', now: NOW,
    });
    expect(localStorage.getItem('sf_last_environment')).toBeNull();
  });

  it('builds hrefs at the root without a double slash', () => {
    expect(buildAppHref('/', '/dashboard')).toBe('/dashboard');
    expect(buildAppHref('', '/dashboard')).toBe('/dashboard');
  });
});

describe('the support session reported by /me', () => {
  it('normalizes supportSession and answers null when it is absent', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ email: 'x', supportSession: SUPPORT_SESSION }))
      .mockResolvedValueOnce(jsonResponse({ email: 'x', supportSession: null }));

    expect(await fetchSupportSession()).toEqual(SUPPORT_SESSION);
    expect(await fetchSupportSession()).toBeNull();
    expect(globalThis.fetch.mock.calls[0][0]).toMatch(new RegExp(`${ACCOUNT_ENDPOINT}$`));
  });

  it('rejects when /me cannot be read, so the caller keeps the mode it has', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({}, { status: 500 }));
    await expect(fetchSupportSession()).rejects.toThrow();
  });

  it('forgets the persisted marker when /me answers 401, and still rejects', async () => {
    localStorage.setItem(SUPPORT_SESSION_STORAGE_KEY, JSON.stringify(SUPPORT_SESSION));
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({}, { status: 401 }));
    await expect(fetchSupportSession()).rejects.toThrow();
    expect(localStorage.getItem(SUPPORT_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('drops malformed values', () => {
    expect(normalizeSupportSession(null)).toBeNull();
    expect(normalizeSupportSession([])).toBeNull();
    expect(normalizeSupportSession({ clientId: 7, clientName: '', expiresAt: 'x' }))
      .toEqual({ clientId: null, clientName: null, expiresAt: 'x' });
  });

  it('persists a confirmed session and forgets it when /me says there is none', () => {
    applySupportSessionFromServer(SUPPORT_SESSION, { storage: localStorage });
    expect(getSupportSessionState()).toEqual({ status: 'support', session: SUPPORT_SESSION });
    expect(JSON.parse(localStorage.getItem(SUPPORT_SESSION_STORAGE_KEY))).toEqual(SUPPORT_SESSION);

    applySupportSessionFromServer(null, { storage: localStorage });
    expect(getSupportSessionState()).toEqual({ status: 'none', session: null });
    expect(localStorage.getItem(SUPPORT_SESSION_STORAGE_KEY)).toBeNull();
  });
});

describe('product analytics follow the support mode', () => {
  it('are suppressed while in support mode and released when /me confirms there is none', () => {
    expect(isAnalyticsSuppressed()).toBe(false);

    bootSupportSession({ location: fakeLocation('/support-access', '#t=abc123'), history: fakeHistory(), storage: localStorage, now: NOW });
    expect(isAnalyticsSuppressed()).toBe(true);

    applySupportSessionFromServer(SUPPORT_SESSION, { storage: localStorage });
    expect(isAnalyticsSuppressed()).toBe(true);

    applySupportSessionFromServer(null, { storage: localStorage });
    expect(isAnalyticsSuppressed()).toBe(false);
  });
});

describe('what a support session must not see', () => {
  const MENU = [
    { group: 'First Steps', items: [{ name: 'first-steps', capability: 'isOwner' }] },
    {
      group: 'Settings',
      items: [
        { name: 'user', windowId: '108' },
        { name: 'roles', capability: 'isAdminOrClientAdmin' },
        { name: 'api-keys', capability: 'isAdminOrClientAdmin' },
        { name: 'oauth2-clients' },
      ],
    },
  ];

  it('drops owner-only entries and the routes that mint long-lived credentials', () => {
    const groups = hideSupportRestrictedMenuItems(MENU);
    expect(groups[0].items).toEqual([]);
    expect(groups[1].items.map((item) => item.name)).toEqual(['user', 'roles']);
  });

  it('restricts account, billing and credential routes, with or without a leading slash', () => {
    for (const route of ['account', '/upgrade', 'api-keys', 'oauth2-clients']) {
      expect(isSupportRestrictedRoute(route)).toBe(true);
    }
    expect(isSupportRestrictedRoute('dashboard')).toBe(false);
    expect(isSupportRestrictedRoute('roles')).toBe(false);
  });

  it('never reports a support session as the owner', () => {
    const payload = { windowAccess: {}, capabilities: { isOwner: true, isAdminOrClientAdmin: true } };

    expect(withSupportModeCapabilities(payload)).toBe(payload);

    applySupportSessionFromServer(SUPPORT_SESSION, { storage: localStorage });
    expect(withSupportModeCapabilities(payload).capabilities)
      .toEqual({ isOwner: false, isAdminOrClientAdmin: true });
  });
});

describe('formatSupportExpiry', () => {
  it('formats the instant as a local time and refuses what is not one', () => {
    expect(formatSupportExpiry(SUPPORT_SESSION.expiresAt, 'es_ES')).toMatch(/^\d{2}:\d{2}$/);
    expect(formatSupportExpiry('not a date', 'es_ES')).toBeNull();
    expect(formatSupportExpiry(null)).toBeNull();
  });
});
