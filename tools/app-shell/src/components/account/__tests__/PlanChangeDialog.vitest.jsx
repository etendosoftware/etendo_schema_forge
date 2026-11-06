// @covers tools/app-shell/src/components/account/PlanChangeDialog.jsx
import { render, screen, waitFor, within } from '@testing-library/react';
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
vi.mock('@/lib/upgrade/api.js', () => ({
  getPlanChanges: (...args) => getPlanChanges(...args),
  requestPlanChange: (...args) => requestPlanChange(...args),
  UPGRADE_ERROR_CODES: {
    sessionExpired: 'upgradeSessionExpired',
    planChangesUnavailable: 'planChangeUnavailable',
    planChangeNotAllowed: 'planChangeNotAllowed',
    planChangeNotCurrent: 'planChangeNotCurrent',
    planChangeFailed: 'planChangeFailed',
  },
}));

import { PlanChangeDialog, planPriceLabel } from '../PlanChangeDialog.jsx';

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

function renderDialog(props = {}) {
  const onOpenChange = vi.fn();
  const onChanged = vi.fn();
  render(<PlanChangeDialog open apiBaseUrl="/api" periodEnd="2026-12-01T00:00:00Z"
    onOpenChange={onOpenChange} onChanged={onChanged} {...props} />);
  return { onOpenChange, onChanged };
}

describe('PlanChangeDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('says a monthly-to-annual change restarts billing and the quota year today', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO_YEARLY] });
    renderDialog();

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);

    expect(screen.getByTestId('PlanChangeDialog__timingNote'))
      .toHaveTextContent('planChangeIntervalNote');
    expect(screen.queryByTestId('PlanChangeDialog__quotaKept')).not.toBeInTheDocument();
  });

  it('confirms an upgrade, reports the new plan and tells its host to reload', async () => {
    getPlanChanges.mockResolvedValue({ hasSubscription: true, changes: [PRO] });
    requestPlanChange.mockResolvedValue({ planKey: 'pro', planName: 'Pro', timing: 'immediate',
      effectiveAt: '2026-10-31T10:00:00Z', alreadyPending: false });
    const { onChanged } = renderDialog({ clientId: 'CLIENT-1' });

    await userEvent.click((await screen.findAllByTestId('PlanChangeDialog__option'))[0]);
    await userEvent.click(screen.getByTestId('PlanChangeDialog__confirm'));

    expect(await screen.findByTestId('PlanChangeDialog__done'))
      .toHaveTextContent('Pro:planChangeDoneImmediate');
    expect(requestPlanChange).toHaveBeenCalledWith('/api', 'pro', 'CLIENT-1');
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
