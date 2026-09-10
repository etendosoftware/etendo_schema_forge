/**
 * ETP-5013 — drill-down affordances (blue + underlined link styling on
 * `.account-link`/`.gl-date-link`/`.entry-link`/`.bp-drilldown-link`/
 * `.doc-link` spans) must only render for the on-screen preview, where the
 * span's `onclick` postMessage actually reaches a listening parent window.
 * PDF/Excel/CSV are static exports — the exact same `onclick` does nothing
 * there, so showing the link style was a false "this is clickable"
 * affordance on a dead control.
 *
 * `report-api.js` now computes `const isInteractive = format === 'html' ||
 * format === 'preview'` and forwards it as `templateData.meta.isInteractive`
 * on BOTH the document branch (print-* reports) and the listing branch,
 * which the 6 affected `template.hbs` files gate their link-styling CSS
 * rule on via `{{#if meta.isInteractive}}`.
 *
 * These tests drive the REAL vite plugin middleware with a stubbed
 * `globalThis.fetch` (same harness as report-api-pdf-chrome-payload.test.js)
 * for the listing branch, and read the source for the document branch —
 * that branch needs a real Postgres connection to reach (see
 * fetchReportData's `contract.type === 'document'` path), which is out of
 * reach for this dev-plugin unit suite (same constraint documented in
 * report-document-branding-partial.test.js).
 *
 * The identical logic lives in the production report server
 * (`schema_forge_core/tools/report-server/server.js`'s `buildTemplateData`),
 * covered by its own `server-is-interactive.test.js`.
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

// NEO-sourced report — keeps this test DB-free (SQL/document branches would
// need a live Postgres connection just to reach the jsreport call).
const REPORT_ID = 'tax-report';

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

function stubFetch() {
  fetchCalls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const urlStr = String(url);
    fetchCalls.push({ url: urlStr });
    if (urlStr.includes('/api/report')) {
      // jsreport response
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/pdf' },
        arrayBuffer: async () => new ArrayBuffer(0),
        text: async () => '',
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

/** Runs a render (format=html by default, locally rendered via Handlebars —
 * no jsreport round trip) and returns the response object. */
async function render(reportId, bodyOverrides = {}) {
  const handler = loadMiddleware();
  const res = makeRes();
  const body = JSON.stringify({ format: 'html', ...bodyOverrides });
  await handler(makeReq('POST', `/api/reports/${reportId}/render`, body), res, () => {
    throw new Error('render route did not match — middleware fell through to next()');
  });
  assert.equal(res.statusCode, 200, `render failed: ${String(res.body).slice(0, 300)}`);
  return res;
}

describe('report-api meta.isInteractive (ETP-5013)', () => {
  beforeEach(() => {
    stubFetch();
    delete process.env.VITE_MOCK;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('format=html (local Handlebars render, no jsreport)', () => {
    it('never calls jsreport for format=html', async () => {
      await render(REPORT_ID, { format: 'html' });
      const jsreportCall = fetchCalls.find(c => c.url.includes('/api/report'));
      assert.equal(jsreportCall, undefined, 'html format must not call jsreport');
    });

    it('renders the interactive link style inline, proving isInteractive was true', async () => {
      const res = await render(REPORT_ID, { format: 'html' });
      // tax-report's .doc-link rule is only emitted when meta.isInteractive is
      // truthy — asserting the color made it into the served HTML proves the
      // flag reached the template, not just that the route didn't crash.
      assert.match(res.body, /\.doc-link\s*\{[^}]*#2563eb/);
    });
  });

  describe('formats that go through jsreport (pdf/xlsx/csv/preview)', () => {
    it('sets isInteractive=false for format=pdf', async () => {
      const handler = loadMiddleware();
      const res = makeRes();
      let capturedBody;
      const originalFetchFn = globalThis.fetch;
      globalThis.fetch = async (url, init) => {
        if (String(url).includes('/api/report')) {
          capturedBody = JSON.parse(init.body);
          return { ok: true, status: 200, headers: { get: () => 'application/pdf' }, arrayBuffer: async () => new ArrayBuffer(0), text: async () => '' };
        }
        return originalFetchFn ? originalFetchFn(url, init) : { ok: true, status: 200, json: async () => ({ response: { data: [], meta: {} } }) };
      };
      await handler(
        makeReq('POST', `/api/reports/${REPORT_ID}/render`, JSON.stringify({ format: 'pdf' })),
        res,
        () => { throw new Error('render route did not match'); },
      );
      assert.equal(res.statusCode, 200, `render failed: ${String(res.body).slice(0, 300)}`);
      assert.ok(capturedBody, 'jsreport payload was never captured');
      assert.equal(capturedBody.data.meta.isInteractive, false);
    });

    it('sets isInteractive=false for format=xlsx', async () => {
      const handler = loadMiddleware();
      const res = makeRes();
      let capturedBody;
      globalThis.fetch = async (url, init) => {
        if (String(url).includes('/api/report')) {
          capturedBody = JSON.parse(init.body);
          return { ok: true, status: 200, headers: { get: () => 'application/vnd.ms-excel' }, arrayBuffer: async () => new ArrayBuffer(0), text: async () => '' };
        }
        return { ok: true, status: 200, json: async () => ({ response: { data: [], meta: {} } }) };
      };
      await handler(
        makeReq('POST', `/api/reports/${REPORT_ID}/render`, JSON.stringify({ format: 'xlsx' })),
        res,
        () => { throw new Error('render route did not match'); },
      );
      assert.equal(res.statusCode, 200, `render failed: ${String(res.body).slice(0, 300)}`);
      assert.ok(capturedBody, 'jsreport payload was never captured');
      assert.equal(capturedBody.data.meta.isInteractive, false);
    });

    it('sets isInteractive=false for format=csv', async () => {
      const handler = loadMiddleware();
      const res = makeRes();
      let capturedBody;
      globalThis.fetch = async (url, init) => {
        if (String(url).includes('/api/report')) {
          capturedBody = JSON.parse(init.body);
          return { ok: true, status: 200, headers: { get: () => 'text/csv' }, arrayBuffer: async () => new ArrayBuffer(0), text: async () => '' };
        }
        return { ok: true, status: 200, json: async () => ({ response: { data: [], meta: {} } }) };
      };
      await handler(
        makeReq('POST', `/api/reports/${REPORT_ID}/render`, JSON.stringify({ format: 'csv' })),
        res,
        () => { throw new Error('render route did not match'); },
      );
      assert.equal(res.statusCode, 200, `render failed: ${String(res.body).slice(0, 300)}`);
      assert.ok(capturedBody, 'jsreport payload was never captured');
      assert.equal(capturedBody.data.meta.isInteractive, false);
    });

    it('sets isInteractive=true for format=preview (embedded iframe preview via jsreport)', async () => {
      const handler = loadMiddleware();
      const res = makeRes();
      let capturedBody;
      globalThis.fetch = async (url, init) => {
        if (String(url).includes('/api/report')) {
          capturedBody = JSON.parse(init.body);
          return { ok: true, status: 200, headers: { get: () => 'text/html' }, arrayBuffer: async () => new ArrayBuffer(0), text: async () => '' };
        }
        return { ok: true, status: 200, json: async () => ({ response: { data: [], meta: {} } }) };
      };
      await handler(
        makeReq('POST', `/api/reports/${REPORT_ID}/render`, JSON.stringify({ format: 'preview' })),
        res,
        () => { throw new Error('render route did not match'); },
      );
      assert.equal(res.statusCode, 200, `render failed: ${String(res.body).slice(0, 300)}`);
      assert.ok(capturedBody, 'jsreport payload was never captured');
      assert.equal(capturedBody.data.meta.isInteractive, true);
    });
  });

  describe('report-api.js source — isInteractive wiring', () => {
    it('derives isInteractive from format === html || format === preview', () => {
      assert.match(PLUGIN_SRC, /const isInteractive = format === 'html' \|\| format === 'preview';/);
    });

    it('forwards isInteractive on the document branch (print-* reports)', () => {
      const docBranch = PLUGIN_SRC.match(/const templateData = documentData\s*\n\s*\? \{[\s\S]*?\}\s*\n\s*: \{/);
      assert.ok(docBranch, 'could not locate the documentData ternary building templateData');
      assert.match(docBranch[0], /isInteractive/);
    });

    it('forwards isInteractive on the listing branch', () => {
      const listingBranch = PLUGIN_SRC.match(/: \{ css, meta: \{[\s\S]*?\}, rows \};/);
      assert.ok(listingBranch, 'could not locate the listing-branch templateData object');
      assert.match(listingBranch[0], /isInteractive/);
    });
  });
});
