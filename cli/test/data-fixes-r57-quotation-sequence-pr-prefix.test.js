// @covers cli/src/data-fixes/sql/20261106T120000Z__R57-quotation-sequence-pr-prefix.sql
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R57 corrective data-fix (gap N10): the sales-quotation
 * series gets the product prefix PR where the tenant left it empty, and the tenant's existing
 * quotations are renumbered 1000000 -> PR1000000.
 *
 * Row-level behaviour needs a live tenant; what is pinned here, without a DB, is the SQL the
 * fix ships: scope by doctype (not by sequence name), the "never overwrite a tenant prefix"
 * guard, the digit-only + no-collision renumber guard, the trigger bypass pairing, the
 * `updated` bump that invalidates the cached quotation PDF, and tenant isolation.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20261106T120000Z__R57-quotation-sequence-pr-prefix.sql';
const FIX_ID = basename(FIX_FILE, '.sql');
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');
const rawText = readFileSync(join(SQL_DIR, FIX_FILE), 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Drop `--` comment lines and collapse whitespace: the header prose quotes SQL it does not run. */
const sqlOnly = (s) => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')
  .replace(/\s+/g, ' ').trim();
const sqlCheck = sqlOnly(fix.check);
const sqlApply = sqlOnly(fix.apply);
const sqlReport = sqlOnly(fix.report ?? '');

/** The C_Order UPDATE, isolated so its guards are asserted on that statement alone. */
const orderUpdate = sqlApply.split(';').map(s => s.trim()).find(s => /^UPDATE c_order\b/i.test(s));
const sequenceUpdate = sqlApply.split(';').map(s => s.trim()).find(s => /^UPDATE ad_sequence\b/i.test(s));

describe('R57 data-fix — header and catalog position', () => {
  it('parses as a medium-risk sql chain fix for gap N10', () => {
    assert.equal(fix.id, 'R57-quotation-sequence-pr-prefix');
    assert.equal(fix.gap, 'N10');
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'medium', 'it renumbers existing documents');
    assert.equal(fix.optIn, false);
    assert.match(fix.description, /ETP-5837/);
    assert.ok(fix.report && fix.report.length > 0);
  });

  it('sorts strictly after the newest other fix in the catalog dated before it', () => {
    // Read from sql/ rather than hard-coding a fix id: a hard-coded neighbour can name a file
    // that is not even in this branch, and then the test proves nothing. Fixes dated AFTER R57
    // are legitimate successors and are excluded, so the test keeps holding as the catalog grows;
    // what it rejects is a file sharing R57's timestamp or R57 being re-dated behind its base.
    const r57 = parseFixTimestamp(FIX_ID).getTime();
    const others = readdirSync(SQL_DIR)
      .filter(f => f.endsWith('.sql') && f !== FIX_FILE)
      .map(f => ({ f, ts: parseFixTimestamp(basename(f, '.sql'))?.getTime() }))
      .filter(x => Number.isFinite(x.ts));
    assert.ok(others.length > 0, 'the catalog must hold other timestamped fixes');
    assert.ok(!others.some(x => x.ts === r57), 'no other fix may share R57\'s timestamp');
    const newestBefore = others.filter(x => x.ts < r57).sort((a, b) => b.ts - a.ts)[0];
    assert.ok(newestBefore, 'R57 must not be the oldest fix in the catalog');
    assert.ok(r57 > newestBefore.ts, `R57 must sort after ${newestBefore.f}`);
    // R57's own base: the newest fix shipped when it was authored must be behind it.
    assert.ok(r57 > parseFixTimestamp('20261027T120100Z__R53-tax-intracom-2pct-rate').getTime());
  });
});

describe('R57 data-fix — tenant isolation', () => {
  for (const [name, sql] of [['@check', sqlCheck], ['@apply', sqlApply], ['@report', sqlReport]]) {
    it(`every table reference in ${name} is scoped to :client_id`, () => {
      const tables = (sql.match(/\b(?:FROM|JOIN|UPDATE) (?:ad_sequence|c_doctype|c_order)\b/gi) || []).length;
      const scopes = (sql.match(/ad_client_id = :client_id/g) || []).length;
      assert.ok(tables > 0);
      assert.ok(scopes >= tables, `${name}: ${tables} table references, only ${scopes} client scopes`);
    });
  }

  it('inlines :client_id as a quoted literal and rejects an unsafe id', () => {
    const id = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: id });
    assert.ok(inlined.includes(`'${id}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
    assert.throws(() => inlineParams(fix.apply, { client_id: "1; DROP TABLE ad_client" }),
      /refusing to inline unsafe client_id/);
  });
});

describe('R57 data-fix — sequence prefix', () => {
  it('finds the series through the quotation doctype, never by sequence name', () => {
    assert.match(sequenceUpdate, /dt\.docnosequence_id = s\.ad_sequence_id/);
    assert.match(sequenceUpdate, /dt\.docbasetype = 'SOO' AND dt\.docsubtypeso = 'OB'/);
    assert.doesNotMatch(sequenceUpdate, /s\.name\b/);
  });

  it('writes PR only over an empty prefix, never over a tenant-configured one', () => {
    assert.match(sequenceUpdate, /SET prefix = 'PR'/);
    assert.match(sequenceUpdate, /NULLIF\(btrim\(s\.prefix\), ''\) IS NULL/);
  });

  it('skips a sequence that a non-quotation doctype also uses', () => {
    assert.match(sequenceUpdate,
      /NOT EXISTS \( SELECT 1 FROM c_doctype dt .* NOT \(dt\.docbasetype = 'SOO' AND COALESCE\(dt\.docsubtypeso, ''\) = 'OB'\)\)/);
  });
});

describe('R57 data-fix — quotation renumbering', () => {
  it('prefixes the number of quotations whose series now carries PR', () => {
    assert.match(orderUpdate, /SET documentno = 'PR' \|\| o\.documentno/);
    assert.match(orderUpdate, /dt\.c_doctype_id = o\.c_doctypetarget_id/);
    assert.match(orderUpdate, /s\.prefix = 'PR'/);
  });

  it('renumbers digit-only numbers only, which is also the idempotency guard', () => {
    assert.match(orderUpdate, /o\.documentno ~ '\^\[0-9\]\+\$'/);
  });

  it('never creates a duplicate number within the doctype', () => {
    assert.match(orderUpdate, /NOT EXISTS \( SELECT 1 FROM c_order o2 .* o2\.documentno = 'PR' \|\| o\.documentno\)/);
  });

  it('moves updated so the cached quotation PDF is detected as stale', () => {
    assert.match(orderUpdate, /updated = now\(\)/);
    assert.match(orderUpdate, /updatedby = '0'/);
  });

  it('runs between a paired ad_disable_triggers / ad_enable_triggers', () => {
    const disable = sqlApply.indexOf('SELECT ad_disable_triggers()');
    const update = sqlApply.indexOf('UPDATE c_order');
    const enable = sqlApply.indexOf('SELECT ad_enable_triggers()');
    assert.ok(disable >= 0 && disable < update && update < enable);
    assert.equal((sqlApply.match(/ad_disable_triggers\(\)/g) || []).length, 1);
    assert.equal((sqlApply.match(/ad_enable_triggers\(\)/g) || []).length, 1);
  });

  it('the @check quotation branch mirrors the renumber guards, so a blocked row cannot keep it firing', () => {
    // Asserted on the second UNION branch alone: the first branch (unprefixed sequence) must not
    // be what satisfies these, or a check that renumbers non-PR series would still pass.
    const branches = sqlCheck.split(/\bUNION ALL\b/);
    assert.equal(branches.length, 2, '@check is two UNION ALL branches');
    const quotationBranch = branches[1];
    assert.match(quotationBranch, /FROM c_order o\b/);
    for (const guard of [/s\.prefix = 'PR'/, /o\.documentno ~ '\^\[0-9\]\+\$'/, /o2\.documentno = 'PR' \|\| o\.documentno/]) {
      assert.match(quotationBranch, guard);
    }
  });

  it('touches no other document table and no other column of C_Order', () => {
    assert.doesNotMatch(sqlApply, /\b(?:UPDATE|DELETE FROM|INSERT INTO) (?!ad_sequence\b|c_order\b)\w+/i);
    assert.doesNotMatch(sqlApply, /c_file/i);
  });
});

describe('R57 data-fix — @report lists every case the fix leaves to an operator', () => {
  const branches = sqlReport.split(/\bUNION ALL\b/).map(s => s.trim());
  /** The single report branch whose detail text matches `detail`. */
  const branchFor = (detail) => {
    const hits = branches.filter(b => detail.test(b));
    assert.equal(hits.length, 1, `exactly one @report branch must emit ${detail}`);
    return hits[0];
  };

  it('is four UNION ALL branches', () => {
    assert.equal(branches.length, 4);
  });

  it('reports a quotation sequence left unprefixed because another doctype shares it', () => {
    const b = branchFor(/'quotation sequence NOT prefixed: also used by a non-quotation doctype'/);
    assert.match(b, /NULLIF\(btrim\(s\.prefix\), ''\) IS NULL/);
  });

  it('reports a quotation sequence that kept a tenant-configured prefix other than PR', () => {
    const b = branchFor(/'quotation sequence kept its own prefix ' \|\| s\.prefix \|\| ' \(quotations not renumbered\)'/);
    assert.match(b, /NULLIF\(btrim\(s\.prefix\), ''\) IS NOT NULL/);
    assert.match(b, /s\.prefix <> 'PR'/);
  });

  it('reports a PR-series quotation not renumbered, saying whether the PR form was taken or the number is not digits-only', () => {
    const b = branchFor(/'quotation ' \|\| o\.documentno \|\| ' \(' \|\| o\.c_order_id \|\| '\) NOT renumbered: '/);
    assert.match(b, /WHEN o\.documentno ~ '\^\[0-9\]\+\$' THEN 'PR' \|\| o\.documentno \|\| ' already exists'/);
    assert.match(b, /ELSE 'number is not digits-only' END/);
    assert.match(b, /s\.prefix = 'PR'/);
    assert.match(b, /o\.documentno NOT LIKE 'PR%'/);
  });

  it('reports a renumbered quotation at or above the sequence currentnext, casting only a PR+digits number', () => {
    const b = branchFor(/' is at\/above the sequence CURRENTNEXT '/);
    assert.match(b, /s\.prefix = 'PR'/);
    assert.match(b,
      /CASE WHEN o\.documentno ~ '\^PR\[0-9\]\+\$' THEN substr\(o\.documentno, 3\)::numeric >= s\.currentnext ELSE false END/);
  });
});
