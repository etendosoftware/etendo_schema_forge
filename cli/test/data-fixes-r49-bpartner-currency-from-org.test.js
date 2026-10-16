// @covers cli/src/data-fixes/sql/20261015T184242Z__R49-bpartner-currency-from-org.sql
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R49 corrective data-fix (ETP-5768).
 *
 * The demo-to-production transfer copied contacts through DAL as System, so the NEO hook that
 * defaults a new contact's currency never ran and Core refused to complete their documents
 * (InitBPCurrencyLnk). The fix gives every partner with no currency the currency of its
 * organization, else its legal entity, else the client base currency. Code-side twin:
 * DemoDataTransferEntityCopier.targetContactCurrency (com.etendoerp.go).
 *
 * Row-level behaviour was verified against a live DB inside a rolled-back transaction (ETP-5768);
 * this suite checks the SQL the fix ships: metadata, ordering, tenant scoping, the currency
 * chain, that a currency already set is never overwritten, and that @report lists what is left.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');
const FIX_FILE = '20261015T184242Z__R49-bpartner-currency-from-org.sql';
const FIX_ID = basename(FIX_FILE, '.sql');

const fix = parseFix(readFileSync(join(SQL_DIR, FIX_FILE), 'utf8'), FIX_ID);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const stripComments = (s) => s.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
const normCheck = norm(stripComments(fix.check));
const normReport = norm(stripComments(fix.report));
const applyStatements = stripComments(fix.apply).split(';').map(norm).filter(Boolean);

const CURRENCY_CHAIN = 'coalesce(o.c_currency_id, le.c_currency_id, c.c_currency_id)';
const GUARDS = ['bp.ad_client_id = :client_id', 'bp.bp_currency_id IS NULL'];

describe('R49 data-fix — header metadata', () => {
  it('parses with the expected id, gap, type and risk', () => {
    assert.equal(fix.id, 'R49-bpartner-currency-from-org');
    assert.equal(fix.gap, 'ETP-5768');
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
    assert.match(fix.description, /business partner with no currency/);
  });

  // Pinned to the latest fix that existed when R49 shipped (the R41/R44/R47/R48 precedent).
  it('sorts after R48-owner-display-name-from-account, the latest fix when it shipped', () => {
    assert.ok(
      parseFixTimestamp(FIX_ID).getTime()
        > parseFixTimestamp('20261009T151500Z__R48-owner-display-name-from-account').getTime(),
    );
  });
});

describe('R49 data-fix — scope and guards', () => {
  it('ships a single @apply statement', () => {
    assert.equal(applyStatements.length, 1);
  });

  it('applies every guard in @check, @apply and @report', () => {
    for (const clause of GUARDS) {
      assert.ok(normCheck.includes(clause), `@check misses: ${clause}`);
      assert.ok(applyStatements[0].includes(clause), `@apply misses: ${clause}`);
      assert.ok(normReport.includes(clause), `@report misses: ${clause}`);
    }
  });

  it('targets every partner without currency, not only migrated ones', () => {
    assert.doesNotMatch(applyStatements[0], /iscustomer|isvendor|isactive/i);
  });

  it('writes only BP_Currency_ID and the audit columns', () => {
    assert.match(applyStatements[0], /^UPDATE c_bpartner bp SET bp_currency_id = /);
    const setClause = applyStatements[0].split(' SET ')[1].split(' FROM ')[0];
    const written = [...setClause.matchAll(/(?:^|, )(\w+) =/g)].map((match) => match[1]);
    assert.deepEqual(written, ['bp_currency_id', 'updated', 'updatedby']);
  });
});

describe('R49 data-fix — currency chain', () => {
  it('resolves org, then legal entity, then client base currency (OBCurrencyUtils.getOrgCurrency)', () => {
    assert.ok(applyStatements[0].includes(`SET bp_currency_id = ${CURRENCY_CHAIN}`));
    assert.ok(applyStatements[0].includes("ad_get_org_le_bu(o.ad_org_id, 'LE')"));
    assert.ok(applyStatements[0].includes('c.ad_client_id = bp.ad_client_id'));
    assert.ok(applyStatements[0].includes('o.ad_org_id = bp.ad_org_id'));
  });

  it('never writes a NULL currency back', () => {
    assert.ok(applyStatements[0].includes(`${CURRENCY_CHAIN} IS NOT NULL`));
  });
});
