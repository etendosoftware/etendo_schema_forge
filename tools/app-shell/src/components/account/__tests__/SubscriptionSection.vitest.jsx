import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * ETP-5443. `SubscriptionSection` draws the account's Stripe-backed subscription (plan, amount,
 * status, renewal/cancellation date, grace remaining) and is the only way the account owner
 * reaches the Stripe Customer Portal to manage it.
 *
 * All three billing calls (`getSubscription`, `createPortalSession`, `getCheckoutToken`) are
 * mocked at the `@/lib/upgrade/api.js` boundary, so this suite proves the section's OWN
 * behavior — what it renders for a given payload, what it shows when a call fails, where it
 * sends the user on Manage — without depending on how it wires fetch/auth underneath. That
 * wiring is covered separately (Task 5's `upgrade-api.test.js` and the repo-wide
 * `useApiFetch`/auth-header-policy guardrails).
 *
 * The three templated labels (`subscriptionGraceRemaining`, `subscriptionRenewsOn`,
 * `subscriptionCancelsOn`) are given a `{paramName}` placeholder and run through the same
 * `{param}` substitution the real `useUI` does — mirroring, not pinning, its wording — so the
 * grace-days/date substitution is observable without asserting exact copy. Same trick
 * `SecuritySection`'s suite uses for `accountMethodLastChanged`/`accountMethodLastLogin`.
 */

const TEMPLATES = {
  subscriptionGraceRemaining: '{days}:subscriptionGraceRemaining',
  subscriptionRenewsOn: '{date}:subscriptionRenewsOn',
  subscriptionCancelsOn: '{date}:subscriptionCancelsOn',
};

vi.mock('@/i18n', () => ({
  useLabel: () => (key) => key,
  useMenuLabel: () => (key) => key,
  useUI: () => (key, params = {}) => {
    let text = TEMPLATES[key] ?? key;
    Object.keys(params || {}).forEach((p) => { text = text.replace(`{${p}}`, params[p]); });
    return text;
  },
  useLocale: () => ({ genericLabels: {}, statuses: {} }),
  useLocaleSwitch: () => ({ locale: 'en_US', setLocale: vi.fn() }),
}));

// Defensive stub: the section may reach this for its fetch function, but every call it makes
// through `getSubscription`/`createPortalSession` is itself mocked below, so what this returns
// is never actually invoked.
vi.mock('@/auth/useApiFetch.js', () => ({
  useApiFetch: () => vi.fn(),
}));

const getSubscription = vi.fn();
const createPortalSession = vi.fn();
const getCheckoutToken = vi.fn(() => 'checkout-token');

vi.mock('@/lib/upgrade/api.js', () => ({
  getSubscription: (...args) => getSubscription(...args),
  createPortalSession: (...args) => createPortalSession(...args),
  getCheckoutToken: (...args) => getCheckoutToken(...args),
}));

import { SubscriptionSection } from '../SubscriptionSection.jsx';

function renderSection(props = {}) {
  return render(<SubscriptionSection apiBaseUrl="/api" {...props} />);
}

// The backend's `status` is Stripe's own live subscription status — lowercase, e.g. `active`,
// `past_due`, `trialing`, `canceled` — never the uppercase `EnvironmentAccessPolicy` enum names.
// Whether the grace banner shows is decided by a non-null `graceEndsAt` (the backend already
// derives it from the stored projection), not by matching `status` against a literal.
const ACTIVE = {
  hasSubscription: true,
  plan: 'Pro',
  amountMinor: 2900,
  currency: 'EUR',
  status: 'active',
  renewalAt: '2026-11-15T00:00:00Z',
  cancelAtPeriodEnd: false,
  graceEndsAt: null,
  graceDaysRemaining: 0,
};

describe('SubscriptionSection', () => {
  let assignMock;

  beforeEach(() => {
    vi.clearAllMocks();
    assignMock = vi.fn();
    // Same technique UpgradePage's suite uses for the hosted-checkout redirect: jsdom's real
    // `location.assign` performs actual navigation and cannot be spied on directly.
    vi.stubGlobal('location', { ...globalThis.location, assign: assignMock });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the root immediately and shows loading until the subscription resolves', () => {
    getSubscription.mockReturnValue(new Promise(() => {})); // never resolves in this test
    renderSection();

    expect(screen.getByTestId('SubscriptionSection__root')).toBeInTheDocument();
    expect(screen.getByTestId('SubscriptionSection__loading')).toBeInTheDocument();
  });

  it('shows the no-subscription state and offers no Manage control', async () => {
    getSubscription.mockResolvedValue({ hasSubscription: false });
    renderSection();

    expect(await screen.findByTestId('SubscriptionSection__root')).toBeInTheDocument();
    expect(screen.getByTestId('SubscriptionSection__none')).toBeInTheDocument();
    expect(screen.queryByTestId('SubscriptionSection__manage')).not.toBeInTheDocument();
    expect(screen.queryByTestId('SubscriptionSection__plan')).not.toBeInTheDocument();
  });

  it('shows the unavailable state when the subscription cannot be read', async () => {
    getSubscription.mockRejectedValue(new Error('network down'));
    renderSection();

    expect(await screen.findByTestId('SubscriptionSection__unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('SubscriptionSection__loading')).not.toBeInTheDocument();
  });

  describe('an active subscription', () => {
    it('shows plan, amount and status, and the next renewal date rather than a cancellation date', async () => {
      getSubscription.mockResolvedValue(ACTIVE);
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__plan')).toBeInTheDocument();
      expect(screen.getByTestId('SubscriptionSection__root')).toBeInTheDocument();
      // The badge shows a translated label for the live Stripe status, never the raw provider
      // string — `active` maps onto the same `subscriptionCurrent` key the stored
      // `EnvironmentAccessPolicy` projection already uses.
      expect(screen.getByTestId('SubscriptionSection__status')).toHaveTextContent('subscriptionCurrent');

      // Formatting is locale-driven (ETP-4314) — only assert the amount rendered and carries
      // the value's digits, not an exact separator/symbol placement.
      const amount = screen.getByTestId('SubscriptionSection__amount');
      expect(amount).not.toBeEmptyDOMElement();
      expect(amount.textContent).toMatch(/29/);

      expect(screen.getByTestId('SubscriptionSection__renewsOn')).toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__cancelsOn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__graceRemaining')).not.toBeInTheDocument();
    });

    it('shows a cancellation date instead of a renewal date once cancellation is scheduled', async () => {
      getSubscription.mockResolvedValue({ ...ACTIVE, cancelAtPeriodEnd: true });
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__cancelsOn')).toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__renewsOn')).not.toBeInTheDocument();
    });

    // Falls back to the raw provider string rather than hiding the badge or throwing, for a
    // Stripe status this section's label map has no entry for yet.
    it('falls back to the raw status string for a status the label map does not know', async () => {
      getSubscription.mockResolvedValue({ ...ACTIVE, status: 'some_future_stripe_status' });
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__status'))
        .toHaveTextContent('some_future_stripe_status');
    });
  });

  describe('the grace banner', () => {
    it('shows the remaining grace days while the subscription is past due', async () => {
      getSubscription.mockResolvedValue({
        ...ACTIVE,
        status: 'past_due',
        renewalAt: null,
        cancelAtPeriodEnd: false,
        graceEndsAt: '2026-10-01T00:00:00Z',
        graceDaysRemaining: 7,
      });
      renderSection();

      const grace = await screen.findByTestId('SubscriptionSection__graceRemaining');
      expect(grace.textContent).toMatch(/7/);
      expect(screen.getByTestId('SubscriptionSection__status')).toHaveTextContent('subscriptionPastDue');
      expect(screen.queryByTestId('SubscriptionSection__renewsOn')).not.toBeInTheDocument();
    });

    // Regression: the signal is `graceEndsAt`, not the `status` string. A past-due account with
    // no grace end date (the backend never derived one) must not show a banner it cannot back
    // with a real deadline — matching the same "never write PAST_DUE without a due date" rule
    // the backend lifecycle applier enforces (see the design doc §4.4). The status badge is
    // unaffected: it still reads live off `status`, independent of the grace signal.
    it('shows no grace banner for a past-due subscription with no derived grace end date', async () => {
      getSubscription.mockResolvedValue({
        ...ACTIVE,
        status: 'past_due',
        renewalAt: null,
        cancelAtPeriodEnd: false,
        graceEndsAt: null,
        graceDaysRemaining: 0,
      });
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__status')).toHaveTextContent('subscriptionPastDue');
      expect(screen.queryByTestId('SubscriptionSection__graceRemaining')).not.toBeInTheDocument();
    });

    // Regression: an active subscription never shows the grace banner, even if a stale
    // `graceDaysRemaining` value lingered in the payload — `graceEndsAt` null is what rules it
    // out, covered together here with the active fixture (`ACTIVE.graceEndsAt` is null).
    it('never shows a grace banner for an active subscription', async () => {
      getSubscription.mockResolvedValue(ACTIVE);
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__plan')).toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__graceRemaining')).not.toBeInTheDocument();
    });
  });

  describe('managing the subscription', () => {
    it('sends the user to the Stripe Customer Portal on Manage', async () => {
      const user = userEvent.setup();
      getSubscription.mockResolvedValue(ACTIVE);
      createPortalSession.mockResolvedValue({ url: 'https://billing.stripe.com/session/abc' });
      renderSection();

      await user.click(await screen.findByTestId('SubscriptionSection__manage'));

      expect(createPortalSession).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(assignMock)
        .toHaveBeenCalledWith('https://billing.stripe.com/session/abc'));
    });

    it('surfaces an error instead of navigating when the portal session cannot be created', async () => {
      const user = userEvent.setup();
      getSubscription.mockResolvedValue(ACTIVE);
      createPortalSession.mockRejectedValue(new Error('portal down'));
      renderSection();

      await user.click(await screen.findByTestId('SubscriptionSection__manage'));

      expect(await screen.findByTestId('SubscriptionSection__manageError')).toBeInTheDocument();
      expect(assignMock).not.toHaveBeenCalled();
    });
  });

  it('lets the caller set an outer test id, as AccountSettingsPage does, without losing the stable inner one', async () => {
    getSubscription.mockResolvedValue(ACTIVE);
    renderSection({ 'data-testid': 'SubscriptionSection__account' });

    expect(await screen.findByTestId('SubscriptionSection__account')).toBeInTheDocument();
    expect(screen.getByTestId('SubscriptionSection__root')).toBeInTheDocument();
  });
});
