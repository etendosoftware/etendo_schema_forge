import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R39 corrective data-fix
 * (20260922T130000Z__R39-document-sequence-clear-descriptions.sql, ETP-5364, gap N9).
 *
 * `artifacts/document-sequence/decisions.json` declares `description` as an EDITABLE
 * column of the "Secuencia de documentos" window, so whatever sits in
 * `AD_Sequence.Description` is product copy the tenant reads. Three series carry an
 * internal engineering note there instead — the two rectificativas (written both by
 * `GOClient/AD_SEQUENCE.xml` and by `R17-rectificativa-doctype-sequence`, which is
 * immutable and already applied) and the new purchase-invoice one.
 *
 * The preventive front strips the DESCRIPTION element from the dataset; this fix closes
 * the same gap on already-provisioned tenants. Pure metadata — it touches no prefix, no
 * counter and no document, which is why it is `@risk: low` while its sibling
 * `R39-ap-invoice-fc-series` is medium.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260922T130000Z__R39-document-sequence-clear-descriptions.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

const norm = (s) => s.replace(/\s+/g, ' ').trim();
/** Drop `--` comment lines: the header quotes the exact strings and the names it does NOT touch. */
const sqlOnly = (s) => norm(s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n'));
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);
const normReport = norm(fix.report ?? '');
const sqlCheck = sqlOnly(fix.check);
const sqlApply = sqlOnly(fix.apply);

/** Exactly the three series that carry a ticket-tagged description. */
const DESCRIBED = [
  'Factura Rectificativa (Ventas)',
  'Factura Rectificativa (Compras)',
  'AP Invoice',
];
/** The three that never had one, and must stay untouched. */
const UNDESCRIBED = ['Purchase Order', 'Standard Order', 'AR Invoice'];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('R39 descriptions data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R39-document-sequence-clear-descriptions');
    assert.equal(fix.gap, 'N9');
  });

  it('is a low-risk sql fix — metadata only, it cannot renumber anything', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a first-line description that stands alone in the ledger', () => {
    assert.ok(fix.description);
    assert.match(fix.description, /ETP-5364/);
    assert.match(fix.description, /DESCRIPTION/);
  });

  it('has non-empty @check, @apply and @report sections', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(fix.report && fix.report.length > 0);
  });

  it('sorts after its FC sibling, which inserts the AP Invoice row', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.equal(ts.toISOString(), '2026-09-22T13:00:00.000Z');
    assert.ok(
      ts.getTime() > parseFixTimestamp('20260922T120000Z__R39-ap-invoice-fc-series').getTime(),
      'must sort after R39-ap-invoice-fc-series',
    );
  });
});

describe('R39 descriptions data-fix — scope is exactly the three described series', () => {
  for (const name of DESCRIBED) {
    it(`covers ${name}`, () => {
      assert.match(sqlCheck, new RegExp(esc(`'${name}'`)));
      assert.match(sqlApply, new RegExp(esc(`'${name}'`)));
    });
  }

  it('never touches a series that never had a description', () => {
    for (const other of UNDESCRIBED) {
      assert.doesNotMatch(sqlCheck, new RegExp(esc(`'${other}'`)));
      assert.doesNotMatch(sqlApply, new RegExp(esc(`'${other}'`)));
    }
  });

  it('never touches a DocumentNo_* fallback counter', () => {
    assert.doesNotMatch(sqlCheck, /DocumentNo_/);
    assert.doesNotMatch(sqlApply, /DocumentNo_/);
  });

  it('writes nothing but description — no prefix, no counter, no doctype', () => {
    assert.doesNotMatch(sqlApply, /\bprefix\b/i);
    assert.doesNotMatch(sqlApply, /\bcurrentnext\b/i);
    assert.doesNotMatch(sqlApply, /\bstartno\b/i);
    assert.doesNotMatch(sqlApply, /c_doctype/i);
  });
});

describe('R39 descriptions data-fix — a tenant-authored description survives', () => {
  it('matches only ticket-tagged text, in both the check and the apply', () => {
    assert.match(sqlCheck, new RegExp(esc("description LIKE 'ETP-%'")));
    assert.match(sqlApply, new RegExp(esc("description LIKE 'ETP-%'")));
  });

  it('never clears a description unconditionally', () => {
    const unguarded = /SET description = NULL[\s\S]*?;/i.exec(sqlApply);
    assert.ok(unguarded, 'the apply must set description to NULL');
    assert.match(unguarded[0], /LIKE 'ETP-%'/, 'the NULL write must carry the ETP- guard');
  });

  it('records why the guard is a LIKE and not the exact strings', () => {
    assert.match(rawText, /editable/i);
    assert.match(rawText, /tenant-authored description does not start with a ticket key/);
  });

  it('clears to NULL, not empty string, so a fixed tenant matches a newborn one', () => {
    assert.match(normApply, /SET description = NULL/);
    assert.doesNotMatch(sqlApply, /description = ''/);
  });
});

describe('R39 descriptions data-fix — tenant isolation (every statement scoped to :client_id)', () => {
  it('scopes the @check to the client', () => {
    assert.match(normCheck, /ad_client_id = :client_id/);
  });

  it('scopes every @apply statement to the client', () => {
    const statements = sqlApply.split(';').filter((s) => s.trim().length > 0);
    assert.equal(statements.length, 1, 'a single guarded UPDATE');
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

describe('R39 descriptions data-fix — two-layer idempotency (mandatory framework rule)', () => {
  it('the @check gate is the same predicate the @apply writes through', () => {
    assert.match(sqlCheck, new RegExp(esc("s.description LIKE 'ETP-%'")));
    assert.match(sqlApply, new RegExp(esc("s.description LIKE 'ETP-%'")));
  });

  it('stamps updated/updatedby', () => {
    assert.match(sqlApply, /updated = now\(\)/);
    assert.match(sqlApply, /updatedby = '0'/);
  });

  it('the @report re-asserts the same gate, so a clean run reports nothing', () => {
    assert.match(normReport, new RegExp(esc("s.description LIKE 'ETP-%'")));
  });

  it('records that R17 is the other source of the text and cannot be edited', () => {
    assert.match(rawText, /R17-rectificativa-doctype-sequence/);
    assert.match(rawText, /immutable/);
  });
});
