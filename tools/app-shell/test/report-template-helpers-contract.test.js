import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import { registerReportHelpers } from '../../../templates/reports/helpers/report-html-helpers.js';

// ETP-4908: the server render path (both the local HTML preview and the
// jsreport PDF/XLSX payload built by report-api.js) registers ONLY the
// canonical whitelist from `registerReportHelpers()` — it never executes a
// per-artifact `helpers.js` (a deliberate post-ETP-4083 security decision).
// A template that invokes ANY helper outside that whitelist compiles fine
// but throws `Missing helper: "<name>"` at render time in production. That
// exact bug shipped as `{{qrCode header}}` in the print-* templates (see
// report-qr.test.js for the qrCode-specific regression coverage); this file
// guards the GENERAL invariant for every report template, not just qrCode.

const ARTIFACTS_DIR = fileURLToPath(new URL('../../../artifacts', import.meta.url));
const REPORT_TEMPLATES_DIR = fileURLToPath(new URL('../../../templates/reports', import.meta.url));
const REPORT_API_PLUGIN = fileURLToPath(
  new URL('../vite-plugins/report-api.js', import.meta.url)
);

/**
 * Recursively find every `template.hbs` under artifacts/ (reports live at
 * varying depths, e.g. artifacts/print-sales-invoice/template.hbs vs.
 * artifacts/business-partner/reports/listing/template.hbs).
 */
function findTemplates(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTemplates(full));
    } else if (entry.name === 'template.hbs') {
      results.push(full);
    }
  }
  return results;
}

// Handlebars built-ins that are never resolved through registerHelper() and
// therefore must never be checked against the canonical whitelist.
const HANDLEBARS_BUILTINS = new Set(['if', 'unless', 'each', 'with', 'lookup', 'log']);

/**
 * Collect the names of every helper a template AST actually invokes — i.e.
 * every MustacheStatement/BlockStatement/SubExpression whose path carries
 * params and/or a hash, or that is a block (`{{#name ...}}`). A bare
 * `{{header.org_name}}` mustache (no params) is a plain data path and is
 * intentionally NOT collected — that ambiguity is exactly why zero-arg
 * mustaches are excluded rather than guessed at.
 */
function collectHelperNames(source) {
  const names = new Set();
  walkProgram(Handlebars.parse(source), names);
  return names;
}

function walkProgram(program, names) {
  if (!program || !Array.isArray(program.body)) return;
  for (const node of program.body) {
    if (node.type === 'MustacheStatement' || node.type === 'BlockStatement') {
      collectFromCallNode(node, names);
      if (node.program) walkProgram(node.program, names);
      if (node.inverse) walkProgram(node.inverse, names);
    }
  }
}

function collectFromCallNode(node, names) {
  const hasArgs = (node.params && node.params.length > 0)
    || (node.hash && node.hash.pairs && node.hash.pairs.length > 0);
  const isBlock = node.type === 'BlockStatement';
  if ((hasArgs || isBlock) && node.path && node.path.type === 'PathExpression') {
    const name = node.path.original;
    if (!HANDLEBARS_BUILTINS.has(name)) names.add(name);
  }
  for (const param of node.params || []) collectFromExpression(param, names);
  if (node.hash) {
    for (const pair of node.hash.pairs || []) collectFromExpression(pair.value, names);
  }
}

function collectFromExpression(node, names) {
  if (node && node.type === 'SubExpression') collectFromCallNode(node, names);
}

/**
 * The set of helper names the server render path actually registers —
 * derived by registering onto a fresh instance and reading the result back,
 * so this test tracks the real whitelist instead of a hand-copied list that
 * could drift from report-html-helpers.js.
 */
function canonicalRegisteredHelperNames() {
  const hb = Handlebars.create();
  registerReportHelpers(hb);
  return new Set(Object.keys(hb.helpers));
}

function expandDocumentPartials(source) {
  const branding = readFileSync(join(REPORT_TEMPLATES_DIR, 'document-branding.hbs'), 'utf8');
  return source.replace(/\{\{>\s*document-branding\s*\}\}/g, branding);
}

describe('report template ↔ server helper whitelist contract', () => {
  const templatePaths = findTemplates(ARTIFACTS_DIR);
  const registeredNames = canonicalRegisteredHelperNames();

  it('finds report templates to check', () => {
    assert.ok(templatePaths.length > 0, 'expected to find at least one template.hbs under artifacts/');
  });

  for (const templatePath of templatePaths) {
    const relPath = templatePath.slice(ARTIFACTS_DIR.length + 1);

    it(`${relPath} only invokes helpers the server render path registers`, () => {
      const source = readFileSync(templatePath, 'utf8');
      const invoked = collectHelperNames(source);
      const unregistered = [...invoked].filter((name) => !registeredNames.has(name));
      assert.deepEqual(
        unregistered,
        [],
        `template ${relPath} invokes helper(s) [${unregistered.join(', ')}] which the server ` +
          `render path does not register — use a data field or add it to the canonical whitelist ` +
          `(templates/reports/helpers/report-html-helpers.js)`
      );
    });
  }
});

describe('helpers.js hygiene — no dynamic code execution on the server path', () => {
  const helpersPaths = [];
  (function findHelpers(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) findHelpers(full);
      else if (entry.name === 'helpers.js') helpersPaths.push(full);
    }
  })(ARTIFACTS_DIR);

  it('finds helpers.js artifacts to check', () => {
    assert.ok(helpersPaths.length > 0, 'expected to find at least one helpers.js under artifacts/');
  });

  for (const helpersPath of helpersPaths) {
    const relPath = helpersPath.slice(ARTIFACTS_DIR.length + 1);

    it(`${relPath} never calls require() or uses an import statement`, () => {
      const src = readFileSync(helpersPath, 'utf8');
      // Never executed on the server render path — only read for
      // formatNumber decimal-precision extraction (extractNumberFormatOptions)
      // and for extracting report-specific extra helper functions as source
      // text (buildJsreportHelpersString). A require()/import inside it can
      // never run and previously produced `require is not defined` at runtime.
      assert.doesNotMatch(
        src,
        /\brequire\s*\(/,
        `${relPath} calls require() — this file is never executed on the server render path`
      );
      assert.doesNotMatch(
        src,
        /^[ \t]*import\s/m,
        `${relPath} uses an import statement — this file is never executed on the server render path`
      );
    });
  }
});

describe('document print templates — strict render smoke (canonical helpers only)', () => {
  const printDirs = readdirSync(ARTIFACTS_DIR).filter((d) => d.startsWith('print-'));

  // Minimal, shared synthetic fixture covering the fields the print-*
  // templates reference (header/lines/taxes) — built from inspecting
  // print-sales-invoice/template.hbs, the richest of the set. Handlebars
  // silently renders missing DATA fields as empty strings, so this fixture
  // only needs to exercise every code path (each/if/ifCond branches),
  // not every literal field name — the failure mode this test guards
  // against is a missing HELPER, which throws regardless of data shape.
  const header = {
    doc_type: 'AR Invoice',
    documentno: 'INV-1001',
    dateinvoiced: '2026-08-10',
    bp_name: 'ACME Corp',
    bp_location: 'Main Office',
    grandtotal: '1210.00',
    totallines: '1000.00',
    currency: 'EUR',
    org_name: 'My Company',
    org_taxid: 'B12345678',
    org_address: 'Main St 1',
    org_city: 'Madrid',
    org_postal: '28001',
    payment_term: 'Net 30',
    payment_method: 'Wire Transfer',
    delivery_term: 'FOB',
    poreference: 'PO-1',
    description: 'Sample notes',
    status: 'CO',
    reference_doc: 'REF-1',
    qrDataUrl: 'data:image/png;base64,FAKE',
  };
  const lines = [
    {
      line: 1,
      product_name: 'Widget',
      quantity: 2,
      uom: 'EA',
      priceactual: '10.00',
      linenetamt: '20.00',
      tax_name: 'VAT',
      doc_type: 'Shipment',
    },
  ];
  const taxes = [{ tax_name: 'VAT', taxamt: '2.10' }];
  const meta = { title: 'Test Document', generatedAt: new Date().toISOString(), filters: [], params: {} };

  for (const dir of printDirs) {
    it(`renders ${dir}/template.hbs without throwing (registerReportHelpers only)`, () => {
      const templatePath = join(ARTIFACTS_DIR, dir, 'template.hbs');
      const helpersPath = join(ARTIFACTS_DIR, dir, 'helpers.js');
      const templateContent = expandDocumentPartials(readFileSync(templatePath, 'utf8'));
      const helpersCode = existsSync(helpersPath) ? readFileSync(helpersPath, 'utf8') : '';

      const hb = Handlebars.create();
      registerReportHelpers(hb, helpersCode);

      let html;
      assert.doesNotThrow(() => {
        html = hb.compile(templateContent)({
          css: '', meta, header: { ...header, companyLogoDataUrl: 'data:image/png;base64,FAKE' }, lines, taxes,
        });
      });
      assert.ok(!html.includes('Missing helper'), `${dir}/template.hbs rendered a "Missing helper" fallback`);
      assert.match(html, /class="document-brand-logo"/, `${dir}/template.hbs must render the shared document branding partial`);
    });
  }
});

describe('report-api.js dev/prod parity — no divergent helper registration', () => {
  const pluginSrc = readFileSync(REPORT_API_PLUGIN, 'utf8');
  const canonicalNames = canonicalRegisteredHelperNames();

  it('registers helpers only via registerReportHelpers()/buildJsreportHelpersString(), never ad hoc', () => {
    // Any `registerHelper('name', ...)` call with a quoted literal name is a
    // dev-only hack that can register something the production jsreport
    // helper string / server HTML path does not — the exact pattern that hid
    // the qrCode gap in dev while it broke in production (ETP-4908).
    const adHocCalls = [...pluginSrc.matchAll(/registerHelper\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const outsideCanonical = adHocCalls.filter((name) => !canonicalNames.has(name));
    assert.deepEqual(
      outsideCanonical,
      [],
      `report-api.js calls registerHelper() with name(s) [${outsideCanonical.join(', ')}] outside the ` +
        `canonical whitelist — this diverges dev rendering from the server, hiding a production gap`
    );
  });

  it('imports registerReportHelpers from the canonical shared module', () => {
    assert.match(
      pluginSrc,
      /import\s*\{[^}]*registerReportHelpers[^}]*\}\s*from\s*['"][^'"]*report-html-helpers\.js['"]/,
      'report-api.js must register HTML helpers through the canonical report-html-helpers.js module'
    );
  });
});
