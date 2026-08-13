import * as Sentry from '@sentry/react';

export const SENTRY_ENV_MAP = {
  'go.staging.etendo.cloud': 'staging',
  'go.experimental.etendo.cloud': 'experimental',
  'go.etendo.cloud': 'production',
};

export const DEFAULT_SENTRY_SEND_DEFAULT_PII = false;

export function resolveSentryEnvironment(hostname) {
  return SENTRY_ENV_MAP[hostname] ?? 'development';
}

export function resolveSentrySendDefaultPii(
  value,
  fallback = DEFAULT_SENTRY_SEND_DEFAULT_PII
) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function resolveSentryRelease(
  env = import.meta.env,
  buildMetadata = globalThis
) {
  const candidates = [
    env?.VITE_SENTRY_RELEASE,
    env?.VITE_APP_VERSION,
    buildMetadata?.SENTRY_RELEASE?.id,
    buildMetadata?.__SENTRY_RELEASE__,
    buildMetadata?.__APP_VERSION__,
  ];

  return candidates.find(
    (candidate) => typeof candidate === 'string' && candidate.trim().length > 0
  );
}

export function createSentryProvider({
  dsn,
  hostname = globalThis.window?.location?.hostname,
  enabled = Boolean(dsn),
  sentry = Sentry,
  env = import.meta.env,
  buildMetadata = globalThis,
} = {}) {
  const resolvedEnv = env ?? {};
  const release = resolveSentryRelease(resolvedEnv, buildMetadata);
  const sendDefaultPii = resolveSentrySendDefaultPii(
    resolvedEnv.VITE_SENTRY_SEND_DEFAULT_PII
  );

  return {
    name: 'sentry',
    enabled,

    init() {
      if (!dsn) return;

      sentry.init({
        dsn,
        environment: resolveSentryEnvironment(hostname),
        release,
        integrations: [sentry.browserTracingIntegration()],
        tracesSampleRate: 0.1,
        tracePropagationTargets: [/core\..+\.etendo\.cloud/, 'core.etendo.cloud'],
        sendDefaultPii,
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
