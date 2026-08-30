import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseFix,
  parseFixTimestamp,
  inlineParams,
  inlineFreshUuids,
} from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R30 corrective data-fix
 * (20260830T120000Z__R30-financial-account-card-ledger-account.sql, ETP-4872 Task 6).
 *
 * ETP-4872 adds accounting defaults for the new Tarjeta/Card FIN_FinancialAccount type, which need
 * a NEW ledger account, 57210 ("Tarjetas de crédito, euros"), as a sibling of the existing 57200
 * bank account under the 572 group. Task 5 (ETP-4872) already ships this preventively for NEW
 * tenants via the GOClient onboarding sampledata; this fix is the corrective twin for tenants
 * already onboarded before that ships — it must reproduce the SAME structure (a new "5721"
 * subgroup sibling of "5720", with the "57210" leaf reparented under it) live, per-tenant.
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply SQL against a live
 * Postgres tenant, so true row-level behavior (which real tenants need the fix, whether the
 * INSERT/UPDATE chain actually converges, second-run idempotency) can only be verified end-to-end
 * with a DB — this environment has none. What IS verified deterministically here, without a DB, is
 * the SQL the fix ships: header metadata, tenant isolation, the two-C_Element hazard guard (a
 * tenant may carry an orphan, non-wired "572" chain — see R30's own Background point 4 and the
 * ETP-4402 precedent it cites), the width-derivation logic (NOT a hardcoded 5/8-digit assumption —
 * see Background point 2), the idempotency guard on every statement, statement order (the tree
 * nodes must exist before they can be reparented), and the @uuid_<KEY>@ id-templating (not
 * get_uuid(), since two DIFFERENT rows — the subgroup and the leaf — need two DIFFERENT ids that
 * still stay stable if the file were ever re-read within one apply). Mirrors the
 * data-fixes-r24-payment-method-cheque-to-recibo.test.js / data-fixes-r26-acct-rpt-definitions.test.js
 * precedents (both @uuid_-token, multi-statement corrective fixes).
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260830T120000Z__R30-financial-account-card-ledger-account.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');
/** The fix immediately preceding R30 in the catalog (lexical sort == chronological order) — NOT
 * R28 by number: R26-acct-rpt-definitions was filed on 2026-08-28, one day after R28's 2026-08-27,
 * so it is the true chronological predecessor despite its lower R-number. */
const PREVIOUS_FIX_ID = '20260828T120000Z__R26-acct-rpt-definitions';

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring/regex checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Drop full-line `--` comments, then normalise. Every comment in this fix lives on its own line
 * (asserted by `carries no inline trailing comments` below), so this never clips a string literal
 * and leaves exactly the SQL the runner sends to Postgres. Needed because the Background/context
 * comment block quotes SQL-shaped fragments (constraint names, sample values) that would otherwise
 * produce false-positive matches against the raw text.
 */
const sqlOnly = (s) =>
  norm(
    s
      .split('\n')
      .filter((line) => !/^\s*--/.test(line))
      .join('\n'),
  );

const normCheck = norm(fix.check);
const normApply = norm(fix.apply);
const sqlCheck = sqlOnly(fix.check);
const sqlApply = sqlOnly(fix.apply);

/** The 5 executable statements of @apply (Steps A-E), in file order. */
const statements = sqlApply
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

describe('R30 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R30-financial-account-card-ledger-account');
    assert.equal(fix.gap, 'A7');
  });

  it('is a medium-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'medium');
  });

  it('has a description naming the new account and its position in the chart', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /57210/);
    assert.match(fix.description, /Tarjetas de crédito, euros/);
    assert.match(fix.description, /57200/);
  });

  it('has non-empty @check and @apply sections and no @report', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(!fix.report, 'creation-only corrective, nothing to report');
  });

  it('carries no inline trailing comments (so `sqlOnly` cannot clip a string literal)', () => {
    const offenders = rawText
      .split('\n')
      .filter((line) => line.includes('--') && !/^\s*--/.test(line));
    assert.deepEqual(offenders, []);
  });

  it('has a filename whose timestamp prefix sorts after the previous catalog fix (ETP-4872)', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-08-30T12:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp(PREVIOUS_FIX_ID).getTime(),
      `R30 must sort after ${PREVIOUS_FIX_ID} (lexical sort == execution order)`,
    );
  });
});

describe('R30 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes the @check to :client_id', () => {
    assert.match(sqlCheck, /WHERE s\.ad_client_id = :client_id/);
  });

  it('scopes every one of the 5 @apply statements (Steps A-E) to :client_id', () => {
    assert.equal(statements.length, 5, 'Steps A, B, C, D, E expected');
    for (const [i, s] of statements.entries()) {
      assert.match(
        s,
        /(ad_client_id|\.ad_client_id) = :client_id/,
        `@apply statement #${i + 1} is not scoped to :client_id: ${s.slice(0, 90)}`,
      );
    }
  });

  it('never scopes any statement to :org_id (chart-of-accounts rows are client-level)', () => {
    assert.doesNotMatch(sqlApply, /:org_id\b/);
    assert.doesNotMatch(sqlCheck, /:org_id\b/);
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE c_elementvalue' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R30 data-fix — two-C_Element hazard (regression guard, ETP-4402 precedent)', () => {
  // A tenant (GOClient-shaped or otherwise) can carry an orphan "572" chain not wired to any
  // C_AcctSchema. Every lookup must resolve the target element via c_acctschema_element's
  // elementtype='AC' join, never a bare `value = '572'`/`value IN (...)` match on c_elementvalue
  // alone — otherwise the fix could create/reparent rows under the wrong, non-postable chain.
  it('the @check resolves the element via c_acctschema_element (elementtype = \'AC\'), not a bare value match', () => {
    assert.match(
      sqlCheck,
      /JOIN c_acctschema_element ae ON ae\.c_acctschema_id = s\.c_acctschema_id AND ae\.elementtype = 'AC' AND ae\.isactive = 'Y'/,
    );
  });

  it('every @apply statement that touches c_elementvalue resolves the element the same way', () => {
    const elementJoins = (sqlApply.match(
      /JOIN c_acctschema_element ae ON ae\.c_acctschema_id = s\.c_acctschema_id AND ae\.elementtype = 'AC' AND ae\.isactive = 'Y'/g,
    ) || []).length;
    // Steps A and B (the two INSERTs) each resolve the element this way; Steps C/D/E key off the
    // already-inserted rows' own c_element_id instead (see the idempotency-guard suite below), so
    // they do not need to re-resolve it.
    assert.equal(elementJoins, 2, 'expected the AC-element join on both Step A and Step B');
  });

  it('the sibling lookup (57200/57200000) is itself bound to the resolved element, not a free value match', () => {
    assert.match(
      sqlCheck,
      /JOIN c_elementvalue sib ON sib\.c_element_id = ae\.c_element_id\s+AND sib\.value IN \('57200', '57200000'\)\s+AND sib\.issummary = 'N'/,
    );
    const bound = (sqlApply.match(
      /JOIN c_elementvalue sib ON sib\.c_element_id = ae\.c_element_id AND sib\.value IN \('57200', '57200000'\) AND sib\.issummary = 'N'/g,
    ) || []).length;
    assert.equal(bound, 2, 'Step A and Step B both bind the 57200 sibling to the resolved element');
  });
});

describe('R30 data-fix — width derivation (regression guard: no hardcoded 5/8-digit assumption)', () => {
  // Background point 2: C_ELEMENTVALUE.VALUE width is NOT uniform fleet-wide (some tenants carry
  // '57200', others '57200000'). The new leaf's value must be DERIVED from the tenant's own
  // existing sibling, never assumed.
  it('derives the new leaf value from the tenant\'s own 57200 sibling width via a CASE expression', () => {
    assert.match(
      statements[1],
      /CASE sib\.value WHEN '57200000' THEN '57210000' ELSE '57210' END/,
      'Step B (the leaf INSERT) must derive its value from sib.value, not hardcode one width',
    );
  });

  it('the 5721 subgroup is always inserted as the literal, non-width-variable \'5721\'', () => {
    // Background point 2: only LEAF codes are width-variable; group/subgroup codes are not.
    assert.match(statements[0], /'5721', 'Tarjetas de crédito, euros'/);
  });

  it('normalizes the auto-created C_VALIDCOMBINATION alias/combination via LEFT(value, 5), not a literal', () => {
    // Background point 3: the trigger-created combination inherits the FULL (possibly 8-digit)
    // leaf value verbatim; Step E must re-derive the 5-digit form rather than hardcoding '57210'.
    assert.match(
      statements[4],
      /SET alias = LEFT\(ev\.value, 5\), combination = LEFT\(ev\.value, 5\)/,
    );
  });
});

describe('R30 data-fix — two-layer idempotency (mandatory framework rule)', () => {
  it('Step A (insert 5721) is guarded by NOT EXISTS on (c_element_id, value)', () => {
    assert.match(
      statements[0],
      /NOT EXISTS \(SELECT 1 FROM c_elementvalue x WHERE x\.c_element_id = ae\.c_element_id AND x\.value = '5721'\)/,
    );
  });

  it('Step B (insert 57210 leaf) is guarded by NOT EXISTS on (c_element_id, value IN both widths)', () => {
    assert.match(
      statements[1],
      /NOT EXISTS \(SELECT 1 FROM c_elementvalue x WHERE x\.c_element_id = ae\.c_element_id AND x\.value IN \('57210', '57210000'\)\)/,
    );
  });

  it('the @check mirrors Step B\'s own guard, so a half-applied tenant is re-detected', () => {
    assert.match(
      sqlCheck,
      /NOT EXISTS \(\s*SELECT 1 FROM c_elementvalue x\s*WHERE x\.c_element_id = ae\.c_element_id\s*AND x\.value IN \('57210', '57210000'\)\s*\)/,
    );
  });

  it('Steps C and D (treenode reparenting) are guarded by IS DISTINCT FROM, so a second run is a no-op', () => {
    assert.match(statements[2], /AND tn\.parent_id IS DISTINCT FROM ev572\.c_elementvalue_id/);
    assert.match(statements[3], /AND tn\.parent_id IS DISTINCT FROM ev5721\.c_elementvalue_id/);
  });

  it('Step E (combination normalize) is guarded by IS DISTINCT FROM on either target column', () => {
    assert.match(
      statements[4],
      /AND \(vc\.alias IS DISTINCT FROM LEFT\(ev\.value, 5\) OR vc\.combination IS DISTINCT FROM LEFT\(ev\.value, 5\)\)/,
    );
  });

  it('never UPDATEs/DELETEs anything outside the treenode-reparent and combination-normalize steps', () => {
    const nonInsert = statements.filter((s) => !/^INSERT INTO/.test(s));
    assert.equal(nonInsert.length, 3, 'Steps C, D, E are the only non-INSERT statements');
    for (const s of nonInsert) {
      assert.match(s, /^UPDATE (ad_treenode|c_validcombination)/, `unexpected non-INSERT statement: ${s.slice(0, 80)}`);
    }
    assert.doesNotMatch(sqlApply, /\bDELETE\b/i);
  });
});

describe('R30 data-fix — statement order (tree nodes must exist before they can be reparented)', () => {
  it('runs the 5 steps in the required A -> B -> C -> D -> E order', () => {
    const expected = [
      /^INSERT INTO c_elementvalue \(/, // A: insert 5721 subgroup
      /^INSERT INTO c_elementvalue \(/, // B: insert 57210 leaf
      /^UPDATE ad_treenode tn SET parent_id = ev572\.c_elementvalue_id/, // C: reparent 5721 onto 572
      /^UPDATE ad_treenode tn SET parent_id = ev5721\.c_elementvalue_id/, // D: reparent leaf onto 5721
      /^UPDATE c_validcombination vc/, // E: normalize the auto-created combination
    ];
    assert.equal(statements.length, expected.length);
    for (const [i, re] of expected.entries()) {
      assert.match(statements[i], re, `@apply statement #${i + 1} out of order`);
    }
  });

  it('inserts the 5721 subgroup (Step A) before the 57210 leaf that will be reparented under it (Step B)', () => {
    const stepA = sqlApply.indexOf("'5721', 'Tarjetas de crédito, euros'");
    const stepB = sqlApply.indexOf("CASE sib.value WHEN '57200000' THEN '57210000' ELSE '57210' END");
    assert.ok(stepA >= 0 && stepB > stepA, 'Step A must precede Step B');
  });

  it('reparents 5721 onto 572 (Step C) before reparenting the leaf onto 5721 (Step D)', () => {
    const stepC = sqlApply.indexOf('SET parent_id = ev572.c_elementvalue_id');
    const stepD = sqlApply.indexOf('SET parent_id = ev5721.c_elementvalue_id');
    assert.ok(stepC >= 0 && stepD > stepC, 'Step C must precede Step D');
  });

  it('normalizes the combination (Step E) only after the leaf that owns it has been inserted (Step B)', () => {
    const stepB = sqlApply.indexOf("CASE sib.value WHEN '57200000' THEN '57210000' ELSE '57210' END");
    const stepE = sqlApply.indexOf('SET alias = LEFT(ev.value, 5)');
    assert.ok(stepB >= 0 && stepE > stepB, 'Step E must run after Step B');
  });

  it('keeps every step inside ONE @apply section (single per-tenant transaction, all-or-nothing)', () => {
    assert.equal(normApply.split(/--\s*@apply/i).length, 1, 'exactly one @apply marker');
  });
});

describe('R30 data-fix — id generation via @uuid_<KEY>@ templating (not get_uuid())', () => {
  it('templates the subgroup and leaf PKs through two DISTINCT @uuid_ tokens', () => {
    assert.match(statements[0], /'@uuid_5721SUBGROUP@'/);
    assert.match(statements[1], /'@uuid_57210LEAF@'/);
  });

  it('never uses get_uuid() (unlike the set-based R22/R26 precedents — this fix mints exactly 2 ids)', () => {
    assert.doesNotMatch(sqlApply, /get_uuid\(\)/);
  });

  it('inlineFreshUuids resolves both tokens to distinct fresh Etendo-style ids, no residual token', () => {
    const inlined = inlineFreshUuids(fix.apply);
    assert.doesNotMatch(inlined, /@uuid_[0-9A-Za-z]+@/);
    const ids = inlined.match(/'[0-9A-F]{32}'/g) || [];
    // Both PKs (subgroup + leaf), each on its own INSERT ... SELECT.
    assert.equal(ids.length, 2, 'exactly two generated ids (subgroup + leaf) are inlined');
    assert.notEqual(ids[0], ids[1], 'the two tokens must resolve to two DIFFERENT ids');
  });

  it('the same KEY resolves to the SAME id across multiple occurrences (stable intra-apply)', () => {
    // Neither of R30's own two tokens repeats within its apply body today, but this pins
    // inlineFreshUuids' documented stability contract against the exact token shape this fix uses,
    // so a future edit that reuses a token (e.g. to reference the subgroup's own id elsewhere from
    // a third statement) inherits an already-verified guarantee rather than a fresh assumption.
    const inlined = inlineFreshUuids("SELECT '@uuid_5721SUBGROUP@', '@uuid_5721SUBGROUP@'");
    const [idA, idB] = inlined.match(/'[0-9A-F]{32}'/g);
    assert.equal(idA, idB);
  });
});

describe('R30 data-fix — structural facts pinned (mirrors Task 5\'s preventive XML, byte-identical)', () => {
  it('gives the 5721 subgroup issummary=Y, elementlevel=D (a non-postable group, like its sibling 5720)', () => {
    assert.match(statements[0], /'Y', 'Y', 'Y', 'Y', 'Y', 'N', 'N', 'Y', 'A', 'D', 'N'/);
  });

  it('gives the 57210 leaf issummary=N, elementlevel=S, isdoccontrolled=Y (a real postable account)', () => {
    assert.match(statements[1], /'A', 'D', 'Y', ae\.c_element_id,\s*'N', 'Y', 'Y', 'Y', 'Y', 'N', 'N', 'Y', 'A', 'S', 'N'/);
  });

  it('names both rows "Tarjetas de crédito, euros" for both name and description', () => {
    assert.match(statements[0], /'Tarjetas de crédito, euros', 'Tarjetas de crédito, euros'/);
    assert.match(statements[1], /'Tarjetas de crédito, euros', 'Tarjetas de crédito, euros'/);
  });

  it('inherits ad_org_id from the tenant\'s own 57200 sibling row, not a hardcoded org', () => {
    assert.match(statements[0], /SELECT '@uuid_5721SUBGROUP@', :client_id, sib\.ad_org_id, 'Y'/);
    assert.match(statements[1], /SELECT '@uuid_57210LEAF@', :client_id, sib\.ad_org_id, 'Y'/);
  });

  it('reparents 5721 onto the tenant\'s own "572" node (not a hardcoded id) via the same element', () => {
    assert.match(
      statements[2],
      /ev572\.ad_client_id = :client_id AND ev572\.value = '572' AND ev572\.c_element_id = ev5721\.c_element_id/,
    );
  });

  it('reparents the leaf onto the newly-created "5721" node via the same element', () => {
    assert.match(
      statements[3],
      /ev5721\.ad_client_id = :client_id AND ev5721\.value = '5721' AND ev5721\.c_element_id = evleaf\.c_element_id/,
    );
  });
});
