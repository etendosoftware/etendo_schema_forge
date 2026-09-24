import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const navigateMock = vi.fn();
const assignMock = vi.fn();

vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('@/i18n', () => ({
  // Keys pass through untranslated. The two catalog price keys append their interpolated values,
  // so a test can still assert on a formatted amount (`formatCurrency`'s output) without depending
  // on the English copy around it; the billing-offer price renders as "amount / interval".
  useUI: () => (key, options) => {
    if (key === 'upgradePlanProductivePrice' && options) return `${options.amount} / ${options.interval}`;
    if (options && (key === 'upgradePlanPriceMonthly' || key === 'upgradePlanPriceYearly')) {
      return `${key} ${Object.values(options).join(' ')}`;
    }
    return key;
  },
  getStoredLocale: () => 'es_ES',
}));
// ETP-4576 — UpgradePage reaches useEnvironmentSwitch, which now proves the account with
// `isAuthenticated` off the auth context rather than a token it can read. Nothing here renders
// an AuthProvider, so the context is mocked instead of wrapping every case.
// Both accessors, same session: useEnvironmentSwitch reads the optional one (ETP-5216 mounts
// its callers in trees with no provider), and a mock that declares only the strict one makes
// every render of this page throw before it can assert anything.
// `clientId` is the session's current environment — what useEnvironmentSwitch exposes as
// `currentClientId` and UpgradePage matches against the environment list to prefill the
// tenant name (ETP-5443). Reset to null in beforeEach; a case sets it to name the environment
// the browser is inside.
const UPGRADE_SESSION = { isAuthenticated: true, csrfToken: null, session: null, clientId: null };
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuth: () => UPGRADE_SESSION,
  useAuthOptional: () => UPGRADE_SESSION,
}));

vi.mock('@/auth/api.js', () => ({
  authHeaders: (t) => ({ 'Accept-Language': 'es_ES', ...(t ? { Authorization: `Bearer ${t}` } : {}) }),
  buildHeaders: (t) => ({ 'Content-Type': 'application/json', 'Accept-Language': 'es_ES', ...(t ? { Authorization: `Bearer ${t}` } : {}) }), detectBaseUrl: () => 'http://tomcat.example/etendo' }));

vi.mock('@/lib/observability.js', () => ({
  track: vi.fn(),
}));

import {
  TEST_BEARER_TOKEN,
  TEST_CSRF_TOKEN,
  declareBearerSession,
  declareCookieSession,
  expectNoAuthorizationHeader,
} from '@/test/sessionContract.js';
import UpgradePage from '../UpgradePage.jsx';
import { ENVIRONMENT_LIST_REFRESH_EVENT } from '../../hooks/useEnvironmentSwitch.js';
import enUs from '@/locales/en_US.json';
import esEs from '@/locales/es_ES.json';
import esAr from '@/locales/es_AR.json';
import { formatCurrency } from '@/lib/formatCurrency.js';
// `track` is imported (not just `vi.mock`ed above) so `trackedEvents` below can
// read `.mock.calls` off the same singleton — see OnboardingPage.vitest.jsx /
// health-events.vitest.js for the identical pattern elsewhere in this repo.
// `DECLINE_CARD_NUMBER` from the deleted `lib/upgrade/mockPayment.js` is gone:
// Stripe's hosted page owns card entry now, there is no local decline constant.
import { track } from '@/lib/observability.js';

/**
 * ETP-4576 — a LEGACY key, seeded on purpose and expected to change nothing.
 *
 * `getCheckoutToken()`/`getPlatformToken()` used to read it and hand the value to
 * `buildAuthHeaders`, which puts whatever it receives into `X-Go-CSRF`. `purgeLegacyAuthStorage`
 * deletes the key, so the value was always null and both checkout POSTs went out with no proof of
 * intent — refused by the backend, while the environments GET beside them kept working because the
 * browser attaches the session cookie by itself. Both readers are gone; the seed stays so the
 * cases below can assert that a stale entry left over from an older release makes no difference
 * either way.
 */
const PLATFORM_TOKEN_KEY = 'sf_platform_token';
const EXISTING_TENANT = 'Acme Trial';
/** Client id of the environment the session is inside, matched against the environments list. */
const CURRENT_CLIENT_ID = 'CURRENT-CLIENT';

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

/**
 * The v1 catalog: one flat monthly subscription. Shaped exactly like GET /sws/go/plans answers —
 * note there is no `providerPriceID`, and the server never sends one.
 */
const PRODUCTIVE_PLAN = {
  planKey: 'productive-monthly',
  name: 'Productive',
  description: 'A second tenant for real work',
  displayPrice: '49.00',
  currency: 'EUR',
  billingInterval: 'month',
};

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

/**
 * Client id the default onboarding stream reports for the environment it created. `installFetch`
 * lists that environment once the onboarding POST has run, the way the account projection does
 * after a real provisioning — UpgradePage only presents success once the exact id is listed.
 */
const PROVISIONED_CLIENT_ID = 'PROVISIONED-CLIENT';

function successStream({ success = true, clientName = 'Acme Productive', clientId = PROVISIONED_CLIENT_ID } = {}) {
  const lines = [];
  for (const step of PROVISIONING_STEPS) {
    lines.push({ type: 'progress', step, status: 'in_progress' });
    lines.push({ type: 'progress', step, status: 'done', ms: 10 });
  }
  lines.push({ type: 'result', success, clientName, ...(clientId ? { clientId } : {}) });
  return ndjsonResponse(lines);
}

/**
 * Routes fetch by endpoint. `statuses` feeds sequential responses to
 * `/checkout/sessions/:requestId` polling (a string is wrapped as
 * `{ status }`; a function is called directly, so a test can also make a
 * poll attempt reject/error). `onboarding` feeds the NDJSON stream behind
 * `/sws/go/onboarding`, defaulting to a successful run.
 */
function installFetch({ environments = [], purchases = [], purchaseDataTransfer,
  purchaseDataTransferEnabled, purchaseProjection, checkoutError, checkout = {}, statuses = ['paid'], onboarding,
  offer = { code: 'productive-tenant', amountMinor: 4900, currency: 'EUR', interval: 'month' },
  sessionEnvironment, plans = [PRODUCTIVE_PLAN] } = {}) {
  const requests = [];
  let statusCallIndex = 0;
  let onboardingRan = false;
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const target = String(url);
    if (target.includes('/sws/go/environments')) {
      if (typeof environments === 'function') return environments();
      // A static list gains the default stream's environment once provisioning ran. It has no
      // `adminUserId`, so entering it still fails unless a case supplies its own environment.
      const provisioned = { clientName: 'Acme Productive', clientId: PROVISIONED_CLIENT_ID, plan: 'productive' };
      const listed = onboardingRan && !environments.some(environment => environment.clientId === PROVISIONED_CLIENT_ID)
        ? [...environments, provisioned]
        : environments;
      return jsonResponse({ environments: listed });
    }
    // Entering an environment (useEnvironmentSwitch.switchTo). Opt-in: unmocked, it throws like
    // any other unexpected request and the switch reports failure.
    if (target.includes('/sws/go/session/environment') && sessionEnvironment) {
      return sessionEnvironment(init);
    }
    // The plan catalog (ETP-5046). The checkout endpoint requires a plan key and has no default,
    // so every test that reaches the submit needs this route to answer.
    if (target.includes('/sws/go/plans')) {
      return typeof plans === 'function' ? plans() : jsonResponse({ plans });
    }
    if (target.includes('/sws/go/billing/overview')) {
      return jsonResponse({ canManageBilling: true, purchases });
    }
    if (target.includes('/sws/go/billing/offers')) {
      return jsonResponse(offer);
    }
    if (target.includes('/sws/go/billing/purchases')) {
      if (!init.method) {
        if (typeof purchaseProjection === 'function') return purchaseProjection();
        if (purchaseProjection) return jsonResponse(purchaseProjection);
        return jsonResponse({ purchaseId: 'upgrade-request-1', status: 'PAID', clientName: 'Acme Productive',
          ...(purchaseDataTransfer === undefined ? {} : { dataTransfer: purchaseDataTransfer }),
          ...(purchaseDataTransferEnabled === undefined ? {} : { dataTransferEnabled: purchaseDataTransferEnabled }) });
      }
      // The submit posts here now, so a test that wants the purchase to fail overrides this
      // route. Checked before `requests.push` so a rejected purchase records no request —
      // spreading a function into the success body would silently answer 200 instead.
      if (typeof checkout === 'function') return checkout();
      requests.push({ url, init, body: JSON.parse(init.body || '{}') });
      if (checkoutError) return jsonResponse(checkoutError, { ok: false, status: 409 });
      return jsonResponse({
        requestId: 'upgrade-request-1',
        checkoutUrl: 'https://checkout.stripe.test/session-1',
        ...checkout,
      });
    }
    if (target.includes('/sws/go/onboarding/first-steps')) {
      return jsonResponse({ firstSteps: { seen: false, completed: [] } });
    }
    // Status polling hits `/checkout/sessions/:requestId` — checked before the
    // session-creation route below, since that path is a substring of this one.
    if (target.includes('/sws/go/checkout/sessions/')) {
      const entry = statuses[Math.min(statusCallIndex, statuses.length - 1)];
      statusCallIndex += 1;
      return typeof entry === 'function' ? entry() : jsonResponse({ status: entry });
    }
    if (target.includes('/sws/go/checkout/sessions')) {
      // A function lets a test fail THIS route specifically. Sequencing responses with
      // mockImplementationOnce cannot: mount now fires two lookups (environments and the plan
      // catalog) whose order is not guaranteed.
      if (typeof checkout === 'function') return checkout();
      requests.push({ url, init, body: JSON.parse(init.body || '{}') });
      return jsonResponse({
        requestId: 'upgrade-request-1',
        checkoutUrl: 'https://checkout.stripe.test/session-1',
        ...checkout,
      });
    }
    if (target.includes('/sws/go/onboarding')) {
      onboardingRan = true;
      return onboarding ? onboarding() : successStream();
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  return requests;
}

/** A paid checkout status for a purchase whose persisted source is a demo environment. */
function paidFromDemo() {
  return jsonResponse({ status: 'paid', demoClientId: 'TRIAL-1' });
}

/**
 * Headers of the first recorded request whose URL contains `fragment`, keys lowercased.
 *
 * Read off `globalThis.fetch.mock.calls` rather than the `requests` array `installFetch` returns,
 * because that one only records the checkout-creation route — and the proof has to be asserted on
 * the onboarding POST too, which is the other write in this flow.
 */
function headersFor(fragment) {
  const call = globalThis.fetch.mock.calls.find(([url]) => String(url).includes(fragment));
  expect(call, `no request matched ${fragment}`).toBeTruthy();
  return headersOf(call[1]);
}

/** A request's headers with the keys lowercased, so a case change cannot pass an assertion. */
function headersOf(init) {
  return Object.fromEntries(
    Object.entries(init?.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
}

/**
 * The checkout write. `develop` moved it off `/sws/go/checkout/sessions` onto the
 * provider-neutral billing boundary (`createBillingPurchase`, lib/upgrade/api.js), so the proof
 * has to be asserted there — the old path is still mocked by `installFetch`, and asserting on it
 * would silently assert nothing.
 *
 * Matched on the exact URL AND the method, not a fragment: `/sws/go/billing/purchases/<id>` is a
 * READ on the same prefix, and a fragment match that drifted onto it would look green while the
 * write went out bare.
 */
const CHECKOUT_POST_URL = '/sws/go/billing/purchases';

function checkoutPostCall() {
  const call = globalThis.fetch.mock.calls.find(
    ([url, init]) => String(url) === CHECKOUT_POST_URL && init?.method === 'POST',
  );
  expect(call, `no POST matched ${CHECKOUT_POST_URL}`).toBeTruthy();
  return call;
}

/** The properties of every tracked event carrying this name, in order. */
function trackedEvents(name) {
  return track.mock.calls
    .filter(([eventName]) => eventName === name)
    .map(([, properties]) => properties);
}

function findLocaleMessage(locale, key) {
  if (!locale || typeof locale !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(locale, key)) return locale[key];
  for (const value of Object.values(locale)) {
    const match = findLocaleMessage(value, key);
    if (match !== undefined) return match;
  }
  return undefined;
}

/**
 * Simulates the browser coming back from Stripe's hosted checkout page: a
 * `?checkout=success|cancelled&requestId=...` URL plus the sessionStorage keys
 * `runUpgrade` writes right before the redirect. Must run BEFORE
 * `renderUpgradePage()` — the resume effect only reads `window.location.search`
 * and sessionStorage once, at mount.
 */
function setupCheckoutReturn({
  checkoutStatus = 'success',
  requestId = 'upgrade-request-1',
  tenantName = 'Acme Productive',
  upgradeAction = 'create-productive',
  startedAt = Date.now() - 250,
} = {}) {
  vi.stubGlobal('location', {
    ...globalThis.location,
    search: `?checkout=${checkoutStatus}&requestId=${requestId}`,
    assign: assignMock,
  });
  if (tenantName) sessionStorage.setItem(PENDING_CHECKOUT_NAME, tenantName);
  sessionStorage.setItem(PENDING_CHECKOUT_ACTION, upgradeAction);
  sessionStorage.setItem(PENDING_CHECKOUT_STARTED_AT, String(startedAt));
}

/** Renders and waits for the environments lookup to settle. */
async function renderUpgradePage({ advanceCheckout = true, advanceAddons = true } = {}) {
  render(<UpgradePage />);
  await waitFor(() => expect(screen.queryByTestId('upgrade-account-loading')).not.toBeInTheDocument());
  // The plan catalog settles independently of the environments lookup, and the submit stays
  // disabled until it does — there is no plan key to send before then.
  await waitFor(() => expect(screen.queryByTestId('upgrade-plans-loading')).not.toBeInTheDocument());
  if (advanceCheckout && screen.queryByTestId('upgrade-plan-continue')) {
    screen.getByTestId('upgrade-plan-continue').click();
    // The step change re-renders after the click returns, so the add-ons step has to be awaited
    // rather than queried synchronously — a synchronous miss would skip it and never reach payment.
    await waitFor(() => expect(screen.getByTestId('upgrade-addons-continue')).toBeInTheDocument());
    if (advanceAddons) {
      screen.getByTestId('upgrade-addons-continue').click();
      await waitFor(() => expect(screen.getByTestId('upgrade-submit')).toBeInTheDocument());
    }
  }
}

/**
 * `formatCurrency` separates amount and symbol with a non-breaking space, while
 * `toHaveTextContent` collapses the element's whitespace to plain spaces but not the expected
 * string's, so an expected amount has to be normalized the same way before comparing.
 */
function displayed(text) {
  return text.replace(/\s+/g, ' ');
}

beforeEach(() => {
  vi.clearAllMocks();
  globalThis.localStorage.clear();
  globalThis.localStorage.setItem(PLATFORM_TOKEN_KEY, 'platform-token');
  globalThis.sessionStorage.clear();
  UPGRADE_SESSION.clientId = null;
  // The page mocks AuthContext away, so nothing publishes the session credentials the request
  // builders read — without this the scheme stays on its bearer default and a case asserting the
  // CSRF proof would see only a Content-Type. See src/test/sessionContract.js.
  declareCookieSession();
  vi.stubGlobal('location', { ...globalThis.location, assign: assignMock });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('UpgradePage — hosted checkout', () => {
  it('displays the amount, currency, and interval returned by the billing offer', async () => {
    installFetch({
      environments: [{ clientName: 'Acme Productive', clientId: 'CLIENT-1', plan: 'productive' }],
      // No catalog plan to quote, so the card falls back to the server-owned billing offer.
      plans: [],
      offer: { code: 'productive-tenant', amountMinor: 1000, currency: 'USD', interval: 'year' },
    });
    await renderUpgradePage({ advanceCheckout: false });

    const expectedAmount = formatCurrency('USD', 10);
    const planCard = screen.getByTestId('upgrade-plan-productive');
    expect(planCard).toHaveTextContent(displayed(`${expectedAmount} / upgradeBillingIntervalYear`));
    expect(planCard).not.toHaveTextContent('upgradeCheckoutMonth');
    expect(planCard).not.toHaveTextContent('49');
  });

  it('uses Stripe whole-unit amounts for zero-decimal currencies and ISK compatibility amounts', async () => {
    installFetch({
      environments: [{ clientName: 'Acme Productive', clientId: 'CLIENT-1', plan: 'productive' }],
      // No catalog plan to quote, so the card falls back to the server-owned billing offer.
      plans: [],
      offer: { code: 'productive-tenant', amountMinor: 1234, currency: 'JPY', interval: 'month' },
    });
    await renderUpgradePage({ advanceCheckout: false });

    expect(screen.getByTestId('upgrade-plan-productive'))
      .toHaveTextContent(displayed(`${formatCurrency('JPY', 1234, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / upgradeBillingIntervalMonth`));
  });

  it('displays Stripe ISK compatibility amounts in whole units', async () => {
    installFetch({
      environments: [{ clientName: 'Acme Productive', clientId: 'CLIENT-1', plan: 'productive' }],
      // No catalog plan to quote, so the card falls back to the server-owned billing offer.
      plans: [],
      offer: { code: 'productive-tenant', amountMinor: 123400, currency: 'ISK', interval: 'month' },
    });
    await renderUpgradePage({ advanceCheckout: false });

    expect(screen.getByTestId('upgrade-plan-productive'))
      .toHaveTextContent(displayed(`${formatCurrency('ISK', 1234, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / upgradeBillingIntervalMonth`));
    expect(screen.getByTestId('upgrade-plan-productive')).not.toHaveTextContent('12,34');
  });

  it('displays Stripe UGX compatibility amounts in whole units', async () => {
    installFetch({
      environments: [{ clientName: 'Acme Productive', clientId: 'CLIENT-1', plan: 'productive' }],
      // No catalog plan to quote, so the card falls back to the server-owned billing offer.
      plans: [],
      offer: { code: 'productive-tenant', amountMinor: 123400, currency: 'UGX', interval: 'month' },
    });
    await renderUpgradePage({ advanceCheckout: false });

    expect(screen.getByTestId('upgrade-plan-productive'))
      .toHaveTextContent(displayed(`${formatCurrency('UGX', 1234, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / upgradeBillingIntervalMonth`));
  });

  it('preserves two-decimal HUF charge amounts', async () => {
    installFetch({
      environments: [{ clientName: 'Acme Productive', clientId: 'CLIENT-1', plan: 'productive' }],
      // No catalog plan to quote, so the card falls back to the server-owned billing offer.
      plans: [],
      offer: { code: 'productive-tenant', amountMinor: 1234, currency: 'HUF', interval: 'month' },
    });
    await renderUpgradePage({ advanceCheckout: false });
    expect(screen.getByTestId('upgrade-plan-productive'))
      .toHaveTextContent(displayed(`${formatCurrency('HUF', 12.34)} / upgradeBillingIntervalMonth`));
  });

  it('preserves two-decimal TWD charge amounts', async () => {
    installFetch({
      environments: [{ clientName: 'Acme Productive', clientId: 'CLIENT-1', plan: 'productive' }],
      // No catalog plan to quote, so the card falls back to the server-owned billing offer.
      plans: [],
      offer: { code: 'productive-tenant', amountMinor: 1234, currency: 'TWD', interval: 'month' },
    });
    await renderUpgradePage({ advanceCheckout: false });

    expect(screen.getByTestId('upgrade-plan-productive'))
      .toHaveTextContent(displayed(`${formatCurrency('TWD', 12.34)} / upgradeBillingIntervalMonth`));
  });

  it('does not show a numeric fallback when the billing offer is unavailable', async () => {
    installFetch({
      environments: [{ clientName: 'Acme Productive', clientId: 'CLIENT-1', plan: 'productive' }],
      // No catalog plan to quote, so the card falls back to the server-owned billing offer.
      plans: [],
      offer: null,
    });
    await renderUpgradePage({ advanceCheckout: false });

    const planCard = screen.getByTestId('upgrade-plan-productive');
    expect(planCard).toHaveTextContent('upgradePlanProductivePriceUnavailable');
    expect(planCard).not.toHaveTextContent('49');
  });

  it('uses customer-facing retry and payment copy in every supported locale', () => {
    const locales = [enUs, esEs, esAr];
    for (const locale of locales) {
      const customerMessages = [
        findLocaleMessage(locale, 'upgradeBillingOverviewBody'),
        findLocaleMessage(locale, 'upgradePurchaseAlreadyExists'),
        findLocaleMessage(locale, 'upgradePurchaseResumeHelp'),
        findLocaleMessage(locale, 'upgradePurchaseReadyHelp'),
      ];
      expect(customerMessages.every(message => typeof message === 'string')).toBe(true);
      expect(customerMessages.join(' ')).not.toMatch(/\btenant\b/i);
      expect(customerMessages[0]).toMatch(/resume|reanudar/i);
      expect(customerMessages[2]).toMatch(/charged again|sin volver a pagar|no se te volverá a cobrar|cobrar de nuevo|cobrar otra vez/i);
      expect(customerMessages[3]).toMatch(/company selector|selector de empresa/i);
    }
  });

  it('renders no raw card fields', async () => {
    installFetch({ environments: [{ clientName: 'Acme Trial' }] });
    await renderUpgradePage();

    // The tenant-name field is always rendered and editable now (ETP-5443) — there is no
    // separate read-only "from demo" box anymore.
    expect(await screen.findByTestId('upgrade-tenant-name-input')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-cardholder')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-card-number')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-expiry')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-cvc')).not.toBeInTheDocument();
  });

  it('creates a hosted session and redirects without card or mock-token fields', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: 'Acme Trial' }] });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith('https://checkout.stripe.test/session-1'));
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/sws/go/billing/purchases');
    expect(requests[0].body).toEqual({
      action: 'productive-tenant',
      clientName: 'Acme Trial',
      upgradeAction: 'create-productive',
      // The key the catalog handed over — never a literal written in this page, and never a price.
      planKey: 'productive-monthly',
      language: 'es_ES',
    });
    expect(JSON.stringify(requests[0].body)).not.toMatch(/card|paymentToken|mock-paid|priceId|amount/i);
  });

  it('uses the demo environment as the productive environment source', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: 'Acme Trial' }] });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalled());
    expect(requests[0].body.clientName).toBe('Acme Trial');
  });

  it('keeps the first tenant on the free onboarding flow', async () => {
    installFetch({ environments: [] });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-first-tenant-free')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-checkout')).not.toBeInTheDocument();
  });

  it('surfaces a checkout creation failure without redirecting', async () => {
    const user = userEvent.setup();
    const requests = installFetch({
      environments: [{ clientName: 'Acme Trial' }],
      checkout: () => jsonResponse({ message: 'Stripe unavailable' }, { ok: false, status: 503 }),
    });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-error')).toHaveTextContent('upgradeCheckoutCreationFailed');
    expect(assignMock).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });
});

/**
 * The plan catalog (ETP-5046). The checkout endpoint REQUIRES a plan key and has no default, so
 * the page cannot complete a purchase without asking the server what is for sale. These specs pin
 * the three catalog shapes and, above all, that the page never invents a key.
 */
describe('UpgradePage — plan catalog', () => {
  const SECOND_PLAN = {
    planKey: 'productive-yearly',
    name: 'Productive annual',
    description: 'Twelve months up front',
    displayPrice: '490.00',
    currency: 'EUR',
    billingInterval: 'year',
  };

  it('selects the only purchasable plan and shows what is being bought', async () => {
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-plan-single')).toHaveTextContent('Productive');
    // Formatted through the canonical formatCurrency (es-ES separators, EUR symbol on the
    // right), never a hand-rolled toFixed/Intl call.
    expect(screen.getByTestId('upgrade-plan-single-price')).toHaveTextContent('49,00');
    expect(screen.queryByTestId('upgrade-plan-choice')).not.toBeInTheDocument();
  });

  it('sends the catalog key and no price when there is a single plan', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    // ETP-5396 made the tenant name read-only on this step: it is taken from the demo
    // environment rather than typed, so the fixture above supplies it.
    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body.planKey).toBe('productive-monthly');
    expect(JSON.stringify(requests[0].body)).not.toMatch(/price/i);
  });

  it('requires a choice when the catalog offers more than one plan', async () => {
    const user = userEvent.setup();
    const requests = installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      plans: [PRODUCTIVE_PLAN, SECOND_PLAN],
    });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-plan-choice')).toBeInTheDocument();
    // ETP-5396 made the tenant name read-only on this step: it is taken from the demo
    // environment rather than typed, so the fixture above supplies it.
    await user.click(screen.getByTestId('upgrade-submit'));

    // No default is picked for the user: the server has none either, and choosing on their
    // behalf would charge them for something they did not select.
    expect(await screen.findByTestId('upgrade-error')).toHaveTextContent('upgradePlanRequired');
    expect(requests).toHaveLength(0);

    await user.click(screen.getByTestId('upgrade-plan-option-productive-yearly'));
    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body.planKey).toBe('productive-yearly');
  });

  it('blocks checkout when nothing is purchasable', async () => {
    installFetch({ environments: [{ clientName: EXISTING_TENANT }], plans: [] });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-plans-unavailable')).toHaveTextContent('upgradePlansEmpty');
    expect(screen.getByTestId('upgrade-submit')).toBeDisabled();
  });

  it('blocks checkout and offers a retry when the catalog cannot be read', async () => {
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      plans: () => jsonResponse({ message: 'boom' }, { ok: false, status: 503 }),
    });
    await renderUpgradePage();

    // Never a hardcoded fallback key: the unreviewed-purchase failure mode this design forbids
    // is exactly what a guess here would reintroduce.
    expect(screen.getByTestId('upgrade-plans-unavailable'))
      .toHaveTextContent('upgradePlansUnavailable');
    expect(screen.getByTestId('upgrade-submit')).toBeDisabled();
    expect(screen.getByTestId('upgrade-plans-retry')).toBeInTheDocument();
  });

  it('recovers the catalog when the retry succeeds', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      plans: () => {
        attempt += 1;
        return attempt === 1
          ? jsonResponse({ message: 'boom' }, { ok: false, status: 503 })
          : jsonResponse({ plans: [PRODUCTIVE_PLAN] });
      },
    });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-plans-retry'));

    expect(await screen.findByTestId('upgrade-plan-single')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-submit')).toBeEnabled();
  });
});

/**
 * ETP-4576 — what the checkout requests CARRY, which is what actually broke.
 *
 * Every assertion above this block is about the body and the screen, and all of them passed while
 * paying for a tenant was impossible: the POST reached the right URL with the right payload and
 * the backend refused it, because `getCheckoutToken()` read `sf_auth_token`/`sf_platform_token` —
 * keys the migration purges — and fed the null it got to `buildAuthHeaders`, which puts its
 * argument into `X-Go-CSRF`. The GET beside it kept working the whole time, since the browser
 * attaches the session cookie itself and a read needs no proof, so nothing on screen said a word.
 *
 * Both schemes are driven, because the preference promises ONE switch and TWO working schemes: a
 * call site that hardcodes one scheme's header sends nothing under the other, and only a suite
 * that runs it twice can see that.
 *
 * What `develop` changed underneath, and what it did NOT change: the write moved to
 * `/sws/go/billing/purchases`, and the tenant name is an always-visible input prefilled from the
 * current or demo environment (ETP-5443). Neither touches what this block is about, which is what the
 * requests CARRY.
 */
describe('UpgradePage — what the checkout requests carry (ETP-4576)', () => {
  /**
   * Drives the flow to the point where the checkout write has gone out.
   *
   * This uses a productive origin, whose target-name field starts blank. Type a distinct target
   * explicitly so the header assertions exercise a valid new-environment purchase.
   */
  async function submitCheckout() {
    const user = userEvent.setup();
    installFetch({ environments: [{ clientName: 'Current Productive', clientId: 'CURRENT-PRODUCTIVE', plan: 'productive' }] });
    UPGRADE_SESSION.clientId = 'CURRENT-PRODUCTIVE';
    await renderUpgradePage();
    const nameInput = screen.getByTestId('upgrade-tenant-name-input');
    expect(nameInput).toHaveValue('');
    await user.type(nameInput, 'Checkout Target');
    await user.click(screen.getByTestId('upgrade-submit'));
    await waitFor(() => expect(assignMock).toHaveBeenCalled());
  }

  it('sends the write proof on the checkout POST under the cookie scheme', async () => {
    await submitCheckout();

    expect(headersOf(checkoutPostCall()[1])['x-go-csrf']).toBe(TEST_CSRF_TOKEN);
    // Not just on this one: no request in the whole flow may carry a bearer token.
    expectNoAuthorizationHeader();
  });

  it('lets the session cookie travel on the checkout POST', async () => {
    await submitCheckout();

    const [, init] = checkoutPostCall();
    // Absent, this is only broken cross-origin — which is the dev setup (:3100 -> :8080) and any
    // split-origin deploy, i.e. exactly where it is hardest to notice.
    expect(init.credentials).toBe('include');
  });

  it('leaves the environments GET without a proof, as a read needs none', async () => {
    await submitCheckout();

    expect(headersFor('/sws/go/environments')['x-go-csrf']).toBeUndefined();
  });

  it('sends the write proof on the onboarding POST after the Stripe redirect', async () => {
    // The second of the two writes, and the one that actually provisions the tenant: a proof
    // missing here means the user has paid and gets nothing.
    setupCheckoutReturn({ tenantName: 'Acme Productive' });
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      statuses: ['paid'],
      onboarding: () => successStream(),
    });
    await renderUpgradePage();
    await screen.findByTestId('upgrade-success');

    expect(headersFor('/sws/go/onboarding')['x-go-csrf']).toBe(TEST_CSRF_TOKEN);
    // …and the status poll beside it is a read, so it carries none.
    expect(headersFor('/sws/go/checkout/sessions/')['x-go-csrf']).toBeUndefined();
  });

  it('sends the bearer token, and the proof too, under the bearer scheme', async () => {
    // The scheme the app runs on while the CSRF preference is off. The proof travels there as
    // well, deliberately: the browser attaches a same-origin session cookie whatever the client
    // believes it is doing, and the backend validates CSRF the moment it sees one on a write.
    declareBearerSession();
    await submitCheckout();

    const headers = headersOf(checkoutPostCall()[1]);
    expect(headers.authorization).toBe(`Bearer ${TEST_BEARER_TOKEN}`);
    expect(headers['x-go-csrf']).toBe(TEST_CSRF_TOKEN);
  });

  it('takes its credential from the scheme, never from the legacy storage key', async () => {
    // The stale entry `beforeEach` seeds must reach no header of any request in the flow. That it
    // makes no difference either way is covered by the two "no token is held" cases above, which
    // remove the key and assert the same outcomes.
    await submitCheckout();

    for (const [, init] of globalThis.fetch.mock.calls) {
      expect(JSON.stringify(init?.headers ?? {})).not.toContain('platform-token');
    }
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

  // ETP-4576 — there is no "no platform token" branch left: under the cookie scheme no client
  // holds one, so reporting the page as unavailable on that basis hid the upgrade from every
  // authenticated user. The lookup runs and the branch follows what the backend answers.
  it('reports the checkout branch even when no token is held', async () => {
    globalThis.localStorage.removeItem(PLATFORM_TOKEN_KEY);
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await waitFor(() => expect(trackedEvents('upgrade_page_viewed')).toEqual([{ branch: 'checkout' }]));
  });

  it('tracks leaving for free onboarding instead of the checkout', async () => {
    const user = userEvent.setup();
    installFetch({ environments: [] });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-first-tenant-free-continue'));

    expect(trackedEvents('upgrade_first_tenant_free_continued')).toEqual([{}]);
    expect(navigateMock).toHaveBeenCalledWith('/onboarding');
  });

  it('uses the demo name as the target without asking for a second tenant name', async () => {
    const user = userEvent.setup();
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalled());
    expect(trackedEvents('upgrade_checkout_submitted')).toEqual([{ upgradeAction: 'create-productive' }]);
  });

  // ETP-4576 — an absent local token is no longer "session expired": under the cookie scheme
  // no client holds one, so that check refused the submission for every authenticated user.
  // Whether the session is still valid is the backend's answer (401), not a local guess, so
  // what this now pins down is that the submission is no longer blocked before it is sent.
  it('submits even when no token is held locally', async () => {
    const user = userEvent.setup();
    globalThis.localStorage.removeItem(PLATFORM_TOKEN_KEY);
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(trackedEvents('upgrade_checkout_submitted')).not.toEqual([]));
    expect(trackedEvents('upgrade_session_expired')).toEqual([]);
  });

  it('tracks the submission with the chosen upgrade action, before the redirect', async () => {
    const user = userEvent.setup();
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalledWith('https://checkout.stripe.test/session-1'));
    expect(trackedEvents('upgrade_checkout_submitted')).toEqual([{ upgradeAction: 'create-productive' }]);
  });

  it('never fires the payment-declined event on a normal submission — Stripe owns card entry now', async () => {
    const user = userEvent.setup();
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalled());
    expect(trackedEvents('upgrade_payment_declined')).toEqual([]);
  });

  it('tracks a checkout-session creation failure without a duration, since provisioning never started', async () => {
    const user = userEvent.setup();
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      checkout: () => jsonResponse({ message: 'Stripe unavailable' }, { ok: false, status: 503 }),
    });
    await renderUpgradePage();

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

  it('resolves the created environment from the purchase when the onboarding stream omits clientId', async () => {
    setupCheckoutReturn({ tenantName: 'Acme Productive', upgradeAction: 'create-productive' });
    let environmentReads = 0;
    installFetch({
      environments: () => jsonResponse({ environments: environmentReads++ === 0
        ? [{ clientName: EXISTING_TENANT, clientId: 'TRIAL-1', plan: 'demo' }]
        : [{ clientName: 'Acme Productive', clientId: 'FROM-PURCHASE', plan: 'productive' }] }),
      statuses: ['paid'],
      purchaseProjection: { purchaseId: 'upgrade-request-1', createdClientId: 'FROM-PURCHASE' },
      onboarding: () => successStream({ clientId: '' }),
    });

    await renderUpgradePage();
    await screen.findByTestId('upgrade-success');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/go/billing/purchases/upgrade-request-1', expect.objectContaining({ headers: expect.any(Object) })
    );
    expect(environmentReads).toBeGreaterThan(1);
  });

  it('waits for a PROVISIONED purchase to sync, then lets the user retry environment discovery', async () => {
    const user = userEvent.setup();
    let environmentReads = 0;
    installFetch({
      environments: () => jsonResponse({ environments: environmentReads++ <= 5
        ? [{ clientName: EXISTING_TENANT, clientId: 'TRIAL-1', plan: 'demo' }]
        : [{ clientName: 'Ready Environment', clientId: 'READY-CLIENT', plan: 'productive' }] }),
      checkoutError: { purchaseId: 'purchase-provisioning', status: 'PROVISIONED',
        clientName: 'Ready Environment' },
      purchaseProjection: { purchaseId: 'purchase-provisioning', status: 'PROVISIONED',
        clientName: 'Ready Environment', createdClientId: 'READY-CLIENT' },
    });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-submit'));
    await screen.findByTestId('upgrade-environment-sync-pending');
    expect(globalThis.fetch.mock.calls.some(([url]) => String(url)
      .includes('/sws/go/billing/purchases/purchase-provisioning')),
    JSON.stringify(globalThis.fetch.mock.calls.map(([url, init]) => [String(url), init?.method]))).toBe(true);

    await user.click(screen.getByTestId('upgrade-environment-sync-retry'));
    await screen.findByTestId('upgrade-success');
    expect(globalThis.fetch.mock.calls.some(([url, init]) => String(url) === '/sws/go/onboarding'
      && init?.method === 'POST')).toBe(false);
  });

  it('recovers the environment name from the durable purchase when session storage is empty', async () => {
    setupCheckoutReturn({ tenantName: '' });
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      statuses: ['paid'],
      onboarding: () => successStream(),
    });
    await renderUpgradePage();

    await screen.findByTestId('upgrade-success');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/go/billing/purchases/upgrade-request-1',
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it('recovers the transfer choice from the purchase when browser storage is empty', async () => {
    setupCheckoutReturn({ tenantName: '' });
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      purchaseDataTransfer: { products: false, contacts: true },
      statuses: [paidFromDemo],
      onboarding: () => successStream(),
    });
    await renderUpgradePage();

    await screen.findByTestId('upgrade-success');
    const call = globalThis.fetch.mock.calls.find(([url, init]) =>
      String(url) === '/sws/go/onboarding' && init?.method === 'POST');
    expect(call).toBeTruthy();
    expect(JSON.parse(call[1].body).dataTransfer).toEqual({ products: false, contacts: true });
  });

  it('does not invent a transfer choice when neither purchase nor browser stores one', async () => {
    setupCheckoutReturn({ tenantName: '' });
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      purchaseDataTransferEnabled: false,
      statuses: ['paid'],
      onboarding: () => successStream(),
    });
    await renderUpgradePage();

    await screen.findByTestId('upgrade-success');
    const call = globalThis.fetch.mock.calls.find(([url, init]) =>
      String(url) === '/sws/go/onboarding' && init?.method === 'POST');
    expect(call).toBeTruthy();
    expect(JSON.parse(call[1].body)).not.toHaveProperty('dataTransfer');
  });

  it('uses the purchase choice over a stale browser choice, including explicit all-false', async () => {
    setupCheckoutReturn({ tenantName: 'Stale Browser Name' });
    sessionStorage.setItem('sf_pending_checkout_data_transfer',
      JSON.stringify({ products: true, contacts: true }));
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      purchaseDataTransfer: { products: false, contacts: false },
      statuses: [paidFromDemo],
      onboarding: () => successStream(),
    });
    await renderUpgradePage();

    await screen.findByTestId('upgrade-success');
    const call = globalThis.fetch.mock.calls.find(([url, init]) =>
      String(url) === '/sws/go/onboarding' && init?.method === 'POST');
    expect(call).toBeTruthy();
    expect(JSON.parse(call[1].body).dataTransfer).toEqual({ products: false, contacts: false });
  });

  it('preserves an explicit browser choice for an older flag-off purchase', async () => {
    setupCheckoutReturn({ tenantName: '' });
    sessionStorage.setItem('sf_pending_checkout_data_transfer',
      JSON.stringify({ products: true, contacts: false }));
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      purchaseDataTransferEnabled: false,
      statuses: [paidFromDemo],
      onboarding: () => successStream(),
    });
    await renderUpgradePage();

    await screen.findByTestId('upgrade-success');
    const call = globalThis.fetch.mock.calls.find(([url, init]) =>
      String(url) === '/sws/go/onboarding' && init?.method === 'POST');
    expect(JSON.parse(call[1].body).dataTransfer).toEqual({ products: true, contacts: false });
  });

  it('provisions a legacy flag-on purchase without a recorded selection and shows a warning', async () => {
    setupCheckoutReturn({ tenantName: '' });
    sessionStorage.setItem('sf_pending_checkout_data_transfer',
      JSON.stringify({ products: true, contacts: true }));
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      purchaseDataTransferEnabled: true,
      statuses: [paidFromDemo],
    });
    await renderUpgradePage();

    await screen.findByTestId('upgrade-success');
    expect(screen.getByTestId('upgrade-transfer-selection-warning'))
      .toHaveTextContent('upgradeDataTransferSelectionMissing');
    const call = globalThis.fetch.mock.calls.find(([url, init]) =>
      String(url) === '/sws/go/onboarding' && init?.method === 'POST');
    expect(call).toBeTruthy();
    expect(JSON.parse(call[1].body)).not.toHaveProperty('dataTransfer');
  });

  it('lets activity resume finish without transfer when the recorded selection is missing', async () => {
    const user = userEvent.setup();
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      purchases: [{ purchaseId: 'purchase-1', status: 'PAID', clientName: 'Acme Productive',
        demoClientId: 'TRIAL-1', dataTransferEnabled: true }],
    });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-resume-purchase-purchase-1'));

    await screen.findByTestId('upgrade-success');
    expect(screen.getByTestId('upgrade-transfer-selection-warning'))
      .toHaveTextContent('upgradeDataTransferSelectionMissing');
    const call = globalThis.fetch.mock.calls.find(([url, init]) =>
      String(url) === '/sws/go/onboarding' && init?.method === 'POST');
    expect(call).toBeTruthy();
    expect(JSON.parse(call[1].body)).not.toHaveProperty('dataTransfer');
  });

  it('resumes a paid purchase from billing activity without starting checkout', async () => {
    const user = userEvent.setup();
    const requests = installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      purchases: [{ purchaseId: 'purchase-1', status: 'PAID', clientName: 'Acme Productive' }],
      onboarding: () => successStream(),
    });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-resume-purchase-purchase-1'));
    await screen.findByTestId('upgrade-success');
    expect(requests).toHaveLength(0);
    expect(globalThis.fetch.mock.calls.filter(([url, init]) => (
      String(url) === CHECKOUT_POST_URL && init?.method === 'POST'
    ))).toHaveLength(0);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/go/onboarding', expect.objectContaining({ method: 'POST' })
    );
  });

  it('offers recovery for a purchase stalled in provisioning', async () => {
    const user = userEvent.setup();
    const requests = installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      purchases: [{ purchaseId: 'purchase-stalled', status: 'PROVISIONING', clientName: 'Acme Productive' }],
      onboarding: () => successStream(),
    });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-resume-purchase-purchase-stalled'));
    await screen.findByTestId('upgrade-success');
    expect(requests).toHaveLength(0);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/sws/go/onboarding', expect.objectContaining({ method: 'POST' })
    );
  });

  it('shows only paid purchases in billing activity and keeps the matching recovery actions', async () => {
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      purchases: [
        { purchaseId: 'creating', status: 'CREATING', clientName: 'Checkout Started' },
        { purchaseId: 'created', status: 'CREATED', clientName: 'Awaiting Payment' },
        { purchaseId: 'paid', status: 'PAID', clientName: 'Payment Confirmed' },
        { purchaseId: 'provisioning', status: 'PROVISIONING', clientName: 'Setup In Progress' },
        { purchaseId: 'provisioned', status: 'PROVISIONED', clientName: 'Ready Environment' },
        { purchaseId: 'unknown', status: 'UNRECOGNIZED', clientName: 'Unknown State' },
      ],
    });
    await renderUpgradePage();

    const overview = screen.getByTestId('upgrade-billing-overview');
    expect(overview).toHaveTextContent('Payment Confirmed');
    expect(overview).toHaveTextContent('Setup In Progress');
    expect(overview).toHaveTextContent('Ready Environment');
    expect(overview).not.toHaveTextContent('Checkout Started');
    expect(overview).not.toHaveTextContent('Awaiting Payment');
    expect(overview).not.toHaveTextContent('Unknown State');
    expect(overview).toHaveTextContent('upgradePurchaseStatusPaid');
    expect(overview).toHaveTextContent('upgradePurchaseStatusProvisioning');
    expect(overview).toHaveTextContent('upgradePurchaseStatusProvisioned');
    expect(screen.getByTestId('upgrade-resume-purchase-paid')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-resume-purchase-provisioning')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-resume-purchase-provisioned')).not.toBeInTheDocument();
    expect(overview).toHaveTextContent('upgradePurchaseResumeHelp');
    expect(overview).toHaveTextContent('upgradePurchaseReadyHelp');
  });

  it('keeps checkout available when billing activity contains only unpaid attempts', async () => {
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      purchases: [
        { purchaseId: 'creating', status: 'CREATING', clientName: 'Checkout Started' },
        { purchaseId: 'created', status: 'CREATED', clientName: 'Awaiting Payment' },
      ],
    });
    await renderUpgradePage();

    expect(screen.queryByTestId('upgrade-billing-overview')).not.toBeInTheDocument();
    expect(screen.getByTestId('upgrade-submit')).toBeInTheDocument();
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

    await user.click(screen.getByTestId('upgrade-enter-productive'));

    await screen.findByTestId('upgrade-enter-error');
    expect(trackedEvents('upgrade_enter_tenant_failed')).toEqual([{}]);
  });
});

/**
 * Regression coverage for the empty-`clientName` bug: there is no name input on
 * this page — `handleSubmit` computes a fallback from the demo environment and
 * calls `setForm` (async), but `runUpgrade` closes over the render's own `form`
 * variable, so a `clientName: ''` request can reach the backend (400 "clientName
 * is required") even though a resolvable name was available. See the current
 * `handleSubmit`/`runUpgrade` split in UpgradePage.jsx.
 */
describe('UpgradePage — clientName resolution on submit (upgrade clientName bug)', () => {
  it('prefills the tenant-name input with the demo environment name and sends it unedited', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    // The field is always rendered now (ETP-5443) — prefilled from the demo since the session
    // names no current environment in this test.
    expect(screen.getByTestId('upgrade-tenant-name-input')).toHaveValue(EXISTING_TENANT);

    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalled());
    expect(requests).toHaveLength(1);
    expect(requests[0].body.clientName).toBe(EXISTING_TENANT);
    expect(sessionStorage.getItem(PENDING_CHECKOUT_NAME)).toBe(EXISTING_TENANT);
  });

  it('never calls createBillingPurchase and surfaces a tenant-name error when no name can be resolved', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: 'Acme Productive', plan: 'productive' }] });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-tenant-name-error')).toHaveTextContent('upgradeTenantNameRequired');
    expect(requests).toHaveLength(0);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('renders the editable tenant-name field when the account owns no demo environment', async () => {
    installFetch({ environments: [{ clientName: 'Acme Productive', plan: 'productive' }] });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-tenant-name-input')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-tenant-name-input-label')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-tenant-from-demo')).not.toBeInTheDocument();
  });

  it('sends the typed tenant name as clientName when there is no demo to fall back on', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: 'Acme Productive', plan: 'productive' }] });
    await renderUpgradePage();

    await user.type(screen.getByTestId('upgrade-tenant-name-input'), 'Acme Second Co');
    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalled());
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({
      action: 'productive-tenant',
      clientName: 'Acme Second Co',
      upgradeAction: 'create-productive',
      planKey: 'productive-monthly',
      language: 'es_ES',
    });
    expect(sessionStorage.getItem(PENDING_CHECKOUT_NAME)).toBe('Acme Second Co');
  });
});

/**
 * The tenant-name field is always visible and required, and prefilled from the environment the
 * session is currently inside (its `clientId`, matched against the environments list — never the
 * legacy `sf_auth_client_name` key, which the cookie session purges) ahead of the
 * demo-environment fallback. Submitting a name that matches an
 * owned PRODUCTIVE environment is a collision — the backend would resume that tenant instead of
 * creating a new one — and is blocked client-side with a distinct "taken" error. A match against
 * a demo environment's name is explicitly allowed: that is the demo-to-productive conversion
 * path (ETP-5443).
 */
describe('UpgradePage — current-environment prefill and taken-name guard (ETP-5443)', () => {
  it('leaves the target name blank when the current environment is productive', async () => {
    UPGRADE_SESSION.clientId = CURRENT_CLIENT_ID;
    installFetch({ environments: [
      { clientName: 'Acme Demo', clientId: 'DEMO-CLIENT', plan: 'demo' },
      { clientName: 'My Current Env', clientId: CURRENT_CLIENT_ID, plan: 'productive' },
    ] });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-tenant-name-input')).toHaveValue('');
  });

  it('prefills from the demo when the current environment IS the demo, and submits it without error', async () => {
    const user = userEvent.setup();
    UPGRADE_SESSION.clientId = CURRENT_CLIENT_ID;
    const requests = installFetch({ environments: [
      { clientName: EXISTING_TENANT, clientId: CURRENT_CLIENT_ID, plan: 'demo' },
    ] });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-tenant-name-input')).toHaveValue(EXISTING_TENANT);

    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalled());
    expect(requests).toHaveLength(1);
    expect(requests[0].body.clientName).toBe(EXISTING_TENANT);
    expect(screen.queryByTestId('upgrade-tenant-name-taken')).not.toBeInTheDocument();
  });

  it('blocks submission with a "taken" error, case-insensitively, when the name matches an owned productive environment', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: 'Acme Productive', plan: 'productive' }] });
    await renderUpgradePage();

    // Deliberately different casing from the environment's stored clientName above, to prove
    // the collision check normalizes case rather than doing an exact match.
    await user.type(screen.getByTestId('upgrade-tenant-name-input'), 'ACME PRODUCTIVE');

    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-tenant-name-taken')).toHaveTextContent('upgradeTenantNameTaken');
    expect(screen.queryByTestId('upgrade-tenant-name-error')).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);
    expect(assignMock).not.toHaveBeenCalled();
  });

  it('sends an edited, non-colliding name and clears a prior required-name error as soon as the field changes', async () => {
    const user = userEvent.setup();
    // No current environment and no demo, so the field starts empty and the first submit hits
    // the required-name error before the user types anything.
    const requests = installFetch({ environments: [{ clientName: 'Acme Productive', plan: 'productive' }] });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-submit'));
    expect(await screen.findByTestId('upgrade-tenant-name-error')).toBeInTheDocument();

    await user.type(screen.getByTestId('upgrade-tenant-name-input'), 'Acme New Co');
    expect(screen.queryByTestId('upgrade-tenant-name-error')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalled());
    expect(requests).toHaveLength(1);
    expect(requests[0].body.clientName).toBe('Acme New Co');
  });

  it('shows a required-name error and sends no request when the field is cleared to whitespace', async () => {
    const user = userEvent.setup();
    UPGRADE_SESSION.clientId = CURRENT_CLIENT_ID;
    const requests = installFetch({ environments: [
      { clientName: 'Acme Productive', clientId: CURRENT_CLIENT_ID, plan: 'productive' },
    ] });
    await renderUpgradePage();

    await user.clear(screen.getByTestId('upgrade-tenant-name-input'));
    await user.type(screen.getByTestId('upgrade-tenant-name-input'), '   ');
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-tenant-name-error')).toHaveTextContent('upgradeTenantNameRequired');
    expect(requests).toHaveLength(0);
    expect(assignMock).not.toHaveBeenCalled();
  });
});

describe('UpgradePage — provisioning environment synchronization (ETP-5443)', () => {
  it('requires the user to choose a demo source when starting from a demo with multiple demos', async () => {
    const user = userEvent.setup();
    UPGRADE_SESSION.clientId = 'CURRENT-DEMO';
    const requests = installFetch({ environments: [
      { clientName: 'Current Demo', clientId: 'CURRENT-DEMO', plan: 'demo' },
      { clientName: 'Beta Trial', clientId: 'TRIAL-2', plan: 'demo' },
    ] });
    await renderUpgradePage({ advanceAddons: false });

    expect(screen.getByTestId('upgrade-data-transfer-products')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-data-transfer-contacts')).toBeInTheDocument();

    await user.click(screen.getByTestId('upgrade-addons-continue'));
    await waitFor(() => expect(screen.getByTestId('upgrade-submit')).toBeInTheDocument());

    const sourceSelect = screen.getByTestId('upgrade-source-demo-select');
    expect(sourceSelect).toHaveValue('CURRENT-DEMO');
    await user.selectOptions(sourceSelect, 'TRIAL-2');
    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalled());
    expect(requests[0].body.demoClientId).toBe('TRIAL-2');
  });

  it('preserves demo transfer choices and tenant name through direct stepper navigation', async () => {
    const user = userEvent.setup();
    UPGRADE_SESSION.clientId = 'CURRENT-DEMO';
    const requests = installFetch({ environments: [
      { clientName: 'Current Demo', clientId: 'CURRENT-DEMO', plan: 'demo' },
    ] });
    await renderUpgradePage({ advanceCheckout: false });

    const planStep = () => screen.getByTestId('upgrade-checkout-step-plan');
    const addonsStep = () => screen.getByTestId('upgrade-checkout-step-addons');
    const paymentStep = () => screen.getByTestId('upgrade-checkout-step-payment');
    expect(planStep()).toBeEnabled();
    expect(addonsStep()).toBeDisabled();
    expect(paymentStep()).toBeDisabled();
    expect(planStep()).toHaveAttribute('aria-current', 'step');

    await user.click(screen.getByTestId('upgrade-plan-continue'));
    // Both transfers default to checked; clearing one gives the stepper a non-default choice to keep.
    expect(screen.getByTestId('upgrade-data-transfer-products')).toBeChecked();
    expect(screen.getByTestId('upgrade-data-transfer-contacts')).toBeChecked();
    await user.click(screen.getByTestId('upgrade-data-transfer-contacts'));
    expect(paymentStep()).toBeDisabled();
    await user.click(planStep());

    expect(screen.getByTestId('upgrade-plan-continue')).toBeInTheDocument();
    await user.click(addonsStep());
    expect(addonsStep()).toHaveAttribute('aria-current', 'step');
    expect(screen.getByTestId('upgrade-data-transfer-products')).toBeChecked();
    expect(screen.getByTestId('upgrade-data-transfer-contacts')).not.toBeChecked();

    await user.click(screen.getByTestId('upgrade-addons-continue'));
    expect(paymentStep()).toBeEnabled();
    await user.click(paymentStep());
    const nameInput = await screen.findByTestId('upgrade-tenant-name-input');
    await user.clear(nameInput);
    await user.type(nameInput, 'Acme Productive');
    await user.click(addonsStep());

    expect(screen.getByTestId('upgrade-data-transfer-products')).toBeChecked();
    expect(screen.getByTestId('upgrade-data-transfer-contacts')).not.toBeChecked();
    await user.click(paymentStep());
    expect(screen.getByTestId('upgrade-tenant-name-input')).toHaveValue('Acme Productive');
    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalled());
    expect(requests).toHaveLength(1);
    expect(requests[0].body.clientName).toBe('Acme Productive');
    expect(requests[0].body.dataTransfer).toEqual({ products: true, contacts: false });
  });

  it('keeps the add-ons step for a productive origin and explains that transfer is unavailable', async () => {
    const user = userEvent.setup();
    UPGRADE_SESSION.clientId = 'CURRENT-PRODUCTIVE';
    const requests = installFetch({ environments: [
      { clientName: 'Current Productive', clientId: 'CURRENT-PRODUCTIVE', plan: 'productive' },
      { clientName: 'Acme Trial', clientId: 'TRIAL-1', plan: 'demo' },
      { clientName: 'Beta Trial', clientId: 'TRIAL-2', plan: 'demo' },
    ] });
    await renderUpgradePage({ advanceAddons: false });

    expect(screen.getByTestId('upgrade-addons-step')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'upgradeCheckoutSteps' }))
      .toHaveTextContent('upgradeCheckoutStepAddons');
    expect(screen.getByTestId('upgrade-data-transfer')).toHaveTextContent('upgradeNoDataTransferTitle');
    expect(screen.getByTestId('upgrade-data-transfer')).toHaveTextContent('upgradeNoDataTransferBody');
    for (const locale of [enUs, esEs, esAr]) {
      expect(findLocaleMessage(locale, 'upgradeNoDataTransferTitle')).toMatch(/\S/);
      expect(findLocaleMessage(locale, 'upgradeNoDataTransferBody')).toMatch(/\S/);
    }
    expect(screen.queryByTestId('upgrade-data-transfer-products')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-data-transfer-contacts')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('upgrade-addons-continue'));
    await waitFor(() => expect(screen.getByTestId('upgrade-submit')).toBeInTheDocument());
    expect(screen.queryByTestId('upgrade-source-demo-field')).not.toBeInTheDocument();
    const nameInput = screen.getByTestId('upgrade-tenant-name-input');
    expect(nameInput).toHaveValue('');
    await user.clear(nameInput);
    await user.type(nameInput, 'Second Productive');
    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalled());
    expect(requests).toHaveLength(1);
    expect(requests[0].body).not.toHaveProperty('demoClientId');
    expect(requests[0].body).not.toHaveProperty('dataTransfer');
    expect(sessionStorage.getItem('sf_pending_checkout_data_transfer')).toBe('{}');
  });

  it('omits demo identity and transfer data after a Stripe return to a productive origin', async () => {
    UPGRADE_SESSION.clientId = 'CURRENT-PRODUCTIVE';
    setupCheckoutReturn({ tenantName: 'New Productive' });
    sessionStorage.setItem('sf_pending_checkout_data_transfer', JSON.stringify({ products: true, contacts: true }));
    const requests = installFetch({
      environments: (() => {
        let reads = 0;
        const beforeProvision = [
          { clientName: 'Current Productive', clientId: 'CURRENT-PRODUCTIVE', plan: 'productive' },
          { clientName: 'Acme Trial', clientId: 'TRIAL-1', plan: 'demo' },
        ];
        return () => jsonResponse({ environments: reads++ === 0 ? beforeProvision : [
          ...beforeProvision,
          { clientName: 'New Productive', clientId: 'CREATED-PRODUCTIVE', plan: 'productive' },
        ] });
      })(),
      purchases: [{ purchaseId: 'upgrade-request-1', status: 'PAID', clientName: 'New Productive' }],
      // The server does not select a demo for purchases created from a productive origin.
      statuses: ['paid'],
      onboarding: () => successStream({ clientId: 'CREATED-PRODUCTIVE' }),
    });

    await renderUpgradePage();
    await screen.findByTestId('upgrade-success');

    const onboardingCall = globalThis.fetch.mock.calls.find(([url]) => String(url).includes('/sws/go/onboarding'));
    expect(onboardingCall).toBeTruthy();
    const body = JSON.parse(onboardingCall[1].body);
    expect(body).not.toHaveProperty('demoClientId');
    expect(body).not.toHaveProperty('dataTransfer');
    expect(requests).toHaveLength(0);
  });

  it('closes a cancelled Stripe return to the dashboard without navigating back to Stripe', async () => {
    setupCheckoutReturn({ checkoutStatus: 'cancelled', tenantName: null });
    sessionStorage.setItem(PENDING_CHECKOUT_NAME, 'Cancelled Target');
    sessionStorage.setItem('sf_pending_checkout_data_transfer', JSON.stringify({ products: true, contacts: true }));
    const user = userEvent.setup();
    installFetch({ environments: [
      { clientName: 'Current Productive', clientId: 'CURRENT-PRODUCTIVE', plan: 'productive' },
    ] });
    UPGRADE_SESSION.clientId = 'CURRENT-PRODUCTIVE';
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    await renderUpgradePage({ advanceCheckout: false });
    await user.click(screen.getByTestId('upgrade-close'));

    expect(navigateMock).toHaveBeenCalledWith('/dashboard', { replace: true });
    expect(navigateMock).not.toHaveBeenCalledWith(-1);
    expect(replaceStateSpy).toHaveBeenCalledWith({}, '', '/upgrade');
    expect(globalThis.fetch.mock.calls.some(([url]) => String(url).includes('/checkout/sessions/'))).toBe(false);
    expect(sessionStorage.getItem(PENDING_CHECKOUT_NAME)).toBeNull();
    expect(sessionStorage.getItem(PENDING_CHECKOUT_ACTION)).toBeNull();
    expect(sessionStorage.getItem(PENDING_CHECKOUT_STARTED_AT)).toBeNull();
    expect(sessionStorage.getItem('sf_pending_checkout_data_transfer')).toBeNull();
  });

  it('treats a session with no current environment as no purchase origin, even beside a listed environment with no id', async () => {
    const user = userEvent.setup();
    UPGRADE_SESSION.clientId = null;
    const requests = installFetch({ environments: [
      { clientName: 'Unidentified Trial', plan: 'demo' },
      { clientName: 'Acme Trial', clientId: 'TRIAL-1', plan: 'demo' },
    ] });
    await renderUpgradePage();

    expect(screen.queryByTestId('upgrade-source-demo-field')).not.toBeInTheDocument();
    await user.type(screen.getByTestId('upgrade-tenant-name-input'), 'New Company');
    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalled());
    expect(screen.queryByTestId('upgrade-demo-selection-required')).not.toBeInTheDocument();
    expect(requests[0].body).not.toHaveProperty('demoClientId');
    expect(requests[0].body).not.toHaveProperty('dataTransfer');
  });

  it('defaults the selected trial to the current environment when that environment is a demo', async () => {
    UPGRADE_SESSION.clientId = 'TRIAL-2';
    installFetch({ environments: [
      { clientName: 'Acme Trial', clientId: 'TRIAL-1', plan: 'demo' },
      { clientName: 'Beta Trial', clientId: 'TRIAL-2', plan: 'demo' },
    ] });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-source-demo-select')).toHaveValue('TRIAL-2');
  });

  it('sends the explicitly selected demo clientId only for a demo-origin purchase', async () => {
    const user = userEvent.setup();
    UPGRADE_SESSION.clientId = 'CURRENT-DEMO';
    const requests = installFetch({ environments: [
      { clientName: 'Current Demo', clientId: 'CURRENT-DEMO', plan: 'demo' },
      { clientName: 'Acme Trial', clientId: 'TRIAL-1', plan: 'demo' },
      { clientName: 'Beta Trial', clientId: 'TRIAL-2', plan: 'demo' },
    ] });
    await renderUpgradePage();
    await user.selectOptions(screen.getByTestId('upgrade-source-demo-select'), 'TRIAL-2');
    await user.click(screen.getByTestId('upgrade-submit'));

    await waitFor(() => expect(assignMock).toHaveBeenCalled());
    expect(requests[0].body).toMatchObject({ demoClientId: 'TRIAL-2' });
  });

  it('carries the selected trial clientId into the paid checkout request', async () => {
    const user = userEvent.setup();
    UPGRADE_SESSION.clientId = 'SELECTED-TRIAL';
    const requests = installFetch({ environments: [
      { clientName: 'Acme Trial', clientId: 'SELECTED-TRIAL', plan: 'demo' },
      { clientName: 'Another Trial', clientId: 'OTHER-TRIAL', plan: 'demo' },
    ] });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-submit'));
    await waitFor(() => expect(assignMock).toHaveBeenCalled());

    expect(requests[0].body).toMatchObject({ demoClientId: 'SELECTED-TRIAL' });
  });

  it('keeps the selected demo ID server-side instead of resending it in the onboarding retry', async () => {
    setupCheckoutReturn({ tenantName: 'Acme Productive' });
    installFetch({
      environments: [{ clientName: 'Acme Trial', clientId: 'SELECTED-TRIAL', plan: 'demo' }],
      statuses: ['paid'],
      onboarding: () => successStream(),
    });

    await renderUpgradePage();
    await screen.findByTestId('upgrade-success');

    const onboardingCall = globalThis.fetch.mock.calls.find(([url]) => String(url).includes('/sws/go/onboarding'));
    expect(onboardingCall).toBeTruthy();
    expect(JSON.parse(onboardingCall[1].body)).not.toHaveProperty('demoClientId');
  });

  it('refreshes the canonical environment list after provisioning before showing success actions', async () => {
    setupCheckoutReturn({ tenantName: 'Acme Productive' });
    const staleTrial = [{ clientName: 'Acme Trial', clientId: 'TRIAL-1', plan: 'demo' }];
    const provisioned = [
      { clientName: 'Acme Productive', clientId: 'OTHER-CLIENT', plan: 'productive' },
      { clientName: 'Acme Productive', clientId: 'CREATED-CLIENT', plan: 'productive' },
    ];
    let environmentReads = 0;
    installFetch({
      environments: () => jsonResponse({ environments: environmentReads++ === 0 ? staleTrial : provisioned }),
      statuses: ['paid'],
      onboarding: () => successStream({ clientId: 'CREATED-CLIENT' }),
    });

    await renderUpgradePage();
    await screen.findByTestId('upgrade-success');

    await waitFor(() => expect(environmentReads).toBe(2));
    expect(globalThis.fetch.mock.calls.filter(([url]) => String(url).includes('/sws/go/environments')))
      .toHaveLength(2);
  });

  it('notifies the company selector after the exact provisioned clientId appears in the canonical list', async () => {
    setupCheckoutReturn({ tenantName: 'Acme Productive' });
    let environmentReads = 0;
    installFetch({
      environments: () => jsonResponse({ environments: environmentReads++ === 0
        ? [{ clientName: 'Acme Trial', clientId: 'TRIAL-1', plan: 'demo' }]
        : [{ clientName: 'Acme Productive', clientId: 'CREATED-CLIENT', plan: 'productive' }] }),
      statuses: ['paid'],
      onboarding: () => successStream({ clientId: 'CREATED-CLIENT' }),
    });
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    await renderUpgradePage();
    await screen.findByTestId('upgrade-success');
    await waitFor(() => expect(environmentReads).toBe(2));

    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: ENVIRONMENT_LIST_REFRESH_EVENT }),
    );
    dispatchSpy.mockRestore();
  });

  it('reconciles the newly provisioned environment by its returned clientId when names collide', async () => {
    setupCheckoutReturn({ tenantName: 'Acme Productive' });
    const environments = [
      { clientName: 'Acme Productive', clientId: 'OTHER-CLIENT', adminUserId: 'OTHER-USER', plan: 'productive' },
      { clientName: 'Acme Productive', clientId: 'CREATED-CLIENT', adminUserId: 'CREATED-USER', plan: 'productive' },
    ];
    const sessionEnvironment = vi.fn(async () => jsonResponse({ status: 'success', roleList: [{ id: 'ADMIN-ROLE' }] }));
    installFetch({
      environments,
      statuses: ['paid'],
      onboarding: () => successStream({ clientId: 'CREATED-CLIENT' }),
      sessionEnvironment,
    });

    await renderUpgradePage();
    await screen.findByTestId('upgrade-success');
    await userEvent.setup().click(screen.getByTestId('upgrade-enter-productive'));

    await waitFor(() => expect(globalThis.localStorage.getItem('sf_last_environment')).toBe('CREATED-CLIENT'));
    // The login went to the created environment's admin, not to the same-named OTHER-CLIENT.
    expect(sessionEnvironment).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionEnvironment.mock.calls[0][0].body).userId).toBe('CREATED-USER');
  });
});

describe('UpgradePage — environment lookup failure (ETP-4985)', () => {
  /** A `/sws/go/environments` rejection shaped like the real 401 from the backend. */
  function unauthorizedEnvironments() {
    return jsonResponse(
      { error: { message: 'Invalid or expired token', status: 401 } },
      { ok: false, status: 401 }
    );
  }

  it('warns that the environment list is missing instead of silently offering only a new tenant', async () => {
    // The environment list is still useful for the account view, but never controls whether the
    // upgrade page offers conversion: productive creation always targets a new environment.
    installFetch({ environments: unauthorizedEnvironments });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-environments-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-target-choice')).not.toBeInTheDocument();
  });

  it('keeps the checkout reachable so a failed lookup never blocks a legitimate upgrade', async () => {
    installFetch({ environments: unauthorizedEnvironments });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-checkout')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-submit')).toBeEnabled();
  });

  it('retries the lookup without exposing a demo conversion option', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    installFetch({
      environments: () => {
        attempt += 1;
        return attempt === 1
          ? unauthorizedEnvironments()
          : jsonResponse({ environments: [{ clientName: EXISTING_TENANT, clientId: 'CLIENT-1' }] });
      },
    });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-environments-retry'));

    await waitFor(() => expect(screen.queryByTestId('upgrade-target-choice')).not.toBeInTheDocument());
    expect(screen.queryByTestId('upgrade-environments-unavailable')).not.toBeInTheDocument();
  });

  it('shows no warning when the lookup succeeds', async () => {
    installFetch({ environments: [{ clientName: EXISTING_TENANT, clientId: 'CLIENT-1' }] });
    await renderUpgradePage();

    expect(screen.queryByTestId('upgrade-environments-unavailable')).not.toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-target-choice')).not.toBeInTheDocument();
  });
});
