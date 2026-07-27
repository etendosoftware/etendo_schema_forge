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

/** Poll interval used when `VITE_CONFIGCAT_POLL_SECONDS` is unset or unusable. */
const DEFAULT_POLL_SECONDS = 60;

/** Reads the poll interval, falling back rather than passing NaN to the SDK. */
export function resolvePollSeconds(raw, logger = console) {
  if (raw == null || raw === '') return DEFAULT_POLL_SECONDS;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    logger.warn('[flags] VITE_CONFIGCAT_POLL_SECONDS is not a positive number — using the default');
    return DEFAULT_POLL_SECONDS;
  }
  return seconds;
}

/**
 * THE SWAP POINT — the only function that knows which control plane backs the
 * flags. `initFeatureFlags`, the `useFeatureFlag` hook, the exposure hook and
 * every call site are unaware of which provider wins.
 *
 * Precedence, highest first:
 *
 * 1. **`VITE_FEATURE_FLAGS`** — a local override beats the remote control plane
 *    on purpose, so dev and e2e stay deterministic and no test depends on the
 *    state of a shared ConfigCat project.
 * 2. **ConfigCat**, when `VITE_CONFIGCAT_SDK_KEY` is set. Auto-polling, so a
 *    toggle in the dashboard reaches a running tab without a reload.
 * 3. **In-memory defaults** — the declared safe defaults, unchanged.
 *
 * The ConfigCat SDK is imported lazily so its bundle cost lands only on builds
 * that actually configure it.
 */
export async function createFlagProvider({ env = import.meta.env, logger = console } = {}) {
  const overrides = parseFlagConfig(env.VITE_FEATURE_FLAGS, logger);
  if (Object.keys(overrides).length > 0) {
    logger.warn('[flags] VITE_FEATURE_FLAGS is set — using local overrides, not the remote control plane');
    return new InMemoryProvider(buildInMemoryConfiguration(overrides));
  }

  const sdkKey = env.VITE_CONFIGCAT_SDK_KEY;
  if (sdkKey) {
    const { ConfigCatWebProvider } = await import('@openfeature/config-cat-web-provider');
    return ConfigCatWebProvider.create(sdkKey, {
      pollIntervalSeconds: resolvePollSeconds(env.VITE_CONFIGCAT_POLL_SECONDS, logger),
    });
  }

  return new InMemoryProvider(buildInMemoryConfiguration());
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

    // Awaited because the ConfigCat branch lazy-imports its SDK. This resolves
    // from a bundled chunk, and a failure lands in the catch below as a
    // fallback to declared defaults — it never blocks rendering, which already
    // happened before this fire-and-forget call resolves.
    const provider = await createFlagProvider({ env, logger });
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
