import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFix, parseFixTimestamp, inlineParams } from '../src/data-fixes/parse-fix.js';

/**
 * Static + parse validation for the R24 corrective data-fix
 * (20260821T120000Z__R24-transfer-automatic-withdrawn.sql, ETP-4891).
 *
 * Row-level behavior can only be verified against a live tenant (already done — see the SQL file's
 * own background section and the map's G3 row: GOClient in a rolled-back tx, @check 15 rows →
 * @apply 1 template + 14 links → @check 0). What IS verifiable without a DB is the SQL the fix
 * ships: header metadata, tenant isolation, the idempotency guards, the transfer predicate that has
 * to stay in lockstep with R14/R15 and FinancialAccountSupport.isBankTransferMethod, and that
 * Payment IN is deliberately left alone. Mirrors the data-fixes-r14-multicurrency.test.js precedent.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_FILE = '20260821T120000Z__R24-transfer-automatic-withdrawn.sql';
const FIX_PATH = join(__dirname, '..', 'src', 'data-fixes', 'sql', FIX_FILE);
const FIX_ID = basename(FIX_FILE, '.sql');

const rawText = readFileSync(FIX_PATH, 'utf8');
const fix = parseFix(rawText, FIX_ID);

/** Collapse all runs of whitespace to a single space so substring checks ignore formatting. */
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const normCheck = norm(fix.check);
const normApply = norm(fix.apply);

describe('R24 data-fix — header metadata', () => {
  it('parses with the expected id and gap', () => {
    assert.equal(fix.id, 'R24-transfer-automatic-withdrawn');
    // Continues the `G` series (payment-method config defaults) after R14=G1 and R15=G2.
    assert.equal(fix.gap, 'G3');
  });

  it('is a low-risk sql fix', () => {
    assert.equal(fix.type, 'sql');
    assert.equal(fix.risk, 'low');
  });

  it('has a description naming the flag it clears', () => {
    assert.ok(fix.description, 'description header must be present');
    assert.match(fix.description, /automatic_withdrawn/i);
  });

  it('explains WHY in the file background (PIS creates the transaction, not processing)', () => {
    assert.match(rawText, /PIS/);
    assert.match(rawText, /FIN_Finacc_Transaction/);
  });

  it('has non-empty @check and @apply sections and no @report', () => {
    assert.ok(fix.check.length > 0);
    assert.ok(fix.apply.length > 0);
    assert.ok(!fix.report, 'R24 repairs every matching row, so it has nothing to report');
  });

  it('sorts after the previous fix, so lexical order == chronological order', () => {
    const ts = parseFixTimestamp(FIX_ID);
    assert.ok(ts instanceof Date);
    assert.equal(ts.toISOString(), '2026-08-21T12:00:00.000Z');
    assert.ok(ts.getTime() > parseFixTimestamp('20260813T120000Z__prev').getTime());
  });
});

describe('R24 data-fix — tenant isolation', () => {
  it('scopes the @check to :client_id on both tables', () => {
    const occurrences = (fix.check.match(/ad_client_id = :client_id/g) || []).length;
    assert.equal(occurrences, 2, 'both @check branches must be tenant-scoped');
  });

  it('scopes every @apply UPDATE to :client_id', () => {
    const occurrences = (fix.apply.match(/ad_client_id = :client_id/g) || []).length;
    assert.ok(occurrences >= 2, `expected >=2 :client_id scopes, found ${occurrences}`);
  });

  it('inlines :client_id into a safe quoted literal and leaves no bind token', () => {
    const clientId = 'A'.repeat(32);
    const inlined = inlineParams(fix.apply, { client_id: clientId });
    assert.ok(inlined.includes(`'${clientId}'`));
    assert.doesNotMatch(inlined, /:client_id\b/);
  });

  it('refuses to inline an injection-y client id (safety net for the runner)', () => {
    assert.throws(
      () => inlineParams(fix.apply, { client_id: '1; DROP TABLE fin_paymentmethod' }),
      /refusing to inline unsafe client_id/,
    );
  });
});

describe('R24 data-fix — the transfer predicate stays in lockstep with R14/R15', () => {
  // Flag first, then the three name variants observed live. Same predicate as
  // FinancialAccountSupport.isBankTransferMethod — if one of the four changes, they all must.
  const PREDICATE = /em_psd2_is_bank_transfer = 'Y' OR pm\.name IN \('Transferencia bancaria', 'Transferencia', 'Wire Transfer'\)/;

  it('uses the flag-first predicate in the @check', () => {
    assert.match(normCheck, PREDICATE);
  });

  it('uses the same predicate in every @apply statement', () => {
    const occurrences = (normApply.match(new RegExp(PREDICATE.source, 'g')) || []).length;
    assert.equal(occurrences, 2, 'both UPDATEs must identify the transfer method identically');
  });
});

describe('R24 data-fix — @check idempotency probe', () => {
  it('unions the two needed-work branches (template still Y, link still Y)', () => {
    const unions = (fix.check.match(/UNION ALL/gi) || []).length;
    assert.equal(unions, 1, 'two SELECT branches joined by one UNION ALL');
  });

  it('detects a method template still auto-withdrawing', () => {
    assert.match(normCheck, /FROM fin_paymentmethod pm .*pm\.automatic_withdrawn = 'Y'/);
  });

  it('detects a per-account link still auto-withdrawing', () => {
    assert.match(normCheck, /FROM fin_finacc_paymentmethod l .*l\.automatic_withdrawn = 'Y'/);
  });

  it('limits the probe to a single row (0 rows => SKIPPED_NOT_NEEDED)', () => {
    assert.match(normCheck, /LIMIT 1/);
  });
});

describe('R24 data-fix — @apply effects', () => {
  it('runs exactly two UPDATE statements', () => {
    const updates = (fix.apply.match(/\bUPDATE\s+fin_/gi) || []).length;
    assert.equal(updates, 2);
  });

  it('clears the flag on the method template', () => {
    assert.match(normApply, /UPDATE fin_paymentmethod pm SET automatic_withdrawn = 'N'/);
  });

  it('clears the flag on the per-account links, joined to the method via EXISTS', () => {
    assert.match(normApply, /UPDATE fin_finacc_paymentmethod l SET automatic_withdrawn = 'N'/);
    assert.match(normApply, /AND EXISTS \( SELECT 1 FROM fin_paymentmethod pm WHERE pm\.fin_paymentmethod_id = l\.fin_paymentmethod_id/);
  });

  it('corrects the template BEFORE the links, so a link created in between inherits N', () => {
    assert.ok(
      normApply.indexOf("UPDATE fin_paymentmethod") < normApply.indexOf("UPDATE fin_finacc_paymentmethod"),
      'the template UPDATE must come first',
    );
  });

  it('guards both UPDATEs on the current value, so a re-run and an already-N link are no-ops', () => {
    const guards = (fix.apply.match(/automatic_withdrawn = 'Y'/g) || []).length;
    assert.equal(guards, 2, 'each UPDATE must be guarded on the row still being Y');
  });

  it('leaves Payment IN alone — automatic_deposit is never written', () => {
    // PIS only initiates outbound transfers, so incoming money keeps whatever the tenant configured.
    assert.doesNotMatch(fix.apply, /automatic_deposit/);
    assert.doesNotMatch(fix.check, /automatic_deposit/);
  });

  it('stamps the audit columns the way the other fixes do', () => {
    assert.match(normApply, /updated = now\(\), updatedby = '0'/);
  });
});
