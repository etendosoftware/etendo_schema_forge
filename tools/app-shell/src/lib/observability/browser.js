import { initObservability, track } from '../observability.js';
import { OBSERVABILITY_EVENTS } from './events.js';
import { createMixpanelProvider } from './providers/mixpanel.js';
import { createRumProvider } from '../rum.js';
import { createSentryProvider } from '../sentry.js';

export function buildBrowserObservabilityConfig({
  env = import.meta.env,
  location = globalThis.window?.location,
  logger = console,
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
      }),
    ],
  };
}

export async function initBrowserObservability(
  options = {},
  client = { initObservability, track }
) {
  await client.initObservability(buildBrowserObservabilityConfig(options));
  await client.track(OBSERVABILITY_EVENTS.APP_STARTED.name);
}
