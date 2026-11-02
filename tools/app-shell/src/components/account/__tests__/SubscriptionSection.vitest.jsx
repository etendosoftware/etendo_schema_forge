// @covers tools/app-shell/src/components/account/SubscriptionSection.jsx
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatCurrency } from '@/lib/formatCurrency.js';

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
  // ETP-5051 quota rows: the same `{param}` substitution, so the numbers, unit and period word
  // that reach the row are observable.
  quotaUsage: '{consumed} of {included} {unit}',
  quotaUsageNoUnit: '{consumed} of {included}',
  quotaIncluded: '{included} {unit} included',
  quotaIncludedNoUnit: '{included} included',
  quotaUsageInPeriod: '{usage} {period}',
  quotaCurrentPeriod: '{start} – {end}',
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

const trackManageClicked = vi.fn();
vi.mock('@/lib/myCompanies/telemetry.js', async (importOriginal) => ({
  ...(await importOriginal()),
  trackSubscriptionManageClicked: (...args) => trackManageClicked(...args),
}));

vi.mock('@/lib/upgrade/api.js', () => ({
  getSubscription: (...args) => getSubscription(...args),
  createPortalSession: (...args) => createPortalSession(...args),
}));

// ETP-5051 O-1 — the session's entered environment (`clientId`, null for an account-level session)
// decides how the no-subscription state reads. Null by default, so every other case below runs as
// an account-level session, as before.
let mockSession = { clientId: null };
vi.mock('@/auth/AuthContext.jsx', () => ({
  useAuthOptional: () => mockSession,
}));

import { SubscriptionSection } from '../SubscriptionSection.jsx';
import enUS from '@/locales/en_US.json';
import esES from '@/locales/es_ES.json';
import esAR from '@/locales/es_AR.json';

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
    mockSession = { clientId: null };
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

  // ETP-5051 O-1 — inside an environment `GET /sws/go/billing/subscription` answers THAT
  // environment's subscription, so `hasSubscription: false` there means "this environment has
  // none" (a demo, an environment you were invited into), not "you pay for nothing": the account
  // may well pay for another one. Only an account-level session keeps the account-wide wording.
  it('says the entered environment has no subscription, and keeps the account wording outside one', async () => {
    getSubscription.mockResolvedValue({ hasSubscription: false });
    mockSession = { clientId: 'CLIENT-DEMO' };
    const { unmount } = renderSection();

    expect(await screen.findByTestId('SubscriptionSection__none'))
      .toHaveTextContent('subscriptionNoneInEnvironment');
    expect(screen.queryByTestId('SubscriptionSection__manage')).not.toBeInTheDocument();
    unmount();

    mockSession = { clientId: null };
    renderSection();
    expect(await screen.findByTestId('SubscriptionSection__none'))
      .toHaveTextContent('subscriptionNoActive');
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
      // string — `active` reads "Active" (ETP-6060), not the stored projection's "Current".
      expect(screen.getByTestId('SubscriptionSection__status')).toHaveTextContent('subscriptionActive');

      const amount = screen.getByTestId('SubscriptionSection__amount');
      // Stripe sends 2900 EUR minor units. Assert the exact canonical formatter output so
      // accidentally passing the `{ amount, fractionDigits }` conversion object itself to the
      // formatter cannot regress to rendering an object representation or a wrong value.
      expect(amount.textContent).toBe(formatCurrency('eur', 29, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }));

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

  // ETP-5051 — `planName` is the catalog plan; `plan` (the provider product name) is the fallback.
  describe('the plan name', () => {
    it('shows the catalog planName when the subscription has a plan row', async () => {
      getSubscription.mockResolvedValue({ ...ACTIVE, planName: 'Etendo GO Business', planQuotas: [] });
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__plan')).toHaveTextContent(/^Etendo GO Business$/);
    });

    it.each([
      ['missing', undefined],
      ['null', null],
      ['empty', ''],
    ])('falls back to plan when planName is %s', async (_label, planName) => {
      getSubscription.mockResolvedValue({ ...ACTIVE, planName });
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__plan')).toHaveTextContent(/^Pro$/);
    });
  });

  // ETP-5051 — `planQuotas` of /billing/subscription: what the plan includes and how much of it the
  // current period has used. Read-only.
  describe('the plan quotas', () => {
    const QUOTA = {
      resourceKey: 'POSTED_SALES_INVOICES',
      resourceName: 'Posted sales invoices',
      unitLabel: 'Inv',
      includedQty: 100,
      enforcementMode: 'block',
      warningThreshold: 80,
      period: 'month',
      consumptionSource: 'aggregate',
      consumed: 42,
      verdict: 'ALLOW',
      periodStart: '2026-10-07',
      periodEnd: '2026-11-07',
    };

    function withQuotas(planQuotas, extra = {}) {
      getSubscription.mockResolvedValue({ ...ACTIVE, planName: 'Business', planQuotas, ...extra });
    }

    it('shows each quota as consumed of included, with unit and period', async () => {
      withQuotas([QUOTA, { ...QUOTA, resourceKey: 'API_CALLS', resourceName: 'API calls', unitLabel: null, includedQty: 5, consumed: 2 }]);
      renderSection();

      const rows = await screen.findAllByTestId('SubscriptionSection__quota');
      expect(rows).toHaveLength(2);
      expect(within(rows[0]).getByTestId('SubscriptionSection__quotaName')).toHaveTextContent('Posted sales invoices');
      expect(within(rows[0]).getByTestId('SubscriptionSection__quotaUsage'))
        .toHaveTextContent(/^42 of 100 Inv quotaPeriodMonth$/);
      expect(within(rows[1]).getByTestId('SubscriptionSection__quotaUsage'))
        .toHaveTextContent(/^2 of 5 quotaPeriodMonth$/);
      expect(screen.queryByTestId('SubscriptionSection__quotasUnlimited')).not.toBeInTheDocument();
    });

    it.each([
      ['a blank', '  '],
      ['an empty', ''],
      ['a missing', null],
    ])('names a quota with %s resource name by its resource key', async (_label, resourceName) => {
      withQuotas([{ ...QUOTA, resourceKey: 'API_CALLS', resourceName, unitLabel: null, includedQty: 5, consumed: 2 }]);
      renderSection();

      const row = await screen.findByTestId('SubscriptionSection__quota');
      expect(within(row).getByTestId('SubscriptionSection__quotaName')).toHaveTextContent(/^API_CALLS$/);
      expect(within(row).getByTestId('SubscriptionSection__quotaUsage')).toHaveTextContent(/^2 of 5 quotaPeriodMonth$/);
    });

    // ETP-6060 — the catalog stores the names in one language; the shipped resources are
    // translated by key, so an English session never reads "Facturas".
    it('names the resources the plans ship with in the UI language, not the catalog one', async () => {
      withQuotas([
        { ...QUOTA, resourceKey: 'SALES_INVOICES', resourceName: 'Facturas', unitLabel: 'facturas' },
        { ...QUOTA, resourceKey: 'USERS', resourceName: 'Usuarios', unitLabel: 'usuarios', includedQty: 5, consumed: 2 },
      ]);
      renderSection();

      const rows = await screen.findAllByTestId('SubscriptionSection__quota');
      expect(within(rows[0]).getByTestId('SubscriptionSection__quotaName')).toHaveTextContent(/^quotaResourceSalesInvoices$/);
      expect(within(rows[0]).getByTestId('SubscriptionSection__quotaUsage'))
        .toHaveTextContent(/^42 of 100 quotaUnitSalesInvoices quotaPeriodMonth$/);
      expect(within(rows[1]).getByTestId('SubscriptionSection__quotaName')).toHaveTextContent(/^quotaResourceUsers$/);
      expect(within(rows[1]).getByTestId('SubscriptionSection__quotaUsage'))
        .toHaveTextContent(/^2 of 5 quotaUnitUsers quotaPeriodMonth$/);
    });

    it('reads a quota on a yearly plan as yearly', async () => {
      withQuotas([{ ...QUOTA, period: 'year', includedQty: 1200, consumed: 900 }]);
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__quotaUsage'))
        .toHaveTextContent(/^900 of 1\.200 Inv quotaPeriodYear$/);
    });

    it('says the plan is unlimited when it has no quotas', async () => {
      withQuotas([]);
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__quotasUnlimited'))
        .toHaveTextContent('subscriptionPlanUnlimited');
      expect(screen.queryByTestId('SubscriptionSection__quotas')).not.toBeInTheDocument();
    });

    it('claims neither limits nor unlimited without a catalog plan', async () => {
      getSubscription.mockResolvedValue({ ...ACTIVE, planQuotas: [] });
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__plan')).toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__quotasUnlimited')).not.toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__quotas')).not.toBeInTheDocument();
    });

    it('marks a quota with no measured consumption as not measured yet, never as zero', async () => {
      withQuotas([{ ...QUOTA, consumed: null, verdict: null }]);
      renderSection();

      const usage = await screen.findByTestId('SubscriptionSection__quotaUsage');
      expect(usage).toHaveTextContent(/^100 Inv included quotaPeriodMonthquotaNotMeasured$/);
      expect(within(usage).getByTestId('SubscriptionSection__quotaNotMeasured'))
        .toHaveTextContent('quotaNotMeasured');
      expect(usage).not.toHaveTextContent(/\b0 of/);
    });

    it('has no not-measured suffix for a measured zero', async () => {
      withQuotas([{ ...QUOTA, consumed: 0 }]);
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__quotaUsage')).toHaveTextContent(/^0 of 100 Inv/);
      expect(screen.queryByTestId('SubscriptionSection__quotaNotMeasured')).not.toBeInTheDocument();
    });

    it('shows the current period range once', async () => {
      withQuotas([QUOTA, { ...QUOTA, resourceKey: 'USERS', resourceName: 'Users' }]);
      renderSection();

      const periods = await screen.findAllByTestId('SubscriptionSection__quotaPeriod');
      expect(periods).toHaveLength(1);
      expect(periods[0]).toHaveTextContent('Oct 7, 2026 – Nov 7, 2026');
    });

    it('shows no period range when no quota carries one', async () => {
      withQuotas([{ ...QUOTA, periodStart: null, periodEnd: null }]);
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__quota')).toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__quotaPeriod')).not.toBeInTheDocument();
    });

    it('badges WARN, WARN over the limit and DENY, and nothing else', async () => {
      withQuotas([
        { ...QUOTA, resourceKey: 'A', verdict: 'WARN', consumed: 85 },
        { ...QUOTA, resourceKey: 'B', verdict: 'WARN', consumed: 130 },
        { ...QUOTA, resourceKey: 'C', verdict: 'DENY', consumed: 100 },
        { ...QUOTA, resourceKey: 'D', verdict: 'ALLOW' },
        { ...QUOTA, resourceKey: 'E', verdict: null },
      ]);
      renderSection();

      const rows = await screen.findAllByTestId('SubscriptionSection__quota');
      const badge = (row) => within(row).queryByTestId('SubscriptionSection__quotaState');
      expect(badge(rows[0])).toHaveTextContent('quotaStateWarn');
      expect(badge(rows[1])).toHaveTextContent('quotaStateOver');
      expect(badge(rows[2])).toHaveTextContent('quotaStateDeny');
      expect(badge(rows[3])).not.toBeInTheDocument();
      expect(badge(rows[4])).not.toBeInTheDocument();
      expect(rows.map((row) => row.getAttribute('data-verdict'))).toEqual(['WARN', 'WARN', 'DENY', 'ALLOW', '']);
    });
  });

  // ETP-5051 — `accessEnforced: false` on /billing/subscription: the environment-access kill
  // switch is on, so access will not be paused and neither the countdown nor "access is paused" is
  // true. One neutral line says the payment is overdue.
  describe('the grace banner when access is not enforced', () => {
    const PAST_DUE = {
      ...ACTIVE,
      status: 'past_due',
      renewalAt: '2026-10-05T00:00:00Z',
      graceEndsAt: '2026-10-01T00:00:00Z',
    };

    it('shows the neutral overdue line instead of the countdown during grace', async () => {
      getSubscription.mockResolvedValue({ ...PAST_DUE, graceDaysRemaining: 7, accessEnforced: false });
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__paymentOverdue'))
        .toHaveTextContent('subscriptionPaymentOverdue');
      expect(screen.queryByTestId('SubscriptionSection__graceRemaining')).not.toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__accessPaused')).not.toBeInTheDocument();
    });

    it('keeps the neutral line, and never says access is paused, after grace', async () => {
      getSubscription.mockResolvedValue({ ...PAST_DUE, graceDaysRemaining: 0, accessEnforced: false });
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__paymentOverdue')).toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__accessPaused')).not.toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__graceRemaining')).not.toBeInTheDocument();
    });

    it('shows nothing overdue for a subscription with no grace window', async () => {
      getSubscription.mockResolvedValue({ ...ACTIVE, accessEnforced: false });
      renderSection();

      expect(await screen.findByTestId('SubscriptionSection__plan')).toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__paymentOverdue')).not.toBeInTheDocument();
    });

    it.each([
      ['missing', undefined],
      ['true', true],
    ])('keeps the countdown and access-paused copy when the field is %s', async (_label, accessEnforced) => {
      getSubscription.mockResolvedValue({ ...PAST_DUE, graceDaysRemaining: 7, accessEnforced });
      const { unmount } = renderSection();
      expect(await screen.findByTestId('SubscriptionSection__graceRemaining')).toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__paymentOverdue')).not.toBeInTheDocument();
      unmount();

      getSubscription.mockResolvedValue({ ...PAST_DUE, graceDaysRemaining: 0, accessEnforced });
      renderSection();
      expect(await screen.findByTestId('SubscriptionSection__accessPaused')).toBeInTheDocument();
      expect(screen.queryByTestId('SubscriptionSection__paymentOverdue')).not.toBeInTheDocument();
    });
  });

  describe('copy in every shipped locale', () => {
    const KEYS = [
      'subscriptionPaymentOverdue', 'subscriptionPlanLimits', 'subscriptionPlanUnlimited',
      'quotaNotMeasured', 'quotaCurrentPeriod', 'quotaStateWarn', 'quotaStateOver', 'quotaStateDeny',
      'quotaUsage', 'quotaUsageNoUnit', 'quotaIncluded', 'quotaIncludedNoUnit', 'quotaUsageInPeriod',
      'quotaPeriodMonth', 'quotaPeriodYear', 'subscriptionNoneInEnvironment', 'subscriptionActive',
    ];

    it.each([
      ['en_US', enUS],
      ['es_ES', esES],
      ['es_AR', esAR],
    ])('%s defines every quota, overdue and no-subscription key', (_name, dict) => {
      for (const key of KEYS) {
        expect(typeof dict.genericLabels?.[key], key).toBe('string');
        expect(dict.genericLabels[key].trim(), key).not.toBe('');
      }
      expect(dict.genericLabels.quotaCurrentPeriod).toMatch(/\{start\}.*\{end\}/);
      // The neutral line promises no pause: it carries no day count or date.
      expect(dict.genericLabels.subscriptionPaymentOverdue).not.toMatch(/\{(days|date)\}/);
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
      // ETP-6060 — the host defaults to the account page.
      expect(trackManageClicked).toHaveBeenCalledWith('account');
      await waitFor(() => expect(assignMock)
        .toHaveBeenCalledWith('https://billing.stripe.com/session/abc'));
    });

    // ETP-6060 — "Mis empresas" renders one section per owned company: both the read and the
    // portal name that company, whatever environment the session is in.
    it('reads and manages the named company when given a clientId', async () => {
      const user = userEvent.setup();
      getSubscription.mockResolvedValue(ACTIVE);
      createPortalSession.mockResolvedValue({ url: 'https://billing.stripe.com/session/own-3' });
      renderSection({ clientId: 'own-3', manageSource: 'my_companies_section' });

      await user.click(await screen.findByTestId('SubscriptionSection__manage'));

      expect(trackManageClicked).toHaveBeenCalledWith('my_companies_section');

      expect(getSubscription).toHaveBeenCalledWith('/api', 'own-3');
      expect(createPortalSession).toHaveBeenCalledWith('/api', 'own-3');
      await waitFor(() => expect(assignMock)
        .toHaveBeenCalledWith('https://billing.stripe.com/session/own-3'));
    });

    it('says the named company has no subscription, even from an account-level session', async () => {
      getSubscription.mockResolvedValue({ hasSubscription: false });
      renderSection({ clientId: 'own-3' });

      expect(await screen.findByTestId('SubscriptionSection__none'))
        .toHaveTextContent('subscriptionNoneInEnvironment');
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
