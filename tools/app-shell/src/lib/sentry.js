import * as Sentry from '@sentry/react';

const ENV_MAP = {
  'go.staging.etendo.cloud': 'staging',
  'go.experimental.etendo.cloud': 'experimental',
  'go.etendo.cloud': 'production',
};

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: ENV_MAP[window.location.hostname] ?? 'development',
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    tracePropagationTargets: [/core\..+\.etendo\.cloud/, 'core.etendo.cloud'],
    sendDefaultPii: true,
  });
}
