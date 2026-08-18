import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { initBrowserObservability } from '../observability/browser.js';

describe('browser observability startup', () => {
  it('emits app_started once after initializing providers', async () => {
    const calls = [];
    const client = {
      async initObservability(config) {
        calls.push(['initObservability', config.context.app]);
      },
      async track(eventName) {
        calls.push(['track', eventName]);
      },
    };

    await initBrowserObservability(
      {
        env: {},
        location: { hostname: 'localhost' },
        logger: { warn() {} },
      },
      client
    );

    assert.deepEqual(calls, [
      ['initObservability', 'app-shell'],
      ['track', 'app_started'],
    ]);
  });
});

// The Mixpanel one-time stale-identity reset used to be orchestrated here (an
// external `resetStaleMixpanelIdentity()` step between `initObservability()` and
// the first `track()` call). That ordering assumption turned out to be unsafe:
// other call sites (e.g. ObservabilityRouteTracker's route-change `page()` call)
// go through core.js's shared `initialized` gate, not through this function's
// sequencing, and could reach the Mixpanel provider before this file's reset step
// ran. The reset now lives entirely inside `createMixpanelProvider`'s internal
// `getClient()` gate (providers/mixpanel.js), which every provider method funnels
// through before it ever touches the SDK — see observability-mixpanel.test.js for
// the coverage of that gate (ordering, exactly-once, concurrent-caller, and
// failure/retry behavior).
