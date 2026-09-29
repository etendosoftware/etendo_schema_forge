import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeValue } from '@etendosoftware/app-shell-core/observability/sanitize';

import { createObservability } from '../observability/core.js';
import { SAFE_EVENT_PROPERTY_KEYS } from '../observability/payload.js';

// ETP-4578 H2 — the host facade sends everything through the core's sanitizing gateway.
// The providers here are plain recorders; what matters is what reaches them.

const SECRET_EMAIL = 'jane.doe@example.com';
const HEX32 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

function recorder(name, extra = {}) {
  const calls = [];
  const provider = { name, ...extra };
  for (const method of ['init', 'shutdown', 'track', 'page', 'identify', 'group', 'groupSet', 'captureException', 'setContext', 'flush', 'reset']) {
    provider[method] ??= (...args) => { calls.push([method, ...args]); };
  }
  return { provider, calls, methods: () => calls.map(([m]) => m) };
}

const quiet = { warn() {} };

describe('the gateway contract: init() comes first', () => {
  it('nothing reaches a provider before initObservability()', async () => {
    const { provider, calls } = recorder('p');
    const obs = createObservability({ logger: quiet });

    await obs.track('early');
    await obs.page('/early');
    await obs.identify('u1');
    await obs.group('account_id', HEX32);
    await obs.captureException(new Error('early'));
    await obs.flush();
    await obs.reset();
    await obs.disable();

    assert.deepEqual(calls, []);
    await obs.initObservability({ providers: [provider] });
    assert.deepEqual(calls.map(([m]) => m), ['init']);
  });

  it('init is the first call every provider receives, even when track fires in the same tick', async () => {
    const { provider, methods } = recorder('p');
    const obs = createObservability({ logger: quiet });

    const initializing = obs.initObservability({ providers: [provider] });
    const tracking = obs.track('event');
    await Promise.all([initializing, tracking]);

    assert.deepEqual(methods(), ['init', 'track']);
  });

  it('a disable() issued before initObservability() is ignored rather than throwing, and nothing starts', async () => {
    const { provider, calls } = recorder('p');
    const obs = createObservability({ logger: quiet });

    await assert.doesNotReject(() => obs.disable('p'));
    assert.deepEqual(calls, []);
  });
});

describe('everything crosses the sanitizing boundary', () => {
  it('identify() traits outside the allowlist never reach a provider', async () => {
    const { provider, calls } = recorder('p');
    const obs = createObservability({ logger: quiet });
    await obs.initObservability({ providers: [provider] });

    await obs.identify('user-1', { plan: 'pro', email: SECRET_EMAIL, role: 'admin' });

    const [, , traits] = calls.find(([m]) => m === 'identify');
    assert.equal(JSON.stringify(traits).includes(SECRET_EMAIL), false);
    assert.equal(traits.email, undefined);
  });

  it('an identify() whose id is an email is dropped instead of sent', async () => {
    const { provider, methods } = recorder('p');
    const obs = createObservability({ logger: quiet });
    await obs.initObservability({ providers: [provider] });

    await obs.identify(SECRET_EMAIL, {});

    assert.deepEqual(methods(), ['init']);
  });

  it('groupSet() organization name is not sent unless the host approves it (D6)', async () => {
    const { provider, calls } = recorder('p');
    const obs = createObservability({ logger: quiet });
    await obs.initObservability({ providers: [provider] });

    await obs.groupSet('account_id', HEX32, { $name: 'Acme Corp' });

    const [, , , properties] = calls.find(([m]) => m === 'groupSet');
    assert.deepEqual(properties, {});
  });

  it('an approved group trait is sent when the host adds it to the allowlist', async () => {
    const { provider, calls } = recorder('p');
    const obs = createObservability({ logger: quiet, allowedKeys: [...SAFE_EVENT_PROPERTY_KEYS, '$name'] });
    await obs.initObservability({ providers: [provider] });

    await obs.groupSet('account_id', HEX32, { $name: 'Acme Corp' });

    assert.deepEqual(calls.find(([m]) => m === 'groupSet')[3], { $name: 'Acme Corp' });
  });

  it('captureException() sends a sanitized summary, never the Error, and scrubs URL queries', async () => {
    const { provider, calls } = recorder('p');
    const obs = createObservability({ logger: quiet });
    await obs.initObservability({ providers: [provider] });
    const error = new Error(`GET https://go.etendo.cloud/reset/${HEX32}?code=sh0rtC0de42 failed for ${SECRET_EMAIL}`);

    await obs.captureException(error, { handled: true, email: SECRET_EMAIL });

    const [, summary, details] = calls.find(([m]) => m === 'captureException');
    assert.notEqual(summary, error);
    const serialized = JSON.stringify([summary, details]);
    for (const leak of [SECRET_EMAIL, 'sh0rtC0de42', HEX32]) assert.equal(serialized.includes(leak), false, leak);
  });

  it('page() keeps the host route convention (:recordId) through the gateway', async () => {
    const { provider, calls } = recorder('p');
    const obs = createObservability({ logger: quiet });
    await obs.initObservability({ providers: [provider] });

    await obs.page('/sales-order/123?tab=lines');

    const [, route, payload] = calls.find(([m]) => m === 'page');
    assert.equal(route, '/sales-order/:recordId');
    assert.equal(payload.routePattern, '/sales-order/:recordId');
  });

  it('track() keeps the composed payload: metadata, context, properties and timestamp', async () => {
    const { provider, calls } = recorder('p');
    const obs = createObservability({ logger: quiet });
    await obs.initObservability({
      context: { app: 'app-shell', environment: 'staging' },
      metadata: { hostname: 'go.etendo.cloud' },
      providers: [provider],
    });

    await obs.track('document_created', { document_type: 'sales-order', account_id: HEX32 });

    const [, name, payload, meta] = calls.find(([m]) => m === 'track');
    assert.equal(name, 'document_created');
    assert.equal(payload.app, 'app-shell');
    assert.equal(payload.hostname, 'go.etendo.cloud');
    assert.equal(payload.document_type, 'sales-order');
    assert.equal(payload.account_id, HEX32);
    assert.equal(typeof payload.timestamp, 'string');
    assert.deepEqual(meta, { context: { app: 'app-shell', environment: 'staging' } });
  });
});

describe('the allowlist and the gateway agree', () => {
  it('none of the host-approved event keys is redacted by the gateway sensitive-key rule', () => {
    const input = Object.fromEntries([...SAFE_EVENT_PROPERTY_KEYS].map((key) => [key, 'v']));
    const out = sanitizeValue(input, { allowedKeys: [...SAFE_EVENT_PROPERTY_KEYS] });
    const redacted = Object.keys(out).filter((key) => out[key] === '[REDACTED]');
    assert.deepEqual(redacted, [], `approved keys that the gateway redacts: ${redacted.join(', ')}`);
  });
});

describe('the kill switch through the facade', () => {
  it('disable() with no name stops every provider, and later calls reach none', async () => {
    const a = recorder('a');
    const b = recorder('b');
    const obs = createObservability({ logger: quiet });
    await obs.initObservability({ providers: [a.provider, b.provider] });

    await obs.disable();
    await obs.track('after');
    await obs.page('/after');
    await obs.captureException(new Error('after'));

    assert.deepEqual(a.methods(), ['init', 'shutdown']);
    assert.deepEqual(b.methods(), ['init', 'shutdown']);
  });

  it('disable(name) stops only that provider; the others keep receiving', async () => {
    const a = recorder('a');
    const b = recorder('b');
    const obs = createObservability({ logger: quiet });
    await obs.initObservability({ providers: [a.provider, b.provider] });

    await obs.disable('a');
    await obs.track('after');

    assert.deepEqual(a.methods(), ['init', 'shutdown']);
    assert.deepEqual(b.methods(), ['init', 'track']);
  });

  it('initObservability({ disabled }) never starts a provider that is killed from the outset', async () => {
    const a = recorder('a');
    const b = recorder('b');
    const obs = createObservability({ logger: quiet });

    await obs.initObservability({ providers: [a.provider, b.provider], disabled: ['a'] });
    await obs.track('event');

    assert.deepEqual(a.calls, []);
    assert.deepEqual(b.methods(), ['init', 'track']);
  });

  it('a global disabled flag means zero calls to any provider', async () => {
    const a = recorder('a');
    const obs = createObservability({ logger: quiet });

    await obs.initObservability({ providers: [a.provider], disabled: true });
    await obs.track('event');
    await obs.identify('u1');

    assert.deepEqual(a.calls, []);
  });

  it('enable() brings a killed provider back, initialized again', async () => {
    const a = recorder('a');
    const obs = createObservability({ logger: quiet });
    await obs.initObservability({ providers: [a.provider] });

    await obs.disable('a');
    await obs.enable('a');
    await obs.track('back');

    assert.deepEqual(a.methods(), ['init', 'shutdown', 'init', 'track']);
  });
});
