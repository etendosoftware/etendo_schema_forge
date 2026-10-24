const PRODUCTIVE_PLAN = 'productive';

export function isProductiveEnvironment(environment) {
  return String(environment?.plan || '').trim().toLowerCase() === PRODUCTIVE_PLAN;
}

/**
 * ETP-5047 — the backend's lifecycle type says productive. Not the same as the plan: a canceled
 * subscription makes `plan` read "free" while `environmentType` stays "PRODUCTIVE". An environment
 * the backend reports no type for (it predates the lifecycle metadata) is not productive here.
 */
function hasProductiveType(environment) {
  return String(environment?.environmentType || '').trim().toUpperCase() === 'PRODUCTIVE';
}

/**
 * A demo can originate one productive environment. Once it has (the backend reports
 * `associatedWithProductive`), it is no longer offered as a purchase source: a later purchase
 * creates a clean productive environment (ETP-5548). A productive environment is never a source,
 * including a canceled one whose plan reads "free" (ETP-5047); the backend refuses it too. Neither
 * is a demo the account was only invited into (`ownedByAccount: false`): it is not the buyer's to
 * copy (ETP-5743). A backend that predates the field omits it, so only an explicit `false` excludes.
 */
export function isPurchaseSourceDemo(environment) {
  return Boolean(environment)
    && !isProductiveEnvironment(environment)
    && !hasProductiveType(environment)
    && environment.associatedWithProductive !== true
    && environment.ownedByAccount !== false;
}

/**
 * ETP-5742 — a productive environment whose subscription was canceled (`subscriptionStatus`
 * "EXPIRED"), as opposed to one blocked by an unpaid invoice ("PAST_DUE" past its grace). Both are
 * blocked as `SUBSCRIPTION_REQUIRED`, but only this one is fixed by re-subscribing; an unpaid
 * invoice is fixed in the payment portal. The plan is not asked: it reads "free" when the canceled
 * subscription is a closed row and "productive" when it is the older preference projection.
 */
export function isCanceledSubscription(environment) {
  return Boolean(environment)
    && (hasProductiveType(environment) || isProductiveEnvironment(environment))
    && environment.subscriptionStatus === 'EXPIRED';
}

/**
 * ETP-5742 — whether this account may re-subscribe the environment: it is canceled and the account
 * owns it. An invited member is told to ask the owner instead. Only an explicit
 * `ownedByAccount: true` qualifies; the backend checks ownership again and refuses anyone else.
 */
export function canReactivateSubscription(environment) {
  return isCanceledSubscription(environment) && ownsEnvironmentSubscription(environment);
}

/**
 * Whether this account owns the environment and so pays for it: the same signal ETP-5742 gates
 * re-subscription on. Only an explicit `ownedByAccount: true` qualifies; an invited member, or a
 * backend that predates the field, does not. The backend checks ownership again on every billing
 * call, so this only decides which copy and CTA to show.
 */
export function ownsEnvironmentSubscription(environment) {
  return environment?.ownedByAccount === true;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** The last stretch of a deadline (in days) in which a billing warning escalates. */
export const BILLING_WARNING_ESCALATION_DAYS = 3;

/**
 * ETP-5049 — the in-environment warning for a failed renewal payment, or `null` when there is none.
 *
 * A PAST_DUE subscription keeps the environment usable until `graceEndsAt` (an ISO instant the
 * backend computes with the same rule the 402 gate decides on), so the warning is shown only while
 * that instant is still ahead. Once it has passed, the gate's blocked screen takes over. No
 * `graceEndsAt` (no due date, or a backend without lifecycle metadata) means no warning.
 *
 * `graceEndsAt` is a genuine instant, not a calendar date, so it is parsed as one; the caller
 * formats its LOCAL calendar day, which is the day the block actually happens for the viewer.
 *
 * ETP-5051 (`open-and-notable-topics.md` §4.17) — `accessEnforced: false` means the per-tenant
 * environment-access kill switch is on: no block will happen on `graceEndsAt`, so the warning must
 * not promise one. It becomes `neutral` — "payment overdue", no date, never escalated — and it
 * stays up for as long as the subscription is PAST_DUE, including past `graceEndsAt`: with
 * enforcement off no blocked screen takes over, and hiding the warning there would leave the
 * tenant with no sign the payment is still owed. Only an explicit `false` counts; a backend that
 * predates the field is treated as enforcing, which is today's behaviour.
 *
 * @returns {null | { graceEndsAt: Date|null, escalated: boolean, canPay: boolean, neutral: boolean }}
 *   `escalated` — inside the last {@link BILLING_WARNING_ESCALATION_DAYS} days: more prominent and
 *   not dismissible. `canPay` — the account owns the environment and can fix the payment method.
 *   `neutral` — enforcement is off: no block date to announce.
 */
export function paymentGraceWarning(environment, now = new Date()) {
  if (environment?.subscriptionStatus !== 'PAST_DUE') return null;
  if (environment.accessEnforced === false) {
    const endsAt = environment.graceEndsAt ? new Date(environment.graceEndsAt) : null;
    return {
      graceEndsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
      escalated: false,
      canPay: ownsEnvironmentSubscription(environment),
      neutral: true,
    };
  }
  if (!environment.graceEndsAt) return null;
  const endsAt = new Date(environment.graceEndsAt);
  const remainingMs = endsAt.getTime() - now.getTime();
  if (Number.isNaN(remainingMs) || remainingMs <= 0) return null;
  return {
    graceEndsAt: endsAt,
    escalated: remainingMs <= BILLING_WARNING_ESCALATION_DAYS * DAY_MS,
    canPay: ownsEnvironmentSubscription(environment),
    neutral: false,
  };
}

/**
 * Session-scoped dismissal key for the payment warning. It names the grace window, not only the
 * client, so a later failed payment (a new `graceEndsAt`) is warned about again.
 */
export function paymentGraceWarningDismissKey(clientId, graceEndsAt) {
  return `etendo:billing-warning-dismissed:${clientId || ''}:${graceEndsAt || ''}`;
}

/** A canceled productive environment keeps its "Productive" badge although its plan reads free. */
export function environmentPlanLabelKey(environment) {
  return isProductiveEnvironment(environment) || hasProductiveType(environment)
    ? 'environmentProductive'
    : 'environmentDemo';
}

/**
 * The "N days left" key for a trial: singular for one day, so it never reads "1 days left". Only
 * English and Spanish are shipped and neither inflects further, the same `…One` convention as
 * `subscriptionGraceRemainingOne`.
 */
export function environmentTrialDaysKey(days) {
  return days === 1 ? 'environmentTrialDaysRemainingOne' : 'environmentTrialDaysRemaining';
}

/**
 * ETP-5049 — the trial state of a demo, or `null` when it has no trial to show: a productive
 * environment, or one the backend sent no `trialDaysRemaining` for.
 *
 * @returns {null | { daysRemaining: number, expired: boolean, escalated: boolean }}
 *   `escalated` — an active trial in its last {@link BILLING_WARNING_ESCALATION_DAYS} days, drawn
 *   as prominently as an expired one.
 */
export function demoTrialStatus(environment) {
  if (!environment || isProductiveEnvironment(environment)
    || !Number.isInteger(environment.trialDaysRemaining)) {
    return null;
  }
  const daysRemaining = environment.trialDaysRemaining;
  const expired = daysRemaining <= 0;
  return {
    daysRemaining,
    expired,
    escalated: !expired && daysRemaining <= BILLING_WARNING_ESCALATION_DAYS,
  };
}

/** Returns the trial status label only when the backend supplied lifecycle metadata. */
export function environmentTrialLabel(environment, ui) {
  const trial = demoTrialStatus(environment);
  if (!trial) return null;
  return trial.expired
    ? ui('environmentDemoExpired')
    : ui(environmentTrialDaysKey(trial.daysRemaining), { days: trial.daysRemaining });
}

/** Returns a commercial state label when the backend has evaluated access. */
export function environmentCommercialLabel(environment, ui) {
  if (environment?.subscriptionStatus === 'CURRENT') {
    // The plan badge already identifies the environment. Keep the paid demo
    // explicit with the commercial relationship, while productive stays simply
    // "Productive" without repeating subscription terminology.
    return isProductiveEnvironment(environment) ? null : ui('environmentIncludedWithSubscription');
  }
  if (environment?.subscriptionStatus === 'PAST_DUE') return ui('environmentPaymentGrace');
  if (environment?.accessState === 'SUBSCRIPTION_REQUIRED') return ui('environmentAccessSuspended');
  if (environment?.accessState === 'DEMO_TRIAL_EXPIRED') return ui('environmentDemoExpired');
  return null;
}

export function environmentRelationshipLabel(environment, ui) {
  if (environment?.relationship === 'OWNER') return ui('environmentOwner');
  if (environment?.relationship === 'INVITED') return ui('environmentInvited');
  return null;
}

/**
 * Keep productive tenants first. The backend uses the same ordering for the initial
 * post-login redirect, while the client applies it defensively for older backends.
 */
export function sortEnvironments(environments) {
  return [...(Array.isArray(environments) ? environments : [])].sort((left, right) => {
    const planOrder = Number(isProductiveEnvironment(right)) - Number(isProductiveEnvironment(left));
    if (planOrder !== 0) return planOrder;
    return String(left?.clientName || '').localeCompare(String(right?.clientName || ''));
  });
}
