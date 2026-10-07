import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { REDACTED, sanitizeValue } from '@etendosoftware/app-shell-core/observability/sanitize';
import { createObservability } from '../observability/core.js';
import { OBSERVABILITY_EVENT_LIST, buildObservabilityEvent } from '../observability/events.js';
import { SAFE_EVENT_PROPERTY_KEYS, sanitizeEventProperties } from '../observability/payload.js';
import { createDatadogProvider } from '../observability/providers/datadog.js';
import { createRumProvider } from '../rum.js';
import { createMixpanelProvider } from '../observability/providers/mixpanel.js';

// ETP-4578 H8 — a guard against the "N5" failure: an approved property that the gateway's
// sensitive-key-NAME rule quietly turns into [REDACTED] (or a declared event property the
// facade quietly drops). The dashboards would just go empty, and nothing would fail.

const silent = { warn() {} };
const APPROVED = [...SAFE_EVENT_PROPERTY_KEYS];

/** A value the host's own payload policy accepts for `key` (numeric ranges, booleans, strings). */
function sampleFor(key) {
  for (const candidate of [1, 50, true, 'sample']) {
    if (key in sanitizeEventProperties({ [key]: candidate })) return candidate;
  }
  throw new Error(`no value survives the host payload policy for "${key}"`);
}

function samplesFor(keys) {
  return Object.fromEntries(keys.map((key) => [key, sampleFor(key)]));
}

/** The three real host providers in ONE gateway, wired to SDKs that record what they receive. */
function threeProviders() {
  const seen = { mixpanelTrack: [], datadogActions: [], datadogErrorContext: [], rumRecorded: [] };
  const datadog = createDatadogProvider({
    env: {
      VITE_DATADOG_ENABLED: 'true', VITE_DATADOG_APPLICATION_ID: 'a', VITE_DATADOG_CLIENT_TOKEN: 't',
      VITE_DATADOG_SITE: 'datadoghq.eu', VITE_APP_ENV: 'test',
    },
    logger: silent,
    loader: async () => ({
      datadogRum: {
        init() {}, startView() {}, setGlobalContext() {}, setTrackingConsent() {},
        addAction(name, properties) { seen.datadogActions.push({ name, properties }); },
        addError(_error, context) { seen.datadogErrorContext.push(context ?? {}); },
      },
    }),
  });
  class RecordingRum {
    recordError(error) { seen.rumRecorded.push(error.message); }
    disable() {}
    enable() {}
  }
  const rum = createRumProvider({
    env: { VITE_RUM_ENABLED: 'true', VITE_RUM_APP_MONITOR_ID: 'm', VITE_RUM_IDENTITY_POOL_ID: 'p' },
    AwsRumCtor: RecordingRum,
    logger: silent,
  });
  const mixpanel = createMixpanelProvider({
    enabled: 'true',
    token: 'fake-project-token',
    storage: { getItem: () => '1', setItem() {} },
    logger: silent,
    loader: async () => ({
      default: {
        init() {},
        track(name, properties) { seen.mixpanelTrack.push({ name, properties }); },
        register() {}, register_once() {}, reset() {}, identify() {}, set_group() {}, add_group() {},
        get_group: () => ({ set() {} }), people: { set() {} },
      },
    }),
  });
  return { seen, providers: [datadog, rum, mixpanel] };
}

async function facadeOver(providers) {
  const observability = createObservability({ logger: silent });
  await observability.initObservability({ providers, context: { app: 'app-shell' }, logger: silent });
  return observability;
}

describe('approved properties survive the gateway (ETP-4578 H8, N5)', () => {
  it('no approved key is redacted or dropped by the gateway\'s key-name rule', () => {
    // One key at a time: a single object with every key would also meet the 50-key limit.
    const lost = APPROVED.filter((key) => {
      const out = sanitizeValue({ [key]: sampleFor(key) }, { allowedKeys: APPROVED });
      return !(key in out) || out[key] === REDACTED;
    });
    assert.deepEqual(lost, [], `approved keys the gateway redacts or drops: ${lost.join(', ')}`);
  });

  it('keeps `$name` out of the approved set until the open decision (D6) is made', () => {
    assert.equal(SAFE_EVENT_PROPERTY_KEYS.has('$name'), false);
  });
});

describe('every event in events.js reaches the providers whole (ETP-4578 H8)', () => {
  it('declares only properties the host allowlist approves', () => {
    const unapproved = OBSERVABILITY_EVENT_LIST.flatMap((event) => (
      event.properties.filter((key) => !SAFE_EVENT_PROPERTY_KEYS.has(key)).map((key) => `${event.name}.${key}`)
    ));
    assert.deepEqual(unapproved, [], `declared but silently dropped by the payload policy: ${unapproved.join(', ')}`);
  });

  it('covers a meaningful number of events, so the loop cannot pass by being empty', () => {
    assert.ok(OBSERVABILITY_EVENT_LIST.length >= 20, `found ${OBSERVABILITY_EVENT_LIST.length} events`);
    assert.ok(OBSERVABILITY_EVENT_LIST.some((event) => event.properties.length > 0));
  });

  for (const event of OBSERVABILITY_EVENT_LIST) {
    it(`${event.name}: every declared property reaches Mixpanel and Datadog intact, with the three providers running`, async () => {
      const { seen, providers } = threeProviders();
      const observability = await facadeOver(providers);
      const samples = samplesFor(event.properties);

      const built = buildObservabilityEvent(event, samples);
      await observability.track(built.name, built.properties);

      const [sent] = seen.mixpanelTrack.filter(({ name }) => name === event.name);
      assert.ok(sent, `${event.name} never reached Mixpanel`);
      for (const [key, value] of Object.entries(samples)) {
        assert.equal(sent.properties[key], value, `${event.name}.${key} did not arrive as sent (got ${JSON.stringify(sent.properties[key])})`);
      }
      assert.equal(Object.values(sent.properties).includes(REDACTED), false, `${event.name} carries a [REDACTED] value`);

      const [action] = seen.datadogActions.filter(({ name }) => name === event.name);
      assert.ok(action, `${event.name} never reached Datadog`);
      for (const [key, value] of Object.entries(samples)) {
        assert.equal(action.properties[key], value, `${event.name}.${key} did not reach Datadog as sent`);
      }
    });
  }

  it('sends the same approved properties to Datadog as error context, and nothing redacted, in the same gateway', async () => {
    const { seen, providers } = threeProviders();
    const observability = await facadeOver(providers);
    const keys = APPROVED.filter((key) => key !== 'tags');
    // In batches: one payload with all 54 keys would meet the sanitizer's 50-key limit, which no
    // real event comes near.
    const batches = [keys.slice(0, 40), keys.slice(40)];

    for (const batch of batches) await observability.captureException(new Error('boom'), samplesFor(batch));

    assert.equal(seen.datadogErrorContext.length, batches.length);
    batches.forEach((batch, index) => {
      const samples = samplesFor(batch);
      const lost = batch.filter((key) => seen.datadogErrorContext[index][key] !== samples[key]);
      assert.deepEqual(lost, [], `approved properties that did not reach Datadog as sent: ${lost.join(', ')}`);
    });
    assert.equal(seen.rumRecorded.length, batches.length, 'RUM records the error from the same call');
  });
});
