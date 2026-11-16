import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import { useUI, useLocaleSwitch } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.jsx';
import { formatCurrency } from '@/lib/formatCurrency.js';
import { formatCalendarDate } from '@/lib/dateOnly.js';
import {
  getPlanChanges, previewPlanChange, requestPlanChange, UPGRADE_ERROR_CODES,
} from '@/lib/upgrade/api.js';
import {
  formatQuotaQuantity,
  isQuotaOverLimit,
  quotaResourceLabel,
} from '@/lib/planQuotas.js';
import { RENEWING_STATUSES } from '@/lib/upgrade/subscriptionStatus.js';

/** Billing interval as the catalog spells it, mapped to the key that phrases the price. */
const PRICE_LABEL_KEYS = { month: 'upgradePlanPriceMonthly', year: 'upgradePlanPriceYearly' };
const TIMING_IMMEDIATE = 'immediate';
const TIMING_PERIOD_END = 'period_end';
/** The offered "change" that keeps the current plan: it cancels the pending downgrade. */
const TIMING_KEEP = 'keep';
const TIMING_BADGE_KEYS = {
  [TIMING_IMMEDIATE]: 'planChangeTimingImmediate',
  [TIMING_PERIOD_END]: 'planChangeTimingPeriodEnd',
  [TIMING_KEEP]: 'planChangeTimingKeep',
};
const REFUSAL_CODES = new Set([
  UPGRADE_ERROR_CODES.planChangeNotAllowed, UPGRADE_ERROR_CODES.planChangeNotCurrent,
]);
/** While a payment is outstanding, how often the dialog re-reads the subscription (tab visible). */
export const PAYMENT_RECHECK_INTERVAL_MS = 5000;
/**
 * One return to the tab fires both `visibilitychange` and `focus`: a recheck this soon after the
 * previous one is the same return and is skipped.
 */
const RECHECK_DEBOUNCE_MS = 1000;

/** An upgrade still waiting for its payment: nothing changed yet, the host is not on the target. */
function isAwaitingPayment(done, currentPlanKey) {
  return Boolean(done?.paymentRequired) && currentPlanKey !== done.planKey;
}

/** The line a refused or failed change request shows: its own code for a refusal, else generic. */
function errorKeyOf(err) {
  return REFUSAL_CODES.has(err?.code) ? err.code : UPGRADE_ERROR_CODES.planChangeFailed;
}

/**
 * What happened, once the backend answered: applied now, waiting for its payment, scheduled, or
 * already pending.
 */
function doneText(done, ui, locale) {
  const plan = done.planName || done.planKey;
  if (done.pendingCancelled) return ui('planChangePendingCancelled', { plan });
  if (done.paymentRequired) return ui('planChangePaymentRequired', { plan });
  if (done.timing !== TIMING_PERIOD_END) return ui('planChangeDoneImmediate', { plan });
  const date = done.effectiveAt ? formatCalendarDate(done.effectiveAt, locale) : '';
  const key = done.alreadyPending ? 'planChangeAlreadyPending' : 'planChangeDoneScheduled';
  return ui(key, { plan, date });
}

/** The quotas of the chosen target the tenant has already exceeded; none without a target. */
function exceededQuotasOf(selected) {
  const quotas = Array.isArray(selected?.quotas) ? selected.quotas : [];
  return quotas.filter(isQuotaOverLimit);
}

/**
 * The timing note of the chosen target: keep the current plan (cancels the pending change),
 * downgrade at the period end, interval change (to annual, or to monthly), upgrade.
 */
function timingNote(selected, ui, periodEndDate, pending) {
  if (selected.timing === TIMING_KEEP) {
    return ui('planChangeKeepNote', { plan: pending?.planName || pending?.planKey || '' });
  }
  if (selected.timing === TIMING_PERIOD_END) {
    return ui('planChangePeriodEndNote', { date: periodEndDate || '' });
  }
  if (!selected.intervalChange) return ui('planChangeImmediateNote');
  // An annual-to-monthly change is not offered by default, but an operator can configure it.
  return ui(selected.billingInterval === 'month'
    ? 'planChangeIntervalToMonthlyNote' : 'planChangeIntervalNote');
}

/** `Visa` from the provider's `visa`; the brand as given when it is not a plain word. */
function cardBrandLabel(brand) {
  if (!brand) return '';
  return /^[a-z]+$/.test(brand) ? brand.charAt(0).toUpperCase() + brand.slice(1) : brand;
}

/**
 * The charge line of an upgrade: the amount today and the card it goes on, while it is
 * computed, or the fallback when the amount could not be read.
 */
function chargeText(preview, ui) {
  if (preview.status === 'loading') return ui('planChangeChargeLoading');
  if (preview.status === 'refused') return null;
  const data = preview.data;
  if (preview.status !== 'loaded' || data?.amountDue == null || !data?.currency) {
    return ui('planChangeChargeUnknown');
  }
  const amount = formatCurrency(data.currency, data.amountDue);
  const card = data.paymentMethod;
  return card?.last4
    ? ui('planChangeChargeTodayCard', { amount, brand: cardBrandLabel(card.brand), last4: card.last4 })
    : ui('planChangeChargeToday', { amount });
}

/** `{amount} per month` from the catalog's string amount and currency; '' when unpriced. */
export function planPriceLabel(plan, ui) {
  if (!plan?.displayPrice || !plan?.currency) return '';
  const amount = formatCurrency(plan.currency, plan.displayPrice);
  const key = PRICE_LABEL_KEYS[plan.billingInterval];
  return key ? ui(key, { amount }) : amount;
}

/**
 * ETP-5053 — the change-plan dialog on `/account`.
 *
 * It offers only the targets the backend lists (`GET /sws/go/billing/subscription/plan-changes`,
 * the active *Allowed plan changes* rows of the current plan — or, while a downgrade is pending, of
 * the plan it moves to, with the current plan first as `timing: "keep"`, which cancels the
 * scheduled change), and before the customer confirms it
 * states, for the chosen target:
 *
 * - the direction and timing: an upgrade applies now and the billing date does not move; a
 *   monthly-to-annual change applies now and keeps the billing date; a downgrade applies at the
 *   end of the current period (`periodEnd`);
 * - for an upgrade, the amount charged today and the saved card it goes on, quoted by the backend
 *   (`POST …/plan-change/preview`) and charged at that same proration instant on confirm;
 * - the quota consequence: usage so far carries over (the yearly quota does not restart) and,
 *   for every quota of the target the tenant has already exceeded, the numbers ("you have used X
 *   of the Y included in Z") with the warning that creates of that resource will be refused from
 *   the effective date until the next anniversary.
 *
 * Confirming posts `POST /sws/go/billing/subscription/plan-change`; the answer says whether it
 * applied now, was scheduled, or waits for a payment the customer has to complete (a decline, or
 * the bank asks to authenticate): then nothing changed yet and the dialog links to the provider's
 * invoice page. The host reloads the subscription (`onChanged`).
 *
 * That invoice page opens in its own tab and never sends the customer back (the provider's hosted
 * invoice page has no return address). While the payment is outstanding the dialog asks the host to
 * reload the subscription every time this tab becomes visible again, and every
 * `PAYMENT_RECHECK_INTERVAL_MS` while it stays visible (the webhook may land after the return);
 * once the host's `currentPlanKey` is the target plan (the paid invoice applied the change and its
 * webhook updated the subscription) the dialog turns into the "plan changed" confirmation. Closing
 * and reopening the dialog keeps that outstanding payment: offering the options again would let the
 * customer confirm the same upgrade a second time (a new quote, a second invoice).
 */
export function PlanChangeDialog({
  open, onOpenChange, apiBaseUrl, clientId = null, periodEnd = null, onChanged,
  onSessionExpired, currentPlanKey = null,
}) {
  const ui = useUI();
  const { locale } = useLocaleSwitch();
  // 'loading' | 'loaded' | 'unavailable'
  const [status, setStatus] = useState('loading');
  const [offer, setOffer] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState(null);
  const [done, setDone] = useState(null);
  // 'idle' | 'loading' | 'loaded' | 'failed', for the selected upgrade only
  const [preview, setPreview] = useState({ status: 'idle', data: null });
  // Read by the open effect without re-running it (and reloading) when the host's plan changes.
  const currentPlanKeyRef = useRef(currentPlanKey);
  useEffect(() => { currentPlanKeyRef.current = currentPlanKey; }, [currentPlanKey]);

  const load = useCallback(async () => {
    setStatus('loading');
    setErrorKey(null);
    try {
      const result = await getPlanChanges(apiBaseUrl, clientId);
      setOffer(result || { changes: [] });
      setStatus('loaded');
    } catch (err) {
      if (err?.status === 401) {
        onSessionExpired?.();
        onOpenChange?.(false);
        return;
      }
      setOffer(null);
      setStatus('unavailable');
    }
  }, [apiBaseUrl, clientId, onSessionExpired, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    setSelectedKey(null);
    // An upgrade waiting for its payment survives a reopen: the customer completes that payment
    // instead of confirming the same change again.
    setDone((prev) => (isAwaitingPayment(prev, currentPlanKeyRef.current) ? prev : null));
    setErrorKey(null);
    load();
  }, [open, load]);

  const changes = useMemo(
    () => (Array.isArray(offer?.changes) ? offer.changes.filter((c) => c?.planKey) : []),
    [offer],
  );
  const selected = changes.find((c) => c.planKey === selectedKey) || null;
  const selectedTiming = selected?.timing || null;

  useEffect(() => {
    if (!selectedKey || selectedTiming !== TIMING_IMMEDIATE) {
      setPreview({ status: 'idle', data: null });
      return undefined;
    }
    let cancelled = false;
    setErrorKey(null);
    setPreview({ status: 'loading', data: null });
    previewPlanChange(apiBaseUrl, selectedKey, clientId)
      .then((data) => { if (!cancelled) setPreview({ status: 'loaded', data }); })
      .catch((err) => {
        if (cancelled) return;
        if (err?.status === 401) {
          onSessionExpired?.();
          onOpenChange?.(false);
          return;
        }
        if (REFUSAL_CODES.has(err?.code)) {
          // The backend would refuse the change itself (past due, not allowed): say why and do
          // not let the customer confirm, instead of pretending only the amount is unknown.
          setErrorKey(err.code);
          setPreview({ status: 'refused', data: null });
          return;
        }
        setPreview({ status: 'failed', data: null });
      });
    return () => { cancelled = true; };
  }, [apiBaseUrl, clientId, selectedKey, selectedTiming, onSessionExpired, onOpenChange]);
  // ETP-5053 — the customer pays in another tab: re-read the subscription whenever this one is
  // shown again, and periodically while it stays visible (the webhook may land after the return),
  // until the change has applied or the dialog closes.
  const awaitingPayment = Boolean(open && done?.paymentRequired);
  const lastRecheckRef = useRef(0);
  useEffect(() => {
    if (!awaitingPayment) return undefined;
    const recheck = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRecheckRef.current < RECHECK_DEBOUNCE_MS) return;
      lastRecheckRef.current = now;
      onChanged?.(done);
    };
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    const timer = window.setInterval(recheck, PAYMENT_RECHECK_INTERVAL_MS);
    return () => {
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
      window.clearInterval(timer);
    };
  }, [awaitingPayment, done, onChanged]);

  useEffect(() => {
    if (done?.paymentRequired && currentPlanKey && currentPlanKey === done.planKey) {
      setDone({ ...done, paymentRequired: false, paymentUrl: null });
    }
  }, [done, currentPlanKey]);

  const pending = offer?.pendingChange || null;
  // A past-due or canceled subscription cannot change plan: say so up front, offer nothing.
  const notCurrent = status === 'loaded' && Boolean(offer?.subscriptionStatus)
    && !RENEWING_STATUSES.has(offer.subscriptionStatus);
  const periodEndDate = periodEnd ? formatCalendarDate(periodEnd, locale) : null;

  const handleConfirm = useCallback(async () => {
    if (!selected) return;
    setSubmitting(true);
    setErrorKey(null);
    try {
      const prorationDate = selected.timing === TIMING_IMMEDIATE
        ? preview.data?.prorationDate || null : null;
      const result = await requestPlanChange(apiBaseUrl, selected.planKey, clientId,
        prorationDate);
      setDone(result);
      onChanged?.(result);
    } catch (err) {
      if (err?.status === 401) {
        onSessionExpired?.();
        onOpenChange?.(false);
        return;
      }
      setErrorKey(errorKeyOf(err));
    } finally {
      setSubmitting(false);
    }
  }, [apiBaseUrl, clientId, selected, preview, onChanged, onSessionExpired, onOpenChange]);

  // A refusal or failure belongs to the option it was about: picking another one clears it.
  const selectOption = useCallback((planKey) => {
    if (planKey !== selectedKey) setErrorKey(null);
    setSelectedKey(planKey);
  }, [selectedKey]);

  const exceeded = exceededQuotasOf(selected);
  // Once a change is done (applied, scheduled or a scheduled one cancelled) the dialog is only a
  // confirmation: its own title, no instructions. An upgrade still waiting for its payment has not
  // changed anything yet, so it keeps the change-plan heading.
  const changed = Boolean(done && !done.paymentRequired);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { if (!submitting) onOpenChange?.(next); }}
      data-testid="Dialog__plan-change">
      <DialogContent className="sm:max-w-lg" data-testid="PlanChangeDialog__root"
        {...(changed ? { 'aria-describedby': undefined } : {})}>
        <DialogHeader data-testid="DialogHeader__plan-change">
          <DialogTitle data-testid="PlanChangeDialog__title">
            {ui(changed ? 'planChangeDoneTitle' : 'planChangeTitle')}
          </DialogTitle>
          {!changed && (
            <DialogDescription data-testid="PlanChangeDialog__description">
              {ui('planChangeDescription')}
            </DialogDescription>
          )}
        </DialogHeader>

        {status === 'loading' && (
          <div
            className="flex items-center gap-2 text-sm text-muted-foreground"
            data-testid="PlanChangeDialog__loading"
          >
            <Loader2 className="h-4 w-4 animate-spin" data-testid="Loader2__plan-change" />
            {ui('loading')}
          </div>
        )}

        {status === 'unavailable' && (
          <div className="space-y-3" data-testid="PlanChangeDialog__unavailable">
            <p className="text-sm text-muted-foreground">{ui('planChangeUnavailable')}</p>
            <Button type="button" variant="outline" size="sm" onClick={load}
              data-testid="PlanChangeDialog__retry">
              {ui('retry')}
            </Button>
          </div>
        )}

        {status === 'loaded' && done && (
          <div className="space-y-3" data-testid="PlanChangeDialog__doneBlock">
            <p className="text-sm" data-testid="PlanChangeDialog__done">
              {doneText(done, ui, locale)}
            </p>
            {done.paymentRequired && done.paymentUrl && (
              <Button asChild size="sm" data-testid="PlanChangeDialog__completePayment">
                <a href={done.paymentUrl} target="_blank" rel="noopener noreferrer">
                  {ui('planChangeCompletePayment')}
                </a>
              </Button>
            )}
            {done.paymentRequired && done.paymentUrl && (
              <p className="text-sm text-muted-foreground"
                data-testid="PlanChangeDialog__paymentReturnHint">
                {ui('planChangePaymentReturnHint')}
              </p>
            )}
          </div>
        )}

        {status === 'loaded' && !done && pending && (
          <p className="text-sm text-muted-foreground" data-testid="PlanChangeDialog__pending">
            {ui('subscriptionPendingChange', {
              plan: pending.planName || pending.planKey,
              date: pending.effectiveAt ? formatCalendarDate(pending.effectiveAt, locale) : '',
            })}
          </p>
        )}

        {notCurrent && !done && (
          <p className="text-sm text-destructive" data-testid="PlanChangeDialog__notCurrent">
            {ui('planChangeNotCurrent')}
          </p>
        )}

        {status === 'loaded' && !notCurrent && !done && changes.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="PlanChangeDialog__none">
            {ui('planChangeNone')}
          </p>
        )}

        {status === 'loaded' && !notCurrent && !done && changes.length > 0 && (
          <ul className="divide-y overflow-hidden rounded-md border" data-testid="PlanChangeDialog__options">
            {changes.map((change) => {
              const isSelected = change.planKey === selectedKey;
              return (
                <li key={change.planKey}>
                  <button
                    type="button"
                    className={`flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${isSelected
                      ? 'bg-primary/10 ring-2 ring-inset ring-primary'
                      : 'hover:bg-muted/60'}`}
                    aria-pressed={isSelected}
                    onClick={() => selectOption(change.planKey)}
                    data-testid="PlanChangeDialog__option"
                    data-plan-key={change.planKey}
                    data-timing={change.timing}
                    data-selected={isSelected ? 'true' : 'false'}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {isSelected
                        ? <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true"
                          data-testid="PlanChangeDialog__optionSelectedIcon" />
                        : <Circle className="h-5 w-5 shrink-0 text-muted-foreground/50" aria-hidden="true"
                          data-testid="PlanChangeDialog__optionIcon" />}
                      <span className="min-w-0">
                        <span className={`block text-sm font-medium ${isSelected ? 'text-primary' : ''}`}
                          data-testid="PlanChangeDialog__optionName">
                          {change.planName || change.planKey}
                        </span>
                        <span className="block text-xs text-muted-foreground" data-testid="PlanChangeDialog__optionPrice">
                          {planPriceLabel(change, ui)}
                        </span>
                      </span>
                    </span>
                    <Badge variant="outline" data-testid="PlanChangeDialog__optionTiming">
                      {ui(TIMING_BADGE_KEYS[change.timing] || 'planChangeTimingPeriodEnd')}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {status === 'loaded' && !done && selected && (
          <div className="space-y-2 rounded-md border p-3 text-sm" data-testid="PlanChangeDialog__consequences">
            <p data-testid="PlanChangeDialog__timingNote">
              {timingNote(selected, ui, periodEndDate, pending)}
            </p>
            {selected.timing === TIMING_IMMEDIATE && preview.status !== 'refused' && (
              <p className="font-medium" data-testid="PlanChangeDialog__charge"
                data-preview-status={preview.status}>
                {chargeText(preview, ui)}
              </p>
            )}
            {selected.timing !== TIMING_KEEP && (
              <p className="text-muted-foreground" data-testid="PlanChangeDialog__quotaKept">
                {ui('planChangeQuotaKept')}
              </p>
            )}
            {exceeded.length === 0 && Array.isArray(selected.quotas) && selected.quotas.length > 0 && (
              <p className="text-muted-foreground" data-testid="PlanChangeDialog__quotaFine">
                {ui('planChangeQuotaFine')}
              </p>
            )}
            {exceeded.length > 0 && (
              <ul className="space-y-1" data-testid="PlanChangeDialog__quotaExceeded">
                {exceeded.map((item) => (
                  <li key={item.resourceKey || item.resourceName} className="text-destructive"
                    data-testid="PlanChangeDialog__quotaExceededItem">
                    {ui('planChangeQuotaExceeded', {
                      resource: quotaResourceLabel(item) || '',
                      consumed: formatQuotaQuantity(item.consumed),
                      included: formatQuotaQuantity(item.includedQty),
                      plan: selected.planName || selected.planKey,
                    })}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {errorKey && (
          <p className="text-sm text-destructive" data-testid="PlanChangeDialog__error">
            {ui(errorKey)}
          </p>
        )}

        <DialogFooter data-testid="DialogFooter__plan-change">
          <Button type="button" variant="outline" disabled={submitting}
            onClick={() => onOpenChange?.(false)} data-testid="PlanChangeDialog__close">
            {ui(done ? 'close' : 'cancel')}
          </Button>
          {status === 'loaded' && !notCurrent && !done && changes.length > 0 && (
            <Button type="button"
              disabled={!selected || submitting || preview.status === 'loading'
                || preview.status === 'refused'}
              onClick={handleConfirm}
              data-testid="PlanChangeDialog__confirm">
              {submitting
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" data-testid="Loader2__plan-change-confirm" />
                : ui('planChangeConfirm')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PlanChangeDialog;
