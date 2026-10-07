import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// ETP-4578 — what Datadog RUM actually puts on the wire.
//
// The core's adapter is unit-tested with a fake SDK that ports the SDK's field rules. This
// drives the REAL @datadog/browser-rum (through the host's SDK entry point and provider) in
// jsdom, with a sendBeacon/fetch that capture every intake request, so it fails if a Datadog
// upgrade starts sending a field the adapter does not rewrite, or reverts a change it makes.
// jsdom has no resource timing and no real clicks, so fetch/XHR resources and click actions
// are left to the core's unit tests; the document's own resource and every other path run here.
// The SDK is a page-level singleton (one init per page), so the tests share one page and run
// in order; the kill switch goes last. Everything below is synthetic.

const HEX32 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const EMAIL = 'jane.doe@example.com';
const SHORT_CODE = 'sh0rtC0de42';
// Deliberately not shaped like a vendor key (see the ETP-4577 push-protection incident).
const TOKEN = 'FAKE_TEST_TOKEN_ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv12';
const PAGE_TITLE = 'Pedido de venta 1234 - Cliente Acme';
const CUSTOMER_NAME = 'Juan Perez SL';
// An approved identifier (the account id), NOT a secret: it is sent on purpose.
const ACCOUNT_ID = 'c0ffee00c0ffee00c0ffee00c0ffee00';
const SECRETS = [EMAIL, SHORT_CODE, TOKEN, HEX32, 'Acme', CUSTOMER_NAME, 'mail.example.com'];
const PAGE_URL = 'https://go.etendo.cloud/go/sales-order/:id';

const realSetTimeout = setTimeout;
const wait = (ms) => new Promise((resolve) => { realSetTimeout(resolve, ms); });

let window;
let gateway;
let datadogRum;
const intake = [];

/** RUM intake bodies are newline-delimited JSON events. */
const events = () => intake.flatMap(({ body }) => body.split('\n').filter(Boolean).map((line) => JSON.parse(line)));
const ofType = (type) => events().filter((event) => event.type === type);

// The SDK ignores untrusted DOM events; `__ddIsTrusted` is its own test hook for that.
function trusted(event) {
  event.__ddIsTrusted = true;
  return event;
}

// The SDK instruments the global `onerror` (the window, in a browser).
function unhandledError(error) {
  globalThis.onerror?.(`Uncaught ${error}`, 'https://go.etendo.cloud/go/assets/index.js', 1, 2, error);
}

/** Page exit is what makes the SDK flush its batch (through sendBeacon). */
async function flush() {
  await wait(250);
  window.dispatchEvent(trusted(new window.Event('beforeunload')));
  await wait(50);
}

before(async () => {
  const dom = new JSDOM(
    `<!doctype html><title>${PAGE_TITLE}</title><h1>${CUSTOMER_NAME}</h1>`,
    {
      url: `https://go.etendo.cloud/go/sales-order/${HEX32}?tab=lines&code=${SHORT_CODE}#access_token=${TOKEN}`,
      referrer: `https://mail.example.com/inbox?u=${EMAIL}`,
      pretendToBeVisual: true,
    },
  );
  window = dom.window;
  for (const key of Object.getOwnPropertyNames(window)) {
    if (!(key in globalThis)) {
      try { globalThis[key] = window[key]; } catch { /* read-only in node */ }
    }
  }
  // Node has its own EventTarget and Event; the SDK must see the DOM's.
  for (const key of ['window', 'document', 'location', 'history', 'EventTarget', 'Event', 'CustomEvent']) globalThis[key] = window[key];
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  window.navigator.sendBeacon = (url, body) => {
    intake.push({ url: String(url), body: String(body) });
    return true;
  };
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('browser-intake-')) intake.push({ url: String(url), body: String(init.body) });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  // The SDK polls its session cookie forever; its timers must not keep the test process alive.
  for (const name of ['setTimeout', 'setInterval']) {
    const original = globalThis[name];
    globalThis[name] = (...args) => {
      const handle = original(...args);
      handle?.unref?.();
      return handle;
    };
  }

  const { loadDatadog } = await import('../observability/sdk.js');
  const { createDatadogProvider } = await import('../observability/providers/datadog.js');
  const { createTelemetryGateway } = await import('@etendosoftware/app-shell-core/observability/gateway');
  const { SAFE_EVENT_PROPERTY_KEYS } = await import('../observability/payload.js');
  ({ datadogRum } = await loadDatadog());

  const provider = createDatadogProvider({
    env: {
      VITE_DATADOG_ENABLED: 'true',
      VITE_DATADOG_APPLICATION_ID: 'fake-application-id',
      VITE_DATADOG_CLIENT_TOKEN: 'fake-client-token',
      VITE_DATADOG_SITE: 'datadoghq.eu',
      VITE_APP_ENV: 'test',
      VITE_DATADOG_SESSION_REPLAY_SAMPLE_RATE: '0',
    },
    logger: { warn() {} },
  });
  gateway = createTelemetryGateway({
    adapters: [provider],
    allowedKeys: [...SAFE_EVENT_PROPERTY_KEYS],
    logger: { warn() {} },
  });
  await gateway.init({ app: 'app-shell' });
});

describe('real Datadog RUM requests (ETP-4578)', () => {
  it('lets no planted secret, raw URL, referrer or page title leave on any path', async () => {
    // Context the gateway never saw (a third party, a remote configuration) is filtered as well.
    datadogRum.setGlobalContextProperty('customer_email', EMAIL);
    await gateway.identify('user-1');
    await gateway.group('account_id', ACCOUNT_ID);
    await gateway.track('order_saved', { action: 'save', email: EMAIL });
    await gateway.captureException(new Error(`Save failed for ${EMAIL}`));
    // An unhandled error, collected by the SDK on its own.
    const thrown = new TypeError(`cannot read ${TOKEN} of ${EMAIL}`);
    thrown.stack = `TypeError: cannot read ${EMAIL}\n    at save (https://go.etendo.cloud/go/assets/index.js?token=${TOKEN}:1:2)\n` +
      '    at load (https://go.etendo.cloud/go/assets/vendor-Bx12cd.js:10:20)';
    unhandledError(thrown);
    await gateway.page('/sales-order/:recordId');
    await flush();

    assert.ok(ofType('view').length > 0, 'the SDK should have sent views');
    assert.ok(ofType('action').length > 0, 'the SDK should have sent actions');
    assert.deepEqual(ofType('error').map((event) => event.error.source).sort(), ['custom', 'source'],
      'both the reported and the unhandled error should have been sent');
    assert.ok(ofType('resource').length > 0, "the SDK should have sent the document's resource");
    const wire = JSON.stringify(events());
    for (const secret of SECRETS) assert.equal(wire.includes(secret), false, `"${secret}" left in a Datadog request`);
    for (const url of intake.map((request) => request.url)) {
      assert.match(url, /^https:\/\/browser-intake-datadoghq\.eu\//, 'only the configured site receives data');
    }
  });

  it('sends views on normalized routes, and identity as ids only', () => {
    const views = ofType('view');
    assert.deepEqual([...new Set(views.map((event) => event.view.name))].sort(), ['/go/sales-order/:id', '/sales-order/:recordId']);
    for (const event of views) {
      assert.equal(event.view.url, PAGE_URL);
      // The first view's referrer is the mail provider's (dropped); later ones are this app's.
      assert.ok(['', PAGE_URL].includes(event.view.referrer), event.view.referrer);
    }
    const later = events().filter((event) => event.usr?.id);
    assert.ok(later.length > 0, 'identify should reach the SDK');
    for (const event of later) {
      const { anonymous_id: anonymousId, ...usr } = event.usr;
      assert.deepEqual(usr, { id: 'user-1' }, 'only the id, never a name or an email');
      assert.ok(anonymousId === undefined || /^[0-9a-f-]{36}$/.test(anonymousId));
    }
    assert.ok(events().some((event) => event.account?.id === ACCOUNT_ID));
    assert.deepEqual(ofType('resource').map((event) => event.resource.url), [PAGE_URL]);
  });

  it('sends only approved properties with an action, and errors scrubbed', () => {
    const custom = ofType('action').find((event) => event.action.target?.name === 'order_saved');
    assert.ok(custom, 'the gateway action should be sent');
    assert.deepEqual(custom.context, { action: 'save' });
    const unhandled = ofType('error').find((event) => event.error.source === 'source');
    assert.equal(unhandled.error.message, '[REDACTED]');
    // Frames keep file, line and column (source maps need them), except a frame whose URL had a
    // query: it loses the query and, with it, its position.
    assert.equal(unhandled.error.stack,
      '[REDACTED]\n  at save @ https://go.etendo.cloud/go/assets/index.js\n  at load @ https://go.etendo.cloud/go/assets/vendor-Bx12cd.js:10:20');
  });

  it('drops an unhandled error whose cause it cannot rewrite, and only that one', async () => {
    intake.length = 0;
    unhandledError(new Error('Save failed', { cause: new Error(`rejected for ${EMAIL}`) }));
    unhandledError(new Error('Load failed', { cause: new Error('timeout') }));
    await flush();
    const sent = ofType('error').map((event) => [event.error.message, event.error.causes?.map((cause) => cause.message)]);
    assert.deepEqual(sent, [['Load failed', ['timeout']]]);
  });

  it('after a kill, sends nothing but the end of the current view, sanitized', async () => {
    intake.length = 0;
    await gateway.disable('datadog');
    datadogRum.addAction('direct_after_kill');
    datadogRum.addError(new Error(`direct ${EMAIL}`));
    unhandledError(new Error('late'));
    await flush();
    const types = new Set(events().map((event) => event.type));
    types.delete('view');
    types.delete('view_update');
    assert.deepEqual([...types], [], `non-view events after the kill: ${JSON.stringify(events())}`);
    const wire = JSON.stringify(events());
    for (const secret of SECRETS) assert.equal(wire.includes(secret), false, `"${secret}" left after the kill`);
  });
});
