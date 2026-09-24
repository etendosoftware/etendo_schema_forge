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
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
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

    it('the currency selector no longer branches on a possibly-null clientId (session guarantees it)', () => {
      assert.doesNotMatch(PLUGIN_SRC, /fromWhere: clientId\s*\n\s*\?/,
        'currency fromWhere must no longer conditionally branch on clientId');
      assert.doesNotMatch(PLUGIN_SRC, /orderBy: clientId\s*\n\s*\?/,
        'currency orderBy must no longer conditionally branch on clientId');
    });
  });
});
