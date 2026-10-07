import { createObservability } from './observability/core.js';
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
export const identify = observability.identify;
export const group = observability.group;
export const groupSet = observability.groupSet;
export const captureException = observability.captureException;
export const flush = observability.flush;
export const reset = observability.reset;
export const setContext = observability.setContext;
// Feature flag exposure is routed through the shared facade so disabled
// providers never load their SDK just because a flag was evaluated.
export const addFeatureFlagEvaluation = observability.addFeatureFlagEvaluation;
export const setAnalyticsSuppressed = observability.setAnalyticsSuppressed;
export const isAnalyticsSuppressed = observability.isAnalyticsSuppressed;

// ETP-5351 — a support session sends no product event anywhere: Mixpanel stays off entirely and
// Datadog gets no custom action (monitoring stays on, marked `support_session`), so no NPS/CSAT
// answer and nothing towards the tenant's health score. Wired here, on the singleton every
// caller goes through, so it is decided once and before `main.jsx` initializes the providers
// (`bootSupportSession` seeds the store first; see lib/supportSession.js).
void setAnalyticsSuppressed(isSupportModeActive(getSupportSessionState()));
subscribeSupportSession((current) => {
  void setAnalyticsSuppressed(isSupportModeActive(current));
});
