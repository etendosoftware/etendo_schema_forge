import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Handlebars from 'handlebars';
import {
  csvField,
  neutralizeSpreadsheetCell,
  buildJsreportHelpersString,
  registerReportHelpers,
} from '../../../templates/reports/helpers/report-html-helpers.js';

// ETP-5032 / SEC-04 — spreadsheet formula neutralization for the report CSV exports.
//
// `csvField` used to be hand-copied into nine `artifacts/*/helpers.js` files, and every
// copy only quoted the value: a business-partner name or entry description stored as
// `=HYPERLINK("http://attacker","Click")` exported as an ACTIVE formula in the
// recipient's spreadsheet (CWE-1236). It now lives once, in the canonical helper set.
//
// Three things have to hold, and each is asserted below against the SAME canonical
// fixture table (ADR-0004 D2 — the table is the contract, not any one implementation):
//   1. the live helper (used by the local HTML render path and by tests),
//   2. the SOURCE TEXT jsreport actually receives (a separate copy by necessity — the
//      container has no shared module system with this repo),
//   3. a real `template-csv.hbs` rendered end to end, which is what a user downloads.
//
// The fixture table is imported from the published core package with the repo's
// pre-publish idiom (same as `statusBadge.coreParity.test.js`): until the release that
// ships it lands, the fixture-driven suites skip and the hand-written cases below still
// run, so this file is never a merge blocker for the core bump.
let fixtures = null;
try {
  const mod = await import('@etendosoftware/app-shell-core/lib/csv/csvNeutralizationFixtures.js');
  if (Array.isArray(mod.CSV_NEUTRALIZATION_FIXTURES)) fixtures = mod;
} catch {
  // Subpath not resolvable yet (pre-publish); the fixture-driven suites are skipped.
}

const fixtureSkip = fixtures
  ? false
  : '@etendosoftware/app-shell-core/lib/csv/csvNeutralizationFixtures.js is not published yet';

const ARTIFACT_DIR = resolve(import.meta.dirname, '../../../artifacts/report-general-ledger');

/** The `csvField` jsreport really gets, recovered from the emitted helpers string. */
function emittedCsvField() {
  const built = buildJsreportHelpersString();
  const fn = new Function(`${built}\nreturn csvField;`)();
  assert.equal(typeof fn, 'function', 'buildJsreportHelpersString did not emit csvField');
  return fn;
}

/** Applies the quoting rule so a fixture's expected CELL becomes the expected FIELD. */
function quoted(cell) {
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

describe('canonical csvField — fixture contract', { skip: fixtureSkip }, () => {
  const emitted = emittedCsvField();

  for (const { description, input, expected } of fixtures?.CSV_NEUTRALIZATION_FIXTURES ?? []) {
    it(`live helper neutralizes: ${description}`, () => {
      assert.equal(neutralizeSpreadsheetCell(input), expected);
      assert.equal(csvField(input), quoted(expected));
    });

    it(`jsreport's emitted copy neutralizes: ${description}`, () => {
      assert.equal(emitted(input), quoted(expected));
    });
  }

  it('covers every declared trigger', () => {
    const uncovered = (fixtures?.SPREADSHEET_FORMULA_TRIGGERS ?? []).filter(
      (t) => !fixtures.CSV_NEUTRALIZATION_FIXTURES.some(
        ({ input, expected }) => typeof input === 'string' && input.includes(t) && expected.startsWith("'"),
      ),
    );
    assert.deepEqual(uncovered, []);
  });
});

describe('canonical csvField — payloads from the ticket', () => {
  const emitted = emittedCsvField();

  it('neutralizes the HYPERLINK payload and keeps it one RFC 4180 field', () => {
    // The payload carries both a comma and quotes, so it also exercises the
    // neutralize-then-quote ordering: the apostrophe must be INSIDE the quotes.
    const field = csvField('=HYPERLINK("http://example.com","Click aqui")');
    assert.equal(field, '"\'=HYPERLINK(""http://example.com"",""Click aqui"")"');
    assert.equal(emitted('=HYPERLINK("http://example.com","Click aqui")'), field);
  });

  it('neutralizes the DDE payload', () => {
    assert.equal(csvField("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0");
  });

  it('quotes a value containing a comma — the corruption bug that shipped alongside', () => {
    assert.equal(csvField('Molina, S.L.'), '"Molina, S.L."');
  });

  it('leaves ordinary text alone', () => {
    assert.equal(csvField('Talleres Molina'), 'Talleres Molina');
  });
});

describe('template-csv.hbs renders neutralized cells end to end', () => {
  /** Renders the real general-ledger CSV template with one attacker-controlled row. */
  function renderCsv(name) {
    const hb = Handlebars.create();
    registerReportHelpers(hb);
    const template = hb.compile(readFileSync(resolve(ARTIFACT_DIR, 'template-csv.hbs'), 'utf8'));
    return template({
      meta: {
        labels: {
          value: 'Account', name: 'Name', dateacct: 'Date',
          amtacctdr: 'Debit', amtacctcr: 'Credit',
        },
        descriptionLabel: 'Description',
        params: {},
      },
      rows: [{
        value: '10000',
        name,
        dateacct: '2026-06-10',
        amtacctdr: '100.00',
        amtacctcr: '0.00',
        groupbyname: 'Ventas',
      }],
    });
  }

  it('exports a formula-shaped account name as literal text', () => {
    const csv = renderCsv('=HYPERLINK("http://example.com","Click")');
    assert.match(csv, /"'=HYPERLINK\(""http:\/\/example\.com"",""Click""\)"/);
    // No un-neutralized formula start anywhere in the file.
    assert.doesNotMatch(csv, /(^|,)=HYPERLINK/m);
  });

  it('does not HTML-escape the quotes it emits (the triple-stash requirement)', () => {
    const csv = renderCsv('=1+1');
    assert.doesNotMatch(csv, /&quot;/);
    assert.doesNotMatch(csv, /&#x27;/);
  });

  it('keeps a name containing a comma in a single cell', () => {
    const csv = renderCsv('Molina, S.L.');
    const dataLine = csv.trim().split('\n')[1];
    assert.match(dataLine, /"Molina, S\.L\."/);
  });

  it('leaves amount columns untouched — they never go through csvField', () => {
    const dataLine = renderCsv('Talleres Molina').trim().split('\n')[1];
    assert.match(dataLine, /,100\.00,0\.00,/);
  });
});
