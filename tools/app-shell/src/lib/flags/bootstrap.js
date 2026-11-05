import { OpenFeature, TypedInMemoryProvider } from '@openfeature/web-sdk';
import { FLAG_DEFAULTS } from './flag-keys.js';
import { createFlagExposureHook, resetExposureCache } from './flag-exposure.js';

import { reset, identify, group } from '../observability.js';
import { loadDatadogFlags } from '../observability/sdk.js';
import { authHeaders, apiFetch } from '@etendosoftware/app-shell-core/auth/api';
import { clearSessionIdentity, getSessionIdentity, setSessionIdentity } from '../sessionIdentity.js';
import { reportFlagDiagnostic } from './diagnostics.js';
/**
 * Feature-flag bootstrap.
 *
 * Application API: OpenFeature. Remote control plane: Datadog Feature Flags,
 * with ConfigCat kept as a fallback until the cutover completes (ETP-5751).
 * Local overrides use OpenFeature's `TypedInMemoryProvider`, seeded from
 * `VITE_FEATURE_FLAGS`. `createFlagProvider` below is the only provider
 * selection point.
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
 * Bounds provider startup. The in-memory provider is synchronous; the remote
 * ones fetch configuration over the network, and this guard keeps rule 2 true
 * when that fetch hangs.
 */
const PROVIDER_READY_TIMEOUT_MS = 5000;

/**
 * Where the account identity is cached between loads. It arrives from
 * `/sws/neo/session`, which needs a token, so caching it lets the first
 * evaluation after a reload target correctly instead of waiting for the fetch.
 */
const ACCOUNT_ID_KEY = 'sf_account_id';
const ACCOUNT_EMAIL_KEY = 'sf_account_email';

/**
 * Forgets the cached account identity.
 *
 * ETP-5202 — the core's `createLocalAuthStorage().clear()` wipes the `sf_auth_*` keys and
 * `sf_platform_token`, but it knows nothing about these two, so a logout used to leave the
 * previous account's identity behind in storage. That is both an identity leak on a shared
 * computer and a correctness problem: anything that reads the cache to decide "who is signed
 * in" would answer with a person who signed out. Wired into `clearSessionScopedState`, which
 * runs on every session change including the automatic 401 logout.
 */
let identityGeneration = 0;
let identityResetBarrier = Promise.resolve();
let pendingContextUpdate;
let verifiedAccount;

/** Serializes provider cleanup so a new identity cannot be assigned over a pending reset. */
export function waitForIdentityReset() {
  return identityResetBarrier;
}

export function clearAccountIdentity(storage = globalThis.localStorage, reason = 'logout') {
  identityGeneration += 1;
  pendingContextUpdate = undefined;
  verifiedAccount = undefined;
  reportFlagDiagnostic({ operation: 'context_update', outcome: 'started', reason });
  resetExposureCache();
  clearSessionIdentity();
  const cleared = identityResetBarrier.then(() => Promise.allSettled([
    reset(),
    OpenFeature.setContext({}),
  ]));
  identityResetBarrier = cleared.catch(() => {});
  try {
    storage?.removeItem(ACCOUNT_ID_KEY);
    storage?.removeItem(ACCOUNT_EMAIL_KEY);
  } catch {
    // Storage may be unavailable; there is nothing to fall back to and nothing to report.
  }
  return cleared;
}

/**
 * Reads the identity flags are evaluated against.
 *
 * Username and client come from the in-memory session identity, the same source the
 * observability layer reports, so flag targeting and analytics agree on who the user is.
 * ETP-5455: they used to come from the legacy sf_auth_user / sf_auth_client_id keys, which
 * nothing writes since the cookie session, so every signed-in user was targeted as anonymous.
 */
export function readSessionContext(storage = globalThis.localStorage) {
  const { username, clientId } = getSessionIdentity();
  try {
    return {
      username,
      clientId,
      accountId: storage?.getItem(ACCOUNT_ID_KEY) || undefined,
      accountEmail: storage?.getItem(ACCOUNT_EMAIL_KEY) || undefined,
    };
  } catch {
    return {};
  }
}

/**
 * Builds the OpenFeature evaluation context.
 *
 * The trimmed original-case account email matches the backend targeting key.
 * `username` only stands in until a complete account is available. `email` is the
 * explicit account attribute remote targeting rules can read; it is trimmed and
 * lowercased because Datadog's ONE_OF/MATCHES rules compare case-sensitively
 * against lowercase values (ETP-5751). The targeting key is left as-is.
 *
 * `account_id` is the AD_Client — a different identity that predates this and
 * is what the observability layer groups by. Do not conflate it with
 * `accountId`.
 */
export function buildEvaluationContext({ username, clientId, accountId, accountEmail } = {}) {
  const context = {};
  // Backend FeatureFlagContext.forAccount uses the trimmed, original-case email.
  const accountKey = typeof accountEmail === 'string' ? accountEmail.trim() : '';
  const targetingKey = accountKey || username;
  if (targetingKey) {
    context.targetingKey = targetingKey;
  }
  if (accountId) {
    context.accountId = accountId;
  }
  const email = typeof accountEmail === 'string' ? accountEmail.trim().toLowerCase() : '';
  if (email) {
    context.email = email;
    context.Email = accountKey;
  }
  if (clientId) {
    context.account_id = clientId;
    context.clientId = clientId;
  }
  return context;
}

/**
 * Parses `VITE_FEATURE_FLAGS` — a JSON map of flag key to boolean or finite
 * number, e.g. `{"proof-of-concept-menu":true,"import-batch-size":10}`. Returns an empty map when unset or malformed, so
 * a bad value degrades to the declared defaults instead of breaking startup.
 */
export function parseFlagConfig(raw, logger = console) {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
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
      typeof value === 'number'
        // A numeric flag carries its number as its one variant.
        ? { variants: { value }, defaultVariant: 'value', disabled: false }
        : {
          variants: { on: true, off: false },
          defaultVariant: value ? 'on' : 'off',
          disabled: false,
        },
    ])
  );
}

/** Poll interval for ConfigCat changes without a reload. */
export function resolvePollSeconds(raw, logger = console) {
  const seconds = raw == null || raw === '' ? 60 : Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return seconds;
  logger.warn('[flags] VITE_CONFIGCAT_POLL_SECONDS must be positive; using 60');
  return 60;
}

export const CONFIGCAT_PROVIDER_NAME = 'ConfigCatWebProvider';
export const DATADOG_PROVIDER_NAME = 'datadog';

/** Same bound as ConfigCat's `maxInitWaitTimeSeconds`, inside the readiness timeout. */
const DATADOG_FETCH_TIMEOUT_MS = 4000;

const REMOTE_PROVIDERS = ['datadog', 'configcat'];

/**
 * The flag provider reuses the RUM application, so it needs exactly the four
 * values RUM needs. `VITE_DATADOG_ENABLED` is deliberately not one of them:
 * flags and RUM telemetry are switched independently.
 */
export function hasDatadogFlagCredentials(env = {}) {
  return Boolean(env.VITE_DATADOG_APPLICATION_ID && env.VITE_DATADOG_CLIENT_TOKEN &&
    env.VITE_DATADOG_SITE && env.VITE_APP_ENV);
}

/**
 * Picks the remote control plane: `'datadog'`, `'configcat'` or `undefined`
 * (declared defaults). `VITE_FLAGS_PROVIDER` names a preference; unset, Datadog
 * wins when its credentials are present. A preferred provider that is not
 * configured falls through to the other one rather than to defaults, so a
 * half-configured build still evaluates remotely.
 */
export function resolveRemoteFlagProvider(env = {}, logger = console) {
  const raw = String(env.VITE_FLAGS_PROVIDER ?? '').trim().toLowerCase();
  if (raw && !REMOTE_PROVIDERS.includes(raw)) {
    logger.warn(`[flags] Unknown VITE_FLAGS_PROVIDER "${raw}" — expected datadog or configcat`);
  }
  const configured = {
    datadog: hasDatadogFlagCredentials(env),
    configcat: Boolean(env.VITE_CONFIGCAT_SDK_KEY),
  };
  const preferred = REMOTE_PROVIDERS.includes(raw) ? raw : 'datadog';
  if (configured[preferred]) return preferred;
  if (raw === preferred) logger.warn(`[flags] VITE_FLAGS_PROVIDER=${raw} is not configured — trying the fallback`);
  return REMOTE_PROVIDERS.find(name => configured[name]);
}

/**
 * Datadog's own RUM integration (`enableRumFeatureFlagTracking`) is switched
 * off: `flag-exposure.js` is the single RUM exposure source for every provider.
 * Leaving both on would record each flag twice in RUM — the SDK under the raw
 * key (`import-batch-size`), the hook under the sanitized one
 * (`import_batch_size`) — and the SDK would also merge the RUM user into the
 * evaluation context, which must stay exactly what `buildEvaluationContext`
 * built. Exposure logging and evaluation telemetry stay on: they feed the
 * Feature Flags product's own intake, which nothing else reports to.
 */
export function buildDatadogFlagOptions(env) {
  return {
    applicationId: env.VITE_DATADOG_APPLICATION_ID,
    clientToken: env.VITE_DATADOG_CLIENT_TOKEN,
    site: env.VITE_DATADOG_SITE,
    env: env.VITE_APP_ENV,
    service: env.VITE_DATADOG_SERVICE || 'etendo-go-web',
    ...(env.VITE_APP_VERSION ? { version: env.VITE_APP_VERSION } : {}),
    enableRumFeatureFlagTracking: false,
    enableExposureLogging: true,
    enableFlagEvaluationTracking: true,
  };
}

/** A hosted assignment is valid only for the context that fetched it. */
function guardContextAssignments(provider) {
  let acceptedSignature;
  let requestGeneration = 0;
  for (const method of ['initialize', 'onContextChange']) {
    if (typeof provider[method] !== 'function') continue;
    const apply = provider[method].bind(provider);
    provider[method] = async (...args) => {
      const generation = ++requestGeneration;
      const context = (method === 'initialize' ? args[0] : args[1]) ?? {};
      const result = await apply(...args);
      if (generation === requestGeneration && provider.status !== 'ERROR' && provider.status !== 'FATAL') {
        acceptedSignature = contextSignature(context);
      }
      return result;
    };
  }
  for (const method of ['resolveBooleanEvaluation', 'resolveNumberEvaluation', 'resolveStringEvaluation', 'resolveObjectEvaluation']) {
    if (typeof provider[method] !== 'function') continue;
    const resolve = provider[method].bind(provider);
    provider[method] = (key, fallback, context = {}, ...rest) => {
      if (contextSignature(context) !== acceptedSignature) {
        return { value: fallback, reason: 'ERROR', errorCode: 'PROVIDER_NOT_READY',
          errorMessage: 'Assignments are unavailable for the current evaluation context' };
      }
      return resolve(key, fallback, context, ...rest);
    };
  }
  return provider;
}

async function createDatadogFlagProvider(env, loader, fetchOverride) {
  const { DatadogProvider, withTimeout: withFetchTimeout } = await loader();
  // raw-fetch-ok: the SDK's own request to Datadog's flag endpoint, not an Etendo API call.
  const fetchImpl = fetchOverride ?? (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : undefined);
  const boundedFetch = fetchImpl ? withFetchTimeout(fetchImpl, DATADOG_FETCH_TIMEOUT_MS) : undefined;
  const diagnosticFetch = boundedFetch ? async (...args) => {
    const started = Date.now();
    reportFlagDiagnostic({ operation: 'configuration_fetch', outcome: 'started', provider: DATADOG_PROVIDER_NAME });
    try {
      const response = await boundedFetch(...args);
      reportFlagDiagnostic({ operation: 'configuration_fetch', outcome: response.ok ? 'success' : 'error',
        provider: DATADOG_PROVIDER_NAME, durationMs: Date.now() - started, reason: response.ok ? undefined : 'network_error' });
      return response;
    } catch (error) {
      const cancelled = args[1]?.signal?.aborted;
      let reason = 'network_error';
      if (cancelled) reason = 'superseded';
      else if (error?.name === 'TimeoutError') reason = 'timeout';
      reportFlagDiagnostic({ operation: 'configuration_fetch', outcome: cancelled ? 'cancelled' : 'error',
        provider: DATADOG_PROVIDER_NAME, durationMs: Date.now() - started, reason });
      throw error;
    }
  } : undefined;
  const provider = new DatadogProvider({
    ...buildDatadogFlagOptions(env),
    ...(diagnosticFetch ? { flagConfigurationFetch: diagnosticFetch } : {}),
  });
  provider.metadata = { ...(provider.metadata || {}), name: DATADOG_PROVIDER_NAME };
  return guardContextAssignments(provider);
}

async function createConfigCatFlagProvider(env, logger, loader) {
  const { ConfigCatWebProvider } = await loader();
  const provider = ConfigCatWebProvider.create(env.VITE_CONFIGCAT_SDK_KEY, {
    pollIntervalSeconds: resolvePollSeconds(env.VITE_CONFIGCAT_POLL_SECONDS, logger),
    maxInitWaitTimeSeconds: 4,
  });
  // Pin metadata independently of the provider class name so minification cannot
  // fragment exposure telemetry across builds.
  provider.metadata = { ...(provider.metadata || {}), name: CONFIGCAT_PROVIDER_NAME };
  return provider;
}

export async function createFlagProvider({ env = import.meta.env, logger = console,
  loader = () => import('@openfeature/config-cat-web-provider'),
  // Injected, never imported here: the flags SDK reports exposure events to Datadog itself, so
  // it is a provider SDK like any other and `lib/observability/sdk.js` is its one home
  // (ETP-4578). The seam stays a default parameter, so tests still pass their own loader.
  datadogLoader = loadDatadogFlags,
  datadogFetch,
} = {}) {
  const overrides = parseFlagConfig(env.VITE_FEATURE_FLAGS, logger);
  if (Object.keys(overrides).length > 0) {
    return new TypedInMemoryProvider(buildInMemoryConfiguration(overrides));
  }
  const remote = resolveRemoteFlagProvider(env, logger);
  if (remote === 'datadog') return createDatadogFlagProvider(env, datadogLoader, datadogFetch);
  if (remote === 'configcat') return createConfigCatFlagProvider(env, logger, loader);
  return new TypedInMemoryProvider(buildInMemoryConfiguration());
}

async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Feature flag readiness timed out')), ms);
    })]);
  } finally { clearTimeout(timer); }
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
    const initialIdentity = readSessionContext(storage);
    // Cached account data is not proof of the cookie's current account. Until
    // auth restores a session, initialize anonymously rather than target a prior user.
    await OpenFeature.setContext(buildEvaluationContext(
      verifiedAccount ? initialIdentity : { username: initialIdentity.username, clientId: initialIdentity.clientId }
    ));

    // Registered before the provider so the earliest evaluations are counted.
    OpenFeature.addHooks(createFlagExposureHook());

    // Awaited because the remote branches lazy-import their SDK. This resolves
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
 *
 * Only account fields already verified for this session may be reused.
 * Explicit account fields replace cached ownership, including absent fields.
 */
function contextSignature(context) {
  return JSON.stringify(Object.entries(context).sort(([a], [b]) => a.localeCompare(b)));
}

function accountOwnerChanged(identity, cached) {
  return Boolean(
    (identity.accountId && cached.accountId && identity.accountId !== cached.accountId) ||
    (!identity.accountId && identity.accountEmail && cached.accountEmail && identity.accountEmail !== cached.accountEmail)
  );
}

function isProviderUsable() {
  const status = OpenFeature.getProviderStatus();
  return status !== 'ERROR' && status !== 'FATAL';
}

function isCurrentContext(generation, signature) {
  return generation === identityGeneration && contextSignature(OpenFeature.getContext()) === signature && isProviderUsable();
}

function isVerifiedCache(identity, cached) {
  return verifiedAccount && verifiedAccount.username === identity.username &&
    cached.accountId === verifiedAccount.accountId && cached.accountEmail === verifiedAccount.accountEmail &&
    OpenFeature.getContext().accountId === verifiedAccount.accountId;
}

function persistAccountCache(storage, { accountId, accountEmail }) {
  try {
    if (accountId) storage?.setItem(ACCOUNT_ID_KEY, accountId);
    else storage?.removeItem(ACCOUNT_ID_KEY);
    if (accountEmail) storage?.setItem(ACCOUNT_EMAIL_KEY, accountEmail);
    else storage?.removeItem(ACCOUNT_EMAIL_KEY);
  } catch { /* Targeting remains available when persistent storage is blocked. */ }
}

function readFlagAccount(identity, storage) {
  let cached = readSessionContext(storage);
  const authoritative = Object.hasOwn(identity, 'accountId') || Object.hasOwn(identity, 'accountEmail');
  if (!authoritative && !isVerifiedCache(identity, cached)) {
    // An environment/session event cannot attest which account owns old storage.
    cached = {};
  }
  return { cached, authoritative, changedAccount: authoritative && accountOwnerChanged(identity, cached) };
}

function prepareFlagContext(identity, storage, { cached, authoritative }) {
  const accountId = authoritative ? identity.accountId : cached.accountId;
  const accountEmail = authoritative ? identity.accountEmail : cached.accountEmail;
  const context = buildEvaluationContext({ ...identity, accountId, accountEmail });
  if (authoritative) {
    verifiedAccount = { username: identity.username, accountId, accountEmail };
    // Explicit account fields replace cached ownership, including absent fields.
    persistAccountCache(storage, { accountId, accountEmail });
  }
  return context;
}

function reportContextUpdate(identity, provider, properties) {
  reportFlagDiagnostic({ operation: 'context_update', provider: provider.metadata?.name,
    account_id: identity.clientId, ...properties });
}

async function applyFlagContext(context, generation, signature, provider, identity) {
  const started = Date.now();
  reportContextUpdate(identity, provider, { outcome: 'started', reason: 'context_changed' });
  const update = { provider, signature, promise: OpenFeature.setContext(context) };
  pendingContextUpdate = update;
  try {
    await update.promise;
    if (generation === identityGeneration && pendingContextUpdate === update) {
      const failed = OpenFeature.getProviderStatus() === 'ERROR';
      reportContextUpdate(identity, provider, { outcome: failed ? 'error' : 'success',
        durationMs: Date.now() - started, reason: failed ? 'provider_error' : 'context_changed' });
    }
    return isCurrentContext(generation, signature);
  } finally {
    if (pendingContextUpdate === update) pendingContextUpdate = undefined;
  }
}

async function updateFlagContext({ context, generation }, identity) {
  const signature = contextSignature(context);
  const provider = OpenFeature.getProvider();
  const matchesCurrent = contextSignature(OpenFeature.getContext()) === signature;
  if (matchesCurrent && pendingContextUpdate?.provider === provider && pendingContextUpdate.signature === signature) {
    reportContextUpdate(identity, provider, { outcome: 'deduplicated', reason: 'inflight' });
    await pendingContextUpdate.promise;
    return isCurrentContext(generation, signature);
  }
  if (matchesCurrent && !pendingContextUpdate && isProviderUsable()) {
    reportContextUpdate(identity, provider, { outcome: 'deduplicated', reason: 'settled' });
    return true;
  }
  return applyFlagContext(context, generation, signature, provider, identity);
}

export async function setFeatureFlagContext(
  identity = {},
  logger = console,
  storage = globalThis.localStorage
) {
  let generation = identityGeneration;
  try {
    await waitForIdentityReset();
    if (generation !== identityGeneration) return;
    const account = readFlagAccount(identity, storage);
    if (account.changedAccount) {
      const sessionIdentity = getSessionIdentity();
      await clearAccountIdentity(storage, 'account_changed');
      if (identityGeneration !== generation + 1) return;
      generation = identityGeneration;
      setSessionIdentity(sessionIdentity);
      account.cached = {};
    }
    const context = prepareFlagContext(identity, storage, account);
    return await updateFlagContext({ context, generation }, identity);
  } catch (error) {
    reportFlagDiagnostic({ operation: 'context_update', outcome: 'error', reason: 'provider_error' });
    logger.warn('[flags] Could not update evaluation context', error);
  }
}

/**
 * Fetches the account identity the backend targets on and re-targets flags with
 * it, so a rule written against an account evaluates the same on both ends.
 *
 * Until this resolves, targeting falls back to the environment's ERP admin
 * username, which the backend never sees — rules keyed on the account only
 * become reliable once this has run. Fire-and-forget: a failure leaves the
 * previous context in place rather than dropping the user out of their bucket.
 */
function isCurrentIdentity(guard) {
  const current = getSessionIdentity();
  return !guard.signal?.aborted && guard.generation === identityGeneration &&
    guard.snapshot.username === current.username && guard.snapshot.clientId === current.clientId;
}

async function requestAccountIdentity({ token, apiBase, fetchImpl, signal, expectedAccountId }, guard) {
  await waitForIdentityReset();
  if (!isCurrentIdentity(guard)) return;
  const res = await fetchImpl(`${apiBase}/sws/neo/session`, {
    baseUrl: '', headers: authHeaders(token), ...(signal ? { signal } : {}),
  });
  if (!res?.ok) {
    reportFlagDiagnostic({ operation: 'identity_resolution', outcome: 'error', reason: 'network_error' });
    return;
  }
  const session = await res.json();
  if (!isCurrentIdentity(guard)) {
    reportFlagDiagnostic({ operation: 'identity_resolution', outcome: 'stale', reason: 'superseded' });
    return;
  }
  const accountId = session?.accountId || undefined;
  const accountEmail = session?.accountEmail || undefined;
  if ((!accountId && !accountEmail) || (expectedAccountId && expectedAccountId !== accountId)) {
    reportFlagDiagnostic({ operation: 'identity_resolution', outcome: 'error', reason: 'missing_identity' });
    return;
  }
  return { accountId, accountEmail };
}

function mayAdoptOwnerReset(receipt, guard, account, flagsResolved) {
  const current = getSessionIdentity();
  return receipt.expectedOwnerReset && identityGeneration === receipt.expectedGeneration && flagsResolved &&
    !guard.signal?.aborted && current.username === guard.snapshot.username &&
    current.clientId === guard.snapshot.clientId && OpenFeature.getContext().accountId === account.accountId &&
    OpenFeature.getContext().email === (account.accountEmail?.trim().toLowerCase() || undefined);
}

async function acceptAccountContext(account, guard, logger, storage) {
  const { username, clientId } = getSessionIdentity();
  const expectedOwnerReset = accountOwnerChanged(account, readSessionContext(storage));
  const receipt = { expectedOwnerReset, expectedGeneration: guard.generation + (expectedOwnerReset ? 1 : 0) };
  const flagsResolved = await setFeatureFlagContext({ username, clientId, ...account }, logger, storage);
  // Transfer only the exact epoch belonging to this setter's intentional owner reset.
  if (mayAdoptOwnerReset(receipt, guard, account, flagsResolved)) guard.generation = receipt.expectedGeneration;
  return flagsResolved;
}

async function publishResolvedAccount(account, flagsResolved, guard) {
  if (!isCurrentIdentity(guard)) return;
  // Reset may start after context acceptance, or while a telemetry SDK yields.
  await waitForIdentityReset();
  if (!isCurrentIdentity(guard)) return;
  if (account.accountId) await identify(account.accountId);
  await waitForIdentityReset();
  if (!isCurrentIdentity(guard)) return;
  if (guard.snapshot.clientId) await group('account_id', guard.snapshot.clientId);
  reportFlagDiagnostic({ operation: 'identity_resolution', outcome: 'success' });
  return { ...account, flagsResolved };
}

export async function refreshAccountIdentity(
  { token, apiBase = '', fetchImpl = apiFetch, logger = console, storage = globalThis.localStorage, signal, expectedAccountId } = {}
) {
  const guard = { generation: identityGeneration, snapshot: getSessionIdentity(), signal };
  if (typeof fetchImpl !== 'function') return undefined;
  reportFlagDiagnostic({ operation: 'identity_resolution', outcome: 'started', source: 'session' });
  try {
    const account = await requestAccountIdentity({ token, apiBase, fetchImpl, signal, expectedAccountId }, guard);
    if (!account || !isCurrentIdentity(guard)) return undefined;
    const flagsResolved = await acceptAccountContext(account, guard, logger, storage);
    return await publishResolvedAccount(account, flagsResolved, guard);
  } catch (error) {
    reportFlagDiagnostic({ operation: 'identity_resolution', outcome: signal?.aborted ? 'cancelled' : 'error', reason: signal?.aborted ? 'superseded' : 'network_error' });
    if (!signal?.aborted) logger.warn('[flags] Could not resolve the account identity for targeting', error);
    return undefined;
  }
}
