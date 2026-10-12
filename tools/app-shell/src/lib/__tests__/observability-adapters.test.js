// @covers .github/workflows/deploy-staging.yml
// @covers tools/app-shell/vite.config.js
// @covers tools/app-shell/src/lib/observability/browser.js
// @covers tools/app-shell/src/lib/observability/providers/datadog.js
// @covers tools/app-shell/src/lib/rum.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildBrowserObservabilityConfig } from '../observability/browser.js';
import {
  createRumProvider,
  DEFAULT_RUM_SESSION_SAMPLE_RATE,
  resolveRumConfig,
  resolveRumSessionSampleRate,
} from '../rum.js';
import { createDatadogProvider, DATADOG_RUM_FEATURE_FLAG_EVENTS, redactDatadogEvent, redactErrorText, resolveTracingUrls } from '../observability/providers/datadog.js';

const datadogEnv = {
  VITE_DATADOG_ENABLED: 'true', VITE_DATADOG_APPLICATION_ID: 'test-app',
  VITE_DATADOG_CLIENT_TOKEN: 'test-token', VITE_DATADOG_SITE: 'datadoghq.eu',
  VITE_APP_ENV: 'test', VITE_APP_VERSION: 'test-release',
  VITE_DATADOG_REMOTE_CONFIGURATION_ID: 'remote-config',
};
function sdkRecorder() {
  const calls = [];
  const sdk = Object.fromEntries(['init', 'startView', 'addAction', 'addError', 'setUser',
    'setAccount', 'stopSession', 'clearUser', 'clearAccount', 'setGlobalContext'].map(method =>
    [method, (...args) => calls.push([method, ...args])]));
  return { calls, sdk };
}

describe('Datadog observability adapter', () => {
  it('loads no SDK for disabled or incomplete configuration', async () => {
    for (const env of [{}, { ...datadogEnv, VITE_DATADOG_ENABLED: 'false' },
      { ...datadogEnv, VITE_DATADOG_CLIENT_TOKEN: '' }]) {
      let loads = 0;
      const provider = createDatadogProvider({ env, logger: { warn() {} }, loader: async () => {
        loads++; throw new Error('must not load');
      } });
      await Promise.all([
        provider.init(),
        provider.track('record_saved', {}),
        provider.addFeatureFlagEvaluation('sample_flag', true),
        provider.page('/sales-order'),
      ]);
      assert.equal(provider.enabled, false);
      assert.equal(loads, 0);
    }
  });

  it('initializes once across concurrent callers with manual privacy-safe tracking', async () => {
    const { calls, sdk } = sdkRecorder();
    let loads = 0;
    const provider = createDatadogProvider({ env: datadogEnv, loader: async () => {
      loads++; return { datadogRum: sdk, reactPlugin: options => ({ name: 'react', options }) };
    } });
    await Promise.all([provider.init(), provider.track('record_saved', { entity: 'header' }),
      provider.identify('account-1', { email: 'private@example.com' })]);
    assert.equal(loads, 1);
    const options = calls.find(([method]) => method === 'init')[1];
    assert.equal(calls.filter(([method]) => method === 'init').length, 1);
    assert.equal(options.trackUserInteractions, true);
    assert.equal(options.trackViewsManually, true);
    assert.equal(options.sessionReplaySampleRate, 20);
    assert.deepEqual(options.remoteConfiguration, { id: 'remote-config' });
    assert.deepEqual(options.trackFeatureFlagsForEvents, DATADOG_RUM_FEATURE_FLAG_EVENTS);
    assert.deepEqual(options.plugins, [{ name: 'react', options: { router: false } }]);
    assert.equal(options.version, 'test-release');
    assert.equal(options.defaultPrivacyLevel, 'mask');
    assert.deepEqual(options.allowedTracingUrls, []);
    assert.equal(options.traceSampleRate, 20);
    assert.deepEqual(calls.find(([method]) => method === 'addAction'),
      ['addAction', 'record_saved', { entity: 'header' }]);
    assert.deepEqual(calls.find(([method]) => method === 'setUser'), ['setUser', { id: 'account-1' }]);
  });

  it('normalizes manual views and does not duplicate the same route', async () => {
    const { calls, sdk } = sdkRecorder();
    const provider = createDatadogProvider({ env: datadogEnv, loader: async () => ({ datadogRum: sdk }) });
    await provider.init();
    const initialViews = calls.filter(([method]) => method === 'startView').length;
    await provider.page('/sales-order/123?token=private');
    await provider.page('/sales-order/456?email=private');
    const views = calls.filter(([method]) => method === 'startView');
    assert.equal(views.length, initialViews + 1);
    assert.deepEqual(views.at(-1), ['startView', { name: '/sales-order/:recordId' }]);
  });

  it('preserves the Error stack while redacting error metadata', async () => {
    const { calls, sdk } = sdkRecorder();
    const provider = createDatadogProvider({ env: datadogEnv, loader: async () => ({ datadogRum: sdk }) });
    const error = new TypeError('failed');
    await provider.captureException(error, { component: 'header', password: 'secret', email: 'private@example.com' });
    const [, sentError, details] = calls.find(([method]) => method === 'addError');
    assert.equal(sentError, error);
    assert.equal(sentError.stack, error.stack);
    assert.deepEqual(details, { component: 'header' });
  });

  it('clears user, tenant and global context on logout', async () => {
    const { calls, sdk } = sdkRecorder();
    const provider = createDatadogProvider({ env: datadogEnv, loader: async () => ({ datadogRum: sdk }) });
    await provider.identify('account-1');
    await provider.group('account_id', 'tenant-1');
    assert.deepEqual(calls.find(([method]) => method === 'setAccount'), ['setAccount', { id: 'tenant-1' }]);
    await provider.reset();
    assert.deepEqual(calls.slice(-4), [['stopSession'], ['clearUser'], ['clearAccount'], ['setGlobalContext', {}]]);
  });

  it('redacts nested error causes recursively', () => {
    const event = { error: { message: 'outer person@example.com', stack: 'https://go.example/app.js?token=secret', causes: [
      { message: 'inner user@example.com', stack: 'password=secret https://go.example/error.js?email=private' },
      { message: 'deep', causes: [{ message: 'deep@example.com', stack: 'token=private' }] },
    ] } };
    assert.equal(redactDatadogEvent(event), true);
    assert.ok(!event.error.message.includes('@example.com'));
    assert.ok(!event.error.stack.includes('token=secret'));
    assert.ok(!event.error.causes[0].message.includes('@example.com'));
    assert.ok(!event.error.causes[0].stack.includes('password=secret'));
    assert.ok(!event.error.causes[1].causes[0].message.includes('@example.com'));
    assert.ok(!event.error.causes[1].causes[0].stack.includes('token=private'));
  });

  it('redacts automatic resource/view URLs and user/account PII', () => {
    const event = { view: { url: '/sales-order/123?token=private', referrer: '/purchase-order/456?email=private' },
      resource: { url: '/sales-order/123?token=private' }, context: { component: 'header', password: 'secret' },
      usr: { id: 'account-1', email: 'private@example.com' }, account: { id: 'tenant-1', name: 'private' } };
    assert.equal(redactDatadogEvent(event), true);
    assert.equal(event.view.url, '/sales-order/:recordId');
    assert.equal(event.resource.url, '/sales-order/:recordId');
    assert.deepEqual(event.context, { component: 'header' });
    assert.deepEqual(event.usr, { id: 'account-1' });
    assert.deepEqual(event.account, { id: 'tenant-1' });
  });

  it('redacts bearer credentials in error text', () => {
    const result = redactErrorText('request failed Authorization: Bearer super-secret-token');
    assert.match(result, /Authorization=\[redacted\]/i);
    assert.ok(!result.includes('super-secret-token'));
  });

  it('redacts standalone bearer credentials in error text', () => {
    const result = redactErrorText('request failed with Bearer super-secret-token');
    assert.match(result, /Bearer \[redacted\]/i);
    assert.ok(!result.includes('super-secret-token'));
  });

  it('redacts quoted JSON-like credential pairs in error text', () => {
    const result = redactErrorText('{"authorization":"Bearer super-secret-token","token":"private"}');
    assert.match(result, /"authorization": "\[redacted\]"/i);
    assert.match(result, /"token": "\[redacted\]"/i);
    assert.ok(!result.includes('super-secret-token'));
    assert.ok(!result.includes('private'));
  });

  it('starts a fresh RUM view when the tenant changes, without doing so on logout', async () => {
    const { calls, sdk } = sdkRecorder();
    const provider = createDatadogProvider({ env: datadogEnv, loader: async () => ({ datadogRum: sdk }) });
    await provider.init();
    const initialViews = calls.filter(([method]) => method === 'startView').length;

    await provider.group('account_id', 'tenant-1');
    assert.equal(calls.filter(([method]) => method === 'startView').length, initialViews);
    await provider.reset();
    assert.equal(calls.filter(([method]) => method === 'startView').length, initialViews);
    await provider.group('account_id', 'tenant-2');
    assert.equal(calls.filter(([method]) => method === 'startView').length, initialViews + 1);
    const accountIndex = calls.findLastIndex(([method, args]) => method === 'setAccount' && args.id === 'tenant-2');
    const viewIndex = calls.findLastIndex(([method]) => method === 'startView');
    assert.ok(accountIndex < viewIndex);
    await provider.reset();
    assert.equal(calls.filter(([method]) => method === 'startView').length, initialViews + 1);
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
      env: {},
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

  it('initializes AWS RUM with the existing region, endpoint, telemetries, and bounded sample rate', () => {
    const calls = [];
    class FakeAwsRum {
      constructor(...args) {
        calls.push(args);
      }
    }

    const provider = createRumProvider({
      env: {
        VITE_RUM_APP_MONITOR_ID: 'monitor-id',
        VITE_RUM_IDENTITY_POOL_ID: 'pool-id',
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
      env: {
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
  it('registers Datadog and optional AWS RUM/Mixpanel behind the shared config', () => {
    const config = buildBrowserObservabilityConfig({
      env: {
        ...datadogEnv,
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
});

describe('error text privacy', () => {
  it('preserves source frame filenames and positions while stripping URL query, email and credentials', () => {
    const result = redactErrorText('Error token=private person@example.com\n at save (https://go.example/assets/app-abc.js?token=private:12:4)');
    assert.ok(result.includes('https://go.example/assets/app-abc.js:12:4'));
    assert.ok(!result.includes('person@example.com'));
    assert.ok(!result.includes('private'));
    assert.ok(result.includes('token=[redacted]'));
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
