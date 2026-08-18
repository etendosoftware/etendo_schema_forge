import { render, screen, waitFor } from '@testing-library/react';
import { configureAuthMock } from '@/test/authContextMock.js';
import userEvent from '@testing-library/user-event';

const navigateMock = vi.fn();
const assignMock = vi.fn();

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

configureAuthMock({ isAuthenticated: true, csrfToken: 'test-csrf', clientId: 'client-1' });


vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('@/i18n', () => ({
  useUI: () => key => key,
  getStoredLocale: () => 'es_ES',
}));
vi.mock('@/auth/api.js', () => ({ detectBaseUrl: () => 'http://tomcat.example/etendo' }));

vi.mock('@/lib/observability.js', () => ({
  track: vi.fn(),
}));

import UpgradePage from '../UpgradePage.jsx';
// `track` is imported (not just `vi.mock`ed above) so `trackedEvents` below can
// read `.mock.calls` off the same singleton — see OnboardingPage.vitest.jsx /
// health-events.vitest.js for the identical pattern elsewhere in this repo.
// `DECLINE_CARD_NUMBER` from the deleted `lib/upgrade/mockPayment.js` is gone:
// Stripe's hosted page owns card entry now, there is no local decline constant.
import { track } from '@/lib/observability.js';

const PLATFORM_TOKEN_KEY = 'sf_platform_token';
const EXISTING_TENANT = 'Acme Trial';

/**
 * Private sessionStorage keys `runUpgrade`/the resume effect in UpgradePage.jsx
 * use to survive the full-page Stripe redirect (PENDING_CHECKOUT_NAME/ACTION/
 * STARTED_AT there). Not exported by the source, so kept here as literals —
 * verified against UpgradePage.jsx directly; keep in sync if they drift.
 */
const PENDING_CHECKOUT_NAME = 'sf_pending_checkout_tenant_name';
const PENDING_CHECKOUT_ACTION = 'sf_pending_checkout_action';
const PENDING_CHECKOUT_STARTED_AT = 'sf_pending_checkout_started_at';

const PROVISIONING_STEPS = ['setup', 'client', 'organization', 'dataset', 'sequences', 'finalize'];

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data };
}

/**
 * A response whose NDJSON body is delivered in several chunks, so the reader is
 * exercised the way a real stream arrives rather than as one tidy blob. Revived
 * from this file's pre-ETP-4800 history (`git log -p --follow`) — same shape
 * `runPaidOnboarding` (lib/upgrade/api.js) still reads today.
 */
function ndjsonResponse(lines, { chunkSize = 40 } = {}) {
  const payload = `${lines.map(line => JSON.stringify(line)).join('\n')}\n`;
  const bytes = new TextEncoder().encode(payload);
  let offset = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (offset >= bytes.length) return { done: true, value: undefined };
          const chunk = bytes.slice(offset, offset + chunkSize);
          offset += chunkSize;
          return { done: false, value: chunk };
        },
      }),
    },
  };
}

function successStream({ success = true, clientName = 'Acme Productive' } = {}) {
  const lines = [];
  for (const step of PROVISIONING_STEPS) {
    lines.push({ type: 'progress', step, status: 'in_progress' });
    lines.push({ type: 'progress', step, status: 'done', ms: 10 });
  }
  lines.push({ type: 'result', success, clientName });
  return ndjsonResponse(lines);
}

/**
 * Routes fetch by endpoint. `statuses` feeds sequential responses to
 * `/checkout/sessions/:requestId` polling (a string is wrapped as
 * `{ status }`; a function is called directly, so a test can also make a
 * poll attempt reject/error). `onboarding` feeds the NDJSON stream behind
 * `/sws/go/onboarding`, defaulting to a successful run.
 */
function installFetch({ environments = [], checkout = {}, statuses = ['paid'], onboarding } = {}) {
  const requests = [];
  let statusCallIndex = 0;
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const target = String(url);
    if (target.includes('/sws/go/environments')) {
      return typeof environments === 'function' ? environments() : jsonResponse({ environments });
    }
    // Status polling hits `/checkout/sessions/:requestId` — checked before the
    // session-creation route below, since that path is a substring of this one.
    if (target.includes('/sws/go/checkout/sessions/')) {
      const entry = statuses[Math.min(statusCallIndex, statuses.length - 1)];
      statusCallIndex += 1;
      return typeof entry === 'function' ? entry() : jsonResponse({ status: entry });
    }
    if (target.includes('/sws/go/checkout/sessions')) {
      requests.push({ url, init, body: JSON.parse(init.body || '{}') });
      return jsonResponse({
        requestId: 'upgrade-request-1',
        checkoutUrl: 'https://checkout.stripe.test/session-1',
        ...checkout,
      });
    }
    if (target.includes('/sws/go/onboarding')) {
      return onboarding ? onboarding() : successStream();
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  return requests;
}

/** The properties of every tracked event carrying this name, in order. */
function trackedEvents(name) {
  return track.mock.calls
    .filter(([eventName]) => eventName === name)
    .map(([, properties]) => properties);
}

/**
 * Simulates the browser coming back from Stripe's hosted checkout page: a
 * `?checkout=success&requestId=...` URL plus the three sessionStorage keys
 * `runUpgrade` writes right before the redirect. Must run BEFORE
 * `renderUpgradePage()` — the resume effect only reads `window.location.search`
 * and sessionStorage once, at mount.
 */
function setupCheckoutReturn({
  requestId = 'upgrade-request-1',
  tenantName = 'Acme Productive',
  upgradeAction = 'create-productive',
  startedAt = Date.now() - 250,
} = {}) {
  vi.stubGlobal('location', {
    ...globalThis.location,
    search: `?checkout=success&requestId=${requestId}`,
    assign: assignMock,
  });
  sessionStorage.setItem(PENDING_CHECKOUT_NAME, tenantName);
  sessionStorage.setItem(PENDING_CHECKOUT_ACTION, upgradeAction);
  sessionStorage.setItem(PENDING_CHECKOUT_STARTED_AT, String(startedAt));
}

/** Renders and waits for the environments lookup to settle. */
async function renderUpgradePage() {
  render(<UpgradePage />);
  await waitFor(() => expect(screen.queryByTestId('upgrade-account-loading')).not.toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.localStorage.clear();
  globalThis.localStorage.setItem(PLATFORM_TOKEN_KEY, 'platform-token');
  globalThis.sessionStorage.clear();
  vi.stubGlobal('location', { ...globalThis.location, assign: assignMock });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UpgradePage — hosted checkout', () => {
  it('renders no raw card fields', async () => {
    installFetch({ environments: [{ clientName: 'Acme Trial' }] });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-tenant-name')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-cardholder')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-card-number')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-expiry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-cvc')).not.toBeInTheDocument();
  });

  it('creates a hosted session and redirects without card or mock-token fields', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: 'Acme Trial' }] });
    await renderUpgradePage();

    await user.type(screen.getByTestId('upgrade-tenant-name'), 'Acme Productive');
    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith('https://checkout.stripe.test/session-1'));
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/sws/go/checkout/sessions');
    expect(requests[0].body).toEqual({
      action: 'productive-tenant',
      clientName: 'Acme Productive',
      upgradeAction: 'create-productive',
      language: 'es_ES',
    });
    expect(JSON.stringify(requests[0].body)).not.toMatch(/card|paymentToken|mock-paid|priceId|amount/i);
  });

  it('rejects an already-owned tenant before creating a checkout session', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: 'Acme Trial' }] });
    await renderUpgradePage();

    await user.type(screen.getByTestId('upgrade-tenant-name'), ' acme trial ');
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-tenant-name-error')).toHaveTextContent('upgradeTenantNameTaken');
    expect(requests).toHaveLength(0);
  });

  it('keeps the first tenant on the free onboarding flow', async () => {
    installFetch({ environments: [] });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-first-tenant-free')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-checkout')).not.toBeInTheDocument();
  });

  it('surfaces a checkout creation failure without redirecting', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: 'Acme Trial' }] });
    globalThis.fetch.mockImplementationOnce(async () => jsonResponse({ environments: [{ clientName: 'Acme Trial' }] }));
    globalThis.fetch.mockImplementationOnce(async () => jsonResponse(
      { message: 'Stripe unavailable' },
      { ok: false, status: 503 }
    ));
    await renderUpgradePage();

    await user.type(screen.getByTestId('upgrade-tenant-name'), 'Acme Productive');
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-error')).toHaveTextContent('upgradeCheckoutCreationFailed');
    expect(assignMock).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });
});

/**
 * Checkout funnel telemetry. Each test drives one funnel step and asserts the
 * event name and properties the analytics side reads, because a renamed event or
 * a dropped property is invisible in the UI and only shows up as a hole in the
 * funnel weeks later.
 */
describe('UpgradePage — checkout funnel tracking', () => {
  it('reports the checkout branch exactly once when the account already owns a tenant', async () => {
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await waitFor(() => expect(trackedEvents('upgrade_page_viewed')).toEqual([{ branch: 'checkout' }]));
  });

  it('reports the free-first-tenant branch for an account with no tenants', async () => {
    installFetch({ environments: [] });
    await renderUpgradePage();

    await waitFor(() => expect(trackedEvents('upgrade_page_viewed'))
      .toEqual([{ branch: 'first_tenant_free' }]));
  });

  it('reports the unavailable branch when the environments lookup fails', async () => {
    installFetch({ environments: () => Promise.reject(new Error('offline')) });
    await renderUpgradePage();

    await waitFor(() => expect(trackedEvents('upgrade_page_viewed')).toEqual([{ branch: 'unavailable' }]));
  });

  it('reports the unavailable branch when there is no platform token to look up with', async () => {
    globalThis.localStorage.removeItem(PLATFORM_TOKEN_KEY);
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await waitFor(() => expect(trackedEvents('upgrade_page_viewed')).toEqual([{ branch: 'unavailable' }]));
  });

  it('tracks leaving for free onboarding instead of the checkout', async () => {
    const user = userEvent.setup();
    installFetch({ environments: [] });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-first-tenant-free-continue'));

    expect(trackedEvents('upgrade_first_tenant_free_continued')).toEqual([{}]);
    expect(navigateMock).toHaveBeenCalledWith('/onboarding');
  });

  it('tracks a tenant name the account already owns, without tracking a submission', async () => {
    const user = userEvent.setup();
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await user.type(screen.getByTestId('upgrade-tenant-name'), EXISTING_TENANT);
    await user.click(screen.getByTestId('upgrade-submit'));

    await screen.findByTestId('upgrade-tenant-name-error');
    expect(trackedEvents('upgrade_existing_tenant_name_blocked')).toEqual([{}]);
    expect(trackedEvents('upgrade_checkout_submitted')).toEqual([]);
  });

  it('tracks an expired session instead of a submission', async () => {
    const user = userEvent.setup();
    globalThis.localStorage.removeItem(PLATFORM_TOKEN_KEY);
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await user.type(screen.getByTestId('upgrade-tenant-name'), 'Acme Productive');
    await user.click(screen.getByTestId('upgrade-submit'));

    await screen.findByTestId('upgrade-error');
    expect(trackedEvents('upgrade_session_expired')).toEqual([{}]);
    expect(trackedEvents('upgrade_checkout_submitted')).toEqual([]);
  });

  it('tracks the submission with the chosen upgrade action, before the redirect', async () => {
    const user = userEvent.setup();
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await user.type(screen.getByTestId('upgrade-tenant-name'), 'Acme Productive');
    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith('https://checkout.stripe.test/session-1'));
    expect(trackedEvents('upgrade_checkout_submitted')).toEqual([{ upgradeAction: 'create-productive' }]);
  });

  it('never fires the payment-declined event on a normal submission — Stripe owns card entry now', async () => {
    const user = userEvent.setup();
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await user.type(screen.getByTestId('upgrade-tenant-name'), 'Acme Productive');
    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalled());
    expect(trackedEvents('upgrade_payment_declined')).toEqual([]);
  });

  it('tracks a checkout-session creation failure without a duration, since provisioning never started', async () => {
    const user = userEvent.setup();
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    globalThis.fetch.mockImplementationOnce(async () => jsonResponse({ environments: [{ clientName: EXISTING_TENANT }] }));
    globalThis.fetch.mockImplementationOnce(async () => jsonResponse(
      { message: 'Stripe unavailable' },
      { ok: false, status: 503 }
    ));
    await renderUpgradePage();

    await user.type(screen.getByTestId('upgrade-tenant-name'), 'Acme Productive');
    await user.click(screen.getByTestId('upgrade-submit'));

    await screen.findByTestId('upgrade-error');
    const [failed] = trackedEvents('upgrade_tenant_provisioning_failed');
    expect(failed).toEqual({ errorCode: 'upgradeCheckoutCreationFailed' });
    // toEqual alone would also pass a `durationMs: undefined` property (Jest/Vitest
    // treat a missing key and an undefined value as equal) — the property must be
    // genuinely absent, per sanitizeEventProperties dropping null/undefined values.
    expect(Object.keys(failed)).not.toContain('durationMs');
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('resumes after the Stripe redirect and reports a successful provisioning with its duration', async () => {
    setupCheckoutReturn({ tenantName: 'Acme Productive', upgradeAction: 'create-productive' });
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      statuses: ['paid'],
      onboarding: () => successStream(),
    });
    await renderUpgradePage();

    await screen.findByTestId('upgrade-success');
    const [succeeded] = trackedEvents('upgrade_tenant_provisioning_succeeded');
    expect(succeeded).toEqual({ upgradeAction: 'create-productive', durationMs: expect.any(Number) });
    expect(succeeded.durationMs).toBeGreaterThanOrEqual(0);
    expect(trackedEvents('upgrade_tenant_provisioning_failed')).toEqual([]);
  });

  it('resumes after the Stripe redirect and reports a failed onboarding stream', async () => {
    setupCheckoutReturn({ tenantName: 'Acme Productive' });
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      statuses: ['paid'],
      // The stream completed but its own result says the provisioning failed.
      onboarding: () => successStream({ success: false }),
    });
    await renderUpgradePage();

    await screen.findByTestId('upgrade-error');
    const [failed] = trackedEvents('upgrade_tenant_provisioning_failed');
    expect(failed.errorCode).toBe('upgradeCheckoutCreationFailed');
    expect(failed.durationMs).toEqual(expect.any(Number));
    expect(failed.durationMs).toBeGreaterThanOrEqual(0);
    expect(trackedEvents('upgrade_tenant_provisioning_succeeded')).toEqual([]);
  });

  it('resumes after the Stripe redirect and reports a failed status lookup as generic', async () => {
    setupCheckoutReturn({ tenantName: 'Acme Productive' });
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      // A transport failure while polling carries no application error code.
      statuses: [() => { throw new Error('network down'); }],
    });
    await renderUpgradePage();

    await screen.findByTestId('upgrade-error');
    expect(trackedEvents('upgrade_tenant_provisioning_failed')).toEqual([
      { errorCode: 'generic', durationMs: expect.any(Number) },
    ]);
  });

  it('tracks a tenant that was provisioned but cannot be entered', async () => {
    const user = userEvent.setup();
    setupCheckoutReturn({ tenantName: 'Acme Productive' });
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      statuses: ['paid'],
      onboarding: () => successStream(),
    });
    await renderUpgradePage();
    await screen.findByTestId('upgrade-success');

    await user.click(screen.getByTestId('upgrade-success-continue'));

    await screen.findByTestId('upgrade-enter-error');
    expect(trackedEvents('upgrade_enter_tenant_failed')).toEqual([{}]);
  });
});
