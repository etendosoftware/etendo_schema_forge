import { createDatadogAdapter } from '@etendosoftware/app-shell-core/observability/adapters/datadog';
import { loadDatadog } from '../sdk.js';
import { SAFE_EVENT_PROPERTY_KEYS } from '../payload.js';

/**
 * The host's Datadog Browser RUM provider (ETP-5605, moved behind the gateway in ETP-4578): the
 * core's adapter with this app's environment wiring. RUM collects views, resources, user
 * actions, long tasks and unhandled errors on its own; the adapter closes that egress in the
 * SDK's `beforeSend`, through the same sanitizers the gateway applies to everything else.
 *
 * Optional and off by default: it needs VITE_DATADOG_ENABLED plus the application id, client
 * token, site and environment the deploy workflow injects. The SDK is only downloaded when it is
 * enabled and not killed (`telemetry-kill-datadog`).
 */
export function createDatadogProvider({
  env = import.meta.env,
  logger = console,
  loader = loadDatadog,
} = {}) {
  const resolvedEnv = env ?? {};
  return createDatadogAdapter({
    loadSdk: loader,
    enabled: resolvedEnv.VITE_DATADOG_ENABLED,
    applicationId: resolvedEnv.VITE_DATADOG_APPLICATION_ID,
    clientToken: resolvedEnv.VITE_DATADOG_CLIENT_TOKEN,
    site: resolvedEnv.VITE_DATADOG_SITE,
    env: resolvedEnv.VITE_APP_ENV,
    service: resolvedEnv.VITE_DATADOG_SERVICE || undefined,
    version: resolvedEnv.VITE_APP_VERSION,
    sessionSampleRate: resolvedEnv.VITE_DATADOG_SESSION_SAMPLE_RATE,
    sessionReplaySampleRate: resolvedEnv.VITE_DATADOG_SESSION_REPLAY_SAMPLE_RATE,
    traceApiBases: resolvedEnv.VITE_DATADOG_TRACE_API_BASES,
    traceSampleRate: resolvedEnv.VITE_DATADOG_TRACE_SAMPLE_RATE,
    remoteConfigurationId: resolvedEnv.VITE_DATADOG_REMOTE_CONFIGURATION_ID || undefined,
    allowedKeys: SAFE_EVENT_PROPERTY_KEYS,
    logger,
  });
}
