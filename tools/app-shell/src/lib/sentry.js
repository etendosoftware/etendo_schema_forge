import * as Sentry from '@sentry/react';

export const DEFAULT_SENTRY_SEND_DEFAULT_PII = false;

/**
 * The deploy workflow injects VITE_APP_ENV from its target, so the environment
 * does not depend on the domain the bundle is served from.
 */
export function resolveSentryEnvironment(env = import.meta.env) {
  const value = env?.VITE_APP_ENV;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'development';
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
        environment: resolveSentryEnvironment(resolvedEnv),
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
