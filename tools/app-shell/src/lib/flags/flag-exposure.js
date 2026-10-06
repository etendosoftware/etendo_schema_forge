import { track, addFeatureFlagEvaluation } from '../observability.js';
import { NO_EXPOSURE_FLAGS } from './flag-keys.js';
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
 * - **Deduplicate per flag/value/provider, not per flag/value.** `initFeatureFlags`
 *   registers this hook before the real provider is ready (`createFlagProvider`
 *   awaits a dynamic import and, for ConfigCat, a network round-trip), so the
 *   very first evaluation on every page load — for essentially every session,
 *   since React's initial render is synchronous and always wins that race —
 *   goes through OpenFeature's built-in no-op default. A dedupe key that
 *   ignores the provider lets that first, transient no-op result permanently
 *   claim the session's report for that value, silently suppressing every
 *   later evaluation once the real provider (in-memory or ConfigCat) takes
 *   over — even though it may resolve the exact same boolean. Keying on the
 *   provider too reports each one exactly once instead of only the first to
 *   answer.
 */

/** Flag/value combinations already reported this session (page lifetime). */
const reported = new Set();

/** Datadog RUM feature flag keys accept identifier characters only. */
export function sanitizeRumFeatureFlagKey(flagKey) {
  const source = String(flagKey ?? '');
  let sanitized = '';
  for (const character of source.split('')) {
    const code = character.charCodeAt(0);
    const allowed = code === 95 || (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    sanitized += allowed ? character : '_';
  }
  let start = 0;
  while (sanitized[start] === '_') start += 1;
  let end = sanitized.length;
  while (end > start && sanitized[end - 1] === '_') end -= 1;
  sanitized = sanitized.slice(start, end).slice(0, 100);
  return sanitized || 'flag';
}

/**
 * Sends a real OpenFeature evaluation to Datadog RUM when the browser provider
 * is available. The SDK buffers this call before RUM initialization, so the
 * hook can remain registered before the async provider bootstrap completes.
 */
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

export function createFlagExposureHook({
  trackImpl = track,
  rumEvaluationImpl = addFeatureFlagEvaluation,
} = {}) {
  return {
    after(hookContext, evaluationDetails) {
      try {
        const { flagKey, value } = { flagKey: hookContext?.flagKey, value: evaluationDetails?.value };
        if (!flagKey || typeof value !== 'boolean') return;
        // The telemetry kill switches are read by the observability layer itself.
        if (NO_EXPOSURE_FLAGS.has(flagKey)) return;

        const provider = hookContext?.providerMetadata?.name;
        const dedupeKey = `${flagKey}:${value}:${provider}`;
        if (reported.has(dedupeKey)) return;
        reported.add(dedupeKey);

        const event = buildObservabilityEvent(
          OBSERVABILITY_EVENTS.FEATURE_FLAG_EVALUATED,
          buildExposureProperties(hookContext, evaluationDetails)
        );
        // Fire-and-forget: an unresolved or rejected track must not surface
        // inside flag resolution.
        Promise.resolve(trackImpl(event.name, event.properties)).catch(() => {});
        // The startup no-op provider is useful for business exposure telemetry,
        // but it is not a real assignment and must not enter RUM flag context.
        const normalizedProvider = String(provider || '').toLowerCase();
        const isNoOpProvider = normalizedProvider === 'no op provider' ||
          normalizedProvider === 'no-op provider' || normalizedProvider === 'noop provider';
        if (!isNoOpProvider) {
          Promise.resolve(rumEvaluationImpl(sanitizeRumFeatureFlagKey(flagKey), value)).catch(() => {});
        }
      } catch {
        // Reporting is best-effort; evaluation continues regardless.
      }
    },
  };
}
