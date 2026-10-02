import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// ETP-4578 H3 — what Sentry actually puts on the wire.
//
// The core's adapter is unit-tested with a fake SDK. This drives the REAL @sentry/react
// (through the host's single SDK entry point) with a transport that captures the serialized
// envelopes, so it fails if a Sentry upgrade starts sending a field the adapter does not
// rebuild, or if a hook stops running. Everything below is synthetic.

const HEX32 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const EMAIL = 'jane.doe@example.com';
const SHORT_CODE = 'sh0rtC0de42';
// Deliberately not shaped like a vendor key (see the ETP-4577 push-protection incident).
const TOKEN = 'FAKE_TEST_TOKEN_ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv12';
const JWT = ['eyJhbGciOiJub25lIn0', 'eyJzdWIiOiJmYWtlLXVzZXIifQ', 'FAKE-signature-not-real'].join('.');
const PAGE_TITLE = 'Pedido de venta 1234 - Cliente Acme';
const CUSTOMER_NAME = 'Juan Perez SL';
const SECRETS = [EMAIL, SHORT_CODE, TOKEN, JWT, HEX32, 'Acme', CUSTOMER_NAME];

let Sentry;
let createSentryProvider;
let createTelemetryGateway;
let createTransport;
const envelopes = [];

/** The Sentry envelope wire format: newline-delimited JSON, header / item header / payload. */
function parseEnvelopes(bodies) {
  return bodies.flatMap((body) => {
    const lines = body.split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const items = [];
    for (let i = 1; i + 1 < lines.length; i += 2) items.push({ header: lines[i], payload: lines[i + 1] });
    return items;
  });
}
const itemsOfType = (type) => parseEnvelopes(envelopes).filter((item) => item.header.type === type).map((item) => item.payload);
const flush = () => Sentry.flush(2000);

before(async () => {
  const dom = new JSDOM(`<!doctype html><title>${PAGE_TITLE}</title>`, {
    url: `https://go.etendo.cloud/go/sales-order/${HEX32}?tab=lines&code=${SHORT_CODE}#access_token=${TOKEN}`,
    referrer: `https://mail.example.com/inbox?u=${EMAIL}`,
  });
  for (const key of ['window', 'document', 'location', 'history', 'XMLHttpRequest', 'HTMLElement', 'Element', 'Node', 'Event', 'DOMException', 'PerformanceObserver']) {
    try { globalThis[key] = dom.window[key]; } catch { /* read-only in node */ }
  }
  globalThis.addEventListener = dom.window.addEventListener.bind(dom.window);
  globalThis.removeEventListener = dom.window.removeEventListener.bind(dom.window);
  try { Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true }); } catch { /* keep node's */ }

  ({ Sentry } = await import('../observability/sdk.js'));
  ({ createTransport } = await import('@sentry/core'));
  ({ createSentryProvider } = await import('../sentry.js'));
  ({ createTelemetryGateway } = await import('@etendosoftware/app-shell-core/observability/gateway'));
});

/** A provider whose SDK is the real one, except that its transport records what it would send. */
function realSentry() {
  envelopes.length = 0;
  const transport = (options) => createTransport(options, async (request) => {
    envelopes.push(typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body));
    return { statusCode: 200 };
  });
  const sdk = {
    ...Sentry,
    init: (options) => Sentry.init({ ...options, transport }),
    // Each pageload/navigation idle span arms a 30 s deadline timer that nothing cancels, so the
    // file would idle 30 s before exiting. The span still ends on its own idle timeout; only the
    // safety deadline is shortened.
    browserTracingIntegration: (options) => Sentry.browserTracingIntegration({ ...options, finalTimeout: 1000 }),
  };
  return createSentryProvider({
    dsn: 'https://pub@o1.ingest.sentry.io/1',
    sentry: sdk,
    env: { VITE_APP_ENV: 'staging', VITE_SENTRY_SEND_DEFAULT_PII: 'true' },
    logger: { warn() {} },
  });
}

describe('real Sentry envelopes (ETP-4578 H3)', () => {
  // The real SDK leaves timers behind. Closing the client, with the short tracing deadline
  // above, lets the file end on its own. Forcing process.exit here raced the test runner's
  // report and could fail the whole file on slower CI runners.
  after(async () => {
    await Sentry.close(0);
  });

  it('lets no planted secret, record id or page title leave, whatever path the error takes', async () => {
    const provider = realSentry();
    const gateway = createTelemetryGateway({ adapters: [provider], allowedKeys: ['reason'], logger: { warn() {} } });
    await gateway.init({});

    // 1. Through the gateway.
    await gateway.captureException(new Error(`Login failed for ${EMAIL} with ${TOKEN}`), { reason: 'network', body: { raw: TOKEN } });

    // 2. What the SDK's own handlers do: capture directly, with the ambient context attached.
    Sentry.setUser({ id: 'u1', email: EMAIL, ip_address: '203.0.113.7' });
    Sentry.setTag('customer', CUSTOMER_NAME);
    Sentry.setExtra('reset', `https://go.etendo.cloud/reset/${HEX32}?code=${SHORT_CODE}`);
    Sentry.setContext('device', { name: EMAIL });
    Sentry.addBreadcrumb({ category: 'console', level: 'log', message: `Customer ${CUSTOMER_NAME}`, data: { arguments: [TOKEN] } });
    Sentry.addBreadcrumb({ category: 'fetch', type: 'http', data: { method: 'GET', url: `https://core.etendo.cloud/sws/neo/session?code=${SHORT_CODE}`, status_code: 401 } });
    Sentry.addBreadcrumb({ category: 'navigation', data: { from: '/login', to: `/reset/${HEX32}` } });
    const failure = new Error(`GET https://go.etendo.cloud/reset/${HEX32}?code=${SHORT_CODE} failed for ${EMAIL} ${JWT}`);
    failure.stack = `Error: boom\n    at save (https://go.etendo.cloud/go/assets/index-B3kd9Fq2.js?session=${SHORT_CODE}:12:345)`;
    Sentry.captureException(failure);
    await flush();

    const events = itemsOfType('event');
    assert.ok(events.length >= 2, `expected at least 2 events, got ${events.length}`);
    const wire = JSON.stringify(parseEnvelopes(envelopes));
    for (const secret of SECRETS) assert.equal(wire.includes(secret), false, `"${secret}" left in a Sentry envelope`);
  });

  it('never sends user data, request headers or cookies, and pins sendDefaultPii to false even if the env asks for true', async () => {
    const provider = realSentry();
    const gateway = createTelemetryGateway({ adapters: [provider], allowedKeys: [], logger: { warn() {} } });
    await gateway.init({});
    Sentry.setUser({ id: 'u1', email: EMAIL, ip_address: '203.0.113.7' });

    Sentry.captureException(new Error('plain'));
    await flush();

    assert.equal(Sentry.getClient().getOptions().sendDefaultPii, false);
    const [event] = itemsOfType('event');
    assert.equal(event.user, undefined);
    assert.equal(event.request?.cookies, undefined);
    assert.equal(event.request?.headers, undefined);
    assert.equal(event.request?.query_string, undefined);
    assert.equal(event.request?.url.includes(SHORT_CODE), false);
    assert.equal(event.request?.url.includes(HEX32), false, 'the record id in the page URL must collapse');
  });

  it('keeps only fields the adapter rebuilds: nothing a new SDK version adds gets through by default', async () => {
    const provider = realSentry();
    const gateway = createTelemetryGateway({ adapters: [provider], allowedKeys: [], logger: { warn() {} } });
    await gateway.init({});

    Sentry.captureException(new Error('plain'));
    await flush();

    const [event] = itemsOfType('event');
    const allowedTopLevel = new Set([
      'event_id', 'timestamp', 'level', 'platform', 'environment', 'release', 'logger', 'sdk', 'message', 'logentry',
      'exception', 'breadcrumbs', 'request', 'tags', 'extra', 'contexts', 'debug_meta', 'fingerprint', 'type',
      'transaction', 'transaction_info', 'spans', 'measurements', 'start_timestamp', 'dist',
    ]);
    const unexpected = Object.keys(event).filter((key) => !allowedTopLevel.has(key));
    assert.deepEqual(unexpected, [], `top-level fields outside the rebuilt set: ${unexpected.join(', ')}`);
    // The SDK appends its own metadata (integration names, package names/versions, the infer_ip
    // setting) AFTER beforeSend, when it builds the envelope, so no hook can filter it. It is
    // library identification, not user data; pinning the set means a new field fails this test.
    assert.deepEqual(Object.keys(event.sdk).sort(), ['integrations', 'name', 'packages', 'settings', 'version'], JSON.stringify(event.sdk));
    assert.deepEqual(Object.keys(event.sdk.settings), ['infer_ip']);
    for (const pkg of event.sdk.packages) assert.deepEqual(Object.keys(pkg).sort(), ['name', 'version']);
  });

  it('drops console breadcrumbs, so a name logged to the console never rides along', async () => {
    const provider = realSentry();
    const gateway = createTelemetryGateway({ adapters: [provider], allowedKeys: [], logger: { warn() {} } });
    await gateway.init({});

    Sentry.addBreadcrumb({ category: 'console', message: `Customer ${CUSTOMER_NAME}` });
    Sentry.addBreadcrumb({ category: 'ui.click', message: 'button#save' });
    Sentry.captureException(new Error('after crumbs'));
    await flush();

    const [event] = itemsOfType('event');
    const categories = (event.breadcrumbs ?? []).map((crumb) => crumb.category);
    assert.equal(categories.includes('console'), false);
    assert.equal(categories.includes('ui.click'), true);
  });

  it('the kill switch stops the real SDK: nothing is sent after disable()', async () => {
    const provider = realSentry();
    const gateway = createTelemetryGateway({ adapters: [provider], allowedKeys: [], logger: { warn() {} } });
    await gateway.init({});
    Sentry.captureException(new Error('before the kill'));
    await flush();
    const before = envelopes.length;
    assert.ok(before > 0, 'the SDK should have sent the first event');

    await gateway.disable('sentry');
    Sentry.captureException(new Error('AUTOMATIC ERROR AFTER THE KILL'));
    Sentry.addBreadcrumb({ category: 'ui.click', message: 'after kill' });
    await new Promise((resolve) => { setTimeout(resolve, 300); });

    assert.equal(envelopes.length, before, 'no envelope may be sent after the kill switch');
    assert.equal(envelopes.join('').includes('AFTER THE KILL'), false);
  });
});
