import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R26 corrective data-fix
 * (20260828T120000Z__R26-acct-rpt-definitions.sql, ETP-5013).
 *
 * The fix recreates, for tenants provisioned before the GOClient sampledata shipped them, the two
 * accounting-report definitions "Pérdidas y Ganancias" (reporttype 'N') and "Balance de Situación"
 * (reporttype 'Y') together with their C_Acct_Rpt_Group / C_Acct_Rpt_Node rows.
 *
 * Row-level behavior was ALREADY verified against the live database and is not re-tested here:
 *   - @check: GOClient -> 0 rows and F&B International Group -> 0 rows (both already configured);
 *     "Ivan Test 1" -> 1 row and "QA Testing" -> 1 row (both missing the definitions).
 *   - @apply on "Ivan Test 1", inside a transaction rolled back afterwards: first run
 *     INSERT 0 2 / INSERT 0 3 / INSERT 0 3; an immediate second run INSERT 0 0 / 0 0 / 0 0
 *     (idempotency proven). Resulting structure identical to the sampledata, with accounts
 *     belonging to the target tenant — never GOClient's.
 *   - Multi-schema on "QA Testing" (2 schemas): only "Main US/A/Euro" got the report pair; the
 *     American chart-of-accounts schema was correctly skipped for lacking PYG/A/P, so no report
 *     was created without the accounts its nodes need.
 *
 * What is verifiable WITHOUT a database is the SQL the fix ships, and that is what this file
 * locks down: header metadata, tenant isolation, the three idempotency guards (the sole
 * protection — the three tables have only a PK on their own id, no unique constraint, verified in
 * pg_constraint), the schema -> 'AC' element -> value account disambiguation (regression guard for
 * the two-account-trees bug), the absence of GOClient's hard-coded ids as SQL values, and the
 * business constants. Mirrors the data-fixes-r25-bankstatement-stale-status.test.js precedent.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260828T120000Z__R26-acct-rpt-definitions.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

const norm = (s) => s.replace(/\s+/g, ' ').trim();
/**
 * Drop `--` comment text. Every assertion about what the fix DOES must run on this, never on the
 * raw file: the context block deliberately quotes GOClient ids and account values while explaining
 * why they must NOT be copied, and matching those would be a false positive.
 */
const stripComments = (s) => s.replace(/--[^\n]*/g, '');

const sqlCheck = norm(stripComments(fix.check));
const sqlApply = norm(stripComments(fix.apply));
const applyStatements = sqlApply
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

describe('R26 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R26-acct-rpt-definitions');
    assert.equal(fix.gap, 'ETP-5013');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('carries a description naming the two report definitions', () => {
    assert.ok(fix.description && fix.description.length > 0);
    assert.match(fix.description, /Pérdidas y Ganancias/);
    assert.match(fix.description, /Balance de Situación/);
  });

  it('has non-empty @check and @apply sections and no @report', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(!fix.report, 'every missing definition is created directly, nothing to report');
  });

  it('documents the sampledata root cause (never replayed into existing tenants)', () => {
    assert.match(rawText, /sampledata/i);
    assert.match(rawText, /C_ACCT_RPT\.xml/);
  });

  it('sorts after the previous fix, so lexical order == chronological order', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-08-28T12:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp('20260824T120000Z__R25-bankstatement-stale-status').getTime(),
    );
  });
});

describe('R26 data-fix — tenant isolation (non-negotiable)', () => {
  it('scopes the @check to :client_id', () => {
    assert.match(sqlCheck, /s\.ad_client_id = :client_id/);
  });

  it('scopes EVERY @apply statement to :client_id', () => {
    assert.equal(applyStatements.length, 3, 'three INSERT statements expected');
    for (const [i, stmt] of applyStatements.entries()) {
      assert.match(stmt, /:client_id\b/, `@apply statement #${i + 1} is not tenant-scoped`);
    }
  });

  it('scopes every subquery of the @check to :client_id (no cross-tenant read)', () => {
    // c_acctschema, c_elementvalue and the three c_acct_rpt EXISTS probes.
    const scoped = (sqlCheck.match(/ad_client_id = :client_id/g) || []).length;
    assert.ok(scoped >= 5, `expected >=5 ad_client_id filters in @check, found ${scoped}`);
  });

  it('writes the rows into the target tenant/org, never a copied client id', () => {
    for (const [i, stmt] of applyStatements.entries()) {
      assert.match(
        stmt,
        /SELECT get_uuid\(\), (?:[a-z_]+\.[a-z_]+, )?:client_id, :org_id, 'Y'/,
        `@apply statement #${i + 1} does not insert :client_id/:org_id`,
      );
    }
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId, org_id: '0' });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
    assert.doesNotMatch(inlined, /:org_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: "1; DROP TABLE c_acct_rpt" }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R26 data-fix — idempotency guards are the ONLY protection', () => {
  // The three target tables have a primary key on their own id and nothing else: there is no
  // unique constraint on (client, name, schema) or any equivalent (verified in pg_constraint).
  // The database would happily accept a duplicate report/group/node, so a missing NOT EXISTS
  // here would mean a second run silently doubles the tenant's report definitions.
  it('inserts into exactly the three expected tables, once each', () => {
    assert.equal((sqlApply.match(/INSERT INTO c_acct_rpt \(/g) || []).length, 1);
    assert.equal((sqlApply.match(/INSERT INTO c_acct_rpt_group \(/g) || []).length, 1);
    assert.equal((sqlApply.match(/INSERT INTO c_acct_rpt_node \(/g) || []).length, 1);
  });

  it('guards each of the three INSERTs with its own NOT EXISTS', () => {
    for (const [i, stmt] of applyStatements.entries()) {
      assert.match(stmt, /NOT EXISTS \(/, `@apply statement #${i + 1} has no idempotency guard`);
    }
  });

  it('guards the report by its natural key (name + accounting schema)', () => {
    const stmt = applyStatements[0];
    assert.match(
      stmt,
      /NOT EXISTS \( SELECT 1 FROM c_acct_rpt r WHERE r\.ad_client_id = :client_id AND r\.c_acctschema_id = s\.c_acctschema_id AND r\.name = spec\.rpt_name \)/,
    );
  });

  it('guards the group by its natural key (name + parent report)', () => {
    assert.match(
      applyStatements[1],
      /NOT EXISTS \( SELECT 1 FROM c_acct_rpt_group g WHERE g\.c_acct_rpt_id = r\.c_acct_rpt_id AND g\.name = spec\.group_name \)/,
    );
  });

  it('guards the node by its parent group', () => {
    assert.match(
      applyStatements[2],
      /NOT EXISTS \( SELECT 1 FROM c_acct_rpt_node n WHERE n\.c_acct_rpt_group_id = g\.c_acct_rpt_group_id \)/,
    );
  });

  it('the @check mirrors the same three conditions, so a half-applied tenant is re-detected', () => {
    assert.match(sqlCheck, /NOT EXISTS \( SELECT 1 FROM c_acct_rpt r/);
    assert.match(sqlCheck, /NOT EXISTS \( SELECT 1 FROM c_acct_rpt_group g/);
    assert.match(sqlCheck, /NOT EXISTS \( SELECT 1 FROM c_acct_rpt_node n/);
  });

  it('never UPDATEs or DELETEs anything (creation-only corrective)', () => {
    assert.doesNotMatch(sqlApply, /\bUPDATE\b/i);
    assert.doesNotMatch(sqlApply, /\bDELETE\b/i);
  });
});

describe('R26 data-fix — account lookups are disambiguated by the schema account tree', () => {
  // Regression guard for the two-trees bug: a tenant can own more than one C_Element, so a lookup
  // by `value` alone matches several accounts (GOClient has two 'PYG', two 'A', two 'P') and would
  // hang the node off the wrong tree. Every lookup must go schema -> 'AC' element -> value.
  it('joins c_acctschema_element with elementtype = \'AC\' in both sections', () => {
    assert.match(sqlCheck, /c_acctschema_element se ON se\.c_acctschema_id = [a-z_]+\.c_acctschema_id AND se\.elementtype = 'AC' AND se\.isactive = 'Y'/);
    assert.match(sqlApply, /c_acctschema_element se ON se\.c_acctschema_id = [a-z_]+\.c_acctschema_id AND se\.elementtype = 'AC' AND se\.isactive = 'Y'/);
  });

  it('binds EVERY c_elementvalue lookup to the schema tree via c_element_id', () => {
    const sql = `${sqlCheck} ${sqlApply}`;
    const refs = [...sql.matchAll(/(?:FROM|JOIN)\s+c_elementvalue\s+(\w+)/g)];
    assert.ok(refs.length >= 2, `expected >=2 c_elementvalue lookups, found ${refs.length}`);
    for (const ref of refs) {
      const alias = ref[1];
      const scope = sql.slice(ref.index, ref.index + 400);
      assert.match(
        scope,
        new RegExp(`${alias}\\.c_element_id = se\\.c_element_id`),
        `c_elementvalue lookup "${ref[0]}" is not bound to the schema's account tree`,
      );
    }
  });

  it('has no c_elementvalue lookup keyed on value alone', () => {
    const sql = `${sqlCheck} ${sqlApply}`;
    // Every `<alias>.value` predicate must belong to an alias that was tied to c_element_id.
    const valuePredicates = [...sql.matchAll(/(\w+)\.value (?:=|IN)/g)];
    assert.ok(valuePredicates.length >= 2);
    for (const pred of valuePredicates) {
      const alias = pred[1];
      assert.match(
        sql,
        new RegExp(`${alias}\\.c_element_id = se\\.c_element_id`),
        `alias "${alias}" filters on value without being tied to a c_element_id`,
      );
    }
  });

  it('only considers active summary accounts', () => {
    assert.match(sqlCheck, /ev\.issummary = 'Y'/);
    assert.match(sqlApply, /ev\.issummary = 'Y'/);
    assert.match(sqlApply, /ev\.isactive = 'Y'/);
  });

  it('requires all three summary accounts before creating a report', () => {
    assert.match(sqlCheck, /SELECT COUNT\(DISTINCT ev\.value\) FROM c_elementvalue ev .*?\) = 3/);
    assert.match(sqlApply, /SELECT COUNT\(DISTINCT ev\.value\) FROM c_elementvalue ev .*?\) = 3/);
  });

  it('only targets active accounting schemas', () => {
    assert.match(sqlCheck, /s\.isactive = 'Y'/);
    assert.match(sqlApply, /s\.isactive = 'Y'/);
  });
});

describe('R26 data-fix — no GOClient ids leak into the SQL', () => {
  // These ids DO appear in the context comment block (documenting why they can't be copied), so
  // the assertion must run on the comment-stripped SQL — matching the raw text would be a false
  // positive on the very documentation that prevents the bug.
  const GOCLIENT_IDS = [
    'F4722DAD8EAB4D69AB4F3F66BE5A800E',
    'F115C4AA6640454DB4007DCBEC74634D',
    '52424CC6B50D47B4A10EE178357C551D',
    '802509E12436405C86BA1FD5B1DF508C',
    'C06B100312FA48159DB36B9A4B461019',
  ];

  it('uses none of GOClient\'s sampledata ids as a SQL value', () => {
    const sql = `${sqlCheck} ${sqlApply}`;
    for (const id of GOCLIENT_IDS) {
      assert.ok(!sql.includes(id), `GOClient id ${id} leaked into the executable SQL`);
    }
  });

  it('still documents those ids in the context comments (why they can\'t be copied)', () => {
    // Guards the guard: if the comment block ever disappears, the test above becomes vacuous.
    assert.ok(rawText.includes(GOCLIENT_IDS[0]));
    assert.match(rawText, /cross-client FKs/);
  });

  it('contains no hard-coded 32-hex id at all in the executable SQL', () => {
    const sql = `${sqlCheck} ${sqlApply}`;
    assert.doesNotMatch(sql, /'[0-9A-Fa-f]{32}'/);
  });
});

describe('R26 data-fix — id generation is set-based', () => {
  it('generates one id per inserted row with get_uuid()', () => {
    assert.equal((sqlApply.match(/get_uuid\(\)/g) || []).length, 3);
    for (const [i, stmt] of applyStatements.entries()) {
      assert.match(stmt, /get_uuid\(\)/, `@apply statement #${i + 1} does not use get_uuid()`);
    }
  });

  it('does NOT use the runner\'s @uuid_KEY@ placeholder', () => {
    // @uuid_KEY@ resolves to ONE id per key per apply; a tenant with two accounting schemas would
    // collide on the primary key. Asserted on the comment-stripped SQL: the context block names
    // the placeholder while explaining why it is NOT used here.
    assert.doesNotMatch(`${sqlCheck} ${sqlApply}`, /@uuid_[0-9A-Za-z]+@/);
    assert.match(rawText, /Why get_uuid\(\) and not the runner's @uuid_KEY@ placeholder/);
  });

  it('stamps the audit columns the way the other fixes do', () => {
    for (const [i, stmt] of applyStatements.entries()) {
      assert.match(
        stmt,
        /'Y', now\(\), '0', now\(\), '0'/,
        `@apply statement #${i + 1} does not stamp isactive/created/createdby/updated/updatedby`,
      );
    }
  });
});

describe('R26 data-fix — business constants', () => {
  it('creates the two reports with the sampledata reporttype / isorgbalanced', () => {
    // spec(rpt_name, isorgbalanced, reporttype)
    assert.match(applyStatements[0], /AS spec\(rpt_name, isorgbalanced, reporttype\)/);
    assert.match(applyStatements[0], /\('Pérdidas y Ganancias', 'N', 'N'\)/);
    assert.match(applyStatements[0], /\('Balance de Situación', 'Y', 'Y'\)/);
    assert.match(
      applyStatements[0],
      /spec\.rpt_name, s\.c_acctschema_id, spec\.isorgbalanced, spec\.reporttype/,
    );
  });

  it('creates the three groups with their report and line number', () => {
    assert.match(applyStatements[1], /AS spec\(rpt_name, group_name, line\)/);
    assert.match(applyStatements[1], /\('Pérdidas y Ganancias', 'Pérdidas y Ganancias', 10\)/);
    assert.match(applyStatements[1], /\('Balance de Situación', 'Activo', 10\)/);
    assert.match(applyStatements[1], /\('Balance de Situación', 'Patrimonio Neto y Pasivo', 20\)/);
  });

  it('maps each group to its summary account value', () => {
    assert.match(applyStatements[2], /AS spec\(group_name, acct_value\)/);
    assert.match(applyStatements[2], /\('Pérdidas y Ganancias', 'PYG'\)/);
    assert.match(applyStatements[2], /\('Activo', 'A'\)/);
    assert.match(applyStatements[2], /\('Patrimonio Neto y Pasivo', 'P'\)/);
  });

  it('gives every node line 10 and names it after its group', () => {
    assert.match(applyStatements[2], /g\.name, ev\.c_elementvalue_id, 10/);
  });

  it('only ever considers the two report names it owns', () => {
    assert.match(sqlCheck, /r\.name IN \('Pérdidas y Ganancias', 'Balance de Situación'\)/);
    assert.match(sqlApply, /r\.name IN \('Pérdidas y Ganancias', 'Balance de Situación'\)/);
    // English reports ("Profit & Loss" / "Balance Sheet") must never be touched.
    assert.doesNotMatch(sqlApply, /Profit & Loss/);
    assert.doesNotMatch(sqlApply, /Balance Sheet/);
  });
});
