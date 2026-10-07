/**
 * ETP-5460 — report-api.js authenticates report requests via the session
 * cookie (`report-auth.js`'s `resolveReportSession`, loaded through the
 * gated `loadReportCli` — see report-cli-loader.test.js) instead of decoding
 * an unverified Bearer JWT. Before this, `getClientIdFromRequest` decoded
 * the JWT payload WITHOUT verifying its signature, and every SQL/selector
 * path silently fell back to `clientId || '0'` (System scope) instead of
 * erroring — see discovery id 456 / scope-decision id 457.
 *
 * Mirrors `schema_forge_core/tools/report-server/__tests__/server-session-
 * auth.test.js` (id 459's apply-progress): source-ordering assertions for
 * "session resolved before any DB/NEO access", plus a middleware harness
 * (same shape as report-api-neo-accept-language.test.js) exercising the
 * REAL routes with a stubbed `globalThis.fetch` that answers `/sws/go/
 * session` in addition to NEO/jsreport.
 *
 * ETP-5666 — the Etendo base URL comes from the `etendoUrl` option that
 * vite.config.js passes (resolved from `.env.local` via loadEnv), not from
 * `process.env.ETENDO_URL`, which Vite never populates from `.env.local`.
 * The jsreport base URL follows the same rule via the `jsreportUrl` option.
 *
 * @covers tools/app-shell/vite-plugins/report-api.js
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import reportApiPlugin from '../vite-plugins/report-api.js';

const PLUGIN_SRC = readFileSync(
  fileURLToPath(new URL('../vite-plugins/report-api.js', import.meta.url)),
  'utf8',
);

const NEO_REPORT_ID = 'tax-report';

// --- Middleware harness (mirrors report-api-neo-accept-language.test.js) ---

function loadMiddleware() {
  let handler;
  reportApiPlugin().configureServer({ middlewares: { use: (fn) => { handler = fn; } } });
  return handler;
}

function makeReq(method, url, body, headers = {}) {
  const req = Readable.from(body ? [body] : []);
  req.method = method;
  req.url = url;
  req.headers = { ...headers };
  return req;
}

function makeRes() {
  const chunks = [];
  return {
    statusCode: 200,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    end(c) { if (c) chunks.push(c); this.body = chunks.join(''); },
  };
}

const VALID_SESSION_COOKIE = '__Host-go_session=abc123';
const VALID_CSRF = 'good-csrf';

function validSessionHeaders(method) {
  const headers = { cookie: VALID_SESSION_COOKIE };
  if (method !== 'GET') headers['x-go-csrf'] = VALID_CSRF;
  return headers;
}

let fetchCalls;
let originalFetch;
let sessionFetchCount;

function stubFetch({ sessionOk = true, sessionStatus = 200 } = {}) {
  fetchCalls = [];
  sessionFetchCount = 0;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const urlStr = String(url);
    fetchCalls.push({ url: urlStr, init });
    if (urlStr.includes('/sws/go/session')) {
      sessionFetchCount += 1;
      if (!sessionOk) {
        return { ok: false, status: sessionStatus, json: async () => ({}), text: async () => '' };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          environment: { clientId: 'C1', orgId: 'O1', roleId: 'R1', userId: 'U1' },
          csrfToken: VALID_CSRF,
        }),
      };
    }
    if (urlStr.includes('/api/report')) {
      return {
        ok: true, status: 200, headers: { get: () => 'text/html' },
        arrayBuffer: async () => new ArrayBuffer(0), text: async () => '',
      };
    }
    // NEO data response
    return {
      ok: true,
      status: 200,
      json: async () => ({ response: { data: [], meta: {} } }),
      text: async () => '',
    };
  };
}

function neoCall() {
  return [...fetchCalls].reverse().find((c) => c.url.includes('/sws/neo/'));
}

describe('report-api.js — session-cookie authentication (ETP-5460)', () => {
  beforeEach(() => {
    stubFetch();
    delete process.env.VITE_MOCK;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('POST /api/reports/:id/render', () => {
    it('rejects with 401 and makes no NEO/jsreport call when no session cookie is present', async () => {
      const handler = loadMiddleware();
      const res = makeRes();
      const body = JSON.stringify({ format: 'html' });
      await handler(makeReq('POST', `/api/reports/${NEO_REPORT_ID}/render`, body, {}), res, () => {
        throw new Error('render route did not match');
      });
      assert.equal(res.statusCode, 401);
      assert.equal(neoCall(), undefined, 'no NEO fetch must happen without a resolved session');
    });

    it('rejects with 401 when Etendo reports the session as invalid/expired', async () => {
      stubFetch({ sessionOk: false, sessionStatus: 401 });
      const handler = loadMiddleware();
      const res = makeRes();
      const body = JSON.stringify({ format: 'html' });
      await handler(
        makeReq('POST', `/api/reports/${NEO_REPORT_ID}/render`, body, validSessionHeaders('POST')),
        res,
        () => { throw new Error('render route did not match'); },
      );
      assert.equal(res.statusCode, 401);
      assert.equal(neoCall(), undefined);
    });

    it('maps a backend outage (5xx from /sws/go/session) to 502, never 401', async () => {
      stubFetch({ sessionOk: false, sessionStatus: 503 });
      const handler = loadMiddleware();
      const res = makeRes();
      const body = JSON.stringify({ format: 'html' });
      await handler(
        makeReq('POST', `/api/reports/${NEO_REPORT_ID}/render`, body, validSessionHeaders('POST')),
        res,
        () => { throw new Error('render route did not match'); },
      );
      assert.equal(res.statusCode, 502);
    });

    it('succeeds with a valid session and forwards Cookie + X-Go-CSRF to the NEO call', async () => {
      const handler = loadMiddleware();
      const res = makeRes();
      const body = JSON.stringify({ format: 'html' });
      await handler(
        makeReq('POST', `/api/reports/${NEO_REPORT_ID}/render`, body, validSessionHeaders('POST')),
        res,
        () => { throw new Error('render route did not match'); },
      );
      assert.equal(res.statusCode, 200, `render failed: ${String(res.body).slice(0, 300)}`);
      const call = neoCall();
      assert.ok(call, 'expected a NEO fetch to have been made');
      assert.equal(call.init.headers.Cookie, VALID_SESSION_COOKIE);
      assert.equal(call.init.headers['X-Go-CSRF'], VALID_CSRF);
      assert.equal(call.init.headers.Authorization, undefined, 'must never send a Bearer header anymore');
    });
  });

  describe('GET /api/reports/:id/data', () => {
    it('rejects with 401 and makes no NEO call when no session cookie is present', async () => {
      const handler = loadMiddleware();
      const res = makeRes();
      await handler(makeReq('GET', `/api/reports/${NEO_REPORT_ID}/data`, null, {}), res, () => {
        throw new Error('data route did not match');
      });
      assert.equal(res.statusCode, 401);
      assert.equal(neoCall(), undefined);
    });

    it('succeeds with a valid session and never sends a CSRF header on this safe GET', async () => {
      const handler = loadMiddleware();
      const res = makeRes();
      await handler(
        makeReq('GET', `/api/reports/${NEO_REPORT_ID}/data`, null, validSessionHeaders('GET')),
        res,
        () => { throw new Error('data route did not match'); },
      );
      assert.equal(res.statusCode, 200, `data failed: ${String(res.body).slice(0, 300)}`);
      const call = neoCall();
      assert.ok(call);
      assert.equal(call.init.headers.Cookie, VALID_SESSION_COOKIE);
      assert.equal('X-Go-CSRF' in call.init.headers, false);
    });
  });

  describe('GET /sws/report-selectors/:type', () => {
    it('rejects with 401 and makes no DB query attempt (no selector fetch at all) when no session cookie is present', async () => {
      const handler = loadMiddleware();
      const res = makeRes();
      await handler(makeReq('GET', '/sws/report-selectors/bpartner?q=acme', null, {}), res, () => {
        throw new Error('selector route did not match');
      });
      assert.equal(res.statusCode, 401);
      // No cookie means resolveReportSession rejects BEFORE calling
      // /sws/go/session at all (see report-auth.js) — and by extension no
      // downstream DB query is attempted either.
      assert.equal(sessionFetchCount, 0, 'no cookie must mean no request to Etendo, and no DB query');
    });
  });

  describe('configured Etendo and jsreport base URLs (ETP-5666)', () => {
    const CONFIGURED = 'http://configured-host:8080/etendogoclean';
    const CONFIGURED_JSREPORT = 'http://configured-jsreport:5499';
    const ENV_KEYS = ['ETENDO_URL', 'JSREPORT_URL'];
    let savedEnv;

    beforeEach(() => {
      savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
      ENV_KEYS.forEach((k) => delete process.env[k]);
    });

    afterEach(() => {
      for (const k of ENV_KEYS) {
        if (savedEnv[k] === undefined) delete process.env[k];
        else process.env[k] = savedEnv[k];
      }
    });

    function loadMiddlewareWith(options) {
      let handler;
      reportApiPlugin(options).configureServer({ middlewares: { use: (fn) => { handler = fn; } } });
      return handler;
    }

    it('resolves the session and calls NEO against the etendoUrl option, not process.env', async () => {
      const handler = loadMiddlewareWith({ etendoUrl: CONFIGURED });
      const res = makeRes();
      await handler(
        makeReq('GET', `/api/reports/${NEO_REPORT_ID}/data`, null, validSessionHeaders('GET')),
        res,
        () => { throw new Error('data route did not match'); },
      );
      assert.equal(res.statusCode, 200, `data failed: ${String(res.body).slice(0, 300)}`);
      const sessionCall = fetchCalls.find((c) => c.url.includes('/sws/go/session'));
      assert.ok(sessionCall, 'expected a session resolution call');
      assert.equal(sessionCall.url, `${CONFIGURED}/sws/go/session`);
      assert.ok(neoCall().url.startsWith(`${CONFIGURED}/sws/neo/`), `NEO call went to ${neoCall().url}`);
    });

    it('the selector route resolves the session against the etendoUrl option', async () => {
      const handler = loadMiddlewareWith({ etendoUrl: CONFIGURED });
      const res = makeRes();
      await handler(
        makeReq('GET', '/sws/report-selectors/acctschema?q=', null, validSessionHeaders('GET')),
        res,
        () => { throw new Error('selector route did not match'); },
      );
      const sessionCall = fetchCalls.find((c) => c.url.includes('/sws/go/session'));
      assert.ok(sessionCall, 'expected a session resolution call');
      assert.equal(sessionCall.url, `${CONFIGURED}/sws/go/session`);
    });

    it('the render route posts to the jsreportUrl option and reads currency-format from etendoUrl', async () => {
      const handler = loadMiddlewareWith({ etendoUrl: CONFIGURED, jsreportUrl: CONFIGURED_JSREPORT });
      const res = makeRes();
      await handler(
        makeReq('POST', `/api/reports/${NEO_REPORT_ID}/render`, JSON.stringify({ format: 'pdf' }),
          validSessionHeaders('POST')),
        res,
        () => { throw new Error('render route did not match'); },
      );
      assert.equal(res.statusCode, 200, `render failed: ${String(res.body).slice(0, 300)}`);
      const jsreportCall = fetchCalls.find((c) => c.url.endsWith('/api/report'));
      assert.ok(jsreportCall, 'expected a jsreport render call');
      assert.equal(jsreportCall.url, `${CONFIGURED_JSREPORT}/api/report`);
      const currencyCall = fetchCalls.find((c) => c.url.includes('/sws/neo/currency-format'));
      assert.ok(currencyCall, 'expected a currency-format call (cache reset by the factory)');
      assert.equal(currencyCall.url, `${CONFIGURED}/sws/neo/currency-format`);
    });

    it('still honours a real JSREPORT_URL environment variable when no option is given', async () => {
      process.env.JSREPORT_URL = 'http://env-jsreport:5488';
      const handler = loadMiddlewareWith();
      const res = makeRes();
      await handler(
        makeReq('POST', `/api/reports/${NEO_REPORT_ID}/render`, JSON.stringify({ format: 'pdf' }),
          validSessionHeaders('POST')),
        res,
        () => { throw new Error('render route did not match'); },
      );
      const jsreportCall = fetchCalls.find((c) => c.url.endsWith('/api/report'));
      assert.equal(jsreportCall.url, 'http://env-jsreport:5488/api/report');
    });

    it('falls back to the default context when neither the option nor process.env is set', async () => {
      const handler = loadMiddlewareWith();
      const res = makeRes();
      await handler(
        makeReq('GET', `/api/reports/${NEO_REPORT_ID}/data`, null, validSessionHeaders('GET')),
        res,
        () => { throw new Error('data route did not match'); },
      );
      const sessionCall = fetchCalls.find((c) => c.url.includes('/sws/go/session'));
      assert.equal(sessionCall.url, 'http://localhost:8080/etendo/sws/go/session');
    });

    it('the etendoUrl option wins over a conflicting ETENDO_URL environment variable', async () => {
      process.env.ETENDO_URL = 'http://env-host:8080/etendo-env';
      const handler = loadMiddlewareWith({ etendoUrl: CONFIGURED });
      const res = makeRes();
      await handler(
        makeReq('GET', `/api/reports/${NEO_REPORT_ID}/data`, null, validSessionHeaders('GET')),
        res,
        () => { throw new Error('data route did not match'); },
      );
      assert.equal(res.statusCode, 200, `data failed: ${String(res.body).slice(0, 300)}`);
      const sessionCall = fetchCalls.find((c) => c.url.includes('/sws/go/session'));
      assert.equal(sessionCall.url, `${CONFIGURED}/sws/go/session`);
      assert.ok(neoCall().url.startsWith(`${CONFIGURED}/sws/neo/`), `NEO call went to ${neoCall().url}`);
      assert.ok(
        fetchCalls.every((c) => !c.url.startsWith('http://env-host:8080')),
        `a call went to the env host: ${fetchCalls.map((c) => c.url).join(', ')}`,
      );
    });

    it('the jsreportUrl option wins over a conflicting JSREPORT_URL environment variable', async () => {
      process.env.JSREPORT_URL = 'http://env-jsreport:5488';
      const handler = loadMiddlewareWith({ etendoUrl: CONFIGURED, jsreportUrl: CONFIGURED_JSREPORT });
      const res = makeRes();
      await handler(
        makeReq('POST', `/api/reports/${NEO_REPORT_ID}/render`, JSON.stringify({ format: 'pdf' }),
          validSessionHeaders('POST')),
        res,
        () => { throw new Error('render route did not match'); },
      );
      assert.equal(res.statusCode, 200, `render failed: ${String(res.body).slice(0, 300)}`);
      const jsreportCalls = fetchCalls.filter((c) => c.url.endsWith('/api/report'));
      assert.equal(jsreportCalls.length, 1);
      assert.equal(jsreportCalls[0].url, `${CONFIGURED_JSREPORT}/api/report`);
    });

    // Company logo / document branding: the image is fetched from
    // `${etendoBase}/sws/neo/image/<org_logo_id>` by the shared branding
    // helper, so the observable is that URL. Every branding path opens a pg
    // pool from gradle.properties first — stub both (temp properties file +
    // a fake Pool that answers every query with one logo row).
    describe('company logo / document branding', () => {
      const LOGO_ID = 'LOGO-ID-1';
      const ENV_HOST = 'http://env-host:8080/etendo-env';
      let pgModule;
      let originalPool;
      let savedGradleProps;
      let tmpDir;
      let poolQueries;

      beforeEach(async () => {
        pgModule = await import('pg');
        originalPool = pgModule.default.Pool;
        poolQueries = [];
        pgModule.default.Pool = class FakePool {
          async query(sql) {
            poolQueries.push(sql);
            return { rows: [{ org_logo_id: LOGO_ID }] };
          }

          async end() {}
        };
        tmpDir = mkdtempSync(join(tmpdir(), 'report-api-branding-'));
        const gradlePath = join(tmpDir, 'gradle.properties');
        writeFileSync(gradlePath, 'bbdd.host=fake-db\nbbdd.port=5432\nbbdd.user=u\nbbdd.password=p\nbbdd.sid=fake\n');
        savedGradleProps = process.env.ETENDO_GRADLE_PROPERTIES;
        process.env.ETENDO_GRADLE_PROPERTIES = gradlePath;
        // A conflicting env value proves the branding helper is handed the
        // option, not process.env.
        process.env.ETENDO_URL = ENV_HOST;
      });

      afterEach(() => {
        pgModule.default.Pool = originalPool;
        if (savedGradleProps === undefined) delete process.env.ETENDO_GRADLE_PROPERTIES;
        else process.env.ETENDO_GRADLE_PROPERTIES = savedGradleProps;
        rmSync(tmpDir, { recursive: true, force: true });
      });

      function imageCalls() {
        return fetchCalls.filter((c) => c.url.includes('/sws/neo/image/'));
      }

      async function getData(reportId) {
        const handler = loadMiddlewareWith({ etendoUrl: CONFIGURED });
        const res = makeRes();
        await handler(
          makeReq('GET', `/api/reports/${reportId}/data`, null, validSessionHeaders('GET')),
          res,
          () => { throw new Error('data route did not match'); },
        );
        return res;
      }

      for (const [label, reportId] of [
        ['a NEO-sourced listing report', NEO_REPORT_ID],
        ['a SQL listing report', 'report-order-not-shipped'],
        ['a document report', 'print-sales-order'],
      ]) {
        it(`${label} fetches the company logo from the etendoUrl option`, async () => {
          const res = await getData(reportId);
          assert.equal(res.statusCode, 200, `data failed: ${String(res.body).slice(0, 300)}`);
          assert.ok(poolQueries.length > 0, 'expected the logo lookup to query the (fake) pool');
          const calls = imageCalls();
          assert.equal(calls.length, 1, `image calls: ${calls.map((c) => c.url).join(', ')}`);
          assert.equal(calls[0].url, `${CONFIGURED}/sws/neo/image/${LOGO_ID}`);
          assert.equal(calls[0].init.headers.Cookie, VALID_SESSION_COOKIE);
        });
      }

      it('no branding request goes to process.env.ETENDO_URL or the default base', async () => {
        await getData(NEO_REPORT_ID);
        assert.ok(imageCalls().length > 0, 'expected an image call');
        for (const c of imageCalls()) {
          assert.ok(!c.url.startsWith(ENV_HOST), `image call went to env host: ${c.url}`);
          assert.ok(!c.url.startsWith('http://localhost:8080/etendo/'), `image call went to default: ${c.url}`);
        }
      });
    });
  });

  describe('report-api.js source — wiring', () => {
    it('imports loadReportCli from the gated local-core loader', () => {
      assert.match(PLUGIN_SRC, /import \{ loadReportCli \} from '\.\/report-cli\.js';/);
    });

    it('resolves report-auth.js via loadReportCli, not a static import', () => {
      assert.match(PLUGIN_SRC, /await loadReportCli\('report-auth'\)/);
    });

    it('no longer defines getClientIdFromRequest — the unverified JWT decode is gone', () => {
      assert.doesNotMatch(PLUGIN_SRC, /getClientIdFromRequest/);
    });

    it('no longer reads req.headers.authorization / req.headers[\'authorization\'] for report identity', () => {
      assert.doesNotMatch(PLUGIN_SRC, /req\.headers\.authorization/);
      assert.doesNotMatch(PLUGIN_SRC, /req\.headers\['authorization'\]/);
    });

    it('the selector handler scopes byClient unconditionally — clientId is always resolved by then', () => {
      assert.match(PLUGIN_SRC, /const byClient = \(col\) => `AND \$\{col\} = '\$\{clientId\}'`;/);
      assert.doesNotMatch(PLUGIN_SRC, /byClient = \(col\) => clientId \? /,
        'the old conditional byClient (silently unscoped when clientId was null) must be gone');
    });

    it('never reads process.env.ETENDO_URL outside the plugin factory fallback (ETP-5666)', () => {
      const reads = PLUGIN_SRC.match(/process\.env\.ETENDO_URL/g) || [];
      assert.equal(reads.length, 1, 'only the factory fallback may read process.env.ETENDO_URL');
      assert.doesNotMatch(PLUGIN_SRC, /const ETENDO_URL = process\.env/);
    });

    it('never reads process.env.JSREPORT_URL outside the plugin factory fallback (ETP-5666)', () => {
      const reads = PLUGIN_SRC.match(/process\.env\.JSREPORT_URL/g) || [];
      assert.equal(reads.length, 1, 'only the factory fallback may read process.env.JSREPORT_URL');
      assert.doesNotMatch(PLUGIN_SRC, /const JSREPORT_URL = process\.env/);
    });

    it('the currency selector no longer branches on a possibly-null clientId (session guarantees it)', () => {
      assert.doesNotMatch(PLUGIN_SRC, /fromWhere: clientId\s*\n\s*\?/,
        'currency fromWhere must no longer conditionally branch on clientId');
      assert.doesNotMatch(PLUGIN_SRC, /orderBy: clientId\s*\n\s*\?/,
        'currency orderBy must no longer conditionally branch on clientId');
    });
  });
});
