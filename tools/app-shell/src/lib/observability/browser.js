import { initObservability, track, disable, enable } from '../observability.js';
import { bindTelemetryKillSwitch, killStateToDisabled, readKillState } from './killSwitch.js';
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
  // Build default + whatever the flags say right now. A provider killed here is never started.
  const killState = readKillState({ env, logger });

  return {
    logger,
    disabled: killStateToDisabled(killState),
    killState,
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
        logger,
      }),
      createRumProvider({
        env,
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

/**
 * How long startup waits for the flag provider before starting telemetry anyway. Long enough
 * for the local provider (immediate) and a warm remote one; short enough that a slow control
 * plane does not cost the app its first errors. A kill flag that answers later still applies,
 * in place, through `bindTelemetryKillSwitch`.
 */
export const FLAGS_READY_WAIT_MS = 1500;

function waitFor(promise, ms) {
  if (!promise) return Promise.resolve();
  return Promise.race([
    Promise.resolve(promise).catch(() => undefined),
    new Promise((resolve) => { setTimeout(resolve, ms); }),
  ]);
}

export async function initBrowserObservability(
  options = {},
  client = { initObservability, track, disable, enable }
) {
  // Flags first, so a provider killed by flag is not even started. Never rejects, bounded.
  await waitFor(options.flagsReady, options.flagsWaitMs ?? FLAGS_READY_WAIT_MS);
  const { killState, ...config } = buildBrowserObservabilityConfig(options);
  await client.initObservability(config);
  if (typeof client.disable === 'function' && typeof client.enable === 'function') {
    bindTelemetryKillSwitch(client, { env: options.env, initial: killState, logger: options.logger });
  }
  // The Mixpanel one-time stale-identity reset (see docs/surveys.md) is no longer
  // orchestrated here: it lives inside createMixpanelProvider's getClient() gate
  // (providers/mixpanel.js), so it is guaranteed to run before ANY provider
  // method touches the SDK, regardless of call ordering across the app.
  await client.track(OBSERVABILITY_EVENTS.APP_STARTED.name);
}
