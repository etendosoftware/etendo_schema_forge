import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// ETP-4578 H4b — what Mixpanel actually puts on the wire.
//
// The core's adapter is unit-tested with a fake SDK. This drives the REAL mixpanel-browser
// (through the host's SDK entry point) in jsdom with an XMLHttpRequest that captures every
// request, so it fails if a Mixpanel upgrade starts sending something the adapter does not
// filter. Everything below is synthetic.

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');

const HEX32 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const EMAIL = 'jane.doe@example.com';
const SHORT_CODE = 'sh0rtC0de42';
// Deliberately not shaped like a vendor key (see the ETP-4577 push-protection incident).
const TOKEN = 'FAKE_TEST_TOKEN_ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv12';
const PROJECT_TOKEN = 'fake-mixpanel-project-token';
const PAGE_TITLE = 'Pedido de venta 1234 - Cliente Acme';
// An approved identifier (the account id), NOT a secret: it is sent on purpose.
const ACCOUNT_ID = 'c0ffee00c0ffee00c0ffee00c0ffee00';
const SECRETS = [EMAIL, SHORT_CODE, TOKEN, HEX32, 'Acme', 'mail.example.com'];

let loadMixpanel;
let createMixpanelProvider;
let createTelemetryGateway;
let SAFE_EVENT_PROPERTY_KEYS;
let requests;

class CapturingXHR {
  withCredentials = false;
  open(method, url) { this.url = url; }
  setRequestHeader() {}
  send(body) {
    requests.push({ url: this.url, body });
    this.readyState = 4;
    this.status = 200;
    this.responseText = '1';
    setTimeout(() => this.onreadystatechange?.(), 0);
  }
}

/** Mixpanel form-encodes `data=<base64 JSON>`. */
function decode(request) {
  const raw = new URLSearchParams(typeof request.body === 'string' ? request.body : '').get('data');
  return JSON.parse(raw.startsWith('{') || raw.startsWith('[') ? raw : Buffer.from(raw, 'base64').toString());
}

const decoded = () => requests.map((request) => {
  const data = decode(request);
  return { endpoint: request.url.split('?')[0].replace(/^https?:\/\/[^/]+/, ''), data: Array.isArray(data) ? data[0] : data };
});
const settle = () => new Promise((resolve) => { setTimeout(resolve, 80); });

before(async () => {
  const dom = new JSDOM(`<!doctype html><title>${PAGE_TITLE}</title>`, {
    url: `https://go.etendo.cloud/go/portal/tok-abcdef0123456789?utm_source=mail&code=${SHORT_CODE}#access_token=${TOKEN}`,
    referrer: `https://mail.example.com/inbox?u=${EMAIL}`,
  });
  const window = dom.window;
  window.XMLHttpRequest = CapturingXHR;
  for (const key of ['window', 'document', 'location', 'screen', 'localStorage', 'sessionStorage', 'HTMLElement', 'Element', 'Node', 'Event']) {
    globalThis[key] = window[key];
  }
  globalThis.XMLHttpRequest = CapturingXHR;
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });

  ({ loadMixpanel } = await import('../observability/sdk.js'));
  ({ createMixpanelProvider } = await import('../observability/providers/mixpanel.js'));
  ({ createTelemetryGateway } = await import('@etendosoftware/app-shell-core/observability/gateway'));
  ({ SAFE_EVENT_PROPERTY_KEYS } = await import('../observability/payload.js'));
});

describe('real Mixpanel requests (ETP-4578 H4b)', () => {
  after(() => { setTimeout(() => process.exit(process.exitCode ?? 0), 50).unref?.(); });

  async function realMixpanel({ persisted } = {}) {
    requests = [];
    // Mixpanel persists its identity in a cookie/localStorage, and the SDK only emits `$identify`
    // when the id CHANGES: start every test from a clean browser, or one test's identify hides
    // the next one's.
    // The SDK sets its cookie for the parent domain (cross-subdomain), so expire every variant.
    for (const cookie of document.cookie.split('; ').filter(Boolean)) {
      for (const domain of ['', `; domain=${location.hostname}`, '; domain=.etendo.cloud']) {
        document.cookie = `${cookie.split('=')[0]}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
      }
    }
    localStorage.clear();
    if (persisted) {
      // Planted the way an older build would have: for the parent domain, like the SDK itself.
      document.cookie = `mp_${PROJECT_TOKEN}_mixpanel=${encodeURIComponent(JSON.stringify(persisted))}; path=/; domain=.etendo.cloud`;
    }
    const provider = createMixpanelProvider({
      enabled: 'true',
      token: PROJECT_TOKEN,
      storage: { getItem: () => '1', setItem() {} },
      logger: { warn() {} },
    });
    const gateway = createTelemetryGateway({
      adapters: [provider],
      allowedKeys: [...SAFE_EVENT_PROPERTY_KEYS],
      logger: { warn() {} },
    });
    await gateway.init({ app: 'app-shell' });
    return { gateway, provider };
  }

  it('lets no planted secret, raw URL, referrer or persisted identifier leave on any path', async () => {
    const persisted = {
      distinct_id: '$device:5f0c2e7a-1d7b-4c3a-9a55-2f9d1c0e8b11',
      $device_id: '5f0c2e7a-1d7b-4c3a-9a55-2f9d1c0e8b11',
      legacy_email: EMAIL,
      $initial_referrer: `https://mail.example.com/?u=${EMAIL}`,
      utm_source: EMAIL,
    };
    const { gateway } = await realMixpanel({ persisted });

    await gateway.track('clicked', { action: 'save', account_id: ACCOUNT_ID });
    await gateway.page('/sales-order/123');
    await gateway.identify('user-1', { status: 'active' });
    await gateway.groupSet('account_id', ACCOUNT_ID, { $name: 'Acme Corp' });
    await settle();

    assert.ok(requests.length >= 3, `expected several requests, got ${requests.length}`);
    const wire = JSON.stringify(decoded());
    for (const secret of SECRETS) assert.equal(wire.includes(secret), false, `"${secret}" left in a Mixpanel request`);
    assert.equal(wire.includes('legacy_email'), false, 'a persisted super-property from an older build leaked');
  });

  it('sends only approved event properties, and URL properties as a normalized path or not at all', async () => {
    const { gateway } = await realMixpanel();

    await gateway.track('clicked', { action: 'save' });
    await settle();

    const approved = new Set([
      ...SAFE_EVENT_PROPERTY_KEYS,
      'token', 'distinct_id', '$device_id', '$insert_id', 'time', 'mp_lib', '$lib_version', '$os', '$browser',
      '$browser_version', '$device', '$screen_height', '$screen_width', '$duration', '$current_url', '$referrer',
    ]);
    const events = decoded().filter(({ data }) => data.event === 'clicked');
    assert.equal(events.length, 1);
    const unexpected = Object.keys(events[0].data.properties).filter((key) => !approved.has(key));
    assert.deepEqual(unexpected, [], `properties outside the approved set: ${unexpected.join(', ')}`);
    assert.equal(events[0].data.properties.$current_url, '/go/portal/:id');
    assert.equal(events[0].data.properties.$referrer, undefined, 'an external referrer must not be sent at all');
    assert.equal(events[0].data.properties.token, PROJECT_TOKEN, 'the public project token must reach the endpoint');
  });

  it('the $identify event, which the SDK sends with hooks skipped, carries no persisted legacy data', async () => {
    const { gateway } = await realMixpanel({
      persisted: { distinct_id: '$device:9d9d', $device_id: '9d9d', legacy_email: EMAIL, $initial_referrer: `https://mail.example.com/?u=${EMAIL}` },
    });

    await gateway.identify('user-for-identify-test', {});
    await settle();

    const identify = decoded().find(({ data }) => data.event === '$identify');
    assert.ok(identify, `the SDK should have sent $identify; it sent ${JSON.stringify(decoded().map(({ data }) => data.event ?? '(engage)'))}`);
    const wire = JSON.stringify(identify);
    for (const secret of SECRETS) assert.equal(wire.includes(secret), false, `"${secret}" left in $identify`);
    assert.equal(wire.includes('legacy_email'), false);
  });

  it('super-properties registered later are filtered by the allowlist', async () => {
    const { gateway } = await realMixpanel();
    const client = (await loadMixpanel()).default;

    client.register({ legacy_email: EMAIL, account_id: ACCOUNT_ID });
    await gateway.track('after_register', { action: 'x' });
    await settle();

    const event = decoded().find(({ data }) => data.event === 'after_register');
    assert.equal(event.data.properties.legacy_email, undefined);
    assert.equal(event.data.properties.account_id, ACCOUNT_ID);
  });

  it('an identify racing the kill switch never reaches Mixpanel', async () => {
    const { gateway } = await realMixpanel();
    await gateway.track('warm up', { action: 'x' });
    await settle();
    requests.length = 0;

    await Promise.all([gateway.identify('user-2', { status: 'active' }), gateway.disable('mixpanel')]);
    await gateway.track('after the kill', { action: 'x' });
    await settle();

    assert.equal(requests.length, 0, `requests after the kill: ${JSON.stringify(decoded().map(({ data }) => data.event ?? data.$set))}`);
  });
});
