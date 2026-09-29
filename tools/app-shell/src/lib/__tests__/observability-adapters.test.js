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
  SENTRY_SEND_DEFAULT_PII,
  resolveSentryEnvironment,
  resolveSentryRelease,
} from '../sentry.js';

describe('sentry observability adapter', () => {
  it('takes the environment from the build-injected VITE_APP_ENV', () => {
    assert.equal(resolveSentryEnvironment({ VITE_APP_ENV: 'staging' }), 'staging');
    assert.equal(resolveSentryEnvironment({ VITE_APP_ENV: 'experimental' }), 'experimental');
    assert.equal(resolveSentryEnvironment({ VITE_APP_ENV: ' production ' }), 'production');
    assert.equal(resolveSentryEnvironment({ VITE_APP_ENV: '' }), 'development');
    assert.equal(resolveSentryEnvironment({}), 'development');
    assert.equal(resolveSentryEnvironment(undefined), 'development');
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
      sentry: fakeSentry,
      env: {
        VITE_APP_ENV: 'staging',
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

  it('never enables Sentry PII, whatever VITE_SENTRY_SEND_DEFAULT_PII says, in any environment (ETP-4578, D4)', () => {
    assert.equal(SENTRY_SEND_DEFAULT_PII, false);
    for (const appEnv of ['production', 'staging', 'experimental', 'development', undefined]) {
      for (const value of ['true', '1', 'yes', 'on', true]) {
        const calls = [];
        const provider = createSentryProvider({
          dsn: 'dsn-123',
          sentry: { browserTracingIntegration: () => 'bt', init: (options) => calls.push(options) },
          env: { VITE_APP_ENV: appEnv, VITE_SENTRY_SEND_DEFAULT_PII: value },
        });
        provider.init();
        assert.equal(calls[0].sendDefaultPii, false, `env=${appEnv} value=${value}`);
      }
    }
  });

  it('installs the SDK egress hooks, which is where the traffic the gateway never sees is sanitized', () => {
    const calls = [];
    const provider = createSentryProvider({
      dsn: 'dsn-123',
      sentry: { init: (options) => calls.push(options) },
      env: {},
    });
    provider.init();

    for (const hook of ['beforeSend', 'beforeSendTransaction', 'beforeSendSpan', 'beforeBreadcrumb']) {
      assert.equal(typeof calls[0][hook], 'function', `${hook} must be installed`);
    }
    assert.equal(calls[0].sampleRate, 1);
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
  it('takes the RUM config from the build-injected IDs', () => {
    assert.deepEqual(
      resolveRumConfig({
        VITE_RUM_APP_MONITOR_ID: 'monitor',
        VITE_RUM_IDENTITY_POOL_ID: 'pool',
      }),
      { appMonitorId: 'monitor', identityPoolId: 'pool' }
    );
    assert.deepEqual(resolveRumConfig({}), {
      appMonitorId: undefined,
      identityPoolId: undefined,
    });
  });

  it('stays disabled when the build did not inject RUM IDs', () => {
    const provider = createRumProvider({
      env: { VITE_RUM_ENABLED: 'true' },
      AwsRumCtor: class {
        constructor() {
          throw new Error('must not be constructed');
        }
      },
      logger: { warn() {} },
    });
    provider.init();

    assert.equal(provider.enabled, false);
  });

  it('is optional: the injected IDs alone no longer switch it on, it needs an explicit VITE_RUM_ENABLED (ETP-4578, D3)', () => {
    const ids = { VITE_RUM_APP_MONITOR_ID: 'monitor-id', VITE_RUM_IDENTITY_POOL_ID: 'pool-id' };
    const off = createRumProvider({ env: ids, AwsRumCtor: class {}, logger: { warn() {} } });
    assert.equal(off.enabled, false);

    for (const flag of ['false', '1', 'yes', '']) {
      assert.equal(createRumProvider({ env: { ...ids, VITE_RUM_ENABLED: flag }, AwsRumCtor: class {}, logger: { warn() {} } }).enabled, false, flag);
    }
    assert.equal(createRumProvider({ env: { ...ids, VITE_RUM_ENABLED: 'true' }, AwsRumCtor: class {}, logger: { warn() {} } }).enabled, true);
  });

  it('initializes AWS RUM with the existing region, endpoint, telemetries, and bounded sample rate', async () => {
    const calls = [];
    class FakeAwsRum {
      constructor(...args) {
        calls.push(args);
      }
    }

    const provider = createRumProvider({
      env: {
        VITE_RUM_ENABLED: 'true',
        VITE_RUM_APP_MONITOR_ID: 'monitor-id',
        VITE_RUM_IDENTITY_POOL_ID: 'pool-id',
        VITE_RUM_SESSION_SAMPLE_RATE: '0.25',
      },
      AwsRumCtor: FakeAwsRum,
      logger: { warn() {} },
    });
    await provider.init();

    assert.equal(provider.name, 'aws-rum');
    assert.equal(provider.enabled, true);
    const [appMonitorId, version, region, config] = calls[0];
    assert.equal(appMonitorId, 'monitor-id');
    assert.equal(version, '1.0.0');
    assert.equal(region, 'eu-west-3');
    assert.equal(config.sessionSampleRate, 0.25);
    assert.equal(config.identityPoolId, 'pool-id');
    assert.equal(config.endpoint, 'https://dataplane.rum.eu-west-3.amazonaws.com');
    assert.deepEqual(config.telemetries, ['performance', 'errors', 'http']);
    assert.equal(config.enableXRay, false);
    // ETP-4578: batches are sanitized through the client builder, before they are signed.
    assert.equal(typeof config.clientBuilder, 'function');
  });

  it('keeps cookies off unless VITE_RUM_ALLOW_COOKIES=true (open question for Privacy)', async () => {
    const seen = [];
    class FakeAwsRum {
      constructor(...args) {
        seen.push(args[3].allowCookies);
      }
    }
    const base = {
      VITE_RUM_ENABLED: 'true',
      VITE_RUM_APP_MONITOR_ID: 'monitor-id',
      VITE_RUM_IDENTITY_POOL_ID: 'pool-id',
    };
    await createRumProvider({ env: base, AwsRumCtor: FakeAwsRum, logger: { warn() {} } }).init();
    await createRumProvider({ env: { ...base, VITE_RUM_ALLOW_COOKIES: 'true' }, AwsRumCtor: FakeAwsRum, logger: { warn() {} } }).init();
    assert.deepEqual(seen, [false, true]);
  });

  it('logs and contains AWS RUM init failures', async () => {
    const warnings = [];
    class BrokenAwsRum {
      constructor() {
        throw new Error('rum unavailable');
      }
    }

    const provider = createRumProvider({
      env: {
        VITE_RUM_ENABLED: 'true',
        VITE_RUM_APP_MONITOR_ID: 'monitor-id',
        VITE_RUM_IDENTITY_POOL_ID: 'pool-id',
      },
      AwsRumCtor: BrokenAwsRum,
      logger: {
        warn(message, error) {
          warnings.push([message, error.message]);
        },
      },
    });

    await assert.doesNotReject(() => provider.init());
    assert.deepEqual(warnings, [['[observability] aws-rum init failed', 'rum unavailable']]);
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

    // A disabled adapter is never started: the gateway (and the facade's isProviderEnabled)
    // skip it, so the SDK constructor is not reached.
    assert.equal(provider.enabled, false);
    assert.deepEqual(calls, []);

    const nullEnvProvider = createRumProvider({
      hostname: 'localhost',
      env: null,
      AwsRumCtor: FakeAwsRum,
      logger: { warn() {} },
    });

    assert.equal(nullEnvProvider.enabled, false);
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
        VITE_RUM_ENABLED: 'true',
        VITE_RUM_APP_MONITOR_ID: 'monitor-id',
        VITE_RUM_IDENTITY_POOL_ID: 'pool-id',
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
