import { createTelemetryGateway } from '@etendosoftware/app-shell-core/observability/gateway';
import { buildEventPayload, SAFE_EVENT_PROPERTY_KEYS, sanitizeEventProperties } from './payload.js';

/**
 * The host's observability facade (ETP-4578). Callers keep this API; every payload now
 * leaves through the core's sanitizing gateway instead of being handed to the providers
 * directly:
 *
 *  - the host still COMPOSES an event (`buildEventPayload`: metadata + context + properties
 *    + timestamp + normalized route), then the gateway sanitizes it again with the host
 *    allowlist before any provider sees it — a second boundary, on purpose;
 *  - `identify`, `group`, `groupSet` and `captureException` used to reach providers with no
 *    sanitization at all, and now cross the same boundary;
 *  - provider failures, timeouts, the kill switch and the start/stop lifecycle are the
 *    gateway's.
 *
 * The gateway contract requires `init()` before anything else: it is what starts the
 * adapters, and a `disable()` only stops an adapter that was started. So the gateway is
 * created and `init()`-ed inside `initObservability()`, flagged synchronously before its
 * first await. Only bounded flag events and the latest identity/grouping are
 * retained until adapter initialization completes; other early operations remain no-ops.
 */
const MAX_PENDING_FLAG_EVALUATIONS = 100;
const MAX_PENDING_FLAG_EVENTS = 100;
const MAX_PENDING_GROUPS = 20;
const BUFFERED_FLAG_EVENTS = new Set(['feature_flag_evaluated', 'feature_flags_diagnostic']);

function isProviderEnabled(provider) {
  return provider && provider.enabled !== false;
}

// ETP-5351 — RUM global-context marker of a support session (see providers/datadog.js).
const SUPPORT_SESSION_KEY = 'support_session';
/** Approved keys the gateway exempts from its sensitive-key-NAME rule (`session` in the name). */
export const TRUSTED_CONTEXT_KEYS = [SUPPORT_SESSION_KEY];

function isAnalyticsProvider(provider) {
  return provider?.analytics === true;
}

export function createObservability(options = {}) {
  let logger = options.logger ?? console;
  const allowedKeys = options.allowedKeys ?? SAFE_EVENT_PROPERTY_KEYS;
  let gateway;
  let providers = [];
  let context = {};
  let metadata = {};
  let initialized = false;
  let ready = false;
  let generation = 0;
  let pendingUser;
  const pendingGroups = new Map();
  const pendingFlagEvents = [];
  const pendingFlags = new Map();
  // ETP-5351 — the single switch for product analytics (a support session is not the customer):
  // a pure-analytics provider (`analytics: true`, Mixpanel) is killed by name on the gateway, so
  // its SDK never starts and it gets no event, identity or reset; `track` is dropped for every
  // provider (a Datadog custom action is a product event). Monitoring (errors, views, replay,
  // identity, flag evaluations) stays on and carries the support marker instead.
  let analyticsSuppressed = false;

  const analyticsNames = () => providers.filter(isAnalyticsProvider).map(provider => provider.name);

  function markSupport() {
    context = { ...context, [SUPPORT_SESSION_KEY]: analyticsSuppressed };
    return initialized ? gateway.setContext({ [SUPPORT_SESSION_KEY]: analyticsSuppressed }) : undefined;
  }

  function getContext() {
    return { ...context };
  }

  return {
    async initObservability(config = {}) {
      logger = config.logger ?? logger;
      providers = (config.providers ?? []).filter(isProviderEnabled);
      context = { ...(config.context ?? {}) };
      metadata = { ...(config.metadata ?? {}) };
      gateway = createTelemetryGateway({
        adapters: providers,
        allowedKeys,
        trustedKeys: TRUSTED_CONTEXT_KEYS,
        logger,
        disabled: config.disabled,
        adapterTimeoutMs: config.adapterTimeoutMs,
      });
      initialized = true;

      if (analyticsSuppressed) {
        // Before init(): a kill ahead of init means zero calls to that adapter.
        await Promise.all(analyticsNames().map(name => gateway.disable(name)));
        context = { ...context, [SUPPORT_SESSION_KEY]: true };
      }
      await gateway.init(getContext());
      if (analyticsSuppressed) await markSupport();
      // Assign the current identity before replaying startup exposures. Reset advances
      // the generation so an old replay cannot restore grouping after logout.
      while (pendingUser || pendingGroups.size) {
        const replayGeneration = generation;
        const user = pendingUser;
        const groups = [...pendingGroups.values()];
        pendingUser = undefined;
        pendingGroups.clear();
        if (user) await gateway.identify(user.userId, user.traits);
        for (const group of groups) {
          if (generation !== replayGeneration) break;
          await gateway.group(group.key, group.id, group.traits);
        }
        if (generation !== replayGeneration) {
          await gateway.reset();
          if (analyticsSuppressed) await markSupport();
        }
      }
      ready = true;
      const replayGeneration = generation;
      const pending = [...pendingFlags];
      const events = pendingFlagEvents.splice(0);
      pendingFlags.clear();
      for (const [key, value] of pending) {
        if (generation !== replayGeneration) break;
        await gateway.addFeatureFlagEvaluation(key, value);
      }
      for (const event of events) {
        if (generation !== replayGeneration || analyticsSuppressed) break;
        await gateway.track(event.name, buildEventPayload({ properties: event.properties, context: {}, metadata, timestamp: event.timestamp }));
      }
    },

    /**
     * ETP-5351 — start or end suppression. Safe before `initObservability()`: it is applied then.
     * Shortcut: lifting it re-enables Mixpanel even if the telemetry kill switch had killed it;
     * acceptable because a support session ends with the page (Exit reloads), not mid-flight.
     */
    async setAnalyticsSuppressed(suppressed) {
      const next = Boolean(suppressed);
      if (next === analyticsSuppressed) return;
      analyticsSuppressed = next;
      // A support handoff must not revive pre-init product events after suppression lifts.
      if (next) pendingFlagEvents.length = 0;
      if (!initialized) return;
      await Promise.all(analyticsNames().map(name => (next ? gateway.disable(name) : gateway.enable(name))));
      await markSupport();
    },

    isAnalyticsSuppressed() {
      return analyticsSuppressed;
    },

    async track(eventName, properties = {}) {
      if (!eventName || analyticsSuppressed) return;
      if (!ready && BUFFERED_FLAG_EVENTS.has(eventName)) {
        if (pendingFlagEvents.length >= MAX_PENDING_FLAG_EVENTS) pendingFlagEvents.shift();
        // Capture properties now. A later company must not supply the identity of
        // this earlier exposure through mutable facade context during replay.
        pendingFlagEvents.push({ name: eventName, properties: sanitizeEventProperties({ ...context, ...properties }), timestamp: new Date().toISOString() });
        return;
      }
      if (!initialized) return;
      const payload = buildEventPayload({ properties, context, metadata });
      await gateway.track(eventName, payload);
    },

    /**
     * A flag evaluation for the providers that attach flag state to their events (Datadog).
     * The flag provider usually answers before telemetry starts, and each evaluation is
     * reported once per page (`flag-exposure.js`), so those made before `initObservability()`
     * are kept (the latest value per key, bounded) and replayed once the gateway is up.
     */
    async addFeatureFlagEvaluation(key, value) {
      if (!key) return;
      if (!ready) {
        if (pendingFlags.has(key) || pendingFlags.size < MAX_PENDING_FLAG_EVALUATIONS) pendingFlags.set(key, value);
        return;
      }
      await gateway.addFeatureFlagEvaluation(key, value);
    },

    async page(path, properties = {}) {
      if (!initialized || !path) return;
      const payload = buildEventPayload({ properties, context, metadata, route: path });
      await gateway.page(payload.route, payload);
    },

    async identify(userId, traits = {}) {
      if (!userId) return;
      if (!ready) {
        pendingUser = { userId, traits: sanitizeEventProperties(traits) };
        return;
      }
      await gateway.identify(userId, traits);
    },

    async group(groupKey, groupId, traits = {}) {
      if (!groupKey || !groupId) return;
      if (!ready) {
        if (pendingGroups.has(groupKey) || pendingGroups.size < MAX_PENDING_GROUPS) {
          pendingGroups.set(groupKey, { key: groupKey, id: groupId, traits: sanitizeEventProperties(traits) });
        }
        return;
      }
      await gateway.group(groupKey, groupId, traits);
    },

    async groupSet(groupKey, groupId, properties = {}) {
      if (!initialized || !groupKey || !groupId) return;
      await gateway.groupSet(groupKey, groupId, properties);
    },

    async captureException(error, details = {}) {
      if (!initialized || !error) return;
      await gateway.captureException(error, details);
    },

    async flush() {
      if (!initialized) return;
      await gateway.flush();
    },

    async reset() {
      generation += 1;
      pendingFlags.clear();
      pendingFlagEvents.length = 0;
      pendingUser = undefined;
      pendingGroups.clear();
      if (!initialized) return;
      await gateway.reset();
      // The RUM SDK's reset replaces its whole global context, support marker included.
      if (analyticsSuppressed) await markSupport();
    },

    async setContext(nextContext = {}) {
      context = { ...context, ...nextContext };
      if (!initialized) return;
      await gateway.setContext(nextContext);
    },

    /** Kill switch, per provider name or global (no argument). Needs initObservability() first. */
    async disable(name) {
      if (gateway) await gateway.disable(name);
    },

    async enable(name) {
      // The flag-driven kill switch must not revive product analytics inside a support session.
      if (analyticsSuppressed && analyticsNames().includes(name)) return;
      if (gateway) await gateway.enable(name);
    },

    getContext,
    getProviders() {
      return [...providers];
    },
  };
}
