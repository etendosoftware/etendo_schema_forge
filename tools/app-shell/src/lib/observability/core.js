import { createTelemetryGateway } from '@etendosoftware/app-shell-core/observability/gateway';
import { buildEventPayload, SAFE_EVENT_PROPERTY_KEYS } from './payload.js';

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
 * first await, and every other operation is a no-op until then.
 */
const MAX_PENDING_FLAG_EVALUATIONS = 100;

function isProviderEnabled(provider) {
  return provider && provider.enabled !== false;
}

export function createObservability(options = {}) {
  let logger = options.logger ?? console;
  const allowedKeys = options.allowedKeys ?? SAFE_EVENT_PROPERTY_KEYS;
  let gateway;
  let providers = [];
  let context = {};
  let metadata = {};
  let initialized = false;
  const pendingFlags = new Map();

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
        logger,
        disabled: config.disabled,
        adapterTimeoutMs: config.adapterTimeoutMs,
      });
      initialized = true;

      await gateway.init(getContext());
      const pending = [...pendingFlags];
      pendingFlags.clear();
      await Promise.all(pending.map(([key, value]) => gateway.addFeatureFlagEvaluation(key, value)));
    },

    async track(eventName, properties = {}) {
      if (!initialized || !eventName) return;
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
      if (!initialized) {
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
      if (!initialized || !userId) return;
      await gateway.identify(userId, traits);
    },

    async group(groupKey, groupId, traits = {}) {
      if (!initialized || !groupKey || !groupId) return;
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
      if (!initialized) return;
      await gateway.reset();
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
      if (gateway) await gateway.enable(name);
    },

    getContext,
    getProviders() {
      return [...providers];
    },
  };
}
