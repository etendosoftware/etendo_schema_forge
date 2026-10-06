import { createObservability } from './observability/core.js';

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
export const disable = observability.disable;
export const enable = observability.enable;
// Feature flag exposure goes through the gateway too: a killed or disabled provider never
// loads its SDK just because a flag was evaluated.
export const addFeatureFlagEvaluation = observability.addFeatureFlagEvaluation;
