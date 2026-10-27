// @covers cli/src/data-fixes/sql/20261022T150000Z__R52-payment-terms-extended.sql
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R52 corrective data-fix: the nine extra predefined payment
 * terms (1, 7, 15, 20, 45, 100, 120, 180, 364 days) seeded into Etendo GO tenants provisioned
 * before the seed carried them.
 *
 * Guarded here:
 *   - metadata and ordering;
 *   - the tenant gate (the GO "Transferencia bancaria" payment method) and the anchor (the seeded
 *     "Inmediato", Value 'I', NetDays 0) in @check and @apply;
 *   - every table reference in every section scoped by `ad_client_id = :client_id`, and no
 *     `:org_id` anywhere (the target org comes from the anchor, never from a bind);
 *   - the idempotency guards, identical in @check and @apply so the fix converges: no simple term
 *     with the same NetDays in ANY org, active OR inactive; the name not already used in the
 *     anchor org (the c_paymentterm_name unique key);
 *   - the INSERT shape (the 30/60/90 seed shape) and its column/value alignment.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(__dirname, '..', 'src', 'data-fixes', 'sql');
const FIX_FILE = '20261022T150000Z__R52-payment-terms-extended.sql';
const FIX_ID = basename(FIX_FILE, '.sql');

const fix = parseFix(readFileSync(join(SQL_DIR, FIX_FILE), 'utf8'), FIX_ID);
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const stripComments = (s) => s.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
const normCheck = norm(stripComments(fix.check));
const normReport = norm(stripComments(fix.report));
const applyStatements = stripComments(fix.apply).split(';').map(norm).filter(Boolean);
const normApply = applyStatements[0] ?? '';

const SECTIONS = { '@check': normCheck, '@apply': normApply, '@report': normReport };

const TARGETS = [
  [1, '1 Día', '1D'], [7, '7 Días', '7D'], [15, '15 Días', '15D'], [20, '20 Días', '20D'],
  [45, '45 Días', '45D'], [100, '100 Días', '100D'], [120, '120 Días', '120D'],
  [180, '180 Días', '180D'], [364, '364 Días', '364D'],
];

const TENANT_GATE = "EXISTS ( SELECT 1 FROM fin_paymentmethod pm WHERE pm.ad_client_id = :client_id AND pm.name = 'Transferencia bancaria' )";
const ANCHOR = "FROM c_paymentterm pt WHERE pt.ad_client_id = :client_id AND pt.value = 'I' AND pt.netdays = 0";
const ANCHOR_ORDER = "ORDER BY (pt.isactive = 'Y') DESC, pt.created, pt.c_paymentterm_id LIMIT 1";

/** The "simple term with the same NetDays already exists" subquery of a section. */
function sameDaysGuard(sql) {
  const match = /NOT EXISTS \( SELECT 1 FROM c_paymentterm s WHERE (.*?) AND NOT EXISTS \( SELECT 1 FROM c_paymenttermline l WHERE l\.c_paymentterm_id = s\.c_paymentterm_id \) \)/.exec(sql);
  assert.ok(match, 'same-NetDays guard not found');
  return match[1];
}

/** The "name already used in the anchor org" subquery of a section. */
function nameGuard(sql) {
  const match = /NOT EXISTS \( SELECT 1 FROM c_paymentterm n WHERE (.*?) \)/.exec(sql);
  assert.ok(match, 'name guard not found');
  return match[1];
}

/** Split on commas that are not inside parentheses. */
function splitTopLevel(list) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of list) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

describe('R52 data-fix — header metadata', () => {
  it('parses with the expected id, gap, type and risk', () => {
    assert.equal(fix.id, 'R52-payment-terms-extended');
    assert.equal(fix.gap, 'G5');
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
    assert.match(fix.description, /nine extra predefined payment terms/);
  });

  it('sorts after R50-inout-foreign-return-doctype, the latest fix when it shipped', () => {
    assert.ok(
      parseFixTimestamp(FIX_ID).getTime()
        > parseFixTimestamp('20261021T120000Z__R50-inout-foreign-return-doctype').getTime(),
    );
  });

  it('ships @check, a single @apply statement and @report', () => {
    assert.ok(normCheck.length > 0);
    assert.equal(applyStatements.length, 1);
    assert.ok(normReport.length > 0);
  });
});

describe('R52 data-fix — tenant gate and anchor', () => {
  it('only touches Etendo GO tenants (Transferencia bancaria) in @check and @apply', () => {
    assert.ok(normCheck.includes(TENANT_GATE), '@check misses the tenant gate');
    assert.ok(normApply.includes(TENANT_GATE), '@apply misses the tenant gate');
  });

  it('anchors on the seeded Inmediato term, deterministically (active, then oldest, then id)', () => {
    for (const [name, sql] of Object.entries(SECTIONS)) {
      assert.ok(sql.includes(ANCHOR), `${name} misses the anchor`);
      assert.ok(sql.includes(ANCHOR_ORDER), `${name} misses the deterministic anchor order`);
      assert.ok(sql.includes('CROSS JOIN anchor a'), `${name} does not require the anchor`);
    }
  });

  it('inserts into the anchor org', () => {
    assert.match(normApply, /SELECT get_uuid\(\), :client_id, a\.ad_org_id,/);
  });
});

describe('R52 data-fix — client scoping', () => {
  it('scopes every c_paymentterm / fin_paymentmethod reference by ad_client_id = :client_id', () => {
    for (const [name, sql] of Object.entries(SECTIONS)) {
      const refs = [...sql.matchAll(/(?:FROM|JOIN) (c_paymentterm|fin_paymentmethod) (\w+)/g)];
      assert.ok(refs.length > 0, `${name} references no table`);
      for (const [, table, alias] of refs) {
        assert.ok(
          sql.includes(`${alias}.ad_client_id = :client_id`),
          `${name}: ${table} ${alias} is not filtered by ad_client_id = :client_id`,
        );
      }
    }
  });

  it('reaches c_paymenttermline only through a client-scoped term', () => {
    for (const [name, sql] of Object.entries(SECTIONS)) {
      for (const [, alias] of sql.matchAll(/FROM c_paymenttermline (\w+)/g)) {
        assert.ok(sql.includes(`${alias}.c_paymentterm_id = s.c_paymentterm_id`), `${name}: ${alias} is not tied to s`);
      }
    }
    assert.ok(sameDaysGuard(normCheck).includes('s.ad_client_id = :client_id'));
  });

  it('never binds :org_id, and binds nothing but :client_id', () => {
    for (const [name, body] of [['@check', fix.check], ['@apply', fix.apply], ['@report', fix.report]]) {
      assert.ok(!body.includes(':org_id'), `${name} must not mention :org_id`);
      const binds = new Set([...stripComments(body).matchAll(/(?<!:):([a-z_]+)/g)].map((m) => m[1]));
      assert.deepEqual([...binds], ['client_id'], `${name} binds ${[...binds].join(', ')}`);
    }
  });

  it('writes the tenant client id, never a literal one', () => {
    assert.doesNotMatch(normApply, /ad_client_id = '[0-9A-F]{32}'/);
  });
});

describe('R52 data-fix — idempotency guards', () => {
  for (const [name, sql] of [['@check', normCheck], ['@apply', normApply]]) {
    it(`${name}: skips a NetDays already covered by a simple term in ANY org, active or not`, () => {
      const guard = sameDaysGuard(sql);
      assert.ok(guard.includes('s.ad_client_id = :client_id'));
      assert.ok(guard.includes('s.netdays = t.netdays'));
      assert.ok(guard.includes("s.isduefixed = 'N'"));
      assert.ok(guard.includes('COALESCE(s.fixmonthoffset, 0) = 0'));
      // Any org, any active state: the guard must not narrow by either.
      assert.doesNotMatch(guard, /ad_org_id/);
      assert.doesNotMatch(guard, /isactive/);
    });

    it(`${name}: skips a name already used in the anchor org (c_paymentterm_name unique key)`, () => {
      const guard = nameGuard(sql.slice(sql.indexOf('AND NOT EXISTS ( SELECT 1 FROM c_paymentterm n')));
      assert.equal(guard, 'n.ad_client_id = :client_id AND n.ad_org_id = a.ad_org_id AND n.name = t.name');
    });
  }

  it('@check and @apply share the same anchor, target set and guards (so a re-run converges)', () => {
    const from = (sql) => sql.slice(sql.indexOf('WITH anchor AS'), sql.indexOf('SELECT', sql.indexOf('target (')));
    assert.equal(from(normApply), from(normCheck));
    assert.equal(sameDaysGuard(normApply), sameDaysGuard(normCheck));
    assert.equal(
      normApply.slice(normApply.indexOf('FROM target t CROSS JOIN anchor a WHERE')),
      normCheck.slice(normCheck.indexOf('FROM target t CROSS JOIN anchor a WHERE')).replace(/ ORDER BY t\.netdays;?$/, ''),
    );
  });

  it('@report lists exactly the name collisions: the name taken in the anchor org, no simple term for the days', () => {
    assert.ok(normReport.includes('JOIN c_paymentterm n ON n.ad_client_id = :client_id AND n.ad_org_id = a.ad_org_id AND n.name = t.name'));
    assert.equal(sameDaysGuard(normReport), sameDaysGuard(normCheck));
  });
});

describe('R52 data-fix — the nine terms', () => {
  it('targets the nine terms with distinct days, names and search keys', () => {
    const values = TARGETS.map(([d, n, v]) => `(${d}, '${n}', '${v}')`).join(', ');
    assert.ok(normCheck.includes(`target (netdays, name, value) AS ( VALUES ${values} )`));
    assert.ok(normApply.includes(`target (netdays, name, value) AS ( VALUES ${values} )`));
    const reportValues = TARGETS.map(([d, n]) => `(${d}, '${n}')`).join(', ');
    assert.ok(normReport.includes(`target (netdays, name) AS ( VALUES ${reportValues} )`));
    for (const column of [0, 1, 2]) {
      assert.equal(new Set(TARGETS.map((t) => t[column])).size, TARGETS.length);
    }
  });

  it('inserts the 30/60/90 seed shape, column for column', () => {
    const columns = splitTopLevel(/^INSERT INTO c_paymentterm \((.*?)\) WITH/.exec(normApply)[1]);
    const values = splitTopLevel(/\) SELECT (get_uuid\(\).*?) FROM target t/.exec(normApply)[1]);
    assert.equal(values.length, columns.length);
    const row = Object.fromEntries(columns.map((c, i) => [c, values[i]]));
    assert.deepEqual(row, {
      c_paymentterm_id: 'get_uuid()',
      ad_client_id: ':client_id',
      ad_org_id: 'a.ad_org_id',
      isactive: "'Y'",
      created: 'now()',
      createdby: "'0'",
      updated: 'now()',
      updatedby: "'0'",
      name: 't.name',
      isduefixed: "'N'",
      netdays: 't.netdays',
      fixmonthoffset: '0',
      isnextbusinessday: "'Y'",
      isdefault: "'N'",
      value: 't.value',
      isvalid: "'N'",
      fixmonthday3: '0',
    });
  });
});
