import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildBrowserObservabilityConfig } from '../observability/browser.js';
import {
  createRumProvider,
  DEFAULT_RUM_SESSION_SAMPLE_RATE,
  resolveRumConfig,
  resolveRumSessionSampleRate,
} from '../rum.js';
import {
  createSentryProvider,
  DEFAULT_SENTRY_SEND_DEFAULT_PII,
  resolveSentryEnvironment,
  resolveSentryRelease,
  resolveSentrySendDefaultPii,
} from '../sentry.js';

describe('sentry observability adapter', () => {
  it('preserves hostname to environment mapping', () => {
    assert.equal(resolveSentryEnvironment('go.staging.etendo.cloud'), 'staging');
    assert.equal(resolveSentryEnvironment('go.experimental.etendo.cloud'), 'experimental');
    assert.equal(resolveSentryEnvironment('go.etendo.cloud'), 'production');
    assert.equal(resolveSentryEnvironment('localhost'), 'development');
  });

  it('initializes Sentry with tracing, release metadata, and privacy-safe PII defaults', () => {
    const calls = [];
    const fakeSentry = {
      browserTracingIntegration() {
        return 'browser-tracing';
      },
      init(options) {
        calls.push(options);
      },
    };

    const provider = createSentryProvider({
      dsn: 'dsn-123',
      hostname: 'go.staging.etendo.cloud',
      sentry: fakeSentry,
      env: {
        VITE_SENTRY_RELEASE: 'release-from-env',
      },
    });
    provider.init();

    assert.equal(provider.name, 'sentry');
    assert.equal(provider.enabled, true);
    assert.equal(calls[0].dsn, 'dsn-123');
    assert.equal(calls[0].environment, 'staging');
    assert.equal(calls[0].release, 'release-from-env');
    assert.deepEqual(calls[0].integrations, ['browser-tracing']);
    assert.equal(calls[0].tracesSampleRate, 0.1);
    assert.equal(calls[0].sendDefaultPii, false);
    assert.deepEqual(calls[0].tracePropagationTargets, [/core\..+\.etendo\.cloud/, 'core.etendo.cloud']);
  });

  it('can be disabled when no DSN is configured', () => {
    const provider = createSentryProvider({ dsn: '' });

    assert.equal(provider.enabled, false);
  });

  it('enables Sentry PII only when explicitly requested via env', () => {
    assert.equal(resolveSentrySendDefaultPii(undefined), DEFAULT_SENTRY_SEND_DEFAULT_PII);
    assert.equal(resolveSentrySendDefaultPii('true'), true);
    assert.equal(resolveSentrySendDefaultPii('1'), true);
    assert.equal(resolveSentrySendDefaultPii('false'), false);
    assert.equal(resolveSentrySendDefaultPii('unexpected'), DEFAULT_SENTRY_SEND_DEFAULT_PII);
  });

  it('resolves Sentry release from env first and then build metadata', () => {
    assert.equal(
      resolveSentryRelease(
        { VITE_SENTRY_RELEASE: 'env-release' },
        { SENTRY_RELEASE: { id: 'build-release' } }
      ),
      'env-release'
    );
    assert.equal(
      resolveSentryRelease({}, { SENTRY_RELEASE: { id: 'build-release' } }),
      'build-release'
    );
    assert.equal(
      resolveSentryRelease({}, { __APP_VERSION__: '0.1.0+sha.abc123' }),
      '0.1.0+sha.abc123'
    );
  });
});

describe('AWS RUM observability adapter', () => {
  it('preserves hostname-gated RUM config mapping', () => {
    const env = {
      VITE_RUM_APP_MONITOR_ID_STAGING: 'staging-monitor',
      VITE_RUM_IDENTITY_POOL_ID_STAGING: 'staging-pool',
      VITE_RUM_APP_MONITOR_ID_EXPERIMENTAL: 'experimental-monitor',
      VITE_RUM_IDENTITY_POOL_ID_EXPERIMENTAL: 'experimental-pool',
      VITE_RUM_APP_MONITOR_ID_PROD: 'prod-monitor',
      VITE_RUM_IDENTITY_POOL_ID_PROD: 'prod-pool',
    };

    assert.deepEqual(resolveRumConfig('go.staging.etendo.cloud', env), {
      appMonitorId: 'staging-monitor',
      identityPoolId: 'staging-pool',
    });
    assert.deepEqual(resolveRumConfig('go.experimental.etendo.cloud', env), {
      appMonitorId: 'experimental-monitor',
      identityPoolId: 'experimental-pool',
    });
    assert.deepEqual(resolveRumConfig('go.etendo.cloud', env), {
      appMonitorId: 'prod-monitor',
      identityPoolId: 'prod-pool',
    });
  });

  it('initializes AWS RUM with the existing region, endpoint, telemetries, and bounded sample rate', () => {
    const calls = [];
    class FakeAwsRum {
      constructor(...args) {
        calls.push(args);
      }
    }

    const provider = createRumProvider({
      hostname: 'go.experimental.etendo.cloud',
      env: {
        VITE_RUM_APP_MONITOR_ID_EXPERIMENTAL: 'monitor-id',
        VITE_RUM_IDENTITY_POOL_ID_EXPERIMENTAL: 'pool-id',
        VITE_RUM_SESSION_SAMPLE_RATE: '0.25',
      },
      AwsRumCtor: FakeAwsRum,
      logger: { warn() {} },
    });
    provider.init();

    assert.equal(provider.name, 'aws-rum');
    assert.equal(provider.enabled, true);
    assert.deepEqual(calls[0], [
      'monitor-id',
      '1.0.0',
      'eu-west-3',
      {
        sessionSampleRate: 0.25,
        identityPoolId: 'pool-id',
        endpoint: 'https://dataplane.rum.eu-west-3.amazonaws.com',
        telemetries: ['performance', 'errors', 'http'],
        allowCookies: true,
        enableXRay: false,
      },
    ]);
  });

  it('logs and contains AWS RUM init failures', () => {
    const warnings = [];
    class BrokenAwsRum {
      constructor() {
        throw new Error('rum unavailable');
      }
    }

    const provider = createRumProvider({
      hostname: 'go.staging.etendo.cloud',
      env: {
        VITE_RUM_APP_MONITOR_ID_STAGING: 'monitor-id',
        VITE_RUM_IDENTITY_POOL_ID_STAGING: 'pool-id',
      },
      AwsRumCtor: BrokenAwsRum,
      logger: {
        warn(message, error) {
          warnings.push([message, error.message]);
        },
      },
    });

    assert.doesNotThrow(() => provider.init());
    assert.deepEqual(warnings, [['CloudWatch RUM init failed', 'rum unavailable']]);
  });

  it('keeps legacy no-op behavior when no hostname config matches', () => {
    const calls = [];
    class FakeAwsRum {
      constructor(...args) {
        calls.push(args);
      }
    }

    const provider = createRumProvider({
      hostname: 'localhost',
      env: {},
      AwsRumCtor: FakeAwsRum,
      logger: { warn() {} },
    });

    assert.equal(provider.enabled, false);
    assert.doesNotThrow(() => provider.init());
    assert.deepEqual(calls, []);

    const nullEnvProvider = createRumProvider({
      hostname: 'localhost',
      env: null,
      AwsRumCtor: FakeAwsRum,
      logger: { warn() {} },
    });

    assert.equal(nullEnvProvider.enabled, false);
    assert.doesNotThrow(() => nullEnvProvider.init());
    assert.deepEqual(calls, []);
  });

  it('bounds the RUM session sample rate and falls back conservatively', () => {
    assert.equal(
      resolveRumSessionSampleRate(undefined),
      DEFAULT_RUM_SESSION_SAMPLE_RATE
    );
    assert.equal(
      resolveRumSessionSampleRate(''),
      DEFAULT_RUM_SESSION_SAMPLE_RATE
    );
    assert.equal(
      resolveRumSessionSampleRate('   '),
      DEFAULT_RUM_SESSION_SAMPLE_RATE
    );
    assert.equal(resolveRumSessionSampleRate('0.5'), 0.5);
    assert.equal(resolveRumSessionSampleRate('2'), 1);
    assert.equal(resolveRumSessionSampleRate('-1'), 0);
    assert.equal(
      resolveRumSessionSampleRate('not-a-number'),
      DEFAULT_RUM_SESSION_SAMPLE_RATE
    );
  });
});

describe('browser observability config', () => {
  it('registers Sentry and AWS RUM providers behind the shared config', () => {
    const config = buildBrowserObservabilityConfig({
      env: {
        VITE_SENTRY_DSN: 'dsn-123',
        VITE_RUM_APP_MONITOR_ID_STAGING: 'monitor-id',
        VITE_RUM_IDENTITY_POOL_ID_STAGING: 'pool-id',
      },
      location: { hostname: 'go.staging.etendo.cloud' },
      logger: { warn() {} },
    });

    assert.deepEqual(config.context, {
      app: 'app-shell',
      environment: 'go.staging.etendo.cloud',
      hostname: 'go.staging.etendo.cloud',
      mockMode: false,
    });
    assert.deepEqual(config.providers.map(provider => provider.name), ['sentry', 'aws-rum', 'mixpanel']);
    assert.deepEqual(config.providers.map(provider => provider.enabled), [true, true, false]);
  });
});
