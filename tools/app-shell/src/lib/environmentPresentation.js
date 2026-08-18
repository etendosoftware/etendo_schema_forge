const PRODUCTIVE_PLAN = 'productive';

export function isProductiveEnvironment(environment) {
  return String(environment?.plan || '').trim().toLowerCase() === PRODUCTIVE_PLAN;
}

export function environmentPlanLabelKey(environment) {
  return isProductiveEnvironment(environment) ? 'environmentProductive' : 'environmentDemo';
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
