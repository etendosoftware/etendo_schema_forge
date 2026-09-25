import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R39 corrective data-fix
 * (20260922T120000Z__R39-ap-invoice-fc-series.sql, ETP-5364, gap N7).
 *
 * ETP-5285 defined five document series and named a sixth, "Factura de compra" (FC),
 * that it could not ship: the `AP Invoice` doctype carries stock Openbravo's
 * `IsDocNoControlled='N'` and no sequence at all, so a purchase invoice takes its
 * proposed number from the shared `DocumentNo_C_Invoice` fallback. ETP-5364 is the
 * product decision that reverses it. Its preventive front corrects the curated dataset
 * (`GOClient/AD_SEQUENCE.xml` + `GOClient/C_DOCTYPE.xml`); this fix closes the same gap
 * on already-provisioned tenants.
 *
 * R38 deliberately excluded FC and its own test pins that absence. This fix is a NEW
 * dated file rather than an edit to R38 because R38 is already on `develop` and the
 * framework's rule 3 makes an applied fix immutable — and because the runner never
 * re-reads a fix in a PROCESSED state, so a widened R38 would be a silent no-op on
 * every tenant that had already run it.
 *
 * The runner executes the parsed @check/@apply against a live Postgres tenant, so true
 * row-level behavior needs a DB. What is verified deterministically here is the SQL the
 * fix ships: header metadata, the exact one-sequence/one-doctype scope, tenant
 * isolation, the two-layer idempotency guard, the fact that BOTH halves are present
 * (either alone is a silent no-op), and the fiscal-premise documentation the header is
 * required to carry because this fix starts a numbering series where there was none.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260922T120000Z__R39-ap-invoice-fc-series.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
/**
 * Drop `--` comment lines before asserting. The header quotes values and predicates it
 * deliberately does NOT use (the dataset's GOClient sequence id, the fallback counter's
 * name), so a `doesNotMatch` run against the raw text would read prose as if it were
 * code and fail for the wrong reason.
 */
const sqlOnly = (s) => norm(s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n'));
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);
const normReport = norm(fix.report ?? '');
const sqlCheck = sqlOnly(fix.check);
const sqlApply = sqlOnly(fix.apply);

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('R39 FC data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R39-ap-invoice-fc-series');
    assert.equal(fix.gap, 'N7');
  });

  it('is a medium-risk sql fix (it starts a numbering series)', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'medium');
  });

  it('has a first-line description that stands alone in the ledger', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /ETP-5364/);
    assert.match(fix.description, /FC/);
    assert.match(fix.description, /1000000/);
  });

  it('has non-empty @check, @apply and @report sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(fix.report && fix.report.length > 0, '@report is the post-condition check');
  });

  it('sorts after R38, whose five series it completes', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-09-22T12:00:00.000Z');
    assert.ok(
      ts.getTime()
        > parseFixTimestamp('20260919T120000Z__R38-document-sequence-series-prefixes').getTime(),
      'R39 must sort after R38-document-sequence-series-prefixes',
    );
  });
});

describe('R39 FC data-fix — scope is one sequence and one doctype', () => {
  it('targets the AD_Sequence named AP Invoice with prefix FC at 1000000', () => {
    assert.match(sqlCheck, new RegExp(esc("s.name = 'AP Invoice'")));
    assert.match(sqlApply, new RegExp(esc("'AP Invoice'")));
    assert.match(sqlApply, /'FC'/);
    assert.match(sqlApply, /1000000/);
  });

  it('targets the AP Invoice doctype by name and docbasetype, never the rectificativa', () => {
    assert.match(sqlApply, new RegExp(esc("dt.docbasetype = 'API'")));
    assert.doesNotMatch(sqlApply, /Factura Rectificativa/);
  });

  it('never touches the five series R38 already owns', () => {
    for (const other of ['Purchase Order', 'Standard Order', 'AR Invoice',
      'Factura Rectificativa (Ventas)', 'Factura Rectificativa (Compras)']) {
      assert.doesNotMatch(sqlCheck, new RegExp(esc(`'${other}'`)));
      assert.doesNotMatch(sqlApply, new RegExp(esc(`'${other}'`)));
    }
  });

  it('never touches a DocumentNo_* fallback counter', () => {
    assert.doesNotMatch(sqlCheck, /DocumentNo_/);
    assert.doesNotMatch(sqlApply, /DocumentNo_/);
  });

  it('mints a per-tenant id and never replants the dataset GOClient sequence id', () => {
    assert.match(sqlApply, /@uuid_R39APSEQ@/, 'the PK must come from the runner placeholder');
    assert.doesNotMatch(sqlApply, /B1BF521B12684968B31531D88B9F20AB/);
    assert.match(rawText, /B1BF521B12684968B31531D88B9F20AB/,
      'the header must name the dataset id it refuses to reuse');
  });

  it('writes a prefix the Document Sequence window itself would accept on a later save', () => {
    const prefix = 'FC';
    assert.ok(prefix.length <= 20);
    assert.doesNotMatch(prefix, /[a-záéíóúüñ]/);
    assert.doesNotMatch(prefix, /[IOYWÑ]/, 'I O Y W Ñ are reserved by the Spanish fiscal rules');
    assert.doesNotMatch(prefix, /[^A-Z0-9-]/);
  });
});

describe('R39 FC data-fix — both halves are present', () => {
  it('creates the sequence AND points the doctype at it', () => {
    assert.match(sqlApply, /\bINSERT INTO ad_sequence\b/i, 'half 1: the sequence');
    assert.match(sqlApply, /\bUPDATE c_doctype\b/i, 'half 2: the doctype');
    assert.match(sqlApply, new RegExp(esc("isdocnocontrolled = 'Y'")));
    assert.match(sqlApply, /docnosequence_id =/);
  });

  it('inserts the sequence before the doctype reads it back', () => {
    const insertAt = sqlApply.search(/INSERT INTO ad_sequence/i);
    const doctypeAt = sqlApply.search(/UPDATE c_doctype/i);
    assert.ok(insertAt >= 0 && doctypeAt >= 0);
    assert.ok(insertAt < doctypeAt, 'the doctype update reads the row step 1 writes');
  });

  it('resolves the doctype pointer by name, not from the uuid placeholder', () => {
    // A tenant that already owned an 'AP Invoice' sequence skips the insert, so the
    // placeholder id would name a row that was never written.
    const doctypeStatement = sqlApply.slice(sqlApply.search(/UPDATE c_doctype/i));
    assert.doesNotMatch(doctypeStatement, /@uuid_R39APSEQ@/);
    assert.match(doctypeStatement, new RegExp(esc("s.name = 'AP Invoice'")));
  });

  it('leaves the new sequence with no description (the window shows that column)', () => {
    assert.match(normApply, /'AP Invoice', NULL/, 'description must be inserted as NULL');
  });

  it('records that either half alone is a silent no-op', () => {
    assert.match(rawText, /BOTH HALVES ARE REQUIRED/);
    assert.match(rawText, /silent\s+(?:--\s+)?no-op/i);
  });
});

describe('R39 FC data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes the @check to the client', () => {
    assert.match(normCheck, /ad_client_id = :client_id/);
  });

  it('scopes every @apply statement to the client', () => {
    const statements = sqlApply.split(';').filter((s) => s.trim().length > 0);
    assert.equal(statements.length, 3, 'insert + sequence align + doctype update');
    for (const statement of statements) {
      assert.match(statement, /ad_client_id = :client_id/);
    }
  });

  it('scopes the @report to the client', () => {
    assert.match(normReport, /ad_client_id = :client_id/);
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE ad_client' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R39 FC data-fix — two-layer idempotency (mandatory framework rule)', () => {
  it('the @check gate covers everything the @apply writes', () => {
    assert.match(sqlCheck, new RegExp(esc("s.prefix IS DISTINCT FROM 'FC'")));
    assert.match(sqlCheck, /s\.startno IS DISTINCT FROM 1000000/);
    assert.match(sqlCheck, /s\.currentnext IS DISTINCT FROM 1000000/);
    assert.match(sqlCheck, new RegExp(esc("dt.isdocnocontrolled IS DISTINCT FROM 'Y'")));
    assert.match(sqlCheck, /dt\.docnosequence_id IS DISTINCT FROM/);
  });

  it('guards the insert so a pre-existing sequence is kept, not duplicated', () => {
    const insertStatement = sqlApply.slice(
      sqlApply.search(/INSERT INTO ad_sequence/i),
      sqlApply.indexOf(';', sqlApply.search(/INSERT INTO ad_sequence/i)),
    );
    assert.match(insertStatement, /NOT EXISTS/);
  });

  it('self-guards both updates with IS DISTINCT FROM, never <>', () => {
    assert.match(sqlApply, /IS DISTINCT FROM/);
    assert.doesNotMatch(sqlApply, /prefix <> /);
    assert.doesNotMatch(sqlApply, /isdocnocontrolled <> /);
  });

  it('stamps updated/updatedby on every statement', () => {
    const [insert, ...updates] = sqlApply.split(';').filter((s) => s.trim().length > 0);
    assert.match(insert, /createdby, updated, updatedby/);
    assert.match(insert, /now\(\), '0', now\(\), '0'/);
    assert.equal(updates.length, 2);
    for (const update of updates) {
      assert.match(update, /updated = now\(\)/);
      assert.match(update, /updatedby = '0'/);
    }
  });

  it('the @report re-asserts the post-condition, so a clean run reports nothing', () => {
    assert.match(normReport, new RegExp(esc("dt.isdocnocontrolled IS DISTINCT FROM 'Y'")));
    assert.match(normReport, new RegExp(esc("s.prefix = 'FC'")));
    assert.match(normReport, /s\.startno = 1000000/);
  });
});

describe('R39 FC data-fix — fiscal-premise documentation is load-bearing, not decorative', () => {
  it('records the premise that makes starting a series on a live tenant acceptable', () => {
    assert.match(rawText, /no productive tenants/i);
    assert.match(rawText, /2026-09-22/, 'the decision must be dated');
  });

  it('records that going productive creates a NEW tenant, born correct', () => {
    assert.match(rawText, /CREATES A NEW ONE/);
    assert.match(rawText, /upgrade/);
  });

  it('states plainly that there is no guard that makes it safe once that changes', () => {
    assert.match(rawText, /DO NOT RUN THIS FIX/);
    assert.match(rawText, /manual decision about the starting\s+(?:--\s+)?number/);
  });

  it('explains why it is a new file instead of a widened R38', () => {
    assert.match(rawText, /R38-document-sequence-series-prefixes/);
  });

  it('forbids widening the scope without widening the dataset in the same change', () => {
    assert.match(rawText, /DO NOT WIDEN THIS FIX/);
  });
});
