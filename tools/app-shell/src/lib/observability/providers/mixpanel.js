import { createMixpanelAdapter } from '@etendosoftware/app-shell-core/observability/adapters/mixpanel';
import { loadMixpanel } from '../sdk.js';
import { SAFE_EVENT_PROPERTY_KEYS } from '../payload.js';

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
} = {}) {
  return createMixpanelAdapter({
    loadSdk: loader,
    enabled,
    token,
    apiHost,
    debug,
    allowedKeys: SAFE_EVENT_PROPERTY_KEYS,
    logger,
    storage,
  });
}
