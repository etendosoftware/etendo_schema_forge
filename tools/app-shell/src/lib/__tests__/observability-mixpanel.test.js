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
