import { buildEventPayload } from './payload.js';

function isProviderEnabled(provider) {
  return provider && provider.enabled !== false;
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

      await Promise.all(
        providers.map(provider => callProvider(provider, 'init', [{ context: getContext() }]))
      );
    },

    async track(eventName, properties = {}) {
      if (!initialized || !eventName) return;
      const payload = buildEventPayload({ properties, context, metadata });

      await Promise.all(
        providers.map(provider =>
          callProvider(provider, 'track', [eventName, payload, { context: getContext() }])
        )
      );
    },

    async page(path, properties = {}) {
      if (!initialized || !path) return;
      const payload = buildEventPayload({ properties, context, metadata, route: path });

      await Promise.all(
        providers.map(provider =>
          callProvider(provider, 'page', [payload.route, payload, { context: getContext() }])
        )
      );
    },

    async identify(userId, traits = {}) {
      if (!initialized || !userId) return;

      await Promise.all(
        providers.map(provider =>
          callProvider(provider, 'identify', [userId, { ...traits }, { context: getContext() }])
        )
      );
    },

    async group(groupKey, groupId, traits = {}) {
      if (!initialized || !groupKey || !groupId) return;

      await Promise.all(
        providers.map(provider =>
          callProvider(provider, 'group', [groupKey, groupId, { ...traits }, { context: getContext() }])
        )
      );
    },

    async groupSet(groupKey, groupId, properties = {}) {
      if (!initialized || !groupKey || !groupId) return;

      await Promise.allSettled(
        providers.map(provider =>
          callProvider(provider, 'groupSet', [groupKey, groupId, { ...properties }, { context: getContext() }])
        )
      );
    },

    async captureException(error, details = {}) {
      if (!initialized || !error) return;

      await Promise.all(
        providers.map(provider =>
          callProvider(provider, 'captureException', [error, { ...details }, { context: getContext() }])
        )
      );
    },

    async flush() {
      if (!initialized) return;

      await Promise.all(
        providers.map(provider => callProvider(provider, 'flush', [{ context: getContext() }]))
      );
    },

    async setContext(nextContext = {}) {
      context = { ...context, ...nextContext };

      if (!initialized) return;

      await Promise.all(
        providers.map(provider => callProvider(provider, 'setContext', [getContext()]))
      );
    },

    getContext,
    getProviders() {
      return [...providers];
    },
  };
}
