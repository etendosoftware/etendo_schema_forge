import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp } from '../src/data-fixes/parse-fix.js';

/**
 * @covers cli/src/data-fixes/sql/20261016T185257Z__R50-rectificative-dup-tax-and-order-link.sql
 *
 * Static + parse validation for the R50 corrective data-fix (ETP-5729).
 *
 * Rectificative invoices created from a return document before ETP-5729 carry a hand-made
 * Recalculate='N' C_InvoiceTax row next to the trigger-made one (doubled tax in GrandTotal,
 * outstanding and payment plan), and lines still linked to the original order line (the order
 * reads as partially invoiced). Code-side twin: com.etendoerp.go commit e4a1a1a26.
 *
 * Row-level behaviour was checked read-only against the local DB (the fixable sets and their
 * resulting totals/quantities, plus EXPLAIN of every @apply statement); this suite guards the SQL
 * the fix ships: metadata, ordering, tenant scoping, the bug signature shared by @check and
 * @apply, the period/cash-flow/paid/SIF guards, the ResetAccounting-equivalent reset of posted
 * invoices (Fact_Acct deleted, Posted='N', never re-posted) and the RESET list read back by
 * @report from the run's temp table.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');
const FIX_FILE = '20261016T185257Z__R50-rectificative-dup-tax-and-order-link.sql';
const FIX_ID = basename(FIX_FILE, '.sql');

const fix = parseFix(readFileSync(join(SQL_DIR, FIX_FILE), 'utf8'), FIX_ID);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const stripComments = (s) => s.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
const normCheck = norm(stripComments(fix.check));
const normReport = norm(stripComments(fix.report));
const applyStatements = stripComments(fix.apply).split(';').map(norm).filter(Boolean);
const [dropStmt, disableStmt, taxStmt, orderStmt, enableStmt] = applyStatements;
const TEMP_TABLE = 'etgo_r50_tax_repaired';

const RECT_SIGNATURE = [
  "i.processed = 'Y'",
  "i.docstatus = 'CO'",
  'rv.c_invoice_id = i.c_invoice_id',
  "dt.isreturn = 'Y'",
];
const DUP_TAX_SIGNATURE = ["n.recalculate = 'N'", 'y.c_tax_id = n.c_tax_id', "y.recalculate = 'Y'"];
const ORDER_LINK_SIGNATURE = [
  'orig.m_inoutline_id = iol.canceled_inoutline_id',
  'il.qtyinvoiced < 0',
  'il.c_orderline_id = orig.c_orderline_id',
];

describe('R50 data-fix — header metadata', () => {
  it('parses with the expected id, gap, type and risk, and ships a @report', () => {
    assert.equal(fix.id, 'R50-rectificative-dup-tax-and-order-link');
    assert.equal(fix.gap, 'ETP-5729');
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'medium');
    assert.match(fix.description, /rectificative/);
    assert.ok(fix.report, '@report section is required to list the documents left alone');
  });

  it('sorts after R48 and after R49 (the latest fix on any branch when it was written)', () => {
    const ts = parseFixTimestamp(FIX_ID).getTime();
    for (const previous of [
      '20261009T151500Z__R48-owner-display-name-from-account',
      '20261015T184242Z__R49-bpartner-currency-from-org',
    ]) {
      assert.ok(ts > parseFixTimestamp(previous).getTime(), `must sort after ${previous}`);
    }
  });
});

describe('R50 data-fix — scope and signature', () => {
  it('drops the previous temp table, then runs two repair statements between the AD trigger switches', () => {
    assert.equal(applyStatements.length, 5);
    assert.equal(dropStmt, `DROP TABLE IF EXISTS ${TEMP_TABLE}`);
    assert.equal(disableStmt, 'SELECT ad_disable_triggers()');
    assert.equal(enableStmt, 'SELECT ad_enable_triggers()');
  });

  it('scopes @check, every repair statement and @report to :client_id', () => {
    for (const [name, sql] of [['@check', normCheck], ['tax', taxStmt], ['order', orderStmt], ['@report', normReport]]) {
      assert.ok(sql.includes('i.ad_client_id = :client_id'), `${name} misses the tenant filter`);
    }
    for (const target of ['t', 'psd', 'ps', 'i', 'fa', 'o', 'pc', 'cfs']) {
      assert.ok(taxStmt.includes(`${target}.ad_client_id = :client_id`), `tax step writes ${target} unscoped`);
    }
    for (const target of ['ol', 'm', 'il']) {
      assert.ok(orderStmt.includes(`${target}.ad_client_id = :client_id`), `order step writes ${target} unscoped`);
    }
  });

  it('detects by the bug signature in @check and in the matching @apply step, never by document number', () => {
    for (const clause of [...RECT_SIGNATURE, ...DUP_TAX_SIGNATURE]) {
      assert.ok(normCheck.includes(clause), `@check misses: ${clause}`);
      assert.ok(taxStmt.includes(clause), `tax step misses: ${clause}`);
    }
    for (const clause of ORDER_LINK_SIGNATURE) {
      assert.ok(normCheck.includes(clause), `@check misses: ${clause}`);
      assert.ok(orderStmt.includes(clause), `order step misses: ${clause}`);
    }
    assert.doesNotMatch(`${normCheck} ${taxStmt} ${orderStmt}`, /documentno\s*(=|IN)/i);
  });
});

describe('R50 data-fix — tax repair guards', () => {
  it('leaves closed-period, cash-flow-referenced, tax-authority-sent and paid invoices alone', () => {
    for (const guard of [
      "fa.ad_table_id = '318'",
      "pc.periodstatus = 'O'",
      "pc.periodstatus IN ('C', 'P')",
      'pc.ad_org_id = o.ad_periodcontrolallowed_org_id',
      'co.ad_org_id = o.ad_calendarowner_org_id',
      "r.dateacct < p.enddate + INTERVAL '1 day'",
      'pc.c_period_id = fa.c_period_id AND pc.ad_org_id = o.ad_periodcontrolallowed_org_id AND pc.docbasetype = fa.docbasetype',
      'NOT EXISTS (SELECT 1 FROM fact_closed fc WHERE fc.c_invoice_id = r.c_invoice_id)',
      'JOIN fact_acct_cfs cfs ON cfs.fact_acct_ref_id = fa.fact_acct_id',
      "COALESCE(to_jsonb(r) ->> 'em_etvfac_senttoverifac', 'N') <> 'Y'",
      "COALESCE(to_jsonb(r) ->> 'em_aeatsii_issent', 'N') <> 'Y'",
      "COALESCE(to_jsonb(r) ->> 'em_tbai_issent', 'N') <> 'Y'",
      'COALESCE(r.totalpaid, 0) = 0',
      'psd.fin_payment_detail_id IS NOT NULL',
      "COALESCE(r.iscashvat, 'N') <> 'Y'",
    ]) {
      assert.ok(taxStmt.includes(guard), `tax step misses guard: ${guard}`);
    }
  });

  it('only repairs the exact duplicated pattern: total = lines + every tax row', () => {
    assert.ok(taxStmt.includes('AND r.grandtotal = r.totallines + (SELECT COALESCE(SUM(t.taxamt), 0) FROM c_invoicetax t'));
  });

  it('takes the same delta off the header, the schedule and its unpaid detail', () => {
    assert.ok(taxStmt.includes('SET grandtotal = f.grandtotal - f.delta, outstandingamt = f.outstandingamt - f.delta'));
    assert.ok(taxStmt.includes('SET amount = ps.amount - f.delta, outstandingamt = ps.outstandingamt - f.delta'));
    assert.ok(taxStmt.includes('SET amount = psd.amount - f.delta'));
    assert.ok(taxStmt.includes('psd.fin_payment_detail_id IS NULL'));
  });

  it('never writes invoice lines or line taxes, and never inserts accounting', () => {
    const body = stripComments(fix.apply);
    assert.doesNotMatch(body, /INSERT INTO\s+fact_acct/i);
    assert.doesNotMatch(body, /(UPDATE|DELETE FROM|INSERT INTO)\s+c_invoicelinetax/i);
    assert.doesNotMatch(body, /\btotallines\s*=/i);
  });
});

describe('R50 data-fix — accounting reset of posted invoices', () => {
  it('deletes only the facts of posted invoices that passed every guard', () => {
    assert.ok(taxStmt.includes(
      "DELETE FROM fact_acct fa USING fixable f WHERE fa.ad_table_id = '318' AND fa.record_id = f.c_invoice_id AND f.is_posted",
    ));
    assert.equal((taxStmt.match(/DELETE FROM fact_acct\b/g) || []).length, 1);
  });

  it('clears DateBalanced on the other facts sharing a Record_ID2, never on the deleted ones', () => {
    assert.ok(taxStmt.includes('UPDATE fact_acct o SET datebalanced = NULL'));
    assert.ok(taxStmt.includes('fa.record_id2 = o.record_id2'));
    assert.ok(taxStmt.includes('own.fact_acct_id = o.fact_acct_id'));
  });

  it("sets Posted='N' and Processing='N' only on reset invoices and never re-posts", () => {
    assert.ok(taxStmt.includes("posted = CASE WHEN f.is_posted THEN 'N' ELSE i.posted END"));
    assert.ok(taxStmt.includes("processing = CASE WHEN f.is_posted THEN 'N' ELSE i.processing END"));
    // No literal assignment of Posted anywhere (SET posted = '…' / , posted = '…'): only the CASE.
    assert.doesNotMatch(stripComments(fix.apply), /(SET|,)\s*posted\s*=\s*'/i);
  });

  it('captures the repaired invoices for @report, which lists the reset ones as RESET', () => {
    assert.ok(taxStmt.includes(`INTO TEMP TABLE ${TEMP_TABLE} FROM upd_invoice`));
    assert.ok(normReport.includes(`FROM ${TEMP_TABLE} t WHERE t.is_posted`));
    assert.ok(normReport.includes("'RESET: "));
    assert.ok(normReport.includes("'PERIOD_CLOSED: "));
    assert.ok(normReport.includes("'CASH_FLOW_STATEMENT: "));
    assert.doesNotMatch(normReport, /POSTED: unpost/);
  });
});

describe('R50 data-fix — order repair', () => {
  it('gives the returned quantity back only while it stays within the ordered quantity', () => {
    assert.ok(orderStmt.includes('BETWEEN LEAST(0, ol.qtyordered) AND GREATEST(0, ol.qtyordered)'));
    assert.ok(orderStmt.includes('SET qtyinvoiced = ol.qtyinvoiced - f.returned'));
  });

  it('unlinks the line and drops only the order-level match rows', () => {
    assert.ok(orderStmt.includes('UPDATE c_invoiceline il SET c_orderline_id = NULL'));
    assert.ok(orderStmt.includes('DELETE FROM m_matchso m'));
    assert.ok(orderStmt.includes('DELETE FROM m_matchpo m'));
    assert.equal((orderStmt.match(/m\.m_inoutline_id IS NULL/g) || []).length, 2);
  });

  it('never drops a posted match row: an invoice with one is left out of the order repair whole', () => {
    for (const [alias, table, id] of [['mp', 'M_MATCHPO', 'm_matchpo_id'], ['ms', 'M_MATCHSO', 'm_matchso_id']]) {
      for (const sql of [orderStmt, normReport]) {
        assert.ok(sql.includes(`${alias}.posted <> 'N'`), `${table}: Posted guard missing`);
        assert.ok(sql.includes(`UPPER(tb.tablename) = '${table}' AND fa.record_id = ${alias}.${id}`),
          `${table}: Fact_Acct guard missing`);
        assert.ok(sql.includes(`${alias}.ad_client_id = :client_id`), `${table} read unscoped`);
      }
    }
    // The exclusion is by invoice (not by line), and ord_line feeds every write of the step.
    assert.ok(orderStmt.includes(
      'ord_line AS ( SELECT l.c_invoiceline_id, l.c_orderline_id, l.qtyinvoiced FROM ord_line_all l '
      + 'WHERE NOT EXISTS (SELECT 1 FROM posted_match_inv pm WHERE pm.c_invoice_id = l.c_invoice_id)',
    ));
    assert.ok(orderStmt.includes('fa.ad_client_id = :client_id'));
  });

  it('reports a POSTED_MATCH invoice before the over-invoiced reason', () => {
    const posted = normReport.indexOf("'POSTED_MATCH: ");
    const over = normReport.indexOf("'ORDER_LINE_OVER_INVOICED: ");
    assert.ok(posted > 0 && over > posted, 'POSTED_MATCH must be the first branch of the order reason');
  });
});
