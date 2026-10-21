// @covers cli/src/data-fixes/sql/20261019T141632Z__R50-gl-journal-foreign-doctype.sql
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R50 corrective data-fix (ETP-5719).
 *
 * Before ETP-5682 a new manual journal could take another tenant's GLJ document type, so it was
 * numbered from the foreign sequence and the tenant's own GLJ sequence fell behind (next journal
 * can hit gl_journal_docno). Posting also copied the foreign doctype and GL category into
 * fact_acct. The fix advances the own GLJ sequences, repoints the facts, then the journal header.
 *
 * Row-level behaviour was verified against a live DB (see the ETP-5719 ledger); this suite checks
 * the SQL the fix ships: metadata, ordering, tenant scoping, the forward-only sequence guard, the
 * statement order and the target-doctype choice.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');
const FIX_FILE = '20261019T141632Z__R50-gl-journal-foreign-doctype.sql';
const FIX_ID = basename(FIX_FILE, '.sql');

const fix = parseFix(readFileSync(join(SQL_DIR, FIX_FILE), 'utf8'), FIX_ID);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const stripComments = (s) => s.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
const normCheck = norm(stripComments(fix.check));
const normReport = norm(stripComments(fix.report));
const [seqUpdate, factUpdate, journalUpdate, ...extra] = stripComments(fix.apply).split(';').map(norm).filter(Boolean);

describe('R50 data-fix — header metadata', () => {
  it('parses with the expected id, gap, type and risk', () => {
    assert.equal(fix.id, 'R50-gl-journal-foreign-doctype');
    assert.equal(fix.gap, 'ETP-5719');
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'medium');
  });

  // Pinned to the latest fix that existed when R50 shipped (the R41/R44 precedent).
  it('sorts after R49-bpartner-currency-from-org, the latest fix when it shipped', () => {
    assert.ok(
      parseFixTimestamp(FIX_ID).getTime()
        > parseFixTimestamp('20261015T184242Z__R49-bpartner-currency-from-org').getTime(),
    );
  });
});

describe('R50 data-fix — scope and statement order', () => {
  it('@check matches journals of this tenant on another tenant\'s doctype', () => {
    assert.match(normCheck, /j\.ad_client_id = :client_id/);
    assert.match(normCheck, /dt\.ad_client_id <> :client_id/);
  });

  // fact_acct must run before gl_journal: the header update erases the "foreign doctype" marker
  // the fact update joins on.
  it('runs sequence, fact_acct, gl_journal updates in that order, and nothing else', () => {
    assert.equal(extra.length, 0);
    assert.match(seqUpdate, /^UPDATE ad_sequence s /);
    assert.match(factUpdate, /^UPDATE fact_acct f /);
    assert.match(journalUpdate, /^UPDATE gl_journal j /);
  });

  it('scopes every statement to :client_id and never deletes', () => {
    for (const stmt of [seqUpdate, factUpdate, journalUpdate]) {
      assert.match(stmt, /ad_client_id = :client_id/);
      assert.doesNotMatch(stmt, /\bDELETE\b/i);
    }
  });
});

describe('R50 data-fix — sequence advance', () => {
  it('only advances the tenant\'s own active GLJ sequences, forward-only', () => {
    assert.match(seqUpdate, /s\.ad_client_id = :client_id/);
    assert.match(seqUpdate, /docbasetype = 'GLJ'/);
    assert.match(seqUpdate, /isactive = 'Y'/);
    assert.match(seqUpdate, /s\.currentnext < m\.nxt/);
  });

  it('derives the next number from numeric documentnos only', () => {
    assert.match(seqUpdate, /MAX\(documentno::numeric\) \+ 1/);
    assert.match(seqUpdate, /documentno ~ '\^\[0-9\]\+\$'/);
  });
});

describe('R50 data-fix — repoint', () => {
  it('repoints both the doctype and the GL category of GL journal facts', () => {
    assert.match(factUpdate, /SET c_doctype_id = t\.c_doctype_id, gl_category_id = t\.gl_category_id,/);
    assert.match(factUpdate, /f\.ad_table_id = '224'/);
    assert.match(factUpdate, /f\.record_id = j\.gl_journal_id/);
  });

  it('only touches journals whose current doctype belongs to another tenant', () => {
    assert.match(factUpdate, /fdt\.ad_client_id <> :client_id/);
    assert.match(journalUpdate, /fdt\.ad_client_id <> :client_id/);
  });

  // Mirrors the ETP-5682 defaultExpr ordering, so a repointed journal lands on the doctype a new
  // journal in that org would get. Fragments, not the full expression, to stay decoupled from it.
  it('picks the own GLJ doctype by IsDefault, then the closest org', () => {
    for (const stmt of [factUpdate, journalUpdate]) {
      assert.match(stmt, /CROSS JOIN LATERAL/);
      assert.match(stmt, /dt\.docbasetype = 'GLJ' AND dt\.isactive = 'Y'/);
      assert.match(stmt, /ORDER BY dt\.isdefault DESC, ad_isorgincluded\(j2?\.ad_org_id, dt\.ad_org_id, j2?\.ad_client_id\) ASC, dt\.c_doctype_id LIMIT 1/);
    }
  });
});

describe('R50 data-fix — @report', () => {
  it('lists journals and facts that are still foreign after the apply', () => {
    assert.match(normReport, /^SELECT 'journal still foreign/);
    assert.match(normReport, /UNION ALL SELECT DISTINCT 'fact_acct still foreign'/);
    assert.match(normReport, /f\.ad_table_id = '224'/);
  });
});
