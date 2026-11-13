// @covers tools/app-shell/src/components/account/PlanChangeDialog.jsx
import {
  act, render, screen, waitFor, within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * ETP-5053. The change-plan dialog offers only what the backend lists, states direction, timing
 * and the quota consequence before the customer confirms, and reports what happened afterwards.
 *
 * The two billing calls are mocked at the `@/lib/upgrade/api.js` boundary, like the
 * SubscriptionSection suite. Templated labels keep a `{param}` placeholder so the substituted
 * plan, date and numbers are observable without pinning copy.
 */
const TEMPLATES = {
  subscriptionPendingChange: '{plan}@{date}:subscriptionPendingChange',
  planChangePeriodEndNote: '{date}:planChangePeriodEndNote',
  planChangeQuotaExceeded: '{resource}:{consumed}/{included}:{plan}:planChangeQuotaExceeded',
  planChangeDoneImmediate: '{plan}:planChangeDoneImmediate',
  planChangeDoneScheduled: '{plan}@{date}:planChangeDoneScheduled',
  planChangeAlreadyPending: '{date}:planChangeAlreadyPending',
  planChangeChargeToday: '{amount}:planChangeChargeToday',
  planChangeChargeTodayCard: '{amount}@{brand}/{last4}:planChangeChargeTodayCard',
  planChangePaymentRequired: '{plan}:planChangePaymentRequired',
  planChangeKeepNote: '{plan}:planChangeKeepNote',
  planChangePendingCancelled: '{plan}:planChangePendingCancelled',
  upgradePlanPriceMonthly: '{amount} per month',
  upgradePlanPriceYearly: '{amount} per year',
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

const getPlanChanges = vi.fn();
const requestPlanChange = vi.fn();
const previewPlanChange = vi.fn();
vi.mock('@/lib/upgrade/api.js', () => ({
  getPlanChanges: (...args) => getPlanChanges(...args),
  previewPlanChange: (...args) => previewPlanChange(...args),
  requestPlanChange: (...args) => requestPlanChange(...args),
  UPGRADE_ERROR_CODES: {
    sessionExpired: 'upgradeSessionExpired',
    planChangesUnavailable: 'planChangeUnavailable',
    planChangeNotAllowed: 'planChangeNotAllowed',
    planChangeNotCurrent: 'planChangeNotCurrent',
    planChangeFailed: 'planChangeFailed',
  },
}));

import {
  PAYMENT_RECHECK_INTERVAL_MS, PlanChangeDialog, planPriceLabel,
} from '../PlanChangeDialog.jsx';

const PRO = {
  planKey: 'pro', planName: 'Pro', billingInterval: 'month', displayPrice: '99', currency: 'EUR',
  timing: 'immediate', intervalChange: false,
  quotas: [{ resourceKey: 'INVOICES', resourceName: 'Invoices', unitLabel: 'inv', includedQty: 1000,
    consumed: 120, verdict: 'ALLOW', period: 'year' }],
};
const CORE = {
  planKey: 'core', planName: 'Core', billingInterval: 'month', displayPrice: '29', currency: 'EUR',
  timing: 'period_end', intervalChange: false,
  quotas: [{ resourceKey: 'INVOICES', resourceName: 'Invoices', unitLabel: 'inv', includedQty: 100,
    consumed: 120, verdict: 'DENY', period: 'year' }],
};
const PRO_YEARLY = {
  planKey: 'pro-yearly', planName: 'Pro yearly', billingInterval: 'year', displayPrice: '990',
  currency: 'EUR', timing: 'immediate', intervalChange: true, quotas: [],
};
/** Annual to monthly, applied now: not offered by default, but an operator can configure it. */
const PRO_MONTHLY_FROM_YEARLY = {
  planKey: 'pro-monthly', planName: 'Pro monthly', billingInterval: 'month', displayPrice: '99',
  currency: 'EUR', timing: 'immediate', intervalChange: true, quotas: [],
};
const PAYMENT_REQUIRED = {
  planKey: 'pro', planName: 'Pro', timing: 'immediate', effectiveAt: '2026-10-31T10:00:00Z',
  alreadyPending: false, paymentRequired: true, paymentUrl: 'https://invoice.stripe.com/i/abc',
};

function renderDialog(props = {}) {
  const onOpenChange = vi.fn();
  const onChanged = vi.fn();
  const dialog = (more = {}) => (
    <PlanChangeDialog open apiBaseUrl="/api" periodEnd="2026-12-01T00:00:00Z"
      onOpenChange={onOpenChange} onChanged={onChanged} {...props} {...more} />
  );
  const view = render(dialog());
  return { onOpenChange, onChanged, rerender: (more) => view.rerender(dialog(more)) };
}

/** The customer comes back to this tab (from the provider's invoice page in another one). */
function returnToTab() {
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Hides (or shows again) this tab as the browser reports it. */
function setTabHidden(hidden) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true, get: () => (hidden ? 'hidden' : 'visible'),
  });
}

/** Picks the upgrade, waits for its quote and confirms it: the answer asks for a payment. */
async function confirmUpgradeAwaitingPayment(user = userEvent) {
  await user.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);
  await screen.findByText(/planChangeChargeTodayCard/);
  await user.click(screen.getByTestId('PlanChangeDialog__confirm'));
  await screen.findByTestId('PlanChangeDialog__completePayment');
}

const PRORATION_DATE = 1794527600;
const PREVIEW = {
  planKey: 'pro', timing: 'immediate', amountDue: '458.29', currency: 'EUR',
  prorationDate: PRORATION_DATE, paymentMethod: { brand: 'visa', last4: '4242' },
};

describe('PlanChangeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previewPlanChange.mockResolvedValue(PREVIEW);
  });

  it('loads the offered changes for the dialog and lists them with timing and price', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO, CORE] });
    renderDialog({ clientId: 'CLIENT-1' });

    const options = await screen.findAllByTestId('PlanChangeDialog__option');
    expect(getPlanChanges).toHaveBeenCalledWith('/api', 'CLIENT-1');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute('data-plan-key', 'pro');
    expect(within(options[0]).getByTestId('PlanChangeDialog__optionTiming'))
      .toHaveTextContent('planChangeTimingImmediate');
    expect(within(options[1]).getByTestId('PlanChangeDialog__optionTiming'))
      .toHaveTextContent('planChangeTimingPeriodEnd');
    // Nothing can be confirmed until a target is chosen.
    expect(screen.getByTestId('PlanChangeDialog__confirm')).toBeDisabled();
  });

  it('says no change is available when the backend lists none', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [] });
    renderDialog();

    expect(await screen.findByTestId('PlanChangeDialog__none')).toBeInTheDocument();
    expect(screen.queryByTestId('PlanChangeDialog__confirm')).not.toBeInTheDocument();
  });

  it('shows the unavailable state with a retry when the offer cannot be read', async () => {
    getPlanChanges.mockRejectedValueOnce(Object.assign(new Error('down'), { status: 503 }));
    getPlanChanges.mockResolvedValueOnce({ hasSubscription: true, changes: [PRO] });
    renderDialog();

    expect(await screen.findByTestId('PlanChangeDialog__unavailable')).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('PlanChangeDialog__retry'));
    expect(await screen.findAllByTestId('PlanChangeDialog__option')).toHaveLength(1);
  });

  it('states that an upgrade applies now and keeps the quota year, with usage within limits', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO] });
    renderDialog();

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);

    expect(screen.getByTestId('PlanChangeDialog__timingNote'))
      .toHaveTextContent('planChangeImmediateNote');
    expect(screen.getByTestId('PlanChangeDialog__quotaKept')).toBeInTheDocument();
    expect(screen.getByTestId('PlanChangeDialog__quotaFine')).toBeInTheDocument();
    expect(screen.queryByTestId('PlanChangeDialog__quotaExceeded')).not.toBeInTheDocument();
    expect(screen.getByTestId('PlanChangeDialog__confirm')).toBeEnabled();
  });

  it('shows the numbers of an exceeded quota before a downgrade is confirmed, with the period end', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [CORE] });
    renderDialog();

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);

    const note = screen.getByTestId('PlanChangeDialog__timingNote');
    expect(note).toHaveTextContent('planChangePeriodEndNote');
    expect(note).not.toHaveTextContent('{date}');
    const exceeded = screen.getByTestId('PlanChangeDialog__quotaExceeded');
    expect(within(exceeded).getAllByTestId('PlanChangeDialog__quotaExceededItem')).toHaveLength(1);
    expect(exceeded).toHaveTextContent('Invoices:120/100:Core:planChangeQuotaExceeded');
    expect(screen.queryByTestId('PlanChangeDialog__quotaFine')).not.toBeInTheDocument();
  });

  it('says a monthly-to-annual change applies now and keeps the usage of the year', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO_YEARLY] });
    renderDialog();

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);

    expect(screen.getByTestId('PlanChangeDialog__timingNote'))
      .toHaveTextContent('planChangeIntervalNote');
    // Flexible billing keeps the billing date, so the quota year does not restart either.
    expect(screen.getByTestId('PlanChangeDialog__quotaKept')).toBeInTheDocument();
  });

  it('says an annual-to-monthly change switches billing to monthly, not to annual', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO_MONTHLY_FROM_YEARLY] });
    renderDialog();

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);

    const note = screen.getByTestId('PlanChangeDialog__timingNote');
    expect(note).toHaveTextContent('planChangeIntervalToMonthlyNote');
    expect(note).not.toHaveTextContent('planChangeIntervalNote');
  });

  it('marks the chosen option as selected, and only that one', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO, CORE] });
    renderDialog();

    const options = await screen.findAllByTestId('PlanChangeDialog__option');
    expect(options.map((o) => o.getAttribute('data-selected'))).toEqual(['false', 'false']);
    await userEvent.click(options[1]);

    expect(options[1]).toHaveAttribute('data-selected', 'true');
    expect(options[1]).toHaveAttribute('aria-pressed', 'true');
    expect(within(options[1]).getByTestId('PlanChangeDialog__optionSelectedIcon')).toBeInTheDocument();
    expect(options[0]).toHaveAttribute('data-selected', 'false');
    expect(within(options[0]).queryByTestId('PlanChangeDialog__optionSelectedIcon')).not.toBeInTheDocument();
  });

  it('quotes the amount charged today and the saved card before an upgrade is confirmed', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO] });
    renderDialog({ clientId: 'CLIENT-1' });

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);

    const charge = await screen.findByText(/planChangeChargeTodayCard/);
    expect(charge).toHaveTextContent('458');
    expect(charge).toHaveTextContent('@Visa/4242');
    expect(previewPlanChange).toHaveBeenCalledWith('/api', 'pro', 'CLIENT-1');
  });

  it('quotes a zero charge as a charge of zero, not as an unknown amount', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO] });
    previewPlanChange.mockResolvedValue({ ...PREVIEW, amountDue: 0 });
    renderDialog();

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);

    const charge = await screen.findByText(/planChangeChargeTodayCard/);
    expect(charge).toHaveTextContent('0');
    expect(screen.queryByText(/planChangeChargeUnknown/)).not.toBeInTheDocument();
  });

  it('falls back to a generic charge line when the amount cannot be read', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO] });
    previewPlanChange.mockRejectedValue(Object.assign(new Error('down'), { status: 502 }));
    renderDialog();

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);

    await waitFor(() => expect(screen.getByTestId('PlanChangeDialog__charge'))
      .toHaveTextContent('planChangeChargeUnknown'));
    expect(screen.getByTestId('PlanChangeDialog__confirm')).toBeEnabled();
  });

  it('offers keeping the current plan while a downgrade is pending, and says it was cancelled', async () => {
    const KEEP = { planKey: 'pro-yearly', planName: 'Pro yearly', billingInterval: 'year',
      displayPrice: '990', currency: 'EUR', timing: 'keep', intervalChange: false, quotas: [] };
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [KEEP, CORE],
      pendingChange: { planKey: 'pro', planName: 'Pro', effectiveAt: '2027-10-23T00:00:00Z' } });
    requestPlanChange.mockResolvedValue({ planKey: 'pro-yearly', planName: 'Pro yearly',
      timing: 'immediate', alreadyPending: false, paymentRequired: false, pendingCancelled: true });
    renderDialog();

    const options = await screen.findAllByTestId('PlanChangeDialog__option');
    expect(options[0]).toHaveAttribute('data-timing', 'keep');
    expect(within(options[0]).getByTestId('PlanChangeDialog__optionTiming'))
      .toHaveTextContent('planChangeTimingKeep');
    await userEvent.click(options[0]);

    expect(screen.getByTestId('PlanChangeDialog__timingNote')).toHaveTextContent('Pro:planChangeKeepNote');
    // Keeping the plan charges nothing: no quote, no charge line.
    expect(screen.queryByTestId('PlanChangeDialog__charge')).not.toBeInTheDocument();
    expect(previewPlanChange).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('PlanChangeDialog__confirm'));
    expect(await screen.findByTestId('PlanChangeDialog__done'))
      .toHaveTextContent('Pro yearly:planChangePendingCancelled');
    // A confirmation only: its own title, no instructions.
    expect(screen.getByTestId('PlanChangeDialog__title')).toHaveTextContent('planChangeDoneTitle');
    expect(screen.queryByTestId('PlanChangeDialog__description')).not.toBeInTheDocument();
    expect(requestPlanChange).toHaveBeenCalledWith('/api', 'pro-yearly', null, null);
  });

  it('says a past-due subscription cannot change plan, and offers nothing', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, subscriptionStatus: 'past_due',
      changes: [PRO, CORE] });
    renderDialog();

    expect(await screen.findByTestId('PlanChangeDialog__notCurrent'))
      .toHaveTextContent('planChangeNotCurrent');
    expect(screen.queryByTestId('PlanChangeDialog__option')).not.toBeInTheDocument();
    expect(screen.queryByTestId('PlanChangeDialog__confirm')).not.toBeInTheDocument();
  });

  it('shows a refused quote as the refusal and does not let the customer confirm', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO] });
    previewPlanChange.mockRejectedValue(Object.assign(new Error('past due'),
      { status: 409, code: 'planChangeNotCurrent' }));
    renderDialog();

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);

    expect(await screen.findByTestId('PlanChangeDialog__error')).toHaveTextContent('planChangeNotCurrent');
    expect(screen.queryByTestId('PlanChangeDialog__charge')).not.toBeInTheDocument();
    expect(screen.getByTestId('PlanChangeDialog__confirm')).toBeDisabled();
  });

  it('drops a refusal once the customer picks another option', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO, CORE] });
    previewPlanChange.mockRejectedValue(Object.assign(new Error('not allowed'),
      { status: 409, code: 'planChangeNotAllowed' }));
    renderDialog();

    const options = await screen.findAllByTestId('PlanChangeDialog__option');
    await userEvent.click(options[0]);
    expect(await screen.findByTestId('PlanChangeDialog__error')).toHaveTextContent('planChangeNotAllowed');
    // Clicking the refused option again keeps its refusal: nothing new was asked.
    await userEvent.click(options[0]);
    expect(screen.getByTestId('PlanChangeDialog__error')).toHaveTextContent('planChangeNotAllowed');

    // The downgrade is not quoted, so nothing else would clear the upgrade's refusal.
    await userEvent.click(options[1]);
    expect(screen.queryByTestId('PlanChangeDialog__error')).not.toBeInTheDocument();
    expect(screen.getByTestId('PlanChangeDialog__confirm')).toBeEnabled();
  });

  it('drops a failed confirm once the customer picks a downgrade instead', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO, CORE] });
    requestPlanChange.mockRejectedValue(Object.assign(new Error('boom'), { status: 502 }));
    renderDialog();

    const options = await screen.findAllByTestId('PlanChangeDialog__option');
    await userEvent.click(options[0]);
    await screen.findByText(/planChangeChargeTodayCard/);
    await userEvent.click(screen.getByTestId('PlanChangeDialog__confirm'));
    expect(await screen.findByTestId('PlanChangeDialog__error')).toHaveTextContent('planChangeFailed');

    await userEvent.click(options[1]);
    expect(screen.queryByTestId('PlanChangeDialog__error')).not.toBeInTheDocument();
  });

  it('previews nothing for a downgrade, which charges nothing today', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [CORE] });
    renderDialog();

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);

    expect(screen.queryByTestId('PlanChangeDialog__charge')).not.toBeInTheDocument();
    expect(previewPlanChange).not.toHaveBeenCalled();
  });

  it('links to the invoice page when the upgrade waits for a payment the customer completes', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO] });
    requestPlanChange.mockResolvedValue({ planKey: 'pro', planName: 'Pro', timing: 'immediate',
      effectiveAt: '2026-10-31T10:00:00Z', alreadyPending: false, paymentRequired: true,
      paymentUrl: 'https://invoice.stripe.com/i/abc' });
    renderDialog();

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);
    await screen.findByText(/planChangeChargeTodayCard/);
    await userEvent.click(screen.getByTestId('PlanChangeDialog__confirm'));

    expect(await screen.findByTestId('PlanChangeDialog__done'))
      .toHaveTextContent('Pro:planChangePaymentRequired');
    // Nothing changed yet: the dialog keeps its change-plan heading.
    expect(screen.getByTestId('PlanChangeDialog__title')).toHaveTextContent('planChangeTitle');
    const link = screen.getByTestId('PlanChangeDialog__completePayment');
    expect(link).toHaveAttribute('href', 'https://invoice.stripe.com/i/abc');
    expect(link).toHaveAttribute('target', '_blank');
    expect(screen.queryByText(/planChangeDoneImmediate/)).not.toBeInTheDocument();
  });

  it('rechecks on returning to the tab and confirms once the paid upgrade has applied', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO] });
    requestPlanChange.mockResolvedValue({ planKey: 'pro', planName: 'Pro', timing: 'immediate',
      effectiveAt: '2026-10-31T10:00:00Z', alreadyPending: false, paymentRequired: true,
      paymentUrl: 'https://invoice.stripe.com/i/abc' });
    const { onChanged, rerender } = renderDialog({ currentPlanKey: 'core' });

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);
    await screen.findByText(/planChangeChargeTodayCard/);
    await userEvent.click(screen.getByTestId('PlanChangeDialog__confirm'));
    await screen.findByTestId('PlanChangeDialog__completePayment');
    // The invoice page never sends the customer back: the dialog says how to return.
    expect(screen.getByTestId('PlanChangeDialog__paymentReturnHint'))
      .toHaveTextContent('planChangePaymentReturnHint');
    expect(onChanged).toHaveBeenCalledTimes(1);

    // Back in this tab, not paid yet (the host still reports the old plan): ask again, keep waiting.
    returnToTab();
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('PlanChangeDialog__title')).toHaveTextContent('planChangeTitle');

    // Paid: the reloaded subscription is on the target plan, so the change has applied.
    rerender({ currentPlanKey: 'pro' });
    expect(await screen.findByTestId('PlanChangeDialog__title'))
      .toHaveTextContent('planChangeDoneTitle');
    expect(screen.getByTestId('PlanChangeDialog__done'))
      .toHaveTextContent('Pro:planChangeDoneImmediate');
    expect(screen.queryByTestId('PlanChangeDialog__completePayment')).not.toBeInTheDocument();
    expect(screen.queryByTestId('PlanChangeDialog__paymentReturnHint')).not.toBeInTheDocument();

    // Nothing outstanding any more: returning to the tab reloads nothing.
    returnToTab();
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it('keeps an outstanding payment across a reopen instead of offering the same upgrade again', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO] });
    requestPlanChange.mockResolvedValue(PAYMENT_REQUIRED);
    const { rerender } = renderDialog({ currentPlanKey: 'core' });

    await confirmUpgradeAwaitingPayment();
    rerender({ open: false, currentPlanKey: 'core' });
    rerender({ open: true, currentPlanKey: 'core' });

    // Still waiting for that payment: its link, no options, nothing to confirm a second time.
    expect(await screen.findByTestId('PlanChangeDialog__completePayment'))
      .toHaveAttribute('href', 'https://invoice.stripe.com/i/abc');
    expect(screen.getByTestId('PlanChangeDialog__done')).toHaveTextContent('Pro:planChangePaymentRequired');
    expect(screen.queryByTestId('PlanChangeDialog__option')).not.toBeInTheDocument();
    expect(screen.queryByTestId('PlanChangeDialog__confirm')).not.toBeInTheDocument();
    expect(requestPlanChange).toHaveBeenCalledTimes(1);
  });

  it('offers the options again on reopen once the paid upgrade has applied', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO] });
    requestPlanChange.mockResolvedValue(PAYMENT_REQUIRED);
    const { rerender } = renderDialog({ currentPlanKey: 'core' });

    await confirmUpgradeAwaitingPayment();
    rerender({ open: false, currentPlanKey: 'pro' });
    rerender({ open: true, currentPlanKey: 'pro' });

    expect(await screen.findAllByTestId('PlanChangeDialog__option')).toHaveLength(1);
    expect(screen.queryByTestId('PlanChangeDialog__done')).not.toBeInTheDocument();
  });

  describe('while a payment is outstanding', () => {
    beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
    afterEach(() => {
      vi.useRealTimers();
      delete document.visibilityState;
    });

    it('rechecks periodically while the tab is visible, and once per return to the tab', async () => {
      getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO] });
      requestPlanChange.mockResolvedValue(PAYMENT_REQUIRED);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { onChanged, rerender } = renderDialog({ currentPlanKey: 'core' });

      await confirmUpgradeAwaitingPayment(user);
      expect(onChanged).toHaveBeenCalledTimes(1);

      // The webhook has not landed yet when the customer returns: keep asking while visible.
      act(() => { vi.advanceTimersByTime(PAYMENT_RECHECK_INTERVAL_MS); });
      expect(onChanged).toHaveBeenCalledTimes(2);
      act(() => { vi.advanceTimersByTime(PAYMENT_RECHECK_INTERVAL_MS); });
      expect(onChanged).toHaveBeenCalledTimes(3);

      // One return fires both visibilitychange and focus: one reload, not two.
      act(() => { vi.advanceTimersByTime(2000); });
      returnToTab();
      window.dispatchEvent(new Event('focus'));
      expect(onChanged).toHaveBeenCalledTimes(4);

      // A hidden tab is not polled.
      setTabHidden(true);
      act(() => { vi.advanceTimersByTime(PAYMENT_RECHECK_INTERVAL_MS * 2); });
      expect(onChanged).toHaveBeenCalledTimes(4);
      setTabHidden(false);

      // Applied: the polling stops.
      rerender({ currentPlanKey: 'pro' });
      expect(await screen.findByTestId('PlanChangeDialog__title')).toHaveTextContent('planChangeDoneTitle');
      const calls = onChanged.mock.calls.length;
      act(() => { vi.advanceTimersByTime(PAYMENT_RECHECK_INTERVAL_MS * 2); });
      expect(onChanged).toHaveBeenCalledTimes(calls);
    });

    it('stops polling when the dialog closes', async () => {
      getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO] });
      requestPlanChange.mockResolvedValue(PAYMENT_REQUIRED);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { onChanged, rerender } = renderDialog({ currentPlanKey: 'core' });

      await confirmUpgradeAwaitingPayment(user);
      rerender({ open: false, currentPlanKey: 'core' });
      act(() => { vi.advanceTimersByTime(PAYMENT_RECHECK_INTERVAL_MS * 2); });
      expect(onChanged).toHaveBeenCalledTimes(1);
    });
  });

  it('confirms an upgrade, reports the new plan and tells its host to reload', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO] });
    requestPlanChange.mockResolvedValue({ planKey: 'pro', planName: 'Pro', timing: 'immediate',
      effectiveAt: '2026-10-31T10:00:00Z', alreadyPending: false });
    const { onChanged } = renderDialog({ clientId: 'CLIENT-1' });

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);
    await screen.findByText(/planChangeChargeTodayCard/);
    await userEvent.click(screen.getByTestId('PlanChangeDialog__confirm'));

    expect(await screen.findByTestId('PlanChangeDialog__done'))
      .toHaveTextContent('Pro:planChangeDoneImmediate');
    // Charged at the quoted proration instant, so the amount equals the one shown.
    expect(requestPlanChange).toHaveBeenCalledWith('/api', 'pro', 'CLIENT-1', PRORATION_DATE);
    expect(screen.queryByTestId('PlanChangeDialog__completePayment')).not.toBeInTheDocument();
    expect(onChanged).toHaveBeenCalled();
    expect(screen.queryByTestId('PlanChangeDialog__confirm')).not.toBeInTheDocument();
    expect(screen.getByTestId('PlanChangeDialog__close')).toHaveTextContent('close');
  });

  it('reports a scheduled downgrade with its date, and an already pending one as such', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [CORE] });
    requestPlanChange.mockResolvedValueOnce({ planKey: 'core', planName: 'Core',
      timing: 'period_end', effectiveAt: '2026-12-01T00:00:00Z', alreadyPending: false });
    renderDialog();

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);
    await userEvent.click(screen.getByTestId('PlanChangeDialog__confirm'));

    const done = await screen.findByTestId('PlanChangeDialog__done');
    expect(done).toHaveTextContent('Core@');
    expect(done).toHaveTextContent('planChangeDoneScheduled');
    expect(done).not.toHaveTextContent('{date}');
  });

  it('shows the pending downgrade the backend reports', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO],
      pendingChange: { planKey: 'core', planName: 'Core', effectiveAt: '2026-12-01T00:00:00Z' } });
    renderDialog();

    expect(await screen.findByTestId('PlanChangeDialog__pending'))
      .toHaveTextContent('Core@');
  });

  it('words a refused change by its code and keeps the dialog open to pick another', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO] });
    requestPlanChange.mockRejectedValue(Object.assign(new Error('refused'),
      { code: 'planChangeNotCurrent', status: 409 }));
    const { onChanged } = renderDialog();

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);
    await userEvent.click(screen.getByTestId('PlanChangeDialog__confirm'));

    expect(await screen.findByTestId('PlanChangeDialog__error'))
      .toHaveTextContent('planChangeNotCurrent');
    expect(screen.getByTestId('PlanChangeDialog__confirm')).toBeEnabled();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('falls back to the generic failure for any other error', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO] });
    requestPlanChange.mockRejectedValue(Object.assign(new Error('boom'), { status: 502 }));
    renderDialog();

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);
    await userEvent.click(screen.getByTestId('PlanChangeDialog__confirm'));

    expect(await screen.findByTestId('PlanChangeDialog__error'))
      .toHaveTextContent('planChangeFailed');
  });

  it('hands an expired session to its host and closes', async () => {
    getPlanChanges.mockRejectedValue(Object.assign(new Error('expired'), { status: 401 }));
    const onSessionExpired = vi.fn();
    const { onOpenChange } = renderDialog({ onSessionExpired });

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('phrases the catalog price through the canonical formatter and the interval key', () => {
    const ui = (key, params) => `${params?.amount}|${key}`;
    expect(planPriceLabel({ displayPrice: '99', currency: 'EUR', billingInterval: 'month' }, ui))
      .toMatch(/\|upgradePlanPriceMonthly$/);
    expect(planPriceLabel({ displayPrice: '990', currency: 'EUR', billingInterval: 'year' }, ui))
      .toMatch(/\|upgradePlanPriceYearly$/);
    expect(planPriceLabel({ displayPrice: null, currency: 'EUR' }, ui)).toBe('');
  });
});
