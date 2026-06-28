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
export const setContext = observability.setContext;
