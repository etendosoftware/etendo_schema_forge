import { track } from '../observability.js';
import { buildObservabilityEvent, OBSERVABILITY_EVENTS } from '../observability/events.js';

/**
 * OpenFeature evaluation hook that reports flag exposures to the observability
 * layer, so a variant can be correlated with downstream funnels.
 *
 * While the control plane is local this is the only source of exposure data.
 * Once the Mixpanel provider is registered, Mixpanel reports exposures
 * natively and this hook becomes redundant — remove it then rather than
 * double-counting.
 *
 * Two constraints shape the implementation:
 *
 * - **Never disturb evaluation.** `after` runs inside flag resolution, which is
 *   called on every render through `useFeatureFlag`. It never awaits and never
 *   throws; a reporting failure must not change what a flag resolves to.
 * - **Deduplicate.** One event per flag/value combination per session, not one
 *   per render. A flag that flips back and forth reports each distinct value
 *   once, which is what makes the event countable.
 */

/** Flag/value combinations already reported this session (page lifetime). */
const reported = new Set();

/** Exposed for tests and for callers that deliberately reset session state. */
export function resetExposureCache() {
  reported.clear();
}

export function buildExposureProperties(hookContext, evaluationDetails) {
  return {
    flagKey: hookContext?.flagKey,
    // `enabled`, not `value`: the payload sanitizer treats `value` as a numeric
    // property and silently drops booleans passed under that name.
    enabled: evaluationDetails?.value,
    variant: evaluationDetails?.variant,
    provider: hookContext?.providerMetadata?.name,
    // The targeting key travels under `username` because that property is
    // already sanctioned by the observability payload policy; introducing a new
    // identity-bearing key would widen it without adding information.
    username: hookContext?.context?.targetingKey,
  };
}

export function createFlagExposureHook({ trackImpl = track } = {}) {
  return {
    after(hookContext, evaluationDetails) {
      try {
        const { flagKey, value } = { flagKey: hookContext?.flagKey, value: evaluationDetails?.value };
        if (!flagKey || typeof value !== 'boolean') return;

        const dedupeKey = `${flagKey}:${value}`;
        if (reported.has(dedupeKey)) return;
        reported.add(dedupeKey);

        const event = buildObservabilityEvent(
          OBSERVABILITY_EVENTS.FEATURE_FLAG_EVALUATED,
          buildExposureProperties(hookContext, evaluationDetails)
        );
        // Fire-and-forget: an unresolved or rejected track must not surface
        // inside flag resolution.
        Promise.resolve(trackImpl(event.name, event.properties)).catch(() => {});
      } catch {
        // Reporting is best-effort; evaluation continues regardless.
      }
    },
  };
}
