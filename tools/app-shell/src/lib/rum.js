import { AwsRum } from 'aws-rum-web';

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

export function createRumProvider({
  env = import.meta.env,
  AwsRumCtor = AwsRum,
  logger = console,
  enabled = true,
} = {}) {
  const resolvedEnv = env ?? {};
  const config = resolveRumConfig(resolvedEnv);
  const sessionSampleRate = resolveRumSessionSampleRate(
    resolvedEnv.VITE_RUM_SESSION_SAMPLE_RATE
  );

  return {
    name: 'aws-rum',
    enabled: enabled && Boolean(config?.appMonitorId && config?.identityPoolId),

    init() {
      if (!config?.appMonitorId || !config?.identityPoolId) return;

      try {
        new AwsRumCtor(config.appMonitorId, '1.0.0', 'eu-west-3', {
          sessionSampleRate,
          identityPoolId: config.identityPoolId,
          endpoint: 'https://dataplane.rum.eu-west-3.amazonaws.com',
          telemetries: ['performance', 'errors', 'http'],
          allowCookies: true,
          enableXRay: false,
        });
      } catch (e) {
        logger.warn('CloudWatch RUM init failed', e);
      }
    },
  };
}

export function initRum(options = {}) {
  return createRumProvider(options).init();
}
