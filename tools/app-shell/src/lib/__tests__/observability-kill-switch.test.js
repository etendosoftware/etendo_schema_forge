import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { OpenFeature, TypedInMemoryProvider } from '@openfeature/web-sdk';
import { createTelemetryGateway } from '@etendosoftware/app-shell-core/observability/gateway';
import { createSentryProvider } from '../sentry.js';
import { createRumProvider } from '../rum.js';
import { createMixpanelProvider } from '../observability/providers/mixpanel.js';
import {
  TELEMETRY_KILL_ALL,
  TELEMETRY_KILL_PROVIDER_FLAGS,
  FLAG_DEFAULTS,
  NO_EXPOSURE_FLAGS,
} from '../flags/flag-keys.js';
import { createFlagExposureHook, resetExposureCache } from '../flags/flag-exposure.js';
import {
  bindTelemetryKillSwitch,
  killStateToDisabled,
  parseKillEnv,
  readKillState,
} from '../observability/killSwitch.js';
import { buildBrowserObservabilityConfig, initBrowserObservability } from '../observability/browser.js';

// ETP-4578 H5 — the telemetry kill switch: build default + OpenFeature flags, per provider and
// global. Uses the real OpenFeature SDK, the real gateway and the real host providers; only the
// vendor SDKs are counting fakes, because what is asserted is that they are never TOUCHED.

const silent = { warn() {} };
const flagConfig = (values) => Object.fromEntries(
  Object.entries({ ...FLAG_DEFAULTS, ...values }).map(([key, value]) => [
    key,
    { variants: { on: true, off: false }, defaultVariant: value ? 'on' : 'off', disabled: false },
  ]),
);

async function useFlags(values = {}) {
  const provider = new TypedInMemoryProvider(flagConfig(values));
  await OpenFeature.setProviderAndWait(provider);
  return provider;
}

/** The three real host providers, wired to SDKs that only count. */
function countingProviders() {
  const calls = { sentryInit: 0, rumCtor: 0, mixpanelLoad: 0, mixpanelInit: 0, mixpanelTrack: 0, rumRecord: 0, sentryCapture: 0 };
  const sentry = createSentryProvider({
    dsn: 'https://pub@o1.ingest.sentry.io/1',
    sentry: {
      init() { calls.sentryInit += 1; },
      browserTracingIntegration: () => 'tracing',
      captureException() { calls.sentryCapture += 1; },
      close: async () => true,
      getClient: () => ({ getOptions: () => ({}) }),
    },
    env: {},
    logger: silent,
  });
  class FakeRum {
    constructor() { calls.rumCtor += 1; }
    recordError() { calls.rumRecord += 1; }
    disable() {}
    enable() {}
  }
  const rum = createRumProvider({
    env: { VITE_RUM_ENABLED: 'true', VITE_RUM_APP_MONITOR_ID: 'm', VITE_RUM_IDENTITY_POOL_ID: 'p' },
    AwsRumCtor: FakeRum,
    logger: silent,
  });
  const mixpanel = createMixpanelProvider({
    enabled: 'true',
    token: 'fake-project-token',
    storage: { getItem: () => '1', setItem() {} },
    logger: silent,
    loader: async () => {
      calls.mixpanelLoad += 1;
      return {
        default: {
          init() { calls.mixpanelInit += 1; },
          track() { calls.mixpanelTrack += 1; return true; },
          register() {}, register_once() {}, identify() {}, reset() {}, set_group() {}, add_group() {},
          get_group: () => ({ set() {} }), people: { set() {} }, opt_in_tracking() {}, opt_out_tracking() {},
          has_opted_out_tracking: () => false, get_distinct_id: () => 'id',
        },
      };
    },
  });
  return { calls, providers: [sentry, rum, mixpanel] };
}

const total = (calls) => Object.values(calls).reduce((sum, n) => sum + n, 0);

async function reset() {
  await OpenFeature.clearProviders();
  OpenFeature.clearHooks();
  await OpenFeature.setContext({});
  resetExposureCache();
}

describe('telemetry kill switch (ETP-4578 H5)', () => {
  beforeEach(reset);
  afterEach(reset);

  describe('state', () => {
    it('parses the build default: true, a list, or nothing; unknown names are reported and ignored', () => {
      assert.deepEqual(parseKillEnv('true'), { all: true, names: new Set() });
      assert.deepEqual(parseKillEnv(' Mixpanel , aws-rum '), { all: false, names: new Set(['mixpanel', 'aws-rum']) });
      assert.deepEqual(parseKillEnv(undefined), { all: false, names: new Set() });
      assert.deepEqual(parseKillEnv('false'), { all: false, names: new Set() });
      const warnings = [];
      assert.deepEqual(parseKillEnv('sentri,mixpanel', { warn: (m) => warnings.push(m) }).names, new Set(['mixpanel']));
      assert.equal(warnings.length, 1);
    });

    it('defaults every switch to off, so a missing control plane keeps today\'s behaviour', async () => {
      for (const key of [TELEMETRY_KILL_ALL, ...Object.values(TELEMETRY_KILL_PROVIDER_FLAGS)]) {
        assert.equal(FLAG_DEFAULTS[key], false, key);
      }
      // No provider registered at all: OpenFeature's no-op answers the default.
      assert.equal(killStateToDisabled(readKillState({ env: {}, logger: silent })), false);
    });

    it('is the union of the build default and the flags', async () => {
      await useFlags({ [TELEMETRY_KILL_PROVIDER_FLAGS.mixpanel]: true });
      const state = readKillState({ env: { VITE_TELEMETRY_KILL: 'aws-rum' }, logger: silent });
      assert.deepEqual(state.names, new Set(['aws-rum', 'mixpanel']));
      assert.equal(state.all, false);
      assert.deepEqual(killStateToDisabled(state).sort(), ['aws-rum', 'mixpanel']);

      await useFlags({ [TELEMETRY_KILL_ALL]: true });
      assert.equal(killStateToDisabled(readKillState({ env: {}, logger: silent })), true);
    });
  });

  describe('before start: the SDK is never touched', () => {
    for (const [label, { env, flags }] of Object.entries({
      'global flag': { env: {}, flags: { [TELEMETRY_KILL_ALL]: true } },
      'global build default': { env: { VITE_TELEMETRY_KILL: 'true' }, flags: {} },
      'every provider by flag': { env: {}, flags: Object.fromEntries(Object.values(TELEMETRY_KILL_PROVIDER_FLAGS).map((k) => [k, true])) },
    })) {
      it(`makes zero SDK calls with the ${label}, across every operation`, async () => {
        await useFlags(flags);
        const { calls, providers } = countingProviders();
        const gateway = createTelemetryGateway({
          adapters: providers,
          disabled: killStateToDisabled(readKillState({ env, logger: silent })),
          allowedKeys: ['action'],
          logger: silent,
        });

        await gateway.init({ app: 'app-shell' });
        await gateway.track('clicked', { action: 'save' });
        await gateway.page('/sales-order/1');
        await gateway.identify('user-1', {});
        await gateway.groupSet('account_id', 'a1', {});
        await gateway.captureException(new Error('boom'), {});
        await gateway.flush();

        assert.equal(total(calls), 0, JSON.stringify(calls));
      });
    }

    it('kills only the named provider and leaves the others running', async () => {
      await useFlags({ [TELEMETRY_KILL_PROVIDER_FLAGS.mixpanel]: true });
      const { calls, providers } = countingProviders();
      const gateway = createTelemetryGateway({
        adapters: providers,
        disabled: killStateToDisabled(readKillState({ env: {}, logger: silent })),
        allowedKeys: ['action'],
        logger: silent,
      });
      await gateway.init({});
      await gateway.captureException(new Error('boom'), {});

      assert.equal(calls.mixpanelLoad + calls.mixpanelInit + calls.mixpanelTrack, 0);
      assert.equal(calls.sentryInit, 1);
      assert.equal(calls.rumCtor, 1);
    });

    it('builds the browser config with the kill state, so the host bootstrap never starts a killed provider', async () => {
      await useFlags({ [TELEMETRY_KILL_PROVIDER_FLAGS['aws-rum']]: true });
      const config = buildBrowserObservabilityConfig({ env: { VITE_TELEMETRY_KILL: 'mixpanel' }, logger: silent, storage: { getItem: () => '1' } });
      assert.deepEqual([...config.disabled].sort(), ['aws-rum', 'mixpanel']);
    });
  });

  describe('hot kill: a flag flipped while the app runs', () => {
    it('stops a running provider, and starts it again when the flag is lifted', async () => {
      const provider = await useFlags();
      const { calls, providers } = countingProviders();
      const gateway = createTelemetryGateway({ adapters: providers, allowedKeys: ['action'], logger: silent });
      await gateway.init({});
      assert.equal(gateway.isEnabled('mixpanel'), true);

      const { apply, unbind } = bindTelemetryKillSwitch(gateway, { env: {}, initial: { all: false, names: [] }, logger: silent });
      try {
        await provider.putConfiguration(flagConfig({ [TELEMETRY_KILL_PROVIDER_FLAGS.mixpanel]: true }));
        await apply();
        assert.equal(gateway.isEnabled('mixpanel'), false);
        assert.equal(gateway.isEnabled('sentry'), true);

        const before = calls.mixpanelTrack;
        await gateway.track('after the kill', { action: 'x' });
        assert.equal(calls.mixpanelTrack, before, 'nothing may reach Mixpanel after the kill');

        await provider.putConfiguration(flagConfig({}));
        await apply();
        assert.equal(gateway.isEnabled('mixpanel'), true);
      } finally {
        unbind();
      }
    });

    it('reacts by itself to the provider\'s configuration-changed event', async () => {
      const provider = await useFlags();
      const { providers } = countingProviders();
      const gateway = createTelemetryGateway({ adapters: providers, allowedKeys: [], logger: silent });
      await gateway.init({});
      const { apply, unbind } = bindTelemetryKillSwitch(gateway, { env: {}, initial: { all: false, names: [] }, logger: silent });
      try {
        await provider.putConfiguration(flagConfig({ [TELEMETRY_KILL_ALL]: true }));
        await new Promise((resolve) => { setTimeout(resolve, 50); });
        await apply();
        assert.deepEqual(['sentry', 'aws-rum', 'mixpanel'].map((n) => gateway.isEnabled(n)), [false, false, false]);
      } finally {
        unbind();
      }
    });

    it('never lifts a kill the BUILD asked for, whatever the flags say', async () => {
      const provider = await useFlags({ [TELEMETRY_KILL_PROVIDER_FLAGS.mixpanel]: true });
      const { providers } = countingProviders();
      const env = { VITE_TELEMETRY_KILL: 'mixpanel' };
      const gateway = createTelemetryGateway({ adapters: providers, disabled: ['mixpanel'], allowedKeys: [], logger: silent });
      await gateway.init({});
      const { apply, unbind } = bindTelemetryKillSwitch(gateway, { env, initial: readKillState({ env, logger: silent }), logger: silent });
      try {
        await provider.putConfiguration(flagConfig({}));
        await apply();
        assert.equal(gateway.isEnabled('mixpanel'), false);
      } finally {
        unbind();
      }
    });

    it('keeps the current state when the flag read breaks, instead of reviving a killed provider', async () => {
      await useFlags();
      const { providers } = countingProviders();
      const gateway = createTelemetryGateway({ adapters: providers, disabled: true, allowedKeys: [], logger: silent });
      await gateway.init({});
      const broken = { getBooleanValue() { throw new Error('flag client down'); }, addHandler() {}, removeHandler() {} };
      const { apply } = bindTelemetryKillSwitch(gateway, { env: {}, initial: { all: true, names: [] }, logger: silent, client: broken });
      await apply();
      assert.equal(['sentry', 'aws-rum', 'mixpanel'].some((n) => gateway.isEnabled(n)), false);
    });
  });

  describe('bootstrap', () => {
    it('waits for the flags before starting telemetry, then binds the hot switch', async () => {
      const order = [];
      let release;
      const flagsReady = new Promise((resolve) => { release = resolve; });
      const client = {
        initObservability: async (config) => { order.push(['init', config.disabled]); },
        track: async () => {},
        disable: async () => {},
        enable: async () => {},
      };
      const started = initBrowserObservability(
        { env: {}, logger: silent, storage: { getItem: () => '1' }, flagsReady },
        client,
      );
      await new Promise((resolve) => { setTimeout(resolve, 20); });
      assert.deepEqual(order, [], 'telemetry must not start before the flags answered');

      await useFlags({ [TELEMETRY_KILL_ALL]: true });
      release();
      await started;
      assert.deepEqual(order, [['init', true]]);
    });

    it('does not wait forever on a control plane that never answers', async () => {
      const started = initBrowserObservability(
        { env: {}, logger: silent, storage: { getItem: () => '1' }, flagsReady: new Promise(() => {}), flagsWaitMs: 30 },
        { initObservability: async () => {}, track: async () => {} },
      );
      await started;
    });
  });

  describe('flag exposure', () => {
    it('never reports the kill switches through the telemetry they control', () => {
      const tracked = [];
      const hook = createFlagExposureHook({ trackImpl: (...args) => tracked.push(args) });
      for (const key of NO_EXPOSURE_FLAGS) {
        hook.after({ flagKey: key, providerMetadata: { name: 'p' }, context: {} }, { value: true, variant: 'on' });
      }
      hook.after({ flagKey: 'proof-of-concept-menu', providerMetadata: { name: 'p' }, context: {} }, { value: true, variant: 'on' });
      assert.equal(tracked.length, 1);
    });
  });
});
