import { track } from '@/lib/observability.js';
import { OBSERVABILITY_EVENTS, buildObservabilityEvent } from '@/lib/observability/events.js';

/*
 * ETP-5734 — Mixpanel reporting for the "Mis empresas" page, the measurement behind the
 * `my-companies-page` rollout: exposed accounts -> page viewed -> another company entered.
 *
 * Fire-and-forget, like `lib/mcpConnectTelemetry.js`: a failed `track()` must never block or
 * break the page it reports on. Only counts and the relationship travel — never a company name
 * or id.
 */

function emit(eventDefinition, properties = {}) {
  const event = buildObservabilityEvent(eventDefinition, properties);
  if (!event.name) return;
  Promise.resolve(track(event.name, event.properties)).catch(() => {});
}

/** The account's relationship to a company, as reported in the `type` property. */
export function companyRelationship(env) {
  return env?.relationship === 'OWNER' ? 'owner' : 'guest';
}

/**
 * The page finished loading the account's companies.
 * @param {number} count companies the account can enter (owned + invited)
 */
export function trackMyCompaniesViewed(count) {
  emit(OBSERVABILITY_EVENTS.MY_COMPANIES_VIEWED, { count });
}

/** "Acceder" pressed on a company, before the switch starts. */
export function trackMyCompaniesEnterClicked(env) {
  emit(OBSERVABILITY_EVENTS.MY_COMPANIES_ENTER_CLICKED, { type: companyRelationship(env) });
}

/** The switch to a company was refused or failed; the user stays on the page. */
export function trackMyCompaniesEnterFailed(env) {
  emit(OBSERVABILITY_EVENTS.MY_COMPANIES_ENTER_FAILED, { type: companyRelationship(env) });
}
