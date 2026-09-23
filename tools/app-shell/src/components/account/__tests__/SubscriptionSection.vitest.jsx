import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * ETP-5443. `SubscriptionSection` draws the account's Stripe-backed subscription (plan, amount,
 * status, renewal/cancellation date, grace remaining) and is the only way the account owner
 * reaches the Stripe Customer Portal to manage it.
 *
 * Both billing calls (`getSubscription`, `createPortalSession`) are
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
  subscriptionGraceRemainingOne: '{days}:subscriptionGraceRemainingOne',
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

const getSubscription = vi.fn();
const createPortalSession = vi.fn();

vi.mock('@/lib/upgrade/api.js', () => ({
  getSubscription: (...args) => getSubscription(...args),
  createPortalSession: (...args) => createPortalSession(...args),
}));

import { SubscriptionSection } from '../SubscriptionSection.jsx';

function renderSection(props = {}) {
  return render(<SubscriptionSection apiBaseUrl="/api" {...props} />);
}

// The backend's `status` is Stripe's own live subscription status — lowercase, e.g. `active`,
// `past_due`, `trialing`, `canceled` — never the uppercase `EnvironmentAccessPolicy` enum names.
// Whether the grace banner shows is decided by a non-null `graceEndsAt` (the backend already
// derives it from the stored projection), not by matching `status` against a literal.
// `currency` is lowercase, matching the real backend payload
// (`StripeCustomerPortalService.SubscriptionDetail.fromProviderJson` reads Stripe's own
// lowercase code verbatim) — REVIEW W5 fixture realism.
const ACTIVE = {
  hasSubscription: true,
  plan: 'Pro',
  amountMinor: 2900,
  currency: 'eur',
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

  /**
   * ETP-5455 — billing accepts only a platform credential (decision 1), so a legacy bearer session
   * is refused here while /me still answers. That 401 is not "we couldn't load your subscription":
   * nothing is down and Retry can never succeed. The section reports it to its host instead.
   */
  describe('an expired session (ETP-5455)', () => {
    function httpError(status) {
      const error = new Error(`HTTP ${status}`);
      error.status = status;
      return error;
    }

    it('reports a 401 on the subscription read to its host instead of showing unavailable',
      async () => {
        const onSessionExpired = vi.fn();
        getSubscription.mockRejectedValue(httpError(401));

        renderSection({ onSessionExpired });

        await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
        expect(screen.queryByTestId('SubscriptionSection__unavailable')).not.toBeInTheDocument();
        expect(screen.queryByTestId('SubscriptionSection__retry')).not.toBeInTheDocument();
      });

    it('says the session expired when no host listens, rather than claiming an outage', async () => {
      getSubscription.mockRejectedValue(httpError(401));

      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__sessionExpired')).toBeInTheDocument();
      expect(screen.getByText('accountSessionExpired')).toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__unavailable')).not.toBeInTheDocument();
    });

    it('keeps the unavailable state and Retry for a server failure', async () => {
      const onSessionExpired = vi.fn();
      getSubscription.mockRejectedValue(httpError(500));

      renderSection({ onSessionExpired });

      expect(await screen.findByTestId('SubscriptionSection__unavailable')).toBeInTheDocument();
      expect(screen.getByTestId('SubscriptionSection__retry')).toBeInTheDocument();
      expect(onSessionExpired).not.toHaveBeenCalled();
    });

    it('reports a 401 on the portal session instead of the manage error', async () => {
      const user = userEvent.setup();
      const onSessionExpired = vi.fn();
      getSubscription.mockResolvedValue(ACTIVE);
      createPortalSession.mockRejectedValue(httpError(401));

      renderSection({ onSessionExpired });
      await user.click(await screen.findByTestId('SubscriptionSection__manage'));

      await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
      expect(screen.queryByTestId('SubscriptionSection__manageError')).not.toBeInTheDocument();
      expect(assignMock).not.toHaveBeenCalled();
    });
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

  // ETP-5443 REVIEW W5: `renewalAt` alone does not mean "renews on X" — `past_due` still
  // carries it (Stripe's next invoice-retry date, not a renewal), matching the real backend
  // shape. Only a genuinely renewing status may show the promise.
  describe('the renews-on line', () => {
    it('does not show renews-on or cancels-on for a past-due subscription that still carries a renewalAt', async () => {
      getSubscription.mockResolvedValue({
        ...ACTIVE,
        status: 'past_due',
        renewalAt: '2026-10-05T00:00:00Z',
        cancelAtPeriodEnd: false,
        graceEndsAt: '2026-10-01T00:00:00Z',
        graceDaysRemaining: 7,
      });
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__status')).toHaveTextContent('subscriptionPastDue');
      expect(screen.queryByTestId('SubscriptionSection__renewsOn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__cancelsOn')).not.toBeInTheDocument();
    });

    it('shows renews-on for a trialing subscription', async () => {
      getSubscription.mockResolvedValue({ ...ACTIVE, status: 'trialing' });
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__renewsOn')).toBeInTheDocument();
    });
  });

  // ETP-5443 REVIEW N6: `amountMinor` is only ever divided by 100 for a standard currency —
  // a zero-decimal one (JPY et al.) already IS the display amount, and dividing it would
  // understate it 100x. Real backend `currency` is lowercase.
  describe('zero-decimal currencies', () => {
    it('renders the full amount for a zero-decimal currency instead of dividing by 100', async () => {
      getSubscription.mockResolvedValue({ ...ACTIVE, currency: 'jpy', amountMinor: 100 });
      renderSection();

      const amount = await screen.findByTestId('SubscriptionSection__amount');
      expect(amount.textContent).toMatch(/100/);
      // No isolated "1" digit anywhere — rules out the dividing-by-100 regression (¥100 → "1").
      expect(amount.textContent).not.toMatch(/(?<!\d)1(?!\d)/);
    });
  });

  describe('the grace banner', () => {
    it('shows the remaining grace days while the subscription is past due', async () => {
      getSubscription.mockResolvedValue({
        ...ACTIVE,
        status: 'past_due',
        // Real backend shape: past_due still carries `renewalAt` (Stripe's next invoice-retry
        // date) — REVIEW W5. `showsRenewsOn` still hides it because `past_due` is not a
        // RENEWING_STATUSES member; see the "renews-on line" describe above.
        renewalAt: '2026-10-05T00:00:00Z',
        cancelAtPeriodEnd: false,
        graceEndsAt: '2026-10-01T00:00:00Z',
        graceDaysRemaining: 7,
      });
      renderSection();

      const grace = await screen.findByTestId('SubscriptionSection__graceRemaining');
      expect(grace.textContent).toMatch(/7/);
      expect(grace.textContent).toMatch(/subscriptionGraceRemaining/);
      expect(screen.getByTestId('SubscriptionSection__status')).toHaveTextContent('subscriptionPastDue');
      expect(screen.queryByTestId('SubscriptionSection__renewsOn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__accessPaused')).not.toBeInTheDocument();
    });

    // Only English/Spanish need a singular form — the component picks a distinct i18n key
    // (`subscriptionGraceRemainingOne`) at exactly 1 day, not the templated `_many` form.
    it('uses the singular grace-remaining key for exactly one day left', async () => {
      getSubscription.mockResolvedValue({
        ...ACTIVE,
        status: 'past_due',
        renewalAt: '2026-10-05T00:00:00Z',
        cancelAtPeriodEnd: false,
        graceEndsAt: '2026-10-01T00:00:00Z',
        graceDaysRemaining: 1,
      });
      renderSection();

      const grace = await screen.findByTestId('SubscriptionSection__graceRemaining');
      expect(grace.textContent).toMatch(/subscriptionGraceRemainingOne/);
      expect(grace.textContent).not.toMatch(/subscriptionGraceRemaining(?!One)/);
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
        renewalAt: '2026-10-05T00:00:00Z',
        cancelAtPeriodEnd: false,
        graceEndsAt: null,
        graceDaysRemaining: 0,
      });
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__status')).toHaveTextContent('subscriptionPastDue');
      expect(screen.queryByTestId('SubscriptionSection__graceRemaining')).not.toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__accessPaused')).not.toBeInTheDocument();
    });

    // Third state (REVIEW W4): the grace window has ELAPSED (`graceDaysRemaining` 0) while
    // `graceEndsAt` is still set — the stored projection has not yet been flipped to EXPIRED by
    // the async lifecycle job. Access is already paused in this gap, so the section must say so
    // instead of showing no banner at all or a stale "days left" count.
    it('shows access-paused, not the grace-remaining banner, once the grace window has elapsed', async () => {
      getSubscription.mockResolvedValue({
        ...ACTIVE,
        status: 'past_due',
        renewalAt: '2026-10-05T00:00:00Z',
        cancelAtPeriodEnd: false,
        graceEndsAt: '2026-10-01T00:00:00Z',
        graceDaysRemaining: 0,
      });
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__accessPaused')).toBeInTheDocument();
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
      expect(screen.queryByTestId('SubscriptionSection__accessPaused')).not.toBeInTheDocument();
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
