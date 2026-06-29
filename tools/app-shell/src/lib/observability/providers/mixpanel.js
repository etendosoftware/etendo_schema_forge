function isEnabled(value) {
  return value === true || value === 'true';
}

function normalizeOptions({ apiHost, debug } = {}) {
  const options = { debug: isEnabled(debug), batch_requests: false };
  if (apiHost) {
    options.api_host = apiHost;
  }
  return options;
}

export function createMixpanelProvider({
  enabled = false,
  token,
  debug = false,
  apiHost,
  logger = console,
  loader = () => import('mixpanel-browser'),
} = {}) {
  const explicitlyEnabled = isEnabled(enabled);
  const providerEnabled = explicitlyEnabled && Boolean(token);
  let clientPromise;

  if (explicitlyEnabled && !token) {
    logger.warn('[observability] Mixpanel is enabled but VITE_MIXPANEL_TOKEN is missing');
  }

  async function getClient() {
    if (!providerEnabled) return undefined;
    if (!clientPromise) {
      clientPromise = loader().then(module => module.default ?? module);
    }
    return clientPromise;
  }

  return {
    name: 'mixpanel',
    enabled: providerEnabled,

    async init() {
      const client = await getClient();
      if (!client) return;
      client.init(token, normalizeOptions({ apiHost, debug }));
    },

    async track(eventName, properties = {}) {
      const client = await getClient();
      if (!client || typeof client.track !== 'function') return;
      return new Promise(resolve => {
        client.track(eventName, properties, {}, resolve);
      });
    },

    async page(path, properties = {}) {
      const client = await getClient();
      if (!client || typeof client.track !== 'function') return;
      client.track('page_view', { ...properties, route: path, routePattern: path });
    },

    async identify(userId, traits = {}) {
      const client = await getClient();
      if (!client) return;
      if (typeof client.identify === 'function') {
        client.identify(userId);
      }
      if (typeof client.people?.set === 'function') {
        client.people.set(traits);
      }
    },

    async group(groupKey, groupId) {
      const client = await getClient();
      if (!client || typeof client.set_group !== 'function') return;
      client.set_group(groupKey, groupId);
    },

    async groupSet(groupKey, groupId, properties = {}) {
      const client = await getClient();
      if (!client) return;
      const grp = client.get_group?.(groupKey, groupId);
      if (typeof grp?.set === 'function') {
        grp.set(properties);
      }
    },

    async flush() {
      const client = await getClient();
      if (typeof client?.flush === 'function') {
        await client.flush();
      }
    },
  };
}
