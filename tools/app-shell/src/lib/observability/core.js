import { buildEventPayload } from './payload.js';

function isProviderEnabled(provider) {
  return provider && provider.enabled !== false;
}

// ETP-5351 — a product-analytics provider (Mixpanel) declares `analytics: true`. Those, and only
// those, go quiet while analytics are suppressed (a support session): no SDK init, no event, no
// identity call, no reset. Error and performance monitoring (Sentry, RUM) keeps running, because a
// bug an operator hits while helping a customer is still a bug.
function isAnalyticsProvider(provider) {
  return provider?.analytics === true;
}

function getProviderName(provider) {
  return provider?.name || 'unknown-provider';
}

function warn(logger, message, error) {
  if (typeof logger?.warn === 'function') {
    logger.warn(message, error);
  }
}

export function createObservability(options = {}) {
  let logger = options.logger ?? console;
  let providers = [];
  let context = {};
  let metadata = {};
  let initialized = false;
  let analyticsSuppressed = false;
  // Analytics providers skipped by an init that ran while suppressed; initialized if it lifts.
  let deferredAnalytics = [];

  function activeProviders() {
    return analyticsSuppressed ? providers.filter(provider => !isAnalyticsProvider(provider)) : providers;
  }

  async function callProvider(provider, methodName, args) {
    const method = provider?.[methodName];
    if (typeof method !== 'function') return undefined;

    try {
      return await method.apply(provider, args);
    } catch (error) {
      warn(
        logger,
        `[observability] ${getProviderName(provider)}.${methodName} failed`,
        error
      );
      return undefined;
    }
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
      initialized = true;
      deferredAnalytics = analyticsSuppressed ? providers.filter(isAnalyticsProvider) : [];

      await Promise.all(
        activeProviders().map(provider => callProvider(provider, 'init', [{ context: getContext() }]))
      );
    },

    /**
     * ETP-5351 — the single switch for product analytics. Cutting here, and not at each event,
     * is what makes "nothing reaches Mixpanel" hold for events nobody has written yet. Lifting it
     * initializes the analytics providers an earlier init skipped.
     */
    async setAnalyticsSuppressed(suppressed) {
      const next = Boolean(suppressed);
      if (next === analyticsSuppressed) return;
      analyticsSuppressed = next;
      if (next || !initialized || deferredAnalytics.length === 0) return;
      const pending = deferredAnalytics;
      deferredAnalytics = [];
      await Promise.all(
        pending.map(provider => callProvider(provider, 'init', [{ context: getContext() }]))
      );
    },

    isAnalyticsSuppressed() {
      return analyticsSuppressed;
    },

    async track(eventName, properties = {}) {
      if (!initialized || !eventName) return;
      const payload = buildEventPayload({ properties, context, metadata });

      await Promise.all(
        activeProviders().map(provider =>
          callProvider(provider, 'track', [eventName, payload, { context: getContext() }])
        )
      );
    },

    async page(path, properties = {}) {
      if (!initialized || !path) return;
      const payload = buildEventPayload({ properties, context, metadata, route: path });

      await Promise.all(
        activeProviders().map(provider =>
          callProvider(provider, 'page', [payload.route, payload, { context: getContext() }])
        )
      );
    },

    async identify(userId, traits = {}) {
      if (!initialized || !userId) return;

      await Promise.all(
        activeProviders().map(provider =>
          callProvider(provider, 'identify', [userId, { ...traits }, { context: getContext() }])
        )
      );
    },

    async group(groupKey, groupId, traits = {}) {
      if (!initialized || !groupKey || !groupId) return;

      await Promise.all(
        activeProviders().map(provider =>
          callProvider(provider, 'group', [groupKey, groupId, { ...traits }, { context: getContext() }])
        )
      );
    },

    async groupSet(groupKey, groupId, properties = {}) {
      if (!initialized || !groupKey || !groupId) return;

      await Promise.allSettled(
        activeProviders().map(provider =>
          callProvider(provider, 'groupSet', [groupKey, groupId, { ...properties }, { context: getContext() }])
        )
      );
    },

    async captureException(error, details = {}) {
      if (!initialized || !error) return;

      await Promise.all(
        activeProviders().map(provider =>
          callProvider(provider, 'captureException', [error, { ...details }, { context: getContext() }])
        )
      );
    },

    async flush() {
      if (!initialized) return;

      await Promise.all(
        activeProviders().map(provider => callProvider(provider, 'flush', [{ context: getContext() }]))
      );
    },

    async reset() {
      await Promise.all(
        activeProviders().map(provider => callProvider(provider, 'reset', [{ context: getContext() }]))
      );
    },

    async setContext(nextContext = {}) {
      context = { ...context, ...nextContext };

      if (!initialized) return;

      await Promise.all(
        activeProviders().map(provider => callProvider(provider, 'setContext', [getContext()]))
      );
    },

    getContext,
    getProviders() {
      return [...providers];
    },
  };
}
