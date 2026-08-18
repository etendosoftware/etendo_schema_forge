import { initObservability, track } from '../observability.js';
import { OBSERVABILITY_EVENTS } from './events.js';
import { createMixpanelProvider } from './providers/mixpanel.js';
import { createRumProvider } from '../rum.js';
import { createSentryProvider } from '../sentry.js';

export function buildBrowserObservabilityConfig({
  env = import.meta.env,
  location = globalThis.window?.location,
  logger = console,
  storage = globalThis.localStorage,
} = {}) {
  const hostname = location?.hostname;

  return {
    logger,
    context: {
      app: 'app-shell',
      environment: hostname,
      hostname,
      mockMode: env.VITE_MOCK === 'true',
    },
    metadata: {
      app: 'app-shell',
      environment: hostname,
      hostname,
      mockMode: env.VITE_MOCK === 'true',
    },
    providers: [
      createSentryProvider({
        dsn: env.VITE_SENTRY_DSN,
        env,
        hostname,
      }),
      createRumProvider({
        env,
        hostname,
        logger,
      }),
      createMixpanelProvider({
        enabled: env.VITE_MIXPANEL_ENABLED,
        token: env.VITE_MIXPANEL_TOKEN,
        debug: env.VITE_MIXPANEL_DEBUG,
        apiHost: env.VITE_MIXPANEL_API_HOST,
        logger,
        storage,
      }),
    ],
  };
}

export async function initBrowserObservability(
  options = {},
  client = { initObservability, track }
) {
  const config = buildBrowserObservabilityConfig(options);
  await client.initObservability(config);
  // The Mixpanel one-time stale-identity reset (see docs/surveys.md) is no longer
  // orchestrated here: it lives inside createMixpanelProvider's getClient() gate
  // (providers/mixpanel.js), so it is guaranteed to run before ANY provider
  // method touches the SDK, regardless of call ordering across the app.
  await client.track(OBSERVABILITY_EVENTS.APP_STARTED.name);
}
