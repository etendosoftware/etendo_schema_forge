import { createObservability } from './observability/core.js';
import { pushUserIdentified } from './marketing/dataLayer.js';
import {
  getSupportSessionState,
  isSupportModeActive,
  subscribeSupportSession,
} from './supportSession.js';

export { createObservability } from './observability/core.js';
export { buildKpiProperties, trackKpiEvent } from './observability/kpi.js';

const observability = createObservability();

export const initObservability = observability.initObservability;
export const track = observability.track;
export const page = observability.page;
// ETP-6363 — the account the analytics identify is also marketing's `user_identified` (GTM's
// dataLayer; once per account and page load, nothing where GTM is not loaded).
export const identify = (userId, traits) => {
  pushUserIdentified(userId);
  return observability.identify(userId, traits);
};
export const group = observability.group;
export const groupSet = observability.groupSet;
export const captureException = observability.captureException;
export const flush = observability.flush;
export const reset = observability.reset;
export const setContext = observability.setContext;
export const disable = observability.disable;
export const enable = observability.enable;
// Feature flag exposure goes through the gateway too: a killed or disabled provider never
// loads its SDK just because a flag was evaluated.
export const addFeatureFlagEvaluation = observability.addFeatureFlagEvaluation;
export const setAnalyticsSuppressed = observability.setAnalyticsSuppressed;
export const isAnalyticsSuppressed = observability.isAnalyticsSuppressed;

// ETP-5351 — a support session sends no product event anywhere: Mixpanel stays off entirely and
// Datadog gets no custom action (monitoring stays on, marked `support_session`), so no NPS/CSAT
// answer and nothing towards the tenant's health score. Wired here, on the singleton every
// caller goes through, so it is decided once and before `main.jsx` initializes the providers
// (`bootSupportSession` seeds the store first; see lib/supportSession.js).
setAnalyticsSuppressed(isSupportModeActive(getSupportSessionState()));
subscribeSupportSession((current) => {
  setAnalyticsSuppressed(isSupportModeActive(current));
});
