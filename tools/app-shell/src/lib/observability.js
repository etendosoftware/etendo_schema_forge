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
export const setAnalyticsSuppressed = observability.setAnalyticsSuppressed;
export const isAnalyticsSuppressed = observability.isAnalyticsSuppressed;

// ETP-5351 — a support session sends nothing to product analytics: no Mixpanel init, no event, no
// NPS/CSAT answer, nothing towards the tenant's health score. Wired here, on the singleton every
// caller goes through, so it is decided once and before `main.jsx` initializes the providers
// (`bootSupportSession` seeds the store first; see lib/supportSession.js).
void setAnalyticsSuppressed(isSupportModeActive(getSupportSessionState()));
subscribeSupportSession((current) => {
  void setAnalyticsSuppressed(isSupportModeActive(current));
});
