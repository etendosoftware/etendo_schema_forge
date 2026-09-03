import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import Handlebars from 'handlebars';
import { registerReportHelpers } from '../../../templates/reports/helpers/report-html-helpers.js';

// ETP-5013 — "navigable link" on the Journal Entries entry number.
//
// Each accounting entry's number must link to the SOURCE document that produced
// it (Sales/Purchase Invoice, Goods Shipment/Receipt, Return Material Receipt,
// Return to Vendor Shipment, Physical Inventory), reusing the pre-existing
// generic `navigate-invoice` postMessage handler in ReportViewerPage.jsx (the
// same one aging-payable / aging-receivable already use). No React code was
// changed: the whole feature lives in the report's SQL contract + template.
//
// Entries with no Schema Forge window behind them (manual GL Journal postings,
// Financial Account Transactions, Matched Purchase Invoices, ...) resolve to a
// NULL `doc_window` and must stay plain, non-clickable text.
//
// Every assertion reads the REAL artifact source from disk (never a hardcoded
// copy), so a future edit that breaks the wiring fails here.

const ROOT = resolve(import.meta.dirname, '../../..');
const JE_DIR = join(ROOT, 'artifacts', 'report-journal-entries');

const JE_CONTRACT = JSON.parse(readFileSync(join(JE_DIR, 'report-contract.json'), 'utf8'));
// ETP-5013 added `{{> document-branding}}` to template.hbs's .report-header.
// It is NOT a native Handlebars partial (see report-api.js's own comment on
// expandReportPartials) — compiling it as-is throws "The partial
// document-branding could not be found".
const BRANDING_PARTIAL = readFileSync(join(ROOT, 'templates', 'reports', 'document-branding.hbs'), 'utf8');
const JE_TEMPLATE_SRC = readFileSync(join(JE_DIR, 'template.hbs'), 'utf8')
  .replace(/\{\{>\s*document-branding\s*\}\}/g, BRANDING_PARTIAL);
const JE_MOCK_RAW = readFileSync(join(JE_DIR, 'mock-data.json'), 'utf8');
const SQL = JE_CONTRACT.sql.query;

// ── Part 1: the SQL must join ad_table and project doc_window ───────────────

describe('report-journal-entries — doc_window SQL projection (ETP-5013)', () => {
  it('LEFT JOINs ad_table so the source document table name is available', () => {
    assert.match(SQL, /LEFT\s+JOIN\s+ad_table\s+adt\s+ON\s+adt\.ad_table_id\s*=\s*fa\.ad_table_id/i);
  });

  it('keeps the join non-blocking (LEFT, never INNER) so window-less entries survive', () => {
    // An INNER JOIN would silently drop every fact_acct row whose ad_table_id
    // has no ad_table match, changing the report's numbers.
    assert.doesNotMatch(SQL, /\bINNER\s+JOIN\s+ad_table\b/i);
  });

  it('computes doc_window inside the CTE, aggregated like its MAX(...) neighbours', () => {
    // The CTE groups by fact_acct_group_id, so any non-grouped column must be
    // aggregated or Postgres rejects the query outright.
    assert.match(SQL, /MAX\(CASE[\s\S]*?END\)\s+AS\s+doc_window/i);
  });

  it('projects doc_window in the outer SELECT so the template can read it', () => {
    const outer = SQL.slice(SQL.lastIndexOf('FROM je'));
    assert.ok(outer.length > 0, 'could not locate the outer SELECT ... FROM je');
    const outerSelect = SQL.slice(0, SQL.lastIndexOf('FROM je'));
    const lastSelect = outerSelect.slice(outerSelect.lastIndexOf('SELECT'));
    assert.match(lastSelect, /\bdoc_window\b/);
  });

  it('still projects record_id and ad_table_id alongside it (the link needs record_id)', () => {
    const outerSelect = SQL.slice(0, SQL.lastIndexOf('FROM je'));
    const lastSelect = outerSelect.slice(outerSelect.lastIndexOf('SELECT'));
    assert.match(lastSelect, /\brecord_id\b/);
    assert.match(lastSelect, /\bad_table_id\b/);
  });
});

// ── Part 2: the CASE branches, including the isreturn correction ───────────

// Isolate the doc_window CASE expression so the assertions below cannot be
// accidentally satisfied by unrelated parts of a ~4k-char query.
const DOC_WINDOW_CASE = (() => {
  const m = /MAX\(CASE([\s\S]*?)END\)\s+AS\s+doc_window/i.exec(SQL);
  return m ? m[1] : '';
})();

describe('report-journal-entries — doc_window CASE branches (ETP-5013)', () => {
  it('extracts a non-empty CASE expression', () => {
    assert.ok(DOC_WINDOW_CASE.trim().length > 0, 'doc_window CASE expression not found in the SQL');
  });

  it('branches on exactly the source tables that have a Schema Forge window', () => {
    // M_MATCHINV -> matched-purchase-invoices and A_AMORTIZATION -> amortization
    // added in the ETP-5013 follow-up: both post fact_acct rows whose
    // `record_id` IS the target window's primaryEntity PK (M_MatchInv_ID /
    // A_Amortization_ID — verified against the real DB, 1530/1530 and 2/2
    // rows resolve), so they reuse the generic navigate-invoice mechanism
    // untouched. FIN_FINACC_TRANSACTION is the one case whose record_id is NOT
    // what the URL navigates to: it's a transaction id, while the
    // `financial-account` window's own primaryEntity is the ACCOUNT — hence
    // the separate `doc_record_id` (account to open) and `doc_query`
    // (`txn=<id>`, so the window deep-links to the right movement) columns.
    const tables = [...DOC_WINDOW_CASE.matchAll(/UPPER\(adt\.tablename\)\s*=\s*'([A-Z_]+)'/gi)].map((m) => m[1]);
    assert.deepEqual(tables, ['C_INVOICE', 'M_INOUT', 'M_INVENTORY', 'M_MATCHINV', 'A_AMORTIZATION', 'FIN_FINACC_TRANSACTION']);
  });

  it('normalises the table name with UPPER() (ad_table.tablename casing is not guaranteed)', () => {
    assert.doesNotMatch(DOC_WINDOW_CASE, /adt\.tablename\s*=\s*'[A-Za-z_]+'/);
  });

  it('splits C_INVOICE into sales-invoice / purchase-invoice by dt.issotrx', () => {
    assert.match(
      DOC_WINDOW_CASE,
      /UPPER\(adt\.tablename\)\s*=\s*'C_INVOICE'\s+THEN\s+CASE\s+WHEN\s+dt\.issotrx\s*=\s*'Y'\s+THEN\s+'sales-invoice'\s+ELSE\s+'purchase-invoice'\s+END/i,
    );
  });

  it('maps M_INVENTORY to physical-inventory', () => {
    assert.match(DOC_WINDOW_CASE, /UPPER\(adt\.tablename\)\s*=\s*'M_INVENTORY'\s+THEN\s+'physical-inventory'/i);
  });

  it('falls back to NULL for document types with no Schema Forge window', () => {
    // e.g. Financial Account Transactions, Matched Purchase Invoices, manual
    // GL Journal postings — these must render as plain, non-clickable text.
    assert.match(DOC_WINDOW_CASE.trim(), /ELSE\s+NULL\s*$/i);
  });
});

// The M_InOut branch is the subtle one: shipments, receipts AND both return
// flavours all live on the SAME table. Classic Etendo's own report only looks
// at issotrx and therefore mislabels return documents — this report corrects
// that by checking dt.isreturn FIRST.
describe('report-journal-entries — M_INOUT return discrimination (ETP-5013)', () => {
  const M_INOUT_BRANCH = (() => {
    const start = DOC_WINDOW_CASE.search(/UPPER\(adt\.tablename\)\s*=\s*'M_INOUT'/i);
    if (start < 0) return '';
    const rest = DOC_WINDOW_CASE.slice(start);
    const end = rest.search(/WHEN\s+UPPER\(adt\.tablename\)\s*=\s*'M_INVENTORY'/i);
    return end < 0 ? rest : rest.slice(0, end);
  })();

  it('isolates the M_INOUT branch', () => {
    assert.ok(M_INOUT_BRANCH.trim().length > 0, 'M_INOUT branch not found');
  });

  it('checks dt.isreturn BEFORE falling back to dt.issotrx alone', () => {
    // Regression guard: if isreturn ever stops being the outer discriminator,
    // a Return Material Receipt would link to the Goods Shipment window.
    const isReturnAt = M_INOUT_BRANCH.search(/dt\.isreturn\s*=\s*'Y'/i);
    const issoTrxAt = M_INOUT_BRANCH.search(/dt\.issotrx\s*=\s*'Y'/i);
    assert.ok(isReturnAt >= 0, 'M_INOUT branch does not check dt.isreturn at all');
    assert.ok(issoTrxAt >= 0, 'M_INOUT branch does not check dt.issotrx at all');
    assert.ok(isReturnAt < issoTrxAt, 'dt.isreturn must be evaluated before dt.issotrx in the M_INOUT branch');
  });

  it('maps the return sales flow to return-material-receipt', () => {
    assert.match(
      M_INOUT_BRANCH,
      /dt\.isreturn\s*=\s*'Y'\s+THEN\s+CASE\s+WHEN\s+dt\.issotrx\s*=\s*'Y'\s+THEN\s+'return-material-receipt'\s+ELSE\s+'return-to-vendor-shipment'\s+END/i,
    );
  });

  it('maps the non-return flow to goods-shipment / goods-receipt', () => {
    assert.match(
      M_INOUT_BRANCH,
      /ELSE\s+CASE\s+WHEN\s+dt\.issotrx\s*=\s*'Y'\s+THEN\s+'goods-shipment'\s+ELSE\s+'goods-receipt'\s+END/i,
    );
  });

  it('emits all four M_INOUT window names exactly once each', () => {
    for (const win of ['goods-shipment', 'goods-receipt', 'return-material-receipt', 'return-to-vendor-shipment']) {
      const hits = M_INOUT_BRANCH.split(`'${win}'`).length - 1;
      assert.equal(hits, 1, `expected '${win}' exactly once in the M_INOUT branch, found ${hits}`);
    }
  });
});

// ── Part 3: the template markup ────────────────────────────────────────────

const ENTRY_NO_LINE = JE_TEMPLATE_SRC.split('\n').find((l) => l.includes('class="entry-no"'));

describe('report-journal-entries — entry number link markup (ETP-5013)', () => {
  it('has exactly one entry-no cell to wire (single rendering branch)', () => {
    const cells = JE_TEMPLATE_SRC.split('\n').filter((l) => l.includes('class="entry-no"'));
    assert.equal(cells.length, 1, `expected 1 entry-no cell, found ${cells.length}`);
  });

  it('guards the link behind an {{#if doc_window}} so window-less entries stay plain', () => {
    assert.match(ENTRY_NO_LINE, /\{\{#if \(lookup this 'doc_window'\)\}\}/);
    assert.match(ENTRY_NO_LINE, /\{\{else\}\}/);
  });

  it('posts the message to window.parent (the report renders inside an iframe)', () => {
    assert.match(ENTRY_NO_LINE, /window\.parent\.postMessage\(/);
  });

  it("reuses the generic 'navigate-invoice' message type already handled by the shell", () => {
    assert.match(ENTRY_NO_LINE, /type:'navigate-invoice'/);
  });

  it('carries doc_record_id as the target document id', () => {
    // doc_record_id, not record_id (ETP-5013 follow-up): they are the same
    // value for every window except financial-account, whose row points at a
    // transaction while the URL must open its PARENT account.
    assert.match(ENTRY_NO_LINE, /invoiceId:'\{\{lookup this 'doc_record_id'\}\}'/);
  });

  it('carries the optional deep-link key and value for windows that need one', () => {
    // Key and value stay SEPARATE all the way to the shell — see the
    // applyPlaceholders regression test below for why the '=' must not
    // appear next to a quote inside the report's SQL.
    assert.match(ENTRY_NO_LINE, /docQueryKey:'\{\{lookup this 'doc_query_key'\}\}'/);
    assert.match(ENTRY_NO_LINE, /docQueryValue:'\{\{lookup this 'record_id'\}\}'/);
  });

  it('carries the resolved doc_window so the shell knows which window to open', () => {
    assert.match(ENTRY_NO_LINE, /docWindow:'\{\{lookup this 'doc_window'\}\}'/);
  });

  it('marks the clickable text with the entry-link class', () => {
    assert.match(ENTRY_NO_LINE, /<span class="entry-link"/);
  });

  it('styles entry-link as an affordance (pointer cursor + link colour + underline)', () => {
    assert.match(JE_TEMPLATE_SRC, /\.entry-link\s*\{[^}]*cursor:\s*pointer/);
    assert.match(JE_TEMPLATE_SRC, /\.entry-link\s*\{[^}]*text-decoration:\s*underline/);
    assert.match(JE_TEMPLATE_SRC, /\.entry-link:hover\s*\{/);
  });
});

// ── Part 4: real render, all nine windows + the null case ──────────────────

const WINDOW_CASES = [
  { doc_window: 'sales-invoice', document_type: 'AR Invoice' },
  { doc_window: 'purchase-invoice', document_type: 'AP Invoice' },
  { doc_window: 'goods-shipment', document_type: 'MM Shipment' },
  { doc_window: 'goods-receipt', document_type: 'MM Receipt' },
  { doc_window: 'return-material-receipt', document_type: 'MM Return Material Receipt' },
  { doc_window: 'return-to-vendor-shipment', document_type: 'MM Return to Vendor Shipment' },
  { doc_window: 'physical-inventory', document_type: 'MM Physical Inventory' },
  // ETP-5013 follow-up. "Amortization" reaches the report labelled 'Journal'
  // (document_type's own COALESCE falls through to that literal for
  // A_Amortization rows, which have no c_doctype name) — the LINK is driven
  // by doc_window, never by the label, so it links while still reading
  // "Journal", exactly as Classic does.
  { doc_window: 'matched-purchase-invoices', document_type: 'Match Invoice' },
  { doc_window: 'amortization', document_type: 'Journal' },
  {
    doc_window: 'financial-account',
    document_type: 'Financial Account Transaction',
    doc_record_id: 'ACCT0000000000000000000000000',
    doc_query_key: 'txnAny',
  },
  { doc_window: null, document_type: 'Journal' },
];

const ROWS = WINDOW_CASES.map((c, i) => ({
  dateacct: '2026-01-15',
  entry_no: i + 1,
  document_type: c.document_type,
  doc_window: c.doc_window,
  entry_description: '',
  bpname: null,
  productname: null,
  projectname: null,
  costcentername: null,
  fact_acct_group_id: `group-${i + 1}`,
  record_id: `REC${String(i + 1).padStart(29, '0')}`,
  // doc_record_id is what the URL path uses — same as record_id for every
  // window except financial-account, which navigates to the PARENT account
  // and carries the transaction in doc_query instead.
  doc_record_id: c.doc_record_id ?? `REC${String(i + 1).padStart(29, '0')}`,
  doc_query_key: c.doc_query_key ?? null,
  ad_table_id: '318',
  account_no: '43000',
  account_name: 'Clientes',
  amtacctdr: 100,
  amtacctcr: 0,
}));

function renderReport(rows) {
  const hb = Handlebars.create();
  registerReportHelpers(hb);
  return hb.compile(JE_TEMPLATE_SRC)({
    css: '',
    rows,
    meta: {
      title: 'Journal Entries',
      generatedAt: '2026-01-15',
      filters: [],
      labels: {},
      params: { showDimensions: 'false', showEntryDescription: 'false' },
      ui: { generatedBy: 'test' },
    },
  });
}

// Grab the rendered <td class="entry-no"> cell for each entry, in row order.
function entryCells(html) {
  return [...html.matchAll(/<td class="entry-no">([\s\S]*?)<\/td>/g)].map((m) => m[1]);
}

describe('report-journal-entries — rendered entry link output (ETP-5013)', () => {
  const HTML = renderReport(ROWS);
  const CELLS = entryCells(HTML);

  it('renders one entry-no header cell per accounting entry', () => {
    assert.equal(CELLS.length, WINDOW_CASES.length);
  });

  for (const [i, c] of WINDOW_CASES.entries()) {
    if (c.doc_window === null) continue;
    it(`renders a clickable link for ${c.doc_window} with the right record_id and docWindow`, () => {
      const cell = CELLS[i];
      const expected =
        `<span class="entry-link" onclick="window.parent.postMessage({type:'navigate-invoice',` +
        `invoiceId:'${ROWS[i].doc_record_id}',docWindow:'${c.doc_window}',` +
        `docQueryKey:'${ROWS[i].doc_query_key ?? ''}',` +
        `docQueryValue:'${ROWS[i].record_id}'},'*')">${ROWS[i].entry_no}</span>`;
      assert.equal(cell, expected);
    });
  }

  it('renders the window-less (Journal) entry as bare text — no span, no onclick', () => {
    const nullIndex = WINDOW_CASES.findIndex((c) => c.doc_window === null);
    const cell = CELLS[nullIndex];
    assert.equal(cell.trim(), String(ROWS[nullIndex].entry_no));
    assert.doesNotMatch(cell, /<span/);
    assert.doesNotMatch(cell, /onclick/);
    assert.doesNotMatch(cell, /postMessage/);
  });

  it('never emits the literal string "null" as a docWindow', () => {
    assert.doesNotMatch(HTML, /docWindow:'null'/);
    assert.doesNotMatch(HTML, /docWindow:''/);
  });

  it('emits each of the seven windows exactly once across the report', () => {
    for (const c of WINDOW_CASES) {
      if (c.doc_window === null) continue;
      const hits = HTML.split(`docWindow:'${c.doc_window}'`).length - 1;
      assert.equal(hits, 1, `expected docWindow '${c.doc_window}' once, found ${hits}`);
    }
  });

  it('keeps every postMessage payload safely inside its single-quoted JS literal', () => {
    for (const payload of [...HTML.matchAll(/invoiceId:'([^']*)'/g)].map((m) => m[1])) {
      assert.doesNotMatch(payload, /['"\\\n]/);
    }
  });

  it('leaves the rest of the report intact (line rows still render)', () => {
    assert.match(HTML, /<tr class="entry-line">/);
    assert.match(HTML, /Clientes/);
  });
});

// ── Part 5: mock-data.json must carry doc_window for the dev preview ───────

describe('report-journal-entries — mock-data.json doc_window coverage (ETP-5013)', () => {
  const MOCK = JSON.parse(JE_MOCK_RAW);

  it('is valid JSON with a non-empty array of rows', () => {
    assert.ok(Array.isArray(MOCK));
    assert.ok(MOCK.length > 0);
  });

  it('declares doc_window on every row (undefined would break the {{#if}} silently)', () => {
    for (const [i, row] of MOCK.entries()) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(row, 'doc_window'),
        `mock row ${i} is missing the doc_window key`,
      );
    }
  });

  it('leaves the Journal entry (entry_no 1) without a window', () => {
    for (const row of MOCK.filter((r) => r.entry_no === 1)) {
      assert.equal(row.document_type, 'Journal');
      assert.equal(row.doc_window, null);
    }
  });

  it('maps the AR Invoice entry to sales-invoice', () => {
    const rows = MOCK.filter((r) => r.document_type === 'AR Invoice');
    assert.ok(rows.length > 0, 'no AR Invoice rows in mock-data.json');
    for (const row of rows) assert.equal(row.doc_window, 'sales-invoice');
  });

  it('maps the AP Invoice entry to purchase-invoice', () => {
    const rows = MOCK.filter((r) => r.document_type === 'AP Invoice');
    assert.ok(rows.length > 0, 'no AP Invoice rows in mock-data.json');
    for (const row of rows) assert.equal(row.doc_window, 'purchase-invoice');
  });

  it('gives every linkable mock row a record_id to navigate to', () => {
    for (const row of MOCK.filter((r) => r.doc_window)) {
      assert.ok(row.record_id, `row with doc_window ${row.doc_window} has no record_id`);
    }
  });

  it('renders the mock rows through the real template without emitting a bogus link', () => {
    const html = renderReport(MOCK);
    assert.doesNotMatch(html, /docWindow:'null'/);
    assert.match(html, /docWindow:'sales-invoice'/);
    assert.match(html, /docWindow:'purchase-invoice'/);
  });
});
