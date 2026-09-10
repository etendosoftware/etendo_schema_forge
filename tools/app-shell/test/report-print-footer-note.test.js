/**
 * ETP-5013 — the browser's native print dialog (Cmd+P over the live
 * interactive preview) renders its own header/footer margin boxes
 * ("localhost:3100/...  1/1") that Chrome does NOT let CSS Paged Media
 * `@page` margin-box rules override in its interactive print UI (it only
 * honors them in headless/Puppeteer mode — exactly what our own "PDF" export
 * already uses via jsreport). The only reachable improvement is a real date
 * printed INSIDE the page content itself, invisible on screen and visible
 * only under `@media print` — see `.print-only-footer-note` in
 * `templates/reports/base.css` and the `{{#if meta.isInteractive}}` block
 * added at the end of each of the 10 listing `template.hbs` files, right
 * before `</div></body></html>`.
 *
 * The note is deliberately gated on `meta.isInteractive` (same flag as the
 * drill-down link styling, see the sibling
 * `report-drilldown-interactive-style.test.js`) so it renders ONLY for the
 * embedded live preview (format=html/preview) and is entirely absent from
 * the DOM — not just CSS-hidden — for our own static exports (PDF/XLSX/CSV),
 * which already get a real "Impreso el / Página N" footer from jsreport's
 * own `payload.template.chrome.footerTemplate`. Rendering it unconditionally
 * would duplicate that footer.
 *
 * Renders each of the 10 templates with REAL Handlebars (registerReportHelpers
 * + expandReportPartials, same composition report-api.js uses) once with
 * `meta.isInteractive: true` and once with `false`, and asserts:
 *   1. The note is present, with the expected `printedOn` label +
 *      `formatDate`-formatted date, only when `isInteractive` is true.
 *   2. The note is entirely absent from the HTML (not merely hidden) when
 *      `isInteractive` is false.
 *   3. The note never renders twice for a single `isInteractive: true` pass
 *      (regression guard against accidental double-inclusion).
 * It also asserts the `.print-only-footer-note` CSS rule in `base.css`
 * (both this repo's copy and the sibling `schema_forge_core` copy) is
 * `display: none` outside of print and `display: block` inside
 * `@media print`.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { registerReportHelpers } from '../../../templates/reports/helpers/report-html-helpers.js';

const _require = createRequire(import.meta.url);

const ARTIFACTS_ROOT = fileURLToPath(new URL('../../../artifacts', import.meta.url));
const PARTIALS_ROOT = fileURLToPath(new URL('../../../templates/reports', import.meta.url));
const CORE_BASE_CSS = fileURLToPath(
  new URL('../../../../schema_forge_core/templates/reports/base.css', import.meta.url)
);

const BRANDING_PARTIAL = readFileSync(`${PARTIALS_ROOT}/document-branding.hbs`, 'utf8');

function expandReportPartials(templateContent) {
  return templateContent.replace(/\{\{>\s*document-branding\s*\}\}/g, BRANDING_PARTIAL);
}

function renderTemplate(reportId, data) {
  const Handlebars = _require('handlebars');
  registerReportHelpers(Handlebars, '');
  const raw = readFileSync(`${ARTIFACTS_ROOT}/${reportId}/template.hbs`, 'utf8');
  const template = Handlebars.compile(expandReportPartials(raw));
  return template(data);
}

const GENERATED_AT = '2026-08-27T10:00:00Z';
const EXPECTED_FORMATTED_DATE = '27/08/2026'; // en-GB dd/mm/yyyy, per formatDate()
const PRINTED_ON_LABEL = 'Impreso el';

function metaWith(base, isInteractive) {
  return {
    ...base,
    isInteractive,
    generatedAt: GENERATED_AT,
    ui: { ...(base.ui || {}), printedOn: PRINTED_ON_LABEL },
  };
}

/** Minimal valid render data for each of the 10 listing templates. */
const CASES = [
  {
    reportId: 'balance-sheet',
    data: () => ({
      meta: { title: 'Balance Sheet', filters: [], labels: {}, params: {} },
      rows: [],
    }),
  },
  {
    reportId: 'profit-loss',
    data: () => ({
      meta: { title: 'Profit & Loss', filters: [], labels: {}, params: {} },
      rows: [],
    }),
  },
  {
    reportId: 'inventory-stock-report',
    data: () => ({
      meta: { title: 'Inventory Stock Report', filters: [], labels: {} },
      rows: [],
    }),
  },
  {
    reportId: 'report-order-not-shipped',
    data: () => ({
      meta: { title: 'Orders Not Shipped', filters: [] },
      rows: [],
    }),
  },
  {
    reportId: 'report-general-ledger',
    data: () => ({
      meta: {
        params: { groupBy: '', showDimensions: 'false' },
        labels: {},
        descriptionLabel: 'Description',
        groups: [],
      },
    }),
  },
  {
    reportId: 'report-journal-entries',
    data: () => ({
      meta: {
        params: { showDimensions: 'false', showEntryDescription: 'false' },
        labels: {},
        locale: 'en_US',
      },
      rows: [],
    }),
  },
  {
    reportId: 'report-trial-balance',
    data: () => ({
      meta: {
        params: { groupBy: '', accountLevel: 'S', dateFrom: '2024-01-01', dateTo: '2024-12-31' },
        labels: {},
      },
      rows: [],
    }),
  },
  {
    reportId: 'aging-payable',
    data: () => ({
      meta: {
        showDetails: false, labels: {}, column1: '30', column2: '60', column3: '90', column4: '120', lastBucketLabel: '150+',
        showBucket2: false, showBucket3: false, showBucket4: false,
      },
      rows: [],
    }),
  },
  {
    reportId: 'aging-receivable',
    data: () => ({
      meta: {
        showDetails: false, labels: {}, column1: '30', column2: '60', column3: '90', column4: '120', lastBucketLabel: '150+',
        showBucket2: false, showBucket3: false, showBucket4: false,
      },
      rows: [],
    }),
  },
  {
    reportId: 'tax-report',
    data: () => ({
      meta: {
        showDetails: false, groupByBp: false, labels: {}, params: { transactionType: 'P' },
      },
      rows: {
        purchase: { detail: [], summaryByRate: [] },
        sales: { detail: [], summaryByRate: [] },
      },
    }),
  },
];

describe('Print-only footer note only renders when meta.isInteractive (ETP-5013)', () => {
  for (const { reportId, data } of CASES) {
    describe(reportId, () => {
      it('renders the note with the printed-on label and formatted date when isInteractive is true', () => {
        const base = data();
        const html = renderTemplate(reportId, { ...base, meta: metaWith(base.meta, true) });
        assert.match(html, /class="print-only-footer-note"/, 'expected the print-only footer note div to be present');
        const match = html.match(/<div class="print-only-footer-note">([^<]*)<\/div>/);
        assert.ok(match, 'expected to extract the footer note content');
        assert.equal(
          match[1].trim(),
          `${PRINTED_ON_LABEL} ${EXPECTED_FORMATTED_DATE}`,
          'footer note must combine meta.ui.printedOn with the formatDate-formatted meta.generatedAt'
        );
      });

      it('does not render the note at all (absent from the DOM, not just hidden) when isInteractive is false', () => {
        const base = data();
        const html = renderTemplate(reportId, { ...base, meta: metaWith(base.meta, false) });
        assert.doesNotMatch(html, /print-only-footer-note/, 'the note must be entirely absent from static exports, not just CSS-hidden');
      });

      it('never renders the note more than once for the same isInteractive: true render', () => {
        const base = data();
        const html = renderTemplate(reportId, { ...base, meta: metaWith(base.meta, true) });
        const occurrences = html.match(/print-only-footer-note/g) || [];
        assert.equal(occurrences.length, 1, `expected exactly one "print-only-footer-note" occurrence, got ${occurrences.length}`);
      });
    });
  }
});

describe('.print-only-footer-note CSS rule in base.css (ETP-5013)', () => {
  function assertBaseCssRule(cssPath, label) {
    const css = readFileSync(cssPath, 'utf8');

    // Base (non-print) rule: display: none, nothing else conflicting before @media print.
    const baseRuleMatch = css.match(/\.print-only-footer-note\s*\{([^}]*)\}/);
    assert.ok(baseRuleMatch, `[${label}] expected a base .print-only-footer-note rule`);
    assert.match(baseRuleMatch[1], /display:\s*none/, `[${label}] base rule must hide the note outside of print`);

    // @media print override: display: block. Anchored so the selector must be
    // the FIRST rule inside that specific @media print block (only whitespace
    // in between) — otherwise a lazy scan could walk past an unrelated,
    // earlier `@media print { ... }` block in the file and re-capture the
    // base (non-print) rule that follows it, which sits outside any brace
    // nesting the regex itself understands.
    const printBlockMatch = css.match(/@media print\s*\{\s*\.print-only-footer-note\s*\{([^}]*)\}/);
    assert.ok(printBlockMatch, `[${label}] expected an @media print .print-only-footer-note override`);
    assert.match(printBlockMatch[1], /display:\s*block/, `[${label}] @media print override must show the note`);
  }

  it('schema_forge repo copy: display none outside print, block inside @media print', () => {
    const cssPath = fileURLToPath(new URL('../../../templates/reports/base.css', import.meta.url));
    assertBaseCssRule(cssPath, 'schema_forge');
  });

  it('schema_forge_core sibling repo copy: display none outside print, block inside @media print', () => {
    if (!existsSync(CORE_BASE_CSS)) {
      // The sibling checkout may not exist in every environment (e.g. a
      // functional-only dev without ../schema_forge_core cloned) — skip
      // rather than fail, matching this repo's opt-in LOCAL_CORE posture.
      return;
    }
    assertBaseCssRule(CORE_BASE_CSS, 'schema_forge_core');
  });
});
