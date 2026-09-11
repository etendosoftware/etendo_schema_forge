/**
 * ETP-4900 — the detail view (`meta.showDetails: true`) of aging-payable and
 * aging-receivable was restructured from one shared `<table>` with a bold
 * `.bp-header-row` per business partner into a bordered "card" per business
 * partner — `.bp-cards > .bp-card > .bp-card-head` + the card's OWN
 * `<table class="report-table">` with its own `<thead>`/doc rows/
 * `.bp-subtotal-row`. This mirrors the EXISTING pattern in
 * report-general-ledger's flat layout (`.acct-cards`/`.acct-card`/
 * `.acct-card-head`) — see report-general-ledger-flat-account-cards.test.js,
 * the structural reference this file follows.
 *
 * After the cards, a SEPARATE standalone `<table class="report-table">`
 * holds just a `<colgroup>` (mirroring the per-card column widths) and a
 * `<tfoot>` with the grand total across every business partner.
 *
 * The summary view (`meta.showDetails: false`) is untouched — still one flat
 * table, one row per business partner.
 *
 * Both aging-payable and aging-receivable share byte-identical templates
 * except for the hardcoded `docWindow` in the doc-link onclick
 * ('purchase-invoice' vs 'sales-invoice'), so this file parametrizes over
 * both reports.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Handlebars from 'handlebars';
import { registerReportHelpers } from '../../../templates/reports/helpers/report-html-helpers.js';
import { expandBrandingPartial } from './reportBrandingPartialHelper.js';

function renderReport(reportId, data) {
  const ARTIFACT_DIR = resolve(import.meta.dirname, `../../../artifacts/${reportId}`);
  const hb = Handlebars.create();
  const helpersCode = readFileSync(resolve(ARTIFACT_DIR, 'helpers.js'), 'utf8');
  registerReportHelpers(hb, helpersCode);
  const templateSrc = readFileSync(resolve(ARTIFACT_DIR, 'template.hbs'), 'utf8');
  const template = hb.compile(expandBrandingPartial(templateSrc));
  return template(data);
}

/** Formats a number the same way the template's `formatCurrency` helper does
 * (es-ES locale, 2 decimals) — used to compute expected totals in fixtures. */
function fmt(value) {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(value);
}

/** Every doc-link's onclick handler must carry the report-specific
 * docWindow (purchase-invoice vs sales-invoice). */
function assertOnclickPresent(html, docWindow, invoiceId) {
  const re = new RegExp(
    `onclick="window\\.parent\\.postMessage\\(\\{type:'navigate-invoice',invoiceId:'${invoiceId}',docWindow:'${docWindow}'\\}`
  );
  assert.match(html, re, `expected navigate-invoice onclick for invoiceId=${invoiceId}, docWindow=${docWindow}`);
}

const REPORTS = [
  { id: 'aging-payable', docWindow: 'purchase-invoice' },
  { id: 'aging-receivable', docWindow: 'sales-invoice' },
];

for (const { id: reportId, docWindow } of REPORTS) {
  describe(`${reportId} — detail view business-partner cards (ETP-4900)`, () => {
    const baseMeta = {
      showDetails: true,
      labels: {
        documentNo: 'Document No', documentDate: 'Date', current: 'Current',
        credits: 'Credits', net: 'Net', bPartner: 'Business Partner',
        total: 'Total', noData: 'No data',
      },
      ui: { total: 'Total' },
      column1: '30', column2: '60', column3: '90', column4: '120',
      lastBucketLabel: '150+',
      showBucket2: true, showBucket3: true, showBucket4: true,
    };

    const twoPartnerRows = [
      {
        bPartner: 'ACME Corp', bPartnerId: 'bp-1',
        current: 100, days30: 50, days60: 25, days90: 10, days120: 5, days150plus: 2, credits: 1, net: 191,
        docs: [
          { invoiceId: 'inv-1', docNo: 'INV-001', dateInvoiced: '2024-01-01', current: 60, days30: 30, days60: 15, days90: 6, days120: 3, days150plus: 1 },
          { invoiceId: 'inv-2', docNo: 'INV-002', dateInvoiced: '2024-01-15', current: 40, days30: 20, days60: 10, days90: 4, days120: 2, days150plus: 1 },
        ],
      },
      {
        bPartner: 'Beta Ltd', bPartnerId: 'bp-2',
        current: 200, days30: 75, days60: 30, days90: 15, days120: 8, days150plus: 3, credits: 2, net: 329,
        docs: [
          { invoiceId: 'inv-3', docNo: 'INV-003', dateInvoiced: '2024-02-01', current: 200, days30: 75, days60: 30, days90: 15, days120: 8, days150plus: 3 },
        ],
      },
    ];

    function renderDetail(rowsOverride, metaOverride = {}) {
      return renderReport(reportId, {
        meta: { ...baseMeta, ...metaOverride },
        rows: rowsOverride,
      });
    }

    // 1. .bp-card per business partner, each with a .bp-card-head, no .bp-header-row
    it('renders one .bp-card per business partner, each carrying its name in .bp-card-head', () => {
      const html = renderDetail(twoPartnerRows);
      const cardOccurrences = [...html.matchAll(/class="bp-card"/g)];
      assert.equal(cardOccurrences.length, twoPartnerRows.length, 'expected one .bp-card per business partner');
      assert.match(html, /<div class="bp-card-head">ACME Corp<\/div>/);
      assert.match(html, /<div class="bp-card-head">Beta Ltd<\/div>/);
    });

    it('no longer renders the old shared .bp-header-row markup (class attribute, not the doc comment mentioning it)', () => {
      const html = renderDetail(twoPartnerRows);
      const bodyOnly = html.slice(html.indexOf('<body>'));
      assert.doesNotMatch(bodyOnly, /class="bp-header-row"/);
    });

    // 2. Each card owns its own <thead>
    it('each card renders its OWN <thead> inside .bp-cards, not one shared header', () => {
      const html = renderDetail(twoPartnerRows);
      const bpCardsOpenIdx = html.indexOf('<div class="bp-cards">');
      const grandTotalTableIdx = html.indexOf('<table class="report-table" style="margin-top: 3mm;">');
      assert.ok(bpCardsOpenIdx !== -1 && grandTotalTableIdx !== -1 && grandTotalTableIdx > bpCardsOpenIdx);
      const cardsBlock = html.slice(bpCardsOpenIdx, grandTotalTableIdx);
      const theadOccurrences = [...cardsBlock.matchAll(/<thead>/g)];
      assert.equal(theadOccurrences.length, twoPartnerRows.length, 'expected one <thead> per card inside .bp-cards');
    });

    // 3. doc rows render inside their own partner's card, before that card's subtotal row
    it('renders each doc row inside its own partner card, before that card\'s .bp-subtotal-row, keeping the navigate-invoice onclick', () => {
      const html = renderDetail(twoPartnerRows);
      const acmeCardIdx = html.indexOf('<div class="bp-card-head">ACME Corp</div>');
      const betaCardIdx = html.indexOf('<div class="bp-card-head">Beta Ltd</div>');
      assert.ok(acmeCardIdx !== -1 && betaCardIdx !== -1);
      const acmeSlice = html.slice(acmeCardIdx, betaCardIdx);

      assert.match(acmeSlice, /INV-001/);
      assert.match(acmeSlice, /INV-002/);
      assert.doesNotMatch(acmeSlice.slice(0, acmeSlice.indexOf('INV-002')), /bp-subtotal-row/, 'INV-002 doc row must precede the subtotal row within its own card');

      const inv1Idx = acmeSlice.indexOf('INV-001');
      const subtotalIdx = acmeSlice.indexOf('bp-subtotal-row');
      assert.ok(inv1Idx !== -1 && subtotalIdx !== -1 && inv1Idx < subtotalIdx, 'doc rows must appear before the subtotal row');

      assertOnclickPresent(acmeSlice, docWindow, 'inv-1');
      assertOnclickPresent(acmeSlice, docWindow, 'inv-2');

      // Beta's doc must not leak into ACME's card slice.
      assert.doesNotMatch(acmeSlice, /INV-003/);
    });

    // 4. .bp-subtotal-row carries the CARD's own amounts, not the grand total
    it('each card\'s .bp-subtotal-row shows that partner\'s own subtotal amounts, not the grand total', () => {
      const html = renderDetail(twoPartnerRows);
      const acmeCardIdx = html.indexOf('<div class="bp-card-head">ACME Corp</div>');
      const betaCardIdx = html.indexOf('<div class="bp-card-head">Beta Ltd</div>');
      const acmeSlice = html.slice(acmeCardIdx, betaCardIdx);
      const betaSlice = html.slice(betaCardIdx);

      const acmeSubtotalMatch = acmeSlice.match(/<tr class="bp-subtotal-row">([\s\S]*?)<\/tr>/);
      assert.ok(acmeSubtotalMatch, 'expected a subtotal row in ACME\'s card');
      assert.match(acmeSubtotalMatch[1], new RegExp(fmt(100).replace('.', '\\.')));
      assert.doesNotMatch(acmeSubtotalMatch[1], new RegExp(fmt(200).replace('.', '\\.')), 'ACME subtotal must not show Beta\'s current amount');

      const betaSubtotalMatch = betaSlice.match(/<tr class="bp-subtotal-row">([\s\S]*?)<\/tr>/);
      assert.ok(betaSubtotalMatch, 'expected a subtotal row in Beta\'s card');
      assert.match(betaSubtotalMatch[1], new RegExp(fmt(200).replace('.', '\\.')));
    });

    // 5. Exactly ONE grand-total <tfoot> outside .bp-cards, with correct sum
    it('renders exactly one grand-total <tfoot> outside .bp-cards, summing across every partner', () => {
      const html = renderDetail(twoPartnerRows);
      const bpCardsOpenIdx = html.indexOf('<div class="bp-cards">');
      assert.ok(bpCardsOpenIdx !== -1, 'expected .bp-cards wrapper to exist');
      // Find the matching close by locating the grand-total table marker after it.
      const grandTotalTableIdx = html.indexOf('<table class="report-table" style="margin-top: 3mm;">');
      assert.ok(grandTotalTableIdx !== -1 && grandTotalTableIdx > bpCardsOpenIdx, 'expected the standalone grand-total table after .bp-cards');

      const afterCards = html.slice(grandTotalTableIdx);
      const tfootOccurrences = [...afterCards.matchAll(/<tfoot>/g)];
      assert.equal(tfootOccurrences.length, 1, 'expected exactly one grand-total <tfoot> after .bp-cards');

      const beforeGrandTotal = html.slice(0, grandTotalTableIdx);
      assert.doesNotMatch(beforeGrandTotal.slice(bpCardsOpenIdx), /<tfoot>/, 'the .bp-cards block itself must not contain a <tfoot>');

      const tfootMatch = afterCards.match(/<tfoot><tr>([\s\S]*?)<\/tr><\/tfoot>/);
      assert.ok(tfootMatch, 'expected a <tfoot><tr>...</tr></tfoot> grand total row');
      const tfootBody = tfootMatch[1];

      assert.match(tfootBody, /Total:/);
      const expectedCurrent = fmt(twoPartnerRows[0].current + twoPartnerRows[1].current);
      const expectedDays30 = fmt(twoPartnerRows[0].days30 + twoPartnerRows[1].days30);
      const expectedNet = fmt(twoPartnerRows[0].net + twoPartnerRows[1].net);
      assert.match(tfootBody, new RegExp(expectedCurrent.replace('.', '\\.')));
      assert.match(tfootBody, new RegExp(expectedDays30.replace('.', '\\.')));
      assert.match(tfootBody, new RegExp(expectedNet.replace('.', '\\.')));
    });

    it('the grand-total <tfoot> still renders correctly (fewer columns, correct sum) when showBucket2/3/4 are all false', () => {
      const html = renderDetail(twoPartnerRows, { showBucket2: false, showBucket3: false, showBucket4: false });
      const grandTotalTableIdx = html.indexOf('<table class="report-table" style="margin-top: 3mm;">');
      const afterCards = html.slice(grandTotalTableIdx);
      const tfootOccurrences = [...afterCards.matchAll(/<tfoot>/g)];
      assert.equal(tfootOccurrences.length, 1, 'expected exactly one grand-total <tfoot>');

      const tfootMatch = afterCards.match(/<tfoot><tr>([\s\S]*?)<\/tr><\/tfoot>/);
      const tfootBody = tfootMatch[1];
      const expectedCurrent = fmt(twoPartnerRows[0].current + twoPartnerRows[1].current);
      const expectedDays30 = fmt(twoPartnerRows[0].days30 + twoPartnerRows[1].days30);
      assert.match(tfootBody, new RegExp(expectedCurrent.replace('.', '\\.')));
      assert.match(tfootBody, new RegExp(expectedDays30.replace('.', '\\.')));

      // Bucket columns absent from the grand-total row's data cells and colgroup.
      const cellCount = [...tfootBody.matchAll(/<td/g)].length;
      assert.equal(cellCount, 6, 'expected 6 <td> cells (label + current + 30 + 150plus + credits + net) with all buckets hidden');
    });

    // 6. showBucket2/3/4 conditional columns work per-card AND in the grand total
    it('shows only the 30-60 bucket column (showBucket2 true, 3/4 false) across card thead, doc row, subtotal row, and grand total', () => {
      const html = renderDetail(twoPartnerRows, { showBucket2: true, showBucket3: false, showBucket4: false });

      const bpCardsOpenIdx = html.indexOf('<div class="bp-cards">');
      const grandTotalTableIdx = html.indexOf('<table class="report-table" style="margin-top: 3mm;">');
      const cardsBlock = html.slice(bpCardsOpenIdx, grandTotalTableIdx);

      // Card thead: 30-60 present, 60-90/90-120 absent.
      assert.match(cardsBlock, /30-60/);
      assert.doesNotMatch(cardsBlock, /60-90/);
      assert.doesNotMatch(cardsBlock, /90-120/);

      // Doc row + subtotal row cell counts: with only bucket2 shown, each card's
      // <tbody> row (doc or subtotal) should carry 9 <td> (doc-no, date, current,
      // 1-30, 30-60, 150+, credits(blank for doc)/value, net(blank)/value) — verify
      // via column count consistency between thead <th> and a doc row's <td>.
      const acmeCardIdx = cardsBlock.indexOf('ACME Corp');
      const betaCardIdx = cardsBlock.indexOf('Beta Ltd');
      const acmeSlice = cardsBlock.slice(acmeCardIdx, betaCardIdx);
      const theadThCount = [...acmeSlice.match(/<thead><tr>([\s\S]*?)<\/tr><\/thead>/)[1].matchAll(/<th/g)].length;
      const firstDocRowMatch = acmeSlice.match(/<tr class="doc-row">([\s\S]*?)<\/tr>/);
      assert.ok(firstDocRowMatch, 'expected a doc row');
      const docRowTdCount = [...firstDocRowMatch[1].matchAll(/<td/g)].length;
      assert.equal(docRowTdCount, theadThCount, 'doc row column count must match thead column count');

      const subtotalRowMatch = acmeSlice.match(/<tr class="bp-subtotal-row">([\s\S]*?)<\/tr>/);
      const subtotalTdCount = [...subtotalRowMatch[1].matchAll(/<td/g)].length;
      // Subtotal row uses colspan="2" for the first cell, so it has one fewer <td> than thead <th>.
      assert.equal(subtotalTdCount, theadThCount - 1, 'subtotal row (colspan=2 leading cell) must have thead-th-count - 1 <td> cells');
    });

    it('grand-total colgroup and tfoot column counts match when only showBucket2 is true', () => {
      const html = renderDetail(twoPartnerRows, { showBucket2: true, showBucket3: false, showBucket4: false });
      const grandTotalTableIdx = html.indexOf('<table class="report-table" style="margin-top: 3mm;">');
      const afterCards = html.slice(grandTotalTableIdx);

      const colgroupMatch = afterCards.match(/<colgroup>([\s\S]*?)<\/colgroup>/);
      assert.ok(colgroupMatch, 'expected a colgroup');
      const colCount = [...colgroupMatch[1].matchAll(/<col/g)].length;
      // Base 7 cols (docNo, date, current, 1-30, 150+, credits, net) + 1 for bucket2.
      assert.equal(colCount, 8, 'expected 8 <col> with only bucket2 shown');

      const tfootMatch = afterCards.match(/<tfoot><tr>([\s\S]*?)<\/tr><\/tfoot>/);
      const tdCount = [...tfootMatch[1].matchAll(/<td/g)].length;
      // label(colspan=2) + current + 1-30 + bucket2 + 150+ + credits + net = 7 <td>.
      assert.equal(tdCount, 7, 'expected 7 <td> (label + current + 30 + bucket2 + 150plus + credits + net) with only bucket2 shown');
    });

    it('hides all bucket columns when showBucket2/3/4 are all false, everywhere', () => {
      const html = renderDetail(twoPartnerRows, { showBucket2: false, showBucket3: false, showBucket4: false });
      const bpCardsOpenIdx = html.indexOf('<div class="bp-cards">');
      const grandTotalTableIdx = html.indexOf('<table class="report-table" style="margin-top: 3mm;">');
      const cardsBlock = html.slice(bpCardsOpenIdx, grandTotalTableIdx);

      assert.doesNotMatch(cardsBlock, /30-60/);
      assert.doesNotMatch(cardsBlock, /60-90/);
      assert.doesNotMatch(cardsBlock, /90-120/);

      const afterCards = html.slice(grandTotalTableIdx);
      const colgroupMatch = afterCards.match(/<colgroup>([\s\S]*?)<\/colgroup>/);
      const colCount = [...colgroupMatch[1].matchAll(/<col/g)].length;
      assert.equal(colCount, 7, 'expected 7 <col> with no buckets shown');
    });

    // 7. Summary view unaffected
    it('summary view (showDetails: false) renders no .bp-card/.bp-cards, unchanged single flat table', () => {
      const summaryData = {
        meta: { ...baseMeta, showDetails: false },
        rows: [
          { bPartnerId: 'bp-1', bPartner: 'ACME Corp', current: 100, days30: 50, days60: 25, days90: 10, days120: 5, days150plus: 2, total: 192, credits: 1, net: 191 },
          { bPartnerId: 'bp-2', bPartner: 'Beta Ltd', current: 200, days30: 75, days60: 30, days90: 15, days120: 8, days150plus: 3, total: 331, credits: 2, net: 329 },
        ],
      };
      const html = renderReport(reportId, summaryData);
      // Scope to <body> — the CSS block (always present, static) legitimately
      // declares .bp-cards/.bp-card/.bp-card-head rules regardless of showDetails;
      // what must be absent is the actual markup using them.
      const bodyOnly = html.slice(html.indexOf('<body>'));
      assert.doesNotMatch(bodyOnly, /class="bp-cards"/);
      assert.doesNotMatch(bodyOnly, /class="bp-card"/);
      assert.doesNotMatch(bodyOnly, /class="bp-card-head"/);

      const rowOccurrences = [...html.matchAll(/onclick="window\.parent\.postMessage\(\{type:'aging-drilldown'/g)];
      assert.equal(rowOccurrences.length, 2, 'expected one drill-down row per business partner in the summary flat table');
      assert.match(html, /ACME Corp/);
      assert.match(html, /Beta Ltd/);

      const tfootOccurrences = [...html.matchAll(/<tfoot>/g)];
      assert.equal(tfootOccurrences.length, 1, 'expected exactly one tfoot (the summary table\'s own grand total)');
    });
  });
}
