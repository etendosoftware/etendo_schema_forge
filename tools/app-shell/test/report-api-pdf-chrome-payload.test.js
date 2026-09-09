/**
 * ETP-5013 — every PDF gets page numbers via jsreport's `chrome-pdf` recipe.
 *
 * `payload.template.chrome` grew `displayHeaderFooter`/`headerTemplate`/
 * `footerTemplate` and `marginBottom` was bumped 10mm -> 14mm to leave room for
 * the new footer. This is Puppeteer-level config forwarded verbatim to Chrome's
 * `page.pdf()` — nothing here is Handlebars, so a template-level test cannot
 * catch a regression in this block; only the actual request sent to jsreport
 * can.
 *
 * These tests drive the REAL vite plugin middleware (`format: 'pdf'`) with a
 * stubbed `globalThis.fetch` that answers BOTH the NEO data call and the
 * jsreport `/api/report` call, and inspect the payload the jsreport call
 * actually received.
 *
 * The identical change lives in the production report server
 * (`schema_forge_core/tools/report-server/server.js`) and the standalone debug
 * CLI (`schema_forge_core/cli/src/report-render.js`), each with their own
 * mirrored coverage — see `docs/repo-topology.md`. The three are hand-
 * maintained copies by design; a page-number footer added only to the dev
 * plugin would show up locally while every deployed PDF stayed footer-less.
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

// A NEO-source report keeps this test DB-free — the SQL branch would need a
// live Postgres connection just to reach the jsreport call.
const REPORT_ID = 'tax-report';

// --- Middleware harness (mirrors report-api-neo-accept-language.test.js) ---

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
  globalThis.fetch = async (url, init) => {
    const urlStr = String(url);
    fetchCalls.push({ url: urlStr, init });
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

/** Runs a PDF render and returns the payload sent to jsreport. */
async function renderPdfAndCaptureJsreportPayload(reportId, bodyOverrides = {}) {
  const handler = loadMiddleware();
  const res = makeRes();
  const body = JSON.stringify({ format: 'pdf', ...bodyOverrides });
  await handler(makeReq('POST', `/api/reports/${reportId}/render`, body), res, () => {
    throw new Error('render route did not match — middleware fell through to next()');
  });
  assert.equal(res.statusCode, 200, `render failed: ${String(res.body).slice(0, 300)}`);
  const jsreportCall = fetchCalls.find(c => c.url.includes('/api/report'));
  assert.ok(jsreportCall, `no jsreport fetch was made for '${reportId}'`);
  return JSON.parse(jsreportCall.init.body);
}

describe('report-api PDF payload — page-number footer (ETP-5013)', () => {
  beforeEach(() => {
    stubFetch();
    delete process.env.VITE_MOCK;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('requests the chrome-pdf recipe for format=pdf', async () => {
    const payload = await renderPdfAndCaptureJsreportPayload(REPORT_ID);
    assert.equal(payload.template.recipe, 'chrome-pdf');
  });

  it('enables the Chrome header/footer and injects the Printed-on/Page footer (en_US)', async () => {
    const payload = await renderPdfAndCaptureJsreportPayload(REPORT_ID);
    const chrome = payload.template.chrome;
    assert.ok(chrome, 'payload.template.chrome is missing for a chrome-pdf recipe');
    assert.equal(chrome.displayHeaderFooter, true);
    assert.equal(chrome.headerTemplate, '<span></span>');
    assert.match(chrome.footerTemplate, /Printed on \d{2}\/\d{2}\/\d{4}/, 'left side must show "Printed on DD/MM/YYYY"');
    assert.match(chrome.footerTemplate, /Page <span class="pageNumber"><\/span>/, 'right side must show "Page" + live pageNumber, no total');
    assert.doesNotMatch(chrome.footerTemplate, /totalPages/, 'Classic never shows a page total — neither should we (ETP-5013)');
  });

  it('translates the footer to es_ES via the locale param', async () => {
    const payload = await renderPdfAndCaptureJsreportPayload(REPORT_ID, { locale: 'es_ES' });
    const footer = payload.template.chrome.footerTemplate;
    assert.match(footer, /Impreso el \d{2}\/\d{2}\/\d{4}/);
    assert.match(footer, /Página <span class="pageNumber"><\/span>/);
    assert.doesNotMatch(footer, /totalPages/);
  });

  it('leaves the header empty so Chrome does not fall back to its default header', async () => {
    const payload = await renderPdfAndCaptureJsreportPayload(REPORT_ID);
    assert.equal(payload.template.chrome.headerTemplate, '<span></span>');
  });

  it('bumps marginBottom to 14mm to leave room for the footer', async () => {
    const payload = await renderPdfAndCaptureJsreportPayload(REPORT_ID);
    assert.equal(payload.template.chrome.marginBottom, '14mm');
  });

  it('leaves the other Chrome margins and format untouched', async () => {
    const payload = await renderPdfAndCaptureJsreportPayload(REPORT_ID);
    const chrome = payload.template.chrome;
    assert.equal(chrome.format, 'A4');
    assert.equal(chrome.marginTop, '10mm');
    assert.equal(chrome.marginLeft, '10mm');
    assert.equal(chrome.marginRight, '10mm');
  });

  it('respects landscape orientation alongside the new footer', async () => {
    const payload = await renderPdfAndCaptureJsreportPayload(REPORT_ID, { params: { showLandscape: 'true' } });
    assert.equal(payload.template.chrome.landscape, true);
    assert.equal(payload.template.chrome.displayHeaderFooter, true);
  });

  it('never sets payload.template.chrome for a non-PDF format (html)', async () => {
    const handler = loadMiddleware();
    const res = makeRes();
    await handler(
      makeReq('POST', `/api/reports/${REPORT_ID}/render`, JSON.stringify({ format: 'html' })),
      res,
      () => { throw new Error('render route did not match'); },
    );
    assert.equal(res.statusCode, 200, `render failed: ${String(res.body).slice(0, 300)}`);
    // format: 'html' renders locally through Handlebars and never calls jsreport at all.
    const jsreportCall = fetchCalls.find(c => c.url.includes('/api/report'));
    assert.equal(jsreportCall, undefined, 'html format must not call jsreport');
  });

  describe('report-api.js source', () => {
    it('sets marginBottom to 14mm inside the chrome-pdf block', () => {
      const chromeBlock = PLUGIN_SRC.match(/if \(recipe === 'chrome-pdf'\) \{[\s\S]*?\n\s*\}\n/);
      assert.ok(chromeBlock, 'could not locate the chrome-pdf block');
      assert.match(chromeBlock[0], /marginBottom: '14mm'/);
      assert.match(chromeBlock[0], /displayHeaderFooter: true/);
      assert.match(chromeBlock[0], /headerTemplate: '<span><\/span>'/);
      assert.match(chromeBlock[0], /ui\.printedOn/);
      assert.match(chromeBlock[0], /ui\.page/);
      assert.match(chromeBlock[0], /class="pageNumber"/);
      assert.doesNotMatch(chromeBlock[0], /totalPages/);
    });
  });
});
