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
 * including a canceled one whose plan reads "free" (ETP-5047); the backend refuses it too.
 */
export function isPurchaseSourceDemo(environment) {
  return Boolean(environment)
    && !isProductiveEnvironment(environment)
    && !hasProductiveType(environment)
    && environment.associatedWithProductive !== true;
}

/** A canceled productive environment keeps its "Productive" badge although its plan reads free. */
export function environmentPlanLabelKey(environment) {
  return isProductiveEnvironment(environment) || hasProductiveType(environment)
    ? 'environmentProductive'
    : 'environmentDemo';
}

/** Returns the trial status label only when the backend supplied lifecycle metadata. */
export function environmentTrialLabel(environment, ui) {
  if (isProductiveEnvironment(environment) || !Number.isInteger(environment?.trialDaysRemaining)) {
    return null;
  }
  return environment.trialDaysRemaining > 0
    ? ui('environmentTrialDaysRemaining', { days: environment.trialDaysRemaining })
    : ui('environmentDemoExpired');
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
