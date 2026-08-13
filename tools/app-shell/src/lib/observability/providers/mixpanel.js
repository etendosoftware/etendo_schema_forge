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

// Mixpanel-only, one-time-per-browser flag. Browsers that were identify()'d with a
// real username/email before the GDPR remediation (see docs/surveys.md) keep that
// distinct_id persisted in the SDK's own storage forever unless something explicitly
// clears it — no longer calling identify() does not do that. This flag makes sure
// each browser gets exactly one mixpanel-browser reset() to shed any stale identity,
// then never touches it again so future legitimate anonymous ids are left alone.
//
// The reset itself is performed inside getClient() (see below), not via external
// call-site ordering: every provider method (init/track/page/identify/group/
// groupSet/flush) funnels through getClient() before it ever touches the SDK, so
// the reset is guaranteed to complete before the FIRST real use of the client by
// ANY caller — regardless of which method reaches getClient() first.
const IDENTITY_RESET_FLAG_KEY = 'sf_mixpanel_identity_reset_v1';

function readResetFlag(storage) {
  try {
    return storage?.getItem?.(IDENTITY_RESET_FLAG_KEY) ?? null;
  } catch {
    // Storage inaccessible (private mode, disabled cookies, etc.) — treat as
    // "not reset yet" so we still attempt the reset; it's a harmless retry.
    return null;
  }
}

function writeResetFlag(storage) {
  try {
    storage?.setItem?.(IDENTITY_RESET_FLAG_KEY, '1');
  } catch {
    // Ignore — if we can't persist the flag we'll just retry the (harmless) reset
    // next load instead of silently leaving a stale identity behind.
  }
}

export function createMixpanelProvider({
  enabled = false,
  token,
  debug = false,
  apiHost,
  logger = console,
  loader = () => import('mixpanel-browser'),
  storage = globalThis.localStorage,
} = {}) {
  const explicitlyEnabled = isEnabled(enabled);
  const providerEnabled = explicitlyEnabled && Boolean(token);
  let clientPromise;

  if (explicitlyEnabled && !token) {
    logger.warn('[observability] Mixpanel is enabled but VITE_MIXPANEL_TOKEN is missing');
  }

  // Runs the one-time stale-identity reset directly against the already-resolved
  // SDK client. Only ever called from inside the getClient() chain below (never
  // recurses back into the public getClient() itself). Must run AFTER
  // client.init(): mixpanel-browser's reset() reads persistence/session state
  // that init() is what sets up — calling it beforehand throws.
  async function resetStaleIdentityOnce(client) {
    if (readResetFlag(storage)) return;
    if (typeof client?.reset !== 'function') return;

    try {
      client.reset();
      writeResetFlag(storage);
    } catch (error) {
      // Do not set the flag on failure — retry on the next load rather than
      // silently leaving a stale identity in place forever.
      if (typeof logger?.warn === 'function') {
        logger.warn('[observability] Mixpanel stale-identity reset failed', error);
      }
    }
  }

  // Single gate every provider method funnels through before it gets a usable
  // client. The one-time stale-identity reset is folded into the SAME cached
  // promise that loads and initializes the SDK, which guarantees:
  //   - it runs exactly once per browser, no matter which method (init/track/
  //     page/identify/...) happens to be the first caller in this session;
  //   - concurrent callers that reach getClient() before the chain settles all
  //     await the SAME promise (clientPromise is assigned synchronously, before
  //     any `await`, so there is no window where two callers could each start
  //     their own load+reset, or where one could slip through unreset);
  //   - it is structurally impossible for any real SDK operation to happen
  //     before the reset — nothing ever obtains a `client` reference except
  //     through this function, after the reset step has already resolved.
  async function getClient() {
    if (!providerEnabled) return undefined;
    if (!clientPromise) {
      clientPromise = loader()
        .then(module => module.default ?? module)
        .then(async client => {
          // mixpanel-browser requires init() before reset() — reset() touches
          // persistence/session state that only exists once init() runs.
          client.init(token, normalizeOptions({ apiHost, debug }));
          await resetStaleIdentityOnce(client);
          return client;
        });
    }
    return clientPromise;
  }

  return {
    name: 'mixpanel',
    enabled: providerEnabled,

    async init() {
      // getClient() already performs the SDK's own init() plus the one-time
      // stale-identity reset as part of its cached load chain.
      await getClient();
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

    // Explicit, unconditional reset — distinct from the automatic one-time
    // stale-identity reset folded into getClient() above. The GDPR stale-identity
    // cleanup no longer needs this to be called externally (nothing in the app
    // currently calls it), but it's kept as a building block for any future need
    // to clear identity on demand (e.g. logout). Safe to call on a browser that
    // was never identified: mixpanel-browser's reset() simply replaces whatever
    // anonymous distinct_id is already there with a new one.
    async reset() {
      const client = await getClient();
      if (typeof client?.reset !== 'function') return;
      client.reset();
    },
  };
}
