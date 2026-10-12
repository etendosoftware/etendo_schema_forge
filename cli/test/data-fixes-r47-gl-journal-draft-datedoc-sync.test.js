// @covers cli/src/data-fixes/sql/20261005T160407Z__R47-gl-journal-draft-datedoc-sync.sql
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R47 corrective data-fix (ETP-5611).
 *
 * Draft manual journals could carry DateDoc <> DateAcct: the window shows one "Fecha"
 * (DateAcct) and DateDoc stayed at the creation date. The fix sets DateDoc := DateAcct on drafts
 * only; completed/posted journals are never touched. Code-side twin: GlJournalHeaderHandler
 * mirrors accountingDate into documentDate on every CRUD write (com.etendoerp.go).
 *
 * Row-level behaviour is verified against a live DB (see the ETP-5611 ledger); this suite checks
 * the SQL the fix ships: metadata, ordering, tenant isolation, the draft guard and the direction.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');
const FIX_FILE = '20261005T160407Z__R47-gl-journal-draft-datedoc-sync.sql';
const FIX_ID = basename(FIX_FILE, '.sql');

const fix = parseFix(readFileSync(join(SQL_DIR, FIX_FILE), 'utf8'), FIX_ID);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const stripComments = (s) => s.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
const normCheck = norm(stripComments(fix.check));
const applyStatements = stripComments(fix.apply).split(';').map(norm).filter(Boolean);

const DRAFT_GUARD = [
  "g.docstatus = 'DR'",
  "g.processed = 'N'",
  "g.posted = 'N'",
  'g.datedoc IS DISTINCT FROM g.dateacct',
];

describe('R47 data-fix — header metadata', () => {
  it('parses with the expected id, gap, type and risk', () => {
    assert.equal(fix.id, 'R47-gl-journal-draft-datedoc-sync');
    assert.equal(fix.gap, 'ETP-5611');
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
    assert.match(fix.description, /DateDoc/);
  });

  // Pinned to the latest fix that existed when R47 shipped (the R41/R44 precedent).
  it('sorts after R46-acct-rpt-definitions-redelivery, the latest fix when it shipped', () => {
    assert.ok(
      parseFixTimestamp(FIX_ID).getTime()
        > parseFixTimestamp('20261005T120000Z__R46-acct-rpt-definitions-redelivery').getTime(),
    );
  });
});

describe('R47 data-fix — scope and guard', () => {
  it('scopes @check and the single @apply statement to :client_id', () => {
    assert.match(normCheck, /g\.ad_client_id = :client_id/);
    assert.equal(applyStatements.length, 1);
    assert.match(applyStatements[0], /g\.ad_client_id = :client_id/);
  });

  it('only targets drafts whose dates differ, in both sections', () => {
    for (const clause of DRAFT_GUARD) {
      assert.ok(normCheck.includes(clause), `@check misses: ${clause}`);
      assert.ok(applyStatements[0].includes(clause), `@apply misses: ${clause}`);
    }
  });

  it('keeps the visible date: DateDoc := DateAcct, never the other way round', () => {
    assert.match(applyStatements[0], /^UPDATE gl_journal g SET datedoc = g\.dateacct,/);
    assert.doesNotMatch(applyStatements[0], /dateacct =/);
  });
});
