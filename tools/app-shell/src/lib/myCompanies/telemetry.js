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

/** ETP-6060 — the billing CTAs that open "Mis empresas" (the `from` query parameter). */
export const MY_COMPANIES_SOURCES = Object.freeze({
  DIRECT: 'direct',
  QUOTA_BANNER: 'quota_banner',
  BILLING_BANNER: 'billing_banner',
  BLOCKED_SCREEN: 'blocked_screen',
});
const KNOWN_SOURCES = new Set(Object.values(MY_COMPANIES_SOURCES));

/** The `from` query parameter as a known source; anything else is a direct visit. */
export function myCompaniesSource(from) {
  return KNOWN_SOURCES.has(from) ? from : MY_COMPANIES_SOURCES.DIRECT;
}

/** Where "Gestionar suscripción" was pressed (`subscription_manage_clicked.source`). */
export const SUBSCRIPTION_MANAGE_SOURCES = Object.freeze({
  MY_COMPANIES_MENU: 'my_companies_menu',
  MY_COMPANIES_SECTION: 'my_companies_section',
  ACCOUNT: 'account',
});

/**
 * The page finished loading the account's companies.
 * @param {number} count companies the account can enter (owned + invited)
 * @param {string} [source] how the visit started, see {@link MY_COMPANIES_SOURCES}
 */
export function trackMyCompaniesViewed(count, source = MY_COMPANIES_SOURCES.DIRECT) {
  emit(OBSERVABILITY_EVENTS.MY_COMPANIES_VIEWED, { count, source });
}

/**
 * An owned company's subscription unfolded.
 * @param {'toggle'|'link'} source pressed by the user, or opened by a billing CTA
 */
export function trackMyCompaniesSubscriptionOpened(source) {
  emit(OBSERVABILITY_EVENTS.MY_COMPANIES_SUBSCRIPTION_OPENED, { source });
}

/** "Gestionar suscripción" pressed; `source` is one of {@link SUBSCRIPTION_MANAGE_SOURCES}. */
export function trackSubscriptionManageClicked(source) {
  emit(OBSERVABILITY_EVENTS.SUBSCRIPTION_MANAGE_CLICKED, { source });
}

/** "Ir a Mis empresas" pressed on /account. */
export function trackAccountSubscriptionMovedClicked() {
  emit(OBSERVABILITY_EVENTS.ACCOUNT_SUBSCRIPTION_MOVED_CLICKED);
}

/** "Acceder" pressed on a company, before the switch starts. */
export function trackMyCompaniesEnterClicked(env) {
  emit(OBSERVABILITY_EVENTS.MY_COMPANIES_ENTER_CLICKED, { type: companyRelationship(env) });
}

/** The switch to a company was refused or failed; the user stays on the page. */
export function trackMyCompaniesEnterFailed(env) {
  emit(OBSERVABILITY_EVENTS.MY_COMPANIES_ENTER_FAILED, { type: companyRelationship(env) });
}
