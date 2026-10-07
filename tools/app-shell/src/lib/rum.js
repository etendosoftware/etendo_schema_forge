import { createRumAdapter } from '@etendosoftware/app-shell-core/observability/adapters/rum';
import { AwsRum } from './observability/sdk.js';

/**
 * The host's AWS CloudWatch RUM provider (ETP-4578): the core's adapter with this app's
 * environment wiring. RUM records page views, JS errors and HTTP calls on its own, and each
 * event's metadata carries `document.title` and the page id with the record id in it. The SDK
 * has no before-send hook, so the adapter sanitizes every batch through the SDK's
 * `clientBuilder`, BEFORE it is serialized and SigV4-signed.
 *
 * Optional and off by default (D3): it needs an explicit VITE_RUM_ENABLED AND both IDs the
 * deploy workflow injects. Before ETP-4578 the IDs alone switched it on. Cookies are off unless
 * VITE_RUM_ALLOW_COOKIES=true, which is an open question for Privacy.
 */
export const DEFAULT_RUM_SESSION_SAMPLE_RATE = 0.1;

export function resolveRumSessionSampleRate(
  value,
  fallback = DEFAULT_RUM_SESSION_SAMPLE_RATE
) {
  if (value == null) {
    return fallback;
  }

  if (typeof value === 'string' && value.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, parsed));
}

/**
 * The deploy workflow injects the RUM IDs of its target, so the config does not
 * depend on the domain the bundle is served from.
 */
export function resolveRumConfig(env = import.meta.env) {
  return {
    appMonitorId: env?.VITE_RUM_APP_MONITOR_ID,
    identityPoolId: env?.VITE_RUM_IDENTITY_POOL_ID,
  };
}

const isTrue = (value) => value === true || value === 'true';

export function createRumProvider({
  env = import.meta.env,
  AwsRumCtor = AwsRum,
  logger = console,
  enabled,
} = {}) {
  const resolvedEnv = env ?? {};
  const { appMonitorId, identityPoolId } = resolveRumConfig(resolvedEnv);

  return createRumAdapter({
    sdk: { AwsRum: AwsRumCtor },
    enabled: enabled ?? resolvedEnv.VITE_RUM_ENABLED,
    appMonitorId,
    identityPoolId,
    sessionSampleRate: resolveRumSessionSampleRate(resolvedEnv.VITE_RUM_SESSION_SAMPLE_RATE),
    allowCookies: isTrue(resolvedEnv.VITE_RUM_ALLOW_COOKIES),
    logger,
  });
}
