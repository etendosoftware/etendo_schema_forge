import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import Handlebars from 'handlebars';
import { registerReportHelpers } from '../../../templates/reports/helpers/report-html-helpers.js';

// ETP-5013 — "navigable link" on the General Ledger date cell.
//
// Clicking a GL line's date must open the Journal Entries drill-down for that
// exact accounting entry, identified by fact_acct.fact_acct_group_id. This
// mirrors the account-level drill-down (Trial Balance -> General Ledger) that
// report-trial-balance-account-level.test.js already covers.
//
// Every assertion reads the REAL artifact source from disk (never a hardcoded
// copy), so a future edit that breaks the wiring fails here.

const ROOT = resolve(import.meta.dirname, '../../..');
const GL_DIR = join(ROOT, 'artifacts', 'report-general-ledger');
const JE_DIR = join(ROOT, 'artifacts', 'report-journal-entries');

const GL_CONTRACT = JSON.parse(readFileSync(join(GL_DIR, 'report-contract.json'), 'utf8'));
const JE_CONTRACT = JSON.parse(readFileSync(join(JE_DIR, 'report-contract.json'), 'utf8'));
const GL_TEMPLATE_SRC = readFileSync(join(GL_DIR, 'template.hbs'), 'utf8');

// ── Part 1: the GL query must expose the entry id the link carries ──────────

describe('report-general-ledger — fact_acct_group_id in the SQL projection (ETP-5013)', () => {
  it('SELECTs fa.fact_acct_group_id so each row can identify its accounting entry', () => {
    assert.match(GL_CONTRACT.sql.query, /fa\.fact_acct_group_id/);
  });

  it('reads it from the fact_acct alias, not from a joined/derived table', () => {
    // A rename of the alias would silently produce empty ids in the link.
    assert.match(GL_CONTRACT.sql.query, /\bfact_acct\s+fa\b/i);
  });
});

// ── Part 2: the Journal Entries contract must accept that id as a filter ────

describe('report-journal-entries — factAcctGroupId drill-down parameter (ETP-5013)', () => {
  const param = JE_CONTRACT.parameters.find((p) => p.name === 'factAcctGroupId');

  it('declares the parameter', () => {
    assert.ok(param, 'factAcctGroupId parameter is missing from the JE contract');
  });

  it('is a text parameter (the id is a plain AD varchar id, not a search selector)', () => {
    assert.equal(param.type, 'text');
  });

  it('is hidden — it is set programmatically by the drill-down, never by the user', () => {
    assert.equal(param.hidden, true);
  });

  it('is translated in both locales (no hardcoded English)', () => {
    assert.ok(param.label.en_US, 'missing en_US label');
    assert.ok(param.label.es_ES, 'missing es_ES label');
  });

  it('is not required — the JE report still runs standalone without a drill-down', () => {
    assert.notEqual(param.required, true);
  });

  it('wires a __FACTACCTGROUPID__ placeholder into the WHERE clause', () => {
    assert.match(JE_CONTRACT.sql.query, /__FACTACCTGROUPID__/);
  });

  it('guards the filter with the same "empty means no filter" pattern as the other params', () => {
    // Without the `'__X__' = ''` escape hatch, running the JE report on its own
    // (no drill-down) would filter every row away.
    assert.match(
      JE_CONTRACT.sql.query,
      /\('__FACTACCTGROUPID__'\s*=\s*''\s+OR\s+fa\.fact_acct_group_id\s*=\s*'__FACTACCTGROUPID__'\)/,
    );
  });
});

// ── Part 3: the template link markup (both rendering branches) ─────────────

// Both the grouped-by-dimension branch (.dim-group/.acct-card) and the flat
// branch render their own date <td>, so the link has to be present in BOTH or
// the feature silently disappears whenever the user toggles grouping.
const DATE_LINK_LINES = GL_TEMPLATE_SRC
  .split('\n')
  .filter((line) => line.includes('gl-entry-drilldown'));

describe('report-general-ledger — date cell drill-down link (ETP-5013)', () => {
  it('wires the link in BOTH rendering branches (grouped + flat)', () => {
    assert.equal(DATE_LINK_LINES.length, 2, `expected 2 gl-entry-drilldown cells, found ${DATE_LINK_LINES.length}`);
  });

  it('posts the message to window.parent (the report renders inside an iframe)', () => {
    for (const line of DATE_LINK_LINES) {
      assert.match(line, /window\.parent\.postMessage\(/);
    }
  });

  it('uses the gl-entry-drilldown message type the shell listens for', () => {
    for (const line of DATE_LINK_LINES) {
      assert.match(line, /type:'gl-entry-drilldown'/);
    }
  });

  it('carries the row\'s fact_acct_group_id as the entry identifier', () => {
    for (const line of DATE_LINK_LINES) {
      assert.match(line, /factAcctGroupId:'\{\{lookup this 'fact_acct_group_id'\}\}'/);
    }
  });

  // Regression guard for the bug found while implementing this: `pg` returns
  // fact_acct.dateacct as a native JS Date. Interpolating it raw made Handlebars
  // emit Date.prototype.toString() ("Wed Aug 26 2026 00:00:00 GMT+0000 (...)")
  // straight into the JS object literal — which broke the JE date filter and
  // made the modal title show a bogus year. The value must go through the
  // shared formatDate helper first.
  it('sends a pre-formatted dateDisplay, never the raw dateacct column', () => {
    for (const line of DATE_LINK_LINES) {
      assert.match(line, /dateDisplay:'\{\{formatDate \(lookup this 'dateacct'\)\}\}'/);
      assert.doesNotMatch(line, /dateacct:'\{\{lookup this 'dateacct'\}\}'/);
    }
  });

  it('still renders the human-readable date as the visible cell text', () => {
    for (const line of DATE_LINK_LINES) {
      assert.match(line, /\{\{formatDate \(lookup this 'dateacct'\)\}\}<\/span>/);
    }
  });

  it('marks the cell with the gl-date-link class', () => {
    for (const line of DATE_LINK_LINES) {
      assert.match(line, /class="gl-date-link"/);
    }
  });

  it('styles gl-date-link as an affordance (pointer cursor + link colour)', () => {
    assert.match(GL_TEMPLATE_SRC, /\.gl-date-link\s*\{[^}]*cursor:\s*pointer/);
    assert.match(GL_TEMPLATE_SRC, /\.gl-date-link\s*\{[^}]*text-decoration:\s*underline/);
    assert.match(GL_TEMPLATE_SRC, /\.gl-date-link:hover\s*\{/);
  });
});

// ── Part 4: the link actually renders cleanly from a native pg Date ─────────

describe('report-general-ledger — rendered date link output (ETP-5013)', () => {
  registerReportHelpers(Handlebars);

  const ROW = {
    fact_acct_group_id: 'FAG0123456789ABCDEF0123456789ABCD',
    // Exactly what node-postgres hands back for a `date` column: a real Date,
    // NOT a string. This is the input shape that used to break the feature.
    dateacct: new Date(2026, 7, 26),
  };

  function renderCell(line) {
    return Handlebars.compile(line.trim())(ROW);
  }

  it('renders both branches without leaking a Date.toString()', () => {
    for (const line of DATE_LINK_LINES) {
      const html = renderCell(line);
      assert.doesNotMatch(html, /GMT/);
      assert.doesNotMatch(html, /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/);
      assert.doesNotMatch(html, /Invalid Date/);
    }
  });

  it('renders the entry id verbatim into the postMessage payload', () => {
    for (const line of DATE_LINK_LINES) {
      assert.match(renderCell(line), /factAcctGroupId:'FAG0123456789ABCDEF0123456789ABCD'/);
    }
  });

  it('renders dateDisplay as a dd/MM/yyyy string safe to embed in a JS literal', () => {
    for (const line of DATE_LINK_LINES) {
      const html = renderCell(line);
      assert.match(html, /dateDisplay:'26\/08\/2026'/);
      // No apostrophe/quote/newline could have escaped the single-quoted literal.
      const payload = html.match(/dateDisplay:'([^']*)'/)[1];
      assert.doesNotMatch(payload, /['"\\\n]/);
    }
  });

  it('renders the same formatted date as the visible cell text', () => {
    for (const line of DATE_LINK_LINES) {
      assert.match(renderCell(line), />26\/08\/2026<\/span>/);
    }
  });

  it('degrades gracefully when the row has no dateacct', () => {
    const html = Handlebars.compile(DATE_LINK_LINES[0].trim())({ ...ROW, dateacct: null });
    assert.match(html, /dateDisplay:''/);
    assert.doesNotMatch(html, /Invalid Date/);
  });
});
