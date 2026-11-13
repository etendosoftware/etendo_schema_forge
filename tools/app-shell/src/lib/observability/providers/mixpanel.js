import { createMixpanelAdapter } from '@etendosoftware/app-shell-core/observability/adapters/mixpanel';
import { loadMixpanel } from '../sdk.js';
import { SAFE_EVENT_PROPERTY_KEYS } from '../payload.js';

/**
 * ETP-5466 — the only hosts that emit to the Mixpanel project: production. Exact hostnames, no
 * subdomains. Local development, Playwright runs (a new device per test), staging and any other
 * host stay silent even with `VITE_MIXPANEL_ENABLED=true` and a token, so dev traffic never
 * reaches the KPIs.
 */
export const MIXPANEL_ALLOWED_HOSTS = Object.freeze(['app.etendo.software', 'app.etendo.ai']);

/**
 * Whether Mixpanel may emit from `hostname`: one of {@link MIXPANEL_ALLOWED_HOSTS}, or any host
 * when `allowLocal` is the literal `true` (`VITE_MIXPANEL_ALLOW_LOCAL`, to validate emission on
 * purpose from a developer machine).
 */
export function isMixpanelHostAllowed(hostname, allowLocal = false) {
  if (allowLocal === true || allowLocal === 'true') return true;
  const host = typeof hostname === 'string' ? hostname.trim().toLowerCase().replace(/\.$/, '') : '';
  return MIXPANEL_ALLOWED_HOSTS.includes(host);
}

/**
 * The host's Mixpanel provider (ETP-4578): the core's adapter with this app's environment
 * wiring. Mixpanel adds `$current_url` (with its full query string), `$referrer`, persisted
 * marketing parameters and super-properties to every event AFTER the gateway sanitized it, and
 * the SDK sends its `$identify` event with hooks skipped. The adapter closes that with the SDK's
 * own `property_blacklist` and `before_send_*` / `before_register*` hooks.
 *
 * Optional and off by default (D3): it needs an explicit `enabled` AND a project token. The SDK
 * is only downloaded when it is enabled and first used. The one-time stale-identity reset (GDPR,
 * ETP-4352) lives in the adapter, behind the same single gate every method funnels through.
 *
 * ETP-5466: it is also off on any host outside {@link MIXPANEL_ALLOWED_HOSTS} unless `allowLocal`
 * opts in, whatever `enabled` and the token say.
 *
 * Still open with the owner, so they stay at the conservative defaults: which SDK properties are
 * approved, whether URL properties go out as a normalized path or not at all, IP geolocation
 * (off), and whether the organization name is allowlisted (it is not).
 */
export function createMixpanelProvider({
  enabled = false,
  token,
  debug = false,
  apiHost,
  logger = console,
  loader = loadMixpanel,
  storage = globalThis.localStorage,
  hostname = globalThis.location?.hostname,
  allowLocal = false,
} = {}) {
  const hostAllowed = isMixpanelHostAllowed(hostname, allowLocal);
  // ETP-5351 — `analytics: true`: product analytics, silenced as a whole while a support session
  // is active (see `setAnalyticsSuppressed` in ../core.js).
  return Object.assign(createMixpanelAdapter({
    loadSdk: loader,
    enabled: hostAllowed ? enabled : false,
    token,
    apiHost,
    debug,
    allowedKeys: SAFE_EVENT_PROPERTY_KEYS,
    logger,
    storage,
  }), { analytics: true });
}
