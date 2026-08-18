import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createObservability } from '../observability/core.js';
import { createMixpanelProvider } from '../observability/providers/mixpanel.js';

// Regression guard for the round-1 bug: an external, browser.js-level orchestration
// of the Mixpanel stale-identity reset (run once, right after initObservability()
// resolved) was rejected by REVIEW because it assumed nothing else could reach the
// Mixpanel provider before that step ran. In production, `main.jsx` calls
// `initBrowserObservability()` WITHOUT awaiting it, and `ObservabilityRouteTracker`
// fires an independent `page()` call on mount through the SAME `core.js` shared
// `initialized` gate — which is set synchronously, long before any provider (let
// alone the reset step) finishes. So a route-change page() could slip in before the
// reset ran and send a `page_view` tagged with the leaked real-identity distinct_id.
//
// Round 2 closes this by moving the reset inside `providers/mixpanel.js`'s own
// `getClient()` — the single choke point every provider method funnels through — so
// there is no external ordering to get wrong. These tests exercise the REAL
// `createObservability()` orchestrator (core.js) plus the REAL Mixpanel provider
// (with a fake SDK loader), together with a second, deliberately slow fake provider
// standing in for Sentry/RUM (which take longer to `init()` than Mixpanel), and fire
// `page()`/`track()` calls unawaited, immediately alongside `initObservability()` —
// exactly the shape of the real `main.jsx` + `ObservabilityRouteTracker` race.

function createFakeStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };
}

// Models a browser that was `identify()`'d with a real email before the GDPR
// remediation shipped: any `track()` call before `reset()` runs would still carry
// that leaked identity. `reset()` (mirroring mixpanel-browser's real behavior)
// replaces it with a fresh anonymous id. Recording the `distinctId` in effect at
// the moment of each call lets the test assert the exact identity a `page_view`/
// `track` call would have been attributed to had the reset not already completed.
function createFakeMixpanelSdk(calls) {
  let distinctId = 'leaked-user@example.com';
  return {
    init(token) {
      calls.push({ type: 'init', token, distinctId });
    },
    reset() {
      distinctId = 'anon-fresh-id';
      calls.push({ type: 'reset', distinctId });
    },
    track(eventName, properties, _options, callback) {
      calls.push({ type: 'track', eventName, properties, distinctId });
      callback?.();
    },
  };
}

// Stand-in for Sentry/RUM: init() deliberately outlasts Mixpanel's own load+init+
// reset chain, so `initObservability()`'s `Promise.all([...])` is still pending
// while other call sites race ahead independently — the exact condition that broke
// round 1.
function createSlowProvider(delayMs = 15) {
  return {
    name: 'slow-provider',
    enabled: true,
    async init() {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    },
  };
}

describe('Mixpanel reset survives the RouteTracker race (core.js + real provider, round-1 regression guard)', () => {
  it('a page() fired unawaited alongside initObservability() still goes through the reset gate exactly once, with a fresh identity', async () => {
    const calls = [];
    const obs = createObservability({ logger: { warn() {} } });
    const mixpanel = createMixpanelProvider({
      enabled: 'true',
      token: 'token-123',
      storage: createFakeStorage(),
      loader: async () => ({ default: createFakeMixpanelSdk(calls) }),
    });

    // Mirrors main.jsx: `initBrowserObservability()` is called but NOT awaited by
    // the rest of app bootstrap.
    const initPromise = obs.initObservability({
      providers: [mixpanel, createSlowProvider()],
    });

    // Mirrors ObservabilityRouteTracker's mount effect: fires immediately in the
    // same tick, independent of whether initObservability() has settled.
    const pagePromise = obs.page('/dashboard');

    await Promise.all([initPromise, pagePromise]);

    assert.deepEqual(
      calls.map(c => c.type),
      ['init', 'reset', 'track'],
      'client.init() and reset() must both complete before the page_view track() call'
    );

    const [, , trackCall] = calls;
    assert.equal(trackCall.eventName, 'page_view');
    assert.equal(
      trackCall.distinctId,
      'anon-fresh-id',
      'the page_view must be attributed to the fresh identity, never the stale leaked one'
    );
  });

  it('reset still fires exactly once when several RouteTracker-style page()/track() calls race in before init settles', async () => {
    const calls = [];
    const obs = createObservability({ logger: { warn() {} } });
    const mixpanel = createMixpanelProvider({
      enabled: 'true',
      token: 'token-123',
      storage: createFakeStorage(),
      loader: async () => ({ default: createFakeMixpanelSdk(calls) }),
    });

    // A slower "Sentry/RUM" provider widens the race window even further.
    const initPromise = obs.initObservability({
      providers: [mixpanel, createSlowProvider(30)],
    });

    // Simulates a redirect chain on app boot: two route changes plus an
    // independent track() call, all firing before initObservability() resolves.
    const p1 = obs.page('/dashboard');
    const p2 = obs.page('/sales-order/123');
    const p3 = obs.track('app_started');

    await Promise.all([initPromise, p1, p2, p3]);

    const resetCalls = calls.filter(c => c.type === 'reset');
    assert.equal(resetCalls.length, 1, 'the automatic one-time reset must only ever run once');

    const trackCalls = calls.filter(c => c.type === 'track');
    assert.equal(trackCalls.length, 3, 'all three concurrent calls must still reach the SDK');
    assert.ok(
      trackCalls.every(c => c.distinctId === 'anon-fresh-id'),
      'every one of the racing calls must observe the post-reset identity, never the stale one'
    );

    const resetIndex = calls.findIndex(c => c.type === 'reset');
    const trackIndexes = calls
      .map((c, index) => (c.type === 'track' ? index : -1))
      .filter(index => index >= 0);
    assert.ok(
      trackIndexes.every(index => index > resetIndex),
      'every track() must be ordered after reset(), regardless of call interleaving'
    );
  });
});
