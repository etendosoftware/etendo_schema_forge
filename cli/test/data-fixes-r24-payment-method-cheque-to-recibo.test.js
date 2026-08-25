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
 * Static + parse validation for the R24 corrective data-fix
 * (20260821T120000Z__R24-payment-method-cheque-to-recibo.sql, gap G3).
 *
 * Functional asked to drop the seeded "Cheque" payment method and introduce "Recibo" instead,
 * associated to every Bank (type='B') and Card (type='CA') financial account. A NEW method is
 * created rather than renaming Cheque in place, so historical documents keep their original
 * label — which is why the fix must also (a) repoint every forward-looking CONFIGURATION
 * reference plus every UNPROCESSED document, and (b) retire Cheque by DELETE when nothing
 * references it and by `isactive='N'` when history survives.
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply/@report SQL against a live
 * Postgres tenant, so true row-level behavior can only be verified end-to-end with a DB. What is
 * verified deterministically here, without a DB, is the SQL the fix ships: header metadata, tenant
 * isolation, completeness of the target configuration on BOTH the method template and every
 * per-account link, the two-layer idempotency guard, and the statement ORDER inside @apply (the
 * DELETE of Cheque must precede its deactivation, and both must follow the reference repointing —
 * otherwise the DELETE can never succeed).
 *
 * Regression focus (do not weaken) — three independent traps, one suite each:
 *
 * 1. NULL-safe comparison. The six `*use` columns (uponreceiptuse, upondeposituse,
 *    inuponclearinguse, uponpaymentuse, uponwithdrawaluse, outuponclearinguse) are NULLABLE and are
 *    therefore compared with `IS NOT DISTINCT FROM` / `IS NULL`, never with `=`. Inside a
 *    `NOT (...)` guard a plain `col = 'CLE'` evaluates to NULL when the column is NULL,
 *    `NOT (NULL)` is NULL, and the row is silently NOT matched — which made a migrated Bank link
 *    keep empty reconciliation accounts while @check reported the tenant as already fixed. See
 *    `null-safe comparison of the NULLABLE *use columns` below.
 * 2. The Etendo GO tenant gate on EVERY @apply statement, not just on @check. A hand-run of @apply
 *    (or a future runner that skips @check) against an Openbravo demo client used to delete its own
 *    'Cheque' method and links: on a rolled-back trial run against 'F&B International Group' the
 *    pre-hardening SQL took it from 6 methods / 10 links to 5 / 9. See `Etendo GO tenant gate`.
 *    ALL 18 statements carry the gate as a literal predicate — no exemptions, no statement pinned
 *    by index. Effect 4 additionally carries a STRUCTURAL gate (its CROSS JOIN on the client's own
 *    Recibo row), asserted separately, but that is defence in depth, not a substitute.
 * 3. The Recibo-existence guard on every statement that assigns FROM the Recibo scalar subquery.
 *    A bare `SET col = (SELECT ... 'Recibo')` yields NULL when Recibo does not exist and BLANKS the
 *    column instead of repointing it — silent data loss on 11 columns. See
 *    `every assignment from the Recibo subquery is guarded`.
 * 4. No bind placeholder in PROSE. `parseFix` keeps `--` comments inside each body and `run.js`
 *    decides whether to resolve the tenant's operative org with a raw `.includes(':org_id')` over
 *    `check + apply + report` — so merely NAMING `:org_id` in a comment turned org resolution on and
 *    aborted the 44-tenant chain after 22 already-committed tenants. See
 *    `tenant isolation` -> `mentions :org_id NOWHERE in the parsed bodies`.
 *
 * COUNTING CAVEAT for anyone auditing this fix by hand (and the reason this suite asserts on
 * comment-stripped SQL): censuses must strip full-line `--` comments before splitting @apply on `;`.
 * This is not theoretical — while Effect 4 was still ungated, grepping the RAW text for
 * 'Transferencia bancaria' reported 18/18 statements gated, a FALSE POSITIVE produced by the prose
 * comment above Effect 4 ("... isdefault='N' so Transferencia bancaria / Tarjeta keep the default
 * ..."), and the script written to add the missing gate inherited the same contaminated predicate
 * and therefore skipped exactly that statement. Traps 2 and 4 are two faces of one hazard: comments
 * are not inert in this framework.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260821T120000Z__R24-payment-method-cheque-to-recibo.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');
/** The fix immediately preceding R24 in the catalog (lexical sort == chronological order). */
const PREVIOUS_FIX_ID = '20260812T120000Z__R23-system-role-templates-fallback';

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Drop full-line `--` comments, then normalise. Every comment in this fix lives on its own line
 * (asserted by `carries no inline trailing comments` below), so this never clips a string literal
 * and leaves exactly the SQL the runner sends to Postgres. Needed because the prose comments
 * mention things like `isdefault='N'` that would otherwise be mistaken for real SQL.
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
const sqlReport = sqlOnly(fix.report);

/** The 18 executable statements of @apply, in file order. */
const statements = sqlApply
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

/** Extracts the `SET ... ` clause of an UPDATE statement (everything between SET and WHERE). */
function setClauseOf(statement) {
  const m = statement.match(/\bSET\b(.*?)\bWHERE\b/i);
  assert.ok(m, `statement has no SET..WHERE clause: ${statement.slice(0, 80)}`);
  return m[1];
}

/** The first statement whose text matches `re`. */
function stmt(re) {
  const found = statements.find((s) => re.test(s));
  assert.ok(found, `no @apply statement matches ${re}`);
  return found;
}

// ---------------------------------------------------------------------------
// Target configuration — the single source of truth this test asserts against.
// Mirrored on the method template (fin_paymentmethod) AND on every per-account
// link (fin_finacc_paymentmethod).
// ---------------------------------------------------------------------------

/** NOT NULL flag/enum columns, compared and assigned with a plain `=`. */
const TARGET_FLAGS = [
  ['automatic_receipt', 'N'],
  ['automatic_payment', 'N'],
  ['automatic_deposit', 'Y'],
  ['automatic_withdrawn', 'Y'],
  ['payin_allow', 'Y'],
  ['payout_allow', 'Y'],
  ['payin_execution_type', 'M'],
  ['payout_execution_type', 'M'],
  ['payin_deferred', 'N'],
  ['payout_deferred', 'N'],
  ['payin_ismulticurrency', 'Y'],
  ['payout_ismulticurrency', 'Y'],
  ['em_psd2_is_bank_transfer', 'N'],
];

/**
 * NULLABLE columns. `null` => must be compared with `IS NULL`; a value => must be compared with
 * `IS NOT DISTINCT FROM`. NEVER with `=` (see the file-level regression note).
 */
const TARGET_NULLABLE_USE = [
  ['uponreceiptuse', null],
  ['upondeposituse', 'DEP'],
  ['inuponclearinguse', 'CLE'],
  ['uponpaymentuse', null],
  ['uponwithdrawaluse', 'WIT'],
  ['outuponclearinguse', 'CLE'],
];

/** Columns that exist only on the per-account link, not on the method template. */
const TARGET_LINK_ONLY = [
  ['payin_invoicepaidstatus', 'RPR'],
  ['payout_invoicepaidstatus', 'PPM'],
];

describe('R24 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R24-payment-method-cheque-to-recibo');
    assert.equal(fix.gap, 'G3');
  });

  it('is a medium-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'medium');
  });

  it('has a description that names both the retired and the new method', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /Cheque/);
    assert.match(fix.description, /Recibo/);
  });

  it('has non-empty @check, @apply and @report sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(fix.report.length > 0, '@report is what surfaces a surviving (deactivated) Cheque');
  });

  it('has a filename whose timestamp prefix is newer than the previous catalog fix', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-08-21T12:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp(PREVIOUS_FIX_ID).getTime(),
      `R24 must sort after ${PREVIOUS_FIX_ID} (lexical sort == execution order)`,
    );
  });

  it('carries no inline trailing comments (so `sqlOnly` cannot clip a string literal)', () => {
    const offenders = rawText
      .split('\n')
      .filter((line) => line.includes('--') && !/^\s*--/.test(line));
    assert.deepEqual(offenders, []);
  });
});

describe('R24 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes every one of the 18 @apply statements to :client_id', () => {
    assert.equal(statements.length, 18, 'the 8 documented effects expand to 18 SQL statements');
    for (const [i, s] of statements.entries()) {
      assert.match(
        s,
        /ad_client_id = :client_id/,
        `@apply statement #${i + 1} is not scoped to :client_id: ${s.slice(0, 90)}`,
      );
    }
  });

  it('scopes the @check to the client row and to the client-owned methods it inspects', () => {
    assert.match(sqlCheck, /FROM ad_client c WHERE c\.ad_client_id = :client_id/);
    const occurrences = (sqlCheck.match(/ad_client_id = :client_id/g) || []).length;
    assert.ok(
      occurrences >= 15,
      `expected >= 15 :client_id scopes across the @check subqueries, got ${occurrences}`,
    );
  });

  it('never scopes a statement to :org_id (payment methods are client-level master data)', () => {
    assert.doesNotMatch(sqlApply, /:org_id\b/);
    assert.doesNotMatch(sqlCheck, /:org_id\b/);
  });

  it('mentions :org_id NOWHERE in the parsed bodies — prose comments included (regression)', () => {
    // THE bug this guards, and why it inspects the RAW bodies instead of the comment-stripped
    // `sqlApply`/`sqlCheck` above: run.js decides whether to resolve the tenant's operative org
    // with a raw substring test over the concatenated sections —
    //     if (`${fix.check}\n${fix.apply}\n${fix.report}`.includes(':org_id')) { ... }
    // — and parseFix KEEPS every `--` comment inside each body. R24 named `:org_id` only in a
    // comment that explained it deliberately does NOT use the bind, and that alone switched org
    // resolution on. The runner then threw
    //     `:org_id used but tenant <client_id> has no operative org`
    // on the first tenant with no operative org and aborted the chain.
    //
    // COST (why this is a hard assert and not a lint): @apply is transactional PER TENANT, not
    // across the chain. The abort happened after 22 of 44 tenants, and those 22 were already
    // COMMITTED — a partial, non-transactional rollout that cannot be rolled back and has to be
    // resumed by hand. A comment is not inert input to this framework: it is runner input.
    for (const [name, body] of [
      ['@check', fix.check],
      ['@apply', fix.apply],
      ['@report', fix.report],
    ]) {
      assert.ok(
        !body.includes(':org_id'),
        `${name} mentions :org_id — even inside a comment this makes run.js resolve the operative org and abort on any tenant that has none`,
      );
    }
    // Evaluated through the exact expression run.js uses, so the test cannot drift from it.
    assert.ok(!`${fix.check}\n${fix.apply}\n${fix.report}`.includes(':org_id'));
  });

  it('binds nothing but :client_id in the three parsed bodies (generalises the :org_id trap)', () => {
    // Every bind the framework adds later inherits the same comment-vs-SQL blind spot, so pin the
    // whole bind SET rather than one name. Raw bodies again — that is what run.js scans. Safe to
    // regex for `:name` here because the fix carries no `::` casts and no `'hh:mm'` literals
    // (asserted implicitly: any such token would show up in this set and fail).
    const binds = new Set(
      `${fix.check}\n${fix.apply}\n${fix.report}`.match(/:[A-Za-z_][A-Za-z0-9_]*/g) || [],
    );
    assert.deepEqual([...binds].sort(), [':client_id']);
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    for (const body of [fix.check, fix.apply, fix.report]) {
      const inlined = inlineParams(body, { client_id: clientId });
      assert.ok(inlined.includes(`'${clientId}'`));
      assert.doesNotMatch(inlined, /:client_id\b/);
    }
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE ad_client' }),
      /refusing to inline unsafe client_id/,
    );
  });

  it('templates the new method id through @uuid_RECIBO@ (fresh Etendo id, no residual token)', () => {
    assert.match(sqlApply, /'@uuid_RECIBO@'/, 'the new method id must be a @uuid_ token, not a literal');
    const inlined = inlineFreshUuids(fix.apply);
    assert.doesNotMatch(inlined, /@uuid_[0-9A-Za-z]+@/);
    const ids = inlined.match(/'[0-9A-F]{32}'/g) || [];
    assert.equal(ids.length, 1, 'exactly one generated id (the Recibo method) is inlined');
  });
});

describe('R24 data-fix — Etendo GO tenant gate (must never touch an Openbravo demo client)', () => {
  // 'F&B International Group' and other Openbravo demo clients ship a method literally named
  // 'Cheque' that has nothing to do with the GO seed set. The discriminator is owning a method
  // named 'Transferencia bancaria' (the GOClient-sampledata signature).
  const GATE =
    /EXISTS \( SELECT 1 FROM fin_paymentmethod g WHERE g\.ad_client_id = :client_id AND g\.name = 'Transferencia bancaria'\)/;

  /**
   * Effect 4 can only ever insert rows for a tenant that already owns a method named 'Recibo' (it
   * CROSS JOINs the client's own Recibo row), and the only thing that creates that row is Effect 1.
   * That structural gate is real and asserted below, but it does NOT earn an exemption from the
   * literal gate: Effect 4 carries both.
   */
  const RECIBO_CROSS_JOIN =
    /CROSS JOIN \( SELECT p\.fin_paymentmethod_id FROM fin_paymentmethod p WHERE p\.ad_client_id = :client_id AND p\.name = 'Recibo'\) r/;

  it('gates the whole fix at @check, as a top-level AND (0 rows => @apply never runs)', () => {
    assert.match(sqlCheck, GATE);
    // The gate sits BEFORE the big OR block of pending-work predicates, so it cannot be
    // short-circuited by any one of them.
    assert.ok(sqlCheck.indexOf("'Transferencia bancaria'") < sqlCheck.indexOf("AND ("));
  });

  it('repeats the gate on EVERY @apply statement, not just on @check (regression)', () => {
    // The runner always runs @check first, so the gate on @check alone suffices in normal
    // operation. It is repeated on every @apply statement as defence in depth: a hand-run of
    // @apply, or a future runner that skips @check, would otherwise let Effects 2b/5/6/7 delete a
    // demo client's own Cheque links, blank its business-partner defaults and retire its method.
    // Measured on the authoring DB with a rolled-back @apply-only run against 'F&B International
    // Group': pre-hardening it went from 6 payment methods / 10 links to 5 / 9; post-hardening it
    // is a no-op. If a new statement is added to @apply without the gate, THIS test fails.
    // No statement is exempt — the structural gate on Effect 4 is additive, not a substitute.
    //
    // ON COUNTING (do not "simplify" this to a substring census over the RAW text): this splits
    // `sqlApply`, whose full-line `--` comments are stripped, so it sees only what Postgres
    // receives. A raw-text census is a known FALSE POSITIVE generator here — the prose comment
    // above Effect 4 mentions 'Transferencia bancaria', so a chunk of raw text looks gated even
    // when its SQL is not. That is precisely how Effect 4 stayed ungated while a hand census
    // reported 18/18.
    const ungated = statements
      .map((s, i) => [i, s])
      .filter(([, s]) => !GATE.test(s))
      .map(([i, s]) => `#${i + 1} ${s.slice(0, 70)}`);

    assert.deepEqual(
      ungated,
      [],
      `every @apply statement must carry the literal tenant gate; ungated: ${ungated.join(' | ')}`,
    );
    assert.equal(
      (sqlApply.match(new RegExp(GATE.source, 'g')) || []).length,
      statements.length,
      'each of the 18 statements carries exactly one literal gate',
    );
  });

  it('also structurally gates the Effect 4 INSERT on the client\'s own Recibo row', () => {
    // Defence in depth on top of the literal gate: the CROSS JOIN is empty for a tenant that owns
    // no 'Recibo' (only the gated Effect 1 creates it), so the INSERT can never touch a demo client
    // even if the literal predicate were ever lost.
    assert.match(stmt(/^INSERT INTO fin_finacc_paymentmethod/), RECIBO_CROSS_JOIN);
  });

  it('inherits the new method\'s org from Cheque, falling back to the transfer method', () => {
    const insert = stmt(/^INSERT INTO fin_paymentmethod/);
    assert.match(insert, /COALESCE\( \(SELECT ch\.ad_org_id FROM fin_paymentmethod ch WHERE ch\.ad_client_id = :client_id AND ch\.name = 'Cheque' LIMIT 1\), \(SELECT tr\.ad_org_id FROM fin_paymentmethod tr WHERE tr\.ad_client_id = :client_id AND tr\.name = 'Transferencia bancaria' LIMIT 1\)\)/);
  });

  it('keys every other statement on the exact seeded method names, never on a pattern match', () => {
    // A LIKE/ILIKE would also select 'Cheque bancario', 'Cheque conformado', ... from a demo client.
    assert.doesNotMatch(sqlApply, /\b(I?LIKE|SIMILAR TO|~)\b/i);
    assert.doesNotMatch(sqlCheck, /\b(I?LIKE|SIMILAR TO|~)\b/i);
    for (const s of statements) {
      assert.match(
        s,
        /name = '(Cheque|Recibo|Transferencia bancaria)'/,
        `statement not keyed on a seeded method name: ${s.slice(0, 90)}`,
      );
    }
  });
});

describe('R24 data-fix — target configuration is complete on the method template', () => {
  const insert = () => stmt(/^INSERT INTO fin_paymentmethod/);

  it('declares every target column in the INSERT column list', () => {
    const columns = insert().match(/^INSERT INTO fin_paymentmethod \(([^)]*)\)/)[1];
    for (const [col] of [...TARGET_FLAGS, ...TARGET_NULLABLE_USE]) {
      if (col === 'uponreceiptuse' || col === 'uponpaymentuse') {
        // Deliberately omitted from the INSERT: the column defaults to NULL, which IS the target.
        assert.doesNotMatch(columns, new RegExp(`\\b${col}\\b`));
        continue;
      }
      assert.match(columns, new RegExp(`\\b${col}\\b`), `missing ${col} in the INSERT column list`);
    }
    assert.match(columns, /\bisactive\b/);
    assert.match(columns, /\bname\b/);
    assert.match(columns, /\bdescription\b/);
  });

  it('pins the exact VALUES tuple (a reordered column list would silently swap flags)', () => {
    assert.match(
      insert(),
      /'Y', 'Recibo', 'Recibo', 'N', 'N', 'Y', 'Y', 'Y', 'Y', 'M', 'M', 'N', 'N', 'DEP', 'CLE', 'WIT', 'CLE', 'Y', 'Y', 'N'/,
    );
  });

  it('never sets isdefault on the method (isdefault lives on the link, and is never touched)', () => {
    assert.doesNotMatch(insert(), /\bisdefault\b/);
  });

  it('normalises an already-existing Recibo to every target value (Effect 1b SET clause)', () => {
    const set = setClauseOf(stmt(/^UPDATE fin_paymentmethod r SET isactive = 'Y'/));
    for (const [col, val] of TARGET_FLAGS) {
      assert.match(set, new RegExp(`${col} = '${val}'`), `Effect 1b does not set ${col} = '${val}'`);
    }
    for (const [col, val] of TARGET_NULLABLE_USE) {
      assert.match(
        set,
        new RegExp(`${col} = ${val === null ? 'NULL' : `'${val}'`}`),
        `Effect 1b does not set ${col}`,
      );
    }
    assert.match(set, /isactive = 'Y'/);
    assert.match(set, /description = 'Recibo'/);
    assert.match(set, /updated = now\(\), updatedby = '0'/);
  });
});

describe('R24 data-fix — target configuration is complete on every per-account link', () => {
  const insert = () => stmt(/^INSERT INTO fin_finacc_paymentmethod/);

  it('declares every target column, plus the two link-only paid-status columns', () => {
    const columns = insert().match(/^INSERT INTO fin_finacc_paymentmethod \(([^)]*)\)/)[1];
    for (const [col] of [...TARGET_FLAGS, ...TARGET_LINK_ONLY]) {
      assert.match(columns, new RegExp(`\\b${col}\\b`), `missing ${col} in the INSERT column list`);
    }
    for (const [col, val] of TARGET_NULLABLE_USE) {
      if (val === null) {
        assert.doesNotMatch(columns, new RegExp(`\\b${col}\\b`), `${col} must be left at its NULL default`);
      } else {
        assert.match(columns, new RegExp(`\\b${col}\\b`), `missing ${col} in the INSERT column list`);
      }
    }
  });

  it('pins the exact VALUES tuple, including isdefault=N so the account default is preserved', () => {
    assert.match(
      insert(),
      /'Y', r\.fin_paymentmethod_id, fa\.fin_financial_account_id, 'N', 'N', 'Y', 'Y', 'Y', 'Y', 'M', 'M', 'N', 'N', 'DEP', 'CLE', 'WIT', 'CLE', 'Y', 'Y', 'N', 'RPR', 'PPM', 'N'/,
    );
  });

  it('links Recibo to Bank AND Card accounts only', () => {
    assert.match(insert(), /FROM fin_financial_account fa CROSS JOIN \( SELECT p\.fin_paymentmethod_id FROM fin_paymentmethod p WHERE p\.ad_client_id = :client_id AND p\.name = 'Recibo'\) r/);
    assert.match(insert(), /fa\.type IN \('B', 'CA'\)/);
  });

  it('normalises every existing Recibo link to the target values (Effect 3 SET clause)', () => {
    const set = setClauseOf(stmt(/^UPDATE fin_finacc_paymentmethod fpm SET isactive = 'Y'/));
    for (const [col, val] of [...TARGET_FLAGS, ...TARGET_LINK_ONLY]) {
      assert.match(set, new RegExp(`${col} = '${val}'`), `Effect 3 does not set ${col} = '${val}'`);
    }
    for (const [col, val] of TARGET_NULLABLE_USE) {
      assert.match(
        set,
        new RegExp(`${col} = ${val === null ? 'NULL' : `'${val}'`}`),
        `Effect 3 does not set ${col}`,
      );
    }
    assert.match(set, /isactive = 'Y'/);
  });

  it('NEVER writes isdefault on any link — Transferencia/Tarjeta keep their account default', () => {
    // The whole point of Recibo never being first in PAYMENT_METHODS_BY_TYPE: it must not become
    // the default of a Bank or Card account. A stray `isdefault = ...` in any SET clause (or an
    // INSERT that omitted the explicit 'N') would break that guarantee.
    assert.doesNotMatch(sqlApply, /isdefault\s*=/i, 'no @apply statement may assign isdefault');
    for (const s of statements.filter((x) => /^UPDATE fin_finacc_paymentmethod/.test(x))) {
      assert.doesNotMatch(setClauseOf(s), /\bisdefault\b/);
    }
  });

  it('repoints Cheque links onto Recibo, guarding the (method, account) unique constraint', () => {
    const repoint = stmt(/^UPDATE fin_finacc_paymentmethod fpm SET fin_paymentmethod_id/);
    assert.match(repoint, /name = 'Cheque'/);
    assert.match(repoint, /AND NOT EXISTS \( SELECT 1 FROM fin_finacc_paymentmethod other JOIN fin_paymentmethod pm2 ON pm2\.fin_paymentmethod_id = other\.fin_paymentmethod_id WHERE other\.fin_financial_account_id = fpm\.fin_financial_account_id AND pm2\.ad_client_id = :client_id AND pm2\.name = 'Recibo'\)/);
  });

  it('deletes the Cheque links the repoint could not carry, so no account keeps Cheque', () => {
    const del = stmt(/^DELETE FROM fin_finacc_paymentmethod/);
    assert.match(del, /name = 'Cheque'/);
    assert.doesNotMatch(del, /name = 'Recibo'/);
  });
});

describe('R24 data-fix — null-safe comparison of the NULLABLE *use columns (regression)', () => {
  // THE bug this guards: inside `NOT ( ... )`, `col = 'CLE'` is NULL when col IS NULL, `NOT (NULL)`
  // is NULL, and the row is silently NOT matched -> the link keeps empty reconciliation accounts
  // while @check reports the tenant as already fixed. `IS NOT DISTINCT FROM` is null-safe.
  // A SET-clause assignment (`upondeposituse = 'DEP'`) is a plain `=` and is perfectly correct;
  // the two are told apart by the alias prefix, which Postgres forbids on a SET target.
  const NULLABLE_COLS = TARGET_NULLABLE_USE.map(([c]) => c);
  const ALIASED_EQ = new RegExp(`\\b[a-z0-9_]+\\.(${NULLABLE_COLS.join('|')})\\s*=`, 'i');

  it('never compares an aliased *use column with `=` in @apply', () => {
    assert.doesNotMatch(
      sqlApply,
      ALIASED_EQ,
      'a NULLABLE *use column is compared with `=` — use IS NOT DISTINCT FROM / IS NULL (see header note)',
    );
  });

  it('never compares an aliased *use column with `=` in @check', () => {
    assert.doesNotMatch(
      sqlCheck,
      ALIASED_EQ,
      'a NULLABLE *use column is compared with `=` — use IS NOT DISTINCT FROM / IS NULL (see header note)',
    );
  });

  it('never compares an aliased *use column with `<>` / `!=` either (same three-valued trap)', () => {
    const aliasedNeq = new RegExp(`\\b[a-z0-9_]+\\.(${NULLABLE_COLS.join('|')})\\s*(<>|!=)`, 'i');
    assert.doesNotMatch(sqlApply, aliasedNeq);
    assert.doesNotMatch(sqlCheck, aliasedNeq);
  });

  for (const [col, val] of TARGET_NULLABLE_USE) {
    const operator = val === null ? 'IS NULL' : `IS NOT DISTINCT FROM '${val}'`;
    it(`compares ${col} with \`${operator}\` in both guard sites of @apply and of @check`, () => {
      const re = new RegExp(`\\.${col} ${operator.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
      // Two guard sites per section: the method template (Effect 1b / predicate (a)) and the
      // per-account link (Effect 3 / predicate (d)).
      assert.equal((sqlApply.match(re) || []).length, 2, `${col}: expected 2 null-safe guards in @apply`);
      assert.equal((sqlCheck.match(re) || []).length, 2, `${col}: expected 2 null-safe guards in @check`);
    });
  }

  it('the NOT NULL flag columns keep the plain `=` (the fix must not over-apply the null guard)', () => {
    for (const [col, val] of TARGET_FLAGS) {
      assert.match(
        sqlCheck,
        new RegExp(`\\.${col} = '${val}'`),
        `${col} is NOT NULL and must stay a plain equality`,
      );
      assert.doesNotMatch(sqlCheck, new RegExp(`\\.${col} IS NOT DISTINCT FROM`));
    }
  });
});

describe('R24 data-fix — every assignment from the Recibo subquery is guarded (no NULL blanking)', () => {
  // THE bug this guards: `SET col = (SELECT r.fin_paymentmethod_id FROM fin_paymentmethod r WHERE
  // ... r.name = 'Recibo')` is a scalar subquery. When no Recibo row exists it yields NULL, and the
  // UPDATE BLANKS the column instead of repointing it — silently dropping the payment method of a
  // business partner, payment term line, project, proposal or unprocessed document. Every such
  // statement must additionally require the Recibo row to exist.

  /** `SET <something>paymentmethod_id = ( SELECT r.fin_paymentmethod_id ... 'Recibo')`. */
  const RECIBO_SUBQUERY_ASSIGN =
    /SET [a-z_]*paymentmethod_id = \( SELECT r\.fin_paymentmethod_id FROM fin_paymentmethod r WHERE r\.ad_client_id = :client_id AND r\.name = 'Recibo'\)/;
  /** The existence guard, written with alias `r` (Effect 2) or `r2` (Effects 5 and 6). */
  const RECIBO_EXISTS =
    /EXISTS \( SELECT 1 FROM fin_paymentmethod (r2?) WHERE \1\.ad_client_id = :client_id AND \1\.name = 'Recibo'\)/;

  const assigning = statements.filter((s) => RECIBO_SUBQUERY_ASSIGN.test(s));

  it('finds the 11 statements that repoint a column onto Recibo', () => {
    assert.deepEqual(
      assigning.map((s) => s.match(/^UPDATE (\w+)/)[1]),
      [
        'fin_finacc_paymentmethod', // Effect 2  — the per-account links
        'c_bpartner', //              Effect 5  — sales default
        'c_bpartner', //                        — purchase default
        'c_paymenttermline',
        'c_project',
        'c_projectproposal',
        'fin_payment_proposal',
        'c_invoice', //               Effect 6  — unprocessed documents
        'c_order',
        'fin_payment',
        'fin_payment_schedule',
      ],
    );
  });

  it('requires Recibo to EXIST on all 11 of them (regression: NULL would blank the column)', () => {
    for (const s of assigning) {
      assert.match(
        s,
        RECIBO_EXISTS,
        `assigns from the Recibo scalar subquery without an existence guard (would blank the column to NULL): ${s.slice(0, 90)}`,
      );
    }
    assert.equal(assigning.length, 11, 'all 11 repointing statements must be accounted for');
    assert.equal(
      (sqlApply.match(new RegExp(RECIBO_EXISTS.source, 'g')) || []).length,
      11,
      'exactly the 11 repointing statements carry the Recibo existence guard',
    );
  });

  it('never assigns a paymentmethod_id from an unguarded scalar subquery anywhere in @apply', () => {
    // Complement of the loop above: catches a NEW statement that introduces its own subquery shape
    // (a different alias, a different column) and forgets the guard.
    for (const s of statements) {
      if (!/SET [a-z_]*paymentmethod_id = \( SELECT /.test(s)) continue;
      assert.match(s, RECIBO_SUBQUERY_ASSIGN, `unexpected scalar-subquery shape: ${s.slice(0, 90)}`);
      assert.match(s, RECIBO_EXISTS, `unguarded scalar subquery: ${s.slice(0, 90)}`);
    }
  });

  it('leaves Effect 1b out of scope — it assigns literals, not a subquery', () => {
    const normalise = stmt(/^UPDATE fin_paymentmethod r SET isactive = 'Y'/);
    assert.doesNotMatch(normalise, RECIBO_SUBQUERY_ASSIGN);
    assert.match(normalise, /r\.name = 'Recibo'/, 'it is scoped by name instead');
  });
});

describe('R24 data-fix — two-layer idempotency (mandatory framework rule)', () => {
  it('every @apply statement carries a guard that makes a second pass match 0 rows', () => {
    for (const [i, s] of statements.entries()) {
      const guarded =
        /NOT EXISTS/i.test(s) // creation guards (Effect 1, 2, 4, 7-delete)
        || /\bNOT \(/i.test(s) // configuration-divergence guards (Effect 1b, 3)
        || /IS DISTINCT FROM/i.test(s) // value-change guard (Effect 7-deactivate)
        || /name = 'Cheque'/.test(s); // repointing guards: once repointed, nothing matches Cheque
      assert.ok(guarded, `@apply statement #${i + 1} has no idempotency guard: ${s.slice(0, 90)}`);
    }
  });

  it('Effect 1 only inserts Recibo when it does not exist yet', () => {
    assert.match(
      stmt(/^INSERT INTO fin_paymentmethod/),
      /AND NOT EXISTS \( SELECT 1 FROM fin_paymentmethod x WHERE x\.ad_client_id = :client_id AND x\.name = 'Recibo'\)/,
    );
  });

  it('Effect 4 only inserts a link the account does not already have', () => {
    assert.match(
      stmt(/^INSERT INTO fin_finacc_paymentmethod/),
      /AND NOT EXISTS \( SELECT 1 FROM fin_finacc_paymentmethod f WHERE f\.fin_financial_account_id = fa\.fin_financial_account_id AND f\.fin_paymentmethod_id = r\.fin_paymentmethod_id\)/,
    );
  });

  it('Effect 7 deactivation only fires while Cheque is not already inactive', () => {
    assert.match(
      stmt(/^UPDATE fin_paymentmethod pm SET isactive = 'N'/),
      /AND pm\.isactive IS DISTINCT FROM 'N'/,
    );
  });

  it('Effect 7 delete checks all 13 FK columns that reference fin_paymentmethod', () => {
    const del = stmt(/^DELETE FROM fin_paymentmethod/);
    const referencing = [
      'c_bpartner',
      'c_invoice',
      'c_order',
      'c_paymenttermline',
      'c_project',
      'c_projectproposal',
      'fin_finacc_paymentmethod',
      'fin_orig_payment_schedule',
      'fin_payment',
      'fin_payment_proposal',
      'fin_payment_schedule',
      'gl_journalline',
      'obirb_invbookline',
    ];
    for (const table of referencing) {
      assert.match(del, new RegExp(`NOT EXISTS \\(SELECT 1 FROM ${table} t`), `delete guard misses ${table}`);
    }
    assert.equal((del.match(/NOT EXISTS \(SELECT 1 FROM/g) || []).length, referencing.length);
    // c_bpartner holds TWO references (sales + purchase default method); both must be covered.
    assert.match(del, /FROM c_bpartner t WHERE pm\.fin_paymentmethod_id IN \(t\.fin_paymentmethod_id, t\.po_paymentmethod_id\)/);
  });

  it('@check covers the same predicates @apply writes, so the fix provably converges', () => {
    // (a) method template diverges -> Effect 1 / 1b
    assert.match(sqlCheck, /NOT EXISTS \( SELECT 1 FROM fin_paymentmethod r WHERE r\.ad_client_id = :client_id AND r\.name = 'Recibo'/);
    // (b) a link still points at Cheque -> Effect 2 / 2b
    assert.match(sqlCheck, /EXISTS \( SELECT 1 FROM fin_finacc_paymentmethod fpm JOIN fin_paymentmethod pm ON pm\.fin_paymentmethod_id = fpm\.fin_paymentmethod_id WHERE fpm\.ad_client_id = :client_id AND pm\.ad_client_id = :client_id AND pm\.name = 'Cheque'\)/);
    // (c) a Bank/Card account has no Recibo link -> Effect 4
    assert.match(sqlCheck, /FROM fin_financial_account fa WHERE fa\.ad_client_id = :client_id AND fa\.type IN \('B', 'CA'\)/);
    // (d) a Recibo link diverges -> Effect 3
    assert.match(sqlCheck, /pm\.name = 'Recibo' AND NOT \(fpm\.isactive = 'Y'/);
    // (e)/(f) config references and unprocessed documents -> Effects 5 and 6
    for (const table of ['c_bpartner', 'c_paymenttermline', 'c_project', 'c_projectproposal', 'fin_payment_proposal']) {
      assert.match(sqlCheck, new RegExp(`FROM ${table} x JOIN fin_paymentmethod pm`), `@check misses the ${table} reference`);
    }
    for (const table of ['c_invoice', 'c_order', 'fin_payment']) {
      assert.match(sqlCheck, new RegExp(`FROM ${table} x JOIN fin_paymentmethod pm[^)]*x\\.processed = 'N'`), `@check misses the unprocessed ${table}`);
    }
    // (g) Cheque still selectable, or now deletable -> Effect 7
    assert.match(sqlCheck, /pm\.name = 'Cheque' AND pm\.isactive = 'Y'/);
    assert.match(sqlCheck, /pm\.name = 'Cheque' AND NOT EXISTS \(SELECT 1 FROM c_bpartner t/);
  });

  it('@check returns at most one row (LIMIT 1) — it is a boolean gate, not a work list', () => {
    assert.match(sqlCheck, /LIMIT 1;$/);
    assert.match(sqlCheck, /^SELECT 1 FROM ad_client c/);
  });
});

describe('R24 data-fix — atomicity and statement order inside @apply', () => {
  it('runs the 8 documented effects in the required order', () => {
    const expected = [
      /^INSERT INTO fin_paymentmethod/, // 1  create Recibo
      /^UPDATE fin_paymentmethod r SET isactive = 'Y'/, // 1b normalise the template
      /^UPDATE fin_finacc_paymentmethod fpm SET fin_paymentmethod_id/, // 2  repoint links
      /^DELETE FROM fin_finacc_paymentmethod/, // 2b drop leftovers
      /^UPDATE fin_finacc_paymentmethod fpm SET isactive = 'Y'/, // 3  normalise links
      /^INSERT INTO fin_finacc_paymentmethod/, // 4  missing links on B/CA
      /^UPDATE c_bpartner x SET fin_paymentmethod_id/, // 5  config references (x6)
      /^UPDATE c_bpartner x SET po_paymentmethod_id/,
      /^UPDATE c_paymenttermline x SET fin_paymentmethod_id/,
      /^UPDATE c_project x SET fin_paymentmethod_id/,
      /^UPDATE c_projectproposal x SET fin_paymentmethod_id/,
      /^UPDATE fin_payment_proposal x SET fin_paymentmethod_id/,
      /^UPDATE c_invoice x SET fin_paymentmethod_id/, // 6  unprocessed documents (x4)
      /^UPDATE c_order x SET fin_paymentmethod_id/,
      /^UPDATE fin_payment x SET fin_paymentmethod_id/,
      /^UPDATE fin_payment_schedule s SET fin_paymentmethod_id/,
      /^DELETE FROM fin_paymentmethod/, // 7  retire: delete if unused...
      /^UPDATE fin_paymentmethod pm SET isactive = 'N'/, //     ...otherwise deactivate
    ];
    assert.equal(statements.length, expected.length);
    for (const [i, re] of expected.entries()) {
      assert.match(statements[i], re, `@apply statement #${i + 1} out of order`);
    }
  });

  it('creates Recibo BEFORE anything tries to point at it', () => {
    const create = sqlApply.indexOf('INSERT INTO fin_paymentmethod');
    const firstRepoint = sqlApply.indexOf('UPDATE fin_finacc_paymentmethod fpm SET fin_paymentmethod_id');
    assert.ok(create >= 0 && firstRepoint > create, 'Effect 1 must precede Effect 2');
  });

  it('repoints the links BEFORE normalising them (Effect 3 must see the migrated rows)', () => {
    const repoint = sqlApply.indexOf('UPDATE fin_finacc_paymentmethod fpm SET fin_paymentmethod_id');
    const normalise = sqlApply.indexOf("UPDATE fin_finacc_paymentmethod fpm SET isactive = 'Y'");
    const insertLinks = sqlApply.indexOf('INSERT INTO fin_finacc_paymentmethod');
    assert.ok(repoint < normalise, 'Effect 2 must precede Effect 3');
    assert.ok(normalise < insertLinks, 'Effect 3 must precede Effect 4 (new links are born correct)');
  });

  it('repoints every reference (Effects 5 and 6) BEFORE retiring Cheque (Effect 7)', () => {
    // Otherwise the DELETE could never fire: the references it checks would still exist.
    const retire = sqlApply.indexOf('DELETE FROM fin_paymentmethod');
    for (const marker of [
      'UPDATE c_bpartner x SET fin_paymentmethod_id',
      'UPDATE c_bpartner x SET po_paymentmethod_id',
      'UPDATE c_paymenttermline x SET fin_paymentmethod_id',
      'UPDATE c_project x SET fin_paymentmethod_id',
      'UPDATE c_projectproposal x SET fin_paymentmethod_id',
      'UPDATE fin_payment_proposal x SET fin_paymentmethod_id',
      'UPDATE c_invoice x SET fin_paymentmethod_id',
      'UPDATE c_order x SET fin_paymentmethod_id',
      'UPDATE fin_payment x SET fin_paymentmethod_id',
      'UPDATE fin_payment_schedule s SET fin_paymentmethod_id',
    ]) {
      const idx = sqlApply.indexOf(marker);
      assert.ok(idx >= 0, `missing statement: ${marker}`);
      assert.ok(idx < retire, `${marker} must run before the Cheque DELETE`);
    }
  });

  it('DELETEs Cheque BEFORE the isactive=N fallback, so the UPDATE only hits a survivor', () => {
    const del = sqlApply.indexOf('DELETE FROM fin_paymentmethod');
    const deactivate = sqlApply.indexOf("UPDATE fin_paymentmethod pm SET isactive = 'N'");
    assert.ok(del >= 0 && deactivate > del, 'the DELETE must precede the deactivation');
  });

  it('drops the leftover Cheque links BEFORE the Cheque DELETE checks fin_finacc_paymentmethod', () => {
    const dropLinks = sqlApply.indexOf('DELETE FROM fin_finacc_paymentmethod');
    const del = sqlApply.indexOf('DELETE FROM fin_paymentmethod');
    assert.ok(dropLinks >= 0 && dropLinks < del);
  });

  it('keeps every effect in ONE @apply section (single transaction, all-or-nothing)', () => {
    // The runner wraps @apply in a single transaction; splitting the retirement out into a second
    // fix would allow a tenant to end up with Cheque deleted but its references not repointed.
    assert.equal(normApply.split(/--\s*@apply/i).length, 1, 'exactly one @apply marker');
    assert.match(normApply, /Effect 1 --/);
    assert.match(normApply, /Effect 7 --/);
  });
});

describe('R24 data-fix — history is preserved (processed documents keep Cheque)', () => {
  it('only repoints UNPROCESSED invoices, orders and payments', () => {
    for (const table of ['c_invoice', 'c_order', 'fin_payment']) {
      const s = stmt(new RegExp(`^UPDATE ${table} x SET fin_paymentmethod_id`));
      assert.match(s, /AND x\.processed = 'N'/, `${table} must be filtered on processed = 'N'`);
    }
  });

  it('repoints payment-plan lines only when their parent document is unprocessed', () => {
    const s = stmt(/^UPDATE fin_payment_schedule s SET fin_paymentmethod_id/);
    assert.match(
      s,
      /AND \(EXISTS \(SELECT 1 FROM c_invoice i WHERE i\.c_invoice_id = s\.c_invoice_id AND i\.processed = 'N'\) OR EXISTS \(SELECT 1 FROM c_order o WHERE o\.c_order_id = s\.c_order_id AND o\.processed = 'N'\)\)/,
    );
  });

  it('never filters the forward-looking CONFIGURATION references on `processed`', () => {
    // Effect 5 targets master/config data with no processed flag — a stray filter there would
    // leave business partners defaulting to an inactive method.
    for (const table of ['c_bpartner', 'c_paymenttermline', 'c_project', 'c_projectproposal', 'fin_payment_proposal']) {
      for (const s of statements.filter((x) => new RegExp(`^UPDATE ${table} x SET`).test(x))) {
        assert.doesNotMatch(s, /processed/, `${table} is config, not a document`);
      }
    }
  });

  it('never deletes or rewrites a processed document', () => {
    assert.doesNotMatch(sqlApply, /DELETE FROM (c_invoice|c_order|fin_payment|fin_payment_schedule|gl_journalline)\b/i);
  });
});

describe('R24 data-fix — @report surfaces a surviving (deactivated) Cheque', () => {
  it('is a read-only SELECT scoped to the client', () => {
    assert.match(sqlReport, /^SELECT /);
    assert.doesNotMatch(sqlReport, /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i);
    assert.match(sqlReport, /WHERE pm\.ad_client_id = :client_id AND pm\.name = 'Cheque'/);
  });

  it('returns 0 rows when Cheque was deleted outright (it selects from fin_paymentmethod)', () => {
    assert.match(sqlReport, /FROM fin_paymentmethod pm/);
  });

  it('reports the reference counts that blocked the delete', () => {
    for (const [table, alias] of [
      ['c_invoice', 'invoices'],
      ['c_order', 'orders'],
      ['fin_payment', 'payments'],
      ['fin_payment_schedule', 'payment_plan_lines'],
      ['gl_journalline', 'journal_lines'],
    ]) {
      assert.match(
        sqlReport,
        new RegExp(`\\(SELECT count\\(\\*\\) FROM ${table} t WHERE t\\.fin_paymentmethod_id = pm\\.fin_paymentmethod_id\\) +AS ${alias}`),
        `@report misses the ${alias} count`,
      );
    }
    assert.match(sqlReport, /'DEACTIVATED \(history preserved\)' +AS outcome/);
  });
});
