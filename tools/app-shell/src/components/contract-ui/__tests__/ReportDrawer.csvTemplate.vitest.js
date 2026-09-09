import { describe, it, expect } from 'vitest';
import Handlebars from 'handlebars';
import { CSV_TEMPLATE } from '../ReportDrawer.jsx';
import { buildJsreportHelpersString } from '../../../../../../templates/reports/helpers/report-html-helpers.js';

// ETP-5032 / SEC-04 — the list "Print → CSV" export.
//
// This template is reachable from EVERY list (the printer button in ListView), Contacts
// included, and it used to interpolate raw values with `{{ }}`: no formula neutralization
// and no RFC 4180 quoting at all. So a Contact named `=HYPERLINK("http://x","Click")`
// exported as an active formula (CWE-1236), and any value containing a comma silently
// split into two cells.
//
// The template is compiled here with the SAME helper string the drawer sends to jsreport
// (`buildJsreportHelpersString`), so these tests exercise the real render path rather
// than a re-implementation of it. Asserting on the compiled output — not on the
// component's source text — is what makes them catch an unreachable code path.
const HELPERS = buildJsreportHelpersString();

/** Compiles CSV_TEMPLATE with the drawer's real helper set. */
function renderCsv(columns, rows) {
  const hb = Handlebars.create();
  const helpers = new Function(`${HELPERS}\nreturn { csvField };`)();
  hb.registerHelper('csvField', helpers.csvField);
  return hb.compile(CSV_TEMPLATE)({ columns, rows });
}

const COLUMNS = [
  { key: 'name', label: 'Name', type: 'string' },
  { key: 'city', label: 'City', type: 'string' },
];

/** The data line of a one-row render. */
function dataLine(name, city = 'Barcelona') {
  return renderCsv(COLUMNS, [{ name, city }]).split('\n')[1];
}

describe('ReportDrawer CSV_TEMPLATE — formula neutralization', () => {
  it('exports the HYPERLINK payload as literal text in a single cell', () => {
    expect(dataLine('=HYPERLINK("http://example.com","Click aqui")')).toBe(
      '"\'=HYPERLINK(""http://example.com"",""Click aqui"")",Barcelona',
    );
  });

  it('neutralizes each classic trigger', () => {
    expect(dataLine('=1+1')).toBe("'=1+1,Barcelona");
    expect(dataLine('+SUM(A1:A2)')).toBe("'+SUM(A1:A2),Barcelona");
    expect(dataLine('-CMD')).toBe("'-CMD,Barcelona");
    expect(dataLine('@SUM(A1:A2)')).toBe("'@SUM(A1:A2),Barcelona");
  });

  it('neutralizes the DDE payload', () => {
    expect(dataLine("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0,Barcelona");
  });

  it('neutralizes a trigger hidden behind leading whitespace', () => {
    expect(dataLine('   =1+1')).toBe("'   =1+1,Barcelona");
  });

  it('neutralizes a formula-shaped column LABEL too', () => {
    const csv = renderCsv([{ key: 'name', label: '=1+1' }], []);
    expect(csv.split('\n')[0]).toBe("'=1+1");
  });

  it('leaves ordinary values untouched', () => {
    expect(dataLine('Talleres Molina')).toBe('Talleres Molina,Barcelona');
  });
});

describe('ReportDrawer CSV_TEMPLATE — RFC 4180 correctness', () => {
  it('keeps a value containing a comma in one cell', () => {
    expect(dataLine('Molina, S.L.')).toBe('"Molina, S.L.",Barcelona');
  });

  it('doubles an embedded quote instead of breaking the cell', () => {
    expect(dataLine('He said "hi"')).toBe('"He said ""hi""",Barcelona');
  });

  it('quotes a value containing a line break, so the embedded newline stays inside the cell', () => {
    const csv = renderCsv(COLUMNS, [{ name: 'line one\nline two', city: 'Barcelona' }]);
    expect(csv.trim()).toBe('Name,City\n"line one\nline two",Barcelona');
  });

  it('never HTML-escapes its own quotes (the triple-stash requirement)', () => {
    const csv = renderCsv(COLUMNS, [{ name: 'He said "hi"', city: 'A, B' }]);
    expect(csv).not.toContain('&quot;');
    expect(csv).not.toContain('&#x27;');
    expect(csv).not.toContain('&amp;');
  });

  it('emits one header line and one line per row, comma separated', () => {
    const csv = renderCsv(COLUMNS, [{ name: 'A', city: 'B' }, { name: 'C', city: 'D' }]);
    expect(csv.trim().split('\n')).toEqual(['Name,City', 'A,B', 'C,D']);
  });
});
