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
 * @apply, the posted/paid/SIF guards, and that accounting rows are never written.
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
const [disableStmt, taxStmt, orderStmt, enableStmt] = applyStatements;

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
  it('runs two repair statements between the AD trigger switches', () => {
    assert.equal(applyStatements.length, 4);
    assert.equal(disableStmt, 'SELECT ad_disable_triggers()');
    assert.equal(enableStmt, 'SELECT ad_enable_triggers()');
  });

  it('scopes @check, every repair statement and @report to :client_id', () => {
    for (const [name, sql] of [['@check', normCheck], ['tax', taxStmt], ['order', orderStmt], ['@report', normReport]]) {
      assert.ok(sql.includes('i.ad_client_id = :client_id'), `${name} misses the tenant filter`);
    }
    for (const target of ['t', 'psd', 'ps', 'i']) {
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
  it('leaves posted, tax-authority-sent and paid invoices alone', () => {
    for (const guard of [
      "r.posted <> 'Y'",
      "fa.ad_table_id = '318'",
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

  it('never writes accounting, invoice lines or line taxes', () => {
    const body = stripComments(fix.apply);
    assert.doesNotMatch(body, /(UPDATE|DELETE FROM|INSERT INTO)\s+fact_acct/i);
    assert.doesNotMatch(body, /(UPDATE|DELETE FROM|INSERT INTO)\s+c_invoicelinetax/i);
    assert.doesNotMatch(body, /\btotallines\s*=/i);
    assert.doesNotMatch(body, /\bposted\s*=\s*'/i);
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
});
