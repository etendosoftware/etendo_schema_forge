// @covers templates/reports/helpers/report-html-helpers.js
// @covers templates/reports/helpers/parity.json
// @covers tools/app-shell/vite-plugins/report-api.js
// @covers scripts/sync-report-helpers.mjs
// @covers scripts/assemble-report-server-context.sh
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';
import { registerReportHelpers, buildJsreportHelpersString } from '../../../templates/reports/helpers/report-html-helpers.js';
import {
  REPO_ROOT,
  HELPERS_DIR,
  HELPER_MODULES,
  PARITY_FILE,
  MIRROR_REPO,
  canonicalDigest,
  buildManifest,
  serializeManifest,
  compareWithManifest,
  toMirrorSource,
} from '../../../scripts/sync-report-helpers.mjs';

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
 * Recursively find every report template under artifacts/ (reports live at
 * varying depths, e.g. artifacts/print-sales-invoice/template.hbs vs.
 * artifacts/business-partner/reports/listing/template.hbs) — the HTML/PDF
 * `template.hbs` AND the per-format `template-<format>.hbs` (Excel, CSV, ...).
 * A missing helper in an export template breaks that export only, where
 * nobody looks — so they are checked too (ETP-5663).
 */
function findTemplates(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTemplates(full));
    } else if (/^template(-[\w-]+)?\.hbs$/.test(entry.name)) {
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

/**
 * The helper names jsreport registers for one report: the canonical source
 * set plus the report-specific top-level functions of its helpers.js, read
 * back from the very string both render paths send (report-api.js and the
 * report-server's server.js). Per-format export templates (template-excel.hbs,
 * template-csv.hbs) are rendered ONLY by jsreport, so this is their whitelist.
 * template.hbs is also rendered as server-side HTML, which registers the
 * canonical set alone — it keeps the stricter canonical-only check.
 */
function jsreportRegisteredHelperNames(templatePath) {
  const helpersPath = join(dirname(templatePath), 'helpers.js');
  const helpersCode = existsSync(helpersPath) ? readFileSync(helpersPath, 'utf8') : '';
  return new Set(
    [...buildJsreportHelpersString(helpersCode).matchAll(/^function\s+(\w+)\s*\(/gm)].map((m) => m[1])
  );
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
      const allowed = basename(templatePath) === 'template.hbs'
        ? registeredNames
        : jsreportRegisteredHelperNames(templatePath);
      const unregistered = [...invoked].filter((name) => !allowed.has(name));
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

// ─────────────────────────────────────────────────────────────────────────────
// ETP-4910 — the report helper modules are duplicated across the two repos.
//
// `templates/` is not part of any published package, so
// `templates/reports/helpers/*.js` exists as one physical copy per repo:
//
//   * THIS repo — canonical. It is the copy the assembled report-server image
//     ends up carrying (`scripts/assemble-report-server-context.sh` copies this
//     repo's `templates/` last, on purpose) and the one the browser bundle imports.
//   * `schema_forge_core` — a mirror, used when report-server is run from a core
//     checkout (core dev, core tests).
//
// They drifted silently once already: ETP-4908 synced them, then ETP-5107 added
// the HALF_UP rounding to the canonical copy only, so the mirror kept rendering
// half-cent amounts one cent lower for ~2.5 months (ETP-4910).
//
// The contract is `templates/reports/helpers/parity.json`, committed with
// identical bytes in both repos and regenerated ONLY by `make sync-report-helpers`:
// one canonical sha256 per module, plus the one import line the copies are allowed
// to differ in. Two layers here:
//
//   1. this repo's own copy against the manifest (also runs in CI, where no sibling
//      checkout exists) — an edit that is not synced fails here;
//   2. the sibling core checkout, when present, against the SAME canonical digest —
//      the layer that catches a sync committed in only one of the two repos.
// ─────────────────────────────────────────────────────────────────────────────

const PARITY_MANIFEST = JSON.parse(
  readFileSync(join(REPO_ROOT, HELPERS_DIR, PARITY_FILE), 'utf8'),
);

/**
 * The sibling `schema_forge_core` checkout, or null when it is not there (a
 * functional-only developer's machine, or CI). `SF_CORE_DIR`/`CORE_DIR` win when
 * set, so a checkout kept elsewhere is still verified instead of silently skipped.
 */
function coreCheckoutDir() {
  const candidates = [
    process.env.SF_CORE_DIR,
    process.env.CORE_DIR,
    join(REPO_ROOT, '..', MIRROR_REPO),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (existsSync(join(dir, 'templates', 'reports', 'helpers', 'report-html-helpers.js'))) return dir;
  }
  return null;
}

describe('report helper modules — cross-repo parity contract (ETP-4910)', () => {
  it('the manifest is exactly what scripts/sync-report-helpers.mjs generates now', () => {
    // A hand-edited manifest (e.g. a digest relaxed to match a drifted copy) fails
    // here: the only way to move it is to run `make sync-report-helpers`, which
    // rewrites the mirrored copy too.
    const onDisk = readFileSync(join(REPO_ROOT, HELPERS_DIR, PARITY_FILE), 'utf8');
    assert.equal(onDisk, serializeManifest(buildManifest()));
  });

  for (const moduleName of HELPER_MODULES) {
    it(`${moduleName} matches the canonical digest in parity.json`, () => {
      const text = readFileSync(join(REPO_ROOT, HELPERS_DIR, moduleName), 'utf8');
      assert.equal(
        canonicalDigest(text),
        PARITY_MANIFEST.sha256[moduleName],
        `${moduleName} changed without a sync. Run \`make sync-report-helpers\` and commit the ` +
        'mirrored copy in schema_forge_core as well.',
      );
    });
  }

  it('the canonical helper module imports report-i18n from the published CLI package', () => {
    const text = readFileSync(join(REPO_ROOT, HELPERS_DIR, 'report-html-helpers.js'), 'utf8');
    assert.ok(text.includes(PARITY_MANIFEST.importLine.schema_forge));
    // A copy carrying the mirror's relative specifier would break the browser
    // bundle and the assembly (this repo has no `cli/src`).
    assert.ok(!text.includes(PARITY_MANIFEST.importLine.schema_forge_core));
  });

  it('the sibling schema_forge_core checkout, when present, is in parity too', (t) => {
    const coreDir = coreCheckoutDir();
    if (!coreDir) {
      // Not a silent skip: say which paths were probed, so a checkout that DOES
      // exist at the standard workspace path is never passed over unnoticed.
      t.diagnostic(
        'no sibling schema_forge_core checkout found (probed $SF_CORE_DIR, $CORE_DIR and '
        + `${join(REPO_ROOT, '..', MIRROR_REPO)}); only this repo's copy was verified`,
      );
      return;
    }
    const mismatches = compareWithManifest(coreDir, PARITY_MANIFEST);
    assert.deepEqual(
      mismatches,
      [],
      `the mirrored report helpers in ${coreDir} drifted from the canonical ones: `
      + `${mismatches.map((m) => m.module).join(', ')}. Run \`make sync-report-helpers\` in this `
      + 'repo and commit the change in BOTH repos.',
    );
  });

  // The report-server image is assembled from BOTH repos: core's server.js + cli/src,
  // then THIS repo's templates/ copied last. The canonical helper module imports
  // report-i18n from the published CLI package, which the image does not install — so
  // the assembly must rewrite that one import to the relative form before building.
  // When it did not, the container died on startup with
  // `ERR_MODULE_NOT_FOUND: Cannot find package '@etendosoftware/schema-forge-cli'` and
  // answered no request at all (unnoticed for weeks because the deploy job's steps are
  // skipped while its AWS variables are unset — ETP-4910). This runs the real assembly
  // and pins the two things that make the image bootable.
  it('the assembled report-server context can resolve the helper module', (t) => {
    const coreDir = coreCheckoutDir();
    if (!coreDir) {
      t.diagnostic('no sibling schema_forge_core checkout: skipping the build-context assembly');
      return;
    }
    const outDir = mkdtempSync(join(tmpdir(), 'sf-report-server-context-'));
    try {
      execFileSync('bash', [join(REPO_ROOT, 'scripts', 'assemble-report-server-context.sh'), outDir, '--clean'], {
        env: { ...process.env, CORE_DIR: coreDir },
        stdio: 'pipe',
      });

      const canonical = readFileSync(join(REPO_ROOT, HELPERS_DIR, 'report-html-helpers.js'), 'utf8');
      const assembled = readFileSync(join(outDir, HELPERS_DIR, 'report-html-helpers.js'), 'utf8');
      assert.equal(assembled, toMirrorSource(canonical));
      assert.ok(!assembled.includes(PARITY_MANIFEST.importLine.schema_forge));
      // ...and the relative specifier has a target inside the context, which is why
      // the rewritten form is the correct one here.
      assert.ok(existsSync(join(outDir, 'cli', 'src', 'report-i18n.js')));
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
