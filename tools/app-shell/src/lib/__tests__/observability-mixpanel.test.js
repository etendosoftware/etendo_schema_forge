import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildBrowserObservabilityConfig } from '../observability/browser.js';
import { createMixpanelProvider } from '../observability/providers/mixpanel.js';

function createFakeMixpanel(calls) {
  return {
    init(token, options) {
      calls.push(['init', token, options]);
    },
    track(eventName, properties, _options, callback) {
      calls.push(['track', eventName, properties]);
      callback?.();
    },
    identify(userId) {
      calls.push(['identify', userId]);
    },
    people: {
      set(traits) {
        calls.push(['people.set', traits]);
      },
    },
    set_group(groupKey, groupId) {
      calls.push(['set_group', groupKey, groupId]);
    },
    get_group(groupKey, groupId) {
      calls.push(['get_group', groupKey, groupId]);
      return {
        set(properties) {
          calls.push(['group.set', properties]);
        },
      };
    },
    async flush() {
      calls.push(['flush']);
    },
  };
}

describe('Mixpanel observability adapter', () => {
  it('stays disabled and does not load the SDK unless explicitly enabled', async () => {
    let loadCount = 0;
    const provider = createMixpanelProvider({
      enabled: false,
      token: 'token-123',
      loader: async () => {
        loadCount += 1;
        return createFakeMixpanel([]);
      },
    });

    await provider.init();
    await provider.track('event');

    assert.equal(provider.enabled, false);
    assert.equal(loadCount, 0);
  });

  it('warns and remains disabled when enabled without token', async () => {
    const warnings = [];
    const provider = createMixpanelProvider({
      enabled: 'true',
      token: '',
      logger: {
        warn(message) {
          warnings.push(message);
        },
      },
      loader: async () => createFakeMixpanel([]),
    });

    await provider.init();

    assert.equal(provider.enabled, false);
    assert.deepEqual(warnings, [
      '[observability] Mixpanel is enabled but VITE_MIXPANEL_TOKEN is missing',
    ]);
  });

  it('initializes and tracks through the lazy-loaded SDK when configured', async () => {
    const calls = [];
    const provider = createMixpanelProvider({
      enabled: 'true',
      token: 'token-123',
      debug: 'true',
      apiHost: 'https://mixpanel.example',
      loader: async () => ({ default: createFakeMixpanel(calls) }),
    });

    await provider.init();
    await provider.track('app_started', { app: 'app-shell' });
    await provider.page('/dashboard', { route: '/dashboard' });
    await provider.identify('user-1', { role: 'admin' });
    await provider.flush();

    assert.deepEqual(calls, [
      ['init', 'token-123', { debug: true, api_host: 'https://mixpanel.example', batch_requests: false }],
      ['track', 'app_started', { app: 'app-shell' }],
      ['track', 'page_view', { route: '/dashboard', routePattern: '/dashboard' }],
      ['identify', 'user-1'],
      ['people.set', { role: 'admin' }],
      ['flush'],
    ]);
  });

  it('resolves the track promise via the SDK completion callback', async () => {
    const calls = [];
    let capturedCallback;
    const provider = createMixpanelProvider({
      enabled: 'true',
      token: 'token-123',
      loader: async () => ({
        default: {
          init() {},
          track(eventName, properties, _options, callback) {
            calls.push(['track', eventName, properties]);
            capturedCallback = callback;
          },
        },
      }),
    });

    await provider.init();
    let resolved = false;
    const pending = provider.track('deferred_event', { a: 1 }).then(() => {
      resolved = true;
    });

    // track() awaits getClient() internally; let those microtasks drain so the
    // SDK's track(...) has fired and handed us the completion callback.
    await new Promise(r => setTimeout(r, 0));
    assert.equal(resolved, false, 'promise must stay pending until the SDK callback fires');
    assert.equal(typeof capturedCallback, 'function');
    capturedCallback();
    await pending;
    assert.equal(resolved, true);
    assert.deepEqual(calls, [['track', 'deferred_event', { a: 1 }]]);
  });

  it('track is a no-op when the SDK has no track function', async () => {
    const provider = createMixpanelProvider({
      enabled: 'true',
      token: 'token-123',
      loader: async () => ({ default: { init() {} } }),
    });

    await provider.init();
    await assert.doesNotReject(() => provider.track('event'));
  });

  it('track stays disabled (no SDK load) when provider is not enabled', async () => {
    const provider = createMixpanelProvider({
      enabled: false,
      token: 'token-123',
      loader: async () => createFakeMixpanel([]),
    });

    // getClient short-circuits before the loader when disabled.
    await assert.doesNotReject(() => provider.track('event'));
  });

  it('group calls set_group with the group key and id', async () => {
    const calls = [];
    const provider = createMixpanelProvider({
      enabled: 'true',
      token: 'token-123',
      loader: async () => ({ default: createFakeMixpanel(calls) }),
    });

    await provider.init();
    await provider.group('account_id', 'client-42');

    assert.deepEqual(
      calls.filter(c => c[0] === 'set_group'),
      [['set_group', 'account_id', 'client-42']],
    );
  });

  it('group is a no-op when the SDK lacks set_group', async () => {
    const provider = createMixpanelProvider({
      enabled: 'true',
      token: 'token-123',
      loader: async () => ({ default: { init() {} } }),
    });

    await provider.init();
    await assert.doesNotReject(() => provider.group('account_id', 'client-42'));
  });

  it('group is a no-op when the provider is disabled (no client)', async () => {
    const provider = createMixpanelProvider({
      enabled: false,
      token: 'token-123',
      loader: async () => createFakeMixpanel([]),
    });

    await assert.doesNotReject(() => provider.group('account_id', 'client-42'));
  });

  it('groupSet resolves the group and applies properties via group.set', async () => {
    const calls = [];
    const provider = createMixpanelProvider({
      enabled: 'true',
      token: 'token-123',
      loader: async () => ({ default: createFakeMixpanel(calls) }),
    });

    await provider.init();
    await provider.groupSet('account_id', 'client-42', { $name: 'Acme Corp' });

    assert.deepEqual(calls.filter(c => c[0] === 'get_group'), [['get_group', 'account_id', 'client-42']]);
    assert.deepEqual(calls.filter(c => c[0] === 'group.set'), [['group.set', { $name: 'Acme Corp' }]]);
  });

  it('groupSet is a no-op when the provider is disabled (no client)', async () => {
    const provider = createMixpanelProvider({
      enabled: false,
      token: 'token-123',
      loader: async () => createFakeMixpanel([]),
    });

    await assert.doesNotReject(() => provider.groupSet('account_id', 'client-42', { $name: 'x' }));
  });

  it('groupSet is a no-op when the SDK has no get_group', async () => {
    const provider = createMixpanelProvider({
      enabled: 'true',
      token: 'token-123',
      loader: async () => ({ default: { init() {} } }),
    });

    await provider.init();
    await assert.doesNotReject(() => provider.groupSet('account_id', 'client-42', { $name: 'x' }));
  });

  it('groupSet is a no-op when get_group returns an object without set', async () => {
    const calls = [];
    const provider = createMixpanelProvider({
      enabled: 'true',
      token: 'token-123',
      loader: async () => ({
        default: {
          init() {},
          get_group(groupKey, groupId) {
            calls.push(['get_group', groupKey, groupId]);
            return {}; // no set method
          },
        },
      }),
    });

    await provider.init();
    await assert.doesNotReject(() => provider.groupSet('account_id', 'client-42', { $name: 'x' }));
    assert.deepEqual(calls, [['get_group', 'account_id', 'client-42']]);
  });

  it('flush is a no-op when the SDK has no flush function', async () => {
    const provider = createMixpanelProvider({
      enabled: 'true',
      token: 'token-123',
      loader: async () => ({ default: { init() {} } }),
    });

    await provider.init();
    await assert.doesNotReject(() => provider.flush());
  });

  it('identify sets the user id without traits when people.set is absent', async () => {
    const calls = [];
    const provider = createMixpanelProvider({
      enabled: 'true',
      token: 'token-123',
      loader: async () => ({
        default: {
          init() {},
          identify(userId) { calls.push(['identify', userId]); },
        },
      }),
    });

    await provider.init();
    await provider.identify('user-1', { role: 'admin' });
    assert.deepEqual(calls, [['identify', 'user-1']]);
  });

  it('registers Mixpanel from browser config only when env enables it', () => {
    const disabledConfig = buildBrowserObservabilityConfig({
      env: {},
      location: { hostname: 'localhost' },
      logger: { warn() {} },
    });
    const enabledConfig = buildBrowserObservabilityConfig({
      env: {
        VITE_MIXPANEL_ENABLED: 'true',
        VITE_MIXPANEL_TOKEN: 'token-123',
      },
      location: { hostname: 'localhost' },
      logger: { warn() {} },
    });

    assert.equal(disabledConfig.providers.find(provider => provider.name === 'mixpanel').enabled, false);
    assert.equal(enabledConfig.providers.find(provider => provider.name === 'mixpanel').enabled, true);
  });
});
