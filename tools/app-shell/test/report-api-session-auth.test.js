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
 * @covers tools/app-shell/vite.config.js
 * @covers tools/app-shell/.env.production
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

const VITE_CONFIG_PATH = fileURLToPath(new URL('../vite.config.js', import.meta.url));
const ENV_PRODUCTION_SRC = readFileSync(
  fileURLToPath(new URL('../.env.production', import.meta.url)),
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

function stubFetch({ sessionOk = true, sessionStatus = 200, roleOrgs = ['0'] } = {}) {
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
          roleList: [{ id: 'R1', orgList: roleOrgs.map((id) => ({ id })) }],
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

// A report's NEO data call. The access check (ETP-6080) also reads /sws/neo/myreportaccess; that is not one.
function neoCall() {
  return [...fetchCalls].reverse().find((c) => c.url.includes('/sws/neo/') && !c.url.includes('/sws/neo/myreportaccess'));
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

  // ETP-6080: GET /data is gone (it ran report SQL with no params = every
  // org); POST /query is the JSON route, through the shared handleReportQuery.
  describe('POST /api/reports/:id/query', () => {
    it('rejects with 401 and makes no NEO call when no session cookie is present', async () => {
      const handler = loadMiddleware();
      const res = makeRes();
      await handler(makeReq('POST', `/api/reports/${NEO_REPORT_ID}/query`, '{}', {}), res, () => {
        throw new Error('query route did not match');
      });
      assert.equal(res.statusCode, 401);
      assert.equal(neoCall(), undefined);
    });

    it('rejects with 403 without the CSRF header (unsafe POST)', async () => {
      const handler = loadMiddleware();
      const res = makeRes();
      await handler(
        makeReq('POST', `/api/reports/${NEO_REPORT_ID}/query`, '{}', { cookie: VALID_SESSION_COOKIE }),
        res,
        () => { throw new Error('query route did not match'); },
      );
      assert.equal(res.statusCode, 403);
    });

    it('answers 400 QUERY_NOT_SUPPORTED for a NEO report, without calling NEO', async () => {
      const handler = loadMiddleware();
      const res = makeRes();
      await handler(
        makeReq('POST', `/api/reports/${NEO_REPORT_ID}/query`, '{}', validSessionHeaders('POST')),
        res,
        () => { throw new Error('query route did not match'); },
      );
      assert.equal(res.statusCode, 400);
      assert.equal(JSON.parse(res.body).code, 'QUERY_NOT_SUPPORTED');
      assert.equal(neoCall(), undefined);
    });

    it('answers 400 INVALID_BODY for a malformed JSON body', async () => {
      const handler = loadMiddleware();
      const res = makeRes();
      await handler(
        makeReq('POST', `/api/reports/${NEO_REPORT_ID}/query`, '{nope', validSessionHeaders('POST')),
        res,
        () => { throw new Error('query route did not match'); },
      );
      assert.equal(res.statusCode, 400);
      assert.equal(JSON.parse(res.body).code, 'INVALID_BODY');
    });

    it('no longer serves GET /api/reports/:id/data (falls through to next)', async () => {
      const handler = loadMiddleware();
      let fellThrough = false;
      await handler(
        makeReq('GET', `/api/reports/${NEO_REPORT_ID}/data`, null, validSessionHeaders('GET')),
        makeRes(),
        () => { fellThrough = true; },
      );
      assert.equal(fellThrough, true);
      assert.equal(sessionFetchCount, 0);
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
        makeReq('POST', `/api/reports/${NEO_REPORT_ID}/render`, JSON.stringify({ format: 'html' }),
          validSessionHeaders('POST')),
        res,
        () => { throw new Error('render route did not match'); },
      );
      assert.equal(res.statusCode, 200, `render failed: ${String(res.body).slice(0, 300)}`);
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
        makeReq('POST', `/api/reports/${NEO_REPORT_ID}/render`, JSON.stringify({ format: 'html' }),
          validSessionHeaders('POST')),
        res,
        () => { throw new Error('render route did not match'); },
      );
      const sessionCall = fetchCalls.find((c) => c.url.includes('/sws/go/session'));
      assert.equal(sessionCall.url, 'http://localhost:8080/etendo/sws/go/session');
    });

    it('the etendoUrl option wins over a conflicting ETENDO_URL environment variable', async () => {
      process.env.ETENDO_URL = 'http://env-host:8080/etendo-env';
      const handler = loadMiddlewareWith({ etendoUrl: CONFIGURED });
      const res = makeRes();
      await handler(
        makeReq('POST', `/api/reports/${NEO_REPORT_ID}/render`, JSON.stringify({ format: 'html' }),
          validSessionHeaders('POST')),
        res,
        () => { throw new Error('render route did not match'); },
      );
      assert.equal(res.statusCode, 200, `render failed: ${String(res.body).slice(0, 300)}`);
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
          makeReq('POST', `/api/reports/${reportId}/render`, JSON.stringify({ format: 'html' }),
            validSessionHeaders('POST')),
          res,
          () => { throw new Error('render route did not match'); },
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
          assert.equal(res.statusCode, 200, `render failed: ${String(res.body).slice(0, 300)}`);
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

  // ETP-6080: /render runs the same org check as /query, before any report SQL.
  describe('POST /api/reports/:id/render — org check', () => {
    let pgModule;
    let originalPool;
    let savedGradleProps;
    let tmpDir;
    let poolQueries;

    beforeEach(async () => {
      pgModule = await import('pg');
      originalPool = pgModule.default.Pool;
      poolQueries = [];
      // The org check finds nothing: the role reaches no requested org.
      pgModule.default.Pool = class FakePool {
        async query(sql) { poolQueries.push(sql); return { rows: [] }; }

        async end() {}
      };
      tmpDir = mkdtempSync(join(tmpdir(), 'report-api-org-'));
      const gradlePath = join(tmpDir, 'gradle.properties');
      writeFileSync(gradlePath, 'bbdd.host=fake-db\nbbdd.port=5432\nbbdd.user=u\nbbdd.password=p\nbbdd.sid=fake\n');
      savedGradleProps = process.env.ETENDO_GRADLE_PROPERTIES;
      process.env.ETENDO_GRADLE_PROPERTIES = gradlePath;
    });

    afterEach(() => {
      pgModule.default.Pool = originalPool;
      if (savedGradleProps === undefined) delete process.env.ETENDO_GRADLE_PROPERTIES;
      else process.env.ETENDO_GRADLE_PROPERTIES = savedGradleProps;
      rmSync(tmpDir, { recursive: true, force: true });
    });

    async function render(reportId, params) {
      const handler = loadMiddleware();
      const res = makeRes();
      await handler(
        makeReq('POST', `/api/reports/${reportId}/render`, JSON.stringify({ format: 'html', params }),
          validSessionHeaders('POST')),
        res,
        () => { throw new Error('render route did not match'); },
      );
      return res;
    }

    it('answers 403 ORG_ACCESS_DENIED for an org the role cannot read, before any report SQL', async () => {
      globalThis.fetch = originalFetch;
      stubFetch({ roleOrgs: ['O1'] });
      const res = await render('profit-loss', { orgId: 'FOREIGN' });
      assert.equal(res.statusCode, 403, String(res.body).slice(0, 300));
      assert.equal(JSON.parse(res.body).code, 'ORG_ACCESS_DENIED');
      assert.ok(poolQueries.length > 0, 'the org check queried the pool');
      assert.ok(poolQueries.every((q) => q.includes('ad_isorgincluded')), 'report SQL ran after a denied check');
    });

    it('runs no org check for a NEO report (nothing reads __ORGID__ there)', async () => {
      const res = await render(NEO_REPORT_ID, { orgId: 'FOREIGN' });
      assert.equal(res.statusCode, 200, String(res.body).slice(0, 300));
      // The only pool use left is the company-logo lookup.
      assert.ok(poolQueries.every((q) => !q.includes('ad_isorgincluded')), poolQueries.join('\n'));
    });
  });

  describe('report-api.js source — wiring', () => {
    it('resolves the /query route and the org check from the shared core modules (ETP-6080)', () => {
      assert.match(PLUGIN_SRC, /const \{ handleReportQuery, runReportSql \} = await loadReportCli\('report-query'\)/);
      assert.match(PLUGIN_SRC, /assertReportOrgAccess, assertReportAccess \} = await loadReportCli\('report-auth'\)/);
      const render = PLUGIN_SRC.indexOf("path.match(/^\\/api\\/reports\\/([\\w-]+)\\/render$/)");
      assert.ok(render > 0, 'render route not found');
      const check = PLUGIN_SRC.indexOf('await checkRenderOrgAccess(reportId, session, params)', render);
      const fetch = PLUGIN_SRC.indexOf('await fetchReportData(reportId', render);
      assert.ok(check > 0 && check < fetch, 'the org check must run before fetchReportData on /render');
      const access = PLUGIN_SRC.indexOf('await assertReportAccess(session, reportId, { etendoBase: etendoUrl })', render);
      assert.ok(access > 0 && access < check, 'the report access check must run before the org check on /render');
    });

    it('runs the render SQL through core runReportSql, not a copy of it (ETP-6080 W4)', () => {
      assert.match(PLUGIN_SRC, /\{ rows, openingRows, operandRows \} = await runReportSql\(pool, contract, \{[^}]*mainSql: sql/);
      assert.doesNotMatch(PLUGIN_SRC, /applyPlaceholders\(contract\.sql\.(openingQuery|operandsQuery)/);
    });

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

    it('.env.production does not declare JSREPORT_URL — nothing in the build reads it (ETP-5666)', () => {
      assert.doesNotMatch(ENV_PRODUCTION_SRC, /^\s*JSREPORT_URL\s*=/m);
    });

    it('the currency selector no longer branches on a possibly-null clientId (session guarantees it)', () => {
      assert.doesNotMatch(PLUGIN_SRC, /fromWhere: clientId\s*\n\s*\?/,
        'currency fromWhere must no longer conditionally branch on clientId');
      assert.doesNotMatch(PLUGIN_SRC, /orderBy: clientId\s*\n\s*\?/,
        'currency orderBy must no longer conditionally branch on clientId');
    });
  });
});

// ETP-5666 — behavioural guard for the /jsreport proxies: load the real config
// through Vite's own loader (a raw import() fails, the config uses __dirname)
// and read the resolved proxy entries. vite.config.js calls
// loadEnv(mode, process.cwd(), ''), so each load runs with cwd set to an empty
// temp dir: no developer .env/.env.local can leak in, and the result is the
// same on CI and on any machine.
describe('vite.config.js — /jsreport proxy', () => {
  let savedJsreport;
  let savedCwd;
  let emptyEnvDir;

  beforeEach(() => {
    savedJsreport = process.env.JSREPORT_URL;
    savedCwd = process.cwd();
    emptyEnvDir = mkdtempSync(join(tmpdir(), 'vite-env-'));
  });

  afterEach(() => {
    process.chdir(savedCwd);
    rmSync(emptyEnvDir, { recursive: true, force: true });
    if (savedJsreport === undefined) delete process.env.JSREPORT_URL;
    else process.env.JSREPORT_URL = savedJsreport;
  });

  async function loadViteConfig() {
    const { loadConfigFromFile } = await import('vite');
    process.chdir(emptyEnvDir);
    const loaded = await loadConfigFromFile({ mode: 'development', command: 'serve' }, VITE_CONFIG_PATH);
    return loaded.config;
  }

  it('points the dev and preview proxies at a configured JSREPORT_URL, path included', async () => {
    process.env.JSREPORT_URL = 'http://jr.example:9000/svc';
    const config = await loadViteConfig();
    const dev = config.server.proxy['/jsreport'];
    const preview = config.preview.proxy['/jsreport'];
    assert.equal(dev.target, 'http://jr.example:9000/svc');
    assert.equal(preview.target, 'http://jr.example:9000/svc');
    assert.equal(dev.rewrite('/jsreport/api/report'), '/api/report');
    assert.equal(preview.rewrite('/jsreport/api/report'), '/api/report');
  });

  it('falls back to http://localhost:5488 when JSREPORT_URL is set nowhere', async () => {
    delete process.env.JSREPORT_URL;
    const config = await loadViteConfig();
    assert.equal(config.server.proxy['/jsreport'].target, 'http://localhost:5488');
    assert.equal(config.preview.proxy['/jsreport'].target, 'http://localhost:5488');
  });
});

// Source-level guard (the selector's pg Pool is created inline via dynamic import,
// so the SQL cannot be exercised without refactoring the plugin).
describe('report-api.js — warehouse selector org scoping (mirrors ReportSelectorsServlet.buildWarehouseQuery)', () => {
  const start = PLUGIN_SRC.indexOf("if (type === 'warehouse') {");
  const end = PLUGIN_SRC.indexOf("if (type === 'product') {", start);
  const warehouseBlock = PLUGIN_SRC.slice(start, end);
  const warehouseEntry = PLUGIN_SRC.match(/'warehouse':\s*\{[\s\S]*?\n\s{16}\},/)?.[0] ?? '';

  it('locates the warehouse filter block and the warehouse query entry', () => {
    assert.ok(start > -1 && end > start, 'warehouse filter block not found');
    assert.match(warehouseEntry, /m_warehouse/);
  });

  it('never references ad_org_warehouse for the warehouse selector', () => {
    assert.doesNotMatch(warehouseBlock, /ad_org_warehouse/);
    assert.doesNotMatch(warehouseEntry, /ad_org_warehouse/);
  });

  it('adds no org predicate when neither selectedOrgId nor roleOrgIds is given', () => {
    assert.match(warehouseBlock, /if \(selectedOrgId\) \{/);
    assert.match(warehouseBlock, /if \(roleOrgIds\.length > 0\) \{/);
    assert.doesNotMatch(warehouseBlock.replace(/if \(selectedOrgId\) \{[\s\S]*$/, ''), /whereFragments/);
  });

  it('scopes selectedOrgId by the warehouse own org, including System org 0', () => {
    assert.match(
      warehouseBlock,
      /values\.push\(selectedOrgId\);\s*whereFragments\.push\(`AND m_warehouse\.ad_org_id IN \(\$\$\{values\.length\}, '0'\)`\);/,
    );
  });

  it('restricts roleOrgIds with ad_org_id = ANY(array param), independent of selectedOrgId', () => {
    assert.match(
      warehouseBlock,
      /values\.push\(roleOrgIds\);\s*whereFragments\.push\(`AND m_warehouse\.ad_org_id = ANY\(\$\$\{values\.length\}\)`\);/,
    );
    // two separate ifs (both can apply at once), not an else-if chain
    assert.doesNotMatch(warehouseBlock, /else/);
  });
});

// ETP-6080 — the year selector carries each fiscal year's bounds and follows the
// org's (inherited) calendar. Mirrors ReportSelectorsServlet.buildYearQuery.
describe('report-api.js — year selector (mirrors ReportSelectorsServlet.buildYearQuery)', () => {
  const yearEntry = PLUGIN_SRC.match(/'year':\s*\{[\s\S]*?\n\s{16}\},/)?.[0] ?? '';
  const start = PLUGIN_SRC.indexOf("if (type === 'year' && selectedOrgId) {");
  const yearBlock = PLUGIN_SRC.slice(start, PLUGIN_SRC.indexOf('// ETP-5573', start));

  it('selects startDate/endDate as yyyy-MM-dd text from the year periods, camelCase keys', () => {
    assert.match(yearEntry, /to_char\(MIN\(p\.startdate\), 'YYYY-MM-DD'\) FROM c_period p WHERE p\.c_year_id = y\.c_year_id\) AS "startDate"/);
    assert.match(yearEntry, /to_char\(MAX\(p\.enddate\), 'YYYY-MM-DD'\) FROM c_period p WHERE p\.c_year_id = y\.c_year_id\) AS "endDate"/);
  });

  it('scopes selectedOrgId to the calendar of its calendar owner, bound as a parameter', () => {
    assert.ok(start > -1, 'year filter block not found');
    assert.match(yearBlock, /ad_org_getcalendarowner\(\$\$\{values\.length\}\)/);
    assert.doesNotMatch(yearBlock, /o\.c_calendar_id = c\.c_calendar_id AND o\.ad_org_id/);
  });
});

describe('report-api.js — document report tenant client scoping (ETP-6089)', () => {
  it('passes header, lines, and taxes queries through applyPlaceholders with session.clientId', () => {
    const docStart = PLUGIN_SRC.indexOf("if (contract.type === 'document' && contract.sql?.header)");
    assert.ok(docStart >= 0, 'document branch must exist in fetchReportData');
    const docEnd = PLUGIN_SRC.indexOf('\n  // SQL query: either inline in contract', docStart);
    const docBranch = PLUGIN_SRC.slice(docStart, docEnd);

    assert.doesNotMatch(docBranch, /function replacePlaceholders|const replace =/,
      'inline parameter replacement functions must be replaced with applyPlaceholders');
    assert.match(docBranch, /const clientId = session\.clientId;/);
    assert.match(docBranch, /const headerSql = applyPlaceholders\(contract\.sql\.header, \{\s*clientId,\s*params,\s*contract,\s*locale\s*\}\);/);
    assert.match(docBranch, /applyPlaceholders\(contract\.sql\.lines, \{\s*clientId,\s*params,\s*contract,\s*locale\s*\}\)/);
    assert.match(docBranch, /applyPlaceholders\(contract\.sql\.taxes, \{\s*clientId,\s*params,\s*contract,\s*locale\s*\}\)/);
  });

  it('scopes all 8 print-* document report contracts with ad_client_id and validates cross-tenant isolation', async () => {
    const printReports = [
      'print-sales-order',
      'print-sales-invoice',
      'print-sales-quotation',
      'print-purchase-order',
      'print-goods-shipment',
      'print-payment-in',
      'print-return-material-receipt',
      'print-return-to-vendor-shipment',
    ];

    const { loadReportCli } = await import('../vite-plugins/report-cli.js');
    const { applyPlaceholders } = await loadReportCli('report-sql');

    for (const reportId of printReports) {
      const contractPath = join(fileURLToPath(new URL('../../../artifacts', import.meta.url)), reportId, 'report-contract.json');
      const contract = JSON.parse(readFileSync(contractPath, 'utf8'));

      assert.match(contract.sql.header, /AND \w+\.ad_client_id = '__CLIENT_ID__'/);
      assert.match(contract.sql.lines, /AND \w+\.ad_client_id = '__CLIENT_ID__'/);
      if (contract.sql.taxes) {
        assert.match(contract.sql.taxes, /AND \w+\.ad_client_id = '__CLIENT_ID__'/);
      }

      const tenantA = 'CLIENTA123';
      const tenantB = 'CLIENTB456';
      const sqlA = applyPlaceholders(contract.sql.header, { clientId: tenantA, params: { documentId: 'DOC1' } });
      const sqlB = applyPlaceholders(contract.sql.header, { clientId: tenantB, params: { documentId: 'DOC1' } });

      assert.ok(sqlA.includes(`'${tenantA}'`));
      assert.ok(sqlB.includes(`'${tenantB}'`));
      assert.notEqual(sqlA, sqlB);
    }
  });
});
