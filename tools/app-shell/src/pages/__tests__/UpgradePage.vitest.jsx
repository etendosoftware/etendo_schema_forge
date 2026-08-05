import { render, screen, waitFor } from '@testing-library/react';
import { configureAuthMock } from '@/test/authContextMock.js';
import userEvent from '@testing-library/user-event';

/**
 * Upgrade page — mock checkout and provisioning (ETP-4686).
 *
 * The mock payment and API modules are exercised for real; only the boundaries
 * are stubbed (fetch, router, i18n, base URL). That keeps the checkout rules
 * this page depends on — declined card, token shape, 402 paywall — under test
 * where they are actually enforced.
 */

const navigateMock = vi.fn();

vi.mock('@/auth/AuthContext.jsx', async () =>
  (await import('@/test/authContextMock.js')).authContextMock);

configureAuthMock({ isAuthenticated: true, csrfToken: 'test-csrf', clientId: 'client-1' });

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  getStoredLocale: () => 'es_ES',
}));

vi.mock('@/auth/api.js', () => ({
  detectBaseUrl: () => '',
}));

import UpgradePage from '../UpgradePage.jsx';
import { DECLINE_CARD_NUMBER } from '@/lib/upgrade/mockPayment.js';

const PLATFORM_TOKEN_KEY = 'sf_platform_token';
const GOOD_CARD = '4242424242424242';
/** Well past today; a card is valid through the last day of its expiry month. */
const FUTURE_EXPIRY = '12/30';
const EXISTING_TENANT = 'Acme Trial';

const PROVISIONING_STEPS = ['setup', 'client', 'organization', 'dataset', 'sequences', 'finalize'];

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data };
}

/**
 * A response whose NDJSON body is delivered in several chunks, so the reader is
 * exercised the way a real stream arrives rather than as one tidy blob.
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

function successStream({ success = true } = {}) {
  const lines = [];
  for (const step of PROVISIONING_STEPS) {
    lines.push({ type: 'progress', step, status: 'in_progress' });
    lines.push({ type: 'progress', step, status: 'done', ms: 10 });
  }
  lines.push({ type: 'result', success, clientName: 'Acme Productive' });
  return ndjsonResponse(lines);
}

/**
 * Routes fetch by endpoint and records every onboarding request body, so a test
 * can assert what was sent — and that nothing was sent at all.
 */
function installFetch({ environments = [], onboarding = () => successStream() } = {}) {
  const onboardingRequests = [];
  globalThis.fetch = vi.fn(async (url, init = {}) => {
    const target = String(url);
    if (target.includes('/sws/go/environments')) {
      return typeof environments === 'function'
        ? environments()
        : jsonResponse({ environments });
    }
    if (target.includes('/sws/go/onboarding')) {
      onboardingRequests.push(JSON.parse(init.body || '{}'));
      return onboarding();
    }
    throw new Error(`unexpected fetch: ${target}`);
  });
  return onboardingRequests;
}

async function fillCheckout(user, { tenantName, cardNumber = GOOD_CARD }) {
  await user.type(screen.getByTestId('upgrade-tenant-name'), tenantName);
  await user.type(screen.getByTestId('upgrade-cardholder'), 'Ada Lovelace');
  await user.type(screen.getByTestId('upgrade-card-number'), cardNumber);
  await user.type(screen.getByTestId('upgrade-expiry'), FUTURE_EXPIRY);
  await user.type(screen.getByTestId('upgrade-cvc'), '123');
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
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UpgradePage — plan comparison', () => {
  it('always compares both plans, before asking for any payment detail', async () => {
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-plan-free')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-plan-productive')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-checkout')).toBeInTheDocument();
  });

  it('shows a loading state while the account is still being looked up', () => {
    installFetch({ environments: () => new Promise(() => {}) });
    render(<UpgradePage />);
    expect(screen.getByTestId('upgrade-account-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-checkout')).not.toBeInTheDocument();
  });
});

describe('UpgradePage — GATE 4: the declined test card', () => {
  it('fails client-side and never reaches the backend', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await fillCheckout(user, { tenantName: 'Acme Productive', cardNumber: DECLINE_CARD_NUMBER });
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-error')).toHaveTextContent('upgradePaymentDeclined');
    // The point of the decline card is to exercise the error path without a
    // request, so the checkout stays put and nothing was posted.
    expect(screen.getByTestId('upgrade-checkout')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-progress')).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });
});

describe('UpgradePage — GATE 5: the backend 402 paywall', () => {
  it('reports a payment error and keeps the user on the checkout', async () => {
    const user = userEvent.setup();
    const requests = installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      onboarding: () => jsonResponse(
        { error: 'payment_required', message: 'Payment is required' },
        { ok: false, status: 402 }
      ),
    });
    await renderUpgradePage();

    await fillCheckout(user, { tenantName: 'Acme Productive' });
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-error')).toHaveTextContent('upgradePaymentRequired');
    expect(screen.getByTestId('upgrade-checkout')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-success')).not.toBeInTheDocument();
    // The request was made — this path is the backend refusing, not the client.
    expect(requests).toHaveLength(1);
  });

  it('reports a generic error for any other failing status', async () => {
    const user = userEvent.setup();
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      onboarding: () => jsonResponse({ error: { message: 'boom' } }, { ok: false, status: 500 }),
    });
    await renderUpgradePage();

    await fillCheckout(user, { tenantName: 'Acme Productive' });
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-error')).toHaveTextContent('upgradeGenericError');
  });

  it('reports a stream error when the response carries no readable body', async () => {
    const user = userEvent.setup();
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      onboarding: () => ({ ok: true, status: 200 }),
    });
    await renderUpgradePage();

    await fillCheckout(user, { tenantName: 'Acme Productive' });
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-error')).toHaveTextContent('upgradeStreamUnavailable');
  });
});

describe('UpgradePage — successful provisioning', () => {
  it('streams progress, shows success and posts a well-formed payment token', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await fillCheckout(user, { tenantName: 'Acme Productive' });
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-success')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-checkout')).not.toBeInTheDocument();

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      clientName: 'Acme Productive',
      currency: 'EUR',
      countryCode: 'ES',
      language: 'es_ES',
    });
    // Lowercase hex is the shape the backend accepts.
    expect(requests[0].paymentToken).toMatch(/^mock-paid-[0-9a-f]+$/);
  });

  it('sends the platform token, not the ERP session token', async () => {
    const user = userEvent.setup();
    globalThis.localStorage.setItem('sf_auth_token', 'erp-session-token');
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await fillCheckout(user, { tenantName: 'Acme Productive' });
    await user.click(screen.getByTestId('upgrade-submit'));
    await screen.findByTestId('upgrade-success');

    const onboardingCall = globalThis.fetch.mock.calls.find(([url]) => String(url).includes('/onboarding'));
    expect(JSON.stringify(onboardingCall[1].headers)).toContain('platform-token');
    expect(JSON.stringify(onboardingCall[1].headers)).not.toContain('erp-session-token');
  });

  it('surfaces an error when the new environment cannot be entered', async () => {
    const user = userEvent.setup();
    // The environments list never grows to include the new tenant, which is what
    // a provisioning that reported success but did not register looks like.
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await fillCheckout(user, { tenantName: 'Acme Productive' });
    await user.click(screen.getByTestId('upgrade-submit'));
    await screen.findByTestId('upgrade-success');

    await user.click(screen.getByTestId('upgrade-success-continue'));
    // Signing out is offered as the recovery, not performed silently.
    await screen.findByTestId('upgrade-enter-error');
    expect(navigateMock).not.toHaveBeenCalledWith('/logout');
  });

  it('falls back to the form when the stream reports failure', async () => {
    const user = userEvent.setup();
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      onboarding: () => successStream({ success: false }),
    });
    await renderUpgradePage();

    await fillCheckout(user, { tenantName: 'Acme Productive' });
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-error')).toHaveTextContent('upgradeGenericError');
    expect(screen.getByTestId('upgrade-checkout')).toBeInTheDocument();
  });

  it('reports a missing result when the stream ends without one', async () => {
    const user = userEvent.setup();
    installFetch({
      environments: [{ clientName: EXISTING_TENANT }],
      onboarding: () => ndjsonResponse([{ type: 'progress', step: 'setup', status: 'done' }]),
    });
    await renderUpgradePage();

    await fillCheckout(user, { tenantName: 'Acme Productive' });
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-error')).toHaveTextContent('upgradeMissingResult');
  });
});

describe('UpgradePage — checkout validation', () => {
  it('rejects a tenant name the account already owns, before paying', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await fillCheckout(user, { tenantName: EXISTING_TENANT });
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-tenant-name-error'))
      .toHaveTextContent('upgradeTenantNameTaken');
    expect(requests).toHaveLength(0);
  });

  it('matches an owned name regardless of case and surrounding spaces', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await fillCheckout(user, { tenantName: '  acme trial  ' });
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-tenant-name-error')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('flags every invalid field at once and posts nothing', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-tenant-name-error')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-cardholder-error')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-card-number-error')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-expiry-error')).toBeInTheDocument();
    expect(screen.getByTestId('upgrade-cvc-error')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('tells an expired card apart from an unreadable one', async () => {
    const user = userEvent.setup();
    const requests = installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await fillCheckout(user, { tenantName: 'Acme Productive' });
    // A real but past date is a different user problem from a malformed one,
    // and the page must say which.
    await user.clear(screen.getByTestId('upgrade-expiry'));
    await user.type(screen.getByTestId('upgrade-expiry'), '01/20');
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-expiry-error')).toHaveTextContent('upgradeExpiryPast');
    expect(requests).toHaveLength(0);
  });

  it('rejects a month outside 1-12 as unreadable', async () => {
    const user = userEvent.setup();
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await fillCheckout(user, { tenantName: 'Acme Productive' });
    await user.clear(screen.getByTestId('upgrade-expiry'));
    await user.type(screen.getByTestId('upgrade-expiry'), '13/30');
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-expiry-error')).toHaveTextContent('upgradeExpiryInvalid');
  });

  it('still mints a token where crypto.getRandomValues is unavailable', async () => {
    const user = userEvent.setup();
    // Non-secure contexts and older embedded webviews expose no crypto API.
    vi.stubGlobal('crypto', {});
    const requests = installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await fillCheckout(user, { tenantName: 'Acme Productive' });
    await user.click(screen.getByTestId('upgrade-submit'));
    await screen.findByTestId('upgrade-success');

    expect(requests[0].paymentToken).toMatch(/^mock-paid-[0-9a-f]+$/);
    vi.unstubAllGlobals();
  });

  it('clears a field error as soon as the user edits that field', async () => {
    const user = userEvent.setup();
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-submit'));
    expect(await screen.findByTestId('upgrade-tenant-name-error')).toBeInTheDocument();

    await user.type(screen.getByTestId('upgrade-tenant-name'), 'A');
    expect(screen.queryByTestId('upgrade-tenant-name-error')).not.toBeInTheDocument();
  });

  it('groups the typed card number in blocks of four', async () => {
    const user = userEvent.setup();
    installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await user.type(screen.getByTestId('upgrade-card-number'), GOOD_CARD);
    expect(screen.getByTestId('upgrade-card-number')).toHaveValue('4242 4242 4242 4242');
  });
});

describe('UpgradePage — an account with no tenants yet', () => {
  it('offers free onboarding instead of a checkout', async () => {
    installFetch({ environments: [] });
    await renderUpgradePage();

    expect(screen.getByTestId('upgrade-first-tenant-free')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-checkout')).not.toBeInTheDocument();
  });

  it('sends the user to onboarding', async () => {
    const user = userEvent.setup();
    installFetch({ environments: [] });
    await renderUpgradePage();

    await user.click(screen.getByTestId('upgrade-first-tenant-free-continue'));
    expect(navigateMock).toHaveBeenCalledWith('/onboarding');
  });
});

describe('UpgradePage — when the account lookup cannot answer', () => {
  it('shows the checkout anyway when the environments call fails', async () => {
    installFetch({ environments: () => Promise.reject(new Error('offline')) });
    await renderUpgradePage();

    // The backend is authoritative, so a failed lookup must not block a
    // legitimate upgrade.
    expect(screen.getByTestId('upgrade-checkout')).toBeInTheDocument();
    expect(screen.queryByTestId('upgrade-first-tenant-free')).not.toBeInTheDocument();
  });

  it('shows the checkout but refuses to submit without a platform token', async () => {
    const user = userEvent.setup();
    globalThis.localStorage.removeItem(PLATFORM_TOKEN_KEY);
    const requests = installFetch({ environments: [{ clientName: EXISTING_TENANT }] });
    await renderUpgradePage();

    await fillCheckout(user, { tenantName: 'Acme Productive' });
    await user.click(screen.getByTestId('upgrade-submit'));

    expect(await screen.findByTestId('upgrade-error')).toHaveTextContent('upgradeSessionExpired');
    expect(requests).toHaveLength(0);
  });
});
