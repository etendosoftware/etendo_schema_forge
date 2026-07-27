import { OpenFeature, InMemoryProvider } from '@openfeature/web-sdk';
import { FLAG_DEFAULTS } from './flag-keys.js';

/**
 * Feature-flag bootstrap.
 *
 * Application API: OpenFeature. Control plane: Mixpanel Feature Flags, reached
 * through the official `@mixpanel/openfeature-web-provider`.
 *
 * Three rules hold no matter what happens at runtime:
 *
 * 1. Safe defaults live in code (`flag-keys.js`). When no provider is
 *    registered, OpenFeature's built-in no-op provider returns the default the
 *    caller passed, so an unconfigured or unreachable control plane silently
 *    yields today's behaviour.
 * 2. Nothing here blocks rendering. `initFeatureFlags()` is fire-and-forget and
 *    never rejects; flag reads are synchronous and answer immediately.
 * 3. Flags gate what is *shown*. They are not an authorization boundary — the
 *    backend enforces access independently.
 */

/** Serve cached variants immediately, refresh in the background. */
const FLAG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Bound provider startup so a hung control plane never leaves init pending. */
const PROVIDER_READY_TIMEOUT_MS = 5000;

/** Isolates flag storage from the analytics Mixpanel instance. */
const FLAGS_PERSISTENCE_NAME = 'sf_flags';

function isEnabled(value) {
  return value === true || value === 'true';
}

/**
 * Reads the identity the control plane buckets on.
 *
 * `sf_auth_user` / `sf_auth_client_id` are the same keys the observability
 * layer reports to Mixpanel, so flag targeting and analytics agree on who the
 * user is.
 */
export function readSessionContext(storage = globalThis.localStorage) {
  try {
    return {
      username: storage?.getItem('sf_auth_user') || undefined,
      clientId: storage?.getItem('sf_auth_client_id') || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Builds the OpenFeature evaluation context.
 *
 * `distinct_id` is load-bearing: Mixpanel's flags API buckets on the
 * `distinct_id` it finds in the flag context, and an explicit value overrides
 * the instance's anonymous device id. Without it every user would be bucketed
 * as a different anonymous visitor. `targetingKey` carries the same identity in
 * OpenFeature's own vocabulary so the context stays portable across providers.
 */
export function buildEvaluationContext({ username, clientId } = {}) {
  const context = {};
  if (username) {
    context.targetingKey = username;
    context.distinct_id = username;
  }
  if (clientId) {
    context.account_id = clientId;
  }
  return context;
}

/**
 * Parses `VITE_FEATURE_FLAGS_OVERRIDE`, a JSON map of flag key to boolean used
 * to drive local development and demos without a Mixpanel project.
 * Returns null when unset or malformed.
 */
export function parseFlagOverrides(raw, logger = console) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed).filter(([, value]) => typeof value === 'boolean');
    return entries.length ? Object.fromEntries(entries) : null;
  } catch {
    logger.warn('[flags] VITE_FEATURE_FLAGS_OVERRIDE is not valid JSON — ignoring it');
    return null;
  }
}

/** Translates an override map into an OpenFeature in-memory flag configuration. */
export function buildOverrideConfiguration(overrides) {
  return Object.fromEntries(
    Object.entries({ ...FLAG_DEFAULTS, ...overrides }).map(([key, value]) => [
      key,
      {
        variants: { on: true, off: false },
        defaultVariant: value ? 'on' : 'off',
        disabled: false,
      },
    ])
  );
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(resolve, ms)),
  ]);
}

/**
 * Mixpanel options for the flags-only instance.
 *
 * The provider spins up its own named Mixpanel instance, so this config is
 * deliberately inert for analytics: no autotracking, no page views, no session
 * recording, and its own persistence key. Only flag traffic comes from it.
 */
export function buildMixpanelFlagsConfig({ apiHost, debug, context } = {}) {
  return {
    ...(apiHost ? { api_host: apiHost } : {}),
    debug: isEnabled(debug),
    autotrack: false,
    track_pageview: false,
    record_sessions_percent: 0,
    batch_requests: false,
    persistence_name: FLAGS_PERSISTENCE_NAME,
    flags: {
      context,
      persistence: {
        variantLookupPolicy: 'persistenceUntilNetworkSuccess',
        persistenceTtlMs: FLAG_CACHE_TTL_MS,
      },
    },
  };
}

/**
 * Registers a flag provider. Safe to call once at startup; never rejects.
 *
 * Resolves to the name of the provider that ended up registered, which is
 * useful for logging and tests: 'in-memory' for a local override, 'mixpanel'
 * when the control plane is wired, or 'none' when flags fall back to defaults.
 */
export async function initFeatureFlags({
  env = import.meta.env,
  logger = console,
  storage = globalThis.localStorage,
  loadProvider = () => import('@mixpanel/openfeature-web-provider'),
} = {}) {
  try {
    const context = buildEvaluationContext(readSessionContext(storage));
    await OpenFeature.setContext(context);

    const overrides = parseFlagOverrides(env.VITE_FEATURE_FLAGS_OVERRIDE, logger);
    if (overrides) {
      logger.warn('[flags] Using local VITE_FEATURE_FLAGS_OVERRIDE — not the Mixpanel control plane');
      await OpenFeature.setProviderAndWait(new InMemoryProvider(buildOverrideConfiguration(overrides)));
      return 'in-memory';
    }

    const token = env.VITE_MIXPANEL_TOKEN;
    if (!isEnabled(env.VITE_MIXPANEL_ENABLED) || !token) {
      // Expected in local dev and CI: leave the no-op provider in place so
      // every flag resolves to its declared default.
      return 'none';
    }

    const { MixpanelProvider } = await loadProvider();
    const provider = MixpanelProvider.create(
      token,
      buildMixpanelFlagsConfig({
        apiHost: env.VITE_MIXPANEL_API_HOST,
        debug: env.VITE_MIXPANEL_DEBUG,
        context,
      })
    );

    // A slow control plane must not keep this promise pending forever. If the
    // provider becomes ready after the timeout it emits PROVIDER_READY and
    // subscribed components re-render then.
    await withTimeout(OpenFeature.setProviderAndWait(provider), PROVIDER_READY_TIMEOUT_MS);
    return 'mixpanel';
  } catch (error) {
    logger.warn('[flags] Provider unavailable — falling back to declared defaults', error);
    return 'none';
  }
}

/**
 * Re-targets flag evaluation after the user signs in, so bucketing follows the
 * real identity instead of the anonymous one captured at startup.
 */
export async function setFeatureFlagContext({ username, clientId } = {}, logger = console) {
  try {
    await OpenFeature.setContext(buildEvaluationContext({ username, clientId }));
  } catch (error) {
    logger.warn('[flags] Could not update evaluation context', error);
  }
}
