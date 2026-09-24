import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R38 corrective data-fix
 * (20260919T120000Z__R38-document-sequence-series-prefixes.sql, ETP-5285, gap N6).
 *
 * ETP-5285 fixes the document series a tenant configures on the "Secuencia de
 * documentos" window: a prefix and a starting number per series. The curated
 * `GOClient/AD_SEQUENCE.xml` shipped three of them with NO prefix at all and the two
 * rectificativas with ETP-4737's interim `REC-`, and `AR Invoice` at 10000000 rather
 * than 1000000 — so a tenant's first sales order and first sales invoice were both
 * numbered `1000000`. The preventive front corrects that XML (new tenants born
 * correct); this fix closes the same gap on already-provisioned tenants.
 *
 *   Purchase Order                    -> PC   1000000
 *   Standard Order                    -> PV   1000000
 *   AR Invoice                        -> FV   1000000
 *   Factura Rectificativa (Ventas)    -> FVR  1000000
 *   Factura Rectificativa (Compras)   -> FCR  1000000
 *
 * The ticket names a sixth series, `FC` (Factura de compra). It is deliberately absent
 * on BOTH fronts: `AP Invoice` carries `IsDocNoControlled='N'` and no sequence in 76 of
 * 76 doctypes across all 75 clients (a purchase invoice is numbered by the supplier),
 * so giving it a series means creating a sequence AND flipping the doctype — a product
 * decision tracked separately. The tests below pin that absence so a later edit cannot
 * quietly widen the fix.
 *
 * The runner (src/data-fixes/run.js) executes the parsed @check/@apply SQL against a
 * live Postgres tenant, so true row-level behavior can only be verified end-to-end with
 * a DB. What is verified deterministically here, without a DB, is the SQL the fix
 * ships: header metadata, the exact five-series scope, tenant isolation, the two-layer
 * idempotency guard, and the fiscal-safety documentation the header is required to
 * carry because this fix lowers CURRENTNEXT and writes a prefix in both directions.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260919T120000Z__R38-document-sequence-series-prefixes.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
/**
 * Drop `--` comment lines before asserting. A section's prose explains guards it
 * deliberately does NOT carry (statement 2 quotes the forward-only guard while stating
 * it is absent), so a `doesNotMatch` run against the raw text would read the comment as
 * if it were code and pass or fail for the wrong reason.
 */
const sqlOnly = (s) => norm(s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n'));
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);
const normReport = norm(fix.report ?? '');
const sqlCheck = sqlOnly(fix.check);
const sqlApply = sqlOnly(fix.apply);

/** The five series, exactly as the preventive dataset now ships them. */
const SERIES = [
  ['Purchase Order', 'PC'],
  ['Standard Order', 'PV'],
  ['AR Invoice', 'FV'],
  ['Factura Rectificativa (Ventas)', 'FVR'],
  ['Factura Rectificativa (Compras)', 'FCR'],
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('R38 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R38-document-sequence-series-prefixes');
    assert.equal(fix.gap, 'N6');
  });

  it('is a medium-risk sql fix (it rewrites issued-document numbering)', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'medium');
  });

  it('has a first-line description that stands alone in the ledger', () => {
    // parseFix keeps only the first @description line, so it must be self-contained.
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /ETP-5285/);
    assert.match(fix.description, /PREFIX/);
    assert.match(fix.description, /1000000/);
  });

  it('has non-empty @check, @apply and @report sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(fix.report && fix.report.length > 0, '@report is the post-condition check');
  });

  it('sorts after R37, the latest pre-existing fix on this branch', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-09-19T12:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp('20260917T120000Z__prev').getTime(),
      'R38 must sort after 20260917T120000Z__R37-acctdim-bp-pr-locked-active',
    );
  });

  it('sorts after R31, which it supersedes for AR Invoice', () => {
    // R31 pins AR Invoice at the OLD 10000000. The runner sorts lexically by filename,
    // so R31 must run first and R38 must have the last word — otherwise a tenant that
    // needs both ends at 10000000. This ordering is the whole reason the two do not fight.
    assert.ok(
      parseFixTimestamp(FIX_ID).getTime()
        > parseFixTimestamp('20260902T120000Z__R31-document-sequence-startno').getTime(),
      'R38 must sort after R31-document-sequence-startno',
    );
  });
});

describe('R38 data-fix — scope is exactly the five series', () => {
  for (const [name, prefix] of SERIES) {
    it(`covers ${name} with prefix ${prefix}`, () => {
      assert.match(normCheck, new RegExp(esc(`'${name}'`)));
      assert.match(normApply, new RegExp(esc(`'${name}'`)));
      assert.match(normApply, new RegExp(esc(`'${name}', '${prefix}'`)));
    });
  }

  it('targets 1000000 for every series, in the check and in both number updates', () => {
    assert.doesNotMatch(sqlCheck, /10000000/, 'AR Invoice must no longer be pinned at 10000000');
    assert.doesNotMatch(sqlApply, /10000000/);
    for (const [name] of SERIES) {
      assert.match(normApply, new RegExp(esc(`'${name}', 1000000`)));
    }
  });

  it('never touches the four names ETP-5285 removed from the window', () => {
    // Removing them from VISIBLE_SEQUENCE_NAMES only hides the rows; their numbering
    // must stay exactly as it is. A corrective that reached them would exceed its
    // preventive front, which the framework forbids.
    for (const other of ['AP Payment', 'AR Receipt', 'MM Shipment', 'Secuencia TICKETBAI']) {
      assert.doesNotMatch(sqlCheck, new RegExp(esc(`'${other}'`)));
      assert.doesNotMatch(sqlApply, new RegExp(esc(`'${other}'`)));
    }
  });

  it('never touches a DocumentNo_* fallback counter', () => {
    // They are duplicated per tenant (R31's header), so editing one copy makes the pair
    // diverge and a prefix apply intermittently.
    assert.doesNotMatch(sqlCheck, /DocumentNo_/);
    assert.doesNotMatch(sqlApply, /DocumentNo_/);
  });

  it('carries no purchase-invoice series — FC is out of scope on both fronts', () => {
    assert.doesNotMatch(sqlApply, /'FC'/);
    assert.doesNotMatch(sqlApply, new RegExp(esc("'AP Invoice'")));
    assert.match(rawText, /Factura de compra/, 'the header must say why FC is absent');
    assert.match(rawText, /IsDocNoControlled='N'/);
  });
});

describe('R38 data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes the @check to the client', () => {
    assert.match(normCheck, /ad_client_id = :client_id/);
  });

  it('scopes every @apply statement to the client', () => {
    const statements = (sqlApply.match(/ad_client_id = :client_id/g) || []).length;
    assert.equal(statements, 3, 'all three UPDATEs must be client-scoped');
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
      () => inlineParams(fix.apply, { client_id: "1; DROP TABLE ad_client" }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R38 data-fix — three guarded updates', () => {
  it('the @apply is exactly three UPDATE statements: startno, currentnext, prefix', () => {
    assert.equal((sqlApply.match(/\bUPDATE ad_sequence\b/gi) || []).length, 3);
    assert.match(normApply, /SET startno = t\.startno::numeric/);
    assert.match(normApply, /SET currentnext = t\.startno::numeric/);
    assert.match(normApply, /SET prefix = t\.prefix/);
  });

  it('stamps updated/updatedby on every statement', () => {
    assert.equal((sqlApply.match(/updated = now\(\)/g) || []).length, 3);
    assert.equal((sqlApply.match(/updatedby = '0'/g) || []).length, 3);
  });

  it('matches by AD_Sequence.NAME, never by id (ids differ per tenant)', () => {
    assert.equal((sqlApply.match(/s\.name = t\.name/g) || []).length, 3);
    assert.doesNotMatch(sqlApply, /ad_sequence_id\s*=/i);
  });
});

describe('R38 data-fix — two-layer idempotency (mandatory framework rule)', () => {
  it('the @check gate covers all three columns the @apply writes', () => {
    assert.match(normCheck, /s\.prefix IS DISTINCT FROM t\.prefix/);
    assert.match(normCheck, /s\.startno IS DISTINCT FROM t\.startno::numeric/);
    assert.match(normCheck, /s\.currentnext IS DISTINCT FROM t\.startno::numeric/);
  });

  it('each @apply statement is self-guarded by IS DISTINCT FROM against its own target', () => {
    assert.match(normApply, /s\.startno IS DISTINCT FROM t\.startno::numeric/);
    assert.match(normApply, /s\.currentnext IS DISTINCT FROM t\.startno::numeric/);
    // NULL-safe matters here: PREFIX is genuinely NULL on three of the five.
    assert.match(normApply, /s\.prefix IS DISTINCT FROM t\.prefix/);
    assert.doesNotMatch(sqlApply, /s\.prefix <> t\.prefix/);
  });

  it('the @report re-asserts the same gate, so a clean run reports nothing', () => {
    assert.match(normReport, /s\.prefix IS DISTINCT FROM t\.prefix/);
    assert.match(normReport, /s\.startno IS DISTINCT FROM t\.startno::numeric/);
    assert.match(normReport, /s\.currentnext IS DISTINCT FROM t\.startno::numeric/);
  });
});

describe('R38 data-fix — fiscal-safety documentation is load-bearing, not decorative', () => {
  it('lowers CURRENTNEXT without a forward-only guard, as R31 decided', () => {
    // Executable SQL only: statement 2's own comment quotes the guard verbatim while
    // stating it is deliberately absent, so the raw text would match either way.
    assert.doesNotMatch(sqlApply, /currentnext < t\.startno/);
    assert.match(normApply, /currentnext < t\.startno/, 'the comment must still explain the omission');
  });

  it('records the premise that makes that safe and how to undo it', () => {
    // If this ever ships to a tenant with issued documents, both guards must come back.
    // Losing these instructions is how a fiscal defect gets shipped, so pin them.
    assert.match(rawText, /no production tenants/i);
    assert.match(rawText, /AND s\.currentnext < t\.startno::numeric/);
    assert.match(rawText, /AND s\.currentnext = s\.startno/);
  });

  it('explains why it does not fight R31 and forbids editing R31 instead', () => {
    assert.match(rawText, /R31-document-sequence-startno/);
    assert.match(rawText, /Do NOT "fix" the discrepancy by editing R31's VALUES/);
  });

  it('writes only prefixes the window itself would accept on a later save', () => {
    // DocumentSequenceHandler rejects lowercase/accents, [IOYWÑ], anything outside
    // A-Z0-9- and more than 20 chars. A value this fix writes must survive a re-save
    // from the window, or the user is stuck with an unsaveable form.
    for (const [, prefix] of SERIES) {
      assert.ok(prefix.length <= 20, `${prefix} exceeds the 20-char limit`);
      assert.doesNotMatch(prefix, /[a-záéíóúüñ]/, `${prefix} has a lowercase/accented letter`);
      assert.doesNotMatch(prefix, /[IOYWÑ]/, `${prefix} uses a reserved letter`);
      assert.doesNotMatch(prefix, /[^A-Z0-9-]/, `${prefix} has an invalid character`);
    }
  });
});
