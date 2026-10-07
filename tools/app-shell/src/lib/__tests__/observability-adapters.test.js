// @covers .github/workflows/deploy-staging.yml
// @covers tools/app-shell/vite.config.js
// @covers tools/app-shell/src/lib/observability/browser.js
// @covers tools/app-shell/src/lib/observability/providers/datadog.js
// @covers tools/app-shell/src/lib/rum.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildBrowserObservabilityConfig } from '../observability/browser.js';
import { createObservability } from '../observability/core.js';
import {
  createRumProvider,
  DEFAULT_RUM_SESSION_SAMPLE_RATE,
  resolveRumConfig,
  resolveRumSessionSampleRate,
} from '../rum.js';
import { createDatadogProvider } from '../observability/providers/datadog.js';
import { resolveTracingUrls } from '@etendosoftware/app-shell-core/observability/adapters/datadog';

const datadogEnv = {
  VITE_DATADOG_ENABLED: 'true', VITE_DATADOG_APPLICATION_ID: 'test-app',
  VITE_DATADOG_CLIENT_TOKEN: 'test-token', VITE_DATADOG_SITE: 'datadoghq.eu',
  VITE_APP_ENV: 'test', VITE_APP_VERSION: 'test-release',
  VITE_DATADOG_REMOTE_CONFIGURATION_ID: 'remote-config',
};
const silent = { warn() {} };

function sdkRecorder() {
  const calls = [];
  const sdk = Object.fromEntries(['init', 'startView', 'addAction', 'addError', 'setUser',
    'setAccount', 'stopSession', 'clearUser', 'clearAccount', 'setGlobalContext',
    'setTrackingConsent', 'addFeatureFlagEvaluation'].map(method =>
    [method, (...args) => calls.push([method, ...args])]));
  return { calls, sdk };
}

/**
 * The host's Datadog provider behind the real facade and gateway (ETP-4578): what these tests
 * check is what actually reaches the SDK, after the host's payload policy and the gateway.
 */
async function observedDatadog(env = datadogEnv, extra = {}) {
  const { calls, sdk } = sdkRecorder();
  let loads = 0;
  const provider = createDatadogProvider({
    env,
    logger: silent,
    loader: async () => { loads++; return { datadogRum: sdk, ...extra }; },
  });
  const observability = createObservability({ logger: silent });
  await observability.initObservability({ providers: [provider], logger: silent });
  const options = () => calls.find(([method]) => method === 'init')?.[1];
  return { calls, observability, options, loads: () => loads };
}

/** Runs the SDK's beforeSend on an event, as the SDK would before sending it. */
function beforeSend(options, event) {
  const copy = structuredClone(event);
  const keep = options.beforeSend(copy);
  return { keep, event: copy };
}

describe('Datadog observability provider (behind the gateway)', () => {
  it('loads no SDK for disabled or incomplete configuration', async () => {
    for (const env of [{}, { ...datadogEnv, VITE_DATADOG_ENABLED: 'false' },
      { ...datadogEnv, VITE_DATADOG_CLIENT_TOKEN: '' }]) {
      let loads = 0;
      const provider = createDatadogProvider({ env, logger: silent, loader: async () => {
        loads++; throw new Error('must not load');
      } });
      await provider.init();
      provider.track('record_saved', {});
      provider.addFeatureFlagEvaluation('sample_flag', true);
      provider.page('/sales-order');
      assert.equal(provider.enabled, false);
      assert.equal(loads, 0);
    }
  });

  it('initializes once with manual, privacy-safe tracking from the deploy settings', async () => {
    const { observability, calls, options, loads } = await observedDatadog(datadogEnv, {
      reactPlugin: (pluginOptions) => ({ name: 'react', options: pluginOptions }),
    });
    await observability.track('record_saved', { entity: 'header' });
    await observability.identify('account-1', { email: 'private@example.com' });
    assert.equal(loads(), 1);
    assert.equal(calls.filter(([method]) => method === 'init').length, 1);
    const init = options();
    assert.equal(init.trackUserInteractions, true);
    assert.equal(init.trackViewsManually, true);
    assert.equal(init.sessionReplaySampleRate, 20);
    assert.equal(init.remoteConfigurationId, 'remote-config');
    assert.deepEqual(init.trackFeatureFlagsForEvents, ['vital', 'action', 'long_task', 'resource']);
    assert.deepEqual(init.plugins, [{ name: 'react', options: { router: false } }]);
    assert.equal(init.version, 'test-release');
    assert.equal(init.service, 'etendo-go-web');
    assert.equal(init.defaultPrivacyLevel, 'mask');
    assert.deepEqual(init.allowedTracingUrls, []);
    assert.equal(init.traceSampleRate, 20);
    const [, actionName, actionProperties] = calls.find(([method]) => method === 'addAction');
    assert.equal(actionName, 'record_saved');
    assert.equal(actionProperties.entity, 'header');
    assert.deepEqual(calls.find(([method]) => method === 'setUser'), ['setUser', { id: 'account-1' }]);
  });

  it('normalizes manual views and does not duplicate the same route', async () => {
    const { observability, calls } = await observedDatadog();
    const initialViews = calls.filter(([method]) => method === 'startView').length;
    await observability.page('/sales-order/123?token=private');
    await observability.page('/sales-order/456?email=private');
    const views = calls.filter(([method]) => method === 'startView');
    assert.equal(views.length, initialViews + 1);
    assert.deepEqual(views.at(-1), ['startView', { name: '/sales-order/:recordId' }]);
  });

  it('sends errors with their stack and only approved details', async () => {
    const { observability, calls } = await observedDatadog();
    const error = new TypeError('failed');
    await observability.captureException(error, { component: 'header', password: 'secret', email: 'private@example.com' });
    const [, sentError, details] = calls.find(([method]) => method === 'addError');
    assert.equal(sentError.name, 'TypeError');
    assert.equal(sentError.message, 'failed');
    assert.equal(sentError.stack, error.stack);
    assert.deepEqual(Object.keys(details), ['component']);
  });

  it('clears user, tenant and global context on logout', async () => {
    const { observability, calls } = await observedDatadog();
    await observability.identify('account-1');
    await observability.group('account_id', 'tenant-1');
    assert.deepEqual(calls.find(([method]) => method === 'setAccount'), ['setAccount', { id: 'tenant-1' }]);
    await observability.reset();
    assert.deepEqual(calls.slice(-4), [['stopSession'], ['clearUser'], ['clearAccount'], ['setGlobalContext', {}]]);
  });

  it('starts a fresh RUM view when the tenant changes, without doing so on logout', async () => {
    const { observability, calls } = await observedDatadog();
    const initialViews = calls.filter(([method]) => method === 'startView').length;

    await observability.group('account_id', 'tenant-1');
    assert.equal(calls.filter(([method]) => method === 'startView').length, initialViews);
    await observability.reset();
    assert.equal(calls.filter(([method]) => method === 'startView').length, initialViews);
    await observability.group('account_id', 'tenant-2');
    assert.equal(calls.filter(([method]) => method === 'startView').length, initialViews + 1);
    const accountIndex = calls.findLastIndex(([method, args]) => method === 'setAccount' && args.id === 'tenant-2');
    const viewIndex = calls.findLastIndex(([method]) => method === 'startView');
    assert.ok(accountIndex < viewIndex);
    await observability.reset();
    assert.equal(calls.filter(([method]) => method === 'startView').length, initialViews + 1);
  });

  it('reports flag evaluations made before telemetry started, once it does', async () => {
    const { calls, sdk } = sdkRecorder();
    const provider = createDatadogProvider({ env: datadogEnv, logger: silent, loader: async () => ({ datadogRum: sdk }) });
    const observability = createObservability({ logger: silent });
    await observability.addFeatureFlagEvaluation('page-help-suggestions', true);
    await observability.initObservability({ providers: [provider], logger: silent });
    assert.deepEqual(calls.filter(([method]) => method === 'addFeatureFlagEvaluation'),
      [['addFeatureFlagEvaluation', 'page_help_suggestions', true]]);
  });

  // The SDK collects views, resources and unhandled errors on its own: beforeSend is the only
  // place that traffic is sanitized. (The SDK reverts a change to `usr`, `account` or
  // `error.causes`, so those are kept clean at the source instead; see the core's
  // docs/security/telemetry-egress.md.)
  it('redacts automatic resource and view URLs and unapproved context', async () => {
    const { options } = await observedDatadog();
    const { keep, event } = beforeSend(options(), {
      type: 'resource',
      view: { url: '/sales-order/123?token=private', referrer: '/purchase-order/456?email=private' },
      resource: { url: '/sales-order/123?token=private' },
      context: { component: 'header', password: 'secret' },
    });
    assert.equal(keep, true);
    assert.equal(event.view.url, '/sales-order/:recordId');
    assert.equal(event.view.referrer, '/purchase-order/:recordId');
    assert.equal(event.resource.url, '/sales-order/:recordId');
    assert.deepEqual(event.context, { component: 'header' });
  });

  it('redacts credentials and emails in automatic error text', async () => {
    const { options } = await observedDatadog();
    for (const message of [
      'request failed Authorization: Bearer super-secret-token-value-1234567890',
      '{"authorization":"Bearer super-secret-token-value-1234567890"}',
      'failed for person@example.com',
    ]) {
      const { event } = beforeSend(options(), { type: 'error', error: { message, stack: message } });
      for (const secret of ['super-secret-token', 'person@example.com']) {
        assert.ok(!event.error.message.includes(secret), message);
        assert.ok(!event.error.stack.includes(secret), message);
      }
    }
  });

  it('keeps source frame URLs and positions, which the uploaded source maps resolve', async () => {
    const { options } = await observedDatadog();
    const stack = 'TypeError: x\n    at save (https://go.example/assets/index-B3x9kQ2a.js:12:4567)';
    const { event } = beforeSend(options(), { type: 'error', error: { message: 'x', stack } });
    assert.ok(event.error.stack.includes('https://go.example/assets/index-B3x9kQ2a.js:12:4567'));
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
  it('registers Datadog and optional AWS RUM/Mixpanel behind the shared config', () => {
    const config = buildBrowserObservabilityConfig({
      env: {
        ...datadogEnv,
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
    assert.deepEqual(config.providers.map(provider => provider.name), ['datadog', 'aws-rum', 'mixpanel']);
    assert.deepEqual(config.providers.map(provider => provider.enabled), [true, true, false]);
  });

  // ETP-4578 H6 (D3): every provider is opt-in and needs its own explicit switch plus its
  // configuration. (Sentry was the one exception, mandatory with a DSN; ETP-5605 removed it.)
  describe('optional providers are off by default', () => {
    const enabledOf = (env) => Object.fromEntries(
      buildBrowserObservabilityConfig({ env, location: { hostname: 'h' }, logger: silent })
        .providers.map((provider) => [provider.name, provider.enabled]),
    );
    const RUM_IDS = { VITE_RUM_APP_MONITOR_ID: 'monitor-id', VITE_RUM_IDENTITY_POOL_ID: 'pool-id' };
    const MIXPANEL_TOKEN = { VITE_MIXPANEL_TOKEN: 'fake-project-token' };
    const DATADOG_CONFIG = Object.fromEntries(Object.entries(datadogEnv).filter(([key]) => key !== 'VITE_DATADOG_ENABLED'));
    const NONE = { datadog: false, 'aws-rum': false, mixpanel: false };

    it('starts nothing from an empty environment', () => {
      assert.deepEqual(enabledOf({}), NONE);
    });

    it('does not start any provider from its IDs and tokens alone', () => {
      assert.deepEqual(enabledOf({ ...DATADOG_CONFIG, ...RUM_IDS, ...MIXPANEL_TOKEN }), NONE);
    });

    it('needs the explicit switch AND the configuration, for each provider', () => {
      assert.deepEqual(enabledOf({ VITE_DATADOG_ENABLED: 'true' }), NONE, 'Datadog switch without its configuration');
      assert.deepEqual(enabledOf({ VITE_RUM_ENABLED: 'true' }), NONE, 'RUM switch without IDs');
      assert.deepEqual(enabledOf({ VITE_MIXPANEL_ENABLED: 'true' }), NONE, 'Mixpanel switch without a token');
      assert.deepEqual(enabledOf(datadogEnv), { ...NONE, datadog: true });
      assert.deepEqual(enabledOf({ VITE_RUM_ENABLED: 'true', ...RUM_IDS }), { ...NONE, 'aws-rum': true });
      assert.deepEqual(enabledOf({ VITE_MIXPANEL_ENABLED: 'true', ...MIXPANEL_TOKEN }), { ...NONE, mixpanel: true });
    });

    it('takes only the literal "true" as opt-in', () => {
      for (const value of ['1', 'yes', 'TRUE', 'on', ' true']) {
        assert.deepEqual(
          enabledOf({
            ...DATADOG_CONFIG, VITE_DATADOG_ENABLED: value,
            VITE_RUM_ENABLED: value, ...RUM_IDS, VITE_MIXPANEL_ENABLED: value, ...MIXPANEL_TOKEN,
          }),
          NONE,
          value,
        );
      }
    });
  });
});

describe('private source-map release policy', () => {
  it('uses the same SHA release for browser SDK and uploaded maps, then removes maps before deployment', () => {
    const workflow = readFileSync(new URL('../../../../../.github/workflows/deploy-staging.yml', import.meta.url), 'utf8');
    const vite = readFileSync(new URL('../../../vite.config.js', import.meta.url), 'utf8');
    assert.match(vite, /sourcemap: 'hidden'/);
    assert.match(workflow, /VITE_APP_VERSION: \$\{\{ github.sha \}\}/);
    assert.match(workflow, /--release-version "\$\{\{ github.sha \}\}"/);
    assert.match(workflow, /DATADOG_API_KEY: \$\{\{ secrets.DATADOG_API_KEY \}\}/);
    assert.match(workflow, /if \[\[ -z "\$\{DATADOG_API_KEY:-\}" \]\]; then/);
    assert.doesNotMatch(workflow, /if: \$\{\{ secrets\.DATADOG_API_KEY/);
    const upload = workflow.indexOf('datadog-ci sourcemaps upload');
    const remove = workflow.indexOf("find tools/app-shell/dist -name '*.map' -delete");
    assert.ok(upload >= 0 && remove > upload);
  });

  it('resolves Datadog credentials and trace bases per deployment target', () => {
    const workflow = readFileSync(new URL('../../../../../.github/workflows/deploy-staging.yml', import.meta.url), 'utf8');
    for (const target of ['PRODUCTION', 'STAGING', 'EXPERIMENTAL']) {
      assert.match(workflow, new RegExp(`datadog_application_id=\\$\\{\\{ vars\\.VITE_DATADOG_APPLICATION_ID_${target} \\}\\}`));
      assert.match(workflow, new RegExp(`datadog_client_token=\\$\\{\\{ vars\\.VITE_DATADOG_CLIENT_TOKEN_${target} \\}\\}`));
      assert.match(workflow, new RegExp(`datadog_trace_api_bases=\\$\\{\\{ vars\\.VITE_DATADOG_TRACE_API_BASES_${target} \\}\\}`));
      // The value is a JSON array: inside double quotes its own quotes close the shell string and
      // the build gets `[https://…]`, which resolveTracingUrls rejects (no trace propagation).
      assert.match(workflow, new RegExp(`echo 'datadog_trace_api_bases=\\$\\{\\{ vars\\.VITE_DATADOG_TRACE_API_BASES_${target} \\}\\}'`));
    }
    assert.match(workflow, /VITE_DATADOG_APPLICATION_ID: \$\{\{ steps\.target\.outputs\.datadog_application_id \}\}/);
    assert.match(workflow, /VITE_DATADOG_CLIENT_TOKEN: \$\{\{ steps\.target\.outputs\.datadog_client_token \}\}/);
    assert.match(workflow, /VITE_DATADOG_TRACE_API_BASES: \$\{\{ steps\.target\.outputs\.datadog_trace_api_bases \}\}/);
    assert.match(workflow, /--minified-path-prefix "\$\{\{ steps\.target\.outputs\.public_origin \}\}\/"/);
    assert.doesNotMatch(workflow, /VITE_DATADOG_APPLICATION_ID: \$\{\{ vars\.VITE_DATADOG_APPLICATION_ID \}\}/);
    assert.doesNotMatch(workflow, /VITE_DATADOG_CLIENT_TOKEN: \$\{\{ vars\.VITE_DATADOG_CLIENT_TOKEN \}\}/);
  });
});

describe('first-party trace propagation', () => {
  it('matches only exact trusted origin and NEO subtree under the configured API base', () => {
    const [rule] = resolveTracingUrls(JSON.stringify(['https://core.example/custom']));
    assert.deepEqual(rule.propagatorTypes, ['tracecontext', 'datadog']);
    for (const url of ['https://core.example/custom/sws/neo', 'https://core.example/custom/sws/neo/session?x=1']) assert.equal(rule.match(url), true, url);
    for (const url of ['https://core.example.evil/custom/sws/neo/session', 'https://evilcore.example/custom/sws/neo',
      'https://core.example/custom/sws/neoevil', 'https://core.example/custom/sws/neo-other',
      'https://core.example/other/sws/neo', 'https://core.example/custom2/sws/neo',
      'http://core.example/custom/sws/neo', 'https://user:secret@core.example/custom/sws/neo', 'not-a-url']) assert.equal(rule.match(url), false, url);
  });
  it('disables propagation for missing, malformed or invalid trusted base configuration', () => {
    for (const raw of [undefined, '', '{bad', '{}', '["https://user:secret@core.example"]',
      '["https://core.example?token=secret"]', '["https://*.example"]', '["file:///tmp"]']) {
      assert.deepEqual(resolveTracingUrls(raw, { warn() {} }), [], String(raw));
    }
  });
  it('passes trusted trace rules, sampled injection, EU site and bounded rates to the SDK', async () => {
    for (const [value, expected] of [[undefined, 20], ['bad', 20], ['-1', 0], ['200', 100], ['35', 35]]) {
      const { calls, sdk } = sdkRecorder();
      const provider = createDatadogProvider({ env: { ...datadogEnv,
        VITE_DATADOG_TRACE_API_BASES: '["https://core.example/custom"]', VITE_DATADOG_TRACE_SAMPLE_RATE: value }, loader: async () => ({ datadogRum: sdk }) });
      await provider.init();
      const options = calls.find(([method]) => method === 'init')[1];
      assert.equal(options.site, 'datadoghq.eu');
      assert.equal(options.traceSampleRate, expected);
      assert.equal(options.traceContextInjection, 'sampled');
      assert.deepEqual(options.allowedTracingUrls[0].propagatorTypes, ['tracecontext', 'datadog']);
      assert.equal(options.allowedTracingUrls[0].match('https://core.example/custom/sws/neo/session'), true);
      assert.equal(options.allowedTracingUrls[0].match('https://external.example/session'), false);
    }
  });
});
