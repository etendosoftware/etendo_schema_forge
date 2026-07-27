import { OpenFeature, InMemoryProvider } from '@openfeature/web-sdk';
import { FLAG_DEFAULTS } from './flag-keys.js';
import { createFlagExposureHook } from './flag-exposure.js';

/**
 * Feature-flag bootstrap.
 *
 * Application API: OpenFeature. Control plane: currently local — flags are
 * served by OpenFeature's `InMemoryProvider`, seeded from `VITE_FEATURE_FLAGS`.
 * Mixpanel Feature Flags is the planned control plane (team plan §5.6); see
 * `createFlagProvider` below, which is the only place that has to change.
 *
 * Three rules hold no matter which provider is registered:
 *
 * 1. Safe defaults live in code (`flag-keys.js`) and describe today's shipped
 *    behaviour, so a missing or broken provider degrades to the current
 *    product rather than exposing unfinished work.
 * 2. Nothing here blocks rendering. `initFeatureFlags()` is fire-and-forget and
 *    never rejects; flag reads are synchronous and answer immediately.
 * 3. Flags gate what is *shown*. They are not an authorization boundary — the
 *    backend enforces access independently.
 */

/**
 * Bounds provider startup. The in-memory provider is synchronous so this never
 * trips today; it is the guard that keeps rule 2 true for a future network
 * provider, so swapping one in cannot silently make startup block.
 */
const PROVIDER_READY_TIMEOUT_MS = 5000;

/**
 * Reads the identity flags are evaluated against.
 *
 * `sf_auth_user` / `sf_auth_client_id` are the same keys the observability
 * layer reports, so flag targeting and analytics agree on who the user is.
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

/** Builds the OpenFeature evaluation context. */
export function buildEvaluationContext({ username, clientId } = {}) {
  const context = {};
  if (username) {
    context.targetingKey = username;
  }
  if (clientId) {
    context.account_id = clientId;
  }
  return context;
}

/**
 * Parses `VITE_FEATURE_FLAGS` — a JSON map of flag key to boolean, e.g.
 * `{"tenant-upgrade":true}`. Returns an empty map when unset or malformed, so
 * a bad value degrades to the declared defaults instead of breaking startup.
 */
export function parseFlagConfig(raw, logger = console) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'boolean')
    );
  } catch {
    logger.warn('[flags] VITE_FEATURE_FLAGS is not valid JSON — falling back to defaults');
    return {};
  }
}

/**
 * Turns the declared defaults plus any env overrides into an OpenFeature
 * in-memory flag configuration. Defaults are seeded first so every known flag
 * resolves even when the env names only a subset.
 */
export function buildInMemoryConfiguration(overrides = {}) {
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

/**
 * THE SWAP POINT — the only function that knows which control plane backs the
 * flags. Moving to Mixpanel means changing this function and nothing else:
 * `initFeatureFlags`, the `useFeatureFlag` hook, the exposure hook and every
 * call site stay exactly as they are.
 *
 * When wiring `@mixpanel/openfeature-web-provider`, note that Mixpanel's flags
 * API buckets on `distinct_id` in the flag context, *not* on OpenFeature's
 * `targetingKey`. `buildEvaluationContext` must then also set
 * `distinct_id: username`, otherwise every user is bucketed as a separate
 * anonymous visitor.
 */
export function createFlagProvider({ env = import.meta.env, logger = console } = {}) {
  const config = buildInMemoryConfiguration(parseFlagConfig(env.VITE_FEATURE_FLAGS, logger));
  return new InMemoryProvider(config);
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise(resolve => setTimeout(resolve, ms))]);
}

/**
 * Registers the flag provider and the exposure hook. Safe to call once at
 * startup; never rejects.
 *
 * Resolves to the registered provider's name — useful for logging and tests.
 * `'none'` means registration failed and flags fall back to declared defaults.
 */
export async function initFeatureFlags({
  env = import.meta.env,
  logger = console,
  storage = globalThis.localStorage,
} = {}) {
  try {
    await OpenFeature.setContext(buildEvaluationContext(readSessionContext(storage)));

    // Registered before the provider so the earliest evaluations are counted.
    OpenFeature.addHooks(createFlagExposureHook());

    const provider = createFlagProvider({ env, logger });
    await withTimeout(OpenFeature.setProviderAndWait(provider), PROVIDER_READY_TIMEOUT_MS);
    return provider.metadata?.name ?? 'unknown';
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
