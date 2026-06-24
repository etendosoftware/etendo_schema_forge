import * as Sentry from '@sentry/react';

export const SENTRY_ENV_MAP = {
  'go.staging.etendo.cloud': 'staging',
  'go.experimental.etendo.cloud': 'experimental',
  'go.etendo.cloud': 'production',
};

export function resolveSentryEnvironment(hostname) {
  return SENTRY_ENV_MAP[hostname] ?? 'development';
}

export function createSentryProvider({
  dsn,
  hostname = globalThis.window?.location?.hostname,
  enabled = Boolean(dsn),
  sentry = Sentry,
} = {}) {
  return {
    name: 'sentry',
    enabled,

    init() {
      if (!dsn) return;

      sentry.init({
        dsn,
        environment: resolveSentryEnvironment(hostname),
        integrations: [sentry.browserTracingIntegration()],
        tracesSampleRate: 0.1,
        tracePropagationTargets: [/core\..+\.etendo\.cloud/, 'core.etendo.cloud'],
        sendDefaultPii: true,
        autoSessionTracking: false,
      });
    },

    captureException(error, details = {}) {
      if (typeof sentry.captureException === 'function') {
        sentry.captureException(error, { extra: details });
      }
    },

    setContext(context = {}) {
      if (typeof sentry.setContext === 'function') {
        sentry.setContext('app', context);
      }
    },
  };
}

export function initSentry(options = {}) {
  const dsn = options.dsn ?? import.meta.env.VITE_SENTRY_DSN;
  return createSentryProvider({ ...options, dsn }).init();
}
