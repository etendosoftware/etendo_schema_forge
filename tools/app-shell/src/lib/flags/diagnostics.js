import { track } from '../observability.js';
import { buildObservabilityEvent, OBSERVABILITY_EVENTS } from '../observability/events.js';

const OPERATIONS = new Set(['configuration_fetch', 'context_update', 'identity_resolution', 'company_switch', 'flag_evaluation']);
const OUTCOMES = new Set(['started', 'success', 'error', 'cancelled', 'deduplicated', 'stale', 'ready']);
const PROVIDERS = new Set(['datadog', 'ConfigCatWebProvider', 'configcat', 'in-memory', 'unknown', 'none']);
const REASONS = new Set(['settled', 'inflight', 'context_changed', 'account_changed', 'company_changed', 'logout', 'missing_identity', 'provider_error', 'timeout', 'network_error', 'superseded']);
const SOURCES = new Set(['auth', 'session', 'cache', 'remote', 'startup', 'provider']);

/** Reports bounded technical labels, never a credential, URL, email or evaluation context. */
export function reportFlagDiagnostic(properties, trackImpl) {
  try {
    properties ??= {};
    if (!OPERATIONS.has(properties.operation) || !OUTCOMES.has(properties.outcome)) return;
    const safe = { operation: properties.operation, outcome: properties.outcome };
    for (const [key, values] of [['provider', PROVIDERS], ['reason', REASONS], ['source', SOURCES]]) {
      if (values.has(properties[key])) safe[key] = properties[key];
    }
    if (typeof properties.durationMs === 'number' && Number.isFinite(properties.durationMs)) {
      safe.durationMs = Math.max(0, Math.min(86400000, properties.durationMs));
    }
    // Tenant identifiers are separate from account identities and contain no email.
    if (typeof properties.account_id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(properties.account_id)) {
      safe.account_id = properties.account_id;
    }
    if (typeof properties.flagKey === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(properties.flagKey)) {
      safe.flagKey = properties.flagKey;
    }
    const event = buildObservabilityEvent(OBSERVABILITY_EVENTS.FEATURE_FLAGS_DIAGNOSTIC, safe);
    Promise.resolve((trackImpl ?? track)(event.name, event.properties)).catch(() => {});
  } catch {
    // Diagnostics must never change a flag's outcome or start another evaluation.
  }
}
