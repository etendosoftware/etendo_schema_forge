import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams, inlineFreshUuids } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R17 rectificativa doc-type/sequence fix
 * (20260730T180000Z__R17-rectificativa-doctype-sequence.sql, ETP-4737, gap H1),
 * covering the ETP-4799 addendum that auto-creates a missing gl_category row.
 *
 * Root cause (ETP-4799): running R17 live (not dry-run) in Experimental, 69/82
 * tenants completed cleanly, 13 stopped with
 *   null value in column "gl_category_id" of relation "c_doctype" violates
 *   not-null constraint
 * Confirmed against the DB: those 13 tenants have NO rows AT ALL in
 * gl_category — not a differently-named category, total absence of the table
 * content for that tenant — so the pre-existing
 * COALESCE('ES AR/AP Invoice' lookup, 'AR/AP Invoice' lookup) returned NULL.
 * Every failure rolled back cleanly (no partial state); since FAILED is
 * excluded from the runner's watermark, the 13 tenants retry this exact
 * fix_id on the next run once the fix lands — so the fix lands as an in-place
 * edit of this already-partially-applied file, not a new dated fix. The 69
 * tenants that already reached APPLIED are unaffected (watermark skip; the
 * runner never re-checks a PROCESSED fix).
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply SQL
 * against a live Postgres tenant, so true row-level behavior can only be
 * verified end-to-end with a DB. What is verified deterministically here,
 * without a DB, is the SQL the fix ships: header metadata, tenant isolation,
 * and — the ETP-4799 addendum — that a gl_category row is created for both AR
 * and AP legs, guarded so it is a no-op once either the ES-localized or the
 * plain name already resolves (mirroring the COALESCE it feeds), and that it
 * runs BEFORE the c_doctype inserts that depend on it.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260730T180000Z__R17-rectificativa-doctype-sequence.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normApply = norm(fix.apply);

describe('R17 data-fix — header metadata unchanged by the ETP-4799 addendum', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R17-rectificativa-doctype-sequence');
    assert.equal(fix.gap, 'H1');
  });

  it('is a medium-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'medium');
  });

  it('description header line is unchanged (parseFix only captures the first @description line)', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /ETP-4737/);
  });

  it('the raw header comment block documents the ETP-4799 gl_category addendum (continuation lines, informational only)', () => {
    const headerBlock = rawText.slice(0, rawText.indexOf('-- @check'));
    assert.match(headerBlock, /ETP-4799/);
    assert.match(headerBlock, /gl_category/i);
  });

  it('has non-empty @check and @apply sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
  });

  it('keeps its original filename timestamp (in-place fix-forward edit, not a new dated fix)', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-07-30T18:00:00.000Z');
  });
});

describe('R17 data-fix — tenant isolation (gl_category steps scoped to :client_id)', () => {
  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE gl_category' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R17 data-fix — ETP-4799: auto-creates the missing gl_category row', () => {
  it('inserts into gl_category before the AR c_doctype insert (step 0a precedes step 1b)', () => {
    const glCategoryIdx = normApply.indexOf('INSERT INTO gl_category');
    const arDocTypeIdx = normApply.indexOf("'Factura Rectificativa',");
    assert.ok(glCategoryIdx >= 0, 'expected an INSERT INTO gl_category');
    assert.ok(arDocTypeIdx >= 0, 'expected the AR c_doctype insert');
    assert.ok(glCategoryIdx < arDocTypeIdx, 'gl_category insert must run before the AR doc type insert');
  });

  it('inserts into gl_category before the AP c_doctype insert too (step 0b precedes step 2b)', () => {
    // Step 0b is the SECOND "INSERT INTO gl_category" occurrence (0a is the first, asserted above).
    const apGlCategoryIdx = normApply.indexOf('INSERT INTO gl_category', normApply.indexOf('INSERT INTO gl_category') + 1);
    const apDocTypeIdx = normApply.indexOf("'Factura Rectificativa (compras)',");
    assert.ok(apGlCategoryIdx >= 0, 'expected a second INSERT INTO gl_category (step 0b, AP leg)');
    assert.ok(apDocTypeIdx >= 0, 'expected the AP c_doctype insert');
    assert.ok(apGlCategoryIdx < apDocTypeIdx, 'AP gl_category insert (0b) must run before the AP doc type insert (2b)');
  });

  it('creates exactly one AR Invoice row and one AP Invoice row, both categorytype=D (Document)', () => {
    const arInsert = /INSERT INTO gl_category \([^)]*\)\s*SELECT '@uuid_R17ARGLCAT@', :client_id, '0', 'Y', now\(\), '0', now\(\), '0',\s*'AR Invoice', NULL, 'D', 'N', NULL/;
    const apInsert = /INSERT INTO gl_category \([^)]*\)\s*SELECT '@uuid_R17APGLCAT@', :client_id, '0', 'Y', now\(\), '0', now\(\), '0',\s*'AP Invoice', NULL, 'D', 'N', NULL/;
    assert.match(normApply, arInsert);
    assert.match(normApply, apInsert);
  });

  it('guards the AR insert with the same COALESCE fallback names the AR doc type lookup uses', () => {
    assert.match(
      normApply,
      /WHERE NOT EXISTS \( SELECT 1 FROM gl_category WHERE ad_client_id = :client_id AND name IN \('ES AR Invoice', 'AR Invoice'\) AND isactive = 'Y' \);/,
    );
  });

  it('guards the AP insert with the same COALESCE fallback names the AP doc type lookup uses', () => {
    assert.match(
      normApply,
      /WHERE NOT EXISTS \( SELECT 1 FROM gl_category WHERE ad_client_id = :client_id AND name IN \('ES AP Invoice', 'AP Invoice'\) AND isactive = 'Y' \);/,
    );
  });

  it('the two new @uuid_ tokens resolve to distinct fresh ids and never collide with the sequence/doctype tokens', () => {
    const inlined = inlineFreshUuids(fix.apply);
    assert.doesNotMatch(inlined, /@uuid_/);
    // Every '@uuid_<KEY>@' occurrence for the same KEY resolved to the same 32-hex id.
    const arCatMatches = [...fix.apply.matchAll(/@uuid_R17ARGLCAT@/g)];
    const apCatMatches = [...fix.apply.matchAll(/@uuid_R17APGLCAT@/g)];
    assert.equal(arCatMatches.length, 1, 'AR gl_category token should be used exactly once');
    assert.equal(apCatMatches.length, 1, 'AP gl_category token should be used exactly once');
  });

  it('all six @uuid_ tokens in the fix (2 new gl_category + 4 pre-existing seq/doctype) resolve to 6 pairwise-distinct ids', () => {
    // freshEtendoId() is backed by crypto.randomUUID(), so collision is not a realistic runtime
    // concern — this test guards the KEY-uniqueness bookkeeping in inlineFreshUuids itself (a
    // Map keyed by token name), not entropy: it would catch a copy-paste that reused an existing
    // token name (e.g. step 0a accidentally reusing '@uuid_R17ARSEQ@') long before that hit prod.
    const TOKEN_RE = /@uuid_([0-9A-Za-z]+)@/g;
    const expectedKeys = ['R17APDT', 'R17APGLCAT', 'R17APSEQ', 'R17ARDT', 'R17ARGLCAT', 'R17ARSEQ'];
    const keys = [...fix.apply.matchAll(TOKEN_RE)].map((m) => m[1]);
    assert.deepEqual([...new Set(keys)].sort(), expectedKeys);

    // `split` with a 1-capture-group regex interleaves the literal text between tokens with the
    // captured key: [lit0, key0, lit1, key1, ..., litN]. Since every literal segment is untouched
    // by inlineFreshUuids, walking `inlined` with the same literal-length offsets isolates exactly
    // the 32-hex id substituted for each token occurrence — no re-implementation of the helper.
    const parts = fix.apply.split(TOKEN_RE);
    const inlined = inlineFreshUuids(fix.apply);
    const idByKey = new Map();
    let cursor = 0;
    for (let i = 0; i < parts.length; i += 2) {
      const literal = parts[i];
      assert.equal(inlined.slice(cursor, cursor + literal.length), literal, `literal SQL around token #${i / 2} must be unchanged`);
      cursor += literal.length;
      if (i + 1 >= parts.length) break;
      const key = parts[i + 1];
      const id = inlined.slice(cursor, cursor + 32);
      assert.match(id, /^[0-9A-F]{32}$/, `expected a 32-hex id where @uuid_${key}@ was`);
      cursor += 32;
      if (idByKey.has(key)) {
        assert.equal(id, idByKey.get(key), `repeated token @uuid_${key}@ must resolve to the same id every occurrence`);
      } else {
        idByKey.set(key, id);
      }
    }

    assert.equal(idByKey.size, 6, 'expected all 6 distinct token keys to have been resolved');
    assert.equal(
      new Set(idByKey.values()).size,
      6,
      'all 6 resolved ids must be pairwise distinct — no collision across AR/AP gl_category, sequence, and doctype tokens',
    );
  });

  it('does not touch the pre-existing COALESCE lookups in the c_doctype inserts', () => {
    assert.match(
      normApply,
      /COALESCE\( \(SELECT gl_category_id FROM gl_category WHERE ad_client_id = :client_id AND name = 'ES AR Invoice' AND isactive = 'Y' LIMIT 1\), \(SELECT gl_category_id FROM gl_category WHERE ad_client_id = :client_id AND name = 'AR Invoice' AND isactive = 'Y' LIMIT 1\) \)/,
    );
    assert.match(
      normApply,
      /COALESCE\( \(SELECT gl_category_id FROM gl_category WHERE ad_client_id = :client_id AND name = 'ES AP Invoice' AND isactive = 'Y' LIMIT 1\), \(SELECT gl_category_id FROM gl_category WHERE ad_client_id = :client_id AND name = 'AP Invoice' AND isactive = 'Y' LIMIT 1\) \)/,
    );
  });
});

describe('R17 data-fix — ETP-4799: idempotency & regression safety for the 69 already-applied tenants', () => {
  // The 69/82 tenants that already reached APPLIED before ETP-4799 landed, and any tenant whose
  // gl_category table already carries the row under either name, must see steps 0a/0b as pure
  // no-ops on retry — the runner replays this exact fix_id for the 13 tenants that failed, and the
  // watermark means everyone else is skipped entirely, but the guard itself must also be correct in
  // isolation in case the fix is ever re-applied by hand.

  it('both gl_category inserts are guarded — no bare/unconditional "INSERT INTO gl_category" exists', () => {
    // Every INSERT INTO gl_category ... SELECT ... block in @apply must end in a WHERE NOT EXISTS
    // guard before its terminating semicolon — i.e. no statement inserts unconditionally.
    const statements = fix.apply.split(/;\s*/).filter((s) => /INSERT INTO gl_category/.test(s));
    assert.equal(statements.length, 2, 'expected exactly 2 INSERT INTO gl_category statements (0a, 0b)');
    for (const stmt of statements) {
      assert.match(stmt, /WHERE NOT EXISTS/, 'every gl_category insert must be guarded by WHERE NOT EXISTS');
    }
  });

  it('the AR guard fires only on the exact fallback names the AR COALESCE reads (no partial/prefix match)', () => {
    // A LIKE-based or unanchored guard could under- or over-match; the fix must reuse the identical
    // literal name set the COALESCE lookup in step 1b uses, so "no-op once resolvable" and
    // "resolvable" stay in lockstep by construction, not by coincidence.
    assert.doesNotMatch(normApply.split('INSERT INTO gl_category')[1], /LIKE/);
  });

  it('the AR and AP guards are independent — the AR guard never references AP Invoice names or vice versa', () => {
    const [, arBlock, apBlock] = normApply.split('INSERT INTO gl_category');
    assert.match(arBlock, /'ES AR Invoice', 'AR Invoice'/);
    assert.doesNotMatch(arBlock.split('WHERE NOT EXISTS')[0], /AP Invoice/);
    assert.match(apBlock, /'ES AP Invoice', 'AP Invoice'/);
  });

  it('once a gl_category row resolves for either localized or plain name, re-running skips the insert (guard mirrors the COALESCE exactly)', () => {
    // This is the concrete no-op case for the 69 already-succeeded tenants (and any tenant onboarded
    // with the standard "AR Invoice"/"AP Invoice" category already present): the guard's own
    // condition is the logical negation of "COALESCE would find a row", so whenever 1b/2b's
    // COALESCE can resolve a gl_category_id, 0a/0b's NOT EXISTS is false and the insert is skipped.
    const arGuardNames = normApply.match(/gl_category\s+WHERE ad_client_id = :client_id\s+AND name IN \('ES AR Invoice', 'AR Invoice'\)/);
    const arCoalesceNames = [...normApply.matchAll(/name = '(ES AR Invoice|AR Invoice)' AND isactive = 'Y'/g)].map((m) => m[1]);
    assert.ok(arGuardNames, 'AR guard must enumerate both names the COALESCE reads');
    assert.deepEqual(arCoalesceNames.sort(), ['AR Invoice', 'ES AR Invoice']);

    const apGuardNames = normApply.match(/gl_category\s+WHERE ad_client_id = :client_id\s+AND name IN \('ES AP Invoice', 'AP Invoice'\)/);
    const apCoalesceNames = [...normApply.matchAll(/name = '(ES AP Invoice|AP Invoice)' AND isactive = 'Y'/g)].map((m) => m[1]);
    assert.ok(apGuardNames, 'AP guard must enumerate both names the COALESCE reads');
    assert.deepEqual(apCoalesceNames.sort(), ['AP Invoice', 'ES AP Invoice']);
  });
});

describe('R17 data-fix — pre-existing ETP-4737 behavior preserved', () => {
  it('still retires the 3 legacy doc types (Active=No only, never deleted)', () => {
    assert.match(normApply, /UPDATE c_doctype SET isactive = 'N'/);
    assert.match(normApply, /'AR Credit Memo', 'Return Material Sales Invoice', 'AP CreditMemo', 'AP Credit Memo'/);
    assert.doesNotMatch(normApply, /DELETE FROM c_doctype/i);
  });

  it('still creates the two REC- rectificative sequences before their doc types', () => {
    assert.match(normApply, /'@uuid_R17ARSEQ@'/);
    assert.match(normApply, /'@uuid_R17APSEQ@'/);
    const arSeqIdx = normApply.indexOf("'@uuid_R17ARSEQ@'");
    const arDocTypeIdx = normApply.indexOf("'@uuid_R17ARDT@'");
    assert.ok(arSeqIdx < arDocTypeIdx, 'AR sequence insert must still precede the AR doc type insert');
  });
});
