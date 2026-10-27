// @covers cli/src/data-fixes/sql/20261027T120000Z__R53-spanish-tax-accounts.sql
// @covers cli/src/data-fixes/sql/20261027T120100Z__R53-tax-intracom-2pct-rate.sql
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the two ETP-5902 corrective data-fixes. The rule SQL itself was
 * run against a real DB (51/8/15/15 rule taxes, 89 rows updated, customized column kept); this
 * guards what can silently drift: the rule predicate being the same in every section, the tenant
 * scope, and the column-wise guard being identical in @check and @apply so the fix converges.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');
const load = (file) => parseFix(readFileSync(join(SQL_DIR, file), 'utf8'), basename(file, '.sql'));
const norm = (s) => s.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
  .replace(/\s+/g, ' ').trim();

describe('R53-spanish-tax-accounts', () => {
  const fix = load('20261027T120000Z__R53-spanish-tax-accounts.sql');
  const sections = { check: norm(fix.check), apply: norm(fix.apply), report: norm(fix.report) };

  const RULES = "CASE WHEN t.sopotype = 'P' AND t.iswithholdingtax = 'Y' THEN '47510000'"
    + " WHEN t.sopotype = 'S' AND t.iswithholdingtax = 'Y' THEN '47300000'"
    + " WHEN t.sopotype = 'P' AND (t.em_obspti_isintracommunity = 'Y'"
    + " OR t.em_obspti_isreversecharge = 'Y') AND t.rate > 0 THEN '47200000'"
    + " WHEN t.sopotype = 'P' AND (t.em_obspti_isintracommunity = 'Y'"
    + " OR t.em_obspti_isreversecharge = 'Y') AND t.rate < 0 THEN '47700000' END AS acct_value"
    + " FROM c_tax t WHERE t.ad_client_id = '0' AND t.isactive = 'Y' AND t.issummary = 'N'"
    + ' AND t.parent_tax_id IS NOT NULL';

  it('is a per-tenant fix (not a System-only one)', () => {
    assert.equal(fix.id, 'R53-spanish-tax-accounts');
    for (const [name, sql] of Object.entries(sections)) {
      assert.ok(sql.includes('a.ad_client_id = :client_id'), `${name} must scope c_tax_acct`);
    }
  });

  it('uses the same rule predicate, in the same order, in every section', () => {
    for (const [name, sql] of Object.entries(sections)) {
      assert.ok(sql.includes(RULES), `${name} must carry the exact rule predicate`);
    }
  });

  it('applies the column-wise guard identically in @check and @apply', () => {
    const due = 'a.t_due_acct = r.default_due AND due_ev.value IS DISTINCT FROM r.acct_value';
    const credit = 'a.t_credit_acct = r.default_credit AND credit_ev.value IS DISTINCT FROM r.acct_value';
    for (const name of ['check', 'apply']) {
      assert.ok(sections[name].includes(due), `${name}: due guard`);
      assert.ok(sections[name].includes(credit), `${name}: credit guard`);
      assert.ok(sections[name].includes('r.combination_id IS NOT NULL'), `${name}: skip missing accounts`);
    }
    assert.ok(sections.apply.includes('CASE WHEN c.fix_due THEN c.combination_id ELSE a.t_due_acct END'));
    assert.ok(sections.apply.includes('CASE WHEN c.fix_credit THEN c.combination_id ELSE a.t_credit_acct END'));
  });

  it('reports only the groups not fully on target (every @report row reads as "needs attention")', () => {
    assert.ok(sections.report.includes('HAVING count(*) FILTER (WHERE due_ev.value = r.acct_value'
      + ' AND credit_ev.value = r.acct_value) < count(*)'));
  });

  it('resolves the combination deterministically against the tenant schema', () => {
    for (const name of ['check', 'apply']) {
      assert.ok(sections[name].includes('vc.ad_client_id = :client_id AND vc.c_acctschema_id = s.c_acctschema_id'));
      assert.ok(sections[name].includes(') DESC, vc.created LIMIT 1) AS combination_id'));
    }
  });
});

describe('R53-tax-intracom-2pct-rate', () => {
  const fix = load('20261027T120100Z__R53-tax-intracom-2pct-rate.sql');
  const TAX = "c_tax_id = '79F1D421039644E1B0648B98C3349284'";

  it('only moves the (+2%) child from 10 to 2, scoped to :client_id', () => {
    const check = norm(fix.check);
    const apply = norm(fix.apply);
    assert.ok(check.includes(TAX) && check.includes('t.ad_client_id = :client_id') && check.includes('t.rate = 10'));
    assert.ok(apply.startsWith('UPDATE c_tax SET rate = 2,'));
    assert.ok(apply.includes(TAX) && apply.includes('ad_client_id = :client_id') && apply.includes('AND rate = 10'));
  });
});
