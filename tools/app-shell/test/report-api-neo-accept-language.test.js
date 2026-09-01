/**
 * ETP-5013 — the render's locale must reach the NEO backend as `Accept-Language`.
 *
 * The Tax Report's COUNTRY column rendered in English regardless of the language
 * the report was generated in. Half of that was a missing translation join on the
 * Java side; the other half was here: the report engines sent ONLY `Content-Type`
 * and `Authorization` on the NEO fetch, so the backend had no idea which language
 * the render was for and fell back to the Etendo *user's* `default_ad_language`.
 * The same report therefore came out in Spanish for one user and English for
 * another (verified against the real DB: `GOAdmin` is es_ES, `GOuser` is en_US).
 *
 * These tests drive the REAL vite plugin middleware — the same `/render` and
 * `/data` routes the browser hits — with a stubbed `globalThis.fetch`, and
 * inspect the headers object the NEO call actually received. No DB and no
 * jsreport are involved: `format: 'html'` renders locally through Handlebars,
 * and every NEO-source report short-circuits before the Postgres branch.
 *
 * The identical change lives in the production report server
 * (`schema_forge_core/tools/report-server/server.js`) with its own mirrored test
 * file — the two engines are hand-maintained copies by design, and a header sent
 * only by the dev plugin would translate reports on developer machines while
 * silently leaving every deployed server rendering the wrong language.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import reportApiPlugin from '../vite-plugins/report-api.js';

const PLUGIN_SRC = readFileSync(
  fileURLToPath(new URL('../vite-plugins/report-api.js', import.meta.url)),
  'utf8',
);
const ARTIFACTS_DIR = resolve(fileURLToPath(new URL('../../../artifacts', import.meta.url)));

// Every report whose data comes from NEO — i.e. every report that goes through
// the header-building code under test. Kept explicit (rather than globbed) so
// that a new NEO report silently skipping this coverage shows up as a failure
// of the "list is complete" test below.
const NEO_REPORTS = [
  'tax-report',
  'aging-payable',
  'aging-receivable',
  'inventory-stock-report',
  'financial-accounts-page',
];

// --- Middleware harness -----------------------------------------------------

function loadMiddleware() {
  let handler;
  reportApiPlugin().configureServer({ middlewares: { use: (fn) => { handler = fn; } } });
  return handler;
}

function makeReq(method, url, body) {
  const req = Readable.from(body ? [body] : []);
  req.method = method;
  req.url = url;
  req.headers = { authorization: 'Bearer test-token' };
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

let fetchCalls;
let originalFetch;

/** Last NEO call recorded — `find` would return a previous iteration's call. */
function lastNeoCall() {
  return [...fetchCalls].reverse().find(c => c.url.includes('/sws/neo/'));
}

function stubFetch() {
  fetchCalls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      json: async () => ({ response: { data: [], meta: {} } }),
      text: async () => '',
    };
  };
}

/** Runs a render and returns the headers the NEO fetch received. */
async function renderAndCaptureNeoHeaders(reportId, bodyOverrides = {}) {
  const handler = loadMiddleware();
  const res = makeRes();
  const body = JSON.stringify({ format: 'html', ...bodyOverrides });
  await handler(makeReq('POST', `/api/reports/${reportId}/render`, body), res, () => {
    throw new Error('render route did not match — middleware fell through to next()');
  });
  assert.equal(res.statusCode, 200, `render failed: ${String(res.body).slice(0, 300)}`);
  const neoCall = lastNeoCall();
  assert.ok(neoCall, `no NEO fetch was made for '${reportId}'`);
  return neoCall.init.headers;
}

describe('report-api NEO fetch — Accept-Language (ETP-5013)', () => {
  beforeEach(() => {
    stubFetch();
    delete process.env.VITE_MOCK;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('locale forwarding', () => {
    for (const reportId of NEO_REPORTS) {
      it(`sends the render locale as Accept-Language for '${reportId}'`, async () => {
        const headers = await renderAndCaptureNeoHeaders(reportId, { locale: 'es_ES' });
        assert.equal(headers['Accept-Language'], 'es_ES');
      });
    }

    it('forwards whatever locale the render was requested in, not a fixed one', async () => {
      // The bug was not "always English" — it was "always the *user's* language".
      // Both directions must therefore be provably driven by the request body.
      for (const locale of ['es_ES', 'en_US', 'fr_FR']) {
        const headers = await renderAndCaptureNeoHeaders('tax-report', { locale });
        assert.equal(headers['Accept-Language'], locale);
      }
    });

    it("falls back to the route's en_US body default when locale is omitted", async () => {
      // The /render route destructures `locale = 'en_US'`, so an omitted locale
      // still yields an explicit, well-formed header rather than nothing.
      const headers = await renderAndCaptureNeoHeaders('tax-report');
      assert.equal(headers['Accept-Language'], 'en_US');
    });
  });

  describe('absent locale', () => {
    it('omits the Accept-Language KEY entirely on the /data route', async () => {
      // /data is a raw-data endpoint with no render/locale concept, so it calls
      // fetchReportData WITHOUT a locale — which is exactly the code path the
      // conditional spread protects. The key must be ABSENT, not present-and-
      // undefined: `{ 'Accept-Language': undefined }` serializes to the literal
      // string "undefined" over the wire, which the backend would then try to
      // parse as a language code.
      const handler = loadMiddleware();
      const res = makeRes();
      await handler(makeReq('GET', '/api/reports/tax-report/data'), res, () => {
        throw new Error('data route did not match');
      });
      const neoCall = lastNeoCall();
      assert.ok(neoCall, 'no NEO fetch was made');
      const headers = neoCall.init.headers;
      assert.equal('Accept-Language' in headers, false,
        `Accept-Language must not be present at all, got: ${JSON.stringify(headers)}`);
      assert.equal(Object.keys(headers).includes('Accept-Language'), false);
    });

    it('omits the Accept-Language KEY when the render locale is an empty string', async () => {
      const headers = await renderAndCaptureNeoHeaders('tax-report', { locale: '' });
      assert.equal('Accept-Language' in headers, false,
        `Accept-Language must not be present at all, got: ${JSON.stringify(headers)}`);
    });
  });

  describe('pre-existing headers (regression guard)', () => {
    it('still sends Content-Type and Authorization alongside Accept-Language', async () => {
      const headers = await renderAndCaptureNeoHeaders('tax-report', { locale: 'es_ES' });
      assert.equal(headers['Content-Type'], 'application/json');
      assert.equal(headers.Authorization, 'Bearer test-token');
      assert.equal(headers['Accept-Language'], 'es_ES');
    });

    it('still sends Content-Type and Authorization when no locale is supplied', async () => {
      const handler = loadMiddleware();
      const res = makeRes();
      await handler(makeReq('GET', '/api/reports/tax-report/data'), res, () => {});
      const headers = lastNeoCall().init.headers;
      assert.equal(headers['Content-Type'], 'application/json');
      assert.equal(headers.Authorization, 'Bearer test-token');
    });
  });

  describe('blast radius', () => {
    it('lists every NEO-source report, so a new one cannot skip this coverage', () => {
      const found = [];
      for (const dir of readdirSync(ARTIFACTS_DIR, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        const contractPath = join(ARTIFACTS_DIR, dir.name, 'report-contract.json');
        if (!existsSync(contractPath)) continue;
        const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
        if (contract.neo?.endpoint) found.push(dir.name);
      }
      assert.deepEqual(found.sort(), [...NEO_REPORTS].sort());
    });

    it('leaves SQL-source reports untouched — they never reach the NEO branch', () => {
      // The header lives inside `if (contract.neo?.endpoint)`. A report without
      // that key cannot reach it, so no DB round-trip is needed to prove it.
      for (const reportId of ['report-journal-entries', 'report-general-ledger', 'report-trial-balance']) {
        const contractPath = join(ARTIFACTS_DIR, reportId, 'report-contract.json');
        assert.ok(existsSync(contractPath), `missing contract for ${reportId}`);
        const contract = JSON.parse(readFileSync(contractPath, 'utf8'));
        assert.equal(contract.neo?.endpoint, undefined,
          `${reportId} unexpectedly became a NEO report — add it to NEO_REPORTS`);
      }
    });
  });

  describe('report-api.js source', () => {
    it('builds the header with a conditional spread, never an unconditional key', () => {
      assert.match(PLUGIN_SRC, /\.\.\.\(locale \? \{ 'Accept-Language': locale \} : \{\}\)/);
      assert.doesNotMatch(PLUGIN_SRC, /^\s*'Accept-Language':\s*locale,\s*$/m,
        "an unconditional key would send 'Accept-Language: undefined' when no locale is set");
    });

    it('accepts locale in fetchReportData\'s options', () => {
      assert.match(PLUGIN_SRC, /async function fetchReportData\(reportId, \{[^)]*locale[^)]*\}/);
    });

    it('threads locale into fetchReportData at the /render call site', () => {
      // The piece most likely to be silently dropped in a refactor: the header
      // code would still look correct while receiving `undefined` forever.
      assert.match(PLUGIN_SRC,
        /fetchReportData\(reportId, \{ limit, authToken, params, locale \}\)/);
    });

    it('deliberately does NOT pass a locale at the /data call site', () => {
      // /data has no render/locale concept; the asymmetry is intentional and is
      // what keeps the "absent key" branch alive in production, not just in tests.
      assert.match(PLUGIN_SRC, /fetchReportData\(reportId, \{ limit, authToken \}\)/);
    });
  });
});
