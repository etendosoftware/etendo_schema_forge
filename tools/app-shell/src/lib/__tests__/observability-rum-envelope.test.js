import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// ETP-4578 H4c — what AWS RUM actually puts on the wire.
//
// The core's adapter is unit-tested with a fake SDK. This drives the REAL aws-rum-web (through
// the host's SDK entry point) in jsdom, with a fetch that captures every data-plane request,
// so it fails if a RUM upgrade stops calling `clientBuilder` as a method, drops the private
// `defaultClientBuilder` the adapter relies on, or starts sending a field the adapter does not
// rebuild. Everything below is synthetic.

const HEX32 = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const EMAIL = 'jane.doe@example.com';
const SHORT_CODE = 'sh0rtC0de42';
// Deliberately not shaped like a vendor key (see the ETP-4577 push-protection incident).
const TOKEN = 'FAKE_TEST_TOKEN_ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv12';
const PAGE_TITLE = 'Pedido de venta 1234 - Cliente Acme';
const SECRETS = [EMAIL, SHORT_CODE, TOKEN, HEX32, 'Acme'];
const DATA_PLANE = 'https://dataplane.rum.eu-west-3.amazonaws.com';

let AwsRum;
let createRumProvider;
let createTelemetryGateway;
let requests;
let dom;

const settle = (ms = 150) => new Promise((resolve) => { setTimeout(resolve, ms); });

before(async () => {
  dom = new JSDOM(`<!doctype html><title>${PAGE_TITLE}</title>`, {
    url: `https://go.etendo.cloud/go/sales-order/${HEX32}?code=${SHORT_CODE}#access_token=${TOKEN}`,
    referrer: `https://mail.example.com/inbox?u=${EMAIL}`,
  });
  const window = dom.window;
  for (const key of ['window', 'document', 'location', 'history', 'screen', 'localStorage', 'sessionStorage', 'HTMLElement', 'Element', 'Node', 'Event', 'MutationObserver', 'XMLHttpRequest', 'History', 'Location', 'EventTarget', 'CustomEvent', 'DOMParser', 'Document', 'HTMLDocument', 'ErrorEvent', 'PromiseRejectionEvent']) {
    try { globalThis[key] = window[key]; } catch { /* read-only in node */ }
  }
  Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
  globalThis.self = window;
  globalThis.addEventListener = window.addEventListener.bind(window);
  globalThis.removeEventListener = window.removeEventListener.bind(window);
  // jsdom has no PerformanceObserver: a stub that observes nothing is enough for the SDK to start.
  globalThis.PerformanceObserver = class { observe() {} disconnect() {} takeRecords() { return []; } static supportedEntryTypes = []; };
  window.PerformanceObserver = globalThis.PerformanceObserver;
  for (const method of ['getEntriesByType', 'getEntriesByName', 'getEntries']) window.performance[method] ??= () => [];
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url ?? String(input);
    const raw = init.body ?? (typeof input === 'object' ? input.body : undefined);
    let body = '';
    if (typeof raw === 'string') body = raw;
    else if (raw && ArrayBuffer.isView(raw)) body = new TextDecoder().decode(raw);
    else if (raw) body = await new Response(raw).text(); // a ReadableStream: read it, do not stringify it
    requests.push({ url, body });
    return new Response('{}', { status: 200 });
  };
  window.fetch = globalThis.fetch;

  ({ AwsRum } = await import('../observability/sdk.js'));
  ({ createRumProvider } = await import('../rum.js'));
  ({ createTelemetryGateway } = await import('@etendosoftware/app-shell-core/observability/gateway'));
});

/** The real SDK, given static credentials so it never calls Cognito. */
const offlineAwsRum = (tweak) => class OfflineAwsRum extends AwsRum {
  constructor(id, version, region, config) {
    super(id, version, region, {
      ...config,
      // With static credentials the SDK must not go to Cognito (there is no network here).
      identityPoolId: undefined,
      sessionSampleRate: 1,
      batchLimit: 1,
      dispatchInterval: 50,
    });
    tweak?.(this);
    // The public entry point the SDK's own auth flows use; it is what makes Dispatch call the
    // configured clientBuilder. Static credentials: the signature is real, the account is not.
    this.setAwsCredentials(async () => ({ accessKeyId: 'FAKEACCESSKEY', secretAccessKey: 'fake-secret', sessionToken: 'fake-session' }));
  }
};

const dataPlane = () => requests.filter((request) => request.url.startsWith(DATA_PLANE));

describe('real AWS RUM requests (ETP-4578 H4c)', () => {
  // The real SDK keeps a dispatch interval alive, and also a jsdom interval its disable() leaves
  // running. Stop every SDK through the gateway (the kill-switch path), then close the jsdom
  // window, which cancels its timers, so the file ends on its own. Forcing process.exit here
  // raced the test runner's report and failed the whole file on slower CI runners.
  const gateways = [];
  after(async () => {
    await Promise.all(gateways.map((gateway) => gateway.disable('aws-rum')));
    dom?.window.close();
  });

  async function realRum(overrides = {}) {
    requests = [];
    const warnings = [];
    const logger = { warn: (...args) => warnings.push(args.map(String).join(' ')) };
    const provider = createRumProvider({
      env: { VITE_RUM_ENABLED: 'true', VITE_RUM_APP_MONITOR_ID: 'monitor-id', VITE_RUM_IDENTITY_POOL_ID: 'eu-west-3:fake-pool', ...overrides },
      AwsRumCtor: offlineAwsRum(),
      logger,
    });
    const gateway = createTelemetryGateway({ adapters: [provider], allowedKeys: [], logger });
    gateways.push(gateway);
    await gateway.init({});
    // An SDK that fails to start would make every "nothing leaked" assertion pass for free.
    assert.deepEqual(warnings, [], `the real SDK failed to start: ${warnings.join(' | ')}`);
    return { gateway, provider };
  }

  it('lets no page title, record id, query or planted secret leave in a data-plane request', async () => {
    const { gateway } = await realRum();

    const failure = new Error(`Save failed for ${EMAIL} with ${TOKEN} at /reset/${HEX32}?code=${SHORT_CODE}`);
    failure.stack = `Error: boom\n    at save (https://go.etendo.cloud/go/assets/index-B3kd9Fq2.js?session=${SHORT_CODE}:12:345)`;
    await gateway.captureException(failure, {});
    await settle(400);

    const sent = dataPlane();
    assert.ok(sent.length > 0, `the real SDK should have posted to the data plane; it made ${requests.length} requests: ${requests.map((r) => r.url).join(', ')}`);
    const wire = sent.map((request) => request.body).join('\n');
    assert.ok(wire.includes('RumEvents'), `the captured body is not a readable batch: ${wire.slice(0, 80)}`);
    for (const secret of SECRETS) assert.equal(wire.includes(secret), false, `"${secret}" left in a RUM request`);
  });

  it('is the batch the adapter rebuilt: only the approved top-level fields, no title in the metadata', async () => {
    const { gateway } = await realRum();
    await gateway.captureException(new Error('plain'), {});
    await settle(400);

    const [request] = dataPlane();
    assert.ok(request, 'expected a data-plane request');
    const batch = JSON.parse(request.body);
    assert.deepEqual(Object.keys(batch).sort(), ['AppMonitorDetails', 'BatchId', 'RumEvents', 'UserDetails']);
    for (const event of batch.RumEvents) {
      assert.equal(JSON.parse(event.metadata).title, undefined, 'document.title must not be sent');
    }
  });

  it('nothing is sent after the kill switch', async () => {
    const { gateway } = await realRum();
    await gateway.captureException(new Error('before the kill'), {});
    await settle(400);
    assert.ok(dataPlane().length > 0, 'the SDK should have sent the first batch');

    await gateway.disable('aws-rum');
    const before = requests.length;
    await gateway.captureException(new Error('AFTER THE KILL'), {});
    await settle(400);

    assert.equal(requests.length, before, 'no request may be made after the kill switch');
  });

  it('fails closed when the SDK no longer exposes defaultClientBuilder', async () => {
    requests = [];
    const warnings = [];
    const NoDefaultBuilder = offlineAwsRum((rum) => { rum.dispatchManager.defaultClientBuilder = undefined; });
    const provider = createRumProvider({
      env: { VITE_RUM_ENABLED: 'true', VITE_RUM_APP_MONITOR_ID: 'monitor-id', VITE_RUM_IDENTITY_POOL_ID: 'eu-west-3:fake-pool' },
      AwsRumCtor: NoDefaultBuilder,
      logger: { warn: (...args) => warnings.push(args.join(' ')) },
    });
    const gateway = createTelemetryGateway({ adapters: [provider], allowedKeys: [], logger: { warn() {} } });
    await gateway.init({});
    await gateway.captureException(new Error(`leak ${EMAIL}`), {});
    await settle(400);

    assert.ok(warnings.some((line) => line.includes('defaultClientBuilder')), `expected the fail-closed warning, got: ${warnings.join(' | ')}`);
    assert.equal(dataPlane().length, 0);
    assert.equal(requests.some((request) => request.body.includes(EMAIL)), false);
  });
});
