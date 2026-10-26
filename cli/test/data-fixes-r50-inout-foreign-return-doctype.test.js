// @covers cli/src/data-fixes/sql/20261021T120000Z__R50-inout-foreign-return-doctype.sql
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R50 corrective data-fix that repoints return-to-vendor
 * shipments created on another tenant's RTV document type.
 *
 * Row-level behaviour (posted/draft shipments, sequences, multi-org choice, the @20501@ trigger
 * bypass, client isolation) needs a live Etendo DB: there is no DB harness in cli/test (the
 * data-fix tests either source-read the SQL or use a fake pool), so those rows were verified
 * manually with the real runner. This suite guards what the shipped SQL text must keep doing:
 * metadata, scoping, statement order, trigger-bypass placement, the sequence guards, the
 * target-doctype choice and the @check/@report contract.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');
const FIX_FILE = '20261021T120000Z__R50-inout-foreign-return-doctype.sql';
const FIX_ID = basename(FIX_FILE, '.sql');

const fix = parseFix(readFileSync(join(SQL_DIR, FIX_FILE), 'utf8'), FIX_ID);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const stripComments = (s) => s.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
const normCheck = norm(stripComments(fix.check));
const normReport = norm(stripComments(fix.report));
const stmts = stripComments(fix.apply).split(';').map(norm).filter(Boolean);
const [seqUpdate, factUpdate, disable, inoutUpdate, enable, ...extra] = stmts;

describe('R50 inout-foreign-return-doctype — header metadata', () => {
  it('parses with the expected id, gap, type and risk', () => {
    assert.equal(fix.id, 'R50-inout-foreign-return-doctype');
    assert.equal(fix.gap, 'ETP-5801');
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'medium');
  });

  it('sorts after the R50 GL journal fix, which shipped before it', () => {
    assert.ok(
      parseFixTimestamp(FIX_ID).getTime()
        > parseFixTimestamp('20261019T141632Z__R50-gl-journal-foreign-doctype').getTime(),
    );
  });
});

describe('R50 inout-foreign-return-doctype — statement order (guard 5, 7)', () => {
  // The m_inout update erases the "foreign doctype" marker the sequence and fact joins rely on.
  it('runs sequence, fact_acct, then the m_inout update, and nothing else', () => {
    assert.equal(extra.length, 0);
    assert.equal(stmts.length, 5);
    assert.match(seqUpdate, /^UPDATE ad_sequence s /);
    assert.match(factUpdate, /^UPDATE fact_acct f /);
    assert.match(inoutUpdate, /^UPDATE m_inout m /);
  });

  it('never deletes and scopes every update to :client_id', () => {
    for (const stmt of [seqUpdate, factUpdate, inoutUpdate]) {
      assert.match(stmt, /ad_client_id = :client_id/);
      assert.doesNotMatch(stmt, /\bDELETE\b/i);
    }
  });
});

describe('R50 inout-foreign-return-doctype — trigger bypass (guard 7)', () => {
  it('wraps ONLY the m_inout update between ad_disable_triggers and ad_enable_triggers', () => {
    assert.equal(disable, 'SELECT ad_disable_triggers()');
    assert.equal(enable, 'SELECT ad_enable_triggers()');
    assert.ok(stmts.indexOf(disable) + 1 === stmts.indexOf(inoutUpdate));
    assert.ok(stmts.indexOf(inoutUpdate) + 1 === stmts.indexOf(enable));
  });

  it('keeps the sequence and fact_acct updates outside the bypass', () => {
    assert.ok(stmts.indexOf(seqUpdate) < stmts.indexOf(disable));
    assert.ok(stmts.indexOf(factUpdate) < stmts.indexOf(disable));
  });

  it('does not use a session-level switch that could leak past COMMIT', () => {
    assert.doesNotMatch(stripComments(fix.apply), /DISABLE TRIGGER|session_replication_role|set_config\(/i);
  });
});

describe('R50 inout-foreign-return-doctype — scope (guards 8, 9)', () => {
  it('only matches foreign doctypes that are return-to-vendor (MMR, IsReturn Y)', () => {
    for (const stmt of [normCheck, seqUpdate, factUpdate, inoutUpdate, normReport.split(' UNION ALL ')[0]]) {
      assert.match(stmt, /\.docbasetype = 'MMR'/);
      assert.match(stmt, /\.isreturn = 'Y'/);
    }
  });

  it('only matches shipments whose doctype belongs to ANOTHER tenant', () => {
    for (const stmt of [normCheck, seqUpdate, factUpdate, inoutUpdate]) {
      assert.match(stmt, /\.ad_client_id <> :client_id/);
    }
  });

  it('never touches rows of a client other than the one passed', () => {
    assert.match(normCheck, /m\.ad_client_id = :client_id/);
    assert.match(factUpdate, /f\.ad_client_id = :client_id/);
    assert.match(factUpdate, /m\.ad_client_id = :client_id/);
    assert.match(inoutUpdate, /m\.ad_client_id = :client_id/);
    assert.match(inoutUpdate, /m2\.ad_client_id = :client_id/);
  });

  it('does not filter on Processed, so draft and posted shipments are both repointed (guard 3)', () => {
    assert.doesNotMatch(inoutUpdate, /processed|docstatus/i);
  });
});

describe('R50 inout-foreign-return-doctype — target doctype choice (guards 1, 6)', () => {
  it('uses only the same tenant\'s active, org-visible RTV purchase doctype', () => {
    for (const stmt of [seqUpdate, factUpdate, inoutUpdate]) {
      assert.match(stmt, /dt3?\.ad_client_id = m[23]?\.ad_client_id/);
      assert.match(stmt, /dt3?\.issotrx = 'N'/);
      assert.match(stmt, /dt3?\.isactive = 'Y'/);
      assert.match(stmt, /ad_isorgincluded\(m[23]?\.ad_org_id, dt3?\.ad_org_id, m[23]?\.ad_client_id\) <> -1/);
    }
  });

  it('orders by IsDefault, then closest org, then c_doctype_id, and takes one', () => {
    for (const stmt of [seqUpdate, factUpdate, inoutUpdate]) {
      assert.match(
        stmt,
        /ORDER BY dt3?\.isdefault DESC, ad_isorgincluded\(m[23]?\.ad_org_id, dt3?\.ad_org_id, m[23]?\.ad_client_id\) ASC, dt3?\.c_doctype_id LIMIT 1/,
      );
    }
  });

  // CROSS JOIN LATERAL yields no row when the tenant has no own doctype, so the shipment is skipped.
  it('uses a CROSS JOIN LATERAL, so a tenant with no own doctype is left untouched', () => {
    for (const stmt of [factUpdate, inoutUpdate]) {
      assert.match(stmt, /CROSS JOIN LATERAL/);
      assert.doesNotMatch(stmt, /LEFT JOIN LATERAL|COALESCE\(t\./);
    }
  });
});

describe('R50 inout-foreign-return-doctype — fact_acct repoint (guard 2)', () => {
  it('repoints doctype and GL category of M_InOut facts only, leaving amounts alone', () => {
    assert.match(factUpdate, /SET c_doctype_id = t\.c_doctype_id, gl_category_id = t\.gl_category_id,/);
    assert.match(factUpdate, /f\.ad_table_id = '319'/);
    assert.match(factUpdate, /f\.record_id = m\.m_inout_id/);
    assert.doesNotMatch(factUpdate, /amtacct|amtsource|\bdateacct\b|SET [^W]*\b(dr|cr)\b/i);
  });

  it('only sets the m_inout doctype (MovementType is left as stored)', () => {
    assert.match(inoutUpdate, /SET c_doctype_id = t\.c_doctype_id, updated = now\(\), updatedby = '0'/);
    assert.doesNotMatch(inoutUpdate, /movementtype/i);
  });
});

describe('R50 inout-foreign-return-doctype — sequence advance (guard 5)', () => {
  it('only advances the tenant\'s own sequences, forward-only', () => {
    assert.match(seqUpdate, /s\.ad_client_id = :client_id/);
    assert.match(seqUpdate, /s\.ad_sequence_id = n\.seq_id/);
    assert.match(seqUpdate, /s\.currentnext < n\.nxt/);
  });

  // ad_sequence.currentnext is numeric(10,0): a DocumentNo of 10+ digits would overflow the cast and
  // abort the whole fix for the tenant. Runtime was verified manually in rolled-back transactions
  // (23- and 10-digit shipments still repointed; 999999999 accepted and 1000000000 written; a
  // sequence already at 2000000000 not rewound); this suite only guards the SQL text.
  it('counts only all-digit DocumentNos of 1-9 digits (prefixed or too long ignored)', () => {
    assert.match(
      seqUpdate,
      /MAX\(CASE WHEN u\.documentno ~ '\^\[0-9\]\{1,9\}\$' THEN u\.documentno::numeric END\) \+ 1 AS nxt/,
    );
    assert.match(seqUpdate, /WHERE u\.documentno ~ '\^\[0-9\]\{1,9\}\$' GROUP BY/);
  });

  it('guards the cast in both the CASE and the WHERE, with no unguarded cast left', () => {
    assert.equal((seqUpdate.match(/\{1,9\}/g) || []).length, 2);
    assert.equal((seqUpdate.match(/documentno::numeric/g) || []).length, 1);
    assert.doesNotMatch(seqUpdate, /\^\[0-9\]\+\$/);
  });

  it('applies the length guard to both sets (repointed and already-on-target) via the shared u subquery', () => {
    assert.match(seqUpdate, /UNION ALL/);
    assert.match(seqUpdate, /\) u WHERE u\.documentno ~ '\^\[0-9\]\{1,9\}\$'/);
  });

  it('documents the numeric(10,0) length guard in the header', () => {
    const header = fix.raw ?? readFileSync(join(SQL_DIR, FIX_FILE), 'utf8');
    assert.match(header, /numeric\(10,0\)/);
    assert.match(header, /1 to 9 digits/);
  });

  it('groups per sequence and never takes a tenant-wide MAX over m_inout', () => {
    assert.match(seqUpdate, /GROUP BY u\.seq_id/);
    assert.match(seqUpdate, /UNION ALL/);
    // Both sources are restricted: the shipments being repointed, and shipments already on a target doctype.
    assert.match(seqUpdate, /m2\.ad_client_id = :client_id AND dt2\.ad_client_id = :client_id/);
    assert.match(seqUpdate, /dt2\.c_doctype_id IN \( SELECT t2\.c_doctype_id/);
    assert.equal((seqUpdate.match(/MAX\(/g) || []).length, 1);
  });

  it('skips target doctypes that have no sequence', () => {
    assert.match(seqUpdate, /t\.docnosequence_id IS NOT NULL/);
    assert.match(seqUpdate, /dt2\.docnosequence_id IS NOT NULL/);
  });
});

describe('R50 inout-foreign-return-doctype — @check and @report (guards 1, 4, 10)', () => {
  it('@check only looks at foreign RTV doctypes, with no own-doctype guard (stays listed)', () => {
    assert.match(normCheck, /^SELECT 1 FROM m_inout m JOIN c_doctype fdt/);
    assert.doesNotMatch(normCheck, /LATERAL|ad_isorgincluded/);
  });

  it('@report lists shipments still foreign after the apply', () => {
    assert.match(normReport, /^SELECT 'shipment still foreign \(no own RTV doctype\)'/);
    assert.match(normReport, /m\.m_inout_id AS record_id/);
  });

  it('@report fact_acct branch fires on a foreign doctype OR a foreign GL category', () => {
    assert.match(normReport, /UNION ALL SELECT DISTINCT 'fact_acct still foreign'/);
    assert.match(normReport, /f\.ad_table_id = '319'/);
    assert.match(normReport, /dt\.ad_client_id <> :client_id OR g\.ad_client_id <> :client_id/);
  });

  it('@report fact_acct branch only scans facts of RTV shipments of the client', () => {
    const factBranch = normReport.split('UNION ALL')[1];
    assert.match(factBranch, /JOIN m_inout m ON m\.m_inout_id = f\.record_id AND m\.ad_client_id = :client_id/);
    assert.match(factBranch, /JOIN c_doctype mdt ON mdt\.c_doctype_id = m\.c_doctype_id AND mdt\.docbasetype = 'MMR' AND mdt\.isreturn = 'Y'/);
  });
});
