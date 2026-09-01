/**
 * ETP-5013 — the render date must NOT appear a second time in the report
 * header/document footer — it already lives in Chrome's native
 * `chrome.footerTemplate` (printed on every page, see
 * `report-api-pdf-chrome-payload.test.js` / `server-pdf-chrome-payload.test.js`
 * in `schema_forge_core`).
 *
 * History: an earlier iteration of this ticket added a `{{meta.ui.generatedOn}}
 * {{formatDate meta.generatedAt}}` label to these 18 templates (10 list
 * reports gained/kept a `.report-meta` block in the header, 8 `print-*`
 * documents got it in their own footer). The user then reviewed a real
 * rendered PDF and asked whether showing the date in the header made sense
 * given Chrome's own page footer already prints it (`Printed on ...`). We
 * decoded a reference Classic PDF and confirmed Classic never repeats the
 * date in the header — only in the footer, once. Showing it twice on the
 * same page was redundant, so this sweep removed the header/footer date+label
 * (and, for the print-* documents, kept `{{header.org_name}}` in their own
 * footer — only the date+label was removed there, not the org name).
 *
 * This test protects the current (correct) state: no in-scope template may
 * reintroduce `meta.ui.generatedOn` in its own markup. The `generatedOn` key
 * itself is intentionally still defined in `REPORT_UI_STRINGS`
 * (`cli/src/report-i18n.js` in `schema_forge_core`) for potential future
 * reuse — it is simply unreferenced by any `.hbs` today.
 *
 * Update (still ETP-5013): the 10 `LIST_REPORTS` templates later gained ONE
 * deliberate, narrowly-scoped exception to the "no bare
 * `{{formatDate meta.generatedAt}}`" rule below — a `.print-only-footer-note`
 * div, gated behind `{{#if meta.isInteractive}}`, added specifically to work
 * around the browser's native Cmd+P print dialog (which ignores CSS Paged
 * Media margin-box rules in its interactive UI, unlike our own PDF export's
 * headless Chrome). Because it only renders for the interactive preview
 * (never for our own PDF/XLSX/CSV exports, where Chrome's real footer already
 * prints the date), it cannot double up with Chrome's footer date and is not
 * the redundant case this test guards against — see the sibling
 * `report-print-footer-note.test.js` for full coverage of that block. This
 * test strips exactly that one gated block before asserting no bare
 * `meta.generatedAt` reference remains anywhere else in the template.
 */
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARTIFACTS_DIR = resolve(fileURLToPath(new URL('../../../artifacts', import.meta.url)));

// List reports whose header used to carry (or briefly gained, then lost)
// a `.report-meta` date block.
const LIST_REPORTS = [
  'balance-sheet',
  'inventory-stock-report',
  'profit-loss',
  'report-general-ledger',
  'report-journal-entries',
  'report-order-not-shipped',
  'report-trial-balance',
  'aging-payable',
  'aging-receivable',
  'tax-report',
];

// Document templates whose own footer used to carry the generatedOn label.
const PRINT_DOCUMENT_REPORTS = [
  'print-goods-shipment',
  'print-payment-in',
  'print-purchase-order',
  'print-return-material-receipt',
  'print-return-to-vendor-shipment',
  'print-sales-invoice',
  'print-sales-order',
  'print-sales-quotation',
];

const ALL_REPORTS = [...LIST_REPORTS, ...PRINT_DOCUMENT_REPORTS];

function readTemplate(reportId) {
  return readFileSync(resolve(ARTIFACTS_DIR, reportId, 'template.hbs'), 'utf8');
}

// The one deliberate ETP-5013 exception (see file-level docstring above and
// `report-print-footer-note.test.js`): a `meta.generatedAt` reference is
// allowed ONLY inside this gated print-only footer note, never elsewhere.
const PRINT_ONLY_FOOTER_NOTE_BLOCK =
  /\{\{#if meta\.isInteractive\}\}\s*<div class="print-only-footer-note">[^<]*<\/div>\s*\{\{\/if\}\}/;

function stripPrintOnlyFooterNote(src) {
  return src.replace(PRINT_ONLY_FOOTER_NOTE_BLOCK, '');
}

describe('report header/footer never repeats the render date (ETP-5013)', () => {
  for (const reportId of ALL_REPORTS) {
    it(`'${reportId}' does not reference meta.ui.generatedOn`, () => {
      const src = readTemplate(reportId);
      assert.doesNotMatch(
        src,
        /meta\.ui\.generatedOn/,
        `${reportId} reintroduces the generatedOn label — redundant with Chrome's footer date`,
      );
    });

    it(`'${reportId}' does not render a bare {{formatDate meta.generatedAt}} outside the ETP-5013 print-only-footer-note`, () => {
      const src = stripPrintOnlyFooterNote(readTemplate(reportId));
      assert.doesNotMatch(
        src,
        /\{\{formatDate meta\.generatedAt\}\}/,
        `${reportId} still renders meta.generatedAt outside the gated print-only-footer-note — the date belongs only in Chrome's footer or that one exception`,
      );
    });
  }

  describe('list reports — .report-header is title-only again', () => {
    for (const reportId of LIST_REPORTS) {
      it(`'${reportId}' has no .report-meta block left in the header`, () => {
        const src = readTemplate(reportId);
        assert.doesNotMatch(
          src,
          /class="report-meta"/,
          `${reportId} still has a .report-meta block in its header`,
        );
      });
    }
  });

  describe('list reports — the ETP-5013 print-only-footer-note exception is actually present', () => {
    for (const reportId of LIST_REPORTS) {
      it(`'${reportId}' has the gated print-only-footer-note block (so the strip above is not vacuous)`, () => {
        const src = readTemplate(reportId);
        assert.match(
          src,
          PRINT_ONLY_FOOTER_NOTE_BLOCK,
          `${reportId} is missing the {{#if meta.isInteractive}}...print-only-footer-note...{{/if}} block`,
        );
      });
    }
  });

  describe('print-* documents kept the org name in their footer', () => {
    for (const reportId of PRINT_DOCUMENT_REPORTS) {
      it(`'${reportId}' still renders {{header.org_name}} in its footer`, () => {
        const src = readTemplate(reportId);
        assert.match(
          src,
          /\{\{header\.org_name\}\}/,
          `${reportId} lost {{header.org_name}} — only the date+label should have been removed`,
        );
      });
    }
  });
});
