import { createSentryAdapter } from '@etendosoftware/app-shell-core/observability/adapters/sentry';
import { Sentry } from './observability/sdk.js';
import { SAFE_EVENT_PROPERTY_KEYS } from './observability/payload.js';

/**
 * The host's Sentry/GlitchTip provider (ETP-4578): the core's adapter with this app's
 * environment wiring. The adapter installs the SDK's own egress hooks (beforeSend,
 * beforeSendTransaction, beforeSendSpan, beforeBreadcrumb), which is where the traffic the
 * gateway never sees — global error handlers, automatic breadcrumbs, tracing spans — is
 * sanitized.
 *
 * `sendDefaultPii` is fixed to false in every environment (D4). It used to be readable from
 * VITE_SENTRY_SEND_DEFAULT_PII, which let a build flip it on in production; that variable is
 * now ignored.
 */
export const SENTRY_SEND_DEFAULT_PII = false;

// Requests to the NEO API carry the trace headers; nothing else does.
export const SENTRY_TRACE_PROPAGATION_TARGETS = [/core\..+\.etendo\.cloud/, 'core.etendo.cloud'];

/**
 * The deploy workflow injects VITE_APP_ENV from its target, so the environment
 * does not depend on the domain the bundle is served from.
 */
export function resolveSentryEnvironment(env = import.meta.env) {
  const value = env?.VITE_APP_ENV;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : 'development';
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
  sentry = Sentry,
  env = import.meta.env,
  buildMetadata = globalThis,
  logger = console,
} = {}) {
  const resolvedEnv = env ?? {};

  return createSentryAdapter({
    sdk: sentry,
    dsn,
    environment: resolveSentryEnvironment(resolvedEnv),
    release: resolveSentryRelease(resolvedEnv, buildMetadata),
    tracePropagationTargets: SENTRY_TRACE_PROPAGATION_TARGETS,
    allowedKeys: SAFE_EVENT_PROPERTY_KEYS,
    logger,
  });
}
